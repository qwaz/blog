#!/usr/bin/env bun
/**
 * Generates a new reading list at `src/readings/{year}/{date}.svx` from the Notion
 * "Articles" database.
 *
 * Only `title` and `link` are filled in — `intro` and every `comment` are left blank
 * for the author to write.
 *
 * Usage: bun run readings:new [--since=YYYY-MM-DD] [--until=YYYY-MM-DD]
 *                             [--date=YYYY-MM-DD] [--dry-run] [--force]
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { parse, stringify } from 'yaml';
import { z } from 'zod';

const READINGS_DIR = path.join(import.meta.dirname, '..', 'src', 'readings');
const NOTION_API_URL = 'https://api.notion.com/v1';
const NOTION_VERSION = '2026-03-11';
const NOTION_PAGE_SIZE = 100;
const TITLE_PROPERTY = 'Name';
const LINK_PROPERTY = 'Link';

const Reading = z
	.object({
		title: z.string(),
		link: z.string(),
		comment: z.string()
	})
	.strict();

type Reading = z.infer<typeof Reading>;

const Env = z.object({
	NOTION_TOKEN: z.string().min(1),
	NOTION_DATABASE_ID: z.string().min(1)
});

type Env = z.infer<typeof Env>;

const Args = z.object({
	since: z.iso.date().optional(),
	until: z.iso.date().optional(),
	date: z.iso.date().optional(),
	'dry-run': z.boolean(),
	force: z.boolean(),
	help: z.boolean()
});

/** Frontmatter of an already published reading list; only `date` is needed. */
const ExistingFrontMatter = z.looseObject({
	date: z.iso.date()
});

const NotionRichText = z.looseObject({ plain_text: z.string() });

const NotionTitleProperty = z.looseObject({
	type: z.literal('title'),
	title: z.array(NotionRichText)
});

const NotionUrlProperty = z.looseObject({
	type: z.literal('url'),
	url: z.string().nullable()
});

const NotionPage = z.looseObject({
	id: z.string(),
	url: z.string(),
	created_time: z.iso.datetime(),
	properties: z.record(z.string(), z.looseObject({ type: z.string() }))
});

type NotionPage = z.infer<typeof NotionPage>;

const NotionQueryResponse = z.looseObject({
	results: z.array(NotionPage),
	next_cursor: z.string().nullable(),
	has_more: z.boolean()
});

/**
 * Notion 2025-09-03 and later moved row queries from databases to data sources, so a
 * database ID must first be resolved to the data source(s) it contains.
 */
const NotionDatabase = z.looseObject({
	data_sources: z.array(z.looseObject({ id: z.string(), name: z.string() }))
});

const NotionError = z.looseObject({ code: z.string(), message: z.string() });

function fail(message: string): never {
	throw new Error(message);
}

function readArgs() {
	const { values } = parseArgs({
		options: {
			since: { type: 'string' },
			until: { type: 'string' },
			date: { type: 'string' },
			'dry-run': { type: 'boolean', default: false },
			force: { type: 'boolean', default: false },
			help: { type: 'boolean', default: false }
		}
	});

	const parsed = Args.safeParse(values);
	if (!parsed.success) {
		fail(`Invalid arguments (dates must be YYYY-MM-DD):\n${z.prettifyError(parsed.error)}`);
	}
	return parsed.data;
}

function readEnv() {
	const defined = Object.entries(process.env).filter(
		([, value]) => value !== undefined && value !== ''
	);
	const parsed = Env.safeParse(Object.fromEntries(defined));
	if (!parsed.success) {
		fail(
			`Missing or invalid environment variables. Copy .env.example to .env and fill it in.\n${z.prettifyError(parsed.error)}`
		);
	}
	return parsed.data;
}

/** `YYYY-MM-DD` in the local timezone. */
function toLocalDate(value: Date) {
	const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
	return local.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
	const value = new Date(`${date}T00:00:00.000`);
	value.setDate(value.getDate() + days);
	return toLocalDate(value);
}

/** Local midnight / end of day, expressed as UTC ISO 8601 for the Notion API. */
function startOfDay(date: string) {
	return new Date(`${date}T00:00:00.000`).toISOString();
}

function endOfDay(date: string) {
	return new Date(`${date}T23:59:59.999`).toISOString();
}

function extractFrontMatter(source: string) {
	return /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1];
}

async function fileExists(filePath: string) {
	return await stat(filePath).then(
		() => true,
		() => false
	);
}

/**
 * Finds the date of the most recent published reading list.
 *
 * Files are named `{YYYY-MM-DD}.svx`, which sorts lexicographically, so the newest
 * file is picked by name and only that one file is read.
 */
async function readLatestReadingDate(excludePath: string) {
	let latestPath: string | undefined;
	let latestName: string | undefined;

	const years = await readdir(READINGS_DIR, { withFileTypes: true });
	for (const year of years) {
		if (!year.isDirectory()) {
			continue;
		}

		const yearDir = path.join(READINGS_DIR, year.name);
		for (const fileName of await readdir(yearDir)) {
			if (!fileName.endsWith('.svx')) {
				continue;
			}

			const filePath = path.join(yearDir, fileName);
			if (filePath === excludePath) {
				continue;
			}

			if (latestName === undefined || fileName > latestName) {
				latestName = fileName;
				latestPath = filePath;
			}
		}
	}

	if (latestPath === undefined) {
		return undefined;
	}

	const frontMatter = extractFrontMatter(await readFile(latestPath, 'utf8'));
	if (frontMatter === undefined) {
		fail(`${latestPath} has no frontmatter`);
	}

	const parsed = ExistingFrontMatter.safeParse(parse(frontMatter));
	if (!parsed.success) {
		fail(`Could not parse frontmatter of ${latestPath}\n${z.prettifyError(parsed.error)}`);
	}

	return parsed.data.date;
}

/** Accepts a bare ID, a dashed UUID, or a Notion URL. */
function parseDatabaseId(value: string) {
	const withoutQuery = value.split('?')[0] ?? value;

	const dashed = withoutQuery.match(
		/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g
	);
	const compact = withoutQuery.match(/(?<![0-9a-fA-F])[0-9a-fA-F]{32}(?![0-9a-fA-F])/g);

	const id = (dashed?.at(-1) ?? compact?.at(-1))?.replaceAll('-', '').toLowerCase();
	if (id === undefined) {
		fail(`Could not find a Notion database ID in "${value}"`);
	}

	return [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join(
		'-'
	);
}

async function notionRequest(env: Env, endpoint: string, body?: unknown) {
	const response = await fetch(`${NOTION_API_URL}${endpoint}`, {
		method: body === undefined ? 'GET' : 'POST',
		headers: {
			Authorization: `Bearer ${env.NOTION_TOKEN}`,
			'Notion-Version': NOTION_VERSION,
			'Content-Type': 'application/json'
		},
		body: body === undefined ? undefined : JSON.stringify(body)
	});

	const payload: unknown = await response.json();
	if (!response.ok) {
		const error = NotionError.safeParse(payload);
		const detail = error.success
			? `${error.data.code}: ${error.data.message}`
			: JSON.stringify(payload);
		fail(`Notion API request failed (${response.status}) on ${endpoint} — ${detail}`);
	}

	return payload;
}

/** Resolves a database ID to the data source that actually holds its rows. */
async function resolveDataSourceId(env: Env) {
	const databaseId = parseDatabaseId(env.NOTION_DATABASE_ID);
	const payload = await notionRequest(env, `/databases/${databaseId}`);

	const parsed = NotionDatabase.safeParse(payload);
	if (!parsed.success) {
		fail(`Unexpected Notion database response\n${z.prettifyError(parsed.error)}`);
	}

	const [dataSource, ...rest] = parsed.data.data_sources;
	if (dataSource === undefined) {
		fail(`Notion database ${databaseId} has no data sources.`);
	}
	if (rest.length > 0) {
		console.warn(`Database has multiple data sources; using "${dataSource.name}".`);
	}

	return dataSource.id;
}

async function queryNotion(env: Env, since: string, until: string) {
	const dataSourceId = await resolveDataSourceId(env);
	const pages: NotionPage[] = [];
	let cursor: string | undefined;

	for (;;) {
		const payload = await notionRequest(env, `/data_sources/${dataSourceId}/query`, {
			filter: {
				and: [
					{ timestamp: 'created_time', created_time: { on_or_after: startOfDay(since) } },
					{ timestamp: 'created_time', created_time: { on_or_before: endOfDay(until) } }
				]
			},
			sorts: [{ timestamp: 'created_time', direction: 'ascending' }],
			page_size: NOTION_PAGE_SIZE,
			start_cursor: cursor
		});

		const parsed = NotionQueryResponse.safeParse(payload);
		if (!parsed.success) {
			fail(`Unexpected Notion API response\n${z.prettifyError(parsed.error)}`);
		}

		pages.push(...parsed.data.results);
		if (!parsed.data.has_more || parsed.data.next_cursor === null) {
			return pages;
		}
		cursor = parsed.data.next_cursor;
	}
}

function plainText(parts: { plain_text: string }[]) {
	return parts
		.map((part) => part.plain_text)
		.join('')
		.trim();
}

function property(page: NotionPage, name: string) {
	const value = page.properties[name];
	if (value === undefined) {
		fail(
			`Notion page ${page.url} has no property named "${name}". Available: ${Object.keys(page.properties).join(', ')}`
		);
	}
	return value;
}

function extractTitle(page: NotionPage) {
	const parsed = NotionTitleProperty.safeParse(property(page, TITLE_PROPERTY));
	if (!parsed.success) {
		fail(`Notion property "${TITLE_PROPERTY}" is not a title property on page ${page.url}`);
	}

	const text = plainText(parsed.data.title);
	return text === '' ? undefined : text;
}

function extractLink(page: NotionPage) {
	const parsed = NotionUrlProperty.safeParse(property(page, LINK_PROPERTY));
	if (!parsed.success) {
		fail(`Notion property "${LINK_PROPERTY}" is not a URL property on page ${page.url}`);
	}

	const text = parsed.data.url?.trim() ?? '';
	return text === '' ? undefined : text;
}

function collectReadings(pages: NotionPage[]) {
	const readings: Reading[] = [];
	const skipped: string[] = [];

	for (const page of pages) {
		const title = extractTitle(page);
		const link = extractLink(page);

		if (title === undefined) {
			skipped.push(`${page.url} — empty "${TITLE_PROPERTY}"`);
			continue;
		}
		if (link === undefined) {
			skipped.push(`${title} — empty "${LINK_PROPERTY}"`);
			continue;
		}

		readings.push({ title, link, comment: '' });
	}

	return { readings, skipped };
}

function buildFile(date: string, readings: Reading[]) {
	const validated = z.array(Reading).safeParse(readings);
	if (!validated.success) {
		fail(`Generated readings are invalid\n${z.prettifyError(validated.error)}`);
	}

	const body = stringify({ readings: validated.data }, { lineWidth: 0, singleQuote: true });
	return `---\ndate: '${date}'\nintro: >-\n  \n\n${body}---\n`;
}

function printUsage() {
	console.log(
		[
			'Generate a new reading list from the Notion "Articles" database.',
			'',
			'Usage: bun run readings:new [options]',
			'',
			'Options:',
			'  --since=YYYY-MM-DD  Include articles created on or after this date.',
			'                      Defaults to the day after the latest published reading list.',
			'  --until=YYYY-MM-DD  Include articles created on or before this date. Defaults to today.',
			'  --date=YYYY-MM-DD   Date of the generated reading list. Defaults to today.',
			'  --dry-run           Print the generated file instead of writing it.',
			'  --force             Overwrite the target file if it already exists.',
			'  --help              Show this message.'
		].join('\n')
	);
}

async function main() {
	const args = readArgs();
	if (args.help) {
		printUsage();
		return;
	}

	const env = readEnv();

	const today = toLocalDate(new Date());
	const date = args.date ?? today;
	const outputPath = path.join(READINGS_DIR, date.slice(0, 4), `${date}.svx`);
	const relativePath = path.relative(process.cwd(), outputPath);

	if (!args.force && !args['dry-run'] && (await fileExists(outputPath))) {
		fail(`${relativePath} already exists — pass --force to overwrite.`);
	}

	const latestDate = await readLatestReadingDate(outputPath);
	const until = args.until ?? today;
	const since =
		args.since ??
		(latestDate === undefined
			? fail('No existing reading list found — pass --since=YYYY-MM-DD explicitly.')
			: addDays(latestDate, 1));

	if (since > until) {
		fail(`--since (${since}) must not be after --until (${until})`);
	}

	console.log(`Fetching articles created between ${since} and ${until}...`);
	const pages = await queryNotion(env, since, until);
	const { readings, skipped } = collectReadings(pages);

	for (const entry of skipped) {
		console.warn(`  skipped: ${entry}`);
	}

	if (readings.length === 0) {
		console.log(`No new articles found in ${pages.length} Notion page(s). Nothing written.`);
		return;
	}

	const file = buildFile(date, readings);
	if (args['dry-run']) {
		console.log(`\n--- ${relativePath} ---\n`);
		console.log(file);
		return;
	}

	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, file, 'utf8');
	console.log(
		`Wrote ${readings.length} reading(s) to ${relativePath}. Now fill in intro/comments.`
	);
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
}

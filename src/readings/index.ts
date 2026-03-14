import { z } from 'zod';

const ReadingItem = z
	.object({
		title: z.string(),
		link: z.string(),
		comment: z.string()
	})
	.strict();
export type ReadingItem = z.infer<typeof ReadingItem>;

const ReadingFrontMatter = z
	.object({
		date: z.iso.date(),
		intro: z.string(),
		readings: z.array(ReadingItem)
	})
	.strict();

const ReadingPost = ReadingFrontMatter.extend({
	// Derived properties (filename without .svx)
	slug: z.string(),
	subdir: z.string()
});
export type ReadingPost = z.infer<typeof ReadingPost>;

interface FileWithMetadata {
	metadata: object;
}

export async function getReadings() {
	let readings: ReadingPost[] = [];

	const fileDict = import.meta.glob<FileWithMetadata>('/src/readings/**/*.svx', { eager: true });

	for (const path in fileDict) {
		const file = fileDict[path];

		const subdir = path.split('/').at(-2);
		const fileName = path.split('/').at(-1);
		if (subdir === undefined) {
			throw new Error('subdir is undefined');
		}
		if (fileName === undefined) {
			throw new Error('fileName is undefined');
		}

		if (!fileName.endsWith('.svx')) {
			throw new Error('extension is not svx');
		}
		const slug = fileName.slice(0, -4);

		const parsedFrontMatter = ReadingFrontMatter.safeParse(file.metadata);
		if (!parsedFrontMatter.success) {
			const errorText = parsedFrontMatter.error.issues
				.map((error) => JSON.stringify(error, null, 2))
				.join('\n');
			throw new Error(
				`Error while parsing ${path}\nData:\n${JSON.stringify(file.metadata, null, 2)}\nErrors:\n${errorText}`
			);
		}

		const payload = { ...parsedFrontMatter.data, slug, subdir };
		const parsedReading = ReadingPost.safeParse(payload);
		if (!parsedReading.success) {
			const errorText = parsedReading.error.issues
				.map((error) => JSON.stringify(error, null, 2))
				.join('\n');
			throw new Error(
				`Error while parsing ${path}\nData:\n${JSON.stringify(payload, null, 2)}\nErrors:\n${errorText}`
			);
		}
		readings.push(parsedReading.data);
	}

	readings = readings.sort(
		(first, second) => new Date(second.date).getTime() - new Date(first.date).getTime()
	);

	return readings;
}

# Copilot Instructions

## Build & Dev Commands

- `npm run dev` — Start dev server
- `npm run build` — Production build (Cloudflare Pages via `adapter-cloudflare`)
- `npm run check` — TypeScript + Svelte type checking
- `npm run lint` — Prettier + ESLint
- `npm run format` — Auto-format with Prettier

No test framework is configured.

## Architecture

This is a SvelteKit 2 + Svelte 5 blog deployed to Cloudflare Pages. Content is authored as `.svx` files (MDsveX — Markdown with Svelte components) with YAML frontmatter validated by Zod schemas.

### Content Types

There are two content types, each following the same pattern:

1. **Posts** (`src/posts/{year}/{slug}.svx`) — Blog articles with `title`, `date`, `language` (`ko`|`en`), and `categories` frontmatter.
2. **Readings** (`src/readings/{year}/{slug}.svx`) — Curated reading lists with `date`, `intro`, and a `readings` array of `{ title, link, comment }`.

Content loaders live at `src/posts/index.ts` and `src/readings/index.ts`. They use `import.meta.glob()` to discover `.svx` files, validate frontmatter with Zod, and return items sorted newest-first. The Zod schemas in these files are the source of truth for frontmatter fields.

### Data Flow

```
.svx files → getPosts()/getReadings() (Zod-validated)
  → +layout.server.ts (loads all metadata for list pages)
  → [slug]/+page.ts (finds item by slug, dynamically imports .svx component)
  → +page.svelte (renders content)
```

### Path Aliases

- `$lib` → `src/lib`
- `$posts` → `src/posts`
- `$readings` → `src/readings`

### WordPress Archive

`src/routes/wp-archive/` handles redirects from old WordPress URLs. The slug mapping in `articles.ts` maps old slugs to new ones (`string`), marks them as existing (`true`), or returns 404 (`false`).

## Key Conventions

- **Type safety** — All data structures (frontmatter, metadata, categories, config, etc.) must be defined as Zod schemas and validated at load time. Never pass unvalidated data to components or routes. Derive TypeScript types from Zod schemas with `z.infer<>` rather than maintaining separate type definitions. Avoid `as` type assertions; prefer type-safe constructions (mapping, spreading, `satisfies`, generics) so the compiler can verify correctness.
- **Svelte 5 runes** — Use `$state`, `$derived`, `$effect`, etc. Not legacy reactive syntax.
- **Formatting** — Tabs, single quotes, no trailing commas, 100 char print width (configured in `.prettierrc`).
- **Styling** — Tailwind CSS v4 via PostCSS. Global content styles (headings, lists, code blocks, blockquotes) are defined in `src/app.css` scoped under `#content`.
- **Code highlighting** — Shiki with `dracula-soft` theme. Supported languages: JS, TS, Python, C, C++, Rust, Haskell. Add new languages in `svelte.config.js`.
- **Math** — KaTeX via `remark-math` + `rehype-katex-svelte`. Use standard LaTeX delimiters in `.svx` files.
- **Prerendering** — All content pages are statically pre-rendered.
- **Node version** — Pinned to 22.13.1 (`.node-version`), engine-strict enabled (`.npmrc`).
- **Package manager** — Use `bun` for installing packages and running scripts.

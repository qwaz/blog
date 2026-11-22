# Qwaz's Website

Git repository for https://qwaz.io

## Developing

Install dependencies with `bun install`, then start a development server:

```bash
bun run dev

# or start the server and open the app in a new browser tab
bun run dev --open
```

## Building

To create a production version of the site:

```bash
bun run build
```

You can preview the production build with `bun run preview`. The site is deployed to Cloudflare Pages via `@sveltejs/adapter-cloudflare`.

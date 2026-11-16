import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { mdsvex, escapeSvelte, type MdsvexOptions } from 'mdsvex';
import rehypeKatexSvelte from 'rehype-katex-svelte';
import remarkMath from 'remark-math';
import { createHighlighter } from 'shiki';
import { defineConfig } from 'vite';

// https://shiki.style/themes
const shikiTheme = 'dracula-soft';
const languages = ['javascript', 'typescript', 'python', 'c', 'cpp', 'rust', 'haskell'];
const highlighter = await createHighlighter({
	themes: [shikiTheme],
	langs: languages
});

const mdsvexOptions = {
	extensions: ['.svx'],
	highlight: {
		highlighter: async (code, lang) => {
			const html = escapeSvelte(
				highlighter.codeToHtml(code, { lang: lang ?? 'text', theme: shikiTheme })
			);
			return `{@html \`${html}\` }`;
		}
	},
	remarkPlugins: [remarkMath],
	rehypePlugins: [rehypeKatexSvelte]
} satisfies MdsvexOptions;

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			extensions: ['.svelte', '.svx'],

			// Consult https://svelte.dev/docs/kit/integrations
			// for more information about preprocessors
			preprocess: [vitePreprocess(), mdsvex(mdsvexOptions)],

			adapter: adapter({
				// Compare these patterns with `.svelte-kit/cloudflare/_routes.json`
				// after turning off this option
				routes: {
					include: ['/*'],
					exclude: [
						'<build>',
						'/favicon.png',
						'/post-images/*',
						'/',
						'/posts',
						'/posts/*',
						'/readings',
						'/readings/*'
					]
				}
			})
		})
	]
});

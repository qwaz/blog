import { error, redirect } from '@sveltejs/kit';
import { articleMapping } from './articles';

export async function load({ params }) {
	if (!Object.hasOwn(articleMapping, params.slug)) {
		error(404, 'Archived article not found');
	}

	const available = articleMapping[params.slug];
	if (available === false) {
		throw error(
			404,
			'This article is archived. If you need access, please create an issue at https://github.com/Qwaz/blog.'
		);
	}

	const slug = typeof available === 'string' ? available : params.slug;
	redirect(308, `/posts/${slug}`);
}

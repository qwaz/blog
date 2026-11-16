<script lang="ts">
	import type { PageProps } from './$types';
	import { reformatDateString } from '#lib/date.ts';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Qwaz's Readings</title>
</svelte:head>

<h1 class="text-2xl font-bold">Readings</h1>

<div class="mt-6 flex flex-col" id="readings">
	{#each data.readings as reading (reading.slug)}
		<div class="flex gap-4">
			<!-- Timeline: continuous line with dot centered on date row -->
			<div class="flex flex-col items-center">
				<div class="h-[0.6rem] bg-gray-300" style="width: 1px;"></div>
				<div class="bg-primary h-2 w-2 shrink-0 rounded-full"></div>
				<div class="flex-1 bg-gray-300" style="width: 1px;"></div>
			</div>

			<!-- Content -->
			<div class="mb-4">
				<a href="#{reading.slug}" class="text-lg font-semibold" id={reading.slug}>
					{reformatDateString(reading.date, 'ko')}
				</a>
				<p class="mt-1">{reading.intro}</p>
				<ul class="readings-list mt-2">
					{#each reading.readings as item (item.link)}
						<li>
							<a
								href={item.link}
								class="text-sm font-semibold"
								target="_blank"
								rel="external noopener noreferrer">{item.title}</a
							>
							<!-- commentHtml is rendered at build time from the author's own frontmatter -->
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							<span class="text-sm">{@html item.commentHtml}</span>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/each}
</div>

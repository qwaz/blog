<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import { reformatDateString } from '$lib/date';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Qwaz's Readings</title>
</svelte:head>

<h1 class="text-2xl font-bold">Readings</h1>

<div class="mt-6 flex flex-col">
	{#each data.readings as reading, i (reading.slug)}
		<div class="flex gap-4">
			<!-- Timeline: continuous line with dot centered on date row -->
			<div class="flex flex-col items-center">
				<div class="bg-gray-300 h-[0.6rem]" style="width: 1px;"></div>
				<div class="bg-primary h-2 w-2 shrink-0 rounded-full"></div>
				<div class="bg-gray-300 flex-1" style="width: 1px;"></div>
			</div>

			<!-- Content -->
			<div class="mb-4">
				<a href="#{reading.slug}" class="text-lg font-semibold hover:text-blue-500" id="{reading.slug}">
					{reformatDateString(reading.date, 'ko')}
				</a>
				<p class="mt-1">{reading.intro}</p>
				<ul class="mt-2">
					{#each reading.readings as item}
						<li>
							<a href={item.link} class="font-semibold text-sm text-blue-500 hover:text-blue-700" target="_blank" rel="noopener noreferrer">{item.title}</a>
							<span class="text-sm">{item.comment}</span>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/each}
</div>

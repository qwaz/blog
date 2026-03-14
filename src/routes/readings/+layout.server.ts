import { getReadings } from '$readings';
import type { LayoutServerLoad } from './$types';

export const prerender = true;

export const load: LayoutServerLoad = async () => {
	return {
		readings: await getReadings()
	};
};

import type { Cable } from "../data/types";

/**
 * Compute the bounding box of a cable's segments using metro coordinates.
 */
export function cableBounds(
	cable: Cable,
	metrosById: Map<string, { lat: number; lng: number }>,
): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
	let minLng = 180;
	let maxLng = -180;
	let minLat = 90;
	let maxLat = -90;
	let found = false;

	for (const seg of cable.segments) {
		const from = metrosById.get(seg.from);
		const to = metrosById.get(seg.to);
		if (from) {
			minLng = Math.min(minLng, from.lng);
			maxLng = Math.max(maxLng, from.lng);
			minLat = Math.min(minLat, from.lat);
			maxLat = Math.max(maxLat, from.lat);
			found = true;
		}
		if (to) {
			minLng = Math.min(minLng, to.lng);
			maxLng = Math.max(maxLng, to.lng);
			minLat = Math.min(minLat, to.lat);
			maxLat = Math.max(maxLat, to.lat);
			found = true;
		}
	}

	if (!found) return null;

	// Don't wrap around the dateline -- if the cable spans >180° of longitude,
	// it's a trans-Pacific cable and we should just show the Pacific view
	if (maxLng - minLng > 180) {
		return { minLng: -180, minLat, maxLng: 180, maxLat };
	}

	return { minLng, minLat, maxLng, maxLat };
}

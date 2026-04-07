/**
 * Compute the bounding box of a cable's segments using metro coordinates.
 * Handles dateline-crossing cables by detecting the shortest longitude span.
 */
export function cableBounds(
	cable: { segments: { from: string; to: string }[] },
	metrosById: Map<string, { lat: number; lng: number }>,
): { minLng: number; minLat: number; maxLng: number; maxLat: number } | null {
	const lngs: number[] = [];
	let minLat = 90;
	let maxLat = -90;

	for (const seg of cable.segments) {
		for (const id of [seg.from, seg.to]) {
			const m = metrosById.get(id);
			if (!m) continue;
			lngs.push(m.lng);
			minLat = Math.min(minLat, m.lat);
			maxLat = Math.max(maxLat, m.lat);
		}
	}

	if (lngs.length === 0) return null;

	// Standard bounds
	const minLng = Math.min(...lngs);
	const maxLng = Math.max(...lngs);
	const standardSpan = maxLng - minLng;

	// Check if wrapping across the dateline gives a shorter span
	// Shift all longitudes to [0, 360) and recompute
	const shifted = lngs.map((lng) => (lng < 0 ? lng + 360 : lng));
	const shiftedMin = Math.min(...shifted);
	const shiftedMax = Math.max(...shifted);
	const shiftedSpan = shiftedMax - shiftedMin;

	if (shiftedSpan < standardSpan && standardSpan > 180) {
		// Dateline-crossing cable -- use shifted bounds, convert back
		// MapLibre handles bounds where minLng > maxLng as dateline-crossing
		return {
			minLng: shiftedMin > 180 ? shiftedMin - 360 : shiftedMin,
			minLat,
			maxLng: shiftedMax > 180 ? shiftedMax - 360 : shiftedMax,
			maxLat,
		};
	}

	return { minLng, minLat, maxLng, maxLat };
}

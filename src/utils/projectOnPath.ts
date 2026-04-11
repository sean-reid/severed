/** Normalize a longitude difference to [-180, 180]. */
function wrapLng(input: number): number {
	let d = input;
	while (d > 180) d -= 360;
	while (d < -180) d += 360;
	return d;
}

/**
 * Project a point onto the nearest segment of a polyline.
 * Handles dateline wrapping for longitude.
 * Returns the projected [lng, lat] position on the path.
 */
export function projectOnPath(
	pathCoords: readonly (readonly number[])[],
	lat: number,
	lng: number,
): [number, number] {
	let bestDist = Number.MAX_VALUE;
	let bestPoint: [number, number] = [lng, lat];

	for (let i = 0; i < pathCoords.length - 1; i++) {
		const ax = pathCoords[i][0];
		const ay = pathCoords[i][1];
		const bx = pathCoords[i + 1][0];
		const by = pathCoords[i + 1][1];

		// Work in a local coordinate system relative to segment start,
		// wrapping longitude so dateline-adjacent segments work correctly
		const dx = wrapLng(bx - ax);
		const dy = by - ay;
		const pxRel = wrapLng(lng - ax);
		const pyRel = lat - ay;
		const len2 = dx * dx + dy * dy;
		let t = len2 > 0 ? (pxRel * dx + pyRel * dy) / len2 : 0;
		t = Math.max(0, Math.min(1, t));

		// Project back to absolute coordinates
		let projLng = ax + t * dx;
		const projLat = ay + t * dy;
		// Normalize projected longitude
		if (projLng > 180) projLng -= 360;
		if (projLng < -180) projLng += 360;

		const dLng = wrapLng(projLng - lng);
		const dLat = projLat - lat;
		const d = dLng * dLng + dLat * dLat;
		if (d < bestDist) {
			bestDist = d;
			bestPoint = [projLng, projLat];
		}
	}
	return bestPoint;
}

/**
 * Project a point onto the nearest line of a MultiLineString / LineString cable path.
 * Handles dateline wrapping. Returns [lng, lat] snapped to the cable.
 */
export function snapToCablePath(
	geometry: { type: string; coordinates: number[][] | number[][][] },
	lat: number,
	lng: number,
): [number, number] {
	const lines: (readonly number[])[][] =
		geometry.type === "MultiLineString"
			? (geometry.coordinates as number[][][])
			: [geometry.coordinates as number[][]];

	let bestDist = Number.MAX_VALUE;
	let bestPoint: [number, number] = [lng, lat];

	for (const line of lines) {
		const p = projectOnPath(line, lat, lng);
		const dLng = wrapLng(p[0] - lng);
		const dLat = p[1] - lat;
		const d = dLng * dLng + dLat * dLat;
		if (d < bestDist) {
			bestDist = d;
			bestPoint = p;
		}
	}
	return bestPoint;
}

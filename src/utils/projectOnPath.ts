/**
 * Project a point onto the nearest segment of a polyline.
 * Returns the projected [lng, lat] position on the path.
 * Pure function — never mutates input.
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
		const dx = bx - ax;
		const dy = by - ay;
		const len2 = dx * dx + dy * dy;
		let t = len2 > 0 ? ((lng - ax) * dx + (lat - ay) * dy) / len2 : 0;
		t = Math.max(0, Math.min(1, t));
		const px = ax + t * dx;
		const py = ay + t * dy;
		const d = (px - lng) ** 2 + (py - lat) ** 2;
		if (d < bestDist) {
			bestDist = d;
			bestPoint = [px, py];
		}
	}
	return bestPoint;
}

/**
 * Project a point onto the nearest line of a MultiLineString / LineString cable path.
 * Returns [lng, lat] snapped to the cable.
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
		const d = (p[0] - lng) ** 2 + (p[1] - lat) ** 2;
		if (d < bestDist) {
			bestDist = d;
			bestPoint = p;
		}
	}
	return bestPoint;
}

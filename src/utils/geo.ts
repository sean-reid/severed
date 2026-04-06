const EARTH_RADIUS_KM = 6371;
const SPEED_OF_LIGHT_KM_S = 299792;
const FIBER_REFRACTIVE_INDEX = 1.5; // c in fiber ≈ c / 1.5

/**
 * Great-circle distance between two points in km (Haversine formula).
 */
export function haversineKm(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Speed-of-light latency floor for a given distance in km.
 * Returns one-way latency in ms through fiber.
 */
export function fiberLatencyMs(distanceKm: number): number {
	const speedInFiber = SPEED_OF_LIGHT_KM_S / FIBER_REFRACTIVE_INDEX;
	return (distanceKm / speedInFiber) * 1000;
}

/**
 * Round-trip latency floor in ms.
 */
export function rttMs(distanceKm: number): number {
	return fiberLatencyMs(distanceKm) * 2;
}

/**
 * Check if a point is inside a polygon (ray casting algorithm).
 */
export function pointInPolygon(
	lat: number,
	lng: number,
	polygon: number[][],
): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i];
		const [xj, yj] = polygon[j];
		if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
			inside = !inside;
		}
	}
	return inside;
}

/**
 * Distance from a point to a line segment (on a flat projection, good enough for nearby points).
 * Returns distance in degrees (approximate).
 */
export function pointToSegmentDistance(
	px: number,
	py: number,
	ax: number,
	ay: number,
	bx: number,
	by: number,
): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lenSq = dx * dx + dy * dy;
	if (lenSq === 0) return Math.hypot(px - ax, py - ay);
	const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
	const projX = ax + t * dx;
	const projY = ay + t * dy;
	return Math.hypot(px - projX, py - projY);
}

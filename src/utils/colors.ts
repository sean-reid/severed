import { scaleLog } from "d3-scale";

/**
 * Cable width scale: log of capacity → pixel width.
 */
export const cableWidthScale = scaleLog().domain([0.1, 500]).range([0.8, 3]).clamp(true);

/**
 * Cable color by capacity tier. Muted by default.
 */
export function cableColor(capacityTbps: number): [number, number, number, number] {
	if (capacityTbps >= 200) return [96, 165, 250, 90];
	if (capacityTbps >= 50) return [59, 130, 246, 70];
	if (capacityTbps >= 10) return [45, 107, 207, 55];
	return [45, 107, 207, 40];
}

/** Severed cable — muted red, lower contrast than cut markers. */
export const SEVERED_COLOR: [number, number, number, number] = [200, 80, 60, 130];

/** Cut marker dot — bright red, highest contrast. */
export const CUT_COLOR: [number, number, number, number] = [239, 68, 68, 240];

/** Terrestrial edge — faint cyan. */
export const TERRESTRIAL_COLOR: [number, number, number, number] = [34, 211, 238, 50];

/** Terrestrial edge actively absorbing rerouted traffic. */
export const TERRESTRIAL_ACTIVE_COLOR: [number, number, number, number] = [34, 211, 238, 180];

/** Metro impact colors — distinct from cable colors for clarity. */
export const METRO_DEGRADED: [number, number, number, number] = [245, 158, 11, 200]; // amber, >10%
export const METRO_SEVERE: [number, number, number, number] = [249, 115, 22, 240]; // orange, >50%
export const METRO_ISOLATED: [number, number, number, number] = [236, 72, 153, 255]; // magenta, offline

/**
 * Confidence badge colors.
 */
export const confidenceColors = {
	verified: "#60a5fa",
	estimated: "#f59e0b",
	approximated: "#94a3b8",
} as const;

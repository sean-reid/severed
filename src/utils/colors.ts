import { scaleLog } from "d3-scale";

/**
 * Cable width scale: log of capacity → pixel width.
 * Much thinner — let the map breathe.
 */
export const cableWidthScale = scaleLog().domain([0.1, 500]).range([0.8, 3]).clamp(true);

/**
 * Cable color by capacity tier.
 * Muted by default — only pop on hover/selection/cut.
 */
export function cableColor(capacityTbps: number): [number, number, number, number] {
	if (capacityTbps >= 200) return [96, 165, 250, 90];
	if (capacityTbps >= 50) return [59, 130, 246, 70];
	if (capacityTbps >= 10) return [45, 107, 207, 55];
	return [45, 107, 207, 40];
}

/**
 * Cut cable color.
 */
export const CUT_COLOR: [number, number, number, number] = [239, 68, 68, 220];

/**
 * Terrestrial edge color.
 */
export const TERRESTRIAL_COLOR: [number, number, number, number] = [34, 211, 238, 50];

/**
 * Confidence badge colors.
 */
export const confidenceColors = {
	verified: "#60a5fa",
	estimated: "#f59e0b",
	approximated: "#94a3b8",
} as const;

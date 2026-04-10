import type { Feature, LineString, MultiLineString, Polygon } from "geojson";

// ── Capacity confidence levels ──

export type CapacityConfidence = "verified" | "estimated" | "approximated";
export type CapacitySource = "fcc" | "press" | "wikipedia" | "derived" | "heuristic";

// ── Cable & segments ──

export interface CableSegment {
	from: string; // Metro ID
	to: string;
	capacityTbps: number;
	distanceKm: number;
	cableId: string;
}

export interface Cable {
	id: string;
	name: string;
	rfsYear: number;
	lengthKm: number;
	fiberPairs: number | null;
	designCapacityTbps: number;
	capacitySource: CapacitySource;
	capacityConfidence: CapacityConfidence;
	sourceUrl?: string;
	owners: string[];
	landingStationIds: string[];
	path: Feature<LineString | MultiLineString>;
	segments: CableSegment[];
}

// ── Metro nodes ──

export interface Metro {
	id: string;
	name: string;
	countryCode: string;
	lat: number;
	lng: number;
	isHub: boolean;
	landingStationCount: number;
}

// ── Terrestrial edges ──

export interface TerrestrialEdge {
	id: string;
	from: string;
	to: string;
	capacityTbps: number;
	distanceKm: number;
	confidence: CapacityConfidence;
	source: string;
	sourceUrl?: string;
	operators: string[];
	notes?: string;
}

// ── Chokepoints ──

export interface Chokepoint {
	id: string;
	name: string;
	polygon: Polygon;
	description: string;
}

// ── Scenarios ──

export interface ScenarioCut {
	type: "chokepoint" | "point" | "cable";
	id?: string;
	lat?: number;
	lng?: number;
	cableIds?: string[];
	/** Where the cable was physically cut (for location-based segment resolution) */
	cutLat?: number;
	cutLng?: number;
	/** Radius in km for segment matching (defaults to 500) */
	cutRadius?: number;
}

export interface Scenario {
	id: string;
	name: string;
	description: string;
	cutLocations: ScenarioCut[];
	historicalDate?: string;
	repairTimeDays?: number;
	sourceUrls?: string[];
}

// ── Simulation results ──

export interface RerouteExplanation {
	name: string;
	additionalLoadTbps: number;
	type: "submarine" | "terrestrial";
	cableId?: string;
	terrestrialId?: string;
}

export interface MetroImpact {
	metroId: string;
	countryCode: string;
	baselineBandwidthTbps: number;
	remainingBandwidthTbps: number;
	bandwidthLossPct: number;
	baselineLatencyMs: number;
	reroutedLatencyMs: number;
	latencyDeltaMs: number;
	baselinePathDiversity: number;
	remainingPathDiversity: number;
	isolated: boolean;
	redundancyAbsorbed: boolean;
	reroutedVia: RerouteExplanation[];
}

// ── Graph types (internal to engine) ──

export interface GraphEdge {
	id: string;
	from: string;
	to: string;
	capacityTbps: number;
	distanceKm: number;
	type: "submarine" | "terrestrial";
	cableId?: string;
	segmentIndex?: number;
	label: string; // display name
}

// ── Cut types ──

export interface CutLocation {
	id: string;
	type: "chokepoint" | "point";
	lat: number;
	lng: number;
	radius?: number; // km, for point cuts
	chokepointId?: string;
	affectedSegmentIds: string[]; // resolved after intersection test
}

// ── App data bundle ──

export interface AppData {
	cables: Cable[];
	metros: Metro[];
	terrestrial: TerrestrialEdge[];
	chokepoints: Chokepoint[];
	scenarios: Scenario[];
}

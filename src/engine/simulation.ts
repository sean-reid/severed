import type {
	Cable,
	Chokepoint,
	CutLocation,
	Metro,
	MetroImpact,
	RerouteExplanation,
	TerrestrialEdge,
} from "../data/types";
import { pointInPolygon } from "../utils/geo";
import { NetworkGraph } from "./graph";
import { dijkstraDistance, reconstructPath } from "./pathfinding";

export interface SimulationInput {
	metros: Metro[];
	cables: Cable[];
	terrestrial: TerrestrialEdge[];
	chokepoints: Chokepoint[];
	cuts: CutLocation[];
}

export interface SimulationOutput {
	impacts: MetroImpact[];
	totalCapacityRemovedTbps: number;
	metrosAffected: number;
	cablesAffected: number;
	affectedEdgeIds: string[];
}

interface BaselineMetrics {
	bandwidth: Map<string, number>;
	latency: Map<string, number>;
	diversity: Map<string, number>;
}

/**
 * Resolve which graph edge IDs are affected by a set of cut locations.
 */
function resolveAffectedEdges(
	graph: NetworkGraph,
	cuts: CutLocation[],
	cables: Cable[],
	chokepoints: Chokepoint[],
): Set<string> {
	const affectedEdgeIds = new Set<string>();
	const chokepointMap = new Map(chokepoints.map((c) => [c.id, c]));

	for (const cut of cuts) {
		if (cut.type === "chokepoint" && cut.chokepointId) {
			const chokepoint = chokepointMap.get(cut.chokepointId);
			if (!chokepoint) continue;
			const poly = chokepoint.polygon.coordinates[0];

			// Find all cable segments that pass through this chokepoint
			for (const cable of cables) {
				for (let i = 0; i < cable.segments.length; i++) {
					const seg = cable.segments[i];
					const fromMetro = graph.nodes.get(seg.from);
					const toMetro = graph.nodes.get(seg.to);
					if (!fromMetro || !toMetro) continue;

					// Check if the midpoint of the segment is inside the chokepoint polygon
					const midLat = (fromMetro.lat + toMetro.lat) / 2;
					const midLng = (fromMetro.lng + toMetro.lng) / 2;

					// Check endpoints and midpoint
					if (
						pointInPolygon(fromMetro.lat, fromMetro.lng, poly) ||
						pointInPolygon(toMetro.lat, toMetro.lng, poly) ||
						pointInPolygon(midLat, midLng, poly)
					) {
						affectedEdgeIds.add(`${cable.id}:${i}`);
					}
				}
			}
		} else if (cut.type === "point") {
			// Point cut: find cable segments near this location
			const radius = cut.radius ?? 100; // km
			for (const cable of cables) {
				for (let i = 0; i < cable.segments.length; i++) {
					const seg = cable.segments[i];
					const fromMetro = graph.nodes.get(seg.from);
					const toMetro = graph.nodes.get(seg.to);
					if (!fromMetro || !toMetro) continue;

					// Check if the cut point is close to the segment midpoint
					const midLat = (fromMetro.lat + toMetro.lat) / 2;
					const midLng = (fromMetro.lng + toMetro.lng) / 2;
					const distDeg = Math.hypot(cut.lat - midLat, cut.lng - midLng);
					// Rough: 1 degree ≈ 111 km
					if (distDeg * 111 < radius) {
						affectedEdgeIds.add(`${cable.id}:${i}`);
					}
				}
			}
		}

		// Also add any pre-resolved segment IDs
		for (const segId of cut.affectedSegmentIds) {
			affectedEdgeIds.add(segId);
		}
	}

	return affectedEdgeIds;
}

/**
 * Compute baseline metrics for all metros.
 * Optimization: run Dijkstra FROM each hub (not from each metro),
 * then aggregate per metro. This is O(hubs × V log V) instead of O(V × hubs × V log V).
 */
function computeBaseline(graph: NetworkGraph): BaselineMetrics {
	const bandwidth = new Map<string, number>();
	const latency = new Map<string, number>();
	const diversity = new Map<string, number>();

	// Initialize
	for (const [metroId] of graph.nodes) {
		bandwidth.set(metroId, 0);
		latency.set(metroId, Number.POSITIVE_INFINITY);
		const adj = graph.adjacency.get(metroId);
		diversity.set(metroId, adj ? new Set(adj.map((e) => e.cableId ?? e.id)).size : 0);
	}

	// Run Dijkstra from each hub, accumulate bandwidth per metro
	for (const hubId of graph.hubIds) {
		const { dist, prev } = dijkstraDistance(graph, hubId);

		for (const [metroId] of graph.nodes) {
			// Latency: track minimum to any hub
			const d = dist.get(metroId) ?? Number.POSITIVE_INFINITY;
			const currentLat = latency.get(metroId) ?? Number.POSITIVE_INFINITY;
			if (d * 0.005 < currentLat) {
				latency.set(metroId, d * 0.005); // km to ms
			}

			// Bandwidth: bottleneck along shortest path to this hub
			if (metroId === hubId) continue;
			const path = reconstructPath(prev, metroId);
			if (path.length === 0) continue;
			const bottleneck = Math.min(...path.map((e) => e.capacityTbps));
			bandwidth.set(metroId, (bandwidth.get(metroId) ?? 0) + bottleneck);
		}
	}

	// Hubs get their direct edge capacity sum
	for (const hubId of graph.hubIds) {
		const adj = graph.adjacency.get(hubId);
		if (adj) {
			bandwidth.set(
				hubId,
				adj.reduce((sum, e) => sum + e.capacityTbps, 0),
			);
		}
	}

	return { bandwidth, latency, diversity };
}

/**
 * Compute rerouting explanation for a metro.
 */
function computeRerouting(
	_baselineGraph: NetworkGraph,
	damagedGraph: NetworkGraph,
	metroId: string,
): RerouteExplanation[] {
	const { prev: damagedPrev } = dijkstraDistance(damagedGraph, metroId);
	const reroutes: RerouteExplanation[] = [];
	const seen = new Set<string>();

	for (const hubId of damagedGraph.hubIds) {
		const path = reconstructPath(damagedPrev, hubId);
		for (const edge of path) {
			const key = edge.cableId ?? edge.id;
			if (seen.has(key)) continue;
			seen.add(key);
			reroutes.push({
				name: edge.label,
				additionalLoadTbps: edge.capacityTbps,
				type: edge.type,
				cableId: edge.cableId,
				...(edge.type === "terrestrial" ? { terrestrialId: edge.id.replace("terr:", "") } : {}),
			});
		}
	}

	return reroutes.slice(0, 5); // top 5 rerouting paths
}

/**
 * Run the full simulation.
 */
export function runSimulation(input: SimulationInput): SimulationOutput {
	const { metros, cables, terrestrial, chokepoints, cuts } = input;

	// Build baseline graph
	const baselineGraph = new NetworkGraph(metros, cables, terrestrial);

	// Compute baseline metrics
	const baseline = computeBaseline(baselineGraph);

	if (cuts.length === 0) {
		// No cuts — return baseline with zero impact
		const impacts: MetroImpact[] = metros.map((m) => ({
			metroId: m.id,
			countryCode: m.countryCode,
			baselineBandwidthTbps: baseline.bandwidth.get(m.id) ?? 0,
			remainingBandwidthTbps: baseline.bandwidth.get(m.id) ?? 0,
			bandwidthLossPct: 0,
			baselineLatencyMs: baseline.latency.get(m.id) ?? 0,
			reroutedLatencyMs: baseline.latency.get(m.id) ?? 0,
			latencyDeltaMs: 0,
			baselinePathDiversity: baseline.diversity.get(m.id) ?? 0,
			remainingPathDiversity: baseline.diversity.get(m.id) ?? 0,
			isolated: false,
			redundancyAbsorbed: false,
			reroutedVia: [],
		}));
		return {
			impacts,
			totalCapacityRemovedTbps: 0,
			metrosAffected: 0,
			cablesAffected: 0,
			affectedEdgeIds: [],
		};
	}

	// Resolve which edges are affected
	const affectedEdgeIds = resolveAffectedEdges(baselineGraph, cuts, cables, chokepoints);

	// Build damaged graph
	const damagedGraph = baselineGraph.withoutEdges(affectedEdgeIds);

	// Compute damaged metrics
	const damagedBandwidth = new Map<string, number>();
	const damagedLatency = new Map<string, number>();
	const damagedDiversity = new Map<string, number>();

	// Same hub-first Dijkstra approach for damaged graph
	for (const [metroId] of damagedGraph.nodes) {
		damagedBandwidth.set(metroId, 0);
		damagedLatency.set(metroId, Number.POSITIVE_INFINITY);
		const adj = damagedGraph.adjacency.get(metroId);
		damagedDiversity.set(metroId, adj ? new Set(adj.map((e) => e.cableId ?? e.id)).size : 0);
	}

	for (const hubId of damagedGraph.hubIds) {
		const { dist, prev } = dijkstraDistance(damagedGraph, hubId);
		for (const [metroId] of damagedGraph.nodes) {
			const d = dist.get(metroId) ?? Number.POSITIVE_INFINITY;
			const currentLat = damagedLatency.get(metroId) ?? Number.POSITIVE_INFINITY;
			if (d * 0.005 < currentLat) {
				damagedLatency.set(metroId, d * 0.005);
			}
			if (metroId === hubId) continue;
			const path = reconstructPath(prev, metroId);
			if (path.length === 0) continue;
			const bottleneck = Math.min(...path.map((e) => e.capacityTbps));
			damagedBandwidth.set(metroId, (damagedBandwidth.get(metroId) ?? 0) + bottleneck);
		}
	}
	for (const hubId of damagedGraph.hubIds) {
		const adj = damagedGraph.adjacency.get(hubId);
		if (adj) {
			damagedBandwidth.set(
				hubId,
				adj.reduce((sum, e) => sum + e.capacityTbps, 0),
			);
		}
	}

	// Compute per-metro impacts
	let totalCapacityRemoved = 0;
	const affectedCableIds = new Set<string>();
	for (const edgeId of affectedEdgeIds) {
		const edge = baselineGraph.edges.find((e) => e.id === edgeId);
		if (edge) {
			totalCapacityRemoved += edge.capacityTbps;
			if (edge.cableId) affectedCableIds.add(edge.cableId);
		}
	}

	let metrosAffected = 0;

	const impacts: MetroImpact[] = metros.map((m) => {
		const bBase = baseline.bandwidth.get(m.id) ?? 0;
		const bDamaged = damagedBandwidth.get(m.id) ?? 0;
		const lBase = baseline.latency.get(m.id) ?? 0;
		const lDamaged = damagedLatency.get(m.id) ?? Number.POSITIVE_INFINITY;
		const dBase = baseline.diversity.get(m.id) ?? 0;
		const dDamaged = damagedDiversity.get(m.id) ?? 0;

		const lossPct = bBase > 0 ? ((bBase - bDamaged) / bBase) * 100 : 0;
		const isolated = bDamaged === 0 && bBase > 0;
		const redundancyAbsorbed = lossPct < 3 && bBase > 0;
		const latencyDelta =
			lDamaged === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : lDamaged - lBase;

		if (lossPct > 0.1) metrosAffected++;

		const reroutedVia =
			lossPct > 0 && !isolated ? computeRerouting(baselineGraph, damagedGraph, m.id) : [];

		return {
			metroId: m.id,
			countryCode: m.countryCode,
			baselineBandwidthTbps: Math.round(bBase * 100) / 100,
			remainingBandwidthTbps: Math.round(bDamaged * 100) / 100,
			bandwidthLossPct: Math.round(lossPct * 10) / 10,
			baselineLatencyMs: Math.round(lBase * 100) / 100,
			reroutedLatencyMs:
				lDamaged === Number.POSITIVE_INFINITY ? -1 : Math.round(lDamaged * 100) / 100,
			latencyDeltaMs:
				latencyDelta === Number.POSITIVE_INFINITY ? -1 : Math.round(latencyDelta * 100) / 100,
			baselinePathDiversity: dBase,
			remainingPathDiversity: dDamaged,
			isolated,
			redundancyAbsorbed,
			reroutedVia,
		};
	});

	// Sort by impact: isolated first, then by bandwidth loss %
	impacts.sort((a, b) => {
		if (a.isolated && !b.isolated) return -1;
		if (!a.isolated && b.isolated) return 1;
		return b.bandwidthLossPct - a.bandwidthLossPct;
	});

	return {
		impacts,
		totalCapacityRemovedTbps: Math.round(totalCapacityRemoved * 100) / 100,
		metrosAffected,
		cablesAffected: affectedCableIds.size,
		affectedEdgeIds: [...affectedEdgeIds],
	};
}

import type { GraphEdge } from "../data/types";
import type { NetworkGraph } from "./graph";

interface DijkstraResult {
	dist: Map<string, number>;
	prev: Map<string, { node: string; edge: GraphEdge } | null>;
}

/**
 * Dijkstra's shortest path from source, weighted by distance (for latency).
 */
export function dijkstraDistance(graph: NetworkGraph, source: string): DijkstraResult {
	const dist = new Map<string, number>();
	const prev = new Map<string, { node: string; edge: GraphEdge } | null>();
	const visited = new Set<string>();

	// Simple priority queue via sorted array (good enough for ~300 nodes)
	const queue: { node: string; dist: number }[] = [];

	for (const [id] of graph.nodes) {
		dist.set(id, id === source ? 0 : Number.POSITIVE_INFINITY);
		prev.set(id, null);
	}
	queue.push({ node: source, dist: 0 });

	while (queue.length > 0) {
		queue.sort((a, b) => a.dist - b.dist);
		const { node: u } = queue.shift()!;
		if (visited.has(u)) continue;
		visited.add(u);

		const adj = graph.adjacency.get(u);
		if (!adj) continue;

		for (const edge of adj) {
			const v = edge.to;
			if (visited.has(v)) continue;
			const alt = dist.get(u)! + edge.distanceKm;
			if (alt < dist.get(v)!) {
				dist.set(v, alt);
				prev.set(v, { node: u, edge });
				queue.push({ node: v, dist: alt });
			}
		}
	}

	return { dist, prev };
}

/**
 * Find the path from source to target using Dijkstra results.
 */
export function reconstructPath(
	prev: Map<string, { node: string; edge: GraphEdge } | null>,
	target: string,
): GraphEdge[] {
	const path: GraphEdge[] = [];
	let current = target;
	while (prev.get(current)) {
		const entry = prev.get(current)!;
		path.unshift(entry.edge);
		current = entry.node;
	}
	return path;
}

/**
 * Compute aggregate bandwidth from a metro to all hubs.
 * Uses a simplified approach: for each hub, find the min-capacity edge
 * on the shortest path (bottleneck bandwidth). Sum across all reachable hubs.
 *
 * This is faster than true max-flow while still being meaningful:
 * it captures "how much bandwidth could flow from this metro to the internet?"
 */
export function bandwidthToHubs(graph: NetworkGraph, metroId: string): number {
	if (graph.hubIds.has(metroId)) {
		// Hubs are connected to themselves with "infinite" bandwidth
		// Report sum of direct edge capacities instead
		const adj = graph.adjacency.get(metroId);
		if (!adj) return 0;
		return adj.reduce((sum, e) => sum + e.capacityTbps, 0);
	}

	const { prev } = dijkstraDistance(graph, metroId);
	let totalBandwidth = 0;

	for (const hubId of graph.hubIds) {
		const path = reconstructPath(prev, hubId);
		if (path.length === 0) continue;
		// Bottleneck: min capacity along the path
		const bottleneck = Math.min(...path.map((e) => e.capacityTbps));
		totalBandwidth += bottleneck;
	}

	return totalBandwidth;
}

/**
 * Latency to nearest hub in ms (one-way, speed of light in fiber).
 */
export function latencyToNearestHub(graph: NetworkGraph, metroId: string): number {
	if (graph.hubIds.has(metroId)) return 0;

	const { dist } = dijkstraDistance(graph, metroId);
	let minDist = Number.POSITIVE_INFINITY;

	for (const hubId of graph.hubIds) {
		const d = dist.get(hubId) ?? Number.POSITIVE_INFINITY;
		if (d < minDist) minDist = d;
	}

	if (minDist === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
	// Speed of light in fiber: ~200,000 km/s, so 1km = 0.005ms one-way
	return minDist * 0.005;
}

/**
 * Count edge-disjoint paths from metro to any hub.
 * Uses iterative path finding with edge removal.
 */
export function pathDiversityToHubs(graph: NetworkGraph, metroId: string): number {
	if (graph.hubIds.has(metroId)) {
		// Count unique cables/terrestrial links connected to this hub
		const adj = graph.adjacency.get(metroId);
		if (!adj) return 0;
		return new Set(adj.map((e) => e.cableId ?? e.id)).size;
	}

	let diversity = 0;
	const removedEdgeIds = new Set<string>();
	const maxIterations = 20; // prevent infinite loop

	for (let i = 0; i < maxIterations; i++) {
		const subgraph = graph.withoutEdges(removedEdgeIds);
		const { prev } = dijkstraDistance(subgraph, metroId);

		// Find path to any hub
		let foundPath: GraphEdge[] | null = null;
		for (const hubId of subgraph.hubIds) {
			const path = reconstructPath(prev, hubId);
			if (path.length > 0) {
				foundPath = path;
				break;
			}
		}

		if (!foundPath) break;

		diversity++;
		// Remove all edges on this path
		for (const edge of foundPath) {
			removedEdgeIds.add(edge.id);
		}
	}

	return diversity;
}

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


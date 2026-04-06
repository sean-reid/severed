import type { Cable, GraphEdge, Metro, TerrestrialEdge } from "../data/types";
import { haversineKm } from "../utils/geo";

/**
 * Weighted undirected multigraph for the cable/terrestrial network.
 * Nodes are metro IDs, edges are cable segments or terrestrial links.
 */
export class NetworkGraph {
	nodes: Map<string, Metro> = new Map();
	edges: GraphEdge[] = [];
	adjacency: Map<string, GraphEdge[]> = new Map();
	hubIds: Set<string> = new Set();

	constructor(metros: Metro[], cables: Cable[], terrestrial: TerrestrialEdge[]) {
		// Add nodes
		for (const m of metros) {
			this.nodes.set(m.id, m);
			this.adjacency.set(m.id, []);
			if (m.isHub) this.hubIds.add(m.id);
		}

		// Add submarine cable segments
		for (const cable of cables) {
			for (let i = 0; i < cable.segments.length; i++) {
				const seg = cable.segments[i];
				if (!this.nodes.has(seg.from) || !this.nodes.has(seg.to)) continue;
				const edge: GraphEdge = {
					id: `${cable.id}:${i}`,
					from: seg.from,
					to: seg.to,
					capacityTbps: seg.capacityTbps,
					distanceKm: seg.distanceKm,
					type: "submarine",
					cableId: cable.id,
					segmentIndex: i,
					label: cable.name,
				};
				this.addEdge(edge);
			}
		}

		// Add terrestrial edges
		for (const t of terrestrial) {
			if (!this.nodes.has(t.from) || !this.nodes.has(t.to)) continue;
			const edge: GraphEdge = {
				id: `terr:${t.id}`,
				from: t.from,
				to: t.to,
				capacityTbps: t.capacityTbps,
				distanceKm: t.distanceKm || this.computeDistance(t.from, t.to),
				type: "terrestrial",
				label: t.operators.join(", ") || "Terrestrial",
			};
			this.addEdge(edge);
		}
	}

	private addEdge(edge: GraphEdge) {
		this.edges.push(edge);
		this.adjacency.get(edge.from)?.push(edge);
		// Add reverse direction
		const reverse: GraphEdge = { ...edge, from: edge.to, to: edge.from };
		this.adjacency.get(edge.to)?.push(reverse);
	}

	private computeDistance(fromId: string, toId: string): number {
		const a = this.nodes.get(fromId);
		const b = this.nodes.get(toId);
		if (!a || !b) return 0;
		return haversineKm(a.lat, a.lng, b.lat, b.lng);
	}

	/**
	 * Remove edges by their IDs and return a new graph with those edges removed.
	 * Does NOT mutate the original.
	 */
	withoutEdges(edgeIds: Set<string>): NetworkGraph {
		const clone = Object.create(NetworkGraph.prototype) as NetworkGraph;
		clone.nodes = this.nodes;
		clone.hubIds = this.hubIds;
		clone.edges = this.edges.filter((e) => !edgeIds.has(e.id));
		clone.adjacency = new Map();
		for (const [nodeId] of this.nodes) {
			clone.adjacency.set(nodeId, []);
		}
		for (const edge of clone.edges) {
			clone.adjacency.get(edge.from)?.push(edge);
			const reverse: GraphEdge = { ...edge, from: edge.to, to: edge.from };
			clone.adjacency.get(edge.to)?.push(reverse);
		}
		return clone;
	}

	/**
	 * Get all edge IDs belonging to a specific cable.
	 */
	edgeIdsForCable(cableId: string): string[] {
		return this.edges.filter((e) => e.cableId === cableId).map((e) => e.id);
	}

	/**
	 * Get all unique neighbor node IDs for a node.
	 */
	neighbors(nodeId: string): string[] {
		const adj = this.adjacency.get(nodeId);
		if (!adj) return [];
		return [...new Set(adj.map((e) => e.to))];
	}
}

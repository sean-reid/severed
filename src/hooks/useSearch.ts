import { useMemo, useState } from "react";
import { useStore } from "../state/store";

export type SearchResultType = "cable" | "metro" | "terrestrial" | "scenario";

export interface SearchResult {
	id: string;
	type: SearchResultType;
	title: string;
	subtitle: string;
	/** For flyTo on selection */
	lat?: number;
	lng?: number;
}

/** Build a flat searchable index from all app data. */
function buildIndex(
	cables: {
		id: string;
		name: string;
		owners: string[];
		designCapacityTbps: number;
		rfsYear: number;
		segments: { from: string; to: string }[];
	}[],
	metros: {
		id: string;
		name: string;
		countryCode: string;
		isHub: boolean;
		lat: number;
		lng: number;
	}[],
	terrestrial: {
		id: string;
		from: string;
		to: string;
		operators: string[];
		capacityTbps: number;
	}[],
	scenarios: { id: string; name: string; description: string }[],
	metrosById: Map<string, { name: string; lat: number; lng: number }>,
): SearchResult[] {
	const results: SearchResult[] = [];

	for (const c of cables) {
		// Use midpoint of first segment for flyTo
		const seg = c.segments[0];
		const fromM = seg ? metrosById.get(seg.from) : undefined;
		const toM = seg ? metrosById.get(seg.to) : undefined;
		const lat = fromM && toM ? (fromM.lat + toM.lat) / 2 : undefined;
		const lng = fromM && toM ? (fromM.lng + toM.lng) / 2 : undefined;

		results.push({
			id: c.id,
			type: "cable",
			title: c.name,
			subtitle: `${c.designCapacityTbps < 1 ? `${(c.designCapacityTbps * 1000).toFixed(0)} Gbps` : `${c.designCapacityTbps.toFixed(0)} Tbps`} · RFS ${c.rfsYear}${c.owners.length > 0 ? ` · ${c.owners.slice(0, 2).join(", ")}` : ""}`,
			lat,
			lng,
		});
	}

	for (const m of metros) {
		results.push({
			id: m.id,
			type: "metro",
			title: m.name,
			subtitle: `${m.countryCode}${m.isHub ? " · Hub" : ""}`,
			lat: m.lat,
			lng: m.lng,
		});
	}

	for (const t of terrestrial) {
		const fromM = metrosById.get(t.from);
		const toM = metrosById.get(t.to);
		const fromName = fromM?.name ?? t.from;
		const toName = toM?.name ?? t.to;
		const lat = fromM && toM ? (fromM.lat + toM.lat) / 2 : undefined;
		const lng = fromM && toM ? (fromM.lng + toM.lng) / 2 : undefined;

		results.push({
			id: t.id,
			type: "terrestrial",
			title: `${fromName} — ${toName}`,
			subtitle: `${t.capacityTbps < 1 ? `${(t.capacityTbps * 1000).toFixed(0)} Gbps` : `${t.capacityTbps.toFixed(0)} Tbps`}${t.operators.length > 0 ? ` · ${t.operators.slice(0, 2).join(", ")}` : ""}`,
			lat,
			lng,
		});
	}

	for (const s of scenarios) {
		results.push({
			id: s.id,
			type: "scenario",
			title: s.name,
			subtitle: s.description,
		});
	}

	return results;
}

function scoreMatch(query: string, result: SearchResult): number {
	const q = query.toLowerCase();
	const title = result.title.toLowerCase();
	const subtitle = result.subtitle.toLowerCase();

	// Exact title match
	if (title === q) return 100;
	// Title starts with query
	if (title.startsWith(q)) return 80;
	// Title contains query as word boundary
	if (title.includes(` ${q}`) || title.includes(`-${q}`)) return 60;
	// Title contains query
	if (title.includes(q)) return 50;
	// Subtitle contains query
	if (subtitle.includes(q)) return 20;

	return 0;
}

export function useSearch() {
	const cables = useStore((s) => s.cables);
	const metros = useStore((s) => s.metros);
	const terrestrial = useStore((s) => s.terrestrial);
	const scenarios = useStore((s) => s.scenarios);
	const metrosById = useStore((s) => s.metrosById);
	const [query, setQuery] = useState("");

	const index = useMemo(
		() => buildIndex(cables, metros, terrestrial, scenarios, metrosById),
		[cables, metros, terrestrial, scenarios, metrosById],
	);

	const results = useMemo(() => {
		const q = query.trim();
		if (q.length < 2) return [];

		return index
			.map((r) => ({ result: r, score: scoreMatch(q, r) }))
			.filter((r) => r.score > 0)
			.sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title))
			.slice(0, 50)
			.map((r) => r.result);
	}, [query, index]);

	return { query, setQuery, results };
}

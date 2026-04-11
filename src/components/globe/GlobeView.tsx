import type { Layer } from "@deck.gl/core";
import { GeoJsonLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Feature, LineString, MultiLineString, Position } from "geojson";
import { useEffect, useMemo, useRef } from "react";
import { Map as MapGL, useControl } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { Cable, CutLocation, Metro, TerrestrialEdge } from "../../data/types";
import { useSimulation } from "../../engine/useSimulation";
import { useStore } from "../../state/store";
import { cableBounds } from "../../utils/cableBounds";
import { CUT_COLOR, TERRESTRIAL_COLOR, cableColor, cableWidthScale } from "../../utils/colors";
import { haversineKm } from "../../utils/geo";
import { snapToCablePath } from "../../utils/projectOnPath";
import "maplibre-gl/dist/maplibre-gl.css";

function DeckGLOverlay(props: { layers: Layer[] }) {
	const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ interleaved: false }));
	overlay.setProps({
		layers: props.layers,
		// Expand pick radius for easier mobile taps on thin cable lines
		pickingRadius: 20,
	});
	return null;
}

const INITIAL_VIEW = {
	longitude: 30,
	latitude: 20,
	zoom: 2,
	pitch: 0,
	bearing: 0,
};

const DARK_BASEMAP = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

/** Half-gap in degrees (~1.5km at equator). */
const GAP = 0.015;

/**
 * Project a point onto the nearest segment of a polyline.
 * Returns segment index, projected position, and unit direction along the segment.
 * Pure function — never mutates input.
 */
function projectOnLine(
	coords: readonly Position[],
	lat: number,
	lng: number,
): { segIdx: number; point: Position; dir: Position } {
	let bestSeg = 0;
	let bestDist = Number.MAX_VALUE;
	let bestPoint: Position = [lng, lat];
	let bestDir: Position = [1, 0];

	for (let i = 0; i < coords.length - 1; i++) {
		const ax = coords[i][0];
		const ay = coords[i][1];
		const bx = coords[i + 1][0];
		const by = coords[i + 1][1];
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
			bestSeg = i;
			bestPoint = [px, py];
			const len = Math.sqrt(len2) || 1;
			bestDir = [dx / len, dy / len];
		}
	}
	return { segIdx: bestSeg, point: bestPoint, dir: bestDir };
}

/**
 * Split a cable path at cut points with small, symmetric gaps.
 * Pure function — never mutates the input path. Safe to call on every render.
 */
function splitCablePath(
	path: Feature<LineString | MultiLineString>,
	cableCuts: { lat: number; lng: number }[],
): Feature<LineString | MultiLineString>[] {
	const props = path.properties ?? {};
	const geom = path.geometry;
	const origLines: readonly (readonly Position[])[] =
		geom.type === "MultiLineString" ? geom.coordinates : [geom.coordinates];

	// Resolve each cut to a specific line + position
	type ResolvedCut = { segIdx: number; point: Position; dir: Position };
	const cutsByLine = new Map<number, ResolvedCut[]>();

	for (const cut of cableCuts) {
		let bestLine = 0;
		let bestDist = Number.MAX_VALUE;
		let best: ResolvedCut = { segIdx: 0, point: [cut.lng, cut.lat], dir: [1, 0] };
		for (let li = 0; li < origLines.length; li++) {
			const r = projectOnLine(origLines[li], cut.lat, cut.lng);
			const d = (r.point[0] - cut.lng) ** 2 + (r.point[1] - cut.lat) ** 2;
			if (d < bestDist) {
				bestDist = d;
				bestLine = li;
				best = r;
			}
		}
		const arr = cutsByLine.get(bestLine) ?? [];
		arr.push(best);
		cutsByLine.set(bestLine, arr);
	}

	// Build split features, marking severed fragments
	const out: { coords: Position[]; severed: boolean }[] = [];

	for (let li = 0; li < origLines.length; li++) {
		const lineCuts = cutsByLine.get(li);
		if (!lineCuts) {
			// Intact line — not severed
			out.push({ coords: [...origLines[li]], severed: false });
			continue;
		}
		lineCuts.sort((a, b) => a.segIdx - b.segIdx);
		const coords = origLines[li];

		let pending: Position[] = [];
		let nextCoord = 0;

		for (const { segIdx, point, dir } of lineCuts) {
			while (nextCoord <= segIdx) {
				pending.push(coords[nextCoord]);
				nextCoord++;
			}
			pending.push([point[0] - dir[0] * GAP, point[1] - dir[1] * GAP]);
			if (pending.length >= 2) out.push({ coords: pending, severed: true });

			pending = [[point[0] + dir[0] * GAP, point[1] + dir[1] * GAP]];
		}

		while (nextCoord < coords.length) {
			pending.push(coords[nextCoord]);
			nextCoord++;
		}
		if (pending.length >= 2) out.push({ coords: pending, severed: true });
	}

	return out
		.filter((f) => f.coords.length >= 2)
		.map((f) => ({
			type: "Feature" as const,
			properties: { ...props, severed: f.severed },
			geometry: { type: "LineString" as const, coordinates: f.coords },
		}));
}

export function GlobeView() {
	const cables = useStore((s) => s.cables);
	const metros = useStore((s) => s.metros);
	const terrestrial = useStore((s) => s.terrestrial);
	const cuts = useStore((s) => s.cuts);
	const hoveredCableId = useStore((s) => s.hoveredCableId);
	const selectedCableId = useStore((s) => s.selectedCableId);
	const selectCable = useStore((s) => s.selectCable);
	const selectMetro = useStore((s) => s.selectMetro);
	const hoverCable = useStore((s) => s.hoverCable);
	const simulation = useStore((s) => s.simulation);
	const mobileSheetHeight = useStore((s) => s.mobileSheetHeight);
	const hasCuts = useStore((s) => s.cuts.length > 0);
	const resetCuts = useStore((s) => s.resetCuts);
	const flyTo = useStore((s) => s.flyTo);
	const clearFlyTo = useStore((s) => s.clearFlyTo);
	const selectedMetroId = useStore((s) => s.selectedMetroId);
	const selectedTerrestrialId = useStore((s) => s.selectedTerrestrialId);
	const selectTerrestrial = useStore((s) => s.selectTerrestrial);
	const sheetDragging = useStore((s) => s.mobileSheetDragging);
	const mobileCardHeight = useStore((s) => s.mobileCardHeight);
	const metrosById = useStore((s) => s.metrosById);
	const cutMode = useStore((s) => s.cutMode);
	const toggleCutMode = useStore((s) => s.toggleCutMode);
	const addCut = useStore((s) => s.addCut);
	const removeCut = useStore((s) => s.removeCut);
	const selectPointCut = useStore((s) => s.selectPointCut);
	const flyToBounds = useStore((s) => s.flyToBounds);
	const mapRef = useRef<MapRef>(null);
	const lastDeckClickTime = useRef(0);

	useSimulation();

	const fitBounds = useStore((s) => s.fitBounds);

	// Handle flyTo / fitBounds requests from the store
	useEffect(() => {
		if (!mapRef.current) return;
		if (fitBounds) {
			const isMobile = window.innerWidth < 768;
			mapRef.current.fitBounds(
				[
					[fitBounds.minLng, fitBounds.minLat],
					[fitBounds.maxLng, fitBounds.maxLat],
				],
				{
					padding: isMobile
						? { top: 60, bottom: 60, left: 20, right: 20 }
						: { top: 40, bottom: 40, left: 240, right: 350 },
					duration: 1500,
				},
			);
			clearFlyTo();
		} else if (flyTo) {
			mapRef.current.flyTo({
				center: [flyTo.lng, flyTo.lat],
				zoom: flyTo.zoom,
				duration: 1500,
			});
			clearFlyTo();
		}
	}, [flyTo, fitBounds, clearFlyTo]);

	// Resolved affected segment IDs (e.g., "2africa:5") — from simulation + direct cuts
	const affectedSegIds = useMemo(() => {
		const ids = new Set<string>();
		if (simulation?.affectedEdgeIds) {
			for (const edgeId of simulation.affectedEdgeIds) {
				if (!edgeId.startsWith("terr")) ids.add(edgeId);
			}
		}
		for (const cut of cuts) {
			for (const segId of cut.affectedSegmentIds) {
				if (!segId.startsWith("terr")) ids.add(segId);
			}
		}
		return ids;
	}, [simulation, cuts]);

	// Cable IDs that have at least one affected segment (for split path logic)
	const cutCableIds = useMemo(() => {
		const ids = new Set<string>();
		for (const segId of affectedSegIds) {
			ids.add(segId.split(":")[0]);
		}
		return ids;
	}, [affectedSegIds]);

	const layers = useMemo((): Layer[] => {
		const result: Layer[] = [];

		if (cables.length > 0) {
			// Build cable features, splitting paths at cut points
			const segmentCuts = cuts.filter((c) => c.type === "segment" && c.cableId);
			const cutsByCable = new Map<string, { lat: number; lng: number }[]>();
			for (const cut of segmentCuts) {
				if (!cut.cableId) continue;
				const arr = cutsByCable.get(cut.cableId) ?? [];
				arr.push({ lat: cut.lat, lng: cut.lng });
				cutsByCable.set(cut.cableId, arr);
			}

			// For every cable with affected segments (user cuts OR scenario cuts),
			// trace the cable's segment graph to find which portions are isolated.
			// Remove affected edges, BFS from hub metros, mark unreachable segments.
			const isolatedSegIds = new Set<string>();
			for (const cableId of cutCableIds) {
				const cable = cables.find((cb) => cb.id === cableId);
				if (!cable) continue;

				// Collect all affected segment indices for this cable
				const cutSegSet = new Set<number>();
				for (const segId of affectedSegIds) {
					const [cId, idx] = segId.split(":");
					if (cId === cableId) cutSegSet.add(Number(idx));
				}

				// Build adjacency list excluding cut segments
				const adj = new Map<string, { metro: string; segIdx: number }[]>();
				for (let i = 0; i < cable.segments.length; i++) {
					if (cutSegSet.has(i)) continue;
					const seg = cable.segments[i];
					const a = adj.get(seg.from) ?? [];
					a.push({ metro: seg.to, segIdx: i });
					adj.set(seg.from, a);
					const b = adj.get(seg.to) ?? [];
					b.push({ metro: seg.from, segIdx: i });
					adj.set(seg.to, b);
				}

				// BFS from hub metros to find reachable segments
				const hubMetros = new Set(
					cable.segments.flatMap((s) => [s.from, s.to]).filter((m) => metrosById.get(m)?.isHub),
				);
				const reachableSegs = new Set<number>();
				const visited = new Set<string>();
				for (const hub of hubMetros) {
					if (visited.has(hub)) continue;
					const queue = [hub];
					visited.add(hub);
					while (queue.length > 0) {
						const m = queue.shift();
						if (!m) break;
						for (const { metro, segIdx } of adj.get(m) ?? []) {
							reachableSegs.add(segIdx);
							if (!visited.has(metro)) {
								visited.add(metro);
								queue.push(metro);
							}
						}
					}
				}

				// Cut segments + segments unreachable from hubs = isolated
				for (let i = 0; i < cable.segments.length; i++) {
					if (cutSegSet.has(i) || !reachableSegs.has(i)) {
						isolatedSegIds.add(`${cableId}:${i}`);
					}
				}
			}

			// Helper: for a feature, find which logical segment its midpoint is closest to
			const nearestSegment = (c: Cable, coords: Position[]): number => {
				const mid = coords[Math.floor(coords.length / 2)];
				let bestSeg = 0;
				let bestDist = Number.MAX_VALUE;
				for (let i = 0; i < c.segments.length; i++) {
					const seg = c.segments[i];
					const from = metrosById.get(seg.from);
					const to = metrosById.get(seg.to);
					if (!from || !to) continue;
					const d =
						(mid[0] - (from.lng + to.lng) / 2) ** 2 + (mid[1] - (from.lat + to.lat) / 2) ** 2;
					if (d < bestDist) {
						bestDist = d;
						bestSeg = i;
					}
				}
				return bestSeg;
			};

			const cableFeatures = cables.flatMap((c) => {
				const baseProps = { ...(c.path.properties ?? {}), cableId: c.id, cable: c };

				// User segment cuts: split path visually, mark isolated fragments red
				const cableCuts = cutsByCable.get(c.id);
				if (cableCuts && cableCuts.length > 0) {
					const features = splitCablePath(
						{ ...c.path, properties: baseProps } as Feature<LineString | MultiLineString>,
						cableCuts,
					);
					for (const f of features) {
						const props = f.properties as Record<string, unknown> | null;
						if (!props?.severed) continue;
						const coords = (f.geometry as { coordinates: Position[] }).coordinates;
						props.severed = isolatedSegIds.has(`${c.id}:${nearestSegment(c, coords)}`);
					}
					return features;
				}

				// Scenario/chokepoint cuts: no visual split, but mark isolated segments
				if (cutCableIds.has(c.id)) {
					const geom = c.path.geometry;
					const lines: Position[][] =
						geom.type === "MultiLineString" ? geom.coordinates : [geom.coordinates];
					// Render each line of the MultiLineString separately so branches
					// can be colored independently
					return lines
						.filter((l) => l.length >= 2)
						.map((coords) => ({
							type: "Feature" as const,
							properties: {
								...baseProps,
								severed: isolatedSegIds.has(`${c.id}:${nearestSegment(c, coords)}`),
							},
							geometry: { type: "LineString" as const, coordinates: coords },
						}));
				}

				return [{ ...c.path, properties: { ...baseProps, severed: false } }];
			});

			result.push(
				new GeoJsonLayer({
					id: "cables",
					data: cableFeatures,
					getLineColor: (d: { properties: { cable: Cable; severed?: boolean } }) => {
						const cable = d.properties.cable;
						if (d.properties.severed) return CUT_COLOR;
						if (cable.id === selectedCableId)
							return [147, 197, 253, 220] as [number, number, number, number];
						if (cable.id === hoveredCableId)
							return [147, 197, 253, 160] as [number, number, number, number];
						return cableColor(cable.designCapacityTbps);
					},
					getLineWidth: (d: { properties: { cable: Cable } }) =>
						cableWidthScale(d.properties.cable.designCapacityTbps),
					lineWidthUnits: "pixels" as const,
					lineWidthMinPixels: 1,
					pickable: true,
					autoHighlight: true,
					highlightColor: [147, 197, 253, 140],
					onClick: (info: {
						object?: { properties: { cable: Cable } };
						coordinate?: number[];
					}) => {
						if (info.object) {
							lastDeckClickTime.current = Date.now();
							const cable = info.object.properties.cable;
							if (cutMode && info.coordinate && info.coordinate.length >= 2) {
								// In cut mode: snap the cut point to the cable path
								const clickLng = info.coordinate[0];
								const clickLat = info.coordinate[1];
								const [snapLng, snapLat] = snapToCablePath(cable.path.geometry, clickLat, clickLng);
								// Find the nearest logical segment (metro-to-metro)
								let bestSeg = 0;
								let bestDist = Number.MAX_VALUE;
								for (let i = 0; i < cable.segments.length; i++) {
									const seg = cable.segments[i];
									const from = metrosById.get(seg.from);
									const to = metrosById.get(seg.to);
									if (!from || !to) continue;
									const midLat = (from.lat + to.lat) / 2;
									const midLng = (from.lng + to.lng) / 2;
									const d = haversineKm(snapLat, snapLng, midLat, midLng);
									if (d < bestDist) {
										bestDist = d;
										bestSeg = i;
									}
								}
								addCut({
									id: `seg-${cable.id}-${bestSeg}-${Date.now()}`,
									type: "segment",
									lat: snapLat,
									lng: snapLng,
									cableId: cable.id,
									segmentIndex: bestSeg,
									affectedSegmentIds: [`${cable.id}:${bestSeg}`],
								});
							} else {
								selectCable(cable.id);
								selectMetro(null);
								const bounds = cableBounds(cable, metrosById);
								if (bounds) flyToBounds(bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat);
							}
						}
					},
					onHover: (info: { object?: { properties: { cable: Cable } } }) => {
						hoverCable(info.object?.properties.cable.id ?? null);
					},
					updateTriggers: {
						getLineColor: [affectedSegIds, hoveredCableId, selectedCableId],
						getData: [cuts, affectedSegIds],
					},
				}),
			);
		}

		if (terrestrial.length > 0) {
			const metrosMap = new Map(metros.map((m) => [m.id, m]));
			const terrData = terrestrial
				.map((t) => {
					const from = metrosMap.get(t.from);
					const to = metrosMap.get(t.to);
					if (!from || !to) return null;
					return {
						path: [
							[from.lng, from.lat],
							[to.lng, to.lat],
						] as [number, number][],
						edge: t,
					};
				})
				.filter((d): d is NonNullable<typeof d> => d !== null);

			result.push(
				new PathLayer({
					id: "terrestrial",
					data: terrData,
					getPath: (d: { path: [number, number][] }) => d.path,
					getColor: (d: { edge: TerrestrialEdge }) =>
						d.edge.id === selectedTerrestrialId
							? ([34, 211, 238, 220] as [number, number, number, number])
							: TERRESTRIAL_COLOR,
					getWidth: (d: { edge: TerrestrialEdge }) => (d.edge.id === selectedTerrestrialId ? 3 : 1),
					widthUnits: "pixels" as const,
					pickable: true,
					autoHighlight: true,
					highlightColor: [34, 211, 238, 140],
					onClick: (info: { object?: { edge: TerrestrialEdge } }) => {
						if (info.object) {
							lastDeckClickTime.current = Date.now();
							selectTerrestrial(info.object.edge.id);
						}
					},
					updateTriggers: {
						getColor: [selectedTerrestrialId],
						getWidth: [selectedTerrestrialId],
					},
				}),
			);
		}

		if (metros.length > 0) {
			// Base metro dots — never rebuilds for selection changes
			result.push(
				new ScatterplotLayer({
					id: "metros",
					data: metros,
					getPosition: (d: Metro) => [d.lng, d.lat],
					getRadius: (d: Metro) => (d.isHub ? 5 : 3),
					getFillColor: (d: Metro) => {
						if (!simulation?.impacts) {
							return d.isHub ? [96, 165, 250, 120] : [96, 165, 250, 50];
						}
						const impact = simulation.impacts.find((i) => i.metroId === d.id);
						if (!impact) return [96, 165, 250, 40];
						if (impact.isolated) return [239, 68, 68, 255];
						if (impact.bandwidthLossPct > 50) return [245, 158, 11, 230];
						if (impact.bandwidthLossPct > 10) return [253, 224, 71, 180];
						if (impact.bandwidthLossPct > 0) return [96, 165, 250, 120];
						return d.isHub ? [96, 165, 250, 100] : [96, 165, 250, 40];
					},
					radiusUnits: "pixels" as const,
					pickable: true,
					autoHighlight: true,
					highlightColor: [147, 197, 253, 180],
					onClick: (info: { object?: Metro }) => {
						if (info.object) {
							lastDeckClickTime.current = Date.now();
							selectMetro(info.object.id);
							selectCable(null);
						}
					},
					updateTriggers: {
						getFillColor: [simulation],
					},
				}),
			);
		}

		// Selection indicator — separate tiny layer (1 item, instant rebuild)
		const selMetro = selectedMetroId ? metros.find((m) => m.id === selectedMetroId) : null;
		if (selMetro) {
			result.push(
				new ScatterplotLayer({
					id: "metro-selected",
					data: [selMetro],
					getPosition: (d: Metro) => [d.lng, d.lat],
					getRadius: 10,
					getFillColor: [147, 197, 253, 255],
					stroked: true,
					getLineColor: [255, 255, 255, 220],
					getLineWidth: 2,
					lineWidthUnits: "pixels" as const,
					radiusUnits: "pixels" as const,
					pickable: false,
				}),
			);
		}

		// Cut markers — red dots at every cut with valid coordinates
		const visibleCuts = cuts.filter((c) => c.lat !== 0 || c.lng !== 0);
		if (visibleCuts.length > 0) {
			result.push(
				new ScatterplotLayer({
					id: "cut-breaks",
					data: visibleCuts,
					getPosition: (d: CutLocation) => [d.lng, d.lat],
					getRadius: 5,
					radiusUnits: "pixels" as const,
					getFillColor: [239, 68, 68, 240],
					stroked: true,
					getLineColor: [255, 255, 255, 200],
					getLineWidth: 1.5,
					lineWidthUnits: "pixels" as const,
					pickable: true,
					onClick: (info: { object?: CutLocation }) => {
						if (info.object) {
							lastDeckClickTime.current = Date.now();
							selectPointCut(info.object.id);
						}
					},
				}),
			);
		}

		return result;
	}, [
		cables,
		metros,
		terrestrial,
		cuts,
		cutCableIds,
		hoveredCableId,
		selectedCableId,
		selectedMetroId,
		selectedTerrestrialId,
		selectCable,
		selectMetro,
		selectTerrestrial,
		selectPointCut,
		hoverCable,
		simulation,
		metrosById,
		flyToBounds,
		cutMode,
		addCut,
		affectedSegIds,
	]);

	const resetView = () => {
		const map = mapRef.current;
		if (!map) return;
		const center = map.getCenter();
		map.flyTo({
			center: [center.lng, center.lat],
			zoom: 2,
			pitch: 0,
			bearing: 0,
			duration: 1200,
		});
	};

	return (
		<>
			{/* Recenter button — repositions above card on mobile when one is showing */}
			<button
				type="button"
				onClick={resetView}
				className={`
					absolute z-30 md:hidden
					w-10 h-10 rounded-xl
					bg-surface/80 backdrop-blur-sm border border-border/50
					flex items-center justify-center
					text-text-secondary hover:text-text-primary
					active:bg-border/50
					shadow-lg shadow-black/20
					left-3
					${sheetDragging ? "" : "transition-all duration-300 ease-out"}
					${mobileSheetHeight > 55 ? "opacity-0 pointer-events-none" : ""}
				`}
				style={{
					bottom: `calc(${mobileSheetHeight}dvh + ${mobileCardHeight > 0 ? mobileCardHeight + 20 : 8}px)`,
				}}
				title="Reset map view"
			>
				<svg
					width="18"
					height="18"
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<title>Recenter map</title>
					<circle cx="8" cy="8" r="3" />
					<line x1="8" y1="1" x2="8" y2="3" />
					<line x1="8" y1="13" x2="8" y2="15" />
					<line x1="1" y1="8" x2="3" y2="8" />
					<line x1="13" y1="8" x2="15" y2="8" />
				</svg>
			</button>

			{/* Desktop bottom-left button bar — consistent sizing and spacing */}
			<div className="absolute z-30 hidden md:flex bottom-4 left-4 items-center gap-2">
				{/* Recenter */}
				<button
					type="button"
					onClick={resetView}
					className="
						w-10 h-10 rounded-xl
						bg-surface/80 backdrop-blur-sm border border-border/50
						flex items-center justify-center
						text-text-secondary hover:text-text-primary
						active:bg-border/50 transition-colors
						shadow-lg shadow-black/20
					"
					title="Reset map view"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<title>Recenter map</title>
						<circle cx="8" cy="8" r="3" />
						<line x1="8" y1="1" x2="8" y2="3" />
						<line x1="8" y1="13" x2="8" y2="15" />
						<line x1="1" y1="8" x2="3" y2="8" />
						<line x1="13" y1="8" x2="15" y2="8" />
					</svg>
				</button>

				{/* Cut mode toggle */}
				<button
					type="button"
					onClick={toggleCutMode}
					className={`
						h-10 px-3.5 rounded-xl
						backdrop-blur-sm border
						flex items-center gap-2 text-xs font-medium
						transition-all shadow-lg shadow-black/20
						${
							cutMode
								? "bg-cable-cut/20 border-cable-cut/50 text-cable-cut shadow-[0_0_12px_rgba(239,68,68,0.2)]"
								: "bg-surface/80 border-border/50 text-text-secondary hover:text-text-primary"
						}
					`}
					title="Toggle cut mode (C)"
				>
					<svg
						width="14"
						height="14"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
					>
						<title>Cut mode</title>
						<line x1="4" y1="4" x2="12" y2="12" />
						<line x1="4" y1="12" x2="12" y2="4" />
						<circle cx="4" cy="4" r="2" />
						<circle cx="4" cy="12" r="2" />
					</svg>
					{cutMode ? "Exit Cut" : "Cut Mode"}
				</button>

				{/* Undo */}
				{hasCuts && (
					<button
						type="button"
						onClick={() => {
							const state = useStore.getState();
							if (state.cuts.length > 0) removeCut(state.cuts[state.cuts.length - 1].id);
						}}
						className="
							h-10 px-3.5 rounded-xl
							bg-surface/80 backdrop-blur-sm border border-border/50
							flex items-center gap-2
							text-text-secondary text-xs font-medium
							hover:bg-border/40 active:bg-border/60 transition-colors
							shadow-lg shadow-black/20
						"
						title="Undo last cut (Ctrl+Z)"
					>
						Undo
					</button>
				)}

				{/* Reset */}
				{hasCuts && (
					<button
						type="button"
						onClick={resetCuts}
						className="
							h-10 px-3.5 rounded-xl
							bg-surface/80 backdrop-blur-sm border border-border/50
							flex items-center gap-2
							text-cable-cut text-xs font-medium
							hover:bg-cable-cut/10 active:bg-cable-cut/20 transition-colors
							shadow-lg shadow-black/20
						"
					>
						Reset
					</button>
				)}
			</div>

			<div className="absolute inset-0">
				<MapGL
					ref={mapRef}
					initialViewState={INITIAL_VIEW}
					mapStyle={DARK_BASEMAP}
					style={{ width: "100%", height: "100%", cursor: cutMode ? "crosshair" : undefined }}
					attributionControl={false}
					onClick={() => {
						// If Deck.gl handled this click, don't also deselect
						if (Date.now() - lastDeckClickTime.current < 100) return;
						if (cutMode) return; // empty ocean click in cut mode — ignore
						// Normal mode: deselect everything
						selectCable(null);
						selectMetro(null);
						selectTerrestrial(null);
					}}
				>
					<DeckGLOverlay layers={layers} />
				</MapGL>
			</div>
		</>
	);
}

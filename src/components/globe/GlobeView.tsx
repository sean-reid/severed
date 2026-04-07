import type { Layer } from "@deck.gl/core";
import { GeoJsonLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { useEffect, useMemo, useRef } from "react";
import { Map as MapGL, useControl } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import type { Cable, Metro, TerrestrialEdge } from "../../data/types";
import { useSimulation } from "../../engine/useSimulation";
import { useStore } from "../../state/store";
import { CUT_COLOR, TERRESTRIAL_COLOR, cableColor, cableWidthScale } from "../../utils/colors";
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
	const mapRef = useRef<MapRef>(null);
	const lastDeckClickTime = useRef(0);

	useSimulation();

	// Handle flyTo requests from the store
	useEffect(() => {
		if (flyTo && mapRef.current) {
			mapRef.current.flyTo({
				center: [flyTo.lng, flyTo.lat],
				zoom: flyTo.zoom,
				duration: 1500,
			});
			clearFlyTo();
		}
	}, [flyTo, clearFlyTo]);

	// Resolved affected cable IDs — from simulation engine + direct cable cuts
	const cutCableIds = useMemo(() => {
		const ids = new Set<string>();
		// From simulation (resolves chokepoint polygon → segment intersection)
		if (simulation?.affectedEdgeIds) {
			for (const edgeId of simulation.affectedEdgeIds) {
				const cableId = edgeId.split(":")[0];
				if (cableId !== "terr") ids.add(cableId);
			}
		}
		// From direct cable cuts (Cut button)
		for (const cut of cuts) {
			for (const segId of cut.affectedSegmentIds) {
				const cableId = segId.split(":")[0];
				if (cableId !== "terr") ids.add(cableId);
			}
		}
		return ids;
	}, [simulation, cuts]);

	const layers = useMemo((): Layer[] => {
		const result: Layer[] = [];

		if (cables.length > 0) {
			result.push(
				new GeoJsonLayer({
					id: "cables",
					data: cables.map((c) => ({
						...c.path,
						properties: { ...(c.path.properties ?? {}), cableId: c.id, cable: c },
					})),
					getLineColor: (d: { properties: { cable: Cable } }) => {
						const cable = d.properties.cable;
						if (cutCableIds.has(cable.id)) return CUT_COLOR;
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
					onClick: (info: { object?: { properties: { cable: Cable } } }) => {
						if (info.object) {
							lastDeckClickTime.current = Date.now();
							selectCable(info.object.properties.cable.id);
							selectMetro(null);
						}
					},
					onHover: (info: { object?: { properties: { cable: Cable } } }) => {
						hoverCable(info.object?.properties.cable.id ?? null);
					},
					updateTriggers: {
						getLineColor: [cutCableIds, hoveredCableId, selectedCableId],
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

		return result;
	}, [
		cables,
		metros,
		terrestrial,
		cutCableIds,
		hoveredCableId,
		selectedCableId,
		selectedMetroId,
		selectedTerrestrialId,
		selectCable,
		selectMetro,
		selectTerrestrial,
		hoverCable,
		simulation,
	]);

	const resetView = () => {
		mapRef.current?.flyTo({
			center: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
			zoom: INITIAL_VIEW.zoom,
			pitch: 0,
			bearing: 0,
			duration: 1200,
		});
	};

	return (
		<>
			{/* Recenter button — hidden on mobile when cable card is showing */}
			<button
				type="button"
				onClick={resetView}
				className={`
					absolute z-30
					w-12 h-12 rounded-2xl
					bg-surface/80 backdrop-blur-sm border border-border/50
					flex items-center justify-center
					text-text-secondary hover:text-text-primary
					active:bg-border/50 transition-colors
					shadow-lg shadow-black/20
					md:bottom-4 md:left-4 max-md:left-4
					${selectedCableId ? "max-md:hidden" : ""}
				`}
				style={{
					bottom:
						typeof window !== "undefined" && window.innerWidth < 768
							? `calc(${mobileSheetHeight}dvh + 8px)`
							: undefined,
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

			{/* Desktop reset button — next to crosshairs */}
			{hasCuts && (
				<button
					type="button"
					onClick={resetCuts}
					className="
						absolute z-30 hidden md:flex
						bottom-4 left-[4.5rem]
						h-12 px-4 rounded-2xl
						bg-surface/80 backdrop-blur-sm border border-border/50
						items-center gap-2
						text-cable-cut text-xs font-medium
						hover:bg-cable-cut/10 active:bg-cable-cut/20 transition-colors
						shadow-lg shadow-black/20
					"
				>
					Reset
				</button>
			)}

			<div className="absolute inset-0">
				<MapGL
					ref={mapRef}
					initialViewState={INITIAL_VIEW}
					mapStyle={DARK_BASEMAP}
					style={{ width: "100%", height: "100%" }}
					attributionControl={false}
					onClick={() => {
						// Deck.gl onClick sets a timestamp. If it fired within
						// the last 100ms, a layer handled this click — don't deselect.
						if (Date.now() - lastDeckClickTime.current < 100) return;
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

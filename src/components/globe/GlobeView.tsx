import { useEffect, useMemo, useRef } from "react";
import { Map as MapGL, useControl } from "react-map-gl/maplibre";
import type { MapRef } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer, PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import { useStore } from "../../state/store";
import { useSimulation } from "../../engine/useSimulation";
import { cableColor, cableWidthScale, CUT_COLOR, TERRESTRIAL_COLOR } from "../../utils/colors";
import type { Cable, Metro } from "../../data/types";
import "maplibre-gl/dist/maplibre-gl.css";

function DeckGLOverlay(props: { layers: Layer[] }) {
	const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ interleaved: false }));
	overlay.setProps({ layers: props.layers });
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
	const flyTo = useStore((s) => s.flyTo);
	const clearFlyTo = useStore((s) => s.clearFlyTo);
	const selectedMetroId = useStore((s) => s.selectedMetroId);
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

	// biome-ignore lint: complex layer construction
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
					pickable: true,
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
						from: [from.lng, from.lat] as [number, number],
						to: [to.lng, to.lat] as [number, number],
					};
				})
				.filter((d): d is NonNullable<typeof d> => d !== null);

			result.push(
				new PathLayer({
					id: "terrestrial",
					data: terrData,
					getPath: (d: { from: [number, number]; to: [number, number] }) => [d.from, d.to],
					getColor: TERRESTRIAL_COLOR,
					getWidth: 1,
					widthUnits: "pixels" as const,
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
		selectCable,
		selectMetro,
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
			{/* Recenter button — 48px touch target, above bottom sheet on mobile */}
			<button
				type="button"
				onClick={resetView}
				className="
					absolute z-30
					w-12 h-12 rounded-2xl
					bg-surface/80 backdrop-blur-sm border border-border/50
					flex items-center justify-center
					text-text-secondary hover:text-text-primary
					active:bg-border/50 transition-colors
					shadow-lg shadow-black/20

					md:bottom-4 md:left-4
					max-md:bottom-[calc(40dvh+8px)] max-md:left-4
				"
				title="Reset map view"
			>
				<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
					<circle cx="8" cy="8" r="3" />
					<line x1="8" y1="1" x2="8" y2="3" />
					<line x1="8" y1="13" x2="8" y2="15" />
					<line x1="1" y1="8" x2="3" y2="8" />
					<line x1="13" y1="8" x2="15" y2="8" />
				</svg>
			</button>

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
				}}
			>
				<DeckGLOverlay layers={layers} />
			</MapGL>
			</div>
		</>
	);
}

import { create } from "zustand";
import type {
	AppData,
	Cable,
	Chokepoint,
	CutLocation,
	Metro,
	MetroImpact,
	Scenario,
	TerrestrialEdge,
} from "../data/types";
import { haversineKm } from "../utils/geo";
import { snapToCablePath } from "../utils/projectOnPath";

interface SimulationState {
	impacts: MetroImpact[];
	totalCapacityRemovedTbps: number;
	metrosAffected: number;
	cablesAffected: number;
	affectedEdgeIds: string[];
}

interface StoreState {
	// Data
	cables: Cable[];
	cablesById: Map<string, Cable>;
	metros: Metro[];
	metrosById: Map<string, Metro>;
	terrestrial: TerrestrialEdge[];
	chokepoints: Chokepoint[];
	scenarios: Scenario[];

	// Selection
	selectedCableId: string | null;
	hoveredCableId: string | null;
	selectedMetroId: string | null;
	selectedTerrestrialId: string | null;

	// Cuts
	cuts: CutLocation[];
	activeScenarioId: string | null;

	// Simulation
	simulation: SimulationState | null;
	simulating: boolean;

	// Cut mode
	cutMode: boolean;
	selectedPointCutId: string | null;

	// UI
	panelOpen: boolean;
	sidebarOpen: boolean;
	mobileSheetHeight: number; // dvh units
	mobileSheetDragging: boolean;
	mobileCardHeight: number; // px, height of the currently visible floating card

	// Camera
	flyTo: { lng: number; lat: number; zoom: number } | null;
	fitBounds: { minLng: number; minLat: number; maxLng: number; maxLat: number } | null;

	// Actions
	initData: (data: AppData) => void;
	selectCable: (id: string | null) => void;
	hoverCable: (id: string | null) => void;
	selectMetro: (id: string | null) => void;
	selectTerrestrial: (id: string | null) => void;
	flyToLocation: (lng: number, lat: number, zoom?: number) => void;
	flyToBounds: (minLng: number, minLat: number, maxLng: number, maxLat: number) => void;
	clearFlyTo: () => void;
	addCut: (cut: CutLocation) => void;
	removeCut: (cutId: string) => void;
	toggleCutMode: () => void;
	selectPointCut: (id: string | null) => void;
	applyScenario: (scenarioId: string) => void;
	resetCuts: () => void;
	setSimulation: (sim: SimulationState) => void;
	setSimulating: (v: boolean) => void;
	togglePanel: () => void;
	toggleSidebar: () => void;
	setMobileSheetHeight: (h: number) => void;
	setMobileSheetDragging: (v: boolean) => void;
	setMobileCardHeight: (h: number) => void;
}

export const useStore = create<StoreState>((set) => ({
	// Data
	cables: [],
	cablesById: new Map(),
	metros: [],
	metrosById: new Map(),
	terrestrial: [],
	chokepoints: [],
	scenarios: [],

	// Selection
	selectedCableId: null,
	hoveredCableId: null,
	selectedMetroId: null,
	selectedTerrestrialId: null,

	// Cuts
	cuts: [],
	activeScenarioId: null,
	cutMode: false,
	selectedPointCutId: null,

	// Simulation
	simulation: null,
	simulating: false,

	// UI
	panelOpen: true,
	sidebarOpen: typeof window !== "undefined" && window.innerWidth >= 768,
	mobileSheetHeight: 15,
	mobileSheetDragging: false,
	mobileCardHeight: 0,

	// Camera
	flyTo: null,
	fitBounds: null,

	// Actions
	initData: (data) =>
		set({
			cables: data.cables,
			cablesById: new Map(data.cables.map((c) => [c.id, c])),
			metros: data.metros,
			metrosById: new Map(data.metros.map((m) => [m.id, m])),
			terrestrial: data.terrestrial,
			chokepoints: data.chokepoints,
			scenarios: data.scenarios,
		}),

	selectCable: (id) => set({ selectedCableId: id, selectedTerrestrialId: null }),
	hoverCable: (id) => set({ hoveredCableId: id }),
	selectMetro: (id) => set({ selectedMetroId: id, selectedTerrestrialId: null }),
	selectTerrestrial: (id) => set({ selectedTerrestrialId: id, selectedCableId: null }),
	flyToLocation: (lng, lat, zoom = 5) => set({ flyTo: { lng, lat, zoom } }),
	flyToBounds: (minLng, minLat, maxLng, maxLat) =>
		set({ fitBounds: { minLng, minLat, maxLng, maxLat }, flyTo: null }),
	clearFlyTo: () => set({ flyTo: null, fitBounds: null }),

	addCut: (cut) =>
		set((s) => ({
			cuts: [...s.cuts, cut],
			activeScenarioId: null,
		})),

	removeCut: (cutId) =>
		set((s) => ({
			cuts: s.cuts.filter((c) => c.id !== cutId),
			selectedPointCutId: s.selectedPointCutId === cutId ? null : s.selectedPointCutId,
		})),

	toggleCutMode: () =>
		set((s) => ({
			cutMode: !s.cutMode,
			selectedCableId: s.cutMode ? s.selectedCableId : null,
			selectedMetroId: s.cutMode ? s.selectedMetroId : null,
			selectedTerrestrialId: s.cutMode ? s.selectedTerrestrialId : null,
			selectedPointCutId: null,
		})),

	selectPointCut: (id) =>
		set({ selectedPointCutId: id, selectedCableId: null, selectedMetroId: null }),

	applyScenario: (scenarioId) =>
		set((s) => {
			const scenario = s.scenarios.find((sc) => sc.id === scenarioId);
			if (!scenario) return s;

			const newCuts: CutLocation[] = [];
			for (const cutLoc of scenario.cutLocations) {
				if (cutLoc.type === "chokepoint" && cutLoc.id) {
					const chokepoint = s.chokepoints.find((c) => c.id === cutLoc.id);
					if (!chokepoint) continue;
					const coords = chokepoint.polygon.coordinates[0];
					const centerLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
					const centerLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
					newCuts.push({
						id: `scenario-${scenarioId}-${cutLoc.id}`,
						type: "chokepoint",
						lat: centerLat,
						lng: centerLng,
						chokepointId: cutLoc.id,
						affectedSegmentIds: [],
					});
				} else if (cutLoc.type === "cable" && cutLoc.cableIds) {
					// Cut specific cables -- optionally only segments near the cut location
					const hasCutLocation = cutLoc.cutLat != null && cutLoc.cutLng != null;
					const cutRadius = cutLoc.cutRadius ?? 500;

					for (const cableId of cutLoc.cableIds) {
						const cable = s.cablesById.get(cableId);
						if (!cable) continue;

						let segmentIds: string[];
						if (hasCutLocation) {
							// Location-based: only sever segments near the cut point
							segmentIds = [];
							for (let i = 0; i < cable.segments.length; i++) {
								const seg = cable.segments[i];
								const from = s.metrosById.get(seg.from);
								const to = s.metrosById.get(seg.to);
								if (!from || !to) continue;
								const midLat = (from.lat + to.lat) / 2;
								let midLng = (from.lng + to.lng) / 2;
								if (Math.abs(from.lng - to.lng) > 180) {
									midLng = midLng > 0 ? midLng - 180 : midLng + 180;
								}
								const dist = haversineKm(cutLoc.cutLat ?? 0, cutLoc.cutLng ?? 0, midLat, midLng);
								if (dist < cutRadius) {
									segmentIds.push(`${cableId}:${i}`);
								}
							}
							// Fallback: if no segments matched geometry, cut all
							if (segmentIds.length === 0) {
								segmentIds = cable.segments.map((_s, i) => `${cableId}:${i}`);
							}
						} else {
							// No cut location: cut all segments (legacy behavior)
							segmentIds = cable.segments.map((_s, i) => `${cableId}:${i}`);
						}

						// Snap cut marker to the cable's GeoJSON path
						const [snapLng, snapLat] =
							hasCutLocation && cable.path?.geometry
								? snapToCablePath(cable.path.geometry, cutLoc.cutLat ?? 0, cutLoc.cutLng ?? 0)
								: [cutLoc.cutLng ?? 0, cutLoc.cutLat ?? 0];

						newCuts.push({
							id: `scenario-${scenarioId}-cable-${cableId}`,
							type: "point",
							lat: snapLat,
							lng: snapLng,
							affectedSegmentIds: segmentIds,
						});
					}
				} else if (cutLoc.type === "point" && cutLoc.lat != null && cutLoc.lng != null) {
					newCuts.push({
						id: `scenario-${scenarioId}-point-${cutLoc.lat}-${cutLoc.lng}`,
						type: "point",
						lat: cutLoc.lat,
						lng: cutLoc.lng,
						radius: 150,
						affectedSegmentIds: [],
					});
				}
			}

			// Don't fly now -- fitBounds will fire when simulation completes
			return {
				cuts: newCuts,
				activeScenarioId: scenarioId,
				simulation: null,
				selectedCableId: null,
			};
		}),

	resetCuts: () =>
		set({
			cuts: [],
			activeScenarioId: null,
			simulation: null,
			selectedCableId: null,
		}),

	setSimulation: (sim) =>
		set((s) => {
			// After scenario simulation completes, fit map to show all affected cables
			let fitBounds = null;
			if (s.activeScenarioId && sim.affectedEdgeIds.length > 0) {
				let minLng = 180;
				let maxLng = -180;
				let minLat = 90;
				let maxLat = -90;
				const allLngs: number[] = [];
				const seenCables = new Set<string>();
				for (const edgeId of sim.affectedEdgeIds) {
					const cableId = edgeId.split(":")[0];
					if (cableId === "terr" || seenCables.has(cableId)) continue;
					seenCables.add(cableId);
					const cable = s.cablesById.get(cableId);
					if (!cable) continue;
					for (const seg of cable.segments) {
						const from = s.metrosById.get(seg.from);
						const to = s.metrosById.get(seg.to);
						if (from) {
							allLngs.push(from.lng);
							minLng = Math.min(minLng, from.lng);
							maxLng = Math.max(maxLng, from.lng);
							minLat = Math.min(minLat, from.lat);
							maxLat = Math.max(maxLat, from.lat);
						}
						if (to) {
							allLngs.push(to.lng);
							minLng = Math.min(minLng, to.lng);
							maxLng = Math.max(maxLng, to.lng);
							minLat = Math.min(minLat, to.lat);
							maxLat = Math.max(maxLat, to.lat);
						}
					}
				}
				if (maxLng > minLng) {
					const span = maxLng - minLng;
					if (span > 180) {
						// Dateline-crossing -- use shifted bounds for Pacific-centered view
						const shifted = allLngs.map((lng) => (lng < 0 ? lng + 360 : lng));
						const sMin = Math.min(...shifted);
						const sMax = Math.max(...shifted);
						fitBounds = {
							minLng: sMin > 180 ? sMin - 360 : sMin,
							minLat,
							maxLng: sMax > 180 ? sMax - 360 : sMax,
							maxLat,
						};
					} else {
						fitBounds = { minLng, minLat, maxLng, maxLat };
					}
				}
			}
			return { simulation: sim, simulating: false, fitBounds };
		}),
	setSimulating: (v) => set({ simulating: v }),
	togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
	toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
	setMobileSheetHeight: (h) => set({ mobileSheetHeight: h }),
	setMobileSheetDragging: (v) => set({ mobileSheetDragging: v }),
	setMobileCardHeight: (h) => set({ mobileCardHeight: h }),
}));

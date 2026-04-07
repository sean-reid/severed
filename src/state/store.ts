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

	// UI
	panelOpen: boolean;
	sidebarOpen: boolean;
	mobileSheetHeight: number; // dvh units
	mobileSheetDragging: boolean;
	mobileCardHeight: number; // px, height of the currently visible floating card

	// Camera
	flyTo: { lng: number; lat: number; zoom: number } | null;

	// Actions
	initData: (data: AppData) => void;
	selectCable: (id: string | null) => void;
	hoverCable: (id: string | null) => void;
	selectMetro: (id: string | null) => void;
	selectTerrestrial: (id: string | null) => void;
	flyToLocation: (lng: number, lat: number, zoom?: number) => void;
	clearFlyTo: () => void;
	addCut: (cut: CutLocation) => void;
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
	clearFlyTo: () => set({ flyTo: null }),

	addCut: (cut) =>
		set((s) => ({
			cuts: [...s.cuts, cut],
			activeScenarioId: null,
		})),

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

			// Fly to the center of the first cut location
			const firstCut = newCuts[0];
			const flyTo = firstCut ? { lng: firstCut.lng, lat: firstCut.lat, zoom: 4 } : null;

			return {
				cuts: newCuts,
				activeScenarioId: scenarioId,
				simulation: null,
				selectedCableId: null,
				flyTo,
			};
		}),

	resetCuts: () =>
		set({
			cuts: [],
			activeScenarioId: null,
			simulation: null,
			selectedCableId: null,
		}),

	setSimulation: (sim) => set({ simulation: sim, simulating: false }),
	setSimulating: (v) => set({ simulating: v }),
	togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
	toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
	setMobileSheetHeight: (h) => set({ mobileSheetHeight: h }),
	setMobileSheetDragging: (v) => set({ mobileSheetDragging: v }),
	setMobileCardHeight: (h) => set({ mobileCardHeight: h }),
}));

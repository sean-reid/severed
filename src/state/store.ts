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

	// Cuts
	cuts: CutLocation[];
	activeScenarioId: string | null;

	// Simulation
	simulation: SimulationState | null;
	simulating: boolean;

	// UI
	panelOpen: boolean;
	sidebarOpen: boolean;

	// Camera
	flyTo: { lng: number; lat: number; zoom: number } | null;

	// Actions
	initData: (data: AppData) => void;
	selectCable: (id: string | null) => void;
	hoverCable: (id: string | null) => void;
	selectMetro: (id: string | null) => void;
	flyToLocation: (lng: number, lat: number, zoom?: number) => void;
	clearFlyTo: () => void;
	addCut: (cut: CutLocation) => void;
	removeCut: (cutId: string) => void;
	applyScenario: (scenarioId: string) => void;
	resetCuts: () => void;
	setSimulation: (sim: SimulationState) => void;
	setSimulating: (v: boolean) => void;
	togglePanel: () => void;
	toggleSidebar: () => void;
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

	// Cuts
	cuts: [],
	activeScenarioId: null,

	// Simulation
	simulation: null,
	simulating: false,

	// UI
	panelOpen: true,
	sidebarOpen: typeof window !== "undefined" && window.innerWidth >= 768,

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

	selectCable: (id) => set({ selectedCableId: id }),
	hoverCable: (id) => set({ hoveredCableId: id }),
	selectMetro: (id) => set({ selectedMetroId: id }),
	flyToLocation: (lng, lat, zoom = 5) => set({ flyTo: { lng, lat, zoom } }),
	clearFlyTo: () => set({ flyTo: null }),

	addCut: (cut) =>
		set((s) => ({
			cuts: [...s.cuts, cut],
			activeScenarioId: null,
		})),

	removeCut: (cutId) =>
		set((s) => ({
			cuts: s.cuts.filter((c) => c.id !== cutId),
		})),

	applyScenario: (scenarioId) =>
		set((s) => {
			const scenario = s.scenarios.find((sc) => sc.id === scenarioId);
			if (!scenario) return s;
			// Scenarios set cuts via the engine — we just mark the active scenario
			return { activeScenarioId: scenarioId };
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
}));

import { useCallback, useEffect, useRef } from "react";
import { useStore } from "../state/store";
import type { SimulationInput, SimulationOutput } from "./simulation";

/**
 * Hook that manages the simulation Web Worker.
 * Automatically re-runs simulation when cuts change.
 */
export function useSimulation() {
	const workerRef = useRef<Worker | null>(null);
	const cables = useStore((s) => s.cables);
	const metros = useStore((s) => s.metros);
	const terrestrial = useStore((s) => s.terrestrial);
	const chokepoints = useStore((s) => s.chokepoints);
	const cuts = useStore((s) => s.cuts);
	const activeScenarioId = useStore((s) => s.activeScenarioId);
	const scenarios = useStore((s) => s.scenarios);
	const setSimulation = useStore((s) => s.setSimulation);
	const setSimulating = useStore((s) => s.setSimulating);

	const activeScenario = activeScenarioId ? scenarios.find((s) => s.id === activeScenarioId) : null;

	// Initialize worker
	useEffect(() => {
		const worker = new Worker(new URL("./worker.ts", import.meta.url), {
			type: "module",
		});

		worker.onmessage = (e: MessageEvent<SimulationOutput>) => {
			setSimulation(e.data);
		};

		worker.onerror = (e) => {
			console.error("Simulation worker error:", e);
			setSimulating(false);
		};

		workerRef.current = worker;

		return () => {
			worker.terminate();
		};
	}, [setSimulation, setSimulating]);

	// Run simulation when cuts change
	useEffect(() => {
		if (!workerRef.current || metros.length === 0) return;

		setSimulating(true);
		const input: SimulationInput = {
			metros,
			cables,
			terrestrial,
			chokepoints,
			cuts,
			historicalDate: activeScenario?.historicalDate,
		};
		workerRef.current.postMessage(input);
	}, [cuts, metros, cables, terrestrial, chokepoints, setSimulating, activeScenario]);

	// Manual trigger
	const runNow = useCallback(() => {
		if (!workerRef.current || metros.length === 0) return;
		setSimulating(true);
		const input: SimulationInput = {
			metros,
			cables,
			terrestrial,
			chokepoints,
			cuts,
			historicalDate: activeScenario?.historicalDate,
		};
		workerRef.current.postMessage(input);
	}, [metros, cables, terrestrial, chokepoints, cuts, setSimulating, activeScenario]);

	return { runNow };
}

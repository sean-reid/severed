import type { SimulationInput, SimulationOutput } from "./simulation";
import { runSimulation } from "./simulation";

/**
 * Web Worker entry point for the graph simulation engine.
 * Receives SimulationInput via postMessage, runs simulation, posts back SimulationOutput.
 */
self.onmessage = (e: MessageEvent<SimulationInput>) => {
	const result: SimulationOutput = runSimulation(e.data);
	self.postMessage(result);
};

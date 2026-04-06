import { useCallback } from "react";
import { useStore } from "../../state/store";
import type { CutLocation, Scenario } from "../../data/types";

/**
 * Mobile-only floating scenario chips.
 * Horizontally scrollable row at the top of the screen.
 * Tap a scenario → instant simulation → bottom sheet shows results.
 */
export function MobileScenarioBar() {
	const scenarios = useStore((s) => s.scenarios);
	const chokepoints = useStore((s) => s.chokepoints);
	const activeScenarioId = useStore((s) => s.activeScenarioId);
	const cuts = useStore((s) => s.cuts);
	const addCut = useStore((s) => s.addCut);
	const resetCuts = useStore((s) => s.resetCuts);

	const applyScenario = useCallback(
		(scenario: Scenario) => {
			resetCuts();
			for (const cutLoc of scenario.cutLocations) {
				if (cutLoc.type === "chokepoint" && cutLoc.id) {
					const chokepoint = chokepoints.find((c) => c.id === cutLoc.id);
					if (!chokepoint) continue;
					const coords = chokepoint.polygon.coordinates[0];
					const centerLat = coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
					const centerLng = coords.reduce((sum, c) => sum + c[0], 0) / coords.length;
					const cut: CutLocation = {
						id: `scenario-${scenario.id}-${cutLoc.id}`,
						type: "chokepoint",
						lat: centerLat,
						lng: centerLng,
						chokepointId: cutLoc.id,
						affectedSegmentIds: [],
					};
					addCut(cut);
				}
			}
		},
		[chokepoints, addCut, resetCuts],
	);

	return (
		<div className="absolute top-0 left-0 right-0 z-20 md:hidden safe-top">
			<div className="flex gap-2 px-3 pt-3 pb-2 overflow-x-auto scrollbar-none">
				{/* Reset chip */}
				{cuts.length > 0 && (
					<button
						type="button"
						onClick={resetCuts}
						className="
							flex-none px-4 py-2.5 rounded-full text-xs font-medium
							bg-cable-cut/20 border border-cable-cut/40 text-cable-cut
							active:bg-cable-cut/30 transition-colors whitespace-nowrap
						"
					>
						Reset
					</button>
				)}

				{/* Scenario chips */}
				{scenarios.map((scenario) => (
					<button
						key={scenario.id}
						type="button"
						onClick={() => applyScenario(scenario)}
						className={`
							flex-none px-4 py-2.5 rounded-full text-xs font-medium
							whitespace-nowrap transition-colors
							${
								activeScenarioId === scenario.id
									? "bg-cable-cut/20 border border-cable-cut/50 text-cable-cut"
									: "bg-surface/90 backdrop-blur-sm border border-border text-text-primary active:bg-border/60"
							}
						`}
					>
						{scenario.name}
					</button>
				))}
			</div>
		</div>
	);
}

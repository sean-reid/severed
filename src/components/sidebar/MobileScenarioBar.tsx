import { useCallback } from "react";
import { useStore } from "../../state/store";
import type { CutLocation, Scenario } from "../../data/types";

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
		<div className="absolute top-0 left-0 right-0 z-30 safe-top">
			{/* Scroll container with fade edges */}
			<div className="relative">
				<div className="flex gap-2 px-4 pt-3 pb-2 overflow-x-auto scrollbar-none">
					{cuts.length > 0 && (
						<button
							type="button"
							onClick={resetCuts}
							className="
								flex-none h-11 px-5 rounded-full text-sm font-medium
								bg-cable-cut/20 border border-cable-cut/40 text-cable-cut
								active:bg-cable-cut/30 transition-colors whitespace-nowrap
							"
						>
							Reset
						</button>
					)}
					{scenarios.map((scenario) => (
						<button
							key={scenario.id}
							type="button"
							onClick={() => applyScenario(scenario)}
							className={`
								flex-none h-11 px-5 rounded-full text-sm font-medium
								whitespace-nowrap transition-colors
								${
									activeScenarioId === scenario.id
										? "bg-cable-cut/20 border border-cable-cut/50 text-cable-cut"
										: "bg-surface/90 backdrop-blur-sm border border-border/70 text-text-primary active:bg-border/50"
								}
							`}
						>
							{scenario.name}
						</button>
					))}
					{/* End spacer so last chip isn't flush with edge */}
					<div className="flex-none w-4" />
				</div>
				{/* Right fade to hint more content */}
				<div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg/80 to-transparent pointer-events-none" />
			</div>
		</div>
	);
}

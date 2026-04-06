import { useStore } from "../../state/store";

export function MobileScenarioBar() {
	const scenarios = useStore((s) => s.scenarios);
	const activeScenarioId = useStore((s) => s.activeScenarioId);
	const cuts = useStore((s) => s.cuts);
	const applyScenario = useStore((s) => s.applyScenario);
	const resetCuts = useStore((s) => s.resetCuts);

	return (
		<div className="absolute top-0 left-0 right-0 z-30 safe-top">
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
							onClick={() => applyScenario(scenario.id)}
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
					<div className="flex-none w-4" />
				</div>
				<div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg/80 to-transparent pointer-events-none" />
			</div>
		</div>
	);
}

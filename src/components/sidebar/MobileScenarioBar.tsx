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
					<button
						type="button"
						onClick={() => window.dispatchEvent(new CustomEvent("open-search"))}
						className="
							flex-none w-11 h-11 rounded-full
							bg-surface/90 backdrop-blur-sm border border-border/70
							flex items-center justify-center
							text-text-secondary active:bg-border/50 transition-colors
						"
					>
						<svg
							width="15"
							height="15"
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						>
							<title>Search</title>
							<circle cx="6.5" cy="6.5" r="5" />
							<line x1="10" y1="10" x2="15" y2="15" />
						</svg>
					</button>
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
								whitespace-nowrap transition-colors flex items-center gap-2
								${
									activeScenarioId === scenario.id
										? "bg-cable-cut border-2 border-cable-cut text-white"
										: "bg-surface/90 backdrop-blur-sm border border-border/70 text-text-primary active:bg-border/50"
								}
							`}
						>
							{activeScenarioId === scenario.id && (
								<span className="w-1.5 h-1.5 rounded-full bg-white flex-none" />
							)}
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

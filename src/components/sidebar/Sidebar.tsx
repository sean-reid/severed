import { useCallback } from "react";
import { useStore } from "../../state/store";
import type { CutLocation, Scenario } from "../../data/types";

export function Sidebar() {
	const scenarios = useStore((s) => s.scenarios);
	const chokepoints = useStore((s) => s.chokepoints);
	const cuts = useStore((s) => s.cuts);
	const activeScenarioId = useStore((s) => s.activeScenarioId);
	const selectedCableId = useStore((s) => s.selectedCableId);
	const cablesById = useStore((s) => s.cablesById);
	const addCut = useStore((s) => s.addCut);
	const resetCuts = useStore((s) => s.resetCuts);
	const selectCable = useStore((s) => s.selectCable);
	const sidebarOpen = useStore((s) => s.sidebarOpen);
	const toggleSidebar = useStore((s) => s.toggleSidebar);
	const panelOpen = useStore((s) => s.panelOpen);
	const togglePanel = useStore((s) => s.togglePanel);

	const selectedCable = selectedCableId ? cablesById.get(selectedCableId) : null;

	const applyScenario = useCallback(
		(scenario: Scenario) => {
			// Reset existing cuts
			resetCuts();

			// Apply each cut location from the scenario
			for (const cutLoc of scenario.cutLocations) {
				if (cutLoc.type === "chokepoint" && cutLoc.id) {
					const chokepoint = chokepoints.find((c) => c.id === cutLoc.id);
					if (!chokepoint) continue;
					// Get center of chokepoint polygon for lat/lng
					const coords = chokepoint.polygon.coordinates[0];
					const centerLat =
						coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
					const centerLng =
						coords.reduce((sum, c) => sum + c[0], 0) / coords.length;

					const cut: CutLocation = {
						id: `scenario-${scenario.id}-${cutLoc.id}`,
						type: "chokepoint",
						lat: centerLat,
						lng: centerLng,
						chokepointId: cutLoc.id,
						affectedSegmentIds: [],
					};
					addCut(cut);
				} else if (cutLoc.type === "point" && cutLoc.lat != null && cutLoc.lng != null) {
					const cut: CutLocation = {
						id: `scenario-${scenario.id}-point-${cutLoc.lat}-${cutLoc.lng}`,
						type: "point",
						lat: cutLoc.lat,
						lng: cutLoc.lng,
						radius: 150,
						affectedSegmentIds: [],
					};
					addCut(cut);
				}
			}
		},
		[chokepoints, addCut, resetCuts],
	);

	const cutSelectedCable = useCallback(() => {
		if (!selectedCable) return;
		// Cut the entire cable by adding all its segment IDs
		const segmentIds = selectedCable.segments.map(
			(_seg, i) => `${selectedCable.id}:${i}`,
		);
		const cut: CutLocation = {
			id: `cable-${selectedCable.id}`,
			type: "point",
			lat: 0,
			lng: 0,
			affectedSegmentIds: segmentIds,
		};
		addCut(cut);
		selectCable(null);
	}, [selectedCable, addCut, selectCable]);

	return (
		<>
			{/* Mobile toggle button — 44px min touch target */}
			<button
				type="button"
				onClick={toggleSidebar}
				className="
					absolute top-3 left-3 z-30 md:hidden
					w-11 h-11 rounded-xl bg-surface/95 backdrop-blur-sm
					border border-border flex items-center justify-center
					text-text-primary active:bg-border/60 transition-colors
					shadow-lg shadow-black/30
				"
			>
				{sidebarOpen ? (
					<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
						<line x1="4" y1="4" x2="14" y2="14" />
						<line x1="14" y1="4" x2="4" y2="14" />
					</svg>
				) : (
					<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
						<line x1="3" y1="5" x2="15" y2="5" />
						<line x1="3" y1="9" x2="15" y2="9" />
						<line x1="3" y1="13" x2="15" y2="13" />
					</svg>
				)}
			</button>

			{/* Sidebar panel */}
			<div
				className={`
					absolute left-0 top-0 z-20 flex flex-col overflow-hidden
					bg-surface/90 backdrop-blur-sm border-r border-border
					transition-transform duration-300
					w-52 h-full
					${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
				`}
			>
				{/* Header */}
				<div className="px-4 py-4 border-b border-border">
					<h1 className="font-data text-lg font-bold tracking-widest text-cable-high">
						SEVERED
					</h1>
					<p className="text-[10px] text-text-secondary mt-1 uppercase tracking-wider">
						Submarine Cable Failure Simulator
					</p>
				</div>

				{/* Selected cable info */}
				{selectedCable && (
					<div className="px-4 py-3 border-b border-border bg-border/20">
						<div className="text-xs text-text-secondary uppercase">Selected Cable</div>
						<div className="text-sm font-semibold text-text-primary mt-1">
							{selectedCable.name}
						</div>
						<div className="flex items-center gap-2 mt-1">
							<span className="font-data text-xs text-text-secondary">
								{selectedCable.designCapacityTbps.toFixed(0)} Tbps
							</span>
							<span
								className="text-[9px] px-1.5 py-0.5 rounded-full"
								style={{
									backgroundColor:
										selectedCable.capacityConfidence === "verified"
											? "rgba(96,165,250,0.2)"
											: selectedCable.capacityConfidence === "estimated"
												? "rgba(245,158,11,0.2)"
												: "rgba(148,163,184,0.2)",
									color:
										selectedCable.capacityConfidence === "verified"
											? "#60a5fa"
											: selectedCable.capacityConfidence === "estimated"
												? "#f59e0b"
												: "#94a3b8",
								}}
							>
								{selectedCable.capacityConfidence}
							</span>
						</div>
						<div className="text-[10px] text-text-secondary mt-1">
							RFS {selectedCable.rfsYear} &middot; {selectedCable.owners.join(", ")}
						</div>
						<div className="text-[9px] text-text-secondary/60 mt-1 italic">
							Capacity source: {selectedCable.capacitySource === "heuristic"
								? "RFS-year generation heuristic"
								: selectedCable.capacitySource === "fcc"
									? "FCC cable landing license filing"
									: selectedCable.capacitySource === "press"
										? "Operator press release"
										: selectedCable.capacitySource === "wikipedia"
											? "Wikipedia / industry publication"
											: "Derived from fiber pair count"}
						</div>
						<button
							type="button"
							onClick={cutSelectedCable}
							className="
								mt-3 w-full py-2 rounded-lg
								bg-cable-cut/20 border border-cable-cut/40
								text-cable-cut text-xs font-semibold uppercase tracking-wider
								hover:bg-cable-cut/30 transition-colors
							"
						>
							Cut This Cable
						</button>
					</div>
				)}

				{/* Scenarios */}
				<div className="flex-1 overflow-y-auto px-4 py-3">
					<div className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">
						Scenarios
					</div>
					<div className="flex flex-col gap-1.5">
						{scenarios.map((scenario) => (
							<button
								key={scenario.id}
								type="button"
								onClick={() => applyScenario(scenario)}
								className={`
									text-left px-3 py-2 rounded-lg border transition-colors text-xs
									${
										activeScenarioId === scenario.id
											? "border-cable-cut/60 bg-cable-cut/10 text-cable-cut font-semibold"
											: "border-border/50 text-text-primary hover:bg-border/30"
									}
								`}
							>
								{scenario.name}
							</button>
						))}
					</div>

					{/* Panel toggle */}
					{!panelOpen && (
						<button
							type="button"
							onClick={togglePanel}
							className="
								mt-4 w-full py-2 rounded-lg border border-cable-high/30
								text-cable-high text-[10px] uppercase tracking-wider
								hover:bg-cable-high/10 transition-colors
							"
						>
							Show Results Panel
						</button>
					)}
				</div>

				{/* Reset button */}
				{cuts.length > 0 && (
					<div className="px-4 py-2 border-t border-border">
						<button
							type="button"
							onClick={resetCuts}
							className="
								w-full py-1.5 rounded-lg border border-border
								text-text-secondary text-[10px] uppercase tracking-wider
								hover:bg-border/30 transition-colors
							"
						>
							Reset All Cuts
						</button>
					</div>
				)}

			</div>
		</>
	);
}

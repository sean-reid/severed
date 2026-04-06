import { useStore } from "../../state/store";
import { useCallback, useState } from "react";

export function ImpactPanel() {
	const simulation = useStore((s) => s.simulation);
	const simulating = useStore((s) => s.simulating);
	const cuts = useStore((s) => s.cuts);
	const panelOpen = useStore((s) => s.panelOpen);
	const togglePanel = useStore((s) => s.togglePanel);
	const metrosById = useStore((s) => s.metrosById);
	const selectedMetroId = useStore((s) => s.selectedMetroId);
	const selectMetro = useStore((s) => s.selectMetro);
	const flyToLocation = useStore((s) => s.flyToLocation);
	const selectCable = useStore((s) => s.selectCable);
	const resetCuts = useStore((s) => s.resetCuts);
	const [expanded, setExpanded] = useState(false);

	const onMetroClick = useCallback(
		(metroId: string) => {
			const metro = metrosById.get(metroId);
			if (!metro) return;
			selectMetro(metroId);
			flyToLocation(metro.lng, metro.lat, 5);
		},
		[metrosById, selectMetro, flyToLocation],
	);

	if (!panelOpen) {
		return (
			<button
				type="button"
				onClick={togglePanel}
				className="
					absolute right-3 top-3 z-20
					w-11 h-11 rounded-xl bg-surface/95 backdrop-blur-sm
					border border-border flex items-center justify-center
					text-text-secondary hover:text-text-primary active:bg-border/60
					transition-colors shadow-lg shadow-black/30
				"
				title="Show impact panel"
			>
				<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
					<rect x="3" y="3" width="12" height="12" rx="2" />
					<line x1="7" y1="7" x2="7" y2="11" />
					<line x1="9" y1="9" x2="9" y2="11" />
					<line x1="11" y1="5" x2="11" y2="11" />
				</svg>
			</button>
		);
	}

	const hasCuts = cuts.length > 0;
	const impacts = simulation?.impacts ?? [];
	const affected = impacts.filter((i) => i.bandwidthLossPct > 0.1);
	const absorbed = impacts.filter((i) => i.redundancyAbsorbed && !i.isolated);

	// Get the selected metro's impact for detail view
	const selectedImpact = selectedMetroId
		? affected.find((i) => i.metroId === selectedMetroId)
		: null;

	return (
		<div
			className={`
				absolute right-0 top-0 z-20 flex flex-col overflow-hidden
				bg-surface/95 backdrop-blur-sm border-l border-border
				transition-all duration-300
				max-md:bottom-0 max-md:left-0 max-md:top-auto max-md:right-0
				max-md:border-l-0 max-md:border-t max-md:rounded-t-2xl
				${expanded ? "max-md:h-[80vh]" : "max-md:h-[40vh]"}
				md:w-80 md:h-full
			`}
		>
			{/* Mobile drag handle */}
			<div
				className="flex justify-center py-2 md:hidden cursor-pointer"
				onClick={() => setExpanded(!expanded)}
			>
				<div className="w-10 h-1 rounded-full bg-text-secondary/40" />
			</div>

			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
				<h2 className="font-data text-[11px] font-semibold tracking-wider text-text-secondary">
					IMPACT
				</h2>
				<div className="flex items-center gap-3">
					{hasCuts && (
						<button
							type="button"
							onClick={resetCuts}
							className="text-cable-cut/70 hover:text-cable-cut text-[10px] transition-colors"
						>
							RESET
						</button>
					)}
					<button
						type="button"
						onClick={togglePanel}
						className="text-text-secondary/50 hover:text-text-primary text-[10px] transition-colors"
					>
						HIDE
					</button>
				</div>
			</div>

			{/* Summary bar */}
			{hasCuts && simulation && (
				<div className="grid grid-cols-3 gap-1 px-4 py-2.5 border-b border-border">
					<div className="text-center">
						<div className="font-data text-base font-semibold text-cable-cut">
							{simulation.cablesAffected}
						</div>
						<div className="text-[9px] text-text-secondary/60 uppercase">cables</div>
					</div>
					<div className="text-center">
						<div className="font-data text-base font-semibold text-accent">
							{simulation.totalCapacityRemovedTbps.toFixed(0)}
						</div>
						<div className="text-[9px] text-text-secondary/60 uppercase">Tbps lost</div>
					</div>
					<div className="text-center">
						<div className="font-data text-base font-semibold text-text-primary">
							{simulation.metrosAffected}
						</div>
						<div className="text-[9px] text-text-secondary/60 uppercase">affected</div>
					</div>
				</div>
			)}

			{/* Redundancy callout */}
			{hasCuts && absorbed.length > 0 && affected.length === 0 && (
				<div className="mx-3 mt-3 rounded-lg bg-redundancy/10 border border-redundancy/20 px-3 py-2.5">
					<div className="text-xs font-semibold text-redundancy">
						Network absorbed this cut
					</div>
					<div className="text-[10px] text-text-secondary mt-1 leading-relaxed">
						Alternative paths carry equivalent capacity. No measurable impact on any metro.
					</div>
				</div>
			)}

			{/* Loading state */}
			{simulating && (
				<div className="flex items-center justify-center py-8">
					<div className="text-xs text-text-secondary animate-pulse">
						Simulating...
					</div>
				</div>
			)}

			{/* No cuts state */}
			{!hasCuts && (
				<div className="flex flex-col items-center justify-center flex-1 px-6 py-8 text-center">
					<div className="text-text-secondary/70 text-xs leading-relaxed">
						Select a scenario or click a cable on the globe to simulate a failure.
					</div>
				</div>
			)}

			{/* Selected metro detail */}
			{selectedImpact && selectedMetroId && (
				<div className="px-4 py-3 border-b border-border bg-border/10">
					<div className="flex items-center justify-between mb-2">
						<div>
							<div className="text-sm font-semibold text-text-primary">
								{metrosById.get(selectedMetroId)?.name}
							</div>
							<div className="text-[10px] text-text-secondary">
								{metrosById.get(selectedMetroId)?.countryCode}
							</div>
						</div>
						<button
							type="button"
							onClick={() => selectMetro(null)}
							className="text-[10px] text-text-secondary/50 hover:text-text-primary"
						>
							BACK
						</button>
					</div>
					<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
						<div className="text-text-secondary">Bandwidth lost</div>
						<div className="font-data text-right text-cable-cut font-medium">
							{selectedImpact.bandwidthLossPct.toFixed(1)}%
						</div>
						<div className="text-text-secondary">Remaining</div>
						<div className="font-data text-right">
							{selectedImpact.remainingBandwidthTbps.toFixed(0)} Tbps
						</div>
						<div className="text-text-secondary">Baseline</div>
						<div className="font-data text-right text-text-secondary/70">
							{selectedImpact.baselineBandwidthTbps.toFixed(0)} Tbps
						</div>
						<div className="text-text-secondary">Latency change</div>
						<div className="font-data text-right">
							{selectedImpact.latencyDeltaMs > 0
								? `+${selectedImpact.latencyDeltaMs.toFixed(1)} ms`
								: selectedImpact.isolated
									? "N/A"
									: "none"}
						</div>
						<div className="text-text-secondary">Path diversity</div>
						<div className="font-data text-right">
							{selectedImpact.remainingPathDiversity} / {selectedImpact.baselinePathDiversity}
						</div>
					</div>
					{selectedImpact.reroutedVia.length > 0 && (
						<div className="mt-2.5 pt-2 border-t border-border/50">
							<div className="text-[9px] text-text-secondary/60 uppercase mb-1">
								Traffic shifts to
							</div>
							{selectedImpact.reroutedVia.map((r, i) => {
								const isSubCable = r.type === "submarine" && r.cableId;
									return (
									<button
										key={`detail-reroute-${i}`}
										type="button"
										onClick={() => {
											if (isSubCable && r.cableId) {
												selectCable(r.cableId);
											}
										}}
										className={`
											w-full flex items-center justify-between text-[11px] py-1 px-1.5 -mx-1.5 rounded
											transition-colors text-left
											${isSubCable
												? "hover:bg-cable-high/10 cursor-pointer"
												: "cursor-default"
											}
										`}
									>
										<div className="flex items-center gap-1.5 min-w-0">
											<span
												className="w-1.5 h-1.5 rounded-full flex-none"
												style={{
													backgroundColor:
														r.type === "terrestrial"
															? "#22d3ee"
															: "#60a5fa",
												}}
											/>
											<span className="text-text-primary truncate">
												{r.name}
											</span>
										</div>
										<div className="flex items-center gap-2 flex-none ml-2">
											<span className="font-data text-text-secondary/70">
												{r.additionalLoadTbps.toFixed(0)} Tbps
											</span>
											{isSubCable && (
												<svg width="10" height="10" viewBox="0 0 10 10" fill="none"
													stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
													className="text-text-secondary/40"
												>
													<line x1="2" y1="8" x2="8" y2="2" />
													<polyline points="4,2 8,2 8,6" />
												</svg>
											)}
										</div>
									</button>
								);
							})}
						</div>
					)}
				</div>
			)}

			{/* Metro ranking list */}
			{hasCuts && !simulating && affected.length > 0 && (
				<div className="flex-1 overflow-y-auto">
					{/* Column headers */}
					<div className="flex items-center gap-2 px-4 py-1.5 text-[9px] text-text-secondary/50 uppercase tracking-wider border-b border-border/50 sticky top-0 bg-surface/95">
						<div className="flex-1">Location</div>
						<div className="w-16 text-right">BW Loss</div>
						<div className="w-16 text-right">Latency</div>
					</div>

					{affected.map((impact) => {
						const metro = metrosById.get(impact.metroId);
						if (!metro) return null;
						const isSelected = impact.metroId === selectedMetroId;

						return (
							<button
								key={impact.metroId}
								type="button"
								onClick={() => onMetroClick(impact.metroId)}
								className={`
									w-full flex items-center gap-2 px-4 py-2 text-left
									transition-colors border-b border-border/20
									${isSelected
										? "bg-cable-high/10"
										: "hover:bg-border/20 active:bg-border/30"
									}
								`}
							>
								{/* Name */}
								<div className="flex-1 min-w-0">
									<div className="text-xs text-text-primary truncate leading-tight">
										{metro.name}
									</div>
									<div className="text-[9px] text-text-secondary/50 leading-tight">
										{metro.countryCode}
									</div>
								</div>

								{/* Bandwidth loss */}
								<div className="w-16 text-right">
									{impact.isolated ? (
										<span className="font-data text-[11px] text-cable-cut font-bold">
											OFFLINE
										</span>
									) : (
										<>
											<div
												className="font-data text-[11px] font-medium"
												style={{
													color:
														impact.bandwidthLossPct > 80
															? "#ef4444"
															: impact.bandwidthLossPct > 50
																? "#f59e0b"
																: impact.bandwidthLossPct > 20
																	? "#fde047"
																	: "#94a3b8",
												}}
											>
												-{impact.bandwidthLossPct.toFixed(0)}%
											</div>
											{/* Mini bar */}
											<div className="h-[3px] rounded-full bg-border/50 mt-0.5 overflow-hidden">
												<div
													className="h-full rounded-full"
													style={{
														width: `${100 - impact.bandwidthLossPct}%`,
														backgroundColor:
															impact.bandwidthLossPct > 50 ? "#f59e0b" : "#22c55e",
													}}
												/>
											</div>
										</>
									)}
								</div>

								{/* Latency */}
								<div className="w-16 text-right">
									{impact.latencyDeltaMs > 0 ? (
										<span className="font-data text-[11px] text-accent">
											+{impact.latencyDeltaMs.toFixed(0)}ms
										</span>
									) : impact.isolated ? (
										<span className="font-data text-[11px] text-cable-cut">—</span>
									) : (
										<span className="font-data text-[11px] text-text-secondary/40">—</span>
									)}
								</div>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}

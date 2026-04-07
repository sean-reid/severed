import { useCallback, useRef, useState } from "react";
import { useStore } from "../../state/store";

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
	const addCut = useStore((s) => s.addCut);
	const cablesById = useStore((s) => s.cablesById);
	const selectCable = useStore((s) => s.selectCable);
	const selectTerrestrial = useStore((s) => s.selectTerrestrial);
	const terrestrial = useStore((s) => s.terrestrial);
	const resetCuts = useStore((s) => s.resetCuts);

	const cutCableById = useCallback(
		(cableId: string) => {
			const cable = cablesById.get(cableId);
			if (!cable) return;
			const segmentIds = cable.segments.map((_s: unknown, i: number) => `${cableId}:${i}`);
			addCut({
				id: `cable-${cableId}`,
				type: "point",
				lat: 0,
				lng: 0,
				affectedSegmentIds: segmentIds,
			});
		},
		[cablesById, addCut],
	);
	// Mobile bottom sheet: three snap points as % of viewport height
	// 5 snap points for smoother drag stops
	const SNAPS = [15, 30, 45, 65, 85];
	const [sheetHeight, setSheetHeightLocal] = useState(SNAPS[2]);
	const setMobileSheetHeight = useStore((s) => s.setMobileSheetHeight);
	const [dragging, setDragging] = useState(false);
	const dragRef = useRef<{
		startY: number;
		startH: number;
		lastY: number;
		lastTime: number;
	} | null>(null);

	const setSheetHeight = useCallback(
		(h: number) => {
			setSheetHeightLocal(h);
			setMobileSheetHeight(h);
		},
		[setMobileSheetHeight],
	);

	const onMetroClick = useCallback(
		(metroId: string) => {
			const metro = metrosById.get(metroId);
			if (!metro) return;
			selectMetro(metroId);
			flyToLocation(metro.lng, metro.lat, 5);
		},
		[metrosById, selectMetro, flyToLocation],
	);

	// ── Data ──

	const hasCuts = cuts.length > 0;
	const impacts = simulation?.impacts ?? [];
	const affected = impacts.filter((i) => i.bandwidthLossPct > 0.1);
	const absorbed = impacts.filter((i) => i.redundancyAbsorbed && !i.isolated);
	const selectedImpact = selectedMetroId
		? affected.find((i) => i.metroId === selectedMetroId)
		: null;

	// ── Touch drag with velocity-based snapping ──

	const onTouchStart = useCallback(
		(e: React.TouchEvent) => {
			const y = e.touches[0].clientY;
			setDragging(true);
			dragRef.current = { startY: y, startH: sheetHeight, lastY: y, lastTime: Date.now() };
		},
		[sheetHeight],
	);

	const onTouchMove = useCallback(
		(e: React.TouchEvent) => {
			if (!dragRef.current) return;
			const y = e.touches[0].clientY;
			const dy = dragRef.current.startY - y;
			const dvh = (dy / window.innerHeight) * 100;
			const newH = Math.max(
				SNAPS[0],
				Math.min(SNAPS[SNAPS.length - 1], dragRef.current.startH + dvh),
			);
			dragRef.current.lastY = y;
			setSheetHeight(newH);
		},
		[setSheetHeight],
	);

	const onTouchEnd = useCallback(() => {
		if (!dragRef.current) return;
		const draggedUp = dragRef.current.lastY < dragRef.current.startY;
		const dragDist = Math.abs(dragRef.current.startY - dragRef.current.lastY);
		const totalTime = Date.now() - dragRef.current.lastTime;
		// Velocity: px per ms over total drag. Fast flick = >0.4 px/ms
		const velocity = totalTime > 0 ? dragDist / totalTime : 0;
		const isFastFlick = velocity > 0.4 && dragDist > 30;
		const minDrag = 15;

		let target: number;
		if (dragDist < minDrag) {
			// Tiny drag -- snap to nearest
			target = SNAPS.reduce((a, b) =>
				Math.abs(b - sheetHeight) < Math.abs(a - sheetHeight) ? b : a,
			);
		} else if (isFastFlick) {
			// Fast flick -- jump to endpoint
			target = draggedUp ? SNAPS[SNAPS.length - 1] : SNAPS[0];
		} else if (draggedUp) {
			// Slow drag up -- snap to next higher point
			target = SNAPS.find((s) => s > sheetHeight) ?? SNAPS[SNAPS.length - 1];
		} else {
			// Slow drag down -- snap to next lower point
			target = [...SNAPS].reverse().find((s) => s < sheetHeight) ?? SNAPS[0];
		}

		setSheetHeight(target);
		setDragging(false);
		dragRef.current = null;
	}, [sheetHeight, setSheetHeight]);

	return (
		<>
			{/* Reopen button — visible when panel is hidden */}
			{!panelOpen && (
				<button
					type="button"
					onClick={togglePanel}
					className="
					absolute z-20 hidden md:flex
					w-12 h-12 rounded-2xl bg-surface border border-border
					items-center justify-center
					text-text-secondary hover:text-text-primary active:bg-border/60
					transition-colors shadow-lg shadow-black/30
					right-3 top-3
				"
					title="Show impact panel"
				>
					<svg
						width="20"
						height="20"
						viewBox="0 0 18 18"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
					>
						<title>Show impact panel</title>
						<rect x="3" y="3" width="12" height="12" rx="2" />
						<line x1="7" y1="7" x2="7" y2="11" />
						<line x1="9" y1="9" x2="9" y2="11" />
						<line x1="11" y1="5" x2="11" y2="11" />
					</svg>
				</button>
			)}

			{/* Main panel */}
			<div
				className={`
				impact-sheet
				absolute z-20 flex flex-col overflow-hidden
				bg-surface border-border

				md:right-0 md:top-0 md:w-80 md:h-full md:border-l

				max-md:bottom-0 max-md:left-0 max-md:right-0
				max-md:border-t max-md:rounded-t-2xl
				${dragging ? "" : "max-md:transition-[height] max-md:duration-300 max-md:ease-out"}
				${panelOpen ? "" : "translate-x-full max-md:translate-x-0 max-md:translate-y-full"}
				transition-transform duration-300 ease-out
			`}
				style={{ "--sheet-h": `${sheetHeight}dvh` } as React.CSSProperties}
			>
				{/* ── Draggable top region (mobile): handle + header + stats ── */}
				<div
					className="shrink-0 max-md:touch-none max-md:cursor-grab max-md:active:cursor-grabbing"
					onTouchStart={onTouchStart}
					onTouchMove={onTouchMove}
					onTouchEnd={onTouchEnd}
				>
					{/* Drag handle (mobile only) — large touch target */}
					<div className="flex justify-center items-center h-10 w-full md:hidden">
						<div className="w-14 h-1.5 rounded-full bg-text-secondary/40" />
					</div>

					{/* Header */}
					<div className="flex items-center justify-between px-4 py-2 border-b border-border">
						<h2 className="font-data text-xs font-semibold tracking-wider text-text-secondary">
							IMPACT
						</h2>
						<div className="flex items-center gap-4">
							{hasCuts && (
								<button
									type="button"
									onClick={resetCuts}
									className="text-cable-cut hover:text-cable-cut/80 text-xs py-1 transition-colors"
								>
									Reset
								</button>
							)}
							<button
								type="button"
								onClick={() => {
									if (window.innerWidth < 768) {
										setSheetHeight(SNAPS[0]);
									} else {
										togglePanel();
									}
								}}
								className="text-text-secondary/60 hover:text-text-primary text-xs py-1 transition-colors"
							>
								Hide
							</button>
						</div>
					</div>

					{/* Summary stats */}
					{hasCuts && simulation && (
						<div className="grid grid-cols-3 gap-1 px-4 py-3 border-b border-border">
							<div className="text-center">
								<div className="font-data text-lg font-semibold text-cable-cut">
									{simulation.cablesAffected}
								</div>
								<div className="text-[10px] text-text-secondary/60 uppercase">cables</div>
							</div>
							<div className="text-center">
								<div className="font-data text-lg font-semibold text-accent">
									{simulation.totalCapacityRemovedTbps.toFixed(0)}
								</div>
								<div className="text-[10px] text-text-secondary/60 uppercase">Tbps lost</div>
							</div>
							<div className="text-center">
								<div className="font-data text-lg font-semibold text-text-primary">
									{simulation.metrosAffected}
								</div>
								<div className="text-[10px] text-text-secondary/60 uppercase">affected</div>
							</div>
						</div>
					)}
				</div>

				{/* ── Redundancy callout ── */}
				{hasCuts && absorbed.length > 0 && affected.length === 0 && (
					<div className="mx-4 my-3 rounded-xl bg-redundancy/10 border border-redundancy/20 px-4 py-3 shrink-0">
						<div className="text-sm font-semibold text-redundancy">Network absorbed this cut</div>
						<div className="text-xs text-text-secondary mt-1 leading-relaxed">
							Alternative paths carry equivalent capacity. No measurable impact.
						</div>
					</div>
				)}

				{/* ── Loading ── */}
				{simulating && (
					<div className="flex items-center justify-center py-10 shrink-0">
						<div className="text-sm text-text-secondary animate-pulse">Simulating...</div>
					</div>
				)}

				{/* ── Empty state ── */}
				{!hasCuts && (
					<div className="flex flex-col items-center justify-center flex-1 px-8 text-center">
						<div className="text-text-secondary/70 text-sm leading-relaxed">
							Select a scenario or tap a cable to simulate a failure.
						</div>
					</div>
				)}

				{/* ── Selected metro detail ── */}
				{selectedImpact && selectedMetroId && (
					<div className="px-4 py-3 border-b border-border bg-border/10 shrink-0 max-md:max-h-[40vh] max-md:overflow-y-auto">
						<div className="flex items-center justify-between mb-3">
							<div>
								<div className="text-base font-semibold text-text-primary">
									{metrosById.get(selectedMetroId)?.name}
								</div>
								<div className="text-xs text-text-secondary">
									{metrosById.get(selectedMetroId)?.countryCode}
								</div>
							</div>
							<button
								type="button"
								onClick={() => selectMetro(null)}
								className="text-xs text-text-secondary/60 hover:text-text-primary py-1 px-2 transition-colors"
							>
								Back
							</button>
						</div>
						<div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
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
							<div className="mt-3 pt-2.5 border-t border-border/50">
								<div className="text-[10px] text-text-secondary/60 uppercase mb-1.5">
									Traffic shifts to
								</div>
								{selectedImpact.reroutedVia.map((r) => {
									const isSubCable = r.type === "submarine" && r.cableId;
									const isTerrestrial = r.type === "terrestrial" && r.terrestrialId;
									return (
										<div
											key={`reroute-${r.cableId ?? r.terrestrialId ?? r.name}`}
											className="flex items-center justify-between text-sm py-1.5"
										>
											<button
												type="button"
												onClick={() => {
													if (isTerrestrial && r.terrestrialId) {
														selectTerrestrial(r.terrestrialId);
														// Fly to terrestrial edge midpoint
														const edge = terrestrial.find((t) => t.id === r.terrestrialId);
														if (edge) {
															const from = metrosById.get(edge.from);
															const to = metrosById.get(edge.to);
															if (from && to)
																flyToLocation((from.lng + to.lng) / 2, (from.lat + to.lat) / 2, 5);
														}
													} else if (isSubCable && r.cableId) {
														selectCable(r.cableId);
														// Fly to cable midpoint via first segment
														const cable = cablesById.get(r.cableId);
														if (cable?.segments[0]) {
															const seg = cable.segments[0];
															const from = metrosById.get(seg.from);
															const to = metrosById.get(seg.to);
															if (from && to)
																flyToLocation((from.lng + to.lng) / 2, (from.lat + to.lat) / 2, 4);
														}
													}
													// On mobile, collapse the sheet so the selection is visible
													if (window.innerWidth < 768) setSheetHeight(SNAPS[0]);
												}}
												className="flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity"
											>
												<span
													className="w-2 h-2 rounded-full flex-none"
													style={{
														backgroundColor: r.type === "terrestrial" ? "#22d3ee" : "#60a5fa",
													}}
												/>
												<span className="text-text-primary truncate">{r.name}</span>
												<span className="font-data text-text-secondary/70 text-xs flex-none">
													{r.additionalLoadTbps.toFixed(0)} Tbps
												</span>
											</button>
											{isSubCable && r.cableId && (
												<button
													type="button"
													onClick={() => {
														if (r.cableId) cutCableById(r.cableId);
													}}
													className="
													flex-none ml-2 px-2.5 py-1 rounded-lg
													text-[10px] font-semibold uppercase
													text-cable-cut bg-cable-cut/10 border border-cable-cut/30
													active:bg-cable-cut/20 transition-colors
												"
												>
													Cut
												</button>
											)}
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}

				{/* ── Metro ranking list ── */}
				{hasCuts && !simulating && affected.length > 0 && (
					<div className="flex-1 overflow-y-auto overscroll-contain">
						{/* Column headers */}
						<div className="flex items-center gap-2 px-4 py-2 text-[10px] text-text-secondary/50 uppercase tracking-wider border-b border-border/50 sticky top-0 bg-surface/95 z-10">
							<div className="flex-1">Location</div>
							<div className="w-16 text-right">Loss</div>
							<div className="w-14 text-right">Latency</div>
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
									w-full flex items-center gap-2 px-4 min-h-[48px] py-2.5 text-left
									transition-colors border-b border-border/15
									${isSelected ? "bg-cable-high/10" : "active:bg-border/30"}
								`}
								>
									{/* Name */}
									<div className="flex-1 min-w-0">
										<div className="text-sm text-text-primary truncate leading-snug">
											{metro.name}
										</div>
										<div className="text-[10px] text-text-secondary/50 leading-snug">
											{metro.countryCode}
										</div>
									</div>

									{/* Bandwidth loss */}
									<div className="w-16 text-right">
										{impact.isolated ? (
											<span className="font-data text-xs text-cable-cut font-bold">OFFLINE</span>
										) : (
											<>
												<div
													className="font-data text-xs font-medium"
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
												<div className="h-1 rounded-full bg-border/50 mt-1 overflow-hidden">
													<div
														className="h-full rounded-full"
														style={{
															width: `${100 - impact.bandwidthLossPct}%`,
															backgroundColor: impact.bandwidthLossPct > 50 ? "#f59e0b" : "#22c55e",
														}}
													/>
												</div>
											</>
										)}
									</div>

									{/* Latency */}
									<div className="w-14 text-right">
										{impact.latencyDeltaMs > 0 ? (
											<span className="font-data text-xs text-accent">
												+{impact.latencyDeltaMs.toFixed(0)}ms
											</span>
										) : impact.isolated ? (
											<span className="font-data text-xs text-cable-cut">—</span>
										) : (
											<span className="font-data text-xs text-text-secondary/40">—</span>
										)}
									</div>
								</button>
							);
						})}

						{/* Bottom padding for safe area */}
						<div className="h-6 safe-bottom" />
					</div>
				)}
			</div>
		</>
	);
}

import { useMemo, useState } from "react";
import { useStore } from "../../state/store";

export function MetroCard() {
	const selectedMetroId = useStore((s) => s.selectedMetroId);
	const selectedCableId = useStore((s) => s.selectedCableId);
	const metrosById = useStore((s) => s.metrosById);
	const cables = useStore((s) => s.cables);
	const terrestrial = useStore((s) => s.terrestrial);
	const selectMetro = useStore((s) => s.selectMetro);
	const selectCable = useStore((s) => s.selectCable);
	const selectTerrestrial = useStore((s) => s.selectTerrestrial);
	const mobileSheetHeight = useStore((s) => s.mobileSheetHeight);
	const sheetDragging = useStore((s) => s.mobileSheetDragging);
	const [expanded, setExpanded] = useState(false);

	const metro = selectedMetroId ? metrosById.get(selectedMetroId) : null;

	const connectedCables = useMemo(() => {
		if (!selectedMetroId) return [];
		return cables.filter((c) =>
			c.segments.some((s) => s.from === selectedMetroId || s.to === selectedMetroId),
		);
	}, [selectedMetroId, cables]);

	const connectedTerrestrial = useMemo(() => {
		if (!selectedMetroId) return [];
		return terrestrial.filter((t) => t.from === selectedMetroId || t.to === selectedMetroId);
	}, [selectedMetroId, terrestrial]);

	// Don't show if cable is selected (CutAction takes priority) or no metro
	if (!metro || selectedCableId) return null;

	return (
		<div
			className={`absolute z-20 md:hidden left-3 right-3 ${sheetDragging ? "" : "transition-[bottom] duration-300 ease-out"}`}
			style={{ bottom: `calc(${mobileSheetHeight}dvh + 12px)` }}
		>
			<div className="bg-surface border border-border rounded-2xl shadow-xl shadow-black/40 overflow-hidden">
				{/* Header */}
				<div className="flex items-center gap-2 px-4 py-3">
					<button
						type="button"
						onClick={() => setExpanded((e) => !e)}
						className="flex-1 min-w-0 text-left"
					>
						<div className="text-sm text-text-primary font-medium truncate">{metro.name}</div>
						<div className="flex items-center gap-2 mt-0.5">
							<span className="text-[10px] text-text-secondary">{metro.countryCode}</span>
							{metro.isHub && (
								<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cable-high/20 text-cable-high font-medium">
									hub
								</span>
							)}
							<span className="text-[10px] text-text-secondary">
								{connectedCables.length} cable{connectedCables.length !== 1 ? "s" : ""}
								{connectedTerrestrial.length > 0 && (
									<> · {connectedTerrestrial.length} terrestrial</>
								)}
							</span>
						</div>
					</button>
					<button
						type="button"
						onClick={() => {
							selectMetro(null);
							setExpanded(false);
						}}
						className="flex-none p-2 text-text-secondary/60 active:text-text-primary transition-colors"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						>
							<title>Close</title>
							<line x1="4" y1="4" x2="12" y2="12" />
							<line x1="12" y1="4" x2="4" y2="12" />
						</svg>
					</button>
				</div>

				{/* Expanded: connected cables + terrestrial */}
				{expanded && (
					<div className="px-4 pb-3 pt-1 border-t border-border/50 max-h-48 overflow-y-auto">
						{connectedCables.length > 0 && (
							<>
								<div className="text-[9px] text-text-secondary/50 uppercase mb-1">
									Submarine cables
								</div>
								{connectedCables.slice(0, 8).map((c) => (
									<button
										key={c.id}
										type="button"
										onClick={() => {
											selectCable(c.id);
											setExpanded(false);
										}}
										className="w-full flex justify-between text-xs py-1.5 rounded hover:bg-border/30 text-left transition-colors"
									>
										<span className="text-text-primary truncate">{c.name}</span>
										<span className="font-data text-text-secondary/60 ml-2 flex-none">
											{c.designCapacityTbps.toFixed(0)} Tbps
										</span>
									</button>
								))}
								{connectedCables.length > 8 && (
									<div className="text-[10px] text-text-secondary/40 mt-1">
										+{connectedCables.length - 8} more
									</div>
								)}
							</>
						)}

						{connectedTerrestrial.length > 0 && (
							<>
								<div className="text-[9px] text-text-secondary/50 uppercase mb-1 mt-2">
									Terrestrial links
								</div>
								{connectedTerrestrial.map((t) => {
									const otherId = t.from === selectedMetroId ? t.to : t.from;
									const otherName = metrosById.get(otherId)?.name ?? otherId;
									return (
										<button
											key={t.id}
											type="button"
											onClick={() => {
												selectTerrestrial(t.id);
												setExpanded(false);
											}}
											className="w-full flex justify-between text-xs py-1.5 rounded hover:bg-border/30 text-left transition-colors"
										>
											<span className="text-terrestrial truncate">{otherName}</span>
											<span className="font-data text-text-secondary/60 ml-2 flex-none">
												{t.capacityTbps < 1
													? `${(t.capacityTbps * 1000).toFixed(0)} Gbps`
													: `${t.capacityTbps.toFixed(0)} Tbps`}
											</span>
										</button>
									);
								})}
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

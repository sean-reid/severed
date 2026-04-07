import { useCallback, useState } from "react";
import type { CutLocation } from "../../data/types";
import { useStore } from "../../state/store";
import { confidenceColors } from "../../utils/colors";

export function CutAction() {
	const selectedCableId = useStore((s) => s.selectedCableId);
	const cablesById = useStore((s) => s.cablesById);
	const addCut = useStore((s) => s.addCut);
	const selectCable = useStore((s) => s.selectCable);
	const mobileSheetHeight = useStore((s) => s.mobileSheetHeight);
	const [expanded, setExpanded] = useState(false);

	const selectedCable = selectedCableId ? cablesById.get(selectedCableId) : null;

	const cutCable = useCallback(() => {
		if (!selectedCable) return;
		const segmentIds = selectedCable.segments.map((_s, i) => `${selectedCable.id}:${i}`);
		const cut: CutLocation = {
			id: `cable-${selectedCable.id}`,
			type: "point",
			lat: 0,
			lng: 0,
			affectedSegmentIds: segmentIds,
		};
		addCut(cut);
		selectCable(null);
		setExpanded(false);
	}, [selectedCable, addCut, selectCable]);

	if (!selectedCable) return null;

	const conf = selectedCable.capacityConfidence;

	return (
		<div
			className="absolute z-20 md:hidden left-3 right-3"
			style={{ bottom: `calc(${mobileSheetHeight}dvh + 12px)` }}
		>
			<div className="bg-surface border border-border rounded-2xl shadow-xl shadow-black/40 overflow-hidden">
				{/* Collapsed: name + capacity + cut + dismiss */}
				<div className="flex items-center gap-2 px-4 py-3">
					<button
						type="button"
						onClick={() => setExpanded((e) => !e)}
						className="flex-1 min-w-0 text-left"
					>
						<div className="text-sm text-text-primary font-medium truncate">
							{selectedCable.name}
						</div>
						<div className="flex items-center gap-2 mt-0.5">
							<span className="font-data text-xs text-text-secondary">
								{selectedCable.designCapacityTbps.toFixed(0)} Tbps
							</span>
							<span
								className="text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase"
								style={{
									backgroundColor: `${confidenceColors[conf]}20`,
									color: confidenceColors[conf],
								}}
							>
								{conf}
							</span>
						</div>
					</button>
					<button
						type="button"
						onClick={cutCable}
						className="
							flex-none px-4 py-2.5 rounded-xl
							bg-cable-cut/20 border border-cable-cut/40
							text-cable-cut text-sm font-semibold
							active:bg-cable-cut/30 transition-colors
						"
					>
						Cut
					</button>
					<button
						type="button"
						onClick={() => {
							selectCable(null);
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

				{/* Expanded: full details — tap to collapse */}
				{expanded && (
					<button
						type="button"
						className="px-4 pb-3 pt-1 border-t border-border/50 cursor-pointer active:bg-border/10 w-full text-left"
						onClick={() => setExpanded(false)}
						onKeyDown={(e) => {
							if (e.key === "Enter") setExpanded(false);
						}}
					>
						<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
							<div className="text-text-secondary">RFS</div>
							<div className="font-data text-right">{selectedCable.rfsYear}</div>
							<div className="text-text-secondary">Length</div>
							<div className="font-data text-right">
								{selectedCable.lengthKm > 0 ? `${selectedCable.lengthKm.toLocaleString()} km` : "—"}
							</div>
							<div className="text-text-secondary">Fiber pairs</div>
							<div className="font-data text-right">{selectedCable.fiberPairs ?? "Unknown"}</div>
							<div className="text-text-secondary">Segments</div>
							<div className="font-data text-right">{selectedCable.segments.length}</div>
							<div className="text-text-secondary">Capacity source</div>
							<div className="text-right text-xs text-text-secondary/70">
								{selectedCable.capacitySource === "heuristic"
									? "RFS-year heuristic"
									: selectedCable.capacitySource === "fcc"
										? "FCC filing"
										: selectedCable.capacitySource === "press"
											? "Press release"
											: selectedCable.capacitySource === "wikipedia"
												? "Wikipedia"
												: "Derived from fiber pairs"}
							</div>
						</div>
						{selectedCable.owners.length > 0 && (
							<div className="mt-2 pt-2 border-t border-border/30">
								<div className="text-[10px] text-text-secondary/50 uppercase mb-1">Owners</div>
								<div className="text-xs text-text-secondary leading-relaxed">
									{selectedCable.owners.join(", ")}
								</div>
							</div>
						)}
						{selectedCable.sourceUrl && (
							<a
								href={selectedCable.sourceUrl}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1 mt-2 text-[10px] text-cable-high hover:text-text-primary transition-colors"
								onClick={(e) => e.stopPropagation()}
							>
								<svg
									width="10"
									height="10"
									viewBox="0 0 16 16"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<title>External link</title>
									<path d="M12 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 0 13.5v-9A1.5 1.5 0 0 1 1.5 3H7" />
									<path d="M10 1h5v5" />
									<path d="M7 9 15 1" />
								</svg>
								Source
							</a>
						)}
					</button>
				)}
			</div>
		</div>
	);
}

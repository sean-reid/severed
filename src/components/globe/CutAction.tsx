import { useCallback } from "react";
import { useStore } from "../../state/store";
import type { CutLocation } from "../../data/types";

/**
 * Floating "Cut" button that appears when a cable is selected.
 * Works on both mobile and desktop.
 */
export function CutAction() {
	const selectedCableId = useStore((s) => s.selectedCableId);
	const cablesById = useStore((s) => s.cablesById);
	const addCut = useStore((s) => s.addCut);
	const selectCable = useStore((s) => s.selectCable);
	const mobileSheetHeight = useStore((s) => s.mobileSheetHeight);

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
	}, [selectedCable, addCut, selectCable]);

	if (!selectedCable) return null;

	return (
		<div
			className="absolute z-10 md:hidden left-1/2 -translate-x-1/2"
			style={{ bottom: `calc(${mobileSheetHeight}dvh + 8px)` }}
		>
			<div className="flex items-center gap-2 bg-surface/95 backdrop-blur-sm rounded-2xl border border-border shadow-xl shadow-black/30 px-4 py-2.5">
				<div className="text-sm text-text-primary font-medium truncate max-w-[180px]">
					{selectedCable.name}
				</div>
				<div className="font-data text-xs text-text-secondary">
					{selectedCable.designCapacityTbps.toFixed(0)} Tbps
				</div>
				<button
					type="button"
					onClick={cutCable}
					className="
						ml-1 px-4 py-2 rounded-xl
						bg-cable-cut/20 border border-cable-cut/40
						text-cable-cut text-sm font-semibold
						active:bg-cable-cut/30 transition-colors
					"
				>
					Cut
				</button>
				<button
					type="button"
					onClick={() => selectCable(null)}
					className="
						px-2 py-2 rounded-xl
						text-text-secondary/60 active:text-text-primary
						transition-colors
					"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
						<line x1="4" y1="4" x2="12" y2="12" />
						<line x1="12" y1="4" x2="4" y2="12" />
					</svg>
				</button>
			</div>
		</div>
	);
}

import { useStore } from "../../state/store";
import { BaseCard } from "./BaseCard";

export function PointCutCard() {
	const selectedPointCutId = useStore((s) => s.selectedPointCutId);
	const cuts = useStore((s) => s.cuts);
	const removeCut = useStore((s) => s.removeCut);
	const selectPointCut = useStore((s) => s.selectPointCut);
	const cablesById = useStore((s) => s.cablesById);
	const metrosById = useStore((s) => s.metrosById);

	const cut = selectedPointCutId ? cuts.find((c) => c.id === selectedPointCutId) : null;

	if (!cut) return null;

	const isSegmentCut = cut.type === "segment" && cut.cableId;
	const cable = isSegmentCut && cut.cableId ? cablesById.get(cut.cableId) : null;

	// For segment cuts: show the two metros this segment connects
	let segmentLabel = "";
	if (cable && cut.segmentIndex != null) {
		const seg = cable.segments[cut.segmentIndex];
		if (seg) {
			const fromName = metrosById.get(seg.from)?.name ?? seg.from;
			const toName = metrosById.get(seg.to)?.name ?? seg.to;
			segmentLabel = `${fromName} to ${toName}`;
		}
	}

	const latStr = `${Math.abs(cut.lat).toFixed(1)}°${cut.lat >= 0 ? "N" : "S"}`;
	const lngStr = `${Math.abs(cut.lng).toFixed(1)}°${cut.lng >= 0 ? "E" : "W"}`;

	return (
		<BaseCard
			visible
			onClose={() => selectPointCut(null)}
			title={isSegmentCut && cable ? cable.name : `${latStr}, ${lngStr}`}
			subtitle={
				isSegmentCut ? (
					<span className="font-data text-xs text-text-secondary truncate">{segmentLabel}</span>
				) : (
					<span className="font-data text-xs text-text-secondary">
						{cut.radius ?? 50} km radius
					</span>
				)
			}
			action={
				<button
					type="button"
					onClick={() => removeCut(cut.id)}
					className="
						flex-none px-4 py-2.5 rounded-xl
						bg-cable-cut/20 border border-cable-cut/40
						text-cable-cut text-sm font-semibold
						active:bg-cable-cut/30 transition-colors
					"
				>
					Remove
				</button>
			}
		>
			<div className="text-[10px] text-text-secondary/50">
				{latStr}, {lngStr}
			</div>
		</BaseCard>
	);
}

import { useStore } from "../../state/store";
import { BaseCard } from "./BaseCard";

export function PointCutCard() {
	const selectedPointCutId = useStore((s) => s.selectedPointCutId);
	const cuts = useStore((s) => s.cuts);
	const removeCut = useStore((s) => s.removeCut);
	const selectPointCut = useStore((s) => s.selectPointCut);
	const simulation = useStore((s) => s.simulation);
	const cablesById = useStore((s) => s.cablesById);

	const cut = selectedPointCutId ? cuts.find((c) => c.id === selectedPointCutId) : null;

	if (!cut) return null;

	const latStr = `${Math.abs(cut.lat).toFixed(1)}°${cut.lat >= 0 ? "N" : "S"}`;
	const lngStr = `${Math.abs(cut.lng).toFixed(1)}°${cut.lng >= 0 ? "E" : "W"}`;

	// Find cables affected by this cut
	const affectedCables: { id: string; name: string }[] = [];
	if (simulation?.affectedEdgeIds) {
		const seen = new Set<string>();
		for (const edgeId of simulation.affectedEdgeIds) {
			const cableId = edgeId.split(":")[0];
			if (cableId === "terr" || seen.has(cableId)) continue;
			seen.add(cableId);
			const cable = cablesById.get(cableId);
			if (cable) affectedCables.push({ id: cable.id, name: cable.name });
		}
	}

	return (
		<BaseCard
			visible
			onClose={() => selectPointCut(null)}
			title={`${latStr}, ${lngStr}`}
			subtitle={
				<>
					<span className="font-data text-xs text-text-secondary">
						{cut.radius ?? 50} km radius
					</span>
					<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cable-cut/15 text-cable-cut">
						point cut
					</span>
				</>
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
			{affectedCables.length > 0 && (
				<>
					<div className="text-[9px] text-text-secondary/50 uppercase mb-1">
						Cables affected ({affectedCables.length})
					</div>
					{affectedCables.slice(0, 8).map((c) => (
						<div key={c.id} className="text-xs text-text-primary py-0.5 truncate">
							{c.name}
						</div>
					))}
					{affectedCables.length > 8 && (
						<div className="text-[10px] text-text-secondary/40 mt-1">
							+{affectedCables.length - 8} more
						</div>
					)}
				</>
			)}
			{affectedCables.length === 0 && (
				<div className="text-xs text-text-secondary/50">No cables in range</div>
			)}
		</BaseCard>
	);
}

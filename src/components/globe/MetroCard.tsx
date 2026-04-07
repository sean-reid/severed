import { useMemo } from "react";
import { useStore } from "../../state/store";
import { BaseCard } from "./BaseCard";

export function MetroCard() {
	const selectedMetroId = useStore((s) => s.selectedMetroId);
	const selectedCableId = useStore((s) => s.selectedCableId);
	const metrosById = useStore((s) => s.metrosById);
	const cables = useStore((s) => s.cables);
	const terrestrial = useStore((s) => s.terrestrial);
	const selectMetro = useStore((s) => s.selectMetro);
	const selectCable = useStore((s) => s.selectCable);
	const selectTerrestrial = useStore((s) => s.selectTerrestrial);

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

	return (
		<BaseCard
			visible={!!metro && !selectedCableId}
			onClose={() => selectMetro(null)}
			title={metro?.name ?? ""}
			subtitle={
				<>
					<span className="text-[10px] text-text-secondary">{metro?.countryCode}</span>
					{metro?.isHub && (
						<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cable-high/20 text-cable-high font-medium">
							hub
						</span>
					)}
					<span className="text-[10px] text-text-secondary">
						{connectedCables.length} cable{connectedCables.length !== 1 ? "s" : ""}
						{connectedTerrestrial.length > 0 && <> · {connectedTerrestrial.length} terrestrial</>}
					</span>
				</>
			}
			scrollable
		>
			{connectedCables.length > 0 && (
				<>
					<div className="text-[9px] text-text-secondary/50 uppercase mb-1">Submarine cables</div>
					{connectedCables.slice(0, 8).map((c) => (
						<button
							key={c.id}
							type="button"
							onClick={() => selectCable(c.id)}
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
								onClick={() => selectTerrestrial(t.id)}
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
		</BaseCard>
	);
}

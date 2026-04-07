import { useStore } from "../../state/store";
import { confidenceColors } from "../../utils/colors";
import { BaseCard } from "./BaseCard";

export function TerrestrialCard() {
	const selectedTerrestrialId = useStore((s) => s.selectedTerrestrialId);
	const terrestrial = useStore((s) => s.terrestrial);
	const metrosById = useStore((s) => s.metrosById);
	const selectTerrestrial = useStore((s) => s.selectTerrestrial);

	const edge = selectedTerrestrialId
		? terrestrial.find((t) => t.id === selectedTerrestrialId)
		: null;

	if (!edge) return null;

	const fromMetro = metrosById.get(edge.from);
	const toMetro = metrosById.get(edge.to);
	const conf = edge.confidence;

	return (
		<BaseCard
			visible
			onClose={() => selectTerrestrial(null)}
			title={
				<>
					{fromMetro?.name ?? edge.from} &mdash; {toMetro?.name ?? edge.to}
				</>
			}
			subtitle={
				<>
					<span className="font-data text-xs text-text-secondary">
						{edge.capacityTbps < 1
							? `${(edge.capacityTbps * 1000).toFixed(0)} Gbps`
							: `${edge.capacityTbps.toFixed(0)} Tbps`}
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
					<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[rgba(34,211,238,0.15)] text-[#22d3ee]">
						terrestrial
					</span>
				</>
			}
		>
			<div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
				<div className="text-text-secondary">Distance</div>
				<div className="font-data text-right">
					{edge.distanceKm > 0 ? `${edge.distanceKm.toLocaleString()} km` : "\u2014"}
				</div>
				<div className="text-text-secondary">Operators</div>
				<div className="text-right text-xs text-text-secondary/70">
					{edge.operators.length > 0 ? edge.operators.join(", ") : "\u2014"}
				</div>
			</div>

			<div className="mt-2 pt-2 border-t border-border/30">
				<div className="text-[10px] text-text-secondary/50 uppercase mb-1">Source</div>
				<div className="text-xs text-text-secondary leading-relaxed">{edge.source}</div>
			</div>

			{edge.notes && (
				<div className="text-[10px] text-cable-high/70 mt-1.5 italic">{edge.notes}</div>
			)}

			{edge.sourceUrl && (
				<a
					href={edge.sourceUrl}
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
		</BaseCard>
	);
}

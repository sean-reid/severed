import type { CapacityConfidence } from "../../data/types";
import { confidenceColors } from "../../utils/colors";

interface Props {
	confidence: CapacityConfidence;
	className?: string;
}

export function ConfidenceBadge({ confidence, className = "" }: Props) {
	return (
		<span
			className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium uppercase ${className}`}
			style={{
				backgroundColor: `${confidenceColors[confidence]}20`,
				color: confidenceColors[confidence],
			}}
		>
			{confidence}
		</span>
	);
}

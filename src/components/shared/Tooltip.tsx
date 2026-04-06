interface Props {
	children: React.ReactNode;
	x: number;
	y: number;
	visible: boolean;
}

export function Tooltip({ children, x, y, visible }: Props) {
	if (!visible) return null;

	return (
		<div
			className="absolute z-50 pointer-events-none bg-surface border border-border rounded-lg px-3 py-2 shadow-xl"
			style={{
				left: x + 12,
				top: y + 12,
				maxWidth: 300,
			}}
		>
			{children}
		</div>
	);
}

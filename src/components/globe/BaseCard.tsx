import { type ReactNode, useState } from "react";
import { useCardHeight } from "../../hooks/useCardHeight";
import { useStore } from "../../state/store";

interface BaseCardProps {
	/** Return null when false */
	visible: boolean;
	/** Called on close button -- should clear selection */
	onClose: () => void;
	/** Main title text */
	title: ReactNode;
	/** Secondary info line */
	subtitle: ReactNode;
	/** Optional action button between title and close (e.g. "Cut") */
	action?: ReactNode;
	/** Expanded content */
	children?: ReactNode;
	/** Use scrollable container for expanded content */
	scrollable?: boolean;
}

export function BaseCard({
	visible,
	onClose,
	title,
	subtitle,
	action,
	children,
	scrollable,
}: BaseCardProps) {
	const mobileSheetHeight = useStore((s) => s.mobileSheetHeight);
	const sheetDragging = useStore((s) => s.mobileSheetDragging);
	const cardRef = useCardHeight();
	const [expanded, setExpanded] = useState(false);

	if (!visible) return null;

	const cardHidden = mobileSheetHeight > 55;

	return (
		<div
			ref={cardRef}
			className={`absolute z-20 md:hidden left-3 right-3 ${sheetDragging ? "" : "transition-[bottom,opacity] duration-300 ease-out"} ${cardHidden ? "opacity-0 pointer-events-none" : "opacity-100"}`}
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
						<div className="text-sm text-text-primary font-medium truncate">{title}</div>
						<div className="flex items-center gap-2 mt-0.5">{subtitle}</div>
					</button>
					{action}
					<button
						type="button"
						onClick={() => {
							onClose();
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

				{/* Expanded content */}
				{expanded &&
					children &&
					(scrollable ? (
						<div className="px-4 pb-3 pt-1 border-t border-border/50 max-h-48 overflow-y-auto">
							{children}
						</div>
					) : (
						<button
							type="button"
							className="px-4 pb-3 pt-1 border-t border-border/50 w-full text-left"
							onClick={() => setExpanded(false)}
							onKeyDown={(e) => {
								if (e.key === "Enter") setExpanded(false);
							}}
						>
							{children}
						</button>
					))}
			</div>
		</div>
	);
}

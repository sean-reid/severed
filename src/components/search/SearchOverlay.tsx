import { useCallback, useEffect, useRef } from "react";
import { type SearchResult, type SearchResultType, useSearch } from "../../hooks/useSearch";
import { useStore } from "../../state/store";

const TYPE_COLORS: Record<SearchResultType, string> = {
	cable: "#60a5fa",
	metro: "#e2e8f0",
	terrestrial: "#22d3ee",
	scenario: "#ef4444",
};

const TYPE_LABELS: Record<SearchResultType, string> = {
	cable: "Cable",
	metro: "Metro",
	terrestrial: "Link",
	scenario: "Scenario",
};

interface Props {
	open: boolean;
	onClose: () => void;
}

export function SearchOverlay({ open, onClose }: Props) {
	const { query, setQuery, results } = useSearch();
	const selectCable = useStore((s) => s.selectCable);
	const selectMetro = useStore((s) => s.selectMetro);
	const selectTerrestrial = useStore((s) => s.selectTerrestrial);
	const applyScenario = useStore((s) => s.applyScenario);
	const flyToLocation = useStore((s) => s.flyToLocation);
	const inputRef = useRef<HTMLInputElement>(null);

	// Auto-focus input when opened
	useEffect(() => {
		if (open) {
			setQuery("");
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	}, [open, setQuery]);

	// Escape to close
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open, onClose]);

	const handleSelect = useCallback(
		(result: SearchResult) => {
			switch (result.type) {
				case "cable":
					selectCable(result.id);
					break;
				case "metro":
					selectMetro(result.id);
					break;
				case "terrestrial":
					selectTerrestrial(result.id);
					break;
				case "scenario":
					applyScenario(result.id);
					break;
			}
			if (result.lat != null && result.lng != null) {
				flyToLocation(result.lng, result.lat, result.type === "metro" ? 6 : 4);
			}
			onClose();
		},
		[selectCable, selectMetro, selectTerrestrial, applyScenario, flyToLocation, onClose],
	);

	if (!open) return null;

	// Group results by type
	const grouped = new Map<SearchResultType, SearchResult[]>();
	for (const r of results) {
		const arr = grouped.get(r.type) ?? [];
		arr.push(r);
		grouped.set(r.type, arr);
	}
	const groupOrder: SearchResultType[] = ["cable", "metro", "terrestrial", "scenario"];

	return (
		<div className="fixed inset-0 z-50 flex flex-col">
			{/* Backdrop */}
			<button
				type="button"
				className="absolute inset-0 bg-bg/90 backdrop-blur-md cursor-default"
				onClick={onClose}
			/>

			{/* Search container */}
			<div className="relative z-10 flex flex-col w-full max-w-xl mx-auto pt-[env(safe-area-inset-top)] px-4">
				{/* Input */}
				<div className="mt-4 md:mt-12 relative">
					<svg
						className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary/50"
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					>
						<title>Search</title>
						<circle cx="6.5" cy="6.5" r="5" />
						<line x1="10" y1="10" x2="15" y2="15" />
					</svg>
					<input
						ref={inputRef}
						type="text"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search cables, cities, operators..."
						className="
							w-full bg-surface border border-border/80 rounded-2xl
							pl-11 pr-10 py-4 text-text-primary text-base
							placeholder:text-text-secondary/40
							focus:outline-none focus:border-cable-high/50 focus:ring-1 focus:ring-cable-high/20
							transition-colors
						"
						autoComplete="off"
						autoCorrect="off"
						spellCheck={false}
					/>
					{query.length > 0 && (
						<button
							type="button"
							onClick={() => setQuery("")}
							className="absolute right-4 top-1/2 -translate-y-1/2 text-text-secondary/50 hover:text-text-primary transition-colors"
						>
							<svg
								width="14"
								height="14"
								viewBox="0 0 16 16"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							>
								<title>Clear</title>
								<line x1="4" y1="4" x2="12" y2="12" />
								<line x1="12" y1="4" x2="4" y2="12" />
							</svg>
						</button>
					)}
				</div>

				{/* Results */}
				{results.length > 0 && (
					<div className="mt-2 max-h-[60vh] overflow-y-auto rounded-2xl bg-surface border border-border/60 shadow-2xl shadow-black/40">
						{groupOrder.map((type) => {
							const items = grouped.get(type);
							if (!items || items.length === 0) return null;
							return (
								<div key={type}>
									<div className="sticky top-0 px-4 py-2 text-[10px] uppercase tracking-wider text-text-secondary/50 bg-surface border-b border-border/30">
										{TYPE_LABELS[type]}s
									</div>
									{items.map((r) => (
										<button
											key={`${r.type}-${r.id}`}
											type="button"
											onClick={() => handleSelect(r)}
											className="
												w-full flex items-center gap-3 px-4 py-3
												text-left hover:bg-border/30 active:bg-border/50
												transition-colors border-b border-border/10 last:border-b-0
											"
										>
											<span
												className="w-2 h-2 rounded-full flex-none"
												style={{ backgroundColor: TYPE_COLORS[r.type] }}
											/>
											<div className="min-w-0 flex-1">
												<div className="text-sm text-text-primary truncate">{r.title}</div>
												<div className="text-[11px] text-text-secondary/60 truncate">
													{r.subtitle}
												</div>
											</div>
											<span className="text-[9px] uppercase tracking-wider text-text-secondary/30 flex-none">
												{TYPE_LABELS[r.type]}
											</span>
										</button>
									))}
								</div>
							);
						})}
					</div>
				)}

				{/* Empty state */}
				{query.length >= 2 && results.length === 0 && (
					<div className="mt-2 px-4 py-8 text-center rounded-2xl bg-surface border border-border/60">
						<div className="text-sm text-text-secondary/50">No results for "{query}"</div>
					</div>
				)}

				{/* Hint */}
				{query.length < 1 && (
					<div className="mt-3 text-center text-[11px] text-text-secondary/30">
						Start typing to search
					</div>
				)}
			</div>
		</div>
	);
}

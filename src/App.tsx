import { useCallback, useEffect, useState } from "react";
import { CutAction } from "./components/globe/CutAction";
import { GlobeView } from "./components/globe/GlobeView";
import { TerrestrialCard } from "./components/globe/TerrestrialCard";
import { ImpactPanel } from "./components/panel/ImpactPanel";
import { SearchOverlay } from "./components/search/SearchOverlay";
import { DataSourcesPanel } from "./components/shared/DataSourcesPanel";
import { MobileScenarioBar } from "./components/sidebar/MobileScenarioBar";
import { Sidebar } from "./components/sidebar/Sidebar";
import { loadAppData } from "./data/loader";
import { useStore } from "./state/store";

export function App() {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [searchOpen, setSearchOpen] = useState(false);
	const initData = useStore((s) => s.initData);

	// Global `/` hotkey + sidebar button event to open search
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (
				e.key === "/" &&
				!e.ctrlKey &&
				!e.metaKey &&
				document.activeElement?.tagName !== "INPUT"
			) {
				e.preventDefault();
				setSearchOpen(true);
			}
		};
		const onCustom = () => setSearchOpen(true);
		window.addEventListener("keydown", onKey);
		window.addEventListener("open-search", onCustom);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("open-search", onCustom);
		};
	}, []);

	const closeSearch = useCallback(() => setSearchOpen(false), []);

	useEffect(() => {
		loadAppData()
			.then((data) => {
				initData(data);
				setLoading(false);
			})
			.catch((err) => {
				setError(err.message);
				setLoading(false);
			});
	}, [initData]);

	if (loading) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-bg">
				<div className="text-center">
					<div className="mb-4 font-data text-2xl text-cable-high">SEVERED</div>
					<div className="text-sm text-text-secondary">Loading cable network data...</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-bg">
				<div className="text-center">
					<div className="mb-4 font-data text-2xl text-cable-cut">ERROR</div>
					<div className="text-sm text-text-secondary">{error}</div>
				</div>
			</div>
		);
	}

	return (
		<div className="relative h-full w-full bg-bg">
			{/* Globe fills everything */}
			<GlobeView />

			{/* Desktop sidebar — hidden on mobile */}
			<div className="hidden md:block">
				<Sidebar />
			</div>

			{/* Mobile scenario chips — hidden on desktop */}
			<div className="md:hidden">
				<MobileScenarioBar />
			</div>

			{/* Floating cut action — appears when cable selected */}
			<CutAction />

			{/* Floating terrestrial info — appears when terrestrial edge selected */}
			<TerrestrialCard />

			{/* Impact panel — responsive (right panel desktop, bottom sheet mobile) */}
			<ImpactPanel />

			{/* Sources link — bottom center */}
			<DataSourcesPanel />

			{/* Search overlay */}
			<SearchOverlay open={searchOpen} onClose={closeSearch} />

			{/* Mobile search trigger */}
			<button
				type="button"
				onClick={() => setSearchOpen(true)}
				className="
					absolute z-30 md:hidden
					top-3 right-3
					w-11 h-11 rounded-xl bg-surface/95 backdrop-blur-sm
					border border-border flex items-center justify-center
					text-text-secondary active:bg-border/60 transition-colors
					shadow-lg shadow-black/30
				"
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
					<title>Search</title>
					<circle cx="6.5" cy="6.5" r="5" />
					<line x1="10" y1="10" x2="15" y2="15" />
				</svg>
			</button>
		</div>
	);
}

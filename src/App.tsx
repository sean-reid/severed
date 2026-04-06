import { useEffect, useState } from "react";
import { GlobeView } from "./components/globe/GlobeView";
import { ImpactPanel } from "./components/panel/ImpactPanel";
import { Sidebar } from "./components/sidebar/Sidebar";
import { MobileScenarioBar } from "./components/sidebar/MobileScenarioBar";
import { CutAction } from "./components/globe/CutAction";
import { DataSourcesPanel } from "./components/shared/DataSourcesPanel";
import { loadAppData } from "./data/loader";
import { useStore } from "./state/store";

export function App() {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const initData = useStore((s) => s.initData);

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

			{/* Impact panel — responsive (right panel desktop, bottom sheet mobile) */}
			<ImpactPanel />

			{/* Sources link — bottom center */}
			<DataSourcesPanel />
		</div>
	);
}

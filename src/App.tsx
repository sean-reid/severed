import { useEffect, useState } from "react";
import { GlobeView } from "./components/globe/GlobeView";
import { ImpactPanel } from "./components/panel/ImpactPanel";
import { Sidebar } from "./components/sidebar/Sidebar";
import { MobileScenarioBar } from "./components/sidebar/MobileScenarioBar";
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
			<GlobeView />
			{/* Desktop: full sidebar. Mobile: hidden, replaced by floating scenario chips */}
			<div className="hidden md:block">
				<Sidebar />
			</div>
			{/* Mobile: floating scenario chips at top */}
			<MobileScenarioBar />
			<ImpactPanel />
			<DataSourcesPanel />
		</div>
	);
}

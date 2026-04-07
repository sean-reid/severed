import { useCallback, useMemo } from "react";
import type { CutLocation, TerrestrialEdge } from "../../data/types";
import { useStore } from "../../state/store";

export function Sidebar() {
	const scenarios = useStore((s) => s.scenarios);
	const activeScenarioId = useStore((s) => s.activeScenarioId);
	const selectedCableId = useStore((s) => s.selectedCableId);
	const selectedMetroId = useStore((s) => s.selectedMetroId);
	const selectedTerrestrialId = useStore((s) => s.selectedTerrestrialId);
	const cablesById = useStore((s) => s.cablesById);
	const terrestrial = useStore((s) => s.terrestrial);
	const cables = useStore((s) => s.cables);
	const metrosById = useStore((s) => s.metrosById);
	const addCut = useStore((s) => s.addCut);
	const selectCable = useStore((s) => s.selectCable);
	const selectMetro = useStore((s) => s.selectMetro);
	const sidebarOpen = useStore((s) => s.sidebarOpen);
	const toggleSidebar = useStore((s) => s.toggleSidebar);
	const panelOpen = useStore((s) => s.panelOpen);
	const togglePanel = useStore((s) => s.togglePanel);

	const selectedCable = selectedCableId ? cablesById.get(selectedCableId) : null;
	const selectedTerrestrial = selectedTerrestrialId
		? terrestrial.find((t) => t.id === selectedTerrestrialId)
		: null;
	const selectTerrestrial = useStore((s) => s.selectTerrestrial);

	const storeApplyScenario = useStore((s) => s.applyScenario);

	const cutSelectedCable = useCallback(() => {
		if (!selectedCable) return;
		// Cut the entire cable by adding all its segment IDs
		const segmentIds = selectedCable.segments.map((_seg, i) => `${selectedCable.id}:${i}`);
		const cut: CutLocation = {
			id: `cable-${selectedCable.id}`,
			type: "point",
			lat: 0,
			lng: 0,
			affectedSegmentIds: segmentIds,
		};
		addCut(cut);
		selectCable(null);
	}, [selectedCable, addCut, selectCable]);

	return (
		<>
			{/* Mobile toggle button — 44px min touch target */}
			<button
				type="button"
				onClick={toggleSidebar}
				className="
					absolute top-3 left-3 z-30 md:hidden
					w-11 h-11 rounded-xl bg-surface/95 backdrop-blur-sm
					border border-border flex items-center justify-center
					text-text-primary active:bg-border/60 transition-colors
					shadow-lg shadow-black/30
				"
			>
				{sidebarOpen ? (
					<svg
						width="18"
						height="18"
						viewBox="0 0 18 18"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					>
						<title>Close sidebar</title>
						<line x1="4" y1="4" x2="14" y2="14" />
						<line x1="14" y1="4" x2="4" y2="14" />
					</svg>
				) : (
					<svg
						width="18"
						height="18"
						viewBox="0 0 18 18"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
					>
						<title>Open sidebar</title>
						<line x1="3" y1="5" x2="15" y2="5" />
						<line x1="3" y1="9" x2="15" y2="9" />
						<line x1="3" y1="13" x2="15" y2="13" />
					</svg>
				)}
			</button>

			{/* Sidebar panel */}
			<div
				className={`
					absolute left-0 top-0 z-20 flex flex-col overflow-hidden
					bg-surface/90 backdrop-blur-sm border-r border-border
					transition-transform duration-300
					w-52 h-full
					${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
				`}
			>
				{/* Header */}
				<div className="px-4 py-4 border-b border-border">
					<h1 className="font-data text-lg font-bold tracking-widest text-cable-high">SEVERED</h1>
					<p className="text-[10px] text-text-secondary mt-1 uppercase tracking-wider">
						Submarine Cable Failure Simulator
					</p>
				</div>

				{/* Selected cable info */}
				{selectedCable && (
					<div className="px-4 py-3 border-b border-border bg-border/20">
						<div className="text-xs text-text-secondary uppercase">Selected Cable</div>
						<div className="text-sm font-semibold text-text-primary mt-1">{selectedCable.name}</div>
						<div className="flex items-center gap-2 mt-1">
							<span className="font-data text-xs text-text-secondary">
								{selectedCable.designCapacityTbps.toFixed(0)} Tbps
							</span>
							<span
								className="text-[9px] px-1.5 py-0.5 rounded-full"
								style={{
									backgroundColor:
										selectedCable.capacityConfidence === "verified"
											? "rgba(96,165,250,0.2)"
											: selectedCable.capacityConfidence === "estimated"
												? "rgba(245,158,11,0.2)"
												: "rgba(148,163,184,0.2)",
									color:
										selectedCable.capacityConfidence === "verified"
											? "#60a5fa"
											: selectedCable.capacityConfidence === "estimated"
												? "#f59e0b"
												: "#94a3b8",
								}}
							>
								{selectedCable.capacityConfidence}
							</span>
						</div>
						<div className="text-[10px] text-text-secondary mt-1">
							RFS {selectedCable.rfsYear} &middot; {selectedCable.owners.join(", ")}
						</div>
						<div className="flex items-center gap-2 mt-1">
							<span className="text-[9px] text-text-secondary/60 italic">
								{selectedCable.capacitySource === "heuristic"
									? "RFS-year heuristic"
									: selectedCable.capacitySource === "fcc"
										? "FCC filing"
										: selectedCable.capacitySource === "press"
											? "Press release"
											: selectedCable.capacitySource === "wikipedia"
												? "Wikipedia"
												: "Derived from fiber pairs"}
							</span>
							{selectedCable.sourceUrl && (
								<a
									href={selectedCable.sourceUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-0.5 text-[9px] text-cable-high hover:text-text-primary transition-colors"
								>
									<svg
										width="8"
										height="8"
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
						</div>
						<button
							type="button"
							onClick={cutSelectedCable}
							className="
								mt-3 w-full py-2 rounded-lg
								bg-cable-cut/20 border border-cable-cut/40
								text-cable-cut text-xs font-semibold uppercase tracking-wider
								hover:bg-cable-cut/30 transition-colors
							"
						>
							Cut This Cable
						</button>
					</div>
				)}

				{/* Selected terrestrial edge info */}
				{selectedTerrestrial && (
					<SelectedTerrestrialInfo
						edge={selectedTerrestrial}
						metrosById={metrosById}
						onClose={() => selectTerrestrial(null)}
					/>
				)}

				{/* Selected metro info */}
				<SelectedMetroInfo
					metroId={selectedMetroId}
					metrosById={metrosById}
					cables={cables}
					selectMetro={selectMetro}
					selectCable={selectCable}
				/>

				{/* Scenarios */}
				<div className="flex-1 overflow-y-auto px-4 py-3">
					<div className="text-[10px] text-text-secondary uppercase tracking-wider mb-2">
						Scenarios
					</div>
					<div className="flex flex-col gap-1.5">
						{scenarios.map((scenario) => {
							const isActive = activeScenarioId === scenario.id;
							return (
								<button
									key={scenario.id}
									type="button"
									onClick={() => storeApplyScenario(scenario.id)}
									className={`
										text-left px-3 py-2 rounded-lg border transition-colors text-xs
										${
											isActive
												? "border-cable-cut bg-cable-cut/15 text-cable-cut font-semibold"
												: "border-border/50 text-text-primary hover:bg-border/30"
										}
									`}
								>
									<div className="flex items-center gap-2">
										{isActive && (
											<span className="w-1.5 h-1.5 rounded-full bg-cable-cut flex-none" />
										)}
										{scenario.name}
									</div>
								</button>
							);
						})}
					</div>

					{/* Panel toggle */}
					{!panelOpen && (
						<button
							type="button"
							onClick={togglePanel}
							className="
								mt-4 w-full py-2 rounded-lg border border-cable-high/30
								text-cable-high text-[10px] uppercase tracking-wider
								hover:bg-cable-high/10 transition-colors
							"
						>
							Show Results Panel
						</button>
					)}
				</div>
			</div>
		</>
	);
}

// ── Metro info sub-component ──

function SelectedMetroInfo({
	metroId,
	metrosById,
	cables,
	selectMetro,
	selectCable,
}: {
	metroId: string | null;
	metrosById: Map<
		string,
		{ id: string; name: string; countryCode: string; isHub: boolean; landingStationCount: number }
	>;
	cables: {
		id: string;
		name: string;
		designCapacityTbps: number;
		segments: { from: string; to: string }[];
	}[];
	selectMetro: (id: string | null) => void;
	selectCable: (id: string | null) => void;
}) {
	const metro = metroId ? metrosById.get(metroId) : null;

	const connectedCables = useMemo(() => {
		if (!metroId) return [];
		return cables.filter((c) => c.segments.some((s) => s.from === metroId || s.to === metroId));
	}, [metroId, cables]);

	if (!metro) return null;

	return (
		<div className="px-4 py-3 border-b border-border bg-border/20">
			<div className="flex items-center justify-between">
				<div>
					<div className="text-xs text-text-secondary uppercase">Selected Metro</div>
					<div className="text-sm font-semibold text-text-primary mt-1">{metro.name}</div>
					<div className="flex items-center gap-2 mt-0.5">
						<span className="text-[10px] text-text-secondary">{metro.countryCode}</span>
						{metro.isHub && (
							<span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cable-high/20 text-cable-high">
								hub
							</span>
						)}
					</div>
				</div>
				<button
					type="button"
					onClick={() => selectMetro(null)}
					className="text-text-secondary/50 hover:text-text-primary text-xs"
				>
					Close
				</button>
			</div>

			<div className="mt-2 text-xs text-text-secondary">
				{metro.landingStationCount} landing station{metro.landingStationCount !== 1 ? "s" : ""}{" "}
				&middot; {connectedCables.length} cable{connectedCables.length !== 1 ? "s" : ""}
			</div>

			{connectedCables.length > 0 && (
				<div className="mt-2 pt-2 border-t border-border/50 max-h-40 overflow-y-auto">
					<div className="text-[9px] text-text-secondary/50 uppercase mb-1">Connected cables</div>
					{connectedCables.map((c) => (
						<button
							key={c.id}
							type="button"
							onClick={() => selectCable(c.id)}
							className="w-full flex justify-between text-xs py-1 px-1 -mx-1 rounded hover:bg-border/30 text-left transition-colors"
						>
							<span className="text-text-primary truncate">{c.name}</span>
							<span className="font-data text-text-secondary/60 ml-2 flex-none">
								{c.designCapacityTbps.toFixed(0)} Tbps
							</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

// ── Terrestrial edge info sub-component ──

function SelectedTerrestrialInfo({
	edge,
	metrosById,
	onClose,
}: {
	edge: TerrestrialEdge;
	metrosById: Map<string, { id: string; name: string; countryCode: string }>;
	onClose: () => void;
}) {
	const fromMetro = metrosById.get(edge.from);
	const toMetro = metrosById.get(edge.to);
	const confidenceColor =
		edge.confidence === "verified"
			? "#60a5fa"
			: edge.confidence === "estimated"
				? "#f59e0b"
				: "#94a3b8";

	return (
		<div className="px-4 py-3 border-b border-border bg-border/20">
			<div className="flex items-center justify-between">
				<div className="text-xs text-text-secondary uppercase">Terrestrial Link</div>
				<button
					type="button"
					onClick={onClose}
					className="text-text-secondary/50 hover:text-text-primary text-xs"
				>
					Close
				</button>
			</div>
			<div className="text-sm font-semibold text-text-primary mt-1">
				{fromMetro?.name ?? edge.from} &mdash; {toMetro?.name ?? edge.to}
			</div>
			<div className="flex items-center gap-2 mt-1">
				<span className="font-data text-xs text-text-secondary">
					{edge.capacityTbps < 1
						? `${(edge.capacityTbps * 1000).toFixed(0)} Gbps`
						: `${edge.capacityTbps.toFixed(0)} Tbps`}
				</span>
				<span
					className="text-[9px] px-1.5 py-0.5 rounded-full"
					style={{
						backgroundColor: `${confidenceColor}33`,
						color: confidenceColor,
					}}
				>
					{edge.confidence}
				</span>
				{edge.distanceKm > 0 && (
					<span className="text-[10px] text-text-secondary">
						{edge.distanceKm.toLocaleString()} km
					</span>
				)}
			</div>

			{edge.operators.length > 0 && (
				<div className="text-[10px] text-text-secondary mt-1.5">{edge.operators.join(", ")}</div>
			)}

			<div className="text-[10px] text-text-secondary/60 mt-1.5 leading-relaxed">{edge.source}</div>

			{edge.notes && <div className="text-[10px] text-cable-high/70 mt-1 italic">{edge.notes}</div>}

			{edge.sourceUrl && (
				<a
					href={edge.sourceUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 mt-2 text-[10px] text-cable-high hover:text-text-primary transition-colors"
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
		</div>
	);
}

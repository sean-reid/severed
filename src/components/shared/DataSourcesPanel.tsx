import { useState } from "react";
import { useStore } from "../../state/store";

export function DataSourcesPanel() {
	const [open, setOpen] = useState(false);
	const mobileSheetHeight = useStore((s) => s.mobileSheetHeight);
	const selectedCableId = useStore((s) => s.selectedCableId);
	const selectedMetroId = useStore((s) => s.selectedMetroId);
	const selectedTerrestrialId = useStore((s) => s.selectedTerrestrialId);
	const hasSelection = selectedCableId || selectedMetroId || selectedTerrestrialId;

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={`
					absolute z-10
					px-3 py-1.5 rounded-full
					bg-surface/70 backdrop-blur-sm border border-border/50
					text-[10px] text-text-secondary hover:text-text-primary
					uppercase tracking-wider transition-colors
					md:bottom-3 md:left-1/2 md:-translate-x-1/2
					max-md:right-4 max-md:left-auto
					${hasSelection ? "max-md:hidden" : ""}
				`}
				style={{
					bottom:
						typeof window !== "undefined" && window.innerWidth < 768
							? `calc(${mobileSheetHeight}dvh + 8px)`
							: undefined,
				}}
			>
				Sources
			</button>

			{/* Panel overlay */}
			{open && (
				<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
					{/* Backdrop */}
					<button
						type="button"
						className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-default"
						onClick={() => setOpen(false)}
						onKeyDown={(e) => {
							if (e.key === "Enter") setOpen(false);
						}}
					/>

					{/* Panel */}
					<div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl bg-surface border border-border shadow-2xl">
						<div className="sticky top-0 flex items-center justify-between px-6 py-4 bg-surface border-b border-border">
							<h2 className="font-data text-sm font-semibold tracking-wider">
								DATA SOURCES &amp; METHODOLOGY
							</h2>
							<button
								type="button"
								onClick={() => setOpen(false)}
								className="text-text-secondary hover:text-text-primary text-xs"
							>
								CLOSE
							</button>
						</div>

						<div className="px-6 py-5 space-y-6 text-sm text-text-secondary leading-relaxed">
							<section>
								<h3 className="text-text-primary font-semibold mb-2">Submarine Cables</h3>
								<p>
									Routes and landing stations from{" "}
									<a
										href="https://www.submarinecablemap.com"
										target="_blank"
										rel="noopener noreferrer"
										className="text-cable-high hover:text-text-primary transition-colors"
									>
										TeleGeography's Submarine Cable Map
									</a>{" "}
									(CC BY-SA, ~692 cables). TeleGeography does not publish capacity. 110 cables have
									verified or estimated capacity from press releases and industry sources (with
									direct links). The remaining ~484 use an RFS-year heuristic:
								</p>
								<div className="mt-2 font-data text-xs grid grid-cols-2 gap-x-4 gap-y-0.5 pl-2">
									<span className="text-text-secondary/60">Before 2005</span>
									<span>4 Tbps</span>
									<span className="text-text-secondary/60">2005&ndash;2012</span>
									<span>15 Tbps</span>
									<span className="text-text-secondary/60">2012&ndash;2018</span>
									<span>50 Tbps</span>
									<span className="text-text-secondary/60">2018&ndash;2022</span>
									<span>200 Tbps</span>
									<span className="text-text-secondary/60">2022+</span>
									<span>280 Tbps</span>
								</div>
								<p className="mt-2 text-xs text-text-secondary/60">
									Click any cable to see its capacity source. Cables with verified data show a
									"Source" link.
								</p>
							</section>

							<section>
								<h3 className="text-text-primary font-semibold mb-2">Terrestrial Backbone</h3>
								<p>
									151 overland fiber edges hand-curated from operator network maps, press releases,
									and industry publications. Each edge lists named operators, a confidence level,
									and where available a direct link to the supporting source.
								</p>
								<p className="mt-2 text-xs text-text-secondary/60">
									Click any cyan terrestrial link on the map to see operators, capacity, and source.
								</p>
							</section>

							<section>
								<h3 className="text-text-primary font-semibold mb-2">Confidence Levels</h3>
								<div className="space-y-2">
									<div className="flex items-start gap-2">
										<span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-medium bg-confidence-verified/20 text-confidence-verified flex-none">
											verified
										</span>
										<span>
											Operator or credible industry source published a specific capacity figure.
										</span>
									</div>
									<div className="flex items-start gap-2">
										<span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-medium bg-confidence-estimated/20 text-confidence-estimated flex-none">
											estimated
										</span>
										<span>
											Capacity from an industry publication or press release, with a linked source.
										</span>
									</div>
									<div className="flex items-start gap-2">
										<span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-medium bg-confidence-approximated/20 text-confidence-approximated flex-none">
											approximated
										</span>
										<span>
											<strong className="text-text-primary">Cables:</strong> RFS-year heuristic (see
											table above). <strong className="text-text-primary">Terrestrial:</strong>{" "}
											derived from known operators on the corridor, no specific publication.
										</span>
									</div>
								</div>
							</section>

							<section>
								<h3 className="text-text-primary font-semibold mb-2">Simulation</h3>
								<p>
									Graph model with 930 metro nodes, ~1,500 cable segments, 151 terrestrial edges,
									and 92 hub metros. Cutting a cable removes only the segments at the cut location.
									Impact is the change in aggregate bottleneck bandwidth from each metro to the hub
									set.
								</p>
								<p className="mt-2 text-xs text-text-secondary/60">
									This is not a BGP simulation. It does not model routing policy, peering, or
									traffic engineering.
								</p>
							</section>

							<section>
								<h3 className="text-text-primary font-semibold mb-2">Limitations</h3>
								<ul className="list-disc list-inside space-y-1 pl-2">
									<li>Uses design capacity, not actual lit capacity</li>
									<li>Developing-world estimates have wider error bars</li>
									<li>Point-in-time snapshot (April 2026); backbone capacity grows 25-40%/year</li>
								</ul>
							</section>

							<section className="pt-2 border-t border-border/50 flex flex-col gap-2">
								<a
									href="https://sean-reid.github.io/blog/severed.html"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-xs text-cable-high hover:text-text-primary transition-colors"
								>
									<svg
										width="14"
										height="14"
										viewBox="0 0 16 16"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<title>Blog post</title>
										<path d="M2 3h12v10H2z" />
										<path d="M5 6h6M5 8.5h4" />
									</svg>
									Read the methodology and findings
								</a>
								<a
									href="https://github.com/sean-reid/severed"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-xs text-text-secondary/60 hover:text-text-primary transition-colors"
								>
									<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
										<title>GitHub</title>
										<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
									</svg>
									View source on GitHub
								</a>
							</section>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

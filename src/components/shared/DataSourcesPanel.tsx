import { useState } from "react";
import { useStore } from "../../state/store";

export function DataSourcesPanel() {
	const [open, setOpen] = useState(false);
	const mobileSheetHeight = useStore((s) => s.mobileSheetHeight);
	const selectedCableId = useStore((s) => s.selectedCableId);

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
					${selectedCableId ? "max-md:hidden" : ""}
				`}
				style={{
					bottom: typeof window !== "undefined" && window.innerWidth < 768
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
					<div
						className="absolute inset-0 bg-black/60 backdrop-blur-sm"
						onClick={() => setOpen(false)}
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
								<h3 className="text-text-primary font-semibold mb-2">Submarine Cable Data</h3>
								<p>
									Cable routes, landing stations, and metadata are sourced from{" "}
									<strong className="text-text-primary">TeleGeography's Submarine Cable Map</strong>{" "}
									(submarinecablemap.com), a free CC BY-SA dataset covering ~692 cables worldwide.
								</p>
								<p className="mt-2">
									TeleGeography does not publish capacity data. We estimate capacity using a multi-source pipeline:
								</p>
								<ol className="list-decimal list-inside mt-2 space-y-1 pl-2">
									<li>FCC cable landing license filings (US-connected cables)</li>
									<li>Press releases and Wikipedia (announced Tbps at RFS)</li>
									<li>Fiber pair count × per-pair generation model</li>
									<li>RFS-year generation heuristic (fallback)</li>
								</ol>
							</section>

							<section>
								<h3 className="text-text-primary font-semibold mb-2">Capacity Confidence Levels</h3>
								<div className="space-y-2">
									<div className="flex items-start gap-2">
										<span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-medium bg-confidence-verified/20 text-confidence-verified">
											verified
										</span>
										<span>
											An operator or credible industry source published a specific Tbps number for this exact cable or corridor.
										</span>
									</div>
									<div className="flex items-start gap-2">
										<span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-medium bg-confidence-estimated/20 text-confidence-estimated">
											estimated
										</span>
										<span>
											Derived from the number of known operators on a corridor × typical per-operator capacity, calibrated against published anchor points, with a 70% discount for shared infrastructure and unlit capacity.
										</span>
									</div>
									<div className="flex items-start gap-2">
										<span className="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-medium bg-confidence-approximated/20 text-confidence-approximated">
											approximated
										</span>
										<span>
											No operator data available. Inferred from the corridor's economic importance and comparison to known corridors in the same region. Order-of-magnitude confidence only.
										</span>
									</div>
								</div>
							</section>

							<section>
								<h3 className="text-text-primary font-semibold mb-2">Terrestrial Edge Estimation</h3>
								<p>
									Overland fiber capacity between cities is not publicly available in any dataset.
									We hand-curate each edge using this process:
								</p>
								<ol className="list-decimal list-inside mt-2 space-y-1 pl-2">
									<li>
										<strong className="text-text-primary">Identify operators</strong> — from published network maps (Lumen, Zayo, euNetworks, EXA, Telia, etc.)
									</li>
									<li>
										<strong className="text-text-primary">Estimate per-operator capacity</strong> — Tier 1 on core route: 30–80 Tbps; major regional: 15–40 Tbps; developing-world: 1–12 Tbps
									</li>
									<li>
										<strong className="text-text-primary">Sum and discount</strong> — raw sum × 70% to account for shared fiber, unlit capacity, incomplete operator list
									</li>
									<li>
										<strong className="text-text-primary">Cross-check</strong> — against published regional bandwidth totals (TeleGeography) and operator-specific anchor points
									</li>
								</ol>
								<p className="mt-2 text-text-secondary/70 text-xs">
									This methodology and the full source list for every edge is documented in the project's{" "}
									<span className="font-data">ARCHITECTURE.md</span> Appendix B.
								</p>
							</section>

							<section>
								<h3 className="text-text-primary font-semibold mb-2">Simulation Model</h3>
								<p>
									The simulation uses a graph-theoretic model, not full BGP routing simulation.
									Nodes are metro areas (~900), edges are cable segments + terrestrial links weighted by capacity.
								</p>
								<p className="mt-2">
									When a cable is cut at a location, only the segments crossing that location are removed —
									segments on either side continue to function. Bandwidth impact is computed as aggregate
									bottleneck capacity from each metro to a set of ~45 global hub metros.
								</p>
							</section>

							<section>
								<h3 className="text-text-primary font-semibold mb-2">Known Limitations</h3>
								<ul className="list-disc list-inside space-y-1 pl-2">
									<li>Uses design capacity (fully equipped potential), not actual lit capacity</li>
									<li>Cannot distinguish shared from independent fiber between operators</li>
									<li>Developing-world estimates have wider error bars</li>
									<li>All estimates are point-in-time (April 2026); backbone capacity grows 25–40%/year</li>
									<li>Does not model BGP routing policy, peering agreements, or traffic engineering</li>
								</ul>
							</section>

							<section className="pt-2 border-t border-border/50">
								<a
									href="https://github.com/sean-reid/severed"
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-xs text-cable-high hover:text-text-primary transition-colors"
								>
									<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
										<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/>
									</svg>
									View source on GitHub
								</a>
								<p className="text-[10px] text-text-secondary/50 mt-1">
									Full methodology, edge-by-edge sources, and validation test cases in ARCHITECTURE.md
								</p>
							</section>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

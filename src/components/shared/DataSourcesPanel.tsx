import { useState } from "react";

export function DataSourcesPanel() {
	const [open, setOpen] = useState(false);

	return (
		<>
			{/* Positioned bottom-center so it's visible regardless of sidebar/panel state */}
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="
					absolute bottom-3 left-1/2 -translate-x-1/2 z-10
					px-3 py-1.5 rounded-full
					bg-surface/70 backdrop-blur-sm border border-border/50
					text-[10px] text-text-secondary hover:text-text-primary
					uppercase tracking-wider transition-colors
				"
			>
				Sources &amp; Methodology
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
						</div>
					</div>
				</div>
			)}
		</>
	);
}

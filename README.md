# Severed

Interactive submarine cable failure simulator. Cut cables on a globe, watch traffic reroute, see which cities lose bandwidth.

![Dark-themed globe with submarine cables rendered as blue lines](https://img.shields.io/badge/status-MVP-blue)

## What it does

Click a submarine cable or select a chokepoint scenario (Red Sea, Luzon Strait, Baltic Sea, etc.) to simulate a failure. The app computes which metros lose connectivity, how much bandwidth disappears, where traffic reroutes, and whether the network absorbs the cut.

Built on real data: 594 operational cables from TeleGeography, 910 metro nodes, 104 hand-researched terrestrial backbone edges, and a graph engine that runs in a Web Worker.

## Quick start

```bash
pnpm install
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

### Rebuild data from source

The static JSON data files are pre-built in `public/data/`. To regenerate from TeleGeography's API:

```bash
pnpm data:fetch    # ~2 min — downloads 692 cable details with rate limiting
pnpm data:build    # ~1 sec — clusters metros, estimates capacity, writes JSON
```

### Run tests

```bash
pnpm test          # 11 validation tests against real-world cable cut events
```

## Data sources

| Data | Source | License |
|------|--------|---------|
| Cable routes & landing stations | [TeleGeography Submarine Cable Map](https://www.submarinecablemap.com/) | CC BY-SA |
| Cable capacity | Estimated via RFS-year heuristic (see methodology) | — |
| Terrestrial backbone edges | Hand-curated from operator press releases, network maps, industry reports | — |
| Chokepoint definitions | Hand-defined polygons from geographic research | — |

Every capacity number has a confidence level (`verified`, `estimated`, `approximated`) with documented methodology. Click "Sources & Methodology" in the app for details, or see `ARCHITECTURE.md` Appendix B.

## How the simulation works

1. Build a weighted graph: metros as nodes, cable segments + terrestrial links as edges weighted by capacity (Tbps)
2. Compute baseline metrics: each metro's aggregate bandwidth to ~45 global hub metros via bottleneck shortest paths
3. On cut: remove edges that cross the cut location, recompute metrics, diff against baseline
4. Report per-metro: bandwidth loss %, latency change, path diversity, rerouting paths

Graph engine runs in a Web Worker. Full simulation completes in <200ms.

## Validation

The simulation is tested against 8 documented real-world cable cut events:

| Event | Year | Key result |
|-------|------|------------|
| Red Sea (Houthi) | 2024 | WANA region bandwidth loss, East Africa resilient |
| Baltic Sea sabotage | 2024 | High redundancy — near-zero impact |
| Mediterranean cuts | 2008 | Egypt -70%, India -60% |
| Taiwan earthquake | 2006 | Luzon Strait chokepoint validated |
| Tonga eruption | 2022 | Single-cable isolation |
| West Africa cuts | 2024 | Regional cascade, Equiano absorbs |
| East Africa cuts | 2024 | Compounding failure scenario |
| Egypt landing damage | 2022 | Landing-point vulnerability |

## Tech stack

React 19, TypeScript, Vite, Deck.gl 9, MapLibre GL, Zustand, Tailwind CSS 4, D3, Vitest, Biome, pnpm.

CARTO Dark Matter basemap (free, no API key).

## Project structure

```
src/
  components/     UI — globe, impact panel, sidebar, mobile scenario bar
  engine/         Graph, pathfinding, simulation, Web Worker
  data/           Types, data loader
  state/          Zustand store
  utils/          Geo math, color scales
scripts/          Data pipeline (fetch TeleGeography, build static JSON)
public/data/      Pre-built static datasets (committed)
```

See `ARCHITECTURE.md` for full design documentation including:
- Metro-level graph model and hub-set bandwidth metric
- Location-based cut resolution
- Terrestrial edge estimation methodology with worked examples
- Capacity confidence framework
- Real-world validation test cases with expected outcomes

## License

MIT

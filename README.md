# Severed

Interactive submarine cable failure simulator. Cut cables on a globe, watch traffic reroute, see which cities lose bandwidth.

![Dark-themed globe with submarine cables rendered as blue lines](https://img.shields.io/badge/status-MVP-blue)

## What it does

Click a submarine cable or select a historical scenario (Red Sea 2024, Baltic Sea 2024, Luzon Strait 2006, etc.) to simulate a failure. The app computes which metros lose connectivity, how much bandwidth disappears, where traffic reroutes, and whether the network absorbs the cut.

Built on real data: 594 operational cables from TeleGeography (110 with verified/estimated capacity from primary sources), 930 metro nodes, 151 hand-researched terrestrial backbone edges, 92 hub metros, and a graph engine that runs in a Web Worker. Search across everything with `/`.

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
pnpm test          # 16 validation tests against real-world cable cut events
pnpm test:e2e      # 24 Puppeteer E2E tests across desktop + mobile viewports
```

## Data sources

| Data | Source | License |
|------|--------|---------|
| Cable routes & landing stations | [TeleGeography Submarine Cable Map](https://www.submarinecablemap.com/) | CC BY-SA |
| Cable capacity | Estimated via RFS-year heuristic calibrated against real cables (see comments in `build-data.ts`) | — |
| Terrestrial backbone edges | Hand-curated from industry publications (Lightwave, TelecomTV, Capacity Media, SubTel Forum), operator press releases, and network maps. 127 of 151 edges have source URLs. | — |
| Chokepoint definitions | Hand-defined polygons from geographic research | — |

Every capacity number has a confidence level (`verified`, `estimated`, `approximated`). Click "Sources" in the app for methodology, or click any cable or terrestrial link on the map to see its specific source and confidence.

## How the simulation works

1. Build a weighted graph: metros as nodes, cable segments + terrestrial links as edges weighted by capacity (Tbps)
2. Compute baseline metrics: each metro's aggregate bandwidth to 92 global hub metros via bottleneck shortest paths
3. On cut: remove edges that cross the cut location, recompute metrics, diff against baseline
4. Report per-metro: bandwidth loss %, latency change, path diversity, rerouting paths

Graph engine runs in a Web Worker. Full simulation completes in <200ms.

## Validation

The simulation is tested against 10 documented real-world cable cut events:

| Event | Year | Key result | Sources |
|-------|------|------------|---------|
| Red Sea (Houthi) | 2024 | 3 cables cut (AAE-1, EIG, SEACOM), 25% Asia-Europe traffic disrupted | [Al Jazeera](https://www.aljazeera.com/news/2024/3/6/why-are-people-blaming-the-houthis-for-cutting-the-red-sea-cables), [Cloudflare](https://blog.cloudflare.com/east-african-internet-connectivity-again-impacted-by-submarine-cable-cuts/) |
| Baltic Sea sabotage | 2024 | BCS + C-Lion1 cut, high redundancy — near-zero impact | [Wikipedia](https://en.wikipedia.org/wiki/2024_Baltic_Sea_submarine_cable_disruptions) |
| Mediterranean cuts | 2008 | SEA-ME-WE 4 + FLAG cut, Egypt -70%, India -60% | [Wikipedia](https://en.wikipedia.org/wiki/2008_submarine_cable_disruption) |
| Taiwan earthquake | 2006 | 8-22 cable breaks in Luzon Strait, Asia-wide disruption | [Wikipedia](https://en.wikipedia.org/wiki/2006_Hengchun_earthquakes) |
| Tonga eruption | 2022 | Tonga Cable destroyed, 5 weeks isolated | [Wikipedia](https://en.wikipedia.org/wiki/2022_Hunga_Tonga%E2%80%93Hunga_Ha%CA%BBapai_eruption_and_tsunami) |
| West Africa cuts | 2024 | WACS + MainOne + SAT-3 + ACE cut, 13 countries impacted | [Cloudflare](https://blog.cloudflare.com/undersea-cable-failures-cause-internet-disruptions-across-africa-march-14-2024/) |
| East Africa cuts | 2024 | EASSy + Seacom cut near Durban, compounding Red Sea damage | [Cloudflare](https://blog.cloudflare.com/east-african-internet-connectivity-again-impacted-by-submarine-cable-cuts/) |
| Egypt landing damage | 2022 | AAE-1 + SMW-5 cut at landing points | [Cloudflare](https://blog.cloudflare.com/aae-1-smw5-cable-cuts/) |
| Japan Tohoku earthquake | 2011 | 6+ cables cut, 22% trans-Pacific capacity lost | [SubmarineNetworks](https://www.submarinenetworks.com/en/nv/news/cables-cut-after-magnitude-89-earthquake-in-japan), [Lightwave](https://www.lightwaveonline.com/network-design/article/16660580/fiber-effect-of-japan-earthquake-still-sorting-out) |
| Vietnam cable failures | 2023 | All 5 international cables degraded, -75% capacity | [The Register](https://www.theregister.com/2023/02/23/vietnam_submarine_cable_outages/), [The Register](https://www.theregister.com/2024/06/18/vietnam_internet_cables/) |

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
e2e/              Puppeteer E2E tests (desktop + mobile viewports)
```

## License

MIT

# Severed — Architecture

Interactive web app for simulating submarine cable failures on a 3D globe. Cut cables at specific locations or chokepoints, watch traffic reroute through remaining submarine and terrestrial paths. See which metros lose bandwidth, how latency degrades, where the hidden single points of failure are.

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (SPA)                        │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Globe    │  │  Impact      │  │  Scenario             │ │
│  │  View     │  │  Panel       │  │  Sidebar              │ │
│  │ (Deck.gl) │  │ (D3 charts) │  │ (controls + presets)  │ │
│  └────┬─────┘  └──────┬───────┘  └───────────┬───────────┘ │
│       │               │                      │              │
│       └───────────┬───┴──────────────────────┘              │
│                   │                                         │
│          ┌────────▼────────┐                                │
│          │   Zustand Store │                                │
│          └────────┬────────┘                                │
│                   │                                         │
│          ┌────────▼────────┐     ┌────────────────────┐     │
│          │  Graph Engine   │◄────│  Static Data Layer  │    │
│          │  (Web Worker)   │     │  (JSON bundles)     │    │
│          └─────────────────┘     └────────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘

No backend. Entirely client-side. Deployable on GitHub Pages / Vercel.
```

---

## Directory Structure

```
severed/
├── public/
│   └── data/                    # Pre-built static JSON datasets
│       ├── cables.json          # Cable topology + capacity + GeoJSON paths
│       ├── landing-stations.json
│       ├── metros.json          # Metro-area nodes with coordinates + country
│       ├── terrestrial.json     # Overland edges with capacity + sources
│       ├── chokepoints.json     # Predefined chokepoint regions (polygons + cable lists)
│       └── scenarios.json       # Predefined failure scenarios
│
├── src/
│   ├── main.tsx                 # Entry point
│   ├── App.tsx                  # Layout shell
│   │
│   ├── components/
│   │   ├── globe/
│   │   │   ├── GlobeView.tsx        # Deck.gl globe container
│   │   │   ├── CableLayer.tsx       # GeoJSON cable arcs, capacity-weighted styling
│   │   │   ├── LandingStationLayer.tsx
│   │   │   ├── TerrestrialLayer.tsx  # Overland edges (dashed/distinct style)
│   │   │   ├── ChokePointLayer.tsx   # Shaded chokepoint regions
│   │   │   └── CutAnimation.tsx      # Break/ripple animation on cable cut
│   │   │
│   │   ├── panel/
│   │   │   ├── ImpactPanel.tsx       # Metro/country heatmap + ranked list
│   │   │   ├── MetroCard.tsx         # Per-metro detail: BW remaining, latency delta
│   │   │   ├── BandwidthChart.tsx    # D3 bar/donut for capacity breakdown
│   │   │   ├── LatencyChart.tsx      # D3 latency comparison
│   │   │   └── RedundancyNotice.tsx  # "Network absorbed it" messaging
│   │   │
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx           # Scenario picker, cut controls, legend
│   │   │   ├── ScenarioButton.tsx
│   │   │   └── CableInfo.tsx         # Selected cable detail + capacity confidence
│   │   │
│   │   └── shared/
│   │       ├── ColorScale.tsx        # Perceptual colorscale (viridis)
│   │       ├── ConfidenceBadge.tsx   # Capacity source indicator
│   │       └── Tooltip.tsx
│   │
│   ├── engine/
│   │   ├── graph.ts             # Core graph data structure (adjacency list)
│   │   ├── simulation.ts        # Failure simulation: remove edges, recompute metrics
│   │   ├── pathfinding.ts       # Dijkstra, min-cut, edge-disjoint paths
│   │   ├── metrics.ts           # Per-metro metrics: BW loss, latency delta, path diversity
│   │   └── worker.ts            # Web Worker entry — runs engine off main thread
│   │
│   ├── data/
│   │   ├── loader.ts            # Fetch + parse static JSON at startup
│   │   ├── types.ts             # Cable, LandingStation, Metro, Edge, etc.
│   │   └── capacity.ts          # Capacity estimation helpers (generation heuristic, per-pair model)
│   │
│   ├── state/
│   │   └── store.ts             # Zustand store: selections, cuts, simulation results
│   │
│   └── utils/
│       ├── geo.ts               # Great-circle distance, speed-of-light latency floor
│       └── colors.ts            # Capacity tier colors, impact heatmap scale
│
├── scripts/
│   ├── build-data.ts            # Data pipeline: ingest raw sources → public/data/*.json
│   ├── scrape-fcc.ts            # FCC cable landing license scraper
│   ├── scrape-capacity.ts       # Wikipedia + press release capacity scraper
│   └── scrape-telegeography.ts  # Ad-hoc scrape of TeleGeography frontend for cable paths
│
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── .gitignore
└── ARCHITECTURE.md
```

---

## Core Design Decisions

### Metro-level nodes, not countries

Nodes in the graph are **metro areas** (e.g., "New York", "Singapore", "Marseille", "Mumbai"), not countries. This matters because:
- A cable landing in Marseille and a cable landing in Brest serve different parts of Europe via different paths
- The US West Coast and US East Coast have fundamentally different connectivity profiles
- Singapore and Jakarta are in the same region but have radically different path diversity
- Landing stations cluster around metros; metros are the natural unit

For the UI, results can be aggregated up to country level for the heatmap, but the simulation runs on metros.

### Location-based cuts, not whole-cable cuts

When a cable is "cut," the cut happens at a **geographic location** (a chokepoint polygon or a click point on the cable path). The cable is split at that point: segments on either side of the cut still function. This is physically correct — cutting SEA-ME-WE 6 in the Red Sea doesn't affect the Singapore-to-India segments. The data model already breaks cables into `CableSegment[]`, so a location-based cut removes only the segments that cross the cut point.

### Hub-set bandwidth metric, not all-pairs max-flow

Computing all-pairs max-flow on ~300 metro nodes is O(n^2) flow computations — too slow for interactive use. Instead:

1. Define ~10 **global hub metros**: New York, Miami, London, Frankfurt, Marseille, Mumbai, Singapore, Hong Kong, Tokyo, Los Angeles
2. For each metro, compute aggregate reachable bandwidth to the hub set (sum of min-cut capacities to each reachable hub)
3. On cut: recompute only affected metros (those whose shortest path to any hub traversed a removed edge)
4. Report: `bandwidthToHubsTbps` baseline vs. remaining, plus `latencyToNearestHubMs`

This gives O(n × h) = ~3,000 flow computations with incremental updates, well within 100ms. It captures the question users actually care about: "how connected is this metro to the global internet?"

### Free basemap only

**CARTO Dark Matter** vector tiles — free, no API token, no usage limits for front-end rendering. No Mapbox dependency. If CARTO's CDN has issues, Natural Earth raster tiles are the fallback.

### Mobile-first responsive

The app must work well on phones. This means:
- Impact panel slides up from bottom on mobile (sheet pattern), right-side on desktop
- Sidebar collapses to a floating action menu on mobile
- Globe is full-viewport with overlay controls
- Touch: tap cable to select, tap again or tap cut button to cut
- Scenario buttons accessible from collapsed menu
- Minimum touch target: 44px

### Surface capacity uncertainty

Every capacity number in the UI shows its provenance:
- **Verified** — FCC filing or official press release with specific Tbps number
- **Estimated** — derived from fiber pair count × per-pair model
- **Approximated** — RFS-year generation heuristic only

Displayed as a small badge/icon next to capacity values in cable info tooltips. The impact panel aggregates show a weighted confidence score (what % of the affected capacity comes from verified sources).

### Surface redundancy explicitly

When a cable is cut and it has **zero or negligible impact**, the UI should communicate this clearly rather than showing an empty diff:

- "**Network absorbed this cut.** 12 alternative paths carry equivalent capacity between Marseille and Mumbai. This cable contributed 2% of total corridor bandwidth."
- Show the rerouting: "Traffic shifts to: FLAG Europe-Asia (+18 Tbps), SEA-ME-WE 5 (+24 Tbps), terrestrial via Istanbul (+8 Tbps)"
- This is the insight — knowing which cables are redundant is as valuable as knowing which ones aren't

### Transparent data provenance

All researched data — terrestrial edges, capacity estimates, chokepoint definitions — is documented in this architecture doc with sources. The static JSON files include source attribution per-record. Users (and contributors) can verify and improve the data.

---

## Core Modules

### 1. Static Data Layer (`public/data/`)

All data is pre-built by the `scripts/` pipeline and shipped as static JSON. Zero runtime API calls.

**`cables.json`** — the central dataset:
```ts
interface Cable {
  id: string;                    // e.g. "seamewe-6"
  name: string;                  // "SEA-ME-WE 6"
  rfsYear: number;               // 2025
  lengthKm: number;
  fiberPairs: number | null;
  designCapacityTbps: number;    // Best estimate — hard number or heuristic
  capacitySource: "fcc" | "press" | "wikipedia" | "derived" | "heuristic";
  capacityConfidence: "verified" | "estimated" | "approximated";
  owners: string[];
  landingStationIds: string[];
  path: GeoJSON.LineString;      // Geographic route for rendering
  segments: CableSegment[];      // Broken into metro-pair edges for the graph
}

interface CableSegment {
  from: string;   // Metro ID (e.g., "marseille", "singapore")
  to: string;
  capacityTbps: number;          // Segment share of total cable capacity
  distanceKm: number;
  cableId: string;               // Back-reference for location-based cuts
}
```

**`metros.json`** — graph nodes:
```ts
interface Metro {
  id: string;                    // e.g., "singapore"
  name: string;                  // "Singapore"
  countryCode: string;           // "SG"
  lat: number;
  lng: number;
  isHub: boolean;                // One of the ~10 global hub nodes
  landingStationCount: number;
}
```

**`terrestrial.json`** — overland edges (see Appendix A for full research):
```ts
interface TerrestrialEdge {
  id: string;
  from: string;                  // Metro ID
  to: string;                    // Metro ID
  capacityTbps: number;
  distanceKm: number;
  confidence: "verified" | "estimated" | "approximated";
  source: string;                // Attribution (e.g., "euNetworks Super Highway, 27 Tbps/pair C-band")
  operators: string[];
  notes?: string;
}
```

**`chokepoints.json`** — predefined chokepoint regions:
```ts
interface Chokepoint {
  id: string;                    // "bab-al-mandab"
  name: string;                  // "Bab al-Mandab (Red Sea)"
  polygon: GeoJSON.Polygon;      // Geographic boundary for intersection test
  description: string;
}
```

### 2. Graph Engine (`src/engine/`)

Runs in a **Web Worker** to keep the UI responsive during recomputation.

**Graph structure (`graph.ts`):**
- Weighted undirected multigraph (multiple edges between same node pair from different cables)
- Nodes = metro areas (~300 nodes)
- Edges = cable segments + terrestrial links
- Edge weight = design capacity in Tbps
- Secondary edge attribute = distance in km (for latency)
- Edge metadata = cable ID + segment index (for location-based cut resolution)

**Simulation loop (`simulation.ts`):**
```
1. Build baseline graph from cables.json segments + terrestrial.json
2. Compute baseline metrics for each metro:
   - Aggregate bandwidth to hub set (sum of min-cut to each reachable hub)
   - Latency to nearest hub (Dijkstra, distance-weighted → speed-of-light floor)
   - Path diversity (edge-disjoint paths to hub set)
3. On cut event (location = lat/lng or chokepoint polygon):
   a. Find cable segments that intersect the cut location
   b. Remove those edges from graph
   c. Identify affected metros (those whose any shortest path to a hub used a removed edge)
   d. Recompute metrics for affected metros only (incremental)
   e. Diff against baseline → per-metro impact
   f. Detect redundancy: if impact ≈ 0, compute rerouting explanation
4. Return results to main thread via postMessage
```

**Key algorithms (`pathfinding.ts`):**
- **Dijkstra** with distance weights for latency-optimal paths
- **Min-cut** (max-flow via BFS augmenting paths) between metro and each hub for bandwidth
- **Edge-disjoint paths** (successive shortest paths with edge removal) for path diversity
- Baseline precomputed once at load; cuts trigger incremental recomputation

**Metrics output (`metrics.ts`):**
```ts
interface MetroImpact {
  metroId: string;
  countryCode: string;
  baselineBandwidthTbps: number;    // To hub set
  remainingBandwidthTbps: number;
  bandwidthLossPct: number;
  baselineLatencyMs: number;        // To nearest hub
  reroutedLatencyMs: number;
  latencyDeltaMs: number;
  baselinePathDiversity: number;
  remainingPathDiversity: number;
  isolated: boolean;
  redundancyAbsorbed: boolean;      // True if impact ≈ 0
  reroutedVia?: RerouteExplanation[]; // What paths absorbed the traffic
}

interface RerouteExplanation {
  cableOrEdgeName: string;
  additionalLoadTbps: number;
  type: "submarine" | "terrestrial";
}
```

### 3. State Management (`src/state/store.ts`)

Single Zustand store:

| Slice | Contents |
|-------|----------|
| `cables` | Loaded cable data, indexed by ID |
| `terrestrial` | Loaded terrestrial edges |
| `selection` | Currently hovered/selected cable or metro |
| `cuts` | List of cut locations (lat/lng or chokepoint ID) + resolved affected segment IDs |
| `scenario` | Active predefined scenario (if any) |
| `simulation` | Latest `MetroImpact[]` from worker |
| `ui` | Panel open/closed, globe camera, mobile sheet state |

**Data flow:**
```
User taps cable at location → action: cutAtLocation({lat, lng})
  → resolve which segments intersect the cut point
  → store updates cuts list
  → worker receives cut locations via postMessage
  → worker removes intersecting segments, recomputes metrics
  → worker posts back MetroImpact[] + redundancy explanations
  → store updates simulation slice
  → Globe: cut segments turn red/dashed, intact segments stay blue
  → ImpactPanel: heatmap + ranked list update (or "network absorbed it" message)
```

### 4. Globe Rendering (`src/components/globe/`)

**Deck.gl** with **CARTO Dark Matter** basemap (free, no API key).

| Layer | Deck.gl Layer Type | Data Source |
|-------|--------------------|-------------|
| Cables | `PathLayer` | cables.json paths |
| Terrestrial links | `ArcLayer` (or `PathLayer` dashed) | terrestrial.json |
| Landing stations | `ScatterplotLayer` | landing-stations.json |
| Chokepoints | `PolygonLayer` | chokepoints.json |
| Metro heatmap | `ScatterplotLayer` (sized + colored) | simulation results |
| Cut animation | Custom `Layer` subclass | Active cuts |

**Cable styling:**
- Width ∝ log(capacity) — prevents high-capacity cables from overwhelming
- Color: cool blue gradient by capacity tier (baseline), red/dashed when cut
- Hover: tooltip with cable name, capacity, owners, confidence badge
- Click: select cable, cut button appears

**Terrestrial edge styling:**
- Dashed line or distinct color (muted cyan) to visually distinguish from submarine cables
- Thinner than submarine cables
- Tooltip shows source attribution

**Mobile interaction:**
- Tap cable → select → floating cut button
- Tap chokepoint → prompt to cut all cables in region
- Pinch-zoom, drag-rotate
- Bottom sheet for impact panel (swipe up to expand)

### 5. Impact Panel (`src/components/panel/`)

Slides up from bottom on mobile, right-side panel on desktop.

**Sections:**

1. **Summary bar** — total cables cut, total capacity removed, metros affected

2. **Redundancy callout** (when applicable):
   > "Network absorbed this cut. 8 alternative paths carry equivalent capacity. This cable contributed < 3% of corridor bandwidth."
   > Rerouted via: FLAG Europe-Asia (+18 Tbps), SEA-ME-WE 5 (+24 Tbps), Istanbul terrestrial (+8 Tbps)

3. **Heatmap legend** — viridis scale from 0% to 100% bandwidth loss

4. **Metro/country ranking** — sorted by bandwidth loss %, each row shows:
   - Flag + metro/country name
   - Bandwidth remaining bar (green portion shrinking)
   - Capacity confidence indicator (what % of affected capacity is verified vs. estimated)
   - Latency delta (ms)
   - Path diversity indicator (dots)
   - "ISOLATED" badge if fully disconnected

5. **Rerouting flow summary** — which paths traffic shifts to (named cables/terrestrial links)

### 6. Predefined Scenarios

```ts
interface Scenario {
  id: string;
  name: string;           // "Red Sea Crisis"
  description: string;    // Brief context
  cutLocations: Array<{type: "chokepoint", id: string} | {type: "point", lat: number, lng: number}>;
  historicalDate?: string;
  repairTimeDays?: number;
}
```

**MVP scenarios:**
1. **Red Sea (Bab al-Mandab)** — ~15 cables through Suez/Red Sea corridor
2. **Strait of Malacca** — SE Asia bottleneck
3. **Baltic Sea** — recent sabotage cluster
4. **Luzon Strait** — Taiwan/Philippines corridor, major trans-Pacific junction
5. **Guam landing station** — single node failure, Pacific hub
6. **English Channel** — Europe-UK/transatlantic junction

---

## Data Pipeline (`scripts/`)

Offline build step. Run once to produce `public/data/*.json`, commit the output.

```
TeleGeography frontend ──► scrape-telegeography.ts ──┐
  (ad-hoc scrape for cable paths + landing points)   │
                                                      ├──► build-data.ts ──► public/data/
FCC filings ──► scrape-fcc.ts ────────────────────────┤
                                                      │
Wikipedia/press ──► scrape-capacity.ts ───────────────┤
                                                      │
Generation heuristic (built-in) ──────────────────────┤
                                                      │
Terrestrial edge research (hand-curated JSON) ────────┘
```

**TeleGeography scraping strategy:** Ad-hoc, not automated. Scrape the frontend of submarinecablemap.com for cable paths (GeoJSON) and landing station coordinates. This is done once to bootstrap the dataset; updates are manual. The GitHub repo (`telegeography/www.submarinecablemap.com`) provides the base data but may lag the live site.

**Capacity resolution order:**
1. FCC filing (hard number) → `confidence: "verified"`
2. Press release / Wikipedia (hard number) → `confidence: "verified"`
3. Fiber pairs × per-pair model → `confidence: "estimated"`
4. RFS-year generation heuristic → `confidence: "approximated"`

Each cable records its `capacitySource` and `capacityConfidence` for full transparency.

**Capacity estimation heuristics (when no public data exists):**

By RFS generation:
| Era | Typical Design Capacity |
|-----|------------------------|
| Pre-2005 | 1–5 Tbps |
| 2005–2012 | 5–40 Tbps |
| 2012–2018 | 40–100 Tbps |
| 2018–2022 | 100–250 Tbps |
| 2022+ | 200–500+ Tbps |

By fiber pair count (when known):
| Era | Per-Pair Capacity |
|-----|------------------|
| Pre-2010 | 1–5 Tbps/pair |
| 2015–2020 uncompensated | 15–30 Tbps/pair |
| 2020+ SDM | 10–20 Tbps/pair |

---

## Tech Stack

| Concern | Choice | Why |
|---------|--------|-----|
| Framework | React 19 + TypeScript 5.x | Standard, huge ecosystem |
| Build tool | Vite 6 | Fast HMR, native ESM, good defaults |
| Globe / map | Deck.gl 9 + react-map-gl 8 | Lightweight, React-native, good layer system |
| Basemap | CARTO Dark Matter (free, no token) | Free forever, dark aesthetic, vector tiles |
| Charts | D3 7 | Full control over data viz, bindable to React via refs |
| State | Zustand 5 | Minimal boilerplate, good for worker integration |
| Styling | Tailwind CSS 4 | Utility-first, dark mode trivial, responsive breakpoints |
| Fonts | Inter (UI) + JetBrains Mono (data) | Via `@fontsource` packages |
| Computation | Web Workers (native) | No library needed, structured clone for results |
| Linting | Biome | Fast, replaces ESLint + Prettier in one tool |
| Deployment | GitHub Pages or Vercel (static) | Zero ops cost |
| Data pipeline | TypeScript scripts via `tsx` | Same language as app, runs with no compile step |
| Package manager | pnpm | Fast, strict, disk-efficient |

---

## Visual Design Tokens

```
Background:      #0a0e1a (deep navy)
Surface:         #141926 (card/panel bg)
Border:          #1e2740
Cable (default): #2d6bcf → #60a5fa (capacity gradient, low → high)
Cable (cut):     #ef4444, dashed stroke
Cable (intact after cut): #60a5fa (same as default — still working segments)
Terrestrial:     #22d3ee (cyan-400), dashed
Heatmap:         viridis (0% loss = #440154, 50% = #21918c, 100% = #fde725)
Text primary:    #e2e8f0
Text secondary:  #94a3b8
Accent:          #f59e0b (warnings, isolation badge)
Redundancy:      #22c55e (green-500, "absorbed" callout)
Confidence:
  verified:      #60a5fa (blue)
  estimated:     #f59e0b (amber)
  approximated:  #94a3b8 (gray)
Font data:       JetBrains Mono
Font UI:         Inter
```

---

## Performance Budget

| Metric | Target |
|--------|--------|
| Initial load (data + app) | < 3MB transferred, < 2s on broadband |
| Time to interactive globe | < 1.5s |
| Simulation recompute (single cut) | < 100ms |
| Simulation recompute (full scenario, ~15 cables) | < 500ms |
| Globe frame rate during interaction | 60fps (30fps acceptable on mobile) |
| Static data bundle (all JSON) | < 1.5MB gzipped |

---

## Responsive Layout

```
Desktop (≥1024px):
┌─────────────────────────────┬──────────────┐
│                             │              │
│         Globe               │   Impact     │
│         (full height)       │   Panel      │
│                             │   (scroll)   │
│                             │              │
│   [scenario buttons]        │              │
│                             │              │
└─────────────────────────────┴──────────────┘

Tablet (768–1023px):
┌─────────────────────────────┐
│         Globe               │
│         (full width)        │
│                             │
│   [floating controls]       │
├─────────────────────────────┤
│   Impact Panel (bottom 40%) │
└─────────────────────────────┘

Mobile (<768px):
┌─────────────────────────────┐
│         Globe               │
│         (full viewport)     │
│                             │
│   [FAB: scenarios menu]     │
│                             │
│ ┌─────────────────────────┐ │
│ │ Bottom Sheet (drag up)  │ │
│ │ - Summary bar           │ │
│ │ - Ranked list (scroll)  │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

---

## MVP Milestones

1. **Data pipeline** — scrape TeleGeography, merge capacity estimates, produce static JSON
2. **Graph engine** — build graph, baseline hub-set metrics, location-based cut simulation, Web Worker wrapper
3. **Globe rendering** — Deck.gl globe with cable + terrestrial layers, click interaction
4. **Cut interaction** — tap location to cut, visual feedback (red/dashed + break animation), segments split correctly
5. **Impact panel** — metro heatmap + ranked list + redundancy callouts + confidence badges
6. **Scenarios** — predefined chokepoint scenarios, mobile-friendly menu
7. **Polish** — responsive layout (mobile + tablet + desktop), performance tuning, dark theme

---

## Future (V2/V3)

- IXP overlay from PeeringDB
- AS-level detail on metro drill-down (CAIDA data)
- Latency estimation calibrated against RIPE Atlas
- Historical incident comparison mode
- Multi-cut drag selection
- Shareable URLs (cuts encoded in hash)
- Economic impact modeling
- Repair timeline simulation

---

## Appendix A: TeleGeography Data & Metro-Level Graph

### Data Source

TeleGeography provides a free public API at `submarinecablemap.com/api/v3/` with three key datasets:

**Landing stations** (`/landing-point/landing-point-geo.json`):
- **1,909 unique landing stations** with lat/lng coordinates
- Named as "City, [State], Country" (e.g., "Tuckerton, NJ, United States")
- Each station links to its connected cables via detail endpoint

Sample record:
```json
{
  "type": "Feature",
  "properties": {
    "id": "tuckerton-nj-united-states",
    "name": "Tuckerton, NJ, United States",
    "is_tbd": false
  },
  "geometry": {
    "type": "Point",
    "coordinates": [-74.353, 39.603]
  }
}
```

**Cables** (`/cable/{id}.json`):
- **692 cables** with landing point mappings, owners, RFS year, length, route geometry
- **No capacity field** — this is the gap our pipeline fills
- Route geometries available as GeoJSON MultiLineString

**Cable index** (`/cable/all.json`): simple `{id, name}` array for all 692 cables.

### Landing Station → Metro Clustering

Landing stations cluster into metro areas. Strategy:
1. Parse station names for city/region
2. Geocode + cluster by 100km proximity threshold
3. Manual review for edge cases (e.g., Shima/Maruyama/Chikura → "Tokyo Bay")

**Top 50 metros by submarine cable count:**

| Rank | Metro | Cables | Key Landing Stations |
|------|-------|--------|---------------------|
| 1 | Jakarta / West Java | 45 | Batam (20), Tanjung Pakis (9), Jakarta (9), Dumai (7) |
| 2 | Singapore | 41 | Tuas (16), Changi North (11), Changi South (5), Tanah Merah (4) |
| 3 | Tokyo Bay | 32 | Shima (12), Maruyama (9), Chikura (7), Minamiboso (4) |
| 4 | Cairo / Suez | 25 | Zafarana (9), Suez (6), Abu Talat (6), Alexandria (4) |
| 5 | Jeddah / Red Sea | 24 | Jeddah (14), Yanbu (5), Duba (5) |
| 6 | Los Angeles | 19 | Hermosa Beach (5), LA (4), Morro Bay (4), Grover Beach (4) |
| 7 | Muscat / Oman | 18 | Barka (8), Salalah (6), Al Seeb (4) |
| 8 | Lisbon | 17 | Carcavelos (8), Sesimbra (5), Sines (4) |
| 9 | Taipei / North Taiwan | 16 | Toucheng (8), Tanshui (8) |
| 10 | Rio de Janeiro | 16 | Rio (8), Santos (5), Praia Grande (3) |
| 11 | Marseille | 16 | Marseille (16) |
| 12 | Sicily / South Italy | 15 | Mazara del Vallo (8), Catania (5), Palermo (2) |
| 13 | Mumbai | 15 | Mumbai (15) |
| 14 | Guam | 14 | Piti (9), Tanguisson Point (5) |
| 15 | Songkhla, Thailand | 13 | Songkhla (8), Satun (5) |
| 16 | Miami / South Florida | 12 | Boca Raton (8), Hollywood (4) |
| 17 | Hong Kong | 12 | Tseung Kwan O (6), Chung Hom Kok (6) |
| 18 | Fujairah, UAE | 12 | Fujairah (12) |
| 19 | Cyprus | 12 | Yeroskipos (6), Pentaskhinos (6) |
| 20 | New York / New Jersey | 11 | Wall Twp (4), Manasquan (2), Shirley (2), Brookhaven (2) |
| 21 | Genoa / North Italy | 11 | Genoa (7), Bari (4) |
| 22 | Cartagena, Colombia | 11 | Cartagena (6), Barranquilla (5) |
| 23 | Sydney | 10 | Sydney (10) |
| 24 | Karachi | 9 | Karachi (9) |
| 25 | Fortaleza, Brazil | 9 | Fortaleza (9) |
| 26 | Djibouti | 9 | Djibouti City (9) |
| 27 | Crete, Greece | 9 | Chania (5), Tympaki (4) |
| 28 | Busan, South Korea | 9 | Busan (9) |
| 29 | Virginia Beach, US | 8 | Virginia Beach (4), Myrtle Beach (4) |
| 30 | Suva, Fiji | 8 | Suva (8) |
| 31 | San Juan, Puerto Rico | 8 | San Juan (8) |
| 32 | Lagos, Nigeria | 8 | Lagos (8) |
| 33 | Cornwall, UK | 8 | Bude (8) |
| 34 | Chennai, India | 8 | Chennai (8) |
| 35 | Mombasa, Kenya | 7 | Mombasa (7) |
| 36 | Manado, Indonesia | 7 | Manado (7) |
| 37 | Buenos Aires | 7 | Las Toninas (7) |
| 38 | Doha, Qatar | 6 | Doha (6) |
| 39 | Cancun, Mexico | 6 | Cancun (6) |
| 40 | Accra, Ghana | 6 | Accra (6) |
| 41–50 | Valparaiso, Perth, Mersing, Makassar, Lowestoft, Kuwait, Dar es Salaam, Dakar, Al Khobar, Tel Aviv | 4–5 each | — |

### Segment-Level Capacity Model

Submarine cables are **not a shared bus**. Branching units (BUs) at intermediate landing points split fiber pairs between trunk and branch. The capacity on each segment depends on how many fiber pairs are routed to it.

**BU types (from least to most flexible):**
- **Passive FFD** — fixed fiber pair routing, hardwired at manufacturing
- **OADM (fixed filter)** — drops specific wavelength channels to branch
- **ROADM (WSS-based)** — remotely reconfigurable spectrum allocation (~25% typical initial branch allocation)
- **XBU (Fiber Pair Switching)** — switches entire fiber pairs between trunk and branch

Per-segment fiber pair counts are commercially sensitive. Our heuristic for capacity allocation:

| Segment Type | Capacity (% of total cable) | Rationale |
|---|---|---|
| Trunk (between major hubs) | 100% | All fiber pairs traverse the trunk |
| Major branch (to a large country/market) | 30–50% | Typically 3-8 of 8-16 fiber pairs dropped |
| Minor branch (to island / small market) | 10–25% | 1-4 fiber pairs dropped |

**Example: SEA-ME-WE 6** — 10 fiber pairs total, 12.6 Tbps/pair = 126 Tbps design. Airtel purchased 1 pair on the main trunk + co-built 4 pairs specifically for the Singapore-Chennai-Mumbai segment. This confirms that fiber pair counts differ per segment.

Each cable record in `cables.json` includes `segments[]` with per-segment capacity estimates and a `capacityConfidence` field.

### Data Gaps

| Gap | Severity | Mitigation |
|-----|----------|------------|
| No capacity in TeleGeography API | High | Our pipeline: FCC filings → press/Wikipedia → fiber pair model → generation heuristic |
| No per-segment fiber pair counts | High | Trunk/branch heuristic above. Scrape SubmarineNetworks.com for cables with published segment details |
| Landing station → metro mapping | Medium | Geocode + 100km clustering on TeleGeography coordinates. Manual review for ~50 key metros |
| Terrestrial backhaul at landing points | Medium | Some cables land on one coast and connect to infra on another (e.g., Egypt: Red Sea → Mediterranean). Add explicit terrestrial links for these cross-country backhaul segments |

---

## Appendix B: Terrestrial Edge Research

All terrestrial edges in the simulation are hand-curated from public sources. Each edge documents its source and confidence level. Capacities represent aggregate design capacity across all known operators on a corridor — actual lit capacity is lower but not publicly available.

### Methodology

Each terrestrial edge has a **confidence level** — `verified`, `estimated`, or `approximated` — that describes how the capacity number was derived. This section documents the exact methodology for each level so every number in the simulation is reproducible.

#### `verified` — Operator-published capacity

The operator or a credible industry source published a specific capacity number for this exact corridor.

**Process:**
1. Search for the operator's press release, investor presentation, or product page naming the corridor
2. Extract the stated capacity (design or lit, preferring design for consistency with submarine cable treatment)
3. Record the exact source URL and date

**Examples:**
- euNetworks publishes "27 Tbps per fiber pair on C-band" for their Super Highway corridors
- Liquid Intelligent Technologies' Nokia press release states "12 Tbps" on the Mombasa-Johannesburg backbone
- EXA's TAE product page states "36 pairs of G.652D fiber, 25 Tbps per pair"

**What this does NOT mean:** It does not mean we independently verified the number. It means the operator put a specific Tbps figure in a public document attached to a named route.

#### `estimated` — Operator-count × per-operator capacity model

No single operator published a total corridor capacity, but we know which operators are present and can model aggregate capacity from anchor data points.

**Process:**
1. **Identify operators on the corridor.** Sources: operator network maps (Zayo, Lumen, Cogent, euNetworks, EXA, Telia all publish route-level maps), peering databases, press releases about route construction or upgrades.
2. **Classify each operator's likely per-route capacity** using published anchor points as calibration:
   - **Tier 1 / hyperscale backbone** (Lumen, Cogent, Zayo on US trunk routes): 30–80 Tbps per core route. Calibrated against Lumen's published 350 Tbps total US backbone across ~6 major routes, and Zayo's stated 1 Pbps total active wavelengths across ~10 major routes.
   - **Major European carrier on a core route** (euNetworks, EXA, Telia, GTT on FLAP-D corridors): 15–40 Tbps per route. Calibrated against euNetworks' published 54 Tbps/pair (C+L band) on their Super Highways, and EXA's 400G-enabled 155,000 km network across 37 countries.
   - **Regional carrier or secondary route**: 5–15 Tbps. These operators have fiber on the corridor but it's not their primary trunk.
   - **Domestic monopoly/incumbent** (Deutsche Telekom, Telkom SA, NTT, Reliance Jio on internal routes): 20–60 Tbps on primary domestic trunks, 5–20 Tbps on secondary routes. Calibrated against Deutsche Telekom's total German backbone capacity and NTT's Tokaido corridor.
   - **Developing-world carriers** (Liquid in Africa, Internexa in LATAM, Ethio Telecom): 1–12 Tbps. Calibrated against Liquid's verified 12 Tbps on their flagship route and Internexa's 49,000 km network serving 170+ cities.
3. **Sum across operators** with a 70% discount factor. Rationale: operators share dark fiber, some announced capacity may not be fully lit, and our operator list is incomplete (we may miss smaller carriers, inflating the discount, or count shared infrastructure twice).
4. **Cross-check against regional totals** where available. For example, TeleGeography publishes "total international bandwidth" per region. If our per-route estimates for all routes in a region sum to more than the regional total, we scale down.

**Worked example — Frankfurt to Amsterdam (100 Tbps):**
| Operator | Classification | Est. Capacity |
|----------|---------------|---------------|
| euNetworks | Major European, flagship Super Highway | 40 Tbps |
| EXA Infrastructure | Major European, 400G route | 25 Tbps |
| Cogent | Tier 1, secondary European route | 15 Tbps |
| Telia | Major European | 15 Tbps |
| GTT | Major European | 15 Tbps |
| Zayo | Major European | 15 Tbps |
| **Raw sum** | | **125 Tbps** |
| **After 70% discount** (shared fiber, unlit capacity) | | **~88 Tbps** |
| **Rounded to** | | **100 Tbps** |

The discount was slightly relaxed here because euNetworks publishes hard per-pair numbers (27 Tbps C-band + 27 Tbps L-band = 54 Tbps/pair) and their Amsterdam-Frankfurt Super Highway has a high fiber pair count, giving confidence the real number is at the top of the range.

**Worked example — Nairobi to Kampala (5 Tbps):**
| Operator | Classification | Est. Capacity |
|----------|---------------|---------------|
| Liquid | Developing-world flagship carrier, part of 12 Tbps Mombasa-Joburg corridor | 5 Tbps |
| WIOCC | Regional carrier | 2 Tbps |
| **Raw sum** | | **7 Tbps** |
| **After 70% discount** | | **~5 Tbps** |

#### `approximated` — No operator data; inferred from corridor importance

We could not identify specific operators or anchor capacity numbers for this corridor. The estimate is based on the economic and strategic importance of the route.

**Process:**
1. **Assess the corridor's role**: Is it a primary international transit route? A domestic trunk? A minor cross-border link?
2. **Compare to known corridors in the same region** at similar development levels. If the verified Mombasa-Johannesburg route is 12 Tbps and it's the highest-capacity corridor in East Africa, then a secondary East African route should be 1–5 Tbps.
3. **Factor in known constraints**: extreme terrain (Pakistan-China Karakoram at 4,733m altitude → likely 1–5 Tbps), political sanctions (Iran international → <1 Tbps), island geography (no terrestrial possible), planned-but-not-built status.
4. **Assign a round number** that reflects order-of-magnitude confidence, not precision. An approximated value of "5 Tbps" means "we believe this is between 1 and 15 Tbps."

**Examples:**
- Iran-Pakistan terrestrial (1 Tbps): Iran's total international bandwidth is only ~62 Gbps despite 76 Tbps domestic. The Pakistan border crossing is constrained by sanctions and limited infrastructure.
- Trans-Caspian cable (20 Tbps): Design capacity is 400 Tbps but it's not yet operational. We estimate 5% of design capacity as initial lit allocation based on typical submarine cable utilization patterns.

### Limitations and known biases

1. **We systematically overestimate.** Design capacity > lit capacity > utilized capacity. Our estimates are closer to "maximum theoretical throughput if every operator maxed out their equipment" than "bandwidth actually flowing." This is intentional — when a cable is cut, you lose the potential, not just what's in use.
2. **We cannot distinguish shared from independent fiber.** If Cogent and Telia both lease dark fiber from the same provider, we count them separately. The 70% discount partially compensates but is not rigorous.
3. **The operator list is incomplete.** We only count operators we could identify from public sources. Smaller carriers and private enterprise networks are invisible to us.
4. **Developing-world estimates have wider error bars** because fewer operators publish capacity data and there are fewer anchor points to calibrate against.
5. **All estimates are point-in-time** (research conducted April 2026). Backbone capacity grows 25–40% per year on major routes. These numbers will age.

### How the confidence level appears in the UI

Every capacity number displayed to the user includes a color-coded badge:
- Blue badge = `verified` (operator published this number)
- Amber badge = `estimated` (operator-count × per-operator model, 70% discounted)
- Gray badge = `approximated` (inferred from corridor importance, order-of-magnitude only)

### Europe Intra-Continental

| # | From | To | Capacity (Tbps) | Confidence | Source / Operators |
|---|------|----|-----------------|------------|-------------------|
| 1 | London | Paris | 80 | estimated | Colt (Channel Tunnel dark fibre, 25-year concession via Getlink, deployed June 2023), EXA Infrastructure (first new UK-France fibre in 20 years, 2025), Crosslake CrossChannel (Brighton–Veules-les-Roses, 2,400 Tbps design), euNetworks, Zayo |
| 2 | London | Amsterdam | 80 | estimated | euNetworks Super Highway (Scylla subsea), EXA, Zayo, GTT, Cogent, Telia |
| 3 | London | Brussels | 40 | estimated | EXA (London-Frankfurt-Amsterdam-Brussels route, 400G-enabled G.652D fibre), Colt, Cogent |
| 4 | Frankfurt | Amsterdam | 100 | estimated | euNetworks Super Highway (27 Tbps/pair C-band + 27 Tbps L-band = 54 Tbps/pair, high fiber count), EXA (1,200 km London-Frankfurt-Amsterdam-Brussels, low-loss G.652D), Cogent, Telia, GTT, Zayo |
| 5 | Frankfurt | Paris | 100 | estimated | euNetworks Super Highway (27 Tbps/pair C-band + L-band), EXA, Zayo, Cogent, GTT, Telia |
| 6 | Frankfurt | London | 80 | estimated | EXA, euNetworks, Cogent, Telia, Zayo, GTT |
| 7 | Paris | Marseille | 60 | estimated | EXA (upgraded Paris-Dijon-Marseille corridor, 2025, diverse routes), euNetworks (Frankfurt-Marseille-Milan via Zurich), Cogent, Zayo |
| 8 | Frankfurt | Milan | 40 | estimated | euNetworks (Frankfurt-Marseille-Milan via Zurich), Zayo (400G wavelengths Milan-Frankfurt), Sparkle/Seabone (~30 Tbps global backbone) |
| 9 | Frankfurt | Zurich | 40 | estimated | euNetworks (Super Highway, fully diverse Frankfurt-Zurich-Milan-Marseille), EXA, Swisscom |
| 10 | Marseille | Milan | 40 | estimated | euNetworks (via Zurich), Sparkle, EXA, Zayo |
| 11 | Berlin | Warsaw | 20 | estimated | EXA Project Visegrad (216-fiber Corning Ultra G.652D cable, along Druzhba pipeline corridors, announced Sept 2025, ready mid-2026) |
| 12 | Vienna | Bratislava | 15 | estimated | EXA Project Visegrad (Vienna-Bratislava-Prague route) |
| 13 | Prague | Berlin | 20 | estimated | EXA Project Visegrad + existing operators |
| 14 | Marseille | Istanbul | 25 | verified | EXA Trans Adriatic Express (TAE): >4,500 km, 36 pairs G.652D, 25 Tbps/pair. Route: Marseille-Italy-Greece-Turkey. Branches to Athens, Sofia, Tirana |
| 15 | Athens | Istanbul | 15 | estimated | TAE branch + Grid Telecom (Greece cross-border network to Turkey, Bulgaria, Albania, N. Macedonia) |
| 16 | Sofia | Istanbul | 10 | estimated | TAE branch, EXA + SOCAR Fiber (1,850 km terrestrial spanning Turkey, connecting Greece and Georgia) |
| 17 | Vienna | Budapest | 15 | estimated | EXA Project Visegrad extension, existing operators |
| 18 | Frankfurt | Vienna | 30 | estimated | EXA, euNetworks, Deutsche Telekom, A1 Telekom |
| 19 | Madrid | Marseille | 20 | estimated | EXA, Cogent, Telefonica backbone |
| 20 | Stockholm | Helsinki | 15 | estimated | Telia (major Nordic presence), Cinia (C-Lion1 subsea + terrestrial) |

### Trans-Russia / Central Asia (Europe-Asia Overland)

| # | From | To | Capacity (Tbps) | Confidence | Source / Operators |
|---|------|----|-----------------|------------|-------------------|
| 21 | St. Petersburg | Moscow | 50 | estimated | Rostelecom (TEA NEXT: 48 fiber pairs, Ultra Low Loss fiber, $500M investment, 85ms RTT Moscow-Vladivostok), MegaFon, Beeline. Major domestic trunk |
| 22 | Moscow | Yekaterinburg | 20 | estimated | Rostelecom TEA NEXT backbone segment |
| 23 | Yekaterinburg | Novosibirsk | 15 | estimated | Rostelecom TEA NEXT backbone segment |
| 24 | Novosibirsk | Vladivostok | 10 | estimated | Rostelecom TEA NEXT (via Krasnoyarsk-Irkutsk-Ulan-Ude-Chita-Khabarovsk) |
| 25 | Moscow | China (Manzhouli) | 5 | estimated | TEA (upgraded to 2 Tbps, 100 Gbps single channel), TEA-2 (200 Gbps cross-border at Heihe), TEA-3 (Manzhouli crossing) |
| 26 | Helsinki | St. Petersburg | 10 | estimated | Telia Carrier, existing Russia-Finland border crossings |
| 27 | Tallinn | St. Petersburg | 5 | estimated | Telia (mesh network through Tallinn, Riga, Helsinki, coherent Flex-Grid 100G/150G/200G) |
| 28 | Frankfurt | Almaty | 8 | estimated | DREAM system (Frankfurt-Austria-Slovakia-Ukraine-Russia-Kazakhstan, 8,700 km, initial 100 Gbps, potential 8 Tbps, operators: MegaFon + Kazakhtelecom + Colt, launched Oct 2013) + TRANSKZ (RETN + Transtelecom, >5 Tbps over four routes, upgraded to 8 Tbps, 143ms RTT, Infinera ICE4 DWDM ring) |
| 29 | Baku | Aktau | 20 | approximated | Trans-Caspian Fiber Optic Cable (Digital Silk Way): 380-400 km submarine across Caspian, AzerTelecom + Kazakhtelecom, 400 Tbps design, completion target end 2026. Using 20 Tbps as conservative initial lit estimate (5% of design) |
| 30 | Almaty | Urumqi | 15 | estimated | Khorgos/Alashankou border crossings. DREAM terminates at Khorgos (up to 8 Tbps), TRANSKZ (5-8 Tbps via three diverse routes). China Telecom + China Unicom on Chinese side |
| 31 | Moscow | Ulaanbaatar | 3 | estimated | TEA-4 (Europe-Russia-Mongolia-China via Erenhot), TMP Transit-Mongolia routes |

**Note on TEA NEXT:** Under construction, target 2026. 48 fiber pairs × ~25 Tbps/pair = 1,200 Tbps theoretical design capacity. Initially likely 10–50 Tbps lit. This will dramatically increase Russia's east-west backbone capacity when complete.

### Middle East Overland

| # | From | To | Capacity (Tbps) | Confidence | Source / Operators |
|---|------|----|-----------------|------------|-------------------|
| 32 | Istanbul | Aleppo | 50 | approximated | SilkLink (stc Group, $800M, 4,500 km Saudi Arabia-Syria-Mediterranean. 100 Tbps phase 1, 500 Tbps future. 18-24 months from Feb 2026). **Planned — not yet operational** |
| 33 | Baghdad | Istanbul | 50 | approximated | WorldLink (Abu Dhabi subsea-Iraq overland-Turkey-Europe, 900 Tbps full scale, $700M, five-year phased). Ooredoo ($500M via Iraq-Turkey, part of FiG 720 Tbps GCC system, target late 2027). **Planned** |
| 34 | Muscat | Riyadh | 10 | approximated | SONIC (STC + Ooredoo JV, terrestrial connecting landing stations, first phase within 12 months of Feb 2025) |
| 35 | Riyadh | Amman | 5 | estimated | Existing Gulf-Levant terrestrial links |
| 36 | Baku | Tehran | 2 | estimated | TIC (Iran) Astara border crossing, limited international bandwidth (Iran total: 76 Tbps domestic, but only ~62 Gbps international) |
| 37 | Tehran | Karachi | 1 | approximated | Iran-Pakistan terrestrial, constrained by Iran's limited international connectivity |
| 38 | Muscat | Cairo | 10 | approximated | Zain-Omantel corridor (Oman-Saudi Arabia-Egypt-Mediterranean) |
| 39 | Istanbul | Tbilisi | 10 | estimated | EXA + SOCAR Fiber (1,850 km terrestrial spanning Turkey to Georgia) |
| 40 | Djibouti | Addis Ababa | 5 | estimated | Horizon Initiative (Djibouti-Ethiopia-Sudan, announced Feb 2026, terrestrial Red Sea bypass). Ethio Telecom + Djibouti Telecom + Sudatel |
| 41 | Addis Ababa | Khartoum | 5 | estimated | Horizon Initiative extension |

**Note on Middle East overland:** The Red Sea cable cuts of 2024-2025 triggered a wave of overland bypass projects (SilkLink, WorldLink, Ooredoo, Horizon). Most are planned or under construction. For current-state simulation, these should be heavily discounted or excluded.

### US Backbone

| # | From | To | Capacity (Tbps) | Confidence | Source / Operators |
|---|------|----|-----------------|------------|-------------------|
| 42 | New York | Chicago | 200 | estimated | Lumen (350 Tbps backbone, 5.9 Pbps added in 2025, 100k+ route miles 400G-enabled, tested 1.2 Tbps single carrier Denver-Dallas), Zayo (16.6M fiber miles, 1 Pbps active waves, 90% 400G-enabled), Cogent (772 Tbps global), AT&T, Verizon |
| 43 | Chicago | Los Angeles | 150 | estimated | Lumen, Zayo (building 5k+ new fiber route miles in western US for AI data centers), Cogent, AT&T |
| 44 | New York | Washington DC | 200 | estimated | Highest-density corridor in US. All major carriers |
| 45 | New York | Dallas | 100 | estimated | Lumen, Zayo, AT&T |
| 46 | Dallas | Los Angeles | 100 | estimated | Lumen, Zayo, AT&T |
| 47 | Chicago | Dallas | 80 | estimated | Lumen, Zayo, AT&T |
| 48 | New York | Miami | 80 | estimated | Lumen, AT&T, Zayo. Key for Caribbean/Latin America submarine cable connectivity |
| 49 | Dallas | Houston | 60 | estimated | Regional trunk |
| 50 | Seattle | Los Angeles | 60 | estimated | West Coast backbone, Zayo western expansion |
| 51 | Denver | Dallas | 40 | estimated | Lumen (tested 1.2 Tbps single carrier channel on this route via Ciena WaveLogic 6) |
| 52 | Denver | Chicago | 40 | estimated | Lumen, Zayo |
| 53 | Atlanta | Miami | 40 | estimated | SE US trunk |

### US Cross-Border (North America)

| # | From | To | Capacity (Tbps) | Confidence | Source / Operators |
|---|------|----|-----------------|------------|-------------------|
| 54 | San Diego | Tijuana | 25 | estimated | MDC Data Centers (major international fiber crossing operator), multiple carriers |
| 55 | Laredo | Monterrey | 30 | estimated | MDC, Zayo + Fermaca (new 400G-enabled route, 2026, Ciudad Juarez through Guadalajara) |
| 56 | El Paso | Ciudad Juarez | 20 | estimated | MDC, Zayo + Fermaca route |
| 57 | Seattle | Vancouver | 30 | estimated | Zayo (first to connect US-Canada, 2016), multiple carriers |
| 58 | New York | Toronto | 40 | estimated | Zayo, Cogent, multiple carriers |
| 59 | Chicago | Toronto | 30 | estimated | Multiple carriers, high-traffic corridor |

### Africa Overland

| # | From | To | Capacity (Tbps) | Confidence | Source / Operators |
|---|------|----|-----------------|------------|-------------------|
| 60 | Mombasa | Nairobi | 12 | verified | Liquid Intelligent Technologies (>110,000 km fiber, 20+ countries). Nokia-built multi-Tbps pan-Africa backbone. Mombasa-Johannesburg corridor: 12 Tbps |
| 61 | Nairobi | Kampala | 5 | estimated | Liquid backbone, WIOCC (50,000+ km terrestrial, 20 African countries) |
| 62 | Kampala | Kigali | 2 | estimated | Liquid backbone |
| 63 | Nairobi | Addis Ababa | 4 | verified | Liquid (Kenya-Ethiopia: 4 Tbps, 1,000 km) |
| 64 | Lusaka | Lilongwe | 1 | verified | Liquid (Zambia-Malawi: 711 km) |
| 65 | Johannesburg | Cape Town | 10 | estimated | Telkom SA (~143,000 km domestic fiber), WIOCC (metro + long-distance in Joburg, Cape Town, Durban), Liquid |
| 66 | Johannesburg | Maputo | 3 | estimated | Liquid, regional carriers |
| 67 | Lusaka | Harare | 3 | estimated | Liquid backbone (Mombasa-Joburg corridor segment) |
| 68 | Harare | Johannesburg | 5 | estimated | Liquid backbone |
| 69 | Douala | N'Djamena | 0.5 | approximated | Central African Backbone (CAB): World Bank-funded ($206M of $273M total), cross-border links across Cameroon, CAR, Chad, DRC, Gabon, Congo, STP |
| 70 | Brazzaville | Kinshasa | 0.5 | approximated | CAB: Congo-DRC link |
| 71 | Djibouti | Addis Ababa | 5 | estimated | Horizon Initiative (see Middle East section) + existing Ethio Telecom links |

### East Asia Overland

| # | From | To | Capacity (Tbps) | Confidence | Source / Operators |
|---|------|----|-----------------|------------|-------------------|
| 72 | Hanoi | Nanning | 10 | estimated | China-Vietnam border crossings at Pingxiang/Dongxing (Guangxi). Part of China's 70+ Tbps aggregate border capacity (2018 CAICT White Paper, likely significantly higher now). China Telecom launched first cross-border hollow-core fiber transmission 2025 |
| 73 | Mandalay | Kunming | 2 | estimated | China-Myanmar CMI Cable (Ruili-Muse-Mandalay-Yangon, 1,500 km, 80×10 Gbps = 800 Gbps design, China Unicom + MPT, $50M). Myanmar has 6 cross-border fiber links with China |
| 74 | Vientiane | Kunming | 2 | estimated | China-Laos terrestrial links |
| 75 | Ulaanbaatar | Erenhot | 3 | estimated | TEA-4 + TMP Transit-Mongolia |
| 76 | Vladivostok | Harbin | 5 | estimated | Russia-China border crossings at Manzhouli, Heihe, Suifenhe. TEA (2 Tbps), TEA-2 (200 Gbps at Heihe), TEA-3 (Manzhouli) |
| 77 | Almaty | Urumqi | 15 | estimated | (Same as edge #30 — Khorgos/Alashankou) |
| 78 | Dhaka | Kolkata | 5 | estimated | India-Bangladesh: three terrestrial cross-border cables (BTCL-BSNL at Darshana-Krishna Nagar 2010, Bharti Airtel at Benapole-Petrapole 2013, Tata at Benapol-Bangaon). Critical for Bangladesh — these are primary international backup when submarine cables fail |
| 79 | Mandalay | Imphal | 0.001 | approximated | India-Myanmar (Moreh-Mandalay, 640 km, STM-4 = 622 Mbps, completed 2010, $7M). Negligible |

### South America Overland

| # | From | To | Capacity (Tbps) | Confidence | Source / Operators |
|---|------|----|-----------------|------------|-------------------|
| 80 | Sao Paulo | Buenos Aires | 50 | estimated | SAC (South American Crossing, ~20,000 km hybrid ring, 4 fiber pairs DWDM), Cirion Technologies (668 Tbps across LATAM), Internexa (49,000+ km, 170+ cities in CO/EC/PE/CL/AR/BR) |
| 81 | Buenos Aires | Santiago | 15 | estimated | Andes crossing constrained to ~2 physical routes (road/tunnel + Gas Andes ducts at Mendoza-Santiago). SAC, Cirion, Conect Infra (new entrant 2026, Chile-Argentina to Brazilian hubs) |
| 82 | Sao Paulo | Rio de Janeiro | 80 | estimated | Domestic trunk, Cirion, multiple Brazilian carriers |
| 83 | Lima | Santiago | 10 | estimated | Internexa, SAC |
| 84 | Bogota | Lima | 8 | estimated | Internexa backbone |
| 85 | Bogota | Cali | 15 | estimated | Domestic trunk, Internexa |
| 86 | Quito | Bogota | 8 | estimated | Internexa (Colombia-Ecuador) |
| 87 | Bogota | Caracas | 3 | estimated | Limited cross-border capacity |
| 88 | Lima | Quito | 5 | estimated | Internexa |
| 89 | Sao Paulo | Porto Alegre | 30 | estimated | Domestic trunk, Conect Infra expansion (Porto Alegre, Curitiba, Brasilia, Rio, Fortaleza) |

**Total: 89 terrestrial edges.**

### Key Sources

**European backbone:**
- euNetworks Super Highways — 27 Tbps/pair C-band published specs
- EXA Infrastructure — 155,000 km network, 37 countries, Project Visegrad, TAE system
- Colt — Channel Tunnel dark fibre deployment (June 2023)
- Crosslake Fibre CrossChannel — 2,400 Tbps design capacity
- Cogent — 92,600 route-miles, 772 Tbps global
- GTT — Tier 1 IP, 300 Tbps global IP edge, 400G-800G inter-hub
- Sparkle/Seabone — 600,000 km globally, ~30 Tbps backbone

**Trans-Russia/Central Asia:**
- Rostelecom TEA NEXT — 48 fiber pairs, $500M, target 2026
- DREAM — MegaFon + Kazakhtelecom + Colt, 8,700 km, launched Oct 2013
- TRANSKZ — RETN + Transtelecom, >5 Tbps over four routes
- Trans-Caspian (Digital Silk Way) — AzerTelecom + Kazakhtelecom, 400 Tbps design

**US backbone:**
- Lumen Technologies — 350 Tbps backbone, 5.9 Pbps added 2025
- Zayo — 16.6M fiber miles, 1 Pbps active waves
- MDC Data Centers — international fiber crossings US-Mexico (100+ Tbps)

**Africa:**
- Liquid Intelligent Technologies — 110,000+ km, Nokia-built 12 Tbps backbone
- WIOCC — 50,000+ km terrestrial, 28% of EASSy
- Central African Backbone — World Bank funded, $273M

**East Asia:**
- CAICT White Paper 2018 — China 70+ Tbps aggregate border capacity
- CMI Cable — China Unicom + MPT, 800 Gbps design

**South America:**
- Cirion Technologies — 668 Tbps across LATAM
- Internexa — 49,000+ km interconnecting 6 countries
- SAC — ~20,000 km hybrid ring

**Middle East planned systems:**
- SilkLink — stc Group, $800M, 100 Tbps phase 1
- WorldLink — Iraqi-UAE consortium, $700M, 900 Tbps full scale
- Ooredoo — $500M Iraq-Turkey route
- Horizon Initiative — Djibouti-Ethiopia-Sudan Red Sea bypass

---

## Appendix C: Real-World Validation Test Cases

The simulation must be validated against documented real-world cable cut events. Each test case defines: which cables to cut, where, and what impact was actually observed. If our simulation produces results that are directionally consistent with these observations, the model is credible.

These tests run as part of CI. Tolerances are wide (±20-30%) because our model uses design capacity (not lit) and the heuristic trunk/branch allocation.

### Test 1: Red Sea / Houthi Cable Cuts (February 2024)

**Event:** February 24, 2024. Anchor drag from sinking cargo ship Rubymar near Bab al-Mandab strait.

**Cables cut:** Seacom/TGN-EA (09:46 UTC), AAE-1 (09:51 UTC), EIG (already down from Dec 2023)

**Observed impact:**
- West Asia / North Africa (WANA) region: ~25% of telecommunications traffic disrupted
- Europe-to-India latency: +100–200ms from rerouting
- East Africa (Tanzania, Kenya): near-zero traffic loss — pre-provisioned alternative capacity via EASSy, TEAMS

**Rerouting:** Remaining Red Sea cables absorbed load. Some traffic routed via Cape of Good Hope submarine paths. Terrestrial rerouting via Turkey/Central Asia.

**Test assertion:**
```
simulate: cut Seacom, AAE-1, EIG at Bab al-Mandab
expect: WANA region metros lose 15-35% bandwidth
expect: Marseille-Mumbai latency increases 80-250ms
expect: Mombasa, Nairobi lose < 10% bandwidth (alternative cables intact)
```

**Sources:** Kentik Blog (Feb 2024), CNN (Mar 2024), Cloudflare Q1 2024 Disruption Summary

### Test 2: Baltic Sea Cable Cuts (November 2024)

**Event:** November 17-18, 2024. Suspected anchor drag by Chinese cargo ship Yi Peng 3.

**Cables cut:** BCS East-West (Lithuania-Sweden, Nov 17), C-Lion1 (Finland-Germany, Nov 18)

**Observed impact:**
- Finland, Germany, Lithuania, Sweden: **zero observable traffic volume drop**
- RIPE Atlas: 29.8% of Finland-Germany paths showed inter-domain rerouting
- 25% of rerouted paths had latency increases >3ms (consistent with ~300km longer terrestrial backup)
- Repaired by November 28 (10 days)

**This is a critical redundancy test.** The simulation should correctly identify that the Baltic is highly redundant.

**Test assertion:**
```
simulate: cut C-Lion1, BCS East-West in central Baltic Sea
expect: Helsinki, Stockholm, Berlin lose < 5% bandwidth (high terrestrial redundancy)
expect: Helsinki-Frankfurt latency increases 2-8ms
expect: redundancyAbsorbed = true for all affected metros
expect: rerouting via NORDUnet terrestrial paths
```

**Sources:** Cloudflare "Resilient Internet connectivity in Europe mitigates impact from Baltic cable cuts", RIPE Labs deep dive analysis

### Test 3: 2008 Mediterranean Cable Cuts (January-February 2008)

**Event:** January 30, 2008. Two cables cut near Alexandria, Egypt within 3.5 hours. Third cable (FALCON) cut near Dubai on Feb 1.

**Cables cut:** SEA-ME-WE 4 (25km from Alexandria), FLAG Europe-Asia (8.3km from Alexandria), FALCON (56km from Dubai)

**Observed impact:**
- Egypt: 70% internet capacity lost (6 million users)
- India: 60% international bandwidth lost (60 million users)
- Pakistan: significant (12 million users affected)
- Saudi Arabia: 4.7 million users affected
- 14 countries total, 75% of Europe-Middle East-Asia traffic disrupted
- Only SEA-ME-WE 3 remained as direct Europe-to-region route
- Egypt BGP prefix visibility dropped up to 40%
- Repaired in ~10 days

**Rerouting:** VSNL (India) rerouted via TIC and SEA-ME-WE 3. Some traffic rerouted via trans-Pacific, causing congestion.

**Test assertion:**
```
simulate: cut SEA-ME-WE 4, FLAG Europe-Asia near Alexandria; cut FALCON near Dubai
expect: Cairo/Suez metros lose 60-80% bandwidth
expect: Mumbai loses 45-70% bandwidth
expect: Karachi loses 40-65% bandwidth
expect: remaining path via SEA-ME-WE 3 (congested, low capacity)
```

**Sources:** Wikipedia "2008 submarine cable disruption", RIPE NCC Mediterranean cable cut analysis

### Test 4: Taiwan / Hengchun Earthquake (December 2006)

**Event:** December 26, 2006. Magnitude 7.0 earthquake triggered submarine landslide in Luzon Strait. 8 cable systems, 18 individual cuts.

**Cables cut:** APCN (2 cuts), APCN-2 (2), C2C (3), China-US CN (3), EAC (3), FLAG Europe-Asia (1), FNAL/RNAL (2), SEA-ME-WE 3 (2)

**Observed impact:**
- Taiwan (Chunghwa Telecom): 100% loss to Hong Kong/SE Asia, 74% loss to mainland China
- China (China Telecom + China Unicom): >90% loss of traffic to USA/Europe
- Hong Kong (PCCW): >50% data capacity lost
- Philippines: ~40% phone service capacity lost
- Japan, South Korea, Singapore: significant disruption
- Internet services ~70% recovered by Dec 31 (5 days) via rerouting
- Full cable repair: ~35 days

**Test assertion:**
```
simulate: cut APCN-2, C2C, China-US CN, EAC, FLAG FEA, FNAL, SMW3 in Luzon Strait
expect: Taipei loses 70-100% bandwidth to Hong Kong/Singapore
expect: Hong Kong loses 40-60% bandwidth
expect: Tokyo, Busan show 15-40% bandwidth loss
expect: rerouting via trans-Pacific paths through remaining Japan cables
```

**Sources:** Submarine Networks, Wikipedia "2006 Hengchun earthquakes", ISCPC analysis

### Test 5: Tonga Volcanic Eruption (January 2022)

**Event:** January 15, 2022. Cable severed by Hunga Tonga eruption. Single 827km cable (Tonga-Fiji).

**Cables cut:** Tonga Cable (sole international link)

**Observed impact:**
- Tonga: **100% internet connectivity loss** for 38 days
- No meaningful rerouting possible — single cable, no satellite backup adequate for general use
- 92km of cable replaced

**This tests single-point-of-failure detection.** The simulation must flag Tonga as isolated.

**Test assertion:**
```
simulate: cut Tonga Cable at any point
expect: Nuku'alofa (Tonga metro) loses 100% bandwidth
expect: isolated = true
expect: remainingPathDiversity = 0
```

**Sources:** Cloudflare "Internet is back in Tonga after 38 days", NPR, World Economic Forum

### Test 6: West Africa Cable Cuts (March 2024)

**Event:** March 14, 2024. Underwater rockfall at "Le Trou Sans Fond" submarine canyon off Abidjan, Cote d'Ivoire.

**Cables cut:** WACS, ACE, SAT-3/WASC, MainOne

**Observed impact:**
- Cote d'Ivoire: near-total internet outage
- Liberia: >12 hours disruption, weeks to return to normal
- Ghana: significant, weeks to recover
- South Africa (Vodacom): disruption ~05:00-16:00 UTC (~11 hours recovery)
- MainOne AS37282: IPv4 space completely unannounced for 7.5 hours
- 13 countries affected
- Google's Equiano cable: **4x traffic increase** absorbing rerouted load
- Repairs completed over ~6 weeks

**Test assertion:**
```
simulate: cut WACS, ACE, SAT-3, MainOne off Abidjan
expect: Accra (Ghana) loses 50-80% bandwidth
expect: Lagos (Nigeria) loses 20-50% bandwidth (more cable diversity)
expect: Abidjan (Cote d'Ivoire) loses 80-100% bandwidth
expect: Cape Town/Johannesburg lose 10-30% bandwidth (more diverse, faster recovery)
expect: Equiano cable shows as primary rerouting path
```

**Sources:** Cloudflare "Undersea cable failures cause Internet disruptions across Africa", Internet Society 2024 West Africa Cable Outage Report

### Test 7: East Africa Cable Cuts (May 2024)

**Event:** May 12, 2024. Cable damage off KwaZulu-Natal coast, ~45km north of Durban. While Seacom already degraded from Feb Red Sea cuts.

**Cables cut:** EASSy, Seacom (near Durban). Seacom already degraded in Red Sea.

**Observed impact:**
- Tanzania: traffic fell to ~30% of expected levels (~70% loss)
- Rwanda, Malawi: >33% traffic drop
- Kenya, Uganda, Madagascar, Mozambique: 10-25% drop
- TEAMS cable absorbed local rerouted traffic

**Test assertion:**
```
simulate: cut Seacom at Red Sea AND cut EASSy + Seacom near Durban
expect: Dar es Salaam (Tanzania) loses 55-80% bandwidth
expect: Nairobi (Kenya) loses 10-30% bandwidth
expect: Mombasa shows TEAMS as primary remaining path
```

**Sources:** Cloudflare "East African Internet connectivity again impacted by submarine cable cuts", Internet Society 2024 East Africa Report

### Test 8: AAE-1 & SMW-5 Egypt Landing Point Cuts (June 2022)

**Event:** June 7, 2022. On-land damage at Abu Talat and Zafarana landing points in Egypt.

**Cables cut:** AAE-1, SEA-ME-WE 5

**Observed impact:**
- Google Cloud Platform: 3h12m outage, elevated latency Europe-Asia
- Saudi Arabia: near-instant recovery
- Most countries: ~4 hours recovery (land-based repair is fast)

**This tests landing-point vulnerability — damage on land, not at sea.**

**Test assertion:**
```
simulate: cut AAE-1, SEA-ME-WE 5 at Egyptian landing points (Abu Talat/Zafarana)
expect: Cairo/Suez metros show moderate bandwidth loss (15-40%)
expect: remaining Red Sea cables (many) absorb most traffic
expect: Saudi Arabia shows < 10% impact (alternative paths via Fujairah, Jeddah)
```

**Sources:** Cloudflare "AAE-1 & SMW5 cable cuts impact millions of users"

### Validation Summary

| Test | Type | Key Validation |
|------|------|---------------|
| Red Sea 2024 | Major chokepoint | Partial degradation, rerouting works, East Africa unaffected |
| Baltic 2024 | Redundancy | High-redundancy region absorbs cuts with near-zero impact |
| Mediterranean 2008 | Catastrophic multi-cut | Historical worst case for Egypt/India corridor |
| Taiwan 2006 | Massive multi-cable | Tests Luzon Strait chokepoint, cascading Pacific failure |
| Tonga 2022 | Single-point-of-failure | Tests island isolation detection |
| West Africa 2024 | Regional cascade | Tests West African cable diversity, Equiano as backup |
| East Africa 2024 | Compounding failures | Tests degraded-state + new cut interaction |
| Egypt landing 2022 | Landing point attack | Tests on-land vulnerability at critical transit point |

These 8 tests cover the full spectrum: total isolation, catastrophic multi-cut, partial degradation with rerouting, and high-redundancy absorption. If the simulation is directionally correct on all 8, the model is credible for hypothetical scenario exploration.

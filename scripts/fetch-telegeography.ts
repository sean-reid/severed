/**
 * Fetch TeleGeography submarine cable data and save raw JSON files.
 *
 * Usage: pnpm data:fetch
 *
 * Fetches:
 *   - Cable index (all.json)
 *   - Individual cable details (with rate limiting)
 *   - Cable route geometries (cable-geo.json)
 *   - Landing point locations (landing-point-geo.json)
 *
 * Saves everything to scripts/raw/
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const RAW_DIR = resolve(import.meta.dirname ?? ".", "raw");
const BASE = "https://www.submarinecablemap.com/api/v3";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });

  // 1. Fetch cable index
  console.log("[1/4] Fetching cable index...");
  const cableIndex = (await fetchJson(`${BASE}/cable/all.json`)) as Array<{
    id: string;
    name: string;
  }>;
  writeFileSync(
    resolve(RAW_DIR, "cable-index.json"),
    JSON.stringify(cableIndex, null, 2),
  );
  console.log(`  -> ${cableIndex.length} cables in index`);

  // 2. Fetch cable route geometries (single large file)
  console.log("[2/4] Fetching cable geometries...");
  const cableGeo = await fetchJson(`${BASE}/cable/cable-geo.json`);
  writeFileSync(
    resolve(RAW_DIR, "cable-geo.json"),
    JSON.stringify(cableGeo, null, 2),
  );
  console.log("  -> saved cable-geo.json");

  // 3. Fetch landing point geometries
  console.log("[3/4] Fetching landing point geometries...");
  const landingGeo = await fetchJson(
    `${BASE}/landing-point/landing-point-geo.json`,
  );
  writeFileSync(
    resolve(RAW_DIR, "landing-point-geo.json"),
    JSON.stringify(landingGeo, null, 2),
  );
  console.log("  -> saved landing-point-geo.json");

  // 4. Fetch individual cable details (rate limited)
  console.log(`[4/4] Fetching ${cableIndex.length} cable details (100ms delay between requests)...`);
  const cableDetails: Record<string, unknown> = {};
  let fetched = 0;
  let errors = 0;

  for (const cable of cableIndex) {
    try {
      const detail = await fetchJson(`${BASE}/cable/${cable.id}.json`);
      cableDetails[cable.id] = detail;
      fetched++;
      if (fetched % 50 === 0) {
        console.log(`  -> ${fetched}/${cableIndex.length} fetched`);
      }
    } catch (err) {
      errors++;
      console.warn(`  [WARN] Failed to fetch cable ${cable.id}: ${err}`);
    }
    await sleep(100);
  }

  writeFileSync(
    resolve(RAW_DIR, "cable-details.json"),
    JSON.stringify(cableDetails, null, 2),
  );
  console.log(`  -> ${fetched} cable details saved (${errors} errors)`);

  console.log("\nDone! Raw data saved to scripts/raw/");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

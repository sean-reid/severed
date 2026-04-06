/**
 * Build static JSON data files from raw TeleGeography data.
 *
 * Usage: pnpm data:build
 *
 * Reads from: scripts/raw/
 * Writes to:  public/data/
 *
 * Produces:
 *   - cables.json    — Cable objects with capacity estimates and segments
 *   - metros.json    — Metro nodes clustered from landing stations
 *   - terrestrial.json — Hand-curated overland edges
 *   - chokepoints.json — Chokepoint polygon definitions
 *   - scenarios.json   — Predefined failure scenarios
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { Feature, LineString, MultiLineString, Polygon } from "geojson";

// ── Paths ──

const RAW_DIR = resolve(import.meta.dirname ?? ".", "raw");
const OUT_DIR = resolve(import.meta.dirname ?? ".", "..", "public", "data");

// ── Helpers ──

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function readRaw(name: string): unknown {
  return JSON.parse(readFileSync(resolve(RAW_DIR, name), "utf-8"));
}

function writeOut(name: string, data: unknown): void {
  writeFileSync(resolve(OUT_DIR, name), JSON.stringify(data));
  console.log(`  -> wrote public/data/${name}`);
}

// ── Capacity heuristic ──

function capacityFromRfsYear(year: number): number {
  if (year < 2005) return 3;
  if (year < 2012) return 20;
  if (year < 2018) return 60;
  if (year < 2022) return 150;
  return 350;
}

// ── Types for raw TeleGeography data ──

interface RawCableDetail {
  id: string;
  name: string;
  landing_points: Array<{
    id: string;
    name: string;
    is_tbd?: boolean;
  }>;
  owners: string | Array<{ name: string }>;
  rfs?: string; // year string or "n/a"
  length?: string; // e.g. "12,000 km"
  is_planned?: boolean;
}

interface RawLandingFeature {
  type: "Feature";
  properties: { id: string; name: string; is_tbd?: boolean };
  geometry: { type: "Point"; coordinates: [number, number] };
}

interface RawCableGeoFeature {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    color?: string;
    is_planned?: boolean;
  };
  geometry: {
    type: "LineString" | "MultiLineString";
    coordinates: number[][] | number[][][];
  };
}

// ── Output types (matching src/data/types.ts) ──

interface Cable {
  id: string;
  name: string;
  rfsYear: number;
  lengthKm: number;
  fiberPairs: number | null;
  designCapacityTbps: number;
  capacitySource: "heuristic";
  capacityConfidence: "approximated";
  owners: string[];
  landingStationIds: string[];
  path: Feature<LineString | MultiLineString>;
  segments: CableSegment[];
}

interface CableSegment {
  from: string;
  to: string;
  capacityTbps: number;
  distanceKm: number;
  cableId: string;
}

interface Metro {
  id: string;
  name: string;
  countryCode: string;
  lat: number;
  lng: number;
  isHub: boolean;
  landingStationCount: number;
}

interface TerrestrialEdge {
  id: string;
  from: string;
  to: string;
  capacityTbps: number;
  distanceKm: number;
  confidence: "verified" | "estimated" | "approximated";
  source: string;
  operators: string[];
  notes?: string;
}

interface Chokepoint {
  id: string;
  name: string;
  polygon: Polygon;
  description: string;
}

interface ScenarioCut {
  type: "chokepoint" | "point";
  id?: string;
  lat?: number;
  lng?: number;
}

interface Scenario {
  id: string;
  name: string;
  description: string;
  cutLocations: ScenarioCut[];
  historicalDate?: string;
  repairTimeDays?: number;
}

// ── Hub metro IDs ──

// Top ~50 metros by cable count become hubs.
// More hubs = more granular connectivity measurement.
// Dynamically assigned after metro clustering — metros with 5+ cables become hubs.
// These are the manually-specified fallback hub IDs for synthetic metros.
// ~50 hub metros: major submarine cable hubs + key terrestrial backbone junctions.
// Connectivity metric = "how much bandwidth can this metro reach across all hubs?"
const MANUAL_HUB_IDS = new Set([
  // Americas
  "new-york", "los-angeles", "miami", "chicago", "dallas", "washington-dc",
  "seattle", "toronto", "sao-paulo", "rio-de-janeiro", "buenos-aires",
  "fortaleza", "bogota", "santiago",
  // Europe
  "london", "frankfurt", "marseille", "amsterdam", "paris", "madrid",
  "milan", "istanbul", "stockholm", "athens", "lisbon",
  // Middle East / Africa
  "cairo", "mumbai", "dubai", "fujairah", "muscat", "jeddah", "djibouti",
  "nairobi", "mombasa", "johannesburg", "cape-town", "lagos", "accra",
  // Asia-Pacific
  "singapore", "hong-kong", "tokyo", "taipei", "busan", "sydney",
  "chennai", "karachi", "guam", "jakarta", "perth",
  // Russia / Central Asia
  "moscow", "vladivostok",
]);

// ── Landing station → country code extraction ──

const COUNTRY_CODES: Record<string, string> = {
  "united states": "US",
  "united kingdom": "GB",
  france: "FR",
  germany: "DE",
  japan: "JP",
  singapore: "SG",
  "hong kong": "HK",
  china: "CN",
  india: "IN",
  brazil: "BR",
  australia: "AU",
  canada: "CA",
  mexico: "MX",
  indonesia: "ID",
  malaysia: "MY",
  thailand: "TH",
  vietnam: "VN",
  philippines: "PH",
  "south korea": "KR",
  taiwan: "TW",
  egypt: "EG",
  "saudi arabia": "SA",
  "united arab emirates": "AE",
  oman: "OM",
  qatar: "QA",
  turkey: "TR",
  greece: "GR",
  italy: "IT",
  spain: "ES",
  portugal: "PT",
  netherlands: "NL",
  belgium: "BE",
  ireland: "IE",
  sweden: "SE",
  norway: "NO",
  denmark: "DK",
  finland: "FI",
  poland: "PL",
  "czech republic": "CZ",
  austria: "AT",
  switzerland: "CH",
  romania: "RO",
  bulgaria: "BG",
  croatia: "HR",
  cyprus: "CY",
  nigeria: "NG",
  ghana: "GH",
  kenya: "KE",
  "south africa": "ZA",
  tanzania: "TZ",
  mozambique: "MZ",
  djibouti: "DJ",
  ethiopia: "ET",
  sudan: "SU",
  senegal: "SN",
  "cote d'ivoire": "CI",
  cameroon: "CM",
  angola: "AO",
  "democratic republic of the congo": "CD",
  "republic of the congo": "CG",
  madagascar: "MG",
  mauritius: "MU",
  fiji: "FJ",
  tonga: "TO",
  "new zealand": "NZ",
  guam: "GU",
  "puerto rico": "PR",
  colombia: "CO",
  chile: "CL",
  argentina: "AR",
  peru: "PE",
  ecuador: "EC",
  venezuela: "VE",
  panama: "PA",
  "costa rica": "CR",
  jamaica: "JM",
  "dominican republic": "DO",
  "trinidad and tobago": "TT",
  uruguay: "UY",
  pakistan: "PK",
  "sri lanka": "LK",
  bangladesh: "BD",
  myanmar: "MM",
  cambodia: "KH",
  laos: "LA",
  mongolia: "MN",
  russia: "RU",
  ukraine: "UA",
  georgia: "GE",
  azerbaijan: "AZ",
  kazakhstan: "KZ",
  uzbekistan: "UZ",
  iran: "IR",
  iraq: "IQ",
  jordan: "JO",
  lebanon: "LB",
  israel: "IL",
  kuwait: "KW",
  bahrain: "BH",
  yemen: "YE",
  libya: "LY",
  tunisia: "TN",
  algeria: "DZ",
  morocco: "MA",
  uganda: "UG",
  rwanda: "RW",
  malawi: "MW",
  zambia: "ZM",
  zimbabwe: "ZW",
  namibia: "NA",
  botswana: "BW",
  "papua new guinea": "PG",
  samoa: "WS",
  "solomon islands": "SB",
  vanuatu: "VU",
  "french polynesia": "PF",
  "new caledonia": "NC",
};

function extractCountryCode(stationName: string): string {
  // Station names look like "City, State, Country" or "City, Country"
  const parts = stationName.split(",").map((s) => s.trim());
  const country = parts[parts.length - 1]?.toLowerCase() ?? "";
  return COUNTRY_CODES[country] ?? "XX";
}

function extractCityName(stationName: string): string {
  // First part before comma
  return stationName.split(",")[0]?.trim() ?? stationName;
}

// ── Main build ──

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Load raw data
  console.log("Loading raw data...");
  const cableIndex = readRaw("cable-index.json") as Array<{
    id: string;
    name: string;
  }>;
  const cableDetails = readRaw("cable-details.json") as Record<
    string,
    RawCableDetail
  >;
  const cableGeo = readRaw("cable-geo.json") as {
    type: string;
    features: RawCableGeoFeature[];
  };
  const landingGeo = readRaw("landing-point-geo.json") as {
    type: string;
    features: RawLandingFeature[];
  };

  console.log(`  ${cableIndex.length} cables in index`);
  console.log(`  ${Object.keys(cableDetails).length} cable details`);
  console.log(`  ${cableGeo.features.length} cable geometries`);
  console.log(`  ${landingGeo.features.length} landing points`);

  // ── Build landing station coordinate map ──

  console.log("\nBuilding landing station coordinate map...");
  const stationCoords = new Map<
    string,
    { lat: number; lng: number; name: string; countryCode: string }
  >();
  for (const f of landingGeo.features) {
    const [lng, lat] = f.geometry.coordinates;
    stationCoords.set(f.properties.id, {
      lat,
      lng,
      name: f.properties.name,
      countryCode: extractCountryCode(f.properties.name),
    });
  }
  console.log(`  ${stationCoords.size} landing stations with coordinates`);

  // ── Build cable geometry map ──

  const geoMap = new Map<string, RawCableGeoFeature>();
  for (const f of cableGeo.features) {
    geoMap.set(f.properties.id, f);
  }

  // ── Cluster landing stations into metros ──

  console.log("\nClustering landing stations into metros...");
  const CLUSTER_RADIUS_KM = 100;

  interface StationInfo {
    id: string;
    name: string;
    cityName: string;
    countryCode: string;
    lat: number;
    lng: number;
  }

  const stations: StationInfo[] = [];
  for (const [id, info] of stationCoords) {
    stations.push({
      id,
      name: info.name,
      cityName: extractCityName(info.name),
      countryCode: info.countryCode,
      lat: info.lat,
      lng: info.lng,
    });
  }

  // Simple greedy clustering
  const stationToMetro = new Map<string, string>(); // station ID -> metro ID
  const metroClusters = new Map<
    string,
    {
      stations: StationInfo[];
      lat: number;
      lng: number;
      name: string;
      countryCode: string;
    }
  >();

  const assigned = new Set<string>();

  for (const station of stations) {
    if (assigned.has(station.id)) continue;

    // Find all unassigned stations within radius
    const cluster: StationInfo[] = [station];
    assigned.add(station.id);

    for (const other of stations) {
      if (assigned.has(other.id)) continue;
      // Only cluster within the same country
      if (other.countryCode !== station.countryCode) continue;
      const dist = haversineKm(station.lat, station.lng, other.lat, other.lng);
      if (dist <= CLUSTER_RADIUS_KM) {
        cluster.push(other);
        assigned.add(other.id);
      }
    }

    // Pick metro name: most common city name in cluster
    const nameCounts = new Map<string, number>();
    for (const s of cluster) {
      nameCounts.set(s.cityName, (nameCounts.get(s.cityName) ?? 0) + 1);
    }
    let metroName = station.cityName;
    let maxCount = 0;
    for (const [name, count] of nameCounts) {
      if (count > maxCount) {
        maxCount = count;
        metroName = name;
      }
    }

    // Average coordinates
    const avgLat = cluster.reduce((s, c) => s + c.lat, 0) / cluster.length;
    const avgLng = cluster.reduce((s, c) => s + c.lng, 0) / cluster.length;

    // Country code from most common
    const ccCounts = new Map<string, number>();
    for (const s of cluster) {
      ccCounts.set(s.countryCode, (ccCounts.get(s.countryCode) ?? 0) + 1);
    }
    let metroCC = station.countryCode;
    let maxCC = 0;
    for (const [cc, count] of ccCounts) {
      if (count > maxCC) {
        maxCC = count;
        metroCC = cc;
      }
    }

    const metroId = slugify(metroName);

    // Handle duplicate metro IDs by appending country code
    let finalMetroId = metroId;
    if (metroClusters.has(metroId)) {
      finalMetroId = `${metroId}-${metroCC.toLowerCase()}`;
    }

    metroClusters.set(finalMetroId, {
      stations: cluster,
      lat: avgLat,
      lng: avgLng,
      name: metroName,
      countryCode: metroCC,
    });

    for (const s of cluster) {
      stationToMetro.set(s.id, finalMetroId);
    }
  }

  console.log(`  ${metroClusters.size} metros from ${stations.length} landing stations`);

  // Build metros.json
  const metros: Metro[] = [];
  for (const [id, cluster] of metroClusters) {
    metros.push({
      id,
      name: cluster.name,
      countryCode: cluster.countryCode,
      lat: Math.round(cluster.lat * 10000) / 10000,
      lng: Math.round(cluster.lng * 10000) / 10000,
      isHub: MANUAL_HUB_IDS.has(id),
      landingStationCount: cluster.stations.length,
    });
  }
  metros.sort((a, b) => b.landingStationCount - a.landingStationCount);

  // ── Metro coordinate lookup for terrestrial edges ──

  const metroCoords = new Map<string, { lat: number; lng: number }>();
  for (const m of metros) {
    metroCoords.set(m.id, { lat: m.lat, lng: m.lng });
  }

  // ── Build cables.json ──

  console.log("\nBuilding cables...");
  const cables: Cable[] = [];
  let skippedPlanned = 0;
  let skippedNoGeo = 0;
  let skippedNoDetail = 0;

  for (const entry of cableIndex) {
    const detail = cableDetails[entry.id];
    if (!detail) {
      skippedNoDetail++;
      continue;
    }

    // Skip planned cables
    if (detail.is_planned) {
      skippedPlanned++;
      continue;
    }

    // Parse RFS year
    const rfsYear = Number.parseInt(detail.rfs ?? "", 10);
    if (Number.isNaN(rfsYear) || rfsYear < 1990) continue;

    // Parse length
    let lengthKm = 0;
    if (detail.length) {
      const cleaned = detail.length.replace(/[^0-9.]/g, "");
      lengthKm = Number.parseFloat(cleaned) || 0;
    }

    // Get geometry
    const geoFeature = geoMap.get(entry.id);
    if (!geoFeature) {
      skippedNoGeo++;
      continue;
    }

    // Keep original geometry type (LineString or MultiLineString)
    // Flattening MultiLineString into LineString draws lines across land
    const path = {
      type: "Feature" as const,
      properties: { id: entry.id, name: detail.name },
      geometry: geoFeature.geometry,
    };

    // Capacity
    const designCapacityTbps = capacityFromRfsYear(rfsYear);

    // Owners
    // owners can be a string or array of objects depending on the API version
    const rawOwners = detail.owners;
    const owners: string[] = typeof rawOwners === "string"
      ? rawOwners.split(",").map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(rawOwners)
        ? rawOwners.map((o: { name: string } | string) => typeof o === "string" ? o : o.name)
        : [];

    // Landing station IDs
    const landingStationIds = (detail.landing_points ?? []).map((lp) => lp.id);

    // Build segments: consecutive pairs of landing stations
    const segments: CableSegment[] = [];
    const resolvedMetros: string[] = [];

    for (const lpId of landingStationIds) {
      const metroId = stationToMetro.get(lpId);
      if (metroId && !resolvedMetros.includes(metroId)) {
        resolvedMetros.push(metroId);
      }
    }

    for (let i = 0; i < resolvedMetros.length - 1; i++) {
      const fromId = resolvedMetros[i];
      const toId = resolvedMetros[i + 1];
      const fromCoord = metroCoords.get(fromId);
      const toCoord = metroCoords.get(toId);

      let distKm = 0;
      if (fromCoord && toCoord) {
        distKm = Math.round(
          haversineKm(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng),
        );
      }

      segments.push({
        from: fromId,
        to: toId,
        capacityTbps: designCapacityTbps,
        distanceKm: distKm,
        cableId: entry.id,
      });
    }

    cables.push({
      id: entry.id,
      name: detail.name,
      rfsYear,
      lengthKm,
      fiberPairs: null,
      designCapacityTbps,
      capacitySource: "heuristic",
      capacityConfidence: "approximated",
      owners,
      landingStationIds,
      path,
      segments,
    });
  }

  console.log(`  ${cables.length} operational cables built`);
  console.log(`  ${skippedPlanned} planned cables skipped`);
  console.log(`  ${skippedNoGeo} cables skipped (no geometry)`);
  console.log(`  ${skippedNoDetail} cables skipped (no detail data)`);

  // ── Terrestrial edges ──

  console.log("\nBuilding terrestrial edges...");

  // We need to look up metros by approximate name. Build a quick lookup.
  function findMetroId(name: string): string {
    const slug = slugify(name);
    // Check aliases first
    if (metroAliases.has(slug)) return metroAliases.get(slug)!;
    // Direct match
    if (metroCoords.has(slug)) return slug;
    // Try partial match
    for (const m of metros) {
      if (m.id === slug || m.id.startsWith(slug)) return m.id;
    }
    return slug;
  }

  // Coordinates for terrestrial metro endpoints that may not be in TeleGeography data
  const syntheticMetros: Record<
    string,
    { name: string; countryCode: string; lat: number; lng: number }
  > = {
    paris: { name: "Paris", countryCode: "FR", lat: 48.8566, lng: 2.3522 },
    london: { name: "London", countryCode: "GB", lat: 51.5074, lng: -0.1278 },
    amsterdam: {
      name: "Amsterdam",
      countryCode: "NL",
      lat: 52.3676,
      lng: 4.9041,
    },
    brussels: {
      name: "Brussels",
      countryCode: "BE",
      lat: 50.8503,
      lng: 4.3517,
    },
    frankfurt: {
      name: "Frankfurt",
      countryCode: "DE",
      lat: 50.1109,
      lng: 8.6821,
    },
    milan: { name: "Milan", countryCode: "IT", lat: 45.4642, lng: 9.19 },
    zurich: { name: "Zurich", countryCode: "CH", lat: 47.3769, lng: 8.5417 },
    berlin: { name: "Berlin", countryCode: "DE", lat: 52.52, lng: 13.405 },
    hamburg: { name: "Hamburg", countryCode: "DE", lat: 53.5511, lng: 9.9937 },
    rostock: { name: "Rostock", countryCode: "DE", lat: 54.0887, lng: 12.1407 },
    munich: { name: "Munich", countryCode: "DE", lat: 48.1351, lng: 11.582 },
    copenhagen: { name: "Copenhagen", countryCode: "DK", lat: 55.6761, lng: 12.5683 },
    manchester: { name: "Manchester", countryCode: "GB", lat: 53.4808, lng: -2.2426 },
    cornwall: { name: "Cornwall", countryCode: "GB", lat: 50.266, lng: -5.0527 },
    osaka: { name: "Osaka", countryCode: "JP", lat: 34.6937, lng: 135.5023 },
    rome: { name: "Rome", countryCode: "IT", lat: 41.9028, lng: 12.4964 },
    sicily: { name: "Sicily", countryCode: "IT", lat: 37.599, lng: 14.0154 },
    delhi: { name: "Delhi", countryCode: "IN", lat: 28.6139, lng: 77.209 },
    bangalore: { name: "Bangalore", countryCode: "IN", lat: 12.9716, lng: 77.5946 },
    jakarta: { name: "Jakarta", countryCode: "ID", lat: -6.2088, lng: 106.8456 },
    surabaya: { name: "Surabaya", countryCode: "ID", lat: -7.2575, lng: 112.7521 },
    batam: { name: "Batam", countryCode: "ID", lat: 1.0456, lng: 104.0305 },
    salvador: { name: "Salvador", countryCode: "BR", lat: -12.9714, lng: -38.5124 },
    guangzhou: { name: "Guangzhou", countryCode: "CN", lat: 23.1291, lng: 113.2644 },
    shanghai: { name: "Shanghai", countryCode: "CN", lat: 31.2304, lng: 121.4737 },
    sydney: { name: "Sydney", countryCode: "AU", lat: -33.8688, lng: 151.2093 },
    melbourne: { name: "Melbourne", countryCode: "AU", lat: -37.8136, lng: 144.9631 },
    warsaw: { name: "Warsaw", countryCode: "PL", lat: 52.2297, lng: 21.0122 },
    vienna: { name: "Vienna", countryCode: "AT", lat: 48.2082, lng: 16.3738 },
    bratislava: {
      name: "Bratislava",
      countryCode: "SK",
      lat: 48.1486,
      lng: 17.1077,
    },
    prague: { name: "Prague", countryCode: "CZ", lat: 50.0755, lng: 14.4378 },
    istanbul: {
      name: "Istanbul",
      countryCode: "TR",
      lat: 41.0082,
      lng: 28.9784,
    },
    athens: { name: "Athens", countryCode: "GR", lat: 37.9838, lng: 23.7275 },
    sofia: { name: "Sofia", countryCode: "BG", lat: 42.6977, lng: 23.3219 },
    budapest: {
      name: "Budapest",
      countryCode: "HU",
      lat: 47.4979,
      lng: 19.0402,
    },
    madrid: { name: "Madrid", countryCode: "ES", lat: 40.4168, lng: -3.7038 },
    stockholm: {
      name: "Stockholm",
      countryCode: "SE",
      lat: 59.3293,
      lng: 18.0686,
    },
    helsinki: {
      name: "Helsinki",
      countryCode: "FI",
      lat: 60.1699,
      lng: 24.9384,
    },
    "st-petersburg": {
      name: "St. Petersburg",
      countryCode: "RU",
      lat: 59.9343,
      lng: 30.3351,
    },
    moscow: { name: "Moscow", countryCode: "RU", lat: 55.7558, lng: 37.6173 },
    yekaterinburg: {
      name: "Yekaterinburg",
      countryCode: "RU",
      lat: 56.8389,
      lng: 60.6057,
    },
    novosibirsk: {
      name: "Novosibirsk",
      countryCode: "RU",
      lat: 55.0084,
      lng: 82.9357,
    },
    vladivostok: {
      name: "Vladivostok",
      countryCode: "RU",
      lat: 43.1155,
      lng: 131.8855,
    },
    tallinn: {
      name: "Tallinn",
      countryCode: "EE",
      lat: 59.437,
      lng: 24.7536,
    },
    almaty: { name: "Almaty", countryCode: "KZ", lat: 43.2551, lng: 76.9126 },
    baku: { name: "Baku", countryCode: "AZ", lat: 40.4093, lng: 49.8671 },
    aktau: { name: "Aktau", countryCode: "KZ", lat: 43.6355, lng: 51.1471 },
    urumqi: { name: "Urumqi", countryCode: "CN", lat: 43.8256, lng: 87.6168 },
    ulaanbaatar: {
      name: "Ulaanbaatar",
      countryCode: "MN",
      lat: 47.9186,
      lng: 106.9176,
    },
    manzhouli: {
      name: "Manzhouli",
      countryCode: "CN",
      lat: 49.5977,
      lng: 117.3786,
    },
    chicago: {
      name: "Chicago",
      countryCode: "US",
      lat: 41.8781,
      lng: -87.6298,
    },
    "new-york": {
      name: "New York",
      countryCode: "US",
      lat: 40.7128,
      lng: -74.006,
    },
    "los-angeles": {
      name: "Los Angeles",
      countryCode: "US",
      lat: 34.0522,
      lng: -118.2437,
    },
    dallas: { name: "Dallas", countryCode: "US", lat: 32.7767, lng: -96.797 },
    "washington-dc": {
      name: "Washington DC",
      countryCode: "US",
      lat: 38.9072,
      lng: -77.0369,
    },
    miami: { name: "Miami", countryCode: "US", lat: 25.7617, lng: -80.1918 },
    houston: {
      name: "Houston",
      countryCode: "US",
      lat: 29.7604,
      lng: -95.3698,
    },
    seattle: {
      name: "Seattle",
      countryCode: "US",
      lat: 47.6062,
      lng: -122.3321,
    },
    denver: {
      name: "Denver",
      countryCode: "US",
      lat: 39.7392,
      lng: -104.9903,
    },
    atlanta: {
      name: "Atlanta",
      countryCode: "US",
      lat: 33.749,
      lng: -84.388,
    },
    "san-diego": {
      name: "San Diego",
      countryCode: "US",
      lat: 32.7157,
      lng: -117.1611,
    },
    tijuana: {
      name: "Tijuana",
      countryCode: "MX",
      lat: 32.5149,
      lng: -117.0382,
    },
    laredo: {
      name: "Laredo",
      countryCode: "US",
      lat: 27.5036,
      lng: -99.5075,
    },
    monterrey: {
      name: "Monterrey",
      countryCode: "MX",
      lat: 25.6866,
      lng: -100.3161,
    },
    "el-paso": {
      name: "El Paso",
      countryCode: "US",
      lat: 31.7619,
      lng: -106.485,
    },
    "ciudad-juarez": {
      name: "Ciudad Juarez",
      countryCode: "MX",
      lat: 31.6904,
      lng: -106.4245,
    },
    vancouver: {
      name: "Vancouver",
      countryCode: "CA",
      lat: 49.2827,
      lng: -123.1207,
    },
    toronto: {
      name: "Toronto",
      countryCode: "CA",
      lat: 43.6532,
      lng: -79.3832,
    },
    nairobi: {
      name: "Nairobi",
      countryCode: "KE",
      lat: -1.2921,
      lng: 36.8219,
    },
    kampala: {
      name: "Kampala",
      countryCode: "UG",
      lat: 0.3476,
      lng: 32.5825,
    },
    kigali: { name: "Kigali", countryCode: "RW", lat: -1.9403, lng: 29.8739 },
    "addis-ababa": {
      name: "Addis Ababa",
      countryCode: "ET",
      lat: 9.0054,
      lng: 38.7636,
    },
    lusaka: {
      name: "Lusaka",
      countryCode: "ZM",
      lat: -15.3875,
      lng: 28.3228,
    },
    lilongwe: {
      name: "Lilongwe",
      countryCode: "MW",
      lat: -13.9626,
      lng: 33.7741,
    },
    johannesburg: {
      name: "Johannesburg",
      countryCode: "ZA",
      lat: -26.2041,
      lng: 28.0473,
    },
    "cape-town": {
      name: "Cape Town",
      countryCode: "ZA",
      lat: -33.9249,
      lng: 18.4241,
    },
    maputo: {
      name: "Maputo",
      countryCode: "MZ",
      lat: -25.9653,
      lng: 32.5892,
    },
    harare: {
      name: "Harare",
      countryCode: "ZW",
      lat: -17.8292,
      lng: 31.0522,
    },
    douala: {
      name: "Douala",
      countryCode: "CM",
      lat: 4.0511,
      lng: 9.7679,
    },
    "n-djamena": {
      name: "N'Djamena",
      countryCode: "TD",
      lat: 12.1348,
      lng: 15.0557,
    },
    brazzaville: {
      name: "Brazzaville",
      countryCode: "CG",
      lat: -4.2634,
      lng: 15.2429,
    },
    kinshasa: {
      name: "Kinshasa",
      countryCode: "CD",
      lat: -4.4419,
      lng: 15.2663,
    },
    khartoum: {
      name: "Khartoum",
      countryCode: "SD",
      lat: 15.5007,
      lng: 32.5599,
    },
    hanoi: { name: "Hanoi", countryCode: "VN", lat: 21.0278, lng: 105.8342 },
    nanning: {
      name: "Nanning",
      countryCode: "CN",
      lat: 22.817,
      lng: 108.3665,
    },
    mandalay: {
      name: "Mandalay",
      countryCode: "MM",
      lat: 21.9588,
      lng: 96.0891,
    },
    kunming: {
      name: "Kunming",
      countryCode: "CN",
      lat: 25.0389,
      lng: 102.7183,
    },
    vientiane: {
      name: "Vientiane",
      countryCode: "LA",
      lat: 17.9757,
      lng: 102.6331,
    },
    erenhot: {
      name: "Erenhot",
      countryCode: "CN",
      lat: 43.6526,
      lng: 111.9773,
    },
    harbin: {
      name: "Harbin",
      countryCode: "CN",
      lat: 45.8038,
      lng: 126.535,
    },
    dhaka: { name: "Dhaka", countryCode: "BD", lat: 23.8103, lng: 90.4125 },
    kolkata: {
      name: "Kolkata",
      countryCode: "IN",
      lat: 22.5726,
      lng: 88.3639,
    },
    imphal: { name: "Imphal", countryCode: "IN", lat: 24.817, lng: 93.9368 },
    "sao-paulo": {
      name: "Sao Paulo",
      countryCode: "BR",
      lat: -23.5505,
      lng: -46.6333,
    },
    "buenos-aires": {
      name: "Buenos Aires",
      countryCode: "AR",
      lat: -34.6037,
      lng: -58.3816,
    },
    santiago: {
      name: "Santiago",
      countryCode: "CL",
      lat: -33.4489,
      lng: -70.6693,
    },
    "rio-de-janeiro": {
      name: "Rio de Janeiro",
      countryCode: "BR",
      lat: -22.9068,
      lng: -43.1729,
    },
    lima: { name: "Lima", countryCode: "PE", lat: -12.0464, lng: -77.0428 },
    bogota: { name: "Bogota", countryCode: "CO", lat: 4.711, lng: -74.0721 },
    cali: { name: "Cali", countryCode: "CO", lat: 3.4516, lng: -76.532 },
    quito: { name: "Quito", countryCode: "EC", lat: -0.1807, lng: -78.4678 },
    caracas: {
      name: "Caracas",
      countryCode: "VE",
      lat: 10.4806,
      lng: -66.9036,
    },
    "porto-alegre": {
      name: "Porto Alegre",
      countryCode: "BR",
      lat: -30.0346,
      lng: -51.2177,
    },
    riyadh: {
      name: "Riyadh",
      countryCode: "SA",
      lat: 24.7136,
      lng: 46.6753,
    },
    amman: { name: "Amman", countryCode: "JO", lat: 31.9454, lng: 35.9284 },
    tehran: { name: "Tehran", countryCode: "IR", lat: 35.6892, lng: 51.389 },
    tbilisi: {
      name: "Tbilisi",
      countryCode: "GE",
      lat: 41.7151,
      lng: 44.8271,
    },
    baghdad: {
      name: "Baghdad",
      countryCode: "IQ",
      lat: 33.3152,
      lng: 44.3661,
    },
    aleppo: {
      name: "Aleppo",
      countryCode: "SY",
      lat: 36.2021,
      lng: 37.1343,
    },
    mombasa: {
      name: "Mombasa",
      countryCode: "KE",
      lat: -4.0435,
      lng: 39.6682,
    },
    "dar-es-salaam": {
      name: "Dar es Salaam",
      countryCode: "TZ",
      lat: -6.7924,
      lng: 39.2083,
    },
    cairo: { name: "Cairo", countryCode: "EG", lat: 30.0444, lng: 31.2357 },
    muscat: { name: "Muscat", countryCode: "OM", lat: 23.588, lng: 58.3829 },
    djibouti: {
      name: "Djibouti",
      countryCode: "DJ",
      lat: 11.5721,
      lng: 43.1456,
    },
    marseille: {
      name: "Marseille",
      countryCode: "FR",
      lat: 43.2965,
      lng: 5.3698,
    },
    mumbai: {
      name: "Mumbai",
      countryCode: "IN",
      lat: 19.076,
      lng: 72.8777,
    },
    singapore: {
      name: "Singapore",
      countryCode: "SG",
      lat: 1.3521,
      lng: 103.8198,
    },
    "hong-kong": {
      name: "Hong Kong",
      countryCode: "HK",
      lat: 22.3193,
      lng: 114.1694,
    },
    tokyo: { name: "Tokyo", countryCode: "JP", lat: 35.6762, lng: 139.6503 },
    karachi: {
      name: "Karachi",
      countryCode: "PK",
      lat: 24.8607,
      lng: 67.0011,
    },
  };

  // For each synthetic metro (defined for terrestrial edges / hubs),
  // either merge into the nearest real clustered metro (if within 200km and same country)
  // or add as a standalone node. Also create aliases so terrestrial edge lookups work.
  const metroAliases = new Map<string, string>(); // alias ID -> canonical ID

  for (const [id, info] of Object.entries(syntheticMetros)) {
    if (metroCoords.has(id)) {
      // Already exists from clustering — no action needed
      continue;
    }

    // Find nearest real metro in the same country within 200km
    let nearestId: string | null = null;
    let nearestDist = 200;
    for (const m of metros) {
      if (m.countryCode !== info.countryCode) continue;
      if (m.landingStationCount === 0) continue; // skip other synthetics
      const d = haversineKm(info.lat, info.lng, m.lat, m.lng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestId = m.id;
      }
    }

    if (nearestId) {
      // Merge: create alias from synthetic ID to real metro
      metroAliases.set(id, nearestId);
      // Also mark the real metro as a hub if the synthetic is a hub
      if (MANUAL_HUB_IDS.has(id)) {
        const realMetro = metros.find((m) => m.id === nearestId);
        if (realMetro) realMetro.isHub = true;
      }
    } else {
      // No nearby metro — add as standalone
      metroCoords.set(id, { lat: info.lat, lng: info.lng });
      metros.push({
        id,
        name: info.name,
        countryCode: info.countryCode,
        lat: info.lat,
        lng: info.lng,
        isHub: MANUAL_HUB_IDS.has(id),
        landingStationCount: 0,
      });
    }
  }

  // Ensure metroCoords also has aliases
  for (const [alias, canonical] of metroAliases) {
    if (!metroCoords.has(alias)) {
      const real = metroCoords.get(canonical);
      if (real) metroCoords.set(alias, real);
    }
  }

  console.log(`  ${metroAliases.size} synthetic metros merged into real metros`);
  console.log(`  Example merges: ${[...metroAliases.entries()].slice(0, 5).map(([a, c]) => `${a} -> ${c}`).join(", ")}`);

  // Terrestrial edge definitions from ARCHITECTURE.md Appendix B
  const terrestrialDefs: Array<{
    from: string;
    to: string;
    capacityTbps: number;
    confidence: "verified" | "estimated" | "approximated";
    source: string;
    operators: string[];
    notes?: string;
  }> = [
    // Europe
    { from: "london", to: "paris", capacityTbps: 80, confidence: "estimated", source: "Colt Channel Tunnel, EXA, Crosslake CrossChannel, euNetworks, Zayo", operators: ["Colt", "EXA", "Crosslake", "euNetworks", "Zayo"] },
    { from: "london", to: "amsterdam", capacityTbps: 80, confidence: "estimated", source: "euNetworks Super Highway (Scylla), EXA, Zayo, GTT, Cogent, Telia", operators: ["euNetworks", "EXA", "Zayo", "GTT", "Cogent", "Telia"] },
    { from: "london", to: "brussels", capacityTbps: 40, confidence: "estimated", source: "EXA, Colt, Cogent", operators: ["EXA", "Colt", "Cogent"] },
    { from: "frankfurt", to: "amsterdam", capacityTbps: 100, confidence: "estimated", source: "euNetworks Super Highway 54 Tbps/pair, EXA, Cogent, Telia, GTT, Zayo", operators: ["euNetworks", "EXA", "Cogent", "Telia", "GTT", "Zayo"] },
    { from: "frankfurt", to: "paris", capacityTbps: 100, confidence: "estimated", source: "euNetworks Super Highway, EXA, Zayo, Cogent, GTT, Telia", operators: ["euNetworks", "EXA", "Zayo", "Cogent", "GTT", "Telia"] },
    { from: "frankfurt", to: "london", capacityTbps: 80, confidence: "estimated", source: "EXA, euNetworks, Cogent, Telia, Zayo, GTT", operators: ["EXA", "euNetworks", "Cogent", "Telia", "Zayo", "GTT"] },
    { from: "paris", to: "marseille", capacityTbps: 60, confidence: "estimated", source: "EXA Paris-Marseille corridor, euNetworks Frankfurt-Marseille-Milan, Cogent, Zayo", operators: ["EXA", "euNetworks", "Cogent", "Zayo"] },
    { from: "frankfurt", to: "milan", capacityTbps: 40, confidence: "estimated", source: "euNetworks Frankfurt-Milan via Zurich, Zayo, Sparkle", operators: ["euNetworks", "Zayo", "Sparkle"] },
    { from: "frankfurt", to: "zurich", capacityTbps: 40, confidence: "estimated", source: "euNetworks Super Highway, EXA, Swisscom", operators: ["euNetworks", "EXA", "Swisscom"] },
    { from: "marseille", to: "milan", capacityTbps: 40, confidence: "estimated", source: "euNetworks via Zurich, Sparkle, EXA, Zayo", operators: ["euNetworks", "Sparkle", "EXA", "Zayo"] },
    { from: "berlin", to: "warsaw", capacityTbps: 20, confidence: "estimated", source: "EXA Project Visegrad", operators: ["EXA"] },
    { from: "vienna", to: "bratislava", capacityTbps: 15, confidence: "estimated", source: "EXA Project Visegrad", operators: ["EXA"] },
    { from: "prague", to: "berlin", capacityTbps: 20, confidence: "estimated", source: "EXA Project Visegrad + existing operators", operators: ["EXA"] },
    { from: "marseille", to: "istanbul", capacityTbps: 25, confidence: "verified", source: "EXA TAE: 36 pairs G.652D, 25 Tbps/pair, Marseille-Italy-Greece-Turkey", operators: ["EXA"] },
    { from: "athens", to: "istanbul", capacityTbps: 15, confidence: "estimated", source: "TAE branch + Grid Telecom", operators: ["EXA", "Grid Telecom"] },
    { from: "sofia", to: "istanbul", capacityTbps: 10, confidence: "estimated", source: "TAE branch + SOCAR Fiber", operators: ["EXA", "SOCAR"] },
    { from: "vienna", to: "budapest", capacityTbps: 15, confidence: "estimated", source: "EXA Project Visegrad extension", operators: ["EXA"] },
    { from: "frankfurt", to: "vienna", capacityTbps: 30, confidence: "estimated", source: "EXA, euNetworks, Deutsche Telekom, A1", operators: ["EXA", "euNetworks", "Deutsche Telekom", "A1"] },
    { from: "madrid", to: "marseille", capacityTbps: 20, confidence: "estimated", source: "EXA, Cogent, Telefonica", operators: ["EXA", "Cogent", "Telefonica"] },
    { from: "stockholm", to: "helsinki", capacityTbps: 15, confidence: "estimated", source: "Telia, Cinia (C-Lion1 + terrestrial)", operators: ["Telia", "Cinia"] },

    // Germany internal backbone (Deutsche Telekom, 1&1 Versatel, GlobalConnect)
    { from: "frankfurt", to: "berlin", capacityTbps: 80, confidence: "estimated", source: "Deutsche Telekom, Versatel, GlobalConnect core backbone", operators: ["Deutsche Telekom", "Versatel", "GlobalConnect"] },
    { from: "frankfurt", to: "hamburg", capacityTbps: 60, confidence: "estimated", source: "Deutsche Telekom backbone, Versatel, euNetworks", operators: ["Deutsche Telekom", "Versatel", "euNetworks"] },
    { from: "hamburg", to: "berlin", capacityTbps: 40, confidence: "estimated", source: "Deutsche Telekom, regional carriers", operators: ["Deutsche Telekom"] },
    { from: "hamburg", to: "rostock", capacityTbps: 20, confidence: "estimated", source: "Deutsche Telekom, regional carriers (Baltic coast backhaul)", operators: ["Deutsche Telekom"] },
    { from: "berlin", to: "rostock", capacityTbps: 15, confidence: "estimated", source: "Deutsche Telekom northern backbone", operators: ["Deutsche Telekom"] },
    { from: "frankfurt", to: "munich", capacityTbps: 60, confidence: "estimated", source: "Deutsche Telekom, Versatel core backbone", operators: ["Deutsche Telekom", "Versatel"] },

    // Nordic internal backbone
    { from: "stockholm", to: "copenhagen", capacityTbps: 30, confidence: "estimated", source: "Telia, GlobalConnect Oresund crossing", operators: ["Telia", "GlobalConnect"] },
    { from: "copenhagen", to: "hamburg", capacityTbps: 25, confidence: "estimated", source: "GlobalConnect, Telia Denmark-Germany backbone", operators: ["GlobalConnect", "Telia"] },

    // UK internal backbone (BT, Virgin Media, Colt)
    { from: "london", to: "manchester", capacityTbps: 60, confidence: "estimated", source: "BT, Virgin Media, CityFibre core backbone", operators: ["BT", "Virgin Media", "CityFibre"] },
    { from: "london", to: "cornwall", capacityTbps: 20, confidence: "estimated", source: "BT backbone to Bude cable landing station", operators: ["BT"] },

    // Japan internal backbone (NTT, KDDI, SoftBank)
    { from: "tokyo", to: "osaka", capacityTbps: 100, confidence: "estimated", source: "NTT, KDDI, SoftBank Tokaido backbone", operators: ["NTT", "KDDI", "SoftBank"] },

    // Italy internal backbone (Telecom Italia/Sparkle)
    { from: "milan", to: "rome", capacityTbps: 40, confidence: "estimated", source: "Telecom Italia, Sparkle domestic backbone", operators: ["Telecom Italia", "Sparkle"] },
    { from: "rome", to: "sicily", capacityTbps: 20, confidence: "estimated", source: "Telecom Italia southern backbone", operators: ["Telecom Italia"] },

    // India internal backbone (Reliance Jio, Airtel, BSNL)
    { from: "mumbai", to: "chennai", capacityTbps: 40, confidence: "estimated", source: "Reliance Jio, Airtel, BSNL national backbone", operators: ["Reliance Jio", "Airtel", "BSNL"] },
    { from: "mumbai", to: "delhi", capacityTbps: 60, confidence: "estimated", source: "Reliance Jio, Airtel, BSNL — highest-capacity Indian corridor", operators: ["Reliance Jio", "Airtel", "BSNL"] },
    { from: "chennai", to: "bangalore", capacityTbps: 30, confidence: "estimated", source: "Reliance Jio, Airtel southern backbone", operators: ["Reliance Jio", "Airtel"] },

    // Indonesia internal (Telkom Indonesia)
    { from: "jakarta", to: "surabaya", capacityTbps: 20, confidence: "estimated", source: "Telkom Indonesia Java backbone", operators: ["Telkom Indonesia"] },
    { from: "singapore", to: "batam", capacityTbps: 30, confidence: "estimated", source: "Cross-strait fiber links (multiple operators)", operators: ["Singtel", "Telkom Indonesia"] },

    // Malaysia-Singapore backhaul
    { from: "singapore", to: "mersing", capacityTbps: 15, confidence: "estimated", source: "Malaysian terrestrial to SG cable landing stations", operators: ["TM", "Singtel"] },

    // Brazil internal backbone (Oi, Vivo, Embratel)
    { from: "sao-paulo", to: "fortaleza", capacityTbps: 30, confidence: "estimated", source: "Oi, Vivo, Embratel NE backbone (key for transatlantic cables)", operators: ["Oi", "Vivo", "Embratel"] },
    { from: "sao-paulo", to: "salvador", capacityTbps: 20, confidence: "estimated", source: "Oi, Vivo coastal backbone", operators: ["Oi", "Vivo"] },

    // China internal backbone (China Telecom, China Unicom, China Mobile)
    { from: "hong-kong", to: "guangzhou", capacityTbps: 60, confidence: "estimated", source: "China Telecom, China Unicom cross-border + domestic", operators: ["China Telecom", "China Unicom"] },
    { from: "guangzhou", to: "shanghai", capacityTbps: 80, confidence: "estimated", source: "China Telecom core backbone", operators: ["China Telecom", "China Unicom", "China Mobile"] },
    { from: "shanghai", to: "tokyo", capacityTbps: 20, confidence: "estimated", source: "Multiple submarine + transit paths", operators: ["China Telecom", "NTT"] },

    // Australia internal (Telstra, Optus)
    { from: "sydney", to: "melbourne", capacityTbps: 40, confidence: "estimated", source: "Telstra, Optus, Vocus domestic backbone", operators: ["Telstra", "Optus", "Vocus"] },
    { from: "sydney", to: "perth", capacityTbps: 15, confidence: "estimated", source: "Telstra transcontinental + Vocus Pipe Networks", operators: ["Telstra", "Vocus"] },

    // Trans-Russia / Central Asia
    { from: "st-petersburg", to: "moscow", capacityTbps: 50, confidence: "estimated", source: "Rostelecom TEA NEXT, MegaFon, Beeline", operators: ["Rostelecom", "MegaFon", "Beeline"] },
    { from: "moscow", to: "yekaterinburg", capacityTbps: 20, confidence: "estimated", source: "Rostelecom TEA NEXT backbone", operators: ["Rostelecom"] },
    { from: "yekaterinburg", to: "novosibirsk", capacityTbps: 15, confidence: "estimated", source: "Rostelecom TEA NEXT backbone", operators: ["Rostelecom"] },
    { from: "novosibirsk", to: "vladivostok", capacityTbps: 10, confidence: "estimated", source: "Rostelecom TEA NEXT", operators: ["Rostelecom"] },
    { from: "moscow", to: "manzhouli", capacityTbps: 5, confidence: "estimated", source: "TEA, TEA-2, TEA-3 cross-border", operators: ["Rostelecom", "China Telecom"] },
    { from: "helsinki", to: "st-petersburg", capacityTbps: 10, confidence: "estimated", source: "Telia Carrier, Russia-Finland border", operators: ["Telia"] },
    { from: "tallinn", to: "st-petersburg", capacityTbps: 5, confidence: "estimated", source: "Telia mesh network", operators: ["Telia"] },
    { from: "frankfurt", to: "almaty", capacityTbps: 8, confidence: "estimated", source: "DREAM + TRANSKZ systems", operators: ["MegaFon", "Kazakhtelecom", "Colt", "RETN"] },
    { from: "baku", to: "aktau", capacityTbps: 20, confidence: "approximated", source: "Trans-Caspian Fiber Optic Cable (Digital Silk Way), 400 Tbps design", operators: ["AzerTelecom", "Kazakhtelecom"], notes: "Planned completion end 2026" },
    { from: "almaty", to: "urumqi", capacityTbps: 15, confidence: "estimated", source: "Khorgos/Alashankou crossings, DREAM + TRANSKZ", operators: ["China Telecom", "China Unicom", "Kazakhtelecom"] },
    { from: "moscow", to: "ulaanbaatar", capacityTbps: 3, confidence: "estimated", source: "TEA-4, TMP Transit-Mongolia", operators: ["Rostelecom"] },

    // Middle East
    { from: "muscat", to: "riyadh", capacityTbps: 10, confidence: "approximated", source: "SONIC (STC + Ooredoo JV)", operators: ["STC", "Ooredoo"] },
    { from: "riyadh", to: "amman", capacityTbps: 5, confidence: "estimated", source: "Existing Gulf-Levant links", operators: [] },
    { from: "baku", to: "tehran", capacityTbps: 2, confidence: "estimated", source: "TIC Astara border crossing", operators: ["TIC"] },
    { from: "tehran", to: "karachi", capacityTbps: 1, confidence: "approximated", source: "Iran-Pakistan terrestrial", operators: [] },
    { from: "muscat", to: "cairo", capacityTbps: 10, confidence: "approximated", source: "Zain-Omantel corridor", operators: ["Zain", "Omantel"] },
    { from: "istanbul", to: "tbilisi", capacityTbps: 10, confidence: "estimated", source: "EXA + SOCAR Fiber 1850km Turkey-Georgia", operators: ["EXA", "SOCAR"] },
    { from: "djibouti", to: "addis-ababa", capacityTbps: 5, confidence: "estimated", source: "Horizon Initiative + Ethio Telecom", operators: ["Ethio Telecom", "Djibouti Telecom"] },
    { from: "addis-ababa", to: "khartoum", capacityTbps: 5, confidence: "estimated", source: "Horizon Initiative extension", operators: ["Sudatel"] },

    // US Backbone
    { from: "new-york", to: "chicago", capacityTbps: 200, confidence: "estimated", source: "Lumen 350 Tbps backbone, Zayo 1 Pbps active, Cogent, AT&T, Verizon", operators: ["Lumen", "Zayo", "Cogent", "AT&T", "Verizon"] },
    { from: "chicago", to: "los-angeles", capacityTbps: 150, confidence: "estimated", source: "Lumen, Zayo western expansion, Cogent, AT&T", operators: ["Lumen", "Zayo", "Cogent", "AT&T"] },
    { from: "new-york", to: "washington-dc", capacityTbps: 200, confidence: "estimated", source: "Highest-density US corridor, all major carriers", operators: ["Lumen", "Zayo", "AT&T", "Verizon", "Cogent"] },
    { from: "new-york", to: "dallas", capacityTbps: 100, confidence: "estimated", source: "Lumen, Zayo, AT&T", operators: ["Lumen", "Zayo", "AT&T"] },
    { from: "dallas", to: "los-angeles", capacityTbps: 100, confidence: "estimated", source: "Lumen, Zayo, AT&T", operators: ["Lumen", "Zayo", "AT&T"] },
    { from: "chicago", to: "dallas", capacityTbps: 80, confidence: "estimated", source: "Lumen, Zayo, AT&T", operators: ["Lumen", "Zayo", "AT&T"] },
    { from: "new-york", to: "miami", capacityTbps: 80, confidence: "estimated", source: "Lumen, AT&T, Zayo", operators: ["Lumen", "AT&T", "Zayo"] },
    { from: "dallas", to: "houston", capacityTbps: 60, confidence: "estimated", source: "Regional trunk", operators: ["Lumen", "AT&T"] },
    { from: "seattle", to: "los-angeles", capacityTbps: 60, confidence: "estimated", source: "West Coast backbone, Zayo western expansion", operators: ["Zayo", "Lumen"] },
    { from: "denver", to: "dallas", capacityTbps: 40, confidence: "estimated", source: "Lumen 1.2 Tbps single carrier test on this route", operators: ["Lumen", "Zayo"] },
    { from: "denver", to: "chicago", capacityTbps: 40, confidence: "estimated", source: "Lumen, Zayo", operators: ["Lumen", "Zayo"] },
    { from: "atlanta", to: "miami", capacityTbps: 40, confidence: "estimated", source: "SE US trunk", operators: ["Lumen", "AT&T"] },

    // US Cross-Border
    { from: "san-diego", to: "tijuana", capacityTbps: 25, confidence: "estimated", source: "MDC Data Centers, multiple carriers", operators: ["MDC"] },
    { from: "laredo", to: "monterrey", capacityTbps: 30, confidence: "estimated", source: "MDC, Zayo + Fermaca", operators: ["MDC", "Zayo", "Fermaca"] },
    { from: "el-paso", to: "ciudad-juarez", capacityTbps: 20, confidence: "estimated", source: "MDC, Zayo + Fermaca", operators: ["MDC", "Zayo", "Fermaca"] },
    { from: "seattle", to: "vancouver", capacityTbps: 30, confidence: "estimated", source: "Zayo, multiple carriers", operators: ["Zayo"] },
    { from: "new-york", to: "toronto", capacityTbps: 40, confidence: "estimated", source: "Zayo, Cogent, multiple carriers", operators: ["Zayo", "Cogent"] },
    { from: "chicago", to: "toronto", capacityTbps: 30, confidence: "estimated", source: "Multiple carriers", operators: [] },

    // Africa
    { from: "mombasa", to: "nairobi", capacityTbps: 12, confidence: "verified", source: "Liquid 12 Tbps Mombasa-Johannesburg corridor", operators: ["Liquid"] },
    { from: "nairobi", to: "kampala", capacityTbps: 5, confidence: "estimated", source: "Liquid backbone, WIOCC", operators: ["Liquid", "WIOCC"] },
    { from: "kampala", to: "kigali", capacityTbps: 2, confidence: "estimated", source: "Liquid backbone", operators: ["Liquid"] },
    { from: "nairobi", to: "addis-ababa", capacityTbps: 4, confidence: "verified", source: "Liquid Kenya-Ethiopia 4 Tbps", operators: ["Liquid"] },
    { from: "lusaka", to: "lilongwe", capacityTbps: 1, confidence: "verified", source: "Liquid Zambia-Malawi 711 km", operators: ["Liquid"] },
    { from: "johannesburg", to: "cape-town", capacityTbps: 10, confidence: "estimated", source: "Telkom SA, WIOCC, Liquid", operators: ["Telkom SA", "WIOCC", "Liquid"] },
    { from: "johannesburg", to: "maputo", capacityTbps: 3, confidence: "estimated", source: "Liquid, regional carriers", operators: ["Liquid"] },
    { from: "lusaka", to: "harare", capacityTbps: 3, confidence: "estimated", source: "Liquid backbone", operators: ["Liquid"] },
    { from: "harare", to: "johannesburg", capacityTbps: 5, confidence: "estimated", source: "Liquid backbone", operators: ["Liquid"] },

    // East Asia
    { from: "hanoi", to: "nanning", capacityTbps: 10, confidence: "estimated", source: "China-Vietnam Pingxiang/Dongxing crossings", operators: ["China Telecom", "China Unicom"] },
    { from: "mandalay", to: "kunming", capacityTbps: 2, confidence: "estimated", source: "CMI Cable 800 Gbps design", operators: ["China Unicom", "MPT"] },
    { from: "vientiane", to: "kunming", capacityTbps: 2, confidence: "estimated", source: "China-Laos terrestrial", operators: ["China Telecom"] },
    { from: "dhaka", to: "kolkata", capacityTbps: 5, confidence: "estimated", source: "Three India-Bangladesh cross-border cables", operators: ["BTCL", "BSNL", "Airtel", "Tata"] },

    // South America
    { from: "sao-paulo", to: "buenos-aires", capacityTbps: 50, confidence: "estimated", source: "SAC, Cirion 668 Tbps LATAM, Internexa", operators: ["SAC", "Cirion", "Internexa"] },
    { from: "buenos-aires", to: "santiago", capacityTbps: 15, confidence: "estimated", source: "Andes crossing, SAC, Cirion, Conect Infra", operators: ["SAC", "Cirion", "Conect Infra"] },
    { from: "sao-paulo", to: "rio-de-janeiro", capacityTbps: 80, confidence: "estimated", source: "Domestic trunk, Cirion, multiple carriers", operators: ["Cirion"] },
    { from: "lima", to: "santiago", capacityTbps: 10, confidence: "estimated", source: "Internexa, SAC", operators: ["Internexa", "SAC"] },
    { from: "bogota", to: "lima", capacityTbps: 8, confidence: "estimated", source: "Internexa backbone", operators: ["Internexa"] },
    { from: "bogota", to: "cali", capacityTbps: 15, confidence: "estimated", source: "Domestic trunk, Internexa", operators: ["Internexa"] },
    { from: "quito", to: "bogota", capacityTbps: 8, confidence: "estimated", source: "Internexa Colombia-Ecuador", operators: ["Internexa"] },
    { from: "sao-paulo", to: "porto-alegre", capacityTbps: 30, confidence: "estimated", source: "Domestic trunk, Conect Infra", operators: ["Conect Infra"] },
  ];

  const terrestrial: TerrestrialEdge[] = terrestrialDefs.map((def, i) => {
    // Resolve aliases for from/to
    const resolvedFrom = metroAliases.get(def.from) ?? def.from;
    const resolvedTo = metroAliases.get(def.to) ?? def.to;
    const fromCoord = metroCoords.get(resolvedFrom) ?? metroCoords.get(def.from);
    const toCoord = metroCoords.get(resolvedTo) ?? metroCoords.get(def.to);
    let distKm = 0;
    if (fromCoord && toCoord) {
      distKm = Math.round(
        haversineKm(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng),
      );
    }
    return {
      id: `terr-${i + 1}-${resolvedFrom}-${resolvedTo}`,
      from: resolvedFrom,
      to: resolvedTo,
      capacityTbps: def.capacityTbps,
      distanceKm: distKm,
      confidence: def.confidence,
      source: def.source,
      operators: def.operators,
      ...(def.notes ? { notes: def.notes } : {}),
    };
  });

  console.log(`  ${terrestrial.length} terrestrial edges`);

  // ── Chokepoints ──

  console.log("\nBuilding chokepoints...");

  function bboxPolygon(
    minLat: number,
    maxLat: number,
    minLng: number,
    maxLng: number,
  ): Polygon {
    return {
      type: "Polygon",
      coordinates: [
        [
          [minLng, minLat],
          [maxLng, minLat],
          [maxLng, maxLat],
          [minLng, maxLat],
          [minLng, minLat],
        ],
      ],
    };
  }

  const chokepoints: Chokepoint[] = [
    {
      id: "bab-al-mandab",
      name: "Bab al-Mandab (Red Sea)",
      polygon: bboxPolygon(11.5, 13.5, 42.5, 44.5),
      description:
        "Narrow strait connecting the Red Sea to the Gulf of Aden. ~15 submarine cables transit this chokepoint carrying the majority of Europe-Asia traffic.",
    },
    {
      id: "strait-of-malacca",
      name: "Strait of Malacca",
      polygon: bboxPolygon(0.5, 4.0, 99.0, 104.5),
      description:
        "Strait between Malaysia and Indonesia. Major bottleneck for cables connecting Southeast Asia, East Asia, and the Indian Ocean.",
    },
    {
      id: "baltic-sea",
      name: "Baltic Sea",
      polygon: bboxPolygon(54.0, 60.0, 12.0, 26.0),
      description:
        "Semi-enclosed sea in Northern Europe. Multiple submarine cables connecting Nordic and Baltic states. Recent sabotage incidents (2024).",
    },
    {
      id: "luzon-strait",
      name: "Luzon Strait",
      polygon: bboxPolygon(18.5, 21.5, 119.0, 123.0),
      description:
        "Strait between Taiwan and the Philippines. Major junction for trans-Pacific cables. Vulnerable to earthquakes and submarine landslides.",
    },
    {
      id: "guam",
      name: "Guam",
      polygon: bboxPolygon(12.5, 14.5, 143.5, 146.0),
      description:
        "Pacific island hub where many trans-Pacific cables converge. Single-point-of-failure risk for Pacific connectivity.",
    },
    {
      id: "english-channel",
      name: "English Channel",
      polygon: bboxPolygon(49.5, 51.5, -2.0, 2.0),
      description:
        "Narrow strait between England and France. Critical junction for transatlantic cables connecting to Europe and UK-continent links.",
    },
  ];

  console.log(`  ${chokepoints.length} chokepoints`);

  // ── Scenarios ──

  console.log("\nBuilding scenarios...");

  const scenarios: Scenario[] = [
    {
      id: "red-sea-crisis",
      name: "Red Sea Crisis",
      description:
        "Simulates cable cuts in the Bab al-Mandab strait, similar to the February 2024 Houthi-related cable damage. ~15 cables carry the majority of Europe-Asia traffic through this chokepoint.",
      cutLocations: [{ type: "chokepoint", id: "bab-al-mandab" }],
      historicalDate: "2024-02-24",
      repairTimeDays: 56,
    },
    {
      id: "malacca-strait",
      name: "Strait of Malacca Disruption",
      description:
        "Cables through the Strait of Malacca are severed, disrupting the primary route between Southeast Asia, East Asia, and the Indian Ocean.",
      cutLocations: [{ type: "chokepoint", id: "strait-of-malacca" }],
    },
    {
      id: "baltic-sabotage",
      name: "Baltic Sea Sabotage",
      description:
        "Simulates cable cuts in the Baltic Sea, similar to the November 2024 incidents. Tests Northern European redundancy via terrestrial backup.",
      cutLocations: [{ type: "chokepoint", id: "baltic-sea" }],
      historicalDate: "2024-11-17",
      repairTimeDays: 10,
    },
    {
      id: "luzon-strait-earthquake",
      name: "Luzon Strait Earthquake",
      description:
        "Major earthquake triggers submarine landslide in the Luzon Strait, cutting multiple trans-Pacific cables. Similar to the 2006 Hengchun event.",
      cutLocations: [{ type: "chokepoint", id: "luzon-strait" }],
      historicalDate: "2006-12-26",
      repairTimeDays: 35,
    },
    {
      id: "guam-hub-failure",
      name: "Guam Hub Failure",
      description:
        "All cables landing at Guam are severed. Tests the impact of losing a critical Pacific routing hub.",
      cutLocations: [{ type: "chokepoint", id: "guam" }],
    },
    {
      id: "english-channel-cut",
      name: "English Channel Cut",
      description:
        "Cables through the English Channel are severed, testing UK connectivity resilience and transatlantic cable routing.",
      cutLocations: [{ type: "chokepoint", id: "english-channel" }],
    },
  ];

  console.log(`  ${scenarios.length} scenarios`);

  // ── Write output files ──

  console.log("\nWriting output files...");
  writeOut("cables.json", cables);
  writeOut("metros.json", metros);
  writeOut("terrestrial.json", terrestrial);
  writeOut("chokepoints.json", chokepoints);
  writeOut("scenarios.json", scenarios);

  // Summary
  console.log("\nSummary:");
  console.log(`  Cables: ${cables.length}`);
  console.log(`  Metros: ${metros.length}`);
  console.log(`  Terrestrial edges: ${terrestrial.length}`);
  console.log(`  Chokepoints: ${chokepoints.length}`);
  console.log(`  Scenarios: ${scenarios.length}`);
  console.log(
    `  Total cable segments: ${cables.reduce((s, c) => s + c.segments.length, 0)}`,
  );
  const hubMetros = metros.filter((m) => m.isHub);
  console.log(
    `  Hub metros: ${hubMetros.map((m) => m.id).join(", ")}`,
  );
  console.log("\nDone!");
}

main();

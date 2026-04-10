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

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Feature, LineString, MultiLineString, Polygon } from "geojson";

// ── Paths ──

const RAW_DIR = resolve(import.meta.dirname ?? ".", "raw");
const OUT_DIR = resolve(import.meta.dirname ?? ".", "..", "public", "data");

// ── Helpers ──

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

// Capacity heuristic by RFS (ready-for-service) year.
// Sources and reasoning per band:
//   <2005: TAT-14 1.9 Tbps (2001), FA-1 4.8 Tbps (2001), Apollo 6.4 Tbps (2003)
//          → median ~4 Tbps. https://en.wikipedia.org/wiki/TAT-14
//   2005-2012: SEA-ME-WE 4 12.8 Tbps (2005), most cables 10-15 Tbps
//          → 15 Tbps. https://en.wikipedia.org/wiki/SEA-ME-WE_3
//   2012-2018: Hibernia Express 53 Tbps (2015), FASTER 60 Tbps (2016), SEA-ME-WE 5 24-37 Tbps (2017)
//          → median ~50 Tbps. https://en.wikipedia.org/wiki/SEA-ME-WE_5
//   2018-2022: MAREA 200 Tbps (2018), Dunant 250 Tbps (2021), PEACE 192 Tbps (2022)
//          → median ~200 Tbps. https://en.wikipedia.org/wiki/MAREA
//   2022+: Grace Hopper 352 Tbps (2022), Amitie 400 Tbps (2023), 2Africa 180 Tbps (2025),
//          SEA-ME-WE 6 ~130 Tbps (2025) → bimodal (hyperscaler 350-480, consortium 130-180)
//          → median ~280 Tbps. https://en.wikipedia.org/wiki/Grace_Hopper_(submarine_communications_cable)
function capacityFromRfsYear(year: number): number {
	if (year < 2005) return 4;
	if (year < 2012) return 15;
	if (year < 2018) return 50;
	if (year < 2022) return 200;
	return 280;
}

// ── Known cable capacities from verified sources ──
// Each entry: [designCapacityTbps, fiberPairs | null, source, confidence]
// Cable IDs must match TeleGeography's slug format.
const CAPACITY_OVERRIDES: Record<
	string,
	{
		tbps: number;
		pairs: number | null;
		source: "fcc" | "press" | "wikipedia" | "derived";
		confidence: "verified" | "estimated";
		sourceUrl: string;
	}
> = {
	// Pre-2005
	// tat-14: retired 2020, not in TeleGeography active set
	"southern-cross-cable-network-sccn": {
		tbps: 1.28,
		pairs: 3,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/southern-cross",
	},
	"flag-atlantic-1-fa-1": {
		tbps: 4.8,
		pairs: 6,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-atlantic/fa-1",
	},
	apollo: {
		tbps: 6.4,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-atlantic/apollo",
	},
	// 2005-2012
	"seamewe-4": {
		tbps: 12.8,
		pairs: 2,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/SEA-ME-WE_4",
	},
	// 2012-2018
	// hibernia-express: not in TeleGeography index under this slug
	// aeconnect-1: not in TeleGeography index under this slug
	faster: {
		tbps: 60,
		pairs: 6,
		source: "press",
		confidence: "verified",
		sourceUrl:
			"https://cloud.google.com/blog/products/gcp/new-undersea-cable-expands-capacity-for-google-apac-customers-and-users",
	},
	"seamewe-5": {
		tbps: 24,
		pairs: 3,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/SEA-ME-WE_5",
	},
	// 2018-2022
	marea: {
		tbps: 224,
		pairs: 8,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/MAREA",
	},
	dunant: {
		tbps: 250,
		pairs: 12,
		source: "press",
		confidence: "verified",
		sourceUrl:
			"https://cloud.google.com/blog/products/infrastructure/dunant-subsea-cable-is-now-ready-for-service",
	},
	"grace-hopper": {
		tbps: 352,
		pairs: 16,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/Grace_Hopper_(submarine_communications_cable)",
	},
	"peace-cable": {
		tbps: 192,
		pairs: 12,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/peace",
	},
	equiano: {
		tbps: 144,
		pairs: 12,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/Equiano_(submarine_communications_cable)",
	},
	// 2022+
	amitie: {
		tbps: 400,
		pairs: 16,
		source: "press",
		confidence: "verified",
		sourceUrl:
			"https://newsroom.orange.com/orange-announces-the-launch-of-the-amitie-subsea-cable-offering-a-unique-and-robust-transatlantic-solution-with-ultra-low-latency/",
	},
	"2africa": {
		tbps: 180,
		pairs: 16,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/2africa",
	},
	// sea-me-we-6: may not be in TeleGeography yet (RFS 2025)
	"c-lion1": {
		tbps: 144,
		pairs: 8,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/C-Lion1",
	},
	"asia-africa-europe-1-aae-1": {
		tbps: 40,
		pairs: 5,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/aae-1",
	},
	"africa-coast-to-europe-ace": {
		tbps: 20,
		pairs: 2,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/euro-africa/ace",
	},
	"eastern-africa-submarine-system-eassy": {
		tbps: 36,
		pairs: 2,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/eassy",
	},
	"west-africa-cable-system-wacs": {
		tbps: 14.5,
		pairs: 4,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/euro-africa/wacs",
	},
	"seacomtata-tgn-eurasia": {
		tbps: 1.5,
		pairs: 2,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/seacom",
	},
	"asia-pacific-gateway-apg": {
		tbps: 30.72,
		pairs: 6,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/apg",
	},
	"pacific-light-cable-network-plcn": {
		tbps: 144,
		pairs: 12,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/plcn",
	},
	"havfrueaec-2": {
		tbps: 108,
		pairs: 6,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-atlantic/havfrue",
	},
	ellalink: {
		tbps: 100,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-atlantic/ellalink",
	},
	// africa-1: slug ambiguous in TeleGeography index
	"japan-guam-australia-south-jga-s": {
		tbps: 36,
		pairs: 4,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-australia/jga",
	},
	"new-cross-pacific-ncp-cable-system": {
		tbps: 80,
		pairs: 8,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/ncp",
	},
	curie: {
		tbps: 72,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl:
			"https://cloud.google.com/blog/products/infrastructure/introducing-curie-a-new-subsea-cable",
	},
	jupiter: {
		tbps: 60,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/jupiter",
	},
	monet: {
		tbps: 60,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/brazil-us/cota",
	},
	"seabras-1": {
		tbps: 72,
		pairs: 8,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/brazil-us/seabras-1",
	},
	// india-europe-xpress: slug not confirmed in TeleGeography index
	bifrost: {
		tbps: 72,
		pairs: 12,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/bifrost",
	},
	echo: {
		tbps: 260,
		pairs: 12,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/echo",
	},
	firmina: {
		tbps: 240,
		pairs: 16,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/brazil-us/firmina",
	},
	brusa: {
		tbps: 108,
		pairs: 8,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/brazil-us/brusa",
	},
	topaz: {
		tbps: 240,
		pairs: 16,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/topaz",
	},

	// ── Batch 2: 39 additional cables from research ──

	// Pre-2005
	fea: {
		tbps: 10,
		pairs: 2,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/flag",
	},
	safe: {
		tbps: 0.44,
		pairs: 2,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/SAFE_(cable_system)",
	},
	"sat-3wasc": {
		tbps: 0.8,
		pairs: 2,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/SAT-3/WASC",
	},
	"apcn-2": {
		tbps: 2.56,
		pairs: 4,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/APCN_2",
	},
	"south-america-1-sam-1": {
		tbps: 1.92,
		pairs: 4,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/SAm-1",
	},
	"south-american-crossing-sac": {
		tbps: 15,
		pairs: 4,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/brazil-us/sac",
	},
	"pan-american-crossing-pac": {
		tbps: 3.2,
		pairs: 2,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/brazil-us/pac",
	},
	"pacific-crossing-1-pc-1": {
		tbps: 21.6,
		pairs: 4,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/pc-1",
	},
	"i2i-cable-network-i2icn": {
		tbps: 8.4,
		pairs: 8,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/i2i",
	},

	// 2005-2012
	falcon: {
		tbps: 2.56,
		pairs: 8,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/falcon",
	},
	"tata-tgn-pacific": {
		tbps: 77,
		pairs: 8,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/tgn-pacific",
	},
	"tata-tgn-western-europe": {
		tbps: 3.84,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-europe/tgn-western-europe",
	},
	"tata-tgn-intra-asia-tgn-ia": {
		tbps: 3.84,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/tgn-ia",
	},
	"tata-tgn-tata-indicom": {
		tbps: 5.12,
		pairs: 8,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/tic",
	},
	"tata-tgn-atlantic-south": {
		tbps: 5.12,
		pairs: 4,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-atlantic/tgn-atlantic",
	},
	"trans-pacific-express-tpe-cable-system": {
		tbps: 5.12,
		pairs: 4,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/TPE_(cable_system)",
	},
	"asia-america-gateway-aag-cable-system": {
		tbps: 2.88,
		pairs: 3,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/Asia-America_Gateway",
	},
	"the-east-african-marine-system-teams": {
		tbps: 5.6,
		pairs: 2,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/teams",
	},
	"greenland-connect": {
		tbps: 12.8,
		pairs: 2,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-atlantic/greenland-connect",
	},
	"glo-1": {
		tbps: 2.5,
		pairs: 2,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/GLO-1",
	},
	mainone: {
		tbps: 10,
		pairs: 2,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/euro-africa/mainone",
	},
	unity: {
		tbps: 7.68,
		pairs: 5,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/Unity_(cable_system)",
	},
	"europe-india-gateway-eig": {
		tbps: 3.84,
		pairs: 3,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/eig",
	},
	imewe: {
		tbps: 3.84,
		pairs: 3,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/I-ME-WE",
	},
	"australia-japan-cable-ajc": {
		tbps: 10,
		pairs: 2,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-australia/ajc",
	},
	"lower-indian-ocean-network-lion": {
		tbps: 1.28,
		pairs: 2,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/lion-2",
	},
	"tata-tgn-gulf": {
		tbps: 3.84,
		pairs: 2,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/tgn-gulf",
	},

	// 2012-2018
	"southeast-asia-japan-cable-sjc": {
		tbps: 28,
		pairs: 6,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/sjc",
	},
	"pipe-pacific-cable-1-ppc-1": {
		tbps: 12,
		pairs: 2,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-australia/ppc-1",
	},
	"pacific-caribbean-cable-system-pccs": {
		tbps: 80,
		pairs: 8,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/brazil-us/pccs",
	},
	"exa-express": {
		tbps: 53,
		pairs: 6,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/Hibernia_Express",
	},
	"bay-of-bengal-gateway-bbg": {
		tbps: 55,
		pairs: 3,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/Bay_of_Bengal_Gateway",
	},
	"aec-1": {
		tbps: 13,
		pairs: 4,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/AEConnect",
	},

	// 2018-2022
	"south-atlantic-cable-system-sacs": {
		tbps: 40,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.nec.com/en/press/201810/global_20181001_02.html",
	},
	"indigo-west": {
		tbps: 18,
		pairs: 2,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-australia/indigo",
	},
	"indigo-central": {
		tbps: 18,
		pairs: 2,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-australia/indigo",
	},
	hawaiki: {
		tbps: 67,
		pairs: 4,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/australia-usa/hawaiki-cable",
	},
	"djibouti-africa-regional-express-1-dare-1": {
		tbps: 36,
		pairs: 3,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/dare1",
	},
	"coral-sea-cable-system-cs": {
		tbps: 40,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-australia/coral-sea",
	},
	"southern-cross-next": {
		tbps: 72,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/southern-cross-next",
	},

	// 2022+
	"southeast-asia-japan-cable-2-sjc2": {
		tbps: 126,
		pairs: 7,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.nec.com/en/press/201803/global_20180315_01.html",
	},
	"asia-direct-cable-adc": {
		tbps: 160,
		pairs: 8,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/adc",
	},
	apricot: {
		tbps: 290,
		pairs: 12,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/apricot",
	},
	"seamewe-6": {
		tbps: 126,
		pairs: 10,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/SEA-ME-WE_6",
	},
	mist: {
		tbps: 240,
		pairs: 12,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/mist",
	},

	// ── Batch 3: from SubmarineNetworks.com deep dive ──
	blue: {
		tbps: 218,
		pairs: 16,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/blue-raman",
	},
	"oman-australia-cable-oac": {
		tbps: 48,
		pairs: 3,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-australia/oac",
	},
	"australia-singapore-cable-asc": {
		tbps: 60,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-australia/asc",
	},
	"darwin-jakarta-singapore-cable-djsc": {
		tbps: 40,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-australia/djsc",
	},
	iris: {
		tbps: 132,
		pairs: 6,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-europe/iris",
	},
	ionian: {
		tbps: 360,
		pairs: 24,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-europe/ionian",
	},
	t3: {
		tbps: 54,
		pairs: 4,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/t3",
	},
	juno: {
		tbps: 360,
		pairs: 20,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/juno",
	},
	"polar-express": {
		tbps: 104,
		pairs: 6,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-arctic/polar-express",
	},
	zeus: {
		tbps: 2650,
		pairs: 96,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-europe/zeus",
	},
	unitirreno: {
		tbps: 624,
		pairs: 24,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-europe/unitirreno",
	},
	"saudi-vision": {
		tbps: 288,
		pairs: 16,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/svc",
	},
	"senegal-horn-of-africa-regional-express-share-cable": {
		tbps: 16,
		pairs: null,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/euro-africa/share",
	},
	"east-micronesia-cable-system-emcs": {
		tbps: 10,
		pairs: 1,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/emcs",
	},
	"patara-2": {
		tbps: 16,
		pairs: 2,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/patara-2",
	},
	"timor-leste-south-submarine-cable-tlssc": {
		tbps: 27,
		pairs: null,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-australia/png-national/tlssc",
	},

	// ── Batch 4: web search deep dive ──
	"america-movil-submarine-cable-system-1-amx-1": {
		tbps: 50,
		pairs: null,
		source: "press",
		confidence: "verified",
		sourceUrl:
			"https://www.submarinenetworks.com/en/systems/brazil-us/amx1/amx-1-cable-system-overview",
	},
	"asia-submarine-cable-express-asecahaya-malaysia": {
		tbps: 15,
		pairs: 6,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/ase",
	},
	"sea-us": {
		tbps: 20,
		pairs: 2,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/trans-pacific/sea-us",
	},
	"gulf-bridge-international-cable-systemmiddle-east-north-africa-cable-system-gbicsmena": {
		tbps: 5,
		pairs: null,
		source: "wikipedia",
		confidence: "verified",
		sourceUrl: "https://en.wikipedia.org/wiki/Gulf_Bridge_International",
	},
	"gulf2africa-g2a": {
		tbps: 20,
		pairs: 2,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/g2a",
	},
	"lower-indian-ocean-network-2-lion2": {
		tbps: 1.28,
		pairs: 2,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/lion-2",
	},
	"seychelles-to-east-africa-system-seas": {
		tbps: 3.2,
		pairs: null,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/asia-europe-africa/seas",
	},
	"ceiba-2": {
		tbps: 8,
		pairs: null,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/euro-africa/ceiba-2",
	},
	"alba-1": {
		tbps: 5.12,
		pairs: null,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/brazil-us/alba-1",
	},
	"far-east-submarine-cable-system": {
		tbps: 16,
		pairs: 2,
		source: "press",
		confidence: "verified",
		sourceUrl:
			"https://www.submarinenetworks.com/news/huawei-marine-begins-manufacturing-of-far-east-submarine-cable-for-rostelecom",
	},
	"malaysia-cambodia-thailand-mct-cable": {
		tbps: 30,
		pairs: 6,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.submarinenetworks.com/en/systems/intra-asia/mct",
	},
	"quintillion-subsea-cable-network": {
		tbps: 30,
		pairs: 3,
		source: "press",
		confidence: "verified",
		sourceUrl:
			"https://www.submarinenetworks.com/en/systems/asia-europe-africa/arctic-fiber/quintillion-activates-arctic-subsea-cable",
	},
	didon: {
		tbps: 8,
		pairs: null,
		source: "press",
		confidence: "estimated",
		sourceUrl: "https://subtelforum.com/75didon-cable-between-italy-and-tunisia-makes-landfall/",
	},
	"india-asia-xpress-iax": {
		tbps: 100,
		pairs: null,
		source: "press",
		confidence: "verified",
		sourceUrl:
			"https://www.submarinenetworks.com/en/systems/intra-asia/iax/reliance-jio-to-build-iax-and-iex-submarine-cables",
	},
	thetis: {
		tbps: 180,
		pairs: null,
		source: "press",
		confidence: "verified",
		sourceUrl: "https://www.vodafone.com/news/newsroom/technology/thetis-subsea-cable-announcement",
	},
	"north-west-cable-system": {
		tbps: 12,
		pairs: 2,
		source: "press",
		confidence: "verified",
		sourceUrl:
			"https://www.vocus.com.au/about-vocus/our-network/international/northwest-cable-system",
	},
};

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
	capacitySource: "fcc" | "press" | "wikipedia" | "derived" | "heuristic";
	capacityConfidence: "verified" | "estimated" | "approximated";
	sourceUrl?: string;
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
	"new-york",
	"los-angeles",
	"miami",
	"chicago",
	"dallas",
	"washington-dc",
	"seattle",
	"toronto",
	"sao-paulo",
	"rio-de-janeiro",
	"buenos-aires",
	"fortaleza",
	"bogota",
	"santiago",
	"houston",
	"atlanta",
	"denver",
	"lima",
	// Europe
	"london",
	"frankfurt",
	"marseille",
	"amsterdam",
	"paris",
	"madrid",
	"milan",
	"istanbul",
	"stockholm",
	"athens",
	"lisbon",
	"barcelona",
	"bucharest",
	"warsaw",
	"copenhagen",
	"hamburg",
	"zurich",
	"budapest",
	"belgrade",
	"sofia",
	"zagreb",
	// Middle East / Africa
	"cairo",
	"mumbai",
	"dubai",
	"fujairah",
	"muscat",
	"jeddah",
	"djibouti",
	"nairobi",
	"mombasa",
	"johannesburg",
	"cape-town",
	"lagos",
	"accra",
	"addis-ababa",
	"riyadh",
	"abidjan",
	"dakar",
	// Asia-Pacific
	"singapore",
	"hong-kong",
	"tokyo",
	"taipei",
	"busan",
	"sydney",
	"chennai",
	"karachi",
	"guam",
	"jakarta",
	"perth",
	"bangkok",
	"hanoi",
	"kuala-lumpur",
	"manila",
	"ho-chi-minh-city",
	"phnom-penh",
	"shanghai",
	"guangzhou",
	"osaka",
	"seoul",
	"delhi",
	"dhaka",
	"colombo",
	"beijing",
	"shenzhen",
	"nanjing",
	"wuhan",
	"chengdu",
	"xian",
	"montreal",
	"oslo",
	"krakow",
	"mexico-city",
	"casablanca",
	"suez",
	"helsinki",
	// Russia / Central Asia
	"moscow",
	"vladivostok",
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
	// Caribbean & Central America
	bahamas: "BS",
	barbados: "BB",
	belize: "BZ",
	bermuda: "BM",
	cuba: "CU",
	dominica: "DM",
	grenada: "GD",
	guatemala: "GT",
	haiti: "HT",
	honduras: "HN",
	nicaragua: "NI",
	"antigua and barbuda": "AG",
	"saint lucia": "LC",
	"saint vincent and the grenadines": "VC",
	"saint kitts and nevis": "KN",
	"saint martin": "MF",
	"sint maarten": "SX",
	"sint eustatius and saba": "BQ",
	"turks and caicos islands": "TC",
	"cayman islands": "KY",
	anguilla: "AI",
	montserrat: "MS",
	aruba: "AW",
	curaçao: "CW",
	suriname: "SR",
	guyana: "GY",
	"french guiana": "GF",
	guadeloupe: "GP",
	martinique: "MQ",
	"saint barthélemy": "BL",
	"saint pierre and miquelon": "PM",
	"virgin islands (u.s.)": "VI",
	"virgin islands (u.k.)": "VG",
	// Europe
	estonia: "EE",
	latvia: "LV",
	lithuania: "LT",
	malta: "MT",
	iceland: "IS",
	albania: "AL",
	monaco: "MC",
	gibraltar: "GI",
	"isle of man": "IM",
	jersey: "JE",
	guernsey: "GG",
	"faroe islands": "FO",
	greenland: "GL",
	// Africa
	somalia: "SO",
	"equatorial guinea": "GQ",
	gabon: "GA",
	"cape verde": "CV",
	comoros: "KM",
	seychelles: "SC",
	mauritania: "MR",
	gambia: "GM",
	guinea: "GN",
	"guinea-bissau": "GW",
	"sierra leone": "SL",
	liberia: "LR",
	"côte d'ivoire": "CI",
	benin: "BJ",
	togo: "TG",
	"sao tome and principe": "ST",
	mayotte: "YT",
	réunion: "RE",
	"ascension and tristan da cunha": "SH",
	// Middle East / Central Asia
	syria: "SY",
	brunei: "BN",
	"timor-leste": "TL",
	// Pacific
	maldives: "MV",
	"northern mariana islands": "MP",
	micronesia: "FM",
	"marshall islands": "MH",
	kiribati: "KI",
	"american samoa": "AS",
	palau: "PW",
	nauru: "NR",
	tuvalu: "TV",
	tokelau: "TK",
	"cook islands": "CK",
	niue: "NU",
	"wallis and futuna": "WF",
	"christmas island": "CX",
	"cocos (keeling) islands": "CC",
	"british indian ocean territory": "IO",
	// Alternate spellings in TeleGeography data
	"dem. rep.": "CD",
	"rep.": "CG",
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
	const cableDetails = readRaw("cable-details.json") as Record<string, RawCableDetail>;
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

		// Capacity — check override table first, then fall back to heuristic
		const override = CAPACITY_OVERRIDES[entry.id];
		const designCapacityTbps = override?.tbps ?? capacityFromRfsYear(rfsYear);
		const capacitySource = override?.source ?? "heuristic";
		const capacityConfidence = override?.confidence ?? "approximated";
		const fiberPairsResolved = override?.pairs ?? null;

		// Owners
		// owners can be a string or array of objects depending on the API version
		const rawOwners = detail.owners;
		const owners: string[] =
			typeof rawOwners === "string"
				? rawOwners
						.split(",")
						.map((s: string) => s.trim())
						.filter(Boolean)
				: Array.isArray(rawOwners)
					? rawOwners.map((o: { name: string } | string) => (typeof o === "string" ? o : o.name))
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
				distKm = Math.round(haversineKm(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng));
			}

			segments.push({
				from: fromId,
				to: toId,
				capacityTbps: designCapacityTbps,
				distanceKm: distKm,
				cableId: entry.id,
			});
		}

		// Hardcoded path fix for cables with incomplete dateline geometry.
		// Echo's TeleGeography data only has the US-side path; we add the Asia-side.
		let fixedPath = path;
		if (entry.id === "echo") {
			// Echo route: Eureka → mid-Pacific (path already in data) → dateline →
			// Guam → Palau → Indonesia → Singapore (synthesized below)
			// Waypoints traced from SubmarineNetworks route map
			// Traced from SubmarineNetworks Echo route map:
			// Eureka → great circle arc SW across N Pacific → Guam →
			// south through Philippine Sea → west past Palau →
			// west above N Indonesia → branch south to Tanjung Pakis (Java) →
			// main trunk continues west → Singapore
			const asiaSide: number[][] = [
				// Dateline → Guam (great circle arc across N Pacific)
				[180.0, 26.3],
				[176.0, 24.5],
				[172.0, 22.5],
				[168.0, 20.5],
				[164.0, 18.5],
				[160.0, 17.0],
				[156.0, 15.8],
				[152.0, 14.8],
				[148.0, 14.0],
				[144.75, 13.48], // Guam (Piti)
				// Guam → south through Philippine Sea → Palau
				[142.0, 11.5],
				[139.5, 9.5],
				[137.0, 8.0],
				[134.56, 7.53], // Palau (Ngeremlengui)
				// Palau → south past Halmahera → Banda Sea → west
				// Must stay south of Sulawesi's north arm (lat ~1.5 at lng 125)
				[132.0, 5.0],
				[130.0, 2.0], // south of Morotai, east of Halmahera
				[128.5, -1.0], // Halmahera Sea
				[127.0, -4.0], // Banda Sea, south of Sulawesi SE arm
				[125.0, -5.5], // Banda Sea
				[122.5, -6.0], // Flores Sea, just south of Jeneponto/S Sulawesi tip
				[118.0, -5.0], // south of Sumbawa
				[116.0, -5.5], // Java Sea
				// Branch south to Tanjung Pakis
				[113.0, -5.5],
				[112.7, -6.7], // Tanjung Pakis
				// West along Java north coast to Singapore
				[110.0, -6.0],
				[108.0, -5.5],
				[106.5, -5.0], // north Java coast
				[105.5, -3.5], // Java Sea narrows
				[104.8, -2.0],
				[104.3, -0.5], // Singapore Strait approach
				[103.88, 1.33], // Singapore (Tuas)
			];
			fixedPath = {
				...path,
				geometry: {
					type: "MultiLineString" as const,
					coordinates: [...path.geometry.coordinates, asiaSide],
				},
			};
		}

		// 2Africa: fix Red Sea branches that cross land.
		// The source data has short branch stubs as straight lines from the main
		// trunk to Saudi landing stations (Jeddah, Yanbu) that cut through land.
		// Replace them with waypoints that stay in the Red Sea.
		if (entry.id === "2africa") {
			const coords = (fixedPath.geometry as { coordinates: number[][][] }).coordinates;
			const fixed: number[][][] = coords.map((line) => {
				// Line 3: trunk (37.46, 22.05) → Jeddah area (39.18, 21.48)
				// Straight line crosses Saudi coast. Route through Red Sea.
				if (
					line.length === 2 &&
					Math.abs(line[0][0] - 37.46) < 0.1 &&
					Math.abs(line[1][0] - 39.18) < 0.1
				) {
					return [
						line[0], // main trunk point
						[38.2, 21.9], // Red Sea midpoint
						[38.9, 21.6], // approach Jeddah from sea
						line[1], // Jeddah landing
					];
				}
				// Line 2: Yanbu branch (34.68, 26.56) → (35.70, 27.35)
				// Short stub near Yanbu — add a sea waypoint
				if (
					line.length === 3 &&
					Math.abs(line[0][0] - 34.68) < 0.1 &&
					Math.abs(line[0][1] - 26.56) < 0.1
				) {
					return [
						[35.5, 26.0], // Red Sea approach
						line[0],
						[35.3, 26.9],
						line[2], // Yanbu landing
					];
				}
				// Line 14: trunk (36.23, 24.12) → (38.11, 24.07) crosses Saudi
				if (
					line.length === 4 &&
					Math.abs(line[0][0] - 36.23) < 0.1 &&
					Math.abs(line[3][0] - 38.11) < 0.1
				) {
					return [
						line[0], // main trunk
						[37.0, 23.5], // Red Sea
						[37.8, 23.0], // approach from sea
						[38.5, 22.5], // along coast
						line[3], // landing
					];
				}
				return line;
			});
			// Add the missing southern Red Sea trunk: Djibouti → central Red Sea.
			// The source data has a gap between the Horn of Africa (~44.5E, 11.2N)
			// and the central Red Sea (~37.5E, 22N). This is the ~1300km trunk
			// through the Bab el-Mandeb Strait and up the southern Red Sea.
			const redSeaTrunk: number[][] = [
				[44.55, 11.24], // Djibouti (end of Line 23)
				[43.8, 12.3], // Bab el-Mandeb approach
				[43.3, 12.7], // Bab el-Mandeb Strait
				[42.8, 13.5], // enter Red Sea
				[42.2, 14.5], // southern Red Sea
				[41.5, 15.5],
				[41.0, 16.5],
				[40.5, 17.5],
				[40.0, 18.5],
				[39.3, 19.5],
				[38.5, 20.5], // central Red Sea
				[38.25, 20.36], // connect to Line 24 start
			];
			fixed.push(redSeaTrunk);

			fixedPath = {
				...fixedPath,
				geometry: { type: "MultiLineString" as const, coordinates: fixed },
			};
		}

		cables.push({
			id: entry.id,
			name: detail.name,
			rfsYear,
			lengthKm,
			fiberPairs: fiberPairsResolved,
			designCapacityTbps,
			capacitySource,
			capacityConfidence,
			...(override?.sourceUrl ? { sourceUrl: override.sourceUrl } : {}),
			owners,
			landingStationIds,
			path: fixedPath,
			segments,
		});
	}

	console.log(`  ${cables.length} operational cables built`);
	console.log(`  ${skippedPlanned} planned cables skipped`);
	console.log(`  ${skippedNoGeo} cables skipped (no geometry)`);
	console.log(`  ${skippedNoDetail} cables skipped (no detail data)`);

	// ── Terrestrial edges ──

	console.log("\nBuilding terrestrial edges...");

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
		"manchester-gb": { name: "Manchester", countryCode: "GB", lat: 53.4808, lng: -2.2426 },
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
		// New synthetic metros for added terrestrial edges
		bangkok: { name: "Bangkok", countryCode: "TH", lat: 13.7563, lng: 100.5018 },
		"phnom-penh": { name: "Phnom Penh", countryCode: "KH", lat: 11.5564, lng: 104.9282 },
		"ho-chi-minh-city": {
			name: "Ho Chi Minh City",
			countryCode: "VN",
			lat: 10.8231,
			lng: 106.6297,
		},
		"kuala-lumpur": { name: "Kuala Lumpur", countryCode: "MY", lat: 3.139, lng: 101.6869 },
		manila: { name: "Manila", countryCode: "PH", lat: 14.5995, lng: 120.9842 },
		belgrade: { name: "Belgrade", countryCode: "RS", lat: 44.7866, lng: 20.4489 },
		bucharest: { name: "Bucharest", countryCode: "RO", lat: 44.4268, lng: 26.1025 },
		zagreb: { name: "Zagreb", countryCode: "HR", lat: 45.815, lng: 15.9819 },
		abidjan: { name: "Abidjan", countryCode: "CI", lat: 5.36, lng: -4.0083 },
		dakar: { name: "Dakar", countryCode: "SN", lat: 14.7167, lng: -17.4677 },
		barcelona: { name: "Barcelona", countryCode: "ES", lat: 41.3874, lng: 2.1686 },
		seoul: { name: "Seoul", countryCode: "KR", lat: 37.5665, lng: 126.978 },
		taipei: { name: "Taipei", countryCode: "TW", lat: 25.033, lng: 121.5654 },
		colombo: { name: "Colombo", countryCode: "LK", lat: 6.9271, lng: 79.8612 },
		beijing: { name: "Beijing", countryCode: "CN", lat: 39.9042, lng: 116.4074 },
		shenzhen: { name: "Shenzhen", countryCode: "CN", lat: 22.5431, lng: 114.0579 },
		nanjing: { name: "Nanjing", countryCode: "CN", lat: 32.0603, lng: 118.7969 },
		wuhan: { name: "Wuhan", countryCode: "CN", lat: 30.5928, lng: 114.3055 },
		chengdu: { name: "Chengdu", countryCode: "CN", lat: 30.5728, lng: 104.0668 },
		xian: { name: "Xi'an", countryCode: "CN", lat: 34.3416, lng: 108.9398 },
		montreal: { name: "Montreal", countryCode: "CA", lat: 45.5017, lng: -73.5673 },
		oslo: { name: "Oslo", countryCode: "NO", lat: 59.9139, lng: 10.7522 },
		krakow: { name: "Krakow", countryCode: "PL", lat: 50.0647, lng: 19.945 },
		"mexico-city": { name: "Mexico City", countryCode: "MX", lat: 19.4326, lng: -99.1332 },
		casablanca: { name: "Casablanca", countryCode: "MA", lat: 33.5731, lng: -7.5898 },
		lisbon: { name: "Lisbon", countryCode: "PT", lat: 38.7223, lng: -9.1393 },
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
			const realMetro = metros.find((m) => m.id === nearestId);
			if (realMetro) {
				// Use the well-known city name instead of the obscure landing station name
				// e.g., "Pevensey Bay" becomes "London", "Cayeux-sur-Mer" becomes "Paris"
				realMetro.name = info.name;
				if (MANUAL_HUB_IDS.has(id)) realMetro.isHub = true;
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
	console.log(
		`  Example merges: ${[...metroAliases.entries()]
			.slice(0, 5)
			.map(([a, c]) => `${a} -> ${c}`)
			.join(", ")}`,
	);

	// Terrestrial edge definitions — hand-curated with verified sources
	const terrestrialDefs: Array<{
		from: string;
		to: string;
		capacityTbps: number;
		confidence: "verified" | "estimated" | "approximated";
		source: string;
		sourceUrl?: string;
		operators: string[];
		notes?: string;
	}> = [
		// Europe
		{
			from: "london",
			to: "paris",
			capacityTbps: 80,
			confidence: "estimated",
			source:
				"Colt Channel Tunnel (25-yr Getlink concession, 2023), EXA UK-France fiber, Crosslake CrossChannel 96-pair subsea (2021), euNetworks, Zayo [5 ops × ~16 Tbps = 80 Tbps]",
			sourceUrl:
				"https://www.colt.net/resources/colt-successfully-completes-the-deployment-of-fibre-network-infrastructure-along-the-channel-tunnel-seamlessly-connecting-london-and-paris/",
			operators: ["Colt", "EXA", "Crosslake", "euNetworks", "Zayo"],
		},
		{
			from: "london",
			to: "amsterdam",
			capacityTbps: 80,
			confidence: "estimated",
			source:
				"euNetworks Scylla 96-pair subsea (Lowestoft-IJmuiden, 2021), EXA Q&E North (Margate-Ostend), Zayo Zeus/Circe North, GTT, Cogent, Telia/Arelion [6 ops × ~13 Tbps = 80 Tbps]",
			sourceUrl:
				"https://eunetworks.com/network/super-highways/super-highway-london-to-amsterdam-including-subsea-cable-scylla/",
			operators: ["euNetworks", "EXA", "Zayo", "GTT", "Cogent", "Telia"],
		},
		{
			from: "london",
			to: "brussels",
			capacityTbps: 40,
			confidence: "estimated",
			source:
				"EXA Q&E North (Margate-Ostend + terrestrial extension), Colt Channel Tunnel, Cogent [3 ops × ~13 Tbps = 40 Tbps]",
			sourceUrl:
				"https://exainfra.net/media-centre/press-releases/exa-infrastructure-deploys-new-high-capacity-fibre-route-from-london-to-frankfurt-amsterdam-and-brussels/",
			operators: ["EXA", "Colt", "Cogent"],
		},
		{
			from: "frankfurt",
			to: "amsterdam",
			capacityTbps: 100,
			confidence: "estimated",
			source:
				"euNetworks Super Highway (27 Tbps/pair C-band, G657A1, optimized ILA spacing), EXA, Cogent, Telia/Arelion, GTT, Zayo. Densest terrestrial corridor in Europe [6 ops × ~17 Tbps = 100 Tbps]",
			sourceUrl:
				"https://eunetworks.com/news/eunetworks-delivers-new-critical-infrastructure-in-europe-a-shorter-long-haul-fibre-route-from-amsterdam-to-frankfurt/",
			operators: ["euNetworks", "EXA", "Cogent", "Telia", "GTT", "Zayo"],
		},
		{
			from: "frankfurt",
			to: "paris",
			capacityTbps: 100,
			confidence: "estimated",
			source:
				"euNetworks Super Highway (27 Tbps/pair C-band), EXA, Zayo, Cogent, GTT, Telia/Arelion [6 ops × ~17 Tbps = 100 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/high-speed-networks/article/14074203/zayo-to-open-montreal-to-albany-fiber-network-route-this-month",
			operators: ["euNetworks", "EXA", "Zayo", "Cogent", "GTT", "Telia"],
		},
		{
			from: "frankfurt",
			to: "london",
			capacityTbps: 80,
			confidence: "estimated",
			source:
				"EXA, euNetworks Super Highway, Cogent, Telia/Arelion, Zayo, GTT. Via Amsterdam or Channel Tunnel transit [6 ops × ~13 Tbps = 80 Tbps]",
			sourceUrl: "https://eunetworks.com/network/super-highways/",
			operators: ["EXA", "euNetworks", "Cogent", "Telia", "Zayo", "GTT"],
		},
		{
			from: "paris",
			to: "marseille",
			capacityTbps: 60,
			confidence: "estimated",
			source:
				"EXA Paris-Marseille corridor, euNetworks Frankfurt-Marseille Super Highway, Cogent, Zayo. Key backhaul for Mediterranean submarine cable landings. [4 ops × ~15 Tbps = 60 Tbps]",
			sourceUrl:
				"https://exainfra.net/media-centre/press-releases/exa-infrastructure-removes-major-european-network-bottleneck-with-marseille-paris-route-upgrade/",
			operators: ["EXA", "euNetworks", "Cogent", "Zayo"],
		},
		{
			from: "frankfurt",
			to: "milan",
			capacityTbps: 40,
			confidence: "estimated",
			source: "euNetworks Frankfurt-Milan via Zurich, Zayo, Sparkle [3 ops × ~13 Tbps = 40 Tbps]",
			sourceUrl:
				"https://eunetworks.com/news/eunetworks-delivers-new-fully-diverse-long-haul-network-route-enabling-two-short-paths-connecting-frankfurt-to-marseille-and-milan/",
			operators: ["euNetworks", "Zayo", "Sparkle"],
		},
		{
			from: "frankfurt",
			to: "zurich",
			capacityTbps: 40,
			confidence: "estimated",
			source: "euNetworks Super Highway, EXA, Swisscom [3 ops × ~13 Tbps = 40 Tbps]",
			sourceUrl:
				"https://eunetworks.com/news/eunetworks-delivers-new-fully-diverse-long-haul-network-route-enabling-two-short-paths-connecting-frankfurt-to-marseille-and-milan/",
			operators: ["euNetworks", "EXA", "Swisscom"],
		},
		{
			from: "marseille",
			to: "milan",
			capacityTbps: 40,
			confidence: "estimated",
			source: "euNetworks via Zurich, Sparkle, EXA, Zayo [4 ops × ~10 Tbps = 40 Tbps]",
			sourceUrl:
				"https://eunetworks.com/news/eunetworks-delivers-new-fully-diverse-long-haul-network-route-enabling-two-short-paths-connecting-frankfurt-to-marseille-and-milan/",
			operators: ["euNetworks", "Sparkle", "EXA", "Zayo"],
		},
		{
			from: "berlin",
			to: "warsaw",
			capacityTbps: 20,
			confidence: "estimated",
			source:
				"EXA Project Visegrad (216-fiber Corning Ultra G.652D, largest CE backbone in 25 yrs) [1 ops × ~20 Tbps = 20 Tbps]",
			sourceUrl:
				"https://exainfra.net/media-centre/press-releases/exa-infrastructure-launches-project-visegrad-largest-cross-border-fibre-backbone-deployment-in-central-europe-in-25-years/",
			operators: ["EXA"],
			notes: "First routes RFS mid-2026, full completion 2027",
		},
		{
			from: "vienna",
			to: "bratislava",
			capacityTbps: 15,
			confidence: "estimated",
			source: "EXA Project Visegrad [1 ops × ~15 Tbps = 15 Tbps]",
			sourceUrl:
				"https://exainfra.net/media-centre/press-releases/exa-infrastructure-launches-project-visegrad-largest-cross-border-fibre-backbone-deployment-in-central-europe-in-25-years/",
			operators: ["EXA"],
			notes: "First routes RFS mid-2026",
		},
		{
			from: "prague",
			to: "berlin",
			capacityTbps: 20,
			confidence: "estimated",
			source: "EXA Project Visegrad + existing operators [1 ops × ~20 Tbps = 20 Tbps]",
			sourceUrl:
				"https://exainfra.net/media-centre/press-releases/exa-infrastructure-launches-project-visegrad-largest-cross-border-fibre-backbone-deployment-in-central-europe-in-25-years/",
			operators: ["EXA"],
			notes: "First routes RFS mid-2026",
		},
		{
			from: "marseille",
			to: "istanbul",
			capacityTbps: 25,
			confidence: "verified",
			source:
				"EXA Trans Adriatic Express (TAE): 36 pairs G.652D, 4,500+ km via Italy-Albania-Greece-Turkey. 25 Tbps total system capacity",
			sourceUrl: "https://exainfra.net/our-network/tae-trans-adriatic-express/",
			operators: ["EXA"],
		},
		{
			from: "athens",
			to: "istanbul",
			capacityTbps: 15,
			confidence: "estimated",
			source: "TAE branch + Grid Telecom [2 ops × ~8 Tbps = 15 Tbps]",
			sourceUrl:
				"https://www.telecomtv.com/content/access-evolution/exa-infrastructure-turns-on-tap-to-light-much-needed-new-fibre-optic-route-from-france-to-turkey-44333/",
			operators: ["EXA", "Grid Telecom"],
		},
		{
			from: "sofia",
			to: "istanbul",
			capacityTbps: 10,
			confidence: "estimated",
			source: "TAE branch + SOCAR Fiber [2 ops × ~5 Tbps = 10 Tbps]",
			sourceUrl:
				"https://exainfra.net/media-centre/press-releases/exa-infrastructure-connects-south-east-and-western-european-digital-networks-via-the-trans-adriatic-pipeline/",
			operators: ["EXA", "SOCAR"],
		},
		{
			from: "vienna",
			to: "budapest",
			capacityTbps: 15,
			confidence: "estimated",
			source: "EXA Project Visegrad extension [1 ops × ~15 Tbps = 15 Tbps]",
			sourceUrl: "https://exainfra.net/services/resources/exa-infrastructure-network-map/",
			operators: ["EXA"],
		},
		{
			from: "frankfurt",
			to: "vienna",
			capacityTbps: 30,
			confidence: "estimated",
			source: "EXA, euNetworks, Deutsche Telekom, A1 [4 ops × ~8 Tbps = 30 Tbps]",
			sourceUrl: "https://en.wikipedia.org/wiki/EXA_Infrastructure",
			operators: ["EXA", "euNetworks", "Deutsche Telekom", "A1"],
		},
		{
			from: "madrid",
			to: "marseille",
			capacityTbps: 20,
			confidence: "estimated",
			source: "EXA, Cogent, Telefonica [3 ops × ~7 Tbps = 20 Tbps]",
			sourceUrl: "https://exainfra.net/our-network/",
			operators: ["EXA", "Cogent", "Telefonica"],
		},
		{
			from: "stockholm",
			to: "helsinki",
			capacityTbps: 15,
			confidence: "estimated",
			source:
				"Telia/Arelion Baltic submarine cables, GlobalConnect new 150km subsea via Aland (completion 2026). Note: C-Lion1 connects Helsinki-Rostock, not Stockholm [2 ops × ~8 Tbps = 15 Tbps]",
			sourceUrl:
				"https://www.prnewswire.com/news-releases/telia-carrier-builds-new-unique-route-from-stockholm-to-st-petersburg-and-upgrades-submarine-cables-in-the-baltic-sea-300391057.html",
			operators: ["Telia", "GlobalConnect"],
		},

		// Germany internal backbone (Deutsche Telekom, 1&1 Versatel, GlobalConnect)
		{
			from: "frankfurt",
			to: "berlin",
			capacityTbps: 80,
			confidence: "estimated",
			source:
				"Deutsche Telekom, Versatel, GlobalConnect core backbone [3 ops × ~27 Tbps = 80 Tbps]",
			sourceUrl: "https://www.telekom.com/en/company/topic-specials/networks",
			operators: ["Deutsche Telekom", "Versatel", "GlobalConnect"],
		},
		{
			from: "frankfurt",
			to: "hamburg",
			capacityTbps: 60,
			confidence: "estimated",
			source: "Deutsche Telekom backbone, Versatel, euNetworks [3 ops × ~20 Tbps = 60 Tbps]",
			sourceUrl:
				"https://eunetworks.com/news/eunetworks-launches-high-performance-fiber-network-hamburg/",
			operators: ["Deutsche Telekom", "Versatel", "euNetworks"],
		},
		{
			from: "hamburg",
			to: "berlin",
			capacityTbps: 40,
			confidence: "estimated",
			source: "Deutsche Telekom, regional carriers [1 ops × ~40 Tbps = 40 Tbps]",
			sourceUrl: "https://www.telekom.com/en/company/topic-specials/networks",
			operators: ["Deutsche Telekom"],
		},
		{
			from: "hamburg",
			to: "rostock",
			capacityTbps: 20,
			confidence: "estimated",
			source:
				"Deutsche Telekom, regional carriers (Baltic coast backhaul) [1 ops × ~20 Tbps = 20 Tbps]",
			sourceUrl: "https://www.telekom.com/en/company/topic-specials/networks",
			operators: ["Deutsche Telekom"],
		},
		{
			from: "berlin",
			to: "rostock",
			capacityTbps: 15,
			confidence: "estimated",
			source: "Deutsche Telekom northern backbone [1 ops × ~15 Tbps = 15 Tbps]",
			sourceUrl: "https://www.telekom.com/en/company/topic-specials/networks",
			operators: ["Deutsche Telekom"],
		},
		{
			from: "frankfurt",
			to: "munich",
			capacityTbps: 60,
			confidence: "estimated",
			source: "Deutsche Telekom, Versatel core backbone [2 ops × ~30 Tbps = 60 Tbps]",
			sourceUrl: "https://www.telekom.com/en/company/topic-specials/networks",
			operators: ["Deutsche Telekom", "Versatel"],
		},

		// Nordic internal backbone
		{
			from: "stockholm",
			to: "copenhagen",
			capacityTbps: 30,
			confidence: "estimated",
			source: "Telia, GlobalConnect Oresund crossing [2 ops × ~15 Tbps = 30 Tbps]",
			sourceUrl: "https://www.arelion.com/why-arelion/press-releases/scandinavian-fiber-upgrade-ai",
			operators: ["Telia", "GlobalConnect"],
		},
		{
			from: "copenhagen",
			to: "hamburg",
			capacityTbps: 25,
			confidence: "estimated",
			source: "GlobalConnect, Telia Denmark-Germany backbone [2 ops × ~13 Tbps = 25 Tbps]",
			sourceUrl:
				"https://www.capacitymedia.com/article/2aohw5frdo3gnicuiwlq8/big-interview/globalconnect-and-the-next-digital-superhighway",
			operators: ["GlobalConnect", "Telia"],
		},

		// UK internal backbone (BT, Virgin Media, Colt)
		{
			from: "london",
			to: "manchester-gb",
			capacityTbps: 60,
			confidence: "estimated",
			source: "BT, Virgin Media, CityFibre core backbone [3 ops × ~20 Tbps = 60 Tbps]",
			sourceUrl:
				"https://www.telecomtv.com/content/access-evolution/virgin-media-business-wholesale-connects-equinix-manchester-ma5-datacentre-50430/",
			operators: ["BT", "Virgin Media", "CityFibre"],
		},
		{
			from: "london",
			to: "cornwall",
			capacityTbps: 20,
			confidence: "estimated",
			source: "BT backbone to Bude cable landing station [1 ops × ~20 Tbps = 20 Tbps]",
			sourceUrl: "https://en.wikipedia.org/wiki/GCHQ_Bude",
			operators: ["BT"],
		},

		// Japan internal backbone (NTT, KDDI, SoftBank)
		{
			from: "tokyo",
			to: "osaka",
			capacityTbps: 100,
			confidence: "estimated",
			source: "NTT, KDDI, SoftBank Tokaido backbone [3 ops × ~33 Tbps = 100 Tbps]",
			sourceUrl: "https://group.ntt/en/newsrelease/2017/08/08/170808b.html",
			operators: ["NTT", "KDDI", "SoftBank"],
		},

		// Italy internal backbone (Telecom Italia/Sparkle)
		{
			from: "milan",
			to: "rome",
			capacityTbps: 40,
			confidence: "estimated",
			source: "Telecom Italia, Sparkle domestic backbone [2 ops × ~20 Tbps = 40 Tbps]",
			sourceUrl:
				"https://www.gruppotim.it/en/press-archive/sparkle/2023/PR-Sparkle-Activates-Service-on-BlueMed-Between-Palermo,-Genoa,-and-Milan.html",
			operators: ["Telecom Italia", "Sparkle"],
		},
		{
			from: "rome",
			to: "sicily",
			capacityTbps: 20,
			confidence: "estimated",
			source: "Telecom Italia southern backbone [1 ops × ~20 Tbps = 20 Tbps]",
			sourceUrl:
				"https://subtelforum.com/unitirreno-subsea-cable-completes-rome-olbia-fiber-milestone/",
			operators: ["Telecom Italia"],
		},

		// India internal backbone (Reliance Jio, Airtel, BSNL)
		{
			from: "mumbai",
			to: "chennai",
			capacityTbps: 40,
			confidence: "estimated",
			source: "Reliance Jio, Airtel, BSNL national backbone [3 ops × ~13 Tbps = 40 Tbps]",
			sourceUrl: "https://en.wikipedia.org/wiki/Jio",
			operators: ["Reliance Jio", "Airtel", "BSNL"],
		},
		{
			from: "mumbai",
			to: "delhi",
			capacityTbps: 60,
			confidence: "estimated",
			source:
				"Reliance Jio, Airtel, BSNL — highest-capacity Indian corridor [3 ops × ~20 Tbps = 60 Tbps]",
			sourceUrl: "https://en.wikipedia.org/wiki/Jio",
			operators: ["Reliance Jio", "Airtel", "BSNL"],
		},
		{
			from: "chennai",
			to: "bangalore",
			capacityTbps: 30,
			confidence: "estimated",
			source: "Reliance Jio, Airtel southern backbone [2 ops × ~15 Tbps = 30 Tbps]",
			sourceUrl: "https://en.wikipedia.org/wiki/Jio",
			operators: ["Reliance Jio", "Airtel"],
		},

		// Indonesia internal (Telkom Indonesia)
		{
			from: "jakarta",
			to: "surabaya",
			capacityTbps: 20,
			confidence: "estimated",
			source: "Telkom Indonesia Java backbone [1 ops × ~20 Tbps = 20 Tbps]",
			sourceUrl:
				"https://www.thefastmode.com/technology-solutions/1564-telkom-indonesia-deploys-zte-dwdm-otn-solution-for-java-backbone-network-upgrade",
			operators: ["Telkom Indonesia"],
		},
		{
			from: "singapore",
			to: "batam",
			capacityTbps: 30,
			confidence: "estimated",
			source: "Cross-strait fiber links (multiple operators) [2 ops × ~15 Tbps = 30 Tbps]",
			sourceUrl:
				"https://www.prnewswire.com/apac/news-releases/telin-partners-singtel-to-develop-subsea-cable-system-enhancing-dc-to-dc-connectivity-between-singapore-and-batam-302160300.html",
			operators: ["Singtel", "Telkom Indonesia"],
		},

		// Malaysia-Singapore backhaul
		{
			from: "singapore",
			to: "mersing",
			capacityTbps: 15,
			confidence: "estimated",
			source: "Malaysian terrestrial to SG cable landing stations [2 ops × ~8 Tbps = 15 Tbps]",
			sourceUrl:
				"https://www.submarinenetworks.com/en/systems/intra-asia/alc/tm-joins-asia-link-cable-system-consortium",
			operators: ["TM", "Singtel"],
		},

		// Brazil internal backbone (Oi, Vivo, Embratel)
		{
			from: "sao-paulo",
			to: "fortaleza",
			capacityTbps: 30,
			confidence: "estimated",
			source:
				"Oi, Vivo, Embratel NE backbone (key for transatlantic cables) [3 ops × ~10 Tbps = 30 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/business/market-research/article/16661817/brazils-fiber-optic-networks-form-base-for-global-communications",
			operators: ["Oi", "Vivo", "Embratel"],
		},
		{
			from: "sao-paulo",
			to: "salvador",
			capacityTbps: 20,
			confidence: "estimated",
			source: "Oi, Vivo coastal backbone [2 ops × ~10 Tbps = 20 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/business/market-research/article/16661817/brazils-fiber-optic-networks-form-base-for-global-communications",
			operators: ["Oi", "Vivo"],
		},

		// China internal backbone (China Telecom, China Unicom, China Mobile)
		{
			from: "hong-kong",
			to: "guangzhou",
			capacityTbps: 60,
			confidence: "estimated",
			source: "China Telecom, China Unicom cross-border + domestic [2 ops × ~30 Tbps = 60 Tbps]",
			sourceUrl:
				"https://developingtelecoms.com/telecom-business/vendor-news/16918-china-telecom-guangdong-huawei-build-the-greater-bay-area-s-first-400g-all-optical-premium-transmission-network.html",
			operators: ["China Telecom", "China Unicom"],
		},
		{
			from: "guangzhou",
			to: "shanghai",
			capacityTbps: 80,
			confidence: "estimated",
			source: "China Telecom core backbone [3 ops × ~27 Tbps = 80 Tbps]",
			sourceUrl:
				"https://www.ctamericas.com/blog/china-telecoms-wdm-backbone-network-road-optical-network-2-0/",
			operators: ["China Telecom", "China Unicom", "China Mobile"],
		},
		{
			from: "shanghai",
			to: "tokyo",
			capacityTbps: 20,
			confidence: "estimated",
			source: "Multiple submarine + transit paths [2 ops × ~10 Tbps = 20 Tbps]",
			sourceUrl: "https://en.wikipedia.org/wiki/Internet_in_China",
			operators: ["China Telecom", "NTT"],
		},

		// Australia internal (Telstra, Optus)
		{
			from: "sydney",
			to: "melbourne",
			capacityTbps: 40,
			confidence: "estimated",
			source: "Telstra, Optus, Vocus domestic backbone [3 ops × ~13 Tbps = 40 Tbps]",
			sourceUrl:
				"https://www.telstra.com.au/aboutus/media/media-releases/Telstra-InfraCo-Intercity-First-Route",
			operators: ["Telstra", "Optus", "Vocus"],
		},
		{
			from: "sydney",
			to: "perth",
			capacityTbps: 15,
			confidence: "estimated",
			source: "Telstra transcontinental + Vocus Pipe Networks [2 ops × ~8 Tbps = 15 Tbps]",
			sourceUrl:
				"https://www.ciena.com/about/newsroom/press-releases/vocus-launches-400g-coast-to-coast-wavelength-ethernet-services-in-australia-from-sydney-to-perth,-available-today",
			operators: ["Telstra", "Vocus"],
		},

		// Trans-Russia / Central Asia
		{
			from: "st-petersburg",
			to: "moscow",
			capacityTbps: 50,
			confidence: "estimated",
			source:
				"Rostelecom TEA NEXT (96 dark fiber pairs, Ultra Low Loss fiber, RTD Moscow-Vlad <=85ms), MegaFon, Beeline [3 ops × ~17 Tbps = 50 Tbps]",
			sourceUrl: "https://interfax.com/newsroom/top-stories/97534/",
			operators: ["Rostelecom", "MegaFon", "Beeline"],
		},
		{
			from: "moscow",
			to: "yekaterinburg",
			capacityTbps: 20,
			confidence: "estimated",
			source: "Rostelecom TEA NEXT backbone [1 ops × ~20 Tbps = 20 Tbps]",
			sourceUrl: "https://interfax.com/newsroom/top-stories/97534/",
			operators: ["Rostelecom"],
		},
		{
			from: "yekaterinburg",
			to: "novosibirsk",
			capacityTbps: 15,
			confidence: "estimated",
			source: "Rostelecom TEA NEXT backbone [1 ops × ~15 Tbps = 15 Tbps]",
			sourceUrl: "https://interfax.com/newsroom/top-stories/97534/",
			operators: ["Rostelecom"],
		},
		{
			from: "novosibirsk",
			to: "vladivostok",
			capacityTbps: 10,
			confidence: "estimated",
			source: "Rostelecom TEA NEXT [1 ops × ~10 Tbps = 10 Tbps]",
			sourceUrl: "https://interfax.com/newsroom/top-stories/97534/",
			operators: ["Rostelecom"],
		},
		{
			from: "moscow",
			to: "manzhouli",
			capacityTbps: 5,
			confidence: "estimated",
			source: "TEA, TEA-2, TEA-3 cross-border [2 ops × ~3 Tbps = 5 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/article/16670532/rostelecom-launches-fiberoptic-line-between-russia-and-china",
			operators: ["Rostelecom", "China Telecom"],
		},
		{
			from: "helsinki",
			to: "st-petersburg",
			capacityTbps: 10,
			confidence: "estimated",
			source: "Telia Carrier, Russia-Finland border [1 ops × ~10 Tbps = 10 Tbps]",
			sourceUrl:
				"https://www.prnewswire.com/news-releases/telia-carrier-builds-new-unique-route-from-stockholm-to-st-petersburg-and-upgrades-submarine-cables-in-the-baltic-sea-300391057.html",
			operators: ["Telia"],
		},
		{
			from: "tallinn",
			to: "st-petersburg",
			capacityTbps: 5,
			confidence: "estimated",
			source: "Telia mesh network [1 ops × ~5 Tbps = 5 Tbps]",
			sourceUrl:
				"https://www.prnewswire.com/news-releases/telia-carrier-builds-new-unique-route-from-stockholm-to-st-petersburg-and-upgrades-submarine-cables-in-the-baltic-sea-300391057.html",
			operators: ["Telia"],
		},
		{
			from: "frankfurt",
			to: "almaty",
			capacityTbps: 8,
			confidence: "estimated",
			source:
				"DREAM (8,700 km Frankfurt-Kazakhstan-China, MegaFon+Kazakhtelecom, 2013) + TRANSKZ (15,000 km Frankfurt-Hong Kong via Kazakhstan, 8 Tbps total, RETN, 2016) [4 ops × ~2 Tbps = 8 Tbps]",
			sourceUrl: "https://retn.net/solutions/transkz",
			operators: ["MegaFon", "Kazakhtelecom", "Colt", "RETN"],
		},
		{
			from: "baku",
			to: "aktau",
			capacityTbps: 20,
			confidence: "approximated",
			source:
				"Trans-Caspian Fiber Optic Cable (Digital Silk Way): 380 km submarine across Caspian, Sumgait-Aktau. 400 Tbps design capacity confirmed",
			sourceUrl:
				"https://www.businesswire.com/news/home/20250305799119/en/NEQSOL-Holding-Announces-Trans-Caspian-Fiber-Optic-Cable-Line-Connecting-Europe-and-Asia-in-Next-Phase-of-Digital-Silk-Way-Project",
			operators: ["AzerTelecom", "Kazakhtelecom"],
			notes: "Under construction, completion expected end 2026",
		},
		{
			from: "almaty",
			to: "urumqi",
			capacityTbps: 15,
			confidence: "estimated",
			source: "Khorgos/Alashankou crossings, DREAM + TRANSKZ [3 ops × ~5 Tbps = 15 Tbps]",
			sourceUrl: "https://www.ctamericas.com/company/global-network/",
			operators: ["China Telecom", "China Unicom", "Kazakhtelecom"],
		},
		{
			from: "moscow",
			to: "ulaanbaatar",
			capacityTbps: 3,
			confidence: "estimated",
			source: "TEA-4, TMP Transit-Mongolia [1 ops × ~3 Tbps = 3 Tbps]",
			sourceUrl:
				"https://www.submarinenetworks.com/en/systems/eurasia-terrestrial/tea-next/rt-launches-tea-next",
			operators: ["Rostelecom"],
		},

		// Middle East
		{
			from: "muscat",
			to: "riyadh",
			capacityTbps: 10,
			confidence: "approximated",
			source:
				"SONIC: Saudi Omani Network Infrastructure Corridor, stc Group + Ooredoo Oman strategic collaboration ($1.78B). Two redundant terrestrial fiber paths",
			sourceUrl:
				"https://w.media/stc-group-and-ooredoo-launch-sonic-a-terrestrial-fiber-optic-network/",
			operators: ["STC", "Ooredoo"],
			notes: "Phase 1 within 12 months of Feb 2025 announcement",
		},
		{
			from: "riyadh",
			to: "amman",
			capacityTbps: 5,
			confidence: "estimated",
			source: "Existing Gulf-Levant links",
			operators: [],
		},
		{
			from: "baku",
			to: "tehran",
			capacityTbps: 2,
			confidence: "estimated",
			source: "TIC Astara border crossing [1 ops × ~2 Tbps = 2 Tbps]",
			sourceUrl: "https://en.wikipedia.org/wiki/Telecommunication_Infrastructure_Company_of_Iran",
			operators: ["TIC"],
		},
		{
			from: "tehran",
			to: "karachi",
			capacityTbps: 1,
			confidence: "approximated",
			source: "Iran-Pakistan terrestrial",
			operators: [],
		},
		{
			from: "muscat",
			to: "cairo",
			capacityTbps: 10,
			confidence: "approximated",
			source:
				"Zain Omantel International (ZOI) + Telecom Egypt corridor: Oman-Saudi Arabia-Egypt (mixed terrestrial/subsea). Extends to Kuwait, Bahrain, Iraq, Jordan",
			sourceUrl:
				"https://www.zawya.com/en/press-release/companies-news/zain-omantel-international-and-telecom-egypt-forge-new-digital-corridor-ag9jrbif",
			operators: ["Zain", "Omantel", "Telecom Egypt"],
		},
		{
			from: "istanbul",
			to: "tbilisi",
			capacityTbps: 10,
			confidence: "estimated",
			source:
				"EXA + SOCAR Fiber: 1,850 km along TANAP gas pipeline across Turkey, Greece-to-Georgia route [2 ops × ~5 Tbps = 10 Tbps]",
			sourceUrl:
				"https://exainfra.net/media-centre/press-releases/exa-infrastructure-and-socar-fiber-collaborate-for-red-sea-route-diversity/",
			operators: ["EXA", "SOCAR"],
		},
		{
			from: "djibouti",
			to: "addis-ababa",
			capacityTbps: 5,
			confidence: "estimated",
			source:
				"Horizon Fiber Initiative (Feb 2026): Ethio Telecom + Djibouti Telecom + Sudatel, 144 fiber pairs, multi-terabit capacity [3 ops × ~2 Tbps = 5 Tbps]",
			sourceUrl:
				"https://www.telecomtv.com/content/access-evolution/telco-trio-launches-african-cross-border-fibre-project-54799/",
			operators: ["Ethio Telecom", "Djibouti Telecom", "Sudatel"],
		},
		{
			from: "addis-ababa",
			to: "khartoum",
			capacityTbps: 5,
			confidence: "approximated",
			source:
				"Horizon Fiber Initiative extension to Port Sudan (same project as Djibouti-Addis Ababa). Endpoint is Port Sudan, not Khartoum directly",
			sourceUrl:
				"https://www.telecomtv.com/content/access-evolution/telco-trio-launches-african-cross-border-fibre-project-54799/",
			operators: ["Ethio Telecom", "Sudatel"],
		},

		// US Backbone
		{
			from: "new-york",
			to: "chicago",
			capacityTbps: 200,
			confidence: "estimated",
			source:
				"Lumen (450+ Tbps global IP capacity), Zayo (1 Pbps network-wide active waves, 2024), Cogent (19k+ route-miles ex-Sprint wireline), AT&T, Verizon [5 ops × ~40 Tbps = 200 Tbps]",
			sourceUrl:
				"https://www.zayo.com/newsroom/zayo-announces-construction-of-5000-new-fiber-route-miles-as-ai-demand-is-forecasted-to-grow-2-6x-by-2030/",
			operators: ["Lumen", "Zayo", "Cogent", "AT&T", "Verizon"],
		},
		{
			from: "chicago",
			to: "los-angeles",
			capacityTbps: 150,
			confidence: "estimated",
			source: "Lumen, Zayo western expansion, Cogent, AT&T [4 ops × ~38 Tbps = 150 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/high-speed-networks/article/14276301/zayo-adds-routes-400g-in-fiber-network-expansion-drive",
			operators: ["Lumen", "Zayo", "Cogent", "AT&T"],
		},
		{
			from: "new-york",
			to: "washington-dc",
			capacityTbps: 200,
			confidence: "estimated",
			source:
				"Highest-density US corridor (NE I-95 + Ashburn nexus). Lumen, Zayo, AT&T, Verizon, Cogent [5 ops × ~40 Tbps = 200 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/high-speed-networks/article/14276301/zayo-adds-routes-400g-in-fiber-network-expansion-drive",
			operators: ["Lumen", "Zayo", "AT&T", "Verizon", "Cogent"],
		},
		{
			from: "new-york",
			to: "dallas",
			capacityTbps: 100,
			confidence: "estimated",
			source: "Lumen, Zayo, AT&T [3 ops × ~33 Tbps = 100 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/high-speed-networks/article/14276301/zayo-adds-routes-400g-in-fiber-network-expansion-drive",
			operators: ["Lumen", "Zayo", "AT&T"],
		},
		{
			from: "dallas",
			to: "los-angeles",
			capacityTbps: 100,
			confidence: "estimated",
			source: "Lumen, Zayo, AT&T [3 ops × ~33 Tbps = 100 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/high-speed-networks/article/14276301/zayo-adds-routes-400g-in-fiber-network-expansion-drive",
			operators: ["Lumen", "Zayo", "AT&T"],
		},
		{
			from: "chicago",
			to: "dallas",
			capacityTbps: 80,
			confidence: "estimated",
			source: "Lumen, Zayo, AT&T [3 ops × ~27 Tbps = 80 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/high-speed-networks/article/14276301/zayo-adds-routes-400g-in-fiber-network-expansion-drive",
			operators: ["Lumen", "Zayo", "AT&T"],
		},
		{
			from: "new-york",
			to: "miami",
			capacityTbps: 80,
			confidence: "estimated",
			source: "Lumen, AT&T, Zayo [3 ops × ~27 Tbps = 80 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/business/article/55266911/lumen-is-driving-network-expansion-to-build-the-backbone-of-the-ai-economy",
			operators: ["Lumen", "AT&T", "Zayo"],
		},
		{
			from: "dallas",
			to: "houston",
			capacityTbps: 60,
			confidence: "estimated",
			source: "Regional trunk [2 ops × ~30 Tbps = 60 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/home/article/55278007/lumen-transmits-12-tbps-wavelength-service-over-3k-km-network",
			operators: ["Lumen", "AT&T"],
		},
		{
			from: "seattle",
			to: "los-angeles",
			capacityTbps: 60,
			confidence: "estimated",
			source: "West Coast backbone, Zayo western expansion [2 ops × ~30 Tbps = 60 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/high-speed-networks/article/14276301/zayo-adds-routes-400g-in-fiber-network-expansion-drive",
			operators: ["Zayo", "Lumen"],
		},
		{
			from: "denver",
			to: "dallas",
			capacityTbps: 40,
			confidence: "estimated",
			source:
				"Lumen + Ciena record 1.2 Tbps wavelength over 3,050 km on this route (Mar 2025, WaveLogic 6e) [2 ops × ~20 Tbps = 40 Tbps]",
			sourceUrl:
				"https://www.ciena.com/about/newsroom/press-releases/lumen-and-ciena-transmit-record-breaking-1.2-tbps-wavelength-service-across-3,050-kilometers",
			operators: ["Lumen", "Zayo"],
		},
		{
			from: "denver",
			to: "chicago",
			capacityTbps: 40,
			confidence: "estimated",
			source: "Lumen, Zayo [2 ops × ~20 Tbps = 40 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/high-speed-networks/article/14276301/zayo-adds-routes-400g-in-fiber-network-expansion-drive",
			operators: ["Lumen", "Zayo"],
		},
		{
			from: "atlanta",
			to: "miami",
			capacityTbps: 40,
			confidence: "estimated",
			source: "SE US trunk [2 ops × ~20 Tbps = 40 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/business/article/55266911/lumen-is-driving-network-expansion-to-build-the-backbone-of-the-ai-economy",
			operators: ["Lumen", "AT&T"],
		},

		// US Cross-Border
		{
			from: "san-diego",
			to: "tijuana",
			capacityTbps: 25,
			confidence: "estimated",
			source:
				"MDC Data Centers International Fiber Crossings (San Ysidro + Otay Mesa routes) [1 ops × ~25 Tbps = 25 Tbps]",
			sourceUrl:
				"https://www.mdcdatacenters.com/company/blog/san-diegos-international-fiber-crossing-market-growth/",
			operators: ["MDC"],
		},
		{
			from: "laredo",
			to: "monterrey",
			capacityTbps: 30,
			confidence: "estimated",
			source:
				"MDC IFC Laredo-Nuevo Laredo (3 conduits, 144 strands G652D, Q2 2025) [1 ops × ~30 Tbps = 30 Tbps]",
			sourceUrl:
				"https://www.mdcdatacenters.com/company/blog/mdc-expands-fiber-cross-border-routes-laredo-el-paso/",
			operators: ["MDC"],
		},
		{
			from: "el-paso",
			to: "ciudad-juarez",
			capacityTbps: 20,
			confidence: "estimated",
			source:
				"MDC sub-river crossing (Q4 2025) + Zayo-Fermaca partnership (El Paso to Monterrey/Queretaro, newest US-MX route in 20 yrs) [3 ops × ~7 Tbps = 20 Tbps]",
			sourceUrl:
				"https://www.zayo.com/newsroom/zayo-and-fermaca-partner-to-deliver-the-most-advanced-cross-border-connectivity-between-the-united-states-and-mexico/",
			operators: ["MDC", "Zayo", "Fermaca"],
		},
		{
			from: "seattle",
			to: "vancouver",
			capacityTbps: 30,
			confidence: "estimated",
			source: "Zayo, multiple carriers [1 ops × ~30 Tbps = 30 Tbps]",
			sourceUrl:
				"https://www.zayo.com/newsroom/zayo-announces-construction-of-5000-new-fiber-route-miles-as-ai-demand-is-forecasted-to-grow-2-6x-by-2030/",
			operators: ["Zayo"],
		},
		{
			from: "new-york",
			to: "toronto",
			capacityTbps: 40,
			confidence: "estimated",
			source: "Zayo, Cogent, multiple carriers [2 ops × ~20 Tbps = 40 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/high-speed-networks/article/14074203/zayo-to-open-montreal-to-albany-fiber-network-route-this-month",
			operators: ["Zayo", "Cogent"],
		},
		{
			from: "chicago",
			to: "toronto",
			capacityTbps: 30,
			confidence: "estimated",
			source: "Multiple carriers",
			operators: [],
		},

		// Africa
		{
			from: "mombasa",
			to: "nairobi",
			capacityTbps: 12,
			confidence: "verified",
			source:
				"Liquid Intelligent Technologies + Nokia, 16,576 km Mombasa-Johannesburg corridor, 12 Tbps capacity",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/dwdm-roadm/article/14289208/liquid-intelligent-technologies-deploys-nokia-optical-transport-systems-on-mombasa-to-johannesburg-fiber-network",
			operators: ["Liquid"],
		},
		{
			from: "nairobi",
			to: "kampala",
			capacityTbps: 5,
			confidence: "estimated",
			source: "Liquid backbone, WIOCC [2 ops × ~3 Tbps = 5 Tbps]",
			sourceUrl:
				"https://liquid.tech/about-us/news/liquid_intelligent_technologies_upgrades_east_africa_fibre_ring_to_100g_delivering_faster_speeds_across_rwanda_uganda_and_kenya/",
			operators: ["Liquid", "WIOCC"],
		},
		{
			from: "kampala",
			to: "kigali",
			capacityTbps: 2,
			confidence: "estimated",
			source: "Liquid backbone [1 ops × ~2 Tbps = 2 Tbps]",
			sourceUrl:
				"https://liquid.tech/about-us/news/liquid_intelligent_technologies_upgrades_east_africa_fibre_ring_to_100g_delivering_faster_speeds_across_rwanda_uganda_and_kenya/",
			operators: ["Liquid"],
		},
		{
			from: "nairobi",
			to: "addis-ababa",
			capacityTbps: 4,
			confidence: "verified",
			source:
				"Liquid Kenya-Ethiopia fiber route, 1,000+ km, 4 Tbps. Partnership with KETRACO + Ethiopia Electric Power",
			sourceUrl:
				"https://www.computerweekly.com/news/366552080/Liquid-opens-tap-on-Kenya-and-Ethiopia-fibre-link",
			operators: ["Liquid"],
		},
		{
			from: "lusaka",
			to: "lilongwe",
			capacityTbps: 1,
			confidence: "estimated",
			source:
				"Liquid Zambia-Malawi fiber route, 711 km. Capacity unverified (1 Tbps is estimate) [1 ops × ~1 Tbps = 1 Tbps]",
			sourceUrl:
				"https://www.connectingafrica.com/fiber-networking/liquid-launches-kenya-ethiopia-zambia-malawi-fiber-routes",
			operators: ["Liquid"],
		},
		{
			from: "johannesburg",
			to: "cape-town",
			capacityTbps: 10,
			confidence: "estimated",
			source: "Telkom SA, WIOCC, Liquid [3 ops × ~3 Tbps = 10 Tbps]",
			sourceUrl: "https://wiocc.net/terrestrial-fibre-south-africa/",
			operators: ["Telkom SA", "WIOCC", "Liquid"],
		},
		{
			from: "johannesburg",
			to: "maputo",
			capacityTbps: 3,
			confidence: "estimated",
			source: "Liquid, regional carriers [1 ops × ~3 Tbps = 3 Tbps]",
			sourceUrl: "https://liquid.tech/about-us/our-network/",
			operators: ["Liquid"],
		},
		{
			from: "lusaka",
			to: "harare",
			capacityTbps: 3,
			confidence: "estimated",
			source: "Liquid backbone [1 ops × ~3 Tbps = 3 Tbps]",
			sourceUrl:
				"https://liquid.tech/about-us/news/liquid_intelligent_technologies_upgrades_east_africa_fibre_ring_to_100g_delivering_faster_speeds_across_rwanda_uganda_and_kenya/",
			operators: ["Liquid"],
		},
		{
			from: "harare",
			to: "johannesburg",
			capacityTbps: 5,
			confidence: "estimated",
			source: "Liquid backbone [1 ops × ~5 Tbps = 5 Tbps]",
			sourceUrl:
				"https://liquid.tech/about-us/news/liquid_intelligent_technologies_upgrades_east_africa_fibre_ring_to_100g_delivering_faster_speeds_across_rwanda_uganda_and_kenya/",
			operators: ["Liquid"],
		},

		// East Asia
		{
			from: "hanoi",
			to: "nanning",
			capacityTbps: 3,
			confidence: "estimated",
			source:
				"China-Vietnam Pingxiang/Dongxing crossings. ~2.7 Tbps documented used capacity (Bangladesh comparison). Limited by border gateway capacity [2 ops × ~1.5 Tbps = 3 Tbps]",
			sourceUrl:
				"https://www.lightreading.com/cable-technology/vietnam-reduces-reliance-on-subsea-cables-with-first-terrestrial-link-to-singapore",
			operators: ["China Telecom", "China Unicom"],
		},
		{
			from: "mandalay",
			to: "kunming",
			capacityTbps: 0.8,
			confidence: "verified",
			source:
				"CMI terrestrial cable: China Unicom + MPT, 1,500 km, 24 fiber pairs, 80x10 Gbps = 800 Gbps design. Route runs Ruili (Yunnan)-Mandalay-Naypyidaw-Yangon-Ngwe Saung",
			sourceUrl:
				"https://www.submarinenetworks.com/en/nv/news/china-myanmar-international-cmi-terrestrial-cable-launches-for-service",
			operators: ["China Unicom", "MPT"],
		},
		{
			from: "vientiane",
			to: "kunming",
			capacityTbps: 2,
			confidence: "estimated",
			source: "China-Laos terrestrial [1 ops × ~2 Tbps = 2 Tbps]",
			sourceUrl: "https://en.wikipedia.org/wiki/Internet_in_China",
			operators: ["China Telecom"],
		},
		{
			from: "dhaka",
			to: "kolkata",
			capacityTbps: 5,
			confidence: "estimated",
			source: "Three India-Bangladesh cross-border cables [4 ops × ~1 Tbps = 5 Tbps]",
			sourceUrl:
				"https://www.thedailystar.net/business/news/making-bangladesh-regional-internet-hub-1758592",
			operators: ["BTCL", "BSNL", "Airtel", "Tata"],
		},

		// South America
		{
			from: "sao-paulo",
			to: "buenos-aires",
			capacityTbps: 50,
			confidence: "estimated",
			source:
				"SAC terrestrial segments, Cirion (668 Tbps LATAM-wide, 2024), Internexa (32,000+ km fiber) [3 ops × ~17 Tbps = 50 Tbps]",
			sourceUrl: "https://www.internexa.com/en/cobertura-red",
			operators: ["SAC", "Cirion", "Internexa"],
		},
		{
			from: "buenos-aires",
			to: "santiago",
			capacityTbps: 15,
			confidence: "estimated",
			source:
				"Andes crossing via SAC terrestrial segment + Cirion LATAM backbone (668 Tbps network-wide, 2024) + Conecta Infra (US$350M, 6,000 km dark fiber, launched Mar 2026) [3 ops × ~5 Tbps = 15 Tbps]",
			sourceUrl:
				"https://press.ciriontechnologies.com/en/2025/05/28/expands-network-infrastructure-capacity-access-metro-pops/",
			operators: ["SAC", "Cirion", "Conecta Infra"],
		},
		{
			from: "sao-paulo",
			to: "rio-de-janeiro",
			capacityTbps: 80,
			confidence: "estimated",
			source: "Domestic trunk, Cirion, multiple carriers [1 ops × ~80 Tbps = 80 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/business/article/14280661/lumen-closes-latin-american-business-sale-to-stonepeak-to-create-cirion",
			operators: ["Cirion"],
		},
		{
			from: "lima",
			to: "santiago",
			capacityTbps: 10,
			confidence: "estimated",
			source: "Internexa, SAC [2 ops × ~5 Tbps = 10 Tbps]",
			sourceUrl:
				"https://www.capacitymedia.com/article/29ot42ikril15nmhlw09r/company-strategy/internexa-creating-an-ip-backbone-across-latin-america",
			operators: ["Internexa", "SAC"],
		},
		{
			from: "bogota",
			to: "lima",
			capacityTbps: 8,
			confidence: "estimated",
			source: "Internexa backbone [1 ops × ~8 Tbps = 8 Tbps]",
			sourceUrl:
				"https://www.capacitymedia.com/article/29ot42ikril15nmhlw09r/company-strategy/internexa-creating-an-ip-backbone-across-latin-america",
			operators: ["Internexa"],
		},
		{
			from: "bogota",
			to: "cali",
			capacityTbps: 15,
			confidence: "estimated",
			source: "Domestic trunk, Internexa [1 ops × ~15 Tbps = 15 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/optical-tech/transport/article/16673580/internexa-adva-optical-networking-trial-telecom-infra-project-voyager-whitebox-packet-dwdm-transponder",
			operators: ["Internexa"],
		},
		{
			from: "quito",
			to: "bogota",
			capacityTbps: 8,
			confidence: "estimated",
			source: "Internexa Colombia-Ecuador [1 ops × ~8 Tbps = 8 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/fttx/cables-enclosures/article/16676271/centurylink-connects-colombia-and-ecuador-with-585-km-fiber-optic-route",
			operators: ["Internexa"],
		},
		{
			from: "sao-paulo",
			to: "porto-alegre",
			capacityTbps: 30,
			confidence: "estimated",
			source: "Domestic trunk, Conecta Infra [1 ops × ~30 Tbps = 30 Tbps]",
			sourceUrl:
				"https://www.prnewswire.com/news-releases/conecta-infra-launches-with-us350-million-investment-to-connect-south-americas-leading-data-center-hubs-302720079.html",
			operators: ["Conecta Infra"],
		},

		// West Africa (new)
		{
			from: "lagos",
			to: "accra",
			capacityTbps: 1,
			confidence: "verified",
			source:
				"CSquared + Phase3 + SBIN Lagos-Accra terrestrial fiber (commissioned May 2025), via Cotonou/Lome. Also Orange Djoliba network",
			sourceUrl:
				"https://csquared.com/2025/05/06/csquared-phase3-and-sbin-commission-lagos-to-accra-terrestrial-fibre-route-strengthening-west-africas-digital-resilience/",
			operators: ["CSquared", "Phase3", "SBIN", "Orange"],
		},
		{
			from: "accra",
			to: "abidjan",
			capacityTbps: 1,
			confidence: "estimated",
			source:
				"CSquared backbone + Orange Djoliba pan-West African fiber network (10,000 km terrestrial, up to 100 Gbps) [2 ops × ~1 Tbps = 1 Tbps]",
			sourceUrl:
				"https://www.lightwaveonline.com/network-design/high-speed-networks/article/14072161/orange-plans-fiber-backbone-network-in-west-africa",
			operators: ["CSquared", "Orange"],
		},
		{
			from: "abidjan",
			to: "dakar",
			capacityTbps: 0.5,
			confidence: "estimated",
			source:
				"Orange Djoliba backbone via Mali/Burkina Faso/Senegal. Also Phase3 + Sonatel Lagos-Dakar terrestrial (launched May 2025, 32ms latency) [3 ops × ~167 Gbps = 500 Gbps]",
			sourceUrl:
				"https://www.businesswire.com/news/home/20250507073118/en/Phase3-and-Sonatel-Launch-Lagos-to-Dakar-Terrestrial-Fibre-Route-Unlocking-Resilience-Across-West-Africa",
			operators: ["Orange", "Phase3", "Sonatel"],
		},

		// Balkans (new)
		{
			from: "budapest",
			to: "belgrade",
			capacityTbps: 5,
			confidence: "verified",
			source: "RETN 932 km Budapest-Belgrade-Sofia DWDM route (N*100G per circuit)",
			sourceUrl: "https://retn.net/news-events/retn_deploys_dwdm_%20route_budapest_belgrade_sofia",
			operators: ["RETN", "CETIN"],
		},
		{
			from: "belgrade",
			to: "sofia",
			capacityTbps: 5,
			confidence: "verified",
			source: "RETN Budapest-Belgrade-Sofia DWDM route + Neterra backbone",
			sourceUrl: "https://retn.net/news-events/retn_deploys_dwdm_%20route_budapest_belgrade_sofia",
			operators: ["RETN", "CETIN", "Neterra"],
		},
		{
			from: "bucharest",
			to: "sofia",
			capacityTbps: 5,
			confidence: "verified",
			source: "RETN diverse Budapest-Sofia route via Romania (second path)",
			sourceUrl:
				"https://retn.net/news-events/RETN_Strengthens_Network_Diversity_with_New_Budapest_to_Sofia_Route_via_Romania",
			operators: ["RETN", "Neterra"],
		},
		{
			from: "zagreb",
			to: "budapest",
			capacityTbps: 5,
			confidence: "estimated",
			source:
				"Telia Carrier (PoP in Zagreb since 2016), Hrvatski Telekom [2 ops × ~3 Tbps = 5 Tbps]",
			sourceUrl:
				"https://www.prnewswire.com/news-releases/telia-carrier-expands-global-backbone-to-zagreb-improves-connectivity-for-cee-and-the-balkans-300357941.html",
			operators: ["Telia", "Hrvatski Telekom"],
		},

		// Middle East (new)
		{
			from: "fujairah",
			to: "riyadh",
			capacityTbps: 6,
			confidence: "verified",
			source:
				"RCN (Regional Cable Network): Etisalat + Zain + Mobily + Orange consortium. 7,750 km round trip, 2 redundant fiber pairs, 6.4 Tbps design, 1.2 Tbps initial. Commercial since May 2015",
			sourceUrl:
				"https://zain.com/en/press-release/rcn-regional-cable-network-new-terrestrial-route-c",
			operators: ["Etisalat", "Zain", "Mobily", "Orange"],
		},
		{
			from: "fujairah",
			to: "muscat",
			capacityTbps: 5,
			confidence: "estimated",
			source:
				"Omantel + du terrestrial cross-border links + OEG submarine cable (275 km) [2 ops × ~3 Tbps = 5 Tbps]",
			sourceUrl: "https://en.wikipedia.org/wiki/Omantel",
			operators: ["Omantel", "du"],
		},

		// Southeast Asia (new)
		{
			from: "bangkok",
			to: "phnom-penh",
			capacityTbps: 1,
			confidence: "estimated",
			source:
				"Thailand-Cambodia-Vietnam Backbone (TCV), ~600 km. LXT Networks, CAT Telecom, Viettel Cambodia [3 ops × ~0 Tbps = 1 Tbps]",
			sourceUrl:
				"https://www.prnewswire.com/news-releases/metro-optical-and-lxt-networks-partner-to-deliver-internet-access-and-sdwan-services-throughout-the-emerging-markets-of-thailand-cambodia-myanmar-laos-and-vietnam-300736393.html",
			operators: ["LXT Networks", "CAT Telecom", "Viettel"],
		},
		{
			from: "phnom-penh",
			to: "ho-chi-minh-city",
			capacityTbps: 0.5,
			confidence: "estimated",
			source:
				"Viettel Cambodia terrestrial to Vietnam (45 Gbps), CFOCN 2,000 km backbone in Cambodia [2 ops × ~250 Gbps = 500 Gbps]",
			sourceUrl:
				"https://www.aiib.org/en/projects/details/2019/approved/Cambodia-Fiber-Optic-Communication-Network-Project.html",
			operators: ["Viettel", "CFOCN"],
		},
		{
			from: "kuala-lumpur",
			to: "singapore",
			capacityTbps: 30,
			confidence: "estimated",
			source:
				"MSAR (neutral carrier since 2014), Telekom Malaysia (540,000 km fiber), Fiberail (5,500 km via rail/pipeline corridors), Singtel. Dual access via Johor Causeway + Tuas Second Link [4 ops × ~8 Tbps = 30 Tbps]",
			sourceUrl: "https://msar.tech",
			operators: ["MSAR", "TM", "Fiberail", "Singtel"],
		},

		// ── China backbone (ChinaNet 8 supercore nodes + CN2) ──
		{
			from: "beijing",
			to: "shanghai",
			capacityTbps: 100,
			confidence: "estimated",
			source:
				"China Telecom ChinaNet + CN2 + China Unicom 169 + China Mobile CMNet. 64 Tbps trial on Nanjing-Shanghai G.652 fiber. G.654E deployment Beijing-Jinan-Nanjing [3 ops × ~33 Tbps = 100 Tbps]",
			sourceUrl:
				"https://www.submarinenetworks.com/en/nv/news/china-telecom-transports-64tbps-over-1200km-g-652-fiber-using-c-l-technology",
			operators: ["China Telecom", "China Unicom", "China Mobile"],
		},
		{
			from: "beijing",
			to: "wuhan",
			capacityTbps: 60,
			confidence: "estimated",
			source:
				"ChinaNet + CN2 + CERNET FITI 1.2 Tbps backbone (Beijing-Wuhan-Guangzhou). Both are supercore nodes [3 ops × ~20 Tbps = 60 Tbps]",
			sourceUrl:
				"https://developingtelecoms.com/telecom-technology/optical-fixed-networks/15795-tsinghua-team-launch-china-s-first-1-2-tbps-internet-backbone.html",
			operators: ["China Telecom", "China Unicom", "China Mobile"],
		},
		{
			from: "wuhan",
			to: "guangzhou",
			capacityTbps: 60,
			confidence: "estimated",
			source:
				"ChinaNet + CN2 + CERNET FITI 1.2 Tbps backbone. Both are supercore nodes [3 ops × ~20 Tbps = 60 Tbps]",
			sourceUrl:
				"https://www.scmp.com/news/china/science/article/3241453/china-launches-worlds-fastest-internet-12-terabit-second-link-years-ahead-forecasts",
			operators: ["China Telecom", "China Unicom", "China Mobile"],
		},
		{
			from: "guangzhou",
			to: "shenzhen",
			capacityTbps: 80,
			confidence: "estimated",
			source:
				"China Telecom hollow-core fiber Dongguan-Shenzhen-HK 110km, sub-1ms RTT. All 3 operators parallel trunk [3 ops × ~27 Tbps = 80 Tbps]",
			sourceUrl:
				"https://www.lightreading.com/cable-technology/chinese-operators-get-cracking-on-hollow-core-fiber",
			operators: ["China Telecom", "China Unicom", "China Mobile"],
		},
		{
			from: "shanghai",
			to: "nanjing",
			capacityTbps: 60,
			confidence: "estimated",
			source:
				"China Telecom 64 Tbps trial on this exact segment (Nanjing-Shanghai G.652 fiber). Both are supercore/CN2 nodes [3 ops × ~20 Tbps = 60 Tbps]",
			sourceUrl:
				"https://www.submarinenetworks.com/en/nv/news/china-telecom-transports-64tbps-over-1200km-g-652-fiber-using-c-l-technology",
			operators: ["China Telecom", "China Unicom", "China Mobile"],
		},
		{
			from: "wuhan",
			to: "chengdu",
			capacityTbps: 40,
			confidence: "estimated",
			source:
				"Both are ChinaNet supercore + CN2 core nodes. Eastern Data Western Computing computing hub corridor [3 ops × ~13 Tbps = 40 Tbps]",
			sourceUrl:
				"https://newsroom.cisco.com/c/r/newsroom/en/us/a/y2006/m07/china-telecom-selects-cisco-as-primary-supplier-for-chinanet-2006-expansion.html",
			operators: ["China Telecom", "China Unicom", "China Mobile"],
		},
		{
			from: "xian",
			to: "wuhan",
			capacityTbps: 30,
			confidence: "estimated",
			source:
				"Both are ChinaNet supercore + CN2 core nodes. Xi'an is junction of east-west and north-south trunk routes [3 ops × ~10 Tbps = 30 Tbps]",
			sourceUrl: "https://en.wikipedia.org/wiki/Internet_in_China",
			operators: ["China Telecom", "China Unicom", "China Mobile"],
		},
		{
			from: "beijing",
			to: "nanjing",
			capacityTbps: 80,
			confidence: "estimated",
			source:
				"China Mobile G.654E fiber Beijing-Jinan-Nanjing trunk deployment [3 ops × ~27 Tbps = 80 Tbps]",
			sourceUrl:
				"https://www.daytaifiberoptic.com/news/welcome-the-first-year-of-large-scale-commerci-71098886.html",
			operators: ["China Telecom", "China Unicom", "China Mobile"],
		},

		// ── South Korea ──
		{
			from: "seoul",
			to: "busan",
			capacityTbps: 10,
			confidence: "verified",
			source:
				"SK Telecom 800 Gbps live on Seoul-Busan (1.2 Tbps tested). KT 1.2 Tbps pilot over 530 km Seoul-Busan. LG Uplus also 800G",
			sourceUrl:
				"https://www.mobileworldlive.com/asia-pacific/sk-units-prepare-for-data-surge-with-backbone-upgrade/",
			operators: ["SK Telecom", "KT", "LG Uplus"],
		},

		// ── Canada ──
		{
			from: "toronto",
			to: "montreal",
			capacityTbps: 30,
			confidence: "estimated",
			source:
				"Bell Canada + FirstLight 400G wavelengths with triple redundancy (3 diverse routes). Q1 2024 [2 ops × ~15 Tbps = 30 Tbps]",
			sourceUrl:
				"https://www.firstlight.net/bell-and-firstlight-to-offer-new-high-speed-routes-with-triple-redundancy-between-secaucus-nj-toronto-and-montreal/",
			operators: ["Bell Canada", "FirstLight"],
		},

		// ── Scandinavia ──
		{
			from: "oslo",
			to: "stockholm",
			capacityTbps: 20,
			confidence: "verified",
			source:
				"Arelion 1.6 Tbps waves with 400G coherent pluggable optics (Ciena 6500 RLS). New high-fiber-count cables in existing ducts. Complete mid-2025",
			sourceUrl: "https://www.arelion.com/why-arelion/press-releases/scandinavian-fiber-upgrade-ai",
			operators: ["Arelion"],
		},

		// ── Spain ──
		{
			from: "madrid",
			to: "barcelona",
			capacityTbps: 40,
			confidence: "estimated",
			source:
				"Reintel 54,000+ km dark fiber mesh on ADIF AV railway + Red Electrica. Lyntia 55,200 km. Telefonica [3 ops × ~13 Tbps = 40 Tbps]",
			sourceUrl: "https://www.reintel.es/en/solutions/backbone-network",
			operators: ["Reintel", "Lyntia", "Telefonica"],
		},

		// ── Poland ──
		{
			from: "warsaw",
			to: "krakow",
			capacityTbps: 10,
			confidence: "estimated",
			source:
				"HAWE Telekom 4,000 km trunk line with two tele-technical rings surrounding Poland. Atman Nx10 Gbps backbone [2 ops × ~5 Tbps = 10 Tbps]",
			sourceUrl: "https://hawetelekom.com/en/about-us",
			operators: ["HAWE Telekom", "Atman"],
		},

		// ── Mexico ──
		{
			from: "mexico-city",
			to: "dallas",
			capacityTbps: 20,
			confidence: "estimated",
			source:
				"Cirion Mexico City-Queretaro-Monterrey ring (~4,260 km) + Fermaca/Zayo FN-1 El Paso-Queretaro 2,000 km. Cross-border to US backbone [2 ops × ~10 Tbps = 20 Tbps]",
			sourceUrl: "https://press.ciriontechnologies.com/en/2024/12/09/expands-fiber-optic-mexico/",
			operators: ["Cirion", "Fermaca"],
		},

		// ── North Africa ──
		{
			from: "casablanca",
			to: "marseille",
			capacityTbps: 5,
			confidence: "estimated",
			source:
				"Maroc Telecom West Africa cable (North segment: 814 km Casablanca-Lisbon, 60 Tbps submarine). No direct terrestrial to Marseille. Capacity estimate for transit via submarine cables [1 op × ~5 Tbps = 5 Tbps]",
			sourceUrl: "https://en.wikipedia.org/wiki/Telecommunications_in_Morocco",
			operators: ["Maroc Telecom"],
		},
		{
			from: "cairo",
			to: "suez",
			capacityTbps: 200,
			confidence: "verified",
			source:
				"Telecom Egypt 10 diversified terrestrial trans-Egypt crossing routes connecting all Red Sea and Mediterranean landing stations. 200+ Tbps total transit",
			sourceUrl: "https://www.csis.org/analysis/strategic-future-subsea-cables-egypt-case-study",
			operators: ["Telecom Egypt"],
		},

		// ── Landing station backhaul (short terrestrial links to nearest hub) ──
		// These connect submarine cable landing stations to the national backbone.
		// Every landing station has terrestrial fiber backhaul in reality.
		// Denmark
		{
			from: "osterby",
			to: "brondby",
			capacityTbps: 10,
			confidence: "approximated",
			source: "TDC/Norlys domestic backbone backhaul",
			operators: ["TDC"],
		},
		{
			from: "endrup",
			to: "brondby",
			capacityTbps: 10,
			confidence: "approximated",
			source: "TDC/Norlys domestic backbone backhaul",
			operators: ["TDC"],
		},
		{
			from: "nybor",
			to: "brondby",
			capacityTbps: 5,
			confidence: "approximated",
			source: "TDC domestic backbone",
			operators: ["TDC"],
		},
		{
			from: "r-nne",
			to: "brondby",
			capacityTbps: 5,
			confidence: "approximated",
			source: "TDC domestic backbone (Bornholm)",
			operators: ["TDC"],
		},
		{
			from: "gedser",
			to: "brondby",
			capacityTbps: 5,
			confidence: "approximated",
			source: "TDC domestic backbone",
			operators: ["TDC"],
		},
		{
			from: "tjele",
			to: "brondby",
			capacityTbps: 5,
			confidence: "approximated",
			source: "TDC domestic backbone",
			operators: ["TDC"],
		},
		// Sweden
		{
			from: "kristinelund",
			to: "brondby",
			capacityTbps: 10,
			confidence: "approximated",
			source: "Telia Sweden domestic backbone",
			operators: ["Telia"],
		},
		{
			from: "nybro",
			to: "nynashamn",
			capacityTbps: 5,
			confidence: "approximated",
			source: "Telia Sweden domestic backbone",
			operators: ["Telia"],
		},
		{
			from: "katthammarsvik",
			to: "nynashamn",
			capacityTbps: 5,
			confidence: "approximated",
			source: "Telia Sweden domestic backbone (Gotland)",
			operators: ["Telia"],
		},
		{
			from: "ystad",
			to: "brondby",
			capacityTbps: 5,
			confidence: "approximated",
			source: "Telia/Oresund domestic",
			operators: ["Telia"],
		},
		{
			from: "kungsbacka",
			to: "brondby",
			capacityTbps: 5,
			confidence: "approximated",
			source: "Telia Sweden west coast",
			operators: ["Telia"],
		},
		// Finland
		{
			from: "hanko",
			to: "helsinki",
			capacityTbps: 5,
			confidence: "approximated",
			source: "Cinia/Elisa domestic backbone",
			operators: ["Cinia"],
		},
		{
			from: "kotka",
			to: "helsinki",
			capacityTbps: 5,
			confidence: "approximated",
			source: "Cinia/Elisa domestic backbone",
			operators: ["Cinia"],
		},
		{
			from: "mariehamn",
			to: "helsinki",
			capacityTbps: 3,
			confidence: "approximated",
			source: "Cinia domestic backbone (Aland)",
			operators: ["Cinia"],
		},
		{
			from: "lokalahti",
			to: "helsinki",
			capacityTbps: 2,
			confidence: "approximated",
			source: "Cinia domestic backbone",
			operators: ["Cinia"],
		},
		{
			from: "vaasa",
			to: "helsinki",
			capacityTbps: 2,
			confidence: "approximated",
			source: "Elisa domestic backbone",
			operators: ["Elisa"],
		},
		// Germany (Baltic coast)
		{
			from: "sassnitz",
			to: "rostock",
			capacityTbps: 5,
			confidence: "approximated",
			source: "Deutsche Telekom regional backhaul",
			operators: ["Deutsche Telekom"],
		},
		{
			from: "sylt",
			to: "wilhelmshaven",
			capacityTbps: 5,
			confidence: "approximated",
			source: "Deutsche Telekom regional backhaul",
			operators: ["Deutsche Telekom"],
		},
		// Baltics
		{
			from: "klaipeda",
			to: "warsaw",
			capacityTbps: 3,
			confidence: "approximated",
			source: "Telia/TEO regional backbone",
			operators: ["Telia"],
		},
		{
			from: "ventspils",
			to: "nynashamn",
			capacityTbps: 3,
			confidence: "approximated",
			source: "LVRTC/Telia cross-Baltic",
			operators: ["Telia"],
		},
		{
			from: "liepaja",
			to: "nynashamn",
			capacityTbps: 2,
			confidence: "approximated",
			source: "LVRTC domestic backbone",
			operators: ["LVRTC"],
		},
	];

	const terrestrial: TerrestrialEdge[] = terrestrialDefs
		.map((def, i) => {
			// Resolve aliases for from/to
			const resolvedFrom = metroAliases.get(def.from) ?? def.from;
			const resolvedTo = metroAliases.get(def.to) ?? def.to;
			const fromCoord = metroCoords.get(resolvedFrom) ?? metroCoords.get(def.from);
			const toCoord = metroCoords.get(resolvedTo) ?? metroCoords.get(def.to);
			let distKm = 0;
			if (fromCoord && toCoord) {
				distKm = Math.round(haversineKm(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng));
			}
			return {
				id: `terr-${i + 1}-${resolvedFrom}-${resolvedTo}`,
				from: resolvedFrom,
				to: resolvedTo,
				capacityTbps: def.capacityTbps,
				distanceKm: distKm,
				confidence: def.confidence,
				source: def.source,
				...(def.sourceUrl ? { sourceUrl: def.sourceUrl } : {}),
				operators: def.operators,
				...(def.notes ? { notes: def.notes } : {}),
			};
		})
		.filter((e) => e.from !== e.to && e.distanceKm > 0);

	console.log(`  ${terrestrial.length} terrestrial edges`);

	// ── Chokepoints ──

	console.log("\nBuilding chokepoints...");

	function bboxPolygon(minLat: number, maxLat: number, minLng: number, maxLng: number): Polygon {
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
		{
			id: "west-africa-abidjan",
			name: "West Africa (Abidjan)",
			polygon: bboxPolygon(4.0, 6.5, -5.5, -3.0),
			description:
				"Waters off Abidjan, Cote d'Ivoire at the 'Le Trou Sans Fond' submarine canyon. Multiple West African cables transit this area.",
		},
		{
			id: "alexandria",
			name: "Alexandria",
			polygon: bboxPolygon(30.5, 32.0, 28.5, 30.5),
			description:
				"Cable landing zone near Alexandria, Egypt. Critical junction for Europe-Asia cables transiting the Mediterranean to the Suez region.",
		},
		{
			id: "south-china-sea-vietnam",
			name: "South China Sea (Vietnam)",
			polygon: bboxPolygon(8.0, 12.0, 107.0, 112.0),
			description:
				"Waters off southern Vietnam where multiple intra-Asia cables converge. Anchor drag from fishing and shipping is a recurring risk.",
		},
	];

	console.log(`  ${chokepoints.length} chokepoints`);

	// ── Scenarios ──

	console.log("\nBuilding scenarios...");

	const scenarios: Scenario[] = [
		{
			id: "red-sea-crisis",
			name: "Red Sea Crisis (2024)",
			description:
				"3 cables (AAE-1, EIG, SEACOM/TGN-Eurasia) cut in the Red Sea, February 2024. 25% of Asia-Europe data traffic disrupted.",
			cutLocations: [
				{
					type: "cable",
					cableIds: [
						"asia-africa-europe-1-aae-1",
						"europe-india-gateway-eig",
						"seacomtata-tgn-eurasia",
					],
					cutLat: 12.6,
					cutLng: 43.3,
					cutRadius: 500,
				},
			],
			historicalDate: "2024-02-24",
			repairTimeDays: 56,
			sourceUrls: [
				"https://www.aljazeera.com/news/2024/3/6/why-are-people-blaming-the-houthis-for-cutting-the-red-sea-cables",
				"https://blog.cloudflare.com/east-african-internet-connectivity-again-impacted-by-submarine-cable-cuts/",
			],
		},
		{
			id: "west-africa-2024",
			name: "West Africa Cuts (2024)",
			description:
				"4 cables (WACS, MainOne, SAT-3, ACE) severed off Abidjan at the Le Trou Sans Fond submarine canyon on March 14, 2024. 13 African countries impacted.",
			cutLocations: [
				{
					type: "cable",
					cableIds: [
						"west-africa-cable-system-wacs",
						"mainone",
						"sat-3wasc",
						"africa-coast-to-europe-ace",
					],
					cutLat: 5.3,
					cutLng: -4.0,
					cutRadius: 300,
				},
			],
			historicalDate: "2024-03-14",
			repairTimeDays: 28,
			sourceUrls: [
				"https://blog.cloudflare.com/undersea-cable-failures-cause-internet-disruptions-across-africa-march-14-2024/",
			],
		},
		{
			id: "baltic-sabotage",
			name: "Baltic Sea Sabotage (2024)",
			description:
				"BCS East-West Interlink and C-Lion1 cables damaged November 17-18, 2024. Chinese vessel Yi Peng 3 suspected. High terrestrial redundancy limited impact.",
			cutLocations: [
				{
					type: "cable",
					cableIds: ["bcs-east-west-interlink", "c-lion1"],
					cutLat: 58.0,
					cutLng: 20.0,
					cutRadius: 400,
				},
			],
			historicalDate: "2024-11-17",
			repairTimeDays: 10,
			sourceUrls: ["https://en.wikipedia.org/wiki/2024_Baltic_Sea_submarine_cable_disruptions"],
		},
		{
			id: "luzon-strait-earthquake",
			name: "Luzon Strait Earthquake (2006)",
			description:
				"M7.0 Hengchun earthquake on December 26, 2006 triggered submarine landslides severing 8-22 cables in the Luzon Strait. Internet disrupted across Asia for weeks.",
			cutLocations: [{ type: "chokepoint", id: "luzon-strait" }],
			historicalDate: "2006-12-26",
			repairTimeDays: 35,
			sourceUrls: ["https://en.wikipedia.org/wiki/2006_Hengchun_earthquakes"],
		},
		{
			id: "mediterranean-2008",
			name: "Mediterranean Cuts (2008)",
			description:
				"SEA-ME-WE 4 and FLAG cables cut near Alexandria, Egypt on January 30, 2008. 70% disruption in Egypt, 60% in India, affecting 14 countries.",
			cutLocations: [
				{
					type: "cable",
					cableIds: ["seamewe-4", "fea"],
					cutLat: 31.2,
					cutLng: 29.9,
					cutRadius: 300,
				},
			],
			historicalDate: "2008-01-30",
			repairTimeDays: 14,
			sourceUrls: ["https://en.wikipedia.org/wiki/2008_submarine_cable_disruption"],
		},
		{
			id: "vietnam-2023",
			name: "Vietnam Cable Failures (2023)",
			description:
				"4 of 5 international cables (AAG, AAE-1, APG, TGN-IA; SMW-3 retired/not in dataset) connecting Vietnam were damaged or degraded. 75% of international capacity lost.",
			cutLocations: [
				{
					type: "cable",
					cableIds: [
						"asia-america-gateway-aag-cable-system",
						"asia-africa-europe-1-aae-1",
						"asia-pacific-gateway-apg",
						"tata-tgn-intra-asia-tgn-ia",
					],
					cutLat: 10.0,
					cutLng: 109.0,
					cutRadius: 500,
				},
			],
			historicalDate: "2023-02-01",
			repairTimeDays: 60,
			sourceUrls: [
				"https://www.theregister.com/2023/02/23/vietnam_submarine_cable_outages/",
				"https://www.theregister.com/2024/06/18/vietnam_internet_cables/",
			],
		},
		{
			id: "tonga-2022",
			name: "Tonga Eruption (2022)",
			description:
				"Hunga Tonga eruption on January 15, 2022 destroyed ~200 km of the Tonga Cable. Tonga was cut off from global communications for over 5 weeks.",
			cutLocations: [{ type: "cable", cableIds: ["tonga-cable"] }],
			historicalDate: "2022-01-15",
			repairTimeDays: 38,
			sourceUrls: [
				"https://en.wikipedia.org/wiki/2022_Hunga_Tonga%E2%80%93Hunga_Ha%CA%BBapai_eruption_and_tsunami",
			],
		},
		{
			id: "east-africa-2024",
			name: "East Africa Cuts (2024)",
			description:
				"EASSy and Seacom cables cut near Durban, South Africa on May 12, 2024, compounding damage from the February Red Sea cuts. Kenya, Tanzania, Uganda saw 10-33% traffic drops.",
			cutLocations: [
				{
					type: "cable",
					cableIds: ["eastern-africa-submarine-system-eassy", "seacomtata-tgn-eurasia"],
					cutLat: -29.9,
					cutLng: 31.0,
					cutRadius: 300,
				},
			],
			historicalDate: "2024-05-12",
			repairTimeDays: 14,
			sourceUrls: [
				"https://blog.cloudflare.com/east-african-internet-connectivity-again-impacted-by-submarine-cable-cuts/",
			],
		},
		{
			id: "egypt-2022",
			name: "Egypt Landing Damage (2022)",
			description:
				"AAE-1 and SMW-5 cables cut at their landing points in Egypt (Abu Talat and Zafarana) on June 7, 2022. Disrupted connectivity across Middle East, Africa, and Asia.",
			cutLocations: [
				{
					type: "cable",
					cableIds: ["asia-africa-europe-1-aae-1", "seamewe-5"],
					cutLat: 31.0,
					cutLng: 30.0,
					cutRadius: 200,
				},
			],
			historicalDate: "2022-06-07",
			repairTimeDays: 1,
			sourceUrls: ["https://blog.cloudflare.com/aae-1-smw5-cable-cuts/"],
		},
		{
			id: "japan-tohoku-2011",
			name: "Japan Tohoku Earthquake (2011)",
			description:
				"M9.0 earthquake and tsunami on March 11, 2011 severed 7+ cables. Simulates 4 still in dataset (APCN-2, EAC-C2C, FNAL, FEA); APCN, China-US CN, SMW-3 are retired.",
			cutLocations: [
				{
					type: "cable",
					cableIds: ["apcn-2", "eac-c2c", "flag-north-asia-loopreach-north-asia-loop", "fea"],
					cutLat: 36.5,
					cutLng: 141.0,
					cutRadius: 400,
				},
			],
			historicalDate: "2011-03-11",
			repairTimeDays: 30,
			sourceUrls: [
				"https://www.submarinenetworks.com/en/nv/news/cables-cut-after-magnitude-89-earthquake-in-japan",
				"https://www.lightwaveonline.com/network-design/article/16660580/fiber-effect-of-japan-earthquake-still-sorting-out",
			],
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
	console.log(`  Total cable segments: ${cables.reduce((s, c) => s + c.segments.length, 0)}`);
	const hubMetros = metros.filter((m) => m.isHub);
	console.log(`  Hub metros: ${hubMetros.map((m) => m.id).join(", ")}`);
	console.log("\nDone!");
}

main();

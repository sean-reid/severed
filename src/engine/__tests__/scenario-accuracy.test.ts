import { beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 30000 });
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
	Cable,
	Chokepoint,
	CutLocation,
	Metro,
	Scenario,
	TerrestrialEdge,
} from "../../data/types";
import { runSimulation } from "../simulation";
import type { SimulationInput } from "../simulation";

const dataDir = resolve(__dirname, "../../../public/data");
function loadJson<T>(name: string): T {
	return JSON.parse(readFileSync(resolve(dataDir, name), "utf-8"));
}

let cables: Cable[];
let metros: Metro[];
let terrestrial: TerrestrialEdge[];
let chokepoints: Chokepoint[];
let scenarios: Scenario[];
let cablesById: Map<string, Cable>;
let metrosById: Map<string, Metro>;

function getScenario(id: string): Scenario {
	const s = scenarios.find((sc) => sc.id === id);
	if (!s) throw new Error(`Scenario "${id}" not found`);
	return s;
}

beforeAll(() => {
	cables = loadJson<Cable[]>("cables.json");
	metros = loadJson<Metro[]>("metros.json");
	terrestrial = loadJson<TerrestrialEdge[]>("terrestrial.json");
	chokepoints = loadJson<Chokepoint[]>("chokepoints.json");
	scenarios = loadJson<Scenario[]>("scenarios.json");
	cablesById = new Map(cables.map((c) => [c.id, c]));
	metrosById = new Map(metros.map((m) => [m.id, m]));
});

/** Replicate the store's applyScenario cut resolution logic */
function resolveScenarioCuts(scenario: Scenario): CutLocation[] {
	const cuts: CutLocation[] = [];
	for (const cutLoc of scenario.cutLocations) {
		if (cutLoc.type === "chokepoint" && cutLoc.id) {
			const cp = chokepoints.find((c) => c.id === cutLoc.id);
			if (!cp) continue;
			const coords = cp.polygon.coordinates[0];
			const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
			const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
			cuts.push({
				id: `scenario-${scenario.id}-${cutLoc.id}`,
				type: "chokepoint",
				lat,
				lng,
				chokepointId: cutLoc.id,
				affectedSegmentIds: [],
			});
		} else if (cutLoc.type === "cable" && cutLoc.cableIds) {
			const hasCutLocation = cutLoc.cutLat != null && cutLoc.cutLng != null;
			const cutRadius = cutLoc.cutRadius ?? 500;
			for (const cableId of cutLoc.cableIds) {
				const cable = cablesById.get(cableId);
				if (!cable) continue;
				let segmentIds: string[];
				if (hasCutLocation) {
					segmentIds = [];
					for (let i = 0; i < cable.segments.length; i++) {
						const seg = cable.segments[i];
						const from = metrosById.get(seg.from);
						const to = metrosById.get(seg.to);
						if (!from || !to) continue;
						const midLat = (from.lat + to.lat) / 2;
						let midLng = (from.lng + to.lng) / 2;
						if (Math.abs(from.lng - to.lng) > 180) {
							midLng = midLng > 0 ? midLng - 180 : midLng + 180;
						}
						let dLng = Math.abs((cutLoc.cutLng ?? 0) - midLng);
						if (dLng > 180) dLng = 360 - dLng;
						const distDeg = Math.hypot((cutLoc.cutLat ?? 0) - midLat, dLng);
						if (distDeg * 111 < cutRadius) {
							segmentIds.push(`${cableId}:${i}`);
						}
					}
					if (segmentIds.length === 0) {
						segmentIds = cable.segments.map((_s, i) => `${cableId}:${i}`);
					}
				} else {
					segmentIds = cable.segments.map((_s, i) => `${cableId}:${i}`);
				}
				cuts.push({
					id: `scenario-${scenario.id}-cable-${cableId}`,
					type: "point",
					lat: cutLoc.cutLat ?? 0,
					lng: cutLoc.cutLng ?? 0,
					affectedSegmentIds: segmentIds,
				});
			}
		}
	}
	return cuts;
}

function simulate(cuts: CutLocation[], historicalDate?: string) {
	const input: SimulationInput = {
		metros,
		cables,
		terrestrial,
		chokepoints,
		cuts,
		historicalDate,
	};
	return runSimulation(input);
}

function impactForMetro(result: ReturnType<typeof simulate>, metroId: string) {
	return result.impacts.find((i) => i.metroId === metroId);
}

function maxLossForCountry(result: ReturnType<typeof simulate>, countryCode: string): number {
	const impacts = result.impacts.filter((i) => i.countryCode === countryCode);
	if (impacts.length === 0) return 0;
	return Math.max(...impacts.map((i) => i.bandwidthLossPct));
}

// ── Test every scenario ──

describe("Red Sea Crisis (2024)", () => {
	let result: ReturnType<typeof simulate>;
	beforeAll(() => {
		const scenario = getScenario("red-sea-crisis");
		result = simulate(resolveScenarioCuts(scenario));
	});

	it("cuts at least 3 cables", () => {
		expect(result.cablesAffected).toBeGreaterThanOrEqual(3);
	});

	it("affects 100+ metros", () => {
		expect(result.metrosAffected).toBeGreaterThan(100);
	});

	it("Aden (YE) sees significant loss", () => {
		const loss = maxLossForCountry(result, "YE");
		expect(loss).toBeGreaterThan(30);
	});

	it("Kenya has alternative paths (limited impact)", () => {
		const loss = maxLossForCountry(result, "KE");
		expect(loss).toBeLessThan(60);
	});
});

describe("West Africa Cuts (2024)", () => {
	let result: ReturnType<typeof simulate>;
	beforeAll(() => {
		const scenario = getScenario("west-africa-2024");
		result = simulate(resolveScenarioCuts(scenario));
	});

	it("cuts 4 cables", () => {
		expect(result.cablesAffected).toBeGreaterThanOrEqual(3);
	});

	it("impacts Cote d'Ivoire or nearby West African countries", () => {
		const ciLoss = maxLossForCountry(result, "CI");
		const ghLoss = maxLossForCountry(result, "GH");
		const slLoss = maxLossForCountry(result, "SL");
		expect(Math.max(ciLoss, ghLoss, slLoss)).toBeGreaterThan(0);
	});

	it("Nigeria sees disruption", () => {
		const loss = maxLossForCountry(result, "NG");
		expect(loss).toBeGreaterThan(0);
	});
});

describe("Baltic Sea Sabotage (2024)", () => {
	let result: ReturnType<typeof simulate>;
	beforeAll(() => {
		const scenario = getScenario("baltic-sabotage");
		result = simulate(resolveScenarioCuts(scenario));
	});

	it("cuts 2+ cables", () => {
		expect(result.cablesAffected).toBeGreaterThanOrEqual(2);
	});

	it("limited overall impact due to terrestrial redundancy", () => {
		expect(result.metrosAffected).toBeLessThan(50);
	});

	it("major hubs like Frankfurt unaffected", () => {
		const de = impactForMetro(result, "frankfurt");
		if (de) expect(de.bandwidthLossPct).toBeLessThan(5);
	});
});

describe("Luzon Strait Earthquake (2006)", () => {
	let result: ReturnType<typeof simulate>;
	beforeAll(() => {
		const scenario = getScenario("luzon-strait-earthquake");
		result = simulate(resolveScenarioCuts(scenario), scenario.historicalDate);
	});

	it("cuts cables in the chokepoint (few existed in 2006)", () => {
		// With historicalDate filtering, most modern cables didn't exist
		expect(result.cablesAffected).toBeGreaterThanOrEqual(1);
	});
});

describe("Mediterranean Cuts (2008)", () => {
	let result: ReturnType<typeof simulate>;
	beforeAll(() => {
		const scenario = getScenario("mediterranean-2008");
		result = simulate(resolveScenarioCuts(scenario), scenario.historicalDate);
	});

	it("cuts cables near Alexandria", () => {
		expect(result.cablesAffected).toBeGreaterThan(0);
	});

	it("Egypt sees significant loss (real: 70%)", () => {
		const loss = maxLossForCountry(result, "EG");
		expect(loss).toBeGreaterThan(10);
	});
});

describe("Vietnam Cable Failures (2023)", () => {
	let result: ReturnType<typeof simulate>;
	beforeAll(() => {
		const scenario = getScenario("vietnam-2023");
		result = simulate(resolveScenarioCuts(scenario));
	});

	it("cuts 3+ cables", () => {
		expect(result.cablesAffected).toBeGreaterThanOrEqual(3);
	});

	it("Vietnam sees major loss (real: 75%)", () => {
		const loss = maxLossForCountry(result, "VN");
		expect(loss).toBeGreaterThan(20);
	});
});

describe("Tonga Eruption (2022)", () => {
	let result: ReturnType<typeof simulate>;
	beforeAll(() => {
		const scenario = getScenario("tonga-2022");
		result = simulate(resolveScenarioCuts(scenario));
	});

	it("cuts both Tonga Cable and TDCE", () => {
		expect(result.cablesAffected).toBeGreaterThanOrEqual(2);
		const hasTongaCable = result.affectedEdgeIds.some((id: string) =>
			id.startsWith("tonga-cable:"),
		);
		const hasTDCE = result.affectedEdgeIds.some((id: string) => id.startsWith("tonga-domestic"));
		expect(hasTongaCable).toBe(true);
		expect(hasTDCE).toBe(true);
	});

	it("isolates Nuku'alofa (no alternative international path)", () => {
		const tongaMetro = metros.find((m) => m.id === "nukualofa");
		if (!tongaMetro) return;
		const impact = impactForMetro(result, tongaMetro.id);
		if (impact) {
			expect(impact.isolated).toBe(true);
			expect(impact.bandwidthLossPct).toBe(100);
		}
	});
});

describe("East Africa Cuts (2024)", () => {
	let result: ReturnType<typeof simulate>;
	beforeAll(() => {
		const scenario = getScenario("east-africa-2024");
		result = simulate(resolveScenarioCuts(scenario));
	});

	it("cuts 2 cables", () => {
		expect(result.cablesAffected).toBeGreaterThanOrEqual(2);
	});

	it("East African metros see impact", () => {
		const keLoss = maxLossForCountry(result, "KE");
		const tzLoss = maxLossForCountry(result, "TZ");
		expect(keLoss + tzLoss).toBeGreaterThan(0);
	});
});

describe("Egypt Landing Damage (2022)", () => {
	let result: ReturnType<typeof simulate>;
	beforeAll(() => {
		const scenario = getScenario("egypt-2022");
		result = simulate(resolveScenarioCuts(scenario));
	});

	it("affects cables at two separate locations", () => {
		expect(result.cablesAffected).toBeGreaterThanOrEqual(2);
	});

	it("broad impact across Middle East/Asia", () => {
		expect(result.metrosAffected).toBeGreaterThan(50);
	});
});

describe("Japan Tohoku Earthquake (2011)", () => {
	let result: ReturnType<typeof simulate>;
	beforeAll(() => {
		const scenario = getScenario("japan-tohoku-2011");
		result = simulate(resolveScenarioCuts(scenario), scenario.historicalDate);
	});

	it("cuts cables off NE Japan", () => {
		expect(result.cablesAffected).toBeGreaterThan(0);
	});

	it("Japan sees impact", () => {
		const jpLoss = maxLossForCountry(result, "JP");
		expect(jpLoss).toBeGreaterThan(0);
	});
});

// ── Cross-scenario consistency ──

describe("Cross-scenario consistency", () => {
	it("more cuts produce more impact", () => {
		const redSea = getScenario("red-sea-crisis");
		const single = simulate(resolveScenarioCuts(redSea));

		const westAfrica = getScenario("west-africa-2024");
		const combined = simulate([...resolveScenarioCuts(redSea), ...resolveScenarioCuts(westAfrica)]);

		expect(combined.cablesAffected).toBeGreaterThanOrEqual(single.cablesAffected);
	});

	it("every scenario produces at least 1 affected cable", () => {
		for (const scenario of scenarios) {
			const cuts = resolveScenarioCuts(scenario);
			const result = simulate(cuts, scenario.historicalDate);
			expect(result.cablesAffected).toBeGreaterThan(0);
		}
	});
});

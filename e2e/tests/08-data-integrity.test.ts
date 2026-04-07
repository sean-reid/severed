import type { TestContext } from "../context";

/**
 * Verify the built data files are well-formed and have expected counts.
 * This catches build regressions that might not show up visually.
 */
export default async function test(ctx: TestContext) {
	// Only run on desktop to avoid duplicating data checks
	if (ctx.viewport === "mobile") return;

	await ctx.goto();

	// Fetch and validate cables.json
	const cableStats = await ctx.page.evaluate(() =>
		fetch("/data/cables.json")
			.then((r) => r.json())
			.then(
				(
					data: Array<{
						id: string;
						designCapacityTbps: number;
						capacityConfidence: string;
						capacitySource: string;
						sourceUrl?: string;
						segments: unknown[];
						path: { geometry: { coordinates: unknown } };
					}>,
				) => ({
					total: data.length,
					withSegments: data.filter((c) => c.segments.length > 0).length,
					verified: data.filter((c) => c.capacityConfidence === "verified").length,
					estimated: data.filter((c) => c.capacityConfidence === "estimated").length,
					withSourceUrl: data.filter((c) => c.sourceUrl).length,
					hasPath: data.filter((c) => c.path?.geometry?.coordinates).length,
				}),
			),
	);

	ctx.assert(cableStats.total >= 590, `Expected >=590 cables, got ${cableStats.total}`);
	ctx.assert(
		cableStats.withSegments >= 400,
		`Expected >=400 cables with segments, got ${cableStats.withSegments}`,
	);
	ctx.assert(
		cableStats.verified >= 50,
		`Expected >=50 verified cables, got ${cableStats.verified}`,
	);
	ctx.assert(
		cableStats.withSourceUrl >= 80,
		`Expected >=80 cables with sourceUrl, got ${cableStats.withSourceUrl}`,
	);
	ctx.assert(cableStats.hasPath === cableStats.total, `All cables should have paths`);

	// Fetch and validate terrestrial.json
	const terrStats = await ctx.page.evaluate(() =>
		fetch("/data/terrestrial.json")
			.then((r) => r.json())
			.then(
				(
					data: Array<{
						id: string;
						from: string;
						to: string;
						capacityTbps: number;
						distanceKm: number;
						confidence: string;
						sourceUrl?: string;
					}>,
				) => ({
					total: data.length,
					withSourceUrl: data.filter((e) => e.sourceUrl).length,
					verified: data.filter((e) => e.confidence === "verified").length,
					maxDistance: Math.max(...data.map((e) => e.distanceKm)),
					zeroDistance: data.filter((e) => e.distanceKm === 0).length,
				}),
			),
	);

	ctx.assert(terrStats.total >= 110, `Expected >=110 terrestrial edges, got ${terrStats.total}`);
	ctx.assert(
		terrStats.withSourceUrl >= 40,
		`Expected >=40 terrestrial edges with sourceUrl, got ${terrStats.withSourceUrl}`,
	);
	ctx.assert(
		terrStats.maxDistance < 8000,
		`No terrestrial edge should exceed 8000km, got ${terrStats.maxDistance}`,
	);
	ctx.assert(terrStats.zeroDistance === 0, `No terrestrial edge should have 0 distance`);

	// Fetch and validate metros.json
	const metroStats = await ctx.page.evaluate(() =>
		fetch("/data/metros.json")
			.then((r) => r.json())
			.then((data: Array<{ id: string; isHub: boolean; lat: number; lng: number }>) => ({
				total: data.length,
				hubs: data.filter((m) => m.isHub).length,
				validCoords: data.filter(
					(m) => m.lat >= -90 && m.lat <= 90 && m.lng >= -180 && m.lng <= 180,
				).length,
			})),
	);

	ctx.assert(metroStats.total >= 900, `Expected >=900 metros, got ${metroStats.total}`);
	ctx.assert(metroStats.hubs >= 50, `Expected >=50 hubs, got ${metroStats.hubs}`);
	ctx.assert(
		metroStats.validCoords === metroStats.total,
		`All metros should have valid coordinates`,
	);

	await ctx.screenshot("data-integrity");
}

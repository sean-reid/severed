import type { TestContext } from "../context";

/**
 * Data quality -- the built dataset has the expected number of cables, metros,
 * and terrestrial links.
 *
 * As a user, I rely on the underlying data being complete and well-formed.
 * This test validates that build regressions haven't silently dropped records.
 */
export default async function test(ctx: TestContext) {
	// Only run on desktop to avoid duplicating data checks
	if (ctx.viewport === "mobile") return;

	await ctx.goto();

	// Verify the cables dataset has the expected shape and counts
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

	// Verify the terrestrial links dataset is complete and reasonable
	const terrestrialStats = await ctx.page.evaluate(() =>
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

	ctx.assert(terrestrialStats.total >= 110, `Expected >=110 terrestrial edges, got ${terrestrialStats.total}`);
	ctx.assert(
		terrestrialStats.withSourceUrl >= 40,
		`Expected >=40 terrestrial edges with sourceUrl, got ${terrestrialStats.withSourceUrl}`,
	);
	ctx.assert(
		terrestrialStats.maxDistance < 8000,
		`No terrestrial edge should exceed 8000km, got ${terrestrialStats.maxDistance}`,
	);
	ctx.assert(terrestrialStats.zeroDistance === 0, `No terrestrial edge should have 0 distance`);

	// Verify the metros dataset covers enough cities and hubs
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

import type { TestContext } from "../context";

/**
 * Verify all scenarios are based on real events (have historicalDate and sourceUrls).
 */
export default async function test(ctx: TestContext) {
	// Only run on desktop to avoid duplicating
	if (ctx.viewport === "mobile") return;

	await ctx.goto();

	const scenarioData = await ctx.page.evaluate(() =>
		fetch("/data/scenarios.json")
			.then((r) => r.json())
			.then(
				(
					data: Array<{
						id: string;
						name: string;
						historicalDate?: string;
						sourceUrls?: string[];
					}>,
				) =>
					data.map((s) => ({
						id: s.id,
						name: s.name,
						hasDate: !!s.historicalDate,
						hasUrls: !!s.sourceUrls && s.sourceUrls.length > 0,
						urlCount: s.sourceUrls?.length ?? 0,
					})),
			),
	);

	for (const s of scenarioData) {
		ctx.assert(s.hasDate, `Scenario "${s.name}" must have a historicalDate (real event)`);
		ctx.assert(s.hasUrls, `Scenario "${s.name}" must have sourceUrls`);
	}

	// Should have at least 6 scenarios
	ctx.assert(scenarioData.length >= 6, `Expected >=6 scenarios, got ${scenarioData.length}`);
}

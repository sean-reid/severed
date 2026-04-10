import type { TestContext } from "../context";

/**
 * As a user, I want confidence that every scenario is grounded in reality.
 *
 * No hypotheticals -- every scenario in the app is a documented real-world
 * event with sources. Each one must carry a historical date and at least one
 * source URL pointing to verifiable reporting. If any scenario lacks these,
 * it should not ship.
 */
export default async function test(ctx: TestContext) {
	// Only run on desktop to avoid duplicating
	if (ctx.viewport === "mobile") return;

	await ctx.goto();

	const allScenarios = await ctx.page.evaluate(() =>
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

	// Every scenario must be a documented real event with a date and sources
	for (const scenario of allScenarios) {
		ctx.assert(scenario.hasDate, `Scenario "${scenario.name}" must have a historicalDate (real event)`);
		ctx.assert(scenario.hasUrls, `Scenario "${scenario.name}" must have sourceUrls`);
	}

	// The app should offer a meaningful number of real-world scenarios
	ctx.assert(allScenarios.length >= 6, `Expected >=6 scenarios, got ${allScenarios.length}`);
}

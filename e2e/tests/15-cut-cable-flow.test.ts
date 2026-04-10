import type { TestContext } from "../context";

/**
 * As a user, I want to see clear damage indicators when a scenario is active.
 *
 * Scenario impact -- when a scenario severs cables, I see "Severed" badges and
 * no manual cut buttons clutter the UI. Selecting the Red Sea Crisis should
 * immediately show which cables are severed, and the reroute list should be
 * clean with no per-cable "Cut" buttons that would confuse the experience.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// I select the Red Sea scenario to see its cable damage
	if (ctx.viewport === "mobile") {
		await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const btn = btns.find((b) => b.textContent?.includes("Red Sea"));
			if (btn) btn.click();
		});
	} else {
		await ctx.clickButton("Red Sea");
	}
	await new Promise((r) => setTimeout(r, 4000));
	await ctx.waitForText("IMPACT");

	// Affected cables should be marked "Severed" so I know what happened
	const hasSevered = await ctx.page.evaluate(
		() => document.body.textContent?.toLowerCase().includes("severed") ?? false,
	);
	ctx.assert(hasSevered, "After scenario, 'Severed' should appear for affected cables");

	// The reroute list should not have stray "Cut" buttons cluttering the UI
	const noCutButtons = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		return !btns.some(
			(b) => b.textContent?.trim() === "Cut" && b.className.includes("cable-cut"),
		);
	});
	ctx.assert(noCutButtons, "No Cut buttons should exist in reroute list");

	await ctx.screenshot("cut-flow-severed");
}

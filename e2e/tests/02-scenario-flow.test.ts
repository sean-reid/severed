import type { TestContext } from "../context";

/**
 * As a user, I want to select the "Red Sea" scenario so I can see which
 * cables are affected and how internet traffic is impacted.
 *
 * Story: Exploring a real event -- I heard about Red Sea cable attacks and want to see the impact.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	if (ctx.viewport === "mobile") {
		// On mobile, scenarios are in the MobileScenarioBar (horizontal chips),
		// not in the sidebar. Find and tap the Red Sea chip directly.
		const tappedScenario = await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const redSea = btns.find((b) => b.textContent?.trim().includes("Red Sea"));
			if (redSea) {
				redSea.click();
				return true;
			}
			return false;
		});
		if (!tappedScenario) throw new Error("Red Sea scenario button not found on mobile");
	} else {
		await ctx.clickButton("Red Sea");
	}

	// Wait for the simulation to finish computing reroutes
	await new Promise((r) => setTimeout(r, 3000));
	await ctx.screenshot("scenario-red-sea");

	// The IMPACT panel appears with results
	await ctx.waitForText("IMPACT");
	const pageText = await ctx.bodyText();

	// I can see how many cables were cut
	ctx.assert(pageText.includes("cables"), "Impact panel should mention affected cables");

	// I can see affected metros or capacity figures
	ctx.assert(
		pageText.includes("metros") || pageText.includes("Tbps"),
		"Impact panel should show impact metrics",
	);
}

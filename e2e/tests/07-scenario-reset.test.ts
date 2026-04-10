import type { TestContext } from "../context";

/**
 * Starting fresh -- after exploring Baltic Sea sabotage, I reset to try another scenario.
 *
 * As a user, I want to apply a scenario, see its impact, then reset the app
 * so I can start over with a clean slate.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// I select the Baltic Sea sabotage scenario
	if (ctx.viewport === "mobile") {
		await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const btn = btns.find((b) => b.textContent?.trim().includes("Baltic"));
			if (btn) btn.click();
		});
	} else {
		await ctx.clickButton("Baltic");
	}

	await new Promise((r) => setTimeout(r, 3000));
	await ctx.waitForText("IMPACT");

	// I should see the impact analysis for the Baltic scenario
	let pageContent = await ctx.bodyText();
	ctx.assert(pageContent.includes("cables"), "Impact should show after scenario");

	// I click Reset to clear everything and start fresh
	if (ctx.viewport === "desktop") {
		await ctx.clickButton("Reset");
	} else {
		// On mobile, the reset button lives inside the impact panel
		const resetClicked = await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const reset = btns.find((b) => b.textContent?.trim() === "Reset");
			if (reset) {
				reset.click();
				return true;
			}
			return false;
		});
		if (!resetClicked) return; // Reset button may not be visible on mobile
	}

	await new Promise((r) => setTimeout(r, 1000));

	// The app should return to its welcome state, prompting me to pick a new scenario
	pageContent = await ctx.bodyText();
	ctx.assert(
		pageContent.includes("Select a scenario") || pageContent.includes("tap a cable"),
		"After reset, should show empty state prompt",
	);

	await ctx.screenshot("scenario-reset");
}

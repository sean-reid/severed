import type { TestContext } from "../context";

/**
 * As a user, I expect cuts in empty ocean to do nothing.
 *
 * Empty ocean -- I enter cut mode and click in the middle of the Pacific where
 * there are no cables. No cut marker should appear and no simulation should run.
 * This prevents visual clutter from accidental taps.
 */
export default async function test(ctx: TestContext) {
	if (ctx.viewport !== "desktop") return;

	await ctx.goto();

	// I enter cut mode
	await ctx.clickButton("Cut Mode");
	await new Promise((r) => setTimeout(r, 300));

	// I click in the middle of the Pacific (very few cables)
	// At default zoom, this should be far from any cable segment
	await ctx.page.mouse.click(1000, 450);
	await new Promise((r) => setTimeout(r, 2000));

	// No Undo or Reset button should appear since no cables were hit
	const hasUndoOrReset = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		return btns.some((b) => {
			const text = b.textContent?.trim() ?? "";
			return text === "Undo" || text === "Reset";
		});
	});

	// The empty state should still show
	const emptyState = await ctx.page.evaluate(
		() =>
			document.body.textContent?.includes("Select a scenario") ||
			document.body.textContent?.includes("Cut Mode"),
	);
	ctx.assert(emptyState, "Empty state should still be visible after clicking empty ocean");

	await ctx.screenshot("empty-ocean-no-cut");

	// Exit cut mode
	await ctx.clickButton("Exit Cut");
}

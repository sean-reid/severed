import type { TestContext } from "../context";

/**
 * As a power user, I want keyboard shortcuts for fast workflow.
 *
 * Keyboard shortcuts -- I use C to toggle cut mode and / to open search without
 * touching the mouse. These shortcuts should not fire when typing in an input.
 */
export default async function test(ctx: TestContext) {
	if (ctx.viewport !== "desktop") return;

	await ctx.goto();

	// I press C to toggle cut mode
	await ctx.page.keyboard.press("c");
	await new Promise((r) => setTimeout(r, 300));

	const cutModeActive = await ctx.page.evaluate(
		() => document.body.textContent?.includes("Exit Cut") ?? false,
	);
	ctx.assert(cutModeActive, "Pressing C should activate cut mode");

	// I press C again to exit cut mode
	await ctx.page.keyboard.press("c");
	await new Promise((r) => setTimeout(r, 300));

	const cutModeOff = await ctx.page.evaluate(
		() => document.body.textContent?.includes("Cut Mode") ?? false,
	);
	ctx.assert(cutModeOff, "Pressing C again should deactivate cut mode");

	// I press / to open search
	await ctx.page.keyboard.press("/");
	await new Promise((r) => setTimeout(r, 300));

	const searchOpen = await ctx.page.evaluate(
		() => document.querySelector('input[type="text"]') !== null,
	);
	ctx.assert(searchOpen, "Pressing / should open the search overlay");

	// I press Escape to close search
	await ctx.page.keyboard.press("Escape");
	await new Promise((r) => setTimeout(r, 300));

	const searchClosed = await ctx.page.evaluate(
		() => document.querySelector('input[type="text"]') === null,
	);
	ctx.assert(searchClosed, "Pressing Escape should close the search overlay");

	await ctx.screenshot("keyboard-shortcuts");
}

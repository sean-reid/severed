import type { TestContext } from "../context";

/**
 * As a user, I want the interface to adapt to my device so I get a usable
 * layout whether I am on a desktop monitor or my phone.
 *
 * Story: Browsing on my phone vs desktop -- the layout adapts to my device.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	if (ctx.viewport === "desktop") {
		// On my desktop the sidebar is visible alongside the globe
		const sidebarVisible = await ctx.page.evaluate(() => {
			const el = document.querySelector(".translate-x-0");
			return el !== null;
		});
		ctx.assert(sidebarVisible, "Desktop sidebar should be visible by default");

		// The impact panel is also visible on the right side
		const pageText = await ctx.bodyText();
		ctx.assert(
			pageText.includes("IMPACT") || pageText.includes("Select a scenario"),
			"Impact panel should be visible on desktop",
		);
	}

	if (ctx.viewport === "mobile") {
		// On my phone the sidebar starts hidden so the globe fills the screen
		const sidebarHidden = await ctx.page.evaluate(() => {
			const el = document.querySelector(".-translate-x-full");
			return el !== null;
		});
		ctx.assert(sidebarHidden, "Mobile sidebar should be hidden by default");

		// A hamburger menu lets me open the sidebar when I need it
		const hamburger = await ctx.page.$("button.md\\:hidden");
		ctx.assert(hamburger !== null, "Mobile hamburger button should be present");

		// A bottom sheet is present for viewing impact details
		const hasSheet = await ctx.page.evaluate(() => {
			const el = document.querySelector('[style*="--sheet-h"]');
			return el !== null;
		});
		ctx.assert(hasSheet, "Mobile bottom sheet should be present");

		await ctx.screenshot("mobile-layout");
	}
}

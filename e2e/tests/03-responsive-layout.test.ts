import type { TestContext } from "../context";

/**
 * Verify responsive layout renders correctly per viewport.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	if (ctx.viewport === "desktop") {
		// Sidebar should be visible (translated to 0)
		const sidebarVisible = await ctx.page.evaluate(() => {
			const el = document.querySelector(".translate-x-0");
			return el !== null;
		});
		ctx.assert(sidebarVisible, "Desktop sidebar should be visible by default");

		// Impact panel should be visible on the right
		const body = await ctx.bodyText();
		ctx.assert(
			body.includes("IMPACT") || body.includes("Select a scenario"),
			"Impact panel should be visible on desktop",
		);
	}

	if (ctx.viewport === "mobile") {
		// Sidebar should be hidden (off-screen)
		const sidebarHidden = await ctx.page.evaluate(() => {
			const el = document.querySelector(".-translate-x-full");
			return el !== null;
		});
		ctx.assert(sidebarHidden, "Mobile sidebar should be hidden by default");

		// Hamburger button should exist
		const hamburger = await ctx.page.$("button.md\\:hidden");
		ctx.assert(hamburger !== null, "Mobile hamburger button should be present");

		// Bottom sheet should be present
		const hasSheet = await ctx.page.evaluate(() => {
			const el = document.querySelector('[style*="--sheet-h"]');
			return el !== null;
		});
		ctx.assert(hasSheet, "Mobile bottom sheet should be present");

		await ctx.screenshot("mobile-layout");
	}
}

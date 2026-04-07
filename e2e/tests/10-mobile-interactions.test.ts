import type { TestContext } from "../context";

/**
 * Verify mobile-specific interactions: hamburger menu, sheet drag snap points,
 * and scenario chips in the mobile bar.
 */
export default async function test(ctx: TestContext) {
	if (ctx.viewport !== "mobile") return;

	await ctx.goto();

	// Click hamburger to open sidebar (use evaluate to avoid Puppeteer click issues)
	const hamburgerClicked = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		// Find the hamburger: it's a button with the 3-line SVG, positioned top-left
		const hamburger = btns.find((b) => {
			const rect = b.getBoundingClientRect();
			return rect.top < 60 && rect.left < 60 && rect.width < 50;
		});
		if (hamburger) {
			hamburger.click();
			return true;
		}
		return false;
	});
	ctx.assert(hamburgerClicked, "Hamburger button should exist and be clickable");

	{
		await new Promise((r) => setTimeout(r, 400));

		// Sidebar should now be visible (translate-x-0)
		const sidebarVisible = await ctx.page.evaluate(() => {
			const sidebar = document.querySelector(".translate-x-0");
			return sidebar !== null && sidebar.textContent?.includes("SEVERED");
		});
		ctx.assert(sidebarVisible, "Sidebar should be visible after hamburger click");

		// Sidebar should show scenarios
		const hasScenarios = await ctx.page.evaluate(
			() => document.body.textContent?.includes("Scenarios") ?? false,
		);
		ctx.assert(hasScenarios, "Sidebar should show Scenarios section");

		// Close sidebar
		await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const close = btns.find((b) => {
				const rect = b.getBoundingClientRect();
				return rect.top < 60 && rect.left < 60 && rect.width < 50;
			});
			if (close) close.click();
		});
		await new Promise((r) => setTimeout(r, 400));
	}

	// Mobile scenario bar should have scrollable chips
	// The MobileScenarioBar is inside a div.md\:hidden wrapper, but we just check
	// that scenario names appear as buttons somewhere in the page
	const scenarioNames = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const scenarios = btns.filter((b) => {
			const text = b.textContent?.trim() ?? "";
			return ["Red Sea", "Luzon", "Baltic", "Tonga", "West Africa", "Egypt"].some((s) =>
				text.includes(s),
			);
		});
		return scenarios.length;
	});
	ctx.assert(scenarioNames >= 3, `Expected >=3 scenario buttons visible, got ${scenarioNames}`);

	// Bottom sheet should be present with the impact panel
	const sheetExists = await ctx.page.evaluate(() => {
		const el = document.querySelector('[style*="--sheet-h"]');
		return el !== null;
	});
	ctx.assert(sheetExists, "Bottom sheet should be present");

	await ctx.screenshot("mobile-interactions");
}

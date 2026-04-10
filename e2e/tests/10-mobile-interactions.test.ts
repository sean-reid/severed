import type { TestContext } from "../context";

/**
 * Mobile navigation -- I open the sidebar, browse scenarios, and interact with
 * the bottom sheet on my phone.
 *
 * As a user on a mobile device, I want to access the sidebar via the hamburger
 * menu, see scenario chips I can scroll through, and have a bottom sheet for
 * viewing impact details.
 */
export default async function test(ctx: TestContext) {
	if (ctx.viewport !== "mobile") return;

	await ctx.goto();

	// I tap the hamburger icon to open the sidebar
	const hamburgerClicked = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		// Find the hamburger: it's a button with the 3-line SVG, positioned top-left
		const hamburger = btns.find((b) => {
			const rect = b.getBoundingClientRect();
			const text = b.textContent?.trim() ?? "";
			// Hamburger: small square button in top-left with "sidebar" in SVG title
			return rect.top < 60 && rect.left < 60 && rect.width < 50 && text.includes("sidebar");
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

		// The sidebar should slide in with the app title visible
		const sidebarVisible = await ctx.page.evaluate(() => {
			const sidebar = document.querySelector(".translate-x-0");
			return sidebar !== null && sidebar.textContent?.includes("SEVERED");
		});
		ctx.assert(sidebarVisible, "Sidebar should be visible after hamburger click");

		// I should see the Scenarios section listed in the sidebar
		const hasScenarios = await ctx.page.evaluate(
			() => document.body.textContent?.includes("Scenarios") ?? false,
		);
		ctx.assert(hasScenarios, "Sidebar should show Scenarios section");

		// I close the sidebar to return to the map
		await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const close = btns.find((b) => {
				const rect = b.getBoundingClientRect();
				const text = b.textContent?.trim() ?? "";
				return rect.top < 60 && rect.left < 60 && rect.width < 50 && text.includes("sidebar");
			});
			if (close) close.click();
		});
		await new Promise((r) => setTimeout(r, 400));
	}

	// I should see scrollable scenario chips in the mobile bar
	const visibleScenarioCount = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const scenarios = btns.filter((b) => {
			const text = b.textContent?.trim() ?? "";
			return ["Red Sea", "Luzon", "Baltic", "Tonga", "West Africa", "Egypt"].some((s) =>
				text.includes(s),
			);
		});
		return scenarios.length;
	});
	ctx.assert(visibleScenarioCount >= 3, `Expected >=3 scenario buttons visible, got ${visibleScenarioCount}`);

	// The bottom sheet should be present for showing impact details
	const sheetExists = await ctx.page.evaluate(() => {
		const el = document.querySelector('[style*="--sheet-h"]');
		return el !== null;
	});
	ctx.assert(sheetExists, "Bottom sheet should be present");

	await ctx.screenshot("mobile-interactions");
}

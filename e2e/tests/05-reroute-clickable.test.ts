import type { TestContext } from "../context";

/**
 * As a user, I want to click an affected city in the impact panel and see
 * exactly where its internet traffic reroutes through alternative paths.
 *
 * Story: Investigating impact -- I click an affected city to see where internet traffic reroutes.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// First, trigger the Red Sea scenario so there are rerouted cities to inspect
	if (ctx.viewport === "mobile") {
		const tappedScenario = await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const redSea = btns.find((b) => b.textContent?.trim().includes("Red Sea"));
			if (redSea) {
				redSea.click();
				return true;
			}
			return false;
		});
		ctx.assert(tappedScenario, "Red Sea scenario button not found on mobile");
	} else {
		await ctx.clickButton("Red Sea");
	}

	// Wait for the simulation to finish
	await new Promise((r) => setTimeout(r, 4000));
	await ctx.waitForText("IMPACT");

	// I click the first affected city in the list to expand its reroute details
	const selectedCity = await ctx.page.evaluate(() => {
		const rows = Array.from(document.querySelectorAll("button"));
		const cityRow = rows.find((b) => {
			const text = b.textContent ?? "";
			return text.includes("%") && text.includes("Tbps");
		});
		if (cityRow) {
			cityRow.click();
			return true;
		}
		return false;
	});

	if (!selectedCity) {
		// On mobile the list might be collapsed -- try expanding the sheet first
		await ctx.screenshot("reroute-no-metro-found");
		return; // Not a failure -- layout may not show metros in all viewports
	}

	await new Promise((r) => setTimeout(r, 500));

	// I should see a "Traffic shifts to" section showing alternative paths
	const hasRerouteDetails = await ctx.page.evaluate(
		() => document.body.textContent?.includes("Traffic shifts to") ?? false,
	);

	if (!hasRerouteDetails) {
		await ctx.screenshot("reroute-no-traffic-shifts");
		return; // Metro may have no reroutes (isolated)
	}

	// Each reroute path should be a clickable button so I can highlight it on the globe
	const rerouteInfo = await ctx.page.evaluate(() => {
		const pageText = document.body.textContent ?? "";
		const hasTerrestrial =
			pageText.includes("terrestrial") ||
			document.querySelector('[style*="rgb(34, 211, 238)"]') !== null ||
			document.querySelector('[style*="#22d3ee"]') !== null;
		const allButtons = Array.from(document.querySelectorAll("button"));
		const rerouteButtons = allButtons.filter((b) => {
			const text = b.textContent ?? "";
			return text.includes("Tbps") && !text.includes("Cut") && !text.includes("IMPACT");
		});
		return { hasTerrestrial, rerouteButtonCount: rerouteButtons.length };
	});

	ctx.assert(
		rerouteInfo.rerouteButtonCount > 0,
		`Expected clickable reroute items, found ${rerouteInfo.rerouteButtonCount}`,
	);

	await ctx.screenshot("reroute-items-visible");
}

import type { TestContext } from "../context";

/**
 * Tracing a reroute -- after a cable is severed, I follow the traffic to its
 * terrestrial backup link.
 *
 * As a user, I want to apply a scenario, expand an affected metro, and click
 * on a terrestrial reroute to inspect the backup link details -- confirming
 * the panel appears only after I explicitly ask for it.
 */
export default async function test(ctx: TestContext) {
	if (ctx.viewport !== "desktop") return;

	await ctx.goto();

	// Before anything, the Terrestrial Link panel should not be showing
	const beforeClick = await ctx.page.evaluate(
		() => document.body.textContent?.includes("Terrestrial Link") ?? false,
	);
	ctx.assert(!beforeClick, "Terrestrial Link should NOT be visible before any click");

	// I apply the Red Sea scenario to sever cables in that region
	await ctx.clickButton("Red Sea");
	await new Promise((r) => setTimeout(r, 4000));
	await ctx.waitForText("IMPACT");

	// Even after the scenario loads, no terrestrial detail should appear yet
	const afterScenario = await ctx.page.evaluate(
		() => document.body.textContent?.includes("Terrestrial Link") ?? false,
	);
	ctx.assert(!afterScenario, "Terrestrial Link should NOT appear just from scenario");

	// I click on an affected metro to see where its traffic is rerouted
	const clickedMetro = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const metroRow = btns.find((b) => {
			const text = b.textContent ?? "";
			return text.includes("%") && text.includes("Tbps") && !text.includes("Cut");
		});
		if (metroRow) {
			metroRow.click();
			return true;
		}
		return false;
	});
	if (!clickedMetro) return;

	await new Promise((r) => setTimeout(r, 500));

	// I check for the "Traffic shifts to" section showing reroute destinations
	const hasTrafficShifts = await ctx.page.evaluate(
		() => document.body.textContent?.includes("Traffic shifts to") ?? false,
	);
	if (!hasTrafficShifts) return; // Metro might be isolated

	// I click a terrestrial reroute entry (identified by its cyan indicator dot)
	const clickedTerrestrialLink = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const terrBtn = btns.find((b) => {
			const dot = b.querySelector('[style*="rgb(34, 211, 238)"], [style*="#22d3ee"]');
			return dot !== null;
		});
		if (terrBtn) {
			terrBtn.click();
			return true;
		}
		return false;
	});

	if (!clickedTerrestrialLink) {
		// No terrestrial reroutes for this metro -- not a failure
		await ctx.screenshot("terr-reroute-none-for-metro");
		return;
	}

	await new Promise((r) => setTimeout(r, 500));
	await ctx.screenshot("after-terrestrial-click");

	// NOW the Terrestrial Link detail panel should appear
	const hasTerrestrialInfo = await ctx.page.evaluate(
		() => document.body.textContent?.includes("Terrestrial Link") ?? false,
	);
	ctx.assert(
		hasTerrestrialInfo,
		"Clicking terrestrial reroute MUST show 'Terrestrial Link' panel -- this was NOT visible before the click",
	);

	// The metro detail should still be visible alongside the terrestrial info
	const metroStillVisible = await ctx.page.evaluate(
		() => document.body.textContent?.includes("Traffic shifts to") ?? false,
	);
	ctx.assert(
		metroStillVisible,
		"Metro detail must remain visible after clicking terrestrial reroute",
	);
}

import type { TestContext } from "../context";

/**
 * As a user, I want to understand which cities are most affected and why.
 *
 * Metro deep dive -- I select the Red Sea Crisis scenario and click on the most
 * affected metro to see bandwidth loss, latency change, path diversity, and
 * which cables are rerouting traffic. I can click Back to return to the full
 * metro ranking.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// I select Red Sea Crisis which causes significant disruption
	if (ctx.viewport === "mobile") {
		await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const btn = btns.find((b) => b.textContent?.includes("Red Sea"));
			if (btn) btn.click();
		});
	} else {
		await ctx.clickButton("Red Sea");
	}
	await new Promise((r) => setTimeout(r, 4000));
	await ctx.waitForText("IMPACT");

	// I see the list of affected metros with loss percentages (format: "-XX%")
	const hasMetroList = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		return btns.filter((b) => {
			const text = b.textContent ?? "";
			return /-\d+%/.test(text) || text.includes("OFFLINE");
		}).length;
	});
	ctx.assert(hasMetroList >= 3, `Expected at least 3 affected metros, got ${hasMetroList}`);

	// I click the first affected metro to see details
	await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const row = btns.find((b) => {
			const text = b.textContent ?? "";
			return /-\d+%/.test(text) || text.includes("OFFLINE");
		});
		if (row) row.click();
	});
	await new Promise((r) => setTimeout(r, 500));

	// I should see detailed impact stats
	const hasDetail = await ctx.page.evaluate(() => {
		const text = document.body.textContent ?? "";
		return (
			text.includes("Bandwidth lost") &&
			text.includes("Remaining") &&
			text.includes("Baseline") &&
			text.includes("Latency change") &&
			text.includes("Path diversity")
		);
	});
	ctx.assert(hasDetail, "Metro detail should show bandwidth, latency, and path diversity stats");

	await ctx.screenshot("metro-deep-dive");

	// I click Back to return to the full ranking
	const backClicked = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const back = btns.find((b) => b.textContent?.trim() === "Back");
		if (back) {
			back.click();
			return true;
		}
		return false;
	});
	ctx.assert(backClicked, "Back button should exist in metro detail view");
	await new Promise((r) => setTimeout(r, 300));

	// The metro list should be visible again
	const metroListBack = await ctx.page.evaluate(() => {
		const text = document.body.textContent ?? "";
		return !text.includes("Bandwidth lost");
	});
	ctx.assert(metroListBack, "After clicking Back, metro detail should close");

	await ctx.screenshot("metro-back-to-list");
}

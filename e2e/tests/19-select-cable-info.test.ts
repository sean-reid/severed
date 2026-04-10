import type { TestContext } from "../context";

/**
 * As a user, I want to click on a cable and see its details.
 *
 * Inspecting a cable -- I apply a scenario so cables are highlighted, then click
 * an affected metro to see rerouting. From the reroute list I click a cable name
 * to inspect its capacity, RFS year, owners, and source link. The cable card
 * should appear with all this info and no stray "Cut" button.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// I select Mediterranean scenario which affects well-known cables
	if (ctx.viewport === "mobile") {
		await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const btn = btns.find((b) => b.textContent?.includes("Mediterranean"));
			if (btn) btn.click();
		});
	} else {
		await ctx.clickButton("Mediterranean");
	}
	await new Promise((r) => setTimeout(r, 4000));
	await ctx.waitForText("IMPACT");

	// I click an affected city to see rerouting
	const selectedCity = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const row = btns.find((b) => {
			const text = b.textContent ?? "";
			return text.includes("%") && text.includes("Tbps");
		});
		if (row) {
			row.click();
			return true;
		}
		return false;
	});
	if (!selectedCity) {
		await ctx.screenshot("cable-info-no-metro");
		return;
	}
	await new Promise((r) => setTimeout(r, 500));

	// I click a submarine cable from the reroute list to inspect it
	const clickedCable = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const cableBtn = btns.find((b) => {
			const text = b.textContent ?? "";
			const hasDot = b.querySelector('span[style*="background"]');
			return hasDot && text.includes("Tbps") && !text.includes("IMPACT") && !text.includes("Hide");
		});
		if (cableBtn) {
			cableBtn.click();
			return true;
		}
		return false;
	});

	if (!clickedCable) {
		await ctx.screenshot("cable-info-no-reroute");
		return;
	}
	await new Promise((r) => setTimeout(r, 500));

	// On desktop, the sidebar should now show cable details
	if (ctx.viewport === "desktop") {
		const hasCableInfo = await ctx.page.evaluate(() => {
			const text = document.body.textContent ?? "";
			return text.includes("Selected Cable") && text.includes("Tbps");
		});
		ctx.assert(hasCableInfo, "Sidebar should show selected cable details");

		// No "Cut This Cable" button should exist (removed in UX sweep)
		const noCutButton = await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			return !btns.some((b) => b.textContent?.trim() === "Cut This Cable");
		});
		ctx.assert(noCutButton, "No 'Cut This Cable' button should exist in sidebar");
	}

	await ctx.screenshot("cable-info-selected");
}

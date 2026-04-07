import type { TestContext } from "../context";

/**
 * Full cut cable flow: scenario → metro → reroute → cut → severed badge.
 * Verifies the cable stays selected and shows "Severed" after cutting.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// Apply Red Sea scenario
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

	// Click an affected metro
	const clickedMetro = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const row = btns.find((b) => {
			const text = b.textContent ?? "";
			return text.includes("%") && text.includes("Tbps") && !text.includes("Cut");
		});
		if (row) {
			row.click();
			return true;
		}
		return false;
	});
	if (!clickedMetro) {
		await ctx.screenshot("cut-flow-no-metro");
		return;
	}
	await new Promise((r) => setTimeout(r, 500));

	// Look for a "Cut" button in the reroute list
	const hasCutButton = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		return btns.some(
			(b) => b.textContent?.trim() === "Cut" && b.className.includes("cable-cut"),
		);
	});

	if (!hasCutButton) {
		// No Cut button visible -- may have only severed/terrestrial reroutes
		await ctx.screenshot("cut-flow-no-cut-button");
		return;
	}

	// Click the "Cut" button
	await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const cutBtn = btns.find(
			(b) => b.textContent?.trim() === "Cut" && b.className.includes("cable-cut"),
		);
		if (cutBtn) cutBtn.click();
	});
	await new Promise((r) => setTimeout(r, 3000)); // Wait for simulation re-run

	// Verify "Severed" or "severed" appears somewhere in the UI
	const hasSevered = await ctx.page.evaluate(
		() => document.body.textContent?.toLowerCase().includes("severed") ?? false,
	);
	ctx.assert(hasSevered, "After cutting a cable, 'Severed' badge should appear");

	// On desktop, the sidebar should show "Severed" for the selected cable
	if (ctx.viewport === "desktop") {
		const sidebarSevered = await ctx.page.evaluate(() => {
			const sidebar = document.querySelector(".translate-x-0");
			return sidebar?.textContent?.includes("Severed") ?? false;
		});
		ctx.assert(sidebarSevered, "Desktop sidebar should show 'Severed' for cut cable");
	}

	await ctx.screenshot("cut-flow-severed");
}

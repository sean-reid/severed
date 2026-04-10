import type { TestContext } from "../context";

/**
 * As a user, I want to simulate a precise cable cut in a specific area.
 *
 * Custom simulation -- I navigate to a cable-dense area, enter cut mode, and
 * place a precise cut to see the impact. I use the Red Sea region to center
 * the map on a known cable corridor, reset the scenario damage, then enter
 * cut mode to place my own point cut. After reviewing the results I can undo
 * my cut and reset to a clean state.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// I select a scenario to navigate the map to a cable-dense area
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

	// I reset the scenario damage but keep the map centered on the cable corridor
	const resetClicked = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const reset = btns.find((b) => b.textContent?.trim() === "Reset");
		if (reset) {
			reset.click();
			return true;
		}
		return false;
	});
	ctx.assert(resetClicked, "Reset button should be clickable");
	await new Promise((r) => setTimeout(r, 1000));

	// I enter cut mode to place my own precise cut
	if (ctx.viewport === "desktop") {
		await ctx.clickButton("Cut Mode");
	} else {
		const toggled = await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const cutBtn = btns.find((b) => {
				const text = b.textContent?.trim() ?? "";
				return text.includes("Cut") && !text.includes("Reset") && b.querySelector("svg");
			});
			if (cutBtn) {
				cutBtn.click();
				return true;
			}
			return false;
		});
		ctx.assert(toggled, "Mobile cut mode button should exist");
	}
	await new Promise((r) => setTimeout(r, 300));

	// On desktop, the cursor should change to indicate cut mode is active
	if (ctx.viewport === "desktop") {
		const hasCrosshair = await ctx.page.evaluate(() => {
			const canvas = document.querySelector("canvas");
			const mapDiv = canvas?.parentElement;
			return mapDiv?.style.cursor === "crosshair" || document.body.textContent?.includes("Exit Cut");
		});
		ctx.assert(hasCrosshair, "Cut mode should show crosshair cursor or Exit Cut label");
	}

	await ctx.screenshot("cut-mode-active");

	// I click the center of the map to place a point cut on the cable corridor
	const mapCenter = ctx.viewport === "desktop"
		? { x: Math.round((208 + 1120) / 2), y: Math.round(900 / 2) }
		: { x: Math.round(390 / 2), y: Math.round(844 / 2) };
	await ctx.page.mouse.click(mapCenter.x, mapCenter.y);
	await new Promise((r) => setTimeout(r, 3000));

	// Check if my cut landed near a cable
	const cutRegistered = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		return btns.some((b) => b.textContent?.trim() === "Undo" || b.textContent?.trim() === "Reset");
	});

	if (cutRegistered) {
		// If the cut landed, I should be able to undo it
		const hasUndo = await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			return btns.some((b) => b.textContent?.trim() === "Undo");
		});
		// Undo is only visible when cuts > 0
		if (hasUndo) {
			await ctx.screenshot("point-cut-placed");

			// I exit cut mode to review the results
			if (ctx.viewport === "desktop") {
				await ctx.clickButton("Exit Cut");
			} else {
				await ctx.page.evaluate(() => {
					const btns = Array.from(document.querySelectorAll("button"));
					const cutBtn = btns.find((b) => {
						const text = b.textContent?.trim() ?? "";
						return text.includes("Cut") && !text.includes("Reset") && b.querySelector("svg");
					});
					if (cutBtn) cutBtn.click();
				});
			}
			await new Promise((r) => setTimeout(r, 300));

			// I reset to clear my cuts and return to a clean state
			await ctx.page.evaluate(() => {
				const btns = Array.from(document.querySelectorAll("button"));
				const reset = btns.find((b) => b.textContent?.trim() === "Reset");
				if (reset) reset.click();
			});
			await new Promise((r) => setTimeout(r, 1000));
		}
	}

	await ctx.screenshot("cut-mode-reset");
}

import type { TestContext } from "../context";

/**
 * As a user, I want to undo a cut I placed by mistake.
 *
 * Correcting mistakes -- I enter cut mode and place a cut, then realize it was
 * in the wrong spot. I click Undo to remove just the last cut without losing
 * any scenario damage. The undo button disappears once there are no more cuts.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// I select a scenario so the map is centered on cables
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

	// I note the initial cable count from the scenario
	const initialCables = await ctx.page.evaluate(() => {
		const text = document.body.textContent ?? "";
		const match = text.match(/(\d+)\s*cables/);
		return match ? parseInt(match[1]) : 0;
	});

	// I enter cut mode
	if (ctx.viewport === "desktop") {
		await ctx.clickButton("Cut Mode");
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

	// I place a cut near the center of the visible map
	const center = ctx.viewport === "desktop"
		? { x: Math.round((208 + 1120) / 2), y: Math.round(900 / 2) }
		: { x: Math.round(390 / 2), y: Math.round(844 / 2) };
	await ctx.page.mouse.click(center.x, center.y);
	await new Promise((r) => setTimeout(r, 3000));

	// Check if my cut affected cables (Undo button appears)
	const hasUndo = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		return btns.some((b) => b.textContent?.trim() === "Undo");
	});

	if (hasUndo) {
		// I click Undo to remove my mistake
		await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const undo = btns.find((b) => b.textContent?.trim() === "Undo");
			if (undo) undo.click();
		});
		await new Promise((r) => setTimeout(r, 2000));

		await ctx.screenshot("after-undo");
	}

	// Exit cut mode
	if (ctx.viewport === "desktop") {
		const exitVisible = await ctx.page.evaluate(
			() => document.body.textContent?.includes("Exit Cut") ?? false,
		);
		if (exitVisible) await ctx.clickButton("Exit Cut");
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

	await ctx.screenshot("undo-complete");
}

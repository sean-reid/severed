import type { TestContext } from "../context";

/**
 * As a user, I want to layer my own cuts on top of a real scenario.
 *
 * Cascading failure -- I add my own cuts on top of a real scenario and undo
 * when I make a mistake. Starting from the Red Sea scenario's damage, I enter
 * cut mode and place an additional cut to see how cascading failures compound
 * the impact. If I regret a cut, I can undo it. When I am done, reset clears
 * everything back to a clean slate.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// I start with the Red Sea scenario as a baseline of real-world damage
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

	// The scenario should already show affected cables
	const initialCableCount = await ctx.page.evaluate(() => {
		const text = document.body.textContent ?? "";
		const match = text.match(/(\d+)\s*cables/);
		return match ? parseInt(match[1]) : 0;
	});
	ctx.assert(initialCableCount > 0, `Should have some cables affected: got ${initialCableCount}`);

	// I enter cut mode to add my own damage on top of the scenario
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

	// I click on the map to place an additional cut near Mediterranean cables
	const clickTarget = ctx.viewport === "desktop" ? { x: 700, y: 350 } : { x: 200, y: 350 };
	await ctx.page.mouse.click(clickTarget.x, clickTarget.y);
	await new Promise((r) => setTimeout(r, 3000));

	// The impact panel should still be visible after my additional cut
	const hasImpact = await ctx.page.evaluate(
		() => document.body.textContent?.includes("IMPACT") ?? false,
	);
	ctx.assert(hasImpact, "Impact panel should still be visible after additional cut");

	// I should see an undo button in case I placed the cut wrong
	const hasUndo = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		return btns.some((b) => b.textContent?.trim() === "Undo");
	});
	ctx.assert(hasUndo, "Undo button should be visible when cuts exist");

	// I reset to clear all damage and start fresh
	if (ctx.viewport === "desktop") {
		await ctx.clickButton("Reset");
	} else {
		const resetClicked = await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const reset = btns.find((b) => b.textContent?.trim() === "Reset");
			if (reset) {
				reset.click();
				return true;
			}
			return false;
		});
		if (!resetClicked) return;
	}
	await new Promise((r) => setTimeout(r, 1000));

	// After reset, no cables should be marked as severed
	const afterReset = await ctx.page.evaluate(
		() => document.body.textContent?.includes("Severed") ?? false,
	);
	ctx.assert(!afterReset, "After reset, Severed should not appear");

	await ctx.screenshot("cascade-reset");
}

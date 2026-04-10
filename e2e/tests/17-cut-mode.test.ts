import type { TestContext } from "../context";

/**
 * Test cut mode: toggle, place point cuts, remove cuts.
 * Runs on both desktop and mobile viewports.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// ── Toggle cut mode ──
	if (ctx.viewport === "desktop") {
		// Click "Cut Mode" button
		await ctx.clickButton("Cut Mode");
	} else {
		// Click "Cut" chip in mobile scenario bar
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

	// Verify cut mode is active (cursor should be crosshair on desktop)
	if (ctx.viewport === "desktop") {
		const hasCrosshair = await ctx.page.evaluate(() => {
			const canvas = document.querySelector("canvas");
			const mapDiv = canvas?.parentElement;
			return mapDiv?.style.cursor === "crosshair" || document.body.textContent?.includes("Exit Cut");
		});
		ctx.assert(hasCrosshair, "Cut mode should show crosshair cursor or Exit Cut label");
	}

	await ctx.screenshot("cut-mode-active");

	// ── Place a point cut by clicking empty ocean ──
	// Click somewhere in the middle of the viewport (empty ocean)
	const vp = ctx.viewport === "desktop" ? { x: 700, y: 450 } : { x: 200, y: 400 };
	await ctx.page.mouse.click(vp.x, vp.y);
	await new Promise((r) => setTimeout(r, 3000)); // Wait for simulation

	// Should now have impact data
	const hasImpact = await ctx.page.evaluate(
		() => document.body.textContent?.includes("IMPACT") ?? false,
	);
	ctx.assert(hasImpact, "After placing a point cut, impact panel should be visible");

	await ctx.screenshot("point-cut-placed");

	// ── Exit cut mode ──
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

	// ── Reset clears cuts ──
	const resetClicked = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const reset = btns.find((b) => b.textContent?.trim() === "Reset");
		if (reset) {
			reset.click();
			return true;
		}
		return false;
	});
	if (resetClicked) {
		await new Promise((r) => setTimeout(r, 1000));
		const afterReset = await ctx.page.evaluate(
			() =>
				document.body.textContent?.includes("Select a scenario") ||
				document.body.textContent?.includes("simulate a failure"),
		);
		ctx.assert(afterReset, "After reset, empty state should show");
	}

	await ctx.screenshot("cut-mode-reset");
}

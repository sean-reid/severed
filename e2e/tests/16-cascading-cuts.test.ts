import type { TestContext } from "../context";

/**
 * Cascading cuts: apply scenario, cut additional cables, verify impact increases.
 * Tests the full interaction loop of exploring and cascading failures.
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

	// Get initial impact numbers
	const initialAffected = await ctx.page.evaluate(() => {
		const text = document.body.textContent ?? "";
		const match = text.match(/(\d+)\s*affected/);
		return match ? parseInt(match[1]) : 0;
	});

	// Click a metro to see rerouting
	await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const row = btns.find((b) => {
			const text = b.textContent ?? "";
			return text.includes("%") && text.includes("Tbps") && !text.includes("Cut");
		});
		if (row) row.click();
	});
	await new Promise((r) => setTimeout(r, 500));

	// Try to cut a reroute cable (cascading failure)
	const cutSuccess = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const cutBtn = btns.find(
			(b) => b.textContent?.trim() === "Cut" && b.className.includes("cable-cut"),
		);
		if (cutBtn) {
			cutBtn.click();
			return true;
		}
		return false;
	});

	if (!cutSuccess) {
		await ctx.screenshot("cascade-no-cut-available");
		return;
	}

	// Wait for simulation re-run
	await new Promise((r) => setTimeout(r, 4000));

	// Impact should have increased or at least stayed the same
	const afterAffected = await ctx.page.evaluate(() => {
		const text = document.body.textContent ?? "";
		const match = text.match(/(\d+)\s*affected/);
		return match ? parseInt(match[1]) : 0;
	});

	ctx.assert(
		afterAffected >= initialAffected,
		`Cascading cut should not decrease impact: was ${initialAffected}, now ${afterAffected}`,
	);

	// "Severed" section should appear in the metro detail
	const hasSeveredSection = await ctx.page.evaluate(
		() => document.body.textContent?.includes("Severed") ?? false,
	);
	ctx.assert(hasSeveredSection, "Severed section should appear after cascading cut");

	// Reset should clear everything
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

	// After reset, no "Severed" should show
	const afterReset = await ctx.page.evaluate(
		() => document.body.textContent?.includes("Severed") ?? false,
	);
	ctx.assert(!afterReset, "After reset, Severed should not appear");

	await ctx.screenshot("cascade-reset");
}

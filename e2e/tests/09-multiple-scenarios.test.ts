import type { TestContext } from "../context";

/**
 * Verify switching between multiple scenarios works correctly
 * and each produces different impact results.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	const applyScenario = async (name: string): Promise<string> => {
		if (ctx.viewport === "mobile") {
			await ctx.page.evaluate((n: string) => {
				const btns = Array.from(document.querySelectorAll("button"));
				const btn = btns.find((b) => b.textContent?.trim().includes(n));
				if (btn) btn.click();
			}, name);
		} else {
			await ctx.clickButton(name);
		}
		await new Promise((r) => setTimeout(r, 3000));
		return ctx.bodyText();
	};

	// Apply Red Sea scenario
	const redSeaBody = await applyScenario("Red Sea");
	ctx.assert(redSeaBody.includes("IMPACT"), "Red Sea should show impact");

	// Extract a metric to compare
	const redSeaCables = await ctx.page.evaluate(() => {
		const text = document.body.textContent ?? "";
		const match = text.match(/(\d+)\s*cables/);
		return match ? Number.parseInt(match[1]) : 0;
	});

	// Switch to Luzon Strait
	const luzonBody = await applyScenario("Luzon");
	ctx.assert(luzonBody.includes("IMPACT"), "Luzon should show impact");

	const luzonCables = await ctx.page.evaluate(() => {
		const text = document.body.textContent ?? "";
		const match = text.match(/(\d+)\s*cables/);
		return match ? Number.parseInt(match[1]) : 0;
	});

	// Different scenarios should affect different numbers of cables
	ctx.assert(
		redSeaCables > 0 && luzonCables > 0,
		`Both scenarios should affect cables: Red Sea=${redSeaCables}, Luzon=${luzonCables}`,
	);

	await ctx.screenshot("multiple-scenarios");
}

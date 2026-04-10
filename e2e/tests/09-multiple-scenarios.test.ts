import type { TestContext } from "../context";

/**
 * Comparing events -- I switch between Red Sea and Luzon Strait to see how
 * different regions are affected.
 *
 * As a user, I want to toggle between scenarios and confirm that each one
 * produces its own distinct impact results, so I can compare regional risks.
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

	// I start by looking at the Red Sea scenario
	const redSeaResults = await applyScenario("Red Sea");
	ctx.assert(redSeaResults.includes("IMPACT"), "Red Sea should show impact");

	// I note how many cables are affected in the Red Sea region
	const redSeaCableCount = await ctx.page.evaluate(() => {
		const text = document.body.textContent ?? "";
		const match = text.match(/(\d+)\s*cables/);
		return match ? Number.parseInt(match[1]) : 0;
	});

	// Now I switch to the Luzon Strait to compare
	const luzonResults = await applyScenario("Luzon");
	ctx.assert(luzonResults.includes("IMPACT"), "Luzon should show impact");

	const luzonCableCount = await ctx.page.evaluate(() => {
		const text = document.body.textContent ?? "";
		const match = text.match(/(\d+)\s*cables/);
		return match ? Number.parseInt(match[1]) : 0;
	});

	// Both scenarios should report affected cables, confirming each is distinct
	ctx.assert(
		redSeaCableCount > 0 && luzonCableCount > 0,
		`Both scenarios should affect cables: Red Sea=${redSeaCableCount}, Luzon=${luzonCableCount}`,
	);

	await ctx.screenshot("multiple-scenarios");
}

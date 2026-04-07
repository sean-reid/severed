import type { TestContext } from "../context";

/**
 * Verify scenario source links are visible when a real-event scenario is selected.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// Select "Red Sea Crisis" scenario (has source URLs)
	if (ctx.viewport === "mobile") {
		await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const btn = btns.find((b) => b.textContent?.includes("Red Sea"));
			if (btn) btn.click();
		});
	} else {
		await ctx.clickButton("Red Sea");
	}

	await new Promise((r) => setTimeout(r, 3000));

	// Should show scenario description
	const body = await ctx.bodyText();
	ctx.assert(
		body.includes("cables") || body.includes("cut") || body.includes("Houthi"),
		"Active scenario should show description text",
	);

	// Should show source links with domain names
	const hasSourceLink = await ctx.page.evaluate(() => {
		const links = Array.from(document.querySelectorAll('a[target="_blank"]'));
		return links.some(
			(a) =>
				a.textContent?.includes("aljazeera") ||
				a.textContent?.includes("cloudflare") ||
				a.textContent?.includes("wikipedia"),
		);
	});
	ctx.assert(hasSourceLink, "Active scenario should show source links with domain names");

	await ctx.screenshot("scenario-sources");
}

import type { TestContext } from "../context";

/**
 * As a user, I want to fact-check the app's scenarios.
 *
 * Fact-checking -- I want to verify the Red Sea scenario links to real news
 * reporting. When I select the Red Sea Crisis, I expect to see a description
 * mentioning the event and clickable source links to outlets like Al Jazeera,
 * Cloudflare, or Wikipedia so I can read the original reporting myself.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// I open the Red Sea Crisis scenario to check its sources
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

	// The scenario description should mention the event context
	const body = await ctx.bodyText();
	ctx.assert(
		body.includes("cables") || body.includes("cut") || body.includes("Houthi"),
		"Active scenario should show description text",
	);

	// I should see links to real news sources so I can verify the claims
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

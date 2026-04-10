import type { TestContext } from "../context";

/**
 * As a user, I want to open the Sources panel and review the methodology,
 * data provenance, and confidence levels so I understand where the data comes from.
 *
 * Story: Checking methodology -- I open the Sources panel to understand where the data comes from.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// I click "Sources" to learn about the data behind the simulator
	await ctx.clickButton("About");
	await new Promise((r) => setTimeout(r, 500));

	// The panel opens and shows "ABOUT" as its heading
	await ctx.waitForText("ABOUT");
	const pageText = await ctx.bodyText();

	// I can see the capacity heuristic table used for estimation
	ctx.assert(pageText.includes("Before 2005"), "Heuristic table missing 'Before 2005' row");
	ctx.assert(
		pageText.includes("280 Tbps") || pageText.includes("280"),
		"Heuristic table missing 2022+ value",
	);

	// Confidence levels are explained so I know what "verified" vs "estimated" means
	ctx.assert(pageText.includes("verified"), "Missing verified confidence description");
	ctx.assert(pageText.includes("estimated"), "Missing estimated confidence description");
	ctx.assert(pageText.includes("approximated"), "Missing approximated confidence description");

	// TeleGeography is credited as the primary cable data source
	ctx.assert(pageText.includes("TeleGeography"), "Missing TeleGeography attribution");

	// There is a hint telling me I can click terrestrial edges for their sources
	ctx.assert(
		pageText.includes("Click any") || pageText.includes("click any"),
		"Missing instruction to click for sources",
	);

	// The project GitHub link is available for full transparency
	ctx.assert(pageText.includes("GitHub"), "Missing GitHub link");

	// I close the panel when I am done reading
	await ctx.clickButton("CLOSE");
	await new Promise((r) => setTimeout(r, 300));

	// The panel should disappear cleanly
	const stillOpen = await ctx.page.evaluate(
		() => document.body.textContent?.includes("ABOUT") ?? false,
	);
	ctx.assert(!stillOpen, "Sources panel should close after clicking CLOSE");

	await ctx.screenshot("sources-panel");
}

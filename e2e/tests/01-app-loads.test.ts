import type { TestContext } from "../context";

/**
 * As a user, I want to open the simulator and immediately see the globe
 * with submarine cables rendered -- no errors, no blank screen.
 *
 * Story: First visit -- I open the simulator and see the globe with submarine cables.
 */
export default async function test(ctx: TestContext) {
	const consoleErrors: string[] = [];
	ctx.page.on("pageerror", (err) => consoleErrors.push(err.message));

	await ctx.goto();
	await ctx.screenshot("app-loaded");

	// The page headline tells me I am in the right place
	const headline = await ctx.page.$eval("h1", (el) => el.textContent?.trim() ?? "");
	ctx.assert(headline.includes("SEVERED"), `Expected title "SEVERED", got "${headline}"`);

	// A subtitle confirms this is the cable failure simulator
	const pageText = await ctx.bodyText();
	ctx.assert(pageText.includes("Submarine Cable Failure Simulator"), "Subtitle missing");

	// Nothing broke while loading the page
	ctx.assert(consoleErrors.length === 0, `Console errors: ${consoleErrors.join("; ")}`);
}

import type { TestContext } from "../context";

/**
 * Verify the app loads, renders the main UI, and has no console errors.
 */
export default async function test(ctx: TestContext) {
  const errors: string[] = [];
  ctx.page.on("pageerror", (err) => errors.push(err.message));

  await ctx.goto();
  await ctx.screenshot("app-loaded");

  // Title should be present
  const title = await ctx.page.$eval("h1", (el) => el.textContent?.trim() ?? "");
  ctx.assert(title.includes("SEVERED"), `Expected title "SEVERED", got "${title}"`);

  // Subtitle should be present
  const body = await ctx.bodyText();
  ctx.assert(body.includes("Submarine Cable Failure Simulator"), "Subtitle missing");

  // No JS errors
  ctx.assert(errors.length === 0, `Console errors: ${errors.join("; ")}`);
}

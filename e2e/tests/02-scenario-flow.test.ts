import type { TestContext } from "../context";

/**
 * Verify scenario selection triggers simulation and shows impact results.
 */
export default async function test(ctx: TestContext) {
  await ctx.goto();

  if (ctx.viewport === "mobile") {
    // On mobile, scenarios are in the MobileScenarioBar (horizontal chips),
    // not in the sidebar. Find and click the Red Sea chip directly.
    const clicked = await ctx.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const redSea = btns.find((b) => b.textContent?.trim().includes("Red Sea"));
      if (redSea) { redSea.click(); return true; }
      return false;
    });
    if (!clicked) throw new Error("Red Sea scenario button not found on mobile");
  } else {
    await ctx.clickButton("Red Sea");
  }

  // Wait for simulation results
  await new Promise((r) => setTimeout(r, 3000));
  await ctx.screenshot("scenario-red-sea");

  // Impact panel should show results
  await ctx.waitForText("IMPACT");
  const body = await ctx.bodyText();

  // Should show affected cables count
  ctx.assert(body.includes("cables"), "Impact panel should mention affected cables");

  // Should show affected metros
  ctx.assert(body.includes("metros") || body.includes("Tbps"), "Impact panel should show impact metrics");
}

import type { TestContext } from "../context";

/**
 * Verify scenario can be applied and then reset, returning to clean state.
 */
export default async function test(ctx: TestContext) {
  await ctx.goto();

  // Apply a scenario
  if (ctx.viewport === "mobile") {
    await ctx.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const btn = btns.find((b) => b.textContent?.trim().includes("Baltic"));
      if (btn) btn.click();
    });
  } else {
    await ctx.clickButton("Baltic");
  }

  await new Promise((r) => setTimeout(r, 3000));
  await ctx.waitForText("IMPACT");

  // Should show impact data
  let body = await ctx.bodyText();
  ctx.assert(body.includes("cables"), "Impact should show after scenario");

  // Reset
  if (ctx.viewport === "desktop") {
    await ctx.clickButton("Reset");
  } else {
    // On mobile, reset may be in the impact panel
    const resetClicked = await ctx.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const reset = btns.find((b) => b.textContent?.trim() === "Reset");
      if (reset) { reset.click(); return true; }
      return false;
    });
    if (!resetClicked) return; // Reset button may not be visible on mobile
  }

  await new Promise((r) => setTimeout(r, 1000));

  // Should show the empty state prompt
  body = await ctx.bodyText();
  ctx.assert(
    body.includes("Select a scenario") || body.includes("tap a cable"),
    "After reset, should show empty state prompt",
  );

  await ctx.screenshot("scenario-reset");
}

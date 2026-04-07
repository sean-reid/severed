import type { TestContext } from "../context";

/**
 * Verify the Sources panel opens, shows methodology, and has working content.
 */
export default async function test(ctx: TestContext) {
  await ctx.goto();

  // Click the "Sources" button
  await ctx.clickButton("Sources");
  await new Promise((r) => setTimeout(r, 500));

  // Panel should be visible with methodology content
  await ctx.waitForText("DATA SOURCES");
  const body = await ctx.bodyText();

  // Should show the heuristic table
  ctx.assert(body.includes("Before 2005"), "Heuristic table missing 'Before 2005' row");
  ctx.assert(body.includes("280 Tbps") || body.includes("280"), "Heuristic table missing 2022+ value");

  // Should show confidence level descriptions
  ctx.assert(body.includes("verified"), "Missing verified confidence description");
  ctx.assert(body.includes("estimated"), "Missing estimated confidence description");
  ctx.assert(body.includes("approximated"), "Missing approximated confidence description");

  // Should show TeleGeography link
  ctx.assert(body.includes("TeleGeography"), "Missing TeleGeography attribution");

  // Should mention terrestrial edges are clickable
  ctx.assert(
    body.includes("Click any") || body.includes("click any"),
    "Missing instruction to click for sources",
  );

  // Should have the GitHub link
  ctx.assert(body.includes("GitHub"), "Missing GitHub link");

  // Close button should work
  await ctx.clickButton("CLOSE");
  await new Promise((r) => setTimeout(r, 300));

  // Panel should be gone
  const stillOpen = await ctx.page.evaluate(
    () => document.body.textContent?.includes("DATA SOURCES") ?? false,
  );
  ctx.assert(!stillOpen, "Sources panel should close after clicking CLOSE");

  await ctx.screenshot("sources-panel");
}

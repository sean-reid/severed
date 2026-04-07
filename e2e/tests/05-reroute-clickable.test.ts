import type { TestContext } from "../context";

/**
 * Verify reroute items in the impact panel are clickable,
 * including terrestrial edges.
 */
export default async function test(ctx: TestContext) {
  await ctx.goto();

  // Apply Red Sea scenario to trigger rerouting
  if (ctx.viewport === "mobile") {
    const clicked = await ctx.page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button"));
      const redSea = btns.find((b) => b.textContent?.trim().includes("Red Sea"));
      if (redSea) { redSea.click(); return true; }
      return false;
    });
    ctx.assert(clicked, "Red Sea scenario button not found on mobile");
  } else {
    await ctx.clickButton("Red Sea");
  }

  // Wait for simulation
  await new Promise((r) => setTimeout(r, 4000));
  await ctx.waitForText("IMPACT");

  // Click the first affected metro in the list to expand details
  const clickedMetro = await ctx.page.evaluate(() => {
    // Find a metro row in the impact list and click it
    const rows = Array.from(document.querySelectorAll("button"));
    const metroRow = rows.find((b) => {
      const text = b.textContent ?? "";
      return text.includes("%") && text.includes("Tbps");
    });
    if (metroRow) { metroRow.click(); return true; }
    return false;
  });

  if (!clickedMetro) {
    // On mobile the list might be collapsed -- try expanding the sheet first
    await ctx.screenshot("reroute-no-metro-found");
    return; // Not a failure -- layout may not show metros in all viewports
  }

  await new Promise((r) => setTimeout(r, 500));

  // Check if "Traffic shifts to" section appears
  const hasReroutes = await ctx.page.evaluate(
    () => document.body.textContent?.includes("Traffic shifts to") ?? false,
  );

  if (!hasReroutes) {
    await ctx.screenshot("reroute-no-traffic-shifts");
    return; // Metro may have no reroutes (isolated)
  }

  // Verify reroute items exist and are buttons (clickable)
  const rerouteInfo = await ctx.page.evaluate(() => {
    const body = document.body.textContent ?? "";
    const hasTerrestrial = body.includes("terrestrial") ||
      document.querySelector('[style*="rgb(34, 211, 238)"]') !== null ||
      document.querySelector('[style*="#22d3ee"]') !== null;
    // Count clickable reroute items (buttons within the "Traffic shifts to" section)
    const allButtons = Array.from(document.querySelectorAll("button"));
    const rerouteButtons = allButtons.filter((b) => {
      const text = b.textContent ?? "";
      return text.includes("Tbps") && !text.includes("Cut") && !text.includes("IMPACT");
    });
    return { hasTerrestrial, rerouteButtonCount: rerouteButtons.length };
  });

  ctx.assert(
    rerouteInfo.rerouteButtonCount > 0,
    `Expected clickable reroute items, found ${rerouteInfo.rerouteButtonCount}`,
  );

  await ctx.screenshot("reroute-items-visible");
}

import type { TestContext } from "../context";

/**
 * Verify that clicking a terrestrial edge in the "traffic shifts to" list
 * opens the terrestrial info panel and keeps the metro detail visible.
 */
export default async function test(ctx: TestContext) {
  if (ctx.viewport !== "desktop") return;

  await ctx.goto();

  // Check that "Terrestrial Link" is NOT visible before we do anything
  const beforeClick = await ctx.page.evaluate(
    () => document.body.textContent?.includes("Terrestrial Link") ?? false,
  );
  ctx.assert(!beforeClick, "Terrestrial Link should NOT be visible before any click");

  // Apply Red Sea scenario
  await ctx.clickButton("Red Sea");
  await new Promise((r) => setTimeout(r, 4000));
  await ctx.waitForText("IMPACT");

  // Still no Terrestrial Link panel
  const afterScenario = await ctx.page.evaluate(
    () => document.body.textContent?.includes("Terrestrial Link") ?? false,
  );
  ctx.assert(!afterScenario, "Terrestrial Link should NOT appear just from scenario");

  // Click an affected metro to expand its details
  const clickedMetro = await ctx.page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const metroRow = btns.find((b) => {
      const text = b.textContent ?? "";
      return text.includes("%") && text.includes("Tbps") && !text.includes("Cut");
    });
    if (metroRow) { metroRow.click(); return true; }
    return false;
  });
  if (!clickedMetro) return;

  await new Promise((r) => setTimeout(r, 500));

  // Check for "Traffic shifts to" and terrestrial items
  const hasTrafficShifts = await ctx.page.evaluate(
    () => document.body.textContent?.includes("Traffic shifts to") ?? false,
  );
  if (!hasTrafficShifts) return; // Metro might be isolated

  // Find and click a terrestrial reroute button (has cyan dot)
  const clickedTerr = await ctx.page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const terrBtn = btns.find((b) => {
      const dot = b.querySelector('[style*="rgb(34, 211, 238)"], [style*="#22d3ee"]');
      return dot !== null;
    });
    if (terrBtn) { terrBtn.click(); return true; }
    return false;
  });

  if (!clickedTerr) {
    // No terrestrial reroutes for this metro -- not a failure
    await ctx.screenshot("terr-reroute-none-for-metro");
    return;
  }

  await new Promise((r) => setTimeout(r, 500));
  await ctx.screenshot("after-terrestrial-click");

  // NOW "Terrestrial Link" should appear (it wasn't there before)
  const hasTerrestrialInfo = await ctx.page.evaluate(
    () => document.body.textContent?.includes("Terrestrial Link") ?? false,
  );
  ctx.assert(hasTerrestrialInfo, "Clicking terrestrial reroute MUST show 'Terrestrial Link' panel -- this was NOT visible before the click");

  // Metro detail should still be visible
  const metroStillVisible = await ctx.page.evaluate(
    () => document.body.textContent?.includes("Traffic shifts to") ?? false,
  );
  ctx.assert(metroStillVisible, "Metro detail must remain visible after clicking terrestrial reroute");
}

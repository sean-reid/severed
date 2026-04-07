import type { TestContext } from "../context";

/**
 * Comprehensive search feature tests.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// ── Open search ──
	if (ctx.viewport === "desktop") {
		// Desktop: click search icon in sidebar header
		const opened = await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const searchBtn = btns.find((b) => b.querySelector("title")?.textContent === "Search");
			if (searchBtn) {
				searchBtn.click();
				return true;
			}
			return false;
		});
		ctx.assert(opened, "Search button should exist in sidebar");
	} else {
		// Mobile: click search icon (in MobileScenarioBar)
		const opened = await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const searchBtn = btns.find((b) => b.querySelector("title")?.textContent === "Search");
			if (searchBtn) {
				searchBtn.click();
				return true;
			}
			return false;
		});
		ctx.assert(opened, "Mobile search button should exist");
	}

	await new Promise((r) => setTimeout(r, 300));

	// ── Search overlay should be visible ──
	const hasInput = await ctx.page.evaluate(() => {
		const input = document.querySelector('input[placeholder*="Search"]');
		return input !== null;
	});
	ctx.assert(hasInput, "Search input should be visible");

	// ── Type a cable name ──
	await ctx.page.type('input[placeholder*="Search"]', "MAREA");
	await new Promise((r) => setTimeout(r, 300));

	// Should show results
	const mareaResult = await ctx.page.evaluate(() => {
		return document.body.textContent?.includes("MAREA") ?? false;
	});
	ctx.assert(mareaResult, "Should find MAREA cable in results");

	// Should show the Cable type label
	const hasCableLabel = await ctx.page.evaluate(() => {
		return document.body.textContent?.includes("Cable") ?? false;
	});
	ctx.assert(hasCableLabel, "Results should show Cable type label");

	await ctx.screenshot("search-cable-results");

	// ── Clear and search for a metro ──
	await ctx.page.evaluate(() => {
		const input = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
		if (input) {
			input.value = "";
			input.dispatchEvent(new Event("input", { bubbles: true }));
		}
	});
	// Use the clear button
	const cleared = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const clearBtn = btns.find((b) => b.querySelector("title")?.textContent === "Clear");
		if (clearBtn) {
			clearBtn.click();
			return true;
		}
		return false;
	});

	await ctx.page.type('input[placeholder*="Search"]', "Singapore");
	await new Promise((r) => setTimeout(r, 300));

	const sgResult = await ctx.page.evaluate(() => {
		return document.body.textContent?.includes("Metro") ?? false;
	});
	ctx.assert(sgResult, "Should find Singapore metro in results");

	await ctx.screenshot("search-metro-results");

	// ── Click a result to select ──
	const clickedResult = await ctx.page.evaluate(() => {
		const btns = Array.from(document.querySelectorAll("button"));
		const result = btns.find((b) => b.textContent?.includes("Singapore") && b.textContent?.includes("Metro"));
		if (result) {
			result.click();
			return true;
		}
		return false;
	});
	ctx.assert(clickedResult, "Should be able to click a search result");

	await new Promise((r) => setTimeout(r, 500));

	// Search overlay should be closed
	const searchClosed = await ctx.page.evaluate(() => {
		const input = document.querySelector('input[placeholder*="Search"]');
		return input === null;
	});
	ctx.assert(searchClosed, "Search overlay should close after selecting a result");

	// ── Empty query shows hint ──
	// Reopen search
	if (ctx.viewport === "desktop") {
		await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const searchBtn = btns.find((b) => b.querySelector("title")?.textContent === "Search");
			if (searchBtn) searchBtn.click();
		});
	} else {
		await ctx.page.evaluate(() => {
			const btns = Array.from(document.querySelectorAll("button"));
			const searchBtn = btns.find((b) => b.querySelector("title")?.textContent === "Search");
			if (searchBtn) searchBtn.click();
		});
	}
	await new Promise((r) => setTimeout(r, 300));

	const hasHint = await ctx.page.evaluate(() => {
		return document.body.textContent?.includes("Type at least 2 characters") ?? false;
	});
	ctx.assert(hasHint, "Empty search should show hint text");

	// ── No results message ──
	await ctx.page.type('input[placeholder*="Search"]', "zzzzznonexistent");
	await new Promise((r) => setTimeout(r, 300));

	const hasNoResults = await ctx.page.evaluate(() => {
		return document.body.textContent?.includes("No results") ?? false;
	});
	ctx.assert(hasNoResults, "Non-matching query should show 'No results'");

	// ── Close via backdrop ──
	const closedViaBackdrop = await ctx.page.evaluate(() => {
		// Click the backdrop (the full-screen button behind the search)
		const backdrop = document.querySelector(".fixed.inset-0.z-50 > button.absolute.inset-0");
		if (backdrop instanceof HTMLElement) {
			backdrop.click();
			return true;
		}
		return false;
	});
	ctx.assert(closedViaBackdrop, "Should be able to close search via backdrop click");

	await new Promise((r) => setTimeout(r, 300));

	const searchGone = await ctx.page.evaluate(() => {
		return document.querySelector('input[placeholder*="Search"]') === null;
	});
	ctx.assert(searchGone, "Search should be fully closed after backdrop click");

	await ctx.screenshot("search-closed");
}

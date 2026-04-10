import type { TestContext } from "../context";

/**
 * Finding infrastructure -- I search for a specific cable and city to inspect
 * their details.
 *
 * As a user, I want to open the search overlay, find cables and metros by name,
 * select a result to navigate to it, and dismiss the overlay when I am done.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// I open the search overlay
	if (ctx.viewport === "desktop") {
		// Desktop: click the search icon in the sidebar header
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
		// Mobile: click the search icon in the scenario bar
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

	// The search input field should now be visible
	const hasInput = await ctx.page.evaluate(() => {
		const input = document.querySelector('input[placeholder*="Search"]');
		return input !== null;
	});
	ctx.assert(hasInput, "Search input should be visible");

	// I type a cable name to find it
	await ctx.page.type('input[placeholder*="Search"]', "MAREA");
	await new Promise((r) => setTimeout(r, 300));

	// The MAREA cable should appear in the results
	const mareaFound = await ctx.page.evaluate(() => {
		return document.body.textContent?.includes("MAREA") ?? false;
	});
	ctx.assert(mareaFound, "Should find MAREA cable in results");

	// The result should be labeled as a Cable
	const hasCableLabel = await ctx.page.evaluate(() => {
		return document.body.textContent?.includes("Cable") ?? false;
	});
	ctx.assert(hasCableLabel, "Results should show Cable type label");

	await ctx.screenshot("search-cable-results");

	// I clear the search to look for a metro instead
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

	// I search for Singapore to find the metro node
	await ctx.page.type('input[placeholder*="Search"]', "Singapore");
	await new Promise((r) => setTimeout(r, 300));

	const singaporeFound = await ctx.page.evaluate(() => {
		return document.body.textContent?.includes("Metro") ?? false;
	});
	ctx.assert(singaporeFound, "Should find Singapore metro in results");

	await ctx.screenshot("search-metro-results");

	// I click the Singapore result to navigate to it on the map
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

	// The search overlay should close after I select a result
	const searchClosed = await ctx.page.evaluate(() => {
		const input = document.querySelector('input[placeholder*="Search"]');
		return input === null;
	});
	ctx.assert(searchClosed, "Search overlay should close after selecting a result");

	// I reopen search to test the empty and no-results states
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

	// An empty search should show a helpful hint
	const hasHint = await ctx.page.evaluate(() => {
		return document.body.textContent?.includes("Start typing to search") ?? false;
	});
	ctx.assert(hasHint, "Empty search should show hint text");

	// I type a nonsense query to verify the no-results message
	await ctx.page.type('input[placeholder*="Search"]', "zzzzznonexistent");
	await new Promise((r) => setTimeout(r, 300));

	const hasNoResults = await ctx.page.evaluate(() => {
		return document.body.textContent?.includes("No results") ?? false;
	});
	ctx.assert(hasNoResults, "Non-matching query should show 'No results'");

	// I close search by clicking the backdrop
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

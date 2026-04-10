/**
 * Shared browser context for E2E tests.
 * Manages Puppeteer lifecycle, viewport presets, and navigation helpers.
 */

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";

const SCREENSHOT_DIR = resolve(import.meta.dirname, "screenshots");
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// ── Viewport presets ──

export const VIEWPORTS = {
	desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
	tablet: { width: 768, height: 1024, deviceScaleFactor: 2 },
	mobile: { width: 390, height: 844, deviceScaleFactor: 3 },
} as const;

export type ViewportName = keyof typeof VIEWPORTS;

// ── Test context ──

export interface TestContext {
	browser: Browser;
	page: Page;
	baseUrl: string;
	viewport: ViewportName;
	/** Navigate to app and wait for it to be interactive. */
	goto(path?: string): Promise<void>;
	/** Take a named screenshot (saved to e2e/screenshots/). */
	screenshot(name: string): Promise<string>;
	/** Assert a condition, throwing with a descriptive message on failure. */
	assert(condition: boolean, message: string): void;
	/** Query text content of the page body. */
	bodyText(): Promise<string>;
	/** Wait for text to appear in the page. */
	waitForText(text: string, timeout?: number): Promise<void>;
	/** Click a button by its visible text content. */
	clickButton(text: string): Promise<void>;
}

/** Shared browser instance — call launchBrowser() once, closeBrowser() at end. */
let sharedBrowser: Browser | null = null;

export async function launchBrowser(): Promise<Browser> {
	sharedBrowser = await puppeteer.launch({
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-gpu",
			"--disable-dev-shm-usage",
			"--disable-software-rasterizer",
		],
	});
	return sharedBrowser;
}

export async function closeBrowser(): Promise<void> {
	if (sharedBrowser) {
		await sharedBrowser.close();
		sharedBrowser = null;
	}
}

export async function createContext(baseUrl: string, viewport: ViewportName): Promise<TestContext> {
	if (!sharedBrowser) throw new Error("Call launchBrowser() before createContext()");

	// Use incognito context for test isolation without browser launch cost
	const browserContext = await sharedBrowser.createBrowserContext();
	const page = await browserContext.newPage();
	await page.setViewport(VIEWPORTS[viewport]);

	const ctx: TestContext = {
		browser: sharedBrowser,
		page,
		baseUrl,
		viewport,

		async goto(path = "/") {
			await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle2", timeout: 15000 });
			// Wait for React mount
			await page.waitForSelector("h1", { timeout: 15000 });
			// Wait for loading screen to clear
			await page.waitForFunction(
				() => !document.body.textContent?.includes("Loading cable network data"),
				{ timeout: 15000 },
			);
			// Brief pause for deck.gl layer initialization
			await new Promise((r) => setTimeout(r, 800));
		},

		async screenshot(name: string) {
			const filename = `${viewport}-${name}.png`;
			const filepath = resolve(SCREENSHOT_DIR, filename);
			await page.screenshot({ path: filepath, fullPage: false });
			return filepath;
		},

		assert(condition: boolean, message: string) {
			if (!condition) throw new Error(message);
		},

		async bodyText() {
			return page.evaluate(() => document.body.textContent ?? "");
		},

		async waitForText(text: string, timeout = 5000) {
			await page.waitForFunction(
				(t: string) => document.body.textContent?.includes(t) ?? false,
				{ timeout },
				text,
			);
		},

		async clickButton(text: string) {
			const clicked = await page.evaluate((t: string) => {
				const btns = Array.from(document.querySelectorAll("button"));
				const btn = btns.find((b) => b.textContent?.trim().includes(t));
				if (btn) {
					btn.click();
					return true;
				}
				return false;
			}, text);
			if (!clicked) throw new Error(`Button "${text}" not found`);
		},
	};

	return ctx;
}

/** Close the incognito context (not the browser). */
export async function destroyContext(ctx: TestContext): Promise<void> {
	const browserContext = ctx.page.browserContext();
	await browserContext.close();
}

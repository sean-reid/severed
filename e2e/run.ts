#!/usr/bin/env tsx
/**
 * E2E test runner for Severed.
 *
 * 1. Builds the app (production)
 * 2. Starts vite preview server
 * 3. Discovers and runs test modules in e2e/tests/
 * 4. Runs each test across multiple viewports IN PARALLEL
 * 5. Saves screenshots on failure
 * 6. Reports results
 *
 * Usage:
 *   pnpm test:e2e              Run all E2E tests
 *   pnpm test:e2e --no-build   Skip build step (use existing dist/)
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
	type ViewportName,
	closeBrowser,
	createContext,
	destroyContext,
	launchBrowser,
} from "./context";

const E2E_DIR = resolve(import.meta.dirname);
const ROOT = resolve(E2E_DIR, "..");
const PORT = 4174;
const BASE_URL = `http://localhost:${PORT}`;
const TEST_VIEWPORTS: ViewportName[] = ["desktop", "mobile"];
const skipBuild = process.argv.includes("--no-build");

// ── Step 1: Build ──

if (!skipBuild) {
	console.log("\x1b[2m  Building app...\x1b[0m");
	execSync("pnpm build", { stdio: "inherit", cwd: ROOT });
	console.log();
}

// ── Step 2: Start preview server ──

console.log("\x1b[2m  Starting preview server...\x1b[0m");
const server: ChildProcess = spawn(
	"npx",
	["vite", "preview", "--port", String(PORT), "--strictPort"],
	{ cwd: ROOT, stdio: "pipe", detached: false },
);

await new Promise<void>((resolve, reject) => {
	const timeout = setTimeout(() => reject(new Error("Preview server timeout (30s)")), 30000);
	const onData = (data: Buffer) => {
		const msg = data.toString();
		if (msg.includes("Local:") || msg.includes(`${PORT}`)) {
			clearTimeout(timeout);
			resolve();
		}
		if (msg.includes("EADDRINUSE")) {
			clearTimeout(timeout);
			reject(new Error(`Port ${PORT} already in use`));
		}
	};
	server.stdout?.on("data", onData);
	server.stderr?.on("data", onData);
	server.on("error", reject);
});

console.log(`\x1b[2m  Server ready at ${BASE_URL}\x1b[0m`);

// ── Step 3: Launch shared browser ──

await launchBrowser();
console.log("\x1b[2m  Browser launched\x1b[0m\n");

// ── Step 4: Discover tests ──

const testFiles = readdirSync(resolve(E2E_DIR, "tests"))
	.filter((f) => f.endsWith(".test.ts"))
	.sort();

console.log(
	`\x1b[1mRunning ${testFiles.length} test suites across ${TEST_VIEWPORTS.length} viewports\x1b[0m\n`,
);

// ── Step 5: Run tests (viewports in parallel per suite) ──

interface TestResult {
	name: string;
	viewport: ViewportName;
	passed: boolean;
	error?: string;
	screenshot?: string;
	durationMs: number;
}

const results: TestResult[] = [];

for (const file of testFiles) {
	const suiteName = basename(file, ".test.ts");
	const mod = await import(`./tests/${file}`);

	// Run both viewports in parallel
	const suiteStart = Date.now();
	const viewportResults = await Promise.all(
		TEST_VIEWPORTS.map(async (viewport): Promise<TestResult> => {
			const start = Date.now();
			const ctx = await createContext(BASE_URL, viewport);
			try {
				await mod.default(ctx);
				return { name: suiteName, viewport, passed: true, durationMs: Date.now() - start };
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				let screenshot: string | undefined;
				try {
					screenshot = await ctx.screenshot(`FAIL-${suiteName}`);
				} catch {
					/* screenshot failed */
				}
				return {
					name: suiteName,
					viewport,
					passed: false,
					error: msg,
					screenshot,
					durationMs: Date.now() - start,
				};
			} finally {
				await destroyContext(ctx);
			}
		}),
	);

	const suiteDuration = Date.now() - suiteStart;
	for (const r of viewportResults) {
		results.push(r);
		const label = `${r.name} [${r.viewport}]`;
		if (r.passed) {
			console.log(`  ${label} \x1b[32m✓\x1b[0m \x1b[2m${r.durationMs}ms\x1b[0m`);
		} else {
			console.log(`  ${label} \x1b[31m✗\x1b[0m \x1b[2m${r.durationMs}ms\x1b[0m`);
		}
	}
	// Show parallel savings if both viewports ran
	if (viewportResults.length > 1) {
		const serial = viewportResults.reduce((sum, r) => sum + r.durationMs, 0);
		if (serial > suiteDuration + 500) {
			console.log(
				`    \x1b[2m(parallel: ${(suiteDuration / 1000).toFixed(1)}s vs ${(serial / 1000).toFixed(1)}s serial)\x1b[0m`,
			);
		}
	}
}

// ── Step 6: Cleanup and report ──

await closeBrowser();

if (server.pid) {
	try {
		execSync(`kill -9 ${server.pid} 2>/dev/null; pkill -9 -P ${server.pid} 2>/dev/null`, {
			stdio: "ignore",
		});
	} catch {
		// Best-effort cleanup
	}
}
server.kill("SIGKILL");

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
const wallClock = results.reduce((sum, r) => sum + r.durationMs, 0);

console.log(
	`\n\x1b[1m${passed + failed} tests, \x1b[32m${passed} passed\x1b[0m\x1b[1m, \x1b[${failed > 0 ? "31" : "2"}m${failed} failed\x1b[0m \x1b[2m(${(wallClock / 1000).toFixed(1)}s)\x1b[0m`,
);

if (failed > 0) {
	console.log("\n\x1b[31mFailures:\x1b[0m");
	for (const r of results.filter((r) => !r.passed)) {
		console.log(`  \x1b[31m✗\x1b[0m ${r.name} [${r.viewport}]: ${r.error}`);
		if (r.screenshot) console.log(`    \x1b[2mScreenshot: ${r.screenshot}\x1b[0m`);
	}
	process.exit(1);
}

process.exit(0);

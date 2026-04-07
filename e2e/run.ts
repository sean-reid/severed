#!/usr/bin/env tsx
/**
 * E2E test runner for Severed.
 *
 * 1. Builds the app (production)
 * 2. Starts vite preview server
 * 3. Discovers and runs test modules in e2e/tests/
 * 4. Runs each test across multiple viewports (desktop, mobile)
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
import { type ViewportName, createContext } from "./context";

const E2E_DIR = resolve(import.meta.dirname);
const ROOT = resolve(E2E_DIR, "..");
const PORT = 4174;
const BASE_URL = `http://localhost:${PORT}`;
const TEST_VIEWPORTS: ViewportName[] = ["desktop", "mobile"];
const skipBuild = process.argv.includes("--no-build");

// ── Step 1: Build ──

if (!skipBuild) {
	console.log("\x1b[2m  Building app...\x1b[0m");
	// Force base="/" for E2E regardless of GITHUB_ACTIONS env
	execSync("pnpm build", {
		stdio: "inherit",
		cwd: ROOT,
		env: { ...process.env, GITHUB_ACTIONS: "" },
	});
	console.log();
}

// ── Step 2: Start preview server ──

console.log("\x1b[2m  Starting preview server...\x1b[0m");
const server: ChildProcess = spawn(
	"npx",
	["vite", "preview", "--port", String(PORT), "--strictPort"],
	{ cwd: ROOT, stdio: "pipe" },
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

console.log(`\x1b[2m  Server ready at ${BASE_URL}\x1b[0m\n`);

// ── Step 3: Discover tests ──

const testFiles = readdirSync(resolve(E2E_DIR, "tests"))
	.filter((f) => f.endsWith(".test.ts"))
	.sort();

console.log(
	`\x1b[1mRunning ${testFiles.length} test suites across ${TEST_VIEWPORTS.length} viewports\x1b[0m\n`,
);

// ── Step 4: Run tests ──

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

	for (const viewport of TEST_VIEWPORTS) {
		const label = `${suiteName} [${viewport}]`;
		process.stdout.write(`  ${label} `);
		const start = Date.now();

		const ctx = await createContext(BASE_URL, viewport);
		try {
			await mod.default(ctx);
			const duration = Date.now() - start;
			results.push({ name: suiteName, viewport, passed: true, durationMs: duration });
			console.log(`\x1b[32m✓\x1b[0m \x1b[2m${duration}ms\x1b[0m`);
		} catch (err) {
			const duration = Date.now() - start;
			const msg = err instanceof Error ? err.message : String(err);
			let screenshot: string | undefined;
			try {
				screenshot = await ctx.screenshot(`FAIL-${suiteName}`);
			} catch {
				/* screenshot failed, continue */
			}
			results.push({
				name: suiteName,
				viewport,
				passed: false,
				error: msg,
				screenshot,
				durationMs: duration,
			});
			console.log(`\x1b[31m✗\x1b[0m \x1b[2m${duration}ms\x1b[0m`);
		} finally {
			await ctx.browser.close();
		}
	}
}

// ── Step 5: Cleanup and report ──

server.kill();

const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

console.log(
	`\n\x1b[1m${passed + failed} tests, \x1b[32m${passed} passed\x1b[0m\x1b[1m, \x1b[${failed > 0 ? "31" : "2"}m${failed} failed\x1b[0m \x1b[2m(${(totalMs / 1000).toFixed(1)}s)\x1b[0m`,
);

if (failed > 0) {
	console.log("\n\x1b[31mFailures:\x1b[0m");
	for (const r of results.filter((r) => !r.passed)) {
		console.log(`  \x1b[31m✗\x1b[0m ${r.name} [${r.viewport}]: ${r.error}`);
		if (r.screenshot) console.log(`    \x1b[2mScreenshot: ${r.screenshot}\x1b[0m`);
	}
	process.exit(1);
}

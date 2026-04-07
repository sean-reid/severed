import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	// GitHub Pages deploys to /<repo-name>/ — set base dynamically
	base: process.env.GITHUB_ACTIONS ? "/severed/" : "/",
	plugins: [react(), tailwindcss()],
	worker: {
		format: "es",
	},
	test: {
		exclude: ["e2e/**", "node_modules/**"],
	},
});

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	// GitHub Pages deploys to /<repo-name>/ — set base dynamically
	base: process.env.VITE_BASE_PATH ?? "/",
	plugins: [react(), tailwindcss()],
	worker: {
		format: "es",
	},
});

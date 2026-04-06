import type { AppData } from "./types";

const BASE = import.meta.env.BASE_URL + "data/";

async function fetchJson<T>(path: string): Promise<T> {
	const res = await fetch(BASE + path);
	if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
	return res.json();
}

export async function loadAppData(): Promise<AppData> {
	const [cables, metros, terrestrial, chokepoints, scenarios] = await Promise.all([
		fetchJson("cables.json"),
		fetchJson("metros.json"),
		fetchJson("terrestrial.json"),
		fetchJson("chokepoints.json"),
		fetchJson("scenarios.json"),
	]);
	return { cables, metros, terrestrial, chokepoints, scenarios } as AppData;
}

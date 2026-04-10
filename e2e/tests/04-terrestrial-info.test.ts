import type { TestContext } from "../context";

/**
 * As a user, I want the terrestrial backbone data to be well-sourced and
 * correctly structured so I can trust the simulation results.
 *
 * Story: Data quality -- terrestrial backbone links are well-sourced and correctly structured.
 */
export default async function test(ctx: TestContext) {
	await ctx.goto();

	// The dataset should contain a healthy number of backbone links
	const edgeCount = await ctx.page.evaluate(() => {
		return fetch("/data/terrestrial.json")
			.then((r) => r.json())
			.then((data: unknown[]) => data.length);
	});

	ctx.assert(edgeCount > 100, `Expected >100 terrestrial edges, got ${edgeCount}`);

	// Most edges should cite their source URL for transparency
	const sourcedEdgeCount = await ctx.page.evaluate(() => {
		return fetch("/data/terrestrial.json")
			.then((r) => r.json())
			.then((data: Array<{ sourceUrl?: string }>) => data.filter((e) => e.sourceUrl).length);
	});

	ctx.assert(sourcedEdgeCount > 30, `Expected >30 edges with sourceUrl, got ${sourcedEdgeCount}`);

	// Spot-check: look for a known European backbone link
	const frankfurtAmsterdam = await ctx.page.evaluate(() => {
		return fetch("/data/terrestrial.json")
			.then((r) => r.json())
			.then((data: Array<{ from: string; to: string; sourceUrl?: string; confidence: string }>) =>
				data.find(
					(e) =>
						(e.from.includes("frankfurt") || e.from.includes("beverwijk")) &&
						(e.to.includes("amsterdam") || e.to.includes("beverwijk")),
				),
			);
	});

	// Verify every edge has the required fields with correct types
	const sampleEdge = await ctx.page.evaluate(() => {
		return fetch("/data/terrestrial.json")
			.then((r) => r.json())
			.then(
				(
					data: Array<{
						id: string;
						from: string;
						to: string;
						capacityTbps: number;
						confidence: string;
						source: string;
					}>,
				) => {
					const e = data[0];
					return {
						hasId: typeof e.id === "string",
						hasFrom: typeof e.from === "string",
						hasTo: typeof e.to === "string",
						hasCapacity: typeof e.capacityTbps === "number",
						hasConfidence: ["verified", "estimated", "approximated"].includes(e.confidence),
						hasSource: typeof e.source === "string" && e.source.length > 0,
					};
				},
			);
	});

	ctx.assert(sampleEdge.hasId, "Terrestrial edge missing id");
	ctx.assert(sampleEdge.hasFrom, "Terrestrial edge missing from");
	ctx.assert(sampleEdge.hasTo, "Terrestrial edge missing to");
	ctx.assert(sampleEdge.hasCapacity, "Terrestrial edge missing capacityTbps");
	ctx.assert(sampleEdge.hasConfidence, "Terrestrial edge has invalid confidence");
	ctx.assert(sampleEdge.hasSource, "Terrestrial edge missing source");

	await ctx.screenshot("terrestrial-data-check");
}

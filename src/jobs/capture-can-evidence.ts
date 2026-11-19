import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

// Curated supporting evidence for the hackathon comparison, separate from agent output.
const directory = "data/demo/aluminum-can";
const urls = [
  "https://international-aluminium.org/landing/aluminium-recycling-saves-95-of-the-energy-needed-for-primary-aluminium-production/",
  "https://international-aluminium.org/landing/aluminium-carbon-footprint-faqs/",
  "https://thealuminiumstory.com/mining-refining/process-refining/",
  "https://international-aluminium.org/wp-content/uploads/2022/09/Bauxite-Residue_Final_ENG-1.pdf",
  "https://www.tomra.com/waste-metal-recycling/products/machines/new-x-tract",
  "https://novelis.com/news/the-life-of-a-can/",
  "https://www.belvac.com/about/news/belvac-expands-global-customer-base-with-turnkey-integration-project-in-new-zealand/",
  "https://novelis.com/sustainability/aluminum-recycling/",
];
if (!process.env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY required");
const response = await fetch("https://api.tavily.com/extract", {
  method: "POST", headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ urls, extract_depth: "basic", format: "markdown", include_usage: true }),
  signal: AbortSignal.timeout(90_000),
});
if (!response.ok) throw new Error(`Evidence capture: HTTP ${response.status}`);
const raw = await response.json() as { results: { url: string; raw_content: string | null }[]; failed_results?: unknown[] };
await mkdir(directory, { recursive: true });
const retrievedAt = new Date().toISOString();
const sources = raw.results.filter((s) => s.raw_content?.trim()).map((s, i) => ({
  id: `C${i + 1}`, url: s.url, content: s.raw_content!, retrieved_at: retrievedAt,
  content_sha256: createHash("sha256").update(s.raw_content!).digest("hex"), truncated_for_model: false,
}));
// Exclusive writes keep an existing capture immutable.
await writeFile(join(directory, "curated-extract.json"), JSON.stringify({ retrieved_at: retrievedAt, ...raw }, null, 2), { flag: "wx" });
await writeFile(join(directory, "curated-sources.json"), JSON.stringify(sources, null, 2), { flag: "wx" });
console.log(JSON.stringify({ directory, sources: sources.map(({ id, url }) => ({ id, url })), failed: raw.failed_results ?? [] }, null, 2));

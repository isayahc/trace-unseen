import { Plugin } from "@opencode/plugin";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { saveJson } from "../research/files.js";
import type { Source } from "../research/schema.js";

const searchInput = z.object({ query: z.string().min(1) });
const extractInput = z.object({ urls: z.array(z.url()).min(1).max(5) });
const searchResponse = z.object({
  results: z.array(z.object({ url: z.url(), title: z.string(), content: z.string() })),
}).passthrough();
const extractResponse = z.object({
  results: z.array(z.object({ url: z.url(), raw_content: z.string().nullable() })),
  failed_results: z.array(z.unknown()).optional(),
}).passthrough();

/** Plugin factory: closures keep each job's tool budget and sources isolated. */
export function tavilyPlugin(runDirectory: string, sources: Source[], reuseSources: boolean, budget = { searches: 2, extractions: 1 }) {
  let searches = 0;
  let extractions = 0;
  async function request(endpoint: string, payload: unknown, signal: AbortSignal) {
    const key = process.env.TAVILY_API_KEY;
    if (!key) throw new Error("Set TAVILY_API_KEY in .env");
    const response = await fetch(`https://api.tavily.com/${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
    });
    if (!response.ok) throw new Error(`Tavily ${endpoint}: HTTP ${response.status}`);
    return response.json();
  }
  return Plugin.define({
    id: "trace-unseen.tavily",
    async setup(ctx) {
      // This applies only inside this SDK host, not to the user's saved MCP config.
      await ctx.mcp.transform((editor) => {
        for (const [name] of editor.list()) editor.update(name, (server) => { server.disabled = true; });
      });
      await ctx.tool.transform((editor) => {
        editor.namespace({ name: "tavily", description: "Research manufacturing tasks" });
        editor.add({
          name: "search", description: `Search source pages. Maximum ${budget.searches} calls per research job.`,
          options: { namespace: "tavily", codemode: false },
          input: z.toJSONSchema(searchInput),
          async execute(input, context) {
            const { query } = searchInput.parse(input);
            if (reuseSources || searches >= budget.searches) throw new Error("Search budget exhausted; use existing sources");
            const index = ++searches;
            console.log(`Tavily search ${index}/${budget.searches}: ${query}`);
            const raw = await request("search", {
              query, search_depth: "basic", max_results: 5, include_answer: false, include_usage: true,
            }, context.signal);
            await saveJson(join(runDirectory, `search-${index}.json`), raw);
            const result = searchResponse.parse(raw);
            return { content: JSON.stringify(result.results) };
          },
        });
        editor.add({
          name: "extract", description: `Extract up to five pages as citable source documents. Maximum ${budget.extractions} calls per job.`,
          options: { namespace: "tavily", codemode: false },
          input: z.toJSONSchema(extractInput),
          async execute(input, context) {
            const { urls } = extractInput.parse(input);
            if (reuseSources || extractions >= budget.extractions) throw new Error("Extraction budget exhausted; use existing sources");
            const index = ++extractions;
            console.log(`Tavily extracting ${urls.length} pages`);
            const raw = await request("extract", {
              urls, extract_depth: "basic", format: "markdown", include_usage: true,
            }, context.signal);
            await saveJson(join(runDirectory, `extract-${index}.json`), raw);
            const result = extractResponse.parse(raw);
            for (const item of result.results) {
              if (sources.some((source) => source.url === item.url)) continue;
              if (!item.raw_content?.trim()) continue;
              sources.push({
                id: `S${sources.length + 1}`, url: item.url, content: item.raw_content.slice(0, 24_000),
                content_sha256: createHash("sha256").update(item.raw_content).digest("hex"),
                truncated_for_model: item.raw_content.length > 24_000,
              });
            }
            await saveJson(join(runDirectory, "sources.json"), sources);
            return { content: JSON.stringify({ sources, failed_results: result.failed_results ?? [] }) };
          },
        });
      });
    },
  });
}

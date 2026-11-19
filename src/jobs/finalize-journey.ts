import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseOutput } from "../research/parse-output.js";
import { validateJourney } from "../research/journey.js";
import { serializeJourney } from "../research/graph.js";
import { sourceSchema } from "../research/schema.js";
import { persist } from "../research/store.js";
import { saveJson } from "../research/files.js";

async function main() {
  if (!process.argv[2]) throw new Error("Usage: finalize-journey.ts data/runs/<run-id>");
  const directory = resolve(process.argv[2]);
  const load = async (file: string) => JSON.parse(await readFile(join(directory, file), "utf8"));
  const manifest = await load("manifest.json");
  if (manifest.status !== "failed") throw new Error("Only failed runs can be finalized");
  const messages = await load("opencode-messages.json");
  const last = messages.filter((m: { type: string }) => m.type === "assistant").at(-1);
  if (!last || last.error || last.finish === "length") throw new Error("Missing, failed or truncated model response");
  const parsed = parseOutput(await readFile(join(directory, "model-answer.txt"), "utf8"));
  await saveJson(join(directory, "parsed-output.json"), parsed);
  const sources = sourceSchema.array().parse(await load("sources.json"));
  const journey = validateJourney(parsed.value, sources);
  const graph = serializeJourney(journey, manifest.id);
  await saveJson(join(directory, "journey.json"), journey);
  await saveJson(join(directory, "graph.json"), graph);
  Object.assign(manifest, { status: "completed", error: "", source_count: sources.length,
    syntax_repaired: parsed.repaired, finalized_at: new Date().toISOString() });
  persist(resolve("data/research.sqlite3"), manifest, sources, [], journey);
  await saveJson(join(directory, "manifest.json"), manifest);
  console.log(`Saved ${graph.nodes.length} nodes and ${graph.edges.length} edges. Syntax repaired: ${parsed.repaired}`);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });

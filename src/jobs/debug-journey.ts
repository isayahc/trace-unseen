import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseOutput } from "../research/parse-output.js";
import { sourceSchema } from "../research/schema.js";
import { validateJourney } from "../research/journey.js";
import { serializeJourney } from "../research/graph.js";

// Read-only replay: no SDK, credentials, network calls or persistence.
const runDirectory = resolve(process.argv[2] ?? "data/runs/2026-11-19T19-58-27-161Z-e2db9139");
const manifest = JSON.parse(await readFile(join(runDirectory, "manifest.json"), "utf8"));
const sources = sourceSchema.array().parse(JSON.parse(await readFile(join(runDirectory, "sources.json"), "utf8")));
const answer = await readFile(join(runDirectory, "model-answer.txt"), "utf8");
const parsed = parseOutput(answer);
console.log(`Replaying ${manifest.id}: ${sources.length} saved sources; original error: ${manifest.error || "none"}`);
// F5 pauses here with manifest, sources, answer and parsed in scope.
debugger;
const journey = validateJourney(parsed.value, sources);
const graph = serializeJourney(journey, manifest.id);
console.log(`Validation passed: ${graph.nodes.length} processes, ${graph.edges.length} dependencies. Nothing written.`);

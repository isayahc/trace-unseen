import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { sourceSchema } from "../research/schema.js";
import { validateJourney } from "../research/journey.js";
import { serializeJourney } from "../research/graph.js";
import { persist } from "../research/store.js";

const directory = resolve(process.argv[2] ?? "examples/aluminum-can");
const load = async (file: string) => JSON.parse(await readFile(join(directory, file), "utf8"));
const manifest = await load("manifest.json");
if (typeof manifest.id !== "string" || !manifest.id.startsWith("demo-")) throw new Error("Expected a demo manifest");
const sources = sourceSchema.array().parse(await load("sources.json"));
const journey = validateJourney(await load("journey.json"), sources);
serializeJourney(journey, manifest.id);
mkdirSync("data", { recursive: true });
const path = "data/research.sqlite3";
let existing = false;
if (existsSync(path)) {
  const db = new DatabaseSync(path);
  try {
    if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='research_runs'").get()) {
      existing = Boolean(db.prepare("SELECT id FROM research_runs WHERE id=?").get(manifest.id));
    }
  } finally { db.close(); }
}
if (existing) console.log(`Demo ${manifest.id} already loaded; existing snapshot preserved.`);
else { persist(path, manifest, sources, [], journey); console.log(`Loaded ${manifest.id}: ${journey.stages.length} processes, ${sources.length} sources. Refresh the app.`); }

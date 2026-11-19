import { defineConfig, type Plugin } from "vite";
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { researchJobs } from "./src/server/research-jobs.js";
import { serializeJourney } from "./src/research/graph.js";
import { so101Plugin } from "./src/server/so101.js";

function snapshots(request: IncomingMessage, response: ServerResponse, next: () => void) {
  if (request.url?.split("?")[0] !== "/api/journeys") return next();
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") { response.statusCode = 405; response.end('{}'); return; }
  const path = resolve("data/research.sqlite3");
  if (!existsSync(path)) { response.end('{"snapshots":[]}'); return; }
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path, { readOnly: true });
    if (!db.prepare("SELECT name FROM sqlite_master WHERE name='journey_snapshots'").get()) {
      response.end('{"snapshots":[]}'); return;
    }
    const rows = db.prepare(`SELECT j.run_id, j.journey_json, r.metadata_json
      FROM journey_snapshots j JOIN research_runs r ON r.id=j.run_id ORDER BY j.run_id DESC`).all();
    const snapshots = rows.map((row) => {
      const metadata = JSON.parse(String(row.metadata_json));
      const journey = JSON.parse(String(row.journey_json));
      return { id: row.run_id, createdAt: metadata.created_at, journey: JSON.parse(String(row.journey_json)),
        graph: serializeJourney(journey, String(row.run_id)),
        sources: db!.prepare("SELECT source_id AS id, url FROM source_documents WHERE run_id=?").all(row.run_id) };
    });
    response.end(JSON.stringify({ snapshots }));
  } catch { response.statusCode = 500; response.end('{"error":"Could not read research snapshots"}'); }
  finally { db?.close(); }
}
const researchApi: Plugin = {
  name: "local-research-api",
  configureServer(server) { server.middlewares.use(researchJobs); server.middlewares.use(snapshots); },
  configurePreviewServer(server) { server.middlewares.use(researchJobs); server.middlewares.use(snapshots); },
};
export default defineConfig({ plugins: [researchApi, so101Plugin()], server: { fs: { deny: ["**/.env*", "**/data/**", "**/.git/**"] } } });

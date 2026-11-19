import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { journeySchema } from "../research/journey.js";
import { serializeJourney } from "../research/graph.js";

const db = new DatabaseSync("data/research.sqlite3");
try {
  db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS product_graph_history (
    run_id TEXT NOT NULL, schema_version INTEGER NOT NULL, graph_json TEXT NOT NULL,
    PRIMARY KEY(run_id,schema_version));`);
  const rows = db.prepare("SELECT run_id, journey_json FROM journey_snapshots").all();
  // Build all graphs first; validation failures leave all existing projections intact.
  const updates = rows.map((row) => serializeJourney(journeySchema.parse(JSON.parse(String(row.journey_json))), String(row.run_id)));
  db.exec("BEGIN");
  for (const graph of updates) {
    db.prepare("INSERT OR IGNORE INTO product_graph_history SELECT run_id,schema_version,graph_json FROM product_graphs WHERE run_id=? AND schema_version<2").run(graph.runId);
    db.prepare("DELETE FROM graph_edges WHERE run_id=?").run(graph.runId);
    db.prepare("DELETE FROM graph_nodes WHERE run_id=?").run(graph.runId);
    db.prepare("INSERT INTO product_graphs VALUES (?,2,?) ON CONFLICT(run_id) DO UPDATE SET schema_version=2,graph_json=excluded.graph_json").run(graph.runId, JSON.stringify(graph));
    for (const node of graph.nodes) db.prepare("INSERT INTO graph_nodes VALUES (?,?,?,?)").run(graph.runId, node.id, node.kind, JSON.stringify(node));
    for (const edge of graph.edges) db.prepare("INSERT INTO graph_edges VALUES (?,?,?,?,?,?)").run(graph.runId, edge.id, edge.source, edge.target, edge.kind, JSON.stringify(edge));
  }
  db.exec("COMMIT");
  for (const graph of updates) {
    await writeFile(join("data/runs", graph.runId, "graph-v2.json"), JSON.stringify(graph, null, 2));
    console.log(`${graph.product}: ${graph.nodes.length} processes, ${graph.edges.length} dependencies`);
  }
} catch (error) { if (db.isTransaction) db.exec("ROLLBACK"); throw error; }
finally { db.close(); }

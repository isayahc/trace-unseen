import { DatabaseSync } from "node:sqlite";
import type { Source, Task } from "./schema.js";
import type { Journey } from "./journey.js";
import { serializeJourney } from "./graph.js";

export function persist(path: string, manifest: { id: string }, sources: Source[], tasks: Task[], journey?: Journey) {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS research_runs (id TEXT PRIMARY KEY, metadata_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS source_documents (
        run_id TEXT NOT NULL REFERENCES research_runs(id), source_id TEXT NOT NULL,
        url TEXT NOT NULL, content TEXT NOT NULL, PRIMARY KEY (run_id, source_id));
      CREATE TABLE IF NOT EXISTS task_findings (
        run_id TEXT NOT NULL REFERENCES research_runs(id), task_id TEXT NOT NULL,
        finding_json TEXT NOT NULL, PRIMARY KEY (run_id, task_id));
      CREATE TABLE IF NOT EXISTS journey_snapshots (
        run_id TEXT PRIMARY KEY REFERENCES research_runs(id), product TEXT NOT NULL, journey_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS journey_entities (
        run_id TEXT NOT NULL REFERENCES research_runs(id), kind TEXT NOT NULL,
        entity_id TEXT NOT NULL, data_json TEXT NOT NULL, PRIMARY KEY(run_id, kind, entity_id));
      CREATE TABLE IF NOT EXISTS product_graphs (
        run_id TEXT PRIMARY KEY REFERENCES research_runs(id), schema_version INTEGER NOT NULL, graph_json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS graph_nodes (
        run_id TEXT NOT NULL REFERENCES product_graphs(run_id), node_id TEXT NOT NULL, kind TEXT NOT NULL,
        data_json TEXT NOT NULL, PRIMARY KEY(run_id,node_id));
      CREATE TABLE IF NOT EXISTS graph_edges (
        run_id TEXT NOT NULL REFERENCES product_graphs(run_id), edge_id TEXT NOT NULL,
        source_id TEXT NOT NULL, target_id TEXT NOT NULL, kind TEXT NOT NULL, data_json TEXT NOT NULL,
        PRIMARY KEY(run_id,edge_id), FOREIGN KEY(run_id,source_id) REFERENCES graph_nodes(run_id,node_id),
        FOREIGN KEY(run_id,target_id) REFERENCES graph_nodes(run_id,node_id));
      CREATE TABLE IF NOT EXISTS process_metrics (
        run_id TEXT NOT NULL REFERENCES research_runs(id), process_id TEXT NOT NULL,
        metric_id TEXT NOT NULL, category TEXT NOT NULL, scenario TEXT NOT NULL, metric_json TEXT NOT NULL,
        PRIMARY KEY(run_id,process_id,metric_id));
      CREATE TABLE IF NOT EXISTS automation_assessments (
        run_id TEXT NOT NULL REFERENCES research_runs(id), process_id TEXT NOT NULL,
        assessment_index INTEGER NOT NULL, assessment_json TEXT NOT NULL,
        PRIMARY KEY(run_id,process_id,assessment_index));
      BEGIN;
    `);
    db.prepare("INSERT INTO research_runs VALUES (?, ?)").run(manifest.id, JSON.stringify(manifest));
    const sourceInsert = db.prepare("INSERT INTO source_documents VALUES (?, ?, ?, ?)");
    for (const source of sources) sourceInsert.run(manifest.id, source.id, source.url, source.content);
    const taskInsert = db.prepare("INSERT INTO task_findings VALUES (?, ?, ?)");
    tasks.forEach((task, i) => taskInsert.run(manifest.id, `T${i + 1}`, JSON.stringify(task)));
    if (journey) {
      for (const stage of journey.stages) {
        for (const metric of stage.metrics ?? []) db.prepare("INSERT INTO process_metrics VALUES (?,?,?,?,?,?)").run(manifest.id, stage.id, metric.id, metric.category, metric.scenario, JSON.stringify(metric));
        for (const [i, assessment] of (stage.automation ?? []).entries()) db.prepare("INSERT INTO automation_assessments VALUES (?,?,?,?)").run(manifest.id, stage.id, i, JSON.stringify(assessment));
      }
      const graph = serializeJourney(journey, manifest.id);
      db.prepare("INSERT INTO product_graphs VALUES (?, ?, ?)").run(manifest.id, graph.schemaVersion, JSON.stringify(graph));
      const nodeInsert = db.prepare("INSERT INTO graph_nodes VALUES (?, ?, ?, ?)");
      for (const node of graph.nodes) nodeInsert.run(manifest.id, node.id, node.kind, JSON.stringify(node));
      const edgeInsert = db.prepare("INSERT INTO graph_edges VALUES (?, ?, ?, ?, ?, ?)");
      for (const edge of graph.edges) edgeInsert.run(manifest.id, edge.id, edge.source, edge.target, edge.kind, JSON.stringify(edge));
      db.prepare("INSERT INTO journey_snapshots VALUES (?, ?, ?)").run(manifest.id, journey.product, JSON.stringify(journey));
      const insert = db.prepare("INSERT INTO journey_entities VALUES (?, ?, ?, ?)");
      for (const kind of ["materials", "stages", "places", "supply_lines"] as const) {
        for (const item of journey[kind]) insert.run(manifest.id, kind, item.id, JSON.stringify(item));
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}

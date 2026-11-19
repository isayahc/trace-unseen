import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { serializeJourney } from "./graph.js";
import { validateJourney } from "./journey.js";
import { persist } from "./store.js";

test("validated product graph serializes deterministically and survives SQLite round trip", () => {
  const sources = [{ id: "S1", url: "https://example.com/process", content: "Fabric panels are sewn into hoodies." }];
  const claim = { basis: "documented", rationale: "Generic sewing example, not brand-specific", evidence: [{ source_id: "S1", quote: sources[0].content }] };
  const journey = validateJourney({ product: "Hoodie", scope: "Example", gaps: ["Fiber composition unknown"],
    materials: [{ id: "fabric", name: "Fabric", ...claim }, { id: "hoodie", name: "Hoodie", ...claim }, { id: "yarn", name: "Yarn", ...claim }],
    stages: [{ id: "knit", name: "Knit", inputs: ["yarn"], outputs: ["fabric"], tasks: [], ...claim }, { id: "sew", name: "Sew", inputs: ["fabric"], outputs: ["hoodie"], tasks: ["Sew panels"], ...claim }],
    places: [], supply_lines: [],
  }, sources);
  const graph = serializeJourney(journey, "test-run");
  assert.deepEqual(graph, serializeJourney(journey, "test-run"));
  assert.equal(graph.nodes.length, 2); assert.equal(graph.edges.length, 1);
  assert.ok(graph.nodes.every((n) => n.kind === "process"));
  assert.equal(graph.nodes[0].attributes.inputs[0].name, "Yarn");
  assert.equal(graph.edges[0].attributes.materials[0].name, "Fabric");
  assert.equal(graph.edges[0].basis, "inferred");
  assert.equal(graph.edges[0].source, "process:knit");
  assert.equal(graph.edges[0].target, "process:sew");
  const directory = mkdtempSync(join(tmpdir(), "trace-graph-"));
  try {
    const path = join(directory, "research.sqlite3");
    persist(path, { id: "test-run" }, sources, [], journey);
    const db = new DatabaseSync(path);
    try {
      assert.deepEqual(JSON.parse(String(db.prepare("SELECT graph_json FROM product_graphs").get()?.graph_json)), graph);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM graph_nodes").get()?.n, 2);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM graph_edges").get()?.n, 1);
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { db.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("process DAG rejects cycles and does not invent links between alternative producers", () => {
  const claim = { basis: "inferred" as const, rationale: "Test", evidence: [{ source_id: "S1", quote: "Illustrative process evidence." }] };
  const journey = { product: "Test", scope: "Test", gaps: [], places: [], supply_lines: [],
    materials: [{ id: "a", name: "A", ...claim }, { id: "b", name: "B", ...claim }],
    stages: [
      { id: "one", name: "One", inputs: ["a"], outputs: ["b"], tasks: [], ...claim },
      { id: "two", name: "Two", inputs: ["b"], outputs: ["a"], tasks: [], ...claim },
    ],
  };
  assert.throws(() => serializeJourney(journey, "cycle"), /cycle/);
  const sources = [{ id: "S1", url: "https://example.com", content: claim.evidence[0].quote }];
  assert.throws(() => validateJourney({ ...journey, dependencies: [
    { id: "d", source_process_id: "one", target_process_id: "two", material_ids: ["a"], ...claim },
  ] }, sources), /must be an output/);
  const alternative = { ...journey, stages: [journey.stages[0], { ...journey.stages[0], id: "other" }, { ...journey.stages[1], outputs: ["b"] }] };
  const graph = serializeJourney(alternative, "alternatives");
  assert.equal(graph.edges.length, 0);
  assert.ok(graph.gaps.some((gap) => gap.includes("Ambiguous")));
});

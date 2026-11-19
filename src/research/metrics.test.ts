import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { processMetricSchema } from "./metrics.js";
import { validateJourney } from "./journey.js";
import { persist } from "./store.js";

const quote = "Measured electricity consumption was 2 kWh per kg of yarn.";
const basis = { material_id: "yarn", quantity: 1, unit: "kg", specification: "Yarn at specified test quality" };
const metric = { id: "electricity", category: "energy", name: "Electricity", scenario: "baseline", status: "reported",
  value: 2, range: null, unit: "kWh", output_basis: basis, currency: null, location: null, source_period: null,
  technology: null, assumptions: [], rationale: "Test fixture measurement", evidence: [{ source_id: "S1", quote }] };
test("metrics require sourced values, proper ranges and currency, and preserve unknown", () => {
  assert.equal(processMetricSchema.parse(metric).value, 2);
  for (const bad of [
    { ...metric, evidence: [] }, { ...metric, status: "unknown" },
    { ...metric, value: null, range: { low: 4, high: 1 } },
    { ...metric, category: "resource_cost" },
  ]) assert.throws(() => processMetricSchema.parse(bad));
  assert.equal(processMetricSchema.parse({ ...metric, status: "unknown", value: null, evidence: [] }).value, null);
});
test("process metrics verify source passages and persist with their unit basis and provenance", () => {
  const sources = [{ id: "S1", url: "https://example.com/benchmark", content: quote }];
  const claim = { basis: "documented", rationale: "Fixture", evidence: metric.evidence };
  const input = { product: "Yarn", scope: "Fixture", gaps: [], places: [], supply_lines: [],
    materials: [{ id: "fiber", name: "Fiber", ...claim }, { id: "yarn", name: "Yarn", ...claim }],
    stages: [{ id: "spin", name: "Spinning", inputs: ["fiber"], outputs: ["yarn"], tasks: ["Spin yarn"],
      output_basis: basis, metrics: [metric], automation: [], ...claim }],
  };
  const journey = validateJourney(input, sources);
  const assessment = { task: "Spin yarn", technical_feasibility: "unknown", economic_viability: "unknown",
    output_basis: basis, rationale: "Insufficient evidence", constraints: [], evidence: [] };
  assert.equal(validateJourney({ ...input, stages: [{ ...input.stages[0], automation: [assessment] }] }, sources).stages[0].automation?.[0].task, "Spin yarn");
  assert.throws(() => validateJourney({ ...input, stages: [{ ...input.stages[0], automation: [{ ...assessment, task: "Automatic yarn spinning" }] }] }, sources),
    /Automation task must belong to spin: automation\[0\].task="Automatic yarn spinning"; expected an exact entry from tasks=\["Spin yarn"\]/);
  assert.throws(() => validateJourney({ ...input, stages: [{ ...input.stages[0], metrics: [{ ...metric, evidence: [{ source_id: "S1", quote: "Fabricated quantitative claim about energy." }] }] }] }, sources), /quote not found/);
  assert.throws(() => validateJourney({ ...input, stages: [{ ...input.stages[0], metrics: [{ ...metric, output_basis: { ...basis, material_id: "fiber" } }] }] }, sources), /output basis/);
  const directory = mkdtempSync(join(tmpdir(), "trace-metrics-"));
  try {
    const path = join(directory, "db.sqlite3");
    persist(path, { id: "metrics-test" }, sources, [], journey);
    const db = new DatabaseSync(path);
    try {
      const saved = JSON.parse(String(db.prepare("SELECT metric_json FROM process_metrics").get()?.metric_json));
      assert.equal(saved.output_basis.unit, "kg"); assert.equal(saved.evidence[0].source_id, "S1");
      const graph = JSON.parse(String(db.prepare("SELECT graph_json FROM product_graphs").get()?.graph_json));
      assert.equal(graph.nodes[0].attributes.metrics[0].value, 2);
    } finally { db.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { validateTasks, type Source } from "./schema.js";
import { persist } from "./store.js";

const sources: Source[] = [{
  id: "S1", url: "https://example.com/manual", content: "Operators inspect molded parts for surface defects.",
}];
const task = {
  name: "Inspect molded parts", action: "inspect", object: "molded parts", outcome: "defects identified",
  process: "injection molding", scope_note: "Operator manual example",
  evidence: [{ source_id: "S1", quote: sources[0].content }],
};

test("validates quotations and keeps unmeasured labor unknown", () => {
  const tasks = validateTasks({ tasks: [task] }, sources);
  assert.equal(tasks[0].labor_share, null);
  assert.equal(tasks[0].cycle_time_seconds, null);
  assert.throws(() => validateTasks({ tasks: [{ ...task, evidence: [
    { source_id: "S1", quote: "Operators spend 50 percent of their time inspecting parts." },
  ] }] }, sources), /Quote not found/);
  assert.throws(() => validateTasks({ tasks: [{ ...task, evidence: [
    { source_id: "S99", quote: sources[0].content },
  ] }] }, sources), /Quote not found/);
  assert.throws(() => validateTasks({ tasks: [task, task] }, sources), /Duplicate task/);
});

test("SQLite retains runs and rolls back partial inserts on source collision", () => {
  const directory = mkdtempSync(join(tmpdir(), "trace-unseen-test-"));
  const path = join(directory, "research.sqlite3");
  try {
    const tasks = validateTasks({ tasks: [task] }, sources);
    persist(path, { id: "good" }, sources, tasks);
    assert.throws(() => persist(path, { id: "bad" }, [sources[0], sources[0]], tasks));
    const db = new DatabaseSync(path);
    try {
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM research_runs").get()?.n, 1);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM source_documents").get()?.n, 1);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM task_findings").get()?.n, 1);
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { db.close(); }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOutput } from "./parse-output.js";
import { normalizeEvidence } from "./evidence.js";
test("repairs extra closing braces without changing string content", () => {
  const result = parseOutput('{"gaps":["Unknown factory."}]}');
  assert.deepEqual(result.value, { gaps: ["Unknown factory."] });
  assert.equal(result.repaired, true);
});
test("quote matching tolerates markup but not changed numerical claims", () => {
  assert.equal(normalizeEvidence("About **44%** of revenue"), "About 44% of revenue");
  assert.notEqual(normalizeEvidence("About **44%** of revenue"), normalizeEvidence("About 45% of revenue"));
});

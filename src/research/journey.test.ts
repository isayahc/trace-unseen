import { test } from "node:test";
import assert from "node:assert/strict";
import { validateJourney } from "./journey.js";

const sources = [{ id: "S1", url: "https://example.com", content: "Resin pellets are molded into plastic housings." }];
const claim = { basis: "documented", rationale: "Example process", evidence: [{ source_id: "S1", quote: sources[0].content }] };
const example = {
  product: "Housing", scope: "Typical process", gaps: ["Geographic coverage pending"],
  materials: [{ id: "resin", name: "Resin", ...claim }, { id: "housing", name: "Housing", ...claim }],
  stages: [{ id: "molding", name: "Molding", inputs: ["resin"], outputs: ["housing"], tasks: [], ...claim }],
  places: [], supply_lines: [],
};
test("journeys reject broken material references and fabricated quotations", () => {
  assert.equal(validateJourney(example, sources).stages.length, 1);
  assert.throws(() => validateJourney({ ...example, stages: [{ ...example.stages[0], inputs: ["missing"] }] }, sources), /Unknown journey reference/);
  assert.throws(() => validateJourney(example, [{ ...sources[0], content: "Unrelated source text" }]), /quote not found/);
});

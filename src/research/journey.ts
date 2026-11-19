import { z } from "zod";
import type { Source } from "./schema.js";
import { normalizeEvidence } from "./evidence.js";
import { assertDag } from "./dependencies.js";
import { outputBasisSchema, processMetricSchema, automationSchema } from "./metrics.js";

const text = z.string().trim().min(1);
const evidence = z.array(z.object({ source_id: text, quote: z.string().min(15) })).min(1);
const claim = { evidence, basis: z.enum(["documented", "inferred"]), rationale: text };
export const journeySchema = z.object({
  product: text,
  scope: text,
  materials: z.array(z.object({ id: text, name: text, ...claim })).min(1),
  stages: z.array(z.object({
    id: text, name: text, inputs: z.array(text).min(1), outputs: z.array(text).min(1),
    tasks: z.array(text), ...claim,
    output_basis: outputBasisSchema.nullable().optional(),
    metrics: z.array(processMetricSchema).optional(),
    automation: z.array(automationSchema).optional(),
  })).min(1),
  places: z.array(z.object({
    id: text, name: text, country_or_region: text,
    kind: z.enum(["country", "region", "city", "port", "facility"]),
    significance: text, stage_ids: z.array(text), ...claim,
  })),
  supply_lines: z.array(z.object({
    id: text, from_place_id: text, to_place_id: text, material_ids: z.array(text).min(1),
    transport_mode: text.nullable(), description: text, ...claim,
  })),
  gaps: z.array(text),
  // Absent only for older research snapshots. New agents provide explicit dependencies.
  dependencies: z.array(z.object({
    id: text, source_process_id: text, target_process_id: text,
    material_ids: z.array(text).min(1), ...claim,
  })).optional(),
});
export type Journey = z.infer<typeof journeySchema>;

export function validateJourney(value: unknown, sources: Source[]): Journey {
  const journey = journeySchema.parse(value);
  const ids = (items: { id: string }[]) => {
    const result = new Set(items.map((item) => item.id));
    if (result.size !== items.length) throw new Error("Duplicate journey IDs");
    return result;
  };
  const materials = ids(journey.materials), stages = ids(journey.stages), places = ids(journey.places);
  ids(journey.supply_lines);
  ids(journey.dependencies ?? []);
  const requireIDs = (refs: string[], known: Set<string>) => {
    for (const ref of refs) if (!known.has(ref)) throw new Error(`Unknown journey reference: ${ref}`);
  };
  for (const stage of journey.stages) requireIDs([...stage.inputs, ...stage.outputs], materials);
  for (const stage of journey.stages) {
    ids(stage.metrics ?? []);
    const bases = [stage.output_basis, ...(stage.metrics ?? []).map((m) => m.output_basis), ...(stage.automation ?? []).map((a) => a.output_basis)];
    for (const basis of bases) if (basis && !stage.outputs.includes(basis.material_id)) throw new Error(`Metric output basis must reference an output of ${stage.id}`);
    for (const assessment of stage.automation ?? []) if (!stage.tasks.includes(assessment.task)) throw new Error(`Automation task must belong to ${stage.id}`);
  }
  for (const place of journey.places) requireIDs(place.stage_ids, stages);
  for (const dependency of journey.dependencies ?? []) {
    requireIDs([dependency.source_process_id, dependency.target_process_id], stages);
    requireIDs(dependency.material_ids, materials);
    const source = journey.stages.find((s) => s.id === dependency.source_process_id)!;
    const target = journey.stages.find((s) => s.id === dependency.target_process_id)!;
    for (const id of dependency.material_ids) {
      if (!source.outputs.includes(id) || !target.inputs.includes(id)) throw new Error(`Dependency material ${id} must be an output of its source and input of its target`);
    }
  }
  assertDag([...stages], (journey.dependencies ?? []).map((d) => ({ source: d.source_process_id, target: d.target_process_id })));
  for (const line of journey.supply_lines) {
    requireIDs([line.from_place_id, line.to_place_id], places);
    requireIDs(line.material_ids, materials);
  }
  const normalize = normalizeEvidence;
  for (const item of [...journey.materials, ...journey.stages, ...journey.places, ...journey.supply_lines, ...(journey.dependencies ?? []), ...journey.stages.flatMap((s) => [...(s.metrics ?? []), ...(s.automation ?? [])])]) {
    for (const citation of item.evidence) {
      const source = sources.find((s) => s.id === citation.source_id);
      if (!source || !normalize(source.content).includes(normalize(citation.quote))) {
        throw new Error(`Journey quote not found in ${citation.source_id}`);
      }
    }
  }
  return journey;
}

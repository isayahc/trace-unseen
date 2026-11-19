import type { Journey } from "./journey.js";
import { assertDag } from "./dependencies.js";

export type GraphNode = {
  id: string; kind: "process"; label: string;
  basis: "documented" | "inferred"; rationale: string; evidence: Journey["stages"][number]["evidence"];
  attributes: {
    inputs: Journey["materials"]; outputs: Journey["materials"];
    locations: Journey["places"]; tasks: string[];
  };
};
export type GraphEdge = {
  id: string; kind: "process_dependency"; source: string; target: string;
  basis: "documented" | "inferred"; rationale: string; evidence: GraphNode["evidence"];
  attributes: { materials: Journey["materials"]; derivation: "explicit" | "legacy_material_match" };
};
export type ProductGraph = {
  schemaVersion: 2; runId: string; product: string; scope: string;
  nodes: GraphNode[]; edges: GraphEdge[]; gaps: string[];
};

/** Process is the primary entity: P(candidate locations, inputs) -> outputs. */
export function serializeJourney(journey: Journey, runId: string): ProductGraph {
  const gaps = [...journey.gaps];
  const materials = (ids: string[]) => ids.map((id) => {
    const material = journey.materials.find((m) => m.id === id);
    if (!material) throw new Error(`Unknown material: ${id}`);
    return material;
  });
  const nodes: GraphNode[] = journey.stages.map((stage) => ({
    id: `process:${stage.id}`, kind: "process", label: stage.name, basis: stage.basis,
    rationale: stage.rationale, evidence: stage.evidence,
    attributes: { inputs: materials(stage.inputs), outputs: materials(stage.outputs),
      locations: journey.places.filter((place) => place.stage_ids.includes(stage.id)), tasks: stage.tasks },
  }));
  const edges: GraphEdge[] = [];
  if (journey.dependencies !== undefined) {
    for (const d of journey.dependencies) edges.push({
      id: `dependency:${d.id}`, kind: "process_dependency", source: `process:${d.source_process_id}`, target: `process:${d.target_process_id}`,
      basis: d.basis, evidence: d.evidence, rationale: d.rationale,
      attributes: { materials: materials(d.material_ids), derivation: "explicit" },
    });
  } else {
    // Older snapshots have no dependency claims. Infer only unambiguous producers;
    // alternative producers are not silently expanded into all-to-all connections.
    for (const target of journey.stages) {
      const matches = new Map<string, string[]>();
      for (const input of target.inputs) {
        const producers = journey.stages.filter((s) => s.id !== target.id && s.outputs.includes(input));
        if (producers.length > 1) {
          gaps.push(`Ambiguous producer for ${input} entering ${target.name}; no dependency inferred.`);
        } else if (producers.length === 1) {
          const id = producers[0].id;
          matches.set(id, [...(matches.get(id) ?? []), input]);
        }
      }
      for (const [sourceId, ids] of matches) {
        const source = journey.stages.find((s) => s.id === sourceId)!;
        edges.push({ id: `dependency:${sourceId}:${target.id}`, kind: "process_dependency",
          source: `process:${sourceId}`, target: `process:${target.id}`, basis: "inferred",
          rationale: "Inferred from matching material outputs and inputs in an older snapshot; not a documented facility-to-facility connection.",
          evidence: [...source.evidence, ...target.evidence],
          attributes: { materials: materials(ids), derivation: "legacy_material_match" },
        });
      }
    }
  }
  if (new Set(nodes.map((n) => n.id)).size !== nodes.length || new Set(edges.map((e) => e.id)).size !== edges.length) throw new Error("Duplicate graph IDs");
  assertDag(nodes.map((n) => n.id), edges);
  return { schemaVersion: 2, runId, product: journey.product, scope: journey.scope, nodes, edges, gaps };
}

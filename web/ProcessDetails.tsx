import type { GraphNode, GraphEdge } from "../src/research/graph.js";
export type Sources = { id: string; url: string }[];
export function Evidence({ evidence, sources }: { evidence: GraphNode["evidence"]; sources: Sources }) {
  return <details><summary>{evidence.length} evidence excerpts</summary>{evidence.map((e, i) => {
    const source = sources.find((s) => s.id === e.source_id);
    return <blockquote key={i}>{e.quote} {source && <a target="_blank" rel="noreferrer" href={source.url}>{e.source_id} ↗</a>}</blockquote>;
  })}</details>;
}
export function ProcessDetails({ selected, sources }: { selected: GraphNode | GraphEdge; sources: Sources }) {
  return <><h4>{selected.kind === "process" ? selected.label : "Material handoff between processes"}</h4><span className="badge">{selected.basis}</span><p>{selected.rationale}</p>
    {selected.kind === "process" ? <>
      {(["inputs", "outputs"] as const).map((key) => <section key={key}><h4>{key === "inputs" ? "Input materials" : "Output materials"}</h4>{selected.attributes[key].map((m) => <div key={m.id}><p>{m.name} · {m.basis}</p><Evidence evidence={m.evidence} sources={sources}/></div>)}</section>)}
      <h4>Tasks</h4><ul>{selected.attributes.tasks.map((t) => <li key={t}>{t}</li>)}</ul>
      <h4>Per-output-unit metrics</h4>
      <p>{selected.attributes.outputBasis ? `Basis: ${selected.attributes.outputBasis.quantity} ${selected.attributes.outputBasis.unit} — ${selected.attributes.outputBasis.specification}` : "Output basis not researched yet."}</p>
      {!selected.attributes.metrics?.length && <p>Energy, material consumption, waste, cost, labor, yield and throughput are not yet quantified. Missing values are not zero.</p>}
      {(selected.attributes.metrics ?? []).map((metric) => <section className="metric-card" key={metric.id}>
        <h4>{metric.name}</h4><span className="badge">{metric.scenario.replaceAll("_", " ")} · {metric.status}</span>
        <p><strong>{metric.status === "unknown" ? "Unknown" : metric.range ? `${metric.range.low}–${metric.range.high}` : metric.value} {metric.status !== "unknown" && metric.unit} {metric.currency ?? ""}</strong></p>
        <p>{metric.category === "throughput" ? "Output specification" : "Per"}: {metric.output_basis.quantity} {metric.output_basis.unit} — {metric.output_basis.specification}</p>
        <p>Location: {metric.location ?? "unknown"} · Period: {metric.source_period ?? "unknown"} · Technology: {metric.technology ?? "unknown"}</p>
        <p>{metric.rationale}</p>{metric.assumptions.length > 0 && <ul>{metric.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>}
        <Evidence evidence={metric.evidence} sources={sources}/>
      </section>)}
      <h4>Task automation assessment</h4>
      {!selected.attributes.automation?.length && <p>Not assessed yet. No automation score has been assumed.</p>}
      {(selected.attributes.automation ?? []).map((assessment, i) => <section className="metric-card" key={i}>
        <h4>{assessment.task}</h4><p>Technical: {assessment.technical_feasibility.replaceAll("_", " ")} · Economic: {assessment.economic_viability}</p>
        <p>Basis: {assessment.output_basis.quantity} {assessment.output_basis.unit} — {assessment.output_basis.specification}</p>
        <p>{assessment.rationale}</p><ul>{assessment.constraints.map((c) => <li key={c}>{c}</li>)}</ul><Evidence evidence={assessment.evidence} sources={sources}/>
      </section>)}
      <h4>Candidate locations / alternatives</h4>{!selected.attributes.locations.length && <p>Location unknown.</p>}{selected.attributes.locations.map((p) => <div key={p.id}><p>{p.name}</p><p>{p.rationale}</p><Evidence evidence={p.evidence} sources={sources}/></div>)}
    </> : <p>Transferred: {selected.attributes.materials.map((m) => m.name).join(", ")}</p>}
    <h4>Process / dependency evidence</h4><Evidence evidence={selected.evidence} sources={sources}/>
  </>;
}

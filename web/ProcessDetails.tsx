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
      <h4>Candidate locations / alternatives</h4>{!selected.attributes.locations.length && <p>Location unknown.</p>}{selected.attributes.locations.map((p) => <div key={p.id}><p>{p.name}</p><p>{p.rationale}</p><Evidence evidence={p.evidence} sources={sources}/></div>)}
    </> : <p>Transferred: {selected.attributes.materials.map((m) => m.name).join(", ")}</p>}
    <h4>Process / dependency evidence</h4><Evidence evidence={selected.evidence} sources={sources}/>
  </>;
}

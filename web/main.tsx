import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { GeographicProcesses } from "./GeographicProcesses.js";
import type { Journey } from "../src/research/journey.js";
import "./style.css";
import { ProductGraph } from "./ProductGraph.js";
import type { ProductGraph as Graph } from "../src/research/graph.js";
import { AutomationSpaces } from "./AutomationSpaces.js";

type Snapshot = { id: string; createdAt: string; journey: Journey; graph: Graph; sources: { id: string; url: string }[] };
type Job = { id: string; product: string; status: "running" | "completed" | "failed"; stage: string; runId?: string };
function App() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [view, setView] = useState<"graph" | "globe" | "spaces">("globe");
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState("");
  const [job, setJob] = useState<Job>();
  const [starting, setStarting] = useState(false);
  const [jobError, setJobError] = useState("");
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/journeys");
      if (!response.ok) throw new Error("Could not load saved research.");
      const data = await response.json(); setSnapshots(data.snapshots); setIndex(0); setSelected(undefined);
    } catch (error) { setError(String(error)); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const id = localStorage.getItem("trace-unseen-job");
    if (id) fetch(`/api/research/${encodeURIComponent(id)}`).then((r) => r.ok ? r.json() : undefined).then((value) => { if (value) setJob(value); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (job?.status !== "running") return;
    const controller = new AbortController();
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/research/${job.id}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Could not fetch job progress");
        const updated: Job = await response.json(); setJob(updated); setJobError("");
        if (updated.status === "completed") { localStorage.removeItem("trace-unseen-job"); await load(); }
      } catch { if (!controller.signal.aborted) setJobError("Progress temporarily unavailable; retrying…"); }
    }, 2500);
    return () => { clearInterval(timer); controller.abort(); };
  }, [job?.id, job?.status]);
  async function startResearch(event: React.FormEvent) {
    event.preventDefault(); setStarting(true); setJobError("");
    try {
      const response = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: product.trim() }) });
      const result = await response.json();
      if (!response.ok) {
        if (result.job) { setJob(result.job); localStorage.setItem("trace-unseen-job", result.job.id); }
        throw new Error(result.error ?? "Could not start research");
      }
      setJob(result); localStorage.setItem("trace-unseen-job", result.id);
    } catch (error) { setJobError(error instanceof Error ? error.message : String(error)); }
    finally { setStarting(false); }
  }
  const snapshot = snapshots[index];
  const journey = snapshot?.journey;
  function citations(evidence: Journey["materials"][number]["evidence"]) {
    return <details><summary>{evidence.length} source excerpts</summary>{evidence.map((e, i) => {
      const source = snapshot.sources.find((s) => s.id === e.source_id);
      return <blockquote key={i}>“{e.quote}” {source && <a href={source.url} target="_blank" rel="noreferrer">{e.source_id} ↗</a>}</blockquote>;
    })}</details>;
  }
  return <><header><div><span className="brand">TRACE / UNSEEN</span><p>Material journeys. A world of connections.</p></div><button onClick={() => void load()}>Refresh research ↻</button></header>
    <main className={view === "spaces" ? "spaces-mode" : undefined}><section className="atlas"><div className="atlas-heading"><span className="eyebrow">GLOBAL MATERIAL ATLAS</span><h1>Follow the material.<br/><em>Understand the journey.</em></h1><p>Research snapshots · not live shipments</p></div>
      <nav className="view-switch" aria-label="Visualization"><button aria-pressed={view === "graph"} onClick={() => setView("graph")}>Product graph</button><button aria-pressed={view === "globe"} onClick={() => setView("globe")}>Geographic globe</button><button aria-pressed={view === "spaces"} onClick={() => setView("spaces")}>Automation spaces</button></nav>
      <div className="globe">{view === "spaces" ? <AutomationSpaces/> : snapshot?.graph ? view === "graph" ? <ProductGraph key={snapshot.id} graph={snapshot.graph} sources={snapshot.sources}/> : <GeographicProcesses key={snapshot.id} graph={snapshot.graph} sources={snapshot.sources}/> : <p className="fallback">Select a saved research snapshot to display its processes.</p>}</div>
      <footer>{view === "spaces" ? <><span>SO-101 / Live MuJoCo workspace</span><p>Native-scale articulated robot model · bench-scale sorting · simulated hardware</p></> : <><span>Processes are nodes · Materials travel on arrows</span><p>Locations are candidate attributes. Geographic scenarios do not establish actual supplier routes.</p></>}</footer>
    </section><aside>
      <form onSubmit={startResearch} className="research-form"><label className="eyebrow" htmlFor="product">WHAT WOULD YOU LIKE TO TRACE?</label><input id="product" value={product} onChange={(e) => setProduct(e.target.value)} minLength={3} maxLength={200} required placeholder="e.g. sneakers or Nike fleece hoodie"/><button disabled={starting || job?.status === "running"} type="submit">{starting ? "Starting…" : job?.status === "running" ? "Research in progress…" : "Research product journey →"}</button><div className="examples">{["Sneakers", "Nike fleece hoodie"].map((example) => <button type="button" key={example} onClick={() => setProduct(example)}>{example}</button>)}</div><p>Researches materials, component processes, assembly, places, and possible routes. Uses your configured model and Tavily credits.</p></form>
      {job && <div className="job" role="status"><b>{job.product}</b><p>{job.stage}</p><small>{job.status}</small>{job.runId && <p>Run: <code>{job.runId}</code></p>}</div>}{jobError && <p role="alert">{jobError}</p>}
      {loading && <p role="status">Loading saved research…</p>}{error && <p role="alert">{error}</p>}
      {!loading && !error && !journey && <p>No journeys saved yet. Run <code>npm run research:journey</code>, then refresh.</p>}
      {journey && <><label className="eyebrow" htmlFor="snapshot">RESEARCH SNAPSHOT</label><select id="snapshot" value={index} onChange={(e) => { setIndex(Number(e.target.value)); setSelected(undefined); }}>{snapshots.map((s, i) => <option key={s.id} value={i}>{s.journey.product} · {new Date(s.createdAt).toLocaleDateString()}</option>)}</select>
        <h2>{journey.product}</h2><p>{journey.scope}</p><div className="stats"><b>{journey.stages.length}<small>Stages</small></b><b>{journey.places.length}<small>Places</small></b><b>{journey.supply_lines.length}<small>Possible lines</small></b></div>
        <h3>01 / Transformation journey</h3>{journey.stages.map((stage, i) => <article key={stage.id}><span className="badge">{stage.basis}</span><h4>{i + 1}. {stage.name}</h4><p>{stage.inputs.map((id) => journey.materials.find((m) => m.id === id)?.name).join(" + ")} → {stage.outputs.map((id) => journey.materials.find((m) => m.id === id)?.name).join(" + ")}</p><ul>{stage.tasks.map((t) => <li key={t}>{t}</li>)}</ul><p>{stage.rationale}</p>{citations(stage.evidence)}</article>)}
        <h3>02 / Candidate locations</h3>{journey.places.map((p) => <article className={selected === p.id ? "selected" : ""} key={p.id}><h4>{p.name}</h4><span className="badge">{p.basis}</span><p>{p.significance}</p>{citations(p.evidence)}</article>)}
        <h3>03 / Background supply hypotheses</h3><p>These older regional claims are context, not process dependencies.</p>{journey.supply_lines.map((line) => <article key={line.id}><span className="badge">{line.basis}</span><h4>{journey.places.find((p) => p.id === line.from_place_id)?.name} → {journey.places.find((p) => p.id === line.to_place_id)?.name}</h4><p>{line.description}</p><p>{line.rationale}</p>{citations(line.evidence)}</article>)}
        <h3>04 / Research gaps</h3><ul>{journey.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
      </>}
    </aside></main></>;
}
createRoot(document.getElementById("root")!).render(<App/>);

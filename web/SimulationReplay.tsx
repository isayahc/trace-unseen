import { useEffect, useState } from "react";

type Result = { status: string; engine: string; version: string; simulated_seconds: number; physics_steps: number; warning_count: number; assumptions: string[]; events: { time_s: number; state: string; can?: number; accepted?: number; delivered?: number; rejected?: number }[] };

export function SimulationReplay() {
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    fetch("/simulation/autonomous/result.json", { signal: abort.signal }).then(async r => {
      if (!r.ok) throw new Error("Run the local MuJoCo command to produce execution evidence.");
      setResult(await r.json() as Result);
    }).catch((e: Error) => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, []);
  const complete = result?.events.find(e => e.state === "complete");
  return <article className="simulation-replay">
    <span className="eyebrow">MUJOCO / EXECUTED PHYSICS</span>
    <h3>Autonomous cycle replay</h3>
    <p>Infeed → inspection → quarantine or packing → loaded pallet outfeed</p>
    {error && <p>{error}</p>}
    {result && <>
      <div className="spaces-facts"><span>{result.status === "passed" ? "Cycle passed" : "Cycle failed"}</span><span>{complete?.delivered ?? 0} delivered · {complete?.rejected ?? 0} quarantined</span><span>{result.simulated_seconds.toFixed(1)} simulated seconds</span><span>{result.physics_steps.toLocaleString()} physics steps · {result.warning_count} solver warnings</span></div>
      {result.status === "passed" && <video controls preload="metadata" aria-label="MuJoCo autonomous cell execution replay" src="/simulation/autonomous/replay.mp4"/>}
      <p>Recorded simulation at 5× speed. Serial single-can demonstration with scripted defect classification and ideal vacuum attachment; industrial throughput is unverified.</p>
      <div className="space-downloads"><a href="/simulation/autonomous/result.json">Execution log ↗</a><a href="/simulation/autonomous/telemetry.json">Observed telemetry ↗</a><a href="/simulation/autonomous/model.xml" download>MuJoCo model ↓</a><a href="/simulation/inspection-unavailable/result.json">Inspection fault check ↗</a><a href="/simulation/outfeed-blocked/result.json">Outfeed fault check ↗</a></div>
      <details><summary>Execution stages and model assumptions</summary><p>{result.engine} {result.version}. Final checks require observed support contacts, settled can velocities, pallet containment, and outfeed arrival.</p><ol>{result.events.map((e,i) => <li key={i}>{e.time_s.toFixed(1)}s · {e.state}{e.can !== undefined ? ` · can ${e.can + 1}` : ""}</li>)}</ol><ul>{result.assumptions.map(a => <li key={a}>{a}</li>)}</ul></details>
    </>}
    <p>Run again locally: <code>.venv-mujoco\Scripts\python.exe simulation/autonomous-cell/run.py --video</code></p>
  </article>;
}

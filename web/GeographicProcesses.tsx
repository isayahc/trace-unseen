import { useEffect, useRef, useState } from "react";
import Globe, { type GlobeMethods } from "react-globe.gl";
import type { ProductGraph, GraphNode, GraphEdge } from "../src/research/graph.js";
import { ProcessDetails, type Sources } from "./ProcessDetails.js";

// Display anchors only, not factory coordinates or evidence of a real trade lane.
const anchors: Record<string, [number, number]> = {
  "Saudi Arabia": [24, 45], "United Kingdom": [54, -2], Canada: [56, -106],
  Australia: [-25, 134], "New Zealand": [-41, 174],
  "United States": [39, -98], China: [35, 105], "Middle East": [28, 45], Brazil: [-14, -52],
  Vietnam: [16, 107], Bangladesh: [24, 90], "Southeast Asia": [8, 110], "South Asia": [23, 78],
  Turkey: [39, 35], Istanbul: [41.01, 28.98], India: [22, 79], Indonesia: [-2, 118],
  Cambodia: [13, 105], Pakistan: [30, 70], Europe: [50, 15],
};
export function GeographicProcesses({ graph, sources }: { graph: ProductGraph; sources: Sources }) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<GraphNode | GraphEdge>();
  const [size, setSize] = useState({ width: 700, height: 500 });
  const holder = useRef<HTMLDivElement>(null);
  const globe = useRef<GlobeMethods | undefined>(undefined);
  const [webgl] = useState(() => !!document.createElement("canvas").getContext("webgl2"));
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    if (holder.current) observer.observe(holder.current);
    return () => observer.disconnect();
  }, []);
  const alternatives = new Map(graph.nodes.map((node) => [node.id, [...new Set(node.attributes.locations.flatMap((p) =>
    p.name.includes("Istanbul") ? ["Istanbul"] : p.country_or_region.split(";").map((s) => s.trim())
  ))].filter((region) => anchors[region]) ]));
  // Start with one disclosed candidate per process, not every possible country pair.
  // An explicit empty selection keeps a process unplaced.
  const located = graph.nodes.flatMap((node) => {
    const region = choices[node.id] ?? alternatives.get(node.id)?.[0];
    return region && alternatives.get(node.id)?.includes(region) ? [{ node, region, lat: anchors[region][0], lng: anchors[region][1] }] : [];
  });
  const groups = [...new Set(located.map((p) => p.region))].map((region) => {
    const items = located.filter((p) => p.region === region);
    return { region, lat: items[0].lat, lng: items[0].lng, nodes: items.map((p) => p.node), label: `${region} · ${items.length} processes` };
  });
  const connections = graph.edges.flatMap((edge) => {
    const from = located.find((p) => p.node.id === edge.source), to = located.find((p) => p.node.id === edge.target);
    return from && to ? [{ ...edge, startLat: from.lat, startLng: from.lng, endLat: to.lat, endLng: to.lng,
      local: from.region === to.region, label: `${from.node.label} (${from.region}) → ${to.node.label} (${to.region})` }] : [];
  });
  return <div className="geo-processes">
    <div className="geo-overview"><div className="geo-title"><div><span className="eyebrow">GLOBAL MATERIAL ATLAS</span><h1>Geographic journey</h1></div><span className="geo-count">{located.length}/{graph.nodes.length} processes located</span></div>
      <p>One candidate location per process · illustrative routes, not confirmed suppliers or live shipments.</p>
      <ol className="geo-path" aria-label="Journey processes">{graph.nodes.map((node, index) => {
        const location = located.find((p) => p.node.id === node.id);
        return <li key={node.id}><button aria-pressed={selected?.id === node.id} onClick={() => { setSelected(node); if (location) globe.current?.pointOfView({ lat: location.lat, lng: location.lng, altitude: 1.6 }, 700); }}><b>{index + 1}. {location?.region ?? "Location unknown"}</b><span>{node.label}</span></button></li>;
      })}</ol>
    </div>
    <div className="geo-stage"><div className="geo-canvas" ref={holder}>
    {webgl ? <Globe ref={globe} width={size.width} height={size.height} backgroundColor="#08151d"
      globeImageUrl="https://unpkg.com/three-globe/example/img/earth-night.jpg" atmosphereColor="#45adbb"
      pointsData={groups} pointColor={() => "#51dfcb"} pointRadius={0.6} pointAltitude={0.03}
      labelsData={groups} labelText="label" labelSize={1} labelColor={() => "#c4e9ec"}
      onPointClick={(point) => setSelected((point as typeof groups[number]).nodes[0])}
      arcsData={connections.filter((edge) => !edge.local)} arcColor={() => "#edbc6b"} arcStroke={0.9} arcDashLength={0.35} arcDashGap={0.15} arcDashAnimateTime={2200}
      onArcClick={(edge) => setSelected(edge as typeof connections[number])}
      onGlobeReady={() => globe.current?.pointOfView({ lat: 20, lng: 25, altitude: 1.6 })}
    /> : <p>WebGL is unavailable; use the process/location selectors below.</p>}
    </div>{selected && <article className="geo-selection"><button onClick={() => setSelected(undefined)}>Close details</button><ProcessDetails selected={selected} sources={sources}/></article>}</div>
    <div className="geo-connections">
    <p>{connections.filter((e) => !e.local).length} geographic links · {connections.filter((e) => e.local).length} same-region handoffs. Process order can branch; arrows follow the saved dependencies.</p>
    <details><summary>Change candidate locations</summary>{graph.nodes.map((node) => <label className="location-choice" key={node.id}>{node.label}<select aria-label={`Location for ${node.label}`} value={choices[node.id] ?? alternatives.get(node.id)?.[0] ?? ""} onChange={(e) => { setChoices({ ...choices, [node.id]: e.target.value }); setSelected(node); }}>
      <option value="">Unplaced / unknown</option>{alternatives.get(node.id)!.map((region) => <option key={region} value={region}>{region} (candidate)</option>)}
    </select></label>)}</details>
    <details><summary>View process handoffs ({connections.length})</summary><div className="geo-handoffs">{connections.map((edge) => <button key={edge.id} onClick={() => setSelected(edge)}>{edge.label}</button>)}</div></details>
  </div></div>;
}

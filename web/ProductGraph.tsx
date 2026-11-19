import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MiniMap, Position, MarkerType, type Node, type Edge } from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import type { ProductGraph as Graph, GraphNode, GraphEdge } from "../src/research/graph.js";
import "@xyflow/react/dist/style.css";
import { ProcessDetails } from "./ProcessDetails.js";

const colors = { material: "#5cddc2", process: "#8fb9ff", place: "#efbf72" };
export function ProductGraph({ graph, sources }: { graph: Graph; sources: { id: string; url: string }[] }) {
  const [selected, setSelected] = useState<GraphNode | GraphEdge>();
  const { nodes, edges } = useMemo(() => {
    const layout = new dagre.graphlib.Graph({ multigraph: true });
    layout.setGraph({ rankdir: "LR", nodesep: 35, ranksep: 100, marginx: 30, marginy: 30 });
    layout.setDefaultEdgeLabel(() => ({}));
    for (const node of graph.nodes) layout.setNode(node.id, { width: 290, height: 210 });
    for (const edge of graph.edges) layout.setEdge(edge.source, edge.target, {}, edge.id);
    dagre.layout(layout);
    const nodes: Node[] = graph.nodes.map((node) => ({
      id: node.id, position: { x: layout.node(node.id).x - 145, y: layout.node(node.id).y - 105 },
      sourcePosition: Position.Right, targetPosition: Position.Left,
      data: { label: <><small style={{ color: colors[node.kind] }}>PROCESS</small><strong>{node.label}</strong><div className="process-summary"><div><b>IN</b> {node.attributes.inputs.map((m) => m.name).join(", ")}</div><div><b>OUT</b> {node.attributes.outputs.map((m) => m.name).join(", ")}</div><div><b>WHERE</b> {node.attributes.locations.map((p) => p.country_or_region).join(" / ") || "Unknown"}</div></div><small>{node.basis} · click for details</small></> },
      style: { width: 290, height: 210, background: "#102b38", color: "#eef7fb", border: `1px solid ${colors[node.kind]}`, borderRadius: 10 },
    }));
    const edges: Edge[] = graph.edges.map((edge) => ({
      id: edge.id, source: edge.source, target: edge.target,
      label: edge.attributes.materials.map((m) => m.name).join(" + "),
      markerEnd: { type: MarkerType.ArrowClosed, color: edge.basis === "inferred" ? "#efbf72" : "#80c5c9" },
      style: { stroke: edge.basis === "inferred" ? "#efbf72" : "#80c5c9", strokeWidth: 1.8, strokeDasharray: edge.basis === "inferred" ? "6 4" : undefined },
      labelStyle: { fill: "#d8e8ed", fontSize: 10 }, labelBgStyle: { fill: "#102530" },
    }));
    return { nodes, edges };
  }, [graph]);
  return <div className="product-graph">
    <div className="graph-legend"><b>{nodes.length} processes · {edges.length} dependencies</b><span>P(locations, input materials) → output materials</span><small>Arrows carry materials. Dashed dependencies are inferred.</small></div>
    <ReactFlow key={graph.runId} nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.05} maxZoom={2.5}
      nodesDraggable={false} nodesConnectable={false}
      onNodeClick={(_, node) => setSelected(graph.nodes.find((item) => item.id === node.id))}
      onEdgeClick={(_, edge) => setSelected(graph.edges.find((item) => item.id === edge.id))}>
      <Background color="#284551" gap={24}/><Controls showInteractive={false}/><MiniMap pannable zoomable nodeColor={(node) => colors[graph.nodes.find((n) => n.id === node.id)!.kind]}/>
    </ReactFlow>
    {selected && <section className="graph-detail"><button aria-label="Close graph details" onClick={() => setSelected(undefined)}>×</button><ProcessDetails selected={selected} sources={sources}/></section>}
  </div>;
}

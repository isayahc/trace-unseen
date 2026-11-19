# Process-first product graph (schema version 2)

The primary entity is a process: **P(candidate locations, inputs) → outputs**.
Materials and places remain reusable research records, but are not peer graph nodes.

## Backend pipeline

1. A product such as `Nike fleece hoodie` creates an SDK research session.
2. The agent identifies stages, materials, candidate places, and explicit process
   dependencies. Each dependency specifies its source process, target process,
   transferred materials, evidence, and documented/inferred status.
3. Validation checks quotes, IDs, matching source outputs/target inputs, and that
   dependencies are acyclic. Self-dependencies and cycles are rejected.
4. `serializeJourney` creates a deterministic, process-only graph.
5. SQLite saves the sources, research, graph snapshot, process nodes and dependency
   edges transactionally. `graph.json` is the equivalent UI payload.

## UI contract

`GET /api/journeys` returns snapshots with `journey`, `sources`, and `graph`.
Graph fields: `schemaVersion: 2`, `runId`, `product`, `scope`, `nodes`, `edges`, `gaps`.

- Every node has `kind: process`. Its attributes contain complete input and output
  material records, candidate location records, and tasks.
- Every edge has `kind: process_dependency`. Its attributes contain transferred
  material records and its derivation (`explicit` or `legacy_material_match`).
- Evidence, rationale, and documented/inferred basis are retained on each claim.
- IDs are stable within a snapshot, not globally resolved across research runs.

The DAG labels arrows with materials. Clicking a process expands inputs, outputs,
tasks, candidate locations, and evidence. The geographic view uses the same process
graph: one candidate location per process is initially selected to show a route
immediately; change or clear these selections to explore other scenarios. Processes
at the same location share a geographic marker, and same-region handoffs remain
listed. Processes without known candidate anchors stay unplaced. No Cartesian
expansion of alternative origin/destination countries is performed. Display anchors are not
factory coordinates or confirmation of any product-specific shipping route.

## Existing research

Older snapshots without explicit dependencies infer a connection only where an
input material has exactly one other producing stage. These edges are marked
inferred. Ambiguous producers are recorded as gaps, not expanded into many edges.
An explicit empty dependency list remains empty.

`src/jobs/migrate-process-graphs.ts` refreshes existing SQLite graph projections,
archives version-1 graphs in `product_graph_history`, and writes `graph-v2.json`
alongside old artifacts. Original research and model responses remain intact.
New research saves version 2 directly. No API calls are needed for migration.

## Debug

In VS Code choose **Debug product graph — Nike fleece hoodie** and press F5.
Useful breakpoints: `src/jobs/discover-tasks.ts`, `src/tools/tavily.ts`,
`src/research/journey.ts`, `src/research/graph.ts`, and `src/research/store.ts`.

CLI: `npm.cmd run research:journey -- --product "Nike fleece hoodie"`.
`--sources data/runs/<run-id>/sources.json` reuses evidence but makes a new model call.

Without a SKU or material label, garment composition and processing choices remain
scoped assumptions. Country-level cotton imports do not prove local cotton growing
or a particular Nike factory assignment; the evidence and gaps must be reviewed.

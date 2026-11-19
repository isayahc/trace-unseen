# Aluminum can: hackathon evidence pack

**Story:** an ordinary can hides seven industrial transformations. Compare primary
and recycled feedstock, expose resource use, and show where task automation is
already demonstrated. Every number opens to captured source text.

## Load the saved demo (no API keys or research calls)

```powershell
npm.cmd run demo:load
npm.cmd run dev
```

Select **Aluminum beverage can — primary vs recycled** in the app. The snapshot
contains 7 processes, 6 dependencies, 14 quantitative metrics (12 reported and
2 explicit cost scenarios), 7 task assessments (2 demonstrated; 5 unknown), and
18 source documents. Two feedstock branches converge on rolling. Recycling feed
comes from a prior product generation, preserving an acyclic production graph.

## Files

- `journey.json`: reviewed processes, per-output-unit metrics, automation and locations.
- `graph.json`: frontend-ready process DAG, materials and geographic candidates.
- `sources.json`: full captured extraction text, source URLs and content hashes.
- `metrics.csv`: flat metric export; full assumptions/evidence remain in journey JSON.
- `highlights.json`: route-level energy comparison, additional evidence, narrative
  sequence, commercial line capacity, and approximately 60-day circularity claim.
- `manifest.json`: provenance, source agent run and curation notes.

## Five reveal moments

1. Start at a can; expose primary and recycled routes on the globe/DAG.
2. Refining needs **2–3 tonnes of bauxite** and produces **1–1.5 tonnes of residue**
   per tonne of alumina (IAI). Residue moisture basis is unspecified.
3. Smelting needs **14–15 MWh electricity per tonne of metal** (JRC).
4. IAI's route comparison is **186 vs 8.3 GJ primary energy per tonne**—about
   **95.5% less** for recycled production. This is not smelting-only electricity,
   not a can-specific saving, and not an apples-to-apples matched-factory experiment.
5. Show a vendor-documented **1,800 cans/minute** line and source-backed mechanical
   sorting. These establish technical examples, not measured worker displacement.

The highlights are raw data for a future comparison interaction; the current UI
shows the saved graph and process details, not a newly implemented scenario slider.

## Units and boundaries

- Mining/refining/smelting/recycling: process-specific tonne of output.
- Rolling: 1,000 kg sheet (LCA table 3-2).
- Forming: 1,000 average North American cans/lids (2016 reference-year LCA).
- New Zealand rated line capacity is a separate benchmark; do not combine its
  throughput with North American LCA electricity to derive power or per-can savings.
- Cost scenarios: 2–3 × $31 = **$62–93 bauxite input cost per tonne alumina**;
  2 × $595 = **$1,190 purchased alumina per tonne aluminum**. Prices are USGS U.S.
  import unit values, Jan–Aug 2025, f.a.s. They exclude energy, labor and capital;
  they are not costs of the Saudi candidate facilities. Do not sum intermediate
  purchase costs with upstream input costs. Ore grade/moisture compatibility is
  an explicit assumption in the bauxite estimate.
- Full bill of materials, monetary totals, labor times and automation payback remain
  unknown. Waste for recovery is distinguished from disposal.
- Geographic candidates combine historical facility examples and regional LCA
  coverage. Cross-border arcs are illustrative, not established shipments.

## Review notes

The exploratory agent run failed validation. This fixture is a separately curated
snapshot, not its unreviewed response. Full saved extraction bodies restored text
that the agent's 24,000-character source window omitted. Supporting passages replace
title-only references and wrong source IDs. Quantities are retained on their correct
boundaries; route-level totals live outside process metrics.

LCA narrative says approximately 3 kg can scrap; table 3-3 says 2.50 kg. We use
the table value and preserve the discrepancy. The extracted thermal-energy row
has an ambiguous `kg` unit, so that numeric claim is omitted pending verification.

Raw search/extraction responses and the original model answer remain locally at
`data/runs/2026-11-19T20-09-46-797Z-a871b66e/`. Supplemental extraction and working
copies live at `data/demo/aluminum-can/`. This portable pack is sufficient for
offline import; no credentials or SDK session messages are included.

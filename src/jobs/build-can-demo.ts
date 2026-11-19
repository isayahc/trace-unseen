import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { validateJourney, type Journey } from "../research/journey.js";
import { normalizeEvidence } from "../research/evidence.js";
import { serializeJourney } from "../research/graph.js";
import { persist } from "../research/store.js";
import type { Source } from "../research/schema.js";

// Offline curation of one demo instance. The original agent run remains untouched.
const original = "2026-11-19T20-09-46-797Z-a871b66e";
const directory = "data/demo/aluminum-can";
const rawDirectory = join("data/runs", original);
const captured: Source[] = JSON.parse(await readFile(join(rawDirectory, "sources.json"), "utf8"));
const extracts = (await Promise.all([1, 2, 3].map(async (i) => JSON.parse(await readFile(join(rawDirectory, `extract-${i}.json`), "utf8"))))).flatMap((x) => x.results) as { url: string; raw_content: string }[];
const sources: Source[] = captured.map((s) => {
  const content = extracts.find((e) => e.url === s.url)?.raw_content ?? s.content;
  return { ...s, content, content_sha256: createHash("sha256").update(content).digest("hex"), truncated_for_model: false };
});
sources.push(...JSON.parse(await readFile(join(directory, "curated-sources.json"), "utf8")));
function ev(source_id: string, quote: string) {
  const source = sources.find((s) => s.id === source_id);
  if (!source || !normalizeEvidence(source.content).includes(normalizeEvidence(quote))) throw new Error(`Missing reviewed quote ${source_id}: ${quote}`);
  return [{ source_id, quote }];
}
const refineryEvidence = ev("C8", "After the bauxite is mined, it is refined into alumina before it is ready to be reduced to primary aluminium.");
const smeltingEvidence = ev("C8", "At the smelter, the alumina – now a powder – goes through the Hall–Héroult electrochemical process to convert it into aluminium metal.");
const mineEvidence = ev("S4", "The alumina refinery will refine Saudi Arabian bauxite, supplied from Ma’aden Aluminium’s mine at Al Ba’itha and transported by 600 km rail to Ras Al Khair.");
const sortingEvidence = ev("S1", "The UBCs may be collected in municipal curbside programs, dropped off programs, or deposit programs.");
const remeltingEvidence = ev("S1", "The decoating process results in the transfer of the hot metal to the melting furnace.");
const rollingEvidence = ev("S1", "The rolling process converts aluminum ingots into can body stock and lid stock coil, which are subsequently converted into can bodies and lids at the can manufacturing plant.");
const formingEvidence = ev("S1", "The cups then undergo a series of forming, ironing, and punching operations to form the final profile of the can as per the desired specifications.");
const claim = (evidence: ReturnType<typeof ev>, rationale: string) => ({ evidence, rationale, basis: "documented" as const });
const materials = [
  ["ore_deposit", "Bauxite-bearing deposit", mineEvidence], ["bauxite", "Bauxite ore", mineEvidence],
  ["alumina", "Smelter-grade alumina", refineryEvidence], ["primary", "Primary aluminum", smeltingEvidence],
  ["used_cans", "Used beverage cans from an earlier product generation", sortingEvidence],
  ["sorted_scrap", "Sorted used-can scrap", ev("S1", "The shreds are passed under magnetic separators to remove ferrous contamination.")],
  ["recycled", "Recycled aluminum rolling feedstock", remeltingEvidence], ["sheet", "Can body and lid sheet", rollingEvidence],
  ["can", "Empty aluminum beverage can and lid", formingEvidence],
].map(([id, name, evidence]) => ({ id: id as string, name: name as string, ...claim(evidence as ReturnType<typeof ev>, "Generic material in the demonstrated process chain; not a traced batch.") }));
const basis = (material_id: string, specification: string, quantity = 1, unit = "tonne") => ({ material_id, specification, quantity, unit });
const stages: Journey["stages"] = [
  { id: "mining", name: "Bauxite mining", inputs: ["ore_deposit"], outputs: ["bauxite"], tasks: ["extract bauxite ore"], output_basis: basis("bauxite", "Bauxite ore; grade unspecified"), ...claim(mineEvidence, "Documented Saudi mine example, not a claim that its output reaches the other demo locations.") },
  { id: "refining", name: "Alumina refining", inputs: ["bauxite"], outputs: ["alumina"], tasks: ["digest bauxite in caustic liquor", "separate bauxite residue", "precipitate and calcine alumina"], output_basis: basis("alumina", "Smelter-grade alumina"), ...claim([...refineryEvidence, ...ev("C8", "Clarification separates the bauxite residue from the pregnant liquor via sedimentation.")], "Bayer-process benchmark; coproduct/residue quantities are retained in metrics.") },
  { id: "smelting", name: "Primary aluminum smelting", inputs: ["alumina"], outputs: ["primary"], tasks: ["electrolytically reduce alumina to aluminum"], output_basis: basis("primary", "Primary aluminum metal"), ...claim(smeltingEvidence, "Hall–Héroult reduction; route-level primary energy is stored separately in highlights.json.") },
  { id: "collection", name: "Collect and sort used cans", inputs: ["used_cans"], outputs: ["sorted_scrap"], tasks: ["collect used beverage cans", "remove ferrous contamination from shredded cans"], output_basis: basis("sorted_scrap", "Sorted used-can scrap"), ...claim([...sortingEvidence, ...ev("S1", "The shreds are passed under magnetic separators to remove ferrous contamination.")], "Used cans come from an earlier generation. Recycling is an incoming branch so this production graph remains acyclic.") },
  { id: "remelting", name: "De-coat and remelt used cans", inputs: ["sorted_scrap"], outputs: ["recycled"], tasks: ["decoat shredded used cans", "remelt scrap and adjust alloy chemistry"], output_basis: basis("recycled", "Recycled aluminum feedstock for rolling; alloy adjustment may require primary metal"), ...claim([...remeltingEvidence, ...ev("S1", "In addition, alloying additives are also added to meet the final specifications of the ingot to be produced.")], "Recycling route; primary top-up and alloy additions are acknowledged but not assigned unsupported quantities.") },
  { id: "rolling", name: "Roll can body and lid sheet", inputs: ["primary", "recycled"], outputs: ["sheet"], tasks: ["hot and cold roll aluminum into sheet", "slit sheet into coils"], output_basis: basis("sheet", "North American can body and lid sheet, LCA table 3-2", 1000, "kg"), ...claim(rollingEvidence, "Primary and recycled feedstocks can contribute in varying proportions. Incoming edges do not mean one tonne of each is required.") },
  { id: "forming", name: "Form, finish and inspect empty cans", inputs: ["sheet"], outputs: ["can"], tasks: ["form and iron can bodies", "wash, coat and finish cans", "inspect can integrity"], output_basis: basis("can", "North American LCA average beverage cans and lids; no fixed volume assumed", 1000, "cans"), ...claim([...formingEvidence, ...ev("S1", "The cans then undergo a quality control process to check the integrity of the final product before they are shipped to fillers.")], "Includes body/lid manufacturing benchmark. Filling and distribution are outside scope.") },
];
type Metric = NonNullable<Journey["stages"][number]["metrics"]>[number];
function metric(stageId: string, id: string, category: Metric["category"], name: string, value: number | { low: number; high: number }, unit: string, evidence: ReturnType<typeof ev>, options: Partial<Metric> = {}) {
  const stage = stages.find((s) => s.id === stageId)!;
  (stage.metrics ??= []).push({ id, category, name, scenario: "baseline", status: "reported", value: typeof value === "number" ? value : null,
    range: typeof value === "number" ? null : value, unit, output_basis: stage.output_basis!, currency: null, location: null,
    source_period: null, technology: stage.name, assumptions: [], rationale: "Sourced process benchmark; not a measurement of the illustrative location.", evidence, ...options });
}
metric("refining", "bauxite-input", "material_consumption", "Bauxite feed", { low: 2, high: 3 }, "tonne bauxite", ev("C8", "Two to three tonnes of bauxite are required to produce one tonne of alumina"));
metric("refining", "red-mud", "waste", "Bauxite residue", { low: 1, high: 1.5 }, "tonne residue", ev("C3", "For every 1 tonne of alumina, 1–1.5 tonnes of bauxite residue is produced."), { assumptions: ["Moisture basis unspecified; generation is not equivalent to landfilled waste."] });
metric("smelting", "alumina-input", "material_consumption", "Alumina feed", 2, "tonne alumina", ev("C2", "On average, 4-6 tonnes of bauxite will produce 2 tonnes of alumina, which will produce 1 tonne of primary aluminium (varies depending on location)."));
metric("smelting", "electricity", "energy", "Smelting electricity", { low: 14, high: 15 }, "MWh electricity", ev("S3", "Aluminium smelting requires large amounts of electricity, typically around 14-15 MWh per tonne of metal produced"), { source_period: "2021 JRC report; underlying data older", location: "Industry benchmark" });
const rollingTable = ev("S1", "Table 3-2: Sheet rolling unit process Type Flow Value Unit Inputs Aluminum ingot for rolling 1,310 kg Cardboard packaging 0.00605 kg Electricity 1,440 MJ Packaging paper 0.00346 kg Packaging wooden pallets 1.03 kg Paint 4.29 kg Plastic packaging 0.00691 kg Rolling oil 0.968 kg Thermal energy from LPG 0.155 MJ Thermal energy from natural gas 2,910 MJ Water 338 kg Outputs Aluminum sheet 1,000 kg Aluminum scrap for recovery 308 kg");
const northAmerica = { location: "North America (U.S. and Canada)", source_period: "2016 reference year; 2021 LCA report" };
metric("rolling", "ingot-input", "material_consumption", "Rolling ingot feed", 1310, "kg ingot", rollingTable, northAmerica);
metric("rolling", "electricity", "energy", "Rolling electricity", 1440, "MJ electricity", rollingTable, northAmerica);
metric("rolling", "gas-heat", "energy", "Rolling natural gas thermal energy", 2910, "MJ heat", rollingTable, northAmerica);
metric("rolling", "recovery-scrap", "waste", "Rolling scrap sent for recovery", 308, "kg scrap", rollingTable, { ...northAmerica, assumptions: ["Recoverable process scrap, not landfill loss; do not count its acquisition cost twice."] });
const canTable = ev("S1", "Table 3-3: Can manufacturing unit process Type Flow Value Unit Inputs Aluminum sheet 16.0 kg Coatings 0.457 kg Electricity 109 MJ Inks 0.0144 kg Lubricating oil 0.0394 kg Thermal energy from natural gas 67.5 kg Water 76.0 kg Outputs 2-piece aluminum can 13.5 kg Aluminum post-industrial scrap for recovery 2.50 kg");
metric("forming", "sheet-input", "material_consumption", "Can sheet feed", 16, "kg sheet", canTable, northAmerica);
metric("forming", "electricity", "energy", "Can manufacturing electricity", 109, "MJ electricity", canTable, northAmerica);
metric("forming", "scrap", "waste", "Can manufacturing scrap for recovery", 2.5, "kg scrap", canTable, { ...northAmerica, assumptions: ["Uses table 3-3 value 2.50 kg, not narrative rounded value 3 kg. Do not silently reconcile the discrepancy."] });
const capacityEvidence = ev("C6", "This greenfield project incorporated a Drawn and Ironed can manufacturing line with a capacity of 1800 cans per minute (cpm) that is scalable to 2,400 cpm.");
metric("forming", "line-capacity", "throughput", "Recorp NZ line rated capacity", 1800, "cans/minute", capacityEvidence, {
  output_basis: basis("can", "Recorp NZ drawn-and-ironed can line; size unspecified", 1, "can"), location: "New Zealand",
  assumptions: ["Vendor capacity, not sustained saleable throughput; not the North American LCA plant or a conversion factor for its electricity data."] });
const priceEvidence = ev("S7", "The average prices, f.a.s., for U.S. imports for consumption of crude dry bauxite and metallurgical-grade alumina during the first 8 months of 2025 were $31 per ton and $595 per ton, respectively");
metric("refining", "bauxite-cost-proxy", "resource_cost", "Illustrative bauxite purchase cost ONLY", { low: 62, high: 93 }, "USD", [...priceEvidence, ...ev("C8", "Two to three tonnes of bauxite are required to produce one tonne of alumina")], {
  status: "estimate", currency: "USD", location: "U.S. import-price scenario; not Saudi plant costs", source_period: "January–August 2025 price proxy",
  assumptions: ["2–3 tonnes bauxite per tonne alumina × 31 USD/metric tonne", "Assumes source ore requirement is compatible with the dry-bauxite price basis; grade and moisture differences are not modeled.", "Excludes freight beyond f.a.s. boundary, energy, chemicals, labor, capital, waste and recovery revenue."], rationale: "Calculated input-cost scenario, not total resource cost or a supplier quote." });
metric("smelting", "alumina-cost-proxy", "resource_cost", "Illustrative purchased alumina cost ONLY", 1190, "USD", [...priceEvidence, ...ev("C2", "On average, 4-6 tonnes of bauxite will produce 2 tonnes of alumina, which will produce 1 tonne of primary aluminium (varies depending on location).")], {
  status: "estimate", currency: "USD", location: "U.S. import-price scenario; not Saudi plant costs", source_period: "January–August 2025 price proxy",
  assumptions: ["2 tonnes alumina per tonne aluminum × 595 USD/metric tonne", "Excludes electricity, anodes, labor, capital and other inputs.", "Do not add upstream bauxite purchase costs to this purchased-intermediate cost; that would double count."], rationale: "Calculated input-cost scenario, not total smelting cost." });
const auto = (stageId: string, task: string, evidence: ReturnType<typeof ev>, rationale: string) => {
  const s = stages.find((s) => s.id === stageId)!;
  (s.automation ??= []).push({ task, technical_feasibility: "demonstrated", economic_viability: "unknown", output_basis: s.output_basis!, evidence, rationale,
    constraints: ["No matched labor baseline, equipment price, maintenance cost or payback evidence.", "Demonstrated task automation does not mean the whole plant is autonomous."] });
};
auto("collection", "remove ferrous contamination from shredded cans", ev("S1", "The shreds are passed under magnetic separators to remove ferrous contamination."), "Mechanized separation is described in the can recycling process; economic performance is unquantified.");
auto("forming", "form and iron can bodies", capacityEvidence, "A commercial integrated can line is documented by the equipment vendor. Rated capacity is not a labor-replacement percentage.");
for (const stage of stages) {
  stage.metrics ??= [];
  stage.automation ??= [{ task: stage.tasks[0], technical_feasibility: "unknown", economic_viability: "unknown", output_basis: stage.output_basis!, rationale: "No reviewed task-specific automation conclusion for this process in the demo pack.", constraints: ["Further task-level evidence required"], evidence: [] }];
}
const location = (id: string, name: string, country: string, stage_ids: string[], evidence: ReturnType<typeof ev>, rationale: string) => ({ id, name, country_or_region: country, kind: "region" as const, stage_ids, significance: "Sourced candidate geography for the illustrative route", ...claim(evidence, rationale) });
const places = [
  location("saudi", "Al Ba’itha / Ras Al Khair, Saudi Arabia", "Saudi Arabia", ["mining", "refining", "smelting"], mineEvidence, "2014 integrated mine/refinery/smelter example. No shipment to North American rolling is claimed."),
  location("north-america", "North American can manufacturing benchmark", "United States; Canada", ["rolling", "forming"], ev("S1", "1,000 aluminum beverage cans manufactured in North America (U.S. and Canada) in the reference year 2016"), "Regional LCA coverage; not specific factories. Default country anchor is illustrative."),
  location("us-recovery", "United States can collection", "United States", ["collection"], ev("S2", "In the United States, 46.1% of aluminium beverage cans consumed were used as feedstock material for recyclers in 2019"), "Historical recovery-system geography. The recovery rate is not a process yield."),
  location("uk-recycling", "Latchford recycling example", "United Kingdom", ["remelting"], ev("C7", "Our Latchford recycling center is Europe’s largest used aluminum beverage can recycling plant"), "UK plant location is identified in the captured Novelis page. No U.S.-to-UK shipment is established."),
  location("nz-forming", "Recorp NZ line example", "New Zealand", ["forming"], capacityEvidence, "Alternative vendor case study for throughput; not interchangeable with the North American LCA."),
];
const edge = (id: string, source_process_id: string, target_process_id: string, material_ids: string[], evidence: ReturnType<typeof ev>) => ({ id, source_process_id, target_process_id, material_ids, evidence, basis: "inferred" as const, rationale: "Generic material handoff between process types; no specific cross-border supplier relationship or mixing ratio established." });
const journey = validateJourney({ product: "Aluminum beverage can — primary vs recycled", scope: "Reviewed hackathon benchmark snapshot. Seven processes and two feedstock branches, with per-process output units. Geographic route is illustrative; metric geographies/years remain separate. The LCA uses average North American cans, not a fixed 330/355 ml SKU. Route energy comparison and 60-day circularity story are in highlights.json.", materials, stages, places, supply_lines: [], dependencies: [
  edge("ore-to-refinery", "mining", "refining", ["bauxite"], refineryEvidence),
  edge("alumina-to-smelter", "refining", "smelting", ["alumina"], smeltingEvidence),
  edge("primary-to-sheet", "smelting", "rolling", ["primary"], rollingEvidence),
  edge("scrap-to-remelt", "collection", "remelting", ["sorted_scrap"], remeltingEvidence),
  edge("recycled-to-sheet", "remelting", "rolling", ["recycled"], rollingEvidence),
  edge("sheet-to-can", "rolling", "forming", ["sheet"], rollingEvidence),
], gaps: [
  "No actual complete supplier chain or shipping route is established. Country anchors represent candidate scenarios.",
  "Mining, refining, collection and UBC-only remelting energy remain unquantified here; route-level energy is separate.",
  "Prices are explicit U.S. import-price scenarios, not observed costs of the selected geographic route. No complete resource-cost total is supported.",
  "Labor minutes, automation payback and calibrated automation probabilities are unknown.",
  "The can LCA table reports 2.50 kg recovered scrap while narrative text rounds to 3 kg; the table value is retained.",
  "The extracted can-manufacturing thermal-energy row says 67.5 kg, an ambiguous unit; it is omitted pending PDF-level unit verification.",
  "Primary and recycled feedstock shares and input-output quantities on graph edges are unspecified; metrics must not be blindly summed.",
  "Process waste includes recoverable scrap; it is not synonymous with landfilled waste. The full bill of ancillary materials is not modeled.",
] }, sources);
const id = "demo-aluminum-can-v1";
const manifest = { id, created_at: new Date().toISOString(), status: "completed", product: journey.product, agent: "reviewed-demo-curation", original_run: original,
  source_count: sources.length, task_count: 0, process_count: stages.length, metric_count: stages.reduce((n, s) => n + (s.metrics?.length ?? 0), 0),
  curation: ["Restored full document text from saved extraction responses; no evidence invented to pass validation.", "Replaced weak title/table-of-contents citations with supporting passages.", "Rebuilt material references and task links; excluded unsupported numeric, scope-mismatched and wrongly attributed claims.", "Separated route-level energy and system recovery statistics from stage metrics.", "Added independently captured benchmark evidence and labeled calculations and conflicting source values."] };
const graph = serializeJourney(journey, id);
await mkdir(join("data/runs", id), { recursive: true });
for (const [file, value] of Object.entries({ "manifest.json": manifest, "sources.json": sources, "journey.json": journey, "graph.json": graph })) {
  const text = JSON.stringify(value, null, 2);
  await writeFile(join(directory, file), text, { flag: "wx" });
  await writeFile(join("data/runs", id, file), text, { flag: "wx" });
}
await writeFile(join(directory, "metrics.csv"), "process_id,metric_id,category,status,value,low,high,unit,output_quantity,output_unit,output_specification,location,period,source_ids\n" + journey.stages.flatMap((s) => (s.metrics ?? []).map((m) => [s.id, m.id, m.category, m.status, m.value, m.range?.low, m.range?.high, m.unit, m.output_basis.quantity, m.output_basis.unit, m.output_basis.specification, m.location, m.source_period, m.evidence.map((e) => e.source_id).join(";")].map((v) => JSON.stringify(String(v ?? ""))).join(","))).join("\n"));
persist("data/research.sqlite3", manifest, sources, [], journey);
console.log(JSON.stringify({ id, processes: stages.length, dependencies: graph.edges.length, metrics: manifest.metric_count, sources: sources.length, directory }, null, 2));

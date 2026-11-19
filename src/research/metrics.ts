import { z } from "zod";
const text = z.string().trim().min(1);
export const metricEvidence = z.array(z.object({ source_id: text, quote: z.string().min(15) }));
export const outputBasisSchema = z.object({
  material_id: text, quantity: z.number().finite().positive(), unit: text,
  specification: text,
});
export const processMetricSchema = z.object({
  id: text,
  category: z.enum(["material_consumption", "energy", "waste", "resource_cost", "labor", "throughput", "yield"]),
  name: text,
  scenario: z.enum(["baseline", "proposed_automation"]),
  status: z.enum(["reported", "measured", "estimate", "unknown"]),
  value: z.number().finite().nonnegative().nullable(),
  range: z.object({ low: z.number().finite().nonnegative(), high: z.number().finite().nonnegative() }).nullable(),
  unit: text,
  // Full explicit denominator: never silently assume every process has the same unit.
  output_basis: outputBasisSchema,
  currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  location: text.nullable(), source_period: text.nullable(), technology: text.nullable(),
  assumptions: z.array(text), rationale: text, evidence: metricEvidence,
}).superRefine((metric, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (metric.status === "unknown") {
    if (metric.value !== null || metric.range !== null) fail("Unknown metrics must have null values, not zero");
  } else {
    if ((metric.value === null) === (metric.range === null)) fail("Known metric requires exactly one value or range");
    if (!metric.evidence.length) fail("Known metric requires source evidence");
  }
  if (metric.range && metric.range.low > metric.range.high) fail("Metric range must be ordered");
  if (metric.category === "resource_cost" && metric.status !== "unknown" && !metric.currency) fail("Known costs require an ISO currency");
});
export const automationSchema = z.object({
  task: text,
  technical_feasibility: z.enum(["demonstrated", "conditional", "research_stage", "unknown"]),
  economic_viability: z.enum(["supported", "conditional", "unsupported", "unknown"]),
  output_basis: outputBasisSchema,
  rationale: text, constraints: z.array(text), evidence: metricEvidence,
}).superRefine((assessment, ctx) => {
  if ((assessment.technical_feasibility !== "unknown" || assessment.economic_viability !== "unknown") && !assessment.evidence.length) {
    ctx.addIssue({ code: "custom", message: "Automation conclusions require evidence" });
  }
});

import { OpenCode } from "@opencode/sdk";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { agents } from "../agents/index.js";
import { saveJson } from "../research/files.js";
import { sourceSchema, validateTasks, type Source } from "../research/schema.js";
import { persist } from "../research/store.js";
import { validateJourney } from "../research/journey.js";
import { serializeJourney } from "../research/graph.js";
import { parseOutput } from "../research/parse-output.js";
import { tavilyPlugin } from "../tools/tavily.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function main() {
  const { values } = parseArgs({ options: {
    sector: { type: "string", default: "Plastics product manufacturing" },
    naics: { type: "string", default: "3261" },
    process: { type: "string", default: "injection molding" },
    product: { type: "string", default: "injection-molded polypropylene plastic housing" },
    agent: { type: "string", default: "task-researcher" },
    model: { type: "string", default: process.env.OPENCODE_MODEL },
    sources: { type: "string" },
    check: { type: "boolean", default: false },
  } });
  if (!(values.agent in agents)) throw new Error(`Unknown agent: ${values.agent}`);
  const isJourney = values.agent === "journey-researcher";
  const configuredModel = values.model ?? agents[values.agent].model;
  const modelString = typeof configuredModel === "string" ? configuredModel : undefined;
  const modelMatch = modelString?.match(/^([^/]+)\/([^#]+)(?:#(.+))?$/);
  if (modelString && !modelMatch) throw new Error("Model must be provider/model or provider/model#variant");
  const model = modelMatch
    ? { providerID: modelMatch[1], id: modelMatch[2], variant: modelMatch[3] }
    : typeof configuredModel === "object"
      ? { providerID: configuredModel.providerID, id: configuredModel.model, variant: configuredModel.variant }
      : undefined;
  if (!values.sources && !values.check && !process.env.TAVILY_API_KEY) {
    throw new Error("Set TAVILY_API_KEY in .env");
  }
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const runDirectory = join(root, "data", "runs", id);
  await mkdir(runDirectory, { recursive: true });
  const sources: Source[] = values.sources
    ? sourceSchema.array().min(1).parse(JSON.parse(await readFile(resolve(values.sources), "utf8"))) : [];
  if (values.sources) await saveJson(join(runDirectory, "sources.json"), sources);
  const manifest = {
    id, sector: isJourney ? null : values.sector, naics: isJourney ? null : values.naics,
    process: isJourney ? null : values.process, product: values.product,
    agent: values.agent, created_at: new Date().toISOString(), extraction_version: 2,
    status: "running", opencode_session_id: "", task_count: 0, source_count: 0,
    reused_sources: values.sources ?? null, error: "",
  };
  await saveJson(join(runDirectory, "manifest.json"), manifest);
  console.log(`Run directory: ${runDirectory}`);
  console.log(`Starting embedded OpenCode SDK; agent: ${values.agent}`);
  let host: Awaited<ReturnType<typeof OpenCode.create>> | undefined;
  let sessionID: string | undefined;
  try {
    host = await OpenCode.create({
      config: { content: JSON.stringify({ agents }) },
      plugins: [tavilyPlugin(runDirectory, sources, Boolean(values.sources), isJourney ? { searches: 6, extractions: 3 } : undefined)],
    });
    // Resolve the location's configured model explicitly: a newly created session
    // without one can fall back to a free model instead of the project default.
    const fallback = model ? undefined : (await host.model.default({ location: { directory: root } })).data;
    const selectedModel = model ?? (fallback ? { providerID: fallback.providerID, id: fallback.id } : undefined);
    if (!selectedModel) throw new Error("No model available; connect a provider or set OPENCODE_MODEL");
    const session = await host.sessions.create({
      location: { directory: root }, agent: values.agent,
      title: `Trace Unseen: ${isJourney ? values.product : values.process}`,
      model: selectedModel,
    });
    sessionID = session.id;
    manifest.opencode_session_id = session.id;
    await saveJson(join(runDirectory, "manifest.json"), manifest);
    if (values.check) {
      console.log(`SDK session created with custom agent: ${session.agent}`);
      console.log(`Model: ${selectedModel.providerID}/${selectedModel.id}`);
      manifest.status = "checked";
      return;
    }
    const text = `${isJourney ? `Research a typical global raw-material-to-finished-product journey for ${values.product}, including notable places and possible supply lines.` : `Identify human tasks in ${values.process}, industry ${values.sector}, NAICS ${values.naics}.`}
${values.sources ? `Use ONLY these supplied extracted sources; do not call Tavily:\n${JSON.stringify(sources)}` :
      "Research using your Tavily tools. Return the JSON specified in your system instructions."}`;
    await host.sessions.prompt({ sessionID, text });
    // prompt admits work; wait is required before reading the finished response.
    await host.sessions.wait({ sessionID }, { signal: AbortSignal.timeout(600_000) });
    const messages = await host.sessions.context({ sessionID });
    await saveJson(join(runDirectory, "opencode-messages.json"), messages);
    const assistant = messages.filter((message) => message.type === "assistant").at(-1);
    if (!assistant || assistant.error) {
      throw new Error(assistant?.error?.message ?? "No assistant result; inspect opencode-messages.json");
    }
    const answer = assistant.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
    await writeFile(join(runDirectory, "model-answer.txt"), answer, "utf8");
    if (assistant.finish === "length") throw new Error("Model response truncated; saved output requires another extraction pass");
    const parsed = parseOutput(answer);
    await saveJson(join(runDirectory, "parsed-output.json"), parsed);
    const journey = isJourney ? validateJourney(parsed.value, sources) : undefined;
    const tasks = isJourney ? [] : validateTasks(parsed.value, sources);
    if (journey) await saveJson(join(runDirectory, "journey.json"), journey);
    if (journey) await saveJson(join(runDirectory, "graph.json"), serializeJourney(journey, id));
    await saveJson(join(runDirectory, "tasks.json"), { tasks });
    Object.assign(manifest, { status: "completed", task_count: tasks.length, source_count: sources.length });
    persist(join(root, "data", "research.sqlite3"), manifest, sources, tasks, journey);
    if (journey) console.log(`Saved journey: ${journey.stages.length} stages, ${journey.places.length} places, ${journey.supply_lines.length} supply lines`);
    console.log(`Saved ${tasks.length} tasks from ${sources.length} sources to data/research.sqlite3`);
  } catch (error) {
    manifest.status = "failed";
    manifest.error = error instanceof Error ? error.message : String(error);
    if (host && sessionID) await host.sessions.interrupt({ sessionID, resume: false }).catch(() => {});
    throw error;
  } finally {
    manifest.source_count = sources.length;
    await saveJson(join(runDirectory, "manifest.json"), manifest);
    await host?.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  if (/model_not_found|free usage limit|does not have access to model/i.test(message)) {
    console.error("Set OPENCODE_MODEL in .env to a model your connected provider account can access.");
  }
  process.exitCode = 1;
});

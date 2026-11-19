# TypeScript SDK task research

## Global product journeys

Run `npm run research:journey` for a typical global material-to-product journey.
The default example is an injection-molded polypropylene housing. Select another
product with `npm.cmd run research:journey -- --product "cotton T-shirt"`.

The `journey-researcher` agent researches raw materials, intermediates, processing
stages and tasks, notable geographic places, and possible supply lines. Its budget
is six searches and three extractions (up to five URLs each). This is a dated
research snapshot, not live tracking or an exhaustive map. Inferred routes are
explicitly labeled and explained; production in two places alone does not prove trade.

Results are saved as `data/runs/<run-id>/journey.json`, with citations and gaps.
SQLite stores the complete snapshot in `journey_snapshots` and individually
queryable materials/stages/places/supply lines in `journey_entities`, linked to
the research run and its source documents. Reruns append snapshots rather than
overwriting old research. Validation checks quotations, unique entity IDs, and
cross-references; semantic accuracy still requires reviewing the cited evidence.

To debug this mode, change the launch configuration's `--agent` argument to
`journey-researcher` and add `--product` with the product you want to research.

This job embeds `@opencode/sdk` directly. It creates a custom agent session,
registers Tavily tools through `@opencode/plugin`, waits for the agent to finish,
validates its source quotations, and writes findings to SQLite.

## Setup and run

```powershell
npm install
npm run research:check
npm run research
```

The project installs Node 26 locally because the embedded SDK requires a newer
runtime than Node 22.14. npm scripts and the VS Code debugger use that local runtime.
TypeScript runs through `tsx` with source maps; no build step is needed.

Set `TAVILY_API_KEY` in the project `.env`. OpenCode uses its existing local provider
credentials. Optionally set `OPENCODE_MODEL=provider/model` (or `provider/model#variant`)
to select a connected model. The SDK's default model can differ from the model
selected in an existing interactive session. A free-model quota error means you
need an available model; changing Tavily credentials won't fix that error.
Likewise, `model_not_found` or "does not have access to model" means the connected
provider account cannot use that model. Set `OPENCODE_MODEL` to an accessible model.

`research:check` starts the SDK, creates a custom-agent session, reports the default
model, and closes the host. It makes no generation or Tavily requests.

For options in Windows PowerShell, invoke the npm command shim explicitly:

```powershell
npm.cmd run research -- --agent task-researcher --sector "Bakeries and tortilla manufacturing" --naics 3118 --process "bread packaging"
```

## Custom agents and tools

- `src/agents/index.ts`: typed agent registry. Add entries with a description,
  system instructions, permissions, step limit, and optional model.
- `src/tools/tavily.ts`: SDK plugin registering `tavily_search` and `tavily_extract`.
  Add custom tools here or supply additional plugins to `OpenCode.create()`.
- `src/jobs/discover-tasks.ts`: session creation, agent/model selection, prompt,
  completion wait, response parsing, and host cleanup.
- `src/research/schema.ts`: output contract and citation validation.
- `src/research/store.ts`: transactional SQLite persistence.

Select a new registry entry with `--agent your-agent`. Agents used by this job must
return the same task JSON contract. Model precedence is `--model`, then
`OPENCODE_MODEL`, then the agent's `model`, then OpenCode's default.

The research agent may call Tavily search twice and extraction once for up to five
URLs. These budgets are enforced in the tool executors. Existing global MCP servers
are disabled only within this embedded host. The tool permission allowlist belongs
to the agent and can be changed when adding new tools.

## Debug in VS Code

Open the repository folder, choose **Debug task research agent (TypeScript SDK)**,
and press F5. `.vscode/launch.json` loads `.env` and points to the local Node runtime.
Set breakpoints in the job, plugin tool executors, validation, or persistence code.
Edit `args` in the launch configuration to choose a different agent or sector.
VS Code's built-in JavaScript debugger handles this configuration.

To debug extraction without repeating Tavily requests, provide an existing source
bundle using `--sources data/runs/<previous-run>/sources.json` in the launch args or:

```powershell
npm.cmd run research -- --sources data/runs/<previous-run>/sources.json
```

This creates a new run, reuses the evidence, and makes a new model request. It does
not overwrite the original run. Tavily calls are disabled in this mode. Normal
research runs incur Tavily and model usage; rerunning starts a new job.

## Outputs and verification

- `data/runs/<run-id>/`: manifest, Tavily responses, extracted sources, SDK messages,
  model answer, and validated `tasks.json`.
- `data/research.sqlite3`: research runs, source documents, and task findings.

The existing pilot database remains compatible. All local outputs and `.env` are
ignored by Git. Each quote must occur in the extracted source after whitespace
normalization. This validates provenance, not semantic entailment or prevalence.
Timing and labor share remain null. Full Tavily extraction responses are saved;
the agent receives at most 24,000 characters per source.

```powershell
npm run typecheck
npm test
```

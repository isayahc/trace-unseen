import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

type Job = { id: string; product: string; status: "running" | "completed" | "failed"; stage: string; createdAt: string; finishedAt?: string; runId?: string };
let active: Job | undefined;
const running = () => active?.status === "running";
const directory = resolve("data/jobs");
function save(job: Job) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${job.id}.json`);
  writeFileSync(`${path}.tmp`, JSON.stringify(job)); renameSync(`${path}.tmp`, path);
}
function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status; response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store"); response.end(JSON.stringify(body));
}
export async function researchJobs(request: IncomingMessage, response: ServerResponse, next: () => void) {
  const path = request.url?.split("?")[0] ?? "";
  if (!path.startsWith("/api/research")) return next();
  if (request.method === "GET" && /^\/api\/research\/[a-f0-9-]{36}$/.test(path)) {
    const file = join(directory, `${path.split("/").at(-1)}.json`);
    if (!existsSync(file)) return send(response, 404, { error: "Research job not found" });
    return send(response, 200, JSON.parse(readFileSync(file, "utf8")));
  }
  if (request.method !== "POST" || path !== "/api/research") return send(response, 405, { error: "Unsupported request" });
  // Local app: only the same-origin frontend may start billable research.
  if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) {
    return send(response, 403, { error: "Origin not allowed" });
  }
  if (!request.headers["content-type"]?.startsWith("application/json")) return send(response, 415, { error: "Expected JSON" });
  if (active?.status === "running") return send(response, 409, { error: "A research job is already running", job: active });
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 4096) return send(response, 413, { error: "Request too large" });
    }
    const product = JSON.parse(body).product;
    if (typeof product !== "string" || product.trim().length < 3 || product.length > 200 || /[\x00-\x1f]/.test(product)) {
      return send(response, 400, { error: "Enter a product between 3 and 200 characters" });
    }
    if (running()) return send(response, 409, { error: "A research job is already running", job: active });
    const job: Job = { id: randomUUID(), product: product.trim(), status: "running", stage: "Starting research agent", createdAt: new Date().toISOString() };
    active = job; save(job);
    const child = spawn(process.execPath, ["--env-file-if-exists=.env", "--import", "tsx", "src/jobs/discover-tasks.ts", "--agent", "journey-researcher", "--product", job.product], {
      cwd: resolve("."), shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("Run directory: ")) job.runId = basename(line.slice("Run directory: ".length).trim());
        if (line.startsWith("Tavily search")) job.stage = line;
        if (line.startsWith("Tavily extracting")) job.stage = line;
        if (line.startsWith("Saved journey:")) job.stage = "Saving validated journey";
      }
      save(job);
    });
    // Keep credentials and provider responses out of browser-visible progress.
    child.stderr.on("data", () => {});
    const finish = (ok: boolean) => {
      if (job.status !== "running") return;
      job.status = ok ? "completed" : "failed";
      job.stage = ok ? "Journey saved" : "Research failed. Check the latest data/runs manifest for details.";
      if (!ok && job.runId) {
        job.stage = `Research failed. Inspect data/runs/${job.runId}/manifest.json`;
        try {
          const manifest = JSON.parse(readFileSync(join("data/runs", job.runId, "manifest.json"), "utf8"));
          // Only expose known local validation messages, never raw provider stderr.
          if (typeof manifest.error === "string" && /^(Automation task must belong to|Journey quote not found in|Metric output basis must reference)/.test(manifest.error)) {
            job.stage = `Validation failed: ${manifest.error}`;
          }
        } catch { /* Run may have exited before writing its manifest. */ }
      }
      job.finishedAt = new Date().toISOString(); save(job);
    };
    child.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0));
    return send(response, 202, job);
  } catch { return send(response, 400, { error: "Could not start research. Check the product input and local configuration." }); }
}

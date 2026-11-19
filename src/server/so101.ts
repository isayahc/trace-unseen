import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

export function so101Plugin(): Plugin {
  let child: ChildProcessWithoutNullStreams | undefined;
  let scene: unknown, state: unknown, error: string | undefined;
  function boot() {
    if (child || error) return;
    const python = resolve(process.platform === "win32" ? ".venv-mujoco/Scripts/python.exe" : ".venv-mujoco/bin/python");
    if (!existsSync(python)) { error = "Install the MuJoCo environment using simulation/so101/README.md."; return; }
    child = spawn(python, ["-u", "simulation/so101/serve.py"], { cwd: process.cwd(), stdio: "pipe" });
    const worker = child;
    let buffer = "", stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      let end: number;
      while ((end = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        try { const message = JSON.parse(line) as { type: string; value: unknown }; if (message.type === "scene") scene = message.value; if (message.type === "state") state = message.value; }
        catch { error = "Invalid MuJoCo bridge response"; }
      }
    });
    child.stderr.on("data", (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-6000); });
    child.on("error", e => { error = e.message; });
    child.on("exit", code => { if (child === worker) { child = undefined; state = undefined; error = stderr || `Physics process exited (${code})`; } });
  }
  function middleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
    if (req.url?.split("?")[0] !== "/api/so101") return next();
    res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET") { boot(); res.end(JSON.stringify({ scene, state, error, status: state ? "ready" : "starting" })); return; }
    if (req.method !== "POST") { res.statusCode = 405; res.end("{}"); return; }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.statusCode = 403; res.end("{}"); return; }
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); if (body.length > 1024) req.destroy(); });
    req.on("end", () => {
      try {
        const { command } = JSON.parse(body) as { command: string };
        if (!["start", "pause", "reset", "step"].includes(command)) throw new Error("Unknown command");
        boot();
        if (!child || !scene) { res.statusCode = 503; res.end(JSON.stringify({ error: error ?? "MuJoCo is starting" })); return; }
        child.stdin.write(JSON.stringify({ command }) + "\n"); res.end('{"ok":true}');
      } catch { res.statusCode = 400; res.end('{"error":"Invalid simulation command"}'); }
    });
  }
  function stop() { const worker = child; child = undefined; worker?.stdin.end(); worker?.kill(); scene = undefined; state = undefined; }
  return { name: "live-so101", configureServer(server) { server.middlewares.use(middleware); server.httpServer?.once("close", stop); }, configurePreviewServer(server) { server.middlewares.use(middleware); server.httpServer.once("close", stop); } };
}

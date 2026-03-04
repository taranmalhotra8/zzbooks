#!/usr/bin/env node
/**
 * Local dev server for the Zopdev Ebook Engine.
 * Serves static files from _output/ and exposes an SSE-based generation API.
 *
 * Works with both Node.js (via tsx) and Bun.
 *
 * Usage:
 *   npx tsx _server/server.ts
 *   node --import tsx _server/server.ts
 *   PORT=8080 npx tsx _server/server.ts
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn, execSync, type ChildProcess } from "child_process";
import { existsSync, statSync, readFileSync, appendFileSync, writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, "..");
const OUTPUT = join(ROOT, "_output");
const PORT = parseInt(process.env.PORT || "3000");

// ── Runtime Detection ─────────────────────────────────────────────────────

/**
 * Find the best available TypeScript runtime.
 * Prefers npx tsx (most reliable in Node.js projects), then bun, then node --import tsx.
 */
function detectRuntime(): { cmd: string; args: string[] } {
  // Prefer npx tsx — always works when tsx is in devDependencies
  try {
    execSync("npx tsx --version", { stdio: "pipe", timeout: 10000 });
    return { cmd: "npx", args: ["tsx"] };
  } catch { /* not available */ }

  // Try bun
  try {
    execSync("bun --version", { stdio: "pipe", timeout: 5000 });
    return { cmd: "bun", args: ["run"] };
  } catch { /* not available */ }

  // Fallback to node (requires tsx installed globally or in project)
  return { cmd: "node", args: ["--import", "tsx"] };
}

const runtime = detectRuntime();
console.log(`  Runtime: ${runtime.cmd} ${runtime.args.join(" ")}`);

// ── MIME Types ────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".epub": "application/epub+zip",
};

// ── Generation State ──────────────────────────────────────────────────────

let activeChild: ChildProcess | null = null;

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// ── Static File Serving ───────────────────────────────────────────────────

function resolveStaticFile(pathname: string): string | null {
  let filePath = join(OUTPUT, pathname);

  // Directory index fallback
  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  // Try adding index.html for paths without extension
  if (!extname(filePath) && !existsSync(filePath)) {
    const withIndex = join(filePath, "index.html");
    if (existsSync(withIndex)) filePath = withIndex;
  }

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return filePath;
  }

  return null;
}

// ── CORS Headers ─────────────────────────────────────────────────────────

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, *",
};

function sendJson(res: ServerResponse, status: number, data: object, extraHeaders?: Record<string, string>) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...corsHeaders,
    ...extraHeaders,
  });
  res.end(body);
}

// ── SSE Generation Handler ────────────────────────────────────────────────

function handleGenerate(url: URL, res: ServerResponse): void {
  const topic = url.searchParams.get("topic");
  const chapters = url.searchParams.get("chapters") || "5";

  if (!topic) {
    sendJson(res, 400, { error: "topic is required" });
    return;
  }

  if (activeChild) {
    sendJson(res, 409, { error: "Generation already in progress" });
    return;
  }

  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);

  // SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    ...corsHeaders,
  });

  const send = (data: object) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // Stream may be closed
    }
  };

  // Keepalive interval to prevent browser timeout
  const keepalive = setInterval(() => {
    try {
      res.write(`:keepalive\n\n`);
    } catch {
      clearInterval(keepalive);
    }
  }, 30000);

  send({ step: 0, total: 10, label: "Starting generation...", status: "running", slug });

  // Load .env variables for the child process
  const childEnv = { ...process.env };
  const envPath = join(ROOT, ".env");
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        // Strip surrounding quotes
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        childEnv[key] = val;
      }
    }
  }

  // Ensure TinyTeX, Quarto, D2, and Bun are in PATH for child process
  const home = process.env.HOME || "";
  const extraPaths = [
    join(home, ".bun", "bin"),
    join(home, "Library", "TinyTeX", "bin", "universal-darwin"),
    join(home, ".TinyTeX", "bin", "x86_64-linux"),
    join(home, ".local", "quarto", "bin"),
    join(home, ".local", "bin"),
    "/usr/local/bin",
  ];
  for (const p of extraPaths) {
    if (existsSync(p) && !(childEnv.PATH || "").includes(p)) {
      childEnv.PATH = `${p}:${childEnv.PATH || ""}`;
    }
  }

  const child = spawn(runtime.cmd, [
    ...runtime.args,
    join(ROOT, "scripts", "generate-ebook.ts"),
    `--topic=${topic}`,
    `--chapters=${chapters}`,
  ], {
    cwd: ROOT,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  activeChild = child;
  let currentStep = 0;

  const processLine = (line: string) => {
    const clean = stripAnsi(line).trim();
    if (!clean) return;

    // Detect step headers: ── [N/10] Label
    const stepMatch = clean.match(/── \[(\d+)\/(\d+)\]\s*(.+)/);
    if (stepMatch) {
      currentStep = parseInt(stepMatch[1]);
      const total = parseInt(stepMatch[2]);
      const label = stepMatch[3].trim();
      send({ step: currentStep, total, label, status: "running", slug });
    } else {
      send({ type: "log", text: clean, step: currentStep });
    }
  };

  let stdoutBuf = "";
  child.stdout?.on("data", (data: Buffer) => {
    stdoutBuf += data.toString();
    const lines = stdoutBuf.split("\n");
    stdoutBuf = lines.pop() || "";
    for (const line of lines) processLine(line);
  });

  let stderrBuf = "";
  child.stderr?.on("data", (data: Buffer) => {
    stderrBuf += data.toString();
    const lines = stderrBuf.split("\n");
    stderrBuf = lines.pop() || "";
    for (const line of lines) processLine(line);
  });

  child.on("close", (code) => {
    // Flush remaining buffer
    if (stdoutBuf.trim()) processLine(stdoutBuf);
    if (stderrBuf.trim()) processLine(stderrBuf);

    clearInterval(keepalive);
    activeChild = null;

    if (code === 0) {
      send({ step: 10, total: 10, label: "Complete!", status: "done", complete: true, slug });
    } else {
      send({ type: "error", text: `Generation failed (exit code ${code})`, step: currentStep });
    }

    try {
      res.end();
    } catch {
      // Already closed
    }
  });

  child.on("error", (err) => {
    clearInterval(keepalive);
    activeChild = null;
    send({ type: "error", text: `Failed to start: ${err.message}`, step: 0 });
    try {
      res.end();
    } catch {
      // Already closed
    }
  });

  // Client disconnected — kill the child process
  res.on("close", () => {
    if (activeChild === child) {
      activeChild.kill("SIGTERM");
      activeChild = null;
    }
  });
}

// ── Lead Capture Handler ──────────────────────────────────────────────────

const LEADS_CSV = join(ROOT, "_output", "leads.csv");

function escapeCSV(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function handleLeadCapture(req: IncomingMessage, res: ServerResponse): void {
  let body = "";
  req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
  req.on("end", () => {
    try {
      const data = JSON.parse(body);
      const name = (data.name || "").trim();
      const email = (data.email || "").trim();
      const organization = (data.organization || "").trim();
      const ebook = (data.ebook || "").trim();

      if (!name || !email) {
        sendJson(res, 400, { error: "name and email are required" });
        return;
      }

      // Create CSV header if file doesn't exist
      if (!existsSync(LEADS_CSV)) {
        writeFileSync(LEADS_CSV, "Timestamp,Name,Email,Organization,Ebook\n", "utf-8");
      }

      // Append lead row
      const timestamp = new Date().toISOString();
      const row = [timestamp, name, email, organization, ebook].map(escapeCSV).join(",") + "\n";
      appendFileSync(LEADS_CSV, row, "utf-8");

      console.log(`  [lead] ${name} <${email}> — ${organization} — ${ebook}`);
      sendJson(res, 200, { success: true, message: "Lead saved" });
    } catch (err: any) {
      sendJson(res, 400, { error: "Invalid JSON body" });
    }
  });
}

// ── Server ────────────────────────────────────────────────────────────────

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders);
    res.end();
    return;
  }

  // Route: redirect / to dashboard
  if (url.pathname === "/") {
    res.writeHead(302, { Location: "/dashboard/index.html" });
    res.end();
    return;
  }

  // Route: Lead capture (POST)
  if (url.pathname === "/api/lead" && req.method === "POST") {
    handleLeadCapture(req, res);
    return;
  }

  // Route: SSE generation
  if (url.pathname === "/api/generate") {
    handleGenerate(url, res);
    return;
  }

  // Route: generation status check
  if (url.pathname === "/api/status") {
    sendJson(res, 200, { generating: activeChild !== null });
    return;
  }

  // Route: static files from _output/
  const filePath = resolveStaticFile(url.pathname);
  if (filePath) {
    const ext = extname(filePath);
    const contentType = MIME[ext] || "application/octet-stream";
    try {
      const content = readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(content);
    } catch {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not Found");
});

// Find an available port starting from PORT
import { createServer as createNetServer } from "net";

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createNetServer();
    tester.once("error", () => resolve(false));
    tester.listen(port, () => { tester.close(() => resolve(true)); });
  });
}

async function findPort(): Promise<number> {
  for (let p = PORT; p < PORT + 10; p++) {
    if (await isPortFree(p)) return p;
    console.log(`  Port ${p} in use, trying ${p + 1}...`);
  }
  console.error(`Could not find an available port (tried ${PORT}-${PORT + 9})`);
  process.exit(1);
}

findPort().then((port) => {
  server.listen(port, () => {
    console.log(`
\x1b[36m╔══════════════════════════════════════════════════╗\x1b[0m
\x1b[36m║\x1b[0m  \x1b[1mZopdev Ebook Engine — Dev Server\x1b[0m
\x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  http://localhost:${port}
\x1b[36m║\x1b[0m
\x1b[36m║\x1b[0m  Serving: _output/
\x1b[36m║\x1b[0m  Press Ctrl+C to stop
\x1b[36m╚══════════════════════════════════════════════════╝\x1b[0m
`);
  });
});

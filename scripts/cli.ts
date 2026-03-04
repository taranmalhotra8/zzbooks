#!/usr/bin/env bun
/**
 * cli.ts — Unified CLI for the Zopdev Ebook Engine
 *
 * Usage:
 *   ebook <command> [slug] [options]
 *   bun run scripts/cli.ts <command> [slug] [options]
 *
 * Examples:
 *   ebook list
 *   ebook pipeline k8s-cost-guide
 *   ebook audit k8s-cost-guide
 *   ebook publish k8s-cost-guide
 *   ebook --help
 */

import { spawnSync } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { parse } from "yaml";

// ── Paths ──────────────────────────────────────────────────────────────────

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const SCRIPTS = join(ROOT, "scripts");
const BOOKS = join(ROOT, "books");

// ── Version ────────────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const VERSION = pkg.version || "0.1.0";

// ── Terminal Colors ────────────────────────────────────────────────────────

const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ── Types ──────────────────────────────────────────────────────────────────

interface OptionDef {
  flag: string;
  short?: string;
  description: string;
  valueHint?: string;
}

interface CommandDef {
  name: string;
  group: string;
  description: string;
  usage: string;
  examples: string[];
  options: OptionDef[];
  requiresSlug: boolean;
  slugOptional?: boolean;
  handler: (slug: string | null, opts: Record<string, string>) => void;
}

// ── Runtime Detection ──────────────────────────────────────────────────────

function detectTsRunner(): { cmd: string; runArgs: string[] } {
  // Try npx tsx first (most reliable)
  try {
    const r = spawnSync("npx", ["tsx", "--version"], { stdio: "pipe", timeout: 10000 });
    if (r.status === 0) return { cmd: "npx", runArgs: ["tsx"] };
  } catch { /* not available */ }
  // Try bun
  try {
    const r = spawnSync("bun", ["--version"], { stdio: "pipe", timeout: 5000 });
    if (r.status === 0) return { cmd: "bun", runArgs: ["run"] };
  } catch { /* not available */ }
  // Fallback
  return { cmd: "node", runArgs: ["--import", "tsx"] };
}

const tsRunner = detectTsRunner();

// ── Subprocess Runner ──────────────────────────────────────────────────────

function run(script: string, args: string[]): void {
  const result = spawnSync(tsRunner.cmd, [...tsRunner.runArgs, script, ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runQuarto(args: string[]): void {
  const result = spawnSync("quarto", args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runShell(cmd: string, args: string[]): void {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function stepHeader(num: number, total: number, label: string): void {
  console.log(`\n${DIM}── [${num}/${total}]${RESET} ${BOLD}${label}${RESET}\n`);
}

// ── Command Definitions ────────────────────────────────────────────────────

const COMMANDS: CommandDef[] = [
  // ─── Content Pipeline ────────────────────────────────────────────────────

  {
    name: "new",
    group: "Content Pipeline",
    description: "Scaffold a new ebook from templates",
    usage: "ebook new --slug=<slug> --title=\"<title>\" [--subtitle=\"<subtitle>\"]",
    examples: [
      "ebook new --slug=k8s-security --title=\"Kubernetes Security Guide\"",
      "ebook new --slug=aws-costs --title=\"AWS Cost Guide\" --subtitle=\"Save 40%\"",
    ],
    options: [
      { flag: "--slug", description: "URL-friendly ebook identifier", valueHint: "<slug>" },
      { flag: "--title", description: "Ebook title", valueHint: "<title>" },
      { flag: "--subtitle", description: "Optional subtitle", valueHint: "<subtitle>" },
    ],
    requiresSlug: false,
    handler: (_slug, opts) => {
      const s = opts.slug;
      const t = opts.title;
      if (!s || !t) {
        console.error(`${RED}Error: --slug and --title are required${RESET}`);
        console.error(`Usage: ebook new --slug=<slug> --title="<title>"`);
        process.exit(1);
      }
      runShell(join(SCRIPTS, "new-ebook.sh"), [s, t, opts.subtitle || ""]);
    },
  },

  {
    name: "generate",
    group: "Content Pipeline",
    description: "Auto-generate full ebook from a topic (ebook + PDF + blog + social + dashboard)",
    usage: "ebook generate --topic=\"<topic>\" [--chapters=<n>] [--slug=<slug>]",
    examples: [
      "ebook generate --topic=\"Docker Security Best Practices\"",
      "ebook generate --topic=\"AWS Lambda Cost Optimization\" --chapters=6",
      "ebook generate --topic=\"Kubernetes Monitoring\" --slug=k8s-monitoring",
    ],
    options: [
      { flag: "--topic", description: "Topic for the ebook (required)", valueHint: "<topic>" },
      { flag: "--chapters", description: "Number of chapters (default: 5)", valueHint: "<n>" },
      { flag: "--slug", description: "Custom slug (auto-generated from topic if omitted)", valueHint: "<slug>" },
      { flag: "--title", description: "Custom title (defaults to topic)", valueHint: "<title>" },
      { flag: "--subtitle", description: "Custom subtitle", valueHint: "<subtitle>" },
    ],
    requiresSlug: false,
    handler: (_slug, opts) => {
      if (!opts.topic) {
        console.error(`${RED}Error: --topic is required${RESET}`);
        console.error(`\nUsage: ebook generate --topic="Docker Security Best Practices"`);
        process.exit(1);
      }
      const args: string[] = [`--topic=${opts.topic}`];
      if (opts.chapters) args.push(`--chapters=${opts.chapters}`);
      if (opts.slug) args.push(`--slug=${opts.slug}`);
      if (opts.title) args.push(`--title=${opts.title}`);
      if (opts.subtitle) args.push(`--subtitle=${opts.subtitle}`);
      run(join(SCRIPTS, "generate-ebook.ts"), args);
    },
  },

  {
    name: "create",
    group: "Content Pipeline",
    description: "Interactive ebook creator (Q&A wizard, all modalities out)",
    usage: "ebook create",
    examples: ["ebook create"],
    options: [],
    requiresSlug: false,
    handler: () => run(join(SCRIPTS, "create-ebook.ts"), []),
  },

  {
    name: "pipeline",
    group: "Content Pipeline",
    description: "Full pipeline: research → outline → plan → transform",
    usage: "ebook pipeline <slug> [--chapter=<id>] [--parallel=<n>]",
    examples: [
      "ebook pipeline k8s-cost-guide",
      "ebook pipeline k8s-cost-guide --parallel=4",
      "ebook pipeline k8s-cost-guide --chapter=01",
    ],
    options: [
      { flag: "--chapter", short: "-c", description: "Run for a single chapter only", valueHint: "<id>" },
      { flag: "--parallel", short: "-p", description: "Parallel chapter transforms (stage 3)", valueHint: "<n>" },
    ],
    requiresSlug: true,
    handler: (slug, opts) => {
      if (opts.parallel) {
        // Use pipeline-runner for parallel execution
        const args = [slug!, `--parallel=${opts.parallel}`];
        if (opts.chapter) args.push(`--chapter=${opts.chapter}`);
        run(join(SCRIPTS, "pipeline-runner.ts"), args);
        return;
      }

      const chapterArgs = opts.chapter ? [opts.chapter] : [];

      stepHeader(1, 4, "Researching topic");
      run(join(SCRIPTS, "research-topic.ts"), [slug!]);

      stepHeader(2, 4, "Generating outline");
      run(join(SCRIPTS, "generate-outline.ts"), [slug!]);

      stepHeader(3, 4, "Planning chapters");
      run(join(SCRIPTS, "plan-chapters.ts"), [slug!, ...chapterArgs]);

      stepHeader(4, 4, "Transforming to prose");
      run(join(SCRIPTS, "transform-chapter.ts"), [slug!, ...chapterArgs]);

      console.log(`\n${GREEN}Pipeline complete.${RESET} Review .qmd files, then run: ${CYAN}ebook audit ${slug}${RESET}`);
    },
  },

  {
    name: "research",
    group: "Content Pipeline",
    description: "Stage 0: Research topic via search APIs",
    usage: "ebook research <slug>",
    examples: ["ebook research k8s-cost-guide"],
    options: [],
    requiresSlug: true,
    handler: (slug) => run(join(SCRIPTS, "research-topic.ts"), [slug!]),
  },

  {
    name: "outline",
    group: "Content Pipeline",
    description: "Stage 1: Generate book outline from topic.yml",
    usage: "ebook outline <slug>",
    examples: ["ebook outline k8s-cost-guide"],
    options: [],
    requiresSlug: true,
    handler: (slug) => run(join(SCRIPTS, "generate-outline.ts"), [slug!]),
  },

  {
    name: "plan",
    group: "Content Pipeline",
    description: "Stage 2: Plan chapters with visual recommendations",
    usage: "ebook plan <slug> [--chapter=<id>]",
    examples: ["ebook plan k8s-cost-guide", "ebook plan k8s-cost-guide --chapter=01"],
    options: [
      { flag: "--chapter", short: "-c", description: "Plan a single chapter", valueHint: "<id>" },
    ],
    requiresSlug: true,
    handler: (slug, opts) => {
      const args = [slug!];
      if (opts.chapter) args.push(opts.chapter);
      run(join(SCRIPTS, "plan-chapters.ts"), args);
    },
  },

  {
    name: "transform",
    group: "Content Pipeline",
    description: "Stage 3: Generate prose from chapter plans",
    usage: "ebook transform <slug> [--chapter=<id>]",
    examples: ["ebook transform k8s-cost-guide", "ebook transform k8s-cost-guide --chapter=03"],
    options: [
      { flag: "--chapter", short: "-c", description: "Transform a single chapter", valueHint: "<id>" },
    ],
    requiresSlug: true,
    handler: (slug, opts) => {
      const args = [slug!];
      if (opts.chapter) args.push(opts.chapter);
      run(join(SCRIPTS, "transform-chapter.ts"), args);
    },
  },

  // ─── Output Generation ───────────────────────────────────────────────────

  {
    name: "render",
    group: "Output Generation",
    description: "Render with Quarto (HTML, PDF, EPUB)",
    usage: "ebook render <slug> [--format=<fmt>]",
    examples: [
      "ebook render k8s-cost-guide",
      "ebook render k8s-cost-guide --format=pdf",
      "ebook render k8s-cost-guide --format=html",
    ],
    options: [
      { flag: "--format", short: "-f", description: "Output format: html, pdf, epub, all (default: all)", valueHint: "<fmt>" },
    ],
    requiresSlug: true,
    handler: (slug, opts) => {
      const fmt = opts.format || "all";
      const args = ["render", join("books", slug!)];
      if (fmt !== "all") args.push("--to", fmt);
      runQuarto(args);
    },
  },

  {
    name: "landing",
    group: "Output Generation",
    description: "Generate landing page",
    usage: "ebook landing [slug]",
    examples: ["ebook landing k8s-cost-guide", "ebook landing  # all ebooks"],
    options: [],
    requiresSlug: false,
    slugOptional: true,
    handler: (slug) => {
      const args = slug ? [slug] : [];
      run(join(ROOT, "_landing", "generate.ts"), args);
    },
  },

  {
    name: "social",
    group: "Output Generation",
    description: "Generate social media assets (LinkedIn, Instagram, OG)",
    usage: "ebook social <slug> [--type=<type>]",
    examples: [
      "ebook social k8s-cost-guide",
      "ebook social k8s-cost-guide --type=linkedin",
      "ebook social k8s-cost-guide --type=og",
    ],
    options: [
      { flag: "--type", short: "-t", description: "Asset type: linkedin, instagram, og, all (default: all)", valueHint: "<type>" },
    ],
    requiresSlug: true,
    handler: (slug, opts) => {
      const args = [slug!];
      if (opts.type) args.push(opts.type);
      run(join(ROOT, "_social", "generate.ts"), args);
    },
  },

  {
    name: "blog",
    group: "Output Generation",
    description: "Generate blog posts from chapters",
    usage: "ebook blog [slug]",
    examples: ["ebook blog k8s-cost-guide", "ebook blog  # all ebooks"],
    options: [],
    requiresSlug: false,
    slugOptional: true,
    handler: (slug) => {
      const args = slug ? [slug] : [];
      run(join(ROOT, "_blog", "generate.ts"), args);
    },
  },

  {
    name: "hub",
    group: "Output Generation",
    description: "Generate multi-book hub page",
    usage: "ebook hub",
    examples: ["ebook hub"],
    options: [],
    requiresSlug: false,
    handler: () => run(join(ROOT, "_hub", "generate.ts"), []),
  },

  {
    name: "reader",
    group: "Output Generation",
    description: "Generate standalone HTML book reader (no Quarto needed)",
    usage: "ebook reader [slug]",
    examples: ["ebook reader k8s-cost-guide", "ebook reader  # all ebooks"],
    options: [],
    requiresSlug: false,
    slugOptional: true,
    handler: (slug) => {
      const args = slug ? [slug] : [];
      run(join(ROOT, "_reader", "generate.ts"), args);
    },
  },

  {
    name: "dashboard",
    group: "Output Generation",
    description: "Generate dashboard with ebook library and detail pages",
    usage: "ebook dashboard",
    examples: ["ebook dashboard"],
    options: [],
    requiresSlug: false,
    handler: () => run(join(ROOT, "_dashboard", "generate.ts"), []),
  },

  {
    name: "publish",
    group: "Output Generation",
    description: "Generate ALL modalities for one ebook",
    usage: "ebook publish <slug>",
    examples: ["ebook publish k8s-cost-guide"],
    options: [],
    requiresSlug: true,
    handler: (slug) => {
      console.log(`\n${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}`);
      console.log(`${BLUE}║${RESET}${BOLD}  Publishing: ${slug}${RESET}`);
      console.log(`${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}`);

      stepHeader(1, 7, "Rendering HTML / PDF / EPUB");
      runQuarto(["render", join("books", slug!)]);

      stepHeader(2, 7, "Generating standalone HTML reader");
      run(join(ROOT, "_reader", "generate.ts"), [slug!]);

      stepHeader(3, 7, "Generating landing page");
      run(join(ROOT, "_landing", "generate.ts"), [slug!]);

      stepHeader(4, 7, "Generating social assets");
      run(join(ROOT, "_social", "generate.ts"), [slug!]);

      stepHeader(5, 7, "Generating blog posts");
      run(join(ROOT, "_blog", "generate.ts"), [slug!]);

      stepHeader(6, 7, "Generating dashboard");
      run(join(ROOT, "_dashboard", "generate.ts"), []);

      stepHeader(7, 7, "Content quality audit");
      run(join(SCRIPTS, "content-audit.ts"), [slug!]);

      console.log(`\n${GREEN}╔══════════════════════════════════════════════════════════════╗${RESET}`);
      console.log(`${GREEN}║${RESET}  Done! All modalities generated for: ${BOLD}${slug}${RESET}`);
      console.log(`${GREEN}║${RESET}`);
      console.log(`${GREEN}║${RESET}  HTML      → _output/books/${slug}/`);
      console.log(`${GREEN}║${RESET}  Landing   → _output/landing/${slug}/`);
      console.log(`${GREEN}║${RESET}  Social    → _output/social/${slug}/`);
      console.log(`${GREEN}║${RESET}  Blog      → _output/blog/${slug}/`);
      console.log(`${GREEN}║${RESET}  Dashboard → _output/dashboard/`);
      console.log(`${GREEN}║${RESET}`);
      console.log(`${GREEN}║${RESET}  Run ${CYAN}ebook eval-all ${slug}${RESET} to check quality`);
      console.log(`${GREEN}╚══════════════════════════════════════════════════════════════╝${RESET}`);
    },
  },

  // ─── Quality & Evaluation ────────────────────────────────────────────────

  {
    name: "validate",
    group: "Quality & Evaluation",
    description: "Validate all configs (YAML, D2, OJS)",
    usage: "ebook validate",
    examples: ["ebook validate"],
    options: [],
    requiresSlug: false,
    handler: () => run(join(SCRIPTS, "validate.ts"), []),
  },

  {
    name: "audit",
    group: "Quality & Evaluation",
    description: "Content quality audit (6 metrics)",
    usage: "ebook audit [slug]",
    examples: ["ebook audit k8s-cost-guide", "ebook audit  # all ebooks"],
    options: [],
    requiresSlug: false,
    slugOptional: true,
    handler: (slug) => {
      const args = slug ? [slug] : [];
      run(join(SCRIPTS, "content-audit.ts"), args);
    },
  },

  {
    name: "eval",
    group: "Quality & Evaluation",
    description: "A/B engine evaluation (template vs LLM, 11 metrics)",
    usage: "ebook eval <slug> [--report-only]",
    examples: ["ebook eval k8s-cost-guide", "ebook eval k8s-cost-guide --report-only"],
    options: [
      { flag: "--report-only", description: "Re-run from existing snapshots (skip generation)" },
    ],
    requiresSlug: true,
    handler: (slug, opts) => {
      const args = [slug!];
      if (opts["report-only"] !== undefined) args.push("--report-only");
      run(join(SCRIPTS, "engine-eval.ts"), args);
    },
  },

  {
    name: "eval-all",
    group: "Quality & Evaluation",
    description: "Unified eval across all modalities (dry-run)",
    usage: "ebook eval-all <slug> [--modalities=<list>]",
    examples: [
      "ebook eval-all k8s-cost-guide",
      "ebook eval-all k8s-cost-guide --modalities=ebook,landing",
    ],
    options: [
      { flag: "--modalities", description: "Comma-separated modality list", valueHint: "<list>" },
    ],
    requiresSlug: true,
    handler: (slug, opts) => {
      const args = [slug!, "--dry-run"];
      if (opts.modalities) args.push(`--modalities=${opts.modalities}`);
      run(join(SCRIPTS, "eval-loop.ts"), args);
    },
  },

  {
    name: "heal",
    group: "Quality & Evaluation",
    description: "Self-healing eval loop: evaluate → fix → re-evaluate",
    usage: "ebook heal <slug> [--max-iter=<n>] [--modalities=<list>]",
    examples: [
      "ebook heal k8s-cost-guide",
      "ebook heal k8s-cost-guide --max-iter=5",
      "ebook heal k8s-cost-guide --modalities=ebook,blog",
    ],
    options: [
      { flag: "--max-iter", description: "Maximum healing iterations (default: 3)", valueHint: "<n>" },
      { flag: "--modalities", description: "Comma-separated modality list", valueHint: "<list>" },
    ],
    requiresSlug: true,
    handler: (slug, opts) => {
      const args = [slug!];
      if (opts["max-iter"]) args.push(`--max-iter=${opts["max-iter"]}`);
      if (opts.modalities) args.push(`--modalities=${opts.modalities}`);
      run(join(SCRIPTS, "eval-loop.ts"), args);
    },
  },

  {
    name: "eval-pdf",
    group: "Quality & Evaluation",
    description: "PDF quality evaluation",
    usage: "ebook eval-pdf <slug>",
    examples: ["ebook eval-pdf k8s-cost-guide"],
    options: [],
    requiresSlug: true,
    handler: (slug) => run(join(SCRIPTS, "pdf-eval.ts"), [slug!]),
  },

  {
    name: "freshness",
    group: "Quality & Evaluation",
    description: "Check pricing data freshness",
    usage: "ebook freshness [slug]",
    examples: ["ebook freshness k8s-cost-guide", "ebook freshness  # all ebooks"],
    options: [],
    requiresSlug: false,
    slugOptional: true,
    handler: (slug) => {
      run(join(SCRIPTS, "freshness-check.ts"), slug ? [slug] : ["--all"]);
    },
  },

  // ─── Utilities ───────────────────────────────────────────────────────────

  {
    name: "list",
    group: "Utilities",
    description: "List all ebooks with status",
    usage: "ebook list [--json]",
    examples: ["ebook list", "ebook list --json"],
    options: [
      { flag: "--json", description: "Output as JSON array" },
    ],
    requiresSlug: false,
    handler: (_slug, opts) => {
      const calendarPath = join(ROOT, "calendar.yml");
      if (!existsSync(calendarPath)) {
        console.error(`${RED}No calendar.yml found${RESET}`);
        process.exit(1);
      }

      const raw = parse(readFileSync(calendarPath, "utf-8")) as Record<string, unknown>;
      const calendar = (raw.ebooks || raw || []) as Array<{
        slug: string;
        title: string;
        status: string;
        subtitle?: string;
      }>;

      if (!Array.isArray(calendar)) {
        console.error(`${RED}Unexpected calendar.yml format${RESET}`);
        process.exit(1);
      }

      if (opts.json !== undefined) {
        console.log(JSON.stringify(calendar, null, 2));
        return;
      }

      console.log(`\n${BOLD}Ebooks${RESET}`);
      console.log(`${DIM}${"─".repeat(70)}${RESET}`);

      for (const book of calendar) {
        const statusColor = book.status === "in-progress" ? YELLOW :
                            book.status === "published" ? GREEN :
                            book.status === "draft" ? DIM : RESET;
        const slug = book.slug.padEnd(28);
        const title = (book.title || "").substring(0, 35).padEnd(35);
        console.log(`  ${CYAN}${slug}${RESET} ${title} ${statusColor}[${book.status}]${RESET}`);
      }
      console.log();
    },
  },

  {
    name: "cost-report",
    group: "Utilities",
    description: "Show LLM cost breakdown",
    usage: "ebook cost-report [slug]",
    examples: ["ebook cost-report k8s-cost-guide", "ebook cost-report  # all ebooks"],
    options: [],
    requiresSlug: false,
    slugOptional: true,
    handler: (slug) => {
      run(join(SCRIPTS, "cost-report.ts"), slug ? [slug] : ["--all"]);
    },
  },

  {
    name: "setup",
    group: "Utilities",
    description: "Symlink brand into all ebooks",
    usage: "ebook setup",
    examples: ["ebook setup"],
    options: [],
    requiresSlug: false,
    handler: () => {
      const dirs = readdirSync(BOOKS, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      for (const slug of dirs) {
        runShell(join(SCRIPTS, "setup-ebook.sh"), [slug]);
      }
    },
  },

  {
    name: "delete",
    group: "Utilities",
    description: "Delete an ebook and all its generated assets",
    usage: "ebook delete <slug>",
    examples: ["ebook delete docker-security-best-practices"],
    options: [],
    requiresSlug: true,
    handler: (slug) => run(join(SCRIPTS, "delete-ebook.ts"), [slug]),
  },

  {
    name: "serve",
    group: "Utilities",
    description: "Start local dev server with live dashboard",
    usage: "ebook serve [--port=<n>]",
    examples: [
      "ebook serve",
      "ebook serve --port=8080",
    ],
    options: [
      { flag: "--port", short: "-p", description: "Port number (default: 3000)", valueHint: "<n>" },
    ],
    requiresSlug: false,
    handler: (_slug, opts) => {
      // Auto-generate dashboard if _output/dashboard doesn't exist
      const dashOut = join(ROOT, "_output", "dashboard", "index.html");
      if (!existsSync(dashOut)) {
        console.log(`${DIM}Dashboard not found — generating...${RESET}`);
        run(join(ROOT, "_dashboard", "generate.ts"), []);
      }

      const port = opts.port || "3000";
      const env = { ...process.env, PORT: port };

      // Open browser after a short delay
      setTimeout(() => {
        const openCmd = process.platform === "darwin" ? "open" :
                        process.platform === "win32" ? "start" : "xdg-open";
        spawnSync(openCmd, [`http://localhost:${port}`], { stdio: "ignore" });
      }, 500);

      // Run server (blocking) — uses detected TS runtime
      const result = spawnSync(tsRunner.cmd, [...tsRunner.runArgs, join(ROOT, "_server", "server.ts")], {
        cwd: ROOT,
        stdio: "inherit",
        env,
      });
      if (result.status !== 0) {
        process.exit(result.status ?? 1);
      }
    },
  },

  {
    name: "clean",
    group: "Utilities",
    description: "Remove all generated output",
    usage: "ebook clean",
    examples: ["ebook clean"],
    options: [],
    requiresSlug: false,
    handler: () => {
      runShell("rm", ["-rf", join(ROOT, "_output")]);
      console.log(`${GREEN}Cleaned _output/${RESET}`);
    },
  },

  {
    name: "test",
    group: "Utilities",
    description: "Run unit tests",
    usage: "ebook test",
    examples: ["ebook test"],
    options: [],
    requiresSlug: false,
    handler: () => run(join(SCRIPTS, "tests/"), []),
  },

  {
    name: "diagrams",
    group: "Quality & Evaluation",
    description: "Validate D2 diagrams for an ebook",
    usage: "ebook diagrams <slug>",
    examples: ["ebook diagrams finops-playbook"],
    options: [],
    requiresSlug: true,
    handler: (slug) => {
      const diagramDir = join(BOOKS, slug!, "diagrams");
      if (!existsSync(diagramDir)) {
        console.log(`${DIM}No diagrams/ directory for ${slug} (skipping)${RESET}`);
        return;
      }
      const files = readdirSync(diagramDir).filter(f => f.endsWith(".d2"));
      let allOk = true;
      for (const f of files) {
        const path = join(diagramDir, f);
        const result = spawnSync("d2", ["validate", path], { cwd: ROOT });
        if (result.status === 0) {
          console.log(`  ${GREEN}OK${RESET}  ${path}`);
        } else {
          console.log(`  ${RED}FAIL${RESET}  ${path}`);
          if (result.stderr) console.log(`       ${result.stderr.toString().trim()}`);
          allOk = false;
        }
      }
      if (allOk) {
        console.log(`${GREEN}All diagrams valid.${RESET}`);
      } else {
        process.exit(1);
      }
    },
  },

  {
    name: "compare",
    group: "Quality & Evaluation",
    description: "Compare before/after quality metrics",
    usage: "ebook compare <slug> --before=<path> --after=<path>",
    examples: ["ebook compare k8s-cost-guide --before=./snapshots/before --after=./snapshots/after"],
    options: [
      { flag: "--before", description: "Path to before snapshot", valueHint: "<path>" },
      { flag: "--after", description: "Path to after snapshot", valueHint: "<path>" },
    ],
    requiresSlug: true,
    handler: (slug, opts) => {
      if (!opts.before || !opts.after) {
        console.error(`${RED}Error: --before and --after are required${RESET}`);
        process.exit(1);
      }
      run(join(SCRIPTS, "compare-outputs.ts"), [slug!, opts.before, opts.after]);
    },
  },
];

// ── Arg Parsing ────────────────────────────────────────────────────────────

interface ParsedArgs {
  command: string;
  slug: string | null;
  opts: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const command = args[0] || "help";

  // Extract options and positional args
  const opts: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        opts[arg.substring(2, eqIdx)] = arg.substring(eqIdx + 1);
      } else {
        // Flag without value (e.g., --report-only, --json, --dry-run)
        opts[arg.substring(2)] = "";
      }
    } else if (arg.startsWith("-") && arg.length === 2) {
      // Short flag: check if next arg is a value
      const key = arg.substring(1);
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        opts[key] = args[++i];
      } else {
        opts[key] = "";
      }
    } else {
      positional.push(arg);
    }
  }

  // Resolve short flags to long names
  const cmd = COMMANDS.find(c => c.name === command);
  if (cmd) {
    for (const opt of cmd.options) {
      if (opt.short) {
        const shortKey = opt.short.replace(/^-+/, "");
        if (shortKey in opts) {
          const longKey = opt.flag.replace(/^-+/, "");
          opts[longKey] = opts[shortKey];
          delete opts[shortKey];
        }
      }
    }
  }

  const slug = positional[0] || null;

  return { command, slug, opts };
}

// ── Levenshtein Distance (for typo suggestions) ───────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0)
      );
    }
  }
  return dp[m][n];
}

// ── Help Formatting ────────────────────────────────────────────────────────

function printMainHelp(): void {
  console.log(`
${BOLD}Zopdev Ebook Engine${RESET} ${DIM}v${VERSION}${RESET}

${BOLD}Usage:${RESET} ebook <command> [slug] [options]
`);

  // Group commands
  const groups: Record<string, CommandDef[]> = {};
  for (const cmd of COMMANDS) {
    if (!groups[cmd.group]) groups[cmd.group] = [];
    groups[cmd.group].push(cmd);
  }

  for (const [group, cmds] of Object.entries(groups)) {
    console.log(`${BOLD}${group}${RESET}`);
    for (const cmd of cmds) {
      console.log(`  ${CYAN}${cmd.name.padEnd(18)}${RESET} ${cmd.description}`);
    }
    console.log();
  }

  console.log(`${BOLD}Global Options${RESET}`);
  console.log(`  ${CYAN}${"--help, -h".padEnd(18)}${RESET} Show help for a command`);
  console.log(`  ${CYAN}${"--version".padEnd(18)}${RESET} Show version`);
  console.log();
  console.log(`Run ${CYAN}ebook <command> --help${RESET} for details on a specific command.`);
  console.log();
}

function printCommandHelp(cmd: CommandDef): void {
  console.log(`\n${BOLD}${cmd.name}${RESET} — ${cmd.description}\n`);
  console.log(`${BOLD}Usage:${RESET} ${cmd.usage}\n`);

  if (cmd.options.length > 0) {
    console.log(`${BOLD}Options:${RESET}`);
    for (const opt of cmd.options) {
      const flags = opt.short ? `${opt.short}, ${opt.flag}` : `    ${opt.flag}`;
      const hint = opt.valueHint ? ` ${opt.valueHint}` : "";
      console.log(`  ${CYAN}${(flags + hint).padEnd(28)}${RESET} ${opt.description}`);
    }
    console.log();
  }

  if (cmd.examples.length > 0) {
    console.log(`${BOLD}Examples:${RESET}`);
    for (const ex of cmd.examples) {
      console.log(`  ${DIM}$${RESET} ${ex}`);
    }
    console.log();
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

function main(): void {
  const { command, slug, opts } = parseArgs(process.argv);

  // Global flags
  if (command === "--version" || command === "-v" || opts.version !== undefined) {
    console.log(VERSION);
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    if (slug) {
      // ebook help <command>
      const cmd = COMMANDS.find(c => c.name === slug);
      if (cmd) {
        printCommandHelp(cmd);
        return;
      }
    }
    printMainHelp();
    return;
  }

  // Find command
  const cmd = COMMANDS.find(c => c.name === command);

  if (!cmd) {
    console.error(`${RED}Unknown command: '${command}'${RESET}\n`);

    // Suggest close matches
    const suggestions = COMMANDS
      .map(c => ({ name: c.name, dist: levenshtein(command, c.name) }))
      .filter(s => s.dist <= 3)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);

    if (suggestions.length > 0) {
      console.log("Did you mean?");
      for (const s of suggestions) {
        const cmd = COMMANDS.find(c => c.name === s.name)!;
        console.log(`  ${CYAN}${s.name.padEnd(18)}${RESET} ${cmd.description}`);
      }
      console.log();
    }

    console.log(`Run ${CYAN}ebook help${RESET} to see all commands.`);
    process.exit(1);
  }

  // Per-command help
  if (opts.help !== undefined || opts.h !== undefined) {
    printCommandHelp(cmd);
    return;
  }

  // Validate slug requirement
  if (cmd.requiresSlug && !slug) {
    console.error(`${RED}Error: ${cmd.name} requires an ebook slug${RESET}`);
    console.error(`\n${BOLD}Usage:${RESET} ${cmd.usage}`);

    // List available slugs
    if (existsSync(BOOKS)) {
      const slugs = readdirSync(BOOKS, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      if (slugs.length > 0) {
        console.error(`\n${BOLD}Available ebooks:${RESET}`);
        for (const s of slugs) {
          console.error(`  ${CYAN}${s}${RESET}`);
        }
      }
    }
    console.log();
    process.exit(1);
  }

  // Validate slug exists (if provided and required)
  if (slug && cmd.requiresSlug) {
    const bookDir = join(BOOKS, slug);
    if (!existsSync(bookDir)) {
      console.error(`${RED}Error: ebook '${slug}' not found${RESET}`);
      console.error(`Expected directory: books/${slug}/`);

      // Suggest close matches
      const slugs = readdirSync(BOOKS, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      const suggestions = slugs
        .map(s => ({ name: s, dist: levenshtein(slug, s) }))
        .filter(s => s.dist <= 3)
        .sort((a, b) => a.dist - b.dist);
      if (suggestions.length > 0) {
        console.error(`\nDid you mean?`);
        for (const s of suggestions) {
          console.error(`  ${CYAN}${s.name}${RESET}`);
        }
      }
      console.log();
      process.exit(1);
    }
  }

  // Run handler
  cmd.handler(slug, opts);
}

main();

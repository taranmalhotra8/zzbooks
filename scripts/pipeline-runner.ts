#!/usr/bin/env node
/**
 * Pipeline Runner — Multi-Chapter Parallel Orchestrator.
 *
 * Executes the 4-stage ebook generation pipeline with:
 *   - Sequential Stages 0-2 (research, outline, plan — must complete in order)
 *   - Parallel Stage 3 (chapter transforms) with configurable concurrency
 *   - Cost tracking and reporting after each run
 *   - Support for single chapter or all chapters
 *
 * Usage:
 *   bun run scripts/pipeline-runner.ts <slug>                        # All stages, all chapters
 *   bun run scripts/pipeline-runner.ts <slug> --parallel=3           # 3 chapters concurrently
 *   bun run scripts/pipeline-runner.ts <slug> --stage=transform      # Stage 3 only
 *   bun run scripts/pipeline-runner.ts <slug> --chapter=01           # Single chapter
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { spawnSync, execSync } from "child_process";
import { parse } from "yaml";
import { loadPipelineConfig, type CostEntry } from "./provider-config.js";
import { generateCostReport, writeCostReport, formatCostReport } from "./cost-report.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ──────────────────────────────────────────────────────────────────

interface RunnerConfig {
  slug: string;
  parallel: number;
  stage?: "research" | "outline" | "plan" | "transform" | "all";
  chapter?: string;
  dryRun?: boolean;
}

interface StageResult {
  stage: string;
  success: boolean;
  durationMs: number;
  error?: string;
  details?: string;
}

// ── Concurrency Limiter ─────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  const executing: Set<Promise<void>> = new Set();

  for (const task of tasks) {
    const p = task().then(
      (value) => { results.push({ status: "fulfilled", value }); },
      (reason) => { results.push({ status: "rejected", reason }); },
    ).then(() => { executing.delete(p); });

    executing.add(p);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.allSettled([...executing]);
  return results;
}

// ── Runtime Detection ────────────────────────────────────────────────────────

function detectTsRunner(): { cmd: string; runArgs: string[] } {
  try {
    const r = spawnSync("npx", ["tsx", "--version"], { stdio: "pipe", timeout: 10000 });
    if (r.status === 0) return { cmd: "npx", runArgs: ["tsx"] };
  } catch { /* not available */ }
  try {
    const r = spawnSync("bun", ["--version"], { stdio: "pipe", timeout: 5000 });
    if (r.status === 0) return { cmd: "bun", runArgs: ["run"] };
  } catch { /* not available */ }
  return { cmd: "node", runArgs: ["--import", "tsx"] };
}
const tsRunner = detectTsRunner();

// ── Stage Runners ───────────────────────────────────────────────────────────

async function runStage(stage: string, slug: string, extraArgs: string[] = []): Promise<StageResult> {
  const stageScripts: Record<string, string> = {
    research: "scripts/research-topic.ts",
    outline: "scripts/generate-outline.ts",
    plan: "scripts/plan-chapters.ts",
    transform: "scripts/transform-chapter.ts",
  };

  const script = stageScripts[stage];
  if (!script) throw new Error(`Unknown stage: ${stage}`);

  const startTime = Date.now();

  try {
    const proc = spawnSync(tsRunner.cmd, [...tsRunner.runArgs, join(PROJECT_ROOT, script), slug, ...extraArgs], {
      cwd: PROJECT_ROOT,
      timeout: stage === "transform" ? 600_000 : 300_000,
      env: { ...process.env },
    });

    const durationMs = Date.now() - startTime;
    const stdout = proc.stdout?.toString() || "";
    const stderr = proc.stderr?.toString() || "";

    if (proc.status !== 0) {
      return {
        stage,
        success: false,
        durationMs,
        error: stderr.slice(0, 500) || `Exit code: ${proc.status}`,
        details: stdout.slice(-200),
      };
    }

    return { stage, success: true, durationMs, details: stdout.slice(-200) };
  } catch (err) {
    return {
      stage,
      success: false,
      durationMs: Date.now() - startTime,
      error: String(err),
    };
  }
}

async function runTransformParallel(
  slug: string,
  parallel: number,
): Promise<StageResult[]> {
  // Find all chapter plan files
  const chaptersDir = join(PROJECT_ROOT, "books", slug, "chapters");
  if (!existsSync(chaptersDir)) {
    return [{ stage: "transform", success: false, durationMs: 0, error: "No chapters directory" }];
  }

  const planFiles = readdirSync(chaptersDir)
    .filter(f => f.endsWith(".plan.yml"))
    .map(f => f.replace(".plan.yml", ""))
    .sort();

  if (planFiles.length === 0) {
    return [{ stage: "transform", success: false, durationMs: 0, error: "No plan files found. Run plan stage first." }];
  }

  console.log(`  [pipeline] Transforming ${planFiles.length} chapters (concurrency: ${parallel})`);

  const tasks = planFiles.map(chapterId => {
    return () => runStage("transform", slug, [chapterId]);
  });

  const results = await runWithConcurrency(tasks, parallel);

  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return {
      stage: `transform/${planFiles[i]}`,
      success: false,
      durationMs: 0,
      error: String(r.reason),
    };
  });
}

// ── Main Pipeline ───────────────────────────────────────────────────────────

async function runPipeline(config: RunnerConfig): Promise<void> {
  const { slug, parallel, stage, chapter } = config;
  const overallStart = Date.now();
  const results: StageResult[] = [];

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  PIPELINE: ${slug}`);
  console.log(`  Concurrency: ${parallel}`);
  console.log(`  Stage: ${stage || "all"}`);
  if (chapter) console.log(`  Chapter: ${chapter}`);
  console.log(`${"═".repeat(60)}\n`);

  const stages = stage === "all" || !stage
    ? ["research", "outline", "plan", "transform"]
    : [stage];

  // Sequential stages (0-2)
  for (const s of stages) {
    if (s === "transform") continue; // handle separately

    console.log(`── Stage: ${s} ${"─".repeat(40)}`);
    const result = await runStage(s, slug);
    results.push(result);

    if (result.success) {
      console.log(`  ✅ ${s} completed (${(result.durationMs / 1000).toFixed(1)}s)`);
    } else {
      console.error(`  ❌ ${s} FAILED: ${result.error}`);
      if (!stage) {
        console.error("  Pipeline halted. Fix the issue and re-run.");
        break;
      }
    }
  }

  // Stage 3: Transform (parallel)
  if (stages.includes("transform")) {
    console.log(`── Stage: transform ${"─".repeat(40)}`);
    const lastSeqFailed = results.some(r => !r.success);

    if (lastSeqFailed && stage !== "transform") {
      console.warn("  ⚠ Skipping transform due to earlier stage failure.");
    } else if (chapter) {
      // Single chapter mode
      const result = await runStage("transform", slug, [chapter]);
      results.push(result);
      if (result.success) {
        console.log(`  ✅ transform/${chapter} completed (${(result.durationMs / 1000).toFixed(1)}s)`);
      } else {
        console.error(`  ❌ transform/${chapter} FAILED: ${result.error}`);
      }
    } else {
      // Parallel transform
      const transformResults = await runTransformParallel(slug, parallel);
      results.push(...transformResults);

      const succeeded = transformResults.filter(r => r.success).length;
      const failed = transformResults.filter(r => !r.success).length;
      console.log(`  ✅ ${succeeded} chapters transformed, ${failed} failed`);
    }
  }

  // Summary
  const totalDurationMs = Date.now() - overallStart;
  const allPassed = results.every(r => r.success);

  console.log(`\n${"═".repeat(60)}`);
  console.log(`  PIPELINE ${allPassed ? "✅ COMPLETE" : "❌ PARTIAL FAILURE"}`);
  console.log(`  Duration: ${(totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Stages: ${results.filter(r => r.success).length}/${results.length} passed`);

  // Collect and write cost report from pipeline config
  try {
    const pipelineConfig = loadPipelineConfig(PROJECT_ROOT, slug);
    const costCalls = pipelineConfig.costTracker.calls;
    if (costCalls.length > 0) {
      const report = generateCostReport(slug, costCalls);
      const outPath = writeCostReport(report);
      console.log(`  Cost report: ${outPath}`);
      console.log(`  Estimated cost: $${report.totals.estimatedCostUsd.toFixed(4)}`);
    }
  } catch {
    // Cost report is best-effort
  }

  console.log(`${"═".repeat(60)}\n`);

  if (!allPassed) {
    const failures = results.filter(r => !r.success);
    for (const f of failures) {
      console.error(`  FAILED: ${f.stage} — ${f.error}`);
    }
    process.exit(1);
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const slug = args.find(a => !a.startsWith("--"));

  if (!slug) {
    console.error("Usage: bun run scripts/pipeline-runner.ts <slug> [--parallel=N] [--stage=<stage>] [--chapter=<id>]");
    process.exit(1);
  }

  const parallelArg = args.find(a => a.startsWith("--parallel="));
  const stageArg = args.find(a => a.startsWith("--stage="));
  const chapterArg = args.find(a => a.startsWith("--chapter="));

  const config: RunnerConfig = {
    slug,
    parallel: parallelArg ? parseInt(parallelArg.split("=")[1], 10) : 2,
    stage: stageArg ? stageArg.split("=")[1] as RunnerConfig["stage"] : "all",
    chapter: chapterArg ? chapterArg.split("=")[1] : undefined,
  };

  await runPipeline(config);
}

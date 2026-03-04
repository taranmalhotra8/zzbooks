#!/usr/bin/env bun
/**
 * Self-Healing Evaluation Loop (Orchestrator).
 *
 * Evaluates all output modalities for an ebook, identifies threshold violations,
 * dispatches fix strategies, and re-evaluates in a loop until:
 *   - All modalities pass
 *   - No healable violations remain
 *   - No improvement between iterations (convergence)
 *   - Max iterations reached
 *   - Cost limit exceeded
 *
 * Usage:
 *   bun run scripts/eval-loop.ts <slug>                    # default: 3 iterations
 *   bun run scripts/eval-loop.ts <slug> --max-iter=5       # custom max iterations
 *   bun run scripts/eval-loop.ts <slug> --dry-run          # evaluate only, no healing
 *   bun run scripts/eval-loop.ts <slug> --modalities=ebook,blog  # specific modalities
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import {
  evaluateAll,
  formatUnifiedReport,
  loadModalityThresholds,
  type Modality,
  type ModalityViolation,
  type UnifiedEvalReport,
} from "./eval-modalities.js";
import { dispatchHeals, type HealResult } from "./heal-strategies.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ───────────────────────────────────────────────────────────────────

interface LoopConfig {
  slug: string;
  maxIterations: number;
  maxCostUsd: number;
  dryRun: boolean;
  modalities: Modality[];
}

interface LoopResult {
  slug: string;
  iterations: number;
  finalReport: UnifiedEvalReport;
  allReports: UnifiedEvalReport[];
  exitReason: "all_passed" | "no_healable" | "no_improvement" | "max_iterations" | "cost_limit";
  totalHeals: number;
  totalCost: number;
}

// ── Cost Tracking ───────────────────────────────────────────────────────────

class CostTracker {
  private totalCalls = 0;
  private totalTokens = 0;
  private estimatedCostUsd = 0;

  record(calls: number, tokens: number, cost: number): void {
    this.totalCalls += calls;
    this.totalTokens += tokens;
    this.estimatedCostUsd += cost;
  }

  get cost(): number {
    return this.estimatedCostUsd;
  }

  snapshot() {
    return {
      totalCalls: this.totalCalls,
      totalTokens: this.totalTokens,
      estimatedCostUsd: this.estimatedCostUsd,
    };
  }
}

// ── Build Report ────────────────────────────────────────────────────────────

async function buildReport(
  slug: string,
  iteration: number,
  modalities: Modality[],
  costTracker: CostTracker,
  healsApplied?: Array<{ strategy: string; chapter?: string; action: string }>,
): Promise<UnifiedEvalReport> {
  const results = await evaluateAll(slug, modalities);

  const allViolations = results.flatMap(r => r.violations);
  const healableViolations = allViolations.filter(v => v.healable);

  return {
    slug,
    timestamp: new Date().toISOString(),
    iteration,
    modalities: results,
    allPassed: results.every(r => r.passed),
    totalViolations: allViolations.length,
    healableViolations: healableViolations.length,
    costSoFar: costTracker.snapshot(),
    healsApplied,
  };
}

// ── Main Loop ───────────────────────────────────────────────────────────────

export async function runHealingLoop(config: LoopConfig): Promise<LoopResult> {
  const costTracker = new CostTracker();
  const allReports: UnifiedEvalReport[] = [];
  let exitReason: LoopResult["exitReason"] = "max_iterations";
  let totalHeals = 0;

  console.log(`\nSelf-Healing Eval Loop: ${config.slug}`);
  console.log(`${"=".repeat(50)}`);
  console.log(`  Max iterations: ${config.maxIterations}`);
  console.log(`  Max cost: $${config.maxCostUsd}`);
  console.log(`  Modalities: ${config.modalities.join(", ")}`);
  console.log(`  Dry run: ${config.dryRun}`);
  console.log("");

  for (let iteration = 0; iteration < config.maxIterations; iteration++) {
    console.log(`── Iteration ${iteration} ${"─".repeat(40)}`);

    // 1. Evaluate all modalities
    const report = await buildReport(config.slug, iteration, config.modalities, costTracker);
    allReports.push(report);

    console.log(formatUnifiedReport(report));

    // 2. Check exit conditions
    if (report.allPassed) {
      console.log("\n✅ ALL MODALITIES PASS — exiting loop\n");
      exitReason = "all_passed";
      break;
    }

    if (report.healableViolations === 0) {
      console.log("\n⚠️  No healable violations remaining — manual intervention needed\n");
      exitReason = "no_healable";
      break;
    }

    // 3. Check convergence (compare with previous iteration)
    if (iteration > 0) {
      const prevReport = allReports[iteration - 1];
      if (report.totalViolations >= prevReport.totalViolations) {
        console.log(`\n⚠️  No improvement: ${prevReport.totalViolations} → ${report.totalViolations} violations`);
        console.log("   Stopping — remaining violations need manual intervention\n");
        exitReason = "no_improvement";
        break;
      }
      console.log(`  Improvement: ${prevReport.totalViolations} → ${report.totalViolations} violations\n`);
    }

    // 4. Check cost limit
    if (costTracker.cost >= config.maxCostUsd) {
      console.log(`\n💰 Cost limit reached: $${costTracker.cost.toFixed(3)} >= $${config.maxCostUsd}`);
      exitReason = "cost_limit";
      break;
    }

    // 5. Dry run — don't actually heal
    if (config.dryRun) {
      console.log("  [DRY RUN] Would dispatch heals for:");
      const healable = report.modalities
        .flatMap(m => m.violations)
        .filter(v => v.healable);
      for (const v of healable) {
        const ch = v.chapter ? ` [${v.chapter}]` : "";
        console.log(`    → ${v.healStrategy}${ch}`);
      }
      exitReason = "max_iterations";
      break;
    }

    // 6. Dispatch heal strategies
    console.log("  Dispatching heals...\n");
    const healable = report.modalities
      .flatMap(m => m.violations)
      .filter(v => v.healable && v.healStrategy);

    const healResult: HealResult = await dispatchHeals(config.slug, healable);

    totalHeals += healResult.totalActions;

    // Log results
    for (const action of healResult.actions) {
      const icon = action.success ? "✅" : "❌";
      const ch = action.chapter ? ` [${action.chapter}]` : "";
      console.log(`  ${icon} ${action.strategy}${ch}: ${action.action}`);
      if (action.error) {
        console.log(`     Error: ${action.error.substring(0, 200)}`);
      }
    }

    console.log(`\n  Heals: ${healResult.successCount}/${healResult.totalActions} successful\n`);

    // Estimate cost for ebook re-transforms (rough estimate)
    const ebookHeals = healResult.actions.filter(a => a.success && (a.strategy.includes("strengthen") || a.strategy.includes("add_") || a.strategy.includes("enrich") || a.strategy.includes("simplify")));
    if (ebookHeals.length > 0) {
      // Rough estimate: ~2000 tokens per section, $0.003/1K tokens for Claude
      const estimatedTokens = ebookHeals.length * 2000;
      const estimatedCost = estimatedTokens * 0.003 / 1000;
      costTracker.record(ebookHeals.length, estimatedTokens, estimatedCost);
    }

    // If no heals succeeded, stop
    if (healResult.successCount === 0) {
      console.log("  ⚠️  No heals succeeded — stopping\n");
      exitReason = "no_healable";
      break;
    }
  }

  // Final evaluation
  const finalReport = allReports[allReports.length - 1];

  // Write report to disk
  const outputDir = join(PROJECT_ROOT, "_output", "eval");
  mkdirSync(outputDir, { recursive: true });

  const reportPath = join(outputDir, `${config.slug}-unified-eval.json`);
  writeFileSync(reportPath, JSON.stringify({
    config: {
      maxIterations: config.maxIterations,
      maxCostUsd: config.maxCostUsd,
      dryRun: config.dryRun,
      modalities: config.modalities,
    },
    result: {
      slug: config.slug,
      iterations: allReports.length,
      exitReason,
      totalHeals,
      totalCost: costTracker.cost,
      allPassed: finalReport.allPassed,
      totalViolations: finalReport.totalViolations,
      healableViolations: finalReport.healableViolations,
    },
    reports: allReports,
  }, null, 2), "utf-8");

  console.log(`\nReport written: ${reportPath}`);

  return {
    slug: config.slug,
    iterations: allReports.length,
    finalReport,
    allReports,
    exitReason,
    totalHeals,
    totalCost: costTracker.cost,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const args = process.argv.slice(2);
  const slug = args.find(a => !a.startsWith("--"));

  if (!slug) {
    console.error("Usage: bun run scripts/eval-loop.ts <slug> [--max-iter=N] [--dry-run] [--modalities=ebook,blog]");
    process.exit(1);
  }

  // Parse options
  const maxIterArg = args.find(a => a.startsWith("--max-iter="));
  const dryRun = args.includes("--dry-run");
  const modalitiesArg = args.find(a => a.startsWith("--modalities="));

  const thresholds = loadModalityThresholds();

  const maxIterations = maxIterArg
    ? parseInt(maxIterArg.split("=")[1], 10)
    : thresholds.heal.max_iterations;

  const modalities: Modality[] = modalitiesArg
    ? (modalitiesArg.split("=")[1].split(",") as Modality[])
    : ["ebook", "landing", "social", "blog"];

  const config: LoopConfig = {
    slug,
    maxIterations,
    maxCostUsd: thresholds.heal.max_cost_usd,
    dryRun,
    modalities,
  };

  const result = await runHealingLoop(config);

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log("SUMMARY");
  console.log("=".repeat(50));
  console.log(`  Ebook: ${result.slug}`);
  console.log(`  Iterations: ${result.iterations}`);
  console.log(`  Exit reason: ${result.exitReason}`);
  console.log(`  Total heals: ${result.totalHeals}`);
  console.log(`  Final violations: ${result.finalReport.totalViolations}`);
  console.log(`  All passed: ${result.finalReport.allPassed ? "✅ YES" : "❌ NO"}`);
  console.log(`  Estimated cost: $${result.totalCost.toFixed(3)}`);

  // Exit code: 0 if passed, 1 if not
  process.exit(result.finalReport.allPassed ? 0 : 1);
}

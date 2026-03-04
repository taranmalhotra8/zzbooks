#!/usr/bin/env bun
/**
 * Cost Report Generator.
 *
 * Generates per-ebook + aggregate cost breakdown JSON from the pipeline's
 * CostTracker data. Reports include per-stage, per-provider breakdowns.
 *
 * Usage:
 *   bun run scripts/cost-report.ts <slug>     # Single ebook
 *   bun run scripts/cost-report.ts --all       # All ebooks
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import type { CostEntry, CostTracker } from "./provider-config.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ──────────────────────────────────────────────────────────────────

export interface CostReportEntry {
  stage: string;
  provider: string;
  model: string;
  calls: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalDurationMs: number;
  estimatedCostUsd: number;
}

export interface CostReport {
  slug: string;
  generatedAt: string;
  byStage: Record<string, CostReportEntry>;
  byProvider: Record<string, CostReportEntry>;
  totals: {
    totalCalls: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    totalDurationMs: number;
    estimatedCostUsd: number;
  };
}

export interface AggregateCostReport {
  generatedAt: string;
  ebooks: CostReport[];
  grandTotals: CostReport["totals"];
}

// ── Per-Model Cost Rates ────────────────────────────────────────────────────

const COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-sonnet-4-20250514": { input: 0.003, output: 0.015 },
  "claude-3-haiku-20240307": { input: 0.00025, output: 0.00125 },
  // OpenAI
  "gpt-4o": { input: 0.005, output: 0.015 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  // Google
  "gemini-2.0-flash": { input: 0.00015, output: 0.0006 },
  // Default fallback
  default: { input: 0.003, output: 0.003 },
};

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const rates = COST_PER_1K_TOKENS[model] || COST_PER_1K_TOKENS.default;
  return (promptTokens / 1000) * rates.input + (completionTokens / 1000) * rates.output;
}

// ── Report Generation ───────────────────────────────────────────────────────

export function generateCostReport(slug: string, calls: CostEntry[]): CostReport {
  const byStage: Record<string, CostReportEntry> = {};
  const byProvider: Record<string, CostReportEntry> = {};

  let totalCalls = 0;
  let totalTokens = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalDurationMs = 0;
  let estimatedCostUsd = 0;

  for (const call of calls) {
    const cost = estimateCost(call.model, call.promptTokens, call.completionTokens);

    // By stage
    if (!byStage[call.stage]) {
      byStage[call.stage] = { stage: call.stage, provider: call.provider, model: call.model, calls: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0, totalDurationMs: 0, estimatedCostUsd: 0 };
    }
    const stageEntry = byStage[call.stage];
    stageEntry.calls++;
    stageEntry.totalTokens += call.promptTokens + call.completionTokens;
    stageEntry.promptTokens += call.promptTokens;
    stageEntry.completionTokens += call.completionTokens;
    stageEntry.totalDurationMs += call.durationMs;
    stageEntry.estimatedCostUsd += cost;

    // By provider
    const provKey = `${call.provider}/${call.model}`;
    if (!byProvider[provKey]) {
      byProvider[provKey] = { stage: "all", provider: call.provider, model: call.model, calls: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0, totalDurationMs: 0, estimatedCostUsd: 0 };
    }
    const provEntry = byProvider[provKey];
    provEntry.calls++;
    provEntry.totalTokens += call.promptTokens + call.completionTokens;
    provEntry.promptTokens += call.promptTokens;
    provEntry.completionTokens += call.completionTokens;
    provEntry.totalDurationMs += call.durationMs;
    provEntry.estimatedCostUsd += cost;

    // Totals
    totalCalls++;
    totalTokens += call.promptTokens + call.completionTokens;
    promptTokens += call.promptTokens;
    completionTokens += call.completionTokens;
    totalDurationMs += call.durationMs;
    estimatedCostUsd += cost;
  }

  // Round costs
  for (const entry of Object.values(byStage)) entry.estimatedCostUsd = Math.round(entry.estimatedCostUsd * 10000) / 10000;
  for (const entry of Object.values(byProvider)) entry.estimatedCostUsd = Math.round(entry.estimatedCostUsd * 10000) / 10000;

  return {
    slug,
    generatedAt: new Date().toISOString(),
    byStage,
    byProvider,
    totals: {
      totalCalls,
      totalTokens,
      promptTokens,
      completionTokens,
      totalDurationMs,
      estimatedCostUsd: Math.round(estimatedCostUsd * 10000) / 10000,
    },
  };
}

/**
 * Write cost report to _output/costs/ directory.
 */
export function writeCostReport(report: CostReport): string {
  const costsDir = join(PROJECT_ROOT, "_output", "costs");
  if (!existsSync(costsDir)) mkdirSync(costsDir, { recursive: true });

  const outPath = join(costsDir, `${report.slug}-cost-report.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  return outPath;
}

/**
 * Format cost report for console output.
 */
export function formatCostReport(report: CostReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(60);

  lines.push(hr);
  lines.push(`  COST REPORT: ${report.slug}`);
  lines.push(`  ${report.generatedAt}`);
  lines.push(hr);
  lines.push("");

  lines.push("  BY STAGE:");
  for (const [stage, entry] of Object.entries(report.byStage)) {
    lines.push(`    ${stage}: ${entry.calls} calls, ${entry.totalTokens} tokens, $${entry.estimatedCostUsd.toFixed(4)} (${(entry.totalDurationMs / 1000).toFixed(1)}s)`);
  }
  lines.push("");

  lines.push("  BY PROVIDER:");
  for (const [key, entry] of Object.entries(report.byProvider)) {
    lines.push(`    ${key}: ${entry.calls} calls, ${entry.totalTokens} tokens, $${entry.estimatedCostUsd.toFixed(4)}`);
  }
  lines.push("");

  lines.push("  TOTALS:");
  lines.push(`    Calls: ${report.totals.totalCalls}`);
  lines.push(`    Tokens: ${report.totals.totalTokens} (prompt: ${report.totals.promptTokens}, completion: ${report.totals.completionTokens})`);
  lines.push(`    Duration: ${(report.totals.totalDurationMs / 1000).toFixed(1)}s`);
  lines.push(`    Cost: $${report.totals.estimatedCostUsd.toFixed(4)}`);
  lines.push(hr);

  return lines.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: bun run scripts/cost-report.ts <slug|--all>");
    process.exit(1);
  }

  if (arg === "--all") {
    // Aggregate all existing cost reports
    const costsDir = join(PROJECT_ROOT, "_output", "costs");
    if (!existsSync(costsDir)) {
      console.error("No cost reports found. Run a pipeline first.");
      process.exit(1);
    }

    const reports: CostReport[] = [];
    for (const file of readdirSync(costsDir).filter(f => f.endsWith("-cost-report.json"))) {
      const data = JSON.parse(readFileSync(join(costsDir, file), "utf-8")) as CostReport;
      reports.push(data);
      console.log(formatCostReport(data));
    }

    // Grand totals
    if (reports.length > 0) {
      const grand = {
        totalCalls: reports.reduce((s, r) => s + r.totals.totalCalls, 0),
        totalTokens: reports.reduce((s, r) => s + r.totals.totalTokens, 0),
        promptTokens: reports.reduce((s, r) => s + r.totals.promptTokens, 0),
        completionTokens: reports.reduce((s, r) => s + r.totals.completionTokens, 0),
        totalDurationMs: reports.reduce((s, r) => s + r.totals.totalDurationMs, 0),
        estimatedCostUsd: Math.round(reports.reduce((s, r) => s + r.totals.estimatedCostUsd, 0) * 10000) / 10000,
      };
      console.log(`\n${"═".repeat(60)}`);
      console.log(`  GRAND TOTAL: ${reports.length} ebooks, $${grand.estimatedCostUsd.toFixed(4)}, ${grand.totalTokens} tokens`);
      console.log(`${"═".repeat(60)}`);
    }
  } else {
    // Single ebook — look for existing report
    const costsDir = join(PROJECT_ROOT, "_output", "costs");
    const reportPath = join(costsDir, `${arg}-cost-report.json`);

    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, "utf-8")) as CostReport;
      console.log(formatCostReport(report));
    } else {
      console.error(`No cost report found for "${arg}". Run the pipeline first.`);
      process.exit(1);
    }
  }
}

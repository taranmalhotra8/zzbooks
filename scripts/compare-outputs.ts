#!/usr/bin/env bun
/**
 * Before/after comparison tool for ebook content quality.
 * Compares audit reports from two directories (or two snapshots) and produces
 * a side-by-side HTML report showing metric deltas.
 *
 * Usage:
 *   bun run scripts/compare-outputs.ts <slug> <before-json> <after-json>
 *
 * Example:
 *   bun run scripts/compare-outputs.ts finops-playbook \
 *     _output/audit/finops-playbook-audit-before.json \
 *     _output/audit/finops-playbook-audit.json
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { auditEbook, type AuditReport } from "./content-audit.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ───────────────────────────────────────────────────────────────────

export interface MetricDelta {
  metric: string;
  before: number;
  after: number;
  delta: number;
  percentChange: number;
  improved: boolean;
}

export interface ChapterDelta {
  chapter: string;
  metrics: MetricDelta[];
}

export interface ComparisonReport {
  slug: string;
  timestamp: string;
  beforeTimestamp: string;
  afterTimestamp: string;
  overall: MetricDelta[];
  byChapter: ChapterDelta[];
  scoreBefore: string;
  scoreAfter: string;
  violationsBefore: number;
  violationsAfter: number;
}

// ── Comparison Logic ────────────────────────────────────────────────────────

function makeDelta(
  metric: string,
  before: number,
  after: number,
  higherIsBetter: boolean,
): MetricDelta {
  const delta = after - before;
  const percentChange = before !== 0 ? Number(((delta / before) * 100).toFixed(1)) : after !== 0 ? 100 : 0;
  const improved = higherIsBetter ? delta > 0 : delta < 0;

  return { metric, before, after, delta: Number(delta.toFixed(2)), percentChange, improved };
}

export function compareQuality(before: AuditReport, after: AuditReport): ComparisonReport {
  const overall: MetricDelta[] = [
    makeDelta("Diagram Density (per 1000w)", before.diagrams.densityPer1000Words, after.diagrams.densityPer1000Words, true),
    makeDelta("Total Diagrams", before.diagrams.totalDiagrams, after.diagrams.totalDiagrams, true),
    makeDelta("Total Code Blocks", before.code.totalBlocks, after.code.totalBlocks, true),
    makeDelta("Untagged Code Blocks", before.code.untaggedBlocks, after.code.untaggedBlocks, false),
    makeDelta("Generic Claims", before.genericClaims.totalClaims, after.genericClaims.totalClaims, false),
    makeDelta("Interactive Elements", before.interactive.totalElements, after.interactive.totalElements, true),
    makeDelta("Real Numbers", before.realNumbers.totalNumbers, after.realNumbers.totalNumbers, true),
    makeDelta("Reading Grade Level", before.readability.averageGradeLevel, after.readability.averageGradeLevel, false),
    makeDelta("Avg Sentence Length", before.readability.averageSentenceLength, after.readability.averageSentenceLength, false),
    makeDelta("Violations", before.violations.length, after.violations.length, false),
  ];

  // Build per-chapter comparison
  const allChapters = new Set<string>();
  for (const ch of before.diagrams.byChapter) allChapters.add(ch.chapter);
  for (const ch of after.diagrams.byChapter) allChapters.add(ch.chapter);

  const byChapter: ChapterDelta[] = [];
  for (const chapter of [...allChapters].sort()) {
    const bDiag = before.diagrams.byChapter.find((c) => c.chapter === chapter);
    const aDiag = after.diagrams.byChapter.find((c) => c.chapter === chapter);
    const bCode = before.code.byChapter.find((c) => c.chapter === chapter);
    const aCode = after.code.byChapter.find((c) => c.chapter === chapter);
    const bClaims = before.genericClaims.byChapter.find((c) => c.chapter === chapter);
    const aClaims = after.genericClaims.byChapter.find((c) => c.chapter === chapter);
    const bNums = before.realNumbers.byChapter.find((c) => c.chapter === chapter);
    const aNums = after.realNumbers.byChapter.find((c) => c.chapter === chapter);
    const bRead = before.readability.byChapter.find((c) => c.chapter === chapter);
    const aRead = after.readability.byChapter.find((c) => c.chapter === chapter);

    byChapter.push({
      chapter,
      metrics: [
        makeDelta("Diagrams", bDiag?.diagrams || 0, aDiag?.diagrams || 0, true),
        makeDelta("Code Blocks", bCode?.blocks || 0, aCode?.blocks || 0, true),
        makeDelta("Generic Claims", bClaims?.claims || 0, aClaims?.claims || 0, false),
        makeDelta("Real Numbers", bNums?.numbers || 0, aNums?.numbers || 0, true),
        makeDelta("Grade Level", bRead?.gradeLevel || 0, aRead?.gradeLevel || 0, false),
      ],
    });
  }

  return {
    slug: after.slug,
    timestamp: new Date().toISOString(),
    beforeTimestamp: before.timestamp,
    afterTimestamp: after.timestamp,
    overall,
    byChapter,
    scoreBefore: before.summary.overallScore,
    scoreAfter: after.summary.overallScore,
    violationsBefore: before.violations.length,
    violationsAfter: after.violations.length,
  };
}

// ── HTML Report ─────────────────────────────────────────────────────────────

function generateHtmlReport(comparison: ComparisonReport): string {
  const deltaCell = (d: MetricDelta): string => {
    const color = d.delta === 0 ? "#666" : d.improved ? "#16a34a" : "#dc2626";
    const arrow = d.delta === 0 ? "=" : d.improved ? "^" : "v";
    const sign = d.delta > 0 ? "+" : "";
    return `<td style="color:${color};font-weight:600">${sign}${d.delta} (${sign}${d.percentChange}%) ${arrow}</td>`;
  };

  const overallRows = comparison.overall
    .map(
      (d) =>
        `<tr><td>${d.metric}</td><td>${d.before}</td><td>${d.after}</td>${deltaCell(d)}</tr>`,
    )
    .join("\n");

  const chapterSections = comparison.byChapter
    .map((ch) => {
      const rows = ch.metrics
        .map(
          (d) =>
            `<tr><td>${d.metric}</td><td>${d.before}</td><td>${d.after}</td>${deltaCell(d)}</tr>`,
        )
        .join("\n");
      return `
        <h3>${ch.chapter}</h3>
        <table>
          <thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Delta</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quality Comparison: ${comparison.slug}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Inter, system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 2rem; color: #1e293b; background: #f8fafc; }
    h1 { font-size: 1.75rem; margin-bottom: 0.25rem; color: #0f172a; }
    h2 { font-size: 1.25rem; margin-top: 2rem; margin-bottom: 0.75rem; color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 0.5rem; }
    h3 { font-size: 1rem; margin-top: 1.5rem; margin-bottom: 0.5rem; color: #475569; }
    .meta { color: #64748b; font-size: 0.875rem; margin-bottom: 1.5rem; }
    .scores { display: flex; gap: 2rem; margin: 1.5rem 0; }
    .score-card { padding: 1rem 1.5rem; border-radius: 8px; background: white; border: 1px solid #e2e8f0; text-align: center; }
    .score-card .label { font-size: 0.75rem; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
    .score-card .value { font-size: 2rem; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; background: white; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0; }
    th { background: #f1f5f9; padding: 0.5rem 0.75rem; text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
    td { padding: 0.5rem 0.75rem; border-top: 1px solid #f1f5f9; font-size: 0.875rem; }
    tr:hover td { background: #f8fafc; }
  </style>
</head>
<body>
  <h1>Quality Comparison: ${comparison.slug}</h1>
  <p class="meta">Generated ${comparison.timestamp}</p>

  <div class="scores">
    <div class="score-card">
      <div class="label">Before</div>
      <div class="value">${comparison.scoreBefore}</div>
      <div class="label">${comparison.violationsBefore} violations</div>
    </div>
    <div class="score-card">
      <div class="label">After</div>
      <div class="value">${comparison.scoreAfter}</div>
      <div class="label">${comparison.violationsAfter} violations</div>
    </div>
  </div>

  <h2>Overall Metrics</h2>
  <table>
    <thead><tr><th>Metric</th><th>Before</th><th>After</th><th>Delta</th></tr></thead>
    <tbody>${overallRows}</tbody>
  </table>

  <h2>Per-Chapter Breakdown</h2>
  ${chapterSections}
</body>
</html>`;
}

// ── Console Report ──────────────────────────────────────────────────────────

function formatConsoleReport(comparison: ComparisonReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(70);

  lines.push(hr);
  lines.push(`  QUALITY COMPARISON: ${comparison.slug}`);
  lines.push(`  Before: ${comparison.beforeTimestamp}`);
  lines.push(`  After:  ${comparison.afterTimestamp}`);
  lines.push(hr);
  lines.push("");
  lines.push(`  Score: ${comparison.scoreBefore} -> ${comparison.scoreAfter}`);
  lines.push(`  Violations: ${comparison.violationsBefore} -> ${comparison.violationsAfter}`);
  lines.push("");

  lines.push("  OVERALL DELTAS:");
  for (const d of comparison.overall) {
    const sign = d.delta > 0 ? "+" : "";
    const arrow = d.delta === 0 ? "=" : d.improved ? "[OK]" : "[!!]";
    lines.push(`    ${d.metric.padEnd(30)} ${String(d.before).padStart(6)} -> ${String(d.after).padStart(6)}  ${sign}${d.delta} (${sign}${d.percentChange}%) ${arrow}`);
  }
  lines.push("");

  lines.push("  PER-CHAPTER:");
  for (const ch of comparison.byChapter) {
    lines.push(`    ${ch.chapter}:`);
    for (const d of ch.metrics) {
      if (d.delta === 0) continue;
      const sign = d.delta > 0 ? "+" : "";
      const arrow = d.improved ? "[OK]" : "[!!]";
      lines.push(`      ${d.metric.padEnd(20)} ${d.before} -> ${d.after} (${sign}${d.delta}) ${arrow}`);
    }
  }

  lines.push("");
  lines.push(hr);
  return lines.join("\n");
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────

if (import.meta.main) {
  const slug = process.argv[2];
  const beforePath = process.argv[3];
  const afterPath = process.argv[4];

  if (!slug) {
    console.error("Usage: bun run scripts/compare-outputs.ts <slug> <before-json> <after-json>");
    console.error("  If <after-json> is omitted, runs a fresh audit as the 'after' snapshot.");
    console.error("  If both paths are omitted, uses the latest saved report as 'before' and a fresh audit as 'after'.");
    process.exit(1);
  }

  let before: AuditReport;
  let after: AuditReport;

  if (beforePath && afterPath) {
    // Both paths provided
    if (!existsSync(beforePath)) {
      console.error(`Before report not found: ${beforePath}`);
      process.exit(1);
    }
    if (!existsSync(afterPath)) {
      console.error(`After report not found: ${afterPath}`);
      process.exit(1);
    }
    before = JSON.parse(readFileSync(beforePath, "utf-8")) as AuditReport;
    after = JSON.parse(readFileSync(afterPath, "utf-8")) as AuditReport;
  } else if (beforePath) {
    // Only before path — run fresh audit as "after"
    if (!existsSync(beforePath)) {
      console.error(`Before report not found: ${beforePath}`);
      process.exit(1);
    }
    before = JSON.parse(readFileSync(beforePath, "utf-8")) as AuditReport;
    console.log(`Running fresh audit of ${slug} as "after" snapshot...`);
    after = auditEbook(slug);
  } else {
    // No paths — use latest saved as before, fresh as after
    const defaultBefore = join(PROJECT_ROOT, "_output", "audit", `${slug}-audit.json`);
    if (!existsSync(defaultBefore)) {
      console.error(`No existing audit report found at ${defaultBefore}. Run 'make audit ebook=${slug}' first.`);
      process.exit(1);
    }
    before = JSON.parse(readFileSync(defaultBefore, "utf-8")) as AuditReport;
    console.log(`Running fresh audit of ${slug} as "after" snapshot...`);
    after = auditEbook(slug);
  }

  const comparison = compareQuality(before, after);

  // Write outputs
  const outputDir = join(PROJECT_ROOT, "_output", "audit");
  mkdirSync(outputDir, { recursive: true });

  const jsonPath = join(outputDir, `${slug}-comparison.json`);
  writeFileSync(jsonPath, JSON.stringify(comparison, null, 2));

  const htmlPath = join(outputDir, `${slug}-comparison.html`);
  writeFileSync(htmlPath, generateHtmlReport(comparison));

  // Print console report
  console.log(formatConsoleReport(comparison));
  console.log(`  JSON report: ${jsonPath}`);
  console.log(`  HTML report: ${htmlPath}`);
}

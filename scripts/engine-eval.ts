#!/usr/bin/env bun
/**
 * Engine A/B Evaluation Tool.
 *
 * Compares template-only engine output vs LLM-powered engine output
 * using automated quality metrics. Designed to validate that engine
 * changes produce systematically better output, not just better output
 * for one specific ebook.
 *
 * Metrics beyond content-audit.ts:
 *   - Placeholder detection (instructions left in prose)
 *   - Prose completeness (truncation, mid-sentence breaks)
 *   - Word count vs target adherence
 *   - Duplicate content detection
 *   - Section structure integrity
 *
 * Usage:
 *   bun run scripts/engine-eval.ts <slug>                    # Full A/B eval
 *   bun run scripts/engine-eval.ts <slug> --report-only      # Compare existing snapshots
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, cpSync } from "fs";
import { join, dirname, basename } from "path";
import { parse } from "yaml";
import type { ChapterPlan } from "./pipeline-types.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ───────────────────────────────────────────────────────────────────

interface ChapterEval {
  filename: string;
  wordCount: number;
  wordTarget: [number, number];
  wordTargetHit: boolean;
  sectionCount: number;
  expectedSections: number;
  sectionsComplete: boolean;
  placeholderCount: number;
  placeholders: string[];
  truncationDetected: boolean;
  truncationDetails: string[];
  duplicateBlocks: number;
  codeBlockCount: number;
  tableCount: number;
  realNumberCount: number;
  genericClaimCount: number;
  avgSentenceLength: number;
  readingGrade: number;
}

interface EngineSnapshot {
  engine: "template" | "llm";
  slug: string;
  timestamp: string;
  chapters: ChapterEval[];
  totals: {
    wordCount: number;
    placeholders: number;
    truncations: number;
    duplicates: number;
    codeBlocks: number;
    tables: number;
    realNumbers: number;
    genericClaims: number;
    avgReadingGrade: number;
    sectionsComplete: number;
    sectionsTotal: number;
    wordTargetsHit: number;
    wordTargetsTotal: number;
  };
}

interface MetricComparison {
  metric: string;
  template: number;
  llm: number;
  delta: number;
  percentChange: string;
  improved: boolean;
  direction: "higher-is-better" | "lower-is-better";
}

interface EvalReport {
  slug: string;
  timestamp: string;
  template: EngineSnapshot;
  llm: EngineSnapshot;
  comparisons: MetricComparison[];
  verdict: "PASS" | "FAIL" | "MIXED";
  passRate: string;
  summary: string;
}

// ── Placeholder detection ───────────────────────────────────────────────────

const PLACEHOLDER_PATTERNS = [
  /\bShow\s+a\s+\w+\s+(?:configuration|example|snippet)/gi,
  /\bExplain\s+(?:how|why|what|the)\s+/gi,
  /\bDescribe\s+(?:how|the|a)\s+/gi,
  /\bProvide\s+(?:a|an|the)\s+(?:example|overview|explanation)/gi,
  /\bInclude\s+(?:a|an)\s+(?:diagram|table|example)/gi,
  /\bAdd\s+(?:a|an)\s+(?:section|paragraph|example)\s+(?:about|on|for)/gi,
  /\b(?:TODO|FIXME|XXX|PLACEHOLDER)\b/gi,
  /\bInsert\s+(?:a|an|the)\s+/gi,
  /\bWrite\s+(?:a|an)\s+(?:paragraph|section|overview)/gi,
  /# Configure .+ settings here/gi,
  /kind: ConfigMap[\s\S]{0,100}Configure .+ settings here/g,
];

function detectPlaceholders(content: string): string[] {
  const found: string[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip YAML frontmatter
    if (line.trim() === "---") continue;
    // Skip HTML comments
    if (line.trim().startsWith("<!--")) continue;
    // Skip code fences themselves
    if (line.trim().startsWith("```")) continue;

    for (const pattern of PLACEHOLDER_PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        // Avoid false positives in actual prose (check if line looks like an instruction)
        const trimmed = line.trim();
        // If it's inside a YAML code block as a comment, that's a placeholder
        if (trimmed.startsWith("#") && /Configure|settings here/i.test(trimmed)) {
          found.push(`L${i + 1}: ${trimmed.slice(0, 120)}`);
        }
        // If the line starts with the instruction verb, it's likely a placeholder
        else if (/^(Show|Explain|Describe|Provide|Include|Add|Insert|Write|TODO|FIXME)\b/i.test(trimmed)) {
          found.push(`L${i + 1}: ${trimmed.slice(0, 120)}`);
        }
      }
    }
  }

  return [...new Set(found)]; // deduplicate
}

// ── Truncation detection ────────────────────────────────────────────────────

function detectTruncation(content: string): string[] {
  const issues: string[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#") || line.startsWith("```") || line.startsWith("|") || line.startsWith("<!--") || line.startsWith(":::") || line.startsWith("*") || line.startsWith("---")) continue;

    // Check for mid-sentence breaks (line ends without punctuation and next line is a heading or empty section)
    const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0);
    if (line.length > 20 && !line.endsWith(".") && !line.endsWith(":") && !line.endsWith("!") && !line.endsWith("?") && !line.endsWith(")") && !line.endsWith("`") && !line.endsWith(">") && !line.endsWith('"')) {
      if (nextNonEmpty && (nextNonEmpty.trim().startsWith("##") || nextNonEmpty.trim().startsWith("```"))) {
        issues.push(`L${i + 1}: Possible truncation — ends without punctuation before heading/block`);
      }
    }
  }

  return issues;
}

// ── Duplicate block detection ───────────────────────────────────────────────

function detectDuplicateBlocks(content: string): number {
  // Find all table blocks (header + separator + rows)
  const tableRegex = /^\|.+\|.*\n\|[-|: ]+\|.*\n(\|.+\|.*\n)+/gm;
  const tables = content.match(tableRegex) || [];

  // Find all code blocks
  const codeRegex = /```[\s\S]*?```/g;
  const codeBlocks = content.match(codeRegex) || [];

  let duplicates = 0;

  // Check for duplicate tables
  const seenTables = new Set<string>();
  for (const table of tables) {
    // Normalize whitespace for comparison
    const normalized = table.replace(/\s+/g, " ").trim();
    if (seenTables.has(normalized)) {
      duplicates++;
    }
    seenTables.add(normalized);
  }

  // Check for duplicate code blocks
  const seenCode = new Set<string>();
  for (const block of codeBlocks) {
    const normalized = block.replace(/\s+/g, " ").trim();
    if (seenCode.has(normalized)) {
      duplicates++;
    }
    seenCode.add(normalized);
  }

  return duplicates;
}

// ── Reading metrics ─────────────────────────────────────────────────────────

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  word = word.replace(/^y/, "");
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function readingMetrics(text: string): { grade: number; avgSentenceLength: number } {
  // Strip markdown formatting
  const clean = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\|.*\|/g, "")
    .replace(/#+\s.*/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/:::\s*\{[^}]*\}/g, "")
    .replace(/:::/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`]/g, "")
    .trim();

  const sentences = clean.split(/[.!?]+/).filter(s => s.trim().split(/\s+/).length > 2);
  const words = clean.split(/\s+/).filter(w => w.length > 0);

  if (sentences.length === 0 || words.length === 0) {
    return { grade: 0, avgSentenceLength: 0 };
  }

  const totalSyllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = totalSyllables / words.length;

  const grade = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;

  return { grade: Math.round(grade * 10) / 10, avgSentenceLength: Math.round(avgSentenceLength * 10) / 10 };
}

// ── Real number detection ───────────────────────────────────────────────────

function countRealNumbers(text: string): number {
  const patterns = [
    /\$[\d,]+(?:\.\d+)?[KMBkmb]?/g,          // Dollar amounts
    /\d+(?:\.\d+)?%/g,                         // Percentages
    /\d{2,}(?:,\d{3})+/g,                      // Large numbers with commas
  ];

  const found = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.match(pattern) || [];
    for (const m of matches) found.add(m);
  }
  return found.size;
}

// ── Generic claim detection ─────────────────────────────────────────────────

const GENERIC_PATTERNS: RegExp[] = [
  /\bshould consider\b/gi,
  /\bmany organizations\b/gi,
  /\bgenerally\b/gi,
  /\bsignificant(?:ly)?\s+(?:cost|savings|reduction|improvement|impact|overhead|margin|portion)/gi,
  /\btypically\b/gi,
  /\bin many cases\b/gi,
  /\boften\b/gi,
  /\bvarious\b/gi,
  /\bsome\s+(?:organizations|teams|companies)\b/gi,
  /\d+-\d+%/g,  // Vague ranges like "30-50%"
];

// Source names that indicate proper attribution
const ATTRIBUTION_PATTERN = /\([^)]*(?:Gartner|Flexera|CNCF|Datadog|HashiCorp|Sedai|Arc82|CloudKeeper|Apptio|Forrester|IDC|McKinsey|Deloitte|case study|customer|report|survey|benchmark|research|source)/i;

// Technical verbs that make "can be" legitimate (e.g., "can be configured")
const TECHNICAL_VERB_PATTERN = /\bcan be\s+(?:configured|deployed|set|enabled|disabled|adjusted|tuned|applied|used|achieved|automated|integrated|combined|extended|customized)\b/i;

// Named subjects that make percentage ranges legitimate (e.g., "VPA delivers 20-40%")
const NAMED_SUBJECT_PATTERN = /\b(?:VPA|HPA|Karpenter|Spot|Graviton|ARM|Terraform|Infracost|Sentinel|OPA|Kubernetes|EC2|RDS|S3|Lambda|GKE|EKS|AKS)\b/i;

function countGenericClaims(text: string): number {
  // Strip code blocks, tables, callout markers, headings, and frontmatter before counting
  const proseOnly = text
    .replace(/^---[\s\S]*?---/m, "")        // YAML frontmatter
    .replace(/```[\s\S]*?```/g, "")          // code blocks
    .replace(/^\|.*\|$/gm, "")              // table rows
    .replace(/:::\s*\{[^}]*\}/g, "")        // callout markers
    .replace(/:::/g, "")                     // callout closers
    .replace(/<!--[\s\S]*?-->/g, "")         // HTML comments
    .replace(/^#+\s.*$/gm, "");              // headings

  // Split into sentences for contextual analysis
  const sentences = proseOnly.split(/(?<=[.!?])\s+/);
  let count = 0;

  for (const sentence of sentences) {
    // Skip very short fragments
    if (sentence.split(/\s+/).length < 5) continue;

    let sentenceViolation = false;

    for (const pattern of GENERIC_PATTERNS) {
      pattern.lastIndex = 0;
      if (!pattern.test(sentence)) continue;

      // Whitelist: sentence has source attribution in parentheses
      if (ATTRIBUTION_PATTERN.test(sentence)) continue;

      // Whitelist: "can be" + technical verb is legitimate
      if (/\bcan be\b/i.test(sentence) && TECHNICAL_VERB_PATTERN.test(sentence)) continue;

      // Whitelist: percentage range with a named technology subject
      if (/\d+-\d+%/.test(sentence) && NAMED_SUBJECT_PATTERN.test(sentence)) continue;

      sentenceViolation = true;
      break; // one violation per sentence max
    }

    if (sentenceViolation) count++;
  }

  return count;
}

// ── Chapter evaluation ──────────────────────────────────────────────────────

function evaluateChapter(qmdPath: string, planPath: string): ChapterEval {
  const content = readFileSync(qmdPath, "utf-8");
  const plan = parse(readFileSync(planPath, "utf-8")) as ChapterPlan;

  const wordTarget = plan.word_target as [number, number];
  const expectedSections = plan.sections.length;

  // Count words (excluding frontmatter, comments, code blocks)
  const proseOnly = content
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "");
  const wordCount = proseOnly.split(/\s+/).filter(w => w.length > 0).length;

  // Count sections by ## headings
  const sectionHeadings = content.match(/^## /gm) || [];
  const sectionCount = sectionHeadings.length + 1; // +1 for opening (no heading)

  // Detect issues
  const placeholders = detectPlaceholders(content);
  const truncations = detectTruncation(content);
  const duplicates = detectDuplicateBlocks(content);

  // Count content elements
  const codeBlocks = content.match(/```(?:yaml|python|terraform|hcl|sql|bash|sh|dockerfile|go|typescript|javascript)/gi) || [];
  const tables = content.match(/^\|.+\|.*\n\|[-|: ]+\|/gm) || [];
  const realNumbers = countRealNumbers(proseOnly);
  const genericClaims = countGenericClaims(proseOnly);
  const { grade, avgSentenceLength } = readingMetrics(proseOnly);

  return {
    filename: basename(qmdPath),
    wordCount,
    wordTarget,
    wordTargetHit: wordCount >= wordTarget[0] && wordCount <= wordTarget[1] * 1.2, // 20% grace
    sectionCount,
    expectedSections,
    sectionsComplete: sectionCount >= expectedSections,
    placeholderCount: placeholders.length,
    placeholders,
    truncationDetected: truncations.length > 0,
    truncationDetails: truncations,
    duplicateBlocks: duplicates,
    codeBlockCount: codeBlocks.length,
    tableCount: tables.length,
    realNumberCount: realNumbers,
    genericClaimCount: genericClaims,
    avgSentenceLength,
    readingGrade: grade,
  };
}

// ── Snapshot creation ───────────────────────────────────────────────────────

function createSnapshot(engine: "template" | "llm", slug: string, chaptersDir: string): EngineSnapshot {
  const planFiles = readdirSync(chaptersDir).filter(f => f.endsWith(".plan.yml"));
  const chapters: ChapterEval[] = [];

  for (const planFile of planFiles) {
    const qmdFile = planFile.replace(".plan.yml", ".qmd");
    const qmdPath = join(chaptersDir, qmdFile);
    const planPath = join(chaptersDir, planFile);

    if (!existsSync(qmdPath)) continue;
    chapters.push(evaluateChapter(qmdPath, planPath));
  }

  const totals = {
    wordCount: chapters.reduce((s, c) => s + c.wordCount, 0),
    placeholders: chapters.reduce((s, c) => s + c.placeholderCount, 0),
    truncations: chapters.filter(c => c.truncationDetected).length,
    duplicates: chapters.reduce((s, c) => s + c.duplicateBlocks, 0),
    codeBlocks: chapters.reduce((s, c) => s + c.codeBlockCount, 0),
    tables: chapters.reduce((s, c) => s + c.tableCount, 0),
    realNumbers: chapters.reduce((s, c) => s + c.realNumberCount, 0),
    genericClaims: chapters.reduce((s, c) => s + c.genericClaimCount, 0),
    avgReadingGrade: chapters.length > 0
      ? Math.round(chapters.reduce((s, c) => s + c.readingGrade, 0) / chapters.length * 10) / 10
      : 0,
    sectionsComplete: chapters.filter(c => c.sectionsComplete).length,
    sectionsTotal: chapters.length,
    wordTargetsHit: chapters.filter(c => c.wordTargetHit).length,
    wordTargetsTotal: chapters.length,
  };

  return { engine, slug, timestamp: new Date().toISOString(), chapters, totals };
}

// ── Comparison ──────────────────────────────────────────────────────────────

function compare(template: EngineSnapshot, llm: EngineSnapshot): EvalReport {
  const t = template.totals;
  const l = llm.totals;

  const metrics: MetricComparison[] = [
    metric("Word Count", t.wordCount, l.wordCount, "higher-is-better"),
    metric("Placeholders", t.placeholders, l.placeholders, "lower-is-better"),
    metric("Truncations", t.truncations, l.truncations, "lower-is-better"),
    metric("Duplicate Blocks", t.duplicates, l.duplicates, "lower-is-better"),
    metric("Code Blocks (tagged)", t.codeBlocks, l.codeBlocks, "higher-is-better"),
    metric("Tables", t.tables, l.tables, "higher-is-better"),
    metric("Real Numbers", t.realNumbers, l.realNumbers, "higher-is-better"),
    metric("Generic Claims", t.genericClaims, l.genericClaims, "lower-is-better"),
    metric("Avg Reading Grade", t.avgReadingGrade, l.avgReadingGrade, "lower-is-better"),
    metric("Word Targets Hit", t.wordTargetsHit, l.wordTargetsHit, "higher-is-better"),
    metric("Sections Complete", t.sectionsComplete, l.sectionsComplete, "higher-is-better"),
  ];

  const improved = metrics.filter(m => m.improved).length;
  const total = metrics.length;
  const passRate = `${improved}/${total}`;

  let verdict: "PASS" | "FAIL" | "MIXED";
  if (improved >= total * 0.7) verdict = "PASS";
  else if (improved <= total * 0.3) verdict = "FAIL";
  else verdict = "MIXED";

  const summary = [
    `LLM engine ${verdict === "PASS" ? "outperforms" : verdict === "FAIL" ? "underperforms" : "partially improves on"} template engine.`,
    `${improved} of ${total} metrics improved.`,
    `Word count: ${t.wordCount} → ${l.wordCount} (+${Math.round((l.wordCount / t.wordCount - 1) * 100)}%)`,
    `Placeholders: ${t.placeholders} → ${l.placeholders}`,
    `Reading grade: ${t.avgReadingGrade} → ${l.avgReadingGrade}`,
  ].join(" ");

  return {
    slug: template.slug,
    timestamp: new Date().toISOString(),
    template,
    llm,
    comparisons: metrics,
    verdict,
    passRate,
    summary,
  };
}

function metric(
  name: string,
  template: number,
  llm: number,
  direction: "higher-is-better" | "lower-is-better",
): MetricComparison {
  const delta = llm - template;
  const pct = template > 0 ? Math.round((delta / template) * 100) : (llm > 0 ? 100 : 0);
  const improved = direction === "higher-is-better" ? delta > 0 : delta < 0;

  return {
    metric: name,
    template,
    llm,
    delta,
    percentChange: `${pct >= 0 ? "+" : ""}${pct}%`,
    improved: delta === 0 ? true : improved, // no change = neutral pass
    direction,
  };
}

// ── Report formatting ───────────────────────────────────────────────────────

function printReport(report: EvalReport): void {
  const bar = "═".repeat(70);
  console.log(`\n${bar}`);
  console.log(`  ENGINE A/B EVALUATION: ${report.slug}`);
  console.log(`  ${report.timestamp}`);
  console.log(`${bar}\n`);

  console.log(`  Verdict: ${report.verdict}  (${report.passRate} metrics improved)\n`);

  // Comparison table
  const pad = (s: string, n: number) => s.length >= n ? s : s + " ".repeat(n - s.length);
  const rpad = (s: string, n: number) => s.length >= n ? s : " ".repeat(n - s.length) + s;

  console.log(`  ${pad("Metric", 26)} ${rpad("Template", 10)} ${rpad("LLM", 10)} ${rpad("Delta", 10)}  `);
  console.log("  " + "─".repeat(62));

  for (const c of report.comparisons) {
    const arrow = c.delta === 0 ? " =" : c.improved ? " ✓" : " ✗";
    console.log(
      `  ${pad(c.metric, 26)} ${rpad(String(c.template), 10)} ${rpad(String(c.llm), 10)} ${rpad(c.percentChange, 10)} ${arrow}`,
    );
  }

  console.log();

  // Per-chapter detail for key issues
  const templatePlaceholders = report.template.chapters.flatMap(c =>
    c.placeholders.map(p => `  [template] ${c.filename}: ${p}`)
  );
  const llmPlaceholders = report.llm.chapters.flatMap(c =>
    c.placeholders.map(p => `  [llm]      ${c.filename}: ${p}`)
  );

  if (templatePlaceholders.length > 0 || llmPlaceholders.length > 0) {
    console.log("  PLACEHOLDERS DETECTED:");
    for (const p of templatePlaceholders) console.log(p);
    for (const p of llmPlaceholders) console.log(p);
    console.log();
  }

  const llmTruncations = report.llm.chapters.flatMap(c =>
    c.truncationDetails.map(t => `  [llm] ${c.filename}: ${t}`)
  );
  if (llmTruncations.length > 0) {
    console.log("  TRUNCATIONS DETECTED:");
    for (const t of llmTruncations) console.log(t);
    console.log();
  }

  // Per-chapter word count comparison
  console.log("  WORD COUNT BY CHAPTER:");
  for (let i = 0; i < report.template.chapters.length; i++) {
    const tc = report.template.chapters[i];
    const lc = report.llm.chapters[i];
    if (!lc) continue;
    const targetStr = `[${tc.wordTarget[0]}-${tc.wordTarget[1]}]`;
    const tHit = tc.wordTargetHit ? "✓" : "✗";
    const lHit = lc.wordTargetHit ? "✓" : "✗";
    console.log(
      `  ${tc.filename}: template=${tc.wordCount}${tHit} → llm=${lc.wordCount}${lHit} target=${targetStr}`
    );
  }

  console.log(`\n${bar}`);
  console.log(`  ${report.summary}`);
  console.log(`${bar}\n`);
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const slug = process.argv[2];
  const reportOnly = process.argv.includes("--report-only");

  if (!slug) {
    console.error("Usage: bun run scripts/engine-eval.ts <slug> [--report-only]");
    process.exit(1);
  }

  const evalDir = join(PROJECT_ROOT, "_output", "eval");
  mkdirSync(evalDir, { recursive: true });

  const chaptersDir = join(PROJECT_ROOT, "books", slug, "chapters");
  const templateDir = join(evalDir, "template-output");
  const llmDir = join(evalDir, "llm-output");

  if (reportOnly) {
    // Compare existing snapshots
    if (!existsSync(templateDir) || !existsSync(llmDir)) {
      console.error("No snapshots found. Run without --report-only first.");
      process.exit(1);
    }
  } else {
    // Step 1: Save current (LLM) output
    console.log("Step 1: Snapshotting current LLM output...");
    mkdirSync(llmDir, { recursive: true });
    const qmdFiles = readdirSync(chaptersDir).filter(f => f.endsWith(".qmd"));
    for (const f of qmdFiles) {
      cpSync(join(chaptersDir, f), join(llmDir, f));
    }
    // Copy plan files too
    const planFiles = readdirSync(chaptersDir).filter(f => f.endsWith(".plan.yml"));
    for (const f of planFiles) {
      cpSync(join(chaptersDir, f), join(llmDir, f));
    }

    // Step 2: Generate template-only output
    console.log("Step 2: Generating template-only output...");
    const { execSync } = require("child_process");
    execSync(`PIPELINE_MODE=mock bun run scripts/transform-chapter.ts ${slug}`, {
      cwd: PROJECT_ROOT,
      stdio: "pipe",
    });

    mkdirSync(templateDir, { recursive: true });
    for (const f of qmdFiles) {
      cpSync(join(chaptersDir, f), join(templateDir, f));
    }
    for (const f of planFiles) {
      cpSync(join(chaptersDir, f), join(templateDir, f));
    }

    // Step 3: Restore LLM output
    console.log("Step 3: Restoring LLM output...");
    for (const f of qmdFiles) {
      cpSync(join(llmDir, f), join(chaptersDir, f));
    }
  }

  // Step 4: Evaluate both
  console.log("Step 4: Evaluating both engines...\n");

  // Copy plan files to both dirs if missing
  const planFiles = readdirSync(chaptersDir).filter(f => f.endsWith(".plan.yml"));
  for (const f of planFiles) {
    if (!existsSync(join(templateDir, f))) cpSync(join(chaptersDir, f), join(templateDir, f));
    if (!existsSync(join(llmDir, f))) cpSync(join(chaptersDir, f), join(llmDir, f));
  }

  const templateSnapshot = createSnapshot("template", slug, templateDir);
  const llmSnapshot = createSnapshot("llm", slug, llmDir);

  // Step 5: Compare
  const report = compare(templateSnapshot, llmSnapshot);

  // Save report
  const reportPath = join(evalDir, `${slug}-eval.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print report
  printReport(report);

  console.log(`  JSON report: ${reportPath}`);

  // Exit with code based on verdict
  process.exit(report.verdict === "FAIL" ? 1 : 0);
}

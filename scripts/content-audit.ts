#!/usr/bin/env bun
/**
 * Content quality audit framework.
 * Measures 6+ metrics across ebook chapters and produces JSON + human-readable reports.
 *
 * Metrics:
 *   1. Diagram density — diagrams per 1000 words, by chapter
 *   2. Code density — code blocks per chapter, by language
 *   3. Generic claims — flags vague language ("should", "consider", "many", etc.)
 *   4. Interactive elements — OJS blocks, by chapter
 *   5. Real numbers — $ amounts, percentages with decimals, fleet sizes
 *   6. Reading level — Flesch-Kincaid grade level, sentence complexity
 *
 * Usage:
 *   bun run scripts/content-audit.ts <slug>
 *   bun run scripts/content-audit.ts              # audits all ebooks
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { parse } from "yaml";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ───────────────────────────────────────────────────────────────────

export interface DiagramMetrics {
  totalDiagrams: number;
  totalWords: number;
  densityPer1000Words: number;
  byChapter: Array<{ chapter: string; diagrams: number; words: number; density: number }>;
}

export interface CodeBlockInfo {
  language: string;
  lineCount: number;
}

export interface CodeMetrics {
  totalBlocks: number;
  byLanguage: Record<string, number>;
  byChapter: Array<{ chapter: string; blocks: number; languages: Record<string, number> }>;
  untaggedBlocks: number;
}

export interface GenericClaim {
  chapter: string;
  line: number;
  text: string;
  pattern: string;
}

export interface GenericClaimMetrics {
  totalClaims: number;
  byChapter: Array<{ chapter: string; claims: number }>;
  details: GenericClaim[];
}

export interface InteractiveMetrics {
  totalElements: number;
  byChapter: Array<{ chapter: string; elements: number }>;
}

export interface RealNumber {
  chapter: string;
  line: number;
  text: string;
  type: "dollar" | "percentage" | "specific_number";
}

export interface NumberMetrics {
  totalNumbers: number;
  byChapter: Array<{ chapter: string; numbers: number }>;
  byType: Record<string, number>;
  details: RealNumber[];
}

export interface ReadabilityMetrics {
  averageGradeLevel: number;
  averageSentenceLength: number;
  byChapter: Array<{
    chapter: string;
    gradeLevel: number;
    avgSentenceLength: number;
    totalSentences: number;
    totalWords: number;
  }>;
}

export interface ThresholdViolation {
  metric: string;
  chapter?: string;
  actual: number;
  threshold: number;
  direction: "below" | "above";
  message: string;
}

export interface ImageMetrics {
  totalImages: number;
  totalWords: number;
  imagesPer800Words: number;
  byChapter: Array<{ chapter: string; images: number; words: number; imagesPer800Words: number }>;
}

export interface AuditReport {
  slug: string;
  timestamp: string;
  diagrams: DiagramMetrics;
  code: CodeMetrics;
  genericClaims: GenericClaimMetrics;
  interactive: InteractiveMetrics;
  realNumbers: NumberMetrics;
  readability: ReadabilityMetrics;
  images: ImageMetrics;
  violations: ThresholdViolation[];
  summary: {
    totalChapters: number;
    overallScore: string;
    violationCount: number;
  };
}

interface QualityThresholds {
  min_diagram_density: number;
  min_code_blocks_per_chapter: number;
  max_generic_claims_per_chapter: number;
  min_real_numbers_per_chapter: number;
  min_interactive_elements: number;
  max_reading_grade_level: number;
  min_reading_grade_level: number;
  max_untagged_code_blocks: number;
  min_images_per_800_words: number;
}

// ── Threshold Loading ───────────────────────────────────────────────────────

function loadThresholds(slug: string): QualityThresholds {
  const thresholdPath = join(PROJECT_ROOT, "quality-thresholds.yml");
  const defaultThresholds: QualityThresholds = {
    min_diagram_density: 0.3,
    min_code_blocks_per_chapter: 2,
    max_generic_claims_per_chapter: 5,
    min_real_numbers_per_chapter: 1,
    min_interactive_elements: 0,
    max_reading_grade_level: 14,
    min_reading_grade_level: 8,
    max_untagged_code_blocks: 0,
    min_images_per_800_words: 1,
  };

  if (!existsSync(thresholdPath)) return defaultThresholds;

  try {
    const content = parse(readFileSync(thresholdPath, "utf-8")) as {
      defaults?: Partial<QualityThresholds>;
      [key: string]: unknown;
    };

    const merged = { ...defaultThresholds, ...(content.defaults || {}) };

    // Apply per-ebook overrides
    const ebookOverrides = content[slug] as Partial<QualityThresholds> | undefined;
    if (ebookOverrides) {
      Object.assign(merged, ebookOverrides);
    }

    return merged;
  } catch {
    return defaultThresholds;
  }
}

// ── Chapter Loading ─────────────────────────────────────────────────────────

function getChapterFiles(slug: string): string[] {
  const chaptersDir = join(PROJECT_ROOT, "books", slug, "chapters");
  if (!existsSync(chaptersDir)) return [];

  return readdirSync(chaptersDir)
    .filter((f) => f.endsWith(".qmd") || f.endsWith(".md"))
    .sort()
    .map((f) => join(chaptersDir, f));
}

function stripFrontMatter(content: string): string {
  return content.replace(/^---[\s\S]*?---/, "");
}

function countWords(text: string): number {
  const cleaned = text.trim().split(/\s+/).filter((w) => w.length > 0);
  return cleaned.length;
}

// ── Metric 1: Diagram Density ───────────────────────────────────────────────

const DIAGRAM_PATTERNS = [
  /```\{\.?mermaid[^}]*\}/g, // ```{mermaid} or ```{.mermaid ...}
  /```\{\.?d2[^}]*\}/g,      // ```{d2} or ```{.d2 width="100%" ...}
  /```mermaid/g,
  /```d2/g,
  /!\[.*?\]\(.*?\)/g,         // Markdown images
  /{{< diagram /g,            // Quarto diagram shortcode
];

export function measureDiagramDensity(slug: string): DiagramMetrics {
  const chapters = getChapterFiles(slug);
  const byChapter: DiagramMetrics["byChapter"] = [];
  let totalDiagrams = 0;
  let totalWords = 0;

  for (const chapterPath of chapters) {
    const raw = readFileSync(chapterPath, "utf-8");
    const content = stripFrontMatter(raw);

    // Strip code blocks before counting words
    const textOnly = content.replace(/```[\s\S]*?```/g, "");
    const words = countWords(textOnly);

    let diagrams = 0;
    for (const pattern of DIAGRAM_PATTERNS) {
      const matches = raw.match(pattern);
      if (matches) diagrams += matches.length;
    }

    totalDiagrams += diagrams;
    totalWords += words;

    byChapter.push({
      chapter: basename(chapterPath, ".qmd"),
      diagrams,
      words,
      density: words > 0 ? Number(((diagrams / words) * 1000).toFixed(2)) : 0,
    });
  }

  return {
    totalDiagrams,
    totalWords,
    densityPer1000Words: totalWords > 0 ? Number(((totalDiagrams / totalWords) * 1000).toFixed(2)) : 0,
    byChapter,
  };
}

// ── Metric 2: Code Density ──────────────────────────────────────────────────

const CODE_BLOCK_RE = /```(\{[^}]*\}|[\w.-]+)?/g;
const CODE_BLOCK_FULL_RE = /```(\{[^}]*\}|[\w.-]+)?\n([\s\S]*?)```/g;

export function measureCodeDensity(slug: string): CodeMetrics {
  const chapters = getChapterFiles(slug);
  const byChapter: CodeMetrics["byChapter"] = [];
  let totalBlocks = 0;
  let untaggedBlocks = 0;
  const byLanguage: Record<string, number> = {};

  for (const chapterPath of chapters) {
    const content = readFileSync(chapterPath, "utf-8");
    const chapterLanguages: Record<string, number> = {};
    let chapterBlocks = 0;

    // Line-by-line toggle parser (avoids regex mismatching closing ``` as openings)
    const lines = content.split("\n");
    let inBlock = false;
    for (const line of lines) {
      if (line.startsWith("```")) {
        if (inBlock) {
          // Closing fence — just toggle off
          inBlock = false;
        } else {
          // Opening fence — extract language tag
          inBlock = true;
          chapterBlocks++;
          const fenceContent = line.slice(3).trim();
          let rawLang = fenceContent.replace(/[{}]/g, "").trim();
          let lang = rawLang.replace(/^\./, "").split(/\s+/)[0];

          if (!lang) {
            untaggedBlocks++;
            lang = "untagged";
          }

          chapterLanguages[lang] = (chapterLanguages[lang] || 0) + 1;
          byLanguage[lang] = (byLanguage[lang] || 0) + 1;
        }
      }
    }

    totalBlocks += chapterBlocks;
    byChapter.push({
      chapter: basename(chapterPath, ".qmd"),
      blocks: chapterBlocks,
      languages: chapterLanguages,
    });
  }

  return { totalBlocks, byLanguage, byChapter, untaggedBlocks };
}

// ── Metric 3: Generic Claims Detection ──────────────────────────────────────

const GENERIC_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bshould consider\b/gi, label: "should consider" },
  { pattern: /\bmany organizations\b/gi, label: "many organizations" },
  { pattern: /\bsome (teams|organizations|companies)\b/gi, label: "some teams/organizations" },
  { pattern: /\bit is (important|recommended|suggested)\b/gi, label: "vague recommendation" },
  { pattern: /\bgenerally\b/gi, label: "generally" },
  { pattern: /\btypically\b/gi, label: "typically" },
  { pattern: /\bsignificant(ly)?\b/gi, label: "significant(ly)" },
  { pattern: /\b\d{1,2}-\d{1,2}%/g, label: "vague percentage range" },
  { pattern: /\bvarious\b/gi, label: "various" },
  { pattern: /\bin many cases\b/gi, label: "in many cases" },
  { pattern: /\bcan be\b/gi, label: "can be (weak assertion)" },
  { pattern: /\boften\b/gi, label: "often" },
];

// Whitelists — matches here suppress the generic claim flag (consistent with engine-eval.ts)
const ATTRIBUTION_PATTERN = /(?:\([^)]*(?:Gartner|Flexera|CNCF|Datadog|HashiCorp|Sedai|Arc82|CloudKeeper|Apptio|Forrester|IDC|McKinsey|Deloitte|Flosum|Future Processing|case study|customer|report|survey|benchmark|research|source|industry)|\bFACT SHEET\b)/i;
const TECHNICAL_VERB_PATTERN = /\bcan be\s+(?:configured|deployed|set|enabled|disabled|adjusted|tuned|applied|used|achieved|automated|integrated|combined|extended|customized|scheduled|optimized|migrated|resized|scaled)\b/i;
const NAMED_SUBJECT_PATTERN = /\b(?:VPA|HPA|Karpenter|Spot|Graviton|ARM|Terraform|Infracost|Sentinel|OPA|Kubernetes|EC2|RDS|S3|Lambda|GKE|EKS|AKS|Azure|GCP|AWS|Reserved Instance|Savings Plan|CloudWatch|Prometheus)\b/i;

function isWhitelisted(line: string, label: string): boolean {
  // Attributed claims are not vague (they have a named source)
  if (ATTRIBUTION_PATTERN.test(line)) return true;

  // "can be" followed by a technical verb is legitimate usage
  if (label === "can be (weak assertion)" && TECHNICAL_VERB_PATTERN.test(line)) return true;

  // Percentage ranges paired with named technology/service are specific
  if (label === "vague percentage range" && NAMED_SUBJECT_PATTERN.test(line)) return true;

  // "typically" or "often" with a specific number is contextual
  if ((label === "typically" || label === "often") && /\$[\d,]+|\d+%|\d+ (?:minutes|hours|days|weeks|months)/.test(line)) return true;

  // Skip lines inside tables (pipe-delimited)
  if (line.trim().startsWith("|") && line.trim().endsWith("|")) return true;

  // Percentage ranges with a dollar amount or timeframe on same line are specific
  if (label === "vague percentage range" && /\$[\d,]+|\d+ (?:year|month|day|week)s?\b/.test(line)) return true;

  // "significantly" or "significant" near a specific number is fine
  if (label === "significant(ly)" && /\$[\d,]+|\d+%|\d+x\b/.test(line)) return true;

  // "can be" with a specific outcome (number, percentage, dollar) is fine
  if (label === "can be (weak assertion)" && /\$[\d,]+|\d+%/.test(line)) return true;

  return false;
}

export function detectGenericClaims(slug: string): GenericClaimMetrics {
  const chapters = getChapterFiles(slug);
  const details: GenericClaim[] = [];
  const byChapter: GenericClaimMetrics["byChapter"] = [];

  for (const chapterPath of chapters) {
    const content = readFileSync(chapterPath, "utf-8");
    const lines = content.split("\n");
    let chapterClaims = 0;
    const chapterName = basename(chapterPath, ".qmd");
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Track code blocks properly (toggle on ```)
      if (line.startsWith("```")) { inCodeBlock = !inCodeBlock; continue; }
      // Skip inside code blocks, front matter, headings
      if (inCodeBlock || line.startsWith("---") || line.startsWith("#")) continue;

      for (const { pattern, label } of GENERIC_PATTERNS) {
        // Reset regex state for each line
        pattern.lastIndex = 0;
        if (pattern.test(line) && !isWhitelisted(line, label)) {
          chapterClaims++;
          details.push({
            chapter: chapterName,
            line: i + 1,
            text: line.trim().substring(0, 120),
            pattern: label,
          });
        }
      }
    }

    byChapter.push({ chapter: chapterName, claims: chapterClaims });
  }

  return { totalClaims: details.length, byChapter, details };
}

// ── Metric 4: Interactive Elements ──────────────────────────────────────────

const INTERACTIVE_PATTERNS = [
  /```\{\.?ojs[^}]*\}/g,        // ```{ojs} or ```{.ojs ...}
  /```\{\.?observable[^}]*\}/g,  // ```{observable} or ```{.observable ...}
  /{{< interactive /g,
];

export function countInteractiveElements(slug: string): InteractiveMetrics {
  const chapters = getChapterFiles(slug);
  const byChapter: InteractiveMetrics["byChapter"] = [];
  let totalElements = 0;

  for (const chapterPath of chapters) {
    const content = readFileSync(chapterPath, "utf-8");
    let elements = 0;

    for (const pattern of INTERACTIVE_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) elements += matches.length;
    }

    totalElements += elements;
    byChapter.push({
      chapter: basename(chapterPath, ".qmd"),
      elements,
    });
  }

  return { totalElements, byChapter };
}

// ── Metric 5: Real Numbers Detection ────────────────────────────────────────

const REAL_NUMBER_PATTERNS: Array<{ pattern: RegExp; type: RealNumber["type"] }> = [
  // Dollar amounts: $100, $1,000, $1.2M, $100K
  { pattern: /\$[\d,.]+[KMBkmb]?/g, type: "dollar" },
  // Specific percentages: 30.5%, 99.99%
  { pattern: /\b\d+\.\d+%/g, type: "percentage" },
  // Exact whole percentages: 30%, 100% (but not ranges like 30-50%)
  { pattern: /(?<!\d-)\b\d{1,3}%(?![\s-]*\d)/g, type: "percentage" },
  // Fleet/resource sizes: "500 instances", "10,000 servers", "2000 VMs"
  { pattern: /\b[\d,]+\s+(instances|servers|VMs|nodes|clusters|containers|pods|requests|users)\b/gi, type: "specific_number" },
  // Specific dollar savings: "save $X", "$X per month/year"
  { pattern: /\$[\d,.]+[KMBkmb]?\s*(?:per|\/)\s*(?:month|year|day|hour)\b/gi, type: "dollar" },
];

export function detectRealNumbers(slug: string): NumberMetrics {
  const chapters = getChapterFiles(slug);
  const details: RealNumber[] = [];
  const byChapter: NumberMetrics["byChapter"] = [];
  const byType: Record<string, number> = {};

  for (const chapterPath of chapters) {
    const content = readFileSync(chapterPath, "utf-8");
    const lines = content.split("\n");
    let chapterNumbers = 0;
    const chapterName = basename(chapterPath, ".qmd");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip code blocks and front matter
      if (line.startsWith("```") || line.startsWith("---")) continue;

      for (const { pattern, type } of REAL_NUMBER_PATTERNS) {
        pattern.lastIndex = 0;
        const matches = [...line.matchAll(pattern)];
        for (const match of matches) {
          chapterNumbers++;
          byType[type] = (byType[type] || 0) + 1;
          details.push({
            chapter: chapterName,
            line: i + 1,
            text: match[0],
            type,
          });
        }
      }
    }

    byChapter.push({ chapter: chapterName, numbers: chapterNumbers });
  }

  return { totalNumbers: details.length, byChapter, byType, details };
}

// ── Metric 6: Reading Level ─────────────────────────────────────────────────

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;

  // Count vowel groups
  const vowelGroups = word.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 1;

  // Subtract silent e
  if (word.endsWith("e") && !word.endsWith("le")) count--;
  // Subtract -ed endings (usually not a syllable)
  if (word.endsWith("ed") && word.length > 4) count--;

  return Math.max(1, count);
}

function countSentences(text: string): number {
  // Split on sentence-ending punctuation
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  return Math.max(1, sentences.length);
}

export function measureReadingLevel(slug: string): ReadabilityMetrics {
  const chapters = getChapterFiles(slug);
  const byChapter: ReadabilityMetrics["byChapter"] = [];
  let totalGradeSum = 0;
  let totalSentenceLengthSum = 0;
  let chapterCount = 0;

  for (const chapterPath of chapters) {
    const raw = readFileSync(chapterPath, "utf-8");
    let content = stripFrontMatter(raw);
    // Strip code blocks and callout markers
    content = content.replace(/```[\s\S]*?```/g, "");
    content = content.replace(/:::\s*\{[^}]*\}/g, "");
    content = content.replace(/:::/g, "");
    // Strip markdown formatting
    content = content.replace(/[#*_\[\]()]/g, "");

    const words = content.trim().split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;
    const sentenceCount = countSentences(content);
    const syllableCount = words.reduce((sum, w) => sum + countSyllables(w), 0);

    // Flesch-Kincaid Grade Level
    const avgSentenceLength = wordCount / sentenceCount;
    const avgSyllablesPerWord = syllableCount / Math.max(1, wordCount);
    const gradeLevel = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;
    const clampedGrade = Number(Math.max(0, gradeLevel).toFixed(1));

    totalGradeSum += clampedGrade;
    totalSentenceLengthSum += avgSentenceLength;
    chapterCount++;

    byChapter.push({
      chapter: basename(chapterPath, ".qmd"),
      gradeLevel: clampedGrade,
      avgSentenceLength: Number(avgSentenceLength.toFixed(1)),
      totalSentences: sentenceCount,
      totalWords: wordCount,
    });
  }

  return {
    averageGradeLevel: chapterCount > 0 ? Number((totalGradeSum / chapterCount).toFixed(1)) : 0,
    averageSentenceLength:
      chapterCount > 0 ? Number((totalSentenceLengthSum / chapterCount).toFixed(1)) : 0,
    byChapter,
  };
}

// ── Metric 7: Image Density ─────────────────────────────────────────────────

export function measureImageDensity(slug: string): ImageMetrics {
  const chapters = getChapterFiles(slug);
  const byChapter: ImageMetrics["byChapter"] = [];
  let totalImages = 0;
  let totalWords = 0;

  for (const file of chapters) {
    const content = readFileSync(file, "utf-8");
    const cleaned = stripFrontMatter(content);
    const words = countWords(cleaned);
    // Count markdown image references: ![alt](path)
    const imageMatches = cleaned.match(/!\[.*?\]\(.*?\)/g) || [];
    const images = imageMatches.length;

    totalImages += images;
    totalWords += words;

    byChapter.push({
      chapter: basename(file).replace(/\.(qmd|md)$/, ""),
      images,
      words,
      imagesPer800Words: words > 0 ? Math.round((images / words) * 800 * 100) / 100 : 0,
    });
  }

  return {
    totalImages,
    totalWords,
    imagesPer800Words: totalWords > 0 ? Math.round((totalImages / totalWords) * 800 * 100) / 100 : 0,
    byChapter,
  };
}

// ── Threshold Checking ──────────────────────────────────────────────────────

function checkThresholds(
  report: Omit<AuditReport, "violations" | "summary">,
  thresholds: QualityThresholds,
): ThresholdViolation[] {
  const violations: ThresholdViolation[] = [];

  // Diagram density
  if (report.diagrams.densityPer1000Words < thresholds.min_diagram_density) {
    violations.push({
      metric: "diagram_density",
      actual: report.diagrams.densityPer1000Words,
      threshold: thresholds.min_diagram_density,
      direction: "below",
      message: `Overall diagram density (${report.diagrams.densityPer1000Words}/1000 words) is below minimum (${thresholds.min_diagram_density}/1000 words)`,
    });
  }

  // Code density per chapter (skip intro/preface chapters — they are summaries, not technical content)
  const isIntroChapter = (name: string) => /^0[01]-intro|^0[01]-preface|^index$/.test(name);
  for (const ch of report.code.byChapter) {
    if (isIntroChapter(ch.chapter)) continue;
    if (ch.blocks < thresholds.min_code_blocks_per_chapter) {
      violations.push({
        metric: "code_density",
        chapter: ch.chapter,
        actual: ch.blocks,
        threshold: thresholds.min_code_blocks_per_chapter,
        direction: "below",
        message: `Chapter "${ch.chapter}" has ${ch.blocks} code blocks (minimum: ${thresholds.min_code_blocks_per_chapter})`,
      });
    }
  }

  // Generic claims per chapter
  for (const ch of report.genericClaims.byChapter) {
    if (ch.claims > thresholds.max_generic_claims_per_chapter) {
      violations.push({
        metric: "generic_claims",
        chapter: ch.chapter,
        actual: ch.claims,
        threshold: thresholds.max_generic_claims_per_chapter,
        direction: "above",
        message: `Chapter "${ch.chapter}" has ${ch.claims} generic claims (maximum: ${thresholds.max_generic_claims_per_chapter})`,
      });
    }
  }

  // Real numbers per chapter (skip intro/preface chapters)
  for (const ch of report.realNumbers.byChapter) {
    if (isIntroChapter(ch.chapter)) continue;
    if (ch.numbers < thresholds.min_real_numbers_per_chapter) {
      violations.push({
        metric: "real_numbers",
        chapter: ch.chapter,
        actual: ch.numbers,
        threshold: thresholds.min_real_numbers_per_chapter,
        direction: "below",
        message: `Chapter "${ch.chapter}" has ${ch.numbers} real numbers (minimum: ${thresholds.min_real_numbers_per_chapter})`,
      });
    }
  }

  // Interactive elements
  if (report.interactive.totalElements < thresholds.min_interactive_elements) {
    violations.push({
      metric: "interactive_elements",
      actual: report.interactive.totalElements,
      threshold: thresholds.min_interactive_elements,
      direction: "below",
      message: `Ebook has ${report.interactive.totalElements} interactive elements (minimum: ${thresholds.min_interactive_elements})`,
    });
  }

  // Reading level
  if (report.readability.averageGradeLevel > thresholds.max_reading_grade_level) {
    violations.push({
      metric: "reading_level",
      actual: report.readability.averageGradeLevel,
      threshold: thresholds.max_reading_grade_level,
      direction: "above",
      message: `Average reading grade level (${report.readability.averageGradeLevel}) exceeds maximum (${thresholds.max_reading_grade_level})`,
    });
  }
  if (
    report.readability.averageGradeLevel > 0 &&
    report.readability.averageGradeLevel < thresholds.min_reading_grade_level
  ) {
    violations.push({
      metric: "reading_level",
      actual: report.readability.averageGradeLevel,
      threshold: thresholds.min_reading_grade_level,
      direction: "below",
      message: `Average reading grade level (${report.readability.averageGradeLevel}) is below minimum (${thresholds.min_reading_grade_level})`,
    });
  }

  // Untagged code blocks
  if (report.code.untaggedBlocks > thresholds.max_untagged_code_blocks) {
    violations.push({
      metric: "untagged_code_blocks",
      actual: report.code.untaggedBlocks,
      threshold: thresholds.max_untagged_code_blocks,
      direction: "above",
      message: `${report.code.untaggedBlocks} code blocks lack language tags (maximum: ${thresholds.max_untagged_code_blocks})`,
    });
  }

  // Image density
  if (report.images.imagesPer800Words < thresholds.min_images_per_800_words) {
    violations.push({
      metric: "image_density",
      actual: report.images.imagesPer800Words,
      threshold: thresholds.min_images_per_800_words,
      direction: "below",
      message: `Image density (${report.images.imagesPer800Words} per 800 words) is below minimum (${thresholds.min_images_per_800_words} per 800 words)`,
    });
  }

  return violations;
}

// ── Overall Score ───────────────────────────────────────────────────────────

function computeOverallScore(violations: ThresholdViolation[]): string {
  const count = violations.length;
  if (count === 0) return "A";
  if (count <= 3) return "B";
  if (count <= 7) return "C";
  if (count <= 12) return "D";
  return "F";
}

// ── Main Audit Function ─────────────────────────────────────────────────────

export function auditEbook(slug: string): AuditReport {
  const thresholds = loadThresholds(slug);

  const diagrams = measureDiagramDensity(slug);
  const code = measureCodeDensity(slug);
  const genericClaims = detectGenericClaims(slug);
  const interactive = countInteractiveElements(slug);
  const realNumbers = detectRealNumbers(slug);
  const readability = measureReadingLevel(slug);
  const images = measureImageDensity(slug);

  const partial = { slug, timestamp: new Date().toISOString(), diagrams, code, genericClaims, interactive, realNumbers, readability, images };
  const violations = checkThresholds(partial, thresholds);

  return {
    ...partial,
    violations,
    summary: {
      totalChapters: diagrams.byChapter.length,
      overallScore: computeOverallScore(violations),
      violationCount: violations.length,
    },
  };
}

// ── Report Formatting ───────────────────────────────────────────────────────

function formatHumanReport(report: AuditReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(70);

  lines.push(hr);
  lines.push(`  CONTENT QUALITY AUDIT: ${report.slug}`);
  lines.push(`  ${report.timestamp}`);
  lines.push(hr);
  lines.push("");

  // Summary
  lines.push(`  Overall Score: ${report.summary.overallScore}  (${report.summary.violationCount} violation(s))`);
  lines.push(`  Chapters: ${report.summary.totalChapters}`);
  lines.push("");

  // Diagram Density
  lines.push(`  DIAGRAMS`);
  lines.push(`  Total: ${report.diagrams.totalDiagrams} diagrams in ${report.diagrams.totalWords} words`);
  lines.push(`  Density: ${report.diagrams.densityPer1000Words} per 1000 words`);
  for (const ch of report.diagrams.byChapter) {
    const marker = ch.diagrams === 0 ? " [!]" : "";
    lines.push(`    ${ch.chapter}: ${ch.diagrams} diagrams (${ch.density}/1000w)${marker}`);
  }
  lines.push("");

  // Code Density
  lines.push(`  CODE BLOCKS`);
  lines.push(`  Total: ${report.code.totalBlocks} blocks`);
  lines.push(`  Languages: ${Object.entries(report.code.byLanguage).map(([k, v]) => `${k}(${v})`).join(", ")}`);
  if (report.code.untaggedBlocks > 0) {
    lines.push(`  Untagged: ${report.code.untaggedBlocks} blocks missing language tags`);
  }
  for (const ch of report.code.byChapter) {
    const marker = ch.blocks === 0 ? " [!]" : "";
    lines.push(`    ${ch.chapter}: ${ch.blocks} blocks${marker}`);
  }
  lines.push("");

  // Generic Claims
  lines.push(`  GENERIC CLAIMS`);
  lines.push(`  Total: ${report.genericClaims.totalClaims}`);
  for (const ch of report.genericClaims.byChapter) {
    const marker = ch.claims > 5 ? " [!]" : "";
    lines.push(`    ${ch.chapter}: ${ch.claims} claims${marker}`);
  }
  lines.push("");

  // Interactive Elements
  lines.push(`  INTERACTIVE ELEMENTS`);
  lines.push(`  Total: ${report.interactive.totalElements}`);
  for (const ch of report.interactive.byChapter) {
    lines.push(`    ${ch.chapter}: ${ch.elements}`);
  }
  lines.push("");

  // Real Numbers
  lines.push(`  REAL NUMBERS`);
  lines.push(`  Total: ${report.realNumbers.totalNumbers}`);
  lines.push(`  By type: ${Object.entries(report.realNumbers.byType).map(([k, v]) => `${k}(${v})`).join(", ")}`);
  for (const ch of report.realNumbers.byChapter) {
    const marker = ch.numbers === 0 ? " [!]" : "";
    lines.push(`    ${ch.chapter}: ${ch.numbers}${marker}`);
  }
  lines.push("");

  // Image Density
  lines.push(`  IMAGES`);
  lines.push(`  Total: ${report.images.totalImages} images in ${report.images.totalWords} words`);
  lines.push(`  Density: ${report.images.imagesPer800Words} per 800 words`);
  for (const ch of report.images.byChapter) {
    const marker = ch.images === 0 ? " [!]" : "";
    lines.push(`    ${ch.chapter}: ${ch.images} images (${ch.imagesPer800Words}/800w)${marker}`);
  }
  lines.push("");

  // Reading Level
  lines.push(`  READING LEVEL`);
  lines.push(`  Average Grade: ${report.readability.averageGradeLevel}`);
  lines.push(`  Average Sentence Length: ${report.readability.averageSentenceLength} words`);
  for (const ch of report.readability.byChapter) {
    lines.push(`    ${ch.chapter}: grade ${ch.gradeLevel}, ${ch.avgSentenceLength} words/sentence`);
  }
  lines.push("");

  // Violations
  if (report.violations.length > 0) {
    lines.push(`  THRESHOLD VIOLATIONS (${report.violations.length})`);
    for (const v of report.violations) {
      lines.push(`    WARN: ${v.message}`);
    }
    lines.push("");
  }

  lines.push(hr);
  return lines.join("\n");
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────

function getEbookSlugs(): string[] {
  const calendarPath = join(PROJECT_ROOT, "calendar.yml");
  if (!existsSync(calendarPath)) return [];

  try {
    const cal = parse(readFileSync(calendarPath, "utf-8")) as { ebooks?: Array<{ slug: string }> };
    return (cal.ebooks || []).map((e) => e.slug);
  } catch {
    return [];
  }
}

if (import.meta.main) {
  const slug = process.argv[2];
  const slugs = slug ? [slug] : getEbookSlugs();

  if (slugs.length === 0) {
    console.error("No ebooks found. Usage: bun run scripts/content-audit.ts [slug]");
    process.exit(1);
  }

  for (const s of slugs) {
    const bookDir = join(PROJECT_ROOT, "books", s);
    if (!existsSync(bookDir)) {
      console.error(`Book directory not found: books/${s}/`);
      continue;
    }

    console.log(`\nAuditing ${s}...`);
    const report = auditEbook(s);

    // Write JSON report
    const outputDir = join(PROJECT_ROOT, "_output", "audit");
    mkdirSync(outputDir, { recursive: true });
    const jsonPath = join(outputDir, `${s}-audit.json`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    // Print human-readable summary
    console.log(formatHumanReport(report));
    console.log(`  JSON report: ${jsonPath}`);
  }
}

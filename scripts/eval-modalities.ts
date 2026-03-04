#!/usr/bin/env bun
/**
 * Unified evaluation framework for all output modalities.
 * Evaluates: ebook chapters, landing pages, social assets, blog posts.
 *
 * Each evaluator returns a ModalityEvalResult with metrics, violations,
 * and heal strategies that the self-healing loop can dispatch.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { parse } from "yaml";
import { auditEbook, type AuditReport, type ThresholdViolation } from "./content-audit.js";
import { analyzePdf, findPdfPath, type PdfEvalResult } from "./pdf-eval.js";
import { checkFreshness, type FreshnessReport } from "./freshness-check.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ───────────────────────────────────────────────────────────────────

export type Modality = "ebook" | "landing" | "social" | "blog" | "pdf" | "hub";

export interface ModalityMetric {
  name: string;
  actual: number;
  threshold: number;
  direction: "higher-is-better" | "lower-is-better";
  passed: boolean;
  chapter?: string;
}

export interface ModalityViolation {
  modality: Modality;
  metric: string;
  chapter?: string;
  actual: number;
  threshold: number;
  direction: "below" | "above";
  message: string;
  healable: boolean;
  healStrategy?: string;
}

export interface ModalityEvalResult {
  modality: Modality;
  slug: string;
  passed: boolean;
  metrics: ModalityMetric[];
  violations: ModalityViolation[];
  score: string; // A-F
}

export interface UnifiedEvalReport {
  slug: string;
  timestamp: string;
  iteration: number;
  modalities: ModalityEvalResult[];
  allPassed: boolean;
  totalViolations: number;
  healableViolations: number;
  costSoFar: { totalCalls: number; totalTokens: number; estimatedCostUsd: number };
  healsApplied?: Array<{ strategy: string; chapter?: string; action: string }>;
}

// ── Threshold Loading ───────────────────────────────────────────────────────

interface ModalityThresholds {
  landing: {
    require_meta_description: boolean;
    require_og_tags: boolean;
    require_cta: boolean;
    max_file_size_kb: number;
  };
  social: {
    require_og_image: boolean;
    min_linkedin_slides: number;
    min_instagram_posts: number;
  };
  blog: {
    min_word_count: number;
    max_generic_claims: number;
    require_seo_title: boolean;
    require_meta_description: boolean;
    require_cta: boolean;
  };
  pdf: {
    require_cover_page: boolean;
    max_blank_pages: number;
    require_embedded_fonts: boolean;
  };
  heal: {
    max_iterations: number;
    max_cost_usd: number;
  };
}

const DEFAULT_MODALITY_THRESHOLDS: ModalityThresholds = {
  landing: {
    require_meta_description: true,
    require_og_tags: true,
    require_cta: true,
    max_file_size_kb: 500,
  },
  social: {
    require_og_image: true,
    min_linkedin_slides: 1,
    min_instagram_posts: 1,
  },
  blog: {
    min_word_count: 300,
    max_generic_claims: 3,
    require_seo_title: true,
    require_meta_description: true,
    require_cta: true,
  },
  pdf: {
    require_cover_page: true,
    max_blank_pages: 2,
    require_embedded_fonts: true,
  },
  heal: {
    max_iterations: 3,
    max_cost_usd: 5.0,
  },
};

export function loadModalityThresholds(): ModalityThresholds {
  const thresholdPath = join(PROJECT_ROOT, "quality-thresholds.yml");
  if (!existsSync(thresholdPath)) return DEFAULT_MODALITY_THRESHOLDS;

  try {
    const content = parse(readFileSync(thresholdPath, "utf-8")) as Record<string, unknown>;
    const mods = content.modalities as Partial<ModalityThresholds> | undefined;
    if (!mods) return DEFAULT_MODALITY_THRESHOLDS;

    return {
      landing: { ...DEFAULT_MODALITY_THRESHOLDS.landing, ...(mods.landing || {}) },
      social: { ...DEFAULT_MODALITY_THRESHOLDS.social, ...(mods.social || {}) },
      blog: { ...DEFAULT_MODALITY_THRESHOLDS.blog, ...(mods.blog || {}) },
      pdf: { ...DEFAULT_MODALITY_THRESHOLDS.pdf, ...(mods.pdf || {}) },
      heal: { ...DEFAULT_MODALITY_THRESHOLDS.heal, ...(mods.heal || {}) },
    };
  } catch {
    return DEFAULT_MODALITY_THRESHOLDS;
  }
}

// ── Heal Strategy Mapping ───────────────────────────────────────────────────

const HEAL_STRATEGY_MAP: Record<string, { healable: boolean; strategy: string }> = {
  diagram_density: { healable: true, strategy: "add_diagram_directive" },
  generic_claims: { healable: true, strategy: "strengthen_fact_sheet" },
  code_blocks: { healable: true, strategy: "add_code_block" },
  real_numbers: { healable: true, strategy: "enrich_numbers" },
  reading_level: { healable: true, strategy: "simplify_prose" },
  interactive_elements: { healable: false, strategy: "add_ojs_calculator" },
  untagged_code: { healable: false, strategy: "" },
  image_density: { healable: true, strategy: "add_image" },
};

function inferHealStrategy(metric: string): { healable: boolean; strategy: string } {
  // Match on partial metric name
  for (const [key, val] of Object.entries(HEAL_STRATEGY_MAP)) {
    if (metric.toLowerCase().includes(key.replace("_", " ")) ||
        metric.toLowerCase().includes(key)) {
      return val;
    }
  }
  // Check common metric name patterns from content-audit.ts
  if (metric.includes("diagram") || metric.includes("Diagram")) {
    return HEAL_STRATEGY_MAP.diagram_density;
  }
  if (metric.includes("generic") || metric.includes("Generic") || metric.includes("vague")) {
    return HEAL_STRATEGY_MAP.generic_claims;
  }
  if (metric.includes("code") || metric.includes("Code")) {
    return HEAL_STRATEGY_MAP.code_blocks;
  }
  if (metric.includes("number") || metric.includes("Number") || metric.includes("real")) {
    return HEAL_STRATEGY_MAP.real_numbers;
  }
  if (metric.includes("reading") || metric.includes("Reading") || metric.includes("grade")) {
    return HEAL_STRATEGY_MAP.reading_level;
  }
  if (metric.includes("interactive") || metric.includes("Interactive")) {
    return HEAL_STRATEGY_MAP.interactive_elements;
  }
  if (metric.includes("image") || metric.includes("Image")) {
    return HEAL_STRATEGY_MAP.image_density;
  }
  return { healable: false, strategy: "" };
}

// ── Score Calculation ───────────────────────────────────────────────────────

function computeScore(violations: ModalityViolation[]): string {
  const count = violations.length;
  if (count === 0) return "A";
  if (count <= 2) return "B";
  if (count <= 5) return "C";
  if (count <= 10) return "D";
  return "F";
}

// ── Ebook Evaluator ─────────────────────────────────────────────────────────

export async function evalEbookChapters(slug: string): Promise<ModalityEvalResult> {
  const chaptersDir = join(PROJECT_ROOT, "books", slug, "chapters");
  if (!existsSync(chaptersDir)) {
    return {
      modality: "ebook",
      slug,
      passed: false,
      metrics: [],
      violations: [{
        modality: "ebook",
        metric: "chapters_exist",
        actual: 0,
        threshold: 1,
        direction: "below",
        message: `No chapters directory found: books/${slug}/chapters/`,
        healable: false,
      }],
      score: "F",
    };
  }

  // Delegate to existing audit system
  const audit: AuditReport = auditEbook(slug);

  // Convert ThresholdViolations to ModalityViolations
  const violations: ModalityViolation[] = audit.violations.map((v: ThresholdViolation) => {
    const { healable, strategy } = inferHealStrategy(v.metric);
    return {
      modality: "ebook" as const,
      metric: v.metric,
      chapter: v.chapter,
      actual: v.actual,
      threshold: v.threshold,
      direction: v.direction,
      message: v.message,
      healable,
      healStrategy: healable ? strategy : undefined,
    };
  });

  // Build metrics from audit data
  const metrics: ModalityMetric[] = [
    {
      name: "diagram_density",
      actual: audit.diagrams.densityPer1000Words,
      threshold: 0.3,
      direction: "higher-is-better",
      passed: audit.diagrams.densityPer1000Words >= 0.3,
    },
    {
      name: "total_code_blocks",
      actual: audit.code.totalBlocks,
      threshold: audit.diagrams.byChapter.length * 2,
      direction: "higher-is-better",
      passed: audit.code.totalBlocks >= audit.diagrams.byChapter.length * 2,
    },
    {
      name: "generic_claims_total",
      actual: audit.genericClaims.totalClaims,
      threshold: audit.diagrams.byChapter.length * 5,
      direction: "lower-is-better",
      passed: audit.genericClaims.totalClaims <= audit.diagrams.byChapter.length * 5,
    },
    {
      name: "real_numbers_total",
      actual: audit.realNumbers.totalNumbers,
      threshold: audit.diagrams.byChapter.length,
      direction: "higher-is-better",
      passed: audit.realNumbers.totalNumbers >= audit.diagrams.byChapter.length,
    },
    {
      name: "reading_level",
      actual: audit.readability.averageGradeLevel,
      threshold: 14,
      direction: "lower-is-better",
      passed: audit.readability.averageGradeLevel <= 14 && audit.readability.averageGradeLevel >= 8,
    },
    {
      name: "image_density",
      actual: audit.images.imagesPer800Words,
      threshold: 1,
      direction: "higher-is-better",
      passed: audit.images.imagesPer800Words >= 1,
    },
  ];

  // Advisory: freshness check (never fails — informational only)
  try {
    const freshness: FreshnessReport = await checkFreshness(slug);
    metrics.push({
      name: "freshness_stale_prices",
      actual: freshness.stalePrices,
      threshold: 0,
      direction: "lower-is-better",
      passed: true, // Always passes — advisory only
    });
    metrics.push({
      name: "freshness_total_prices",
      actual: freshness.totalPricesExtracted,
      threshold: 0,
      direction: "higher-is-better",
      passed: true, // Always passes — advisory only
    });
  } catch {
    // Freshness check failure is non-fatal
  }

  return {
    modality: "ebook",
    slug,
    passed: violations.length === 0,
    metrics,
    violations,
    score: audit.summary.overallScore,
  };
}

// ── Landing Page Evaluator ──────────────────────────────────────────────────

export function evalLandingPage(slug: string): ModalityEvalResult {
  const thresholds = loadModalityThresholds().landing;
  const htmlPath = join(PROJECT_ROOT, "_output", "landing", slug, "index.html");
  const metrics: ModalityMetric[] = [];
  const violations: ModalityViolation[] = [];

  if (!existsSync(htmlPath)) {
    violations.push({
      modality: "landing",
      metric: "html_exists",
      actual: 0,
      threshold: 1,
      direction: "below",
      message: `Landing page not generated: _output/landing/${slug}/index.html`,
      healable: true,
      healStrategy: "regenerate_landing",
    });
    metrics.push({ name: "html_exists", actual: 0, threshold: 1, direction: "higher-is-better", passed: false });

    return { modality: "landing", slug, passed: false, metrics, violations, score: "F" };
  }

  const html = readFileSync(htmlPath, "utf-8");
  const fileSizeKb = Math.round(Buffer.byteLength(html) / 1024);

  // Check <title>
  const hasTitle = /<title>[^<]+<\/title>/i.test(html);
  metrics.push({ name: "has_title", actual: hasTitle ? 1 : 0, threshold: 1, direction: "higher-is-better", passed: hasTitle });
  if (!hasTitle) {
    violations.push({ modality: "landing", metric: "has_title", actual: 0, threshold: 1, direction: "below", message: "Missing <title> tag", healable: true, healStrategy: "regenerate_landing" });
  }

  // Check meta description
  const hasDesc = /meta\s+name=["']description["']/i.test(html);
  metrics.push({ name: "has_meta_description", actual: hasDesc ? 1 : 0, threshold: 1, direction: "higher-is-better", passed: hasDesc });
  if (thresholds.require_meta_description && !hasDesc) {
    violations.push({ modality: "landing", metric: "has_meta_description", actual: 0, threshold: 1, direction: "below", message: "Missing meta description", healable: true, healStrategy: "regenerate_landing" });
  }

  // Check OG tags
  const hasOg = /property=["']og:title["']/i.test(html);
  metrics.push({ name: "has_og_tags", actual: hasOg ? 1 : 0, threshold: 1, direction: "higher-is-better", passed: hasOg });
  if (thresholds.require_og_tags && !hasOg) {
    violations.push({ modality: "landing", metric: "has_og_tags", actual: 0, threshold: 1, direction: "below", message: "Missing Open Graph tags", healable: true, healStrategy: "regenerate_landing" });
  }

  // Check CTA
  const hasCta = /class=["'][^"']*cta[^"']*["']/i.test(html) || /download|get.*free|read.*now/i.test(html);
  metrics.push({ name: "has_cta", actual: hasCta ? 1 : 0, threshold: 1, direction: "higher-is-better", passed: hasCta });
  if (thresholds.require_cta && !hasCta) {
    violations.push({ modality: "landing", metric: "has_cta", actual: 0, threshold: 1, direction: "below", message: "Missing call-to-action element", healable: true, healStrategy: "regenerate_landing" });
  }

  // Check file size
  metrics.push({ name: "file_size_kb", actual: fileSizeKb, threshold: thresholds.max_file_size_kb, direction: "lower-is-better", passed: fileSizeKb <= thresholds.max_file_size_kb });
  if (fileSizeKb > thresholds.max_file_size_kb) {
    violations.push({ modality: "landing", metric: "file_size_kb", actual: fileSizeKb, threshold: thresholds.max_file_size_kb, direction: "above", message: `Landing page too large: ${fileSizeKb}KB > ${thresholds.max_file_size_kb}KB`, healable: false });
  }

  return {
    modality: "landing",
    slug,
    passed: violations.length === 0,
    metrics,
    violations,
    score: computeScore(violations),
  };
}

// ── Social Assets Evaluator ─────────────────────────────────────────────────

export function evalSocialAssets(slug: string): ModalityEvalResult {
  const thresholds = loadModalityThresholds().social;
  const socialDir = join(PROJECT_ROOT, "_output", "social", slug);
  const metrics: ModalityMetric[] = [];
  const violations: ModalityViolation[] = [];

  // OG image
  const ogPath = join(socialDir, "og", "og-image.png");
  const hasOg = existsSync(ogPath) ? 1 : 0;
  metrics.push({ name: "og_image_exists", actual: hasOg, threshold: 1, direction: "higher-is-better", passed: hasOg === 1 });
  if (thresholds.require_og_image && !hasOg) {
    violations.push({ modality: "social", metric: "og_image_exists", actual: 0, threshold: 1, direction: "below", message: "OG image not generated", healable: true, healStrategy: "regenerate_social" });
  }

  // LinkedIn slides
  const linkedinDir = join(socialDir, "linkedin");
  let linkedinCount = 0;
  if (existsSync(linkedinDir)) {
    linkedinCount = readdirSync(linkedinDir).filter(f => f.endsWith(".png")).length;
  }
  metrics.push({ name: "linkedin_slides_count", actual: linkedinCount, threshold: thresholds.min_linkedin_slides, direction: "higher-is-better", passed: linkedinCount >= thresholds.min_linkedin_slides });
  if (linkedinCount < thresholds.min_linkedin_slides) {
    violations.push({ modality: "social", metric: "linkedin_slides_count", actual: linkedinCount, threshold: thresholds.min_linkedin_slides, direction: "below", message: `Only ${linkedinCount} LinkedIn slides (need ${thresholds.min_linkedin_slides})`, healable: true, healStrategy: "regenerate_social" });
  }

  // Instagram posts
  const igDir = join(socialDir, "instagram");
  let igCount = 0;
  if (existsSync(igDir)) {
    igCount = readdirSync(igDir).filter(f => f.endsWith(".png")).length;
  }
  metrics.push({ name: "instagram_posts_count", actual: igCount, threshold: thresholds.min_instagram_posts, direction: "higher-is-better", passed: igCount >= thresholds.min_instagram_posts });
  if (igCount < thresholds.min_instagram_posts) {
    violations.push({ modality: "social", metric: "instagram_posts_count", actual: igCount, threshold: thresholds.min_instagram_posts, direction: "below", message: `Only ${igCount} Instagram posts (need ${thresholds.min_instagram_posts})`, healable: true, healStrategy: "regenerate_social" });
  }

  return {
    modality: "social",
    slug,
    passed: violations.length === 0,
    metrics,
    violations,
    score: computeScore(violations),
  };
}

// ── Blog Post Evaluator ─────────────────────────────────────────────────────

export function evalBlogPosts(slug: string): ModalityEvalResult {
  const thresholds = loadModalityThresholds().blog;
  const blogDir = join(PROJECT_ROOT, "_output", "blog", slug);
  const chaptersDir = join(PROJECT_ROOT, "books", slug, "chapters");
  const metrics: ModalityMetric[] = [];
  const violations: ModalityViolation[] = [];

  // Count expected chapters
  let expectedChapters = 0;
  if (existsSync(chaptersDir)) {
    expectedChapters = readdirSync(chaptersDir).filter(f => f.endsWith(".qmd")).length;
  }

  // Count blog posts
  let blogCount = 0;
  let blogFiles: string[] = [];
  if (existsSync(blogDir)) {
    blogFiles = readdirSync(blogDir).filter(f => f.endsWith(".html"));
    blogCount = blogFiles.length;
  }

  metrics.push({ name: "blog_count", actual: blogCount, threshold: expectedChapters, direction: "higher-is-better", passed: blogCount >= expectedChapters });
  if (blogCount < expectedChapters) {
    violations.push({ modality: "blog", metric: "blog_count", actual: blogCount, threshold: expectedChapters, direction: "below", message: `Only ${blogCount}/${expectedChapters} blog posts generated`, healable: true, healStrategy: "regenerate_blog" });
  }

  // Check each blog post's quality
  for (const file of blogFiles) {
    const html = readFileSync(join(blogDir, file), "utf-8");
    const chapterName = basename(file, ".html");

    // SEO title check
    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    const hasSeoTitle = titleMatch && titleMatch[1].length > 10 && titleMatch[1].length <= 70;
    if (thresholds.require_seo_title && !hasSeoTitle) {
      violations.push({ modality: "blog", metric: "seo_title", chapter: chapterName, actual: 0, threshold: 1, direction: "below", message: `Blog post ${chapterName}: missing or bad SEO title`, healable: true, healStrategy: "regenerate_blog" });
    }

    // Meta description check
    const hasMetaDesc = /meta\s+name=["']description["']\s+content=["'][^"']{50,}/i.test(html);
    if (thresholds.require_meta_description && !hasMetaDesc) {
      violations.push({ modality: "blog", metric: "meta_description", chapter: chapterName, actual: 0, threshold: 1, direction: "below", message: `Blog post ${chapterName}: missing meta description`, healable: true, healStrategy: "regenerate_blog" });
    }

    // CTA check
    const hasCta = /class=["'][^"']*cta[^"']*["']/i.test(html) || /read.*full.*guide|download.*ebook/i.test(html);
    if (thresholds.require_cta && !hasCta) {
      violations.push({ modality: "blog", metric: "has_cta", chapter: chapterName, actual: 0, threshold: 1, direction: "below", message: `Blog post ${chapterName}: missing CTA`, healable: true, healStrategy: "regenerate_blog" });
    }

    // Word count check
    const textOnly = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const wordCount = textOnly.split(" ").length;
    if (wordCount < thresholds.min_word_count) {
      violations.push({ modality: "blog", metric: "word_count", chapter: chapterName, actual: wordCount, threshold: thresholds.min_word_count, direction: "below", message: `Blog post ${chapterName}: only ${wordCount} words (min: ${thresholds.min_word_count})`, healable: true, healStrategy: "strengthen_blog_prose" });
    }
  }

  return {
    modality: "blog",
    slug,
    passed: violations.length === 0,
    metrics,
    violations,
    score: computeScore(violations),
  };
}

// ── Hub Evaluator ───────────────────────────────────────────────────────────

export function evalHub(slug: string): ModalityEvalResult {
  const metrics: ModalityMetric[] = [];
  const violations: ModalityViolation[] = [];

  const hubPath = join(PROJECT_ROOT, "_output", "hub", "index.html");
  if (!existsSync(hubPath)) {
    violations.push({
      modality: "hub",
      metric: "hub_exists",
      actual: 0,
      threshold: 1,
      direction: "below",
      message: "Hub page not generated. Run: make hub",
      healable: true,
      healStrategy: "regenerate_hub",
    });
    return { modality: "hub", slug, passed: false, metrics, violations, score: "F" };
  }

  const html = readFileSync(hubPath, "utf-8");
  const fileSizeKb = Math.round(Buffer.byteLength(html) / 1024);

  // Count ebook cards
  const cardCount = (html.match(/class="book-card"/g) || []).length;
  const booksDir = join(PROJECT_ROOT, "books");
  const expectedCount = existsSync(booksDir) ? readdirSync(booksDir, { withFileTypes: true }).filter(d => d.isDirectory()).length : 0;

  metrics.push({ name: "ebook_cards", actual: cardCount, threshold: expectedCount, direction: "higher-is-better", passed: cardCount >= expectedCount });
  if (cardCount < expectedCount) {
    violations.push({ modality: "hub", metric: "ebook_cards", actual: cardCount, threshold: expectedCount, direction: "below", message: `Hub lists ${cardCount}/${expectedCount} ebooks`, healable: true, healStrategy: "regenerate_hub" });
  }

  // Search input
  const hasSearch = /id=["']search-input["']/i.test(html);
  metrics.push({ name: "has_search", actual: hasSearch ? 1 : 0, threshold: 1, direction: "higher-is-better", passed: hasSearch });
  if (!hasSearch) {
    violations.push({ modality: "hub", metric: "has_search", actual: 0, threshold: 1, direction: "below", message: "Hub missing search input", healable: true, healStrategy: "regenerate_hub" });
  }

  // File size
  metrics.push({ name: "file_size_kb", actual: fileSizeKb, threshold: 300, direction: "lower-is-better", passed: fileSizeKb <= 300 });
  if (fileSizeKb > 300) {
    violations.push({ modality: "hub", metric: "file_size_kb", actual: fileSizeKb, threshold: 300, direction: "above", message: `Hub too large: ${fileSizeKb}KB > 300KB`, healable: false });
  }

  return {
    modality: "hub",
    slug,
    passed: violations.length === 0,
    metrics,
    violations,
    score: computeScore(violations),
  };
}

// ── PDF Evaluator ───────────────────────────────────────────────────────────

export async function evalPdfOutput(slug: string): Promise<ModalityEvalResult> {
  const thresholds = loadModalityThresholds().pdf;
  const metrics: ModalityMetric[] = [];
  const violations: ModalityViolation[] = [];

  const pdfPath = findPdfPath(slug);
  if (!pdfPath) {
    violations.push({
      modality: "pdf",
      metric: "pdf_exists",
      actual: 0,
      threshold: 1,
      direction: "below",
      message: `No PDF found for "${slug}". Run: make render-pdf ebook=${slug}`,
      healable: true,
      healStrategy: "regenerate_pdf",
    });
    metrics.push({ name: "pdf_exists", actual: 0, threshold: 1, direction: "higher-is-better", passed: false });
    return { modality: "pdf", slug, passed: false, metrics, violations, score: "F" };
  }

  const result = await analyzePdf(pdfPath);
  if (!result || !result.exists) {
    violations.push({
      modality: "pdf",
      metric: "pdf_readable",
      actual: 0,
      threshold: 1,
      direction: "below",
      message: `PDF exists but could not be parsed: ${pdfPath}`,
      healable: true,
      healStrategy: "regenerate_pdf",
    });
    return { modality: "pdf", slug, passed: false, metrics, violations, score: "F" };
  }

  // Page count
  metrics.push({ name: "page_count", actual: result.pageCount, threshold: 1, direction: "higher-is-better", passed: result.pageCount > 0 });
  if (result.pageCount === 0) {
    violations.push({ modality: "pdf", metric: "page_count", actual: 0, threshold: 1, direction: "below", message: "PDF has zero pages", healable: true, healStrategy: "regenerate_pdf" });
  }

  // Cover page
  metrics.push({ name: "has_cover_page", actual: result.hasCoverPage ? 1 : 0, threshold: 1, direction: "higher-is-better", passed: result.hasCoverPage });
  if (thresholds.require_cover_page && !result.hasCoverPage) {
    violations.push({ modality: "pdf", metric: "has_cover_page", actual: 0, threshold: 1, direction: "below", message: "PDF missing cover page (no title metadata)", healable: true, healStrategy: "regenerate_pdf" });
  }

  // Embedded fonts
  metrics.push({ name: "has_embedded_fonts", actual: result.hasEmbeddedFonts ? 1 : 0, threshold: 1, direction: "higher-is-better", passed: result.hasEmbeddedFonts });
  if (thresholds.require_embedded_fonts && !result.hasEmbeddedFonts) {
    violations.push({ modality: "pdf", metric: "has_embedded_fonts", actual: 0, threshold: 1, direction: "below", message: "PDF does not appear to have embedded fonts", healable: false });
  }

  // Image count (informational — no threshold)
  metrics.push({ name: "image_count", actual: result.imageCount, threshold: 0, direction: "higher-is-better", passed: true });

  // Blank pages
  metrics.push({ name: "blank_pages", actual: result.blankPageCount, threshold: thresholds.max_blank_pages, direction: "lower-is-better", passed: result.blankPageCount <= thresholds.max_blank_pages });
  if (result.blankPageCount > thresholds.max_blank_pages) {
    violations.push({ modality: "pdf", metric: "blank_pages", actual: result.blankPageCount, threshold: thresholds.max_blank_pages, direction: "above", message: `PDF has ${result.blankPageCount} blank pages (max: ${thresholds.max_blank_pages}), pages: ${result.blankPageNumbers.join(", ")}`, healable: true, healStrategy: "regenerate_pdf" });
  }

  // Page size
  metrics.push({ name: "is_letter_size", actual: result.isLetterSize ? 1 : 0, threshold: 1, direction: "higher-is-better", passed: result.isLetterSize });

  return {
    modality: "pdf",
    slug,
    passed: violations.length === 0,
    metrics,
    violations,
    score: computeScore(violations),
  };
}

// ── Unified Evaluator ───────────────────────────────────────────────────────

export async function evaluateAll(slug: string, modalities?: Modality[]): Promise<ModalityEvalResult[]> {
  const mods = modalities || (["ebook", "landing", "social", "blog"] as Modality[]);
  const results: ModalityEvalResult[] = [];

  for (const mod of mods) {
    switch (mod) {
      case "ebook":
        results.push(await evalEbookChapters(slug));
        break;
      case "landing":
        results.push(evalLandingPage(slug));
        break;
      case "social":
        results.push(evalSocialAssets(slug));
        break;
      case "blog":
        results.push(evalBlogPosts(slug));
        break;
      case "pdf":
        results.push(await evalPdfOutput(slug));
        break;
      case "hub":
        results.push(evalHub(slug));
        break;
    }
  }

  return results;
}

// ── Report Formatting ───────────────────────────────────────────────────────

export function formatUnifiedReport(report: UnifiedEvalReport): string {
  const hr = "─".repeat(70);
  const lines: string[] = [];

  lines.push(hr);
  lines.push(`  UNIFIED EVAL: ${report.slug} (iteration ${report.iteration})`);
  lines.push(`  ${report.timestamp}`);
  lines.push(hr);
  lines.push("");

  lines.push(`  Status: ${report.allPassed ? "✅ ALL PASS" : "❌ VIOLATIONS FOUND"}`);
  lines.push(`  Violations: ${report.totalViolations} total, ${report.healableViolations} healable`);
  lines.push(`  Cost: $${report.costSoFar.estimatedCostUsd.toFixed(3)} (${report.costSoFar.totalCalls} calls)`);
  lines.push("");

  for (const mod of report.modalities) {
    const icon = mod.passed ? "✅" : "❌";
    lines.push(`  ${icon} ${mod.modality.toUpperCase()} [${mod.score}]`);
    if (mod.violations.length > 0) {
      for (const v of mod.violations) {
        const ch = v.chapter ? ` (${v.chapter})` : "";
        const heal = v.healable ? ` → ${v.healStrategy}` : " [manual]";
        lines.push(`     ⚠ ${v.metric}${ch}: ${v.actual} (threshold: ${v.threshold})${heal}`);
      }
    }
  }

  if (report.healsApplied && report.healsApplied.length > 0) {
    lines.push("");
    lines.push("  HEALS APPLIED:");
    for (const h of report.healsApplied) {
      const ch = h.chapter ? ` [${h.chapter}]` : "";
      lines.push(`     🔧 ${h.strategy}${ch}: ${h.action}`);
    }
  }

  lines.push("");
  lines.push(hr);
  return lines.join("\n");
}

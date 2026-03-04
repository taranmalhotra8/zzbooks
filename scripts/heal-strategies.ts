#!/usr/bin/env node
/**
 * Self-healing strategy dispatch table.
 * Maps violation heal strategy keys to concrete fix functions.
 *
 * Strategies fall into two categories:
 *   1. LLM-powered (ebook chapters): re-transform with augmented prompts
 *   2. Regenerate (landing/social/blog): re-run the deterministic generator
 *
 * The dispatch table deduplicates fixes per chapter — if a chapter has both
 * "strengthen_fact_sheet" and "enrich_numbers" violations, it runs ONE
 * re-transform with combined prompt augmentation.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { spawnSync } from "child_process";
import { parse, stringify } from "yaml";
import type { ModalityViolation } from "./eval-modalities.js";
import { loadPipelineConfig } from "./provider-config.js";

// Runtime detection: npx tsx (most reliable) > bun > node --import tsx
function _detectRunner(): { cmd: string; runArgs: string[] } {
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
const _runner = _detectRunner();

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ───────────────────────────────────────────────────────────────────

export interface HealAction {
  strategy: string;
  chapter?: string;
  action: string;
  success: boolean;
  error?: string;
}

export interface HealResult {
  actions: HealAction[];
  totalActions: number;
  successCount: number;
  failCount: number;
}

type HealFn = (slug: string, violations: ModalityViolation[]) => Promise<HealAction[]>;

// ── Prompt Augmentation Map ─────────────────────────────────────────────────

const PROMPT_AUGMENTATIONS: Record<string, string> = {
  strengthen_fact_sheet:
    "CRITICAL: Every claim MUST include a specific number (dollar amount, percentage, or quantity). " +
    "Replace ALL vague phrases like 'significant savings', 'many organizations', 'should consider' " +
    "with concrete data. Example: instead of 'significant cost reduction' → '$18,400/month savings (67% reduction)'.",

  add_diagram_directive:
    "IMPORTANT: Include at least one D2 diagram in this chapter using a ```{.d2} code fence. " +
    "Choose from: architecture overview, before/after comparison, workflow/process diagram, or data flow. " +
    "Use direction: down for sequential flows.",

  add_code_block:
    "IMPORTANT: Include at least 2 production-ready code blocks in this chapter. " +
    "Use proper language tags (```python, ```yaml, ```hcl, etc.). " +
    "Code must be copy-pasteable with real imports and error handling.",

  enrich_numbers:
    "CRITICAL: Include specific dollar amounts, percentages, fleet sizes, and timeframes. " +
    "Every section should have at least one real number. " +
    "Example patterns: '$22,300/month', '143 instances', '37% reduction', '14 minutes average'.",

  simplify_prose:
    "IMPORTANT: Write at a Grade 10-12 reading level. Use shorter sentences (max 25 words). " +
    "Prefer active voice. Break complex paragraphs into 2-3 sentence chunks. " +
    "Avoid jargon without immediate explanation.",

  add_image:
    "IMPORTANT: Include at least one visual element in this section. " +
    "If describing a metric, savings figure, or key statistic, recommend a stat-card or comparison-graphic visual. " +
    "If describing multiple KPIs, recommend a metric-highlight visual with 2-4 metrics. " +
    "Include specific numbers from the FACT SHEET in the visual data fields.",
};

// ── Ebook Heal: Re-transform Chapters ───────────────────────────────────────

async function healEbookChapters(slug: string, violations: ModalityViolation[]): Promise<HealAction[]> {
  const actions: HealAction[] = [];

  // Group violations by chapter for deduplication
  const byChapter = new Map<string, ModalityViolation[]>();
  for (const v of violations) {
    if (!v.healStrategy || !v.chapter) continue;
    const key = v.chapter;
    if (!byChapter.has(key)) byChapter.set(key, []);
    byChapter.get(key)!.push(v);
  }

  // Also handle non-chapter-specific violations (apply to all chapters)
  const globalViolations = violations.filter(v => v.healStrategy && !v.chapter);

  const bookDir = join(PROJECT_ROOT, "books", slug);
  const chaptersDir = join(bookDir, "chapters");

  if (!existsSync(chaptersDir)) {
    actions.push({
      strategy: "ebook_retransform",
      action: "SKIP: no chapters directory",
      success: false,
      error: `books/${slug}/chapters/ not found`,
    });
    return actions;
  }

  // For each chapter with violations, modify its .plan.yml to add prompt augmentations
  for (const [chapter, chapterViolations] of byChapter) {
    const strategies = [...new Set(chapterViolations.map(v => v.healStrategy!))];

    // Also include global violation strategies
    for (const gv of globalViolations) {
      if (gv.healStrategy && !strategies.includes(gv.healStrategy)) {
        strategies.push(gv.healStrategy);
      }
    }

    // Build combined augmentation prompt
    const augmentations = strategies
      .map(s => PROMPT_AUGMENTATIONS[s])
      .filter(Boolean);

    if (augmentations.length === 0) {
      actions.push({
        strategy: strategies.join("+"),
        chapter,
        action: "SKIP: no prompt augmentation available",
        success: false,
      });
      continue;
    }

    // Find the plan file for this chapter
    const planFile = `${chapter}.plan.yml`;
    const planPath = join(chaptersDir, planFile);

    if (!existsSync(planPath)) {
      actions.push({
        strategy: strategies.join("+"),
        chapter,
        action: `SKIP: plan file not found (${planFile})`,
        success: false,
        error: `${planFile} not found`,
      });
      continue;
    }

    try {
      // Read existing plan and inject augmentation
      const planContent = parse(readFileSync(planPath, "utf-8")) as Record<string, unknown>;

      // Add heal_augmentation field that transform-chapter.ts can read
      planContent.heal_augmentation = augmentations.join("\n\n");
      planContent.heal_iteration = ((planContent.heal_iteration as number) || 0) + 1;

      writeFileSync(planPath, stringify(planContent), "utf-8");

      // Re-transform the chapter (single chapter takes ~2-4 minutes with LLM calls)
      const proc = spawnSync(_runner.cmd, [..._runner.runArgs, join(SCRIPT_DIR, "transform-chapter.ts"), slug, chapter], {
        cwd: PROJECT_ROOT,
        timeout: 300_000,
      });

      if (proc.status === 0) {
        actions.push({
          strategy: strategies.join("+"),
          chapter,
          action: `Re-transformed with augmentations: ${strategies.join(", ")}`,
          success: true,
        });
      } else {
        const stderr = proc.stderr?.toString().slice(0, 500) || proc.stdout?.toString().slice(0, 500) || `exit code ${proc.status} (timeout=${proc.status === null ? 'yes' : 'no'})`;
        actions.push({
          strategy: strategies.join("+"),
          chapter,
          action: `Re-transform FAILED`,
          success: false,
          error: stderr,
        });
      }
    } catch (err) {
      actions.push({
        strategy: strategies.join("+"),
        chapter,
        action: "Re-transform FAILED",
        success: false,
        error: String(err),
      });
    }
  }

  return actions;
}

// ── Landing Page Heal: Regenerate ───────────────────────────────────────────

async function healLanding(slug: string, _violations: ModalityViolation[]): Promise<HealAction[]> {
  try {
    const proc = spawnSync(_runner.cmd, [..._runner.runArgs, join(PROJECT_ROOT, "_landing", "generate.ts"), slug], {
      cwd: PROJECT_ROOT,
      timeout: 60_000,
    });

    if (proc.status === 0) {
      return [{ strategy: "regenerate_landing", action: `Regenerated landing page for ${slug}`, success: true }];
    } else {
      const stderr = proc.stderr?.toString().slice(0, 500) || "unknown";
      return [{ strategy: "regenerate_landing", action: "Regeneration FAILED", success: false, error: stderr }];
    }
  } catch (err) {
    return [{ strategy: "regenerate_landing", action: "Regeneration FAILED", success: false, error: String(err) }];
  }
}

// ── Social Assets Heal: Regenerate ──────────────────────────────────────────

async function healSocial(slug: string, _violations: ModalityViolation[]): Promise<HealAction[]> {
  try {
    const proc = spawnSync(_runner.cmd, [..._runner.runArgs, join(PROJECT_ROOT, "_social", "generate.ts"), slug], {
      cwd: PROJECT_ROOT,
      timeout: 120_000,
    });

    if (proc.status === 0) {
      return [{ strategy: "regenerate_social", action: `Regenerated social assets for ${slug}`, success: true }];
    } else {
      const stderr = proc.stderr?.toString().slice(0, 500) || "unknown";
      return [{ strategy: "regenerate_social", action: "Regeneration FAILED", success: false, error: stderr }];
    }
  } catch (err) {
    return [{ strategy: "regenerate_social", action: "Regeneration FAILED", success: false, error: String(err) }];
  }
}

// ── Blog Posts Heal: Regenerate ─────────────────────────────────────────────

async function healBlog(slug: string, _violations: ModalityViolation[]): Promise<HealAction[]> {
  try {
    const proc = spawnSync(_runner.cmd, [..._runner.runArgs, join(PROJECT_ROOT, "_blog", "generate.ts"), slug], {
      cwd: PROJECT_ROOT,
      timeout: 60_000,
    });

    if (proc.status === 0) {
      return [{ strategy: "regenerate_blog", action: `Regenerated blog posts for ${slug}`, success: true }];
    } else {
      const stderr = proc.stderr?.toString().slice(0, 500) || "unknown";
      return [{ strategy: "regenerate_blog", action: "Regeneration FAILED", success: false, error: stderr }];
    }
  } catch (err) {
    return [{ strategy: "regenerate_blog", action: "Regeneration FAILED", success: false, error: String(err) }];
  }
}

// ── Hub Heal: Regenerate ────────────────────────────────────────────────────

async function healHub(_slug: string, _violations: ModalityViolation[]): Promise<HealAction[]> {
  try {
    const proc = spawnSync(_runner.cmd, [..._runner.runArgs, join(PROJECT_ROOT, "_hub", "generate.ts")], {
      cwd: PROJECT_ROOT,
      timeout: 30_000,
    });

    if (proc.status === 0) {
      return [{ strategy: "regenerate_hub", action: "Regenerated hub page", success: true }];
    } else {
      const stderr = proc.stderr?.toString().slice(0, 500) || "unknown";
      return [{ strategy: "regenerate_hub", action: "Hub regeneration FAILED", success: false, error: stderr }];
    }
  } catch (err) {
    return [{ strategy: "regenerate_hub", action: "Hub regeneration FAILED", success: false, error: String(err) }];
  }
}

// ── PDF Heal: Re-render ─────────────────────────────────────────────────────

async function healPdf(slug: string, _violations: ModalityViolation[]): Promise<HealAction[]> {
  try {
    const bookDir = join(PROJECT_ROOT, "books", slug);
    const proc = spawnSync("quarto", ["render", bookDir, "--to", "pdf"], {
      cwd: PROJECT_ROOT,
      timeout: 300_000,
    });

    if (proc.status === 0) {
      return [{ strategy: "regenerate_pdf", action: `Re-rendered PDF for ${slug}`, success: true }];
    } else {
      const stderr = proc.stderr?.toString().slice(0, 500) || "unknown";
      return [{ strategy: "regenerate_pdf", action: "PDF render FAILED", success: false, error: stderr }];
    }
  } catch (err) {
    return [{ strategy: "regenerate_pdf", action: "PDF render FAILED", success: false, error: String(err) }];
  }
}

// ── Strategy Dispatch Table ─────────────────────────────────────────────────

interface StrategyEntry {
  modality: string;
  description: string;
  requiresLLM: boolean;
  fn: HealFn;
}

const STRATEGY_REGISTRY: Record<string, StrategyEntry> = {
  // Ebook (LLM-powered re-transform)
  strengthen_fact_sheet: {
    modality: "ebook",
    description: "Re-transform chapter with anti-vagueness prompt augmentation",
    requiresLLM: true,
    fn: healEbookChapters,
  },
  add_diagram_directive: {
    modality: "ebook",
    description: "Re-transform chapter with diagram inclusion directive",
    requiresLLM: true,
    fn: healEbookChapters,
  },
  add_code_block: {
    modality: "ebook",
    description: "Re-transform chapter with code block requirement",
    requiresLLM: true,
    fn: healEbookChapters,
  },
  enrich_numbers: {
    modality: "ebook",
    description: "Re-transform chapter with specific numbers requirement",
    requiresLLM: true,
    fn: healEbookChapters,
  },
  simplify_prose: {
    modality: "ebook",
    description: "Re-transform chapter with readability constraints",
    requiresLLM: true,
    fn: healEbookChapters,
  },
  add_image: {
    modality: "ebook",
    description: "Re-transform chapter with image requirement",
    requiresLLM: true,
    fn: healEbookChapters,
  },

  // Deterministic regeneration (no LLM)
  regenerate_landing: {
    modality: "landing",
    description: "Regenerate landing page from templates",
    requiresLLM: false,
    fn: healLanding,
  },
  regenerate_social: {
    modality: "social",
    description: "Regenerate social media assets",
    requiresLLM: false,
    fn: healSocial,
  },
  regenerate_blog: {
    modality: "blog",
    description: "Regenerate blog posts from chapters",
    requiresLLM: false,
    fn: healBlog,
  },
  strengthen_blog_prose: {
    modality: "blog",
    description: "Regenerate blog posts (source improvement needed in ebook)",
    requiresLLM: false,
    fn: healBlog,
  },

  // Hub
  regenerate_hub: {
    modality: "hub",
    description: "Regenerate hub library page",
    requiresLLM: false,
    fn: healHub,
  },

  // PDF (re-render via Quarto)
  regenerate_pdf: {
    modality: "pdf",
    description: "Re-render PDF via quarto render --to pdf",
    requiresLLM: false,
    fn: healPdf,
  },
};

// ── Main Dispatch Function ──────────────────────────────────────────────────

export async function dispatchHeals(
  slug: string,
  violations: ModalityViolation[],
): Promise<HealResult> {
  const actions: HealAction[] = [];

  // Group violations by strategy to deduplicate
  const byStrategy = new Map<string, ModalityViolation[]>();
  for (const v of violations) {
    if (!v.healable || !v.healStrategy) continue;
    const key = v.healStrategy;
    if (!byStrategy.has(key)) byStrategy.set(key, []);
    byStrategy.get(key)!.push(v);
  }

  // Further group ebook strategies to avoid multiple re-transforms of same chapter
  const ebookViolations = violations.filter(
    v => v.healable && v.healStrategy && v.modality === "ebook",
  );

  // Dispatch ebook heals as a batch (deduped by chapter)
  if (ebookViolations.length > 0) {
    const results = await healEbookChapters(slug, ebookViolations);
    actions.push(...results);
  }

  // Dispatch non-ebook heals
  const nonEbookStrategies = new Set<string>();
  for (const [strategy, stratViolations] of byStrategy) {
    const entry = STRATEGY_REGISTRY[strategy];
    if (!entry || entry.modality === "ebook") continue;
    if (nonEbookStrategies.has(strategy)) continue;
    nonEbookStrategies.add(strategy);

    const results = await entry.fn(slug, stratViolations);
    actions.push(...results);
  }

  const successCount = actions.filter(a => a.success).length;

  return {
    actions,
    totalActions: actions.length,
    successCount,
    failCount: actions.length - successCount,
  };
}

// ── Utility Exports ─────────────────────────────────────────────────────────

export function getStrategyInfo(key: string): StrategyEntry | undefined {
  return STRATEGY_REGISTRY[key];
}

export function listStrategies(): Array<{ key: string } & StrategyEntry> {
  return Object.entries(STRATEGY_REGISTRY).map(([key, entry]) => ({ key, ...entry }));
}

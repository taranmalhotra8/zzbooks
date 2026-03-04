#!/usr/bin/env bun
/**
 * Stage 2: Chapter Visual Planner.
 * Reads outline.yml, research.yml, and context.yml to generate per-chapter
 * .plan.yml files with section structure, visual recommendations, and
 * research-backed content seeds (not fictional scenarios).
 *
 * Usage:
 *   bun run scripts/plan-chapters.ts <slug>                # all chapters
 *   bun run scripts/plan-chapters.ts <slug> <chapter-id>   # one chapter
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { parse, stringify } from "yaml";
import type {
  BookOutline,
  OutlineChapter,
  ChapterPlan,
  PlanSection,
  DensityProfile,
  VisualRecommendation,
  ContentSeed,
  ResearchData,
  ContextConfig,
  ResearchClaim,
  ResearchPattern,
  ResearchConfigExample,
} from "./pipeline-types.js";
import {
  buildDensityProfile,
  CODE_HEAVY_TAGS,
  VISUAL_HEAVY_TAGS,
} from "./pipeline-types.js";
import { loadPipelineConfig, type PipelineConfig } from "./provider-config.js";
import { chapterPlanningPrompt } from "./prompt-templates.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── File loading ────────────────────────────────────────────────────────────

function loadResearch(slug: string): ResearchData | null {
  const path = join(PROJECT_ROOT, "books", slug, "research.yml");
  if (!existsSync(path)) return null;
  return parse(readFileSync(path, "utf-8")) as ResearchData;
}

function loadContext(slug: string): ContextConfig | null {
  const path = join(PROJECT_ROOT, "books", slug, "context.yml");
  if (!existsSync(path)) return null;
  return parse(readFileSync(path, "utf-8")) as ContextConfig;
}

// ── Visual recommendation engine ────────────────────────────────────────────

function recommendDiagram(chapter: OutlineChapter): VisualRecommendation {
  const concepts = chapter.key_concepts.join(" ").toLowerCase();
  const tags = chapter.suggested_tags.join(" ").toLowerCase();
  const combined = concepts + " " + tags;

  if (combined.includes("before") || combined.includes("after") || combined.includes("optimization") || combined.includes("right-siz")) {
    return { type: "d2", template: "before-after-optimization", purpose: "Before/after cost impact visualization" };
  }
  if (combined.includes("workflow") || combined.includes("lifecycle") || combined.includes("phase")) {
    return { type: "d2", template: "finops-workflow", purpose: "Process workflow visualization" };
  }
  if (combined.includes("multi-cloud") || combined.includes("comparison") || combined.includes("provider")) {
    return { type: "d2", template: "multi-cloud-comparison", purpose: "Multi-provider cost comparison" };
  }
  if (combined.includes("pipeline") || combined.includes("etl") || combined.includes("data flow")) {
    return { type: "d2", template: "data-pipeline", purpose: "Data/cost pipeline visualization" };
  }
  return { type: "d2", template: "cloud-architecture", purpose: "Infrastructure architecture with cost annotations" };
}

function recommendCalculator(chapter: OutlineChapter): VisualRecommendation {
  const concepts = chapter.key_concepts.join(" ").toLowerCase();
  const tags = chapter.suggested_tags.join(" ").toLowerCase();
  const combined = concepts + " " + tags;

  if (combined.includes("sizing") || combined.includes("request") || combined.includes("resource")) {
    return { type: "ojs", template: "resource-optimizer", purpose: "Interactive resource sizing calculator" };
  }
  if (combined.includes("roi") || combined.includes("savings") || combined.includes("break-even")) {
    return { type: "ojs", template: "roi-calculator", purpose: "ROI and savings projection calculator" };
  }
  return { type: "ojs", template: "cost-comparison-calculator", purpose: "Interactive cost comparison calculator" };
}

// ── Image visual builders (for Satori-rendered graphics) ─────────────────────

/**
 * Extracts dollar amounts and percentages from research data to build
 * stat-card or comparison-graphic visuals for impact sections.
 */
function buildImpactVisual(
  patterns: ResearchPattern[],
  claims: ResearchClaim[],
): VisualRecommendation | null {
  // Try to build a comparison-graphic from before/after patterns
  const savingsPattern = patterns.find((p) => p.typical_savings);
  if (savingsPattern && savingsPattern.typical_savings) {
    return {
      type: "comparison-graphic",
      purpose: `${savingsPattern.name} optimization impact`,
      comparison_data: {
        title: savingsPattern.name,
        before: { label: "Before optimization", value: "Baseline" },
        after: { label: "After optimization", value: savingsPattern.typical_savings },
        improvement: savingsPattern.typical_savings,
      },
    };
  }

  // Try to build a stat-card from a specific claim with a dollar amount or percentage
  const numberClaim = claims.find((c) => /\$[\d,]+|\d+%/.test(c.claim));
  if (numberClaim) {
    const match = numberClaim.claim.match(/(\$[\d,]+(?:\/\w+)?|\d+(?:\.\d+)?%)/);
    if (match) {
      return {
        type: "stat-card",
        purpose: "Key metric from industry research",
        stat_data: {
          headline: match[1],
          subtext: numberClaim.claim.replace(match[1], "").trim().replace(/^[,.\s]+|[,.\s]+$/g, ""),
          source: numberClaim.source,
        },
      };
    }
  }

  return null;
}

/**
 * Builds a metric-highlight visual from multiple research claims/patterns.
 * Used when a section has 2+ quantified data points to display as a grid.
 */
function buildMetricVisual(
  claims: ResearchClaim[],
  patterns: ResearchPattern[],
): VisualRecommendation | null {
  const metrics: Array<{ label: string; value: string; trend?: "up" | "down" }> = [];

  // Extract numbers from claims
  for (const claim of claims.slice(0, 3)) {
    const match = claim.claim.match(/(\$[\d,]+(?:\/\w+)?|\d+(?:\.\d+)?%)/);
    if (match) {
      const isNegative = /waste|cost|spend|loss|overprovisioned/i.test(claim.claim);
      metrics.push({
        label: claim.claim.slice(0, 40).replace(match[1], "").trim().replace(/^[,.\s]+|[,.\s]+$/g, "") || claim.source,
        value: match[1],
        trend: isNegative ? "down" : "up",
      });
    }
  }

  // Extract from patterns
  for (const p of patterns.slice(0, 2)) {
    if (p.typical_savings && metrics.length < 4) {
      metrics.push({
        label: p.name,
        value: p.typical_savings,
        trend: "up",
      });
    }
  }

  if (metrics.length >= 2) {
    return {
      type: "metric-highlight",
      purpose: "Key metrics overview",
      metrics_data: metrics.slice(0, 4),
    };
  }

  return null;
}

// ── Section generation (research-aware) ─────────────────────────────────────

function generateSections(
  chapter: OutlineChapter,
  density: DensityProfile,
  research: ResearchData | null,
  context: ContextConfig | null,
): PlanSection[] {
  const sections: PlanSection[] = [];
  const codePolicy = context?.editorial_direction?.code_policy || "minimal";
  const diagram = recommendDiagram(chapter);

  // Find research claims relevant to this chapter
  const chapterConcepts = chapter.key_concepts.join(" ").toLowerCase();
  const relevantClaims = research?.industry_data?.filter((c) => {
    const claimLower = c.claim.toLowerCase();
    return chapter.key_concepts.some((concept) =>
      claimLower.includes(concept.toLowerCase().split(" ")[0])
    );
  }) || [];

  // Find research patterns relevant to this chapter (moved up for image visual builders)
  const relevantPatterns = research?.common_patterns?.filter((p) => {
    return chapter.key_concepts.some((concept) =>
      p.name.toLowerCase().includes(concept.toLowerCase().split(" ")[0]) ||
      p.description.toLowerCase().includes(concept.toLowerCase().split(" ")[0])
    );
  }) || [];

  // 1. Opening — use industry data, not fictional incidents
  // Add a metric-highlight image if we have enough quantified data points
  const topClaim = relevantClaims[0] || research?.industry_data?.[0];
  const openingVisual = (density.level !== "light")
    ? buildMetricVisual(relevantClaims, relevantPatterns)
    : null;
  sections.push({
    id: "opening",
    heading: "The Challenge",
    word_target: density.level === "full" ? 400 : 300,
    visual: openingVisual,
    notes: topClaim
      ? `Open with industry context: "${topClaim.claim}" (${topClaim.source}). Frame the problem this chapter addresses.`
      : "Open with the industry problem this chapter addresses. Use real benchmarks and data.",
  });

  // 2. Background context with diagram
  sections.push({
    id: "background",
    heading: "Why This Happens",
    word_target: density.level === "full" ? 400 : 300,
    visual: { ...diagram, placement: "after_paragraph_2" },
    notes: "Explain root causes with industry context. The D2 diagram illustrates the architecture or flow.",
  });

  // 3. Core content — configs only (if code_policy is config-only)
  const relevantConfigs = research?.key_configs?.filter((c) => {
    return chapter.key_concepts.some((concept) =>
      c.name.toLowerCase().includes(concept.toLowerCase().split(" ")[0]) ||
      c.description.toLowerCase().includes(concept.toLowerCase().split(" ")[0])
    );
  }) || [];

  if (codePolicy === "config-only" || codePolicy === "minimal") {
    // Use config examples instead of scripts
    for (const config of relevantConfigs.slice(0, density.level === "full" ? 3 : 2)) {
      sections.push({
        id: `config_${config.name.toLowerCase().replace(/\s+/g, "_")}`,
        heading: config.name,
        word_target: 200,
        visual: {
          type: "code",
          language: config.type,
          purpose: config.description,
          lines: String(config.example_lines || 15),
        },
        notes: `Show a ${config.type.toUpperCase()} configuration example for ${config.name}. Keep it short (${config.example_lines || 15} lines) and copy-pasteable.`,
      });
    }
    // If no specific configs matched, add a generic config section
    if (relevantConfigs.length === 0) {
      sections.push({
        id: "configuration",
        heading: "Configuration",
        word_target: 200,
        visual: {
          type: "code",
          language: "yaml",
          purpose: `${chapter.title} configuration example`,
          lines: "15-25",
        },
        notes: "Short YAML/config example that readers can copy and adapt.",
      });
    }
  } else {
    // Full code policy: include scripts
    sections.push({
      id: "implementation",
      heading: "Implementation",
      word_target: 400,
      visual: {
        type: "code",
        language: "python",
        purpose: `${chapter.key_concepts[0] || chapter.title} implementation`,
        lines: "80-120",
      },
      notes: "Production-ready code with imports, error handling, and sample output.",
    });
  }

  // 4. Decision framework table (relevantPatterns already computed above)

  if (relevantPatterns.length >= 2) {
    sections.push({
      id: "decision_framework",
      heading: "When to Use What",
      word_target: 200,
      visual: { type: "table", purpose: "Comparison table of patterns with savings, effort, and risk" },
      notes: `Compare: ${relevantPatterns.map((p) => p.name).join(", ")}. Use a table with columns: Pattern, Typical Savings, Effort, Risk.`,
    });
  }

  // 5. Calculator (standard with code-heavy tags, or full)
  if (density.hasCalculator) {
    const calc = recommendCalculator(chapter);
    sections.push({
      id: "calculator",
      heading: "Cost Calculator",
      word_target: 100,
      visual: calc,
      notes: "Interactive calculator for HTML, static table fallback for PDF/EPUB.",
    });
  }

  // 6. Results / Impact section — with stat-card or comparison-graphic image
  const impactVisual = buildImpactVisual(relevantPatterns, relevantClaims);
  sections.push({
    id: "impact",
    heading: "Expected Impact",
    word_target: 200,
    visual: impactVisual,
    notes: relevantPatterns.length > 0
      ? `Quantify expected outcomes: ${relevantPatterns.map((p) => `${p.name} → ${p.typical_savings || "significant savings"}`).join("; ")}. Use specific numbers.`
      : "Quantify the expected outcomes of applying these strategies. Use industry benchmarks.",
  });

  // 7. Field notes (callout)
  sections.push({
    id: "field_notes",
    heading: "Practitioner Tips",
    word_target: 150,
    visual: { type: "callout", style: "tip", purpose: "Practitioner insight from real implementations" },
    notes: "Specific, actionable advice — not generic. Include a counterintuitive finding or common pitfall.",
  });

  // 8. Summary
  sections.push({
    id: "summary",
    heading: "Summary",
    word_target: 150,
    visual: null,
    notes: "Key takeaways with specific numbers + cross-reference to next chapter.",
  });

  return sections;
}

// ── Content seed generation ─────────────────────────────────────────────────

function buildContentSeeds(
  chapter: OutlineChapter,
  research: ResearchData | null,
  context: ContextConfig | null,
): ContentSeed {
  const chapterConcepts = chapter.key_concepts.join(" ").toLowerCase();

  // Find relevant claims
  const claims = (research?.industry_data || []).filter((c) => {
    return chapter.key_concepts.some((concept) =>
      c.claim.toLowerCase().includes(concept.toLowerCase().split(" ")[0])
    );
  });

  // Find relevant patterns
  const patterns = (research?.common_patterns || []).filter((p) => {
    return chapter.key_concepts.some((concept) =>
      p.name.toLowerCase().includes(concept.toLowerCase().split(" ")[0]) ||
      p.description.toLowerCase().includes(concept.toLowerCase().split(" ")[0])
    );
  });

  // Find relevant configs
  const configs = (research?.key_configs || []).filter((c) => {
    return chapter.key_concepts.some((concept) =>
      c.name.toLowerCase().includes(concept.toLowerCase().split(" ")[0]) ||
      c.description.toLowerCase().includes(concept.toLowerCase().split(" ")[0])
    );
  });

  // Build opening hook from best claim
  const topClaim = claims[0] || (research?.industry_data || [])[0];
  const openingHook = topClaim
    ? `${topClaim.claim} (${topClaim.source})`
    : `The ${chapter.title.toLowerCase()} challenge affects most organizations running Kubernetes at scale.`;

  // Product tie-in
  let productTieIn: string | undefined;
  if (context?.product_relevance) {
    const relevantFeature = context.product_relevance.key_features.find((f) =>
      chapter.key_concepts.some((c) => f.toLowerCase().includes(c.toLowerCase().split(" ")[0]))
    );
    if (relevantFeature) {
      productTieIn = `${context.product_relevance.product}: ${relevantFeature}`;
    }
  }

  return {
    opening_hook: openingHook,
    key_claims: claims.length > 0 ? claims : (research?.industry_data || []).slice(0, 2),
    patterns: patterns.length > 0 ? patterns : (research?.common_patterns || []).slice(0, 2),
    configs: configs.length > 0 ? configs : (research?.key_configs || []).slice(0, 2),
    product_tie_in: productTieIn,
  };
}

// ── Main planning function ──────────────────────────────────────────────────

function planChapter(
  chapter: OutlineChapter,
  index: number,
  totalChapters: number,
  research: ResearchData | null,
  context: ContextConfig | null,
): ChapterPlan {
  const density = buildDensityProfile(
    chapter.difficulty,
    chapter.role,
    index,
    totalChapters,
    chapter.suggested_tags,
  );

  const sections = generateSections(chapter, density, research, context);
  const contentSeeds = buildContentSeeds(chapter, research, context);

  return {
    chapter_id: chapter.id,
    density_level: density.level,
    word_target: density.wordTarget,
    sections,
    content_seeds: contentSeeds,
  };
}

// ── LLM-powered chapter planning ────────────────────────────────────────────

async function planChapterWithLLM(
  chapter: OutlineChapter,
  index: number,
  totalChapters: number,
  research: ResearchData,
  context: ContextConfig | null,
  pipelineConfig: PipelineConfig,
): Promise<ChapterPlan> {
  const llm = pipelineConfig.llm!;
  const density = buildDensityProfile(chapter.difficulty, chapter.role, index, totalChapters, chapter.suggested_tags);

  // List available templates for the LLM
  const d2Dir = join(PROJECT_ROOT, "_diagrams", "templates");
  const ojsDir = join(PROJECT_ROOT, "_templates", "ojs");
  const d2Templates = existsSync(d2Dir) ? readdirSync(d2Dir).filter((f) => f.endsWith(".d2")).map((f) => f.replace(".d2", "")) : [];
  const ojsTemplates = existsSync(ojsDir) ? readdirSync(ojsDir).filter((f) => f.endsWith(".qmd")).map((f) => f.replace(".qmd", "")) : [];

  const messages = chapterPlanningPrompt(chapter, research, context, density, { d2: d2Templates, ojs: ojsTemplates });

  const startTime = Date.now();
  const llmPlan = await llm.completeJSON<{ sections: PlanSection[]; content_seeds?: ContentSeed }>({
    messages,
    temperature: 0.5,
    maxTokens: 4096,
  });
  const durationMs = Date.now() - startTime;

  pipelineConfig.costTracker.addCall({
    stage: "plan",
    provider: llm.name,
    model: llm.model,
    promptTokens: 0,
    completionTokens: 0,
    durationMs,
  });

  // Use LLM sections but always generate content seeds from our deterministic engine
  // (more reliable than LLM for research data matching)
  const contentSeeds = llmPlan.content_seeds || buildContentSeeds(chapter, research, context);

  // Post-process: ensure at least one image visual exists (stat-card, comparison-graphic, metric-highlight, key-number)
  let sections = llmPlan.sections || [];
  const imageTypes = ["stat-card", "comparison-graphic", "metric-highlight", "key-number", "illustration"];
  const hasImageVisual = sections.some((s: PlanSection) => s.visual && imageTypes.includes(s.visual.type));

  if (!hasImageVisual) {
    // Try to inject an image visual from research data
    const relevantClaims = research?.industry_data?.filter((c) => {
      const claimLower = c.claim.toLowerCase();
      return chapter.key_concepts.some((concept) =>
        claimLower.includes(concept.toLowerCase().split(" ")[0])
      );
    }) || [];
    const relevantPatterns = research?.common_patterns?.filter((p) => {
      return chapter.key_concepts.some((concept) =>
        p.name.toLowerCase().includes(concept.toLowerCase().split(" ")[0]) ||
        p.description.toLowerCase().includes(concept.toLowerCase().split(" ")[0])
      );
    }) || [];

    const impactVisual = buildImpactVisual(relevantPatterns, relevantClaims);
    if (impactVisual) {
      // Add to opening section or first section without a visual
      const targetSection = sections.find((s: PlanSection) => s.id === "opening" && !s.visual)
        || sections.find((s: PlanSection) => !s.visual && s.id !== "summary");
      if (targetSection) {
        targetSection.visual = impactVisual;
      }
    }
  }

  return {
    chapter_id: chapter.id,
    density_level: density.level,
    word_target: density.wordTarget,
    sections,
    content_seeds: contentSeeds,
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const slug = process.argv[2];
  const chapterId = process.argv[3];

  if (!slug) {
    console.error("Usage: bun run scripts/plan-chapters.ts <slug> [chapter-id]");
    process.exit(1);
  }

  const bookDir = join(PROJECT_ROOT, "books", slug);
  const outlinePath = join(bookDir, "outline.yml");

  if (!existsSync(outlinePath)) {
    console.error(`Outline not found: books/${slug}/outline.yml`);
    console.error(`Run first: make outline ebook=${slug}`);
    process.exit(1);
  }

  const outline = parse(readFileSync(outlinePath, "utf-8")) as BookOutline;
  const research = loadResearch(slug);
  const context = loadContext(slug);

  // Load pipeline config
  const pipelineConfig = loadPipelineConfig(PROJECT_ROOT, slug);

  const chapters = chapterId
    ? outline.chapters.filter((c) => c.id === chapterId)
    : outline.chapters;

  if (chapters.length === 0) {
    console.error(`Chapter "${chapterId}" not found in outline.yml`);
    process.exit(1);
  }

  // Ensure chapters directory exists
  const chaptersDir = join(bookDir, "chapters");
  if (!existsSync(chaptersDir)) mkdirSync(chaptersDir, { recursive: true });

  console.log(`\nPlanning ${chapters.length} chapter(s) for "${slug}"...`);
  if (research) console.log(`  Research: ${research.industry_data.length} claims, ${research.common_patterns.length} patterns`);
  if (context) console.log(`  Context: code_policy=${context.editorial_direction?.code_policy || "not set"}`);
  if (pipelineConfig.llm) console.log(`  LLM: ${pipelineConfig.llm.name}/${pipelineConfig.llm.model}`);
  console.log();

  // ── Parallel chapter planning (3 concurrent) ──
  const CONCURRENCY = 3;
  const chapterQueue = [...chapters];
  const planResults: Array<{ ch: OutlineChapter; plan: ChapterPlan; planPath: string }> = [];

  async function planOne(ch: OutlineChapter) {
    const idx = outline.chapters.findIndex((c) => c.id === ch.id);
    let plan: ChapterPlan;
    if (pipelineConfig.llm && research) {
      plan = await planChapterWithLLM(ch, idx, outline.chapters.length, research, context, pipelineConfig);
    } else {
      plan = planChapter(ch, idx, outline.chapters.length, research, context);
    }
    const planPath = join(chaptersDir, `${ch.id}.plan.yml`);
    const yamlOutput = stringify(plan, { lineWidth: 120 });
    writeFileSync(planPath, `# Chapter Plan — generated by plan-chapters.ts\n# Review visual recommendations, then run: make transform ebook=${slug} chapter=${ch.id}\n\n${yamlOutput}`);
    planResults.push({ ch, plan, planPath });

    const visualCount = plan.sections.filter((s) => s.visual !== null).length;
    const visualTypes = plan.sections
      .filter((s) => s.visual !== null)
      .map((s) => `${s.visual!.type}${s.visual!.template ? `:${s.visual!.template}` : ""}`)
      .join(", ");

    console.log(`  ✓ ${ch.id} [${plan.density_level}]: ${plan.sections.length} sections, ${visualCount} visuals (${plan.word_target[0]}-${plan.word_target[1]} words)`);
  }

  // Process in batches of CONCURRENCY
  for (let i = 0; i < chapterQueue.length; i += CONCURRENCY) {
    const batch = chapterQueue.slice(i, i + CONCURRENCY);
    console.log(`  Planning batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(chapterQueue.length / CONCURRENCY)} (${batch.map(c => c.id).join(", ")})...`);
    await Promise.all(batch.map(ch => planOne(ch)));
  }
  console.log();

  const cost = pipelineConfig.costTracker.summary();
  if (cost.totalCalls > 0) {
    console.log(`  API usage: ${cost.totalCalls} calls, ~${cost.totalTokens} tokens, ~$${cost.estimatedCostUsd}`);
  }

  console.log(`Next: Review .plan.yml files, then run: make transform ebook=${slug}`);
}

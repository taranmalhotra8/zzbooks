#!/usr/bin/env bun
/**
 * Stage 1: Book Outline Generator.
 * Reads topic.yml and generates outline.yml with chapter structure,
 * difficulty progression, prerequisite graph, and key concepts.
 *
 * Usage:
 *   bun run scripts/generate-outline.ts <slug>
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { parse, stringify } from "yaml";
import type {
  TopicConfig,
  BookOutline,
  OutlineChapter,
  ChapterRole,
  Difficulty,
  ResearchData,
} from "./pipeline-types.js";
import { loadPipelineConfig, type PipelineConfig } from "./provider-config.js";
import { outlineGenerationPrompt } from "./prompt-templates.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Chapter structure templates ─────────────────────────────────────────────

interface ChapterTemplate {
  role: ChapterRole;
  difficulty: Difficulty;
  titlePattern: string;    // e.g., "Why {topic} Matters"
  summaryPattern: string;
  conceptPatterns: string[];
  tagSuffixes: string[];
}

/**
 * Standard chapter progression patterns by book depth and angle.
 * These are structural templates — the actual titles/content come from the topic.
 */
const CHAPTER_PROGRESSIONS: Record<string, ChapterTemplate[]> = {
  // 3-chapter progression
  "3": [
    {
      role: "intro",
      difficulty: "beginner",
      titlePattern: "Why {topic} Matters",
      summaryPattern: "The core problem — why {topic} is critical and what happens without it",
      conceptPatterns: ["The visibility/control gap", "Cost drivers and hidden factors", "Why traditional approaches fail"],
      tagSuffixes: ["introduction", "overview"],
    },
    {
      role: "foundation",
      difficulty: "intermediate",
      titlePattern: "Understanding the {topic} Model",
      summaryPattern: "How costs flow, where waste hides, and the mental model for {topic}",
      conceptPatterns: ["Cost flow from infrastructure to workloads", "Resource allocation and waste patterns", "Measurement and attribution"],
      tagSuffixes: ["cost-model", "fundamentals"],
    },
    {
      role: "technique",
      difficulty: "advanced",
      titlePattern: "{topic} Strategies",
      summaryPattern: "Production-tested optimization techniques with real implementations",
      conceptPatterns: ["Right-sizing and resource optimization", "Infrastructure cost reduction", "Autoscaling and automation"],
      tagSuffixes: ["optimization", "automation"],
    },
  ],
  // 4-chapter progression
  "4": [
    {
      role: "intro",
      difficulty: "beginner",
      titlePattern: "Why {topic} Matters",
      summaryPattern: "The core problem — why {topic} is critical and what happens without it",
      conceptPatterns: ["The visibility/control gap", "Cost drivers and hidden factors", "Why traditional approaches fail"],
      tagSuffixes: ["introduction", "overview"],
    },
    {
      role: "foundation",
      difficulty: "intermediate",
      titlePattern: "Understanding the {topic} Model",
      summaryPattern: "How costs flow, where waste hides, and the mental model for {topic}",
      conceptPatterns: ["Cost flow from infrastructure to workloads", "Resource allocation and waste patterns", "Measurement and attribution"],
      tagSuffixes: ["cost-model", "fundamentals"],
    },
    {
      role: "technique",
      difficulty: "advanced",
      titlePattern: "{topic} Strategies",
      summaryPattern: "Production-tested optimization techniques with real implementations",
      conceptPatterns: ["Right-sizing and resource optimization", "Infrastructure cost reduction", "Autoscaling and automation"],
      tagSuffixes: ["optimization", "right-sizing"],
    },
    {
      role: "technique",
      difficulty: "advanced",
      titlePattern: "Tooling and Automation for {topic}",
      summaryPattern: "Tools, dashboards, and automation pipelines for continuous optimization",
      conceptPatterns: ["Monitoring and alerting", "Policy-as-code for cost governance", "Continuous optimization workflows"],
      tagSuffixes: ["tooling", "automation"],
    },
  ],
  // 5-chapter progression
  "5": [
    {
      role: "intro",
      difficulty: "beginner",
      titlePattern: "Why {topic} Matters",
      summaryPattern: "The core problem — why {topic} is critical and what happens without it",
      conceptPatterns: ["The visibility/control gap", "Cost drivers and hidden factors", "Why traditional approaches fail"],
      tagSuffixes: ["introduction", "overview"],
    },
    {
      role: "foundation",
      difficulty: "beginner",
      titlePattern: "The {topic} Landscape",
      summaryPattern: "Key concepts, terminology, and the mental model for {topic}",
      conceptPatterns: ["Core terminology and concepts", "Industry landscape and standards", "Common misconceptions"],
      tagSuffixes: ["fundamentals", "concepts"],
    },
    {
      role: "foundation",
      difficulty: "intermediate",
      titlePattern: "Understanding the {topic} Model",
      summaryPattern: "How costs flow, where waste hides, and measurement approaches",
      conceptPatterns: ["Cost flow from infrastructure to workloads", "Resource allocation and waste patterns", "Measurement and attribution"],
      tagSuffixes: ["cost-model", "attribution"],
    },
    {
      role: "technique",
      difficulty: "advanced",
      titlePattern: "{topic} Strategies",
      summaryPattern: "Production-tested optimization techniques with real implementations",
      conceptPatterns: ["Right-sizing and resource optimization", "Infrastructure cost reduction", "Autoscaling and automation"],
      tagSuffixes: ["optimization", "right-sizing"],
    },
    {
      role: "conclusion",
      difficulty: "intermediate",
      titlePattern: "Building a {topic} Culture",
      summaryPattern: "Organizational adoption, team buy-in, and continuous improvement",
      conceptPatterns: ["Team accountability and incentives", "Governance frameworks", "Maturity model and next steps"],
      tagSuffixes: ["culture", "adoption"],
    },
  ],
};

// ── Outline generation ──────────────────────────────────────────────────────

function generateChapterId(index: number, title: string): string {
  const num = String(index + 1).padStart(2, "0");
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 30);
  return `${num}-${slug}`;
}

function applyPattern(pattern: string, topic: string): string {
  return pattern.replace(/\{topic\}/g, topic);
}

function generateOutline(topic: TopicConfig, existingTitle?: string, existingSubtitle?: string, research?: ResearchData): BookOutline {
  // Parse chapter count range
  const countParts = topic.chapter_count.split("-").map(Number);
  const targetCount = countParts.length === 2
    ? Math.round((countParts[0] + countParts[1]) / 2)
    : countParts[0];
  const clampedCount = Math.max(3, Math.min(5, targetCount));

  // Get progression template
  const progression = CHAPTER_PROGRESSIONS[String(clampedCount)];
  if (!progression) {
    throw new Error(`No progression template for ${clampedCount} chapters. Supported: 3, 4, 5.`);
  }

  // Extract topic keywords for tags
  const topicWords = topic.topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3);

  // Generate chapters
  const chapters: OutlineChapter[] = progression.map((tmpl, i) => {
    const title = applyPattern(tmpl.titlePattern, topic.topic);
    const id = generateChapterId(i, title);
    const summary = applyPattern(tmpl.summaryPattern, topic.topic);
    let concepts = tmpl.conceptPatterns.map((p) => applyPattern(p, topic.topic));
    const tags = [...topicWords.slice(0, 2), ...tmpl.tagSuffixes];

    // Enhance key concepts with research patterns when available
    if (research?.common_patterns?.length) {
      const researchConcepts = research.common_patterns.map((p) => p.name);
      if (tmpl.role === "intro") {
        // Intro gets industry context concepts
        concepts = [
          ...concepts.slice(0, 1),
          ...(research.industry_data?.slice(0, 2).map((c) => c.claim.split(",")[0]) || []),
        ];
      } else if (tmpl.role === "foundation") {
        // Foundation gets pattern names as concepts
        concepts = researchConcepts.slice(0, 3);
      } else if (tmpl.role === "technique" || tmpl.role === "advanced") {
        // Technical chapters get specific optimization patterns
        const startIdx = i > 2 ? 3 : 0;
        concepts = researchConcepts.slice(startIdx, startIdx + 3);
      }
    }

    return {
      id,
      title,
      role: tmpl.role,
      difficulty: tmpl.difficulty,
      summary,
      builds_on: [] as string[],
      sets_up: [] as string[],
      key_concepts: concepts,
      suggested_tags: [...new Set(tags)],
    };
  });

  // Build prerequisite graph
  for (let i = 0; i < chapters.length; i++) {
    if (i > 0) {
      chapters[i].builds_on = [chapters[i - 1].id];
    }
    if (i < chapters.length - 1) {
      chapters[i].sets_up = [chapters[i + 1].id];
    }
  }

  // Compute target word count (shorter chapters, more of them)
  // Targeting 1,200-1,500 words per chapter for modern reading patterns (5-7 min reads)
  const wordTargets: Record<string, string> = {
    "3": "3600-4500",
    "4": "4800-6000",
    "5": "6000-7500",
    "6": "7200-9000",
    "7": "8400-10500",
    "8": "9600-12000",
  };

  // Build narrative arc from roles
  const roleNames = chapters.map((c) => c.role);
  const arc = roleNames.join(" → ");

  return {
    title: existingTitle || topic.topic,
    subtitle: existingSubtitle || `A Practical Guide to ${topic.topic}`,
    narrative_arc: arc,
    target_word_count: wordTargets[String(clampedCount)] || "6000-9000",
    chapters,
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

function validateOutline(outline: BookOutline): string[] {
  const errors: string[] = [];

  if (outline.chapters.length < 2) {
    errors.push("Outline must have at least 2 chapters");
  }

  // Check for circular prerequisites
  const ids = new Set(outline.chapters.map((c) => c.id));
  for (const ch of outline.chapters) {
    for (const dep of ch.builds_on) {
      if (!ids.has(dep)) {
        errors.push(`Chapter "${ch.id}" depends on unknown chapter "${dep}"`);
      }
      if (dep === ch.id) {
        errors.push(`Chapter "${ch.id}" has self-referencing prerequisite`);
      }
    }
  }

  // Check difficulty progression doesn't regress (except conclusion)
  const difficultyOrder: Record<Difficulty, number> = {
    beginner: 1,
    intermediate: 2,
    advanced: 3,
  };
  let maxDifficulty = 0;
  for (const ch of outline.chapters) {
    const level = difficultyOrder[ch.difficulty];
    if (ch.role !== "conclusion" && level < maxDifficulty) {
      errors.push(`Chapter "${ch.id}" (${ch.difficulty}) regresses from previous difficulty level`);
    }
    if (ch.role !== "conclusion") {
      maxDifficulty = Math.max(maxDifficulty, level);
    }
  }

  return errors;
}

// ── LLM-powered outline generation ──────────────────────────────────────────

async function generateOutlineWithLLM(
  topic: TopicConfig,
  research: ResearchData,
  pipelineConfig: PipelineConfig,
): Promise<BookOutline> {
  const llm = pipelineConfig.llm!;
  console.log(`  Generating outline with ${llm.name}/${llm.model}...`);

  const messages = outlineGenerationPrompt(topic, research);

  const startTime = Date.now();
  const outline = await llm.completeJSON<BookOutline>({
    messages,
    temperature: 0.5,
    maxTokens: 4096,
  });
  const durationMs = Date.now() - startTime;

  pipelineConfig.costTracker.addCall({
    stage: "outline",
    provider: llm.name,
    model: llm.model,
    promptTokens: 0,
    completionTokens: 0,
    durationMs,
  });

  // Ensure IDs are properly formatted
  outline.chapters = outline.chapters.map((ch, i) => ({
    ...ch,
    id: ch.id || generateChapterId(i, ch.title),
    builds_on: ch.builds_on || [],
    sets_up: ch.sets_up || [],
    key_concepts: ch.key_concepts || [],
    suggested_tags: ch.suggested_tags || [],
  }));

  return outline;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const slug = process.argv[2];

  if (!slug) {
    console.error("Usage: bun run scripts/generate-outline.ts <slug>");
    process.exit(1);
  }

  const bookDir = join(PROJECT_ROOT, "books", slug);
  const topicPath = join(bookDir, "topic.yml");
  const outlinePath = join(bookDir, "outline.yml");

  if (!existsSync(topicPath)) {
    console.error(`Topic config not found: books/${slug}/topic.yml`);
    console.error("Create this file with: topic, audience, chapter_count, depth, angle");
    process.exit(1);
  }

  const topic = parse(readFileSync(topicPath, "utf-8")) as TopicConfig;

  // Load pipeline config
  const pipelineConfig = loadPipelineConfig(PROJECT_ROOT, slug);

  // Check for existing ebook.yml to reuse title/subtitle
  let existingTitle: string | undefined;
  let existingSubtitle: string | undefined;
  const ebookPath = join(bookDir, "ebook.yml");
  if (existsSync(ebookPath)) {
    const ebook = parse(readFileSync(ebookPath, "utf-8"));
    existingTitle = ebook?.meta?.title;
    existingSubtitle = ebook?.meta?.subtitle;
  }

  // Load research if available
  let research: ResearchData | undefined;
  const researchPath = join(bookDir, "research.yml");
  if (existsSync(researchPath)) {
    research = parse(readFileSync(researchPath, "utf-8")) as ResearchData;
  }

  console.log(`\nGenerating outline for "${slug}"...`);
  console.log(`  Topic: ${topic.topic}`);
  console.log(`  Audience: ${topic.audience}`);
  console.log(`  Chapters: ${topic.chapter_count}`);
  console.log(`  Depth: ${topic.depth}`);
  console.log(`  Angle: ${topic.angle}`);
  console.log(`  Research: ${research ? `loaded (${research.industry_data?.length || 0} claims)` : "none"}`);

  let outline: BookOutline;
  if (pipelineConfig.llm && research) {
    outline = await generateOutlineWithLLM(topic, research, pipelineConfig);
  } else {
    outline = generateOutline(topic, existingTitle, existingSubtitle, research);
  }

  // Validate
  const errors = validateOutline(outline);
  if (errors.length > 0) {
    console.error("\nValidation errors:");
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  // Write outline
  const yamlOutput = stringify(outline, { lineWidth: 120 });
  writeFileSync(outlinePath, `# Book Outline — generated by generate-outline.ts\n# Review and edit before running: make plan ebook=${slug}\n\n${yamlOutput}`);

  console.log(`\n  Output: ${outlinePath}`);
  console.log(`  Chapters: ${outline.chapters.length}`);
  console.log(`  Arc: ${outline.narrative_arc}`);
  console.log(`  Word target: ${outline.target_word_count}`);
  console.log(`\n  Chapters:`);
  for (const ch of outline.chapters) {
    console.log(`    ${ch.id} [${ch.difficulty}/${ch.role}] — ${ch.title}`);
  }

  const cost = pipelineConfig.costTracker.summary();
  if (cost.totalCalls > 0) {
    console.log(`  API usage: ${cost.totalCalls} calls, ~${cost.totalTokens} tokens, ~$${cost.estimatedCostUsd}`);
  }

  console.log(`\nNext: Review outline.yml, then run: make plan ebook=${slug}`);
}

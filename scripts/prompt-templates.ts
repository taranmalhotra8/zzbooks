/**
 * LLM Prompt Templates for each pipeline stage.
 *
 * Each function returns LLMMessage[] (system + user messages).
 * Prompts are designed to work with any model — no model-specific features.
 */

import type { LLMMessage } from "./providers/llm.js";
import type {
  TopicConfig,
  ContextConfig,
  ResearchData,
  ResearchClaim,
  ResearchPattern,
  BookOutline,
  OutlineChapter,
  ChapterPlan,
  PlanSection,
  ContentSeed,
  DensityProfile,
} from "./pipeline-types.js";
import type { SearchResult } from "./providers/search.js";

// ── Stage 0: Research Structuring ───────────────────────────────────────────

export function researchStructuringPrompt(
  topic: TopicConfig,
  searchResults: SearchResult[],
  context: ContextConfig | null,
): LLMMessage[] {
  const resultsText = searchResults
    .map((r, i) => `[${i + 1}] "${r.title}" (${r.url})\n${r.snippet}`)
    .join("\n\n");

  return [
    {
      role: "system",
      content: `You are a technical research analyst. Your job is to structure raw search results into organized research data for an ebook authoring pipeline.

Output format: JSON object with these fields:
- industry_data: Array of {claim: string, source: string, url: string}
  - Each claim must be a specific, quantified statement (not vague)
  - Include the source name and URL from the search results
  - Prefer recent data (2024-2025)
  - Aim for 6-10 claims

- common_patterns: Array of {name: string, description: string, typical_savings: string, implementation_effort: "Low"|"Medium"|"High", risk: "Low"|"Medium"|"High", eligibility: string}
  - Each pattern is a specific optimization technique or best practice
  - typical_savings should be specific (e.g., "20-35% cost reduction") not vague
  - Aim for 4-6 patterns

- key_configs: Array of {name: string, type: string, description: string, example_lines: number}
  - Configuration examples relevant to the topic
  - type is the config format (e.g., "yaml", "hcl", "json")
  - Aim for 3-5 configs

- tooling_landscape: Array of {name: string, category: string, description: string}
  - Tools and platforms relevant to the topic
  - category: "open-source", "commercial", "cloud-native", "saas"
  - Aim for 6-10 tools

Rules:
- Only include data that is supported by the search results
- If a claim lacks a specific source, attribute it to the most relevant result
- Do not fabricate statistics — use what the search results provide
- If search results are thin, include fewer items rather than making things up`,
    },
    {
      role: "user",
      content: `Topic: "${topic.topic}"
Audience: ${topic.audience}
Depth: ${topic.depth}
Angle: ${topic.angle}

${context?.product_relevance ? `Product context: ${context.product_relevance.product} — ${context.product_relevance.how_it_helps}` : ""}

Search results to structure:

${resultsText}

Structure these into the research data JSON format.`,
    },
  ];
}

// ── Stage 1: Outline Generation ─────────────────────────────────────────────

export function outlineGenerationPrompt(
  topic: TopicConfig,
  research: ResearchData,
): LLMMessage[] {
  const chapterCount = parseInt(topic.chapter_count.split("-")[0]) || 3;

  const claimsSummary = research.industry_data
    .slice(0, 5)
    .map((c) => `- ${c.claim} (${c.source})`)
    .join("\n");

  const patternsSummary = research.common_patterns
    .map((p) => `- ${p.name}: ${p.description}`)
    .join("\n");

  return [
    {
      role: "system",
      content: `You are a technical book editor planning an ebook. Generate a structured book outline.

Output format: JSON object with these fields:
- title: string (compelling, specific — not generic)
- subtitle: string (clarifies the value proposition)
- narrative_arc: string (one sentence describing the journey: "From X to Y")
- target_word_count: string (e.g., "6000-9000")
- chapters: Array of chapter objects

Each chapter object:
- id: string (slug format, e.g., "01-why-k8s-costs-matter")
- title: string (specific, not generic — avoid "Introduction to X")
- role: "intro" | "foundation" | "technique" | "advanced" | "conclusion"
- difficulty: "beginner" | "intermediate" | "advanced"
- summary: string (2-3 sentences, what the reader learns)
- builds_on: string[] (IDs of prerequisite chapters, empty for first chapter)
- sets_up: string[] (IDs of chapters that build on this one)
- key_concepts: string[] (3-5 specific concepts covered)
- suggested_tags: string[] (2-4 tags for visual/content recommendations)

Rules:
- Each chapter should be a focused, scannable lesson of 1,200-1,500 words (5-7 minute read)
- Prefer more shorter chapters over fewer long ones — modern readers scan, not read linearly
- Difficulty must progress: beginner → intermediate → advanced
- First chapter is always "intro" role with "beginner" difficulty
- Last chapter should be either "advanced" or "conclusion"
- Each chapter title should be specific to the topic, not generic
- key_concepts should map to real patterns/techniques from the research
- suggested_tags help the visual engine pick appropriate diagrams`,
    },
    {
      role: "user",
      content: `Topic: "${topic.topic}"
Audience: ${topic.audience}
Chapter count: ${chapterCount}
Depth: ${topic.depth}
Angle: ${topic.angle}

Research highlights:
${claimsSummary}

Key patterns:
${patternsSummary}

Generate the book outline.`,
    },
  ];
}

// ── Stage 2: Chapter Planning ───────────────────────────────────────────────

export function chapterPlanningPrompt(
  chapter: OutlineChapter,
  research: ResearchData,
  context: ContextConfig | null,
  density: DensityProfile,
  availableTemplates: { d2: string[]; ojs: string[] },
): LLMMessage[] {
  const relevantClaims = research.industry_data
    .slice(0, 4)
    .map((c) => `- "${c.claim}" (${c.source})`)
    .join("\n");

  const relevantPatterns = research.common_patterns
    .map((p) => `- ${p.name}: ${p.typical_savings || "varies"} savings, ${p.implementation_effort || "varies"} effort`)
    .join("\n");

  const d2Templates = availableTemplates.d2.join(", ");
  const ojsTemplates = availableTemplates.ojs.join(", ");

  return [
    {
      role: "system",
      content: `You are a content strategist planning a single ebook chapter. Generate a detailed section plan.

Output format: JSON object with these fields:
- sections: Array of section objects
- content_seeds: Object with opening_hook, key_claims, patterns, configs, product_tie_in

Each section object:
- id: string (snake_case, e.g., "opening", "background", "config_vpa")
- heading: string (section title — specific, not generic)
- word_target: number (words for this section)
- visual: null | {type: "d2"|"ojs"|"code"|"callout"|"illustration"|"table"|"stat-card"|"comparison-graphic"|"metric-highlight"|"key-number", template?: string, language?: string, purpose: string, style?: string, image_prompt?: string, image_style?: string, stat_data?: {headline: string, subtext: string, source?: string}, comparison_data?: {title?: string, before: {label: string, value: string}, after: {label: string, value: string}, improvement: string}, metrics_data?: Array<{label: string, value: string, trend?: "up"|"down"}>}
- notes: string (detailed guidance for what this section should cover — be specific about arguments, examples, data to include)

Rules:
- Total word count across sections must fall within density target
- "opening" section: no heading, uses industry data hook — NOT a fictional story
- Include at least ${density.minDiagrams} D2 diagram section(s)
- Include at least ${density.minCodeBlocks} code/config section(s)
${density.hasCalculator ? "- MUST include exactly 1 interactive calculator section (OJS). Place it in the most data-heavy section. Use one of: cost-comparison-calculator, roi-calculator, resource-optimizer, or adoption-estimator. The calculator lets readers model their own scenario." : "- No calculator needed for this density level"}
- IMPORTANT: Include at least 1 image visual per chapter using these branded types:
  - "stat-card": Use when a section highlights a key metric (e.g., "$22K/month savings"). Requires stat_data: {headline: "the number", subtext: "explanation", source: "attribution"}
  - "comparison-graphic": Use for before/after or A/B comparisons. Requires comparison_data: {title, before: {label, value}, after: {label, value}, improvement: "summary"}
  - "metric-highlight": Use when showing 2-4 KPIs together. Requires metrics_data: [{label, value, trend: "up"|"down"}, ...]
  - "key-number": Use for a single bold number callout. Requires stat_data: {headline: "the number", subtext: "unit/label", source: "context"}
  Place image visuals on the opening or impact/results sections. They break text walls with branded graphics.
- End with a "summary" section
- Section notes should be detailed enough that a writer knows exactly what to write — NEVER use placeholder text like "Objective 1", "Concept 1", "Replace with actual content", "TODO", or "[INSERT]"
- Every section note must contain specific, real content guidance — not generic filler like "cover important concepts"
- For illustration visuals, include image_prompt (text description of the image) and image_style

Available D2 templates: ${d2Templates || "none"}
Available OJS templates: ${ojsTemplates || "none"}`,
    },
    {
      role: "user",
      content: `Chapter: "${chapter.title}" (${chapter.role}, ${chapter.difficulty})
Key concepts: ${chapter.key_concepts.join(", ")}
Tags: ${chapter.suggested_tags.join(", ")}
Word target: ${density.wordTarget[0]}-${density.wordTarget[1]} words
Density: ${density.level}

Research claims:
${relevantClaims}

Patterns:
${relevantPatterns}

${context?.product_relevance ? `Product: ${context.product_relevance.product} — ${context.product_relevance.how_it_helps}` : ""}
${context?.editorial_direction ? `Tone: ${context.editorial_direction.tone}\nAvoid: ${context.editorial_direction.avoid.join(", ")}\nEmphasize: ${context.editorial_direction.emphasize.join(", ")}` : ""}

Generate the chapter plan.`,
    },
  ];
}

// ── Fact Sheet Builder ────────────────────────────────────────────────────────

/**
 * Builds a structured fact sheet from content seeds and context.
 * Designed to force the LLM to use exact numbers with attribution
 * rather than paraphrasing into vague ranges.
 *
 * Handles both shapes from plan files:
 *   - key_claims as ResearchClaim[] objects ({claim, source})
 *   - key_claims as plain strings (from LLM planner output)
 *   - patterns as ResearchPattern[] objects ({name, typical_savings, ...})
 *   - patterns as plain strings
 */
function buildFactSheet(
  seeds: ContentSeed | undefined,
  context: ContextConfig | null,
): string {
  if (!seeds) return "";

  const lines: string[] = ["=== FACT SHEET (use ONLY these numbers, attributed exactly as shown) ==="];

  // Verified claims with attribution
  if (seeds.key_claims?.length) {
    lines.push("");
    lines.push("VERIFIED CLAIMS:");
    for (const c of seeds.key_claims) {
      if (typeof c === "string") {
        lines.push(`  - "${c}"`);
      } else {
        lines.push(`  - "${c.claim}" — attribute to: ${c.source}`);
      }
    }
  }

  // Patterns with exact savings figures
  if (seeds.patterns?.length) {
    lines.push("");
    lines.push("OPTIMIZATION PATTERNS (use exact figures, not wider ranges):");
    for (const p of seeds.patterns) {
      if (typeof p === "string") {
        lines.push(`  - ${p}`);
      } else {
        const savings = p.typical_savings || "not quantified";
        lines.push(`  - ${p.name}: ${savings} — ${p.description || ""}`);
      }
    }
  }

  // Customer stories with exact before/after
  if (context?.customer_stories?.length) {
    lines.push("");
    lines.push("CUSTOMER DATA (use exact figures, not ranges):");
    for (const s of context.customer_stories) {
      lines.push(`  - ${s.industry}: ${s.before} → ${s.after} in ${s.timeline}${(s as any).cluster_size ? ` (${(s as any).cluster_size})` : ""}`);
    }
  }

  lines.push("");
  lines.push("RULES:");
  lines.push("  - When citing a figure, use the EXACT number above with its source in parentheses");
  lines.push("  - If you need a number not listed here, write the sentence WITHOUT a number — describe the mechanism qualitatively instead");
  lines.push("  - NEVER fabricate statistics or invent percentage ranges");
  lines.push("  - Replace any range like '20-40%' with a specific case: e.g., 'a 1,200-resource media platform cut spend 37% in 8 weeks (customer case study)'");
  lines.push("=== END FACT SHEET ===");

  return lines.join("\n");
}

// ── Stage 3: Section Prose Generation ───────────────────────────────────────

export function sectionProsePrompt(
  section: PlanSection,
  plan: ChapterPlan,
  chapterTitle: string,
  research: ResearchData | null,
  context: ContextConfig | null,
  previousSections: string[],
  editorial: ContextConfig["editorial_direction"],
): LLMMessage[] {
  const tone = editorial?.tone || "authoritative, practitioner-focused";
  const avoid = editorial?.avoid?.join("; ") || "marketing language, vague claims";
  const emphasize = editorial?.emphasize?.join("; ") || "specific data, actionable advice";
  const codePolicy = editorial?.code_policy || "config-only";
  const seeds = plan.content_seeds;

  // Build structured fact sheet from seeds + context
  const factSheet = buildFactSheet(seeds, context);

  // Continuity context — last 2 sections for flow
  const continuity = previousSections.length > 0
    ? `\n\nPrevious sections in this chapter (maintain flow, don't repeat):\n---\n${previousSections.slice(-2).join("\n---\n")}\n---`
    : "\nThis is the first section of the chapter.";

  return [
    {
      role: "system",
      content: `You are a senior technical writer producing a section for a marketing ebook. Write publication-quality prose at CTO-readable, industry-playbook level.

Tone: ${tone}
Avoid: ${avoid}
Emphasize: ${emphasize}
Code policy: ${codePolicy}

=== CONTENT QUALITY POLICY (MANDATORY — violations cause generation failure) ===

ZERO TOLERANCE FOR PLACEHOLDER TEXT:
- NEVER write "Objective 1", "Concept 1", "Replace with actual content", "TODO", "[INSERT]", or any placeholder
- NEVER write "Key Concept X" or "Learning Objective X" as generic labels — every item must be a fully written, meaningful sentence
- NEVER use generic filler like "This section covers important concepts" — be specific about WHAT concepts and WHY they matter
- If you cannot write real content for a section, describe the mechanism or strategy qualitatively — never leave blanks or stubs

PROFESSIONAL WRITING STANDARDS:
- Write as if authoring an industry playbook for a Fortune 500 CTO audience
- Every paragraph must deliver specific, actionable insight — no padding, no filler
- Opening sections must establish strategic context, real-world stakes, and credibility through data
- Learning objectives must be concrete and business-relevant (e.g., "Implement provisioned concurrency to eliminate cold starts below 100ms" not "Understand cold starts")
- Overviews and key concepts must contain real explanations with technical depth, not generic definitions
- Summaries must synthesize actionable takeaways with specific numbers, not restate headings

STRUCTURAL RULES:
- Write actual prose paragraphs — not bullet points, not instructions, not placeholders
- Back claims with specific data from the provided FACT SHEET. Inline citations: "... (Source Name)"
- Use specific numbers from the FACT SHEET, not ranges — pick the exact documented figure
- NEVER use these vague phrases: "typically", "often", "can be", "significant", "generally", "in many cases", "various", "should consider", "many organizations", "some organizations". Replace each with a specific claim backed by a number or named source from the FACT SHEET
- If the FACT SHEET does not contain a relevant number, describe the mechanism qualitatively — do NOT invent statistics
- Target exactly ${section.word_target} words (±20%)
- Keep sentences short: maximum 20 words per sentence on average. Long technical sentences should be split into two. Target Flesch-Kincaid grade 10–13.
- Do NOT include the section heading (## ...) — the assembler adds it
- Do NOT include YAML frontmatter
- Do NOT include HTML comments
- Start the opening section with a compelling hook, not "In today's..." or "Organizations..."
- For config/code sections: provide brief context before and after the config block, but do NOT include the config block itself — the assembler handles that
- Write in markdown format (bold, italic, lists where appropriate)
- Maintain continuity with previous sections — build on what was said, don't repeat

=== END CONTENT QUALITY POLICY ===${plan.heal_augmentation ? `\n\nADDITIONAL REQUIREMENTS (from quality evaluation, iteration ${plan.heal_iteration || 1}):\n${plan.heal_augmentation}` : ""}`,
    },
    {
      role: "user",
      content: `Chapter: "${chapterTitle}"
Section: "${section.heading}" (id: ${section.id})
Word target: ${section.word_target} words
Section guidance: ${section.notes || "Write based on the chapter context and research data."}

${factSheet}

${seeds?.product_tie_in ? `Product tie-in (mention subtly, not marketing): ${seeds.product_tie_in}` : ""}
${continuity}

Every claim must have a number or named source from the FACT SHEET. If no data exists, describe qualitatively — never fabricate. Write the section content now.`,
    },
  ];
}

// ── Image Prompt Generation ─────────────────────────────────────────────────

export function imagePromptForSection(
  chapterTitle: string,
  sectionHeading: string,
  sectionPurpose: string,
  bookTopic: string,
  style: "conceptual" | "diagram" | "infographic" | "illustration",
): string {
  const styleGuide: Record<string, string> = {
    conceptual: "Abstract, clean conceptual illustration with minimal elements. Think: editorial illustration for a tech magazine.",
    diagram: "Technical diagram showing system architecture or data flow. Clean lines, labeled components.",
    infographic: "Data-driven infographic with clear visual hierarchy. Charts, comparisons, or process flows.",
    illustration: "Professional technical illustration with modern, flat design aesthetic.",
  };

  return `${styleGuide[style]} Topic: ${bookTopic}. Chapter: ${chapterTitle}. Section: ${sectionHeading}. Purpose: ${sectionPurpose}. Style: professional, modern, suitable for a technical ebook. Color palette: indigo and emerald tones. No text in the image.`;
}

// ── Search Query Generation ─────────────────────────────────────────────────

export function searchQueriesForTopic(topic: TopicConfig): string[] {
  const base = topic.topic;
  const year = new Date().getFullYear();
  return [
    `${base} industry statistics benchmarks ${year}`,
    `${base} best practices optimization patterns`,
    `${base} tools comparison landscape ${year}`,
    `${base} case studies cost savings real-world`,
    `${base} configuration examples production-ready`,
  ];
}

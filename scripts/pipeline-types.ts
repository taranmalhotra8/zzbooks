/**
 * Shared types for the content generation pipeline.
 *
 * Stage 0: Topic + Context → Research (research-topic.ts)
 * Stage 1: Topic + Research → Outline (generate-outline.ts)
 * Stage 2: Outline + Research + Context → Chapter Plans (plan-chapters.ts)
 * Stage 3: Chapter Plans + Research + Context → .qmd chapters (transform-chapter.ts)
 */

// ── Stage 0: Research & Context ──────────────────────────────────────────────

export interface ContextConfig {
  product_relevance?: {
    product: string;
    how_it_helps: string;
    key_features: string[];
    differentiators: string[];
  };
  customer_stories?: Array<{
    industry: string;
    cluster_size?: string;
    before: string;
    after: string;
    timeline: string;
  }>;
  editorial_direction?: {
    tone: string;
    avoid: string[];
    emphasize: string[];
    code_policy: "config-only" | "minimal" | "full";
  };
}

export interface ResearchClaim {
  claim: string;
  source: string;
  url?: string;
}

export interface ResearchPattern {
  name: string;
  description: string;
  typical_savings?: string;
  implementation_effort?: string;
  risk?: string;
  eligibility?: string;
}

export interface ResearchConfigExample {
  name: string;
  type: string;
  description: string;
  example_lines?: number;
}

export interface ResearchData {
  generated_at: string;
  topic: string;
  industry_data: ResearchClaim[];
  common_patterns: ResearchPattern[];
  key_configs: ResearchConfigExample[];
  tooling_landscape: Array<{ name: string; category: string; description?: string }>;
}

// ── Stage 1: Topic & Outline ────────────────────────────────────────────────

export interface TopicConfig {
  topic: string;
  audience: string;
  chapter_count: string; // e.g., "3-5"
  depth: "conceptual" | "practical" | "production-ready";
  angle: "tutorial" | "reference" | "incident-driven" | "case-study";
}

export type ChapterRole = "intro" | "foundation" | "technique" | "advanced" | "conclusion";
export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface OutlineChapter {
  id: string;
  title: string;
  role: ChapterRole;
  difficulty: Difficulty;
  summary: string;
  builds_on: string[];
  sets_up: string[];
  key_concepts: string[];
  suggested_tags: string[];
}

export interface BookOutline {
  title: string;
  subtitle: string;
  narrative_arc: string;
  target_word_count: string; // e.g., "8000-12000"
  chapters: OutlineChapter[];
}

// ── Stage 2: Chapter Plans & Visual Recommendations ─────────────────────────

export type VisualType = "d2" | "ojs" | "code" | "callout" | "illustration" | "table"
  | "stat-card" | "comparison-graphic" | "metric-highlight" | "key-number";

export interface VisualRecommendation {
  type: VisualType;
  template?: string;        // D2 or OJS template name (from _diagrams/templates/ or _templates/ojs/)
  language?: string;         // for code blocks
  purpose: string;
  lines?: string;           // e.g., "100-150" for code blocks
  placement?: string;       // e.g., "after_paragraph_2"
  style?: string;           // for callouts: "tip" | "note" | "warning" | "important"
  // Image generation fields (for type: "illustration")
  image_prompt?: string;     // Text prompt for image generation
  image_style?: "conceptual" | "diagram" | "infographic" | "illustration";
  image_filename?: string;   // e.g., "ch01-hero-k8s-cost.png"
  // Satori-rendered graphic fields (for stat-card, comparison-graphic, metric-highlight, key-number)
  stat_data?: {
    headline: string;        // e.g., "$18,400/month"
    subtext: string;         // e.g., "Average savings from right-sizing"
    source?: string;         // e.g., "Datadog 2024 Report"
  };
  comparison_data?: {
    title?: string;
    before: { label: string; value: string };
    after: { label: string; value: string };
    improvement: string;     // e.g., "67% reduction"
  };
  metrics_data?: Array<{
    label: string;
    value: string;
    trend?: "up" | "down";
  }>;
}

export interface PlanSection {
  id: string;
  heading: string;
  word_target: number;
  visual: VisualRecommendation | null;
  notes: string;
}

export interface Protagonist {
  name: string;
  role: string;
  company: string;
}

export interface Incident {
  problem: string;
  discovery: string;
  metric: string;
  root_cause: string;
}

export interface ResultsSpec {
  savings: string;
  timeline: string;
  incidents: string;
  adoption: string;
  additional?: string[];
}

export interface ScenarioConfig {
  protagonist: Protagonist;
  incident: Incident;
  numbers: string[];
  results: ResultsSpec;
  field_notes: string;
}

export interface ContentSeed {
  opening_hook: string;          // industry stat or pattern to open with
  key_claims: ResearchClaim[];   // research-backed claims for this chapter
  patterns: ResearchPattern[];   // relevant optimization patterns
  configs: ResearchConfigExample[];  // config examples to include
  product_tie_in?: string;       // how the product relates (from context.yml)
}

export interface ChapterPlan {
  chapter_id: string;
  density_level: DensityLevel;
  word_target: [number, number];
  sections: PlanSection[];
  content_seeds: ContentSeed;
  // Self-healing augmentation (injected by heal-strategies.ts)
  heal_augmentation?: string;
  heal_iteration?: number;
  // Legacy support
  scenario?: ScenarioConfig;
}

// ── Density Engine ──────────────────────────────────────────────────────────

export type DensityLevel = "light" | "standard" | "full";

export interface DensityProfile {
  level: DensityLevel;
  wordTarget: [number, number];
  minVisuals: number;
  minCodeBlocks: number;
  minDiagrams: number;
  hasCalculator: boolean;
  hasSecondaryCode: boolean;
  hasPhasedImplementation: boolean;
  hasAfterDiagram: boolean;
}

// Tags that indicate code-heavy content
export const CODE_HEAVY_TAGS = [
  "optimization", "tooling", "architecture", "automation",
  "right-sizing", "autoscaling", "monitoring", "infrastructure",
];

// Tags that indicate visual-heavy content (diagrams/illustrations)
export const VISUAL_HEAVY_TAGS = [
  "architecture", "workflow", "pipeline", "comparison",
  "infrastructure", "multi-cloud",
];

/**
 * Computes density level from chapter metadata.
 *
 * Rules:
 *   - difficulty beginner → "light"
 *   - difficulty intermediate → "standard"
 *   - difficulty advanced → "full"
 *   - First chapter (intro) caps at "standard"
 *   - Last chapter (conclusion) caps at "standard"
 */
export function computeDensityLevel(
  difficulty: Difficulty,
  role: ChapterRole,
  index: number,
  totalChapters: number,
): DensityLevel {
  const difficultyMap: Record<Difficulty, DensityLevel> = {
    beginner: "light",
    intermediate: "standard",
    advanced: "full",
  };

  let level = difficultyMap[difficulty];

  // Intro and conclusion chapters are capped at standard
  const isFirst = index === 0;
  const isLast = index === totalChapters - 1;
  if ((isFirst || isLast) && level === "full") {
    level = "standard";
  }

  // Role-based adjustments
  if (role === "intro" && level === "full") level = "standard";
  if (role === "conclusion" && level === "full") level = "standard";

  return level;
}

/**
 * Builds a full density profile from chapter metadata.
 */
export function buildDensityProfile(
  difficulty: Difficulty,
  role: ChapterRole,
  index: number,
  totalChapters: number,
  tags: string[],
): DensityProfile {
  const level = computeDensityLevel(difficulty, role, index, totalChapters);
  const hasCodeHeavyTag = tags.some((t) => CODE_HEAVY_TAGS.includes(t));

  const profiles: Record<DensityLevel, DensityProfile> = {
    light: {
      level: "light",
      wordTarget: [800, 1200],
      minVisuals: 1,
      minCodeBlocks: 2,
      minDiagrams: 0,
      hasCalculator: false,
      hasSecondaryCode: false,
      hasPhasedImplementation: false,
      hasAfterDiagram: false,
    },
    standard: {
      level: "standard",
      wordTarget: [1200, 1800],
      minVisuals: 2,
      minCodeBlocks: 2,
      minDiagrams: 1,
      hasCalculator: true,
      hasSecondaryCode: hasCodeHeavyTag,
      hasPhasedImplementation: false,
      hasAfterDiagram: false,
    },
    full: {
      level: "full",
      wordTarget: [1800, 2500],
      minVisuals: 3,
      minCodeBlocks: 2,
      minDiagrams: 1,
      hasCalculator: true,
      hasSecondaryCode: true,
      hasPhasedImplementation: true,
      hasAfterDiagram: true,
    },
  };

  return profiles[level];
}

// ── Visual Recommendation Engine ────────────────────────────────────────────

export interface VisualRule {
  sectionType: string;
  roles: ChapterRole[];       // which chapter roles this applies to
  visualType: VisualType;
  template?: string;
  priority: number;           // higher = more likely to be recommended
}

/**
 * Built-in rules for recommending visual types per section.
 * The plan-chapters.ts tool uses these to decide what visual goes where.
 */
export const VISUAL_RULES: VisualRule[] = [
  // Architecture diagrams
  { sectionType: "architecture", roles: ["intro", "foundation", "technique", "advanced"], visualType: "d2", template: "cloud-architecture", priority: 10 },
  { sectionType: "workflow", roles: ["intro", "foundation", "technique", "advanced"], visualType: "d2", template: "finops-workflow", priority: 8 },
  { sectionType: "pipeline", roles: ["foundation", "technique", "advanced"], visualType: "d2", template: "data-pipeline", priority: 7 },

  // Before/after comparisons
  { sectionType: "comparison", roles: ["technique", "advanced"], visualType: "d2", template: "before-after-optimization", priority: 10 },
  { sectionType: "optimization", roles: ["technique", "advanced"], visualType: "d2", template: "before-after-optimization", priority: 9 },

  // Multi-cloud
  { sectionType: "multi-cloud", roles: ["foundation", "technique"], visualType: "d2", template: "multi-cloud-comparison", priority: 8 },

  // Interactive calculators
  { sectionType: "cost-comparison", roles: ["foundation", "technique", "advanced"], visualType: "ojs", template: "cost-comparison-calculator", priority: 9 },
  { sectionType: "roi", roles: ["technique", "advanced"], visualType: "ojs", template: "roi-calculator", priority: 8 },
  { sectionType: "sizing", roles: ["technique", "advanced"], visualType: "ojs", template: "resource-optimizer", priority: 9 },

  // Code blocks
  { sectionType: "implementation", roles: ["foundation", "technique", "advanced"], visualType: "code", priority: 10 },
  { sectionType: "configuration", roles: ["intro", "foundation", "technique", "advanced"], visualType: "code", priority: 7 },

  // Callouts
  { sectionType: "insight", roles: ["intro", "foundation", "technique", "advanced", "conclusion"], visualType: "callout", priority: 6 },

  // Illustrations (AI-generated conceptual images)
  { sectionType: "concept", roles: ["intro", "foundation"], visualType: "illustration", priority: 5 },

  // Satori-rendered branded graphics (always available, no API key needed)
  { sectionType: "impact", roles: ["technique", "advanced", "conclusion"], visualType: "stat-card", priority: 7 },
  { sectionType: "results", roles: ["technique", "advanced", "conclusion"], visualType: "stat-card", priority: 7 },
  { sectionType: "savings", roles: ["technique", "advanced"], visualType: "stat-card", priority: 8 },
  { sectionType: "optimization", roles: ["technique", "advanced"], visualType: "comparison-graphic", priority: 8 },
  { sectionType: "before-after", roles: ["technique", "advanced"], visualType: "comparison-graphic", priority: 9 },
  { sectionType: "metrics", roles: ["foundation", "technique", "advanced"], visualType: "metric-highlight", priority: 6 },
  { sectionType: "overview", roles: ["intro", "foundation"], visualType: "metric-highlight", priority: 5 },
  { sectionType: "highlight", roles: ["intro", "foundation", "technique"], visualType: "key-number", priority: 6 },
];

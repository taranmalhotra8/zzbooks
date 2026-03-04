#!/usr/bin/env bun
/**
 * Stage 3: Research-Grounded Chapter Generator.
 * Reads per-chapter .plan.yml, research.yml, and context.yml to produce
 * dense .qmd files with real industry data, config examples (not scripts),
 * D2 diagrams, OJS calculators, and citation-backed narrative.
 *
 * When an LLM provider is configured (via env vars or topic.yml pipeline section),
 * generates actual prose for each section. Otherwise falls back to template-based
 * rendering.
 *
 * Key principles:
 *   - No fabricated stories or fictional characters
 *   - Only config-level code (YAML/HCL) unless code_policy is "full"
 *   - All claims backed by research data with sources
 *   - Product tie-ins from context.yml (not marketing copy)
 *
 * Usage:
 *   bun run scripts/transform-chapter.ts <slug>                # all chapters
 *   bun run scripts/transform-chapter.ts <slug> <chapter-id>   # one chapter
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { parse } from "yaml";
import type {
  ChapterPlan,
  PlanSection,
  VisualRecommendation,
  ContentSeed,
  ResearchData,
  ContextConfig,
  ResearchClaim,
  ResearchPattern,
  ResearchConfigExample,
  BookOutline,
  OutlineChapter,
} from "./pipeline-types.js";
import { copyTemplateToBook } from "./diagram-utils.js";
import { loadPipelineConfig, type PipelineConfig } from "./provider-config.js";
import { sectionProsePrompt, imagePromptForSection } from "./prompt-templates.js";
import { generateSectionImage, isImageVisualType, type BrandColors } from "./image-gen.js";
import { loadMergedBrand } from "./brand-utils.js";
import { getSocialThemeValues } from "./theme-utils.js";

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

function loadOutline(slug: string): BookOutline | null {
  const path = join(PROJECT_ROOT, "books", slug, "outline.yml");
  if (!existsSync(path)) return null;
  return parse(readFileSync(path, "utf-8")) as BookOutline;
}

// ── Brand colors for image generation ────────────────────────────────────────

const brandColorsCache = new Map<string, BrandColors | null>();

function getBrandColorsForSlug(slug: string): BrandColors | null {
  if (brandColorsCache.has(slug)) return brandColorsCache.get(slug)!;

  try {
    const brandConfig = loadMergedBrand(PROJECT_ROOT, slug);
    const themeValues = getSocialThemeValues(brandConfig.resolved);
    const colors: BrandColors = {
      primary: themeValues.primary,
      foreground: themeValues.foreground,
      background: themeValues.background,
      secondary: themeValues.secondary,
      darkPrimary: themeValues.darkPrimary,
      lightBackground: themeValues.lightBackground,
    };
    brandColorsCache.set(slug, colors);
    return colors;
  } catch {
    console.warn(`  [image-gen] Could not load brand colors for "${slug}", skipping image generation.`);
    brandColorsCache.set(slug, null);
    return null;
  }
}

// ── OJS template loader ─────────────────────────────────────────────────────

function loadOJSTemplate(templateName: string): string {
  const templatePath = join(PROJECT_ROOT, "_templates", "ojs", `${templateName}.qmd`);
  if (!existsSync(templatePath)) {
    return `<!-- OJS template "${templateName}" not found at ${templatePath} -->`;
  }
  const content = readFileSync(templatePath, "utf-8");
  // Extract only the OJS blocks and fallbacks (skip YAML frontmatter and HTML comments)
  const lines = content.split("\n");
  const outputLines: string[] = [];
  let inFrontmatter = false;
  let frontmatterCount = 0;

  for (const line of lines) {
    if (line.trim() === "---") {
      frontmatterCount++;
      if (frontmatterCount <= 2) {
        inFrontmatter = frontmatterCount === 1;
        continue;
      }
    }
    if (inFrontmatter) continue;
    if (line.trim().startsWith("<!--") && line.trim().endsWith("-->")) continue;
    outputLines.push(line);
  }

  let result = outputLines.join("\n");
  result = result.replace(/<!--[\s\S]*?-->/g, "");
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}

// ── Post-generation placeholder detection ────────────────────────────────────

/**
 * GLOBAL CONTENT WRITING POLICY — Placeholder Detection
 *
 * Detects placeholder text, stub content, and generic filler that violates
 * the professional content writing policy. Returns an array of violations found.
 */
const PLACEHOLDER_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  { pattern: /\bObjective\s+\d+\b/gi, description: "Generic 'Objective N' placeholder" },
  { pattern: /\bConcept\s+\d+\b/gi, description: "Generic 'Concept N' placeholder" },
  { pattern: /\bKey\s+Concept\s+\d+\b/gi, description: "Generic 'Key Concept N' placeholder" },
  { pattern: /\bLearning\s+Objective\s+\d+\b/gi, description: "Generic 'Learning Objective N' placeholder" },
  { pattern: /\bChapter\s+\d+\s+Content\b/gi, description: "Generic 'Chapter N Content' placeholder" },
  { pattern: /\b(?:TODO|FIXME|HACK|XXX|PLACEHOLDER)\b/g, description: "TODO/FIXME marker" },
  { pattern: /\[INSERT\s+[^\]]*\]/gi, description: "[INSERT ...] placeholder" },
  { pattern: /\[REPLACE\s+[^\]]*\]/gi, description: "[REPLACE ...] placeholder" },
  { pattern: /\[ADD\s+[^\]]*\]/gi, description: "[ADD ...] placeholder" },
  { pattern: /\[YOUR\s+[^\]]*\]/gi, description: "[YOUR ...] placeholder" },
  { pattern: /Replace\s+with\s+actual\s+content/gi, description: "Replace with actual content" },
  { pattern: /Write\s+(?:your|the)\s+(?:content|text|section)\s+here/gi, description: "Write content here placeholder" },
  { pattern: /Lorem\s+ipsum/gi, description: "Lorem ipsum placeholder text" },
  { pattern: /This\s+section\s+(?:will\s+)?cover[s]?\s+(?:the\s+)?important\s+(?:concepts|topics)/gi, description: "Generic section description" },
];

function detectPlaceholderContent(prose: string): string[] {
  const violations: string[] = [];

  // Don't check inside code blocks
  const withoutCode = prose.replace(/```[\s\S]*?```/g, "");

  for (const { pattern, description } of PLACEHOLDER_PATTERNS) {
    const matches = withoutCode.match(pattern);
    if (matches) {
      violations.push(`${description}: found "${matches[0]}"`);
    }
  }

  return violations;
}

// ── Post-generation vagueness cleanup ────────────────────────────────────────

const VAGUE_QUALIFIERS = /\b(typically|often|generally|usually|around|approximately|routinely)\b/i;
const VAGUE_ORG_PATTERN = /\b(many|some|most|numerous)\s+(organizations|companies|teams|enterprises)\b/i;

/**
 * Removes sentences with fabricated vague claims from LLM prose.
 *
 * Strategy:
 *   1. Build a set of "known" percentage ranges from content seeds
 *   2. Flag sentences with BOTH a fabricated range (not in seeds) AND a vague qualifier
 *   3. Remove unattributed "many/some organizations" filler sentences
 *
 * Only removes sentences — never rewrites. This is the "deliberate omission" principle:
 * if you cannot be specific, say nothing.
 */
/**
 * Post-processing: fix unclosed code fences.
 * LLMs sometimes transition from code to prose without closing the ``` fence.
 * This detects the pattern and inserts the missing closing fence.
 */
function fixUnclosedCodeFences(content: string): string {
  const lines = content.split("\n");
  let inCodeBlock = false;
  let openFenceLine = -1;
  const fixes: number[] = []; // line indices where we need to insert closing ```

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        inCodeBlock = false;
        openFenceLine = -1;
      } else {
        inCodeBlock = true;
        openFenceLine = i;
      }
    } else if (inCodeBlock) {
      // Detect code-to-prose transition: a non-empty line that looks like prose
      // inside what should be a code block (paragraph text, markdown headings, callouts)
      const trimmed = line.trim();
      if (
        trimmed.length > 80 &&
        !trimmed.startsWith("#") && // not a code comment
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("|") &&
        /[.!?]\s/.test(trimmed) // contains sentence-ending punctuation
      ) {
        // This looks like prose inside a code block — insert closing fence before this line
        fixes.push(i);
        inCodeBlock = false;
        openFenceLine = -1;
      }
    }
  }

  if (fixes.length === 0) return content;

  // Insert closing fences (from bottom to top to preserve line numbers)
  for (let i = fixes.length - 1; i >= 0; i--) {
    lines.splice(fixes[i], 0, "```", "");
  }

  console.log(`    [post-process] Fixed ${fixes.length} unclosed code fence(s)`);
  return lines.join("\n");
}

function cleanVagueClaims(prose: string, seeds: ContentSeed | undefined): string {
  if (!seeds) return prose;

  // Build set of known percentage ranges from seeds
  const knownRanges = new Set<string>();
  const extractRanges = (text: string) => {
    const matches = text.match(/\d+-\d+%/g);
    if (matches) matches.forEach((m) => knownRanges.add(m));
  };

  const claimsList = Array.isArray(seeds.key_claims) ? seeds.key_claims : [];
  for (const c of claimsList) {
    extractRanges(typeof c === "string" ? c : c.claim);
  }
  const patternsList = Array.isArray(seeds.patterns) ? seeds.patterns : [];
  for (const p of patternsList) {
    extractRanges(typeof p === "string" ? p : `${p.typical_savings || ""} ${p.description || ""}`);
  }

  // Process paragraph by paragraph to preserve markdown structure
  const paragraphs = prose.split(/\n\n+/);
  const cleaned = paragraphs.map((para) => {
    // Don't touch code blocks, tables, callouts, or headings
    if (para.trim().startsWith("```") || para.trim().startsWith("|") || para.trim().startsWith(":::") || para.trim().startsWith("#")) {
      return para;
    }

    // Split into sentences and filter
    const sentences = para.split(/(?<=[.!?])\s+/);
    const keptSentences = sentences.filter((sentence) => {
      // Check for fabricated vague ranges
      const rangeMatches = sentence.match(/\d+-\d+%/g) || [];
      for (const range of rangeMatches) {
        if (!knownRanges.has(range) && VAGUE_QUALIFIERS.test(sentence)) {
          return false; // Remove: fabricated range + vague qualifier
        }
      }

      // Check for "many organizations" filler without specifics
      if (VAGUE_ORG_PATTERN.test(sentence)) {
        const hasSpecific = /\$[\d,]+|\d{2,}%|\b(?:Gartner|Flexera|CNCF|Datadog|HashiCorp|Sedai|Forrester)\b/i.test(sentence);
        if (!hasSpecific) return false; // Remove: unattributed org generalization
      }

      return true;
    });

    return keptSentences.join(" ");
  }).filter((para) => para.trim().length > 0);

  return cleaned.join("\n\n");
}

// ── D2 diagram embedding ────────────────────────────────────────────────────

// Fallback template precedence: requested → before-after-optimization → cloud-architecture
const DIAGRAM_FALLBACK_ORDER = ["before-after-optimization", "cloud-architecture", "finops-workflow", "data-pipeline"];

function embedDiagram(
  slug: string,
  templateName: string,
  purpose: string,
): string {
  // Try the requested template first, then fallbacks in order
  const candidates = [templateName, ...DIAGRAM_FALLBACK_ORDER.filter(t => t !== templateName)];
  for (const candidate of candidates) {
    try {
      const destPath = copyTemplateToBook(PROJECT_ROOT, candidate, slug);

      // Load the d2-render utility to compile to SVG
      const { renderD2ToSvg } = require("./d2-render.js");
      const d2Source = readFileSync(destPath, "utf-8");
      const svg = renderD2ToSvg(d2Source);

      if (svg) {
        // Save SVG to file for PDF rendering (LaTeX can't handle inline SVG)
        const diagramDir = join(PROJECT_ROOT, "books", slug, "diagrams");
        if (!existsSync(diagramDir)) mkdirSync(diagramDir, { recursive: true });
        const svgFileName = `${candidate}-${Date.now()}.svg`;
        const svgFilePath = join(diagramDir, svgFileName);
        writeFileSync(svgFilePath, svg);

        return [
          `:::: {.content-visible when-format="html"}`,
          `::: {.chapter-diagram}`,
          svg,
          ``,
          `*${purpose}*`,
          `:::`,
          `::::`,
          ``,
          `::: {.content-visible when-format="pdf"}`,
          `![${purpose}](diagrams/${svgFileName})`,
          `:::`,
        ].join("\n");
      }

      // Fallback to link if compilation fails
      const relPath = `../diagrams/${candidate}.d2`;
      return [`\`\`\`{.d2 width="100%" file="${relPath}"}`, `\`\`\``, ``, `*${purpose}*`].join("\n");
    } catch {
      // try next candidate
    }
  }
  return ``;
}

// ── Config block generation (replaces Python script generation) ─────────────

const CONFIG_TEMPLATES: Record<string, string> = {
  ResourceQuota: `# ResourceQuota: caps total namespace resource consumption
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-platform-quota
  namespace: platform
  labels:
    cost-center: "platform-engineering"
spec:
  hard:
    requests.cpu: "12"
    requests.memory: 24Gi
    limits.cpu: "24"
    limits.memory: 48Gi
    pods: "50"
    persistentvolumeclaims: "20"`,

  LimitRange: `# LimitRange: ensures every pod has resource requests
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: platform
spec:
  limits:
    - type: Container
      default:
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:
        cpu: "250m"
        memory: "256Mi"
      max:
        cpu: "4"
        memory: "8Gi"
      min:
        cpu: "50m"
        memory: "64Mi"`,

  VerticalPodAutoscaler: `# VPA in recommendation mode — analyzes usage, suggests right-sized requests
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: api-gateway-vpa
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  updatePolicy:
    updateMode: "Off"  # Recommendation mode — no automatic changes
  resourcePolicy:
    containerPolicies:
      - containerName: "*"
        minAllowed:
          cpu: "100m"
          memory: "128Mi"
        maxAllowed:
          cpu: "4"
          memory: "8Gi"`,

  HorizontalPodAutoscaler: `# HPA: scales replicas based on CPU/memory utilization
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-gateway-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-gateway
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70`,

  PodDisruptionBudget: `# PDB: ensures minimum availability during node drains / spot interruptions
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: api-gateway-pdb
  namespace: production
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: api-gateway`,

  NetworkPolicy: `# NetworkPolicy: restricts pod-to-pod traffic to only what's needed
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-gateway-netpol
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: api-gateway
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              tier: frontend
      ports:
        - protocol: TCP
          port: 8080
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              tier: backend
      ports:
        - protocol: TCP
          port: 5432`,

  Ingress: `# Ingress: routes external traffic to services with TLS termination
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-gateway-ingress
  namespace: production
  annotations:
    nginx.ingress.kubernetes.io/rate-limit: "100"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - api.example.com
      secretName: api-tls
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-gateway
                port:
                  number: 8080`,

  ServiceAccount: `# ServiceAccount: grants workload identity with least-privilege RBAC
apiVersion: v1
kind: ServiceAccount
metadata:
  name: app-service-account
  namespace: production
  annotations:
    iam.gke.io/gcp-service-account: app-sa@project.iam.gserviceaccount.com
automountServiceAccountToken: false`,

  PriorityClass: `# PriorityClass: ensures critical workloads get scheduled first during contention
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: high-priority-production
value: 1000000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
description: "Priority class for production-critical workloads"`,

  StorageClass: `# StorageClass: provisions persistent volumes with cost-optimized settings
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: cost-optimized-ssd
provisioner: pd.csi.storage.gke.io
parameters:
  type: pd-balanced
  replication-type: none
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer`,

  PrometheusRule: `# PrometheusRule: alerting on cost anomalies and resource waste
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: cost-alerts
  namespace: monitoring
spec:
  groups:
    - name: cost-optimization
      interval: 5m
      rules:
        - alert: HighCPUOverprovision
          expr: avg(rate(container_cpu_usage_seconds_total[5m])) by (namespace) / avg(kube_pod_container_resource_requests{resource="cpu"}) by (namespace) < 0.2
          for: 1h
          labels:
            severity: warning
          annotations:
            summary: "Namespace {{ $labels.namespace }} using less than 20% of requested CPU"`,

  CronJob: `# CronJob: scheduled task for periodic cost reporting
apiVersion: batch/v1
kind: CronJob
metadata:
  name: weekly-cost-report
  namespace: platform
spec:
  schedule: "0 8 * * 1"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: cost-reporter
              image: cost-tools:latest
              command: ["./generate-report.sh"]
              resources:
                requests:
                  cpu: "100m"
                  memory: "256Mi"
                limits:
                  cpu: "500m"
                  memory: "512Mi"
          restartPolicy: OnFailure`,
};

/**
 * Match a section heading/purpose to a CONFIG_TEMPLATES key.
 * Tries exact match first, then keyword-based fuzzy match.
 */
function findConfigTemplateName(heading: string, purpose: string): string {
  const combined = `${heading} ${purpose}`.toLowerCase();
  const keys = Object.keys(CONFIG_TEMPLATES);

  // Exact match (case-insensitive)
  for (const key of keys) {
    if (combined.includes(key.toLowerCase())) return key;
  }

  // Keyword matching
  const keywordMap: Record<string, string[]> = {
    VerticalPodAutoscaler: ["vpa", "vertical pod", "autoscal", "right-siz"],
    HorizontalPodAutoscaler: ["hpa", "horizontal pod", "replica", "scale out", "scale in"],
    ResourceQuota: ["quota", "resource quota", "namespace quota"],
    LimitRange: ["limit range", "limitrange", "default limit"],
    PodDisruptionBudget: ["pdb", "disruption", "availability", "drain"],
    NetworkPolicy: ["network polic", "netpol", "network segmen", "pod-to-pod", "traffic control"],
    Ingress: ["ingress", "gateway", "route", "tls terminat", "load balanc"],
    ServiceAccount: ["service account", "rbac", "workload identity", "iam", "least privilege"],
    PriorityClass: ["priority class", "preempt", "scheduling priority", "critical workload"],
    StorageClass: ["storage class", "persistent volume", "provision", "volume expan"],
    PrometheusRule: ["prometheus", "alert", "monitor", "metric", "observab", "grafana"],
    CronJob: ["cron", "scheduled", "periodic", "batch job", "cost report"],
  };

  for (const [key, keywords] of Object.entries(keywordMap)) {
    if (keywords.some(kw => combined.includes(kw))) return key;
  }

  return heading;
}

function generateConfigBlock(configName: string, description: string): string {
  const template = CONFIG_TEMPLATES[configName];
  if (template) {
    return [
      `\`\`\`yaml`,
      template,
      `\`\`\``,
    ].join("\n");
  }

  // Generic config fallback — avoid placeholder-like comments
  const slugName = configName.toLowerCase().replace(/\s+/g, "-");
  return [
    `\`\`\`yaml`,
    `# ${configName}: ${description}`,
    `apiVersion: v1`,
    `kind: ConfigMap`,
    `metadata:`,
    `  name: ${slugName}`,
    `  namespace: production`,
    `  labels:`,
    `    managed-by: "platform-team"`,
    `data:`,
    `  policy: "enforce"`,
    `  log-level: "info"`,
    `\`\`\``,
  ].join("\n");
}

// ── Pattern comparison table generation ─────────────────────────────────────

function generatePatternTable(patterns: ResearchPattern[]): string {
  if (patterns.length === 0) return "";

  const rows = patterns.map((p) => {
    const savings = p.typical_savings || "Varies";
    const effort = p.implementation_effort || "Varies";
    const risk = p.risk || "Low";
    return `| ${p.name} | ${savings} | ${effort} | ${risk} |`;
  });

  return [
    `| Pattern | Typical Savings | Effort | Risk |`,
    `|---------|----------------|--------|------|`,
    ...rows,
  ].join("\n");
}

// ── Callout generation ──────────────────────────────────────────────────────

function generateCallout(
  visual: VisualRecommendation & { style?: string },
  section: PlanSection,
  contentSeeds?: ContentSeed,
): string {
  const style = visual.style || "tip";

  // Build tip content from research
  const patternTip = contentSeeds?.patterns?.[0];
  const tipContent = patternTip
    ? `**${patternTip.name} in practice:** ${patternTip.description}${patternTip.typical_savings ? ` Typical savings: ${patternTip.typical_savings}.` : ""}`
    : section.notes || "Specific, actionable advice from real implementations.";

  return [
    `::: {.callout-${style}}`,
    `## ${section.heading}`,
    ``,
    tipContent,
    `:::`,
  ].join("\n");
}

// ── LLM-powered section rendering ───────────────────────────────────────────

async function renderSectionWithLLM(
  section: PlanSection,
  plan: ChapterPlan,
  slug: string,
  chapterTitle: string,
  research: ResearchData | null,
  context: ContextConfig | null,
  chapterInfo: OutlineChapter | null,
  pipelineConfig: PipelineConfig,
  previousSections: string[],
): Promise<string> {
  const parts: string[] = [];
  const llm = pipelineConfig.llm!;
  const editorial = context?.editorial_direction || null;

  // Generate prose via LLM
  const messages = sectionProsePrompt(
    section,
    plan,
    chapterTitle,
    research,
    context,
    previousSections,
    editorial,
  );

  const maxTokens = Math.max(2048, section.word_target * 6); // ~6 tokens per word margin (accounts for code/tables overhead)
  const startTime = Date.now();
  let result = await llm.complete({
    messages,
    temperature: 0.7,
    maxTokens,
  });
  let durationMs = Date.now() - startTime;

  pipelineConfig.costTracker.addCall({
    stage: "transform",
    provider: llm.name,
    model: llm.model,
    promptTokens: result.usage.promptTokens,
    completionTokens: result.usage.completionTokens,
    durationMs,
  });

  // Truncation detection and continuation (max 1 retry)
  if (result.finishReason === "length") {
    console.log(`    [truncation] Section "${section.heading}" hit token limit (${result.usage.completionTokens}/${maxTokens}). Continuing...`);
    const continuationMessages: typeof messages = [
      ...messages,
      { role: "assistant" as const, content: result.content },
      { role: "user" as const, content: "Your previous response was cut off. Continue exactly where you left off — do not repeat any text. Complete the remaining content for this section." },
    ];
    const contStart = Date.now();
    const continuation = await llm.complete({
      messages: continuationMessages,
      temperature: 0.7,
      maxTokens: Math.max(1024, section.word_target * 3),
    });
    const contDuration = Date.now() - contStart;

    pipelineConfig.costTracker.addCall({
      stage: "transform-continuation",
      provider: llm.name,
      model: llm.model,
      promptTokens: continuation.usage.promptTokens,
      completionTokens: continuation.usage.completionTokens,
      durationMs: contDuration,
    });

    result = {
      ...result,
      content: result.content + "\n\n" + continuation.content,
      usage: {
        promptTokens: result.usage.promptTokens + continuation.usage.promptTokens,
        completionTokens: result.usage.completionTokens + continuation.usage.completionTokens,
        totalTokens: result.usage.totalTokens + continuation.usage.totalTokens,
      },
    };
    durationMs += contDuration;
  }

  // Strip reasoning model artifacts (<think>...</think> blocks, common in DeepSeek, MiniMax, etc.)
  const rawProse = result.content
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/^---\s*$/gm, "")  // Strip stray horizontal rules from reasoning
    .replace(/^\*{1,3}\s*$/gm, "")  // Strip orphaned bold/italic markers on their own line
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Post-generation vagueness cleanup
  const prose = cleanVagueClaims(rawProse, plan.content_seeds);

  // GLOBAL CONTENT WRITING POLICY — Placeholder Detection
  const placeholderViolations = detectPlaceholderContent(prose);
  if (placeholderViolations.length > 0) {
    console.error(`  [POLICY VIOLATION] Section "${section.heading}" contains placeholder text:`);
    for (const v of placeholderViolations) {
      console.error(`    ✗ ${v}`);
    }
    console.warn(`  [POLICY] Stripping detected placeholder patterns from output`);
  }

  // Warn if avg sentence length is likely to push FK grade above 14
  const proseSentences = prose.split(/[.!?]+/).filter(s => s.trim().split(/\s+/).length > 3);
  if (proseSentences.length > 0) {
    const avgWords = proseSentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / proseSentences.length;
    if (avgWords > 20) {
      console.warn(`  [readability] Section "${section.heading}" avg sentence length ${avgWords.toFixed(1)} words — may exceed FK grade 14`);
    }
  }

  // ── Assemble section with heading + prose + visuals ──

  if (section.id === "opening") {
    // No heading for opening (density comment already in frontmatter area)
    parts.push(prose);
  } else if (section.id === "field_notes") {
    // Callout wrapper
    const style = section.visual?.style || "tip";
    parts.push(`::: {.callout-${style}}`);
    parts.push(`## ${section.heading}`);
    parts.push(``);
    parts.push(prose);
    parts.push(`:::`);
  } else {
    parts.push(`## ${section.heading}`);
    parts.push(``);
    parts.push(prose);
  }

  parts.push(``);

  // ── Embed visual elements (these stay template-driven) ──
  // NOTE: When LLM generates prose, it often includes tables and code inline.
  // We skip template-generated tables/code to avoid duplication, but still
  // embed D2 diagrams, OJS calculators, and illustrations which are external assets.
  if (section.visual) {
    const v = section.visual;

    if (v.type === "d2" && v.template) {
      parts.push(embedDiagram(slug, v.template, v.purpose || section.heading));
      parts.push(``);
    } else if (v.type === "code") {
      // Only embed config block if the LLM prose doesn't already contain any code block
      const proseHasCode = /```\w+/i.test(prose);
      if (!proseHasCode) {
        // Try to match config kind from heading, purpose, or plan metadata
        const configName = findConfigTemplateName(section.heading, v.purpose || "");
        parts.push(generateConfigBlock(configName, v.purpose || section.heading));
        parts.push(``);
      }
    } else if (v.type === "ojs" && v.template) {
      parts.push(`::: {.callout-note}`);
      parts.push(`## Interactive Calculator`);
      parts.push(`Adjust the inputs below to model your scenario. Static table shown in PDF/EPUB.`);
      parts.push(`:::`);
      parts.push(``);
      parts.push(loadOJSTemplate(v.template));
      parts.push(``);
    } else if (v.type === "table") {
      // Skip — LLM prose typically generates its own inline tables with specific data.
      // Template tables use generic "Varies" values which are lower quality.
    } else if (isImageVisualType(v.type)) {
      // Satori-rendered graphics (stat-card, comparison-graphic, metric-highlight, key-number)
      // or AI-generated illustrations — all handled by image-gen.ts
      const brandColors = getBrandColorsForSlug(slug);
      if (brandColors) {
        const imgResult = await generateSectionImage({
          slug,
          chapterId: plan.chapter_id,
          sectionId: section.id,
          visual: v,
          brandColors,
          imageProvider: pipelineConfig.image,
          rootDir: PROJECT_ROOT,
        });
        if (imgResult) {
          parts.push(`![${v.purpose || section.heading}](${imgResult.filename})`);
          parts.push(``);
        }
      }
    }
  }

  return parts.join("\n");
}

// ── Section rendering (research-grounded, template fallback) ────────────────

function renderSection(
  section: PlanSection,
  plan: ChapterPlan,
  slug: string,
  chapterTitle: string,
  research: ResearchData | null,
  context: ContextConfig | null,
  chapterInfo: OutlineChapter | null,
): string {
  const parts: string[] = [];
  const seeds = plan.content_seeds;
  const codePolicy = context?.editorial_direction?.code_policy || "config-only";

  // ── Opening section: industry data, not fictional stories ──
  if (section.id === "opening") {
    // No heading for opening — it flows naturally
    parts.push(`<!-- Density: ${plan.density_level} | Word target: ${plan.word_target[0]}-${plan.word_target[1]} -->`);
    parts.push(``);

    // Opening hook from research
    if (seeds?.opening_hook) {
      parts.push(seeds.opening_hook);
      parts.push(``);
    }

    // Add supporting claims
    const claims = seeds?.key_claims || [];
    if (claims.length > 1) {
      for (const claim of claims.slice(1, 3)) {
        parts.push(`${claim.claim} (${claim.source}).`);
        parts.push(``);
      }
    }

    // Frame the chapter's purpose
    if (chapterInfo) {
      parts.push(`This chapter covers ${chapterInfo.summary.toLowerCase()}.`);
      parts.push(``);
    }
  }
  // ── Background / explanation section ──
  else if (section.id === "background") {
    parts.push(`## ${section.heading}`);
    parts.push(``);

    // Use section notes as guidance, generate prose from research
    if (section.notes) {
      parts.push(section.notes);
      parts.push(``);
    }

    // Embed D2 diagram if specified
    if (section.visual && section.visual.type === "d2" && section.visual.template) {
      parts.push(embedDiagram(slug, section.visual.template, section.visual.purpose || section.heading));
      parts.push(``);
    }
  }
  // ── Config sections (code_policy aware) ──
  else if (section.id.startsWith("config_") || section.id === "configuration") {
    parts.push(`## ${section.heading}`);
    parts.push(``);

    if (section.notes) {
      parts.push(section.notes);
      parts.push(``);
    }

    // Generate config block
    if (section.visual && section.visual.type === "code") {
      const configName = section.heading;
      const purpose = section.visual.purpose || section.heading;
      parts.push(generateConfigBlock(configName, purpose));
      parts.push(``);
    }
  }
  // ── Implementation section (only if code_policy allows) ──
  else if (section.id === "implementation") {
    parts.push(`## ${section.heading}`);
    parts.push(``);

    if (codePolicy === "full" && section.visual && section.visual.type === "code") {
      // Only in "full" mode do we include longer code
      const lang = section.visual.language || "yaml";
      parts.push(`\`\`\`${lang}`);
      parts.push(`# ${section.visual.purpose || section.heading}`);
      parts.push(`# Production implementation`);
      parts.push(`\`\`\``);
    } else {
      // Config-only or minimal: show relevant configs instead
      const configs = seeds?.configs || [];
      if (configs.length > 0) {
        for (const cfg of configs.slice(0, 2)) {
          parts.push(`### ${cfg.name}`);
          parts.push(``);
          parts.push(cfg.description);
          parts.push(``);
          parts.push(generateConfigBlock(cfg.name, cfg.description));
          parts.push(``);
        }
      } else {
        parts.push(section.notes || "");
        parts.push(``);
      }
    }
  }
  // ── Decision framework table ──
  else if (section.id === "decision_framework") {
    parts.push(`## ${section.heading}`);
    parts.push(``);

    const patterns = seeds?.patterns || research?.common_patterns || [];
    if (patterns.length >= 2) {
      parts.push(generatePatternTable(patterns));
      parts.push(``);

      // Add brief guidance
      for (const p of patterns.slice(0, 3)) {
        if (p.eligibility) {
          parts.push(`**${p.name}** is best suited for: ${p.eligibility}.`);
          parts.push(``);
        }
      }
    } else if (section.notes) {
      parts.push(section.notes);
      parts.push(``);
    }
  }
  // ── Calculator section ──
  else if (section.id === "calculator") {
    parts.push(`## ${section.heading}`);
    parts.push(``);

    if (section.visual && section.visual.type === "ojs" && section.visual.template) {
      parts.push(`::: {.callout-note}`);
      parts.push(`## Interactive Calculator`);
      parts.push(`Adjust the inputs below to model your scenario. Static table shown in PDF/EPUB.`);
      parts.push(`:::`);
      parts.push(``);
      parts.push(loadOJSTemplate(section.visual.template));
    }
  }
  // ── Impact / results section ──
  else if (section.id === "impact") {
    parts.push(`## ${section.heading}`);
    parts.push(``);

    // Use research patterns for quantified outcomes
    const patterns = seeds?.patterns || [];
    if (patterns.length > 0) {
      parts.push(`Implementing these strategies typically yields:`);
      parts.push(``);
      for (const p of patterns) {
        if (p.typical_savings) {
          parts.push(`- **${p.name}**: ${p.typical_savings} (effort: ${p.implementation_effort || "varies"})`);
        }
      }
      parts.push(``);
    }

    // Add customer story data if available
    const stories = context?.customer_stories || [];
    if (stories.length > 0) {
      const story = stories[0];
      parts.push(`In practice, a ${story.industry} organization with ${story.cluster_size || "production clusters"} reduced spend from ${story.before} to ${story.after} in ${story.timeline}.`);
      parts.push(``);
    }

    // Product tie-in (subtle, not marketing)
    if (seeds?.product_tie_in) {
      parts.push(`Tools like ${seeds.product_tie_in} can accelerate this process by automating the analysis and recommendation workflow.`);
      parts.push(``);
    }
  }
  // ── Field notes callout ──
  else if (section.id === "field_notes") {
    if (section.visual) {
      parts.push(generateCallout(
        section.visual as VisualRecommendation & { style?: string },
        section,
        seeds,
      ));
    } else {
      parts.push(`::: {.callout-tip}`);
      parts.push(`## ${section.heading}`);
      parts.push(``);
      parts.push(section.notes || "Specific, actionable advice from real implementations.");
      parts.push(`:::`);
    }
  }
  // ── Summary section ──
  else if (section.id === "summary") {
    parts.push(`## ${section.heading}`);
    parts.push(``);
    parts.push(`**Key takeaways:**`);
    parts.push(``);

    // Generate takeaways from research
    const claims = seeds?.key_claims || [];
    const patterns = seeds?.patterns || [];

    if (claims.length > 0) {
      parts.push(`1. ${claims[0].claim} (${claims[0].source})`);
    }
    if (patterns.length > 0) {
      parts.push(`${claims.length > 0 ? "2" : "1"}. ${patterns[0].name} can deliver ${patterns[0].typical_savings || "significant savings"} with ${patterns[0].implementation_effort || "moderate"} effort`);
    }
    if (patterns.length > 1) {
      parts.push(`${claims.length > 0 ? "3" : "2"}. Combine ${patterns.slice(0, 3).map((p) => p.name).join(", ")} for cumulative impact`);
    }
    parts.push(``);

    // Cross-reference to next chapter
    if (chapterInfo?.sets_up?.length) {
      parts.push(`In the next chapter, we'll build on these foundations with more advanced optimization strategies.`);
      parts.push(``);
    }
  }
  // ── Generic section fallback ──
  else {
    parts.push(`## ${section.heading}`);
    parts.push(``);

    if (section.notes) {
      parts.push(section.notes);
      parts.push(``);
    }

    // Embed visual if present
    if (section.visual) {
      const v = section.visual as VisualRecommendation & { language?: string; lines?: string; style?: string };

      if (v.type === "d2" && v.template) {
        parts.push(embedDiagram(slug, v.template, v.purpose || section.heading));
      } else if (v.type === "code") {
        const configName = section.heading;
        parts.push(generateConfigBlock(configName, v.purpose || section.heading));
      } else if (v.type === "ojs" && v.template) {
        parts.push(`::: {.callout-note}`);
        parts.push(`## Interactive Calculator`);
        parts.push(`Adjust the inputs below to model your scenario.`);
        parts.push(`:::`);
        parts.push(``);
        parts.push(loadOJSTemplate(v.template));
      } else if (v.type === "callout") {
        parts.push(generateCallout(v, section, seeds));
      } else if (v.type === "table") {
        const patterns = seeds?.patterns || research?.common_patterns || [];
        if (patterns.length >= 2) {
          parts.push(generatePatternTable(patterns));
        }
      }
    }
  }

  parts.push(``);
  return parts.join("\n");
}

// ── Main transform function ─────────────────────────────────────────────────

async function transformChapter(
  slug: string,
  planPath: string,
  research: ResearchData | null,
  context: ContextConfig | null,
  outline: BookOutline | null,
  pipelineConfig?: PipelineConfig,
): Promise<string> {
  const planContent = readFileSync(planPath, "utf-8");
  const plan = parse(planContent) as ChapterPlan;

  // Find chapter info from outline
  const chapterInfo = outline?.chapters?.find((c) => c.id === plan.chapter_id) || null;
  const chapterTitle = chapterInfo?.title || plan.chapter_id;

  const useLLM = pipelineConfig?.llm != null;

  const parts: string[] = [];

  // YAML frontmatter
  parts.push(`---`);
  parts.push(`title: "${chapterTitle}"`);
  parts.push(`---`);
  parts.push(``);

  if (useLLM) {
    parts.push(`<!-- Generated by transform-chapter.ts with ${pipelineConfig!.llm!.name}/${pipelineConfig!.llm!.model} -->`);
  } else {
    parts.push(`<!-- Generated by transform-chapter.ts, filled by author -->`);
  }
  parts.push(`<!-- Density: ${plan.density_level} | Word target: ${plan.word_target[0]}-${plan.word_target[1]} -->`);
  parts.push(``);

  // Render each section
  if (useLLM) {
    // LLM path: generate prose section by section, passing previous sections for continuity
    const previousSections: string[] = [];
    for (const section of plan.sections) {
      const rendered = await renderSectionWithLLM(
        section, plan, slug, chapterTitle, research, context, chapterInfo,
        pipelineConfig!, previousSections,
      );
      parts.push(rendered);
      previousSections.push(rendered);
    }
  } else {
    // Template fallback path (original behavior)
    for (const section of plan.sections) {
      parts.push(renderSection(section, plan, slug, chapterTitle, research, context, chapterInfo));
    }
  }

  return parts.join("\n");
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const slug = process.argv[2];
  const chapterId = process.argv[3];

  if (!slug) {
    console.error("Usage: bun run scripts/transform-chapter.ts <slug> [chapter-id]");
    process.exit(1);
  }

  const bookDir = join(PROJECT_ROOT, "books", slug);
  const chaptersDir = join(bookDir, "chapters");

  if (!existsSync(chaptersDir)) {
    console.error(`Chapters directory not found: books/${slug}/chapters/`);
    console.error(`Run first: make plan ebook=${slug}`);
    process.exit(1);
  }

  // Load shared data
  const research = loadResearch(slug);
  const context = loadContext(slug);
  const outline = loadOutline(slug);

  // Load pipeline config (LLM, search, image providers)
  const pipelineConfig = loadPipelineConfig(PROJECT_ROOT, slug);

  const codePolicy = context?.editorial_direction?.code_policy || "not set";
  console.log(`\nTransforming chapters for "${slug}"...`);
  if (research) console.log(`  Research: ${research.industry_data.length} claims, ${research.common_patterns.length} patterns`);
  if (context) console.log(`  Context: code_policy=${codePolicy}`);
  if (pipelineConfig.llm) console.log(`  LLM: ${pipelineConfig.llm.name}/${pipelineConfig.llm.model}`);
  else console.log(`  LLM: none (template fallback)`);
  console.log();

  // Find .plan.yml files
  const planFiles = readdirSync(chaptersDir)
    .filter((f) => f.endsWith(".plan.yml"))
    .filter((f) => !chapterId || f.startsWith(chapterId));

  if (planFiles.length === 0) {
    console.error(`No .plan.yml files found${chapterId ? ` for "${chapterId}"` : ""}.`);
    console.error(`Run first: make plan ebook=${slug}`);
    process.exit(1);
  }

  // ── Parallel chapter transformation (2 concurrent — heavier than planning) ──
  const CONCURRENCY = 2;

  async function transformOne(planFile: string) {
    const planPath = join(chaptersDir, planFile);
    const qmdFile = planFile.replace(".plan.yml", ".qmd");
    const qmdPath = join(chaptersDir, qmdFile);

    let content = await transformChapter(slug, planPath, research, context, outline, pipelineConfig);
    content = fixUnclosedCodeFences(content);

    // GLOBAL CONTENT WRITING POLICY — Final validation
    const finalViolations = detectPlaceholderContent(content);
    if (finalViolations.length > 0) {
      console.error(`  [CONTENT POLICY] ${qmdFile} has ${finalViolations.length} placeholder violation(s):`);
      for (const v of finalViolations) {
        console.error(`    ✗ ${v}`);
      }
    }

    writeFileSync(qmdPath, content);

    // Count stats
    const wordCount = content.split(/\s+/).length;
    const d2Count = (content.match(/```\{\.d2/g) || []).length;
    const ojsCount = (content.match(/```\{ojs/g) || []).length;
    const configCount = (content.match(/```yaml/g) || []).length;
    const tableCount = (content.match(/^\|.*\|.*\|/gm) || []).length;

    console.log(`  ✓ ${qmdFile}: ~${wordCount} words, ${configCount} configs, ${d2Count} d2, ${ojsCount} ojs`);
  }

  // Process in batches of CONCURRENCY
  for (let i = 0; i < planFiles.length; i += CONCURRENCY) {
    const batch = planFiles.slice(i, i + CONCURRENCY);
    console.log(`  Writing batch ${Math.floor(i / CONCURRENCY) + 1}/${Math.ceil(planFiles.length / CONCURRENCY)} (${batch.map(f => f.replace(".plan.yml", "")).join(", ")})...`);
    await Promise.all(batch.map(f => transformOne(f)));
  }

  // Print cost summary
  const cost = pipelineConfig.costTracker.summary();
  if (cost.totalCalls > 0) {
    console.log(`  API usage: ${cost.totalCalls} calls, ~${cost.totalTokens} tokens, ~$${cost.estimatedCostUsd}`);
  }

  console.log(`Next: Review .qmd files, then run: make audit ebook=${slug}`);
}

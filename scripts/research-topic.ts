#!/usr/bin/env bun
/**
 * Stage 0: Topic Research.
 * Reads topic.yml and context.yml, researches the topic via web search,
 * and structures findings into research.yml.
 *
 * The research data is used by subsequent pipeline stages to generate
 * grounded, citation-backed content instead of fabricated stories.
 *
 * Usage:
 *   bun run scripts/research-topic.ts <slug>
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { parse, stringify } from "yaml";
import type {
  TopicConfig,
  ContextConfig,
  ResearchData,
  ResearchClaim,
  ResearchPattern,
  ResearchConfigExample,
} from "./pipeline-types.js";
import { loadPipelineConfig, type PipelineConfig } from "./provider-config.js";
import { researchStructuringPrompt, searchQueriesForTopic } from "./prompt-templates.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── File loading ────────────────────────────────────────────────────────────

function loadTopic(slug: string): TopicConfig {
  const topicPath = join(PROJECT_ROOT, "books", slug, "topic.yml");
  if (!existsSync(topicPath)) {
    throw new Error(`Topic config not found: books/${slug}/topic.yml`);
  }
  return parse(readFileSync(topicPath, "utf-8")) as TopicConfig;
}

function loadContext(slug: string): ContextConfig | null {
  const contextPath = join(PROJECT_ROOT, "books", slug, "context.yml");
  if (!existsSync(contextPath)) return null;
  return parse(readFileSync(contextPath, "utf-8")) as ContextConfig;
}

function loadBrandProducts(): Array<{ id: string; name: string; description: string }> {
  const brandPath = join(PROJECT_ROOT, "_brand", "_brand-extended.yml");
  if (!existsSync(brandPath)) return [];
  const brand = parse(readFileSync(brandPath, "utf-8"));
  return brand?.products || [];
}

// ── Research data builder ───────────────────────────────────────────────────

/**
 * Builds research.yml from topic + context + brand data.
 *
 * This function generates structured research data that the pipeline
 * can use to create grounded content. It includes:
 * - Industry claims with source attributions
 * - Common optimization/implementation patterns
 * - Config examples the chapters should include
 * - Tooling landscape for context
 *
 * NOTE: In a production system, this would call web search APIs.
 * Currently, it uses curated knowledge bases per topic domain.
 */
function buildResearch(
  topic: TopicConfig,
  context: ContextConfig | null,
  products: Array<{ id: string; name: string; description: string }>,
): ResearchData {
  const topicLower = topic.topic.toLowerCase();

  // Determine the research domain
  const isKubernetes = topicLower.includes("kubernetes") || topicLower.includes("k8s");
  const isFinOps = topicLower.includes("finops") || topicLower.includes("cost optimization") || topicLower.includes("cloud cost");
  const isInfra = topicLower.includes("infrastructure") || topicLower.includes("terraform") || topicLower.includes("cloud");

  const industry_data: ResearchClaim[] = [];
  const common_patterns: ResearchPattern[] = [];
  const key_configs: ResearchConfigExample[] = [];
  const tooling_landscape: Array<{ name: string; category: string; description?: string }> = [];

  // ── Kubernetes-specific research ──────────────────────────────────────
  if (isKubernetes) {
    industry_data.push(
      {
        claim: "Organizations typically find 20-35% of Kubernetes resources are overprovisioned based on actual usage patterns",
        source: "CNCF FinOps for Kubernetes Survey 2024",
        url: "https://www.cncf.io/reports/",
      },
      {
        claim: "The average Kubernetes cluster runs at 11-18% CPU utilization, with most waste coming from overprovisioned resource requests",
        source: "Datadog Container Report 2024",
        url: "https://www.datadoghq.com/container-report/",
      },
      {
        claim: "65% of organizations lack pod-level cost attribution, making it impossible to identify which workloads drive spend",
        source: "Flexera State of the Cloud Report 2024",
        url: "https://www.flexera.com/blog/cloud/cloud-computing-trends/",
      },
      {
        claim: "Kubernetes adoption continues to grow, with 84% of organizations running containers in production, yet cost management remains the top operational challenge",
        source: "CNCF Annual Survey 2024",
        url: "https://www.cncf.io/reports/cncf-annual-survey-2024/",
      },
      {
        claim: "Organizations implementing FinOps practices for Kubernetes report an average 28% reduction in container-related cloud spend",
        source: "FinOps Foundation State of FinOps 2024",
        url: "https://www.finops.org/insights/state-of-finops/",
      },
      {
        claim: "Spot instances can reduce compute costs by 60-90% for fault-tolerant workloads, with modern orchestrators handling interruptions gracefully",
        source: "AWS Spot Instance Advisor / GCP Preemptible VM Documentation",
      },
    );

    common_patterns.push(
      {
        name: "VPA Right-Sizing",
        description: "Vertical Pod Autoscaler monitors actual pod resource usage over time and recommends request/limit adjustments. Best deployed in recommendation mode first, then graduated to auto after 2-4 weeks of stable data.",
        typical_savings: "20-40% on compute costs",
        implementation_effort: "1-2 weeks (recommendation mode), +2 weeks (auto mode)",
        risk: "Low — recommendation mode has zero production impact",
      },
      {
        name: "Spot/Preemptible Nodes",
        description: "Use discounted interruptible instances for fault-tolerant workloads like batch jobs, CI/CD, and stateless services. Diversify across instance types to reduce interruption frequency.",
        typical_savings: "60-90% on eligible workloads (typically 40-70% of fleet)",
        implementation_effort: "3-5 days for initial setup, ongoing monitoring",
        risk: "Medium — requires proper pod disruption budgets and graceful termination handling",
        eligibility: "Batch/ML training, CI/CD runners, stateless APIs with multiple replicas",
      },
      {
        name: "Namespace Cost Boundaries",
        description: "Use ResourceQuotas to cap namespace-level resource consumption and LimitRanges to set default requests for pods. This improves bin-packing efficiency and enables cost attribution per team.",
        typical_savings: "15-25% from improved bin-packing",
        implementation_effort: "1-2 days for initial rollout",
        risk: "Low — LimitRanges add defaults without disrupting existing workloads",
      },
      {
        name: "HPA Cost-Aware Autoscaling",
        description: "Horizontal Pod Autoscaler scales replica count based on CPU/memory utilization or custom metrics. Replace fixed replica counts with demand-driven scaling to avoid paying for idle capacity.",
        typical_savings: "10-30% on workloads with variable traffic patterns",
        implementation_effort: "2-3 days per workload",
        risk: "Low-Medium — requires load testing to validate scaling thresholds",
      },
      {
        name: "Node Auto-Provisioning",
        description: "Use cluster autoscaler or Karpenter to automatically provision right-sized nodes based on pending pod requirements, instead of maintaining a fixed pool of oversized nodes.",
        typical_savings: "15-30% on node costs",
        implementation_effort: "1 week for initial setup",
        risk: "Medium — cold-start latency for new nodes",
      },
    );

    key_configs.push(
      {
        name: "ResourceQuota",
        type: "yaml",
        description: "Caps total resource consumption per namespace, preventing any single team from consuming unbounded cluster capacity",
        example_lines: 15,
      },
      {
        name: "LimitRange",
        type: "yaml",
        description: "Sets default resource requests and limits for pods that don't specify them, ensuring the scheduler can make informed placement decisions",
        example_lines: 20,
      },
      {
        name: "VerticalPodAutoscaler",
        type: "yaml",
        description: "Configures VPA in recommendation mode to analyze pod resource usage and suggest right-sized requests",
        example_lines: 20,
      },
      {
        name: "HorizontalPodAutoscaler",
        type: "yaml",
        description: "Configures HPA with CPU/memory targets for demand-driven scaling",
        example_lines: 15,
      },
      {
        name: "PodDisruptionBudget",
        type: "yaml",
        description: "Ensures minimum availability during node drains and spot interruptions",
        example_lines: 10,
      },
    );

    tooling_landscape.push(
      { name: "Kubecost", category: "cost visibility", description: "Real-time cost monitoring and allocation per namespace, deployment, and pod" },
      { name: "OpenCost", category: "cost allocation", description: "CNCF project for Kubernetes cost monitoring — open-source alternative to Kubecost" },
      { name: "VPA (Vertical Pod Autoscaler)", category: "right-sizing", description: "Official Kubernetes autoscaler for adjusting pod resource requests" },
      { name: "Karpenter", category: "node provisioning", description: "Just-in-time node provisioning that selects optimal instance types for pending pods" },
      { name: "Goldilocks", category: "right-sizing", description: "Dashboard for VPA recommendations across all namespaces" },
      { name: "CAST AI", category: "cost optimization", description: "Automated Kubernetes cost optimization with spot instance management" },
    );
  }

  // ── FinOps-specific research ──────────────────────────────────────────
  if (isFinOps && !isKubernetes) {
    industry_data.push(
      {
        claim: "Organizations waste an average of 32% of their cloud spend, according to industry benchmarks",
        source: "Flexera State of the Cloud Report 2024",
        url: "https://www.flexera.com/blog/cloud/cloud-computing-trends/",
      },
      {
        claim: "Only 30% of organizations have a mature FinOps practice; the majority are still in the crawl or walk phase",
        source: "FinOps Foundation State of FinOps 2024",
        url: "https://www.finops.org/insights/state-of-finops/",
      },
    );
  }

  // ── Product tie-in from context ───────────────────────────────────────
  // If the user provided product relevance, include it in research
  if (context?.product_relevance) {
    const product = products.find((p) => p.id === context.product_relevance!.product);
    if (product) {
      tooling_landscape.push({
        name: product.name,
        category: "cost optimization platform",
        description: context.product_relevance.how_it_helps,
      });
    }
  }

  // ── Customer stories from context ─────────────────────────────────────
  if (context?.customer_stories) {
    for (const story of context.customer_stories) {
      industry_data.push({
        claim: `A ${story.industry} organization with ${story.cluster_size || "production"} clusters reduced spend from ${story.before} to ${story.after} in ${story.timeline}`,
        source: "Customer case study (anonymized)",
      });
    }
  }

  return {
    generated_at: new Date().toISOString().split("T")[0],
    topic: topic.topic,
    industry_data,
    common_patterns,
    key_configs,
    tooling_landscape,
  };
}

// ── LLM-powered research ────────────────────────────────────────────────────

async function buildResearchWithLLM(
  topic: TopicConfig,
  context: ContextConfig | null,
  products: Array<{ id: string; name: string; description: string }>,
  pipelineConfig: PipelineConfig,
): Promise<ResearchData> {
  const llm = pipelineConfig.llm!;
  const search = pipelineConfig.search;

  // Step 1: Run search queries
  const queries = searchQueriesForTopic(topic);
  let allResults: import("./providers/search.js").SearchResult[] = [];

  if (search) {
    console.log(`  Searching with ${search.name}...`);
    for (const query of queries) {
      try {
        const results = await search.search({ query, maxResults: 8, searchDepth: "advanced" });
        allResults.push(...results);
        console.log(`    "${query.slice(0, 60)}..." → ${results.length} results`);
      } catch (err) {
        console.warn(`    Search failed for "${query.slice(0, 40)}...": ${(err as Error).message}`);
      }
    }
  } else {
    console.log(`  No search provider — using LLM knowledge only`);
  }

  // Step 2: Structure results with LLM
  console.log(`  Structuring research with ${llm.name}/${llm.model}...`);
  const messages = researchStructuringPrompt(topic, allResults, context);

  const startTime = Date.now();
  const research = await llm.completeJSON<ResearchData>({
    messages,
    temperature: 0.3, // Lower temperature for factual structuring
    maxTokens: 4096,
  });
  const durationMs = Date.now() - startTime;

  pipelineConfig.costTracker.addCall({
    stage: "research",
    provider: llm.name,
    model: llm.model,
    promptTokens: 0, // completeJSON doesn't expose usage easily
    completionTokens: 0,
    durationMs,
  });

  // Fill in defaults
  research.generated_at = new Date().toISOString().split("T")[0];
  research.topic = topic.topic;

  // Append product/customer data from context (same as template path)
  if (context?.product_relevance) {
    const product = products.find((p) => p.id === context.product_relevance!.product);
    if (product) {
      research.tooling_landscape = research.tooling_landscape || [];
      research.tooling_landscape.push({
        name: product.name,
        category: "cost optimization platform",
        description: context.product_relevance.how_it_helps,
      });
    }
  }

  if (context?.customer_stories) {
    research.industry_data = research.industry_data || [];
    for (const story of context.customer_stories) {
      research.industry_data.push({
        claim: `A ${story.industry} organization with ${story.cluster_size || "production"} clusters reduced spend from ${story.before} to ${story.after} in ${story.timeline}`,
        source: "Customer case study (anonymized)",
      });
    }
  }

  return research;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const slug = process.argv[2];

  if (!slug) {
    console.error("Usage: bun run scripts/research-topic.ts <slug>");
    process.exit(1);
  }

  const topic = loadTopic(slug);
  const context = loadContext(slug);
  const products = loadBrandProducts();

  // Load pipeline config
  const pipelineConfig = loadPipelineConfig(PROJECT_ROOT, slug);

  console.log(`\nResearching "${topic.topic}" for "${slug}"...`);
  if (context) {
    console.log(`  Context: loaded (code_policy: ${context.editorial_direction?.code_policy || "not set"})`);
  } else {
    console.log(`  Context: none (create books/${slug}/context.yml for product tie-ins)`);
  }

  let research: ResearchData;
  if (pipelineConfig.llm) {
    research = await buildResearchWithLLM(topic, context, products, pipelineConfig);
  } else {
    research = buildResearch(topic, context, products);
  }

  const researchPath = join(PROJECT_ROOT, "books", slug, "research.yml");
  const yamlOutput = stringify(research, { lineWidth: 120 });
  writeFileSync(researchPath, `# Research Data — generated by research-topic.ts\n# Review and edit before running: make outline ebook=${slug}\n\n${yamlOutput}`);

  console.log(`\n  Output: ${researchPath}`);
  console.log(`  Industry claims: ${research.industry_data.length}`);
  console.log(`  Common patterns: ${research.common_patterns.length}`);
  console.log(`  Config examples: ${research.key_configs.length}`);
  console.log(`  Tooling entries: ${research.tooling_landscape.length}`);

  const cost = pipelineConfig.costTracker.summary();
  if (cost.totalCalls > 0) {
    console.log(`  API usage: ${cost.totalCalls} calls, ~${cost.totalTokens} tokens, ~$${cost.estimatedCostUsd}`);
  }

  console.log(`\nNext: Review research.yml, then run: make outline ebook=${slug}`);
}

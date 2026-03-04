/**
 * Provider Configuration Resolver.
 *
 * Resolution order: topic.yml `pipeline` section → env vars → mock fallback.
 * Also provides a CostTracker for monitoring API usage across pipeline stages.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import type { LLMProvider } from "./providers/llm.js";
import { OpenAICompatibleProvider } from "./providers/llm-openai.js";
import { AnthropicProvider } from "./providers/llm-anthropic.js";
import { GoogleProvider } from "./providers/llm-google.js";
import { MockLLMProvider } from "./providers/llm-mock.js";
import type { SearchProvider } from "./providers/search.js";
import { MultiSearchProvider } from "./providers/search.js";
import { TavilySearchProvider } from "./providers/search-tavily.js";
import { SerpAPISearchProvider } from "./providers/search-serpapi.js";
import { BraveSearchProvider } from "./providers/search-brave.js";
import { MockSearchProvider } from "./providers/search-mock.js";
import type { ImageProvider } from "./providers/image.js";
import { BananaProProvider } from "./providers/image-banana.js";
import { OpenAIImageProvider } from "./providers/image-openai.js";
import { MockImageProvider } from "./providers/image-mock.js";
import { FailoverLLMProvider } from "./provider-failover.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface PipelineYamlConfig {
  llm?: {
    provider?: string;
    model?: string;
    base_url?: string;
    temperature?: number;
    supports_json_mode?: boolean;
  };
  failover?: Array<{
    provider: string;
    model?: string;
    base_url?: string;
    api_key_env?: string;
    supports_json_mode?: boolean;
  }>;
  search?: {
    providers?: string[];
    depth?: "basic" | "advanced";
  };
  images?: {
    provider?: string;
    model_id?: string;
    hero_images?: boolean;
    inline_images?: boolean;
    style?: "conceptual" | "diagram" | "infographic" | "illustration";
  };
  mode?: "full" | "mock";
}

export interface CostEntry {
  stage: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
}

export interface CostTracker {
  calls: CostEntry[];
  addCall(entry: CostEntry): void;
  summary(): { totalCalls: number; totalTokens: number; estimatedCostUsd: number };
}

export interface PipelineConfig {
  llm: LLMProvider | null;
  search: SearchProvider | null;
  image: ImageProvider | null;
  imageConfig: {
    heroImages: boolean;
    inlineImages: boolean;
    style: "conceptual" | "diagram" | "infographic" | "illustration";
  };
  mode: "full" | "mock";
  costTracker: CostTracker;
}

// ── Cost Tracker ────────────────────────────────────────────────────────────

function createCostTracker(): CostTracker {
  const calls: CostEntry[] = [];

  return {
    calls,
    addCall(entry: CostEntry) {
      calls.push(entry);
    },
    summary() {
      const totalTokens = calls.reduce((sum, c) => sum + c.promptTokens + c.completionTokens, 0);
      // Rough estimate: $0.003 per 1K tokens (averaged across models)
      const estimatedCostUsd = (totalTokens / 1000) * 0.003;
      return {
        totalCalls: calls.length,
        totalTokens,
        estimatedCostUsd: Math.round(estimatedCostUsd * 100) / 100,
      };
    },
  };
}

// ── Env Helpers ─────────────────────────────────────────────────────────────

function env(key: string): string | undefined {
  return process.env[key];
}

// ── LLM Provider Resolution ────────────────────────────────────────────────

function resolveLLMProvider(yaml?: PipelineYamlConfig["llm"]): LLMProvider | null {
  const provider = yaml?.provider || env("LLM_PROVIDER");
  const model = yaml?.model || env("LLM_MODEL");
  const baseUrl = yaml?.base_url || env("LLM_BASE_URL");

  if (provider === "anthropic" || (!provider && env("ANTHROPIC_API_KEY"))) {
    const apiKey = env("ANTHROPIC_API_KEY");
    if (!apiKey) return null;
    return new AnthropicProvider({
      apiKey,
      model: model || "claude-sonnet-4-20250514",
    });
  }

  if (provider === "google" || (!provider && env("GOOGLE_API_KEY") && !env("OPENAI_API_KEY"))) {
    const apiKey = env("GOOGLE_API_KEY");
    if (!apiKey) return null;
    return new GoogleProvider({
      apiKey,
      model: model || "gemini-2.0-flash",
    });
  }

  if (provider === "openai" || provider === "openai-compatible" || (!provider && env("OPENAI_API_KEY"))) {
    const apiKey = env("OPENAI_API_KEY");
    if (!apiKey) return null;
    return new OpenAICompatibleProvider({
      apiKey,
      model: model || "gpt-4o",
      baseUrl: baseUrl || undefined,
      supportsJsonMode: yaml?.supports_json_mode ?? true,
      name: provider === "openai-compatible" ? "openai-compatible" : "openai",
    });
  }

  // Named provider with custom base URL (Kimi, Minimax, DeepSeek, etc.)
  if (provider && baseUrl) {
    const apiKey = env("OPENAI_API_KEY") || env("LLM_API_KEY");
    if (!apiKey) return null;
    return new OpenAICompatibleProvider({
      apiKey,
      model: model || "default",
      baseUrl,
      supportsJsonMode: yaml?.supports_json_mode ?? false,
      name: provider,
    });
  }

  return null;
}

// ── Search Provider Resolution ──────────────────────────────────────────────

function resolveSearchProvider(yaml?: PipelineYamlConfig["search"]): SearchProvider | null {
  const providerNames = yaml?.providers || [env("SEARCH_PROVIDER")].filter(Boolean) as string[];

  const providers: SearchProvider[] = [];

  for (const name of providerNames) {
    if (name === "tavily" && env("TAVILY_API_KEY")) {
      providers.push(new TavilySearchProvider(env("TAVILY_API_KEY")!));
    } else if (name === "serpapi" && env("SERPAPI_API_KEY")) {
      providers.push(new SerpAPISearchProvider(env("SERPAPI_API_KEY")!));
    } else if (name === "brave" && env("BRAVE_SEARCH_API_KEY")) {
      providers.push(new BraveSearchProvider(env("BRAVE_SEARCH_API_KEY")!));
    }
  }

  // If no specific providers requested, try all available
  if (providers.length === 0 && providerNames.length === 0) {
    if (env("TAVILY_API_KEY")) providers.push(new TavilySearchProvider(env("TAVILY_API_KEY")!));
    if (env("SERPAPI_API_KEY")) providers.push(new SerpAPISearchProvider(env("SERPAPI_API_KEY")!));
    if (env("BRAVE_SEARCH_API_KEY")) providers.push(new BraveSearchProvider(env("BRAVE_SEARCH_API_KEY")!));
  }

  if (providers.length === 0) return null;
  if (providers.length === 1) return providers[0];
  return new MultiSearchProvider(providers);
}

// ── Image Provider Resolution ───────────────────────────────────────────────

function resolveImageProvider(yaml?: PipelineYamlConfig["images"]): ImageProvider | null {
  const provider = yaml?.provider || env("IMAGE_PROVIDER");

  if (provider === "banana" || (!provider && env("BANANA_API_KEY"))) {
    const apiKey = env("BANANA_API_KEY");
    if (!apiKey) return null;
    return new BananaProProvider({
      apiKey,
      modelId: yaml?.model_id,
    });
  }

  if (provider === "openai" || provider === "dalle" || (!provider && env("OPENAI_API_KEY") && env("IMAGE_PROVIDER") === "openai")) {
    const apiKey = env("OPENAI_API_KEY");
    if (!apiKey) return null;
    return new OpenAIImageProvider({
      apiKey,
      model: yaml?.model_id || "dall-e-3",
    });
  }

  return null;
}

// ── Main Config Loader ──────────────────────────────────────────────────────

/**
 * Loads pipeline configuration from topic.yml + env vars.
 * Falls back to mock providers when mode is "mock" or no API keys are found.
 */
export function loadPipelineConfig(rootDir: string, slug: string): PipelineConfig {
  // Load topic.yml pipeline section if present
  let yamlConfig: PipelineYamlConfig = {};
  const topicPath = join(rootDir, "books", slug, "topic.yml");
  if (existsSync(topicPath)) {
    const topicData = parse(readFileSync(topicPath, "utf-8")) as { pipeline?: PipelineYamlConfig };
    yamlConfig = topicData.pipeline || {};
  }

  const mode = yamlConfig.mode || (env("PIPELINE_MODE") as "full" | "mock") || "full";
  const costTracker = createCostTracker();

  // Mock mode: return mock providers
  if (mode === "mock") {
    console.log("  [config] Pipeline mode: mock (no API calls)");
    return {
      llm: new MockLLMProvider(),
      search: new MockSearchProvider(),
      image: new MockImageProvider(),
      imageConfig: {
        heroImages: yamlConfig.images?.hero_images ?? false,
        inlineImages: yamlConfig.images?.inline_images ?? false,
        style: yamlConfig.images?.style ?? "conceptual",
      },
      mode: "mock",
      costTracker,
    };
  }

  // Full mode: resolve real providers, fallback to null
  let llm = resolveLLMProvider(yamlConfig.llm);
  const search = resolveSearchProvider(yamlConfig.search);
  const image = resolveImageProvider(yamlConfig.images);

  // Wrap in failover if configured
  if (llm && yamlConfig.failover && yamlConfig.failover.length > 0) {
    const failoverProviders: LLMProvider[] = [llm]; // primary first
    for (const fo of yamlConfig.failover) {
      const apiKey = fo.api_key_env ? env(fo.api_key_env) : env("OPENAI_API_KEY");
      if (!apiKey) continue;
      const foProvider = new OpenAICompatibleProvider({
        apiKey,
        model: fo.model || "gpt-4o",
        baseUrl: fo.base_url || undefined,
        supportsJsonMode: fo.supports_json_mode ?? true,
        name: fo.provider,
      });
      failoverProviders.push(foProvider);
    }
    if (failoverProviders.length > 1) {
      llm = new FailoverLLMProvider(failoverProviders);
      console.log(`  [config] Failover: ${failoverProviders.map(p => p.name).join(" → ")}`);
    }
  }

  if (llm) console.log(`  [config] LLM: ${llm.name}/${llm.model}`);
  else console.log("  [config] LLM: none (will use template fallback)");

  if (search) console.log(`  [config] Search: ${search.name}`);
  else console.log("  [config] Search: none (will use hardcoded research)");

  if (image) console.log(`  [config] Image: ${image.name}`);
  else console.log("  [config] Image: none (will skip image generation)");

  return {
    llm,
    search,
    image,
    imageConfig: {
      heroImages: yamlConfig.images?.hero_images ?? true,
      inlineImages: yamlConfig.images?.inline_images ?? true,
      style: yamlConfig.images?.style ?? "conceptual",
    },
    mode,
    costTracker,
  };
}

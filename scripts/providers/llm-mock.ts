/**
 * Mock LLM Provider.
 * Returns deterministic output for testing the pipeline without API calls.
 */

import {
  BaseLLMProvider,
  type LLMCompletionOptions,
  type LLMCompletionResult,
} from "./llm.js";

export class MockLLMProvider extends BaseLLMProvider {
  readonly name = "mock";
  readonly model = "mock-v1";

  constructor() {
    super(true);
  }

  async complete(options: LLMCompletionOptions): Promise<LLMCompletionResult> {
    const content = options.responseFormat === "json"
      ? this.generateMockJSON(options)
      : this.generateMockProse(options);

    return {
      content,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: "mock-v1",
      finishReason: "stop",
    };
  }

  private generateMockProse(options: LLMCompletionOptions): string {
    const userMsg = options.messages.find((m) => m.role === "user")?.content || "";
    const sysMsg = options.messages.find((m) => m.role === "system")?.content || "";

    // Extract section heading if present
    const sectionMatch = userMsg.match(/Section:\s*"([^"]+)"/);
    const chapterMatch = userMsg.match(/Chapter:\s*"([^"]+)"/);
    const section = sectionMatch?.[1] || "this topic";
    const chapter = chapterMatch?.[1] || "this chapter";

    // Generate realistic-length mock prose
    return [
      `[MOCK CONTENT] This section covers ${section} within the context of ${chapter}.`,
      ``,
      `Organizations operating Kubernetes clusters at scale frequently encounter resource allocation challenges that directly impact infrastructure costs. Studies consistently show that a significant portion of provisioned resources remain underutilized, creating a gap between what teams request and what workloads actually consume.`,
      ``,
      `The root causes are well-documented: development teams default to generous resource requests to avoid performance issues, initial sizing estimates rarely account for actual production patterns, and most organizations lack the observability tooling needed to correlate resource consumption with specific workloads.`,
      ``,
      `Understanding these dynamics is the first step toward building a systematic cost optimization practice — one that balances reliability requirements with efficient resource utilization.`,
    ].join("\n");
  }

  private generateMockJSON(options: LLMCompletionOptions): string {
    const sysMsg = options.messages.find((m) => m.role === "system")?.content || "";

    // Detect which schema is expected from the system prompt
    if (sysMsg.includes("ResearchData") || sysMsg.includes("industry_data")) {
      return JSON.stringify({
        generated_at: new Date().toISOString(),
        topic: "Mock Topic",
        industry_data: [
          { claim: "[MOCK] 35% of cloud resources are overprovisioned", source: "Mock Report 2025", url: "https://example.com/mock" },
        ],
        common_patterns: [
          { name: "Right-Sizing", description: "Match resource requests to actual usage", typical_savings: "20-40%", implementation_effort: "Low", risk: "Low" },
        ],
        key_configs: [],
        tooling_landscape: [],
      });
    }

    if (sysMsg.includes("BookOutline") || sysMsg.includes("narrative_arc")) {
      return JSON.stringify({
        title: "[MOCK] Cost Optimization Guide",
        subtitle: "A practical guide to reducing cloud waste",
        narrative_arc: "Problem → Understanding → Solutions",
        target_word_count: "3600-4500",
        chapters: [
          { id: "01-the-cost-problem", title: "[MOCK] The Cost Problem", role: "intro", difficulty: "beginner", summary: "Why costs spiral out of control", builds_on: [], sets_up: ["02-understanding-costs"], key_concepts: ["cost visibility", "resource waste"], suggested_tags: ["introduction", "overview"] },
          { id: "02-understanding-costs", title: "[MOCK] Understanding Cost Drivers", role: "foundation", difficulty: "intermediate", summary: "How costs flow through infrastructure", builds_on: ["01-the-cost-problem"], sets_up: ["03-optimization-strategies"], key_concepts: ["cost attribution", "resource allocation"], suggested_tags: ["cost-model", "fundamentals"] },
          { id: "03-optimization-strategies", title: "[MOCK] Optimization Strategies", role: "technique", difficulty: "advanced", summary: "Production-tested optimization techniques", builds_on: ["02-understanding-costs"], sets_up: [], key_concepts: ["right-sizing", "autoscaling"], suggested_tags: ["optimization", "automation"] },
        ],
      });
    }

    if (sysMsg.includes("content strategist") || sysMsg.includes("section plan")) {
      return JSON.stringify({
        sections: [
          { id: "opening", heading: "The Challenge", word_target: 300, visual: null, notes: "[MOCK] Open with industry context." },
          { id: "background", heading: "Root Causes", word_target: 300, visual: { type: "d2", template: "cloud-architecture", purpose: "Architecture overview" }, notes: "[MOCK] Explain root causes." },
          { id: "config_example", heading: "Configuration", word_target: 200, visual: { type: "code", language: "yaml", purpose: "Config example" }, notes: "[MOCK] Show config example." },
          { id: "summary", heading: "Summary", word_target: 150, visual: null, notes: "[MOCK] Key takeaways." },
        ],
      });
    }

    // Generic fallback
    return JSON.stringify({ mock: true, message: "Mock JSON response" });
  }
}

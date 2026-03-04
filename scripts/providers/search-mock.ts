/**
 * Mock Search Provider.
 * Returns deterministic results for testing without API calls.
 */

import type { SearchProvider, SearchOptions, SearchResult } from "./search.js";

export class MockSearchProvider implements SearchProvider {
  readonly name = "mock";

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const topic = options.query.split(" ").slice(0, 3).join(" ");
    return [
      {
        title: `[MOCK] ${topic} - Industry Benchmark Report 2025`,
        url: "https://example.com/mock-report-1",
        snippet: `[MOCK] Comprehensive analysis of ${topic}. Organizations report 20-40% cost reduction through systematic optimization practices.`,
        score: 0.95,
        publishedDate: "2025-01-15",
      },
      {
        title: `[MOCK] ${topic} - Best Practices Guide`,
        url: "https://example.com/mock-report-2",
        snippet: `[MOCK] Expert guide covering ${topic} patterns, tools, and real-world implementation strategies.`,
        score: 0.88,
        publishedDate: "2025-03-01",
      },
      {
        title: `[MOCK] ${topic} - Tool Comparison`,
        url: "https://example.com/mock-report-3",
        snippet: `[MOCK] Comparison of leading tools for ${topic} including open-source and commercial options.`,
        score: 0.82,
        publishedDate: "2024-12-10",
      },
    ];
  }
}

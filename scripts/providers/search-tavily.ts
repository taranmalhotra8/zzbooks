/**
 * Tavily Search Provider.
 * Purpose-built for AI agents — returns clean, structured results.
 */

import type { SearchProvider, SearchOptions, SearchResult } from "./search.js";

export class TavilySearchProvider implements SearchProvider {
  readonly name = "tavily";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const body: Record<string, unknown> = {
      query: options.query,
      max_results: options.maxResults ?? 10,
      search_depth: options.searchDepth ?? "advanced",
      include_answer: false,
    };

    if (options.includeDomains?.length) {
      body.include_domains = options.includeDomains;
    }
    if (options.excludeDomains?.length) {
      body.exclude_domains = options.excludeDomains;
    }
    if (options.topic) {
      body.topic = options.topic;
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ api_key: this.apiKey, ...body }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Tavily API error ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      results: Array<{
        title: string;
        url: string;
        content: string;
        score: number;
        published_date?: string;
      }>;
    };

    return (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      score: r.score,
      publishedDate: r.published_date,
    }));
  }
}

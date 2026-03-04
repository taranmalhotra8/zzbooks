/**
 * Brave Search Provider.
 * Privacy-focused search with clean API results.
 */

import type { SearchProvider, SearchOptions, SearchResult } from "./search.js";

export class BraveSearchProvider implements SearchProvider {
  readonly name = "brave";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: options.query,
      count: String(options.maxResults ?? 10),
    });

    if (options.topic === "news") {
      params.set("freshness", "pw"); // past week for news
    }

    const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": this.apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brave Search error ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      web?: {
        results: Array<{
          title: string;
          url: string;
          description: string;
          page_age?: string;
        }>;
      };
    };

    return (data.web?.results || []).map((r, i) => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      publishedDate: r.page_age,
      score: 1 - i * 0.05, // Position-based score
    }));
  }
}

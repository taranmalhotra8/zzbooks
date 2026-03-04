/**
 * SerpAPI Search Provider.
 * Google search results as structured JSON.
 */

import type { SearchProvider, SearchOptions, SearchResult } from "./search.js";

export class SerpAPISearchProvider implements SearchProvider {
  readonly name = "serpapi";
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: options.query,
      api_key: this.apiKey,
      engine: "google",
      num: String(options.maxResults ?? 10),
    });

    const response = await fetch(`https://serpapi.com/search.json?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SerpAPI error ${response.status}: ${errorText.slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      organic_results?: Array<{
        title: string;
        link: string;
        snippet: string;
        date?: string;
        position: number;
      }>;
    };

    return (data.organic_results || []).map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet,
      publishedDate: r.date,
      score: 1 - (r.position - 1) * 0.05, // Position-based score: #1 = 1.0, #2 = 0.95, etc.
    }));
  }
}

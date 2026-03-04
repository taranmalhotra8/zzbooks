/**
 * Search Provider Interface & Multi-Provider Aggregator.
 *
 * Supports Tavily, SerpAPI, and Brave Search.
 * MultiSearchProvider queries all configured providers in parallel and deduplicates.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  score?: number;
}

export interface SearchOptions {
  query: string;
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  includeDomains?: string[];
  excludeDomains?: string[];
  topic?: "general" | "news" | "research";
}

export interface SearchProviderConfig {
  provider: string;
  apiKey: string;
}

export interface SearchProvider {
  readonly name: string;
  search(options: SearchOptions): Promise<SearchResult[]>;
}

// ── Multi-Provider Aggregator ───────────────────────────────────────────────

export class MultiSearchProvider implements SearchProvider {
  readonly name = "multi";

  constructor(private providers: SearchProvider[]) {
    if (providers.length === 0) {
      throw new Error("MultiSearchProvider requires at least one provider");
    }
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const settled = await Promise.allSettled(
      this.providers.map((p) => p.search(options)),
    );

    const allResults: SearchResult[] = [];
    for (const result of settled) {
      if (result.status === "fulfilled") {
        allResults.push(...result.value);
      } else {
        console.warn(`  [search] Provider failed: ${result.reason}`);
      }
    }

    return deduplicateResults(allResults);
  }
}

function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Map<string, SearchResult>();

  for (const r of results) {
    // Normalize URL for dedup (strip trailing slash, query params)
    const key = r.url.replace(/\/$/, "").split("?")[0].toLowerCase();
    const existing = seen.get(key);
    if (!existing || (r.score ?? 0) > (existing.score ?? 0)) {
      seen.set(key, r);
    }
  }

  return Array.from(seen.values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

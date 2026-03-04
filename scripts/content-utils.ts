/**
 * Content loading & resolution utilities.
 * Handles enriched chapter metadata, author resolution, and reading time computation.
 *
 * Follows the same patterns as brand-utils.ts:
 *   - Explicit TypeScript types
 *   - Absolute paths
 *   - Existence checks before loading
 *   - Helpful error messages
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "yaml";

// ── Types ───────────────────────────────────────────────────────────────────

export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface EnrichedChapter {
  id: string;
  title: string;
  summary?: string;
  difficulty?: Difficulty;
  reading_time_minutes?: number;
  learning_objectives?: string[];
  key_takeaways?: string[];
  tags?: string[];
  prerequisites?: string[];
}

export interface AuthorRef {
  id: string;
  name: string;
  title?: string;
  bio?: string;
  avatar_url?: string;
  social?: Record<string, string>;
}

export interface EbookContentMeta {
  meta: {
    slug: string;
    title: string;
    subtitle?: string;
    version?: string;
    authors?: string[];
  };
  chapters?: EnrichedChapter[];
  social?: Record<string, unknown>;
}

// ── Loaders ─────────────────────────────────────────────────────────────────

/**
 * Loads ebook.yml with enriched types for a given ebook slug.
 * Returns null if the file does not exist.
 */
export function loadEbookContent(rootDir: string, slug: string): EbookContentMeta | null {
  const path = join(rootDir, "books", slug, "ebook.yml");
  if (!existsSync(path)) return null;

  try {
    return parse(readFileSync(path, "utf-8")) as EbookContentMeta;
  } catch (error) {
    throw new Error(
      `Failed to parse books/${slug}/ebook.yml: ${(error as Error).message}`
    );
  }
}

// ── Author Resolution ───────────────────────────────────────────────────────

/**
 * Resolves author ID references to full author profiles.
 * Filters the full author list to only those matching the given IDs.
 * Returns them in the same order as the ID list.
 */
export function resolveAuthors(
  authorIds: string[],
  authors: AuthorRef[]
): AuthorRef[] {
  const authorMap = new Map(authors.map((a) => [a.id, a]));
  const resolved: AuthorRef[] = [];

  for (const id of authorIds) {
    const author = authorMap.get(id);
    if (author) {
      resolved.push(author);
    }
  }

  return resolved;
}

// ── Reading Time ────────────────────────────────────────────────────────────

const WORDS_PER_MINUTE = 250;

/**
 * Counts words in a QMD file and returns estimated reading time in minutes.
 * Strips YAML front matter and Mermaid/code blocks before counting.
 * Returns 1 as minimum reading time.
 */
export function computeReadingTime(qmdPath: string): number {
  if (!existsSync(qmdPath)) return 0;

  let content = readFileSync(qmdPath, "utf-8");

  // Strip YAML front matter
  content = content.replace(/^---[\s\S]*?---/, "");

  // Strip fenced code blocks (``` ... ```)
  content = content.replace(/```[\s\S]*?```/g, "");

  // Strip Quarto callout blocks
  content = content.replace(/:::\s*\{[^}]*\}[\s\S]*?:::/g, "");

  // Count words
  const words = content.trim().split(/\s+/).filter((w) => w.length > 0);
  const minutes = Math.ceil(words.length / WORDS_PER_MINUTE);

  return Math.max(1, minutes);
}

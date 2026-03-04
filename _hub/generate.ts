#!/usr/bin/env bun
/**
 * Hub Page Generator.
 *
 * Generates a unified library page listing all ebooks with:
 *   - Card grid with title, topic, audience, tags
 *   - Client-side search and tag filtering
 *   - Responsive design (375px, 768px, 1280px)
 *   - OG metadata for social sharing
 *
 * Loads metadata from each ebook's topic.yml + outline.yml.
 * Output: _output/hub/index.html + styles.css
 *
 * Usage:
 *   bun run _hub/generate.ts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { parse } from "yaml";
import Mustache from "mustache";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ──────────────────────────────────────────────────────────────────

interface EbookCard {
  slug: string;
  title: string;
  topic: string;
  audience: string;
  chapter_count: number;
  tags: string;       // comma-separated for data attribute
  tag_list: string[]; // array for template iteration
  status: string;     // "ready" or "draft"
  html_url?: string;
  landing_url?: string;
}

// ── Ebook Discovery ────────────────────────────────────────────────────────

function discoverEbooks(): EbookCard[] {
  const booksDir = join(PROJECT_ROOT, "books");
  if (!existsSync(booksDir)) return [];

  const slugs = readdirSync(booksDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();

  const ebooks: EbookCard[] = [];

  for (const slug of slugs) {
    const topicPath = join(booksDir, slug, "topic.yml");
    if (!existsSync(topicPath)) continue;

    try {
      const topicData = parse(readFileSync(topicPath, "utf-8")) as Record<string, string>;

      // Count chapters from outline or plan files
      let chapterCount = parseInt(topicData.chapter_count || "0", 10);
      const chaptersDir = join(booksDir, slug, "chapters");
      if (existsSync(chaptersDir)) {
        const qmdFiles = readdirSync(chaptersDir).filter(f => f.endsWith(".qmd"));
        if (qmdFiles.length > 0) chapterCount = qmdFiles.length;
      }

      // Extract tags from outline or topic
      const tags: string[] = [];
      const outlinePath = join(booksDir, slug, "outline.yml");
      if (existsSync(outlinePath)) {
        const outlineData = parse(readFileSync(outlinePath, "utf-8")) as Record<string, unknown>;
        const outlineTags = (outlineData.suggested_tags as string[]) || [];
        tags.push(...outlineTags.slice(0, 5));
      }
      // Fallback: derive tags from topic
      if (tags.length === 0) {
        const topicWords = (topicData.topic || "").split(/\s+/);
        const keyTerms = topicWords.filter(w => w.length > 3 && !["and", "for", "the", "with"].includes(w.toLowerCase()));
        tags.push(...keyTerms.slice(0, 3));
      }

      // Determine status
      const hasQmd = existsSync(chaptersDir) && readdirSync(chaptersDir).some(f => f.endsWith(".qmd"));
      const status = hasQmd ? "ready" : "draft";

      // Check for rendered outputs
      const htmlBookDir = join(booksDir, slug, "_book");
      const htmlUrl = existsSync(join(htmlBookDir, "index.html")) ? `../books/${slug}/_book/index.html` : undefined;
      const landingDir = join(PROJECT_ROOT, "_output", "landing", slug);
      const landingUrl = existsSync(join(landingDir, "index.html")) ? `../landing/${slug}/index.html` : undefined;

      // Title from outline, ebook.yml, or topic
      let title = topicData.topic || slug;
      if (existsSync(outlinePath)) {
        const outlineData = parse(readFileSync(outlinePath, "utf-8")) as Record<string, string>;
        if (outlineData.title) title = outlineData.title;
      }
      const ebookYmlPath = join(booksDir, slug, "ebook.yml");
      if (existsSync(ebookYmlPath)) {
        try {
          const ebookData = parse(readFileSync(ebookYmlPath, "utf-8")) as Record<string, Record<string, string>>;
          if (ebookData.meta?.title) title = ebookData.meta.title;
        } catch { /* use existing title */ }
      }

      ebooks.push({
        slug,
        title,
        topic: topicData.topic || slug,
        audience: topicData.audience || "Engineering teams",
        chapter_count: chapterCount,
        tags: tags.join(","),
        tag_list: tags,
        status,
        html_url: htmlUrl,
        landing_url: landingUrl,
      });
    } catch (err) {
      console.warn(`  [hub] Warning: could not load metadata for ${slug}: ${(err as Error).message}`);
    }
  }

  return ebooks;
}

// ── Generation ─────────────────────────────────────────────────────────────

function generateHub(): void {
  const templatePath = join(SCRIPT_DIR, "template.html");
  const stylesPath = join(SCRIPT_DIR, "styles.css");

  if (!existsSync(templatePath)) {
    console.error("Hub template not found:", templatePath);
    process.exit(1);
  }

  const template = readFileSync(templatePath, "utf-8");
  const ebooks = discoverEbooks();

  if (ebooks.length === 0) {
    console.warn("  [hub] No ebooks found. Add ebooks to books/ directory.");
    return;
  }

  // Collect all unique tags
  const allTags = new Set<string>();
  for (const ebook of ebooks) {
    for (const tag of ebook.tag_list) {
      allTags.add(tag);
    }
  }

  // Load company name from brand
  let companyName = "Zopdev";
  const brandPath = join(PROJECT_ROOT, "_brand", "_brand-extended.yml");
  if (existsSync(brandPath)) {
    try {
      const brandData = parse(readFileSync(brandPath, "utf-8")) as Record<string, Record<string, string>>;
      companyName = brandData.company?.name || companyName;
    } catch { /* use default */ }
  }

  const data = {
    company_name: companyName,
    ebooks,
    tags: [...allTags].sort(),
    year: new Date().getFullYear(),
  };

  const html = Mustache.render(template, data);

  // Write output
  const outDir = join(PROJECT_ROOT, "_output", "hub");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "index.html"), html);
  if (existsSync(stylesPath)) {
    copyFileSync(stylesPath, join(outDir, "styles.css"));
  }

  const fileSizeKb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`  [hub] Generated: _output/hub/index.html (${fileSizeKb}KB, ${ebooks.length} ebooks)`);
}

// ── CLI ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  console.log("Generating hub page...");
  generateHub();
}

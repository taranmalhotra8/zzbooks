#!/usr/bin/env bun
/**
 * Home page generator.
 * Creates a Zopdev-branded home page at _output/index.html
 * with products listing and ebook cards linking to landing pages / PDF downloads.
 *
 * Usage:
 *   bun run _home/generate.ts
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { parse } from "yaml";
import Mustache from "mustache";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const ROOT_DIR = join(SCRIPT_DIR, "..");

// Load calendar
const calendarPath = join(ROOT_DIR, "calendar.yml");
if (!existsSync(calendarPath)) {
  console.error("Error: calendar.yml not found");
  process.exit(1);
}

const calendar = parse(readFileSync(calendarPath, "utf-8")) as {
  ebooks: Array<{
    slug: string;
    title: string;
    subtitle?: string;
    tags?: string[];
    status: string;
    outputs?: Record<string, boolean>;
  }>;
};

// Load brand
const brandExtPath = join(ROOT_DIR, "_brand", "_brand-extended.yml");
const brandExt = existsSync(brandExtPath)
  ? parse(readFileSync(brandExtPath, "utf-8"))
  : {};

const company = brandExt.company || { name: "Zopdev", tagline: "Cloud Engineering Excellence", website: "https://zopdev.com" };
const products = brandExt.products || [];

// Gradient palette for ebook cards
const gradients = [
  "linear-gradient(135deg, #0891b2, #0e7490)",
  "linear-gradient(135deg, #7c3aed, #4f46e5)",
  "linear-gradient(135deg, #059669, #047857)",
  "linear-gradient(135deg, #d97706, #b45309)",
  "linear-gradient(135deg, #dc2626, #b91c1c)",
  "linear-gradient(135deg, #2563eb, #1d4ed8)",
];

// Product accent colors
const accentColors: Record<string, string> = {
  "zopnight": "linear-gradient(90deg, #0891b2, #06b6d4)",
  "zopday": "linear-gradient(90deg, #7c3aed, #a855f7)",
  "zopcloud": "linear-gradient(90deg, #059669, #10b981)",
};

// Build ebook cards
const ebookCards = calendar.ebooks
  .filter(e => e.status !== "archived")
  .map((ebook, i) => {
    // Check for PDF
    const bookOutputDir = join(ROOT_DIR, "_output", "books", ebook.slug);
    let pdfUrl: string | null = null;
    let hasPdf = false;
    if (existsSync(bookOutputDir)) {
      const pdfFiles = readdirSync(bookOutputDir).filter(f => f.endsWith(".pdf"));
      if (pdfFiles.length > 0) {
        pdfUrl = `books/${ebook.slug}/${pdfFiles[0]}`;
        hasPdf = true;
      }
    }

    // Check for landing page
    const landingDir = join(ROOT_DIR, "_output", "landing", ebook.slug, "index.html");
    const hasLanding = existsSync(landingDir);
    const landingUrl = hasLanding ? `landing/${ebook.slug}/index.html` : null;

    // Count chapters
    const chaptersDir = join(ROOT_DIR, "books", ebook.slug, "chapters");
    let chapterCount = 0;
    if (existsSync(chaptersDir)) {
      chapterCount = readdirSync(chaptersDir).filter(f => f.endsWith(".qmd") && !f.startsWith("_")).length;
    }

    // Get tags (max 3 for display)
    const tags = (ebook.tags || []).slice(0, 3);

    return {
      title: ebook.title,
      subtitle: ebook.subtitle || "",
      slug: ebook.slug,
      gradient: gradients[i % gradients.length],
      tag_items: tags,
      has_tags: tags.length > 0,
      chapter_count: chapterCount,
      has_pdf: hasPdf,
      pdf_url: pdfUrl,
      has_landing: hasLanding,
      landing_url: landingUrl,
    };
  });

// Build product cards
const productCards = products
  .filter((p: any) => p.id !== "zopcloud") // Only show main products (ZopNight, ZopDay)
  .map((p: any) => ({
    name: p.name,
    tagline: p.tagline || null,
    description: p.description,
    url: p.url,
    accent_color: accentColors[p.id] || "linear-gradient(90deg, #0891b2, #06b6d4)",
    features: p.features && p.features.length > 0 ? { items: p.features } : null,
  }));

// Count totals
const totalChapters = ebookCards.reduce((sum, e) => sum + e.chapter_count, 0);

// Load template
const templatePath = join(SCRIPT_DIR, "template.html");
const template = readFileSync(templatePath, "utf-8");

const data = {
  company_name: company.name,
  company_tagline: company.tagline,
  company_website: company.website,
  company_social_linkedin: company.social?.linkedin || null,
  company_social_github: company.social?.github || null,
  company_social_twitter: company.social?.twitter || null,
  year: new Date().getFullYear(),

  ebook_count: ebookCards.length,
  total_chapters: totalChapters,
  ebooks: ebookCards,
  products: productCards,
};

const html = Mustache.render(template, data);

// Write output
const outputDir = join(ROOT_DIR, "_output");
mkdirSync(outputDir, { recursive: true });
writeFileSync(join(outputDir, "index.html"), html, "utf-8");

// Copy CSS
copyFileSync(join(SCRIPT_DIR, "home-styles.css"), join(outputDir, "home-styles.css"));

// Copy logo
const logoSource = join(ROOT_DIR, "_brand", "logos", "zopdev-logo-light.svg");
if (existsSync(logoSource)) {
  copyFileSync(logoSource, join(outputDir, "logo.svg"));
}

console.log(`Home page generated at _output/index.html`);
console.log(`  ${ebookCards.length} ebooks, ${productCards.length} products`);

#!/usr/bin/env node
/**
 * regenerate-images.ts — Regenerate all Satori images from plan files.
 * Reads .plan.yml files, extracts visual definitions, and re-renders images.
 *
 * Usage: npx tsx scripts/regenerate-images.ts [slug]
 *   If slug is provided, only regenerates images for that ebook.
 *   If omitted, regenerates images for all ebooks.
 */

import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import * as yaml from "yaml";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const BOOKS = join(ROOT, "books");

// Dynamic imports for image-gen (ESM)
async function main() {
  const { generateSectionImage, isImageVisualType } = await import("./image-gen.js");
  const { loadMergedBrand } = await import("./brand-utils.js");
  const { getSocialThemeValues } = await import("./theme-utils.js");

  const targetSlug = process.argv[2];

  const slugs = targetSlug
    ? [targetSlug]
    : readdirSync(BOOKS).filter(s => existsSync(join(BOOKS, s, "_quarto.yml")));

  let totalImages = 0;

  for (const slug of slugs) {
    const chaptersDir = join(BOOKS, slug, "chapters");
    if (!existsSync(chaptersDir)) continue;

    const planFiles = readdirSync(chaptersDir).filter(f => f.endsWith(".plan.yml"));
    if (planFiles.length === 0) continue;

    // Load brand colors
    let brandColors: any = null;
    try {
      const brand = loadMergedBrand(ROOT, slug);
      const social = getSocialThemeValues(brand);
      brandColors = {
        primary: social.primary || "#0891b2",
        foreground: social.foreground || "#1e293b",
        background: social.background || "#ffffff",
        secondary: social.secondary || "#16a34a",
        darkPrimary: social.darkPrimary || "#0e7490",
        lightBackground: social.lightBackground || "#f0f9ff",
      };
    } catch {
      brandColors = {
        primary: "#0891b2",
        foreground: "#1e293b",
        background: "#ffffff",
        secondary: "#16a34a",
        darkPrimary: "#0e7490",
        lightBackground: "#f0f9ff",
      };
    }

    let ebookImages = 0;

    for (const planFile of planFiles) {
      const plan = yaml.parse(readFileSync(join(chaptersDir, planFile), "utf-8"));
      if (!plan?.sections) continue;

      const chapterId = plan.chapter_id || planFile.replace(".plan.yml", "");

      for (const section of plan.sections) {
        if (!section.visual) continue;
        const visuals = Array.isArray(section.visual) ? section.visual : [section.visual];

        for (const v of visuals) {
          if (!isImageVisualType(v.type)) continue;

          try {
            const result = await generateSectionImage({
              slug,
              chapterId,
              sectionId: section.id,
              visual: v,
              brandColors,
              imageProvider: null,
              rootDir: ROOT,
            });
            if (result) {
              ebookImages++;
              totalImages++;
            }
          } catch (err: any) {
            console.error(`  Error: ${slug}/${chapterId}/${section.id}: ${err.message}`);
          }
        }
      }
    }

    if (ebookImages > 0) {
      console.log(`${slug}: regenerated ${ebookImages} images`);

      // Copy images to output directories
      const srcImages = join(BOOKS, slug, "images");
      if (existsSync(srcImages)) {
        const imgFiles = readdirSync(srcImages).filter(f => /\.(png|jpg|svg|webp)$/i.test(f));

        // Copy to _output/books/{slug}/images/
        const outputBooksImages = join(ROOT, "_output", "books", slug, "images");
        if (existsSync(join(ROOT, "_output", "books", slug))) {
          mkdirSync(outputBooksImages, { recursive: true });
          for (const img of imgFiles) copyFileSync(join(srcImages, img), join(outputBooksImages, img));

          // Also copy to chapters/images/ for Quarto chapter HTML
          const outputChaptersImages = join(ROOT, "_output", "books", slug, "chapters", "images");
          if (existsSync(join(ROOT, "_output", "books", slug, "chapters"))) {
            mkdirSync(outputChaptersImages, { recursive: true });
            for (const img of imgFiles) copyFileSync(join(srcImages, img), join(outputChaptersImages, img));
          }
        }

        // Copy to _output/blog/{slug}/images/
        const outputBlogImages = join(ROOT, "_output", "blog", slug, "images");
        if (existsSync(join(ROOT, "_output", "blog", slug))) {
          mkdirSync(outputBlogImages, { recursive: true });
          for (const img of imgFiles) copyFileSync(join(srcImages, img), join(outputBlogImages, img));
        }
      }
    }
  }

  console.log(`\nDone: ${totalImages} images regenerated across ${slugs.length} ebook(s)`);
}

main().catch(err => { console.error(err); process.exit(1); });

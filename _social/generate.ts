#!/usr/bin/env bun
/**
 * Social media asset generator.
 * Reads calendar.yml, ebook.yml, and merged brand config to generate:
 *   - LinkedIn carousel slides (PNG + combined PDF)
 *   - Instagram quote cards (PNG)
 *   - Open Graph images (PNG)
 *
 * Usage:
 *   bun run _social/generate.ts                                    # all ebooks
 *   bun run _social/generate.ts <slug>                             # specific ebook, all assets
 *   bun run _social/generate.ts <slug> linkedin|instagram|og       # specific ebook + type
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { parse } from "yaml";
import satori from "satori";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

import { LinkedInSlide, type LinkedInSlideProps } from "./templates/linkedin-slide.js";
import { InstagramPost, type InstagramPostProps } from "./templates/instagram-post.js";
import { OgImage, type OgImageProps } from "./templates/og-image.js";
import { loadMergedBrand } from "../scripts/brand-utils.js";
import { getSocialThemeValues } from "../scripts/theme-utils.js";
import { extractD2Blocks, renderD2ToPng } from "../scripts/d2-render.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const ROOT_DIR = join(SCRIPT_DIR, "..");

// --- Load fonts ---

const fontsDir = join(SCRIPT_DIR, "fonts");

function loadFont(filename: string): ArrayBuffer | null {
  const path = join(fontsDir, filename);
  if (!existsSync(path)) {
    console.warn(`Warning: Font not found: ${path}`);
    return null;
  }
  return readFileSync(path).buffer as ArrayBuffer;
}

const interRegular = loadFont("Inter-Regular.ttf");
const interBold = loadFont("Inter-Bold.ttf");

if (!interRegular || !interBold) {
  console.error("Error: Required font files not found in _social/fonts/");
  console.error("Please download Inter-Regular.ttf and Inter-Bold.ttf");
  console.error("See _social/fonts/README.md for details");
  process.exit(1);
}

const fonts = [
  { name: "Inter", data: interRegular, weight: 400 as const, style: "normal" as const },
  { name: "Inter", data: interBold, weight: 700 as const, style: "normal" as const },
];

// --- Load calendar ---

const calendarPath = join(ROOT_DIR, "calendar.yml");
const calendar = parse(readFileSync(calendarPath, "utf-8")) as {
  ebooks: Array<{
    slug: string;
    title: string;
    subtitle?: string;
    status: string;
    outputs?: Record<string, boolean>;
  }>;
};

const targetSlug = process.argv[2] || null;
const targetType = process.argv[3] || null; // "linkedin", "instagram", "og"

// --- Helper: SVG → PNG ---

async function svgToPng(svg: string, width: number, height: number): Promise<Buffer> {
  return sharp(Buffer.from(svg)).resize(width, height).png().toBuffer();
}

// --- Helper: PNGs → PDF ---

async function pngsToPdf(pngs: Buffer[], width: number, height: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();

  for (const pngBuffer of pngs) {
    const image = await pdf.embedPng(pngBuffer);
    const page = pdf.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }

  return pdf.save();
}

// --- Generate assets ---

let generated = 0;

for (const ebook of calendar.ebooks) {
  if (targetSlug && ebook.slug !== targetSlug) continue;
  if (ebook.status === "archived") continue;

  // Load per-ebook metadata
  const ebookYmlPath = join(ROOT_DIR, "books", ebook.slug, "ebook.yml");
  if (!existsSync(ebookYmlPath)) {
    console.warn(`Warning: books/${ebook.slug}/ebook.yml not found, skipping`);
    continue;
  }

  const ebookMeta = parse(readFileSync(ebookYmlPath, "utf-8")) as {
    meta: { title: string; subtitle?: string };
    social?: {
      linkedin_carousel?: { slides: Array<{ heading: string; body: string }> };
      instagram_posts?: { quotes: Array<{ text: string; attribution: string }> };
      og_image?: { title: string; subtitle: string };
    };
  };

  const social = ebookMeta.social;
  if (!social) {
    console.log(`Skipping ${ebook.slug}: no social config in ebook.yml`);
    continue;
  }

  // ── Auto-populate placeholder social content from chapter data ──────
  const PLACEHOLDER_RE = /replace with|key takeaway #\d|lorem ipsum|auto-populated from/i;
  const hasPlaceholderSlides = social.linkedin_carousel?.slides?.some(s => PLACEHOLDER_RE.test(s.body) || PLACEHOLDER_RE.test(s.heading));
  const hasPlaceholderQuotes = social.instagram_posts?.quotes?.some(q => PLACEHOLDER_RE.test(q.text));

  if (hasPlaceholderSlides || hasPlaceholderQuotes) {
    // Collect key claims from chapter plan files
    const chapDir = join(ROOT_DIR, "books", ebook.slug, "chapters");
    const keyClaims: string[] = [];
    if (existsSync(chapDir)) {
      const planFiles = readdirSync(chapDir).filter(f => f.endsWith(".plan.yml")).sort();
      for (const pf of planFiles) {
        try {
          const plan = parse(readFileSync(join(chapDir, pf), "utf-8")) as any;
          const claims = plan?.content_seeds?.key_claims || plan?.content_seeds?.key_takeaways || [];
          for (const c of claims) {
            const claim = typeof c === "string" ? c.trim() : "";
            // Only keep claims that are concise enough for a slide (< 120 chars)
            if (claim && claim.length > 10 && claim.length < 120) keyClaims.push(claim);
          }
        } catch { /* skip unparseable plans */ }
      }
    }

    // Also try key_takeaways from ebook.yml chapters metadata
    if (keyClaims.length < 4 && ebookMeta.chapters) {
      for (const ch of (ebookMeta as any).chapters || []) {
        for (const kt of ch.key_takeaways || []) {
          const claim = typeof kt === "string" ? kt.trim() : "";
          if (claim && claim.length > 10 && claim.length < 120 && !keyClaims.includes(claim)) {
            keyClaims.push(claim);
          }
        }
      }
    }

    if (keyClaims.length > 0) {
      console.log(`  📝 Auto-populating social content from ${keyClaims.length} key claims`);

      // Replace LinkedIn carousel placeholder slides
      if (hasPlaceholderSlides && social.linkedin_carousel?.slides) {
        const title = ebookMeta.meta.title;
        const newSlides: Array<{ heading: string; body: string }> = [
          { heading: title, body: "A comprehensive guide by Zopdev" },
        ];
        // Add up to 4 key claim slides with meaningful headings
        const selectedClaims = keyClaims.slice(0, 4);
        for (let i = 0; i < selectedClaims.length; i++) {
          // Extract a short heading from the claim (first phrase before dash/comma/colon, or first ~5 words)
          const claim = selectedClaims[i];
          let heading = claim.split(/[—–:,]/)[0].trim();
          // Truncate to ~40 chars max for heading
          if (heading.length > 40) {
            const words = heading.split(/\s+/).slice(0, 5);
            heading = words.join(" ");
          }
          // If heading is the same as full claim, use first few words
          if (heading === claim || heading.length < 5) {
            heading = claim.split(/\s+/).slice(0, 4).join(" ");
          }
          newSlides.push({
            heading,
            body: claim,
          });
        }
        newSlides.push({ heading: "Get the Full Guide", body: "Download now at zopdev.com" });
        social.linkedin_carousel.slides = newSlides;
      }

      // Replace Instagram placeholder quotes
      if (hasPlaceholderQuotes && social.instagram_posts?.quotes) {
        // Pick the most impactful claims (those with numbers/percentages)
        const impactful = keyClaims.filter(c => /\d+%|\$[\d,]+|\d+[xX]/.test(c));
        const quoteSources = impactful.length >= 2 ? impactful : keyClaims;
        social.instagram_posts.quotes = quoteSources.slice(0, 3).map(text => ({
          text,
          attribution: "Zopdev Team",
        }));
      }
    }
  }

  // Load merged brand config (core + extended + per-ebook overrides)
  const brandConfig = loadMergedBrand(ROOT_DIR, ebook.slug);
  const themeValues = getSocialThemeValues(brandConfig.resolved);
  const brandColors = {
    primary: themeValues.primary,
    foreground: themeValues.foreground,
    background: themeValues.background,
    secondary: themeValues.secondary,
    darkPrimary: themeValues.darkPrimary,
    lightBackground: themeValues.lightBackground,
  };

  // --- LinkedIn Carousel ---
  if (
    (!targetType || targetType === "linkedin") &&
    ebook.outputs?.linkedin_carousel &&
    social.linkedin_carousel?.slides
  ) {
    console.log(`Generating LinkedIn carousel for: ${ebook.slug}`);
    const slides = social.linkedin_carousel.slides;
    const outputDir = join(ROOT_DIR, "_output", "social", ebook.slug, "linkedin");
    mkdirSync(outputDir, { recursive: true });

    const pngs: Buffer[] = [];

    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const props: LinkedInSlideProps = {
        heading: slide.heading,
        body: slide.body,
        slideNumber: i + 1,
        totalSlides: slides.length,
        brandColors,
        isFirst: i === 0,
        isLast: i === slides.length - 1,
      };

      const svg = await satori(LinkedInSlide(props) as any, {
        width: 1080,
        height: 1080,
        fonts,
      });

      const png = await svgToPng(svg, 1080, 1080);
      pngs.push(png);
      writeFileSync(join(outputDir, `slide-${String(i + 1).padStart(2, "0")}.png`), png);
    }

    // Generate combined PDF
    const pdfBytes = await pngsToPdf(pngs, 1080, 1080);
    writeFileSync(join(outputDir, "carousel.pdf"), pdfBytes);

    // Generate diagram slides from chapter D2 blocks
    const chaptersDir = join(ROOT_DIR, "books", ebook.slug, "chapters");
    let diagramCount = 0;
    if (existsSync(chaptersDir)) {
      const chapterFiles = readdirSync(chaptersDir)
        .filter(f => f.endsWith(".qmd") || f.endsWith(".md"))
        .sort();
      for (const file of chapterFiles) {
        const content = readFileSync(join(chaptersDir, file), "utf-8");
        const d2Blocks = extractD2Blocks(content);
        for (const d2Source of d2Blocks) {
          const diagramPng = await renderD2ToPng(d2Source, 1080, 1080, { theme: "0" });
          if (diagramPng) {
            // Composite diagram onto a branded background
            const bgSvg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
              <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${brandColors.lightBackground}"/>
                <stop offset="100%" stop-color="#ffffff"/>
              </linearGradient></defs>
              <rect width="1080" height="1080" fill="url(#bg)"/>
              <rect x="0" y="0" width="6" height="1080" fill="${brandColors.primary}"/>
              <text x="80" y="60" font-family="Inter,sans-serif" font-size="20" fill="${brandColors.primary}" font-weight="700">DIAGRAM</text>
              <text x="920" y="1050" font-family="Inter,sans-serif" font-size="18" fill="${brandColors.primary}" opacity="0.5">zopdev</text>
            </svg>`;
            const bgBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();
            const composited = await sharp(bgBuffer)
              .composite([{
                input: await sharp(diagramPng)
                  .resize(920, 920, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
                  .png()
                  .toBuffer(),
                left: 80,
                top: 80,
              }])
              .png()
              .toBuffer();
            diagramCount++;
            writeFileSync(join(outputDir, `diagram-${String(diagramCount).padStart(2, "0")}.png`), composited);
          }
        }
      }
    }

    console.log(`  → ${pngs.length} slides + ${diagramCount} diagram slides + carousel.pdf`);
    generated++;
  }

  // --- Instagram Posts ---
  if (
    (!targetType || targetType === "instagram") &&
    ebook.outputs?.instagram_posts &&
    social.instagram_posts?.quotes
  ) {
    console.log(`Generating Instagram posts for: ${ebook.slug}`);
    const quotes = social.instagram_posts.quotes;
    const outputDir = join(ROOT_DIR, "_output", "social", ebook.slug, "instagram");
    mkdirSync(outputDir, { recursive: true });

    for (let i = 0; i < quotes.length; i++) {
      const quote = quotes[i];
      const props: InstagramPostProps = {
        quote: quote.text,
        attribution: quote.attribution,
        bookTitle: ebook.title,
        brandColors,
      };

      const svg = await satori(InstagramPost(props) as any, {
        width: 1080,
        height: 1350,
        fonts,
      });

      const png = await svgToPng(svg, 1080, 1350);
      writeFileSync(join(outputDir, `quote-${String(i + 1).padStart(2, "0")}.png`), png);
    }

    console.log(`  → ${quotes.length} quote cards`);
    generated++;
  }

  // --- OG Image ---
  if (
    (!targetType || targetType === "og") &&
    ebook.outputs?.og_image &&
    social.og_image
  ) {
    console.log(`Generating OG image for: ${ebook.slug}`);
    const outputDir = join(ROOT_DIR, "_output", "social", ebook.slug, "og");
    mkdirSync(outputDir, { recursive: true });

    const props: OgImageProps = {
      title: social.og_image.title || ebook.title,
      subtitle: social.og_image.subtitle || ebook.subtitle || "",
      brandColors,
    };

    const svg = await satori(OgImage(props) as any, {
      width: 1200,
      height: 630,
      fonts,
    });

    const png = await svgToPng(svg, 1200, 630);
    writeFileSync(join(outputDir, "og-image.png"), png);

    console.log(`  → og-image.png`);
    generated++;
  }
}

if (generated === 0 && targetSlug) {
  console.error(`No assets generated for slug '${targetSlug}'`);
  process.exit(1);
}

console.log(`\nGenerated assets for ${generated} output type(s)`);

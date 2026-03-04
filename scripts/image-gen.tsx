/**
 * Image Generation Orchestrator.
 *
 * Routes visual types to the appropriate renderer:
 *   - stat-card, comparison-graphic, metric-highlight, key-number → Satori (always available)
 *   - illustration → AI image provider (with Satori fallback if no API key)
 *
 * Output: PNG files in books/{slug}/images/, referenced from .qmd as ![alt](images/file.png)
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import satori from "satori";
import sharp from "sharp";
import type { VisualRecommendation } from "./pipeline-types.js";
import type { ImageProvider, ImageGenerationOptions } from "./providers/image.js";

// ── Satori templates ─────────────────────────────────────────────────────────

import { StatCard, type StatCardProps } from "../_templates/images/stat-card.js";
import { ComparisonGraphic, type ComparisonGraphicProps } from "../_templates/images/comparison-graphic.js";
import { MetricHighlight, type MetricHighlightProps } from "../_templates/images/metric-highlight.js";
import { KeyNumber, type KeyNumberProps } from "../_templates/images/key-number.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BrandColors {
  primary: string;
  foreground: string;
  background: string;
  secondary: string;
  darkPrimary: string;
  lightBackground: string;
}

export interface ImageGenOptions {
  slug: string;
  chapterId: string;
  sectionId: string;
  visual: VisualRecommendation;
  brandColors: BrandColors;
  imageProvider: ImageProvider | null;
  rootDir: string;
}

export interface ImageGenResult {
  filename: string;       // relative path: images/ch01-stat-card-opening.png
  absolutePath: string;   // full filesystem path
  type: "satori" | "ai" | "fallback";
  width: number;
  height: number;
}

// ── Font loading (shared with _social/) ──────────────────────────────────────

let fontsLoaded: Array<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }> | null = null;

function loadFonts(rootDir: string): typeof fontsLoaded {
  if (fontsLoaded) return fontsLoaded;

  const fontsDir = join(rootDir, "_social", "fonts");
  const regularPath = join(fontsDir, "Inter-Regular.ttf");
  const boldPath = join(fontsDir, "Inter-Bold.ttf");

  if (!existsSync(regularPath) || !existsSync(boldPath)) {
    console.warn("  [image-gen] Warning: Inter fonts not found in _social/fonts/. Using fallback.");
    return null;
  }

  fontsLoaded = [
    { name: "Inter", data: readFileSync(regularPath).buffer as ArrayBuffer, weight: 400, style: "normal" },
    { name: "Inter", data: readFileSync(boldPath).buffer as ArrayBuffer, weight: 700, style: "normal" },
  ];

  return fontsLoaded;
}

// ── Satori SVG → PNG helper ──────────────────────────────────────────────────

async function satoriToPng(element: any, width: number, height: number, rootDir: string): Promise<Buffer> {
  const fonts = loadFonts(rootDir);
  if (!fonts) {
    throw new Error("Fonts not available for Satori rendering. Ensure _social/fonts/ has Inter-Regular.ttf and Inter-Bold.ttf.");
  }

  const svg = await satori(element, { width, height, fonts });
  return sharp(Buffer.from(svg)).resize(width, height).png().toBuffer();
}

// ── Satori renderers ─────────────────────────────────────────────────────────

async function generateStatCardImage(
  visual: VisualRecommendation,
  brandColors: BrandColors,
  rootDir: string,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const data = visual.stat_data;
  if (!data) {
    throw new Error("stat-card visual missing stat_data field");
  }

  const props: StatCardProps = {
    headline: data.headline,
    subtext: data.subtext,
    source: data.source,
    brandColors,
  };

  const buffer = await satoriToPng(StatCard(props), 800, 500, rootDir);
  return { buffer, width: 800, height: 500 };
}

async function generateComparisonImage(
  visual: VisualRecommendation,
  brandColors: BrandColors,
  rootDir: string,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const data = visual.comparison_data;
  if (!data) {
    throw new Error("comparison-graphic visual missing comparison_data field");
  }

  const props: ComparisonGraphicProps = {
    title: data.title,
    before: data.before,
    after: data.after,
    improvement: data.improvement,
    brandColors,
  };

  const buffer = await satoriToPng(ComparisonGraphic(props), 800, 500, rootDir);
  return { buffer, width: 800, height: 500 };
}

async function generateMetricHighlightImage(
  visual: VisualRecommendation,
  brandColors: BrandColors,
  rootDir: string,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const data = visual.metrics_data;
  if (!data || data.length === 0) {
    throw new Error("metric-highlight visual missing metrics_data field");
  }

  const props: MetricHighlightProps = {
    title: visual.purpose,
    metrics: data,
    brandColors,
  };

  const buffer = await satoriToPng(MetricHighlight(props), 800, 500, rootDir);
  return { buffer, width: 800, height: 500 };
}

async function generateKeyNumberImage(
  visual: VisualRecommendation,
  brandColors: BrandColors,
  rootDir: string,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  const data = visual.stat_data;
  if (!data) {
    throw new Error("key-number visual missing stat_data field (uses headline as number, subtext as unit)");
  }

  // Parse number + unit from stat_data: headline = number, subtext = unit, source = context
  const props: KeyNumberProps = {
    number: data.headline,
    unit: data.subtext,
    context: data.source || visual.purpose || "",
    brandColors,
  };

  const buffer = await satoriToPng(KeyNumber(props), 800, 400, rootDir);
  return { buffer, width: 800, height: 400 };
}

// ── Satori fallback for illustration type ────────────────────────────────────

async function generateFallbackIllustration(
  visual: VisualRecommendation,
  brandColors: BrandColors,
  rootDir: string,
): Promise<{ buffer: Buffer; width: number; height: number }> {
  // Generate a simple branded placeholder with the visual's purpose text
  const element = (
    <div
      style={{
        width: 800,
        height: 500,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
        background: `linear-gradient(135deg, ${brandColors.lightBackground}, #FFFFFF)`,
        color: brandColors.foreground,
        fontFamily: "Inter",
        position: "relative",
        overflow: "hidden",
        borderRadius: 16,
        border: `2px solid ${brandColors.primary}20`,
      }}
    >
      {/* Left accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: 5,
          height: "100%",
          backgroundColor: brandColors.primary,
        }}
      />

      {/* Icon placeholder */}
      <div
        style={{
          fontSize: 48,
          marginBottom: 16,
          opacity: 0.3,
        }}
      >
        ◈
      </div>

      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          textAlign: "center",
          marginBottom: 12,
          color: brandColors.primary,
        }}
      >
        {visual.purpose || "Conceptual Illustration"}
      </div>

      <div
        style={{
          fontSize: 14,
          opacity: 0.5,
          textAlign: "center",
        }}
      >
        See full interactive version in the HTML ebook
      </div>

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 48,
          fontSize: 13,
          opacity: 0.3,
        }}
      >
        zopdev
      </div>
    </div>
  );

  const buffer = await satoriToPng(element, 800, 500, rootDir);
  return { buffer, width: 800, height: 500 };
}

// ── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Generates an image for a section's visual recommendation.
 * Returns null if the visual type doesn't produce images.
 *
 * Routing:
 *   stat-card           → Satori stat card
 *   comparison-graphic  → Satori comparison
 *   metric-highlight    → Satori metric grid
 *   key-number          → Satori key number
 *   illustration        → AI provider (fallback: Satori placeholder)
 *
 * All other types (d2, ojs, code, callout, table) return null
 * because they're handled inline by transform-chapter.ts.
 */
export async function generateSectionImage(opts: ImageGenOptions): Promise<ImageGenResult | null> {
  const { slug, chapterId, sectionId, visual, brandColors, imageProvider, rootDir } = opts;

  // Only handle image-producing visual types
  const imageTypes = ["stat-card", "comparison-graphic", "metric-highlight", "key-number", "illustration"];
  if (!imageTypes.includes(visual.type)) return null;

  // Ensure images directory exists
  const imagesDir = join(rootDir, "books", slug, "images");
  if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true });

  const filename = visual.image_filename || `${chapterId}-${visual.type}-${sectionId}.png`;
  const absolutePath = join(imagesDir, filename);

  try {
    let result: { buffer: Buffer; width: number; height: number };
    let type: ImageGenResult["type"] = "satori";

    switch (visual.type) {
      case "stat-card":
        result = await generateStatCardImage(visual, brandColors, rootDir);
        break;

      case "comparison-graphic":
        result = await generateComparisonImage(visual, brandColors, rootDir);
        break;

      case "metric-highlight":
        result = await generateMetricHighlightImage(visual, brandColors, rootDir);
        break;

      case "key-number":
        result = await generateKeyNumberImage(visual, brandColors, rootDir);
        break;

      case "illustration":
        if (imageProvider) {
          // AI-generated illustration
          try {
            const aiResult = await imageProvider.generate({
              prompt: visual.image_prompt || visual.purpose || "Technical concept illustration",
              style: visual.image_style || "conceptual",
              width: 800,
              height: 500,
            });
            result = { buffer: aiResult.imageBuffer, width: aiResult.width, height: aiResult.height };
            type = "ai";
          } catch (aiErr) {
            console.warn(`    [image-gen] AI generation failed, using Satori fallback: ${(aiErr as Error).message}`);
            result = await generateFallbackIllustration(visual, brandColors, rootDir);
            type = "fallback";
          }
        } else {
          // No image provider — use Satori fallback
          result = await generateFallbackIllustration(visual, brandColors, rootDir);
          type = "fallback";
        }
        break;

      default:
        return null;
    }

    // Write PNG to disk
    writeFileSync(absolutePath, result.buffer);
    console.log(`    [image-gen] Generated ${type}: ${filename} (${result.width}x${result.height})`);

    return {
      filename: `../images/${filename}`,
      absolutePath,
      type,
      width: result.width,
      height: result.height,
    };
  } catch (err) {
    console.error(`    [image-gen] Failed to generate ${visual.type} for ${chapterId}/${sectionId}: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Check if a visual type produces an inline image.
 * Used by transform-chapter.ts to decide whether to call generateSectionImage.
 */
export function isImageVisualType(type: string): boolean {
  return ["stat-card", "comparison-graphic", "metric-highlight", "key-number", "illustration"].includes(type);
}

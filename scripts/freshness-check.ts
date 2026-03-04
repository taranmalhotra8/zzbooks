#!/usr/bin/env bun
/**
 * Content Freshness Engine.
 *
 * Detects stale pricing data in ebook chapters by:
 *   1. Extracting $X.XX patterns near cloud service keywords
 *   2. Identifying service/provider from surrounding context
 *   3. Comparing extracted prices vs live (or cached) pricing APIs
 *   4. Flagging prices with >15% drift as "stale"
 *
 * Output: _output/freshness/{slug}-freshness-report.json
 *
 * Advisory only — flags but never blocks builds.
 *
 * Usage:
 *   bun run scripts/freshness-check.ts <slug>
 *   bun run scripts/freshness-check.ts --all
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { parse } from "yaml";
import { MockPricingProvider, type PricingProvider, type PricingEntry } from "./providers/pricing-mock.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExtractedPrice {
  chapter: string;
  lineNumber: number;
  rawText: string;       // the matched text around the price
  extractedPrice: number;
  unit: string;          // "hourly", "monthly", "per-request", etc.
  cloud?: string;        // "aws", "gcp", "azure"
  service?: string;      // "EC2", "GKE", "AKS", etc.
  instance?: string;     // "m5.large", "n2-standard-4", etc.
}

export interface PriceComparison {
  extracted: ExtractedPrice;
  currentPrice: number | null;
  driftPercent: number | null;
  status: "fresh" | "stale" | "unknown";
  currentSource: string;
}

export interface FreshnessReport {
  slug: string;
  generatedAt: string;
  driftThresholdPercent: number;
  totalPricesExtracted: number;
  stalePrices: number;
  freshPrices: number;
  unknownPrices: number;
  comparisons: PriceComparison[];
}

// ── Cloud Service Keywords ────────────────────────────────────────────────

const CLOUD_KEYWORDS: Record<string, { cloud: string; service: string }> = {
  // AWS
  "ec2": { cloud: "aws", service: "EC2" },
  "eks": { cloud: "aws", service: "EKS" },
  "s3": { cloud: "aws", service: "S3" },
  "rds": { cloud: "aws", service: "RDS" },
  "lambda": { cloud: "aws", service: "Lambda" },
  "fargate": { cloud: "aws", service: "Fargate" },
  "ebs": { cloud: "aws", service: "EBS" },
  "graviton": { cloud: "aws", service: "EC2" },
  "m5.": { cloud: "aws", service: "EC2" },
  "m6g.": { cloud: "aws", service: "EC2" },
  "c5.": { cloud: "aws", service: "EC2" },
  "r5.": { cloud: "aws", service: "EC2" },
  "t3.": { cloud: "aws", service: "EC2" },
  // GCP
  "gke": { cloud: "gcp", service: "GKE" },
  "gcs": { cloud: "gcp", service: "Cloud Storage" },
  "cloud sql": { cloud: "gcp", service: "Cloud SQL" },
  "bigquery": { cloud: "gcp", service: "BigQuery" },
  "n2-standard": { cloud: "gcp", service: "GKE" },
  "e2-standard": { cloud: "gcp", service: "GKE" },
  // Azure
  "aks": { cloud: "azure", service: "AKS" },
  "azure vm": { cloud: "azure", service: "VM" },
  "blob storage": { cloud: "azure", service: "Blob" },
  "cosmos db": { cloud: "azure", service: "Cosmos DB" },
  "d4s_v3": { cloud: "azure", service: "AKS" },
  "b4ms": { cloud: "azure", service: "AKS" },
};

// ── Instance Type Patterns ────────────────────────────────────────────────

const INSTANCE_PATTERNS = [
  /\b(m[56]g?\.\w+)/i,        // AWS m5.large, m6g.large
  /\b(c[56]\.\w+)/i,           // AWS c5.large
  /\b(r[56]\.\w+)/i,           // AWS r5.large
  /\b(t[34]\.\w+)/i,           // AWS t3.medium
  /\b(db\.m[56]\.\w+)/i,       // AWS RDS db.m5.large
  /\b(n[12]-standard-\d+)/i,   // GCP n2-standard-4
  /\b(e[12]-standard-\d+)/i,   // GCP e2-standard-4
  /\b(D\d+s?_v\d+)/i,          // Azure D4s_v3
  /\b(B\d+ms)/i,               // Azure B4ms
];

// ── Price Extraction ──────────────────────────────────────────────────────

function extractPricesFromChapter(chapterPath: string): ExtractedPrice[] {
  const content = readFileSync(chapterPath, "utf-8");
  const lines = content.split("\n");
  const chapterName = basename(chapterPath, ".qmd");
  const prices: ExtractedPrice[] = [];

  // Match $X.XX patterns (with optional ,thousands and /unit)
  const priceRegex = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{1,4})?)\s*(?:\/(\w+))?/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip code blocks and YAML frontmatter
    if (line.startsWith("```") || line.startsWith("---")) continue;

    let match;
    while ((match = priceRegex.exec(line)) !== null) {
      const rawPrice = parseFloat(match[1].replace(/,/g, ""));
      const unitSuffix = match[2] || "";

      // Get surrounding context (2 lines before + current line)
      const context = lines.slice(Math.max(0, i - 2), i + 1).join(" ").toLowerCase();

      // Determine unit
      let unit = "unknown";
      if (unitSuffix.match(/hour|hr/i) || context.includes("per hour") || context.includes("/hour")) {
        unit = "hourly";
      } else if (unitSuffix.match(/month|mo/i) || context.includes("per month") || context.includes("/month") || context.includes("monthly")) {
        unit = "monthly";
      } else if (rawPrice < 1) {
        unit = "hourly"; // Small prices are likely per-hour
      } else if (rawPrice > 100) {
        unit = "monthly"; // Large prices are likely per-month
      }

      // Identify cloud provider and service from context
      let cloud: string | undefined;
      let service: string | undefined;
      let instance: string | undefined;

      for (const [keyword, info] of Object.entries(CLOUD_KEYWORDS)) {
        if (context.includes(keyword.toLowerCase())) {
          cloud = info.cloud;
          service = info.service;
          break;
        }
      }

      // Try to extract instance type
      for (const pattern of INSTANCE_PATTERNS) {
        const instanceMatch = context.match(pattern);
        if (instanceMatch) {
          instance = instanceMatch[1];
          break;
        }
      }

      // Only include if we can identify the cloud context
      if (cloud || rawPrice >= 0.01) {
        prices.push({
          chapter: chapterName,
          lineNumber: i + 1,
          rawText: line.trim().slice(0, 100),
          extractedPrice: rawPrice,
          unit,
          cloud,
          service,
          instance,
        });
      }
    }
  }

  return prices;
}

// ── Price Comparison ──────────────────────────────────────────────────────

async function comparePrices(
  extracted: ExtractedPrice[],
  providers: Map<string, PricingProvider>,
  driftThreshold: number,
): Promise<PriceComparison[]> {
  const comparisons: PriceComparison[] = [];

  for (const price of extracted) {
    if (!price.cloud || !price.service) {
      comparisons.push({
        extracted: price,
        currentPrice: null,
        driftPercent: null,
        status: "unknown",
        currentSource: "no cloud context identified",
      });
      continue;
    }

    const provider = providers.get(price.cloud);
    if (!provider) {
      comparisons.push({
        extracted: price,
        currentPrice: null,
        driftPercent: null,
        status: "unknown",
        currentSource: `no ${price.cloud} pricing provider`,
      });
      continue;
    }

    const currentEntry = await provider.lookupPrice(
      price.service,
      price.instance || "",
    );

    if (!currentEntry) {
      comparisons.push({
        extracted: price,
        currentPrice: null,
        driftPercent: null,
        status: "unknown",
        currentSource: `${provider.name}: no matching SKU`,
      });
      continue;
    }

    // Compare prices (normalize to same unit)
    let currentPrice: number;
    if (price.unit === "hourly" && currentEntry.price_hourly !== null) {
      currentPrice = currentEntry.price_hourly;
    } else if (price.unit === "monthly") {
      currentPrice = currentEntry.price_monthly;
    } else if (currentEntry.price_hourly !== null) {
      currentPrice = currentEntry.price_hourly;
    } else {
      currentPrice = currentEntry.price_monthly;
    }

    const driftPercent = currentPrice > 0
      ? Math.round(Math.abs(price.extractedPrice - currentPrice) / currentPrice * 100)
      : null;

    const status = driftPercent !== null && driftPercent > driftThreshold ? "stale" : "fresh";

    comparisons.push({
      extracted: price,
      currentPrice,
      driftPercent,
      status,
      currentSource: provider.name,
    });
  }

  return comparisons;
}

// ── Report Generation ─────────────────────────────────────────────────────

export async function checkFreshness(slug: string): Promise<FreshnessReport> {
  const chaptersDir = join(PROJECT_ROOT, "books", slug, "chapters");
  const driftThreshold = loadDriftThreshold();

  // Extract prices from all chapters
  const allPrices: ExtractedPrice[] = [];
  if (existsSync(chaptersDir)) {
    const qmdFiles = readdirSync(chaptersDir).filter(f => f.endsWith(".qmd")).sort();
    for (const file of qmdFiles) {
      const prices = extractPricesFromChapter(join(chaptersDir, file));
      allPrices.push(...prices);
    }
  }

  // Set up pricing providers (mock by default)
  const providers = new Map<string, PricingProvider>();
  providers.set("aws", new MockPricingProvider("aws"));
  providers.set("gcp", new MockPricingProvider("gcp"));
  providers.set("azure", new MockPricingProvider("azure"));

  // TODO: Add live providers when API keys are available
  // if (process.env.AWS_ACCESS_KEY_ID) providers.set("aws", new AWSPricingProvider());
  // if (process.env.GOOGLE_API_KEY) providers.set("gcp", new GCPPricingProvider(process.env.GOOGLE_API_KEY));
  // Azure Retail Prices API is public, always available

  // Compare prices
  const comparisons = await comparePrices(allPrices, providers, driftThreshold);

  const stalePrices = comparisons.filter(c => c.status === "stale").length;
  const freshPrices = comparisons.filter(c => c.status === "fresh").length;
  const unknownPrices = comparisons.filter(c => c.status === "unknown").length;

  return {
    slug,
    generatedAt: new Date().toISOString(),
    driftThresholdPercent: driftThreshold,
    totalPricesExtracted: allPrices.length,
    stalePrices,
    freshPrices,
    unknownPrices,
    comparisons,
  };
}

function loadDriftThreshold(): number {
  const thresholdPath = join(PROJECT_ROOT, "quality-thresholds.yml");
  if (!existsSync(thresholdPath)) return 15;

  try {
    const data = parse(readFileSync(thresholdPath, "utf-8")) as Record<string, unknown>;
    const mods = data.modalities as Record<string, Record<string, number>> | undefined;
    return mods?.freshness?.drift_threshold_percent ?? 15;
  } catch {
    return 15;
  }
}

// ── Report Formatting ─────────────────────────────────────────────────────

function formatReport(report: FreshnessReport): string {
  const hr = "─".repeat(60);
  const lines: string[] = [];

  lines.push(hr);
  lines.push(`  FRESHNESS REPORT: ${report.slug}`);
  lines.push(`  ${report.generatedAt}`);
  lines.push(`  Drift threshold: ${report.driftThresholdPercent}%`);
  lines.push(hr);
  lines.push("");

  lines.push(`  Prices found: ${report.totalPricesExtracted}`);
  lines.push(`  Fresh: ${report.freshPrices}`);
  lines.push(`  Stale: ${report.stalePrices}`);
  lines.push(`  Unknown: ${report.unknownPrices}`);
  lines.push("");

  if (report.stalePrices > 0) {
    lines.push("  STALE PRICES:");
    for (const c of report.comparisons.filter(c => c.status === "stale")) {
      lines.push(`    ⚠ ${c.extracted.chapter}:${c.extracted.lineNumber} — $${c.extracted.extractedPrice} (${c.extracted.unit})`);
      lines.push(`      Current: $${c.currentPrice} (${c.currentSource}), drift: ${c.driftPercent}%`);
      lines.push(`      Context: ${c.extracted.rawText.slice(0, 80)}`);
    }
    lines.push("");
  }

  if (report.freshPrices > 0) {
    lines.push("  FRESH PRICES:");
    for (const c of report.comparisons.filter(c => c.status === "fresh")) {
      lines.push(`    ✅ ${c.extracted.chapter}:${c.extracted.lineNumber} — $${c.extracted.extractedPrice} → $${c.currentPrice} (drift: ${c.driftPercent || 0}%)`);
    }
  }

  lines.push(hr);
  return lines.join("\n");
}

// ── CLI ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: bun run scripts/freshness-check.ts <slug|--all>");
    process.exit(1);
  }

  const slugs: string[] = [];
  if (arg === "--all") {
    const booksDir = join(PROJECT_ROOT, "books");
    if (existsSync(booksDir)) {
      slugs.push(...readdirSync(booksDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name));
    }
  } else {
    slugs.push(arg);
  }

  for (const slug of slugs) {
    console.log(`\nChecking freshness for "${slug}"...`);
    const report = await checkFreshness(slug);

    // Write JSON report
    const outDir = join(PROJECT_ROOT, "_output", "freshness");
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `${slug}-freshness-report.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2));

    console.log(formatReport(report));
    console.log(`  Report: ${outPath}`);
  }
}

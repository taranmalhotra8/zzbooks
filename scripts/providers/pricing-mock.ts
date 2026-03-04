/**
 * Mock Pricing Provider — uses local _data/pricing-cache.json.
 * Always available, no API keys needed.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..", "..");

export interface PricingEntry {
  service: string;
  instance: string;
  type: string;
  region: string;
  price_hourly: number | null;
  price_monthly: number;
  unit: string;
}

export interface PricingProvider {
  readonly name: string;
  readonly cloud: "aws" | "gcp" | "azure";
  lookupPrice(service: string, instance: string, region?: string): Promise<PricingEntry | null>;
}

export class MockPricingProvider implements PricingProvider {
  readonly name: string;
  readonly cloud: "aws" | "gcp" | "azure";
  private cache: Record<string, PricingEntry> = {};

  constructor(cloud: "aws" | "gcp" | "azure") {
    this.cloud = cloud;
    this.name = `mock-${cloud}`;
    this.loadCache();
  }

  private loadCache(): void {
    const cachePath = join(PROJECT_ROOT, "_data", "pricing-cache.json");
    if (!existsSync(cachePath)) return;

    try {
      const data = JSON.parse(readFileSync(cachePath, "utf-8"));
      this.cache = data.prices?.[this.cloud] || {};
    } catch {
      // Ignore
    }
  }

  async lookupPrice(service: string, instance: string, _region?: string): Promise<PricingEntry | null> {
    // Try exact key match first
    const key = `${service.toLowerCase()}-${instance.toLowerCase()}`.replace(/\s+/g, "-");
    for (const [cacheKey, entry] of Object.entries(this.cache)) {
      if (cacheKey.includes(key) ||
          (entry.service.toLowerCase() === service.toLowerCase() &&
           entry.instance.toLowerCase().includes(instance.toLowerCase()))) {
        return entry;
      }
    }
    return null;
  }
}

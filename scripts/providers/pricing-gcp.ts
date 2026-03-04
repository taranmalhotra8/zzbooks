/**
 * GCP Cloud Billing Catalog API Client.
 *
 * Uses the public Cloud Billing Catalog API (no auth required for listing).
 * Falls back to mock if API is unavailable.
 */

import type { PricingProvider, PricingEntry } from "./pricing-mock.js";

export class GCPPricingProvider implements PricingProvider {
  readonly name = "gcp-pricing";
  readonly cloud = "gcp" as const;
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async lookupPrice(service: string, instance: string, region: string = "us-central1"): Promise<PricingEntry | null> {
    try {
      // GCP Cloud Billing Catalog API
      const serviceId = this.resolveServiceId(service);
      if (!serviceId) return null;

      const baseUrl = "https://cloudbilling.googleapis.com/v1";
      const url = this.apiKey
        ? `${baseUrl}/services/${serviceId}/skus?key=${this.apiKey}`
        : `${baseUrl}/services/${serviceId}/skus`;

      const response = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) return null;

      const data = await response.json() as { skus?: Array<Record<string, unknown>> };
      if (!data.skus) return null;

      // Search for matching SKU
      for (const sku of data.skus) {
        const desc = (sku.description as string || "").toLowerCase();
        const category = sku.category as Record<string, string> | undefined;
        const resourceFamily = category?.resourceFamily?.toLowerCase() || "";

        if (desc.includes(instance.toLowerCase()) && resourceFamily.includes("compute")) {
          const pricing = sku.pricingInfo as Array<Record<string, unknown>> | undefined;
          if (pricing && pricing.length > 0) {
            const expr = pricing[0].pricingExpression as Record<string, unknown>;
            const tiered = expr?.tieredRates as Array<Record<string, unknown>>;
            if (tiered && tiered.length > 0) {
              const unitPrice = tiered[tiered.length - 1].unitPrice as Record<string, unknown>;
              const nanos = (unitPrice?.nanos as number) || 0;
              const units = parseInt(String(unitPrice?.units || "0"), 10);
              const pricePerHour = units + nanos / 1e9;

              return {
                service: category?.serviceDisplayName || service,
                instance,
                type: "on-demand",
                region,
                price_hourly: pricePerHour,
                price_monthly: pricePerHour * 730,
                unit: "per hour",
              };
            }
          }
        }
      }

      return null;
    } catch (err) {
      console.warn(`  [gcp-pricing] Lookup failed for ${service}/${instance}: ${(err as Error).message}`);
      return null;
    }
  }

  private resolveServiceId(service: string): string | null {
    // GCP service IDs (from Cloud Billing Catalog)
    const map: Record<string, string> = {
      gke: "6F81-5844-456A",
      compute: "6F81-5844-456A",
      gcs: "95FF-2EF5-5EA1",
      "cloud storage": "95FF-2EF5-5EA1",
      "cloud sql": "9662-B51E-5089",
      bigquery: "24E6-581D-38E5",
    };
    return map[service.toLowerCase()] || null;
  }
}

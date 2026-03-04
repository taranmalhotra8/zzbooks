/**
 * AWS Pricing API Client.
 * Uses the AWS Bulk Pricing JSON (us-east-1 default).
 *
 * Requires: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (or no auth for public pricing API)
 */

import type { PricingProvider, PricingEntry } from "./pricing-mock.js";

export class AWSPricingProvider implements PricingProvider {
  readonly name = "aws-pricing";
  readonly cloud = "aws" as const;
  private baseUrl = "https://pricing.us-east-1.amazonaws.com";

  async lookupPrice(service: string, instance: string, region: string = "us-east-1"): Promise<PricingEntry | null> {
    // AWS Pricing API uses a complex filter system
    // For simplicity, we use the offer index file approach
    try {
      const serviceCode = this.resolveServiceCode(service);
      if (!serviceCode) return null;

      // Fetch the offer index for the service
      const indexUrl = `${this.baseUrl}/offers/v1.0/aws/${serviceCode}/current/${region}/index.json`;

      const response = await fetch(indexUrl, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) return null;

      const data = await response.json() as Record<string, unknown>;
      const products = data.products as Record<string, Record<string, unknown>> | undefined;
      if (!products) return null;

      // Search for matching instance type
      for (const [, product] of Object.entries(products)) {
        const attrs = product.attributes as Record<string, string>;
        if (attrs?.instanceType?.toLowerCase().includes(instance.toLowerCase())) {
          // Found a match — look up pricing from terms
          const sku = product.sku as string;
          const terms = data.terms as Record<string, Record<string, unknown>>;
          const onDemand = terms?.OnDemand?.[sku] as Record<string, Record<string, unknown>> | undefined;

          if (onDemand) {
            const offerTerm = Object.values(onDemand)[0];
            const priceDimensions = offerTerm?.priceDimensions as Record<string, Record<string, unknown>> | undefined;
            if (priceDimensions) {
              const dim = Object.values(priceDimensions)[0];
              const pricePerUnit = dim?.pricePerUnit as Record<string, string>;
              const usd = parseFloat(pricePerUnit?.USD || "0");

              return {
                service: attrs.servicename || service,
                instance: attrs.instanceType || instance,
                type: "on-demand",
                region,
                price_hourly: usd,
                price_monthly: usd * 730,
                unit: (dim?.unit as string) || "per hour",
              };
            }
          }
        }
      }

      return null;
    } catch (err) {
      console.warn(`  [aws-pricing] Lookup failed for ${service}/${instance}: ${(err as Error).message}`);
      return null;
    }
  }

  private resolveServiceCode(service: string): string | null {
    const map: Record<string, string> = {
      ec2: "AmazonEC2",
      eks: "AmazonEKS",
      s3: "AmazonS3",
      rds: "AmazonRDS",
      lambda: "AWSLambda",
      ebs: "AmazonEC2",
    };
    return map[service.toLowerCase()] || null;
  }
}

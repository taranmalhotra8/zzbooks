/**
 * Azure Retail Prices REST API Client.
 *
 * Uses the public Azure Retail Prices API (no auth required).
 * Docs: https://learn.microsoft.com/en-us/rest/api/cost-management/retail-prices
 */

import type { PricingProvider, PricingEntry } from "./pricing-mock.js";

export class AzurePricingProvider implements PricingProvider {
  readonly name = "azure-pricing";
  readonly cloud = "azure" as const;

  async lookupPrice(service: string, instance: string, region: string = "eastus"): Promise<PricingEntry | null> {
    try {
      const armRegion = this.resolveRegion(region);
      const serviceName = this.resolveServiceName(service);

      // Azure Retail Prices API — public, no auth
      const filter = [
        `armRegionName eq '${armRegion}'`,
        `serviceName eq '${serviceName}'`,
        `contains(armSkuName, '${instance}')`,
        `priceType eq 'Consumption'`,
      ].join(" and ");

      const url = `https://prices.azure.com/api/retail/prices?$filter=${encodeURIComponent(filter)}&$top=10`;

      const response = await fetch(url, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) return null;

      const data = await response.json() as { Items?: Array<Record<string, unknown>> };
      if (!data.Items || data.Items.length === 0) return null;

      // Find the best match (prefer Linux, on-demand)
      const item = data.Items.find(i =>
        (i.productName as string || "").toLowerCase().includes("linux") ||
        (i.productName as string || "").toLowerCase().includes("virtual machine")
      ) || data.Items[0];

      const retailPrice = (item.retailPrice as number) || 0;
      const unitOfMeasure = (item.unitOfMeasure as string) || "1 Hour";
      const isHourly = unitOfMeasure.toLowerCase().includes("hour");

      return {
        service: (item.serviceName as string) || service,
        instance: (item.armSkuName as string) || instance,
        type: "on-demand",
        region: armRegion,
        price_hourly: isHourly ? retailPrice : null,
        price_monthly: isHourly ? retailPrice * 730 : retailPrice,
        unit: unitOfMeasure,
      };
    } catch (err) {
      console.warn(`  [azure-pricing] Lookup failed for ${service}/${instance}: ${(err as Error).message}`);
      return null;
    }
  }

  private resolveRegion(region: string): string {
    const map: Record<string, string> = {
      eastus: "eastus",
      "us-east-1": "eastus",
      westus: "westus2",
      "us-west-2": "westus2",
      westeurope: "westeurope",
      "eu-west-1": "westeurope",
    };
    return map[region.toLowerCase()] || region;
  }

  private resolveServiceName(service: string): string {
    const map: Record<string, string> = {
      aks: "Azure Kubernetes Service",
      vm: "Virtual Machines",
      blob: "Storage",
      "cosmos db": "Azure Cosmos DB",
      sql: "SQL Database",
    };
    return map[service.toLowerCase()] || service;
  }
}

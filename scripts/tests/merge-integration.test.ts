import { describe, test, expect } from "bun:test";
import { loadMergedBrand } from "../brand-utils.js";
import { join, dirname } from "path";

const PROJECT_ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");

// ── Cross-ebook integration tests ────────────────────────────────────────────
// Verify the brand override system produces distinct results for different ebooks.

describe("cross-ebook brand comparison", () => {
  const finops = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
  const k8s = loadMergedBrand(PROJECT_ROOT, "k8s-cost-guide");

  test("primary colors match between ebooks (both override to same value)", () => {
    expect(finops.resolved.colors.primary).toBe("#0e7490");
    expect(k8s.resolved.colors.primary).toBe("#0e7490");
  });

  test("non-overridden colors are identical", () => {
    expect(finops.resolved.colors.foreground).toBe(k8s.resolved.colors.foreground);
    expect(finops.resolved.colors.background).toBe(k8s.resolved.colors.background);
    expect(finops.resolved.colors.secondary).toBe(k8s.resolved.colors.secondary);
  });

  test("ICP filtering differs between ebooks", () => {
    expect(finops.resolved.icps).toHaveLength(2);
    expect(k8s.resolved.icps).toHaveLength(1);
    expect(k8s.resolved.icps[0].id).toBe("devops-engineer");
  });

  test("featured products differ between ebooks", () => {
    expect(finops.resolved.featuredProducts).toHaveLength(1);
    expect(k8s.resolved.featuredProducts).toHaveLength(2);
  });

  test("CTA text differs between ebooks", () => {
    expect(finops.resolved.ctas.primary.text).toBe("Download the FinOps Playbook");
    expect(k8s.resolved.ctas.primary.text).toBe("Download the K8s Cost Guide");
  });

  test("tone voice differs between ebooks", () => {
    expect(finops.resolved.tone.voice).not.toBe(k8s.resolved.tone.voice);
  });

  test("company info is identical (not overrideable)", () => {
    expect(finops.resolved.company.name).toBe(k8s.resolved.company.name);
    expect(finops.resolved.company.website).toBe(k8s.resolved.company.website);
  });

  test("total products are identical (overrides only filter, not modify)", () => {
    expect(finops.resolved.products).toHaveLength(k8s.resolved.products.length);
  });
});

describe("no-override ebook vs overridden ebook", () => {
  const noOverride = loadMergedBrand(PROJECT_ROOT, "nonexistent-book");
  const finops = loadMergedBrand(PROJECT_ROOT, "finops-playbook");

  test("no-override gets default primary color from palette", () => {
    expect(noOverride.resolved.colors.primary).toBe("#0891b2");
    expect(finops.resolved.colors.primary).toBe("#0e7490");
  });

  test("no-override gets all 3 ICPs (no filtering)", () => {
    expect(noOverride.resolved.icps).toHaveLength(3);
    expect(finops.resolved.icps).toHaveLength(2);
  });

  test("no-override gets default CTA text", () => {
    expect(noOverride.resolved.ctas.primary.text).toBe("Download Free PDF");
  });

  test("no-override gets default tone", () => {
    expect(noOverride.resolved.tone.voice).toBe("Technical, authoritative, practical");
  });
});

import { describe, test, expect } from "bun:test";
import {
  resolveColor,
  loadBrandCore,
  loadBrandExtended,
  loadBrandOverrides,
  loadMergedBrand,
  buildCssVars,
} from "../brand-utils.js";
import { join, dirname } from "path";

const PROJECT_ROOT = join(dirname(new URL(import.meta.url).pathname), "..", "..");

// ── resolveColor ─────────────────────────────────────────────────────────────

describe("resolveColor", () => {
  const palette = {
    primary: "#0891b2",
    secondary: "#16a34a",
    accent: "#fbbf24",
    danger: "#FF6B6B",
  };

  test("returns hex values as-is", () => {
    expect(resolveColor("#FF0000", palette)).toBe("#FF0000");
    expect(resolveColor("#abc", palette)).toBe("#abc");
  });

  test("resolves named colors from palette", () => {
    expect(resolveColor("primary", palette)).toBe("#0891b2");
    expect(resolveColor("secondary", palette)).toBe("#16a34a");
    expect(resolveColor("accent", palette)).toBe("#fbbf24");
    expect(resolveColor("danger", palette)).toBe("#FF6B6B");
  });

  test("returns unknown names as-is", () => {
    expect(resolveColor("unknown", palette)).toBe("unknown");
    expect(resolveColor("brand-color", {})).toBe("brand-color");
  });

  test("passes through rgb/rgba values", () => {
    expect(resolveColor("rgb(255,0,0)", palette)).toBe("rgb(255,0,0)");
  });
});

// ── loadBrandCore ────────────────────────────────────────────────────────────

describe("loadBrandCore", () => {
  test("loads core brand with color palette", () => {
    const core = loadBrandCore(PROJECT_ROOT);
    expect(core.color).toBeDefined();
    expect(core.color.palette).toBeDefined();
    expect(core.color.palette.cyan).toBe("#0891b2");
    expect(core.color.palette["dark-cyan"]).toBe("#0e7490");
  });

  test("loads semantic color references", () => {
    const core = loadBrandCore(PROJECT_ROOT);
    expect(core.color.primary).toBe("cyan");
    expect(core.color.foreground).toBe("navy");
    expect(core.color.background).toBe("off-white");
    expect(core.color.secondary).toBe("gray-500");
    expect(core.color.link).toBe("cyan");
  });

  test("loads typography settings", () => {
    const core = loadBrandCore(PROJECT_ROOT);
    expect(core.typography).toBeDefined();
    expect(core.typography?.base?.family).toBe("Inter");
    expect(core.typography?.headings?.family).toBe("Inter");
    expect(core.typography?.monospace?.family).toBe("JetBrains Mono");
  });

  test("loads logo paths", () => {
    const core = loadBrandCore(PROJECT_ROOT);
    expect(core.logo).toBeDefined();
    expect(core.logo?.small).toContain("zopdev-logo");
  });

  test("throws for missing path", () => {
    expect(() => loadBrandCore("/nonexistent")).toThrow("_brand/_brand.yml not found");
  });
});

// ── loadBrandExtended ────────────────────────────────────────────────────────

describe("loadBrandExtended", () => {
  test("loads company info", () => {
    const ext = loadBrandExtended(PROJECT_ROOT);
    expect(ext.company.name).toBe("Zopdev");
    expect(ext.company.tagline).toBe("Cloud Engineering Excellence");
    expect(ext.company.website).toBe("https://zop.dev");
  });

  test("loads 3 products", () => {
    const ext = loadBrandExtended(PROJECT_ROOT);
    expect(ext.products).toHaveLength(3);
    expect(ext.products[0].id).toBe("zopnight");
    expect(ext.products[1].id).toBe("zopcloud");
    expect(ext.products[2].id).toBe("zopday");
  });

  test("loads 3 default ICPs", () => {
    const ext = loadBrandExtended(PROJECT_ROOT);
    expect(ext.default_icps).toHaveLength(3);
    const ids = ext.default_icps.map((icp) => icp.id);
    expect(ids).toContain("devops-engineer");
    expect(ids).toContain("cto");
    expect(ids).toContain("finops-practitioner");
  });

  test("loads authors", () => {
    const ext = loadBrandExtended(PROJECT_ROOT);
    expect(ext.authors).toBeDefined();
    expect(ext.authors!.length).toBeGreaterThanOrEqual(1);
    expect(ext.authors![0].id).toBe("zopdev-team");
  });

  test("loads tone with principles", () => {
    const ext = loadBrandExtended(PROJECT_ROOT);
    expect(ext.tone.voice).toBe("Technical, authoritative, practical");
    expect(ext.tone.principles).toBeDefined();
    expect(ext.tone.principles!.length).toBeGreaterThanOrEqual(3);
  });

  test("loads default CTAs", () => {
    const ext = loadBrandExtended(PROJECT_ROOT);
    expect(ext.default_ctas).toBeDefined();
    expect(ext.default_ctas!.primary!.text).toBe("Download Free PDF");
  });

  test("throws for missing path", () => {
    expect(() => loadBrandExtended("/nonexistent")).toThrow("_brand/_brand-extended.yml not found");
  });
});

// ── loadBrandOverrides ───────────────────────────────────────────────────────

describe("loadBrandOverrides", () => {
  test("returns null for nonexistent slug", () => {
    const result = loadBrandOverrides(PROJECT_ROOT, "nonexistent-book");
    expect(result).toBeNull();
  });

  test("loads overrides for finops-playbook", () => {
    const overrides = loadBrandOverrides(PROJECT_ROOT, "finops-playbook");
    expect(overrides).not.toBeNull();
    expect(overrides!.target_icps).toEqual(["devops-engineer", "finops-practitioner"]);
    expect(overrides!.colors?.primary).toBe("#0e7490");
  });

  test("loads overrides for k8s-cost-guide", () => {
    const overrides = loadBrandOverrides(PROJECT_ROOT, "k8s-cost-guide");
    expect(overrides).not.toBeNull();
    expect(overrides!.target_icps).toEqual(["devops-engineer"]);
    expect(overrides!.colors?.primary).toBe("#0e7490");
  });

  test("loads CTA overrides", () => {
    const overrides = loadBrandOverrides(PROJECT_ROOT, "finops-playbook");
    expect(overrides!.ctas!.primary!.text).toBe("Download the FinOps Playbook");
    expect(overrides!.ctas!.secondary!.url).toBe("https://zopnight.com");
  });

  test("loads featured products", () => {
    const overrides = loadBrandOverrides(PROJECT_ROOT, "finops-playbook");
    expect(overrides!.featured_products).toEqual(["zopnight"]);
  });
});

// ── loadMergedBrand ──────────────────────────────────────────────────────────

describe("loadMergedBrand", () => {
  // Color resolution
  test("resolves primary color from finops-playbook override", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.colors.primary).toBe("#0e7490");
  });

  test("resolves primary color from k8s-cost-guide override", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "k8s-cost-guide");
    expect(merged.resolved.colors.primary).toBe("#0e7490");
  });

  test("resolves foreground from core (not overridden)", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.colors.foreground).toBe("#111827");
  });

  test("resolves background from core (not overridden)", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.colors.background).toBe("#f9fafb");
  });

  test("resolves secondary from core palette", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.colors.secondary).toBe("#6b7280");
  });

  test("palette includes overridden primary alongside base colors", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.colors.palette.primary).toBe("#0e7490");
    expect(merged.resolved.colors.palette.cyan).toBe("#0891b2");
    expect(merged.resolved.colors.palette.navy).toBe("#111827");
  });

  // ICP filtering
  test("filters ICPs to target_icps from finops-playbook override", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.icps).toHaveLength(2);
    const ids = merged.resolved.icps.map((icp) => icp.id);
    expect(ids).toContain("devops-engineer");
    expect(ids).toContain("finops-practitioner");
    expect(ids).not.toContain("cto");
  });

  test("filters ICPs to single target for k8s-cost-guide", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "k8s-cost-guide");
    expect(merged.resolved.icps).toHaveLength(1);
    expect(merged.resolved.icps[0].id).toBe("devops-engineer");
  });

  // Product filtering
  test("returns all products in resolved.products", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.products).toHaveLength(3);
  });

  test("filters featuredProducts for finops-playbook (zopnight only)", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.featuredProducts).toHaveLength(1);
    expect(merged.resolved.featuredProducts[0].id).toBe("zopnight");
  });

  test("filters featuredProducts for k8s-cost-guide (both products)", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "k8s-cost-guide");
    expect(merged.resolved.featuredProducts).toHaveLength(2);
    const ids = merged.resolved.featuredProducts.map((p) => p.id);
    expect(ids).toContain("zopnight");
    expect(ids).toContain("zopcloud");
  });

  // Tone deep merge
  test("overrides tone.voice but preserves tone.principles", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.tone.voice).toBe("Deeply technical, code-heavy, field-tested");
    expect(merged.resolved.tone.principles).toBeDefined();
    expect(merged.resolved.tone.principles!.length).toBeGreaterThanOrEqual(3);
  });

  test("overrides tone.voice for k8s-cost-guide", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "k8s-cost-guide");
    expect(merged.resolved.tone.voice).toBe("Hands-on, container-native, cost-aware");
  });

  // CTA resolution
  test("resolves overridden CTA text for finops-playbook", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.ctas.primary.text).toBe("Download the FinOps Playbook");
    expect(merged.resolved.ctas.secondary?.url).toBe("https://zopnight.com");
  });

  test("resolves overridden CTA text for k8s-cost-guide", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "k8s-cost-guide");
    expect(merged.resolved.ctas.primary.text).toBe("Download the K8s Cost Guide");
  });

  // Author resolution
  test("returns all authors when no authorIds filter", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.authors.length).toBeGreaterThanOrEqual(1);
    expect(merged.resolved.authors[0].id).toBe("zopdev-team");
  });

  test("filters authors by authorIds", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook", ["zopdev-team"]);
    expect(merged.resolved.authors).toHaveLength(1);
    expect(merged.resolved.authors[0].id).toBe("zopdev-team");
  });

  test("returns empty authors for non-matching authorIds", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook", ["nonexistent-author"]);
    expect(merged.resolved.authors).toHaveLength(0);
  });

  // Company passthrough
  test("passes company info through to resolved", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.resolved.company.name).toBe("Zopdev");
    expect(merged.resolved.company.website).toBe("https://zop.dev");
  });

  // Raw layer access
  test("exposes raw core, extended, and overrides", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    expect(merged.core.color.palette.cyan).toBe("#0891b2");
    expect(merged.extended.company.name).toBe("Zopdev");
    expect(merged.overrides).not.toBeNull();
    expect(merged.overrides!.colors?.primary).toBe("#0e7490");
  });

  // Nonexistent slug (no overrides)
  test("works with nonexistent slug (overrides null, base data intact)", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "nonexistent-book");
    expect(merged.overrides).toBeNull();
    expect(merged.resolved.colors.primary).toBe("#0891b2");
    expect(merged.resolved.icps).toHaveLength(3);
    expect(merged.resolved.products).toHaveLength(3);
    expect(merged.resolved.featuredProducts).toHaveLength(3);
    expect(merged.resolved.tone.voice).toBe("Technical, authoritative, practical");
    expect(merged.resolved.ctas.primary.text).toBe("Download Free PDF");
  });
});

// ── buildCssVars ─────────────────────────────────────────────────────────────

describe("buildCssVars", () => {
  test("includes semantic color CSS variables", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    const vars = buildCssVars(merged);
    const names = vars.map((v) => v.name);
    expect(names).toContain("--color-primary");
    expect(names).toContain("--color-foreground");
    expect(names).toContain("--color-background");
    expect(names).toContain("--color-secondary");
    expect(names).toContain("--color-link");
  });

  test("includes palette colors as CSS variables", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    const vars = buildCssVars(merged);
    const names = vars.map((v) => v.name);
    expect(names).toContain("--color-cyan");
    expect(names).toContain("--color-navy");
  });

  test("includes design token CSS variables", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    const vars = buildCssVars(merged);
    const names = vars.map((v) => v.name);
    const hasDesignTokens = names.some(
      (n) => n.startsWith("--font-size-") || n.startsWith("--spacing-") || n.startsWith("--shadow-")
    );
    expect(hasDesignTokens).toBe(true);
  });

  test("uses resolved override color for --color-primary", () => {
    const merged = loadMergedBrand(PROJECT_ROOT, "finops-playbook");
    const vars = buildCssVars(merged);
    const primary = vars.find((v) => v.name === "--color-primary");
    expect(primary?.value).toBe("#0e7490");
  });
});

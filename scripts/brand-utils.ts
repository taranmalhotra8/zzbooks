/**
 * Shared brand configuration utilities.
 * Loads _brand.yml + _brand-extended.yml at the brand level,
 * then merges with per-ebook brand-overrides.yml if present.
 *
 * Merge rules:
 *   - Scalars: ebook override wins
 *   - Objects: deep merge (only specified keys override)
 *   - Arrays: ebook override replaces entirely
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { parse } from "yaml";
import { buildDesignTokenCssVars, getSocialThemeValues } from "./theme-utils.js";

// Re-export theme utilities for convenience
export { buildDesignTokenCssVars, getSocialThemeValues } from "./theme-utils.js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface BrandColors {
  palette: Record<string, string>;
  foreground?: string;
  background?: string;
  primary?: string;
  secondary?: string;
  link?: string;
}

export interface BrandTypography {
  base?: { family?: string; weight?: number; size?: string; "line-height"?: number };
  headings?: { family?: string; weight?: number; color?: string; "line-height"?: number };
  monospace?: { family?: string; weight?: number; size?: string };
  "monospace-inline"?: { color?: string };
}

export interface BrandLogo {
  small?: string;
  medium?: string;
  large?: string;
}

export interface BrandCore {
  color: BrandColors;
  typography?: BrandTypography;
  logo?: BrandLogo;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  url: string;
}

export interface ICP {
  id: string;
  title: string;
  seniority?: string;
  pain_points: string[];
  goals: string[];
}

export interface CTA {
  text: string;
  url?: string;
  style?: string;
}

export interface AuthorProfile {
  id: string;
  name: string;
  title?: string;
  bio?: string;
  avatar_url?: string;
  social?: Record<string, string>;
}

export interface BrandExtended {
  company: {
    name: string;
    tagline: string;
    website: string;
    social?: Record<string, string>;
  };
  products: Product[];
  default_icps: ICP[];
  authors?: AuthorProfile[];
  tone: {
    voice: string;
    principles?: string[];
    avoid?: string[];
  };
  default_ctas?: {
    primary?: CTA;
    secondary?: CTA;
  };
}

export interface BrandOverrides {
  target_icps?: string[];
  colors?: Partial<Record<string, string>>;
  tone?: {
    voice?: string;
    depth?: string;
  };
  featured_products?: string[];
  ctas?: {
    primary?: CTA;
    secondary?: CTA;
  };
  landing?: {
    form_fields?: string[];
  };
}

export interface MergedBrandConfig {
  core: BrandCore;
  extended: BrandExtended;
  overrides: BrandOverrides | null;
  resolved: {
    colors: {
      primary: string;
      foreground: string;
      background: string;
      secondary: string;
      link: string;
      palette: Record<string, string>;
    };
    company: BrandExtended["company"];
    icps: ICP[];
    products: Product[];
    featuredProducts: Product[];
    authors: AuthorProfile[];
    tone: BrandExtended["tone"];
    ctas: { primary: CTA; secondary?: CTA };
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function deepMerge<T extends Record<string, unknown>>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const baseVal = base[key];
    const overVal = override[key];
    if (overVal === undefined) continue;

    if (
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overVal === "object" &&
      overVal !== null &&
      !Array.isArray(overVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      ) as T[keyof T];
    } else {
      // Scalars and arrays: override wins
      result[key] = overVal as T[keyof T];
    }
  }
  return result;
}

export function resolveColor(value: string, palette: Record<string, string>): string {
  if (value.startsWith("#")) return value;
  return palette[value] || value;
}

// ── Loaders ─────────────────────────────────────────────────────────────────

export function loadBrandCore(rootDir: string): BrandCore {
  const path = join(rootDir, "_brand", "_brand.yml");
  if (!existsSync(path)) {
    throw new Error(`_brand/_brand.yml not found at ${path}`);
  }
  return parse(readFileSync(path, "utf-8")) as BrandCore;
}

export function loadBrandExtended(rootDir: string): BrandExtended {
  const path = join(rootDir, "_brand", "_brand-extended.yml");
  if (!existsSync(path)) {
    throw new Error(`_brand/_brand-extended.yml not found at ${path}`);
  }
  return parse(readFileSync(path, "utf-8")) as BrandExtended;
}

export function loadBrandOverrides(rootDir: string, slug: string): BrandOverrides | null {
  const path = join(rootDir, "books", slug, "brand-overrides.yml");
  if (!existsSync(path)) return null;
  return parse(readFileSync(path, "utf-8")) as BrandOverrides;
}

// ── Main merge function ─────────────────────────────────────────────────────

export function loadMergedBrand(rootDir: string, slug: string, authorIds?: string[]): MergedBrandConfig {
  const core = loadBrandCore(rootDir);
  const extended = loadBrandExtended(rootDir);
  const overrides = loadBrandOverrides(rootDir, slug);

  // Build the resolved palette, applying color overrides
  const palette = { ...core.color.palette };
  if (overrides?.colors) {
    for (const [key, value] of Object.entries(overrides.colors)) {
      if (value) palette[key] = value;
    }
  }

  // Resolve semantic colors: override > core > fallback
  const resolveSemantic = (key: "primary" | "secondary" | "foreground" | "background" | "link", fallback: string) => {
    const overrideVal = overrides?.colors?.[key];
    const coreVal = core.color[key];
    const raw = overrideVal || coreVal || fallback;
    return resolveColor(raw, palette);
  };

  const resolvedColors = {
    primary: resolveSemantic("primary", "#0891b2"),
    foreground: resolveSemantic("foreground", "#111827"),
    background: resolveSemantic("background", "#FAFAFA"),
    secondary: resolveSemantic("secondary", "#737373"),
    link: resolveSemantic("link", "#0891b2"),
    palette,
  };

  // Resolve ICPs: filter to target_icps if overrides specify them
  let icps = extended.default_icps;
  if (overrides?.target_icps && overrides.target_icps.length > 0) {
    const targetIds = new Set(overrides.target_icps);
    icps = extended.default_icps.filter((icp) => targetIds.has(icp.id));
  }

  // Resolve products and featured products
  const products = extended.products;
  let featuredProducts = products;
  if (overrides?.featured_products && overrides.featured_products.length > 0) {
    const featuredIds = new Set(overrides.featured_products);
    featuredProducts = products.filter((p) => featuredIds.has(p.id));
  }

  // Resolve tone: deep merge
  const tone = overrides?.tone
    ? deepMerge(extended.tone, overrides.tone as Record<string, unknown>) as BrandExtended["tone"]
    : extended.tone;

  // Resolve CTAs: override > extended defaults
  const defaultCtas = extended.default_ctas || { primary: { text: "Download Free PDF" } };
  const ctas = overrides?.ctas
    ? {
        primary: overrides.ctas.primary || defaultCtas.primary || { text: "Download Free PDF" },
        secondary: overrides.ctas.secondary || defaultCtas.secondary,
      }
    : {
        primary: defaultCtas.primary || { text: "Download Free PDF" },
        secondary: defaultCtas.secondary,
      };

  // Resolve authors: filter by authorIds if specified, otherwise return all
  const allAuthors = extended.authors || [];
  let authors = allAuthors;
  if (authorIds && authorIds.length > 0) {
    const idSet = new Set(authorIds);
    authors = allAuthors.filter((a) => idSet.has(a.id));
  }

  return {
    core,
    extended,
    overrides,
    resolved: {
      colors: resolvedColors,
      company: extended.company,
      icps,
      products,
      featuredProducts,
      authors,
      tone,
      ctas,
    },
  };
}

// ── CSS variable builder ────────────────────────────────────────────────────

export function buildCssVars(config: MergedBrandConfig): Array<{ name: string; value: string }> {
  const vars: Array<{ name: string; value: string }> = [];

  // Palette colors
  for (const [key, value] of Object.entries(config.resolved.colors.palette)) {
    vars.push({ name: `--color-${key}`, value });
  }

  // Semantic colors (resolved)
  vars.push({ name: "--color-primary", value: config.resolved.colors.primary });
  vars.push({ name: "--color-foreground", value: config.resolved.colors.foreground });
  vars.push({ name: "--color-background", value: config.resolved.colors.background });
  vars.push({ name: "--color-secondary", value: config.resolved.colors.secondary });
  vars.push({ name: "--color-link", value: config.resolved.colors.link });

  // Design tokens (font sizes, spacing, shadows, radii, transitions, etc.)
  vars.push(...buildDesignTokenCssVars());

  return vars;
}

/**
 * Consumer-facing theme utilities.
 * Converts design tokens into CSS variables (for landing pages)
 * and flat objects (for Satori social templates).
 */

import {
  typeScale,
  spacing,
  shadows,
  radii,
  transitions,
  letterSpacing,
  lineHeight,
} from "./theme-tokens.js";

// ── CSS Variable Generation ───────────────────────────────────────────────

/**
 * Builds CSS custom property pairs from all design tokens.
 * Returns an array of { name, value } objects matching the format
 * used by buildCssVars() in brand-utils.ts.
 */
export function buildDesignTokenCssVars(): Array<{ name: string; value: string }> {
  const vars: Array<{ name: string; value: string }> = [];

  // Font sizes
  for (const [key, value] of Object.entries(typeScale)) {
    vars.push({ name: `--font-size-${key}`, value });
  }

  // Spacing
  for (const [key, value] of Object.entries(spacing)) {
    vars.push({ name: `--space-${key}`, value });
  }

  // Shadows
  for (const [key, value] of Object.entries(shadows)) {
    vars.push({ name: `--shadow-${key}`, value });
  }

  // Border radius
  for (const [key, value] of Object.entries(radii)) {
    vars.push({ name: `--radius-${key}`, value });
  }

  // Transitions
  for (const [key, value] of Object.entries(transitions)) {
    vars.push({ name: `--transition-${key}`, value });
  }

  // Letter spacing
  for (const [key, value] of Object.entries(letterSpacing)) {
    vars.push({ name: `--letter-spacing-${key}`, value });
  }

  // Line height
  for (const [key, value] of Object.entries(lineHeight)) {
    vars.push({ name: `--line-height-${key}`, value });
  }

  return vars;
}

// ── Social Theme Values ───────────────────────────────────────────────────

export interface SocialThemeColors {
  primary: string;
  foreground: string;
  background: string;
  secondary: string;
  darkPrimary: string;
  lightBackground: string;
  palette: Record<string, string>;
}

/**
 * Produces a flat, Satori-safe color object for social templates.
 * Expands the resolved brand colors with computed derived values:
 *   - darkPrimary: 20% darker version of primary (for gradients)
 *   - lightBackground: tinted background (for content slides)
 */
export function getSocialThemeValues(config: {
  colors: {
    primary: string;
    foreground: string;
    background: string;
    secondary: string;
    palette: Record<string, string>;
  };
}): SocialThemeColors {
  const { primary, foreground, background, secondary, palette } = config.colors;

  return {
    primary,
    foreground,
    background,
    secondary,
    darkPrimary: darkenHex(primary, 0.2),
    lightBackground: mixHex(background, primary, 0.04),
    palette,
  };
}

// ── Color Helpers (internal) ──────────────────────────────────────────────

/** Parses a hex color string into [r, g, b]. */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

/** Converts [r, g, b] back to a hex string. */
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`.toUpperCase();
}

/** Darkens a hex color by a given amount (0–1). */
function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/** Mixes two hex colors. ratio=0 gives colorA, ratio=1 gives colorB. */
function mixHex(colorA: string, colorB: string, ratio: number): string {
  const [rA, gA, bA] = hexToRgb(colorA);
  const [rB, gB, bB] = hexToRgb(colorB);
  return rgbToHex(
    rA + (rB - rA) * ratio,
    gA + (gB - gA) * ratio,
    bA + (bB - bA) * ratio,
  );
}

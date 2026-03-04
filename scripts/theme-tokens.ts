/**
 * Design token definitions — pure data, no I/O.
 *
 * Tokens provide a consistent, reusable set of design primitives
 * for typography, spacing, shadows, radii, transitions, and more.
 *
 * Aligned with ZopNight Design System (2026).
 */

// ── Type Scale (minor third, ratio 1.2) ────────────────────────────────────

export const typeScale = {
  xs: "0.694rem",     // ~11.1px
  sm: "0.833rem",     // ~13.3px
  base: "1rem",       // 16px
  lg: "1.2rem",       // ~19.2px
  xl: "1.44rem",      // ~23px
  "2xl": "1.728rem",  // ~27.6px
  "3xl": "2.074rem",  // ~33.2px
  "4xl": "2.488rem",  // ~39.8px
  "5xl": "2.986rem",  // ~47.8px
} as const;

// ── Spacing (4px base) ────────────────────────────────────────────────────

export const spacing = {
  0: "0",
  1: "0.25rem",   // 4px
  2: "0.5rem",    // 8px
  3: "0.75rem",   // 12px
  4: "1rem",      // 16px
  5: "1.25rem",   // 20px
  6: "1.5rem",    // 24px
  8: "2rem",      // 32px
  10: "2.5rem",   // 40px
  12: "3rem",     // 48px
  16: "4rem",     // 64px
  20: "5rem",     // 80px
  24: "6rem",     // 96px
} as const;

// ── Shadows (ZopNight 5-tier elevation system) ──────────────────────────────

export const shadows = {
  sm: "0px 1px 3px 0px rgba(166, 175, 195, 0.4)",
  md: "0px 5px 12px 0px rgba(0, 0, 0, 0.1)",
  lg: "0px 4px 12px 0px rgba(13, 10, 44, 0.06)",
  xl: "0px 10px 15px 0px rgba(5, 13, 29, 0.18)",
  "2xl": "0px 34px 26px 0px rgba(13, 10, 44, 0.05), 0px 12px 34px 0px rgba(13, 10, 44, 0.08)",
  glow: "0 0 0 1px rgba(8, 145, 178, 0.1)",
} as const;

// ── Border Radius ─────────────────────────────────────────────────────────

export const radii = {
  sm: "0.375rem",  // 6px
  md: "0.5rem",    // 8px
  lg: "0.75rem",   // 12px
  xl: "1rem",      // 16px
  "2xl": "1.5rem", // 24px
  full: "9999px",
} as const;

// ── Transitions ───────────────────────────────────────────────────────────

export const transitions = {
  fast: "150ms ease",
  normal: "250ms ease",
  slow: "350ms ease",
  spring: "500ms cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

// ── Letter Spacing ────────────────────────────────────────────────────────

export const letterSpacing = {
  tight: "-0.025em",
  snug: "-0.015em",
  normal: "0",
  wide: "0.025em",
  wider: "0.05em",
  widest: "0.1em",
} as const;

// ── Line Height ───────────────────────────────────────────────────────────

export const lineHeight = {
  none: "1",
  tight: "1.2",
  snug: "1.375",
  normal: "1.5",
  relaxed: "1.625",
  loose: "2",
} as const;

// ── All tokens bundled for convenience ────────────────────────────────────

export const designTokens = {
  typeScale,
  spacing,
  shadows,
  radii,
  transitions,
  letterSpacing,
  lineHeight,
} as const;

export type DesignTokens = typeof designTokens;

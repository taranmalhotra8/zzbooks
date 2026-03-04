/**
 * Observable JS (OJS) utilities for Quarto ebooks.
 * Provides validation, extraction, and counting of OJS code blocks.
 *
 * Follows the same patterns as brand-utils.ts and content-utils.ts:
 *   - Explicit TypeScript types
 *   - Absolute paths
 *   - Existence checks before loading
 *   - Helpful error messages
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

// ── Types ───────────────────────────────────────────────────────────────────

export interface OJSBlock {
  /** 0-based index of the OJS block within the file */
  index: number;
  /** Raw source code inside the ```{ojs} fence */
  code: string;
  /** Line number where the block starts (1-based) */
  startLine: number;
  /** Line number where the block ends (1-based) */
  endLine: number;
  /** Whether the block has echo: false (hidden source) */
  echoFalse: boolean;
}

export interface OJSValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface OJSBlockValidationResult extends OJSValidationResult {
  /** The block that was validated */
  block: OJSBlock;
}

export interface OJSFileSummary {
  /** Path to the QMD file */
  filePath: string;
  /** Number of OJS blocks found */
  blockCount: number;
  /** OJS blocks extracted */
  blocks: OJSBlock[];
  /** Validation results per block */
  validations: OJSBlockValidationResult[];
  /** Whether any blocks use HTML-only features */
  hasHtmlOnlyFeatures: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

/** OJS APIs that only work in HTML output (not PDF/EPUB) */
const HTML_ONLY_APIS = [
  "Inputs.range",
  "Inputs.select",
  "Inputs.radio",
  "Inputs.checkbox",
  "Inputs.text",
  "Inputs.search",
  "Inputs.table",
  "Inputs.toggle",
  "Inputs.date",
  "Inputs.color",
  "Inputs.file",
  "Inputs.button",
  "viewof",
  "Plot.plot",
];

/** Common syntax issues to detect in OJS blocks */
const SYNTAX_CHECKS: Array<{
  pattern: RegExp;
  message: string;
  severity: "error" | "warning";
}> = [
  {
    pattern: /\bfunction\s*\(/,
    message: "Use arrow functions (=>) instead of 'function' keyword in OJS",
    severity: "warning",
  },
  {
    pattern: /\bvar\s+/,
    message: "Use 'const' or destructuring instead of 'var' in OJS",
    severity: "warning",
  },
  {
    pattern: /^let\s+\w+\s*=[^>]/m,
    message: "Top-level 'let' creates a mutable cell; use const for reactive values",
    severity: "warning",
  },
  {
    pattern: /\bdocument\.(getElementById|querySelector|createElement)/,
    message: "Avoid direct DOM manipulation in OJS; use html template literals instead",
    severity: "error",
  },
  {
    pattern: /\bwindow\.(location|open|alert|confirm|prompt)/,
    message: "Avoid window methods in OJS calculators",
    severity: "error",
  },
  {
    pattern: /\beval\s*\(/,
    message: "Do not use eval() in OJS blocks",
    severity: "error",
  },
  {
    pattern: /\bimport\s*\(/,
    message: "Dynamic import() may not work in all Quarto OJS environments; prefer static require",
    severity: "warning",
  },
];

// ── Extraction ──────────────────────────────────────────────────────────────

/**
 * Regex to match OJS fenced code blocks: ```{ojs} ... ```
 * Captures optional metadata comments (//| key: value) and code body.
 */
const OJS_BLOCK_REGEX = /^```\{ojs\}\s*$/gm;

/**
 * Extracts all OJS code blocks from a QMD file.
 * Returns an empty array if the file has no OJS blocks.
 */
export function extractOJSBlocks(qmdPath: string): OJSBlock[] {
  if (!existsSync(qmdPath)) {
    return [];
  }

  const content = readFileSync(qmdPath, "utf-8");
  const lines = content.split("\n");
  const blocks: OJSBlock[] = [];
  let blockIndex = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect start of OJS block
    if (/^```\{ojs\}\s*$/.test(line)) {
      const startLine = i + 1; // 1-based
      const codeLines: string[] = [];
      i++;

      // Collect lines until closing ```
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }

      const endLine = i + 1; // 1-based (the closing ```)
      const code = codeLines.join("\n");
      const echoFalse = codeLines.some((l) =>
        /^\/\/\|\s*echo:\s*false/.test(l.trim())
      );

      blocks.push({
        index: blockIndex++,
        code,
        startLine,
        endLine,
        echoFalse,
      });
    }

    i++;
  }

  return blocks;
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates a single OJS code block for common issues.
 * Checks for syntax problems, DOM manipulation, and unsafe patterns.
 */
export function validateOJSSyntax(code: string): OJSValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Strip metadata comments (//| key: value) before checking
  const strippedCode = code
    .split("\n")
    .filter((line) => !/^\s*\/\/\|/.test(line))
    .join("\n");

  // Skip empty blocks
  if (strippedCode.trim().length === 0) {
    warnings.push("Empty OJS block");
    return { valid: true, errors, warnings };
  }

  // Run syntax checks
  for (const check of SYNTAX_CHECKS) {
    if (check.pattern.test(strippedCode)) {
      if (check.severity === "error") {
        errors.push(check.message);
      } else {
        warnings.push(check.message);
      }
    }
  }

  // Check for unbalanced braces
  let braceDepth = 0;
  for (const ch of strippedCode) {
    if (ch === "{") braceDepth++;
    if (ch === "}") braceDepth--;
    if (braceDepth < 0) {
      errors.push("Unbalanced braces: extra closing '}'");
      break;
    }
  }
  if (braceDepth > 0) {
    errors.push(`Unbalanced braces: ${braceDepth} unclosed '{'`);
  }

  // Check for unbalanced parentheses
  let parenDepth = 0;
  for (const ch of strippedCode) {
    if (ch === "(") parenDepth++;
    if (ch === ")") parenDepth--;
    if (parenDepth < 0) {
      errors.push("Unbalanced parentheses: extra closing ')'");
      break;
    }
  }
  if (parenDepth > 0) {
    errors.push(`Unbalanced parentheses: ${parenDepth} unclosed '('`);
  }

  // Check for unbalanced brackets
  let bracketDepth = 0;
  for (const ch of strippedCode) {
    if (ch === "[") bracketDepth++;
    if (ch === "]") bracketDepth--;
    if (bracketDepth < 0) {
      errors.push("Unbalanced brackets: extra closing ']'");
      break;
    }
  }
  if (bracketDepth > 0) {
    errors.push(`Unbalanced brackets: ${bracketDepth} unclosed '['`);
  }

  // Check for unterminated template literals
  const backtickCount = (strippedCode.match(/(?<!\\)`/g) || []).length;
  if (backtickCount % 2 !== 0) {
    errors.push("Unterminated template literal (odd number of backticks)");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Checks whether an OJS block uses HTML-only features (Inputs, viewof, Plot).
 * These features work in HTML but produce no output in PDF/EPUB.
 */
export function hasHtmlOnlyFeatures(code: string): boolean {
  return HTML_ONLY_APIS.some((api) => code.includes(api));
}

/**
 * Validates all OJS blocks in a QMD file.
 * Returns a summary with per-block validation and HTML-only feature detection.
 */
export function validateOJSFile(qmdPath: string): OJSFileSummary {
  const blocks = extractOJSBlocks(qmdPath);
  const validations: OJSBlockValidationResult[] = [];
  let fileHasHtmlOnly = false;

  for (const block of blocks) {
    const result = validateOJSSyntax(block.code);

    if (hasHtmlOnlyFeatures(block.code)) {
      fileHasHtmlOnly = true;
      result.warnings.push(
        "Block uses HTML-only features (Inputs/viewof/Plot). " +
          "Ensure a static fallback is provided for PDF/EPUB."
      );
    }

    validations.push({ ...result, block });
  }

  return {
    filePath: qmdPath,
    blockCount: blocks.length,
    blocks,
    validations,
    hasHtmlOnlyFeatures: fileHasHtmlOnly,
  };
}

// ── Counting ────────────────────────────────────────────────────────────────

/**
 * Counts the total number of OJS interactive elements (calculators) in an ebook.
 * Scans all .qmd files in the ebook's directory.
 */
export function countInteractiveElements(
  rootDir: string,
  slug: string
): number {
  const bookDir = join(rootDir, "books", slug);
  if (!existsSync(bookDir)) return 0;

  let total = 0;

  // Scan top-level QMD files
  const topFiles = readdirSync(bookDir).filter((f) => f.endsWith(".qmd"));
  for (const file of topFiles) {
    total += extractOJSBlocks(join(bookDir, file)).length;
  }

  // Scan chapters/ subdirectory
  const chaptersDir = join(bookDir, "chapters");
  if (existsSync(chaptersDir)) {
    const chapterFiles = readdirSync(chaptersDir).filter((f) =>
      f.endsWith(".qmd")
    );
    for (const file of chapterFiles) {
      total += extractOJSBlocks(join(chaptersDir, file)).length;
    }
  }

  return total;
}

/**
 * Gets a detailed breakdown of OJS usage across all chapters in an ebook.
 * Returns per-file summaries with validation results.
 */
export function getOJSSummary(
  rootDir: string,
  slug: string
): OJSFileSummary[] {
  const bookDir = join(rootDir, "books", slug);
  if (!existsSync(bookDir)) return [];

  const summaries: OJSFileSummary[] = [];

  // Scan top-level QMD files
  const topFiles = readdirSync(bookDir).filter((f) => f.endsWith(".qmd"));
  for (const file of topFiles) {
    const filePath = join(bookDir, file);
    const summary = validateOJSFile(filePath);
    if (summary.blockCount > 0) {
      summaries.push(summary);
    }
  }

  // Scan chapters/ subdirectory
  const chaptersDir = join(bookDir, "chapters");
  if (existsSync(chaptersDir)) {
    const chapterFiles = readdirSync(chaptersDir).filter((f) =>
      f.endsWith(".qmd")
    );
    for (const file of chapterFiles) {
      const filePath = join(chaptersDir, file);
      const summary = validateOJSFile(filePath);
      if (summary.blockCount > 0) {
        summaries.push(summary);
      }
    }
  }

  return summaries;
}

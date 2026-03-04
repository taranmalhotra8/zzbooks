#!/usr/bin/env bun
/**
 * Code validation utilities for ebook content.
 * Validates code blocks in Terraform (HCL), Python, YAML, and SQL.
 * Also detects languages and suggests missing syntax highlighting tags.
 *
 * Usage:
 *   bun run scripts/code-validation.ts <slug>
 *   bun run scripts/code-validation.ts               # validates all ebooks
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";
import { parse as parseYaml } from "yaml";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ───────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CodeBlock {
  language: string;
  code: string;
  startLine: number;
  endLine: number;
  file: string;
}

export interface Suggestion {
  file: string;
  line: number;
  currentTag: string;
  suggestedTag: string;
  reason: string;
}

export interface CodeValidationReport {
  slug: string;
  timestamp: string;
  totalBlocks: number;
  validatedBlocks: number;
  passedBlocks: number;
  failedBlocks: number;
  results: Array<{
    file: string;
    language: string;
    startLine: number;
    valid: boolean;
    errors: string[];
    warnings: string[];
  }>;
  suggestions: Suggestion[];
}

// ── Language Detection ──────────────────────────────────────────────────────

const LANGUAGE_SIGNATURES: Array<{ pattern: RegExp; language: string }> = [
  // Terraform / HCL
  { pattern: /\b(resource|variable|output|data|provider|module|terraform|locals)\s+"[^"]*"\s+("[^"]*"\s+)?\{/m, language: "terraform" },
  { pattern: /\b(resource|variable|output|data|provider|module|terraform|locals)\s+\{/m, language: "terraform" },

  // Python
  { pattern: /^(import |from \w+ import |def \w+\(|class \w+[\(:]|if __name__)/m, language: "python" },
  { pattern: /\bprint\s*\(|\.append\(|\.items\(\)|range\(/m, language: "python" },

  // SQL
  { pattern: /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE)\b/i, language: "sql" },
  { pattern: /\bWHERE\b.*\bAND\b|\bJOIN\b.*\bON\b|\bGROUP BY\b/i, language: "sql" },

  // YAML (but avoid matching prose)
  { pattern: /^[\w-]+:\s*\n(\s+[\w-]+:\s*.+\n){2,}/m, language: "yaml" },

  // JSON
  { pattern: /^\s*\{[\s\S]*"[\w-]+":\s*["\d\[{]/m, language: "json" },

  // Bash/Shell
  { pattern: /^(#!\/bin\/(ba)?sh|export \w+=|apt-get |yum |brew |curl |wget |chmod )/m, language: "bash" },
  { pattern: /^\$\s+\w+/m, language: "bash" },

  // Go
  { pattern: /^package \w+|func \w+\(|import \(|fmt\.\w+/m, language: "go" },
];

export function detectLanguage(code: string): string {
  for (const { pattern, language } of LANGUAGE_SIGNATURES) {
    if (pattern.test(code)) return language;
  }
  return "unknown";
}

// ── Validators ──────────────────────────────────────────────────────────────

/**
 * Validates Terraform/HCL syntax with basic structural checks.
 * Checks bracket matching and common structural patterns.
 */
export function validateTerraform(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check brace matching
  const openBraces = (code.match(/\{/g) || []).length;
  const closeBraces = (code.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(`Mismatched braces: ${openBraces} opening, ${closeBraces} closing`);
  }

  // Check for unclosed strings
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Skip comments
    if (line.startsWith("#") || line.startsWith("//")) continue;

    // Count non-escaped quotes
    const quoteCount = (line.match(/(?<!\\)"/g) || []).length;
    // Allow heredoc-style strings
    if (quoteCount % 2 !== 0 && !line.includes("<<") && !line.includes("EOF")) {
      warnings.push(`Line ${i + 1}: Possible unclosed string`);
    }
  }

  // Check for common Terraform patterns
  const hasBlock = /\b(resource|variable|output|data|provider|module|terraform|locals)\s/m.test(code);
  if (!hasBlock) {
    warnings.push("No standard Terraform block types found (resource, variable, output, etc.)");
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates Python syntax with structural checks.
 * Checks indentation consistency, bracket matching, and common issues.
 */
export function validatePython(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check parenthesis matching
  const pairs: Array<[string, string]> = [["(", ")"], ["[", "]"], ["{", "}"]];
  for (const [open, close] of pairs) {
    const openCount = (code.match(new RegExp(`\\${open}`, "g")) || []).length;
    const closeCount = (code.match(new RegExp(`\\${close}`, "g")) || []).length;
    if (openCount !== closeCount) {
      errors.push(`Mismatched '${open}${close}': ${openCount} opening, ${closeCount} closing`);
    }
  }

  // Check for mixed tabs and spaces
  const lines = code.split("\n");
  let hasTab = false;
  let hasSpace = false;
  for (const line of lines) {
    if (line.startsWith("\t")) hasTab = true;
    if (line.match(/^ {2,}/)) hasSpace = true;
  }
  if (hasTab && hasSpace) {
    warnings.push("Mixed tabs and spaces for indentation");
  }

  // Check colon at end of control flow
  const controlFlowRe = /^\s*(def|class|if|elif|else|for|while|try|except|finally|with|async)\b/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimEnd();
    if (controlFlowRe.test(line)) {
      // Allow multiline statements (ending with \)
      if (!line.endsWith(":") && !line.endsWith("\\") && !line.endsWith(",")) {
        warnings.push(`Line ${i + 1}: Control flow statement may be missing trailing colon`);
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates YAML syntax using the yaml parser.
 */
export function validateYAML(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    parseYaml(code);
  } catch (e) {
    const msg = (e as Error).message;
    errors.push(`YAML parse error: ${msg}`);
  }

  // Check for tab indentation (invalid in YAML)
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("\t")) {
      errors.push(`Line ${i + 1}: Tabs are not allowed in YAML (use spaces)`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validates SQL syntax with basic structural checks.
 */
export function validateSQL(code: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check parenthesis matching
  const openParens = (code.match(/\(/g) || []).length;
  const closeParens = (code.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    errors.push(`Mismatched parentheses: ${openParens} opening, ${closeParens} closing`);
  }

  // Check for common SQL patterns
  const hasStatement = /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i.test(code);
  if (!hasStatement) {
    warnings.push("No standard SQL statement keywords found");
  }

  // Check for unclosed string literals (single quotes)
  const singleQuotes = (code.match(/'/g) || []).length;
  if (singleQuotes % 2 !== 0) {
    warnings.push("Odd number of single quotes (possible unclosed string literal)");
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ── Suggestion Engine ───────────────────────────────────────────────────────

export function suggestSyntaxHighlighting(qmdPath: string): Suggestion[] {
  if (!existsSync(qmdPath)) return [];

  const content = readFileSync(qmdPath, "utf-8");
  const suggestions: Suggestion[] = [];

  // Find code blocks without language tags or with Quarto-only tags
  const codeBlockRe = /```(\{?[\w.-]*\}?)?\n([\s\S]*?)```/g;
  const lines = content.split("\n");

  let match: RegExpExecArray | null;
  while ((match = codeBlockRe.exec(content)) !== null) {
    const tag = (match[1] || "").replace(/[{}]/g, "").trim();
    const code = match[2];

    // Count lines before this match to get the line number
    const preMatch = content.substring(0, match.index);
    const lineNumber = preMatch.split("\n").length;

    if (!tag || tag === "") {
      const detected = detectLanguage(code);
      if (detected !== "unknown") {
        suggestions.push({
          file: qmdPath,
          line: lineNumber,
          currentTag: "(none)",
          suggestedTag: detected,
          reason: `Code block appears to be ${detected} but has no language tag`,
        });
      }
    }
  }

  return suggestions;
}

// ── Extract Code Blocks ─────────────────────────────────────────────────────

function extractCodeBlocks(qmdPath: string): CodeBlock[] {
  if (!existsSync(qmdPath)) return [];

  const content = readFileSync(qmdPath, "utf-8");
  const blocks: CodeBlock[] = [];

  const codeBlockRe = /```(\{?[\w.-]*\}?)?\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRe.exec(content)) !== null) {
    let lang = (match[1] || "").replace(/[{}]/g, "").trim();
    const code = match[2];

    // Count lines for position
    const preMatch = content.substring(0, match.index);
    const startLine = preMatch.split("\n").length;
    const endLine = startLine + code.split("\n").length;

    if (!lang) {
      lang = detectLanguage(code);
    }

    blocks.push({ language: lang, code, startLine, endLine, file: qmdPath });
  }

  return blocks;
}

// ── Validate All Code in an Ebook ───────────────────────────────────────────

const VALIDATORS: Record<string, (code: string) => ValidationResult> = {
  terraform: validateTerraform,
  hcl: validateTerraform,
  tf: validateTerraform,
  python: validatePython,
  py: validatePython,
  yaml: validateYAML,
  yml: validateYAML,
  sql: validateSQL,
};

export function validateEbookCode(slug: string): CodeValidationReport {
  const chaptersDir = join(PROJECT_ROOT, "books", slug, "chapters");
  const chapterFiles = existsSync(chaptersDir)
    ? readdirSync(chaptersDir)
        .filter((f) => f.endsWith(".qmd") || f.endsWith(".md"))
        .sort()
        .map((f) => join(chaptersDir, f))
    : [];

  const results: CodeValidationReport["results"] = [];
  const allSuggestions: Suggestion[] = [];
  let totalBlocks = 0;
  let validatedBlocks = 0;
  let passedBlocks = 0;
  let failedBlocks = 0;

  for (const chapterPath of chapterFiles) {
    const blocks = extractCodeBlocks(chapterPath);
    const suggestions = suggestSyntaxHighlighting(chapterPath);
    allSuggestions.push(...suggestions);

    for (const block of blocks) {
      totalBlocks++;
      const validator = VALIDATORS[block.language.toLowerCase()];

      if (validator) {
        validatedBlocks++;
        const result = validator(block.code);

        if (result.valid) {
          passedBlocks++;
        } else {
          failedBlocks++;
        }

        results.push({
          file: basename(block.file, ".qmd"),
          language: block.language,
          startLine: block.startLine,
          valid: result.valid,
          errors: result.errors,
          warnings: result.warnings,
        });
      }
    }
  }

  return {
    slug,
    timestamp: new Date().toISOString(),
    totalBlocks,
    validatedBlocks,
    passedBlocks,
    failedBlocks,
    results,
    suggestions: allSuggestions,
  };
}

// ── Human-Readable Report ───────────────────────────────────────────────────

function formatReport(report: CodeValidationReport): string {
  const lines: string[] = [];
  const hr = "─".repeat(70);

  lines.push(hr);
  lines.push(`  CODE VALIDATION REPORT: ${report.slug}`);
  lines.push(`  ${report.timestamp}`);
  lines.push(hr);
  lines.push("");
  lines.push(`  Total code blocks: ${report.totalBlocks}`);
  lines.push(`  Validated: ${report.validatedBlocks} (${report.totalBlocks - report.validatedBlocks} skipped — unsupported language)`);
  lines.push(`  Passed: ${report.passedBlocks}`);
  lines.push(`  Failed: ${report.failedBlocks}`);
  lines.push("");

  // Failed validations
  const failures = report.results.filter((r) => !r.valid);
  if (failures.length > 0) {
    lines.push("  FAILURES:");
    for (const f of failures) {
      lines.push(`    ${f.file}:${f.startLine} [${f.language}]`);
      for (const e of f.errors) {
        lines.push(`      ERROR: ${e}`);
      }
      for (const w of f.warnings) {
        lines.push(`      WARN: ${w}`);
      }
    }
    lines.push("");
  }

  // Warnings from passing blocks
  const withWarnings = report.results.filter((r) => r.valid && r.warnings.length > 0);
  if (withWarnings.length > 0) {
    lines.push("  WARNINGS:");
    for (const w of withWarnings) {
      lines.push(`    ${w.file}:${w.startLine} [${w.language}]`);
      for (const warning of w.warnings) {
        lines.push(`      WARN: ${warning}`);
      }
    }
    lines.push("");
  }

  // Suggestions
  if (report.suggestions.length > 0) {
    lines.push("  SUGGESTIONS:");
    for (const s of report.suggestions) {
      lines.push(`    ${basename(s.file)}:${s.line}: ${s.reason} (suggest: \`\`\`${s.suggestedTag})`);
    }
    lines.push("");
  }

  lines.push(hr);
  return lines.join("\n");
}

// ── CLI Entry Point ─────────────────────────────────────────────────────────

function getEbookSlugs(): string[] {
  const calendarPath = join(PROJECT_ROOT, "calendar.yml");
  if (!existsSync(calendarPath)) return [];

  try {
    const cal = parseYaml(readFileSync(calendarPath, "utf-8")) as { ebooks?: Array<{ slug: string }> };
    return (cal.ebooks || []).map((e) => e.slug);
  } catch {
    return [];
  }
}

if (import.meta.main) {
  const slug = process.argv[2];
  const slugs = slug ? [slug] : getEbookSlugs();

  if (slugs.length === 0) {
    console.error("No ebooks found. Usage: bun run scripts/code-validation.ts [slug]");
    process.exit(1);
  }

  for (const s of slugs) {
    const bookDir = join(PROJECT_ROOT, "books", s);
    if (!existsSync(bookDir)) {
      console.error(`Book directory not found: books/${s}/`);
      continue;
    }

    console.log(`\nValidating code in ${s}...`);
    const report = validateEbookCode(s);

    // Write JSON report
    const outputDir = join(PROJECT_ROOT, "_output", "audit");
    mkdirSync(outputDir, { recursive: true });
    const jsonPath = join(outputDir, `${s}-code-validation.json`);
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));

    // Print human-readable summary
    console.log(formatReport(report));
    console.log(`  JSON report: ${jsonPath}`);
  }
}

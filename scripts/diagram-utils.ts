/**
 * D2 Diagram utilities.
 * Validates, lists, copies, and renders D2 diagram files.
 *
 * Follows the same patterns as brand-utils.ts:
 *   - Explicit TypeScript types
 *   - Absolute paths
 *   - Existence checks before loading
 *   - Helpful error messages
 */

import { readFileSync, existsSync, readdirSync, mkdirSync, copyFileSync } from "fs";
import { join, basename } from "path";
import { execSync } from "child_process";

// ── Types ───────────────────────────────────────────────────────────────────

export interface DiagramValidation {
  path: string;
  valid: boolean;
  errors: string[];
}

export interface TemplateInfo {
  name: string;
  filename: string;
  path: string;
  description: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const TEMPLATES_DIR = "_diagrams/templates";
const D2_EXTENSION = ".d2";

// Template descriptions extracted from the leading comment in each file
const TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  "cloud-architecture": "Cloud infrastructure layout with cost annotations",
  "finops-workflow": "FinOps lifecycle — Inform, Optimize, Operate phases",
  "before-after-optimization": "Side-by-side cost optimization impact",
  "multi-cloud-comparison": "AWS vs GCP vs Azure cost/feature comparison",
  "data-pipeline": "ETL/analytics data flow with cost awareness",
};

// ── D2 CLI detection ────────────────────────────────────────────────────────

export function d2Available(): boolean {
  try {
    execSync("d2 --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// ── Functions ───────────────────────────────────────────────────────────────

/**
 * Validates a .d2 file using the D2 CLI.
 * Returns validation result with any errors.
 */
export function validateD2Syntax(filePath: string): DiagramValidation {
  if (!existsSync(filePath)) {
    return {
      path: filePath,
      valid: false,
      errors: [`File not found: ${filePath}`],
    };
  }

  if (!d2Available()) {
    return {
      path: filePath,
      valid: false,
      errors: ["D2 CLI not installed. Install with: brew install d2"],
    };
  }

  try {
    execSync(`d2 validate "${filePath}"`, {
      stdio: "pipe",
      encoding: "utf-8",
    });
    return { path: filePath, valid: true, errors: [] };
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr || "";
    const errors = stderr
      .split("\n")
      .filter((line) => line.startsWith("err:"))
      .map((line) => line.replace(/^err:\s*/, "").trim());
    return {
      path: filePath,
      valid: false,
      errors: errors.length > 0 ? errors : ["D2 validation failed"],
    };
  }
}

/**
 * Lists all available D2 diagram templates from _diagrams/templates/.
 */
export function listDiagramTemplates(rootDir: string): TemplateInfo[] {
  const templatesPath = join(rootDir, TEMPLATES_DIR);
  if (!existsSync(templatesPath)) {
    return [];
  }

  const files = readdirSync(templatesPath).filter((f) =>
    f.endsWith(D2_EXTENSION)
  );

  return files.map((filename) => {
    const name = filename.replace(D2_EXTENSION, "");
    return {
      name,
      filename,
      path: join(templatesPath, filename),
      description: TEMPLATE_DESCRIPTIONS[name] || "",
    };
  });
}

/**
 * Copies a diagram template into a book's diagrams/ directory.
 * Creates the diagrams/ directory if it does not exist.
 */
export function copyTemplateToBook(
  rootDir: string,
  templateName: string,
  slug: string
): string {
  const filename = templateName.endsWith(D2_EXTENSION)
    ? templateName
    : `${templateName}${D2_EXTENSION}`;

  const srcPath = join(rootDir, TEMPLATES_DIR, filename);
  if (!existsSync(srcPath)) {
    throw new Error(
      `Template not found: ${filename}. ` +
        `Available templates: ${listDiagramTemplates(rootDir)
          .map((t) => t.name)
          .join(", ")}`
    );
  }

  const bookDiagramsDir = join(rootDir, "books", slug, "diagrams");
  if (!existsSync(bookDiagramsDir)) {
    mkdirSync(bookDiagramsDir, { recursive: true });
  }

  const destPath = join(bookDiagramsDir, basename(filename));
  copyFileSync(srcPath, destPath);
  return destPath;
}

/**
 * Renders a D2 file to SVG and returns the SVG content.
 * Requires the D2 CLI to be installed.
 */
export function renderD2Preview(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`D2 file not found: ${filePath}`);
  }

  if (!d2Available()) {
    throw new Error("D2 CLI not installed. Install with: brew install d2");
  }

  try {
    const svg = execSync(`d2 "${filePath}" -`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return svg;
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string }).stderr || "";
    throw new Error(
      `Failed to render ${filePath}: ${stderr.trim()}`
    );
  }
}

/**
 * Finds all .d2 files within a book directory (including subdirectories).
 */
export function findBookDiagrams(rootDir: string, slug: string): string[] {
  const bookDir = join(rootDir, "books", slug);
  if (!existsSync(bookDir)) return [];

  const diagrams: string[] = [];
  const diagramsDir = join(bookDir, "diagrams");

  if (existsSync(diagramsDir)) {
    const files = readdirSync(diagramsDir).filter((f) =>
      f.endsWith(D2_EXTENSION)
    );
    diagrams.push(...files.map((f) => join(diagramsDir, f)));
  }

  return diagrams;
}

/**
 * Validates all D2 diagrams in a book directory.
 * Returns an array of validation results.
 */
export function validateBookDiagrams(
  rootDir: string,
  slug: string
): DiagramValidation[] {
  const diagrams = findBookDiagrams(rootDir, slug);
  return diagrams.map((d) => validateD2Syntax(d));
}

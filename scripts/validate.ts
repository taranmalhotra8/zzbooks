#!/usr/bin/env bun
/**
 * Validates calendar.yml, per-ebook ebook.yml, brand configs, and brand overrides.
 * Usage: bun run scripts/validate.ts
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { parse } from "yaml";
import { buildDesignTokenCssVars } from "./theme-utils.js";
import { getOJSSummary } from "./ojs-utils.js";
import { findBookDiagrams, validateD2Syntax, d2Available } from "./diagram-utils.js";
import { auditEbook } from "./content-audit.js";
import { validateEbookCode } from "./code-validation.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

interface CalendarEbook {
  slug: string;
  title: string;
  subtitle?: string;
  authors?: string[];
  status: string;
  scheduled_publish?: string;
  tags?: string[];
  outputs?: Record<string, boolean>;
  landing?: {
    headline?: string;
    description?: string;
    cta_text?: string;
    form_action?: string;
  };
}

interface Calendar {
  ebooks: CalendarEbook[];
}

interface EbookManifest {
  meta: {
    slug: string;
    title: string;
    subtitle?: string;
    version?: string;
    authors?: string[];
  };
  chapters?: Array<{
    id: string;
    title: string;
    summary?: string;
    difficulty?: string;
    reading_time_minutes?: number;
    learning_objectives?: string[];
    key_takeaways?: string[];
    tags?: string[];
    prerequisites?: string[];
  }>;
  social?: Record<string, unknown>;
}

interface BrandExtended {
  company?: {
    name?: string;
    tagline?: string;
    website?: string;
  };
  products?: Array<{
    id?: string;
    name?: string;
    description?: string;
    url?: string;
  }>;
  default_icps?: Array<{
    id?: string;
    title?: string;
    pain_points?: string[];
    goals?: string[];
  }>;
  authors?: Array<{
    id?: string;
    name?: string;
    title?: string;
    bio?: string;
    avatar_url?: string;
    social?: Record<string, string>;
  }>;
  tone?: {
    voice?: string;
  };
}

interface BrandOverrides {
  target_icps?: string[];
  colors?: Record<string, string>;
  tone?: Record<string, string>;
  featured_products?: string[];
  ctas?: Record<string, unknown>;
  landing?: Record<string, unknown>;
}

const VALID_STATUSES = ["draft", "in-progress", "review", "published", "archived"];

let errors: string[] = [];
let warnings: string[] = [];

function error(msg: string) {
  errors.push(`ERROR: ${msg}`);
}

function warn(msg: string) {
  warnings.push(`WARN: ${msg}`);
}

// --- Validate calendar.yml ---

const calendarPath = join(PROJECT_ROOT, "calendar.yml");

if (!existsSync(calendarPath)) {
  error("calendar.yml not found");
  printResults();
  process.exit(1);
}

console.log("Validating calendar.yml...");

const calendarContent = readFileSync(calendarPath, "utf-8");
let calendar: Calendar;

try {
  calendar = parse(calendarContent) as Calendar;
} catch (e) {
  error(`calendar.yml is not valid YAML: ${e}`);
  printResults();
  process.exit(1);
}

if (!calendar.ebooks || !Array.isArray(calendar.ebooks)) {
  error("calendar.yml must have an 'ebooks' array");
  printResults();
  process.exit(1);
}

const slugs = new Set<string>();

for (const ebook of calendar.ebooks) {
  const prefix = `calendar.yml [${ebook.slug || "unknown"}]`;

  // Required fields
  if (!ebook.slug) {
    error(`${prefix}: missing 'slug'`);
    continue;
  }

  if (slugs.has(ebook.slug)) {
    error(`${prefix}: duplicate slug '${ebook.slug}'`);
  }
  slugs.add(ebook.slug);

  if (!ebook.title) {
    error(`${prefix}: missing 'title'`);
  }

  if (!ebook.status) {
    error(`${prefix}: missing 'status'`);
  } else if (!VALID_STATUSES.includes(ebook.status)) {
    error(`${prefix}: invalid status '${ebook.status}'. Must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  // Check book directory exists
  const bookDir = join(PROJECT_ROOT, "books", ebook.slug);
  if (!existsSync(bookDir)) {
    warn(`${prefix}: book directory not found at books/${ebook.slug}/`);
  }

  // Check _quarto.yml exists
  const quartoPath = join(bookDir, "_quarto.yml");
  if (existsSync(bookDir) && !existsSync(quartoPath)) {
    error(`${prefix}: _quarto.yml not found in books/${ebook.slug}/`);
  }

  // Validate outputs if present
  if (ebook.outputs) {
    const validOutputs = [
      "html", "pdf", "epub",
      "landing_page", "linkedin_carousel",
      "instagram_posts", "og_image",
    ];
    for (const key of Object.keys(ebook.outputs)) {
      if (!validOutputs.includes(key)) {
        warn(`${prefix}: unknown output key '${key}'`);
      }
    }
  }
}

// --- Pre-load brand extended data for cross-referencing ---

const brandExtPath = join(PROJECT_ROOT, "_brand", "_brand-extended.yml");
let brandExtData: BrandExtended | null = null;
if (existsSync(brandExtPath)) {
  try {
    brandExtData = parse(readFileSync(brandExtPath, "utf-8")) as BrandExtended;
  } catch {
    // Will be reported during brand validation below
  }
}

// --- Validate per-ebook ebook.yml files ---

for (const slug of slugs) {
  const ebookYmlPath = join(PROJECT_ROOT, "books", slug, "ebook.yml");

  if (!existsSync(ebookYmlPath)) {
    warn(`books/${slug}/ebook.yml not found`);
    continue;
  }

  console.log(`Validating books/${slug}/ebook.yml...`);

  const ebookContent = readFileSync(ebookYmlPath, "utf-8");
  let ebookManifest: EbookManifest;

  try {
    ebookManifest = parse(ebookContent) as EbookManifest;
  } catch (e) {
    error(`books/${slug}/ebook.yml is not valid YAML: ${e}`);
    continue;
  }

  const prefix = `books/${slug}/ebook.yml`;

  if (!ebookManifest.meta) {
    error(`${prefix}: missing 'meta' section`);
    continue;
  }

  if (!ebookManifest.meta.slug) {
    error(`${prefix}: missing 'meta.slug'`);
  } else if (ebookManifest.meta.slug !== slug) {
    error(`${prefix}: meta.slug '${ebookManifest.meta.slug}' does not match directory slug '${slug}'`);
  }

  if (!ebookManifest.meta.title) {
    error(`${prefix}: missing 'meta.title'`);
  }

  // Validate meta.authors reference valid author IDs from _brand-extended.yml
  if (ebookManifest.meta.authors && brandExtData?.authors) {
    const validAuthorIds = new Set(brandExtData.authors.map((a) => a.id));
    for (const authorId of ebookManifest.meta.authors) {
      if (!validAuthorIds.has(authorId)) {
        error(`${prefix}: meta.authors references unknown author '${authorId}'. Valid IDs: ${[...validAuthorIds].join(", ")}`);
      }
    }
  }

  // Validate enriched chapter metadata
  const VALID_DIFFICULTIES = ["beginner", "intermediate", "advanced"];

  if (ebookManifest.chapters && Array.isArray(ebookManifest.chapters)) {
    const chapterIds = new Set(ebookManifest.chapters.map((ch) => ch.id));

    for (const chapter of ebookManifest.chapters) {
      const chPrefix = `${prefix} [${chapter.id}]`;

      // Validate difficulty
      if (chapter.difficulty !== undefined) {
        if (!VALID_DIFFICULTIES.includes(chapter.difficulty)) {
          error(`${chPrefix}: invalid difficulty '${chapter.difficulty}'. Must be one of: ${VALID_DIFFICULTIES.join(", ")}`);
        }
      }

      // Validate reading_time_minutes
      if (chapter.reading_time_minutes !== undefined) {
        if (typeof chapter.reading_time_minutes !== "number" || chapter.reading_time_minutes <= 0) {
          error(`${chPrefix}: reading_time_minutes must be a positive number`);
        }
      }

      // Validate prerequisites reference valid chapter IDs within the same ebook
      if (chapter.prerequisites && Array.isArray(chapter.prerequisites)) {
        for (const prereq of chapter.prerequisites) {
          if (!chapterIds.has(prereq)) {
            error(`${chPrefix}: prerequisite '${prereq}' is not a valid chapter ID in this ebook`);
          }
          if (prereq === chapter.id) {
            error(`${chPrefix}: chapter cannot be a prerequisite of itself`);
          }
        }
      }

      // Warn if learning_objectives or key_takeaways are empty arrays
      if (chapter.learning_objectives && chapter.learning_objectives.length === 0) {
        warn(`${chPrefix}: learning_objectives is empty (consider adding objectives or removing the field)`);
      }
      if (chapter.key_takeaways && chapter.key_takeaways.length === 0) {
        warn(`${chPrefix}: key_takeaways is empty (consider adding takeaways or removing the field)`);
      }
    }
  }
}

// --- Validate brand files ---

const brandPath = join(PROJECT_ROOT, "_brand", "_brand.yml");
if (!existsSync(brandPath)) {
  error("_brand/_brand.yml not found");
}

if (!existsSync(brandExtPath)) {
  warn("_brand/_brand-extended.yml not found (expected for brand system)");
} else {
  console.log("Validating _brand/_brand-extended.yml...");

  try {
    const brandExtContent = readFileSync(brandExtPath, "utf-8");
    const brandExt = parse(brandExtContent) as BrandExtended;

    if (!brandExt.company) {
      error("_brand-extended.yml: missing 'company' section");
    } else {
      if (!brandExt.company.name) error("_brand-extended.yml: missing 'company.name'");
      if (!brandExt.company.website) warn("_brand-extended.yml: missing 'company.website'");
    }

    if (!brandExt.products || !Array.isArray(brandExt.products)) {
      warn("_brand-extended.yml: missing or empty 'products' array");
    } else {
      const productIds = new Set<string>();
      for (const product of brandExt.products) {
        if (!product.id) {
          error("_brand-extended.yml: product missing 'id'");
        } else {
          if (productIds.has(product.id)) {
            error(`_brand-extended.yml: duplicate product id '${product.id}'`);
          }
          productIds.add(product.id);
        }
        if (!product.name) error("_brand-extended.yml: product missing 'name'");
      }
    }

    if (!brandExt.default_icps || !Array.isArray(brandExt.default_icps)) {
      warn("_brand-extended.yml: missing or empty 'default_icps' array");
    } else {
      const icpIds = new Set<string>();
      for (const icp of brandExt.default_icps) {
        if (!icp.id) {
          error("_brand-extended.yml: ICP missing 'id'");
        } else {
          if (icpIds.has(icp.id)) {
            error(`_brand-extended.yml: duplicate ICP id '${icp.id}'`);
          }
          icpIds.add(icp.id);
        }
        if (!icp.title) error("_brand-extended.yml: ICP missing 'title'");
      }
    }

    // Validate authors
    if (brandExt.authors && Array.isArray(brandExt.authors)) {
      const authorIds = new Set<string>();
      for (const author of brandExt.authors) {
        if (!author.id) {
          error("_brand-extended.yml: author missing 'id'");
        } else {
          if (authorIds.has(author.id)) {
            error(`_brand-extended.yml: duplicate author id '${author.id}'`);
          }
          authorIds.add(author.id);
        }
        if (!author.name) error("_brand-extended.yml: author missing 'name'");
      }
    }

    if (!brandExt.tone) {
      warn("_brand-extended.yml: missing 'tone' section");
    }
  } catch (e) {
    error(`_brand-extended.yml is not valid YAML: ${e}`);
  }
}

// --- Validate per-ebook brand-overrides.yml ---

for (const slug of slugs) {
  const overridesPath = join(PROJECT_ROOT, "books", slug, "brand-overrides.yml");
  if (!existsSync(overridesPath)) continue;

  console.log(`Validating books/${slug}/brand-overrides.yml...`);

  let overrides: BrandOverrides;
  try {
    overrides = parse(readFileSync(overridesPath, "utf-8")) as BrandOverrides;
  } catch (e) {
    error(`books/${slug}/brand-overrides.yml is not valid YAML: ${e}`);
    continue;
  }

  const prefix = `books/${slug}/brand-overrides.yml`;

  // Handle empty YAML files (parse returns null)
  if (!overrides) continue;

  // Validate target_icps reference valid ICP ids
  if (overrides.target_icps && brandExtData?.default_icps) {
    const validIcpIds = new Set(brandExtData.default_icps.map((i) => i.id));
    for (const icpId of overrides.target_icps) {
      if (!validIcpIds.has(icpId)) {
        error(`${prefix}: target_icps references unknown ICP '${icpId}'`);
      }
    }
  }

  // Validate featured_products reference valid product ids
  if (overrides.featured_products && brandExtData?.products) {
    const validProductIds = new Set(brandExtData.products.map((p) => p.id));
    for (const productId of overrides.featured_products) {
      if (!validProductIds.has(productId)) {
        error(`${prefix}: featured_products references unknown product '${productId}'`);
      }
    }
  }

  // Validate color overrides are valid hex values
  if (overrides.colors) {
    for (const [key, value] of Object.entries(overrides.colors)) {
      if (value && !value.startsWith("#") && value.length > 0) {
        // Check if it's a valid palette reference
        // This is a soft warning since it could be a palette name
        warn(`${prefix}: color override '${key}' value '${value}' is not a hex color (may be a palette reference)`);
      }
    }
  }
}

// --- Validate design tokens ---

console.log("Validating design tokens...");

const tokenVars = buildDesignTokenCssVars();
const MIN_TOKEN_COUNT = 30;

if (tokenVars.length < MIN_TOKEN_COUNT) {
  error(
    `Design token system produced only ${tokenVars.length} CSS variables (expected at least ${MIN_TOKEN_COUNT}). ` +
    `Check scripts/theme-tokens.ts for missing token categories.`
  );
}

// Verify key token prefixes are present
const expectedPrefixes = ["--font-size-", "--space-", "--shadow-", "--radius-", "--transition-", "--letter-spacing-", "--line-height-"];
for (const prefix of expectedPrefixes) {
  if (!tokenVars.some(v => v.name.startsWith(prefix))) {
    error(`Design tokens missing category: ${prefix}* (check scripts/theme-tokens.ts)`);
  }
}

// --- Validate D2 diagrams ---

if (!d2Available()) {
  warn("D2 CLI not installed — skipping D2 diagram syntax checks (install with: brew install d2)");
} else {
  for (const slug of slugs) {
    const diagrams = findBookDiagrams(PROJECT_ROOT, slug);
    if (diagrams.length === 0) continue;

    console.log(`Validating D2 diagrams in books/${slug}/...`);

    for (const diagramPath of diagrams) {
      const result = validateD2Syntax(diagramPath);
      const relPath = diagramPath.replace(PROJECT_ROOT + "/", "");

      if (!result.valid) {
        for (const err of result.errors) {
          error(`${relPath}: D2 syntax error — ${err}`);
        }
      }
    }
  }

  // --- Validate D2 diagram templates ---

  const templatesDir = join(PROJECT_ROOT, "_diagrams", "templates");
  if (existsSync(templatesDir)) {
    console.log("Validating D2 diagram templates...");

    const templateFiles = readdirSync(templatesDir).filter((f) => f.endsWith(".d2"));

    for (const file of templateFiles) {
      const templatePath = join(templatesDir, file);
      const result = validateD2Syntax(templatePath);

      if (!result.valid) {
        for (const err of result.errors) {
          error(`_diagrams/templates/${file}: D2 syntax error — ${err}`);
        }
      }
    }
  }
}

// --- Validate OJS (Observable JS) blocks in ebook chapters ---

for (const slug of slugs) {
  const bookDir = join(PROJECT_ROOT, "books", slug);
  if (!existsSync(bookDir)) continue;

  const ojsSummaries = getOJSSummary(PROJECT_ROOT, slug);

  if (ojsSummaries.length > 0) {
    console.log(`Validating OJS blocks in books/${slug}/...`);

    let totalBlocks = 0;
    let htmlOnlyCount = 0;

    for (const summary of ojsSummaries) {
      totalBlocks += summary.blockCount;

      if (summary.hasHtmlOnlyFeatures) {
        htmlOnlyCount++;
      }

      for (const validation of summary.validations) {
        const relPath = summary.filePath.replace(PROJECT_ROOT + "/", "");
        const lineRef = `line ${validation.block.startLine}`;

        for (const err of validation.errors) {
          error(`${relPath} (${lineRef}): OJS block error — ${err}`);
        }

        for (const w of validation.warnings) {
          warn(`${relPath} (${lineRef}): OJS block — ${w}`);
        }
      }
    }

    if (htmlOnlyCount > 0) {
      warn(
        `books/${slug}: ${htmlOnlyCount} file(s) with HTML-only OJS features (Inputs/viewof/Plot). ` +
        `Ensure each has a static fallback for PDF/EPUB using ::: {.content-visible when-format="pdf"}`
      );
    }
  }
}

// --- Validate chapter files for duplicate H1 headings ---

for (const slug of slugs) {
  const bookDir = join(PROJECT_ROOT, "books", slug);
  if (!existsSync(bookDir)) continue;

  const quartoPath = join(bookDir, "_quarto.yml");
  if (!existsSync(quartoPath)) continue;

  try {
    const quartoConfig = parse(readFileSync(quartoPath, "utf-8")) as {
      book?: { chapters?: string[] };
    };
    const chapters = quartoConfig?.book?.chapters;
    if (!chapters || !Array.isArray(chapters)) continue;

    console.log(`Checking for duplicate H1 headings in books/${slug}/...`);

    for (const chapterEntry of chapters) {
      // Skip part definitions (objects) — only check string file paths
      if (typeof chapterEntry !== "string") continue;

      const chapterPath = join(bookDir, chapterEntry);
      if (!existsSync(chapterPath) || !chapterPath.endsWith(".qmd")) continue;

      const content = readFileSync(chapterPath, "utf-8");

      // Check if YAML front matter has a title: field
      const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!yamlMatch) continue;

      let hasYamlTitle = false;
      try {
        const frontMatter = parse(yamlMatch[1]);
        hasYamlTitle = !!frontMatter?.title;
      } catch {
        continue; // YAML parse errors are caught elsewhere
      }

      // Check if body (after front matter) has a top-level # heading
      // Strip fenced code blocks first to avoid matching comments inside code
      const bodyStart = content.indexOf("---", content.indexOf("---") + 3) + 3;
      const body = content.slice(bodyStart);
      const bodyNoCode = body.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, "");
      const h1Match = bodyNoCode.match(/^# .+/m);

      if (hasYamlTitle && h1Match) {
        const relPath = chapterPath.replace(PROJECT_ROOT + "/", "");
        // If the body H1 uses {.unnumbered}, it's the intentional index.qmd pattern — skip
        if (h1Match[0].includes("{.unnumbered}")) continue;

        error(
          `${relPath}: has both YAML 'title:' and body-level '${h1Match[0].trim()}'. ` +
          `This creates duplicate H1 headings and breaks chapter numbering. ` +
          `Remove the body '# ...' line — YAML 'title:' already generates the chapter heading.`
        );
      }
    }
  } catch {
    // Skip if _quarto.yml can't be parsed
  }
}

// --- Content quality audit (advisory — warns, never blocks) ---

for (const slug of slugs) {
  const bookDir = join(PROJECT_ROOT, "books", slug);
  if (!existsSync(bookDir)) continue;

  const chaptersDir = join(bookDir, "chapters");
  if (!existsSync(chaptersDir)) continue;

  console.log(`Running content audit on books/${slug}/...`);

  try {
    const report = auditEbook(slug);

    for (const violation of report.violations) {
      warn(`books/${slug} content audit: ${violation.message}`);
    }

    if (report.violations.length === 0) {
      console.log(`  Content audit passed (score: ${report.summary.overallScore})`);
    } else {
      console.log(`  Content audit: ${report.violations.length} advisory warning(s) (score: ${report.summary.overallScore})`);
    }
  } catch (e) {
    warn(`books/${slug}: Content audit failed — ${(e as Error).message}`);
  }
}

// --- Code validation (advisory — warns, never blocks) ---

for (const slug of slugs) {
  const bookDir = join(PROJECT_ROOT, "books", slug);
  if (!existsSync(bookDir)) continue;

  const chaptersDir = join(bookDir, "chapters");
  if (!existsSync(chaptersDir)) continue;

  console.log(`Running code validation on books/${slug}/...`);

  try {
    const report = validateEbookCode(slug);

    if (report.failedBlocks > 0) {
      for (const result of report.results.filter((r) => !r.valid)) {
        for (const err of result.errors) {
          warn(`books/${slug}/${result.file}:${result.startLine} [${result.language}]: ${err}`);
        }
      }
    }

    for (const suggestion of report.suggestions) {
      warn(`books/${slug}: ${suggestion.reason} at line ${suggestion.line}`);
    }

    if (report.failedBlocks === 0 && report.suggestions.length === 0) {
      console.log(`  Code validation passed (${report.validatedBlocks}/${report.totalBlocks} blocks checked)`);
    } else {
      console.log(`  Code validation: ${report.failedBlocks} failure(s), ${report.suggestions.length} suggestion(s)`);
    }
  } catch (e) {
    warn(`books/${slug}: Code validation failed — ${(e as Error).message}`);
  }
}

printResults();

function printResults() {
  console.log("");

  if (warnings.length > 0) {
    for (const w of warnings) {
      console.log(`  ⚠ ${w}`);
    }
    console.log("");
  }

  if (errors.length > 0) {
    for (const e of errors) {
      console.log(`  ✗ ${e}`);
    }
    console.log("");
    console.log(`Validation failed: ${errors.length} error(s), ${warnings.length} warning(s)`);
    process.exit(1);
  }

  console.log(`Validation passed: 0 errors, ${warnings.length} warning(s)`);
}

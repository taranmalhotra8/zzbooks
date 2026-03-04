#!/usr/bin/env bun
/**
 * generate-ebook.ts — One-command ebook generator
 *
 * Takes a topic string, generates the full ebook + all modalities:
 *   Scaffold → Pipeline (research → outline → plan → transform) → Render → Blog → Social → Dashboard
 *
 * Usage:
 *   bun run scripts/generate-ebook.ts --topic="Docker Security Best Practices"
 *   bun run scripts/generate-ebook.ts --topic="AWS Lambda Cost Optimization" --chapters=6
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { join, dirname } from "path";
import * as yaml from "yaml";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const SCRIPTS = join(ROOT, "scripts");
const BOOKS = join(ROOT, "books");
const TEMPLATES = join(ROOT, "_templates");

// ── Terminal Colors ─────────────────────────────────────────────
const BLUE = "\x1b[34m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ── Helpers ─────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function stepHeader(num: number, total: number, label: string): void {
  console.log(`\n${BLUE}── [${num}/${total}]${RESET} ${BOLD}${label}${RESET}\n`);
}

// Detect TS runtime: npx tsx (most reliable) > bun > node --import tsx
function detectTsRunner(): { cmd: string; runArgs: string[] } {
  try {
    const r = spawnSync("npx", ["tsx", "--version"], { stdio: "pipe", timeout: 10000 });
    if (r.status === 0) return { cmd: "npx", runArgs: ["tsx"] };
  } catch { /* not available */ }
  try {
    const r = spawnSync("bun", ["--version"], { stdio: "pipe", timeout: 5000 });
    if (r.status === 0) return { cmd: "bun", runArgs: ["run"] };
  } catch { /* not available */ }
  return { cmd: "node", runArgs: ["--import", "tsx"] };
}
const tsRunner = detectTsRunner();

function runBun(script: string, args: string[]): boolean {
  const result = spawnSync(tsRunner.cmd, [...tsRunner.runArgs, script, ...args], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  return result.status === 0;
}

function runQuarto(args: string[]): boolean {
  // Ensure TinyTeX, Quarto, and D2 are in PATH for rendering
  const env = { ...process.env };
  const home = process.env.HOME || "";
  const extraPaths = [
    // TinyTeX for XeLaTeX PDF rendering
    join(home, "Library", "TinyTeX", "bin", "universal-darwin"),
    join(home, ".TinyTeX", "bin", "x86_64-linux"),
    join(home, "Library", "TinyTeX", "bin", "x86_64-darwin"),
    // Quarto CLI
    join(home, ".local", "quarto", "bin"),
    // D2 diagram renderer
    join(home, ".local", "bin"),
    // Standard system paths
    "/usr/local/bin",
  ];
  for (const p of extraPaths) {
    if (existsSync(p) && !env.PATH?.includes(p)) {
      env.PATH = `${p}:${env.PATH}`;
    }
  }

  const result = spawnSync("quarto", args, {
    cwd: ROOT,
    stdio: "inherit",
    env,
  });
  return result.status === 0;
}

function runShell(cmd: string, args: string[]): boolean {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  return result.status === 0;
}

function updateQuartoChapters(slug: string): void {
  const outlinePath = join(BOOKS, slug, "outline.yml");
  const quartoPath = join(BOOKS, slug, "_quarto.yml");

  if (!existsSync(outlinePath) || !existsSync(quartoPath)) return;

  const outline = yaml.parse(readFileSync(outlinePath, "utf-8"));
  const quarto = yaml.parse(readFileSync(quartoPath, "utf-8"));

  if (!outline?.chapters || !Array.isArray(outline.chapters)) return;

  const chapterFiles = outline.chapters.map((ch: any) => {
    const id = ch.id || slugify(ch.title);
    return `chapters/${id}.qmd`;
  });

  quarto.book.chapters = ["index.qmd", ...chapterFiles];
  writeFileSync(quartoPath, yaml.stringify(quarto, { lineWidth: 120 }));
  console.log(`  ${GREEN}✓${RESET} Updated _quarto.yml with ${chapterFiles.length} chapters`);
}

/**
 * Pre-process QMD files for PDF rendering: extract inline SVGs from
 * ::: {.chapter-diagram} blocks, save them as standalone SVG files,
 * and wrap them in Quarto format-conditional blocks.
 * This prevents @font-face CSS inside inline SVGs from breaking XeLaTeX.
 */
function preparePdfDiagrams(slug: string): void {
  const bookDir = join(BOOKS, slug);
  const chaptersDir = join(bookDir, "chapters");
  const diagramsDir = join(bookDir, "diagrams");

  if (!existsSync(chaptersDir)) return;

  const qmdFiles = readdirSync(chaptersDir).filter(f => f.endsWith(".qmd"));
  let totalFixed = 0;

  for (const qmdFile of qmdFiles) {
    const filePath = join(chaptersDir, qmdFile);
    let content = readFileSync(filePath, "utf-8");

    // Match ::: {.chapter-diagram}\n<svg...>...\n\n*caption*\n:::
    // The SVG block starts with <?xml or <svg and ends before the caption line
    const diagramBlockRe = /:::\s*\{\.chapter-diagram\}\s*\n((?:<\?xml[^]*?<\/svg>|<svg[^]*?<\/svg>))\s*\n\n(\*[^*]+\*)\s*\n:::/g;

    let match: RegExpExecArray | null;
    let modified = content;
    let diagramIndex = 0;

    // Reset regex
    diagramBlockRe.lastIndex = 0;

    while ((match = diagramBlockRe.exec(content)) !== null) {
      const fullMatch = match[0];
      const svgContent = match[1];
      const caption = match[2];

      // Already wrapped in content-visible — skip
      if (content.substring(Math.max(0, match.index - 50), match.index).includes("content-visible")) {
        continue;
      }

      // Save SVG to file
      if (!existsSync(diagramsDir)) mkdirSync(diagramsDir, { recursive: true });
      const svgFileName = `${qmdFile.replace(".qmd", "")}-diagram-${diagramIndex}.svg`;
      const svgFilePath = join(diagramsDir, svgFileName);
      writeFileSync(svgFilePath, svgContent);

      // Replace with format-conditional block (:::: for outer to disambiguate nesting)
      const replacement = [
        `:::: {.content-visible when-format="html"}`,
        `::: {.chapter-diagram}`,
        svgContent,
        ``,
        caption,
        `:::`,
        `::::`,
        ``,
        `::: {.content-visible when-format="pdf"}`,
        `![${caption.replace(/^\*|\*$/g, "")}](diagrams/${svgFileName})`,
        `:::`,
      ].join("\n");

      modified = modified.replace(fullMatch, replacement);
      diagramIndex++;
      totalFixed++;
    }

    if (modified !== content) {
      writeFileSync(filePath, modified);
    }
  }

  if (totalFixed > 0) {
    console.log(`  ${GREEN}✓${RESET} Prepared ${totalFixed} inline SVG diagram(s) for PDF rendering`);
  }
}

/**
 * Sync _quarto.yml to only include chapter files that actually exist on disk.
 * This prevents Quarto from failing when some chapters weren't generated.
 */
function syncQuartoWithExistingFiles(slug: string): void {
  const bookDir = join(BOOKS, slug);
  const quartoPath = join(bookDir, "_quarto.yml");
  if (!existsSync(quartoPath)) return;

  const quarto = yaml.parse(readFileSync(quartoPath, "utf-8"));
  if (!quarto?.book?.chapters || !Array.isArray(quarto.book.chapters)) return;

  const existing = quarto.book.chapters.filter((ch: string) => existsSync(join(bookDir, ch)));
  const removed = quarto.book.chapters.length - existing.length;
  if (removed > 0) {
    quarto.book.chapters = existing;
    writeFileSync(quartoPath, yaml.stringify(quarto, { lineWidth: 120 }));
    console.log(`  ${YELLOW}⚠${RESET} Removed ${removed} missing chapter(s) from _quarto.yml`);
  }
}

function generatePreface(slug: string, title: string, subtitle: string): void {
  const bookDir = join(BOOKS, slug);
  const outlinePath = join(bookDir, "outline.yml");
  const researchPath = join(bookDir, "research.yml");
  const topicPath = join(bookDir, "topic.yml");

  // Read outline to get chapter summaries, arc, and narrative context
  let chapters: Array<{ id: string; title: string; difficulty?: string; summary?: string; role?: string }> = [];
  let arc = "";
  let outlineTitle = title;
  let outlineSubtitle = subtitle;
  if (existsSync(outlinePath)) {
    try {
      const outline = yaml.parse(readFileSync(outlinePath, "utf-8"));
      chapters = outline?.chapters || [];
      arc = outline?.narrative_arc || outline?.arc || "";
      outlineTitle = outline?.title || title;
      outlineSubtitle = outline?.subtitle || subtitle;
    } catch { /* use empty */ }
  }

  // Read research for industry data to include real stats in preface
  let industryClaims: Array<{ claim: string; source: string }> = [];
  if (existsSync(researchPath)) {
    try {
      const research = yaml.parse(readFileSync(researchPath, "utf-8"));
      industryClaims = (research?.industry_data || []).slice(0, 3);
    } catch { /* use empty */ }
  }

  // Read topic for audience info
  let audience = "DevOps engineers, platform teams, and technical leaders";
  if (existsSync(topicPath)) {
    try {
      const topic = yaml.parse(readFileSync(topicPath, "utf-8"));
      audience = topic?.audience || audience;
    } catch { /* use empty */ }
  }

  // Build the strategic opening paragraph using arc and industry data
  let prefaceOpening = "";
  if (arc) {
    // Use the narrative arc as the strategic framing
    const arcSentence = arc.charAt(0).toUpperCase() + arc.slice(1);
    prefaceOpening = arcSentence.endsWith(".") ? arcSentence : arcSentence + ".";
  } else {
    prefaceOpening = `${outlineTitle} has become a critical discipline for modern engineering organizations.`;
  }

  // Build industry context paragraph from real research data
  let industryContext = "";
  if (industryClaims.length >= 2) {
    const facts = industryClaims.map(c => c.claim).slice(0, 2);
    industryContext = `\n\nThe landscape is evolving rapidly. ${facts[0]}${facts[0].endsWith(".") ? "" : "."} Meanwhile, ${facts[1]}${facts[1].endsWith(".") ? "" : "."} These numbers underscore a clear mandate: organizations that master these practices gain a measurable competitive edge.`;
  }

  // Build the transformation promise paragraph
  const introChapter = chapters.find(c => c.role === "intro");
  const conclusionChapter = chapters.find(c => c.role === "conclusion" || c.difficulty === "advanced");
  let transformationPromise = "";
  if (introChapter && conclusionChapter) {
    transformationPromise = `\n\nThis book takes you from ${introChapter.title.toLowerCase()} through to ${conclusionChapter.title.toLowerCase()}. Every chapter delivers actionable strategies, production-ready code, and real-world patterns you can apply immediately — no theory without practice, no recommendations without evidence.`;
  } else {
    transformationPromise = `\n\nEvery chapter delivers actionable strategies, production-ready code, and real-world patterns you can apply immediately. This is not an academic survey — it is a practitioner's playbook built on battle-tested implementations and quantifiable results.`;
  }

  // Build reading path table
  const chapterCount = chapters.length;
  let readingTable = "";
  if (chapterCount >= 3) {
    readingTable += `| Chapters | Best For |\n|----------|----------|\n`;
    readingTable += `| 1 | Everyone — foundational concepts |\n`;
    if (chapterCount <= 5) {
      readingTable += `| 2–${chapterCount - 1} | Practitioners and technical teams |\n`;
      readingTable += `| ${chapterCount} | Advanced users and decision-makers |\n`;
    } else {
      const mid = Math.ceil(chapterCount / 2);
      readingTable += `| 2–${mid} | Practitioners and technical teams |\n`;
      readingTable += `| ${mid + 1}–${chapterCount} | Advanced users and leadership |\n`;
    }
  }

  // Build chapter overview with summaries where available
  let chapterOverview = "";
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    if (ch.summary) {
      chapterOverview += `${i + 1}. **${ch.title}** — ${ch.summary}\n`;
    } else {
      chapterOverview += `${i + 1}. **${ch.title}**\n`;
    }
  }

  // Build audience section tailored to topic
  const topicLower = title.toLowerCase();
  const audienceItems = buildAudienceList(topicLower, audience);

  const indexContent = `---
subtitle: "${outlineSubtitle}"
---

# ${outlineTitle} {.unnumbered}

## Preface {.unnumbered}

${prefaceOpening}${industryContext}${transformationPromise}

Whether you are building your first production workload or optimizing systems that serve millions of requests, this book provides a structured path from foundational concepts to advanced implementation patterns.

## Who This Book Is For {.unnumbered}

${audienceItems}

## How to Read This Book {.unnumbered}

Each chapter is designed to be self-contained. You can read cover-to-cover or jump to the topics most relevant to your role:

${readingTable}
## What You Will Learn {.unnumbered}

${chapterOverview}
## Conventions Used {.unnumbered}

Throughout this book, you will find:

::: {.callout-tip}
**Tips** highlight best practices and quick wins you can implement today.
:::

::: {.callout-note}
**Notes** provide additional context, caveats, or links to further reading.
:::

::: {.callout-warning}
**Warnings** flag common mistakes and anti-patterns to avoid in production.
:::
`;

  writeFileSync(join(bookDir, "index.qmd"), indexContent);
  console.log(`  ${GREEN}✓${RESET} Generated preface (index.qmd) with ${chapterCount} chapter overview`);
}

/**
 * Build a tailored audience list based on the topic and audience field.
 */
function buildAudienceList(topicLower: string, audience: string): string {
  // Determine domain context from topic
  const isCloud = /cloud|aws|azure|gcp|lambda|kubernetes|k8s|terraform|docker/.test(topicLower);
  const isCost = /cost|finops|spend|pricing|budget|migration/.test(topicLower);
  const isPlatform = /platform|engineering|devops|gitops|argocd|ci.cd/.test(topicLower);
  const isSecurity = /security|compliance|vulnerability|threat/.test(topicLower);

  const items: string[] = [];

  items.push(`- **Engineering leaders** who need to make informed technical decisions and drive organizational outcomes`);

  if (isCloud || isPlatform) {
    items.push(`- **DevOps and platform engineers** responsible for infrastructure, tooling, and operational excellence`);
  }
  if (isCost) {
    items.push(`- **Finance and FinOps teams** who need to understand, forecast, and optimize technology spending`);
  }
  if (isSecurity) {
    items.push(`- **Security engineers and architects** responsible for protecting infrastructure and ensuring compliance`);
  }

  items.push(`- **Practitioners** looking for hands-on strategies, production-ready code, and actionable frameworks`);
  items.push(`- **Technical decision-makers** evaluating approaches, tools, and architectural trade-offs`);

  return items.join("\n");
}

function removeScaffoldIntro(slug: string): void {
  const bookDir = join(BOOKS, slug);
  const scaffoldIntro = join(bookDir, "chapters", "01-intro.qmd");

  if (!existsSync(scaffoldIntro)) return;

  // Only remove if it's the scaffold placeholder (check for "Objective 1" or "TODO")
  const content = readFileSync(scaffoldIntro, "utf-8");
  if (content.includes("Objective 1") || content.includes("<!-- TODO: Write chapter content -->")) {
    unlinkSync(scaffoldIntro);
    console.log(`  ${GREEN}✓${RESET} Removed scaffold placeholder 01-intro.qmd`);
  }
}

function addClosingChapter(slug: string, title: string): void {
  const closingTemplate = join(TEMPLATES, "closing.qmd");
  if (!existsSync(closingTemplate)) return;

  const bookDir = join(BOOKS, slug);
  const closingDest = join(bookDir, "chapters", "99-closing.qmd");
  if (existsSync(closingDest)) return;

  let closing = readFileSync(closingTemplate, "utf-8");
  closing = closing.replace(/\{\{book_title\}\}/g, title);
  closing = closing.replace(/\{\{company_name\}\}/g, "Zopdev");
  closing = closing.replace(/\{\{company_website\}\}/g, "https://zopdev.com");
  closing = closing.replace(/\{\{company_description\}\}/g, "Zopdev builds tools that help engineering teams ship faster, spend less, and operate with confidence.");
  closing = closing.replace(/\{\{#product_name\}\}[\s\S]*?\{\{\/product_name\}\}/g, "");
  closing = closing.replace(/\{\{#.*?\}\}|\{\{\/.*?\}\}|\{\{\.\}\}/g, "");
  closing = closing.replace(
    /\{\{#takeaways\}\}[\s\S]*?\{\{\/takeaways\}\}/g,
    "- Review the strategies and frameworks presented in each chapter\n- Identify quick wins you can implement this week\n- Build a roadmap for longer-term improvements"
  );

  writeFileSync(closingDest, closing);

  // Add to _quarto.yml
  const quartoPath = join(bookDir, "_quarto.yml");
  if (existsSync(quartoPath)) {
    const quarto = yaml.parse(readFileSync(quartoPath, "utf-8"));
    if (quarto.book?.chapters && !quarto.book.chapters.includes("chapters/99-closing.qmd")) {
      quarto.book.chapters.push("chapters/99-closing.qmd");
      writeFileSync(quartoPath, yaml.stringify(quarto, { lineWidth: 120 }));
    }
  }
  console.log(`  ${GREEN}✓${RESET} Added closing chapter`);
}

// ── Parse args ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const opts: Record<string, string> = {};
for (const arg of args) {
  if (arg.startsWith("--")) {
    const eqIdx = arg.indexOf("=");
    if (eqIdx !== -1) {
      opts[arg.substring(2, eqIdx)] = arg.substring(eqIdx + 1);
    } else {
      opts[arg.substring(2)] = "";
    }
  }
}

const topic = opts.topic;
const numChapters = parseInt(opts.chapters || "5") || 5;

if (!topic) {
  console.error(`${RED}Error: --topic is required${RESET}`);
  console.error(`\n${BOLD}Usage:${RESET}`);
  console.error(`  ebook generate --topic="Docker Security Best Practices"`);
  console.error(`  ebook generate --topic="AWS Lambda Cost Optimization" --chapters=6`);
  console.error(`  ebook generate --topic="Kubernetes Monitoring" --slug=k8s-monitoring`);
  process.exit(1);
}

const slug = opts.slug || slugify(topic);
const title = opts.title || topic;
const subtitle = opts.subtitle || `A Practical Guide to ${topic}`;

// ── Main ───────────────────────────────────────────────────────

const TOTAL_STEPS = 10;
let currentStep = 0;

console.log(`
${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}
${BLUE}║${RESET}${BOLD}  Zopdev Ebook Engine — Auto Generator${RESET}${BLUE}                       ║${RESET}
${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}

  ${BOLD}Topic:${RESET}    ${topic}
  ${BOLD}Slug:${RESET}     ${slug}
  ${BOLD}Title:${RESET}    ${title}
  ${BOLD}Subtitle:${RESET} ${subtitle}
  ${BOLD}Chapters:${RESET} ${numChapters}
`);

const bookDir = join(BOOKS, slug);

// ── Step 1: Scaffold ────────────────────────────────────────────
currentStep++;
stepHeader(currentStep, TOTAL_STEPS, "Scaffolding ebook");

if (existsSync(join(bookDir, "_quarto.yml"))) {
  console.log(`  ${GREEN}✓${RESET} Book directory already exists, skipping scaffold`);
} else {
  runShell("bash", [join(SCRIPTS, "new-ebook.sh"), slug, title, subtitle]);
}

// Copy diagram templates so D2 references work
const diagramsSrc = join(ROOT, "_diagrams", "templates");
const diagramsDst = join(bookDir, "diagrams");
if (existsSync(diagramsSrc) && !existsSync(diagramsDst)) {
  mkdirSync(diagramsDst, { recursive: true });
  for (const f of readdirSync(diagramsSrc).filter(f => f.endsWith(".d2"))) {
    const src = join(diagramsSrc, f);
    const dst = join(diagramsDst, f);
    writeFileSync(dst, readFileSync(src, "utf-8"));
  }
  console.log(`  ${GREEN}✓${RESET} Copied ${readdirSync(diagramsDst).length} diagram templates`);
}

// Write topic.yml
// Note: chapter_count must be a string range (e.g. "3-5") as expected by pipeline-types.ts
const topicYml = {
  topic: topic,
  title: title,
  subtitle: subtitle,
  audience: "DevOps Engineers & SREs",
  depth: numChapters <= 4 ? "light" : numChapters <= 7 ? "standard" : "full",
  chapter_count: `${numChapters}-${numChapters + 2}`,
  target_chapters: numChapters,
  angle: "Practitioner's guide — step-by-step implementation",
  product_id: null,
};

mkdirSync(bookDir, { recursive: true });
writeFileSync(join(bookDir, "topic.yml"), yaml.stringify(topicYml, { lineWidth: 120 }));
console.log(`  ${GREEN}✓${RESET} Written topic.yml`);

// Write ebook.yml with social config so social assets can be generated
const ebookYml = {
  meta: {
    slug: slug,
    title: title,
    subtitle: subtitle,
    version: "0.1.0",
    authors: ["zopdev-team"],
  },
  social: {
    linkedin_carousel: {
      slides: [
        { heading: title, body: `${subtitle} — by Zopdev` },
        { heading: "The Challenge", body: `Most teams struggle with ${topic.toLowerCase()}. This guide shows you how to fix it.` },
        { heading: "Key Strategies", body: `Proven techniques and production-ready examples for ${topic.toLowerCase()}.` },
        { heading: "Get the Full Guide", body: "Download now at zopdev.com" },
      ],
    },
    instagram_posts: {
      quotes: [
        { text: `${topic} isn't optional anymore — it's a competitive advantage.`, attribution: "Zopdev Team" },
      ],
    },
    og_image: {
      title: title,
      subtitle: subtitle,
    },
  },
};
const ebookYmlPath = join(bookDir, "ebook.yml");
if (!existsSync(ebookYmlPath)) {
  writeFileSync(ebookYmlPath, yaml.stringify(ebookYml, { lineWidth: 120 }));
  console.log(`  ${GREEN}✓${RESET} Written ebook.yml (with social config)`);
}

// Add to calendar.yml if not already present (needed for social asset generation)
const calendarPath = join(ROOT, "calendar.yml");
if (existsSync(calendarPath)) {
  const calendarContent = readFileSync(calendarPath, "utf-8");
  if (!calendarContent.includes(`slug: ${slug}`)) {
    const calendarEntry = `
  - slug: ${slug}
    title: "${title}"
    subtitle: "${subtitle}"
    authors:
      - "Zopdev Team"
    status: draft
    tags: [${topic.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !["and", "for", "the", "with", "best"].includes(w)).slice(0, 4).join(", ")}]
    outputs:
      html: true
      pdf: true
      epub: true
      landing_page: true
      linkedin_carousel: true
      instagram_posts: true
      og_image: true
`;
    writeFileSync(calendarPath, calendarContent.trimEnd() + "\n" + calendarEntry);
    console.log(`  ${GREEN}✓${RESET} Added to calendar.yml`);
  }
}

// ── Step 2: Research ────────────────────────────────────────────
currentStep++;
stepHeader(currentStep, TOTAL_STEPS, "Researching topic");
runBun(join(SCRIPTS, "research-topic.ts"), [slug]);

// ── Step 3: Outline ─────────────────────────────────────────────
currentStep++;
stepHeader(currentStep, TOTAL_STEPS, "Generating outline");
runBun(join(SCRIPTS, "generate-outline.ts"), [slug]);

// ── Step 4: Update _quarto.yml chapters ─────────────────────────
currentStep++;
stepHeader(currentStep, TOTAL_STEPS, "Updating chapter list");
updateQuartoChapters(slug);

// Generate proper preface from outline (replaces scaffold placeholder)
generatePreface(slug, title, subtitle);

// Remove scaffold 01-intro.qmd placeholder (pipeline creates its own chapters)
removeScaffoldIntro(slug);

// ── Step 5: Plan chapters ───────────────────────────────────────
currentStep++;
stepHeader(currentStep, TOTAL_STEPS, "Planning chapters");
runBun(join(SCRIPTS, "plan-chapters.ts"), [slug]);

// ── Step 6: Transform to prose ──────────────────────────────────
currentStep++;
stepHeader(currentStep, TOTAL_STEPS, "Writing chapters (LLM)");
runBun(join(SCRIPTS, "transform-chapter.ts"), [slug]);

// Add closing chapter
addClosingChapter(slug, title);

// Sync _quarto.yml to only include files that actually exist (in case some chapters failed)
syncQuartoWithExistingFiles(slug);

// Prepare inline SVG diagrams for PDF compatibility (extract to files)
preparePdfDiagrams(slug);

// ── Step 7: Render PDF + HTML ───────────────────────────────────
currentStep++;
stepHeader(currentStep, TOTAL_STEPS, "Rendering PDF & HTML");

// Check if Quarto is available
const quartoCheck = spawnSync("quarto", ["--version"], { cwd: ROOT, stdio: "pipe" });
const hasQuarto = quartoCheck.status === 0;

if (hasQuarto) {
  const renderOk = runQuarto(["render", join("books", slug)]);
  if (!renderOk) {
    console.log(`  ${YELLOW}⚠${RESET} Quarto render had issues — trying PDF separately...`);
    runQuarto(["render", join("books", slug), "--to", "html"]);
    runQuarto(["render", join("books", slug), "--to", "pdf"]);
  } else {
    // Verify PDF was actually produced
    const outputDir = join(ROOT, "_output", "books", slug);
    const pdfExists = existsSync(outputDir) && readdirSync(outputDir).some(f => f.endsWith(".pdf"));
    if (!pdfExists) {
      console.log(`  ${YELLOW}⚠${RESET} PDF not found after full render — attempting explicit PDF render...`);
      runQuarto(["render", join("books", slug), "--to", "pdf"]);
    }
  }
} else {
  console.log(`  ${YELLOW}⚠${RESET} Quarto not found — skipping PDF/HTML render`);
  console.log(`  ${DIM}Install Quarto from https://quarto.org for PDF output${RESET}`);
}

// Copy images to chapters/ output subdirectory so relative paths work
// Quarto renders chapters in _output/books/{slug}/chapters/ but images are
// in _output/books/{slug}/images/. Chapter HTML references src="images/..."
// which needs the images inside the chapters/ directory.
const outputImagesDir = join(ROOT, "_output", "books", slug, "images");
const chaptersOutputDir = join(ROOT, "_output", "books", slug, "chapters");
if (existsSync(outputImagesDir) && existsSync(chaptersOutputDir)) {
  const chapImagesDir = join(chaptersOutputDir, "images");
  if (!existsSync(chapImagesDir)) mkdirSync(chapImagesDir, { recursive: true });
  const imgFiles = readdirSync(outputImagesDir).filter(f => /\.(png|jpg|jpeg|svg|webp|gif)$/i.test(f));
  for (const img of imgFiles) {
    writeFileSync(join(chapImagesDir, img), readFileSync(join(outputImagesDir, img)));
  }
  if (imgFiles.length > 0) {
    console.log(`  ${GREEN}✓${RESET} Copied ${imgFiles.length} images to chapters output for correct relative paths`);
  }
}

// Always generate standalone HTML reader (works with or without Quarto)
const readerOk = runBun(join(ROOT, "_reader", "generate.ts"), [slug]);
if (readerOk) {
  console.log(`  ${GREEN}✓${RESET} Standalone HTML book generated`);
} else {
  console.log(`  ${YELLOW}⚠${RESET} Standalone HTML reader generation failed`);
}

// ── Step 8: Generate blog posts ─────────────────────────────────
currentStep++;
stepHeader(currentStep, TOTAL_STEPS, "Generating blog posts");
runBun(join(ROOT, "_blog", "generate.ts"), [slug]);

// ── Step 9: Generate social assets ──────────────────────────────
currentStep++;
stepHeader(currentStep, TOTAL_STEPS, "Generating social assets (LinkedIn, Instagram, OG)");
runBun(join(ROOT, "_social", "generate.ts"), [slug]);

// ── Step 10: Regenerate dashboard ───────────────────────────────
currentStep++;
stepHeader(currentStep, TOTAL_STEPS, "Updating dashboard");
runBun(join(ROOT, "_dashboard", "generate.ts"), []);

// ── Summary ─────────────────────────────────────────────────────

const outputDir = join(ROOT, "_output", "books", slug);
const pdfFiles = existsSync(outputDir)
  ? readdirSync(outputDir).filter(f => f.endsWith(".pdf"))
  : [];
const blogDir = join(ROOT, "_output", "blog", slug);
const blogFiles = existsSync(blogDir)
  ? readdirSync(blogDir).filter(f => f.endsWith(".html"))
  : [];
const socialDir = join(ROOT, "_output", "social", slug);
const hasSocial = existsSync(socialDir);

console.log(`
${GREEN}╔══════════════════════════════════════════════════════════════╗${RESET}
${GREEN}║${RESET}  ${BOLD}✅ Ebook Generated Successfully!${RESET}
${GREEN}╠══════════════════════════════════════════════════════════════╣${RESET}
${GREEN}║${RESET}
${GREEN}║${RESET}  ${BOLD}${title}${RESET}
${GREEN}║${RESET}  ${DIM}${subtitle}${RESET}
${GREEN}║${RESET}
${GREEN}║${RESET}  📖 HTML      → _output/books/${slug}/index.html
${GREEN}║${RESET}  📄 PDF       → ${pdfFiles.length > 0 ? `_output/books/${slug}/${pdfFiles[0]}` : "not generated"}
${GREEN}║${RESET}  📝 Blog      → _output/blog/${slug}/ (${blogFiles.length} posts)
${GREEN}║${RESET}  📱 Social    → ${hasSocial ? `_output/social/${slug}/` : "not generated"}
${GREEN}║${RESET}  🏠 Dashboard → _output/dashboard/index.html
${GREEN}║${RESET}
${GREEN}║${RESET}  Open dashboard: ${CYAN}open _output/dashboard/index.html${RESET}
${GREEN}║${RESET}
${GREEN}╚══════════════════════════════════════════════════════════════╝${RESET}
`);

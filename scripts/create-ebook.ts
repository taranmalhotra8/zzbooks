#!/usr/bin/env bun
/**
 * create-ebook.ts — Interactive CLI for end-to-end ebook generation
 *
 * Flow:
 *   1. Q&A: topic, audience, product, depth, angle, chapters
 *   2. Generate topic.yml + context.yml
 *   3. Open $EDITOR for review
 *   4. Scaffold (if new)
 *   5. Run full pipeline with progress
 *   6. Auto-update _quarto.yml after outline
 *   7. Publish all modalities
 *
 * Usage:
 *   bun run scripts/create-ebook.ts
 *   make create
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync, spawn } from "child_process";
import { join } from "path";
import * as readline from "readline";
import * as yaml from "yaml";

const ROOT = join(import.meta.dir, "..");
const SCRIPTS = join(ROOT, "scripts");
const BOOKS = join(ROOT, "books");
const TEMPLATES = join(ROOT, "_templates");

// ── Terminal helpers ─────────────────────────────────────────────

const BLUE = "\x1b[34m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function banner() {
  console.log(`
${BLUE}╔══════════════════════════════════════════════════════════════╗
║${RESET}${BOLD}  Zopdev Ebook Engine — Interactive Creator${RESET}${BLUE}                  ║
╚══════════════════════════════════════════════════════════════╝${RESET}
`);
}

function stepHeader(num: number, total: number, label: string) {
  console.log(`\n${DIM}── Step ${num}/${total} ──${RESET} ${BOLD}${label}${RESET}\n`);
}

function progressLine(step: number, total: number, label: string, status: "running" | "done" | "pending") {
  const icon = status === "done" ? `${GREEN}✓${RESET}` : status === "running" ? `${YELLOW}⏳${RESET}` : " ";
  console.log(`  ${icon} [${step}/${total}] ${label}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string, defaultVal?: string): Promise<string> {
  const suffix = defaultVal ? ` ${DIM}(${defaultVal})${RESET}` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

function askChoice(question: string, options: string[]): Promise<string> {
  return new Promise((resolve) => {
    console.log(`  ${question}`);
    options.forEach((opt, i) => {
      console.log(`    ${DIM}${i + 1}.${RESET} ${opt}`);
    });
    rl.question(`  ${DIM}Choose (1-${options.length}):${RESET} `, (answer) => {
      const idx = parseInt(answer.trim()) - 1;
      resolve(options[Math.max(0, Math.min(idx, options.length - 1))]);
    });
  });
}

function askNumber(question: string, min: number, max: number, defaultVal: number): Promise<number> {
  return new Promise((resolve) => {
    rl.question(`  ${question} ${DIM}(${min}-${max}, default: ${defaultVal})${RESET}: `, (answer) => {
      const num = parseInt(answer.trim());
      resolve(isNaN(num) ? defaultVal : Math.max(min, Math.min(max, num)));
    });
  });
}

// ── Load products from brand config ─────────────────────────────

function loadProducts(): Array<{ id: string; name: string; description: string; features?: string[] }> {
  const extPath = join(ROOT, "_brand", "_brand-extended.yml");
  if (!existsSync(extPath)) return [];
  const ext = yaml.parse(readFileSync(extPath, "utf-8"));
  return ext.products || [];
}

// ── Slug generation ─────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

// ── Run shell command with live output ──────────────────────────

function runWithOutput(cmd: string, label: string): Promise<number> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const child = spawn("bash", ["-c", cmd], {
      cwd: ROOT,
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env },
    });

    child.stdout?.on("data", (data) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          process.stdout.write(`    ${DIM}${line}${RESET}\n`);
        }
      }
    });

    child.stderr?.on("data", (data) => {
      const lines = data.toString().trim().split("\n");
      for (const line of lines) {
        if (line.trim() && !line.includes("WARN:")) {
          process.stderr.write(`    ${DIM}${line}${RESET}\n`);
        }
      }
    });

    child.on("close", (code) => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      if (code === 0) {
        console.log(`  ${GREEN}✓${RESET} ${label} ${DIM}(${elapsed}s)${RESET}`);
      } else {
        console.log(`  ${YELLOW}⚠${RESET} ${label} exited with code ${code} ${DIM}(${elapsed}s)${RESET}`);
      }
      resolve(code || 0);
    });
  });
}

// ── Auto-update _quarto.yml chapters from outline ───────────────

function updateQuartoChapters(slug: string) {
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
  console.log(`  ${GREEN}✓${RESET} Updated _quarto.yml with ${chapterFiles.length} chapters from outline`);
}

// ── Main flow ───────────────────────────────────────────────────

async function main() {
  banner();

  const products = loadProducts();
  const totalSteps = 6;

  // Step 1: Topic
  stepHeader(1, totalSteps, "What topic?");
  const topic = await ask("Topic (e.g., 'Kubernetes Cost Optimization')");
  if (!topic) {
    console.log("No topic provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  // Step 2: Audience
  stepHeader(2, totalSteps, "Target audience?");
  const audience = await askChoice("Who is this for?", [
    "DevOps Engineers & SREs",
    "CTOs & Engineering Leaders",
    "Platform Engineers",
    "FinOps Practitioners",
    "Full-Stack Developers",
  ]);

  // Step 3: Product tie-in
  stepHeader(3, totalSteps, "Zopdev product tie-in?");
  let selectedProduct: any = null;
  if (products.length > 0) {
    const productNames = [...products.map((p) => `${p.name} — ${p.description}`), "None (no product tie-in)"];
    const choice = await askChoice("Which product is most relevant?", productNames);
    const idx = productNames.indexOf(choice);
    if (idx >= 0 && idx < products.length) {
      selectedProduct = products[idx];
    }
  }

  // Step 4: Depth
  stepHeader(4, totalSteps, "Content depth?");
  const depth = await askChoice("How deep should the content go?", [
    "Light — 3-5 chapters, 800-1200 words each (quick read)",
    "Standard — 5-8 chapters, 1200-1800 words each (comprehensive)",
    "Full — 8-12 chapters, 1500-2500 words each (deep dive)",
  ]);
  const depthLevel = depth.startsWith("Light") ? "light" : depth.startsWith("Standard") ? "standard" : "full";

  // Step 5: Angle
  stepHeader(5, totalSteps, "Content angle?");
  const angle = await askChoice("What angle should the book take?", [
    "Practitioner's guide — step-by-step implementation",
    "Decision-maker's brief — ROI, strategy, vendor comparison",
    "Architecture deep-dive — design patterns, trade-offs",
    "Incident-driven — learn from failures and war stories",
  ]);

  // Step 6: Chapters
  stepHeader(6, totalSteps, "Number of chapters?");
  const defaultChapters = depthLevel === "light" ? 4 : depthLevel === "standard" ? 6 : 8;
  const numChapters = await askNumber("How many chapters?", 3, 12, defaultChapters);

  // ── Generate slug ──────────────────────────────────────────────
  const suggestedSlug = slugify(topic);
  console.log(`\n${DIM}── Configuration ──${RESET}`);
  const slug = await ask("Book slug", suggestedSlug);
  const title = await ask("Book title", topic);
  const subtitle = await ask("Subtitle", `A Practical Guide to ${topic}`);

  // ── Generate topic.yml ─────────────────────────────────────────
  const bookDir = join(BOOKS, slug);
  const topicYml = {
    topic: topic,
    title: title,
    subtitle: subtitle,
    audience: audience,
    depth: depthLevel,
    target_chapters: numChapters,
    angle: angle,
    product_id: selectedProduct?.id || null,
  };

  // ── Generate context.yml if product selected ───────────────────
  let contextYml: any = null;
  if (selectedProduct) {
    contextYml = {
      product_relevance: {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        connection: `${selectedProduct.name} helps teams implement the strategies discussed in this book`,
        features_to_highlight: selectedProduct.features || [],
      },
      editorial_direction: {
        tone: "practical, authoritative, data-driven",
        audience: audience,
        angle: angle,
        avoid: [
          "Generic advice without specific examples",
          "Marketing language or product promotion",
          "Claims without supporting data",
        ],
        emphasize: [
          "Real-world metrics and dollar amounts",
          "Production-ready code and configurations",
          "Actionable implementation steps",
        ],
      },
    };
  }

  // ── Write files ────────────────────────────────────────────────
  if (!existsSync(bookDir)) {
    mkdirSync(bookDir, { recursive: true });
  }

  const topicPath = join(bookDir, "topic.yml");
  writeFileSync(topicPath, yaml.stringify(topicYml, { lineWidth: 120 }));
  console.log(`\n  ${GREEN}✓${RESET} Written: ${topicPath}`);

  if (contextYml) {
    const contextPath = join(bookDir, "context.yml");
    writeFileSync(contextPath, yaml.stringify(contextYml, { lineWidth: 120 }));
    console.log(`  ${GREEN}✓${RESET} Written: ${contextPath}`);
  }

  // ── Open in editor for review ──────────────────────────────────
  const editor = process.env.EDITOR || process.env.VISUAL || "vi";
  console.log(`\n${YELLOW}Opening topic.yml in ${editor} for review...${RESET}`);
  console.log(`${DIM}Save and close to continue, or quit without saving to abort.${RESET}\n`);

  try {
    execSync(`${editor} "${topicPath}"`, { stdio: "inherit" });
  } catch (e) {
    // Editor might fail in non-interactive contexts, continue anyway
    console.log(`${DIM}(Skipped editor — non-interactive environment)${RESET}`);
  }

  // Re-read in case user modified
  const finalTopic = yaml.parse(readFileSync(topicPath, "utf-8"));

  // ── Confirm and run ────────────────────────────────────────────
  console.log(`\n${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BLUE}║${RESET} ${BOLD}Ready to generate: ${finalTopic.title || title}${RESET}`);
  console.log(`${BLUE}║${RESET} Slug: ${slug}`);
  console.log(`${BLUE}║${RESET} Depth: ${finalTopic.depth || depthLevel}, Chapters: ${finalTopic.target_chapters || numChapters}`);
  if (selectedProduct) {
    console.log(`${BLUE}║${RESET} Product: ${selectedProduct.name}`);
  }
  console.log(`${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);

  const confirm = await ask("Proceed? (y/n)", "y");
  if (confirm.toLowerCase() !== "y") {
    console.log("Aborted.");
    rl.close();
    process.exit(0);
  }
  rl.close();

  // ── Pipeline execution ─────────────────────────────────────────
  const pipelineSteps = 8;
  let stepNum = 0;

  console.log(`\n${BOLD}── Pipeline Progress ──${RESET}\n`);

  // 1. Scaffold
  stepNum++;
  if (!existsSync(join(bookDir, "_quarto.yml"))) {
    console.log(`  ${YELLOW}⏳${RESET} [${stepNum}/${pipelineSteps}] Scaffolding...`);
    await runWithOutput(
      `bash scripts/new-ebook.sh "${slug}" "${finalTopic.title || title}" "${finalTopic.subtitle || subtitle}"`,
      `[${stepNum}/${pipelineSteps}] Scaffolding`
    );
  } else {
    console.log(`  ${GREEN}✓${RESET} [${stepNum}/${pipelineSteps}] Scaffolding ${DIM}(already exists)${RESET}`);
  }

  // 2. Research
  stepNum++;
  console.log(`  ${YELLOW}⏳${RESET} [${stepNum}/${pipelineSteps}] Researching topic...`);
  await runWithOutput(
    `bun run scripts/research-topic.ts ${slug}`,
    `[${stepNum}/${pipelineSteps}] Research`
  );

  // 3. Outline
  stepNum++;
  console.log(`  ${YELLOW}⏳${RESET} [${stepNum}/${pipelineSteps}] Generating outline...`);
  await runWithOutput(
    `bun run scripts/generate-outline.ts ${slug}`,
    `[${stepNum}/${pipelineSteps}] Outline`
  );

  // 4. Auto-update _quarto.yml
  stepNum++;
  updateQuartoChapters(slug);
  console.log(`  ${GREEN}✓${RESET} [${stepNum}/${pipelineSteps}] Updated chapter list`);

  // 5. Plan chapters
  stepNum++;
  console.log(`  ${YELLOW}⏳${RESET} [${stepNum}/${pipelineSteps}] Planning chapters...`);
  await runWithOutput(
    `bun run scripts/plan-chapters.ts ${slug}`,
    `[${stepNum}/${pipelineSteps}] Chapter planning`
  );

  // 6. Transform chapters
  stepNum++;
  console.log(`  ${YELLOW}⏳${RESET} [${stepNum}/${pipelineSteps}] Transforming chapters...`);
  await runWithOutput(
    `bun run scripts/transform-chapter.ts ${slug}`,
    `[${stepNum}/${pipelineSteps}] Chapter transform`
  );

  // 7. Generate closing chapter (if template exists)
  stepNum++;
  const closingTemplate = join(TEMPLATES, "closing.qmd");
  if (existsSync(closingTemplate)) {
    // For now, copy the closing template as a starting point
    const closingDest = join(bookDir, "chapters", "99-closing.qmd");
    if (!existsSync(closingDest)) {
      // Simple Mustache-like replacement
      let closing = readFileSync(closingTemplate, "utf-8");
      closing = closing.replace(/\{\{book_title\}\}/g, finalTopic.title || title);
      closing = closing.replace(/\{\{company_name\}\}/g, "Zopdev");
      closing = closing.replace(/\{\{company_website\}\}/g, "https://zopdev.com");
      closing = closing.replace(/\{\{company_description\}\}/g, "Zopdev builds tools that help engineering teams ship faster, spend less, and operate with confidence.");

      if (selectedProduct) {
        closing = closing.replace(/\{\{product_name\}\}/g, selectedProduct.name);
        closing = closing.replace(/\{\{product_description\}\}/g, selectedProduct.description || "");
      } else {
        // Remove product section if no product
        closing = closing.replace(/\{\{#product_name\}\}[\s\S]*?\{\{\/product_name\}\}/g, "");
      }

      // Remove Mustache conditionals we can't easily process
      closing = closing.replace(/\{\{#.*?\}\}|\{\{\/.*?\}\}|\{\{\.\}\}/g, "");
      closing = closing.replace(/\{\{#takeaways\}\}[\s\S]*?\{\{\/takeaways\}\}/g,
        "- Review the strategies and frameworks presented in each chapter\n- Identify quick wins you can implement this week\n- Build a roadmap for longer-term improvements");

      writeFileSync(closingDest, closing);

      // Add closing chapter to _quarto.yml
      const quartoPath = join(bookDir, "_quarto.yml");
      if (existsSync(quartoPath)) {
        const quarto = yaml.parse(readFileSync(quartoPath, "utf-8"));
        if (quarto.book?.chapters && !quarto.book.chapters.includes("chapters/99-closing.qmd")) {
          quarto.book.chapters.push("chapters/99-closing.qmd");
          writeFileSync(quartoPath, yaml.stringify(quarto, { lineWidth: 120 }));
        }
      }
    }
    console.log(`  ${GREEN}✓${RESET} [${stepNum}/${pipelineSteps}] Generated closing chapter`);
  } else {
    console.log(`  ${DIM}  [${stepNum}/${pipelineSteps}] No closing template found, skipping${RESET}`);
  }

  // 8. Publish all modalities
  stepNum++;
  console.log(`  ${YELLOW}⏳${RESET} [${stepNum}/${pipelineSteps}] Publishing all modalities...`);
  await runWithOutput(
    `make publish ebook=${slug}`,
    `[${stepNum}/${pipelineSteps}] Publishing`
  );

  // ── Summary ────────────────────────────────────────────────────
  const outputDir = join(ROOT, "_output", "books", slug);
  console.log(`
${GREEN}╔══════════════════════════════════════════════════════════════╗
║  ${BOLD}Done!${RESET}${GREEN} All modalities generated for: ${slug}${GREEN}
╚══════════════════════════════════════════════════════════════╝${RESET}

  ${BOLD}Output:${RESET}
    HTML:    ${outputDir}/index.html
    PDF:     ${outputDir}/*.pdf
    EPUB:    ${outputDir}/*.epub
    Landing: ${join(ROOT, "_output", "landing", slug)}/index.html
    Social:  ${join(ROOT, "_output", "social", slug)}/
    Blog:    ${join(ROOT, "_output", "blog", slug)}/
`);
}

main().catch((err) => {
  console.error(`\n${YELLOW}Error:${RESET} ${err.message}`);
  rl.close();
  process.exit(1);
});

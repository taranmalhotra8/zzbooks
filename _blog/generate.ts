#!/usr/bin/env bun
/**
 * Blog post generator.
 * Extracts standalone blog posts from ebook chapters.
 * Each chapter becomes one HTML blog post with SEO metadata and CTA.
 *
 * Usage:
 *   bun run _blog/generate.ts <slug>       # Generate blog posts for one ebook
 *   bun run _blog/generate.ts              # Generate for all ebooks with blog enabled
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import { join, dirname, basename } from "path";
import { parse } from "yaml";
import Mustache from "mustache";
import { loadMergedBrand, buildCssVars } from "../scripts/brand-utils.js";
import { loadEbookContent } from "../scripts/content-utils.js";
import { renderD2ToSvg, renderD2AsHtmlCard, extractD2Blocks } from "../scripts/d2-render.js";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── YAML Syntax Highlighting ────────────────────────────────────────────────

function highlightYaml(code: string): string {
  return code.split("\n").map(line => {
    // Comments
    if (/^\s*#/.test(line)) {
      return `<span class="hl-comment">${line}</span>`;
    }
    // Lines with key: value
    const kvMatch = line.match(/^(\s*)([\w./-]+)(\s*:\s*)(.*)/);
    if (kvMatch) {
      const [, indent, key, colon, value] = kvMatch;
      let highlightedValue = value;
      if (value === "" || value === "|" || value === "|-" || value === ">") {
        highlightedValue = value;
      } else if (/^(true|false|null|yes|no)$/i.test(value.trim())) {
        highlightedValue = `<span class="hl-bool">${value}</span>`;
      } else if (/^\d+(\.\d+)?$/.test(value.trim())) {
        highlightedValue = `<span class="hl-number">${value}</span>`;
      } else if (/^['"]/.test(value.trim())) {
        highlightedValue = `<span class="hl-string">${value}</span>`;
      } else if (value.trim().startsWith("http")) {
        highlightedValue = `<span class="hl-string">${value}</span>`;
      }
      return `${indent}<span class="hl-key">${key}</span><span class="hl-colon">${colon}</span>${highlightedValue}`;
    }
    // List items with - key: value
    const listKvMatch = line.match(/^(\s*- )([\w./-]+)(\s*:\s*)(.*)/);
    if (listKvMatch) {
      const [, prefix, key, colon, value] = listKvMatch;
      let highlightedValue = value;
      if (/^['"]/.test(value.trim()) || value.trim().startsWith("http")) {
        highlightedValue = `<span class="hl-string">${value}</span>`;
      }
      return `${prefix}<span class="hl-key">${key}</span><span class="hl-colon">${colon}</span>${highlightedValue}`;
    }
    // List items with - value (simple string list)
    const listMatch = line.match(/^(\s*- )(["'].+["']|.+)$/);
    if (listMatch) {
      const [, prefix, value] = listMatch;
      if (/^['"]/.test(value.trim())) {
        return `${prefix}<span class="hl-string">${value}</span>`;
      }
    }
    return line;
  }).join("\n");
}

// ── Markdown to HTML (lightweight) ──────────────────────────────────────────

function markdownToHtml(md: string, bookDir?: string): string {
  let html = md;

  // Strip YAML frontmatter
  html = html.replace(/^---[\s\S]*?---\n*/m, "");

  // Remove HTML comments
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // Handle content-visible blocks: unwrap HTML blocks, extract PDF/EPUB for static fallback
  // First, unwrap :::: {.content-visible when-format="html"} → keep inner content
  html = html.replace(/:{3,4}\s*\{\.content-visible\s+when-format="html"\}\s*\n([\s\S]*?):{3,4}\s*$/gm, "$1");

  // Clean inline SVG for HTML5 embedding: strip XML declaration and CDATA markers
  function cleanSvgForHtml(svg: string): string {
    return svg
      .replace(/<\?xml[^?]*\?>\s*/g, "")
      .replace(/<!\[CDATA\[/g, "")
      .replace(/\]\]>/g, "");
  }

  // Classify SVG as wide or normal based on aspect ratio
  function classifyDiagramWidth(svg: string): string {
    const vb = svg.match(/viewBox=["']([^"']+)["']/);
    if (vb) {
      const parts = vb[1].split(/\s+/).map(Number);
      if (parts.length === 4 && parts[3] > 0 && parts[2] / parts[3] > 3) return "diagram-wide";
    }
    const wMatch = svg.match(/\bwidth=["'](\d+)/);
    const hMatch = svg.match(/\bheight=["'](\d+)/);
    if (wMatch && hMatch) {
      const w = parseInt(wMatch[1], 10), h = parseInt(hMatch[1], 10);
      if (h > 0 && w / h > 3) return "diagram-wide";
    }
    return "diagram-normal";
  }

  // Handle ::: {.chapter-diagram} blocks with inline SVG → extract to placeholder store
  // These must be stored to protect SVG content from paragraph wrapping
  const chapterDiagramStore: string[] = [];

  html = html.replace(/:{3,4}\s*\{\.chapter-diagram\}\s*\n([\s\S]*?)\n\n\*([^*]+)\*\s*\n:{3,4}/g, (_, svgContent, caption) => {
    const cleanSvg = cleanSvgForHtml(svgContent.trim());
    const rendered = `<div class="diagram-figure ${classifyDiagramWidth(cleanSvg)}">${cleanSvg}</div><p class="diagram-caption"><em>${caption}</em></p>`;
    const idx = chapterDiagramStore.length;
    chapterDiagramStore.push(rendered);
    return `<div data-chapterdiagram="${idx}"></div>`;
  });

  // Also handle bare ::: {.chapter-diagram} (legacy format)
  html = html.replace(/:::\s*\{\.chapter-diagram\}\s*\n([\s\S]*?)\n\n\*([^*]+)\*\s*\n:::/g, (_, svgContent, caption) => {
    const cleanSvg = cleanSvgForHtml(svgContent.trim());
    const rendered = `<div class="diagram-figure ${classifyDiagramWidth(cleanSvg)}">${cleanSvg}</div><p class="diagram-caption"><em>${caption}</em></p>`;
    const idx = chapterDiagramStore.length;
    chapterDiagramStore.push(rendered);
    return `<div data-chapterdiagram="${idx}"></div>`;
  });

  // Extract static fallback from content-visible blocks (show ROI tables in HTML)
  const staticFallbacks: string[] = [];
  html = html.replace(/:{3,4}\s*\{\.content-visible\s+when-format="(?:pdf|epub)"\}\s*\n([\s\S]*?):{3,4}/g, (_, content) => {
    // Strip image references from fallback content — the blog already has inline SVGs
    // for diagrams, so PDF-only image refs (e.g. ![...](diagrams/xx.svg)) would be broken
    let cleaned = content.trim().replace(/!\[[^\]]*\]\([^)]+\)\s*/g, "").trim();
    if (cleaned) staticFallbacks.push(cleaned);
    return "";
  });

  // D2 diagram blocks — render to SVG and extract to placeholder store to protect from paragraph wrapping
  const diagramStore: string[] = [];

  // D2 diagram blocks with file= reference — render from D2 file
  html = html.replace(/```\{\.?d2[^}]*file="([^"]+)"[^}]*\}\n([\s\S]*?)```/g, (_, fileRef) => {
    let rendered = "";
    if (bookDir) {
      const d2Path = join(bookDir, fileRef);
      if (existsSync(d2Path)) {
        const src = readFileSync(d2Path, "utf-8");
        const svg = renderD2ToSvg(src);
        rendered = svg ? `<div class="diagram-figure ${svg ? classifyDiagramWidth(svg) : ""}">${svg}</div>` : renderD2AsHtmlCard(src);
      }
    }
    if (!rendered) rendered = renderD2AsHtmlCard("");
    const idx = diagramStore.length;
    diagramStore.push(rendered);
    return `<div data-diagram="${idx}"></div>`;
  });

  // D2 inline diagram blocks — render from inline source
  html = html.replace(/```\{\.?d2[^}]*\}\n([\s\S]*?)```/g, (_, source) => {
    const svg = renderD2ToSvg(source);
    const rendered = svg ? `<div class="diagram-figure ${svg ? classifyDiagramWidth(svg) : ""}">${svg}</div>` : renderD2AsHtmlCard(source);
    const idx = diagramStore.length;
    diagramStore.push(rendered);
    return `<div data-diagram="${idx}"></div>`;
  });

  // OJS blocks — replace with static ROI table from fallback content
  let ojsReplacementDone = false;
  html = html.replace(/```\{ojs[^}]*\}[\s\S]*?```/g, () => {
    if (!ojsReplacementDone && staticFallbacks.length > 0) {
      ojsReplacementDone = true;
      return `<div class="static-calculator"><strong>ROI Calculator (Default Scenario)</strong><br>${staticFallbacks[0]}</div>`;
    }
    return "";
  });

  // Remove empty fenced code blocks (only ``` immediately followed by ``` on next line)
  html = html.replace(/```\s*\n```\s*\n/g, "");

  // Fix stray ``` after headings (e.g., ## Heading\n\n```\n\nProse)
  html = html.replace(/^(#{1,6}\s+.+)\n\n```\s*\n\n/gm, "$1\n\n");

  // Fix ``` merged with prose (e.g., "``` If your org...")
  html = html.replace(/^```\s+([A-Z])/gm, "```\n\n$1");

  // Clean leaked OJS template expressions from split blocks
  html = html.replace(/^\s*<strong>Best option:<\/strong>\s*\$\{comparison\.reduce[\s\S]*?vs\.\s*the most expensive option\.\s*<\/p>\s*<\/div>`?\s*$/gm, "");
  html = html.replace(/^\s*roi:\s*cumInvestment\s*>[\s\S]*?return found \? found\.month : null;\s*\}$/gm, "");

  // Replace *Visualize ...* text descriptions with styled boxes
  html = html.replace(/^\*Visualize ([^*]+)\*(?:\s*\*\(diagram:[^)]*\)\*)?$/gm, (_, desc) => {
    return `<div class="diagram-placeholder"><em>${desc.trim()}</em></div>`;
  });
  html = html.replace(/^Visualized as a flow: (.+)$/gm, (_, desc) => {
    return `<div class="diagram-placeholder"><em>${desc.trim()}</em></div>`;
  });

  // Code blocks (fenced) — extract to placeholders to protect from paragraph wrapping
  const codeBlockStore: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langAttr = lang ? ` class="language-${lang}"` : "";
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : "";
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\{\{/g, "&#123;&#123;").replace(/\}\}/g, "&#125;&#125;");
    // Apply syntax highlighting for YAML
    const highlighted = lang === "yaml" || lang === "yml" ? highlightYaml(escaped) : escaped;
    const rendered = `<div class="code-block">${langLabel}<pre><code${langAttr}>${highlighted}</code></pre></div>`;
    const idx = codeBlockStore.length;
    codeBlockStore.push(rendered);
    return `<div data-codeblock="${idx}"></div>`;
  });

  // Image references — render actual images (images will be copied to blog output/images/)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const filename = src.replace(/^.*\//, ""); // Extract just the filename
    if (alt) return `<figure class="chapter-figure"><img src="images/${filename}" alt="${alt}" loading="lazy"><figcaption>${alt}</figcaption></figure>`;
    return `<figure class="chapter-figure"><img src="images/${filename}" alt="" loading="lazy"></figure>`;
  });

  // Callout blocks
  html = html.replace(/::: \{\.callout-(note|tip|warning|important)\}\n([\s\S]*?):::/g, (_, type, content) => {
    const icons: Record<string, string> = { note: "ℹ️", tip: "💡", warning: "⚠️", important: "❗" };
    return `<div class="callout callout-${type}"><strong>${icons[type] || ""} ${type.charAt(0).toUpperCase() + type.slice(1)}:</strong> ${content.trim()}</div>`;
  });

  // Clean up any remaining fenced div markers (:::: or ::: with attributes or bare)
  html = html.replace(/^:{3,4}\s*(?:\{[^}]*\})?\s*$/gm, "");

  // Headers
  html = html.replace(/^#### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>\n$1</ul>\n");

  // Tables (basic)
  html = html.replace(/^\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/gm, (_, header, rows) => {
    const ths = header.split("|").map((h: string) => `<th>${h.trim()}</th>`).join("");
    const trs = rows.trim().split("\n").map((row: string) => {
      const tds = row.replace(/^\||\|$/g, "").split("|").map((c: string) => `<td>${c.trim()}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("\n");
    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  });

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");

  // Paragraphs (wrap lines that aren't already wrapped)
  html = html.replace(/^(?!<[hupoltdb]|<\/|<li|<pre|<code|<div|<blockquote)(.+)$/gm, "<p>$1</p>");

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");

  // Restore code blocks from placeholders
  for (let i = 0; i < codeBlockStore.length; i++) {
    html = html.replace(`<div data-codeblock="${i}"></div>`, codeBlockStore[i]);
  }

  // Restore D2 diagram SVGs from placeholders
  for (let i = 0; i < diagramStore.length; i++) {
    html = html.replace(`<div data-diagram="${i}"></div>`, diagramStore[i]);
  }

  // Restore chapter-diagram SVGs from placeholders
  for (let i = 0; i < chapterDiagramStore.length; i++) {
    html = html.replace(`<div data-chapterdiagram="${i}"></div>`, chapterDiagramStore[i]);
  }

  return html;
}

// ── SEO Helpers ─────────────────────────────────────────────────────────────

function generateSeoTitle(chapterTitle: string, ebookTitle: string, companyName: string): string {
  const full = `${chapterTitle} | ${ebookTitle} - ${companyName}`;
  return full.length <= 60 ? full : `${chapterTitle} | ${companyName}`.substring(0, 60);
}

function generateMetaDescription(content: string): string {
  // Strip markdown, take first 155 chars of prose
  const plain = content
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#+\s.+$/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  return plain.substring(0, 155).replace(/\s+\S*$/, "") + "...";
}

function extractChapterTitle(content: string): string {
  // Try YAML frontmatter title first
  const fmMatch = content.match(/^---\n[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/m);
  if (fmMatch) return fmMatch[1].trim();

  // Fall back to first # heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].trim();

  return "Untitled";
}

function estimateReadingTime(content: string): number {
  const words = content.replace(/```[\s\S]*?```/g, "").split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 250));
}

// ── Main Generator ──────────────────────────────────────────────────────────

export interface BlogResult {
  chapter: string;
  outputPath: string;
  wordCount: number;
  title: string;
}

export function generateBlogPosts(slug: string): BlogResult[] {
  const bookDir = join(PROJECT_ROOT, "books", slug);
  const chaptersDir = join(bookDir, "chapters");
  const templatePath = join(SCRIPT_DIR, "template.html");
  const cssPath = join(SCRIPT_DIR, "styles.css");

  if (!existsSync(chaptersDir)) {
    console.error(`  No chapters found: books/${slug}/chapters/`);
    return [];
  }

  if (!existsSync(templatePath)) {
    console.error(`  Blog template not found: _blog/template.html`);
    return [];
  }

  // Load brand and ebook config
  const brandConfig = loadMergedBrand(PROJECT_ROOT, slug);
  const ebookContent = loadEbookContent(PROJECT_ROOT, slug);
  const companyName = brandConfig?.company?.name || "Zopdev";
  const companyWebsite = brandConfig?.company?.website || "https://zop.dev";
  const ebookTitle = ebookContent?.title || slug;
  const ebookSubtitle = ebookContent?.subtitle || "";

  // Build CSS vars
  const cssVars = brandConfig ? buildCssVars(brandConfig) : [];

  const template = readFileSync(templatePath, "utf-8");
  const outputDir = join(PROJECT_ROOT, "_output", "blog", slug);
  mkdirSync(outputDir, { recursive: true });

  // Copy styles
  if (existsSync(cssPath)) {
    copyFileSync(cssPath, join(outputDir, "styles.css"));
  }

  // Copy images directory if it exists
  const imagesDir = join(bookDir, "images");
  if (existsSync(imagesDir)) {
    const outputImagesDir = join(outputDir, "images");
    mkdirSync(outputImagesDir, { recursive: true });
    const imageFiles = readdirSync(imagesDir).filter(f =>
      /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f)
    );
    for (const img of imageFiles) {
      copyFileSync(join(imagesDir, img), join(outputImagesDir, img));
    }
    if (imageFiles.length > 0) {
      console.log(`  Copied ${imageFiles.length} images to blog output`);
    }
  }

  // Process each chapter (skip placeholder/scaffold files)
  const chapterFiles = readdirSync(chaptersDir)
    .filter(f => f.endsWith(".qmd") || f.endsWith(".md"))
    .filter(f => {
      const content = readFileSync(join(chaptersDir, f), "utf-8");
      return !content.includes("Placeholder content") && !content.includes("TODO: Write chapter") && !content.includes("TODO: Write preface");
    })
    .sort();

  const results: BlogResult[] = [];

  // Pre-extract all chapter titles for prev/next navigation
  const chapterTitles: string[] = chapterFiles.map(file =>
    extractChapterTitle(readFileSync(join(chaptersDir, file), "utf-8"))
  );

  for (let i = 0; i < chapterFiles.length; i++) {
    const file = chapterFiles[i];
    const qmdContent = readFileSync(join(chaptersDir, file), "utf-8");
    const chapterTitle = chapterTitles[i];
    const seoTitle = generateSeoTitle(chapterTitle, ebookTitle, companyName);
    const metaDescription = generateMetaDescription(qmdContent);
    const readingTime = estimateReadingTime(qmdContent);
    const articleHtml = markdownToHtml(qmdContent, bookDir);
    const wordCount = qmdContent.replace(/```[\s\S]*?```/g, "").split(/\s+/).length;
    const chapterSlug = basename(file, ".qmd").replace(".md", "");

    // Find PDF file for download link
    const outputBookDir = join(PROJECT_ROOT, "_output", "books", slug);
    const pdfFiles = existsSync(outputBookDir)
      ? readdirSync(outputBookDir).filter(f => f.endsWith(".pdf"))
      : [];
    const pdfUrl = pdfFiles.length > 0 ? `../../books/${slug}/${pdfFiles[0]}` : null;
    const landingUrl = existsSync(join(PROJECT_ROOT, "_output", "landing", "index.html"))
      ? `../../landing/index.html`
      : companyWebsite;

    const data = {
      seo_title: seoTitle,
      meta_description: metaDescription,
      chapter_title: chapterTitle,
      ebook_title: ebookTitle,
      ebook_subtitle: ebookSubtitle,
      company_name: companyName,
      company_website: companyWebsite,
      reading_time: readingTime,
      article_html: articleHtml,
      slug,
      chapter_slug: chapterSlug,
      css_vars: cssVars,
      year: new Date().getFullYear(),
      // PDF download link
      pdf_url: pdfUrl,
      landing_url: landingUrl,
      // Prev/next navigation
      has_prev: i > 0,
      prev_title: i > 0 ? chapterTitles[i - 1] : null,
      prev_url: i > 0 ? basename(chapterFiles[i - 1], ".qmd").replace(".md", "") + ".html" : null,
      has_next: i < chapterFiles.length - 1,
      next_title: i < chapterFiles.length - 1 ? chapterTitles[i + 1] : null,
      next_url: i < chapterFiles.length - 1 ? basename(chapterFiles[i + 1], ".qmd").replace(".md", "") + ".html" : null,
      dashboard_url: `../../dashboard/detail/${slug}/index.html`,
      index_url: "index.html",
    };

    const html = Mustache.render(template, data);
    const outputPath = join(outputDir, `${chapterSlug}.html`);
    writeFileSync(outputPath, html, "utf-8");

    results.push({ chapter: chapterSlug, outputPath, wordCount, title: chapterTitle });
  }

  // ── Generate Blog Index Page ──────────────────────────────────────────
  const indexTemplatePath = join(SCRIPT_DIR, "template-index.html");
  if (existsSync(indexTemplatePath)) {
    const indexTemplate = readFileSync(indexTemplatePath, "utf-8");
    const indexData = {
      ebook_title: ebookTitle,
      ebook_subtitle: ebookSubtitle,
      company_name: companyName,
      company_website: companyWebsite,
      css_vars: cssVars,
      articles: results.map((r, idx) => ({
        number: idx + 1,
        title: r.title,
        url: `${r.chapter}.html`,
        reading_time: estimateReadingTime(readFileSync(join(chaptersDir, chapterFiles[idx]), "utf-8")),
        word_count: r.wordCount,
      })),
      year: new Date().getFullYear(),
      dashboard_url: `../../dashboard/index.html`,
    };
    const indexHtml = Mustache.render(indexTemplate, indexData);
    writeFileSync(join(outputDir, "index.html"), indexHtml, "utf-8");
  }

  return results;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const targetSlug = process.argv[2];

  console.log("Blog Post Generator");
  console.log("===================\n");

  if (targetSlug) {
    console.log(`Generating blog posts for "${targetSlug}"...`);
    const results = generateBlogPosts(targetSlug);
    console.log(`  Generated ${results.length} blog posts`);
    for (const r of results) {
      console.log(`    ${r.chapter}: "${r.title}" (~${r.wordCount} words)`);
    }
  } else {
    // Process all ebooks from calendar.yml
    const calPath = join(PROJECT_ROOT, "calendar.yml");
    if (!existsSync(calPath)) {
      console.error("calendar.yml not found");
      process.exit(1);
    }
    const calendar = parse(readFileSync(calPath, "utf-8")) as { ebooks: Array<{ slug: string; status?: string }> };
    let total = 0;
    for (const ebook of calendar.ebooks) {
      if (ebook.status === "archived") continue;
      console.log(`\n${ebook.slug}:`);
      const results = generateBlogPosts(ebook.slug);
      console.log(`  ${results.length} posts generated`);
      total += results.length;
    }
    console.log(`\nTotal: ${total} blog posts generated`);
  }
}

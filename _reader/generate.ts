#!/usr/bin/env bun
/**
 * Standalone HTML Book Reader Generator.
 *
 * Generates a complete HTML book reading experience from QMD chapter files.
 * This is a lightweight alternative to Quarto rendering — no external tools needed.
 *
 * Produces:
 *   _output/books/{slug}/index.html  — Full book with all chapters
 *
 * Usage:
 *   bun run _reader/generate.ts <slug>       # Render one ebook
 *   bun run _reader/generate.ts              # Render all ebooks
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync } from "fs";
import { join, dirname, basename } from "path";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { parse } from "yaml";
import Mustache from "mustache";
import { loadMergedBrand, buildCssVars } from "../scripts/brand-utils.js";

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
    // List items with - value
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

// ── D2 Diagram Rendering ─────────────────────────────────────────────────────

/**
 * Parse a D2 diagram source and render as a styled HTML card.
 * Extracts node labels, descriptions, connections, and costs to create
 * a readable visual representation without needing the D2 CLI.
 */
function renderD2AsHtml(d2Source: string, fileRef?: string): string {
  const lines = d2Source.split("\n");

  // Extract title from first comment line
  let title = "Architecture Diagram";
  const titleMatch = d2Source.match(/^#\s*(.+)/m);
  if (titleMatch) title = titleMatch[1].trim();

  // Extract direction
  const dirMatch = d2Source.match(/^direction:\s*(\w+)/m);
  const direction = dirMatch ? dirMatch[1] : "right";
  const isVertical = direction === "down" || direction === "up";

  // Parse nodes (top-level named blocks with labels)
  interface DiagramNode {
    id: string;
    label: string;
    description: string[];
    fillColor: string;
    strokeColor: string;
    children: { id: string; label: string; desc: string[] }[];
  }

  const nodes: DiagramNode[] = [];
  const connections: { from: string; to: string; label: string }[] = [];

  // Simple parser: extract top-level nodes and arrows
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip comments, empty lines, vars, direction
    if (/^\s*$/.test(line) || /^\s*#/.test(line) || /^direction:/.test(line) || /^vars:/.test(line)) {
      // Skip vars block
      if (/^vars:/.test(line)) {
        let braceDepth = 0;
        for (let j = i; j < lines.length; j++) {
          if (lines[j].includes("{")) braceDepth++;
          if (lines[j].includes("}")) braceDepth--;
          if (braceDepth <= 0 && j > i) { i = j + 1; break; }
          if (j === lines.length - 1) i = j + 1;
        }
        continue;
      }
      i++;
      continue;
    }

    // Connection line: a -> b: label
    const connMatch = line.match(/^([a-zA-Z_][\w.]*)\s*->\s*([a-zA-Z_][\w.]*)\s*(?::\s*(.+))?/);
    if (connMatch) {
      connections.push({
        from: connMatch[1],
        to: connMatch[2],
        label: connMatch[3]?.replace(/\{[\s\S]*$/, "").trim() || "",
      });
      // Skip style block if any
      if (line.includes("{")) {
        let braceDepth = 0;
        for (let j = i; j < lines.length; j++) {
          if (lines[j].includes("{")) braceDepth++;
          if (lines[j].includes("}")) braceDepth--;
          if (braceDepth <= 0) { i = j + 1; break; }
          if (j === lines.length - 1) i = j + 1;
        }
      } else {
        i++;
      }
      continue;
    }

    // Top-level node definition: name: Label {
    const nodeMatch = line.match(/^([a-zA-Z_][\w]*)\s*:\s*(.+?)\s*\{?\s*$/);
    if (nodeMatch && !line.match(/^\s*(style|shape|desc|label|instances|cost|checks|tasks|req)\./)) {
      const nodeId = nodeMatch[1];
      const nodeLabel = nodeMatch[2].replace(/\{$/, "").replace(/\\n/g, " ").trim();

      // If there's a brace, parse the block
      if (line.includes("{")) {
        let braceDepth = 1;
        let fillColor = "";
        let strokeColor = "";
        const description: string[] = [];
        const children: { id: string; label: string; desc: string[] }[] = [];
        let inMarkdown = false;
        let mdLines: string[] = [];
        let currentChild: { id: string; label: string; desc: string[] } | null = null;
        let childBraceDepth = 0;

        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];

          if (l.includes("{") && !l.includes("|md")) braceDepth++;
          if (l.includes("}") && !inMarkdown) braceDepth--;

          if (braceDepth <= 0) { i = j + 1; break; }

          // Markdown block
          if (l.trim() === "|" && inMarkdown) {
            inMarkdown = false;
            if (currentChild) {
              currentChild.desc.push(...mdLines);
            } else {
              description.push(...mdLines);
            }
            mdLines = [];
            continue;
          }
          if (/\|md\s*$/.test(l.trim())) {
            inMarkdown = true;
            mdLines = [];
            continue;
          }
          if (inMarkdown) {
            const cleaned = l.trim().replace(/^\*\*(.+)\*\*$/, "$1").replace(/^- /, "• ");
            if (cleaned) mdLines.push(cleaned);
            continue;
          }

          // Extract style colors
          const fillMatch = l.match(/style\.fill:\s*["']([^"']+)/);
          if (fillMatch && !currentChild) fillColor = fillMatch[1];
          const strokeMatch = l.match(/style\.stroke:\s*["']([^"']+)/);
          if (strokeMatch && !currentChild) strokeColor = strokeMatch[1];

          // Child nodes inside this block
          const childMatch = l.match(/^\s+([a-zA-Z_][\w]*)\s*:\s*(.+?)\s*\{?\s*$/);
          if (childMatch && !childMatch[1].match(/^(style|shape|desc|label|instances|cost|checks|tasks|req)$/)) {
            currentChild = { id: childMatch[1], label: childMatch[2].replace(/\{$/, "").replace(/\\n/g, " ").trim(), desc: [] };
            if (l.includes("{")) childBraceDepth = 1;
            continue;
          }

          if (currentChild) {
            if (l.includes("{") && !l.includes("|md")) childBraceDepth++;
            if (l.includes("}")) childBraceDepth--;

            // Extract child info
            const childInfoMatch = l.match(/^\s+(instances|cost):\s*(.+)/);
            if (childInfoMatch) {
              currentChild.desc.push(`${childInfoMatch[1]}: ${childInfoMatch[2].replace(/\\(\$)/g, "$1").trim()}`);
            }

            if (childBraceDepth <= 0 && currentChild) {
              children.push(currentChild);
              currentChild = null;
            }
          }

          // Simple key: value inside node
          const kvMatch = l.match(/^\s+(label|instances|cost|desc):\s*(.+)/);
          if (kvMatch && !currentChild) {
            const val = kvMatch[2].replace(/\\(\$)/g, "$1").replace(/\|md/, "").trim();
            if (val && val !== "|") description.push(val);
          }

          if (j === lines.length - 1) i = j + 1;
        }

        nodes.push({ id: nodeId, label: nodeLabel, description, fillColor, strokeColor, children });
      } else {
        // Simple node, no block
        nodes.push({ id: nodeId, label: nodeLabel, description: [], fillColor: "", strokeColor: "", children: [] });
        i++;
      }
      continue;
    }

    i++;
  }

  // Skip rendering if we found nothing useful
  if (nodes.length === 0 && connections.length === 0) {
    return `<div class="diagram-card"><div class="diagram-card-header"><span class="diagram-icon">📊</span>${title}</div><div class="diagram-card-body"><p class="diagram-notice">Diagram source available — render with D2 CLI for full visualization.</p></div></div>`;
  }

  // Build HTML
  let html = `<div class="diagram-card">`;
  html += `<div class="diagram-card-header"><span class="diagram-icon">📊</span>${title}</div>`;
  html += `<div class="diagram-card-body">`;

  // Render nodes as styled boxes in a flow
  html += `<div class="diagram-flow ${isVertical ? "diagram-flow--vertical" : "diagram-flow--horizontal"}">`;

  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    const bgColor = node.fillColor || "#f8fafc";
    const borderColor = node.strokeColor || "#0891b2";

    html += `<div class="diagram-node" style="border-color: ${borderColor}; background: ${bgColor};">`;
    html += `<div class="diagram-node-label" style="color: ${borderColor};">${node.label}</div>`;

    if (node.description.length > 0) {
      html += `<div class="diagram-node-desc">`;
      for (const d of node.description) {
        html += `<div class="diagram-desc-line">${d.replace(/\$(\d)/g, "$$$$1")}</div>`;
      }
      html += `</div>`;
    }

    if (node.children.length > 0) {
      html += `<div class="diagram-children">`;
      for (const child of node.children) {
        html += `<div class="diagram-child">`;
        html += `<div class="diagram-child-label">${child.label}</div>`;
        for (const d of child.desc) {
          html += `<div class="diagram-child-desc">${d}</div>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;

    // Arrow between nodes
    if (ni < nodes.length - 1) {
      // Find matching connection label
      const conn = connections.find(c =>
        c.from === node.id || c.from.startsWith(node.id + ".")
      );
      const arrowLabel = conn?.label || "";
      if (isVertical) {
        html += `<div class="diagram-arrow diagram-arrow--down">${arrowLabel ? `<span class="diagram-arrow-label">${arrowLabel}</span>` : ""}↓</div>`;
      } else {
        html += `<div class="diagram-arrow diagram-arrow--right">${arrowLabel ? `<span class="diagram-arrow-label">${arrowLabel}</span>` : ""}→</div>`;
      }
    }
  }

  html += `</div>`; // diagram-flow
  html += `</div>`; // diagram-card-body
  html += `</div>`; // diagram-card

  return html;
}

/**
 * Render a D2 diagram using the CLI if available, otherwise fallback to HTML card.
 */
function findD2Cli(): string | null {
  const candidates = [
    "d2",
    join(process.env.HOME || "", ".local", "bin", "d2"),
    "/usr/local/bin/d2",
    "/opt/homebrew/bin/d2",
  ];
  for (const cmd of candidates) {
    try {
      execSync(`"${cmd}" --version`, { stdio: "pipe" });
      return cmd;
    } catch { /* not found */ }
  }
  return null;
}

const d2Cli = findD2Cli();

/**
 * Classify SVG as "diagram-wide" or "diagram-normal" based on aspect ratio.
 * Wide diagrams (>3:1) get horizontal scroll at a readable minimum width.
 */
function classifyDiagramWidth(svg: string): string {
  const vb = svg.match(/viewBox=["']([^"']+)["']/);
  if (vb) {
    const parts = vb[1].split(/\s+/).map(Number);
    if (parts.length === 4 && parts[3] > 0) {
      const ratio = parts[2] / parts[3];
      if (ratio > 3) return "diagram-wide";
    }
  }
  // Also check explicit width/height attributes
  const wMatch = svg.match(/\bwidth=["'](\d+)/);
  const hMatch = svg.match(/\bheight=["'](\d+)/);
  if (wMatch && hMatch) {
    const w = parseInt(wMatch[1], 10);
    const h = parseInt(hMatch[1], 10);
    if (h > 0 && w / h > 3) return "diagram-wide";
  }
  return "diagram-normal";
}

function compileD2ToSvg(source: string): string {
  if (!d2Cli) return renderD2AsHtml(source);

  try {
    const tmpIn = join(tmpdir(), `d2-${Date.now()}-${Math.random().toString(36).slice(2)}.d2`);
    const tmpOut = join(tmpdir(), `d2-${Date.now()}-${Math.random().toString(36).slice(2)}.svg`);
    writeFileSync(tmpIn, source);
    execSync(`"${d2Cli}" --layout=elk --theme=0 --pad=40 "${tmpIn}" "${tmpOut}"`, { stdio: "pipe" });
    let svg = readFileSync(tmpOut, "utf-8");
    try { unlinkSync(tmpIn); } catch { }
    try { unlinkSync(tmpOut); } catch { }
    // Clean SVG for HTML5: strip XML declaration and CDATA markers
    svg = svg.replace(/<\?xml[^?]*\?>\s*/g, "").replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
    // Wrap SVG in a responsive container with size class
    return `<div class="diagram-svg-wrapper ${classifyDiagramWidth(svg)}">${svg}</div>`;
  } catch (err) {
    return renderD2AsHtml(source);
  }
}

/**
 * Resolve a D2 file reference and render it as SVG/HTML.
 */
function resolveD2File(bookDir: string, fileAttr: string): string {
  const d2Path = join(bookDir, fileAttr);
  if (existsSync(d2Path)) {
    const source = readFileSync(d2Path, "utf-8");
    return compileD2ToSvg(source);
  }
  return `<div class="diagram-card"><div class="diagram-card-header"><span class="diagram-icon">📊</span>Diagram</div><div class="diagram-card-body"><p class="diagram-notice">Diagram file not found: ${fileAttr}</p></div></div>`;
}

// ── Markdown to HTML (lightweight) ──────────────────────────────────────────

function markdownToHtml(md: string, bookDir?: string): string {
  let html = md;

  // Strip YAML frontmatter
  html = html.replace(/^---[\s\S]*?---\n*/m, "");

  // Remove HTML comments
  html = html.replace(/<!--[\s\S]*?-->/g, "");

  // Handle content-visible blocks: keep HTML blocks, extract PDF/EPUB for static fallback
  // First, unwrap :::: {.content-visible when-format="html"} → keep inner content
  html = html.replace(/:{3,4}\s*\{\.content-visible\s+when-format="html"\}\s*\n([\s\S]*?):{3,4}\s*$/gm, "$1");

  // Clean inline SVG for HTML5 embedding: strip XML declaration and CDATA markers
  function cleanSvgForHtml(svg: string): string {
    return svg
      .replace(/<\?xml[^?]*\?>\s*/g, "")       // Strip <?xml ... ?>
      .replace(/<!\[CDATA\[/g, "")               // Strip <![CDATA[
      .replace(/\]\]>/g, "");                     // Strip ]]>
  }

  // Handle ::: {.chapter-diagram} blocks with inline SVG → extract SVG to placeholder
  const diagramStore: string[] = [];

  html = html.replace(/:{3,4}\s*\{\.chapter-diagram\}\s*\n([\s\S]*?)\n\n\*([^*]+)\*\s*\n:{3,4}/g, (_, svgContent, caption) => {
    const cleanSvg = cleanSvgForHtml(svgContent.trim());
    const rendered = `<div class="diagram-svg-wrapper ${classifyDiagramWidth(cleanSvg)}">${cleanSvg}</div><p class="diagram-caption"><em>${caption}</em></p>`;
    const idx = diagramStore.length;
    diagramStore.push(rendered);
    return `\n<div data-diagram="${idx}"></div>\n`;
  });

  // Also handle bare ::: {.chapter-diagram} without nested content-visible (legacy format)
  html = html.replace(/:::\s*\{\.chapter-diagram\}\s*\n([\s\S]*?)\n\n\*([^*]+)\*\s*\n:::/g, (_, svgContent, caption) => {
    const cleanSvg = cleanSvgForHtml(svgContent.trim());
    const rendered = `<div class="diagram-svg-wrapper ${classifyDiagramWidth(cleanSvg)}">${cleanSvg}</div><p class="diagram-caption"><em>${caption}</em></p>`;
    const idx = diagramStore.length;
    diagramStore.push(rendered);
    return `\n<div data-diagram="${idx}"></div>\n`;
  });

  // Extract static fallback from content-visible blocks (PDF/EPUB fallback → show in HTML too)
  // These contain the static ROI tables we want to show
  const staticFallbacks: string[] = [];
  html = html.replace(/:{3,4}\s*\{\.content-visible\s+when-format="(?:pdf|epub)"\}\s*\n([\s\S]*?):{3,4}/g, (_, content) => {
    // Strip image references from fallback — reader has inline SVGs for diagrams,
    // PDF-only refs (e.g. ![...](diagrams/xx.svg)) would be broken
    let cleaned = content.trim().replace(/!\[[^\]]*\]\([^)]+\)\s*/g, "").trim();
    if (cleaned) staticFallbacks.push(cleaned);
    return ""; // Remove — we'll use the first one found after removing OJS blocks
  });

  // File-referenced D2 blocks
  html = html.replace(/```\{\.?d2[^}]*file="([^"]+)"[^}]*\}\n([\s\S]*?)```/g, (_, fileRef) => {
    const rendered = bookDir ? resolveD2File(bookDir, fileRef) : renderD2AsHtml("", fileRef);
    const idx = diagramStore.length;
    diagramStore.push(rendered);
    return `\n<div data-diagram="${idx}"></div>\n`;
  });

  // Inline D2 blocks
  html = html.replace(/```\{\.?d2[^}]*\}\n([\s\S]*?)```/g, (_, source) => {
    const rendered = compileD2ToSvg(source);
    const idx = diagramStore.length;
    diagramStore.push(rendered);
    return `\n<div data-diagram="${idx}"></div>\n`;
  });

  // OJS blocks — replace ALL consecutive OJS blocks with a single static ROI table (use placeholder store)
  let ojsReplacementDone = false;
  html = html.replace(/```\{ojs[^}]*\}[\s\S]*?```/g, () => {
    if (!ojsReplacementDone && staticFallbacks.length > 0) {
      ojsReplacementDone = true;
      // Convert the static fallback (markdown table) to HTML before embedding
      const tableHtml = markdownToHtml(staticFallbacks[0]);
      const rendered = `<div class="static-calculator"><div class="static-calculator-header">📊 ROI Calculator (Static View)</div><div class="static-calculator-body">${tableHtml}</div></div>`;
      const idx = diagramStore.length;
      diagramStore.push(rendered);
      return `\n<div data-diagram="${idx}"></div>\n`;
    }
    return "";
  });

  // Remove empty fenced code blocks (```\n``` with no content between them)
  html = html.replace(/```\s*\n```/g, "");

  // Fix malformed: bare ``` on its own line after a heading — remove the stray fence opener
  // This catches cases like: ## Heading\n\n```\n\nProse text...
  html = html.replace(/^(#{1,6}\s+.+)\n\n```\s*\n\n/gm, "$1\n\n");

  // Fix malformed: ``` merged with prose on same line (close fence not on own line)
  // e.g., "``` If your organization..." → close fence + newline + prose
  html = html.replace(/^```\s+([A-Z])/gm, "```\n\n$1");

  // Clean any leaked OJS template expressions (${...}) from split OJS blocks
  html = html.replace(/^\s*<strong>Best option:<\/strong>\s*\$\{comparison\.reduce[\s\S]*?vs\.\s*the most expensive option\.\s*<\/p>\s*<\/div>`?\s*$/gm, "");
  html = html.replace(/^\s*roi:\s*cumInvestment\s*>[\s\S]*?return found \? found\.month : null;\s*\}$/gm, "");

  // Replace *Visualize ...* text descriptions with styled diagram boxes (use placeholder store)
  html = html.replace(/^\*Visualize ([^*]+)\*(?:\s*\*\(diagram:[^)]*\)\*)?$/gm, (_, desc) => {
    const rendered = `<div class="diagram-visual-box"><div class="diagram-visual-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 12h18M12 3v18M7 7l2 2M15 7l2 2M7 15l2 2M15 15l2 2"/></svg></div><p>${desc.trim()}</p></div>`;
    const idx = diagramStore.length;
    diagramStore.push(rendered);
    return `\n<div data-diagram="${idx}"></div>\n`;
  });

  // Also handle the longer form
  html = html.replace(/^Visualized as a flow: (.+)$/gm, (_, desc) => {
    const rendered = `<div class="diagram-visual-box"><div class="diagram-visual-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#0891b2" stroke-width="1.5"><path d="M4 6h4M14 6h6M10 6l2-2 2 2M10 6l2 2 2-2M4 12h6M14 12h6M12 10v4M4 18h16"/></svg></div><p>${desc.trim()}</p></div>`;
    const idx = diagramStore.length;
    diagramStore.push(rendered);
    return `\n<div data-diagram="${idx}"></div>\n`;
  });

  // Code blocks (fenced) — extract to placeholder store (protects from paragraph wrapping)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const langAttr = lang ? ` class="language-${lang}"` : "";
    const langLabel = lang ? `<span class="code-lang">${lang}</span>` : "";
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Apply syntax highlighting for YAML
    const highlighted = lang === "yaml" || lang === "yml" ? highlightYaml(escaped) : escaped;
    const rendered = `<div class="code-block">${langLabel}<pre><code${langAttr}>${highlighted}</code></pre></div>`;
    const idx = diagramStore.length;
    diagramStore.push(rendered);
    return `\n<div data-diagram="${idx}"></div>\n`;
  });

  // Clean up any remaining stray triple backticks (from malformed fenced blocks in source content)
  html = html.replace(/^```\s*$/gm, "");

  // Image references — render actual images (resolved at render time by generateBookHtml)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    // Normalize path: strip leading ../ since images will be copied to images/ in output
    const normalizedSrc = src.replace(/^\.\.\//g, "");
    if (alt) return `<figure class="chapter-figure"><img src="${normalizedSrc}" alt="${alt}" loading="lazy"><figcaption>${alt}</figcaption></figure>`;
    return `<figure class="chapter-figure"><img src="${normalizedSrc}" alt="" loading="lazy"></figure>`;
  });

  // Callout blocks
  html = html.replace(/::: \{\.callout-(note|tip|warning|important)\}\n([\s\S]*?):::/g, (_, type, content) => {
    const icons: Record<string, string> = { note: "ℹ️", tip: "💡", warning: "⚠️", important: "❗" };
    return `<div class="callout callout-${type}"><div class="callout-header">${icons[type] || "📌"} ${type.charAt(0).toUpperCase() + type.slice(1)}</div><div class="callout-body">${content.trim()}</div></div>`;
  });

  // Clean up any remaining fenced div markers (:::: or ::: with attributes or bare)
  html = html.replace(/^:{3,4}\s*(?:\{[^}]*\})?\s*$/gm, "");

  // Headers — add IDs for TOC linking
  html = html.replace(/^#### (.+)$/gm, (_, title) => {
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<h4 id="${id}">${title}</h4>`;
  });
  html = html.replace(/^### (.+)$/gm, (_, title) => {
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<h3 id="${id}">${title}</h3>`;
  });
  html = html.replace(/^## (.+?)(?:\s*\{[^}]*\})?$/gm, (_, title) => {
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<h2 id="${id}">${title}</h2>`;
  });
  html = html.replace(/^# (.+?)(?:\s*\{[^}]*\})?$/gm, (_, title) => {
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<h1 id="${id}">${title}</h1>`;
  });

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>\n$1</ul>\n");

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");

  // Tables (basic)
  html = html.replace(/^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/gm, (_, header, rows) => {
    const ths = header.split("|").filter((h: string) => h.trim()).map((h: string) => `<th>${h.trim()}</th>`).join("");
    const trs = rows.trim().split("\n").map((row: string) => {
      const tds = row.replace(/^\||\|$/g, "").split("|").filter((c: string) => c.trim()).map((c: string) => `<td>${c.trim()}</td>`).join("");
      return `<tr>${tds}</tr>`;
    }).join("\n");
    return `<div class="table-wrapper"><table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div>`;
  });

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, "<blockquote><p>$1</p></blockquote>");

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr>");

  // Paragraphs (wrap lines that aren't already wrapped)
  html = html.replace(/^(?!<[hupoltdb]|<\/|<li|<pre|<code|<div|<blockquote|<hr|<figure|<img|<nav)(.+)$/gm, "<p>$1</p>");

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");

  // Restore diagram cards from placeholder store
  html = html.replace(/<div data-diagram="(\d+)"><\/div>/g, (_, idx) => {
    return diagramStore[parseInt(idx)] || "";
  });

  return html;
}

// ── Chapter Processing ──────────────────────────────────────────────────────

function extractChapterTitle(content: string): string {
  const fmMatch = content.match(/^---\n[\s\S]*?title:\s*["']?([^"'\n]+)["']?[\s\S]*?---/m);
  if (fmMatch) return fmMatch[1].trim();
  const h1Match = content.match(/^#\s+(.+?)(?:\s*\{[^}]*\})?$/m);
  if (h1Match) return h1Match[1].trim();
  return "Untitled";
}

function estimateReadingTime(content: string): number {
  const words = content.replace(/```[\s\S]*?```/g, "").split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 250));
}

function estimateWordCount(content: string): number {
  return content.replace(/```[\s\S]*?```/g, "").replace(/^---[\s\S]*?---/m, "").split(/\s+/).filter(w => w.length > 0).length;
}

interface ChapterData {
  id: string;
  number: number;
  title: string;
  html: string;
  reading_time: number;
  word_count: number;
}

// ── Main Generator ──────────────────────────────────────────────────────────

function generateBookHtml(slug: string): boolean {
  const bookDir = join(PROJECT_ROOT, "books", slug);
  const chaptersDir = join(bookDir, "chapters");
  const templatePath = join(SCRIPT_DIR, "template.html");

  if (!existsSync(bookDir)) {
    console.error(`  Book not found: books/${slug}/`);
    return false;
  }

  if (!existsSync(templatePath)) {
    console.error(`  Reader template not found: _reader/template.html`);
    return false;
  }

  // Load metadata
  const topicPath = join(bookDir, "topic.yml");
  const ebookYmlPath = join(bookDir, "ebook.yml");
  let title = slug;
  let subtitle = "";

  if (existsSync(ebookYmlPath)) {
    try {
      const ebookData = parse(readFileSync(ebookYmlPath, "utf-8")) as any;
      if (ebookData?.meta?.title) title = ebookData.meta.title;
      if (ebookData?.meta?.subtitle) subtitle = ebookData.meta.subtitle;
    } catch { /* use defaults */ }
  }
  if (title === slug && existsSync(topicPath)) {
    try {
      const topicData = parse(readFileSync(topicPath, "utf-8")) as any;
      if (topicData?.title) title = topicData.title;
      if (topicData?.subtitle) subtitle = topicData.subtitle || "";
    } catch { /* use defaults */ }
  }

  // Load brand for CSS vars
  let cssVars: Array<{ name: string; value: string }> = [];
  let companyName = "Zopdev";
  let companyWebsite = "https://zopdev.com";
  try {
    const brandConfig = loadMergedBrand(PROJECT_ROOT, slug);
    if (brandConfig) {
      cssVars = buildCssVars(brandConfig);
      companyName = brandConfig?.company?.name || companyName;
      companyWebsite = brandConfig?.company?.website || companyWebsite;
    }
  } catch { /* use defaults */ }

  // Process chapters
  const chapters: ChapterData[] = [];

  // First, process index.qmd if it exists
  const indexQmd = join(bookDir, "index.qmd");
  if (existsSync(indexQmd)) {
    const content = readFileSync(indexQmd, "utf-8");
    const indexHtml = markdownToHtml(content, bookDir);
    // Only include if it has real content beyond just the frontmatter
    if (indexHtml.trim().length > 50) {
      chapters.push({
        id: "preface",
        number: 0,
        title: "Preface",
        html: indexHtml,
        reading_time: estimateReadingTime(content),
        word_count: estimateWordCount(content),
      });
    }
  }

  // Then process chapter files
  if (existsSync(chaptersDir)) {
    const files = readdirSync(chaptersDir)
      .filter(f => (f.endsWith(".qmd") || f.endsWith(".md")) && !f.includes(".plan."))
      .sort();

    for (let i = 0; i < files.length; i++) {
      const filePath = join(chaptersDir, files[i]);
      const content = readFileSync(filePath, "utf-8");
      const chapterTitle = extractChapterTitle(content);
      const chapterHtml = markdownToHtml(content, bookDir);
      const chapterId = basename(files[i], ".qmd").replace(".md", "");

      chapters.push({
        id: chapterId,
        number: i + 1,
        title: chapterTitle,
        html: chapterHtml,
        reading_time: estimateReadingTime(content),
        word_count: estimateWordCount(content),
      });
    }
  }

  if (chapters.length === 0) {
    console.warn(`  No chapters found for ${slug}`);
    return false;
  }

  // Calculate totals
  const totalReadingTime = chapters.reduce((sum, ch) => sum + ch.reading_time, 0);
  const totalWords = chapters.reduce((sum, ch) => sum + ch.word_count, 0);

  // Build TOC data
  const toc = chapters.map(ch => ({
    id: ch.id,
    number: ch.number,
    title: ch.title,
    reading_time: ch.reading_time,
    is_preface: ch.number === 0,
  }));

  // Build template data
  const data = {
    title,
    subtitle,
    company_name: companyName,
    company_website: companyWebsite,
    css_vars: cssVars,
    slug,
    chapter_count: chapters.filter(c => c.number > 0).length,
    total_reading_time: totalReadingTime,
    total_words: totalWords,
    year: new Date().getFullYear(),
    toc,
    chapters: chapters.map(ch => ({
      ...ch,
      is_preface: ch.number === 0,
    })),
    dashboard_url: `../../dashboard/detail/${slug}/index.html`,
    landing_url: `../../landing/index.html`,
    has_pdf: existsSync(join(PROJECT_ROOT, "_output", "books", slug)) &&
      readdirSync(join(PROJECT_ROOT, "_output", "books", slug)).some(f => f.endsWith(".pdf")),
    pdf_filename: (() => {
      const outDir = join(PROJECT_ROOT, "_output", "books", slug);
      if (!existsSync(outDir)) return "";
      const pdfs = readdirSync(outDir).filter(f => f.endsWith(".pdf"));
      return pdfs.length > 0 ? pdfs[0] : "";
    })(),
  };

  // Render template
  const template = readFileSync(templatePath, "utf-8");
  const html = Mustache.render(template, data);

  // Write output
  const outputDir = join(PROJECT_ROOT, "_output", "books", slug);
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, "index.html"), html, "utf-8");

  // Copy styles
  const cssPath = join(SCRIPT_DIR, "styles.css");
  if (existsSync(cssPath)) {
    copyFileSync(cssPath, join(outputDir, "reader-styles.css"));
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
      console.log(`  📸 Copied ${imageFiles.length} images to output`);
    }
  }

  const fileSizeKb = Math.round(Buffer.byteLength(html) / 1024);
  console.log(`  ✅ ${slug}: ${chapters.length} chapters, ${totalWords} words, ${totalReadingTime} min read (${fileSizeKb}KB)`);

  return true;
}

// ── CLI ──────────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const targetSlug = process.argv[2];

  console.log("📖 HTML Book Reader Generator");
  console.log("═".repeat(40) + "\n");

  if (targetSlug) {
    const ok = generateBookHtml(targetSlug);
    if (!ok) process.exit(1);
  } else {
    // Process all ebooks
    const booksDir = join(PROJECT_ROOT, "books");
    if (!existsSync(booksDir)) {
      console.error("No books/ directory found");
      process.exit(1);
    }

    const slugs = readdirSync(booksDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort();

    let success = 0;
    let failed = 0;

    for (const slug of slugs) {
      const topicPath = join(booksDir, slug, "topic.yml");
      if (!existsSync(topicPath)) continue;
      const ok = generateBookHtml(slug);
      if (ok) success++;
      else failed++;
    }

    console.log(`\n✅ Generated: ${success} books${failed > 0 ? `, ❌ Failed: ${failed}` : ""}`);
  }
}

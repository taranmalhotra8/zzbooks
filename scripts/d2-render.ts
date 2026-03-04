/**
 * d2-render.ts — D2 → SVG/PNG rendering utility
 *
 * Uses the D2 CLI to render D2 source code to SVG or PNG.
 * Used by blog and social generators to embed diagram visuals.
 */

import { execSync } from "child_process";
import { writeFileSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Render D2 source code to SVG string.
 */
export function renderD2ToSvg(d2Source: string, options?: {
  layout?: string;
  theme?: string;
  pad?: number;
}): string {
  const layout = options?.layout || "elk";
  const theme = options?.theme || "0"; // CLI accepts numeric themes
  const pad = options?.pad || 40;

  const tmpInput = join(tmpdir(), `d2-input-${Date.now()}-${Math.random().toString(36).slice(2)}.d2`);
  const tmpOutput = join(tmpdir(), `d2-output-${Date.now()}-${Math.random().toString(36).slice(2)}.svg`);

  try {
    writeFileSync(tmpInput, d2Source);
    execSync(
      `d2 --layout=${layout} --theme=${theme} --pad=${pad} "${tmpInput}" "${tmpOutput}"`,
      { stdio: "pipe", timeout: 30000 }
    );
    let svg = readFileSync(tmpOutput, "utf-8");
    // Clean SVG for HTML5 embedding: strip XML declaration and CDATA markers
    svg = svg.replace(/<\?xml[^?]*\?>\s*/g, "").replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
    return svg;
  } catch (err: any) {
    console.warn(`D2 render failed: ${err.message}`);
    return "";
  } finally {
    try { unlinkSync(tmpInput); } catch {}
    try { unlinkSync(tmpOutput); } catch {}
  }
}

/**
 * Render D2 source code to a base64-encoded SVG data URI.
 * Useful for embedding in HTML img tags.
 */
export function renderD2ToDataUri(d2Source: string, options?: {
  layout?: string;
  theme?: string;
  pad?: number;
}): string {
  const svg = renderD2ToSvg(d2Source, options);
  if (!svg) return "";
  const encoded = Buffer.from(svg).toString("base64");
  return `data:image/svg+xml;base64,${encoded}`;
}

/**
 * Render D2 to PNG using Sharp (if available).
 * Falls back to SVG if Sharp is not installed.
 */
export async function renderD2ToPng(
  d2Source: string,
  width: number = 1080,
  height: number = 600,
  options?: { layout?: string; theme?: string; pad?: number }
): Promise<Buffer | null> {
  const svg = renderD2ToSvg(d2Source, options);
  if (!svg) return null;

  try {
    // Dynamic import for Sharp (optional dependency)
    const sharp = await import("sharp");
    const pngBuffer = await sharp
      .default(Buffer.from(svg))
      .resize(width, height, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();
    return pngBuffer;
  } catch (err) {
    console.warn("Sharp not available for PNG conversion, returning null");
    return null;
  }
}

/**
 * Render D2 source as a styled HTML card (no D2 CLI needed).
 * Parses node labels, descriptions, children, and connections into
 * a visual card layout. Used as fallback when D2 CLI is unavailable.
 */
export function renderD2AsHtmlCard(d2Source: string): string {
  const lines = d2Source.split("\n");

  // Extract title from first comment
  let title = "Architecture Diagram";
  const titleMatch = d2Source.match(/^#\s*(.+)/m);
  if (titleMatch) title = titleMatch[1].trim();

  // Direction
  const dirMatch = d2Source.match(/^direction:\s*(\w+)/m);
  const direction = dirMatch ? dirMatch[1] : "right";
  const isVertical = direction === "down" || direction === "up";

  interface DNode {
    id: string; label: string; description: string[]; fillColor: string;
    strokeColor: string; children: { id: string; label: string; desc: string[] }[];
  }

  const nodes: DNode[] = [];
  const connections: { from: string; to: string; label: string }[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line) || /^\s*#/.test(line) || /^direction:/.test(line)) { i++; continue; }
    if (/^vars:/.test(line)) {
      let bd = 0;
      for (let j = i; j < lines.length; j++) {
        if (lines[j].includes("{")) bd++;
        if (lines[j].includes("}")) bd--;
        if (bd <= 0 && j > i) { i = j + 1; break; }
        if (j === lines.length - 1) i = j + 1;
      }
      continue;
    }

    const connMatch = line.match(/^([a-zA-Z_][\w.]*)\s*->\s*([a-zA-Z_][\w.]*)\s*(?::\s*(.+))?/);
    if (connMatch) {
      connections.push({ from: connMatch[1], to: connMatch[2], label: connMatch[3]?.replace(/\{[\s\S]*$/, "").trim() || "" });
      if (line.includes("{")) {
        let bd = 0;
        for (let j = i; j < lines.length; j++) {
          if (lines[j].includes("{")) bd++;
          if (lines[j].includes("}")) bd--;
          if (bd <= 0) { i = j + 1; break; }
          if (j === lines.length - 1) i = j + 1;
        }
      } else i++;
      continue;
    }

    const nodeMatch = line.match(/^([a-zA-Z_][\w]*)\s*:\s*(.+?)\s*\{?\s*$/);
    if (nodeMatch && !line.match(/^\s*(style|shape|desc|label|instances|cost|checks|tasks|req)\./)) {
      const nodeId = nodeMatch[1];
      const nodeLabel = nodeMatch[2].replace(/\{$/, "").replace(/\\n/g, " ").trim();

      if (line.includes("{")) {
        let bd = 1;
        let fillColor = "", strokeColor = "";
        const description: string[] = [];
        const children: { id: string; label: string; desc: string[] }[] = [];
        let inMd = false;
        let mdLines: string[] = [];
        let currentChild: { id: string; label: string; desc: string[] } | null = null;
        let childBd = 0;

        for (let j = i + 1; j < lines.length; j++) {
          const l = lines[j];
          if (l.includes("{") && !l.includes("|md")) bd++;
          if (l.includes("}") && !inMd) bd--;
          if (bd <= 0) { i = j + 1; break; }

          if (l.trim() === "|" && inMd) {
            inMd = false;
            if (currentChild) currentChild.desc.push(...mdLines);
            else description.push(...mdLines);
            mdLines = [];
            continue;
          }
          if (/\|md\s*$/.test(l.trim())) { inMd = true; mdLines = []; continue; }
          if (inMd) {
            const cleaned = l.trim().replace(/^\*\*(.+)\*\*$/, "$1").replace(/^- /, "• ");
            if (cleaned) mdLines.push(cleaned);
            continue;
          }

          const fm = l.match(/style\.fill:\s*["']([^"']+)/);
          if (fm && !currentChild) fillColor = fm[1];
          const sm = l.match(/style\.stroke:\s*["']([^"']+)/);
          if (sm && !currentChild) strokeColor = sm[1];

          const cm = l.match(/^\s+([a-zA-Z_][\w]*)\s*:\s*(.+?)\s*\{?\s*$/);
          if (cm && !cm[1].match(/^(style|shape|desc|label|instances|cost|checks|tasks|req)$/)) {
            currentChild = { id: cm[1], label: cm[2].replace(/\{$/, "").replace(/\\n/g, " ").trim(), desc: [] };
            if (l.includes("{")) childBd = 1;
            continue;
          }

          if (currentChild) {
            if (l.includes("{") && !l.includes("|md")) childBd++;
            if (l.includes("}")) childBd--;
            const ci = l.match(/^\s+(instances|cost):\s*(.+)/);
            if (ci) currentChild.desc.push(`${ci[1]}: ${ci[2].replace(/\\(\$)/g, "$1").trim()}`);
            if (childBd <= 0 && currentChild) { children.push(currentChild); currentChild = null; }
          }

          const kv = l.match(/^\s+(label|instances|cost|desc):\s*(.+)/);
          if (kv && !currentChild) {
            const val = kv[2].replace(/\\(\$)/g, "$1").replace(/\|md/, "").trim();
            if (val && val !== "|") description.push(val);
          }
          if (j === lines.length - 1) i = j + 1;
        }

        nodes.push({ id: nodeId, label: nodeLabel, description, fillColor, strokeColor, children });
      } else {
        nodes.push({ id: nodeId, label: nodeLabel, description: [], fillColor: "", strokeColor: "", children: [] });
        i++;
      }
      continue;
    }
    i++;
  }

  if (nodes.length === 0) {
    return `<div class="diagram-card"><div class="diagram-card-header">📊 ${title}</div><div class="diagram-card-body"><p><em>Diagram source available — render with D2 CLI for full visualization.</em></p></div></div>`;
  }

  let html = `<div class="diagram-card"><div class="diagram-card-header">📊 ${title}</div><div class="diagram-card-body">`;
  html += `<div class="diagram-flow ${isVertical ? "diagram-flow--vertical" : "diagram-flow--horizontal"}">`;

  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];
    const bg = node.fillColor || "#f8fafc";
    const border = node.strokeColor || "#0891b2";

    html += `<div class="diagram-node" style="border-color:${border};background:${bg};">`;
    html += `<div class="diagram-node-label" style="color:${border};">${node.label}</div>`;
    if (node.description.length) {
      html += `<div class="diagram-node-desc">${node.description.map(d => `<div>${d}</div>`).join("")}</div>`;
    }
    if (node.children.length) {
      html += `<div class="diagram-children">${node.children.map(c =>
        `<div class="diagram-child"><div class="diagram-child-label">${c.label}</div>${c.desc.map(d => `<div class="diagram-child-desc">${d}</div>`).join("")}</div>`
      ).join("")}</div>`;
    }
    html += `</div>`;

    if (ni < nodes.length - 1) {
      const conn = connections.find(c => c.from === node.id || c.from.startsWith(node.id + "."));
      const lbl = conn?.label || "";
      html += isVertical
        ? `<div class="diagram-arrow diagram-arrow--down">${lbl ? `<span class="diagram-arrow-label">${lbl}</span>` : ""}↓</div>`
        : `<div class="diagram-arrow diagram-arrow--right">${lbl ? `<span class="diagram-arrow-label">${lbl}</span>` : ""}→</div>`;
    }
  }

  html += `</div></div></div>`;
  return html;
}

/**
 * Extract D2 code blocks from a QMD file's content string.
 * Strips Quarto comment directives (//| ...) that the D2 CLI doesn't understand.
 * Returns an array of clean D2 source strings.
 */
export function extractD2Blocks(content: string): string[] {
  const blocks: string[] = [];
  const regex = /```\{\.?d2[^}]*\}\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    // Strip Quarto comment directives (//| label:, //| fig-cap:, etc.)
    const cleaned = match[1]
      .split("\n")
      .filter(line => !line.trimStart().startsWith("//|"))
      .join("\n")
      .trim();
    if (cleaned) blocks.push(cleaned);
  }
  return blocks;
}

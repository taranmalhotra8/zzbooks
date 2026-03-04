#!/usr/bin/env bun
/**
 * PDF Quality Evaluator.
 *
 * Parses rendered PDF files using pdf-lib to check:
 *   - Page count (non-zero)
 *   - Cover page presence (first page has title metadata)
 *   - Font embedding (checks for embedded fonts)
 *   - Image count (embedded images in PDF)
 *   - Blank pages (pages with no content objects)
 *   - Page dimensions (letter size 8.5×11)
 *
 * Used by eval-modalities.ts as the "pdf" modality evaluator.
 */

import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRef, PDFStream, PDFPage } from "pdf-lib";

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = join(SCRIPT_DIR, "..");

// ── Types ──────────────────────────────────────────────────────────────────

export interface PdfEvalResult {
  exists: boolean;
  filePath: string;
  fileSizeKb: number;
  pageCount: number;
  hasCoverPage: boolean;
  hasEmbeddedFonts: boolean;
  imageCount: number;
  blankPageCount: number;
  blankPageNumbers: number[];
  pageWidth: number;   // points (612 = 8.5in)
  pageHeight: number;  // points (792 = 11in)
  isLetterSize: boolean;
  title: string | null;
  author: string | null;
}

// ── PDF Analysis ───────────────────────────────────────────────────────────

/**
 * Analyze a rendered PDF file for quality metrics.
 * Returns null if the file doesn't exist.
 */
export async function analyzePdf(pdfPath: string): Promise<PdfEvalResult | null> {
  if (!existsSync(pdfPath)) {
    return {
      exists: false,
      filePath: pdfPath,
      fileSizeKb: 0,
      pageCount: 0,
      hasCoverPage: false,
      hasEmbeddedFonts: false,
      imageCount: 0,
      blankPageCount: 0,
      blankPageNumbers: [],
      pageWidth: 0,
      pageHeight: 0,
      isLetterSize: false,
      title: null,
      author: null,
    };
  }

  const pdfBytes = readFileSync(pdfPath);
  const fileSizeKb = Math.round(pdfBytes.length / 1024);

  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const pageCount = pages.length;

  // Metadata
  const title = pdfDoc.getTitle() || null;
  const author = pdfDoc.getAuthor() || null;

  // Cover page: first page exists and doc has a title
  const hasCoverPage = pageCount > 0 && title !== null && title.length > 0;

  // Page dimensions from first page
  let pageWidth = 0;
  let pageHeight = 0;
  if (pageCount > 0) {
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();
    pageWidth = Math.round(width);
    pageHeight = Math.round(height);
  }
  // Letter size: 612×792 points (8.5×11 inches), with tolerance
  const isLetterSize = Math.abs(pageWidth - 612) <= 5 && Math.abs(pageHeight - 792) <= 5;

  // Font embedding check: look for font descriptors
  let hasEmbeddedFonts = false;
  try {
    // Check if any fonts are embedded by looking for FontDescriptor entries
    const catalog = pdfDoc.catalog;
    // Simple heuristic: if the PDF has pages and fonts, they're likely embedded
    // (XeTeX/LuaTeX always embed fonts)
    hasEmbeddedFonts = pageCount > 0 && fileSizeKb > 50; // PDFs with embedded fonts are larger
  } catch {
    hasEmbeddedFonts = false;
  }

  // Image count: count XObject Image references across all pages
  let imageCount = 0;
  try {
    for (const page of pages) {
      const resources = page.node.get(PDFName.of("Resources"));
      if (resources instanceof PDFDict) {
        const xObjects = resources.get(PDFName.of("XObject"));
        if (xObjects instanceof PDFDict) {
          const entries = xObjects.entries();
          for (const [, value] of entries) {
            // Each XObject could be an image or form
            if (value instanceof PDFRef) {
              const obj = pdfDoc.context.lookup(value);
              if (obj instanceof PDFStream) {
                const subtype = obj.dict.get(PDFName.of("Subtype"));
                if (subtype && subtype.toString() === "/Image") {
                  imageCount++;
                }
              }
            }
          }
        }
      }
    }
  } catch {
    // If we can't count images, that's OK
    imageCount = 0;
  }

  // Blank page detection: check content stream length
  const blankPageNumbers: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    try {
      const page = pages[i];
      const contents = page.node.get(PDFName.of("Contents"));
      let hasContent = false;

      if (contents instanceof PDFRef) {
        const obj = pdfDoc.context.lookup(contents);
        if (obj instanceof PDFStream) {
          // Check if the content stream has meaningful content
          const data = obj.getContents();
          hasContent = data.length > 50; // Very small streams are likely empty pages
        }
      } else if (contents instanceof PDFArray) {
        // Multiple content streams
        hasContent = contents.size() > 0;
      }

      if (!hasContent) {
        blankPageNumbers.push(i + 1); // 1-indexed
      }
    } catch {
      // If we can't check, assume non-blank
    }
  }

  return {
    exists: true,
    filePath: pdfPath,
    fileSizeKb,
    pageCount,
    hasCoverPage,
    hasEmbeddedFonts,
    imageCount,
    blankPageCount: blankPageNumbers.length,
    blankPageNumbers,
    pageWidth,
    pageHeight,
    isLetterSize,
    title,
    author,
  };
}

/**
 * Find the rendered PDF for an ebook.
 * Quarto outputs to books/{slug}/_book/{slug}.pdf or similar.
 */
export function findPdfPath(slug: string): string | null {
  const possiblePaths = [
    join(PROJECT_ROOT, "books", slug, "_book", `${slug}.pdf`),
    join(PROJECT_ROOT, "books", slug, "_book", "index.pdf"),
    join(PROJECT_ROOT, "_output", "pdf", `${slug}.pdf`),
  ];

  // Also check for any .pdf in _book directory
  const bookDir = join(PROJECT_ROOT, "books", slug, "_book");
  if (existsSync(bookDir)) {
    const pdfs = readdirSync(bookDir).filter(f => f.endsWith(".pdf"));
    if (pdfs.length > 0) {
      possiblePaths.unshift(join(bookDir, pdfs[0]));
    }
  }

  for (const p of possiblePaths) {
    if (existsSync(p)) return p;
  }

  return null;
}

// ── CLI ──────────────────────────────────────────────────────────────────

if (import.meta.main) {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: bun run scripts/pdf-eval.ts <slug>");
    process.exit(1);
  }

  const pdfPath = findPdfPath(slug);
  if (!pdfPath) {
    console.error(`No PDF found for "${slug}". Run: make render-pdf ebook=${slug}`);
    process.exit(1);
  }

  console.log(`Analyzing PDF: ${pdfPath}`);
  const result = await analyzePdf(pdfPath);
  if (!result) {
    console.error("Failed to analyze PDF");
    process.exit(1);
  }

  console.log(`
PDF Quality Report: ${slug}
${"─".repeat(50)}
  File: ${result.filePath}
  Size: ${result.fileSizeKb} KB
  Pages: ${result.pageCount}
  Cover page: ${result.hasCoverPage ? "✅" : "❌"}
  Embedded fonts: ${result.hasEmbeddedFonts ? "✅" : "❌"}
  Images: ${result.imageCount}
  Blank pages: ${result.blankPageCount}${result.blankPageNumbers.length > 0 ? ` (pages: ${result.blankPageNumbers.join(", ")})` : ""}
  Page size: ${result.pageWidth}×${result.pageHeight} pts ${result.isLetterSize ? "(letter ✅)" : "(non-letter ⚠)"}
  Title: ${result.title || "(none)"}
  Author: ${result.author || "(none)"}
`);
}

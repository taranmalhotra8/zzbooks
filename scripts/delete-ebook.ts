#!/usr/bin/env bun
/**
 * delete-ebook.ts — Remove an ebook and all its generated assets
 *
 * Deletes:
 *   - books/{slug}/           (source files)
 *   - _output/books/{slug}/   (rendered HTML/PDF)
 *   - _output/blog/{slug}/    (blog posts)
 *   - _output/social/{slug}/  (social assets)
 *   - _output/landing/{slug}/ (landing page)
 *
 * Usage:
 *   bun run scripts/delete-ebook.ts <slug>
 *   ebook delete <slug>
 */

import { existsSync, rmSync } from "fs";
import { join, dirname } from "path";

const ROOT = join(dirname(new URL(import.meta.url).pathname), "..");

const BLUE = "\x1b[34m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const slug = process.argv[2];

if (!slug) {
  console.error(`${RED}Error: slug is required${RESET}`);
  console.error(`\n${BOLD}Usage:${RESET}`);
  console.error(`  ebook delete <slug>`);
  console.error(`  bun run scripts/delete-ebook.ts <slug>`);
  process.exit(1);
}

console.log(`\n${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}`);
console.log(`${BLUE}║${RESET}${BOLD}  Deleting Ebook: ${slug}${RESET}`);
console.log(`${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);

const dirsToDelete = [
  { path: join(ROOT, "books", slug), label: "Source files" },
  { path: join(ROOT, "_output", "books", slug), label: "Rendered HTML/PDF" },
  { path: join(ROOT, "_output", "blog", slug), label: "Blog posts" },
  { path: join(ROOT, "_output", "social", slug), label: "Social assets" },
  { path: join(ROOT, "_output", "landing", slug), label: "Landing page" },
  { path: join(ROOT, "_output", "dashboard", "detail", slug), label: "Dashboard detail page" },
];

let deletedCount = 0;

for (const { path, label } of dirsToDelete) {
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`  ${GREEN}✓${RESET} Deleted: ${label} ${DIM}(${path.replace(ROOT + "/", "")})${RESET}`);
    deletedCount++;
  } else {
    console.log(`  ${DIM}─ Skipped: ${label} (not found)${RESET}`);
  }
}

if (deletedCount > 0) {
  console.log(`\n${GREEN}✅ Ebook "${slug}" deleted successfully.${RESET}`);
  console.log(`${YELLOW}⚠  Run ${BOLD}ebook dashboard${RESET}${YELLOW} to refresh the dashboard.${RESET}\n`);
} else {
  console.log(`\n${YELLOW}⚠ No files found for "${slug}". Is the slug correct?${RESET}\n`);
}

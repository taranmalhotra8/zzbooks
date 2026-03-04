# Ebook Theme & Content Issues

Post-theme-modernization issues identified from visual review.

---

## Issue 1: Typography Needs Better Readability

**Problem:** Body text is functional but not optimized for long-form reading. Medium.com sets the standard: 21px font, ~680px content width, generous paragraph spacing, serif or well-tuned sans-serif with optical sizing.

**Current state:**
- Body font-size: `1rem` (16px) — too small for sustained reading
- Content width: unconstrained (Quarto default ~850-900px with sidebar) — too wide for comfortable line scanning
- Line-height: `1.75` — good
- Paragraph spacing: `1.25rem` — could be more generous
- No `font-optical-sizing` or `font-variation-settings` tuning
- No explicit prose column `max-width`

**Fix:**
- Increase body font to `1.0625rem` (17px) or `1.125rem` (18px)
- Constrain prose column to `680-720px` max-width (Medium uses ~680px)
- Increase paragraph spacing to `1.5rem`
- Add `font-optical-sizing: auto` for Inter variable font
- Consider slightly darker secondary text color for better contrast
- Tune heading sizes proportionally (current h2 at 1.75rem may be too close to body at 18px)

**Files:** `_themes/zopdev-book.scss`, `_brand/_brand.yml`

---

## Issue 2: Chapters Are Too Long — Need Shorter, Scannable Lessons

**Problem:** Individual chapters are ~2,700+ words (~11 min read). Modern reading patterns favor shorter, focused lessons (5-7 min, ~1,200-1,500 words). Readers scan, don't read linearly. The outline/plan strategy produces monolithic chapters instead of bite-sized lessons.

**Current state:**
- Chapter 01 (k8s-cost-guide): 2,707 words, 9 h2 sections, flat hierarchy (no h3 subsections)
- No visual "progress" within a chapter
- No "key takeaway" summaries per section
- No estimated reading time shown in the chapter

**Fix (pipeline/outline strategy):**
- Update `scripts/generate-outline.ts` and `scripts/plan-chapters.ts` to target 1,200-1,500 words per chapter
- Split current monolithic chapters into 2-3 focused lessons (e.g., "The $50K Incident" becomes separate from "Six Strategies to Right-Size")
- Add "Key Takeaway" callout box at the end of each chapter
- Add reading time estimate to chapter headers
- Use h3 subsections within h2 sections to create visual hierarchy and enable scanning
- Add a "What You'll Learn" box at the top of each chapter

**Files:** `scripts/generate-outline.ts`, `scripts/plan-chapters.ts`, `scripts/prompt-templates.ts`, `scripts/transform-chapter.ts`

---

## Issue 3: D2 Diagrams Are Too Small (Horizontal Layout)

**Problem:** All D2 diagrams use `direction: right` (horizontal flow), which produces wide, short diagrams. When constrained to the prose column width (~680-720px), they become too small to read.

**Current state:**
- All 3 k8s-cost-guide diagrams: `direction: right`
- All 5 D2 templates: `direction: right`
- Diagrams embedded with `width="100%"` which squishes horizontal diagrams
- The before/after optimization diagram has 3 major columns (BEFORE → TRANSFORMATION → AFTER), each with nested children — extremely wide
- CSS constrains to max-width of content area with `overflow-x: auto` on mobile
- No `column-page` or `column-screen` Quarto classes used to break out of prose column

**Fix:**
- Change D2 templates to `direction: down` (vertical) for better fit in prose columns
- For inherently horizontal diagrams (before/after comparisons), use Quarto's `::: {.column-page}` wrapper to break out of the prose column
- Add CSS for full-width diagram containers that extend beyond the prose max-width
- Set a minimum height on diagram containers to prevent vertical squishing
- Update `_diagrams/templates/*.d2` to use vertical layouts by default
- Update `scripts/diagram-utils.ts` to prefer vertical layout for new diagrams
- Add explicit `width` and `height` hints in diagram code fences

**Files:** `_diagrams/templates/*.d2`, `books/*/diagrams/*.d2`, `_themes/zopdev-book.scss`, `scripts/diagram-utils.ts`

---

## Issue 4: No Cover Page

**Problem:** Ebooks have no cover page — they start with a plain title and stub preface. Professional ebooks need a branded cover image for PDF/EPUB and a styled title page for HTML.

**Current state:**
- `index.qmd` files contain basic `# Title {.unnumbered}` + stub preface
- No `cover-image:` field in `_quarto.yml`
- No cover art generation pipeline
- `preamble.tex` has no titlepage formatting
- No HTML title page design beyond the Quarto default `.quarto-title-block`
- 2 of 3 ebooks have TODO placeholder prefaces

**Fix:**
- Create a cover image template/generator (integrate `scripts/providers/image.ts`)
- Add `cover-image:` to `_quarto.yml` configs (Quarto supports this natively for EPUB)
- Create a LaTeX titlepage in `preamble.tex` (logo, title, subtitle, author, date with brand styling)
- Design the HTML title block to be a proper "cover" (full-height hero with brand gradient, logo, title hierarchy)
- Write actual prefaces for k8s-cost-guide and terraform-cloud-costs
- Add a `make cover` target to generate cover images

**Files:** `_themes/preamble.tex`, `_themes/zopdev-book.scss`, `books/*/index.qmd`, `books/*/_quarto.yml`, `scripts/providers/image.ts` (new integration), `Makefile`

---

## Issue 5: No Illustrations in Chapters

**Problem:** Chapters are text-only walls with occasional code blocks and tables. No conceptual illustrations, diagrams-as-images, or visual breaks. Professional ebooks use illustrations every 500-800 words.

**Current state:**
- `books/*/images/` directories exist but are empty
- Image generation framework exists (`scripts/providers/image.ts`, `image-banana.ts`, `image-mock.ts`) but is disconnected from the pipeline
- No image generation Make target
- No prompt templates for section illustrations
- No pipeline stage that generates or places images

**Fix:**
- Create a pipeline stage for illustration generation (after chapter prose generation)
- Add image placement markers in prompt templates (e.g., "place illustration after section X")
- Connect `image-banana.ts` provider to the pipeline
- Add `make images ebook={id}` target
- Generate 2-3 illustrations per chapter (conceptual diagrams, architecture views, comparison visuals)
- Use `![caption](images/filename.png)` embedding in generated chapters

**Files:** `scripts/transform-chapter.ts` (add image placement), `scripts/prompt-templates.ts` (add illustration prompts), `Makefile` (add target), new script: `scripts/generate-images.ts`

---

## Issue 6: No OJS Calculators in Most Chapters

**Problem:** OJS interactive calculators exist in templates and 3 chapters but are absent from most content. They're a key differentiator for HTML ebooks.

**Current state:**
- 3 OJS templates exist (`_templates/ojs/`)
- Only 3 of 12+ chapters across all ebooks use OJS
- k8s-cost-guide has zero OJS calculators
- No pipeline integration to automatically place calculators
- Content audit tool counts interactive elements but doesn't enforce minimums

**Fix:**
- Add OJS calculator placement to `scripts/transform-chapter.ts` for relevant topics (cost comparisons, sizing calculations, ROI estimates)
- Each ebook should have at least 2-3 OJS calculators
- Add calculator suggestions to chapter plan generation (`scripts/plan-chapters.ts`)
- Ensure every OJS block has a PDF/EPUB fallback
- Update the content audit thresholds to flag ebooks with zero calculators

**Files:** `scripts/plan-chapters.ts`, `scripts/transform-chapter.ts`, `scripts/prompt-templates.ts`, quality-thresholds.yml

---

## Priority Order

| # | Issue | Impact | Effort | Status |
|---|-------|--------|--------|--------|
| 1 | Typography readability | High (every reader) | Low (CSS only) | DONE |
| 3 | D2 diagram sizing | High (diagrams unreadable) | Medium (template + CSS) | DONE |
| 4 | Cover page | High (first impression) | Medium | DONE |
| 2 | Chapter length strategy | High (reader retention) | High (pipeline changes) | DONE |
| 5 | Illustrations | Medium (visual richness) | High (new pipeline stage) | Pending |
| 6 | OJS calculators | Medium (differentiator) | High (pipeline changes) | Pending |

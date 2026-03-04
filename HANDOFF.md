# Handoff Status

Last updated: 2026-02-17

## Engine Status

The engine (scripts, themes, generators, Makefile) is production-ready. All core systems are implemented and tested:

- **Brand system**: 3-layer hierarchical config with deep merge (`scripts/brand-utils.ts`)
- **Validation**: Comprehensive YAML, D2, OJS, and cross-reference validation (`scripts/validate.ts`)
- **Content audit**: 6-metric quality framework (`scripts/content-audit.ts`)
- **Rendering**: Multi-format output via Quarto (HTML, PDF, EPUB)
- **Landing pages**: Template-based generation with brand theming
- **Social assets**: LinkedIn carousel, Instagram posts, OG images
- **D2 diagrams**: 5 reusable templates, CLI validation, brand-styled
- **Observable JS**: 3 calculator templates, HTML interactive + PDF/EPUB fallbacks

## Ebook Status

### finops-playbook (in-progress, publish: 2026-04-15)

| Chapter | Status | Code | Diagrams | OJS |
|---------|--------|------|----------|-----|
| 01 - Introduction | Text complete | None | None | None |
| 02 - Cloud Cost Fundamentals | Text complete | None | None | None |
| 03 - FinOps Framework | Text complete | None | None | None |
| 04 - Cost Allocation | Text complete | None | None | None |
| **05 - Optimization Strategies** | **SOTA transformed** | **Python script** | **D2 before/after** | **ROI calculator** |
| 06 - Tooling & Automation | Text complete | None | None | None |
| 07 - Culture & Adoption | Text complete | None | None | None |
| 08 - Case Studies | Text complete | None | None | None |

Chapter 05 is the reference implementation for the SOTA content pattern. Chapters 01-04, 06-08 have solid text content but need SOTA transformation (D2 diagrams, production code examples, interactive calculators).

**Priority chapters for SOTA transformation:** 04 (Cost Allocation) and 06 (Tooling & Automation) — most technical, highest impact.

### k8s-cost-guide (draft)

3 chapters with substantive content. Created to verify multi-ebook pipeline. Needs expansion for full ebook.

## Known Issues

- **Form webhook**: Landing page form uses `form_action: "#"` — needs real webhook URL when ready
- **Content quality**: Audit shows avg 5.9 generic claims/chapter (target: ≤5) and low diagram density (0.1 vs target 0.3)
- **OJS calculators**: 3 templates exist in `_templates/ojs/` but only 1 is used in production content (Ch. 05)
- **D2 diagrams**: 5 templates exist in `_diagrams/templates/` but only 1 is deployed (Ch. 05)

## Quick Start

```bash
make install          # Install dependencies
make validate         # Validate all configs
make test             # Run unit tests
make render ebook=finops-playbook  # Render HTML/PDF/EPUB
make landing ebook=finops-playbook # Generate landing page
make audit ebook=finops-playbook   # Run content quality audit
```

## Templates for New Content

- SOTA chapter template: `_templates/sota-chapter-template.qmd`
- D2 diagram templates: `_diagrams/templates/`
- OJS calculator templates: `_templates/ojs/`
- Guides: `docs/D2_DIAGRAM_GUIDE.md`, `docs/OBSERVABLE_JS_PATTERNS.md`, `docs/CONTENT_QUALITY.md`

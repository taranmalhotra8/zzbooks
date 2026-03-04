# Claude Code Agent Instructions

This document contains patterns, practices, and architectural decisions for AI agents working on the Zopdev Ebook Engine.

## Critical Rules

### Engine-First, Not Content-First

**When working on generation engines (pipeline stages, providers, content transforms), ALWAYS focus on engine quality and validation — NOT on improving past generations.**

- Do NOT re-run pipelines repeatedly to polish a single ebook's content
- Do NOT manually fix generated output; fix the engine that produced it
- When a generation defect is found, fix the code, then validate with an A/B comparison (old output vs new output) to prove the engine improved
- Build automated quality comparison tooling (before/after metrics) rather than eyeballing individual chapters
- Use existing ebooks as **test fixtures** for engine validation, not as content to be perfected
- The measure of success is: "does the engine produce better output for ANY topic?" — not "does this one chapter read well?"

**Anti-pattern:** Run pipeline → read output → tweak prompts → re-run → read again → repeat
**Correct pattern:** Run pipeline → measure quality metrics → fix engine code → run A/B comparison → validate improvement is systematic

## Project Architecture

### Core Philosophy
This is a **static site generator** for marketing ebooks with a focus on:
- Brand consistency with per-campaign flexibility
- Multi-format output (HTML, PDF, landing pages, social assets)
- TypeScript-based tooling with YAML configuration
- Validation-first approach

### Key Technologies
- **Runtime:** Bun (fast TypeScript execution)
- **Templating:** Mustache (simple, logic-less)
- **Styling:** CSS (no frameworks, custom design system)
- **Build:** Make (simple, portable)
- **Rendering:** Sharp (images), pdf-lib (PDFs), Satori (social assets)

## Architectural Patterns

### 1. Hierarchical Configuration

**Pattern:** Three-layer config hierarchy with deep merge
```
Base Layer (_brand/brand.yml)
    ↓
Extended Layer (_brand/_brand-extended.yml)
    ↓
Override Layer (books/{id}/brand-overrides.yml)
    ↓
Merged Config (runtime)
```

**Implementation:**
- Use `scripts/brand-utils.ts` → `loadMergedBrand()`
- Merge rules: scalars override, objects deep merge, arrays replace
- All generators should use this utility (landing, social, PDF)

**When to use:**
- Any time you need brand/company/product data
- Any generator that produces branded output
- Validation of brand-related configs

### 2. Generator Architecture

**Pattern:** Separate generator per output format

```
_landing/generate.ts  → Landing pages
_social/generate.ts   → Social media assets
_pdf/generate.ts      → PDF ebooks (planned)
```

**Structure:**
```typescript
// 1. Load configs (with brand merge)
const brand = loadMergedBrand(ebookId);
const ebook = loadYaml(`books/${ebookId}/calendar.yml`);

// 2. Prepare template data
const data = {
  ...brand,
  ...ebook,
  // Add computed fields
};

// 3. Render template
const html = mustache.render(template, data);

// 4. Write output
writeFile(outputPath, html);
```

**Best Practices:**
- Keep generators thin (logic in utilities)
- Use TypeScript types from shared modules
- Handle missing configs gracefully
- Provide helpful error messages with file paths

### 3. Shared Utilities

**Pattern:** Domain-specific utility modules

```
scripts/
├── brand-utils.ts      # Brand config loading & merging
├── validate.ts         # Config validation
├── new-ebook.sh        # Scaffolding
└── (future: pdf-utils.ts, social-utils.ts)
```

**When to create a utility:**
- Logic is needed by 2+ generators
- Complex transformation/validation
- Reusable types/interfaces
- Cross-cutting concerns (logging, file I/O)

**When NOT to create a utility:**
- Generator-specific logic
- One-off transformations
- Simple operations

### 4. Validation Strategy

**Pattern:** Validate early, validate often

```typescript
// 1. Schema validation (structure)
validateYamlSchema(config, schema);

// 2. Cross-reference validation (relationships)
validateIcpIds(overrides.target_icps, brand.default_icps);
validateProductIds(overrides.featured_products, brand.products);

// 3. Business rules validation
warnIfColorDriftExcessive(overrides.colors, brand.colors);
```

**Implementation:**
- All validation in `scripts/validate.ts`
- Use TypeScript types to catch compile-time errors
- Provide actionable error messages (file:line:field)
- Warn for suspicious configs (don't block)

### 5. Template & Config Separation

**Pattern:** Templates are code, configs are data

```
_templates/           # Code (committed)
├── brand-overrides.yml
└── chapter-template.md

books/{id}/          # Data (committed)
├── brand-overrides.yml
├── calendar.yml
└── chapters/
```

**Rules:**
- Templates = scaffolding for new ebooks
- Never copy from existing ebooks (use templates)
- Configs = ebook-specific data
- Scaffold scripts use templates (not examples)

### 6. D2 Diagram Integration

**Pattern:** Reusable diagram templates with brand consistency

```
_diagrams/templates/              # Reusable D2 templates
├── cloud-architecture.d2         # Infrastructure with cost annotations
├── finops-workflow.d2            # FinOps lifecycle visualization
├── before-after-optimization.d2  # Side-by-side comparisons
├── multi-cloud-comparison.d2     # Provider comparisons
└── data-pipeline.d2              # ETL/analytics workflows

books/{id}/diagrams/              # Ebook-specific diagrams
├── prod-architecture.d2
└── optimization-results.d2
```

**Implementation:**
- Use `scripts/diagram-utils.ts` for D2 operations
- All templates use Zopdev brand colors (#0891b2, #16a34a, #fbbf24, #ef4444)
- Validation with `make diagrams ebook={id}` or `d2 validate`
- Embed in chapters with ```{d2} code fence

**When to use:**
- Cloud/infrastructure architecture diagrams
- Before/after optimization visualizations
- Workflow/process diagrams with cost awareness
- Multi-step procedures with visual flow

**Best Practices:**
- Copy template to book's diagrams/ directory
- Customize for specific scenario (update costs, resources)
- Add descriptive fig-cap
- Test rendering in HTML, PDF, EPUB

### 7. Observable JS Calculators

**Pattern:** Interactive calculators for scenario modeling

```
_templates/ojs/                   # Reusable calculator templates
├── cost-comparison-calculator.qmd
├── roi-calculator.qmd
└── resource-optimizer.qmd
```

**Implementation:**
- Use `scripts/ojs-utils.ts` for OJS operations
- Style with Zopdev CSS classes (.ojs-calculator, .ojs-metric)
- Always include static fallback for PDF/EPUB
- Validation with `make validate` checks OJS syntax

**When to use:**
- ROI estimation (implementation cost vs. savings)
- Cost comparison (on-demand vs. reserved, multi-cloud)
- Resource optimization (instance sizing, tier selection)
- Scenario modeling (scaling, growth projections)

**Best Practices:**
- Use Observable Inputs (range, select, checkbox) for controls
- Keep 3-6 inputs maximum (avoid overwhelming users)
- Format numbers with d3.format("$,.0f")
- Provide context (callout explaining how to use)
- Add static fallback table with default scenario

**Static Fallback Pattern:**
```markdown
```{ojs}
// Interactive calculator (HTML only)
viewof hours = Inputs.range([0, 10000], { value: 2000 })
cost = hours * 0.085
```

::: {.content-visible when-format="pdf"}
**Calculator (Default Scenario)**
Based on 2,000 compute hours at $0.085/hour: **$170.00/month**
:::
```

### 8. Content Quality Validation

**Pattern:** Automated quality checks with measurable thresholds

```
quality-thresholds.yml            # Configurable quality standards
scripts/
├── content-audit.ts              # 6 quality metrics measurement
├── code-validation.ts            # Multi-language syntax checking
└── compare-outputs.ts            # Before/after comparison
```

**Metrics:**
1. **Diagram Density** — Diagrams per 1000 words (target: ≥0.3)
2. **Code Density** — Code blocks per chapter (target: ≥2)
3. **Generic Claims** — Vague language detection (target: ≤5 per chapter)
4. **Interactive Elements** — OJS calculators (target: ≥1 per ebook)
5. **Real Numbers** — $ amounts, specific percentages (target: ≥1 per chapter)
6. **Reading Level** — Flesch-Kincaid grade (target: 8-14)

**Implementation:**
- Run `make audit ebook={id}` to generate quality report
- Warnings don't block builds (advisory only)
- Use `make compare` to quantify before/after improvements
- Customize thresholds per ebook in `quality-thresholds.yml`

**When to use:**
- Before submitting PR (check quality score)
- After major content transformations (validate improvement)
- Continuous monitoring (track quality over time)

**Best Practices:**
- Aim for Overall Score B or better (≤3 violations)
- Fix high-impact violations first (diagram density, code density)
- Replace generic claims with specific numbers
- Add real examples ($ amounts, fleet sizes, time measurements)

**Example Audit Output:**
```
Overall Score: C (7 violations)

DIAGRAMS: 0.11 per 1000 words (target: 0.3) [WARN]
CODE BLOCKS: 12 total, 0 untagged
GENERIC CLAIMS: 47 total (avg 5.9 per chapter) [WARN]
INTERACTIVE ELEMENTS: 0 (target: ≥1) [WARN]
REAL NUMBERS: 23 total (avg 2.9 per chapter)
READING LEVEL: 11.2 grade (target: 8-14)
```

### 9. LLM Content Pipeline Architecture

**Pattern:** Four-stage pipeline with provider-agnostic LLM integration

```
Stage 0: Topic → Research Data (research.yml)      [search APIs + LLM structuring]
Stage 1: Topic + Research → Book Outline (outline.yml)  [LLM outline generation]
Stage 2: Outline + Research → Chapter Plans (*.plan.yml) [LLM section planning]
Stage 3: Chapter Plans → Full .qmd Chapters          [LLM prose + template assembly]
```

**Key Design Decisions:**

1. **Content seeds, not full research:** Stage 2 curates 4-6 claims + patterns into `content_seeds`. Stage 3 only sees these seeds, not the full research.yml. This keeps prompts focused and prevents the LLM from cherry-picking random data.

2. **Structured FACT SHEET:** The `buildFactSheet()` function formats seeds into a rigid data block with exact numbers and attribution rules. This prevents LLMs from paraphrasing "37% reduction" into "30-50% savings".

3. **Post-generation cleanup:** `cleanVagueClaims()` runs after LLM output, removing sentences with fabricated statistics + vague qualifiers. Only removes — never rewrites.

4. **Template fallback:** Every stage works without an LLM (mock mode). This enables A/B eval: template baseline vs LLM-powered output.

5. **Truncation continuation:** If `finishReason === "length"`, the engine issues one follow-up call to complete the section rather than silently truncating.

6. **CONFIG_TEMPLATES library:** 13 Kubernetes resource type templates (ResourceQuota, LimitRange, VPA, HPA, PDB, NetworkPolicy, Ingress, ServiceAccount, PriorityClass, StorageClass, PrometheusRule, CronJob) with keyword matching via `findConfigTemplateName()`.

**When modifying the pipeline:**
- Always run `make eval ebook=terraform-cloud-costs` after changes to validate systematic improvement
- Never tune prompts by reading individual chapter output — use the 11-metric eval
- New config types go in `CONFIG_TEMPLATES` + `keywordMap` in `transform-chapter.ts`
- New vague patterns go in `GENERIC_PATTERNS` in `engine-eval.ts`
- Provider bugs go in `scripts/providers/` — the base interface is in `llm.ts`

### 10. Engine Eval Best Practices

**Pattern:** Measure before you fix, fix the engine not the content

The A/B eval (`scripts/engine-eval.ts`) compares template-only output vs LLM-powered output across 11 metrics. Verdict: PASS (≥70% improved), MIXED (30-70%), FAIL (≤30%).

**11 Metrics:**
| Metric | Direction | What it measures |
|--------|-----------|-----------------|
| Word Count | higher-is-better | Total prose volume |
| Placeholders | lower-is-better | Unresolved instructions/TODOs |
| Truncations | lower-is-better | Mid-sentence breaks before headings |
| Duplicate Blocks | lower-is-better | Identical code/table blocks |
| Code Blocks (tagged) | higher-is-better | Fenced code with language tags |
| Tables | higher-is-better | Markdown tables |
| Real Numbers | higher-is-better | $ amounts, specific percentages |
| Generic Claims | lower-is-better | Context-aware vague language detection |
| Avg Reading Grade | lower-is-better | Flesch-Kincaid (target 8-14) |
| Word Targets Hit | higher-is-better | Chapters within plan's word range |
| Sections Complete | higher-is-better | All planned sections rendered |

**Workflow for engine changes:**
```bash
# 1. Baseline (existing snapshots)
make eval-report ebook=terraform-cloud-costs

# 2. Apply engine fix

# 3. Re-generate
make transform ebook=terraform-cloud-costs

# 4. Full eval (snapshots LLM output, generates template, compares)
make eval ebook=terraform-cloud-costs

# 5. Compare: did the metric you targeted improve?
#    Did any other metrics regress?
```

### 11. Self-Healing Eval Loop

**Pattern:** Autonomous quality assurance across all output modalities

```
┌─────────────────────────────────────────────────────┐
│                  eval-loop.ts                        │
│                (Orchestrator)                         │
│                                                       │
│  ┌──────────┐   ┌──────────┐   ┌────────────────┐   │
│  │ Evaluate  │──▶│ Identify │──▶│ Dispatch Fixes │   │
│  │ All Mods  │   │ Failures │   │ (heal strats)  │   │
│  └──────────┘   └──────────┘   └────────────────┘   │
│       ▲                               │              │
│       └───────── re-evaluate ─────────┘              │
│                                                       │
│  Exit: all pass │ no healable │ no improvement │ max │
└─────────────────────────────────────────────────────┘
```

**Modalities evaluated:**
- **Ebook chapters** — wraps existing `auditEbook()` (6 metrics: diagrams, code, generic claims, numbers, reading level, interactive)
- **Landing pages** — checks HTML for title, meta description, OG tags, CTA, file size
- **Social assets** — checks OG image, LinkedIn slides, Instagram posts existence
- **Blog posts** — checks post count, SEO title, meta description, CTA, word count

**Heal strategies:**
| Strategy | Modality | Action |
|----------|----------|--------|
| `strengthen_fact_sheet` | ebook | Re-transform chapter with anti-vagueness prompt |
| `add_diagram_directive` | ebook | Re-transform with diagram inclusion directive |
| `add_code_block` | ebook | Re-transform with code block requirement |
| `enrich_numbers` | ebook | Re-transform with specific numbers requirement |
| `simplify_prose` | ebook | Re-transform with readability constraints |
| `regenerate_landing` | landing | Re-run `_landing/generate.ts` |
| `regenerate_social` | social | Re-run `_social/generate.ts` |
| `regenerate_blog` | blog | Re-run `_blog/generate.ts` |

**Loop exit conditions:**
1. All modalities pass
2. No healable violations remain
3. No improvement between iterations (convergence detection)
4. Max iterations reached (default: 3)
5. Cost limit exceeded (default: $5)

**Usage:**
```bash
make eval-all ebook=k8s-cost-guide    # Dry-run eval across all modalities
make heal ebook=k8s-cost-guide        # Full self-healing loop
make heal ebook=k8s-cost-guide max-iter=5  # Custom max iterations
make blog ebook=k8s-cost-guide        # Generate blog posts only
```

**Key files:**
- `scripts/eval-modalities.ts` — per-modality evaluators + unified types
- `scripts/heal-strategies.ts` — fix strategy dispatch table
- `scripts/eval-loop.ts` — orchestrator (the agentic loop)
- `_blog/generate.ts` — blog post generator (new modality)
- `_blog/template.html` + `_blog/styles.css` — blog presentation

### 12. Blog Post Generation

**Pattern:** Extract standalone blog posts from ebook chapters

Each chapter in `books/{slug}/chapters/` becomes one HTML blog post with:
- SEO title (≤60 chars), meta description (≤155 chars)
- Reading time estimate (250 wpm)
- Lightweight Markdown-to-HTML conversion (code blocks, callouts, tables, lists)
- D2 and OJS blocks → placeholder divs with "see full ebook" message
- CTA banner linking to the full ebook download
- Brand-consistent styling via CSS custom properties

**Output:** `_output/blog/{slug}/{chapter-slug}.html` + `styles.css`

## Epic #5 Insights: SOTA Content Engineering

### The Engine-First Philosophy

**Core Principle:** Build reusable tools before scaling content production.

**Anti-Pattern:**
```
❌ Transform all 8 chapters → tools emerge organically → 6-8 weeks
```

**Recommended Pattern:**
```
✅ Build tools (2 weeks) → Document (1 week) → Validate with 1-2 chapters (1 week) → 4 weeks total
   Result: Tools work for ANY ebook, not just one
```

**Why This Matters:**
- ROI comes from reusability, not perfection
- Tools + documentation enable self-service adoption
- Validation with small test case proves the pattern works
- Future ebooks benefit immediately from the infrastructure

**Application:** When starting Epic #6, resist the urge to "just transform all chapters." Build the next tool (diagram generator CLI, automated setup scripts) and validate with a test case.

---

### Team Parallelization Strategy

**When to Use Teams:**
- Infrastructure work with independent components (D2 engine, OJS engine, validation engine)
- Multiple generators can be built simultaneously (landing, social, PDF)
- Large content projects where chapters can be transformed in parallel

**How to Structure:**
1. **Team Lead** (you): Coordination, integration, documentation
2. **Specialist Teammates**: Focused on single component
   - d2-engineer: D2 templates + utilities + integration
   - ojs-engineer: OJS templates + utilities + styling
   - validation-engineer: Content audit + comparison tools

**Critical Success Factors:**
- Clear scope per teammate (no shared state)
- Defined deliverables (code, tests, docs)
- Integration checkpoints (validate work composes correctly)
- Shutdown protocol (graceful termination when done)

**ROI:** 40% time reduction for Epic #5 (12 days sequential → 5 days parallel).

---

### Content Quality as Code

**Insight:** Treat content quality like code quality - measure it, automate checks, enforce standards.

**The 6 Metrics Framework:**
```typescript
interface ContentQuality {
  diagramDensity: number;      // Diagrams per 1000 words (target: ≥0.3)
  codeDensity: number;          // Code blocks per chapter (target: ≥2)
  genericClaims: number;        // Vague language count (target: ≤5 per chapter)
  interactiveElements: number;  // OJS calculators (target: ≥1 per ebook)
  realNumbers: number;          // Specific $ amounts, percentages (target: ≥10 per chapter)
  readingLevel: number;         // Flesch-Kincaid grade (target: 8-14)
}
```

**Why Each Metric Matters:**
1. **Diagram Density:** Professional docs have visual explanations, not just text walls
2. **Code Density:** Technical ebooks need production-ready, copy-pasteable code
3. **Generic Claims:** "30-50%" and "should consider" are weak - be specific
4. **Interactive Elements:** Calculators make abstract concepts concrete
5. **Real Numbers:** "$22,300/month" is stronger than "significant savings"
6. **Reading Level:** Balance accessibility (grade 8-10) with technical depth (grade 12-14)

**Validation Strategy:**
- Warn, don't block (quality is aspirational)
- Advisory feedback guides authors
- Before/after comparison proves improvement

---

### D2 Diagram Best Practices

**Color Palette (Zopdev Brand):**
```d2
style.fill: "#ecfeff"        # Primary tint (backgrounds)
style.stroke: "#0891b2"       # Primary (borders, arrows)
style.fill: "#f0fdf4"         # Success tint (positive states)
style.stroke: "#16a34a"       # Success (checkmarks, savings)
style.fill: "#fffbeb"         # Warning tint (caution states)
style.stroke: "#fbbf24"       # Warning (alerts, pending)
style.fill: "#fef2f2"         # Danger tint (error states)
style.stroke: "#ef4444"       # Danger (errors, waste)
```

**Layout Engines:**
- `elk`: Best for hierarchical diagrams (cloud architecture, org charts)
- `dagre`: Good for workflows (FinOps phases, CI/CD pipelines)
- `tala`: Experimental, use for graph layouts

**Common Gotchas:**
```d2
# ❌ Dollar signs break syntax (interpreted as variable substitution)
cost: $22,300/month

# ✅ Replace with plain text
cost: 22300 dollars per month

# ❌ Markdown bold doesn't work
title: **Savings: $18K**

# ✅ Use D2 style.bold instead
savings: Savings 18K dollars {
  style.bold: true
}
```

**When to Use D2 vs Mermaid:**
- **D2:** Brand-critical diagrams, cost annotations, complex layouts, customer-facing content
- **Mermaid:** Quick flowcharts, sequence diagrams, internal docs

---

### Observable JS Patterns

**The Reactive Model:**
```javascript
// Inputs create reactive variables
viewof instanceCount = Inputs.range([10, 1000], {value: 143})

// Calculations update automatically
monthlySavings = instanceCount * savingsPerInstance

// Output updates reactively
html`<h3>Total: ${fmt(monthlySavings)}</h3>`
```

**Environment Requirements:**
- Quarto (installed)
- Jupyter kernel (requires setup: `pip install jupyter pyyaml`)
- Python 3.x with PyYAML

**PDF/EPUB Fallback Pattern:**
```qmd
```{ojs}
//| echo: false
viewof x = Inputs.range([0, 100], {value: 50})
md`Result: ${x}`
```

::: {.content-visible when-format="pdf"}
**Static Result (default: 50)**

Interactive calculator available in HTML version.
:::
```

**Best Practices:**
- Always provide PDF/EPUB fallback (static table with default values)
- Use brand colors for metric cards: `style.fill: "#0891b2"`
- Format numbers: `d3.format("$,.0f")(value)` for currency
- Add labels to all inputs (don't rely on tooltips)

---

### SOTA Content Transformation Pattern

**The 5-Section Structure (proven with Chapter 5):**

1. **Incident-Driven Opening (3-5 paragraphs)**
   ```markdown
   ## The $22K Wake-Up Call

   When Sarah, the FinOps lead at Acme Corp, ran her first right-sizing
   audit in January 2024, she was shocked: **143 EC2 instances were running
   at an average of 18% CPU utilization**...
   ```
   - Real protagonist (even if anonymized)
   - Specific problem ($, fleet size, timeframe)
   - Emotional stakes (fear, frustration, surprise)

2. **D2 Diagram (before/after or architecture)**
   ```qmd
   ```{d2}
   //| label: fig-before-after
   //| fig-cap: "Right-sizing transformation: $18,400/month savings"
   //| file: diagrams/right-sizing-before-after.d2
   ```
   ```
   - Cost annotations (specific $ amounts)
   - Timeline or phases
   - Outcomes (savings, performance)

3. **Production-Ready Code (100-150 lines)**
   ```python
   #!/usr/bin/env python3
   """
   Right-sizing analyzer for EC2 instances.

   Requirements:
       pip install boto3 pandas

   Usage:
       python right_sizing_analyzer.py --region us-east-1
   """
   # Full implementation with imports, error handling, docstrings...
   ```
   - Copy-pasteable (real imports, no pseudocode)
   - Documented (docstrings, comments)
   - Runnable (includes example output)

4. **Interactive Calculator (OJS)**
   ```qmd
   ```{ojs}
   //| echo: false
   viewof instanceCount = Inputs.range([10, 1000], {value: 143})
   # ... calculation logic
   html`<div class="ojs-metric">
     <span class="ojs-metric-value">${fmt(savings)}</span>
     <span class="ojs-metric-label">Monthly Savings</span>
   </div>`
   ```
   ```
   - 3-5 input controls
   - Reactive calculations
   - Branded metric cards
   - PDF fallback table

5. **Quantified Results Section**
   ```markdown
   **Results:**
   - **$18,400/month in sustained savings** (83% of identified waste)
   - **Zero performance incidents** from downsizing
   - **14 minutes average time** to review each recommendation
   - **92% engineering team satisfaction** (post-rollout survey)
   ```
   - Specific numbers (not ranges)
   - Implementation timeline (weeks, not "a while")
   - Team metrics (satisfaction, adoption)

**Time to Transform:** 4-6 hours per chapter (with templates).

---

### Validation Granularity

**Three Levels of Validation:**

1. **Syntax Validation (BLOCK builds)**
   ```typescript
   // scripts/validate.ts
   validateD2Syntax(path);
   validatePythonSyntax(code);
   validateYamlStructure(config);
   // throws Error if invalid
   ```
   - Broken refs, syntax errors, malformed YAML
   - Always block builds (can't render broken content)

2. **Schema Validation (WARN)**
   ```typescript
   // scripts/validate.ts
   if (!validIcpIds.includes(id)) {
     warnings.push(`Unknown ICP ID: ${id}`);
     // continues build
   }
   ```
   - Cross-reference checks (ICP IDs, product IDs)
   - Warn but don't block (might be intentional)

3. **Quality Validation (ADVISORY)**
   ```typescript
   // scripts/content-audit.ts
   if (diagramDensity < 0.3) {
     advisory.push(`Low diagram density: ${diagramDensity}`);
     // informational only
   }
   ```
   - Content quality metrics
   - Reading level, generic claims
   - Never blocks (quality is aspirational)

**Why This Matters:** Distinguishing validation levels prevents false failures while maintaining quality standards.

---

### Documentation as Force Multiplier

**The 30-Minute Test:**
Can a new author add a feature in <30 minutes using only documentation (no handholding)?

**Epic #5 Proven Pattern:**
1. Comprehensive guide (D2_DIAGRAM_GUIDE.md, OBSERVABLE_JS_PATTERNS.md)
2. Worked examples (5+ examples per guide)
3. Troubleshooting section (common errors + fixes)
4. Template files (_templates/ojs/, _diagrams/templates/)
5. SOTA chapter template (fully commented)

**ROI:**
- Initial investment: 3-4 days to write comprehensive docs
- Ongoing benefit: Self-service adoption (no questions asked)
- Payback: After 3-4 uses by different authors

**Test:** Give a teammate the docs and observe:
- Can they complete the task?
- Do they ask clarifying questions? (If yes, docs need improvement)
- How long does it take? (Target: <30 minutes)

---

### Mistakes to Avoid

**1. Creating Backup Files in Content Directories**
```bash
# ❌ Don't do this
cp chapters/05-optimization.qmd chapters/05-optimization-BEFORE.qmd

# ✅ Use git instead
git checkout -b experiment/chapter-5-transformation
```
**Why:** Backup files get counted by audit tools, pollute git history, confuse readers.

**2. Assuming "Native Support" Means "Zero Setup"**
- Quarto has "native OJS support" but requires Jupyter + Python
- Always verify end-to-end rendering before claiming success
- Document environment setup explicitly

**3. Not Testing Special Characters Early**
- D2 interprets `$` as variable substitution
- SQL uses `;` as statement separator
- Shell uses `|` for pipes
- Test edge cases with minimal examples BEFORE writing production code

**4. Writing Generic Error Messages**
```typescript
// ❌ Not helpful
throw new Error('Invalid config');

// ✅ Actionable
throw new Error(
  `D2 syntax error in books/finops-playbook/diagrams/cost.d2:28\n` +
  `  Replace "$22,300" with "22300 dollars"\n` +
  `  D2 interprets $ as variable substitution`
);
```

---

## Development Workflow

### Adding New Config Fields

**Checklist:**
1. ✅ Add TypeScript type to relevant utility (e.g., `brand-utils.ts`)
2. ✅ Update YAML schema/example in `_brand/` or `_templates/`
3. ✅ Update validation in `scripts/validate.ts`
4. ✅ Update generators that need the field
5. ✅ Update template files if rendered
6. ✅ Test with existing ebooks (backward compatibility)
7. ✅ Update documentation in `CONTRIBUTING.md`

### Adding New Generators

**Checklist:**
1. ✅ Create directory: `_{format}/`
2. ✅ Main script: `_{format}/generate.ts`
3. ✅ Template: `_{format}/template.{ext}`
4. ✅ Styles (if applicable): `_{format}/styles.css`
5. ✅ Use `loadMergedBrand()` for brand data
6. ✅ Add Make target to `Makefile`
7. ✅ Add validation for format-specific configs
8. ✅ Test output in `_output/{format}/{id}/`
9. ✅ Update documentation

### Modifying Existing Features

**Pattern:** Minimize blast radius

1. **Read first:** Understand existing implementation
2. **Utilities:** Put complex logic in shared modules
3. **Backward compat:** Make new features opt-in
4. **Validate:** Update validation for new fields
5. **Test:** Verify existing ebooks still work
6. **Document:** Update relevant sections

**Example (Epic #1):**
- Added `brand-utils.ts` (new utility)
- Updated generators with 1-line change (minimal)
- Made overrides optional (backward compatible)
- Added validation for new configs
- Tested with `finops-playbook`
- Updated `CONTRIBUTING.md`

## Code Style

### TypeScript

```typescript
// Use explicit types (avoid 'any')
interface BrandConfig {
  company: CompanyInfo;
  products: Product[];
}

// Prefer named exports
export function loadMergedBrand(id: string): BrandConfig { }

// Use const for immutable data
const brand = loadYaml(path);

// Destructure for clarity
const { company, products } = brand;
```

### YAML

```yaml
# Use comments to explain non-obvious fields
products:
  - id: "zopnight"  # Referenced by brand-overrides.yml
    name: "ZopNight"

# Group related fields
company:
  name: "Zopdev"
  website: "https://zopdev.com"

# Use lists for repeated items
default_icps:
  - id: "devops-engineer"
  - id: "cto"
```

### File Organization

```
books/{id}/
├── calendar.yml           # Ebook metadata (title, chapters)
├── brand-overrides.yml    # Brand customization
├── chapters/              # Markdown content
│   ├── 01-introduction.md
│   └── 02-chapter.md
└── _output/              # Generated files (gitignored)
    ├── landing/
    ├── social/
    └── pdf/
```

## Common Patterns

### Loading Configs

```typescript
// Always use absolute paths
const basePath = process.cwd();
const configPath = `${basePath}/_brand/_brand-extended.yml`;

// Check existence before loading
if (!existsSync(configPath)) {
  throw new Error(`Config not found: ${configPath}`);
}

// Parse YAML with error handling
try {
  const config = yaml.parse(readFileSync(configPath, 'utf-8'));
} catch (error) {
  throw new Error(`Failed to parse ${configPath}: ${error.message}`);
}
```

### Deep Merging

```typescript
function deepMerge(base: any, override: any): any {
  // Scalar: override wins
  if (typeof override !== 'object' || override === null) {
    return override;
  }

  // Array: replace completely
  if (Array.isArray(override)) {
    return override;
  }

  // Object: merge recursively
  const result = { ...base };
  for (const key in override) {
    result[key] = deepMerge(base[key], override[key]);
  }
  return result;
}
```

### Cross-Reference Validation

```typescript
// Validate ICP IDs
const validIds = brand.default_icps.map(icp => icp.id);
for (const id of overrides.target_icps) {
  if (!validIds.includes(id)) {
    errors.push(`Unknown ICP ID "${id}" in books/${ebookId}/brand-overrides.yml`);
  }
}
```

## Testing Approach

### Manual Testing (Current)

```bash
# Validate configs
bun run validate

# Generate specific ebook
bun run generate:landing finops-playbook

# View output
open books/finops-playbook/_output/landing/index.html
```

### Future: Automated Testing

When implementing automated tests:
- Unit tests for utilities (brand-utils, validation)
- Integration tests for generators (snapshot testing)
- End-to-end tests for full pipeline
- Use Bun's built-in test runner

## Common Pitfalls

### ❌ Don't: Duplicate logic across generators

```typescript
// _landing/generate.ts
const brand = yaml.parse(readFileSync('_brand/brand.yml'));
const extended = yaml.parse(readFileSync('_brand/_brand-extended.yml'));
const merged = { ...brand, ...extended }; // Shallow merge!

// _social/generate.ts
const brand = yaml.parse(readFileSync('_brand/brand.yml'));
// ... duplicate logic
```

### ✅ Do: Use shared utilities

```typescript
// Both generators
import { loadMergedBrand } from '../scripts/brand-utils.js';
const brand = loadMergedBrand(ebookId);
```

---

### ❌ Don't: Assume configs exist

```typescript
const overrides = yaml.parse(readFileSync(overridesPath)); // Throws if missing
```

### ✅ Do: Check existence first

```typescript
const overrides = existsSync(overridesPath)
  ? yaml.parse(readFileSync(overridesPath, 'utf-8'))
  : {}; // Sensible default
```

---

### ❌ Don't: Use relative paths

```typescript
const config = readFileSync('../_brand/brand.yml'); // Breaks if CWD changes
```

### ✅ Do: Use absolute paths

```typescript
const basePath = process.cwd();
const config = readFileSync(`${basePath}/_brand/brand.yml`);
```

---

### ❌ Don't: Generic error messages

```typescript
throw new Error('Invalid config'); // Where? What's invalid?
```

### ✅ Do: Provide context

```typescript
throw new Error(
  `Invalid ICP ID "devops" in books/finops-playbook/brand-overrides.yml:3. ` +
  `Valid IDs: ${validIds.join(', ')}`
);
```

## Roadmap Context

### Completed
- ✅ **Epic #1:** Hierarchical Brand Configuration System
  - Branch: `feature/brand-system`
  - PR: #8
  - Key files: `_brand/_brand-extended.yml`, `scripts/brand-utils.ts`, `books/finops-playbook/brand-overrides.yml`

- ✅ **Epic #2:** Visual Foundation & Premium Theme System
  - Branch: `feature/visual-foundation`
  - Key files: `scripts/theme-tokens.ts`, `scripts/theme-utils.ts`, `_landing/styles.css`, all social templates
  - Design tokens: Type scale, spacing, shadows, radii, transitions, letter-spacing, line-height
  - Landing pages: Mesh gradients, glass-morphism, card hover lifts, 4 responsive breakpoints
  - Social assets: Gradient backgrounds, decorative elements, expanded color palette

- ✅ **Epic #3:** Enhanced Content System
  - Branch: `feature/enhanced-content`
  - Key files: `scripts/content-utils.ts`, `books/finops-playbook/ebook.yml`, `_brand/_brand-extended.yml`
  - Rich chapter metadata: difficulty, reading time, learning objectives, key takeaways, tags, prerequisites
  - Author system: brand-level author profiles, per-ebook author references
  - Landing page: enriched chapter cards with difficulty badges, reading time, objectives; author section
  - Validation: difficulty values, prerequisite cross-refs, author ID cross-refs

- ✅ **Epic #4:** Premium Quarto HTML + PDF Theme
  - Branch: `feature/premium-quarto-theme`
  - Key files: `_themes/zopdev-book.scss`, `_themes/preamble.tex`, `_themes/zopdev-epub.css`
  - HTML theme: Premium title block (gradient), styled headers (h1 border, h2 arrow prefix, h3 left border), callout boxes (color-coded: note/tip/warning/important), code blocks with left accent, tables with gradient header, TOC styling, responsive breakpoints
  - PDF theme: XeTeX with Inter font, navy chapter titles, color-coded tcolorbox callouts, blue-accented code blocks, booktabs tables with blue rules, styled blockquotes, professional headers/footers
  - EPUB theme: Consistent callout colors, left-border code blocks, uppercase table headers, styled headings
  - Quarto config: `code-copy`, `code-overflow: wrap`, `pdf-engine: xelatex`, `classoption: [oneside, 11pt]`

- ✅ **Epic #5:** Engine Enhancements for SOTA Content Quality
  - Branch: `feature/epic5-engine-enhancements`
  - Key files: `scripts/diagram-utils.ts`, `scripts/ojs-utils.ts`, `scripts/content-audit.ts`, `scripts/code-validation.ts`, `scripts/compare-outputs.ts`, `quality-thresholds.yml`
  - D2 diagram engine: 5 reusable templates, CLI integration, Quarto extension support, brand-styled diagrams
  - Observable JS engine: 3 calculator templates, interactive HTML with PDF/EPUB fallbacks, brand styling
  - Content quality validation: 6 automated metrics (diagram density, code density, generic claims, interactive elements, real numbers, reading level)
  - Documentation: Comprehensive guides (D2, OJS, content quality), SOTA chapter template, updated CONTRIBUTING.md/CLAUDE.md
  - Validation test case: finops-playbook chapters transformed, before/after comparison with measurable improvements

- ✅ **Epic #6:** LLM Engine Quality Fixes (MIXED 7/11 → PASS 10/11)
  - Branch: `main`
  - Key files: `scripts/transform-chapter.ts`, `scripts/prompt-templates.ts`, `scripts/engine-eval.ts`, `scripts/providers/llm.ts`
  - **Placeholders (2→0):** 8 new CONFIG_TEMPLATES (NetworkPolicy, Ingress, ServiceAccount, PriorityClass, StorageClass, PrometheusRule, CronJob), expanded keyword map, fixed generic fallback
  - **Truncations (3→1):** Token multiplier 4x→6x, truncation continuation on finishReason="length"
  - **Duplicates (2→0):** Broadened prose-has-content detection from YAML-only to any fenced code block
  - **Generic Claims (45→19):** Three-layer defense: structured FACT SHEET prompt, cleanVagueClaims() post-processing, context-aware eval with whitelists
  - **Bonus:** extractJSON() strips `<think>` blocks from reasoning models (MiniMax, DeepSeek)
  - Validation fixture: `books/terraform-cloud-costs/` (new ebook generated end-to-end)

- ✅ **Epic #7:** Theme Modernization + Self-Healing Eval Loop
  - Branch: `main`
  - **Theme fixes:** Typography readability (18px, 720px column, font smoothing), D2 diagram vertical layout, PDF cover page (TikZ), chapter length strategy (1,200-1,500 words), responsive diagrams
  - **Self-healing eval loop:** `scripts/eval-modalities.ts` (4 modality evaluators), `scripts/heal-strategies.ts` (8 fix strategies), `scripts/eval-loop.ts` (agentic orchestrator with convergence detection + cost guard)
  - **Blog modality (new):** `_blog/generate.ts` + template + styles — extracts ebook chapters to standalone SEO-optimized HTML blog posts
  - **Config:** `quality-thresholds.yml` extended with `modalities:` section; Makefile gains `blog`, `eval-all`, `heal` targets
  - Key files: `scripts/eval-loop.ts`, `scripts/eval-modalities.ts`, `scripts/heal-strategies.ts`, `_blog/generate.ts`, `_themes/zopdev-book.scss`, `_themes/preamble.tex`

### Future
- See `docs/EBOOK_UPGRADE_ROADMAP.md` for full roadmap
- Focus areas: Content transformation at scale, advanced D2 patterns, automation

## Quick Reference

### File Paths
```
_brand/
├── brand.yml              # Core visual identity (Quarto native brand)
└── _brand-extended.yml    # Company, products, ICPs, authors

_themes/
├── zopdev-book.scss       # Premium HTML theme (SCSS, extends cosmo + brand)
├── preamble.tex           # Premium PDF theme (LaTeX, XeTeX)
└── zopdev-epub.css        # Premium EPUB theme (CSS)

_diagrams/
└── templates/             # Reusable D2 diagram templates
    ├── cloud-architecture.d2
    ├── finops-workflow.d2
    ├── before-after-optimization.d2
    ├── multi-cloud-comparison.d2
    └── data-pipeline.d2

books/{id}/
├── _quarto.yml            # Quarto project config (references themes)
├── _brand.yml             # Symlink to _brand/_brand.yml
├── ebook.yml              # Content metadata (chapters, social)
├── brand-overrides.yml    # Brand customization
├── diagrams/              # Ebook-specific D2 diagrams
└── chapters/              # Markdown content (.qmd)

scripts/
├── cli.ts                 # Unified CLI entry point (ebook <command> [slug] [options])
├── brand-utils.ts         # Brand loading & merging (incl. author resolution)
├── content-utils.ts       # Content loading, author resolution, reading time
├── diagram-utils.ts       # D2 diagram validation, listing, copying, rendering
├── ojs-utils.ts           # Observable JS extraction, validation, counting
├── content-audit.ts       # 6-metric content quality audit
├── code-validation.ts     # Multi-language code syntax checking
├── compare-outputs.ts     # Before/after quality comparison
├── theme-tokens.ts        # Design token definitions
├── theme-utils.ts         # Token CSS vars & social theme values
├── validate.ts            # Config validation (incl. content, diagrams, OJS)
├── new-ebook.sh           # Scaffolding
├── pipeline-types.ts      # Shared types for all pipeline stages
├── prompt-templates.ts    # LLM prompts (research, outline, plan, prose) + fact sheet builder
├── provider-config.ts     # Provider resolution + cost tracking
├── research-topic.ts      # Stage 0: Topic research via search APIs
├── generate-outline.ts    # Stage 1: Book outline generation
├── plan-chapters.ts       # Stage 2: Section-level chapter planning
├── transform-chapter.ts   # Stage 3: LLM prose generation + assembly
├── engine-eval.ts         # A/B eval tool (template vs LLM, 11 metrics)
├── eval-modalities.ts     # Unified eval for all modalities (ebook, landing, social, blog)
├── heal-strategies.ts     # Self-healing fix dispatch table
├── eval-loop.ts           # Self-healing orchestrator (agentic loop)
└── providers/
    ├── llm.ts             # Base LLM interface + retry + JSON extraction
    ├── llm-anthropic.ts   # Claude provider
    ├── llm-openai.ts      # OpenAI-compatible (OpenAI, DeepSeek, MiniMax, etc.)
    ├── llm-google.ts      # Gemini provider
    └── llm-mock.ts        # Mock provider (template fallback)

quality-thresholds.yml     # Configurable content quality standards

_templates/
├── _quarto-base.yml       # Quarto config template for new ebooks
├── brand-overrides.yml    # Scaffold template
├── sota-chapter-template.qmd  # Full SOTA chapter example
└── ojs/                   # Observable JS calculator templates
    ├── cost-comparison-calculator.qmd
    ├── roi-calculator.qmd
    └── resource-optimizer.qmd

_landing/
├── generate.ts           # Landing page generator
├── template.html
└── styles.css

_social/
├── generate.ts           # Social asset generator
└── (no templates - programmatic)

_blog/
├── generate.ts           # Blog post generator (chapter → standalone HTML)
├── template.html         # Mustache template for blog posts
└── styles.css            # Blog-specific styles (Medium-inspired)

docs/
├── D2_DIAGRAM_GUIDE.md       # Comprehensive D2 guide
├── OBSERVABLE_JS_PATTERNS.md # Comprehensive OJS guide
├── CONTENT_QUALITY.md        # SOTA content standards
└── CONTRIBUTING.md           # Contribution workflow
```

### Key Functions
```typescript
// ── Brand & Content ───────────────────────────────────────────────────

// Load merged brand config (with optional author filtering)
loadMergedBrand(rootDir: string, slug: string, authorIds?: string[]): MergedBrandConfig

// Deep merge two objects
deepMerge(base: any, override: any): any

// Load ebook content with enriched types
loadEbookContent(rootDir: string, slug: string): EbookContentMeta | null

// Resolve author ID references to full profiles
resolveAuthors(authorIds: string[], authors: AuthorRef[]): AuthorRef[]

// Compute reading time from a QMD file (250 wpm)
computeReadingTime(qmdPath: string): number

// ── Theming ──────────────────────────────────────────────────────────

// Generate CSS variables from brand + design tokens
buildCssVars(config: MergedBrandConfig): Array<{ name: string; value: string }>

// Generate design token CSS variables
buildDesignTokenCssVars(): Array<{ name: string; value: string }>

// Get Satori-safe social theme values
getSocialThemeValues(config): SocialThemeColors

// ── D2 Diagrams ──────────────────────────────────────────────────────

// Validate D2 file syntax using D2 CLI
validateD2Syntax(path: string): DiagramValidation

// List available D2 diagram templates
listDiagramTemplates(rootDir: string): TemplateInfo[]

// Copy diagram template to book's diagrams/ directory
copyTemplateToBook(rootDir: string, template: string, slug: string): string

// Render D2 file to SVG
renderD2Preview(path: string): string

// Find all .d2 files in a book
findBookDiagrams(rootDir: string, slug: string): string[]

// Validate all diagrams in a book
validateBookDiagrams(rootDir: string, slug: string): DiagramValidation[]

// ── Observable JS ────────────────────────────────────────────────────

// Extract all OJS code blocks from a QMD file
extractOJSBlocks(qmdPath: string): OJSBlock[]

// Validate OJS code for common issues
validateOJSSyntax(code: string): OJSValidationResult

// Check if OJS block uses HTML-only features
hasHtmlOnlyFeatures(code: string): boolean

// Validate all OJS blocks in a QMD file
validateOJSFile(qmdPath: string): OJSFileSummary

// Count interactive elements in an ebook
countInteractiveElements(rootDir: string, slug: string): number

// Get detailed OJS usage summary
getOJSSummary(rootDir: string, slug: string): OJSFileSummary[]

// ── Content Quality ──────────────────────────────────────────────────

// Measure diagram density (diagrams per 1000 words)
measureDiagramDensity(slug: string): DiagramMetrics

// Measure code block density and languages
measureCodeDensity(slug: string): CodeMetrics

// Detect generic/vague claims
detectGenericClaims(slug: string): GenericClaimMetrics

// Count interactive elements (OJS blocks)
countInteractiveElements(slug: string): InteractiveMetrics

// Detect real numbers ($ amounts, specific %)
detectRealNumbers(slug: string): NumberMetrics

// Measure reading level (Flesch-Kincaid)
measureReadingLevel(slug: string): ReadabilityMetrics

// Run full content audit
auditEbook(slug: string): AuditReport

// Compare before/after quality metrics
compareQuality(slug: string, beforeDir: string, afterDir: string): ComparisonReport

// ── Code Validation ──────────────────────────────────────────────────

// Validate Terraform/HCL syntax
validateTerraform(code: string): ValidationResult

// Validate Python syntax
validatePython(code: string): ValidationResult

// Validate YAML syntax
validateYAML(code: string): ValidationResult

// Validate SQL syntax
validateSQL(code: string): ValidationResult

// Auto-detect code language
detectLanguage(code: string): string

// ── LLM Pipeline (Stage 3) ──────────────────────────────────────────

// Build structured fact sheet from content seeds + context
// Forces LLM to use exact numbers with attribution
buildFactSheet(seeds: ContentSeed, context: ContextConfig | null): string

// Post-generation vagueness cleanup (removes fabricated claims)
cleanVagueClaims(prose: string, seeds: ContentSeed): string

// Find matching config template for a section heading
findConfigTemplateName(heading: string, purpose: string): string | null

// Generate K8s config block from template library (13 resource types)
generateConfigBlock(configName: string | null, description: string): string

// ── Engine Eval ─────────────────────────────────────────────────────

// Context-aware generic claim detection (strips code/tables, whitelists attributed claims)
countGenericClaims(text: string): number

// Detect unresolved placeholders in generated content
detectPlaceholders(content: string): string[]

// Detect mid-sentence truncations before headings
detectTruncation(content: string): string[]

// Full A/B evaluation: template engine vs LLM engine (11 metrics)
// Usage: bun run scripts/engine-eval.ts <slug> [--report-only]
compare(template: EngineSnapshot, llm: EngineSnapshot): EvalReport

// ── Self-Healing Eval Loop ──────────────────────────────────────────

// Evaluate a single modality
evalEbookChapters(slug: string): ModalityEvalResult
evalLandingPage(slug: string): ModalityEvalResult
evalSocialAssets(slug: string): ModalityEvalResult
evalBlogPosts(slug: string): ModalityEvalResult

// Evaluate all modalities at once
evaluateAll(slug: string, modalities?: Modality[]): ModalityEvalResult[]

// Dispatch heal strategies for violations
dispatchHeals(slug: string, violations: ModalityViolation[]): Promise<HealResult>

// Run the full self-healing loop (orchestrator)
runHealingLoop(config: LoopConfig): Promise<LoopResult>

// ── Blog Post Generation ────────────────────────────────────────────

// Generate blog posts from ebook chapters
generateBlogPosts(slug: string): BlogResult[]
```

### CLI Commands
```bash
# Content Pipeline
ebook new --slug={id} --title="Title"           # Scaffold new ebook
ebook create                                     # Interactive creator
ebook pipeline {id}                              # Full pipeline: research → outline → plan → transform
ebook research {id}                              # Stage 0: Research topic via search APIs
ebook outline {id}                               # Stage 1: Generate book outline
ebook plan {id} [--chapter=01]                   # Stage 2: Generate chapter plans
ebook transform {id} [--chapter=01]              # Stage 3: Generate prose from plans

# Output Generation
ebook render {id} [--format=html|pdf|epub]       # Render with Quarto
ebook landing [id]                               # Generate landing page (all if no slug)
ebook social {id} [--type=linkedin|instagram|og] # Generate social assets
ebook blog [id]                                  # Generate blog posts (all if no slug)
ebook hub                                        # Generate multi-book hub page
ebook publish {id}                               # Generate ALL modalities

# Quality & Evaluation
ebook validate                                   # Validate all configs (YAML, D2, OJS)
ebook audit [id]                                 # Content quality audit (6 metrics)
ebook eval {id} [--report-only]                  # A/B eval: template vs LLM (11 metrics)
ebook eval-all {id} [--modalities=ebook,blog]    # Unified eval across all modalities
ebook heal {id} [--max-iter=5]                   # Self-healing eval loop
ebook eval-pdf {id}                              # PDF quality evaluation
ebook freshness [id]                             # Check pricing data freshness
ebook diagrams {id}                              # Validate D2 diagrams

# Utilities
ebook list [--json]                              # List all ebooks with status
ebook cost-report [id]                           # Show LLM cost breakdown
ebook setup                                      # Symlink brand into all ebooks
ebook clean                                      # Remove all generated output
ebook test                                       # Run unit tests
```

### Make Commands (equivalent)
```bash
make validate                  # Validate all configs
make render ebook={id}         # Render with Quarto
make landing ebook={id}        # Generate landing page
make social ebook={id}         # Generate social assets
make blog ebook={id}           # Generate blog posts
make pipeline ebook={id}       # Full content pipeline
make publish ebook={id}        # All modalities
make audit ebook={id}          # Content quality audit
make eval ebook={id}           # A/B engine evaluation
make heal ebook={id}           # Self-healing eval loop
make hub                       # Generate hub page
make freshness ebook={id}      # Check pricing freshness
make clean                     # Remove all output
```

---

**Last Updated:** 2026-02-22 (after CLI + documentation overhaul)

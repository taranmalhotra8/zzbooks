# Contributing to Zopdev Ebooks

This guide covers how to contribute to the Zopdev Ebook Engine and create high-quality ebook content.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Development Workflow](#development-workflow)
3. [Adding Content](#adding-content)
4. [Adding Diagrams](#adding-diagrams)
5. [Adding Calculators](#adding-calculators)
6. [Content Quality Standards](#content-quality-standards)
7. [Validation and Testing](#validation-and-testing)
8. [Git Workflow](#git-workflow)
9. [Code Style](#code-style)

---

## Quick Start

### Prerequisites

- **Bun** v1.0+ (JavaScript runtime)
- **Quarto** v1.4+ (document rendering engine)
- **D2** v0.7+ (diagram tool) — `brew install d2`
- **Git** (version control)

### Setup

```bash
# Clone repository
git clone https://github.com/zopdev/ebooks.git
cd ebooks

# Install dependencies
bun install
brew install d2

# Verify setup
ebook validate        # or: make validate
ebook list            # or: make list
```

### Create a New Ebook

```bash
# Scaffold a new ebook
make new-ebook slug=my-new-ebook

# This creates:
#   books/my-new-ebook/
#   ├── _quarto.yml           # Quarto config
#   ├── _brand.yml            # Symlink to _brand/brand.yml
#   ├── ebook.yml             # Content metadata
#   ├── brand-overrides.yml   # Brand customization (optional)
#   └── chapters/             # Markdown content
```

---

## Development Workflow

### Daily Workflow

```bash
# 1. Create feature branch
git checkout -b feature/my-feature

# 2. Make changes to content or engine

# 3. Validate changes
make validate

# 4. Render ebook to preview
make render ebook=<slug>
open books/<slug>/_output/html/index.html

# 5. Run content audit
make audit ebook=<slug>

# 6. Commit changes
git add .
git commit -m "feat: add chapter on right-sizing"

# 7. Push and create PR
git push origin feature/my-feature
gh pr create
```

### Make Targets

| Command | Purpose |
|---------|---------|
| `make validate` | Validate all YAML configs, D2 diagrams, OJS blocks |
| `make render ebook=<slug>` | Render all formats (HTML, PDF, EPUB) |
| `make audit ebook=<slug>` | Run content quality audit |
| `make diagrams ebook=<slug>` | Validate all D2 diagrams |
| `make landing ebook=<slug>` | Generate landing page |
| `make social ebook=<slug>` | Generate social media assets |
| `make compare ebook=<slug> before=<path> after=<path>` | Compare before/after quality |
| `make clean` | Clear all outputs |

---

## Adding Content

### Chapter Structure

Use the SOTA chapter template as a starting point:

```bash
cp _templates/sota-chapter-template.qmd books/<slug>/chapters/05-my-chapter.qmd
```

### Content Checklist

Every chapter should include:

- ✅ **Incident-driven opening** — Real scenario with specific numbers
- ✅ **Production-ready code** — Copy-pasteable examples (2+ blocks)
- ✅ **Diagrams** — Architecture, workflow, or before/after (≥1 per chapter)
- ✅ **Interactive elements** — Calculator or interactive visualization (optional but recommended)
- ✅ **Quantified outcomes** — Dollar amounts, percentages, fleet sizes
- ✅ **Call to action** — Clear next steps for readers

**See:** [guides/CONTENT_QUALITY.md](guides/CONTENT_QUALITY.md) for full SOTA content standards.

### Example Chapter Outline

```markdown
# Chapter Title: Concrete Problem Statement

## The $X Wake-Up Call
[Incident-driven opening with specific numbers...]

## Why [Problem] Happens
[Background context...]

## The [Solution] Framework
[Architecture diagram showing current state...]
[Production-ready code examples...]
[Interactive calculator...]

## Optimized Architecture
[After-state diagram showing improvements...]

## Results After [Time Period]
[Quantified outcomes...]

## Next Steps
[Clear call to action...]
```

---

## Adding Diagrams

### Quick Start

1. **Copy a template** from `_diagrams/templates/`
2. **Edit the D2 file** with your content
3. **Embed in chapter** using D2 code fence

### Available Templates

| Template | Purpose |
|----------|---------|
| `cloud-architecture.d2` | Infrastructure with cost annotations |
| `finops-workflow.d2` | FinOps lifecycle (Inform → Optimize → Operate) |
| `before-after-optimization.d2` | Side-by-side cost optimization |
| `multi-cloud-comparison.d2` | AWS vs GCP vs Azure |
| `data-pipeline.d2` | ETL/analytics workflows |

### Example Usage

```bash
# Copy template
cp _diagrams/templates/cloud-architecture.d2 books/<slug>/diagrams/my-architecture.d2

# Edit the D2 file
vim books/<slug>/diagrams/my-architecture.d2

# Validate syntax
d2 validate books/<slug>/diagrams/my-architecture.d2

# Embed in chapter
```

````markdown
```{d2}
//| file: diagrams/my-architecture.d2
//| fig-cap: "Production infrastructure with cost breakdown"
//| fig-width: 8
```
````

### Zopdev Brand Colors

Always use these colors in diagrams:

- **Primary Blue**: `#0891b2` — Main elements, Zopdev products
- **Success Green**: `#16a34a` — Savings, optimization wins
- **Warning Orange**: `#fbbf24` — Alerts, moderate issues
- **Danger Red**: `#FF6B6B` — Problems, waste

**See:** [guides/D2_DIAGRAM_GUIDE.md](guides/D2_DIAGRAM_GUIDE.md) for comprehensive D2 guide.

---

## Adding Calculators

### Quick Start

1. **Copy a calculator template** from `_templates/ojs/`
2. **Customize inputs and formulas** for your scenario
3. **Add static fallback** for PDF/EPUB

### Available Templates

| Template | Purpose |
|----------|---------|
| `cost-comparison-calculator.qmd` | Compare 2+ options side-by-side |
| `roi-calculator.qmd` | Investment vs savings over time |
| `resource-optimizer.qmd` | Find optimal resource tier |

### Example Usage

````markdown
## ROI Calculator

::: {.callout-note}
## How to Use
Adjust the inputs below to model your scenario.
:::

```{ojs}
//| echo: false

viewof investment = Inputs.range([10000, 500000], {
  value: 50000,
  label: "Implementation cost ($)"
})

viewof savings = Inputs.range([1000, 50000], {
  value: 15000,
  label: "Monthly savings ($)"
})

roi = ((savings * 12) / investment * 100).toFixed(0)

html`<div class="ojs-calculator">
  <div class="ojs-metric">
    <span class="ojs-metric-value">${roi}%</span>
    <span class="ojs-metric-label">Annual ROI</span>
  </div>
</div>`
```

::: {.content-visible when-format="pdf"}
**ROI Calculator (Default Scenario)**

Investment: $50,000 | Monthly Savings: $15,000

**Annual ROI: 360%**
:::
````

**Important:** Always provide static fallback for PDF/EPUB using `content-visible` blocks.

**See:** [guides/OBSERVABLE_JS_PATTERNS.md](guides/OBSERVABLE_JS_PATTERNS.md) for comprehensive OJS guide.

---

## Content Quality Standards

### SOTA (State-of-the-Art) Quality

Zopdev ebooks target professional quality that readers would pay $200+ for. Every chapter should meet these standards:

#### 1. Incident-Driven Narratives

**❌ Generic:** "Many organizations struggle with cloud costs."

**✅ SOTA:** "When Acme Corp's AWS bill hit $450K/month, the CTO escalated to the board..."

#### 2. Production-Ready Code

**❌ Pseudocode:** `costs = get_costs(); analyze(costs)`

**✅ SOTA:** Full Python scripts with imports, error handling, and sample output

#### 3. Numerical Specificity

**❌ Vague:** "Significant savings", "30-50% reduction"

**✅ SOTA:** "$18,242/month savings (38.4% reduction)", "143 overprovisioned instances"

#### 4. Visual Density

**Target:** ≥0.3 diagrams per 1000 words

**Why:** Complex concepts are easier to understand visually

#### 5. Interactive Elements

**Target:** ≥1 calculator per ebook

**Why:** Readers want to model their own scenarios

**See:** [docs/CONTENT_QUALITY.md](./CONTENT_QUALITY.md) for full SOTA standards.

---

## Validation and Testing

### Content Audit

Run automated quality checks before submitting:

```bash
# Audit a specific ebook
make audit ebook=<slug>

# Sample output:
# Overall Score: C (7 violations)
#
# DIAGRAMS: 0.11 per 1000 words (target: 0.3) [WARN]
# CODE BLOCKS: 12 total (target: 2 per chapter)
# GENERIC CLAIMS: 47 total (target: ≤5 per chapter) [WARN]
# INTERACTIVE ELEMENTS: 0 (target: ≥1) [WARN]
# REAL NUMBERS: 23 total
# READING LEVEL: 11.2 grade (target: 8-14)
```

**Action items:**
1. Add diagrams to chapters with 0.00 density
2. Replace generic claims with specific numbers
3. Add production-ready code examples
4. Include an interactive calculator

### Validation Workflow

```bash
# 1. Validate configs and syntax
make validate

# Expected: 0 errors
# If errors: Fix YAML syntax, D2 syntax, OJS syntax

# 2. Run content audit
make audit ebook=<slug>

# Expected: Overall Score B or better
# If violations: Follow recommendations in output

# 3. Test all formats
make render ebook=<slug>
open books/<slug>/_output/html/index.html      # Interactive version
open books/<slug>/_output/<slug>.pdf            # PDF version
```

### Quality Metrics

The content audit measures 6 metrics:

| Metric | Target | What It Measures |
|--------|--------|------------------|
| **Diagram Density** | ≥0.3/1000 words | D2, Mermaid, images |
| **Code Density** | ≥2 blocks/chapter | Fenced code blocks |
| **Generic Claims** | ≤5/chapter | "should", "many", "typically", vague % |
| **Interactive Elements** | ≥1/ebook | OJS calculators |
| **Real Numbers** | ≥1/chapter | $ amounts, specific %, fleet sizes |
| **Reading Level** | 8-14 grade | Flesch-Kincaid |

### Before/After Comparison

When making major content improvements, compare before/after quality:

```bash
# Save current state
cp -r books/<slug>/_output /tmp/before-changes

# Make improvements
# ...

# Generate new output
make render ebook=<slug>

# Compare
make compare ebook=<slug> before=/tmp/before-changes after=books/<slug>/_output

# Opens HTML report showing:
# - Diagram density delta
# - Code density delta
# - Generic claims delta
# - Interactive elements added
# - Real numbers delta
```

---

## Git Workflow

### Branch Naming

- **feature/** — New features or content (`feature/add-chapter-5`)
- **fix/** — Bug fixes (`fix/broken-diagram-rendering`)
- **docs/** — Documentation updates (`docs/update-ojs-guide`)
- **chore/** — Maintenance (`chore/update-dependencies`)

### Commit Messages

Follow conventional commits format:

```
<type>: <description>

[optional body]
```

**Types:**
- `feat:` — New feature or content
- `fix:` — Bug fix
- `docs:` — Documentation changes
- `chore:` — Maintenance tasks
- `style:` — Code formatting (no functional changes)
- `refactor:` — Code restructuring (no functional changes)
- `test:` — Test additions or fixes

**Examples:**

```bash
git commit -m "feat: add chapter 5 on right-sizing"
git commit -m "fix: correct D2 syntax in cloud-architecture diagram"
git commit -m "docs: update Observable JS patterns guide"
git commit -m "chore: upgrade Quarto to v1.4.5"
```

### Pull Request Process

1. **Create feature branch**
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make changes and commit**
   ```bash
   git add .
   git commit -m "feat: add interactive cost calculator"
   ```

3. **Push to remote**
   ```bash
   git push origin feature/my-feature
   ```

4. **Create pull request**
   ```bash
   gh pr create --title "Add interactive cost calculator" --body "$(cat <<'EOF'
   ## Summary
   - Added ROI calculator to chapter 5
   - Uses Observable JS with Zopdev brand styling
   - Includes static fallback for PDF/EPUB

   ## Test Plan
   - [x] Calculator works interactively in HTML
   - [x] PDF shows static fallback table
   - [x] All validation passes
   - [x] Content audit score improved from C to B

   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   EOF
   )"
   ```

5. **Review and merge**
   - Request review from team
   - Address feedback
   - Merge when approved

---

## Code Style

### TypeScript/JavaScript

```typescript
// Use explicit types
interface BrandConfig {
  company: CompanyInfo;
  products: Product[];
}

// Prefer named exports
export function loadBrand(path: string): BrandConfig { }

// Use const for immutable data
const brand = loadBrand('_brand/brand.yml');

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

### Markdown/Quarto

```markdown
# Use ATX-style headings (not Setext)
## Level 2 Heading

# Prefer fenced code blocks with language tags
```python
def example():
    pass
```

# Use descriptive figure captions
```{d2}
//| fig-cap: "Production infrastructure before optimization"
```

# Add callouts for tips/notes/warnings
::: {.callout-note}
## Pro Tip
Use ZopNight's scheduling to save 40% on non-prod resources.
:::
```

---

## Additional Resources

### Documentation

- **[D2 Diagram Guide](./D2_DIAGRAM_GUIDE.md)** — How to create professional diagrams
- **[Observable JS Patterns](./OBSERVABLE_JS_PATTERNS.md)** — How to add interactive calculators
- **[Content Quality Guide](./CONTENT_QUALITY.md)** — SOTA content standards
- **[SOTA Chapter Template](_templates/sota-chapter-template.qmd)** — Full example chapter

### Tools

- **[Quarto Documentation](https://quarto.org/docs/)** — Quarto features and syntax
- **[D2 Playground](https://play.d2lang.com/)** — Test D2 diagrams online
- **[Observable Documentation](https://observablehq.com/@observablehq/documentation)** — Learn Observable JS

### Scripts

- **`scripts/diagram-utils.ts`** — D2 diagram utilities
- **`scripts/ojs-utils.ts`** — Observable JS utilities
- **`scripts/content-audit.ts`** — Content quality validation
- **`scripts/code-validation.ts`** — Code syntax checking
- **`scripts/compare-outputs.ts`** — Before/after comparison

---

## CLI Development

The unified CLI lives in `scripts/cli.ts`. It routes subcommands to existing scripts via subprocess delegation.

### Adding a New Command

1. Add a `CommandDef` entry to the `COMMANDS` array in `scripts/cli.ts`
2. Set `group`, `requiresSlug`, `options`, and `handler`
3. The handler should call `run()` to delegate to an existing script
4. Update `docs/CLI_REFERENCE.md` with the new command
5. Update `Makefile` with an equivalent Make target

### Testing CLI Changes

```bash
bun run scripts/cli.ts --help                    # Verify help output
bun run scripts/cli.ts <new-command> --help      # Verify command help
bun run scripts/cli.ts <new-command> <slug>      # Test execution
bun test scripts/tests/                          # Run unit tests
```

### Architecture

- **No external dependencies** — arg parsing is hand-rolled (`process.argv`)
- **Subprocess delegation** — each command spawns `bun run scripts/X.ts`
- **ANSI colors** — inline escape codes (no chalk/picocolors)
- **Levenshtein distance** — typo correction for unknown commands and slugs
- **Inline handlers** — `list` and `clean` run directly (no subprocess)

---

## Questions?

- **Slack:** #ebook-engine
- **Issues:** https://github.com/zopdev/ebooks/issues
- **Email:** engineering@zopdev.com

---

**Last Updated:** 2026-02-14 (after Epic #5 completion)

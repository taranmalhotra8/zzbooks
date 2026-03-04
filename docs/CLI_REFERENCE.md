# CLI Reference

Complete reference for the `ebook` command-line interface.

## Installation

```bash
# Install dependencies
bun install

# Option 1: Run via bun (always works)
bun run scripts/cli.ts <command> [slug] [options]

# Option 2: Link globally (then use 'ebook' directly)
bun link
ebook <command> [slug] [options]

# Option 3: Use Make targets (equivalent functionality)
make <target> ebook=<slug>
```

## Global Options

| Flag | Description |
|------|-------------|
| `--help`, `-h` | Show help for a command |
| `--version` | Show version number |

Run `ebook <command> --help` for details on any command.

---

## Content Pipeline

### `ebook new`

Scaffold a new ebook from templates.

```bash
ebook new --slug=<slug> --title="<title>" [--subtitle="<subtitle>"]
```

| Option | Description |
|--------|-------------|
| `--slug` | URL-friendly identifier (required) |
| `--title` | Ebook title (required) |
| `--subtitle` | Optional subtitle |

**Examples:**
```bash
ebook new --slug=k8s-security --title="Kubernetes Security Guide"
ebook new --slug=aws-costs --title="AWS Cost Guide" --subtitle="Save 40%"
```

**What it does:** Creates `books/<slug>/` with `_quarto.yml`, `ebook.yml`, `brand-overrides.yml`, `topic.yml`, and initial chapter files.

### `ebook create`

Interactive ebook creator — walks you through topic selection, audience, angle, and then runs the full pipeline + all output generators.

```bash
ebook create
```

No arguments. Fully interactive with step-by-step prompts.

### `ebook pipeline`

Run the full 4-stage content pipeline.

```bash
ebook pipeline <slug> [--chapter=<id>] [--parallel=<n>]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--chapter` | `-c` | Process a single chapter only |
| `--parallel` | `-p` | Parallel chapter transforms (uses pipeline-runner) |

**Examples:**
```bash
ebook pipeline k8s-cost-guide                    # Full sequential pipeline
ebook pipeline k8s-cost-guide --parallel=4       # Parallel stage 3
ebook pipeline k8s-cost-guide --chapter=01       # Single chapter
```

**Stages:**
1. **Research** — Query search APIs, generate `research.yml`
2. **Outline** — Generate book outline from topic + research
3. **Plan** — Create chapter plans with visual recommendations
4. **Transform** — Generate prose from plans

### `ebook research`

Stage 0: Research a topic via search APIs.

```bash
ebook research <slug>
```

Reads `books/<slug>/topic.yml` and generates `books/<slug>/research.yml`.

### `ebook outline`

Stage 1: Generate book outline from topic and research data.

```bash
ebook outline <slug>
```

Reads `topic.yml` + `research.yml`, generates `outline.yml`.

### `ebook plan`

Stage 2: Plan chapters with section structure and visual recommendations.

```bash
ebook plan <slug> [--chapter=<id>]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--chapter` | `-c` | Plan a single chapter |

Reads `outline.yml` + `research.yml`, generates `chapters/*.plan.yml`.

### `ebook transform`

Stage 3: Generate prose from chapter plans.

```bash
ebook transform <slug> [--chapter=<id>]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--chapter` | `-c` | Transform a single chapter |

Reads `*.plan.yml` files, generates `.qmd` chapters with code blocks, diagrams, and images.

---

## Output Generation

### `ebook render`

Render an ebook with Quarto (HTML, PDF, EPUB).

```bash
ebook render <slug> [--format=<fmt>]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--format` | `-f` | Output format: `html`, `pdf`, `epub`, `all` (default: `all`) |

**Examples:**
```bash
ebook render k8s-cost-guide                # All formats
ebook render k8s-cost-guide --format=pdf   # PDF only
ebook render k8s-cost-guide -f html        # HTML only
```

**Output:** `_output/books/<slug>/`

### `ebook landing`

Generate a landing page with lead capture form.

```bash
ebook landing [slug]
```

Without a slug, generates landing pages for all ebooks.

**Output:** `_output/landing/<slug>/index.html`

### `ebook social`

Generate social media assets.

```bash
ebook social <slug> [--type=<type>]
```

| Option | Short | Description |
|--------|-------|-------------|
| `--type` | `-t` | Asset type: `linkedin`, `instagram`, `og`, `all` (default: `all`) |

**Output:** `_output/social/<slug>/linkedin/`, `instagram/`, `og/`

### `ebook blog`

Generate standalone blog posts from ebook chapters.

```bash
ebook blog [slug]
```

Without a slug, generates blog posts for all ebooks.

**Output:** `_output/blog/<slug>/`

### `ebook hub`

Generate the multi-book hub (library page with search and tag filtering).

```bash
ebook hub
```

**Output:** `_output/hub/index.html`

### `ebook publish`

Generate ALL output modalities for one ebook (render + landing + social + blog + audit).

```bash
ebook publish <slug>
```

Equivalent to running: render → landing → social → blog → audit in sequence.

---

## Quality & Evaluation

### `ebook validate`

Validate all YAML configs, D2 diagrams, and OJS blocks.

```bash
ebook validate
```

Checks `calendar.yml`, all `ebook.yml` and `brand-overrides.yml` files.

### `ebook audit`

Run content quality audit measuring 6 metrics.

```bash
ebook audit [slug]
```

Without a slug, audits all ebooks.

**Metrics:** diagram density, code density, generic claims, interactive elements, real numbers, reading level.

### `ebook eval`

A/B engine evaluation comparing template output vs LLM output across 11 metrics.

```bash
ebook eval <slug> [--report-only]
```

| Option | Description |
|--------|-------------|
| `--report-only` | Re-run report from existing snapshots (skip generation) |

### `ebook eval-all`

Unified evaluation across all output modalities (ebook, landing, social, blog).

```bash
ebook eval-all <slug> [--modalities=<list>]
```

| Option | Description |
|--------|-------------|
| `--modalities` | Comma-separated list (e.g., `ebook,landing`) |

This is a dry-run evaluation — it does not attempt to fix violations.

### `ebook heal`

Self-healing eval loop: evaluate → identify violations → apply fixes → re-evaluate.

```bash
ebook heal <slug> [--max-iter=<n>] [--modalities=<list>]
```

| Option | Description |
|--------|-------------|
| `--max-iter` | Maximum healing iterations (default: 3) |
| `--modalities` | Comma-separated modality list |

**Exit conditions:** all pass, no healable violations, no improvement between iterations, max iterations reached, or cost limit exceeded.

### `ebook eval-pdf`

Evaluate PDF quality (page count, cover page, fonts, blank pages).

```bash
ebook eval-pdf <slug>
```

### `ebook freshness`

Check pricing data freshness against cloud provider APIs.

```bash
ebook freshness [slug]
```

Without a slug, checks all ebooks. Advisory only — flags prices that may be stale.

### `ebook diagrams`

Validate D2 diagrams for an ebook.

```bash
ebook diagrams <slug>
```

### `ebook compare`

Compare before/after quality metrics from snapshot directories.

```bash
ebook compare <slug> --before=<path> --after=<path>
```

| Option | Description |
|--------|-------------|
| `--before` | Path to before snapshot (required) |
| `--after` | Path to after snapshot (required) |

---

## Utilities

### `ebook list`

List all ebooks from `calendar.yml` with their status.

```bash
ebook list [--json]
```

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON array (for scripting) |

### `ebook cost-report`

Show LLM cost breakdown per model and stage.

```bash
ebook cost-report [slug]
```

Without a slug, shows aggregate costs for all ebooks.

### `ebook setup`

Symlink `_brand/` into all ebook directories.

```bash
ebook setup
```

### `ebook clean`

Remove all generated output (`_output/` directory).

```bash
ebook clean
```

### `ebook test`

Run unit tests.

```bash
ebook test
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_PROVIDER` | LLM provider name | From `pipeline.yml` |
| `LLM_MODEL` | Model name | From `pipeline.yml` |
| `LLM_API_KEY` | API key for LLM provider | — |
| `PIPELINE_MODE` | Set to `mock` for template-only output | — |
| `QUARTO_PYTHON` | Python path for Quarto OJS support | Auto-detected `.venv` |

---

## Make Equivalence

Every CLI command has a Make equivalent:

| CLI | Make |
|-----|------|
| `ebook list` | `make list` |
| `ebook validate` | `make validate` |
| `ebook pipeline k8s-cost-guide` | `make pipeline ebook=k8s-cost-guide` |
| `ebook plan k8s-cost-guide --chapter=01` | `make plan ebook=k8s-cost-guide chapter=01` |
| `ebook render k8s-cost-guide --format=pdf` | `make render-pdf ebook=k8s-cost-guide` |
| `ebook landing k8s-cost-guide` | `make landing ebook=k8s-cost-guide` |
| `ebook social k8s-cost-guide --type=og` | `make social-og ebook=k8s-cost-guide` |
| `ebook publish k8s-cost-guide` | `make publish ebook=k8s-cost-guide` |
| `ebook audit k8s-cost-guide` | `make audit ebook=k8s-cost-guide` |
| `ebook eval k8s-cost-guide` | `make eval ebook=k8s-cost-guide` |
| `ebook heal k8s-cost-guide --max-iter=5` | `make heal ebook=k8s-cost-guide max-iter=5` |
| `ebook blog k8s-cost-guide` | `make blog ebook=k8s-cost-guide` |
| `ebook hub` | `make hub` |
| `ebook clean` | `make clean` |

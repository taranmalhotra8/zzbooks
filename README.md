# Zopdev Ebook Engine

A modular ebook-as-code engine that generates multi-format ebooks (HTML, PDF, EPUB) with landing pages, social media assets, blog posts, and a multi-book hub — all from a single content pipeline.

## Quick Start

```bash
bun install                        # Install dependencies
ebook list                         # See all ebooks
ebook pipeline k8s-cost-guide      # Generate content (research → outline → plan → transform)
ebook publish k8s-cost-guide       # Render all output formats
ebook audit k8s-cost-guide         # Check content quality
```

> **Tip:** Run `ebook --help` or `ebook <command> --help` for full options.

## How It Works

```
topic.yml ──► [research] ──► [outline] ──► [plan] ──► [transform] ──► .qmd chapters
                                                                           │
                    ┌──────────┬───────────┬──────────┬────────────────────┘
                    ▼          ▼           ▼          ▼
                [render]   [landing]   [social]    [blog]
                    │          │           │          │
              HTML/PDF/    Landing     OG/LI/IG    Blog
              EPUB         Page        Images      Posts
```

**4-stage LLM content pipeline** generates structured, data-backed ebook chapters from a topic definition. Output generators then produce all distribution formats from the same source.

## Commands

### Content Pipeline

| Command | Description |
|---------|-------------|
| `ebook new --slug=<id> --title="<title>"` | Scaffold a new ebook |
| `ebook create` | Interactive creator (topic in, all modalities out) |
| `ebook pipeline <slug>` | Full pipeline: research → outline → plan → transform |
| `ebook research <slug>` | Stage 0: Research topic via search APIs |
| `ebook outline <slug>` | Stage 1: Generate book outline |
| `ebook plan <slug>` | Stage 2: Plan chapters with visual recommendations |
| `ebook transform <slug>` | Stage 3: Generate prose from chapter plans |

### Output Generation

| Command | Description |
|---------|-------------|
| `ebook render <slug> [--format=html\|pdf\|epub]` | Render with Quarto |
| `ebook landing [slug]` | Generate landing page |
| `ebook social <slug> [--type=linkedin\|instagram\|og]` | Generate social assets |
| `ebook blog [slug]` | Generate blog posts from chapters |
| `ebook hub` | Generate multi-book hub page |
| `ebook publish <slug>` | Generate ALL modalities |

### Quality & Evaluation

| Command | Description |
|---------|-------------|
| `ebook validate` | Validate all configs (YAML, D2, OJS) |
| `ebook audit [slug]` | Content quality audit (6 metrics) |
| `ebook eval <slug>` | A/B engine eval (template vs LLM, 11 metrics) |
| `ebook eval-all <slug>` | Unified eval across all modalities |
| `ebook heal <slug> [--max-iter=N]` | Self-healing eval loop |
| `ebook freshness [slug]` | Check pricing data freshness |
| `ebook diagrams <slug>` | Validate D2 diagrams |

### Utilities

| Command | Description |
|---------|-------------|
| `ebook list [--json]` | List all ebooks with status |
| `ebook cost-report [slug]` | Show LLM cost breakdown |
| `ebook setup` | Symlink brand into all ebooks |
| `ebook clean` | Remove all generated output |
| `ebook test` | Run unit tests |

See [docs/CLI_REFERENCE.md](docs/CLI_REFERENCE.md) for complete command documentation.

## Project Structure

```
ebooks/
├── scripts/
│   ├── cli.ts                  # Unified CLI entry point
│   ├── research-topic.ts       # Stage 0: topic research
│   ├── generate-outline.ts     # Stage 1: book outline
│   ├── plan-chapters.ts        # Stage 2: chapter planning
│   ├── transform-chapter.ts    # Stage 3: prose generation
│   ├── content-audit.ts        # 6-metric quality audit
│   ├── engine-eval.ts          # A/B eval (11 metrics)
│   ├── eval-loop.ts            # Self-healing orchestrator
│   ├── brand-utils.ts          # Brand config loading & merging
│   ├── validate.ts             # Config validation
│   └── providers/              # LLM, search, image, pricing providers
│
├── _brand/                     # Brand identity (colors, logos, company info)
│   ├── brand.yml               # Quarto-native brand config
│   └── _brand-extended.yml     # Company, products, ICPs, authors
│
├── _themes/                    # Rendering themes
│   ├── zopdev-book.scss        # HTML theme (SCSS)
│   ├── preamble.tex            # PDF theme (LaTeX)
│   └── zopdev-epub.css         # EPUB theme
│
├── _landing/                   # Landing page generator
├── _social/                    # Social media asset generator
├── _blog/                      # Blog post generator
├── _hub/                       # Multi-book hub generator
├── _templates/                 # Scaffolding & calculator templates
├── _diagrams/                  # Reusable D2 diagram templates
│
├── books/                      # Ebook projects
│   ├── k8s-cost-guide/
│   ├── finops-playbook/
│   ├── terraform-cloud-costs/
│   ├── platform-engineering/
│   └── cloud-migration-costs/
│
├── _output/                    # Generated output (gitignored)
├── calendar.yml                # Content calendar (source of truth)
├── quality-thresholds.yml      # Configurable quality standards
└── Makefile                    # Make targets (alternative to CLI)
```

## Current Ebooks

| Slug | Title | Status |
|------|-------|--------|
| `finops-playbook` | The FinOps Playbook | in-progress |
| `k8s-cost-guide` | Kubernetes Cost Guide | draft |
| `terraform-cloud-costs` | Terraform Cloud Costs | draft |
| `platform-engineering` | The Platform Engineering Playbook | draft |
| `cloud-migration-costs` | Cloud Migration Cost Catastrophe | draft |

## Prerequisites

- **[Bun](https://bun.sh/)** — TypeScript runtime
- **[Quarto](https://quarto.org/)** — Book rendering (HTML/PDF/EPUB)
- **TinyTeX** — PDF generation (`quarto install tinytex`)
- **D2** (optional) — Diagram rendering

See [docs/SETUP.md](docs/SETUP.md) for detailed installation instructions.

## Documentation

- **[CLI Reference](docs/CLI_REFERENCE.md)** — Every command, every option
- **[Setup Guide](docs/SETUP.md)** — Prerequisites and installation
- **[Quick Start Guide](docs/QUICKSTART_GUIDE.md)** — Step-by-step walkthrough
- **[D2 Diagram Guide](guides/D2_DIAGRAM_GUIDE.md)** — Diagram patterns
- **[Observable JS Patterns](guides/OBSERVABLE_JS_PATTERNS.md)** — Interactive calculators
- **[Content Quality Standards](guides/CONTENT_QUALITY.md)** — Quality metrics
- **[Contributing](CONTRIBUTING.md)** — Development workflow

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, code style, and PR process.

## License

Proprietary — Zopdev internal use only.

# Zopdev Ebook Generation Engine
# Usage: make <target> [ebook=<slug>] [slug=<slug> title="<title>" subtitle="<subtitle>"]

.DEFAULT_GOAL := help

# ─── Variables ───────────────────────────────────────────────────────────────

BOOKS_DIR   := books
OUTPUT_DIR  := _output
SCRIPTS_DIR := scripts

# Quarto needs a Python with jupyter + PyYAML for OJS support.
# Auto-detect .venv if present; override with: make render ebook=x QUARTO_PYTHON=/path/to/python
QUARTO_PYTHON ?= $(shell [ -x .venv/bin/python3 ] && echo .venv/bin/python3 || echo "")
export QUARTO_PYTHON

# Parallelization: set to number of CPU cores for parallel builds
# Use: make render-all PARALLEL=4
PARALLEL ?= 1

# ─── Help ────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show all targets
	@echo "Zopdev Ebook Engine"
	@echo "==================="
	@echo ""
	@echo "Usage: make <target> [ebook=<slug>]"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ─── Setup ───────────────────────────────────────────────────────────────────

.PHONY: install
install: ## Install Bun dependencies
	bun install

.PHONY: setup
setup: ## Symlink brand into all ebooks
	@for dir in $(BOOKS_DIR)/*/; do \
		slug=$$(basename "$$dir"); \
		$(SCRIPTS_DIR)/setup-ebook.sh "$$slug"; \
	done

# ─── Testing ─────────────────────────────────────────────────────────────────

.PHONY: test
test: ## Run unit tests
	bun test $(SCRIPTS_DIR)/tests/

# ─── Validation ──────────────────────────────────────────────────────────────

.PHONY: validate
validate: ## Validate calendar + ebook manifests
	bun run $(SCRIPTS_DIR)/validate.ts

# ─── List ────────────────────────────────────────────────────────────────────

.PHONY: list
list: ## List all ebooks with status
	@echo "Ebooks:"
	@echo "-------"
	@while IFS= read -r line; do \
		case "$$line" in \
			*"slug:"*) slug=$$(echo "$$line" | sed 's/.*slug:[[:space:]]*//' | sed 's/[[:space:]]*#.*//' | tr -d '"') ;; \
			*"title:"*) title=$$(echo "$$line" | sed 's/.*title:[[:space:]]*//' | sed 's/[[:space:]]*#.*//' | tr -d '"') ;; \
			*"status:"*) status=$$(echo "$$line" | sed 's/.*status:[[:space:]]*//' | sed 's/[[:space:]]*#.*//' | tr -d '"'); \
				printf "  %-25s %-40s [%s]\n" "$$slug" "$$title" "$$status" ;; \
		esac; \
	done < calendar.yml

# ─── Render ──────────────────────────────────────────────────────────────────

.PHONY: render
render: ## Render one ebook (all formats) — ebook=<slug>
ifndef ebook
	$(error Usage: make render ebook=<slug>)
endif
	@echo "Rendering $(ebook)..."
	quarto render $(BOOKS_DIR)/$(ebook)

.PHONY: render-html
render-html: ## Render HTML only — ebook=<slug>
ifndef ebook
	$(error Usage: make render-html ebook=<slug>)
endif
	quarto render $(BOOKS_DIR)/$(ebook) --to html

.PHONY: render-pdf
render-pdf: ## Render PDF only — ebook=<slug>
ifndef ebook
	$(error Usage: make render-pdf ebook=<slug>)
endif
	quarto render $(BOOKS_DIR)/$(ebook) --to pdf

.PHONY: eval-pdf
eval-pdf: ## Evaluate PDF quality — ebook=<slug>
ifndef ebook
	$(error Usage: make eval-pdf ebook=<slug>)
endif
	bun run scripts/pdf-eval.ts $(ebook)

.PHONY: render-epub
render-epub: ## Render EPUB only — ebook=<slug>
ifndef ebook
	$(error Usage: make render-epub ebook=<slug>)
endif
	quarto render $(BOOKS_DIR)/$(ebook) --to epub

.PHONY: render-all
render-all: ## Render all non-archived ebooks — PARALLEL=n for parallel (default: 1)
	$(SCRIPTS_DIR)/render-all.sh -j $(PARALLEL)

# ─── Landing Pages ───────────────────────────────────────────────────────────

.PHONY: landing
landing: ## Generate landing page — ebook=<slug>
ifndef ebook
	$(error Usage: make landing ebook=<slug>)
endif
	bun run _landing/generate.ts $(ebook)

.PHONY: landing-all
landing-all: ## Generate all landing pages
	bun run _landing/generate.ts

# ─── Social Media Assets ────────────────────────────────────────────────────

.PHONY: social
social: ## Generate all social assets — ebook=<slug>
ifndef ebook
	$(error Usage: make social ebook=<slug>)
endif
	bun run _social/generate.ts $(ebook)

.PHONY: social-linkedin
social-linkedin: ## LinkedIn carousel only — ebook=<slug>
ifndef ebook
	$(error Usage: make social-linkedin ebook=<slug>)
endif
	bun run _social/generate.ts $(ebook) linkedin

.PHONY: social-instagram
social-instagram: ## Instagram posts only — ebook=<slug>
ifndef ebook
	$(error Usage: make social-instagram ebook=<slug>)
endif
	bun run _social/generate.ts $(ebook) instagram

.PHONY: social-og
social-og: ## OG image only — ebook=<slug>
ifndef ebook
	$(error Usage: make social-og ebook=<slug>)
endif
	bun run _social/generate.ts $(ebook) og

# ─── Diagrams ──────────────────────────────────────────────────────────────

.PHONY: diagrams
diagrams: ## Validate D2 diagrams — ebook=<slug>
ifndef ebook
	$(error Usage: make diagrams ebook=<slug>)
endif
	@echo "Validating D2 diagrams for $(ebook)..."
	@if [ -d "$(BOOKS_DIR)/$(ebook)/diagrams" ]; then \
		for f in $(BOOKS_DIR)/$(ebook)/diagrams/*.d2; do \
			[ -f "$$f" ] || continue; \
			if d2 validate "$$f" > /dev/null 2>&1; then \
				echo "  OK  $$f"; \
			else \
				echo "  FAIL $$f"; \
				d2 validate "$$f" 2>&1 | sed 's/^/       /'; \
				exit 1; \
			fi; \
		done; \
		echo "All diagrams valid."; \
	else \
		echo "  No diagrams/ directory found for $(ebook) (skipping)"; \
	fi

# ─── Content Quality Audit ──────────────────────────────────────────────────

.PHONY: audit
audit: ## Run content quality audit — ebook=<slug>
ifndef ebook
	$(error Usage: make audit ebook=<slug>)
endif
	bun run $(SCRIPTS_DIR)/content-audit.ts $(ebook)

.PHONY: audit-all
audit-all: ## Run content quality audit on all ebooks
	bun run $(SCRIPTS_DIR)/content-audit.ts

.PHONY: code-validate
code-validate: ## Run code validation — ebook=<slug>
ifndef ebook
	$(error Usage: make code-validate ebook=<slug>)
endif
	bun run $(SCRIPTS_DIR)/code-validation.ts $(ebook)

.PHONY: compare
compare: ## Compare before/after quality — ebook=<slug> before=<path> after=<path>
ifndef ebook
	$(error Usage: make compare ebook=<slug> before=<path> [after=<path>])
endif
ifndef before
	$(error Usage: make compare ebook=<slug> before=<path> [after=<path>])
endif
	bun run $(SCRIPTS_DIR)/compare-outputs.ts $(ebook) $(before) $(after)

# ─── Interactive Creator ──────────────────────────────────────────────────────

.PHONY: create
create: ## Interactive ebook creator — topic in, all modalities out
	bun run $(SCRIPTS_DIR)/create-ebook.ts

# ─── Scaffold ────────────────────────────────────────────────────────────────

.PHONY: new-ebook
new-ebook: ## Scaffold new ebook — slug=<slug> title="<title>" [subtitle="<subtitle>"]
ifndef slug
	$(error Usage: make new-ebook slug=<slug> title="<title>")
endif
ifndef title
	$(error Usage: make new-ebook slug=<slug> title="<title>")
endif
	$(SCRIPTS_DIR)/new-ebook.sh "$(slug)" "$(title)" "$(subtitle)"

# ─── Content Pipeline ────────────────────────────────────────────────────────

.PHONY: research
research: ## Research topic and generate research.yml — ebook=<slug>
ifndef ebook
	$(error Usage: make research ebook=<slug>)
endif
	bun run $(SCRIPTS_DIR)/research-topic.ts $(ebook)

.PHONY: outline
outline: ## Generate book outline from topic.yml — ebook=<slug>
ifndef ebook
	$(error Usage: make outline ebook=<slug>)
endif
	bun run $(SCRIPTS_DIR)/generate-outline.ts $(ebook)

.PHONY: plan
plan: ## Generate chapter plans with visual recs — ebook=<slug> [chapter=<id>]
ifndef ebook
	$(error Usage: make plan ebook=<slug> [chapter=<id>])
endif
	bun run $(SCRIPTS_DIR)/plan-chapters.ts $(ebook) $(chapter)

.PHONY: transform
transform: ## Generate dense .qmd from plans — ebook=<slug> [chapter=<id>]
ifndef ebook
	$(error Usage: make transform ebook=<slug> [chapter=<id>])
endif
	bun run $(SCRIPTS_DIR)/transform-chapter.ts $(ebook) $(chapter)

.PHONY: pipeline
pipeline: ## Full content pipeline: research → outline → plan → transform — ebook=<slug>
ifndef ebook
	$(error Usage: make pipeline ebook=<slug>)
endif
	@echo "Stage 0: Researching topic..."
	bun run $(SCRIPTS_DIR)/research-topic.ts $(ebook)
	@echo "Stage 1: Generating outline..."
	bun run $(SCRIPTS_DIR)/generate-outline.ts $(ebook)
	@echo "Stage 2: Planning chapters..."
	bun run $(SCRIPTS_DIR)/plan-chapters.ts $(ebook)
	@echo "Stage 3: Transforming chapters..."
	bun run $(SCRIPTS_DIR)/transform-chapter.ts $(ebook)
	@echo ""
	@echo "Pipeline complete. Next: review .qmd files, then run: make audit ebook=$(ebook)"

.PHONY: hub
hub: ## Generate multi-book hub page
	bun run _hub/generate.ts

.PHONY: pipeline-all
pipeline-all: ## Parallel pipeline with configurable concurrency — ebook=<slug> [PARALLEL=2]
ifndef ebook
	$(error Usage: make pipeline-all ebook=<slug> [PARALLEL=2])
endif
	bun run $(SCRIPTS_DIR)/pipeline-runner.ts $(ebook) --parallel=$(or $(PARALLEL),2)

.PHONY: cost-report
cost-report: ## Show cost report — ebook=<slug> or --all
ifdef ebook
	bun run $(SCRIPTS_DIR)/cost-report.ts $(ebook)
else
	bun run $(SCRIPTS_DIR)/cost-report.ts --all
endif

# ─── Blog Posts ────────────────────────────────────────────────────────────

.PHONY: blog
blog: ## Generate blog posts — ebook=<slug>
ifndef ebook
	$(error Usage: make blog ebook=<slug>)
endif
	bun run _blog/generate.ts $(ebook)

.PHONY: blog-all
blog-all: ## Generate blog posts for all ebooks
	bun run _blog/generate.ts

# ─── Content Freshness ─────────────────────────────────────────────────────

.PHONY: freshness
freshness: ## Check pricing freshness — ebook=<slug>
ifndef ebook
	$(error Usage: make freshness ebook=<slug>)
endif
	bun run $(SCRIPTS_DIR)/freshness-check.ts $(ebook)

.PHONY: freshness-all
freshness-all: ## Check pricing freshness for all ebooks
	bun run $(SCRIPTS_DIR)/freshness-check.ts --all

# ─── Unified Eval & Self-Healing ──────────────────────────────────────────

.PHONY: eval-all
eval-all: ## Unified eval across all modalities (dry-run) — ebook=<slug>
ifndef ebook
	$(error Usage: make eval-all ebook=<slug>)
endif
	bun run $(SCRIPTS_DIR)/eval-loop.ts $(ebook) --dry-run

.PHONY: heal
heal: ## Self-healing loop: evaluate → fix → re-evaluate — ebook=<slug> [max-iter=N]
ifndef ebook
	$(error Usage: make heal ebook=<slug> [max-iter=N])
endif
	bun run $(SCRIPTS_DIR)/eval-loop.ts $(ebook) $(if $(max-iter),--max-iter=$(max-iter),)

# ─── Engine Evaluation ──────────────────────────────────────────────────

.PHONY: eval
eval: ## A/B eval: template vs LLM engine — ebook=<slug>
ifndef ebook
	$(error Usage: make eval ebook=<slug>)
endif
	bun run $(SCRIPTS_DIR)/engine-eval.ts $(ebook)

.PHONY: eval-report
eval-report: ## Re-run eval report from existing snapshots — ebook=<slug>
ifndef ebook
	$(error Usage: make eval-report ebook=<slug>)
endif
	bun run $(SCRIPTS_DIR)/engine-eval.ts $(ebook) --report-only

# ─── Publish (all modalities for one ebook) ──────────────────────────────────

.PHONY: publish
publish: ## Generate ALL modalities for one ebook — ebook=<slug>
ifndef ebook
	$(error Usage: make publish ebook=<slug>)
endif
	@echo ""
	@echo "╔══════════════════════════════════════════════════════════════╗"
	@echo "║  Publishing: $(ebook)"
	@echo "╚══════════════════════════════════════════════════════════════╝"
	@echo ""
	@echo "── [1/5] Rendering HTML / PDF / EPUB ──────────────────────────"
	quarto render $(BOOKS_DIR)/$(ebook)
	@echo ""
	@echo "── [2/5] Generating social assets ─────────────────────────────"
	bun run _social/generate.ts $(ebook)
	@echo ""
	@echo "── [3/5] Generating landing page ──────────────────────────────"
	bun run _landing/generate.ts $(ebook)
	@echo ""
	@echo "── [4/5] Generating blog posts ─────────────────────────────────"
	bun run _blog/generate.ts $(ebook)
	@echo ""
	@echo "── [5/5] Content quality audit ─────────────────────────────────"
	bun run $(SCRIPTS_DIR)/content-audit.ts $(ebook)
	@echo ""
	@echo "╔══════════════════════════════════════════════════════════════╗"
	@echo "║  Done!  All modalities generated for: $(ebook)"
	@echo "║"
	@echo "║  HTML   →  _output/books/$(ebook)/"
	@echo "║  Landing→  _output/landing/$(ebook)/"
	@echo "║  Social →  _output/social/$(ebook)/"
	@echo "║  Blog   →  _output/blog/$(ebook)/"
	@echo "║"
	@echo "║  Run 'make eval-all ebook=$(ebook)' to check quality"
	@echo "╚══════════════════════════════════════════════════════════════╝"

# ─── Full Pipeline ───────────────────────────────────────────────────────────

.PHONY: all
all: validate render-all landing-all ## Full pipeline: validate → render → landing → social (use PARALLEL=n)
	@echo ""
	@echo "Generating social assets for all ebooks..."
	bun run _social/generate.ts
	@echo ""
	@echo "Full pipeline complete."

# Alias for parallel build
.PHONY: build
build: ## Alias for 'all' — PARALLEL=n for parallel rendering
	$(MAKE) all PARALLEL=$(PARALLEL)

# ─── Clean ───────────────────────────────────────────────────────────────────

.PHONY: clean
clean: ## Remove all _output/
	rm -rf $(OUTPUT_DIR)
	@echo "Cleaned $(OUTPUT_DIR)/"

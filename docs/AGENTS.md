# Agent Guide: Zopdev Ebook Engine

This guide helps AI agents (Claude Code, Copilot, etc.) work effectively on the ebook generation pipeline. It covers the architecture, common tasks, and pitfalls.

## Quick Start

```bash
# Install dependencies
bun install

# Set up .env (copy from .env.example, add API keys)
cp .env.example .env

# Full pipeline for an existing ebook
make pipeline ebook=k8s-cost-guide

# A/B eval to validate engine quality
make eval ebook=terraform-cloud-costs
```

## Architecture Overview

### Pipeline Stages

```
Stage 0: research-topic.ts    Topic + Search → research.yml
Stage 1: generate-outline.ts  Topic + Research → outline.yml
Stage 2: plan-chapters.ts     Outline + Research → *.plan.yml (per chapter)
Stage 3: transform-chapter.ts Plans + Research → .qmd files (final content)
```

Each stage reads from the previous stage's output. All stages fall back to mock/template mode when no LLM provider is configured.

### Provider System

LLM providers are resolved in order: `topic.yml pipeline section` → `env vars` → `mock fallback`.

```bash
# Env vars for LLM
OPENAI_API_KEY=...          # Required for OpenAI-compatible providers
LLM_PROVIDER=openai-compatible  # or: anthropic, google
LLM_MODEL=MiniMax-M2        # Model name
LLM_BASE_URL=https://...    # For non-OpenAI endpoints

# Env vars for search
TAVILY_API_KEY=...           # Primary search provider

# Mode override
PIPELINE_MODE=mock           # Skip all API calls, use templates
```

### Key Files

| File | Purpose |
|------|---------|
| `scripts/transform-chapter.ts` | Core generation engine (Stage 3). CONFIG_TEMPLATES, cleanVagueClaims(), truncation handling |
| `scripts/prompt-templates.ts` | All LLM prompts. buildFactSheet() for structured data grounding |
| `scripts/engine-eval.ts` | A/B eval tool (11 metrics). countGenericClaims(), detectPlaceholders() |
| `scripts/providers/llm.ts` | Base LLM interface. extractJSON() with reasoning block stripping |
| `scripts/pipeline-types.ts` | Shared types: ContentSeed, ChapterPlan, ResearchData, etc. |
| `scripts/provider-config.ts` | Provider resolution + cost tracking |

### Data Flow

```
topic.yml + context.yml
    ↓
research.yml (industry data, patterns, configs, tools)
    ↓
outline.yml (chapters with prerequisites, difficulty progression)
    ↓
{chapter}.plan.yml (sections, word targets, visual recommendations, content_seeds)
    ↓
{chapter}.qmd (assembled markdown: heading + LLM prose + config blocks + D2 + OJS)
```

**Critical:** The LLM in Stage 3 only sees `content_seeds` from the plan file (4-6 claims, 4-6 patterns), NOT the full research.yml. This is by design.

## Common Agent Tasks

### Adding a New Ebook

```bash
# 1. Scaffold
./scripts/new-ebook.sh my-ebook "My Ebook Title" "Subtitle"

# 2. Create topic.yml and context.yml (see books/terraform-cloud-costs/ for example)

# 3. Run full pipeline
make pipeline ebook=my-ebook

# 4. Validate quality
make eval ebook=my-ebook
```

### Fixing an Engine Bug

**Always follow the engine-first pattern:**

1. Identify the metric that's failing: `make eval-report ebook=terraform-cloud-costs`
2. Find the root cause in the engine code (not in the generated output)
3. Fix the engine
4. Re-generate: `make transform ebook=terraform-cloud-costs`
5. Re-eval: `make eval ebook=terraform-cloud-costs`
6. Verify the target metric improved AND no regressions

**Never:**
- Manually edit .qmd files to fix quality issues
- Re-run the pipeline repeatedly hoping for better output
- Tune prompts by reading individual chapters

### Adding a New Config Template

In `scripts/transform-chapter.ts`:

1. Add the YAML template to `CONFIG_TEMPLATES`:
```typescript
CONFIG_TEMPLATES["MyResource"] = `# MyResource: description
apiVersion: ...
kind: MyResource
...`;
```

2. Add keywords to `keywordMap`:
```typescript
keywordMap["MyResource"] = ["myresource", "keyword1", "keyword2"];
```

3. Verify: `make eval ebook=terraform-cloud-costs` — Placeholders metric should not regress.

### Adding a New Generic Claim Pattern

In `scripts/engine-eval.ts`:

1. Add to `GENERIC_PATTERNS` array
2. Consider: does this need a whitelist entry? (attribution, technical context, named subject)
3. Run eval to check impact: `make eval-report ebook=terraform-cloud-costs`

### Modifying LLM Prompts

In `scripts/prompt-templates.ts`:

1. **System prompt:** Rules that apply to ALL sections (tone, banned phrases, format rules)
2. **User prompt:** Section-specific context (fact sheet, guidance, continuity)
3. **Fact sheet:** Structured data block — modify `buildFactSheet()` to change what data the LLM sees

**After prompt changes:** Always re-generate AND eval. Prompt changes can have unexpected cascading effects.

## Content Seeds Gotcha

Plan files can have `key_claims` and `patterns` as either typed objects OR plain strings:

```yaml
# Object form (from structured LLM output)
key_claims:
  - claim: "18,500 resources costs ~$1,800/month"
    source: "HashiCorp pricing"

# String form (from simplified LLM output)
key_claims:
  - "18,500 resources costs ~$1,800/month"
```

All code that reads seeds must handle both shapes with `typeof c === "string" ? c : c.claim`.

Similarly, `patterns` can be `ResearchPattern[]` objects or plain strings, and sometimes even objects (not arrays). Always use `Array.isArray()` guards.

## Post-Generation Pipeline

After LLM generates prose, several cleanup steps run before assembly:

```
LLM output
  → Strip <think>...</think> blocks (reasoning models)
  → Strip stray horizontal rules and orphaned markers
  → Normalize whitespace
  → cleanVagueClaims() — remove fabricated vague claims
  → Assemble: heading + prose + visual elements (D2, OJS, code, tables)
```

The insertion point for new post-processing is after `cleanVagueClaims()` and before assembly in `renderSectionWithLLM()`.

## Eval Metrics Reference

| Metric | Good | Bad | How to fix |
|--------|------|-----|------------|
| Placeholders | 0 | >0 | Add to CONFIG_TEMPLATES or fix generic fallback |
| Truncations | 0 | >0 | Increase maxTokens multiplier or improve continuation logic |
| Duplicates | 0 | >0 | Broaden prose-has-content detection in visual embedding |
| Generic Claims | ≤ template | > template | Improve fact sheet, add cleanVagueClaims patterns, or refine eval whitelists |
| Word Targets | all hit | misses | Adjust word_target in plan or token budget |
| Reading Grade | 8-14 | >14 | Prompt for simpler sentence structure |

## Environment Setup

```bash
# Required
bun >= 1.0

# For full pipeline
OPENAI_API_KEY or ANTHROPIC_API_KEY or GOOGLE_API_KEY
TAVILY_API_KEY (for research stage)

# For rendering
quarto >= 1.4
d2 (for diagram rendering)

# For PDF
texlive with xelatex
Inter font family

# Optional
jupyter + pyyaml (for OJS calculators)
```

## Troubleshooting

### "Failed to extract valid JSON from LLM response"
The LLM returned non-JSON content. Common with reasoning models (DeepSeek, MiniMax) that emit `<think>` blocks. The `extractJSON()` function in `llm.ts` strips these automatically. If a new model adds a different prefix, update the regex there.

### "TypeError: {} is not iterable" in cleanVagueClaims
The `seeds.patterns` field is an object instead of an array. Always use `Array.isArray()` before iterating seeds fields.

### Pipeline falls back to mock mode
No API keys detected. Check `.env` file exists and `source .env` before running, or set `PIPELINE_MODE=full` explicitly.

### Eval shows 0 for all template metrics
The template snapshot is stale or missing. Run full eval (without `--report-only`) to regenerate both snapshots.

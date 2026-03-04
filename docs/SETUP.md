# Development Setup

Prerequisites and installation steps for the Zopdev Ebook Engine.

## Required Tools

### Bun (TypeScript runtime)

```bash
curl -fsSL https://bun.sh/install | bash
```

Verify: `bun --version`

### Quarto (Document rendering)

Download from [quarto.org](https://quarto.org/docs/get-started/) or install via Homebrew:

```bash
brew install --cask quarto
```

Verify: `quarto --version`

### D2 (Diagram rendering)

D2 is used for professional infrastructure and workflow diagrams in ebooks.

**macOS (Homebrew):**

```bash
brew install d2
```

**Linux (curl):**

```bash
curl -fsSL https://d2lang.com/install.sh | sh -s --
```

Verify: `d2 --version` (requires v0.6+)

### Quarto D2 Extension

After installing D2, add the Quarto extension to enable `{d2}` code blocks in `.qmd` files:

```bash
cd books/<ebook-slug>
quarto install extension data-intuitive/quarto-d2
```

This installs the extension into `_extensions/data-intuitive/quarto-d2/` inside the book directory. The extension is already listed in each book's `_quarto.yml` under `filters:`.

### XeLaTeX (PDF rendering)

Required for PDF output. Install a TeX distribution:

**macOS:**

```bash
brew install --cask mactex-no-gui
# or minimal:
quarto install tinytex
```

**Linux:**

```bash
quarto install tinytex
```

## Post-Install

```bash
# Install Bun dependencies
bun install

# Symlink brand files into all ebooks
ebook setup           # or: make setup

# Validate configs
ebook validate        # or: make validate

# List available ebooks
ebook list            # or: make list
```

## CLI Setup (Optional)

To use the `ebook` command globally:

```bash
bun link
ebook --help
```

Alternatively, run via bun directly:

```bash
bun run scripts/cli.ts --help
```

See [CLI_REFERENCE.md](CLI_REFERENCE.md) for full command documentation.

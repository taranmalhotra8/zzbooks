#!/usr/bin/env bash
# Scaffolds a new ebook from templates.
# Usage: ./scripts/new-ebook.sh <slug> <title> [subtitle]
# Example: ./scripts/new-ebook.sh finops-playbook "The FinOps Playbook" "Cloud Financial Management Guide"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ $# -lt 2 ]; then
  echo "Usage: $0 <slug> <title> [subtitle]"
  echo "Example: $0 my-ebook \"My Ebook Title\" \"Optional Subtitle\""
  exit 1
fi

SLUG="$1"
TITLE="$2"
SUBTITLE="${3:-}"
BOOK_DIR="$ROOT_DIR/books/$SLUG"

if [ -d "$BOOK_DIR" ]; then
  echo "Error: Book directory already exists: $BOOK_DIR"
  exit 1
fi

echo "Scaffolding new ebook: $SLUG"

# Create directory structure
mkdir -p "$BOOK_DIR/chapters"
mkdir -p "$BOOK_DIR/images"
mkdir -p "$BOOK_DIR/diagrams"

# Generate _quarto.yml from template
sed -e "s/{{slug}}/$SLUG/g" \
    -e "s/{{title}}/$TITLE/g" \
    -e "s/{{subtitle}}/$SUBTITLE/g" \
    "$ROOT_DIR/_templates/_quarto-base.yml" > "$BOOK_DIR/_quarto.yml"

# Generate ebook.yml from template
sed -e "s/{{slug}}/$SLUG/g" \
    -e "s/{{title}}/$TITLE/g" \
    -e "s/{{subtitle}}/$SUBTITLE/g" \
    "$ROOT_DIR/_templates/ebook.yml" > "$BOOK_DIR/ebook.yml"

# Generate index.qmd (home page — unnumbered, chapters start at 1)
# NOTE: Do NOT use 'title:' in YAML for index.qmd. Quarto always counts
# YAML-titled entries in the sidebar numbering. Using a body-level H1 with
# {.unnumbered} keeps it out of the chapter count.
{
  echo "---"
  echo "subtitle: \"$SUBTITLE\""
  echo "---"
  echo ""
  echo "# $TITLE {.unnumbered}"
  echo ""
  sed "s/{{topic}}/$TITLE/g" "$ROOT_DIR/_templates/preface.qmd"
} > "$BOOK_DIR/index.qmd"

# Generate first chapter from template
sed -e "s/{{title}}/Introduction/g" \
    "$ROOT_DIR/_templates/chapter.qmd" > "$BOOK_DIR/chapters/01-intro.qmd"

# Create empty references.bib
touch "$BOOK_DIR/references.bib"

# Generate brand-overrides.yml from template
sed -e "s/{{title}}/$TITLE/g" \
    "$ROOT_DIR/_templates/brand-overrides.yml" > "$BOOK_DIR/brand-overrides.yml"

# Copy Quarto extensions (e.g., D2 filter) from the first existing ebook
EXTENSIONS_SRC=""
for existing in "$ROOT_DIR/books"/*/_extensions; do
  if [ -d "$existing" ]; then
    EXTENSIONS_SRC="$existing"
    break
  fi
done
if [ -n "$EXTENSIONS_SRC" ]; then
  cp -r "$EXTENSIONS_SRC" "$BOOK_DIR/_extensions"
fi

# Setup brand symlink
"$SCRIPT_DIR/setup-ebook.sh" "$SLUG"

echo ""
echo "New ebook scaffolded at: $BOOK_DIR"
echo ""
echo "Next steps:"
echo "  1. Add an entry to calendar.yml for '$SLUG'"
echo "  2. Edit $BOOK_DIR/_quarto.yml to add chapters"
echo "  3. Customize $BOOK_DIR/brand-overrides.yml for this ebook"
echo "  4. Write your content in $BOOK_DIR/chapters/"
echo "  5. Run: make render ebook=$SLUG"

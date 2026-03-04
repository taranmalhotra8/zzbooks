#!/usr/bin/env bash
# Symlinks shared _brand.yml into an ebook directory.
# Usage: ./scripts/setup-ebook.sh <slug>
# Example: ./scripts/setup-ebook.sh finops-playbook

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <slug>"
  echo "Example: $0 finops-playbook"
  exit 1
fi

SLUG="$1"
BOOK_DIR="$ROOT_DIR/books/$SLUG"

if [ ! -d "$BOOK_DIR" ]; then
  echo "Error: Book directory not found: $BOOK_DIR"
  exit 1
fi

BRAND_SOURCE="$ROOT_DIR/_brand/_brand.yml"
BRAND_LINK="$BOOK_DIR/_brand.yml"

if [ ! -f "$BRAND_SOURCE" ]; then
  echo "Error: Brand file not found: $BRAND_SOURCE"
  exit 1
fi

# Create relative symlink
if [ -L "$BRAND_LINK" ]; then
  echo "Symlink already exists: $BRAND_LINK"
elif [ -f "$BRAND_LINK" ]; then
  echo "Warning: $BRAND_LINK exists as a regular file, skipping"
else
  ln -s "../../_brand/_brand.yml" "$BRAND_LINK"
  echo "Created symlink: $BRAND_LINK -> ../../_brand/_brand.yml"
fi

echo "Setup complete for $SLUG"

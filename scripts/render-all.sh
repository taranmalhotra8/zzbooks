#!/usr/bin/env bash
# Renders all non-archived ebooks listed in calendar.yml.
# Usage: ./scripts/render-all.sh [format] [-j jobs]
# format: html, pdf, epub, or empty for all formats
# -j jobs: number of parallel jobs (default: number of CPU cores)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CALENDAR="$ROOT_DIR/calendar.yml"

if [ ! -f "$CALENDAR" ]; then
  echo "Error: calendar.yml not found at $CALENDAR"
  exit 1
fi

# Parse arguments
FORMAT=""
PARALLEL_JOBS=1

while [ $# -gt 0 ]; do
  case "$1" in
    -j)
      PARALLEL_JOBS="$2"
      shift 2
      ;;
    -j*)
      PARALLEL_JOBS="${1#-j}"
      shift
      ;;
    *)
      FORMAT="$1"
      shift
      ;;
  esac
done

# Parse ebook slugs from calendar.yml, skipping archived ones
# Uses a simple grep/awk approach to avoid requiring yq
SLUGS=()
CURRENT_SLUG=""
CURRENT_STATUS=""

while IFS= read -r line; do
  # Match slug lines
  if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*slug:[[:space:]]*(.+) ]]; then
    CURRENT_SLUG="${BASH_REMATCH[1]}"
    CURRENT_SLUG="${CURRENT_SLUG%\"}"
    CURRENT_SLUG="${CURRENT_SLUG#\"}"
    CURRENT_SLUG="$(echo "$CURRENT_SLUG" | xargs)"  # trim whitespace
    CURRENT_STATUS=""
  fi
  # Match status lines
  if [[ "$line" =~ ^[[:space:]]*status:[[:space:]]*(.+) ]]; then
    CURRENT_STATUS="${BASH_REMATCH[1]}"
    CURRENT_STATUS="${CURRENT_STATUS%\"}"
    CURRENT_STATUS="${CURRENT_STATUS#\"}"
    CURRENT_STATUS="$(echo "$CURRENT_STATUS" | xargs)"  # trim whitespace
    # If we have both slug and status, decide whether to include
    if [ -n "$CURRENT_SLUG" ] && [ "$CURRENT_STATUS" != "archived" ]; then
      SLUGS+=("$CURRENT_SLUG")
    fi
    CURRENT_SLUG=""
    CURRENT_STATUS=""
  fi
done < "$CALENDAR"

if [ ${#SLUGS[@]} -eq 0 ]; then
  echo "No non-archived ebooks found in calendar.yml"
  exit 0
fi

echo "Rendering ${#SLUGS[@]} ebook(s) with $PARALLEL_JOBS job(s)..."
echo ""

# Function to render a single ebook
render_one() {
  local SLUG="$1"
  local FORMAT="$2"
  local ROOT_DIR="$3"

  local BOOK_DIR="$ROOT_DIR/books/$SLUG"
  local OUTPUT_DIR="$ROOT_DIR/_output/$SLUG"

  if [ ! -d "$BOOK_DIR" ]; then
    echo "Warning: Book directory not found for '$SLUG', skipping"
    return 1
  fi

  local FMT_ARG=""
  if [ -n "$FORMAT" ]; then
    FMT_ARG="--to $FORMAT"
  fi

  # Create output directory
  mkdir -p "$OUTPUT_DIR"

  # Run quarto render
  if quarto render "$BOOK_DIR" $FMT_ARG 2>&1; then
    echo "SUCCESS: $SLUG"
    return 0
  else
    echo "FAILED: $SLUG"
    return 1
  fi
}

export -f render_one
export ROOT_DIR FORMAT

FAILED=0
PASSED=0
PIDS=()

if [ "$PARALLEL_JOBS" -eq 1 ]; then
  # Sequential mode (original behavior)
  for SLUG in "${SLUGS[@]}"; do
    echo "--- Rendering: $SLUG ---"
    if render_one "$SLUG" "$FORMAT" "$ROOT_DIR"; then
      PASSED=$((PASSED + 1))
    else
      FAILED=$((FAILED + 1))
    fi
    echo ""
  done
else
  # Parallel mode
  for SLUG in "${SLUGS[@]}"; do
    render_one "$SLUG" "$FORMAT" "$ROOT_DIR" &
    PIDS+=($!)
  done

  # Wait for all jobs with progress
  while [ ${#PIDS[@]} -gt 0 ]; do
    NEW_PIDS=()
    for PID in "${PIDS[@]}"; do
      if kill -0 "$PID" 2>/dev/null; then
        NEW_PIDS+=("$PID")
      else
        wait "$PID" && PASSED=$((PASSED + 1)) || FAILED=$((FAILED + 1))
      fi
    done
    PIDS=("${NEW_PIDS[@]}")
    sleep 1
  done
fi

echo ""
if [ $FAILED -gt 0 ]; then
  echo "Completed: $PASSED succeeded, $FAILED failed"
  exit 1
else
  echo "All ${#SLUGS[@]} ebooks rendered successfully"
fi

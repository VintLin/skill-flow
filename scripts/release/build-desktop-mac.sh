#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCH="${1:-universal}"
OUTPUT_DIR="${2:-$ROOT_DIR/dist/desktop-mac}"

"$ROOT_DIR/scripts/release/package-desktop-mac.sh" \
  --arch "$ARCH" \
  --output "$OUTPUT_DIR"

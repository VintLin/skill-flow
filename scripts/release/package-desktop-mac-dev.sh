#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="${1:-$ROOT_DIR/dist/desktop-mac}"
HOST_ARCH="$(uname -m)"

"$ROOT_DIR/scripts/release/package-desktop-mac.sh" \
  --arch "$HOST_ARCH" \
  --output "$OUTPUT_DIR" \
  --dev

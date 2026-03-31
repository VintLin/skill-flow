#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCH="${1:-universal}"
OUTPUT_DIR="${2:-$ROOT_DIR/dist/desktop-mac}"

case "$ARCH" in
  arm64|x86_64|universal)
    "$ROOT_DIR/scripts/release/package-desktop-mac.sh" \
      --arch "$ARCH" \
      --output "$OUTPUT_DIR"
    ;;
  all)
    npm --prefix "$ROOT_DIR" run build
    for target_arch in arm64 x86_64 universal; do
      "$ROOT_DIR/scripts/release/package-desktop-mac.sh" \
        --arch "$target_arch" \
        --output "$OUTPUT_DIR" \
        --skip-js-build
    done
    ;;
  *)
    echo "Unsupported arch: $ARCH" >&2
    echo "Usage: $0 [arm64|x86_64|universal|all] [output_dir]" >&2
    exit 1
    ;;
esac

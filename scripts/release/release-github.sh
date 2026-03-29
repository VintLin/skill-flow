#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCH="${1:-universal}"
OUTPUT_DIR="${2:-$ROOT_DIR/dist/desktop-mac}"
APP_BUNDLE="$OUTPUT_DIR/$ARCH/Skill Flow.app"

if [[ "$ARCH" != "universal" ]]; then
  echo "release-github.sh currently supports only the universal release flow." >&2
  echo "Usage: $0 [universal] [output_dir]" >&2
  exit 1
fi

"$ROOT_DIR/scripts/release/build-desktop-mac.sh" "$ARCH" "$OUTPUT_DIR"
"$ROOT_DIR/scripts/release/validate-mac-artifacts.sh" "$APP_BUNDLE" "arm64,x86_64"
"$ROOT_DIR/scripts/release/package-desktop-mac-zip.sh" "$ARCH" "$OUTPUT_DIR"
"$ROOT_DIR/scripts/release/generate-sha256.sh" "$ARCH" "$OUTPUT_DIR"

echo "GitHub release artifacts ready in: $OUTPUT_DIR/$ARCH"
echo "Upload:"
echo "  $OUTPUT_DIR/$ARCH/Skill-Flow-$ARCH.dmg"
echo "  $OUTPUT_DIR/$ARCH/Skill-Flow-$ARCH.zip"
echo "  $OUTPUT_DIR/$ARCH/sha256.txt"

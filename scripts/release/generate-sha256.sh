#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCH="${1:-universal}"
OUTPUT_DIR="${2:-$ROOT_DIR/dist/desktop-mac}"
ARCH_DIR="$OUTPUT_DIR/$ARCH"
DMG_PATH="$ARCH_DIR/Skill-Flow-$ARCH.dmg"
ZIP_PATH="$ARCH_DIR/Skill-Flow-$ARCH.zip"
SHA_PATH="$ARCH_DIR/sha256.txt"

if [[ ! -f "$DMG_PATH" ]]; then
  echo "DMG not found: $DMG_PATH" >&2
  exit 1
fi

if [[ ! -f "$ZIP_PATH" ]]; then
  echo "ZIP not found: $ZIP_PATH" >&2
  echo "Create it first with scripts/release/package-desktop-mac-zip.sh $ARCH" >&2
  exit 1
fi

(
  cd "$ARCH_DIR"
  shasum -a 256 "$(basename "$DMG_PATH")" "$(basename "$ZIP_PATH")" > "$SHA_PATH"
)

echo "SHA256: $SHA_PATH"

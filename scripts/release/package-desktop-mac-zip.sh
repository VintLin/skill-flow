#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCH="${1:-universal}"
OUTPUT_DIR="${2:-$ROOT_DIR/dist/desktop-mac}"
APP_BUNDLE="$OUTPUT_DIR/$ARCH/Skill Flow.app"
ZIP_PATH="$OUTPUT_DIR/$ARCH/Skill-Flow-$ARCH.zip"

if [[ ! -d "$APP_BUNDLE" ]]; then
  echo "App bundle not found: $APP_BUNDLE" >&2
  echo "Build it first with scripts/release/package-desktop-mac.sh --arch $ARCH" >&2
  exit 1
fi

rm -f "$ZIP_PATH"
ditto -c -k --sequesterRsrc --keepParent "$APP_BUNDLE" "$ZIP_PATH"

echo "ZIP: $ZIP_PATH"

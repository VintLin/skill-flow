#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCH="${1:-all}"
OUTPUT_DIR="${2:-$ROOT_DIR/dist/desktop-mac}"

validate_arch() {
  local target_arch="$1"
  local expected_archs="$2"
  "$ROOT_DIR/scripts/release/validate-mac-artifacts.sh" \
    "$OUTPUT_DIR/$target_arch/Skill Flow.app" \
    "$expected_archs"
}

"$ROOT_DIR/scripts/release/build-desktop-mac.sh" "$ARCH" "$OUTPUT_DIR"
"$ROOT_DIR/scripts/release/package-desktop-mac-zip.sh" "$ARCH" "$OUTPUT_DIR"
"$ROOT_DIR/scripts/release/generate-sha256.sh" "$ARCH" "$OUTPUT_DIR"

case "$ARCH" in
  arm64)
    validate_arch arm64 arm64
    ;;
  x86_64)
    validate_arch x86_64 x86_64
    ;;
  universal)
    validate_arch universal "arm64,x86_64"
    ;;
  all)
    validate_arch arm64 arm64
    validate_arch x86_64 x86_64
    validate_arch universal "arm64,x86_64"
    ;;
  *)
    echo "Unsupported arch: $ARCH" >&2
    echo "Usage: $0 [arm64|x86_64|universal|all] [output_dir]" >&2
    exit 1
    ;;
esac

if [[ "$ARCH" == "all" ]]; then
  echo "GitHub release artifacts ready in: $OUTPUT_DIR"
  echo "Upload:"
  for target_arch in arm64 x86_64 universal; do
    echo "  $OUTPUT_DIR/$target_arch/Skill-Flow-$target_arch.dmg"
    echo "  $OUTPUT_DIR/$target_arch/Skill-Flow-$target_arch.zip"
  done
  echo "  $OUTPUT_DIR/sha256.txt"
else
  echo "GitHub release artifacts ready in: $OUTPUT_DIR/$ARCH"
  echo "Upload:"
  echo "  $OUTPUT_DIR/$ARCH/Skill-Flow-$ARCH.dmg"
  echo "  $OUTPUT_DIR/$ARCH/Skill-Flow-$ARCH.zip"
  echo "  $OUTPUT_DIR/$ARCH/sha256.txt"
fi

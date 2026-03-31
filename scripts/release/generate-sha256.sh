#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCH="${1:-universal}"
OUTPUT_DIR="${2:-$ROOT_DIR/dist/desktop-mac}"

generate_sha() {
  local target_arch="$1"
  local arch_dir="$OUTPUT_DIR/$target_arch"
  local dmg_path="$arch_dir/Skill-Flow-$target_arch.dmg"
  local zip_path="$arch_dir/Skill-Flow-$target_arch.zip"
  local sha_path="$arch_dir/sha256.txt"

  if [[ ! -f "$dmg_path" ]]; then
    echo "DMG not found: $dmg_path" >&2
    exit 1
  fi

  if [[ ! -f "$zip_path" ]]; then
    echo "ZIP not found: $zip_path" >&2
    echo "Create it first with scripts/release/package-desktop-mac-zip.sh $target_arch" >&2
    exit 1
  fi

  (
    cd "$arch_dir"
    shasum -a 256 "$(basename "$dmg_path")" "$(basename "$zip_path")" > "$(basename "$sha_path")"
  )

  echo "SHA256: $sha_path"
}

generate_combined_sha() {
  local combined_path="$OUTPUT_DIR/sha256.txt"
  local entries=(
    "arm64/Skill-Flow-arm64.dmg"
    "arm64/Skill-Flow-arm64.zip"
    "x86_64/Skill-Flow-x86_64.dmg"
    "x86_64/Skill-Flow-x86_64.zip"
    "universal/Skill-Flow-universal.dmg"
    "universal/Skill-Flow-universal.zip"
  )
  local entry

  : > "$combined_path"
  for entry in "${entries[@]}"; do
    if [[ ! -f "$OUTPUT_DIR/$entry" ]]; then
      echo "Artifact not found: $OUTPUT_DIR/$entry" >&2
      exit 1
    fi

    shasum -a 256 "$OUTPUT_DIR/$entry" | \
      sed "s|  $OUTPUT_DIR/$entry$|  $(basename "$entry")|" >> "$combined_path"
  done

  echo "SHA256: $combined_path"
}

case "$ARCH" in
  arm64|x86_64|universal)
    generate_sha "$ARCH"
    ;;
  all)
    for target_arch in arm64 x86_64 universal; do
      generate_sha "$target_arch"
    done
    generate_combined_sha
    ;;
  *)
    echo "Unsupported arch: $ARCH" >&2
    echo "Usage: $0 [arm64|x86_64|universal|all] [output_dir]" >&2
    exit 1
    ;;
esac

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCH="${1:-universal}"
OUTPUT_DIR="${2:-$ROOT_DIR/dist/desktop-mac}"

package_zip() {
  local target_arch="$1"
  local app_bundle="$OUTPUT_DIR/$target_arch/Skill Flow.app"
  local zip_path="$OUTPUT_DIR/$target_arch/Skill-Flow-$target_arch.zip"

  if [[ ! -d "$app_bundle" ]]; then
    echo "App bundle not found: $app_bundle" >&2
    echo "Build it first with scripts/release/package-desktop-mac.sh --arch $target_arch" >&2
    exit 1
  fi

  rm -f "$zip_path"
  ditto -c -k --sequesterRsrc --keepParent "$app_bundle" "$zip_path"

  echo "ZIP: $zip_path"
}

case "$ARCH" in
  arm64|x86_64|universal)
    package_zip "$ARCH"
    ;;
  all)
    for target_arch in arm64 x86_64 universal; do
      package_zip "$target_arch"
    done
    ;;
  *)
    echo "Unsupported arch: $ARCH" >&2
    echo "Usage: $0 [arm64|x86_64|universal|all] [output_dir]" >&2
    exit 1
    ;;
esac

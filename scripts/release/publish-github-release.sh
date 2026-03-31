#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/dist/desktop-mac"
CLI_PACKAGE_JSON="$ROOT_DIR/apps/cli/package.json"
VERSION="$(node -p "require('$CLI_PACKAGE_JSON').version")"
TAG="v$VERSION"
REPO="${GITHUB_REPOSITORY:-VintLin/skill-flow}"
NOTES_FILE="$ROOT_DIR/releases/RELEASE_$TAG.md"
TARGET_REF="$(git -C "$ROOT_DIR" rev-parse HEAD)"
SKIP_BUILD=0

usage() {
  cat <<'EOF'
Usage: publish-github-release.sh [options]

Options:
  --skip-build     Reuse existing packaged artifacts under dist/desktop-mac
  --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "Missing required file: $1" >&2
    exit 1
  fi
}

if ! command -v gh >/dev/null 2>&1; then
  echo "Missing required command: gh" >&2
  exit 1
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  "$ROOT_DIR/scripts/release/release-github.sh" all "$OUTPUT_DIR"
fi

require_file "$NOTES_FILE"

ASSETS=(
  "$OUTPUT_DIR/arm64/Skill-Flow-arm64.dmg"
  "$OUTPUT_DIR/arm64/Skill-Flow-arm64.zip"
  "$OUTPUT_DIR/x86_64/Skill-Flow-x86_64.dmg"
  "$OUTPUT_DIR/x86_64/Skill-Flow-x86_64.zip"
  "$OUTPUT_DIR/universal/Skill-Flow-universal.dmg"
  "$OUTPUT_DIR/universal/Skill-Flow-universal.zip"
  "$OUTPUT_DIR/sha256.txt"
)

for asset in "${ASSETS[@]}"; do
  require_file "$asset"
done

if gh release view "$TAG" --repo "$REPO" >/dev/null 2>&1; then
  gh release edit "$TAG" \
    --repo "$REPO" \
    --title "$TAG" \
    --notes-file "$NOTES_FILE"
  gh release upload "$TAG" "${ASSETS[@]}" --repo "$REPO" --clobber
else
  gh release create "$TAG" "${ASSETS[@]}" \
    --repo "$REPO" \
    --target "$TARGET_REF" \
    --title "$TAG" \
    --notes-file "$NOTES_FILE"
fi

gh release view "$TAG" --repo "$REPO" --json url

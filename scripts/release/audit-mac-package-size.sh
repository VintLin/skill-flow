#!/usr/bin/env bash
set -euo pipefail

APP_BUNDLE="${1:-}"
DMG_PATH="${2:-}"

if [[ -z "$APP_BUNDLE" || ! -d "$APP_BUNDLE" ]]; then
  echo "Usage: $0 '/path/to/Skill Flow.app' [/path/to/Skill-Flow.dmg]" >&2
  exit 1
fi

size_kib() {
  local target="$1"
  if [[ -e "$target" ]]; then
    du -sk "$target" | awk '{print $1}'
  else
    printf '%s' "0"
  fi
}

print_row() {
  local label="$1"
  local target="$2"
  printf '%-34s %10s KiB  %s\n' "$label" "$(size_kib "$target")" "$target"
}

HELPER_DIR="$APP_BUNDLE/Contents/Resources/helper"
HELPER_NODE_MODULES="$HELPER_DIR/node_modules"
EXECUTABLE="$APP_BUNDLE/Contents/MacOS/SkillFlowDesktop"
NODE_RUNTIME_DIR="$APP_BUNDLE/Contents/Resources/node"

print_row "app bundle" "$APP_BUNDLE"
if [[ -n "$DMG_PATH" ]]; then
  print_row "dmg" "$DMG_PATH"
fi
print_row "helper" "$HELPER_DIR"
print_row "helper node_modules" "$HELPER_NODE_MODULES"
print_row "swift executable" "$EXECUTABLE"
print_row "node runtime" "$NODE_RUNTIME_DIR"

while IFS= read -r -d '' npm_dir; do
  print_row "npm runtime" "$npm_dir"
  candidate_kib="$(
    find "$npm_dir" \( -path '*/docs/*' -o -path '*/man/*' -o -name '*.md' -o -name '*.markdown' -o -name '*.map' \) \
      -type f -print0 2>/dev/null \
      | xargs -0 du -ck 2>/dev/null \
      | awk '/total$/ {print $1}'
  )"
  printf '%-34s %10s KiB  %s\n' "npm prune candidates" "${candidate_kib:-0}" "$npm_dir"
done < <(find "$NODE_RUNTIME_DIR" -path '*/lib/node_modules/npm' -type d -print0 2>/dev/null)

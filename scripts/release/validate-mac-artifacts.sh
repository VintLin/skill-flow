#!/usr/bin/env bash
set -euo pipefail

APP_BUNDLE="${1:-}"
EXPECTED_ARCHS="${2:-}"
if [[ -z "$APP_BUNDLE" ]]; then
  echo "Usage: $0 '/path/to/Skill Flow.app' [arm64|x86_64|arm64,x86_64]" >&2
  exit 1
fi

if [[ ! -d "$APP_BUNDLE" ]]; then
  echo "App bundle not found: $APP_BUNDLE" >&2
  exit 1
fi

INFO_PLIST="$APP_BUNDLE/Contents/Info.plist"
EXECUTABLE="$APP_BUNDLE/Contents/MacOS/SkillFlowDesktop"
HELPER_DIR="$APP_BUNDLE/Contents/Resources/helper"

[[ -f "$INFO_PLIST" ]] || {
  echo "Missing Info.plist: $INFO_PLIST" >&2
  exit 1
}

[[ -x "$EXECUTABLE" ]] || {
  echo "Missing executable: $EXECUTABLE" >&2
  exit 1
}

[[ -d "$HELPER_DIR" ]] || {
  echo "Missing helper directory: $HELPER_DIR" >&2
  exit 1
}

BUNDLE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleName' "$INFO_PLIST")"
DISPLAY_NAME="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleDisplayName' "$INFO_PLIST")"

if [[ "$BUNDLE_NAME" != "Skill Flow" ]]; then
  echo "Unexpected CFBundleName: $BUNDLE_NAME" >&2
  exit 1
fi

if [[ "$DISPLAY_NAME" != "Skill Flow" ]]; then
  echo "Unexpected CFBundleDisplayName: $DISPLAY_NAME" >&2
  exit 1
fi

if [[ -n "$EXPECTED_ARCHS" ]]; then
  ACTUAL_ARCHS="$(lipo -archs "$EXECUTABLE")"
  IFS=',' read -r -a REQUIRED_ARCHS <<< "$EXPECTED_ARCHS"
  for arch in "${REQUIRED_ARCHS[@]}"; do
    if [[ " $ACTUAL_ARCHS " != *" $arch "* ]]; then
      echo "Missing architecture '$arch' in executable: $ACTUAL_ARCHS" >&2
      exit 1
    fi
  done
fi

echo "Artifact validation passed: $APP_BUNDLE"

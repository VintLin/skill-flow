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
NODE_RUNTIME_DIR="$APP_BUNDLE/Contents/Resources/node"

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

DESKTOP_BRIDGE="$HELPER_DIR/dist/desktop-bridge.js"
LEGACY_CLI_HELPER="$HELPER_DIR/dist/cli.js"

[[ -f "$DESKTOP_BRIDGE" ]] || {
  echo "Missing desktop bridge helper: $DESKTOP_BRIDGE" >&2
  exit 1
}

if [[ -f "$LEGACY_CLI_HELPER" ]]; then
  echo "Legacy CLI helper should not be packaged: $LEGACY_CLI_HELPER" >&2
  exit 1
fi

for forbidden_dependency in commander ink react; do
  if [[ -e "$HELPER_DIR/node_modules/$forbidden_dependency" ]]; then
    echo "CLI dependency should not be packaged in helper: $forbidden_dependency" >&2
    exit 1
  fi
done

[[ -d "$NODE_RUNTIME_DIR" ]] || {
  echo "Missing Node runtime directory: $NODE_RUNTIME_DIR" >&2
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
  HAS_ARM64_ARCH=false
  for arch in "${REQUIRED_ARCHS[@]}"; do
    if [[ "$arch" == "arm64" ]]; then
      HAS_ARM64_ARCH=true
    fi

    if [[ " $ACTUAL_ARCHS " != *" $arch "* ]]; then
      echo "Missing architecture '$arch' in executable: $ACTUAL_ARCHS" >&2
      exit 1
    fi

    NODE_BIN_DIR="$NODE_RUNTIME_DIR/$arch/bin"
    NODE_EXECUTABLE="$NODE_BIN_DIR/node"
    NPM_EXECUTABLE="$NODE_BIN_DIR/npm"
    NPX_EXECUTABLE="$NODE_BIN_DIR/npx"

    for tool_path in "$NODE_EXECUTABLE" "$NPM_EXECUTABLE" "$NPX_EXECUTABLE"; do
      if [[ ! -x "$tool_path" ]]; then
        echo "Missing bundled runtime executable for '$arch': $tool_path" >&2
        exit 1
      fi
    done

    NODE_ARCHS="$(lipo -archs "$NODE_EXECUTABLE")"
    if [[ " $NODE_ARCHS " != *" $arch "* ]]; then
      echo "Missing architecture '$arch' in bundled Node runtime: $NODE_ARCHS" >&2
      exit 1
    fi

    "$NODE_EXECUTABLE" --version >/dev/null
    PATH="$NODE_BIN_DIR:$PATH" "$NPM_EXECUTABLE" --version >/dev/null
    PATH="$NODE_BIN_DIR:$PATH" "$NPX_EXECUTABLE" --version >/dev/null

    NPM_ROOT="$NODE_RUNTIME_DIR/$arch/lib/node_modules/npm"
    if [[ -d "$NPM_ROOT/docs" || -d "$NPM_ROOT/man" ]]; then
      echo "Bundled npm should not include docs/man directories: $NPM_ROOT" >&2
      exit 1
    fi

    set +e
    BRIDGE_INVALID_OUTPUT="$(printf '{' | "$NODE_EXECUTABLE" "$DESKTOP_BRIDGE" bridge --json 2>/dev/null)"
    BRIDGE_INVALID_STATUS="$?"
    set -e
    if [[ "$BRIDGE_INVALID_STATUS" -ne 1 ]]; then
      echo "Desktop bridge invalid JSON probe returned unexpected status: $BRIDGE_INVALID_STATUS" >&2
      exit 1
    fi
    printf '%s' "$BRIDGE_INVALID_OUTPUT" | "$NODE_EXECUTABLE" -e '
const fs = require("node:fs");
const response = JSON.parse(fs.readFileSync(0, "utf8"));
if (response.ok !== false || !Array.isArray(response.errors)) {
  process.exit(1);
}
'
  done

  if [[ "$HAS_ARM64_ARCH" == "true" ]]; then
    LS_REQUIRES_NATIVE_EXECUTION="$(/usr/libexec/PlistBuddy -c 'Print :LSRequiresNativeExecution' "$INFO_PLIST" 2>/dev/null || true)"
    if [[ "$LS_REQUIRES_NATIVE_EXECUTION" != "true" ]]; then
      echo "Expected LSRequiresNativeExecution=true for Apple Silicon-capable bundle" >&2
      exit 1
    fi
  fi
fi

echo "Artifact validation passed: $APP_BUNDLE"

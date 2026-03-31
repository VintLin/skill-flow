#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop-mac"
DEFAULT_OUTPUT_DIR="$ROOT_DIR/dist/desktop-mac"
CLI_PACKAGE_JSON="$ROOT_DIR/apps/cli/package.json"
CLI_DIST_DIR="$ROOT_DIR/apps/cli/dist"
APP_DISPLAY_NAME="Skill Flow"
EXECUTABLE_NAME="SkillFlowDesktop"
APP_FILE_NAME="$APP_DISPLAY_NAME.app"
DEFAULT_MIN_MACOS="15.0"

ARCH="universal"
OUTPUT_DIR="$DEFAULT_OUTPUT_DIR"
BUILD_MODE="release"
BUILD_VERSION=""
DEV_SUFFIX=""
VOLNAME="$APP_DISPLAY_NAME"
SKIP_JS_BUILD=0

usage() {
  cat <<'EOF'
Usage: package-desktop-mac.sh [options]

Options:
  --arch <arm64|x86_64|universal>  Build architecture. Default: universal
  --output <dir>                   Output root. Default: dist/desktop-mac
  --skip-js-build                  Reuse existing CLI/package dist output
  --dev                            Mark artifacts as dev packages
  --help                           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --arch)
      ARCH="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --skip-js-build)
      SKIP_JS_BUILD=1
      shift
      ;;
    --dev)
      BUILD_MODE="dev"
      DEV_SUFFIX="-dev"
      VOLNAME="$APP_DISPLAY_NAME Dev"
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

case "$ARCH" in
  arm64|x86_64|universal)
    ;;
  *)
    echo "Unsupported arch: $ARCH" >&2
    exit 1
    ;;
esac

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command npm
require_command swift
require_command xcrun
require_command hdiutil
require_command plutil
require_command lipo
require_command node

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
BUILD_TS="$(date +%Y%m%d%H%M%S)"
CLI_VERSION="${BUILD_VERSION:-$(node -p "require('$CLI_PACKAGE_JSON').version")}"
OUTPUT_ARCH_DIR="$OUTPUT_DIR/$ARCH"
APP_BUNDLE="$OUTPUT_ARCH_DIR/$APP_FILE_NAME"
DMG_PATH="$OUTPUT_ARCH_DIR/Skill-Flow-$ARCH$DEV_SUFFIX.dmg"
HELPER_STAGE="$OUTPUT_ARCH_DIR/helper-stage"
DMG_STAGE="$OUTPUT_ARCH_DIR/dmg-stage"
WORK_DIR="$OUTPUT_ARCH_DIR/work"
BUNDLE_ID_SUFFIX="$ARCH"
if [[ "$BUILD_MODE" == "dev" ]]; then
  BUNDLE_ID="com.skillflow.desktop.dev.$BUNDLE_ID_SUFFIX"
else
  BUNDLE_ID="com.skillflow.desktop.$BUNDLE_ID_SUFFIX"
fi

rm -rf "$APP_BUNDLE" "$DMG_PATH" "$HELPER_STAGE" "$DMG_STAGE" "$WORK_DIR"
mkdir -p "$OUTPUT_ARCH_DIR" "$WORK_DIR"

cd "$ROOT_DIR"
if [[ "$SKIP_JS_BUILD" -eq 0 ]]; then
  npm run build
fi

build_swift_binary() {
  local target_arch="$1"
  local scratch_dir="$DESKTOP_DIR/.build/package-$target_arch"
  local triple="$target_arch-apple-macosx$DEFAULT_MIN_MACOS"
  local binary_path
  local bin_dir

  mkdir -p "$scratch_dir"
  swift build \
    --package-path "$DESKTOP_DIR" \
    --scratch-path "$scratch_dir" \
    --sdk "$SDK_PATH" \
    --triple "$triple" \
    -c release \
    --product "$EXECUTABLE_NAME" >/dev/null

  bin_dir="$(
    swift build \
      --package-path "$DESKTOP_DIR" \
      --scratch-path "$scratch_dir" \
      --sdk "$SDK_PATH" \
      --triple "$triple" \
      -c release \
      --show-bin-path
  )"

  binary_path="$bin_dir/$EXECUTABLE_NAME"
  if [[ ! -x "$binary_path" ]]; then
    echo "Unable to locate built binary for $target_arch at $binary_path" >&2
    exit 1
  fi

  printf '%s\n' "$binary_path"
}

copy_resource_bundles() {
  local build_bin="$1"
  local build_dir

  build_dir="$(cd "$(dirname "$build_bin")" && pwd)"
  find "$build_dir" -maxdepth 1 -type d -name '*.bundle' -exec cp -R {} "$APP_BUNDLE/Contents/Resources/" \;
}

stage_helper() {
  local helper_stage="$1"
  local cli_version commander_version ink_version react_version

  cli_version="$(node -p "require('$ROOT_DIR/apps/cli/package.json').version")"
  commander_version="$(node -p "require('$ROOT_DIR/apps/cli/package.json').dependencies.commander")"
  ink_version="$(node -p "require('$ROOT_DIR/apps/cli/package.json').dependencies.ink")"
  react_version="$(node -p "require('$ROOT_DIR/apps/cli/package.json').dependencies.react")"

  mkdir -p "$helper_stage/dist" "$helper_stage/node_modules/@skill-flow"
  cp "$CLI_DIST_DIR/cli.js" "$helper_stage/dist/cli.js"
  cp "$CLI_DIST_DIR/bridge-command.js" "$helper_stage/dist/bridge-command.js"

  cat > "$helper_stage/package.json" <<EOF
{
  "name": "skill-flow-helper",
  "version": "$cli_version",
  "private": true,
  "type": "module",
  "dependencies": {
    "commander": "$commander_version",
    "ink": "$ink_version",
    "react": "$react_version"
  }
}
EOF

  npm install --omit=dev --prefix "$helper_stage" >/dev/null

  for pkg in core-engine domain integration query shared-types storage tui; do
    mkdir -p "$helper_stage/node_modules/@skill-flow/$pkg"
    cp "$ROOT_DIR/packages/$pkg/package.json" "$helper_stage/node_modules/@skill-flow/$pkg/package.json"
    cp -R "$ROOT_DIR/packages/$pkg/dist" "$helper_stage/node_modules/@skill-flow/$pkg/dist"
  done
}

mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"

if [[ "$ARCH" == "universal" ]]; then
  ARM64_BINARY="$(build_swift_binary arm64)"
  X86_BINARY="$(build_swift_binary x86_64)"
  lipo -create "$ARM64_BINARY" "$X86_BINARY" -output "$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"
  copy_resource_bundles "$ARM64_BINARY"
else
  TARGET_BINARY="$(build_swift_binary "$ARCH")"
  cp "$TARGET_BINARY" "$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"
  copy_resource_bundles "$TARGET_BINARY"
fi

chmod +x "$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME"

if [[ -f "$DESKTOP_DIR/Sources/DesktopApp/Resources/AppIcon.icns" ]]; then
  cp "$DESKTOP_DIR/Sources/DesktopApp/Resources/AppIcon.icns" \
    "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
fi

for resource_dir in AgentIcons MenuBar; do
  if [[ -d "$DESKTOP_DIR/Sources/DesktopApp/Resources/$resource_dir" ]]; then
    mkdir -p "$APP_BUNDLE/Contents/Resources/$resource_dir"
    cp -R "$DESKTOP_DIR/Sources/DesktopApp/Resources/$resource_dir/." \
      "$APP_BUNDLE/Contents/Resources/$resource_dir/"
  fi
done

cat > "$APP_BUNDLE/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>$APP_DISPLAY_NAME</string>
  <key>CFBundleExecutable</key>
  <string>$EXECUTABLE_NAME</string>
  <key>CFBundleIdentifier</key>
  <string>$BUNDLE_ID</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleName</key>
  <string>$APP_DISPLAY_NAME</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$CLI_VERSION</string>
  <key>CFBundleVersion</key>
  <string>$BUILD_TS</string>
  <key>LSMinimumSystemVersion</key>
  <string>$DEFAULT_MIN_MACOS</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

stage_helper "$HELPER_STAGE"
cp -R "$HELPER_STAGE" "$APP_BUNDLE/Contents/Resources/helper"

mkdir -p "$DMG_STAGE"
cp -R "$APP_BUNDLE" "$DMG_STAGE/"
ln -s /Applications "$DMG_STAGE/Applications"

hdiutil create \
  -volname "$VOLNAME" \
  -srcfolder "$DMG_STAGE" \
  -ov \
  -format UDZO \
  "$DMG_PATH" >/dev/null

rm -rf "$HELPER_STAGE" "$DMG_STAGE"

echo "App bundle: $APP_BUNDLE"
echo "DMG: $DMG_PATH"
echo "Bundle ID: $BUNDLE_ID"
echo "Version: $CLI_VERSION ($BUILD_TS)"
echo "Architectures: $(lipo -archs "$APP_BUNDLE/Contents/MacOS/$EXECUTABLE_NAME")"

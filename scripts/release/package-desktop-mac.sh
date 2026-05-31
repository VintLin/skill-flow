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
NODE_RUNTIME_VERSION="22.22.2"
NODE_RUNTIME_BASE_URL="https://nodejs.org/dist/v$NODE_RUNTIME_VERSION"
NODE_RUNTIME_DARWIN_ARM64_SHA256="f8655beb4b86ff6588ed7e02c37f8574b58557bd3e880012814b1a4956fd9d88"
NODE_RUNTIME_DARWIN_X64_SHA256="b6a384bba1a7ec585e5a91a452b63f676b940584ff57b5c9cf0541c8db60023e"

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
require_command curl
require_command shasum
require_command tar

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
BUILD_TS="$(date +%Y%m%d%H%M%S)"
CLI_VERSION="${BUILD_VERSION:-$(node -p "require('$CLI_PACKAGE_JSON').version")}"
OUTPUT_ARCH_DIR="$OUTPUT_DIR/$ARCH"
APP_BUNDLE="$OUTPUT_ARCH_DIR/$APP_FILE_NAME"
DMG_PATH="$OUTPUT_ARCH_DIR/Skill-Flow-$ARCH$DEV_SUFFIX.dmg"
HELPER_STAGE="$OUTPUT_ARCH_DIR/helper-stage"
DMG_STAGE="$OUTPUT_ARCH_DIR/dmg-stage"
WORK_DIR="$OUTPUT_ARCH_DIR/work"
NODE_RUNTIME_CACHE_DIR="$OUTPUT_DIR/node-runtime-cache"
BUNDLE_ID_SUFFIX="$ARCH"
if [[ "$BUILD_MODE" == "dev" ]]; then
  BUNDLE_ID="com.skillflow.desktop.dev.$BUNDLE_ID_SUFFIX"
else
  BUNDLE_ID="com.skillflow.desktop.$BUNDLE_ID_SUFFIX"
fi
NATIVE_EXECUTION_PLIST=""
if [[ "$ARCH" != "x86_64" ]]; then
  NATIVE_EXECUTION_PLIST="  <key>LSRequiresNativeExecution</key>
  <true/>"
fi

rm -rf "$APP_BUNDLE" "$DMG_PATH" "$HELPER_STAGE" "$DMG_STAGE" "$WORK_DIR"
mkdir -p "$OUTPUT_ARCH_DIR" "$WORK_DIR" "$NODE_RUNTIME_CACHE_DIR"

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
  local cli_version

  cli_version="$(node -p "require('$ROOT_DIR/apps/cli/package.json').version")"

  mkdir -p "$helper_stage/dist"
  cp "$CLI_DIST_DIR/desktop-bridge.js" "$helper_stage/dist/desktop-bridge.js"

  cat > "$helper_stage/package.json" <<EOF
{
  "name": "skill-flow-helper",
  "version": "$cli_version",
  "private": true,
  "type": "module"
}
EOF
}

node_dist_platform_for_arch() {
  case "$1" in
    arm64)
      printf '%s\n' "darwin-arm64"
      ;;
    x86_64)
      printf '%s\n' "darwin-x64"
      ;;
    *)
      echo "Unsupported Node runtime arch: $1" >&2
      exit 1
      ;;
  esac
}

node_runtime_sha_for_arch() {
  case "$1" in
    arm64)
      printf '%s\n' "$NODE_RUNTIME_DARWIN_ARM64_SHA256"
      ;;
    x86_64)
      printf '%s\n' "$NODE_RUNTIME_DARWIN_X64_SHA256"
      ;;
    *)
      echo "Unsupported Node runtime arch: $1" >&2
      exit 1
      ;;
  esac
}

prune_bundled_npm() {
  local runtime_dir="$1"
  local npm_root="$runtime_dir/lib/node_modules/npm"

  if [[ ! -d "$npm_root" ]]; then
    echo "Unable to prune npm; missing directory: $npm_root" >&2
    exit 1
  fi

  rm -rf "$npm_root/docs" "$npm_root/man"
  find "$npm_root" \
    \( -name '*.md' -o -name '*.markdown' -o -name '*.map' \) \
    -type f \
    ! -iname 'license*' \
    -delete
}

stage_node_runtime() {
  local target_arch="$1"
  local node_platform archive_name archive_path expected_sha actual_sha extract_dir node_dist_dir dest_dir installed_runtime_dir installed_node_version

  node_platform="$(node_dist_platform_for_arch "$target_arch")"
  archive_name="node-v$NODE_RUNTIME_VERSION-$node_platform.tar.xz"
  archive_path="$NODE_RUNTIME_CACHE_DIR/$archive_name"
  extract_dir="$WORK_DIR/node-runtime-$target_arch"
  node_dist_dir="$extract_dir/node-v$NODE_RUNTIME_VERSION-$node_platform"
  dest_dir="$APP_BUNDLE/Contents/Resources/node/$target_arch"
  expected_sha="$(node_runtime_sha_for_arch "$target_arch")"
  installed_runtime_dir="/Applications/$APP_FILE_NAME/Contents/Resources/node/$target_arch"

  if [[ "$BUILD_MODE" == "dev" && -x "$installed_runtime_dir/bin/node" && -x "$installed_runtime_dir/bin/npm" && -x "$installed_runtime_dir/bin/npx" ]]; then
    installed_node_version="$("$installed_runtime_dir/bin/node" --version)"
    if [[ "$installed_node_version" == "v$NODE_RUNTIME_VERSION" ]]; then
      rm -rf "$dest_dir"
      mkdir -p "$(dirname "$dest_dir")"
      cp -R "$installed_runtime_dir" "$dest_dir"
      prune_bundled_npm "$dest_dir"
      "$dest_dir/bin/node" --version >/dev/null
      PATH="$dest_dir/bin:$PATH" "$dest_dir/bin/npm" --version >/dev/null
      PATH="$dest_dir/bin:$PATH" "$dest_dir/bin/npx" --version >/dev/null
      return
    fi
  fi

  if [[ -f "$archive_path" ]]; then
    actual_sha="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
  else
    actual_sha=""
  fi

  if [[ "$actual_sha" != "$expected_sha" ]]; then
    curl -fL -C - "$NODE_RUNTIME_BASE_URL/$archive_name" -o "$archive_path"
  fi

  actual_sha="$(shasum -a 256 "$archive_path" | awk '{print $1}')"
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    echo "Node runtime checksum mismatch for $archive_name" >&2
    echo "Expected: $expected_sha" >&2
    echo "Actual:   $actual_sha" >&2
    exit 1
  fi

  rm -rf "$extract_dir" "$dest_dir"
  mkdir -p "$extract_dir" "$dest_dir/bin" "$dest_dir/lib/node_modules"
  tar -xf "$archive_path" -C "$extract_dir"
  cp "$node_dist_dir/bin/node" "$dest_dir/bin/node"
  cp -R -P "$node_dist_dir/bin/npm" "$dest_dir/bin/npm"
  cp -R -P "$node_dist_dir/bin/npx" "$dest_dir/bin/npx"
  cp -R "$node_dist_dir/lib/node_modules/npm" "$dest_dir/lib/node_modules/npm"
  chmod +x "$dest_dir/bin/node" "$dest_dir/bin/npm" "$dest_dir/bin/npx"

  if [[ -f "$node_dist_dir/LICENSE" ]]; then
    cp "$node_dist_dir/LICENSE" "$dest_dir/LICENSE"
  fi

  prune_bundled_npm "$dest_dir"
  "$dest_dir/bin/node" --version >/dev/null
  PATH="$dest_dir/bin:$PATH" "$dest_dir/bin/npm" --version >/dev/null
  PATH="$dest_dir/bin:$PATH" "$dest_dir/bin/npx" --version >/dev/null
}

stage_node_runtimes() {
  if [[ "$ARCH" == "universal" ]]; then
    stage_node_runtime arm64
    stage_node_runtime x86_64
  else
    stage_node_runtime "$ARCH"
  fi
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
$NATIVE_EXECUTION_PLIST
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

stage_helper "$HELPER_STAGE"
cp -R "$HELPER_STAGE" "$APP_BUNDLE/Contents/Resources/helper"
stage_node_runtimes

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
echo "Bundled Node.js: v$NODE_RUNTIME_VERSION"
echo "Bundled npm/npx: yes"

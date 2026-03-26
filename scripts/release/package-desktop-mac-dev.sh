#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop-mac"
OUTPUT_DIR="${1:-$ROOT_DIR/dist/desktop-mac}"
APP_NAME="SkillFlowDesktop"
APP_BUNDLE="$OUTPUT_DIR/$APP_NAME.app"
DMG_PATH="$OUTPUT_DIR/$APP_NAME-dev.dmg"
HELPER_STAGE="$OUTPUT_DIR/helper-stage"
DMG_STAGE="$OUTPUT_DIR/dmg-stage"
BUILD_SHA="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || echo "dev")"
BUILD_TS="$(date +%Y%m%d%H%M%S)"
BUNDLE_ID="com.skillflow.desktop.dev.${BUILD_SHA}"

mkdir -p "$OUTPUT_DIR"
rm -rf "$APP_BUNDLE" "$DMG_PATH" "$HELPER_STAGE" "$DMG_STAGE"

cd "$ROOT_DIR"
npm run build

cd "$DESKTOP_DIR"
swift build -c release

APP_BINARY="$(
  find "$DESKTOP_DIR/.build" -type f -name "$APP_NAME" -perm -111 \
    | grep -E "/(release|Release)/" \
    | head -n 1
)"

if [[ -z "$APP_BINARY" ]]; then
  echo "Unable to locate built desktop binary." >&2
  exit 1
fi

mkdir -p "$APP_BUNDLE/Contents/MacOS" "$APP_BUNDLE/Contents/Resources"
cp "$APP_BINARY" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"
chmod +x "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

if [[ -f "$DESKTOP_DIR/Sources/SkillFlowDesktop/Resources/AppIcon.icns" ]]; then
  cp "$DESKTOP_DIR/Sources/SkillFlowDesktop/Resources/AppIcon.icns" \
    "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
fi

if [[ -d "$DESKTOP_DIR/Sources/SkillFlowDesktop/Resources/AgentIcons" ]]; then
  mkdir -p "$APP_BUNDLE/Contents/Resources/AgentIcons"
  cp -R "$DESKTOP_DIR/Sources/SkillFlowDesktop/Resources/AgentIcons/." \
    "$APP_BUNDLE/Contents/Resources/AgentIcons/"
fi

if [[ -d "$DESKTOP_DIR/Sources/SkillFlowDesktop/Resources/MenuBar" ]]; then
  mkdir -p "$APP_BUNDLE/Contents/Resources/MenuBar"
  cp -R "$DESKTOP_DIR/Sources/SkillFlowDesktop/Resources/MenuBar/." \
    "$APP_BUNDLE/Contents/Resources/MenuBar/"
fi

cat > "$APP_BUNDLE/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>SkillFlowDesktop</string>
  <key>CFBundleIdentifier</key>
  <string>__BUNDLE_ID__</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleName</key>
  <string>Skill Flow Desktop</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.1.0</string>
  <key>CFBundleVersion</key>
  <string>__BUILD_TS__</string>
  <key>LSMinimumSystemVersion</key>
  <string>14.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

sed -i '' "s/__BUNDLE_ID__/$BUNDLE_ID/g" "$APP_BUNDLE/Contents/Info.plist"
sed -i '' "s/__BUILD_TS__/$BUILD_TS/g" "$APP_BUNDLE/Contents/Info.plist"

mkdir -p "$HELPER_STAGE/dist" "$HELPER_STAGE/node_modules/@skill-flow"
cp "$ROOT_DIR/apps/cli/dist/cli.js" "$HELPER_STAGE/dist/cli.js"
cp "$ROOT_DIR/apps/cli/dist/bridge-command.js" "$HELPER_STAGE/dist/bridge-command.js"

CLI_VERSION="$(node -p "require('$ROOT_DIR/apps/cli/package.json').version")"
COMMANDER_VERSION="$(node -p "require('$ROOT_DIR/apps/cli/package.json').dependencies.commander")"
INK_VERSION="$(node -p "require('$ROOT_DIR/apps/cli/package.json').dependencies.ink")"
REACT_VERSION="$(node -p "require('$ROOT_DIR/apps/cli/package.json').dependencies.react")"

cat > "$HELPER_STAGE/package.json" <<EOF
{
  "name": "skill-flow-helper",
  "version": "$CLI_VERSION",
  "private": true,
  "type": "module",
  "dependencies": {
    "commander": "$COMMANDER_VERSION",
    "ink": "$INK_VERSION",
    "react": "$REACT_VERSION"
  }
}
EOF

npm install --omit=dev --prefix "$HELPER_STAGE" >/dev/null

for pkg in core tui shared-types; do
  mkdir -p "$HELPER_STAGE/node_modules/@skill-flow/$pkg"
  cp "$ROOT_DIR/packages/$pkg/package.json" "$HELPER_STAGE/node_modules/@skill-flow/$pkg/package.json"
  cp -R "$ROOT_DIR/packages/$pkg/dist" "$HELPER_STAGE/node_modules/@skill-flow/$pkg/dist"
done

cp -R "$HELPER_STAGE" "$APP_BUNDLE/Contents/Resources/helper"

mkdir -p "$DMG_STAGE"
cp -R "$APP_BUNDLE" "$DMG_STAGE/"
ln -s /Applications "$DMG_STAGE/Applications"

hdiutil create \
  -volname "Skill Flow Desktop" \
  -srcfolder "$DMG_STAGE" \
  -ov \
  -format UDZO \
  "$DMG_PATH" >/dev/null

rm -rf "$HELPER_STAGE" "$DMG_STAGE"

echo "App bundle: $APP_BUNDLE"
echo "DMG: $DMG_PATH"
echo "Bundle ID: $BUNDLE_ID"
echo "Build version: $BUILD_TS"
echo "Binary sha256: $(shasum -a 256 "$APP_BUNDLE/Contents/MacOS/$APP_NAME" | awk '{print $1}')"
echo "Note: dev package expects 'node' available in PATH at runtime."

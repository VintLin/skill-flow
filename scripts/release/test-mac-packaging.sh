#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/dist/desktop-mac-test"
HOST_ARCH="$(uname -m)"

rm -rf "$ARTIFACT_DIR"

"$ROOT_DIR/scripts/release/package-desktop-mac.sh" --arch "$HOST_ARCH" --output "$ARTIFACT_DIR"

APP_BUNDLE="$ARTIFACT_DIR/$HOST_ARCH/Skill Flow.app"
DMG_PATH="$ARTIFACT_DIR/$HOST_ARCH/Skill-Flow-$HOST_ARCH.dmg"

[[ -d "$APP_BUNDLE" ]]
[[ -f "$APP_BUNDLE/Contents/Info.plist" ]]
[[ -x "$APP_BUNDLE/Contents/MacOS/SkillFlowDesktop" ]]
[[ -d "$APP_BUNDLE/Contents/Resources/helper" ]]
[[ -f "$DMG_PATH" ]]

"$ROOT_DIR/scripts/release/validate-mac-artifacts.sh" "$APP_BUNDLE" "$HOST_ARCH"

"$ROOT_DIR/scripts/release/package-desktop-mac.sh" --arch universal --output "$ARTIFACT_DIR"
"$ROOT_DIR/scripts/release/validate-mac-artifacts.sh" \
  "$ARTIFACT_DIR/universal/Skill Flow.app" \
  "arm64,x86_64"

"$ROOT_DIR/scripts/release/build-desktop-mac.sh" all "$ARTIFACT_DIR/batch"
for target_arch in arm64 x86_64 universal; do
  [[ -f "$ARTIFACT_DIR/batch/$target_arch/Skill-Flow-$target_arch.dmg" ]]
done

echo "mac packaging test passed"

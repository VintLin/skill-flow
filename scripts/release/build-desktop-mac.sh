#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop-mac"

if [[ -z "${APPLE_DEVELOPER_ID_APPLICATION:-}" ]]; then
  echo "Missing APPLE_DEVELOPER_ID_APPLICATION" >&2
  exit 1
fi

if [[ -z "${APPLE_NOTARY_KEYCHAIN_PROFILE:-}" ]]; then
  echo "Missing APPLE_NOTARY_KEYCHAIN_PROFILE" >&2
  exit 1
fi

cd "$ROOT_DIR"
npm run build

cd "$DESKTOP_DIR"
swift build -c release

echo "Desktop release build completed."

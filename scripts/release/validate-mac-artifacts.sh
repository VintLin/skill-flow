#!/usr/bin/env bash
set -euo pipefail

APP_BUNDLE="${1:-}"
if [[ -z "$APP_BUNDLE" ]]; then
  echo "Usage: $0 /path/to/SkillFlowDesktop.app" >&2
  exit 1
fi

if [[ ! -d "$APP_BUNDLE" ]]; then
  echo "App bundle not found: $APP_BUNDLE" >&2
  exit 1
fi

codesign --verify --deep --strict --verbose=2 "$APP_BUNDLE"
spctl --assess --type execute --verbose "$APP_BUNDLE"

echo "Artifact validation passed: $APP_BUNDLE"

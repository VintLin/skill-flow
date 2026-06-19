# RELEASE v1.4.7

## Summary

- `v1.4.7` is a desktop import stability release for GitHub Skill group imports.
- Compared with `v1.4.6`, import warnings now keep group downloads moving when selected skill selectors drift, while user-facing messages show numeric issue codes instead of internal bridge codes.

## Highlights

### 1. Group imports no longer fail on selector drift

- If selected skill selectors no longer match the downloaded group, Skill Flow imports the downloaded group and reports a warning.
- When all selected selectors are unresolved, the imported group uses the downloaded group as the source of truth and selects all downloaded skills.
- Mixed selector warnings prefer the aggregate warning so users see the clearest issue code.

### 2. Issue-code based desktop import messages

- Desktop import, preview, apply, bridge, and operation failures now route through a shared issue presentation catalog.
- Toasts and import-card failure summaries display numeric issue codes instead of internal strings such as bridge or selector codes.
- English, Simplified Chinese, and Japanese copy is available for catalog-backed toast and detail messages.

### 3. Import failure paths are covered

- Structured bridge failures from real thrown command paths map to catalog issue messages.
- Malformed preview/apply responses and preview failure reasons display actionable issue-code text.
- Import success-with-warning flows use warning copy instead of failure copy.

## User-visible changes

- GitHub Skill group imports are less likely to be blocked by stale skill selector metadata.
- Successful group imports can now show a warning with an issue code when Skill Flow had to fall back to the downloaded group.
- Import errors and warnings no longer expose internal code names in desktop toasts.

## Release Artifacts

- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

## Verification

- `swift test --package-path apps/desktop-mac`
- `npm test`
- `npm run build`
- `scripts/release/release-github.sh all`

# RELEASE v1.4.3

## Summary

- `v1.4.3` fixes macOS import preview and selected-skill import behavior for GitHub skill groups.
- Compared with `v1.4.2`, import previews now use one explicit skill protocol instead of accepting ambiguous legacy fields or guessing selector paths.

## Highlights

### 1. Import preview skills use explicit protocol fields

- Preview skill identity now comes from `providerSkillId`.
- UI selection identity now comes from `uiId`.
- Import selector paths now come from the explicit `selector` object.
- Search and display matching now use `selectorAliases`.

### 2. Single-skill imports keep the backend selector

- Selecting one skill no longer converts the visible skill id into an import selector.
- Root-level GitHub skill repositories can now preview and import using the selector path returned by the query runtime.
- `VintLin/action-browser` now shows its `action-browser` skill in the Group Card instead of an empty skill list.

### 3. Invalid preview payloads fail clearly

- Legacy preview payloads that only provide `id` are rejected.
- Preview payloads without an explicit selector are rejected.
- The import page reports an invalid-preview state instead of silently creating ambiguous import data.

## User-visible changes

- Searching and previewing `VintLin/action-browser` shows the available skill in the Group Card.
- Importing a GitHub group with only one selected skill no longer fails with `IMPORT_SELECTOR_NOT_FOUND` when the backend selector is different from the display id.
- The import page is stricter about malformed preview responses, which makes broken import data easier to diagnose.

## Release Artifacts

- `skill-flow-1.4.3.tgz`
- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

## Verification

- `npm run build`
- `npm test`
- `npm exec -w @skill-flow/query -- vitest run src/tests/import-page-flow.test.ts`
- `swift test --package-path apps/desktop-mac`
- `scripts/release/release-github.sh all`

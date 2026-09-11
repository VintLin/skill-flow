# RELEASE v1.6.8

## Summary

- `v1.6.8` adds complete visibility and navigation for agent-specific Skill files in the macOS desktop detail view.

## Highlights

### 1. Agent-specific document tabs

- Shows `agents/*.yaml` and `agents/*.yml` after the existing `references/*.md` tabs.
- Renders YAML source verbatim as a read-only, syntax-highlighted code block.

### 2. Complete Skill file tree

- Shows `SKILL.md`, `references/*.md`, and `agents/*.yaml|*.yml` under each Skill.
- Keeps unsupported directories and unrelated files hidden.
- Allows selecting a file-tree document to switch directly to its matching tab.

## User-visible changes

- Users can inspect Codex and other client-specific Skill configuration without leaving Skill Flow.
- File-tree navigation and document tabs now expose the same supported Skill content.

## Contributors

- Thanks to [@ren2019](https://github.com/ren2019) for originating and contributing [PR #17](https://github.com/VintLin/skill-flow/pull/17).

## Release Artifacts

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
- `swift test --package-path apps/desktop-mac`
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

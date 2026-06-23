# RELEASE v1.4.9

## Summary

- `v1.4.9` expands built-in agent target coverage and refreshes the default agent ordering.
- Compared with `v1.4.8`, Skill Flow now recognizes Kimi Code, WorkBuddy, and CodeBuddy as first-class targets with bundled desktop icons.

## Highlights

### 1. New built-in agent targets

- Kimi Code deploys to `~/.kimi-code/skills/` and reads compatible skills from `~/.agents/skills/`.
- WorkBuddy deploys to `~/.workbuddy/skills/`.
- CodeBuddy deploys to `~/.codebuddy/skills/`.

### 2. Desktop target presentation is updated

- The macOS app includes bundled Kimi Code and CodeBuddy icons.
- WorkBuddy and CodeBuddy share the CodeBuddy icon.
- The default target order now matches the curated agent order used by CLI, bridge, and desktop surfaces.

### 3. Target handling is more robust

- Built-in target detection can distinguish detection roots from write roots.
- Missing managed target roots are created before deployment writes.
- Import target lists stay limited to visible fallback targets while preserving local source targets.

## User-visible changes

- Kimi Code, WorkBuddy, and CodeBuddy appear as built-in targets without needing custom agent entries.
- Target lists use the new default order:
  Claude Code, Codex, ZCode, Cursor, Pi, WorkBuddy, CodeBuddy, Trae, Trae CN, Kimi Code, OpenCode, MiniMax Code, Hermes Agent, OpenClaw, GitHub Copilot, Gemini CLI, Windsurf, Amp, Kiro, Roo Code, Cline.
- Desktop target icons include the new Kimi Code and CodeBuddy assets.

## Release Artifacts

- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

## Verification

- `npm run -w @skill-flow/domain build && npm run -w @skill-flow/integration build && npm run -w @skill-flow/core-engine build && npm run -w @skill-flow/query build && npm run -w skill-flow build`
- `npm run -w skill-flow test -- src/tests/target-definitions.test.ts src/tests/skill-flow.test.ts`
- `npm run -w @skill-flow/query test -- src/tests/source-lifecycle.test.ts`
- `swift test --package-path apps/desktop-mac --filter 'SettingsViewModelTests|MainViewModelSelectionTests|WorkflowCoverageTests'`
- `scripts/release/publish-github-release.sh`

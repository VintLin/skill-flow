# `skill-flow` Target Paths: Current State Vs Target Matrix Vs Required Changes

## Scope

This document compares:

- the current `skill-flow` target path definitions
- the accepted cross-platform target matrix in `ASSET_2026-04-02_windows-linux-expanded-path-matrix.md`
- the concrete code and test changes that would be required next

This is a design-input document, not an implementation plan.

## Current SSOT In Repository

The current authoritative target registry is:

- `packages/integration/src/utils/constants.ts`

It already carries three different layers of target-path information:

- current runtime write roots: `writeRootCandidates`
- compatibility read roots: `compatReadRootCandidates`
- future-facing documented paths:
  - `documentedProjectPath`
  - `documentedGlobalPath`

Important consequence:

- `skill-flow` is already structurally close to the desired target-matrix shape.
- The main remaining gap is not "missing target metadata".
- The main remaining gaps are:
  - no explicit platform-expansion layer for turning documented paths into Windows/Linux concrete outputs
  - incomplete compatibility fallback coverage for OpenClaw legacy paths
  - path duplication outside the target registry, especially in desktop display code
  - tests do not yet lock Windows and Linux fixture paths explicitly

## Current Vs Target Matrix

| Target | Current project path in code | Current global path in code | Current runtime write root | Target Windows global path | Target Linux global path | Status | Required change |
|--------|------------------------------|-----------------------------|----------------------------|----------------------------|--------------------------|--------|-----------------|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` | `os.homedir()/.claude/skills` | `%USERPROFILE%\\.claude\\skills\\` | `$HOME/.claude/skills/` | Aligned | No target-definition change required |
| Codex | `.agents/skills/` | `~/.codex/skills/` | `os.homedir()/.codex/skills` | `%USERPROFILE%\\.codex\\skills\\` | `$HOME/.codex/skills/` | Aligned | Add explicit Windows/Linux fixture tests only |
| Cursor | `.agents/skills/` | `~/.cursor/skills/` | `os.homedir()/.cursor/skills` | `%USERPROFILE%\\.cursor\\skills\\` | `$HOME/.cursor/skills/` | Aligned | Add explicit Windows/Linux fixture tests only |
| GitHub Copilot | `.agents/skills/` | `~/.copilot/skills/` | `os.homedir()/.copilot/skills` | Not covered by current expanded matrix asset | Not covered by current expanded matrix asset | Out of current asset scope | Keep current definition unless a later asset/design pass adds it |
| Gemini CLI | `.agents/skills/` | `~/.gemini/skills/` | `os.homedir()/.gemini/skills` | `%USERPROFILE%\\.gemini\\skills\\` | `$HOME/.gemini/skills/` | Aligned | Add explicit Windows/Linux fixture tests only |
| OpenCode | `.agents/skills/` | `~/.config/opencode/skills/` | `os.homedir()/.config/opencode/skills` | `%USERPROFILE%\\.config\\opencode\\skills\\` | `$HOME/.config/opencode/skills/` | Aligned | Add explicit XDG-preserving Windows/Linux tests |
| OpenClaw | `skills/` | `~/.openclaw/skills/` | `os.homedir()/.openclaw/skills` | `%USERPROFILE%\\.openclaw\\skills\\` | `$HOME/.openclaw/skills/` | Partially aligned | Add legacy compat-read fallbacks for `.clawdbot` and `.moltbot` |
| Pi | `.pi/skills/` | `~/.pi/agent/skills/` | `os.homedir()/.pi/agent/skills` | `%USERPROFILE%\\.pi\\agent\\skills\\` | `$HOME/.pi/agent/skills/` | Aligned | Add explicit Windows/Linux fixture tests only |
| Windsurf | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` | `os.homedir()/.codeium/windsurf/skills` | `%USERPROFILE%\\.codeium\\windsurf\\skills\\` | `$HOME/.codeium/windsurf/skills/` | Aligned | Add explicit Windows/Linux fixture tests only |
| Roo Code | `.roo/skills/` | `~/.roo/skills/` | `os.homedir()/.roo/skills` | `%USERPROFILE%\\.roo\\skills\\` | `$HOME/.roo/skills/` | Aligned | Add explicit Windows/Linux fixture tests only |
| Cline | `.agents/skills/` | `~/.agents/skills/` | `os.homedir()/.agents/skills` | `%USERPROFILE%\\.agents\\skills\\` | `$HOME/.agents/skills/` | Aligned | Add explicit Windows/Linux fixture tests only |
| Amp | `.agents/skills/` | `~/.config/agents/skills/` | `os.homedir()/.config/agents/skills` | `%USERPROFILE%\\.config\\agents\\skills\\` | `$HOME/.config/agents/skills/` | Aligned | Add explicit XDG-preserving Windows/Linux tests |
| Kiro | `.kiro/skills/` | `~/.kiro/skills/` | `os.homedir()/.kiro/skills` | `%USERPROFILE%\\.kiro\\skills\\` | `$HOME/.kiro/skills/` | Aligned | Add explicit Windows/Linux fixture tests only |

## What The Comparison Shows

### 1. Most target definitions already match the intended matrix

For the targets covered by the new expanded asset, the current `TARGET_DEFINITIONS` values are already consistent with the intended project/global path model.

That means the next phase should not start with renaming target paths in `constants.ts`.

### 2. The missing piece is explicit path expansion, not missing metadata

Current code stores abstract documented paths like:

- `~/.codex/skills/`
- `~/.config/opencode/skills/`
- `~/.config/agents/skills/`

Current runtime write roots are concrete, but only through `os.homedir()` at execution time.

What is still missing is a small path-policy layer that can answer:

- given target `X`
- for platform `windows` or `linux`
- and a supplied home directory
- what concrete global path should be produced

This is needed for:

- deterministic cross-platform tests
- future desktop/path display consistency
- path-matrix generation without duplicating logic

### 3. OpenClaw is the one clear runtime gap

The new asset explicitly says it is safe to implement compatibility fallback support for:

- `~/.clawdbot/skills/`
- `~/.moltbot/skills/`

Current code does not yet model that in `TARGET_DEFINITIONS.openclaw.compatReadRootCandidates`.

This is the clearest direct code delta between current state and the intended matrix.

### 4. Desktop still duplicates target-path knowledge

`apps/desktop-mac/Sources/DesktopApp/Store/AgentDisplayPreference.swift` hardcodes display mount paths separately from the central target registry.

That is a single-source-of-truth violation because the same facts now exist in two places:

- `packages/integration/src/utils/constants.ts`
- `AgentDisplayCatalog.mountPath(for:)`

Even if the values currently match, future Windows/Linux work will drift faster if that duplication remains.

## Required Changes By Area

### A. Safe next code changes

These changes are directly supported by the current assets:

1. Add a target path expansion helper derived from `TARGET_DEFINITIONS`.
2. Add Windows and Linux fixture tests for concrete global path expansion.
3. Add OpenClaw legacy compatibility read roots:
   - `~/.clawdbot/skills/`
   - `~/.moltbot/skills/`
4. Refactor desktop display path generation to read from shared target-path policy instead of hardcoded Swift-only paths, or explicitly document that desktop remains macOS-only and is temporarily separate.

### B. Changes that are not yet justified

These should stay deferred:

1. Rewriting XDG-style Windows paths into `AppData` or other native Windows locations.
2. Changing Codex/OpenCode/Amp away from the accepted reference-project baseline.
3. Changing project-path contracts such as `.agents/skills/` without a separate design decision.
4. Reclassifying targets not covered by the current asset set, such as GitHub Copilot, based only on analogy.

## Recommended Implementation Order

If this document is used as code-design input, the next implementation pass should proceed in this order:

1. Introduce one shared path-policy function that expands documented paths into concrete Windows/Linux paths from an injected home directory.
2. Lock that function with deterministic fixture tests using:
   - Windows examples like `C:\\Users\\test\\...`
   - Linux examples like `/home/test/...`
3. Extend OpenClaw compatibility reads with legacy fallback roots.
4. Remove or reduce path duplication in desktop display code.

## File-Level Impact If Implemented Next

The most likely first-pass code touch points are:

- `packages/integration/src/utils/constants.ts`
- `apps/cli/src/tests/target-definitions.test.ts`
- `apps/desktop-mac/Sources/DesktopApp/Store/AgentDisplayPreference.swift`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewModelTests.swift`

Potential additional test-only touch points:

- new integration/unit tests for explicit Windows/Linux path expansion

## Final Conclusion

The current `skill-flow` target model is already mostly aligned with the desired Windows/Linux-expanded matrix.

The next work should therefore be treated as:

- path-policy extraction and test hardening
- one compatibility fix for OpenClaw legacy paths
- one SSOT cleanup for duplicated desktop mount-path logic

It should not be treated as a broad target-definition rewrite.

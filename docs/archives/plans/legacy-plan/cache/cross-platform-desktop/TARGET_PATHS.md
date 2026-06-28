# Cross-Platform Desktop Target Paths

## Scope

This document is the accepted `skills`-only target-path baseline for current `skill-flow` development.

It combines:

- the reference-project baseline from `vercel-labs-skills` and `cc-switch`
- the Windows/Linux expanded path matrix
- the current `skill-flow` repo state

## Accepted baseline

The implementation baseline is derived from:

- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/src/agents.ts`
- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/tests/xdg-config-paths.test.ts`
- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/tests/openclaw-paths.test.ts`
- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/tests/cross-platform-paths.test.ts`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/codex_config.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/gemini_config.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/opencode_config.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/openclaw_config.rs`

## Path expansion rules

### Project paths

Project paths are repo-relative and do not vary by OS:

- `.claude/skills/`
- `.agents/skills/`
- `.pi/skills/`
- `.windsurf/skills/`
- `.roo/skills/`
- `.kiro/skills/`
- `skills/`

### Home-relative global paths

For current development:

- Windows: interpret `~` as `%USERPROFILE%`
- Linux: interpret `~` as `$HOME`

### XDG-style global paths

For OpenCode and Amp, preserve XDG-style paths on both Windows and Linux:

- OpenCode:
  - Windows: `%USERPROFILE%\\.config\\opencode\\skills\\`
  - Linux: `$HOME/.config/opencode/skills/`
- Amp:
  - Windows: `%USERPROFILE%\\.config\\agents\\skills\\`
  - Linux: `$HOME/.config/agents/skills/`

Do not rewrite these to `AppData` during the current phase.

## Final target matrix

| Target | Project Path | Windows Global Path | Linux Global Path | Notes |
|--------|--------------|---------------------|-------------------|-------|
| Claude Code | `.claude/skills/` | `%USERPROFILE%\\.claude\\skills\\` | `$HOME/.claude/skills/` | Accepted baseline |
| Codex | `.agents/skills/` | `%USERPROFILE%\\.codex\\skills\\` | `$HOME/.codex/skills/` | `cc-switch` also confirms `~/.codex` as real config root |
| Cursor | `.agents/skills/` | `%USERPROFILE%\\.cursor\\skills\\` | `$HOME/.cursor/skills/` | Accepted baseline |
| GitHub Copilot | `.agents/skills/` | `%USERPROFILE%\\.copilot\\skills\\` | `$HOME/.copilot/skills/` | Kept as current repo baseline, not part of the narrowed expanded asset |
| Gemini CLI | `.agents/skills/` | `%USERPROFILE%\\.gemini\\skills\\` | `$HOME/.gemini/skills/` | `cc-switch` also confirms `~/.gemini` as real config root |
| OpenCode | `.agents/skills/` | `%USERPROFILE%\\.config\\opencode\\skills\\` | `$HOME/.config/opencode/skills/` | XDG-preserving |
| OpenClaw | `skills/` | `%USERPROFILE%\\.openclaw\\skills\\` | `$HOME/.openclaw/skills/` | Shared-scope baseline |
| OpenClaw legacy | `skills/` | `%USERPROFILE%\\.clawdbot\\skills\\` or `%USERPROFILE%\\.moltbot\\skills\\` | `$HOME/.clawdbot/skills/` or `$HOME/.moltbot/skills/` | Compatibility reads only |
| Cline | `.agents/skills/` | `%USERPROFILE%\\.agents\\skills\\` | `$HOME/.agents/skills/` | Accepted baseline |
| Amp | `.agents/skills/` | `%USERPROFILE%\\.config\\agents\\skills\\` | `$HOME/.config/agents/skills/` | XDG-preserving |
| Pi | `.pi/skills/` | `%USERPROFILE%\\.pi\\agent\\skills\\` | `$HOME/.pi/agent/skills/` | Accepted baseline |
| Windsurf | `.windsurf/skills/` | `%USERPROFILE%\\.codeium\\windsurf\\skills\\` | `$HOME/.codeium/windsurf/skills/` | Accepted baseline |
| Roo Code | `.roo/skills/` | `%USERPROFILE%\\.roo\\skills\\` | `$HOME/.roo/skills/` | Accepted baseline |
| Kiro | `.kiro/skills/` | `%USERPROFILE%\\.kiro\\skills\\` | `$HOME/.kiro/skills/` | Accepted baseline |

## Test fixtures

### Windows

- Claude Code: `C:\\Users\\test\\.claude\\skills`
- Codex: `C:\\Users\\test\\.codex\\skills`
- Cursor: `C:\\Users\\test\\.cursor\\skills`
- GitHub Copilot: `C:\\Users\\test\\.copilot\\skills`
- Gemini CLI: `C:\\Users\\test\\.gemini\\skills`
- OpenCode: `C:\\Users\\test\\.config\\opencode\\skills`
- OpenClaw: `C:\\Users\\test\\.openclaw\\skills`
- Cline: `C:\\Users\\test\\.agents\\skills`
- Amp: `C:\\Users\\test\\.config\\agents\\skills`
- Pi: `C:\\Users\\test\\.pi\\agent\\skills`
- Windsurf: `C:\\Users\\test\\.codeium\\windsurf\\skills`
- Roo Code: `C:\\Users\\test\\.roo\\skills`
- Kiro: `C:\\Users\\test\\.kiro\\skills`

### Linux

- Claude Code: `/home/test/.claude/skills`
- Codex: `/home/test/.codex/skills`
- Cursor: `/home/test/.cursor/skills`
- GitHub Copilot: `/home/test/.copilot/skills`
- Gemini CLI: `/home/test/.gemini/skills`
- OpenCode: `/home/test/.config/opencode/skills`
- OpenClaw: `/home/test/.openclaw/skills`
- Cline: `/home/test/.agents/skills`
- Amp: `/home/test/.config/agents/skills`
- Pi: `/home/test/.pi/agent/skills`
- Windsurf: `/home/test/.codeium/windsurf/skills`
- Roo Code: `/home/test/.roo/skills`
- Kiro: `/home/test/.kiro/skills`

## Current repo state

The current target-path SSOT is:

- `packages/integration/src/utils/constants.ts`

It already defines:

- current runtime write roots
- compatibility read roots
- documented project paths
- documented global paths

The current model is already mostly aligned with the accepted baseline.

## Required code changes

### Safe to implement now

1. Add a shared path-policy layer that expands documented target paths into concrete Windows/Linux paths.
2. Add deterministic Windows/Linux fixture tests.
3. Preserve XDG-style paths for OpenCode and Amp on both Windows and Linux.
4. Add OpenClaw compatibility read fallbacks for:
   - `~/.clawdbot/skills/`
   - `~/.moltbot/skills/`
5. Remove target-path duplication outside the central registry where practical.

### Not part of the current phase

1. Rewriting XDG-style Windows paths into `AppData`.
2. Changing the `skills`-based target model.
3. Broad target-definition rewrites when current values already match the accepted baseline.

## Immediate implementation order

1. Introduce a path expansion helper derived from `TARGET_DEFINITIONS`.
2. Lock the helper with Windows/Linux fixture tests.
3. Add OpenClaw legacy compatibility reads.
4. Clean up duplicated mount-path knowledge in desktop display code.

# Cross-Platform Desktop Research Assets: Reference Project Findings

## Scope

This document captures what can be reused from the following local reference projects before implementing Windows and Ubuntu support for `skill-flow`:

- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch`

These are implementation references. For this project, paths explicitly listed in these reference projects are treated as the default implementation baseline for upcoming development, especially when they already encode Linux/Windows-safe behavior. They are still not vendor-authored specifications, so the source type must remain "reference project", not "vendor official docs".

## 1. `vercel-labs-skills` can be reused as the path-matrix and installer reference

### What it already proves

- It centralizes per-agent project and global skill directories in one place.
- It distinguishes canonical storage from agent-specific install locations.
- It has explicit cross-platform tests for path normalization and separator handling.
- It already encodes some historical path fallbacks, especially for OpenClaw.
- It runs CI on both Ubuntu and Windows.

### Files worth reusing as design references

- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/src/agents.ts`
- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/src/constants.ts`
- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/src/installer.ts`
- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/tests/cross-platform-paths.test.ts`
- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/tests/openclaw-paths.test.ts`
- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/tests/xdg-config-paths.test.ts`
- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/.github/workflows/ci.yml`

### Concrete patterns to reuse in `skill-flow`

#### A. Central path registry

`src/agents.ts` keeps `skillsDir` and `globalSkillsDir` together for each target. This is the right shape for `skill-flow` too: one explicit path policy module, not scattered constants and fallback logic.

#### B. Canonical storage first, projection second

`src/installer.ts` installs each skill into one canonical location first, then projects it to each agent location via symlink or copy. This matches `skill-flow`'s existing direction and reinforces the need for one SSOT.

#### C. Symlink fallback handling

`src/installer.ts` attempts symlink creation and falls back cleanly when needed. It also resolves parent symlinks before computing relative targets. This is relevant for Windows junction handling and for nested compatibility directories.

#### D. OpenClaw historical path fallback

`getOpenClawGlobalSkillsDir()` in `src/agents.ts` checks:

- `~/.openclaw/skills`
- `~/.clawdbot/skills`
- `~/.moltbot/skills`

This is useful because `skill-flow` currently only models the modern OpenClaw path.

#### E. XDG behavior is treated as a product rule

`tests/xdg-config-paths.test.ts` explicitly locks OpenCode/Amp/Goose to `~/.config/...`, even on macOS. This matters because some tools intentionally follow XDG rules instead of native macOS/Windows config conventions.

### Immediate implications for `skill-flow`

- Move all target path selection into one explicit module.
- Add tests that lock path behavior for Unix and Windows separately.
- Treat OpenClaw as a multi-path compatibility target, not a single hardcoded path.
- Keep canonical storage separate from per-agent projection.

## 2. `cc-switch` can be reused as the desktop host and SSOT reference

### What it already proves

- `Tauri 2 + React + Rust` is a workable architecture for managing multiple coding CLIs.
- Desktop packaging can stay mostly shared, while platform-specific differences are split into separate Tauri config files.
- Per-tool config file writers should be isolated by app, not hidden behind one large generic config layer.
- Skills can be managed through a desktop-local SSOT and then synced into live tool directories.

### Files worth reusing as design references

- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/tauri.conf.json`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/tauri.windows.conf.json`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/codex_config.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/gemini_config.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/opencode_config.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/openclaw_config.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/services/skill.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/tests/skill_sync.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/tests/support.rs`

### Concrete patterns to reuse in `skill-flow`

#### A. Host config split by platform

`tauri.conf.json` holds the common app config; `tauri.windows.conf.json` only overrides the Windows-specific window behavior. This is the same boundary `skill-flow` should use if it adds `apps/desktop`.

#### B. Per-tool config writers

`cc-switch` keeps each tool's live config logic in its own module:

- Codex: `~/.codex/config.toml`, `~/.codex/auth.json`
- Gemini: `~/.gemini/.env`
- OpenCode: `~/.config/opencode/opencode.json`
- OpenClaw: `~/.openclaw/openclaw.json`

This is important because it argues against building one generic "write any agent config" abstraction too early.

#### C. Desktop-local SSOT for skills

`src-tauri/src/services/skill.rs` stores skills under `~/.cc-switch/skills/` and treats that directory as the single source of truth, then syncs to each app. That is directly relevant to `skill-flow` because the same pattern can be kept for `~/.skillflow`.

#### D. Sync tests exercise orphan cleanup and restore behavior

`src-tauri/tests/skill_sync.rs` covers:

- importing from existing app directories
- cleaning orphaned symlinks
- disabling projection per app
- backup before uninstall
- restore from backup back into SSOT and a selected app

This is a strong reference for `skill-flow` doctor/apply/uninstall verification.

#### E. Windows test-home override is explicit

`src-tauri/tests/support.rs` sets `CC_SWITCH_TEST_HOME` and `USERPROFILE` on Windows because Windows home resolution does not reliably follow `HOME`. `skill-flow` will likely need a similar testing strategy if it adds Windows path tests.

### Immediate implications for `skill-flow`

- `apps/desktop` should use shared Tauri config plus per-platform overrides.
- Skills and projections should continue to revolve around one state-root SSOT.
- Windows tests should not rely on `HOME` alone.
- Per-target config and per-target skills path logic should stay explicit.

## 3. Reference-derived candidate path assumptions

These are useful starting points extracted from the two reference projects. They are not final until checked against official docs.

| Target | Candidate project path | Candidate global path | Source |
|--------|------------------------|-----------------------|--------|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` | `vercel-labs-skills`, `cc-switch` prompt sync assumptions |
| Codex | `.agents/skills/` | `~/.codex/skills/` | `vercel-labs-skills` |
| Cursor | `.agents/skills/` | `~/.cursor/skills/` | `vercel-labs-skills` |
| Gemini CLI | `.agents/skills/` | `~/.gemini/skills/` | `vercel-labs-skills` |
| OpenCode | `.agents/skills/` | `~/.config/opencode/skills/` | `vercel-labs-skills`, `cc-switch` |
| OpenClaw | `skills/` | `~/.openclaw/skills/` with legacy fallback | `vercel-labs-skills`, `cc-switch` |
| Amp | `.agents/skills/` | `~/.config/agents/skills/` | `vercel-labs-skills` |
| Kiro | `.kiro/skills/` | `~/.kiro/skills/` | `vercel-labs-skills` |
| Cline | `.agents/skills/` | `~/.agents/skills/` | `vercel-labs-skills` |

## 4. Reference baseline accepted for current development

The following paths are now accepted as the current development baseline because they are explicitly listed in `vercel-labs-skills` and/or exercised in `cc-switch`:

| Target | Project path baseline | Global path baseline | Notes |
|--------|------------------------|----------------------|-------|
| Claude Code | `.claude/skills/` | `~/.claude/skills/` | Listed directly in `vercel-labs-skills` |
| Codex | `.agents/skills/` | `~/.codex/skills/` | Listed directly in `vercel-labs-skills`; `cc-switch` also confirms `~/.codex` as real config root |
| Cursor | `.agents/skills/` | `~/.cursor/skills/` | Listed directly in `vercel-labs-skills` |
| Gemini CLI | `.agents/skills/` | `~/.gemini/skills/` | Listed directly in `vercel-labs-skills`; `cc-switch` confirms `~/.gemini` as real config root |
| OpenCode | `.agents/skills/` | `~/.config/opencode/skills/` | Listed directly in `vercel-labs-skills`; `cc-switch` confirms `~/.config/opencode` as real config root |
| OpenClaw | `skills/` | `~/.openclaw/skills/` | Listed directly in `vercel-labs-skills`; legacy `~/.clawdbot/skills` and `~/.moltbot/skills` remain compatibility candidates |
| Cline | `.agents/skills/` | `~/.agents/skills/` | Listed directly in `vercel-labs-skills` |
| Amp | `.agents/skills/` | `~/.config/agents/skills/` | Listed directly in `vercel-labs-skills` |
| Pi | `.pi/skills/` | `~/.pi/agent/skills/` | Listed directly in `vercel-labs-skills` |
| Windsurf | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` | Listed directly in `vercel-labs-skills` |
| Roo Code | `.roo/skills/` | `~/.roo/skills/` | Listed directly in `vercel-labs-skills` |
| Kiro CLI | `.kiro/skills/` | `~/.kiro/skills/` | Listed directly in `vercel-labs-skills`, but still requires custom agent `resources` wiring there |

### Windows and Linux interpretation rule

For paths above that are home-relative or XDG-relative:

- Linux baseline:
  - keep the listed `~/.foo/...` and `~/.config/...` forms as-is
- Windows baseline:
  - keep the same repo-relative project paths
  - map `~` to the tool's effective home directory
  - when a reference project already treats XDG-style paths as the stable behavior, preserve that semantics instead of inventing platform-specific replacements too early

This means current development should prefer:

- preserving `~/.config/...` semantics for XDG-based tools like OpenCode and Amp
- preserving `~/.codex`, `~/.gemini`, `~/.claude`, `~/.cursor`, `~/.openclaw` style roots as the home-relative baseline
- adding Windows test coverage for home resolution and junction behavior instead of rewriting these paths into `AppData`/`ProgramData` without evidence from the chosen reference baseline

## 5. What these references do not prove

- They do not prove official support for `~/.codex/skills`.
- They do not prove Cursor still treats `.agents/skills` as the preferred project mechanism.
- They do not prove Windows and Linux path differences for each tool.
- They do not prove whether Kiro should be modeled as skills or steering.

Those gaps must be closed by official documentation before changing `skill-flow`'s external path contracts.

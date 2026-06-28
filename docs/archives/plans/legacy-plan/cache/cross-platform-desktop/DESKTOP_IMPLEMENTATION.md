# Cross-Platform Desktop Implementation Notes

## Scope

This document keeps the minimum implementation-facing desktop conclusions that still matter after the earlier research and planning passes.

## Desktop boundary

The current desktop direction remains:

- keep the existing TypeScript runtime as the business core
- keep `skill-flow bridge --json` as the runtime boundary
- add cross-platform desktop support around that boundary rather than rewriting the runtime first

This comes from the current implementation plan and remains the active architectural baseline for the next phase.

## Reusable reference patterns

### 1. Tauri config split

Use the same boundary shown in `cc-switch`:

- shared config in:
  - `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/tauri.conf.json`
- Windows-only overrides in:
  - `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/tauri.windows.conf.json`

Implication for `skill-flow`:

- if a new cross-platform desktop shell is added, keep common Tauri config shared and isolate Windows-only UI/packaging overrides.

### 2. Skills SSOT and projection model

`cc-switch` keeps skills in one desktop-local SSOT and syncs them into live app directories.

Implication for `skill-flow`:

- keep `~/.skillflow` as the canonical state root
- continue treating target directories as projections, not source of truth

### 3. Explicit per-tool config logic

`cc-switch` keeps tool-specific config writers separate:

- Codex: `~/.codex/config.toml`, `~/.codex/auth.json`
- Gemini: `~/.gemini/.env`
- OpenCode: `~/.config/opencode/opencode.json`
- OpenClaw: `~/.openclaw/openclaw.json`

Implication for `skill-flow`:

- do not invent a generic multi-target config abstraction too early
- keep path and projection logic explicit per target

## Cross-platform runtime constraints

### Windows test-home policy

Do not rely on `HOME` alone on Windows.

Reference pattern:

- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/config.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/tests/support.rs`

Implementation consequence:

- Windows path tests in `skill-flow` should use an explicit injected home directory or a dedicated test-home override
- test isolation should not depend on whatever `os.homedir()` happens to resolve on the host

### Link behavior

Reference pattern:

- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/services/skill.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/vercel-labs-skills/tests/cross-platform-paths.test.ts`

Implementation consequence:

- Unix uses directory symlinks
- Windows should be treated explicitly, with tests around directory-link behavior and fallback handling
- path and link policy must be centralized instead of scattered

### Linux desktop prerequisites

Relevant reference signals:

- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/Cargo.toml`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/src-tauri/src/lib.rs`
- `/Users/Vint/Repos/04_Reference/03_Tools/cc-switch/docs/release-notes/v3.11.0-en.md`

Useful conclusions:

- Linux desktop support must account for `webkit2gtk`
- WebKitGTK runtime behavior is a real packaging/runtime concern, not a theoretical one
- Linux-specific WebKit rendering issues should be expected during smoke testing

## What is ready to implement now

1. Remove shell-dependent runtime behavior that assumes macOS tooling only.
2. Centralize target path and link policy.
3. Lock Windows/Linux path behavior with deterministic tests.
4. Keep desktop-facing path display aligned with the same target-path SSOT.

## What stays deferred

1. Changing the `skills` target model.
2. Broad desktop packaging work before the runtime path layer is stable.
3. Any rewrite that replaces `bridge --json` before the cross-platform runtime is working.

## Immediate next coding slice

The next implementation pass should stay narrow:

1. path-policy extraction
2. Windows/Linux target-path fixtures
3. OpenClaw legacy fallback
4. desktop mount-path SSOT cleanup

That is the smallest useful unit that turns the current research into working code.

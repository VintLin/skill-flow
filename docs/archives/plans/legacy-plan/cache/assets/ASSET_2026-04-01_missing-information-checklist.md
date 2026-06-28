# Cross-Platform Desktop Research Assets: Missing Information Checklist

## Scope

This document lists what is still missing after the first collection pass. These gaps should be closed before changing `skill-flow`'s target path constants or desktop release assumptions.

Current decision:

- Paths explicitly listed in the selected reference projects are now acceptable as the implementation baseline.
- The gaps below therefore no longer block all development equally.
- They still matter for later cleanup, compatibility hardening, and any place where `skill-flow` wants to claim vendor-official alignment.

## 1. Path and mechanism gaps

### High-priority gaps

- Codex:
  - Is there any official `skills` directory support, or is `~/.codex/skills` only a reference-project convention?
- Cursor:
  - If Cursor officially prefers `.cursor/rules`, should `skill-flow` keep the current skills baseline for compatibility or redesign Cursor support later?
- OpenClaw:
  - How should `skill-flow` distinguish `<workspace>/skills/` from `~/.openclaw/skills/` while still keeping the chosen reference baseline?
- Kiro:
  - Should Kiro stay on the current `.kiro/skills` reference baseline or be redesigned later around steering/`AGENTS.md`?

### Medium-priority gaps

- Gemini CLI:
  - Need primary-source confirmation for `~/.gemini/skills` even if the reference baseline is accepted for now.
- Claude Code:
  - Need a current official source explicitly confirming `.claude/skills/`, not just adjacent `.claude/*` mechanisms.
- Roo Code:
  - Need official project/global path docs.
- Pi:
  - Need official project/global path docs.
- Amp:
  - Need official project/global path docs, especially Windows/Linux behavior.

## 2. Platform readiness gaps

### Windows

- Need a real verification pass for:
  - home-directory resolution in tests while preserving the chosen home-relative reference paths
  - junction vs symlink behavior for projected skills
  - Tauri runtime packaging assumptions
  - target app discovery when config directories do not exist yet

### Ubuntu/Linux

- Need a real verification pass for:
  - WebKitGTK/Tauri prerequisites
  - XDG vs non-XDG config behavior per target
  - package format choice for first release target

## 3. Runtime transport gaps

- Decide whether desktop v1 keeps calling `skill-flow bridge --json` via a Node-based helper.
- If yes:
  - confirm whether Windows and Ubuntu release builds may require host Node
- If no:
  - design sidecar/bundled runtime packaging before desktop release work starts

## 4. Repo-facing gaps

Before implementation starts, the following docs should still be produced or updated:

- A final path matrix with each target marked `verified`, `partial`, or `blocked`
- A Tauri prerequisite summary tied to `skill-flow`
- A Windows/Ubuntu smoke-test checklist
- A repo-vs-official-doc gap summary for `packages/integration/src/utils/constants.ts`

## 5. Recommended next research actions

1. Build a final target matrix using the accepted reference-project baseline.
2. Run a second pass for vendor-official confirmation on the highest-risk targets.
3. Decide which targets stay on the compatibility baseline and which should later move to `rules` or `steering` semantics.
4. Then revise `skill-flow` target constants and test fixtures.

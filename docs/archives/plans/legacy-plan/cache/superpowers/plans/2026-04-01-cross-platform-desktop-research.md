# Cross-Platform Desktop Research Preparation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect and verify all external documentation, platform path contracts, and build prerequisites required before implementing Windows and Ubuntu desktop support for `skill-flow`.

**Architecture:** This plan does not change runtime code yet. It produces a verified source-of-truth matrix for agent skill/rule directories, Tauri platform prerequisites, transport packaging constraints, and local/CI environment readiness so the implementation plan can proceed without hidden external assumptions.

**Tech Stack:** Markdown documentation, official vendor docs, repository references, shell verification commands.

I'm using the writing-plans skill to create the implementation plan.

---

### Task 1: Build The Cross-Platform Agent Path Matrix

**Files:**
- Create: `docs/references/REF_cross-platform_agent_path_matrix.md`
- Modify: `docs/superpowers/plans/2026-04-01-cross-platform-desktop-research.md`

- [ ] **Step 1: Create the matrix document with the exact schema**

```md
# Cross-Platform Agent Path Matrix

| Target | Mechanism | Project Path | Global Path | Windows Path | Linux Path | macOS Path | Status | Source |
|--------|-----------|--------------|-------------|--------------|------------|------------|--------|--------|
| claude-code | skills | `.claude/skills/` | `~/.claude/skills/` | `~/.claude/skills/` | `~/.claude/skills/` | `~/.claude/skills/` | verified | official docs |
| codex | unknown | `AGENTS.md` | `~/.codex/config.toml` | TBD | TBD | TBD | blocked | official docs missing skills path |
| cursor | rules | `.cursor/rules/` | none confirmed | TBD | TBD | TBD | partial | official docs |
| github-copilot | skills | `.github/skills/`, `.claude/skills/`, `.agents/skills/` | `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/` | same contract unless docs differ | same contract unless docs differ | same contract unless docs differ | verified | official docs |
```
```

- [ ] **Step 2: Collect official docs for each target and fill the matrix**

Use these searches:

```bash
open "https://code.claude.com/docs/en/slash-commands"
open "https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-skills"
open "https://opencode.ai/docs/skills"
open "https://docs.windsurf.com/windsurf/cascade/skills"
open "https://docs.cline.bot/customization/skills"
open "https://kiro.dev/docs/steering/"
open "https://docs.openclaw.ai/tools/creating-skills"
open "https://developers.openai.com/learn/docs-mcp"
open "https://cursor.com/docs"
```

Expected: Each row in `REF_cross-platform_agent_path_matrix.md` has one official source URL and one status value from `verified`, `partial`, `blocked`.

- [ ] **Step 3: Mark every current `TARGET_DEFINITIONS` entry as verified, partial, or blocked**

```md
## Status Rules

- `verified`: official docs explicitly define the path or loading rule
- `partial`: official docs define the mechanism but not all OS paths
- `blocked`: repo currently assumes a path with no official confirmation

## Required rows

- claude-code
- codex
- cursor
- github-copilot
- gemini-cli
- opencode
- openclaw
- pi
- windsurf
- roo-code
- cline
- amp
- kiro
```

- [ ] **Step 4: Verify the matrix is complete**

Run:

```bash
rg -n "^\\| (claude-code|codex|cursor|github-copilot|gemini-cli|opencode|openclaw|pi|windsurf|roo-code|cline|amp|kiro) \\|" docs/references/REF_cross-platform_agent_path_matrix.md
```

Expected: 13 matches, one per target.

- [ ] **Step 5: Commit the matrix**

```bash
git add docs/references/REF_cross-platform_agent_path_matrix.md docs/superpowers/plans/2026-04-01-cross-platform-desktop-research.md
git commit -m "docs: add cross-platform agent path matrix"
```

### Task 2: Freeze Tauri 2 Platform Prerequisites And Packaging Constraints

**Files:**
- Create: `docs/references/REF_tauri2_cross-platform_prerequisites.md`
- Modify: `docs/superpowers/plans/2026-04-01-cross-platform-desktop-research.md`

- [ ] **Step 1: Create the prerequisite checklist document**

```md
# Tauri 2 Cross-Platform Prerequisites

## Windows
- Rust toolchain
- WebView2 runtime
- Microsoft C++ Build Tools
- NSIS or WiX requirement

## Ubuntu
- Rust toolchain
- `webkit2gtk`
- `libgtk-3-dev`
- `libayatana-appindicator3-dev`
- AppImage/deb packaging requirements

## macOS
- Xcode Command Line Tools
- Apple signing/notarization notes
- dmg/app bundle requirements
```

- [ ] **Step 2: Pull the official Tauri docs into the checklist**

Use these sources:

```bash
open "https://v2.tauri.app/start/prerequisites/"
open "https://tauri.app/develop/sidecar/"
open "https://v2.tauri.app/distribute/"
open "https://tauri.app/distribute/windows-installer/"
```

Expected: `REF_tauri2_cross-platform_prerequisites.md` records OS-specific prerequisites, bundle formats, and sidecar packaging constraints with source links.

- [ ] **Step 3: Capture the implementation-facing constraints**

```md
## Constraints For `skill-flow`

- Phase 1 desktop transport may keep `skill-flow bridge --json`
- If host Node is not acceptable in production, helper bundling must be designed before release work
- Windows packaging must explicitly account for WebView2 presence
- Ubuntu packaging must explicitly account for WebKitGTK runtime dependencies
```

- [ ] **Step 4: Verify all required sections exist**

Run:

```bash
rg -n "^## (Windows|Ubuntu|macOS|Constraints For `skill-flow`)" docs/references/REF_tauri2_cross-platform_prerequisites.md
```

Expected: 4 matches.

- [ ] **Step 5: Commit the prerequisite doc**

```bash
git add docs/references/REF_tauri2_cross-platform_prerequisites.md docs/superpowers/plans/2026-04-01-cross-platform-desktop-research.md
git commit -m "docs: record tauri cross-platform prerequisites"
```

### Task 3: Decide What Must Be Verified In Real Windows And Ubuntu Environments

**Files:**
- Create: `docs/references/REF_cross-platform_validation_checklist.md`
- Modify: `docs/superpowers/plans/2026-04-01-cross-platform-desktop-research.md`

- [ ] **Step 1: Create the validation checklist with environment setup commands**

```md
# Cross-Platform Validation Checklist

## Windows host
- Install Node 20+
- Install Rust stable
- Install WebView2 runtime
- Install Visual Studio C++ Build Tools
- Clone `skill-flow`
- Run `npm ci`
- Run `npm test`

## Ubuntu host
- Install Node 20+
- Install Rust stable
- Install `libwebkit2gtk-4.1-dev`, `build-essential`, `libgtk-3-dev`, `libayatana-appindicator3-dev`
- Clone `skill-flow`
- Run `npm ci`
- Run `npm test`
```

- [ ] **Step 2: Add the real-path verification cases**

```md
## Path Verification Cases

- Verify the target agent actually discovers project-local content
- Verify the target agent actually discovers global content
- Verify project path precedence over global path
- Verify whether directory symlink, junction, or plain copy is accepted
- Verify whether broken links are surfaced or silently ignored
```

- [ ] **Step 3: Add the bridge and desktop smoke checks**

```md
## Smoke Checks

- `node apps/cli/dist/cli.js bridge --json < request.json`
- `npm run -w @skill-flow/desktop build`
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`
- `npm run -w skill-flow test -- src/tests/bridge-command.test.ts`
```

- [ ] **Step 4: Verify the checklist covers both hosts and smoke checks**

Run:

```bash
rg -n "^## (Windows host|Ubuntu host|Path Verification Cases|Smoke Checks)" docs/references/REF_cross-platform_validation_checklist.md
```

Expected: 4 matches.

- [ ] **Step 5: Commit the validation checklist**

```bash
git add docs/references/REF_cross-platform_validation_checklist.md docs/superpowers/plans/2026-04-01-cross-platform-desktop-research.md
git commit -m "docs: add cross-platform validation checklist"
```

### Task 4: Produce A Pre-Implementation Gap Summary Against The Current Repo

**Files:**
- Create: `docs/references/REF_cross-platform_gap_summary.md`
- Modify: `docs/superpowers/plans/2026-04-01-cross-platform-desktop-research.md`

- [ ] **Step 1: Write the repo-vs-doc gap summary**

```md
# Cross-Platform Gap Summary

## Verified mismatches

- `packages/integration/src/utils/constants.ts` assumes `cursor` writes to `~/.cursor/skills`, but official docs currently emphasize `.cursor/rules`
- `packages/integration/src/utils/constants.ts` assumes `codex` uses `~/.codex/skills`, but official OpenAI docs currently confirm `AGENTS.md` and `~/.codex/config.toml`, not a skills path

## Partial gaps

- `openclaw` needs separate handling for workspace-local and shared skill paths
- Windows-specific path expectations remain unverified for `gemini-cli`, `roo-code`, `pi`, and `amp`

## Ready-to-code prerequisites

- Path matrix completed
- Tauri prerequisites documented
- Validation checklist completed
- Blocked targets explicitly marked before constants are changed
```

- [ ] **Step 2: Link each gap to the repo file that will be affected later**

```md
## Likely future touch points

- `packages/integration/src/utils/constants.ts`
- `packages/integration/src/utils/fs.ts`
- `apps/cli/src/tests/target-definitions.test.ts`
- `packages/core-engine/src/services/source-service.ts`
- `apps/desktop/`
```

- [ ] **Step 3: Verify the summary includes `Verified mismatches`, `Partial gaps`, and `Ready-to-code prerequisites`**

Run:

```bash
rg -n "^## (Verified mismatches|Partial gaps|Ready-to-code prerequisites|Likely future touch points)" docs/references/REF_cross-platform_gap_summary.md
```

Expected: 4 matches.

- [ ] **Step 4: Commit the gap summary**

```bash
git add docs/references/REF_cross-platform_gap_summary.md docs/superpowers/plans/2026-04-01-cross-platform-desktop-research.md
git commit -m "docs: summarize cross-platform research gaps"
```

Plan complete and saved to `docs/superpowers/plans/2026-04-01-cross-platform-desktop-research.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

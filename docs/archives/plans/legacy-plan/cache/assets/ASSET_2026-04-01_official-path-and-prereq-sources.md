# Cross-Platform Desktop Research Assets: Official Sources

## Scope

This document records official documentation gathered on 2026-04-01 for the first round of cross-platform desktop research. It only records facts that are directly supported by public vendor documentation or official repositories.

Important:

- This file only captures vendor-official evidence.
- For actual development input, combine this file with `ASSET_2026-04-01_reference-project-findings.md`.
- When the two differ, the current implementation baseline may still follow the reference-project document if that is the explicit decision for this project.

## 1. Verified agent path and instruction facts

### Claude Code

Source:

- https://docs.anthropic.com/en/docs/claude-code/slash-commands

Verified facts:

- Claude Code supports project-local command and instruction files under `.claude/...`.
- The slash command docs explicitly show `.claude/commands/...`.
- This source does not by itself confirm a `.claude/skills/` path, so `skills` support for Claude Code remains only partially confirmed in this round.

### GitHub Copilot

Source:

- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-skills

Verified facts:

- Project skill directories:
  - `.github/skills`
  - `.claude/skills`
- Personal skill directories:
  - `~/.copilot/skills`
  - `~/.claude/skills`
- The document requires `SKILL.md` plus YAML frontmatter with `name` and `description`.

### OpenCode

Sources:

- https://opencode.ai/docs/skills
- https://opencode.ai/docs/config

Verified facts:

- Project skill directories:
  - `.opencode/skills/<name>/SKILL.md`
  - `.claude/skills/<name>/SKILL.md`
  - `.agents/skills/<name>/SKILL.md`
- Global skill directories:
  - `~/.config/opencode/skills/<name>/SKILL.md`
  - `~/.claude/skills/<name>/SKILL.md`
  - `~/.agents/skills/<name>/SKILL.md`
- OpenCode config also uses `~/.config/opencode`.
- OpenCode walks upward to the git worktree when discovering project-local skills.

### OpenClaw

Source:

- https://docs.openclaw.ai/tools/creating-skills

Verified facts:

- The setup example creates a skill in `~/.openclaw/workspace/skills/hello-world`.
- The same page's "Where skills live" section lists:
  - `<workspace>/skills/` as highest precedence
  - `~/.openclaw/skills/` as shared scope
- This means OpenClaw has at least two distinct concepts that must not be collapsed into one path.

### Cursor

Source:

- https://docs.cursor.com/en/context/rules

Verified facts:

- Cursor officially documents `.cursor/rules` as the project-scoped reusable instruction mechanism.
- Cursor also supports global "User Rules" from settings.
- This is rules-based, not documented as `skills`.

### Kiro

Source:

- https://kiro.dev/docs/steering/

Verified facts:

- Kiro's persistent mechanism is `steering`, not `skills`.
- Global steering location is `~/.kiro/steering/`.
- `AGENTS.md` files placed in `~/.kiro/steering/` or in the workspace root are automatically picked up.

### Codex

Sources:

- https://developers.openai.com/learn/docs-mcp
- https://openai.com/index/introducing-codex/
- https://openai.com/business/guides-and-resources/how-openai-uses-codex/

Verified facts:

- Codex supports `AGENTS.md` inside the repository.
- Codex supports `~/.codex/config.toml` for configuration.
- OpenAI's official public docs gathered in this round do not confirm a `~/.codex/skills` mechanism.

### Gemini CLI

Sources:

- https://github.com/google-gemini/gemini-cli
- https://github.com/google-github-actions/run-gemini-cli

Verified facts:

- Gemini CLI is officially supported on macOS, Linux, and Windows.
- Gemini CLI uses project-local `.gemini/` for settings in at least GitHub Action workflows.
- Gemini CLI uses `GEMINI.md` as a custom context file.
- This round did not retrieve a primary source that explicitly confirms `~/.gemini/skills`.

## 2. Verified Tauri 2 desktop prerequisites

Sources:

- https://v2.tauri.app/start/prerequisites/
- https://tauri.app/develop/sidecar/
- https://v2.tauri.app/distribute/
- https://tauri.app/distribute/windows-installer/

Verified facts:

- Tauri 2 is a valid cross-platform desktop host for Windows, Linux, and macOS.
- Windows packaging has first-class installer support.
- Sidecar packaging is an official pattern, relevant if `skill-flow` later bundles its runtime/helper instead of requiring host Node.
- Linux packaging requires explicit system dependency handling.

## 3. Verified facts extracted from official docs that matter immediately

### Confirmed usable as-is

- GitHub Copilot project/global skill paths
- OpenCode project/global skill paths and compatibility paths
- OpenClaw workspace/shared distinction
- Cursor should be modeled around rules, not skills
- Kiro should be modeled around steering and `AGENTS.md`, not generic skills
- Codex definitely supports `AGENTS.md` and `~/.codex/config.toml`

### Still not verified from official docs

- `~/.codex/skills`
- `~/.gemini/skills`
- Roo Code paths
- Pi paths
- Amp Windows/Linux paths
- Whether Claude Code officially documents `.claude/skills/` in current docs or only adjacent `.claude/*` mechanisms in the sources gathered this round

## 4. Recommended usage of this document in later implementation

- Use the verified facts above as the vendor-official evidence set.
- Treat every unverified path as `partial` or `blocked` until another official source is added.
- If implementation intentionally follows a reference-project baseline first, record that separately instead of rewriting this file.

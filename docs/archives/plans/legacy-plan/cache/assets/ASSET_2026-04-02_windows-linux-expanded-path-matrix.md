# Cross-Platform Desktop Research Assets: Windows And Linux Expanded Path Matrix

## Scope

This document expands the currently accepted reference-project baseline into concrete Windows and Linux path forms for `skill-flow` development.

Important:

- This is an implementation matrix, not a vendor-spec matrix.
- It is derived from the accepted reference baseline in:
  - `ASSET_2026-04-01_reference-project-findings.md`
- It deliberately preserves home-relative and XDG-style semantics instead of translating everything into native Windows `AppData` / `ProgramData` forms.

## Path Expansion Rules

### Project paths

Project paths are repo-relative and do not change by OS:

- `.claude/skills/`
- `.agents/skills/`
- `.windsurf/skills/`
- `skills/`

### Home-relative global paths

For development, interpret `~` as:

- Windows: `%USERPROFILE%`
- Linux: `$HOME`

Examples:

- `~/.codex/skills/`
  - Windows: `%USERPROFILE%\\.codex\\skills\\`
  - Linux: `$HOME/.codex/skills/`

- `~/.cursor/skills/`
  - Windows: `%USERPROFILE%\\.cursor\\skills\\`
  - Linux: `$HOME/.cursor/skills/`

### XDG-style global paths

For this project, keep XDG-style paths as XDG-style even on Windows:

- `~/.config/opencode/skills/`
  - Windows: `%USERPROFILE%\\.config\\opencode\\skills\\`
  - Linux: `$HOME/.config/opencode/skills/`

- `~/.config/agents/skills/`
  - Windows: `%USERPROFILE%\\.config\\agents\\skills\\`
  - Linux: `$HOME/.config/agents/skills/`

This matches the accepted reference behavior and avoids prematurely rewriting XDG tools into `AppData`.

## Final Matrix

| Target | Mechanism | Project Path | Windows Global Path | Linux Global Path | Baseline Source |
|--------|-----------|--------------|---------------------|-------------------|-----------------|
| Claude Code | skills | `.claude/skills/` | `%USERPROFILE%\\.claude\\skills\\` | `$HOME/.claude/skills/` | `vercel-labs-skills` |
| Codex | skills | `.agents/skills/` | `%USERPROFILE%\\.codex\\skills\\` | `$HOME/.codex/skills/` | `vercel-labs-skills`, `cc-switch` |
| Cursor | skills | `.agents/skills/` | `%USERPROFILE%\\.cursor\\skills\\` | `$HOME/.cursor/skills/` | `vercel-labs-skills` |
| Gemini CLI | skills | `.agents/skills/` | `%USERPROFILE%\\.gemini\\skills\\` | `$HOME/.gemini/skills/` | `vercel-labs-skills`, `cc-switch` |
| OpenCode | skills | `.agents/skills/` | `%USERPROFILE%\\.config\\opencode\\skills\\` | `$HOME/.config/opencode/skills/` | `vercel-labs-skills`, `cc-switch` |
| OpenClaw | skills | `skills/` | `%USERPROFILE%\\.openclaw\\skills\\` | `$HOME/.openclaw/skills/` | `vercel-labs-skills`, `cc-switch` |
| OpenClaw legacy | skills | `skills/` | `%USERPROFILE%\\.clawdbot\\skills\\` or `%USERPROFILE%\\.moltbot\\skills\\` | `$HOME/.clawdbot/skills/` or `$HOME/.moltbot/skills/` | `vercel-labs-skills` fallback tests |
| Cline | skills | `.agents/skills/` | `%USERPROFILE%\\.agents\\skills\\` | `$HOME/.agents/skills/` | `vercel-labs-skills` |
| Amp | skills | `.agents/skills/` | `%USERPROFILE%\\.config\\agents\\skills\\` | `$HOME/.config/agents/skills/` | `vercel-labs-skills` |
| Pi | skills | `.pi/skills/` | `%USERPROFILE%\\.pi\\agent\\skills\\` | `$HOME/.pi/agent/skills/` | `vercel-labs-skills` |
| Windsurf | skills | `.windsurf/skills/` | `%USERPROFILE%\\.codeium\\windsurf\\skills\\` | `$HOME/.codeium/windsurf/skills/` | `vercel-labs-skills` |
| Roo Code | skills | `.roo/skills/` | `%USERPROFILE%\\.roo\\skills\\` | `$HOME/.roo/skills/` | `vercel-labs-skills` |
| Kiro CLI | skills | `.kiro/skills/` | `%USERPROFILE%\\.kiro\\skills\\` | `$HOME/.kiro/skills/` | `vercel-labs-skills` |

## Derived Test Fixtures For `skill-flow`

Use these forms when writing path tests:

### Windows fixtures

- Claude Code: `C:\\Users\\test\\.claude\\skills`
- Codex: `C:\\Users\\test\\.codex\\skills`
- Cursor: `C:\\Users\\test\\.cursor\\skills`
- Gemini CLI: `C:\\Users\\test\\.gemini\\skills`
- OpenCode: `C:\\Users\\test\\.config\\opencode\\skills`
- OpenClaw: `C:\\Users\\test\\.openclaw\\skills`
- Cline: `C:\\Users\\test\\.agents\\skills`
- Amp: `C:\\Users\\test\\.config\\agents\\skills`
- Pi: `C:\\Users\\test\\.pi\\agent\\skills`
- Windsurf: `C:\\Users\\test\\.codeium\\windsurf\\skills`
- Roo Code: `C:\\Users\\test\\.roo\\skills`
- Kiro CLI: `C:\\Users\\test\\.kiro\\skills`

### Linux fixtures

- Claude Code: `/home/test/.claude/skills`
- Codex: `/home/test/.codex/skills`
- Cursor: `/home/test/.cursor/skills`
- Gemini CLI: `/home/test/.gemini/skills`
- OpenCode: `/home/test/.config/opencode/skills`
- OpenClaw: `/home/test/.openclaw/skills`
- Cline: `/home/test/.agents/skills`
- Amp: `/home/test/.config/agents/skills`
- Pi: `/home/test/.pi/agent/skills`
- Windsurf: `/home/test/.codeium/windsurf/skills`
- Roo Code: `/home/test/.roo/skills`
- Kiro CLI: `/home/test/.kiro/skills`

## Implications For `skill-flow`

### Safe to implement now

- A path policy layer that expands home-relative paths for Windows and Linux.
- Windows tests that use `%USERPROFILE%`-style fixture paths.
- XDG-preserving behavior for OpenCode and Amp on both Windows and Linux.
- OpenClaw compatibility fallback support for `.clawdbot` and `.moltbot`.

### Still intentionally deferred

- Replacing XDG-style Windows paths with `AppData`-style paths.
- Claiming these are vendor-official Windows paths.
- Reclassifying Cursor or Kiro away from skills until a later design pass decides to do so.

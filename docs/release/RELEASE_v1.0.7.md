# Skill Flow v1.0.7 Release Notes

Date: 2026-03-24
Version: `v1.0.7`

## Summary

`v1.0.7` turns source installation into a guided flow instead of a one-shot command.

This release adds an interactive `add` experience with skill and agent selection, reuses the same install flow from `find`, and tightens `config` so selection state and layout stay stable in more real-world cases.

## Highlights

### 1. `skill-flow add` is now a guided install flow

`skill-flow add <source>` no longer has to commit immediately with one default selection.

The new flow prepares the source first, then lets the user:

- review discovered skills
- filter and select which skills to enable
- filter and select which agent targets to project to
- see an installation summary before apply
- cancel and roll back the prepared source cleanly

Visible loading states were also added so slower source discovery and target detection are easier to understand.

### 2. Scripted installs can now preselect skills and agents

The CLI now supports:

- `--skill <id>`
- `--agent <target>`
- `--yes`
- `--all`

This makes it possible to drive the new add flow non-interactively while still using the same validation and projection path as the interactive UI.

### 3. `find` now installs through the same flow as `add`

Installing a result from `skill-flow find <query>` now opens the same add flow instead of using a separate install path.

This removes behavior drift between the two commands and gives `find` installs the same selection, summary, warning, and cancellation behavior as direct adds.

### 4. `config` now restores local-only selections correctly

`skill-flow` now persists selected skill IDs separately from enabled target bindings.

This fixes a real state problem: if a source keeps selected skills but currently has no enabled agents, `config` can still restore that selection accurately instead of treating it as empty.

### 5. `config` UI is quieter and more stable

The config interface was aligned with the add flow presentation:

- shared `skill flow` badge header
- dot-based selection markers
- clearer `Select Agents` and `Select Skills` labels
- local checkout path shown in metadata when available
- terminal resize now refreshes pane layout correctly
- low-signal top status text stays hidden by default

## User-visible Behavior Changes

### Add flow

- multi-skill and multi-agent selection is now built into `skill-flow add`
- `Esc` or `q` cancels the prepared install instead of leaving partial imported state behind
- ambiguous `--skill` selectors and unavailable `--agent` targets now fail before projection

### Find flow

- installing from `find` now uses the same guided install flow as direct adds

### Config UI

- sources with no enabled agents can still reopen with their selected skills intact
- the interface reacts correctly to terminal resize
- metadata includes local checkout path when available

## Verification

Commands run:

```bash
npm run build
npm test
```

Result:

```text
15 test files passing
137 tests passing
```

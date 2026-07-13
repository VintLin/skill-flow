# Shared Desktop Suite for Desktop Workspace Memory

Agent Display Visibility and Group Tags must survive switching between production and dev desktop packages (different Bundle IDs). We store this **Desktop Workspace Memory** in a fixed `UserDefaults` suite shared by all Skill Flow desktop packages on the same Mac, rather than elevating it into `~/.skillflow` Shared Skill State.

That keeps CLI/TUI and bridge schemas free of pure UI organization data, while fixing per-Bundle isolation. Theme, language, and other chrome stay on `UserDefaults.standard` (per package). Migration from legacy per-bundle domains is one-shot and non-destructive; concurrent packages use last-write-wins.

## Considered Options

- **Shared Desktop Suite (chosen)** — minimal change, matches “cross-bundle only” goal.
- **Elevate into `preferences.json`** — better for future CLI parity and reinstall survival, but expands shared schema and bridge surface for UI-only fields.
- **Dual-write suite + skill state** — highest consistency cost; deferred unless multi-client need appears.

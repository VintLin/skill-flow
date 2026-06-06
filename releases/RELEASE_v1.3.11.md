# RELEASE v1.3.11

## Summary

- `v1.3.11` adds the macOS Skill group editor and the virtual group runtime behind it.
- Compared with `v1.3.10`, users can create combined Skill groups from skills across sources, merge existing Skill groups, restore merged groups, and distinguish similarly named items by localized source author labels.

## Highlights

### 1. Skill groups can be composed and merged

- The macOS home header now includes a Skill group editor entry with the same toolbar style as the existing header actions.
- The editor supports creating a new combined group from selected skills across different groups.
- Existing groups can be merged and later restored through the same editor flow.
- Combined groups keep the user-entered display name instead of exposing internal virtual group identifiers.

### 2. Virtual groups are backed by shared runtime state

- Storage now persists virtual group definitions alongside the existing source state.
- Query runtime and CLI bridge commands can create, merge, restore, and deploy virtual groups.
- Desktop bridge payloads expose the new operations to the macOS app.
- Deployment planning keeps virtual group source bindings synchronized with selected skills and targets.

### 3. Editor loading and search are easier to use

- Opening the editor now shows the sheet immediately, then loads group and skill options asynchronously.
- Switching editor tabs reuses the prepared option snapshot instead of recomputing group cards each time.
- Skill search can filter by author, group, or skill name.
- Local and combined author labels are localized, including `本地` / `local` and `组合` / `combined`.

### 4. State schema v2 migration

- State schema v2 migrates Skill Flow's persisted state under `~/.skillflow`.
- Legacy state is only readable by the migration command and migration status inspection.
- Run `skill-flow migrate-state --to v2 --dry-run` before applying migration.
- Migration creates a backup of the state root, prunes rebuildable cache, and keeps target directories as deployment outputs rather than state authority.

## User-visible changes

- The group editor no longer shows target selection in create and merge views.
- Newly opened create flows start with no selected skills or targets.
- Merge mode labels its list as Skill groups and shows each group's source author.
- The editor layout uses the app background and card surface colors, and the skill list stretches to reduce empty footer space.

## Release Artifacts

- `skill-flow-1.3.11.tgz`
- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

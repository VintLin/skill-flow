# Changelog

All notable changes to `skill-flow` will be documented in this file.

## v1.0.6 - 2026-03-23

### Changed

- Normalized `add --path` handling so stored requested paths and preselection state stay predictable.
- Added an explicit preselection warning when `add` only scopes the default selection to a subpath.
- Cleaned up generated `find` follow-up commands so root-scoped skills do not emit `--path .`.
- Simplified the `config` top bar so stable-state action hints and low-signal status text are hidden by default.
- Kept the `Skill Flow` title visually stable by rendering it separately from transient status colors.

### Verification

- `npm run build`
- `npm test -- src/tests/add-selection-and-find-command.test.ts src/tests/find-and-naming-utils.test.ts src/tests/source-lifecycle.test.ts src/tests/skill-flow.test.ts`

## v1.0.5 - 2026-03-23

### Changed

- Added `skill-flow add <slug> --from clawhub` support.
- Aligned CLI `--version` output with `package.json`.
- Clarified import-path behavior in the workflow documentation.

### Fixed

- Fixed SSH GitHub locators like `git@github.com:owner/repo.git` being normalized into invalid HTTPS clone URLs.
- Fixed GitHub tree URL imports so `--path` is resolved relative to the tree location.
- Fixed `repair-state` reporting negative removed deployment counts when rebuilding state.

### Verification

- `npm run build`
- `npm test`
- Real CLI smoke tests for:
  - `npm run dev -- --version`
  - `npm run dev -- add find-skills-skill --from clawhub`
  - `npm run dev -- add https://github.com/JimLiu/baoyu-skills/tree/main/skills --path baoyu-translate`

## v1.0.4 - 2026-03-22

### Added

- Added first-class `local` source support under `~/.skillflow/source/local/<source-id>/`.
- Added `WorkspaceBootstrapService` to unify config startup checks, unmanaged skill discovery, import, reconciliation, and audit.
- Added render-first `config` bootstrap with visible boot log output.
- Added render-first `find` flow so search no longer blocks before the UI appears.
- Added persisted source selection mode (`all` vs `partial`) so update behavior for newly discovered skills is deterministic.
- Added bootstrap detection for symlinked skill directories inside known agent roots.

### Changed

- `add <source>` now supports local path, Git, and ClawHub through one ingestion model.
- `config` now performs startup bootstrap before entering the main UI:
  - detect available targets
  - scan agent `skills/` roots
  - import unmanaged external skills into local source storage
  - reconcile inventory
  - normalize bindings
  - audit current projections
- Group display labels now show explicit source context:
  - local: `<name>@local`
  - git: `<repo>@<owner>`
  - clawhub: `<slug>@clawhub`
- Workflow health now incorporates audit results in addition to inventory and metadata state.
- README and README.zh now document local sources, config bootstrap, and unmanaged-skill adoption behavior.

### Fixed

- Fixed `config` and `find` showing no visible progress during slow startup/search work.
- Fixed bootstrap missing agent-root skills that are exposed as symlinks to directories.
- Fixed unmanaged-skill detection to respect target path environment overrides.
- Fixed update replay behavior for newly added skills by preserving source selection intent.
- Fixed real-state bootstrap behavior so already-managed projections are skipped instead of being re-imported.

### Verification

- `npm run build`
- `npm test`
- Test suite passing: `57/57`

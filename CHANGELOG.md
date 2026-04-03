# Changelog

All notable changes to `skill-flow` will be documented in this file.

## v1.3.2 - 2026-04-03

### Added

- Added GitLab archive fallback support for Git-based source imports so GUI and shared runtime flows can still continue when direct clone handling is not available.

### Changed

- Updated the CLI and all internal workspace packages from `1.3.1` to `1.3.2`.
- Included `README.md`, `README.zh.md`, and `LICENSE` in the published CLI package and added release sync helpers to keep those files aligned during pack flows.
- Expanded query, integration, core-engine, and CLI coverage around source lifecycle, naming, preview, and package output behavior.

### Fixed

- Fixed GUI import flows so GitLab sources can complete through the same shared runtime path used by other source types.
- Fixed add preview handling to tolerate legacy lock files instead of failing before projection state is prepared.
- Fixed query source lifecycle tests so they stay isolated from network state during verification.

## v1.3.1 - 2026-04-02

### Changed

- Added a clearer project-scope entry point on the macOS home screen, including tighter menu bar icon coverage around scope state changes.
- Unified desktop group card presentation rules across Home, menu, and import contexts, so compact sizing, loading states, and supporting UI elements stay consistent.
- Polished desktop tag interactions and update-related coverage with cleaner tag presentation, hover-based add affordances, and synchronized release metadata checks.

## v1.3.0 - 2026-04-01

### Added

- The macOS desktop app now supports project-scoped skill views, so you can switch between a global setup and a specific project without mixing drafts and selections together.
- The desktop home screen now shows recent projects, including detected OpenCode workspaces, making it faster to jump back into work you opened recently.
- Local skill groups now show clearer source metadata and preview context, so it is easier to tell whether a group comes from a local install and where it lives.

### Changed

- Home controls on macOS are easier to use, with clearer project scope entry points, larger click targets, and smoother card selection.
- Detail pages on macOS feel more stable during navigation, with faster markdown loading and less jarring refresh behavior when switching between groups.
- The desktop interface now uses more motion and visual feedback across cards, tags, toolbars, settings, and detail navigation, making the app feel more responsive without changing the workflow.

### Fixed

- Fixed cases where global actions could accidentally clear project-specific state.
- Fixed recent-project tracking so the same project is recognized more reliably from normalized paths.
- Fixed markdown detail rendering so content updates refresh correctly and previous scroll position is preserved more consistently.
- Fixed import flows so groups that are already installed locally are shown more clearly and no longer invite redundant import actions.

## v1.2.0 - 2026-03-31

### Changed

- Bumped the CLI and all internal workspace packages from `1.1.0` to `1.2.0`.
- Expanded the macOS release helpers so one release flow can produce Apple Silicon, Intel, and universal installers.
- Reduced redundant packaging work by reusing a single workspace JS build across batch desktop packaging.

### Release Artifacts

- Built and validated macOS desktop release artifacts for `arm64`, `x86_64`, and `universal`.
- Generated release `.dmg`, `.zip`, and `sha256.txt` files for all three desktop targets under `dist/desktop-mac/`.

### Verification

- `npm run build`
- `scripts/release/release-github.sh all`

## v1.1.0 - 2026-03-29

### Added

- Added the monorepo package split around `apps/cli`, `packages/core-engine`, `packages/query`, `packages/shared-types`, `packages/tui`, and `apps/desktop-mac`.
- Added the versioned machine bridge protocol and the `skill-flow bridge --json` entrypoint used by the macOS desktop shell.
- Added the rebuilt macOS desktop surface with home, import, detail, settings, and menu bar quick config flows.

### Changed

- Moved root build and test execution to workspace-aware monorepo scripts.
- GitHub sources now fall back to downloaded ZIP archives when `git` is unavailable, while non-GitHub Git sources still require `git`.
- Desktop bridge failures now surface actionable dependency guidance for missing `node`, `git`, and `npx` and point to the README prerequisites section.
- Updated project documentation to match the current CLI, bridge, desktop, and packaging structure.

### Verification

- `npm run build`
- `npm test`
- `swift build` in `apps/desktop-mac`
- `swift test` in `apps/desktop-mac`

## v1.0.8 - 2026-03-25

### Changed

- `skill-flow add` now hides low-signal duplicate warnings when generated agent skill mirrors are skipped in favor of canonical `source/skills/*` entries.

### Fixed

- Fixed source import so failed `add` attempts no longer remove an existing checkout path.
- Fixed managed cleanup guards so uninstall, config bootstrap pruning, and deployment updates refuse to delete managed roots themselves or unmanaged paths outside the recorded target/source roots.
- Fixed cleanup flows so existing deployments can still be removed after a target root changes by preserving the original managed root in lock state.
- Fixed the file-URL compatibility test to use the sandbox state root, so the full test suite no longer depends on write access to `~/.skillflow`.

### Verification

- `npm run build`
- `npm test`

## v1.0.7 - 2026-03-24

### Added

- Added an interactive `skill-flow add` flow with searchable multi-select steps for skills and agent targets, visible loading phases, an installation summary, and rollback on cancel.
- Added `skill-flow add --skill <id>`, `--agent <target>`, `--yes`, and `--all` so scripted installs can preselect or skip prompts.

### Changed

- `find` now hands candidate installs to the same add flow used by `skill-flow add`, so install behavior, prompts, and completion output stay consistent.
- `config` now uses the same header and selection language as the add flow, refreshes layout on terminal resize, and shows local checkout paths in metadata.

### Fixed

- Fixed config draft restoration so selected skills are preserved even when a source currently has no enabled agent targets.
- Fixed add preparation to reject ambiguous skill selectors and unavailable agent targets before projection, while keeping prepared sources rollback-safe.
- Fixed rendered add installs to avoid duplicate completion output and reduced low-signal status noise in the config header.

### Verification

- `npm run build`
- `npm test`

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

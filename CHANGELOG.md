# Changelog

All notable changes to `skill-flow` will be documented in this file.

## v1.4.1 - 2026-06-08

### Changed

- Updated the CLI and all internal workspace packages from `1.4.0` to `1.4.1`.

### Fixed

- Fixed macOS Skill group tags so default recommendation tags are persisted as normal editable tags instead of being recalculated on refresh.
- Fixed group tag storage to use stable GitHub repository, locator, or source keys so refreshed group data no longer makes tags disappear or change unexpectedly.
- Fixed imported recommendation identity matching for GitHub HTTPS, SSH, shorthand, and trailing-slash locator forms.

## v1.4.0 - 2026-06-08

### Added

- Added built-in MiniMax Code target support for deploying selected skills to `~/.minimax/skills/`, displaying `.mavis/skills/` as its project path, and discovering `.mavis/skills` source layouts.
- Added the `migrate-state --to v2` CLI flow, migration status inspection, and state authority rebuild coverage so existing Skill Flow installs can move into the v2 state layout explicitly.
- Added a dedicated import-preparation cache and stale-preparation recovery flow across query runtime, CLI bridge, and desktop bridge paths.
- Added curated recommendation metadata, localized recommendation copy, and recommendation ordering tests for the macOS import screen.

### Changed

- Updated the CLI and all internal workspace packages from `1.3.11` to `1.4.0`.
- Replaced the old `*-v2` state authority/service surface with the current `state-store`, `state-schema`, projection, and source-authority modules as the single runtime path.
- Changed desktop import behavior so group import always operates on the full group, while skill and agent choices only control post-import selection state.
- Changed the macOS import screen to use one grid layout for recommendations, search results, and local scan results, with clearer import button states and localized local-scan metadata.
- Changed recommended groups to expose only one preset tag by default, so import-page badges and imported local group tags stay aligned.

### Fixed

- Fixed import-page auto preview and local preview paths so entering the import screen no longer eagerly prepares downloads or creates `catalog/import-preparations` cache entries.
- Fixed stale import preparation handling so desktop import retries can recover from missing or expired prepared sources instead of failing silently.
- Fixed import cards that stayed stuck in `Loading skills...` when preview state was idle or when legacy `previewState` fields leaked through candidate payloads.
- Fixed local-scan import cards so source agents stay visible and locked appropriately, local-scan subtitles are localized, and empty header spacing no longer appears between summary lines and the divider.
- Fixed recommended-group import tagging so imported local groups no longer receive hidden secondary recommendation tags that the UI does not show.

## v1.3.11 - 2026-06-03

### Added

- Added a macOS Skill group editor entry in the home header for creating combined groups, merging existing groups, and restoring merged groups.
- Added virtual Skill group support across storage, query runtime, CLI bridge commands, desktop bridge payloads, and deployment planning.
- Added search inside the Skill group editor so users can filter by author, group, and skill names before selecting items.

### Changed

- Updated the CLI and all internal workspace packages from `1.3.10` to `1.3.11`.
- Changed the group editor to open immediately with a loading state while the available group and skill data is prepared.
- Changed local and combined group author labels to use localized display names, including `本地` / `local` and `组合` / `combined`.
- Changed merged group selection copy and rows so group authors are visible when similarly named Skill groups are listed.

### Fixed

- Fixed virtual Skill group display names so combined groups keep the user-entered group name instead of showing storage identifiers such as `virtual:skills-2`.
- Fixed group editor tab switching so it reuses a prepared snapshot instead of recomputing group cards during each mode change.
- Fixed editor layout spacing so the skill list can stretch before the footer actions instead of leaving excess empty space.
- Fixed source and deployment synchronization for virtual groups so selected skills and targets are cleared and restored consistently.

## v1.3.10 - 2026-05-31

### Added

- Added persisted original Skill group names so renamed groups can still expose the import-time name in the macOS desktop UI.
- Added home-card and detail-header original-name indicators that appear only after a Skill group has been renamed.
- Added Skill group renaming from the macOS detail page, using the same bridge/runtime rename path as the home page.

### Changed

- Updated the CLI and all internal workspace packages from `1.3.9` to `1.3.10`.
- Changed blank Skill group rename submissions to restore the original import-time name.
- Changed desktop Skill group titles to prefer the app-level source display name over `SKILL.md` metadata titles, so metadata edits do not rename groups inside Skill Flow.
- Moved the Skill Flow brand out of the sidebar and into the home header search row to avoid truncation near macOS window controls.

### Fixed

- Fixed legacy imported sources whose original group name could be backfilled from a `SKILL.md` metadata title instead of the import name.
- Fixed original-name hover behavior so the tooltip shows immediately and contains only the original name.
- Fixed the rename dialog so it no longer shows extra reset-hint text.
- Fixed macOS release packaging so the desktop bridge helper is bundled without unnecessary CLI dependencies, npm documentation, or an extra executable copy.

## v1.3.9 - 2026-05-30

### Added

- Added Skill group renaming in the macOS desktop app, with bridge/runtime support and cache handling so custom names persist across refreshed source data.
- Added home-page import handoff for supported source links, including GitHub and GitLab locator forms, so pasted import links can open the import preview directly.
- Added the macOS home sidebar for filtering Skill groups by status, source type, tags, agent applicability, and project scope.

### Changed

- Updated the CLI and all internal workspace packages from `1.3.8` to `1.3.9`.
- Redesigned the macOS home sidebar with a white/surface background, collapsed-by-default filter rows, wrapping expanded chips, full sidebar collapse, and integrated header controls.
- Renamed the Chinese status filter label from `常用` to `置顶` while keeping the pinned concept aligned with existing English and Japanese copy.
- Expanded the macOS home grid when the sidebar is fully collapsed so wider windows can show more cards.

### Fixed

- Fixed sidebar chip prefixes so only tag chips use `#`; source, status, agent, and project options now use plain labels.
- Fixed macOS hidden-titlebar controls so app header buttons remain clickable, traffic-light buttons stay aligned after resize/full-screen transitions, and the app logo/title keep spacing from system buttons.
- Fixed GitLab subgroup locator parsing and archive fallback behavior across backend and import-preview handoff paths.
- Fixed duplicate detail enrichment fetches and stale source-rename responses that could overwrite newer desktop state.
- Improved macOS dev packaging by reusing a valid installed or cached bundled Node runtime before downloading again.

## v1.3.8 - 2026-05-27

### Changed

- Updated the CLI and all internal workspace packages from `1.3.7` to `1.3.8`.
- Local import previews now display skill card names from `SKILL.md` frontmatter `name` before falling back to folder names, OpenAI display metadata, or Markdown headings.

### Fixed

- Fixed local import paths wrapped in single or double quotes so paths copied from shells can be pasted into the desktop import page directly.
- Fixed local import preview selections so nested or similarly named skills resolve by stable relative paths instead of ambiguous display selectors.
- Fixed Hermes Agent icon rendering in desktop group cards and target controls.

## v1.3.7 - 2026-05-07

### Added

- Added built-in Hermes Agent target support for deploying selected skills to `~/.hermes/skills/`.
- Added Hermes Agent desktop labeling, ordering, and icon support alongside the existing built-in agent targets.
- Added `.hermes/skills` source discovery so repositories that already organize skills for Hermes are detected consistently.

### Changed

- Updated the CLI and all internal workspace packages from `1.3.6` to `1.3.7`.
- Updated supported-target documentation to include Hermes Agent in the built-in target list.

### Fixed

- Avoided treating Hermes Agent as a custom-only target now that its writable skills directory is part of the built-in target catalog.

## v1.3.6 - 2026-04-30

### Added

- Added a bundled Node.js `v22.22.2` runtime to macOS desktop release packages so Finder launch no longer depends on shell-managed `node` paths.
- Added package validation that checks bundled Node runtimes for every expected app architecture.
- Added a compact project refresh action beside the macOS home scope switcher so users can rescan recently detected projects without leaving the home screen.

### Changed

- Updated the CLI and all internal workspace packages from `1.3.5` to `1.3.6`.
- Changed Application Update checks to use the GitHub Releases latest redirect instead of the GitHub API.
- Application Update now distinguishes local builds that are newer than the latest published GitHub release.
- Project refresh now uses the same loading, success, and failure toast feedback pattern as skill group updates.

### Fixed

- Fixed the `asdf` / `nvm` desktop launch path where double-click startup could report missing Node.js even though terminal launch worked.
- Fixed Application Update copy that could report an older GitHub release as the current version when the local app build was ahead.
- Fixed silent startup update checks that could consume GitHub requests and leave Settings in a failed update state before the user pressed Check.

## v1.3.5 - 2026-04-12

### Added

- Added a staged CLI publish flow so the npm release now comes from a dedicated publish directory with a sanitized manifest.
- Added a publish guard that blocks direct npm publishing from the source workspace package when internal `@skill-flow/*` dependencies are still present.

### Changed

- Updated the CLI and all internal workspace packages from `1.3.4` to `1.3.5`.
- Expanded npm release verification so it covers the staged publish manifest in addition to the packed tarball.

### Fixed

- Fixed the npm release path so registry metadata no longer advertises unpublished internal workspace packages for the public `skill-flow` package.
- Fixed the regression where `skill-flow@1.3.4` still failed on `npm install -g skill-flow` even though the tarball contents had already been corrected.

## v1.3.4 - 2026-04-09

### Added

- Added a publish-safe CLI packaging flow so the released npm package now carries the internal runtime code it needs instead of depending on unpublished workspace packages.
- Added release verification coverage for package output and workspace version alignment to make broken npm releases less likely.

### Changed

- Updated the CLI and all internal workspace packages from `1.3.3` to `1.3.4`.
- Tightened the npm publish path so the packed `skill-flow` manifest only exposes public runtime dependencies.
- Updated release notes to explain the install repair from the perspective of users upgrading from `v1.3.3`.

### Fixed

- Fixed `npm install -g skill-flow` failing with `E404` when npm attempted to resolve internal `@skill-flow/*` packages from the public registry.
- Fixed the published CLI tarball so a fresh global install now completes and the installed `skill-flow` binary starts normally.

## v1.3.3 - 2026-04-08

### Added

- Added built-in `Trae` target support across CLI, shared runtime, desktop labels, and icon assets.

### Changed

- Updated the CLI and all internal workspace packages from `1.3.2` to `1.3.3`.
- Unified built-in target metadata and custom target handling across bridge, runtime, TUI, storage, and desktop settings flows so agent lists, labels, ordering, and documented paths stay aligned.
- Expanded CLI, shared-types, storage, query, and desktop coverage around target definitions, custom target persistence, bridge payloads, and settings interactions.

### Fixed

- Fixed desktop editable tag cards so the add affordance remains available even when a group currently has no tags.

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

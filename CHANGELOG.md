# Changelog

All notable changes to `skill-flow` will be documented in this file.

## Unreleased

## v1.6.3 - 2026-08-30

### Added

- Added a responsive daily activity calendar with rolling 12-month and calendar-year views, localized month and weekday labels, and per-day Skill invocation tooltips.

### Changed

- Updated the CLI and all internal workspace packages from `1.6.2` to `1.6.3`.
- Localized the remaining desktop interface copy and fallback labels in English, Simplified Chinese, and Japanese.
- Moved Usage range controls into the Daily Trend heading so they only affect the trend chart.

### Fixed

- Centered the Usage dashboard at its maximum content width while keeping the vertical scroll indicator aligned to the window edge.
- Loaded long-range activity history independently from Daily Trend filters so switching trend ranges no longer changes the activity calendar.

## v1.6.2 - 2026-08-29

### Changed

- Updated the CLI and all internal workspace packages from `1.6.1` to `1.6.2`.
- Reduced desktop launch and home-screen work through cached workspace bootstrap, shared card projections, precomputed sorting, bounded geometry tracking, and cached visual metadata.
- Parallelized independent update checks and import preparation with bounded concurrency while preserving serial recovery-journal commits.
- Simplified import discovery, runtime mutation, desktop parsing, detail enrichment, and persisted cache boundaries by removing superseded compatibility paths and dead state.
- Reduced Detail, Usage, Settings, and Import rendering work through bounded revisions, indexed heatmap activity, localized hover state, and visible-card prefetching.
- Skill and target toggles now finish immediately after Apply completes instead of enforcing an artificial delay.

- Local Skill scan bridge responses now expose only `localScanGroups`, and the macOS app consumes their final import-choice shape directly.
- Local Skill scan now derives groups only from observed local paths and content hashes; legacy Agents lock origin inference is no longer part of scan behavior.
- Removed unused persisted local import-choice snapshots from preferences; migration and settings writes now discard those rebuildable legacy fields.
- Simplified disposable import preparation records to retain only checkout, lifecycle, retry, and recovery evidence.
- Replaced the unused multi-provider import repository cache envelope with direct Skills source snapshots.
- Recommendation loading now resolves all feeds and cached source cards from one cache read instead of serializing repeated full-file reads.
- Removed the superseded RuntimeManifestView mutation helper chain now that source authority and deployment reconciliation own final mutations.
- Exact GitHub import searches now use ImportDiscovery caching, stale fallback, and in-flight request sharing instead of bypassing the discovery boundary.
- Removed obsolete whole-cache and update-preflight entry points superseded by granular cache writes and structured update prechecks.
- Import Data cache entries now persist only expiry and consumed payloads; query/feed/repository keys no longer duplicate identity or unused timestamps inside each entry.
- Desktop import locator and detail document parsing now have dedicated owners instead of compatibility copies on the app-wide view model.
- Desktop detail titles now use the production title policy directly, including polluted shell-output rejection and normalized repository or ClawHub fallbacks.
- Desktop document Tab/Descriptor conversion now lives on the document models instead of duplicated app-wide view-model helpers.
- Desktop detail caching now uses one comprehensive revision policy, including nested stats, file-tree, document, target, and Skill presentation changes.
- Desktop file-tree documents now render directly from tree items without unused line models or placeholder conversion adapters.
- Desktop Home cards and Detail views now share one single-flight enrichment cache and recursive overlay policy, avoiding duplicate requests and stale appended leaf payloads.
- Removed superseded update parsing, file-tree, toast, uninstall-selection, and label helpers from the desktop app-wide view model.
- Removed unused Import/GitHub integration exports and a stale handwritten declaration that no longer matched the TypeScript implementation.

### Fixed

- Desktop detail links now reject sibling directories whose names merely share the managed repository path prefix.
- Detail views now publish completion when background warmup finishes, preventing stale loading state without refreshing Home.

## v1.6.1 - 2026-08-27

### Changed

- Updated the CLI and all internal workspace packages from `1.6.0` to `1.6.1`.
- Simplified macOS Usage navigation so the home toolbar is the single entry point.

### Fixed

- Removed the duplicate Usage Analytics card from the macOS home sidebar.

## v1.6.0 - 2026-08-24

### Added

- Added local Skill Usage collection across supported Agent session and trace formats, with modular collectors for Codex, Claude Code, ZCode, OpenCode, Pi, Kimi Code, and WorkBuddy evidence sources.
- Added a desktop Usage dashboard with time-range presets, hourly activity, daily trends, Skill and Agent filtering, usage totals, and top-Skill and top-Agent rankings.
- Added persisted Usage observations and a shared analytics snapshot contract for CLI bridge and desktop consumers.

### Changed

- Updated the CLI and all internal workspace packages from `1.5.10` to `1.6.0`.
- Skill runs now use explicit Agent-specific evidence rules and count every accepted invocation without de-duplicating the total run metric.
- Usage collection remains local and only extracts whitelisted metadata required for Skill, Agent, time, project, and session attribution.

### Fixed

- Fixed Codex Usage coverage so active and archived sessions are both scanned without treating generic tool calls as Skill invocations.
- Fixed ZCode, OpenCode, and WorkBuddy parsing so only completed, attributable Skill calls enter the primary count.
- Fixed Usage chart reconciliation, heatmap sizing, trend tooltip positioning, and Skill/Agent filter totals in the macOS dashboard.

## v1.5.10 - 2026-08-22

### Added

- Added macOS Quit recovery for protected update and final import operations.
- Added recovery journal validation for managed checkouts, authority snapshots, import preparation state, and owned target projections.

### Changed

- Updated the CLI and all internal workspace packages from `1.5.9` to `1.5.10`.
- Desktop final import now commits through the explicit prepare/commit boundary used by the recovery workflow.
- Desktop Quit now cancels active managed helpers and blocks new protected mutations until interrupted recovery is resolved.

### Fixed

- Fixed interrupted desktop updates and imports leaving the app unable to distinguish committed state from incomplete work.
- Fixed target recovery so externally changed target files produce `RECOVERY_TARGET_CONFLICT` instead of being overwritten.
- Fixed desktop helper timeout handling so ordinary command timeouts keep helper-only termination while Quit cancellation stops the full helper process group.

## v1.5.9 - 2026-08-21

### Changed

- Updated the CLI and all internal workspace packages from `1.5.8` to `1.5.9`.
- Unified managed checkout ownership, canonical path, symlink, and branch identity handling for Git source lifecycle operations.

### Fixed

- Fixed batch Git source updates so each successful source persists its checkout and lock state before later sources continue.
- Fixed rollback handling so checkout cleanup, lock restoration, and source authority write failures preserve enough context to recover safely.
- Fixed GitHub source import fallback by trying SSH, HTTPS, and archive download paths consistently.

## v1.5.8 - 2026-08-16

### Added

- Added externally managed skill sources with explicit adoption, observation, version checks, and confirmation-gated update delegation.
- Added CLI and bridge commands for adopting, inspecting, configuring, updating, and removing external sources.

### Changed

- External source paths are now kept outside Skill Flow ownership: they are never copied, linked, deployed, repaired, or deleted by managed lifecycle operations.
- Added collision blocking when a managed projection would overwrite an externally observed path.
- Updated the CLI and all internal workspace packages from `1.5.7` to `1.5.8`.

### Fixed

- Fixed externally installed skills being treated as Skill Flow-managed sources, which could create a divergent checkout and bypass the tool's official update path (#12).

## v1.5.7 - 2026-08-16

### Added

- Added a Git source fast path that skips refetching when the remote default HEAD is unchanged and the managed checkout still matches its locked leaf hashes.
- Added explicit repair results and audit details for missing or drifted managed checkouts, including CLI, TUI, and desktop feedback.

### Changed

- Git remote preflight now uses a single short timeout and falls back conservatively to a full update when verification is unavailable.
- Managed skill leaf hashing now accounts for safe relative symlinks and rejects absolute or escaping symlinks before deployment.
- Updated the CLI and all internal workspace packages from `1.5.6` to `1.5.7`.

### Fixed

- Fixed unchanged remote sources being skipped even when their local managed checkout was missing, incomplete, or locally modified.

## v1.5.6 - 2026-07-18

### Added

- Added a dedicated deployment reconciler in the shared query runtime, with focused coverage for deployment state coordination.
- Added centralized bridge payload decoding and tests for the supported desktop payload shapes.

### Changed

- Narrowed desktop query and command facades so runtime dependencies and bridge responsibilities are explicit.
- Reduced reverse dependencies in desktop detail, import, collection, and main view-model logic while preserving the existing user workflows.
- Updated the CLI and all internal workspace packages from `1.5.5` to `1.5.6`.

### Fixed

- Improved consistency of desktop deployment reconciliation and bridge-backed state transitions through the refactored runtime seams.

## v1.5.5 - 2026-07-13

### Changed

- Updated the CLI and all internal workspace packages from `1.5.4` to `1.5.5`.
- Extended desktop bridge network timeout for `update` and `add` (5 minutes) and raised provider/archive fetch budgets for unstable networks.
- Multi-source skill-group updates continue when individual groups fail and report typed partial results (`failed[]`, `status: partial`).
- Extracted desktop `GroupOperationCoordinator` as the sole owner of update/import queue drain and card phase publishing.

### Fixed

- Fixed online skill update/import failures caused by short default timeouts (#10).
- Fixed multi-group update paths that could leave checkout disk state and lock metadata inconsistent when a later group failed.
- Fixed bulk update toasts that could claim full success when some groups failed.
- Added git command timeouts and retries for transient clone/archive network errors.

## v1.5.4 - 2026-07-13

### Added

- Added built-in Grok Build deployment target (`grok-build`) with managed global path `~/.grok/skills/` and documented project path `.grok/skills/`.
- Added a session-scoped desktop Group Operation Queue so users can enqueue multiple skill-group updates and imports without waiting for the current job to finish.
- Added per-card Queued vs Running feedback for desktop update and import operations.
- Added Shared Desktop Suite storage for Desktop Workspace Memory (agent display visibility and group tags) so production and dev desktop packages share organization state on one Mac.

### Changed

- Updated the CLI and all internal workspace packages from `1.5.3` to `1.5.4`.
- Changed desktop bridge mutations to serialize instead of rejecting concurrent writes.
- Changed Home Update All to enqueue as one bulk update that absorbs matching single-group updates already in the queue.
- Changed desktop group-card detail open to the header region (title / byline / stats) instead of the whole card.

### Fixed

- Fixed multi-group update and import flows that blocked or failed after the first concurrent action.
- Fixed accidental detail navigation when interacting with agents, skills, or tags on a group card.

## v1.5.3 - 2026-07-01

### Added

- Added a shared bridge command catalog fixture that is checked by both TypeScript and Swift tests.

### Changed

- Updated the CLI and all internal workspace packages from `1.5.2` to `1.5.3`.
- Changed CLI bridge dispatch to use a handler table derived from the shared command catalog.
- Moved desktop bridge timeout metadata next to the Swift `BridgeCommand` model.

### Fixed

- Fixed bridge command drift risk by keeping TypeScript command parsing, CLI handlers, and Swift commands covered by the same catalog.

## v1.5.2 - 2026-06-29

### Added

- Added CLI migration and source-management commands for warning visibility, group enablement, all-skill target selection, and manifest imports.

### Changed

- Updated the CLI and all internal workspace packages from `1.5.1` to `1.5.2`.
- Changed desktop update checks to prefer GitHub Release data from the GitHub CLI when available.

### Fixed

- Fixed empty CLI selections after duplicate filtering so invalid target updates are rejected cleanly.
- Fixed detected agent refresh so desktop target lists stay aligned after local agent roots change.
- Fixed built-in agent detection so agents installed at root directories are discovered.

## v1.5.1 - 2026-06-25

### Changed

- Updated the CLI and all internal workspace packages from `1.5.0` to `1.5.1`.

### Fixed

- Fixed local scan import so skills imported from agent target directories are replaced by managed symlinks, while skills imported from manual local directories keep their original source directory unchanged.
- Fixed local scan import symlink replacement so the replacement decision stays local to the import cleanup path and does not change persisted observed-target metadata.

## v1.5.0 - 2026-06-24

### Added

- Added an in-app DMG update flow in the macOS desktop app: Settings now surfaces the latest release, lets users trigger an in-place DMG install, and re-launches the app when the new version is ready.
- Added localized install confirmation copy for the desktop update flow (English, Simplified Chinese, Japanese).
- Added a release process document describing the GitHub Release pipeline used to ship desktop artifacts.

### Changed

- Updated the CLI and all internal workspace packages from `1.4.9` to `1.5.0`.

### Fixed

- Fixed macOS import target projection so the visible agent list matches the targets recommended to users.
- Fixed macOS import target filtering so fallback targets are not silently dropped.
- Fixed macOS import page agent visibility so locally managed targets remain selectable.
- Fixed WorkBuddy and Kimi Code icon rendering in the macOS agent selector.
- Fixed the `doctor` service so missing managed target roots no longer fail the diagnosis.
- Fixed macOS update installer validation to reject unsupported payloads and keep DMG paths inside the expected staging directory.

## v1.4.9 - 2026-06-23

### Added

- Added Kimi Code, WorkBuddy, and CodeBuddy as built-in deployment targets.
- Added bundled macOS target icons for Kimi Code and CodeBuddy, with WorkBuddy sharing the CodeBuddy icon.

### Changed

- Updated the CLI and all internal workspace packages from `1.4.8` to `1.4.9`.
- Changed the default built-in target order across CLI, bridge, and macOS desktop surfaces.
- Changed built-in target detection so detection roots can differ from managed write roots.

### Fixed

- Fixed deployment to create missing managed target roots before writing skills.
- Fixed macOS import target lists so visible fallback targets are enforced while local source targets remain available.

## v1.4.8 - 2026-06-23

### Changed

- Updated the CLI and all internal workspace packages from `1.4.7` to `1.4.8`.
- Changed macOS target icons to use consistent cropped and padded rendering.

### Fixed

- Fixed macOS home and import search fields so users can clear active search text directly from the field.
- Fixed macOS home search results so matching skills inside a group are highlighted and sorted ahead of non-matching skills.
- Fixed macOS import success refresh so it keeps the user on the import page and preserves prepared recommendation card details.

## v1.4.7 - 2026-06-20

### Changed

- Updated the CLI and all internal workspace packages from `1.4.6` to `1.4.7`.
- Changed macOS import warning presentation so selector-drift warnings prefer the aggregate downloaded-group fallback message when both aggregate and per-selector warnings are present.

### Fixed

- Fixed macOS Skill group imports so stale or missing selected skill selectors no longer block a group that downloaded successfully.
- Fixed desktop import failure and warning messages so user-visible toasts and import-card summaries show numeric issue codes instead of internal bridge or selector code strings.
- Fixed structured bridge failure handling across import, collection, source operation, and project refresh paths so internal command codes are mapped through the shared issue presentation catalog.

## v1.4.6 - 2026-06-19

### Added

- Added ZCode as a desktop deployment target so Skill groups can be deployed into ZCode's local skill directory.

### Changed

- Updated the CLI and all internal workspace packages from `1.4.5` to `1.4.6`.
- Changed macOS desktop state management so home, import, detail, collection, and source operations share the split view-model state paths without parallel route or import state.

### Fixed

- Fixed macOS desktop group tags after app updates so saved tags migrate from legacy source, locator, and repository keys into the stable tag store instead of disappearing from installed Skill groups.
- Fixed combined Skill group cards so their visible tags are derived from member groups, merged in order, de-duplicated, and capped at the normal tag limit.
- Fixed macOS import installed-state refresh, collection display names, detail document caching, renamed group title stability, project-scoped deployment rows, and recently-updated indicators after source refreshes.

## v1.4.5 - 2026-06-15

### Changed

- Updated the CLI and all internal workspace packages from `1.4.4` to `1.4.5`.
- Changed app bootstrap so installed builds register the built-in `skill-flow` group from packaged resources instead of requiring a manual local import.
- Changed CLI publish staging and macOS desktop helper packaging so the built-in `skills/skill-flow` resource ships with release artifacts.

### Fixed

- Fixed fresh installs where the home page could not show the built-in `skill-flow` group because the packaged app had no runtime-managed local source yet.
- Fixed built-in group bootstrap after missing-checkout pruning so the `skill-flow` group can be re-registered automatically without enabling any skills or targets.

## v1.4.4 - 2026-06-14

### Changed

- Updated the CLI and all internal workspace packages from `1.4.3` to `1.4.4`.
- Changed macOS desktop import bridge requests to use a longer timeout for import search, preview, preparation, commit, and source import commands.

### Fixed

- Fixed first-run macOS group imports that could wait on slow provider or checkout work and then fail with a generic bridge timeout before the import runtime returned a structured result.
- Fixed recommended import cards so recommendation decoration preserves the need to load skill details before import.

## v1.4.3 - 2026-06-11

### Changed

- Updated the CLI and all internal workspace packages from `1.4.2` to `1.4.3`.
- Tightened the macOS import preview protocol so preview skills use explicit `providerSkillId`, `uiId`, `selector`, and `selectorAliases` fields.

### Fixed

- Fixed importing a single selected skill from GitHub skill groups when the preview selector path differs from the visible skill id.
- Fixed `VintLin/action-browser` search previews so root-level skills appear in the Group Card instead of rendering an empty skill list.
- Fixed legacy or incomplete preview skill payloads so the import page fails with a clear invalid-preview state instead of silently guessing selectors.

## v1.4.2 - 2026-06-10

### Changed

- Updated the CLI and all internal workspace packages from `1.4.1` to `1.4.2`.
- Changed macOS Skill group cards so the visible skill count is derived from rendered skills instead of cached snapshot statistics.
- Changed original-name hover popovers to keep a short dismiss grace period so tiny pointer movement does not replay the tooltip animation.

### Fixed

- Fixed stale Skill group counts after refreshing a group whose selected skills changed.
- Fixed renamed Skill groups losing author/source metadata rows after sparse enrichment responses.
- Fixed renamed Skill groups so the original-name info indicator still appears after relaunch.
- Fixed original-name tooltip sizing and clipping so long names fit and the popover can escape the group card bounds.

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

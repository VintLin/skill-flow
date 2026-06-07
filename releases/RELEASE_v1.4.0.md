# RELEASE v1.4.0

## Summary

- `v1.4.0` finalizes the state-authority refactor around schema v2 and reshapes the macOS import flow so preparation, recommendation display, and local import behavior are easier to understand and recover.
- Compared with `v1.3.11`, users can migrate into the v2 authority layout with an explicit CLI flow, import groups without background pre-download side effects, and work with a clearer desktop import page for recommendations and local scans.

## Highlights

### 1. State authority now runs through the v2 runtime surface

- The runtime no longer keeps separate `*-v2` authority modules beside older live code paths; the current `state-store`, `state-schema`, projection, and source-authority modules are now the single runtime path.
- CLI, query runtime, storage, and desktop bridge coverage now exercise the same authority flow instead of splitting behavior across parallel service layers.
- `migrate-state --to v2` and migration status checks give existing installs an explicit route into the current state layout.

### 2. Import preparation is explicit and recoverable

- Import preparation now uses a dedicated cache instead of mixing preview data with committed source state.
- Desktop and bridge import flows can recover from stale or missing preparations and retry the prepare step without leaving ghost state behind.
- Local preview no longer creates prepared source cache as a side effect, and entering the import page no longer auto-prepares downloads in the background.

### 3. The macOS import page is easier to read and operate

- Recommendations, search results, and local scans now share one grid layout instead of mixing horizontal sections with separate container styles.
- Import buttons now surface actionable state feedback, including already-installed, preparing, blocked-by-another-import, and retryable stale states.
- Local scan cards show clearer localized source information, keep source agents visible, and align their default tag behavior with the single recommendation badge shown in the UI.

### 4. Recommended groups are curated more deliberately

- Recommendation ordering and primary tags are now curated directly in the desktop recommendation bundle.
- Only the primary recommendation tag is shown and only that tag is preset after import, which keeps recommended badges, local group tags, and filter behavior aligned.
- The recommendation list now includes the refreshed source set used by the desktop import experience.

## User-visible changes

- `skill-flow migrate-state --to v2 --dry-run` can inspect migration readiness before applying changes.
- Importing a group from the macOS desktop no longer depends on choosing at least one skill first; the group import remains whole-group, while skill selection controls post-import state.
- Recommendation cards now show a single badge, and imported local groups no longer inherit hidden extra preset tags.
- Local scan cards use localized source labels and clearer source-path summaries.

## Release Artifacts

- `skill-flow-1.4.0.tgz`
- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

## Verification

- `npm run build`
- `npm test`
- `swift test --package-path apps/desktop-mac`
- `scripts/release/release-github.sh all`

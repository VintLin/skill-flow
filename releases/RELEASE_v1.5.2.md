# RELEASE v1.5.2

## Summary

- `v1.5.2` improves CLI migration usability and tightens local agent detection across CLI and desktop flows.
- Compared with `v1.5.1`, Skill Flow now exposes more migration controls from the CLI, rejects empty target selections more clearly, and refreshes detected agents more reliably.

## Highlights

### 1. CLI migration controls are easier to operate

- Added `list --ids --warnings` for source identity and warning visibility.
- Added `enable`, `disable`, and `only` for ON/OFF group management without state-file edits.
- Added `--all-skills` for target enablement when a registered group has an empty skill selection.
- Added `import-manifest` for plain text and JSON source manifests. JSON entries with `targets` must set `skills: "all"`.

### 2. State and mutation handling is safer

- Added BOM-tolerant state JSON reads.
- Added mutation lock owner metadata and coarse `add` progress.
- Empty selections after duplicate filtering are now rejected instead of silently applying an invalid target update.

### 3. Local agent detection stays current

- Desktop target lists refresh detected agents after local roots change.
- Built-in agents installed at root directories are discovered correctly.
- Desktop update checks prefer GitHub Release data from the GitHub CLI when available.

## User-visible changes

- CLI users can inspect source ids and warnings, import source manifests, and manage group enablement directly from commands.
- Target updates now fail clearly when a selection becomes empty after filtering.
- Desktop users see fresher agent target availability after local agent changes.
- Update checks can use the authenticated GitHub CLI path when available.

## Release Artifacts

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
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

# Release vNEXT

## CLI migration usability

- Added `list --ids --warnings` for source identity and warning visibility.
- Added `enable`, `disable`, and `only` for ON/OFF group management without state-file edits.
- Added `--all-skills` for target enablement when a registered group has an empty skill selection.
- Added BOM-tolerant state JSON reads.
- Added mutation lock owner metadata and coarse `add` progress.
- Added `import-manifest` for plain text and JSON source manifests. JSON entries with `targets` must set `skills: "all"`.

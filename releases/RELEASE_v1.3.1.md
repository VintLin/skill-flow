# RELEASE v1.3.1

## Summary

- `v1.3.1` rolls the current desktop interaction and group-card refinements into a patch release.
- This release keeps the package set aligned at `1.3.1` and updates release metadata used by the desktop app.

## Highlights

### 1. Desktop group-card presentation cleanup

- Group card presentation rules now derive from a single profile, so compact, menu, and import contexts stay visually consistent.
- Loading states, minimum-height behavior, and import placeholders now follow the same display profile instead of mixing local checks.

### 2. Tag interaction polish

- Tags now use a cleaner text-only treatment with tighter compact sizing.
- The tag add affordance appears on hover, making the compact desktop card layout cleaner while keeping editing available.

## User-visible changes

- Compact desktop cards keep a tighter layout without the extra reserved height on Home.
- Tag presentation and hover editing behavior are more consistent across desktop group cards.

## Release Artifacts

- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

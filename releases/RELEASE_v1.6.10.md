# RELEASE v1.6.10

## Summary

v1.6.10 fixes linked Group imports and updates that could fail with a `502` bridge error when another Group had pending deployment drift.

## Highlights

- Keep each import or update recovery transaction scoped to the Group being changed.
- Preserve globally collision-safe Skill deployment names without reconciling unrelated Groups.
- Prevent missing or stale neighboring Agent projection directories from blocking an otherwise valid linked Group import.

## User-visible changes

Importing a new Group from a GitHub repository link, and updating an existing Group, no longer fails because another enabled Group needs deployment repair. The operation still considers all enabled Groups when resolving deployment-name collisions, while only the selected Group is written by that transaction.

## Release Artifacts

The GitHub Release contains arm64, x86_64, and universal macOS DMG/ZIP artifacts plus `sha256.txt`.

## Verification

- `npm run build`
- `npm test`
- Focused linked Group import and update recovery-isolation tests
- Public GitHub repository, tree-path, shorthand, invalid-locator, unavailable-repository, empty-input, and oversized-input import checks
- macOS artifact architecture, bundle-signature, and checksum validation during packaging

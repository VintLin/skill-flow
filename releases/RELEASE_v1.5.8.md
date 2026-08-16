# RELEASE v1.5.8

## Summary

- `v1.5.8` fixes externally installed skills being taken over by Skill Flow and adds a safe catalog/update-delegation path for them.
- The release preserves the external installer as the file owner while making those skills visible in the shared catalog.

## Highlights

### 1. External source ownership (#12)

- Adopt existing absolute skill directories without copying or replacing them.
- Track selected paths, resolved `realpath` values, inventory snapshots, and drift warnings.
- Reject managed projections that collide with an externally observed path.

### 2. Safe update delegation

- Run only explicitly configured executables and argument arrays after confirmation.
- Stop a multi-step update on the first failure without persisting command output.
- Compare a local version probe with GitHub Releases using stable SemVer by default, with optional prerelease support and one-hour caching.

### 3. Unified client surface

- Add `adopt`, `external status`, `external configure`, `external update`, and `remove` CLI flows.
- Add matching bridge commands and show external ownership in the macOS desktop without target deployment controls.

## User-visible changes

- Existing skills installed by another tool can be catalogued without creating a second divergent copy.
- External source removal unregisters the catalog entry but leaves the installer-owned files untouched.
- Managed `update`, repair, enable, disable, and deployment flows cannot take over an external source.

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
- `swift test`
- `scripts/release/release-github.sh all`
- `scripts/release/publish-github-release.sh --skip-build`

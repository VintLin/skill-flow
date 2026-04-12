# RELEASE v1.3.5

## Summary

- `v1.3.5` is a patch release focused on repairing the npm publish path after `v1.3.4` still exposed broken registry metadata.
- Compared with `v1.3.4`, it keeps the same CLI and runtime behavior, but changes how the publish artifact is staged and validated before release.

## Highlights

### 1. npm registry metadata now matches the shipped package

- The CLI release flow now publishes from a dedicated staging directory whose `package.json` only contains public runtime dependencies.
- This closes the mismatch where the tarball was correct but the npm registry metadata still pointed at unpublished `@skill-flow/*` workspace packages.

### 2. Direct source-package publishing is blocked

- A publish guard now stops accidental `npm publish` runs from `apps/cli` when the source manifest still contains internal workspace dependencies.
- The intended release entrypoint is the staged publish command, which makes the publish path explicit instead of relying on temporary manifest rewriting.

### 3. Release verification is tighter

- npm packaging tests now verify both the packed tarball and the staged publish manifest.
- This makes it harder to ship another release where local `npm pack` succeeds but the public install path is still broken.

## User-visible changes

- `npm install -g skill-flow` is repaired through a new release instead of relying on the already-published `v1.3.4` metadata.
- Fresh npm installs and upgrades no longer ask the public registry for internal `@skill-flow/*` packages.
- The CLI command surface and runtime behavior stay the same; this release only repairs the publish path.

## Release Artifacts

- `skill-flow-1.3.5.tgz`
- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

# RELEASE v1.2.0

## Summary

- `v1.2.0` updates the workspace package versions to the next release line.
- The macOS release flow now builds Apple Silicon, Intel, and universal installers in one batch.
- Batch desktop packaging now reuses one workspace build before producing all installer variants.
- The `1.2.0` macOS release artifacts have been built and validated for `arm64`, `x86_64`, and `universal`.

## Highlights

### 1. Version alignment

- Updated the CLI package and all internal workspace packages from `1.1.0` to `1.2.0`.

### 2. Multi-architecture desktop release flow

- `scripts/release/release-github.sh` now supports:
  - `arm64`
  - `x86_64`
  - `universal`
  - `all`
- `all` builds, validates, zips, and generates checksums for Apple Silicon, Intel, and universal desktop installers together.

### 3. Less redundant packaging work

- `scripts/release/package-desktop-mac.sh` now accepts `--skip-js-build`.
- Batch packaging uses a single root `npm run build` before producing all architecture-specific desktop artifacts.

## Release Artifacts

- `dist/desktop-mac/arm64/Skill-Flow-arm64.dmg`
- `dist/desktop-mac/arm64/Skill-Flow-arm64.zip`
- `dist/desktop-mac/x86_64/Skill-Flow-x86_64.dmg`
- `dist/desktop-mac/x86_64/Skill-Flow-x86_64.zip`
- `dist/desktop-mac/universal/Skill-Flow-universal.dmg`
- `dist/desktop-mac/universal/Skill-Flow-universal.zip`
- `dist/desktop-mac/sha256.txt`

## Verification

- `npm run build`
- `scripts/release/release-github.sh all`

# RELEASE v1.6.20

## Summary

v1.6.20 updates the interactive CLI to Ink 8 and refreshes its dependency lockfile so clean installs no longer resolve the old Ink 6.8 package.

## Highlights

- Upgraded Ink to 8.0.0 and React to 19.3 for the CLI and TUI packages.
- Raised the interactive CLI runtime requirement to Node.js 22 or newer.
- Adapted terminal output typing for Ink 8 while preserving terminal resize and width handling.
- Kept the English, Chinese, and Japanese README files aligned with the Node.js 22 requirement.

## User-visible changes

- `skill-flow` now requires Node.js 22 or newer.
- Interactive `add`, `config`, and `find` commands continue to work with the Ink 8 runtime.

## Release Artifacts

- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

These bundles use ad-hoc signing, not Developer ID signing or Apple notarization.

## Verification

- `npm ci --ignore-scripts --no-audit --no-fund`
- `npm run build`
- `npm test`
- Interactive CLI PTY smoke checks for `add`, `config`, and `find`
- Three-architecture artifact build, architecture validation, code-sign verification, and checksum generation

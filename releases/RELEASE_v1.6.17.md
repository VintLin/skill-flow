# RELEASE v1.6.17

## Summary

v1.6.17 fixes intermittent loss of Agent display selections and group tags when an app upgrade briefly overlaps with the previous desktop process.

## Highlights

- Keeps project-scope persistence isolated from Agent display preferences and other settings.
- Reloads the latest shared group-tag collection before adding defaults for a previously unseen group.
- Adds regression coverage for stale shared-memory snapshots during overlapping app launches.

## User-visible changes

- The Settings page keeps the selected Agent visibility and order after upgrading the app.
- Existing group tags remain available after upgrading, relaunching, or refreshing the Home page.
- Existing preferences and tags remain in the shared workspace store while the new app replaces the old app.

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

- `swift test --package-path apps/desktop-mac`
- `swift build --package-path apps/desktop-mac -c release`
- `npm run build`
- `npm test`
- Three-architecture artifact validation and code-sign verification
- Installed arm64 app replacement, relaunch, and persisted Agent/tag checks

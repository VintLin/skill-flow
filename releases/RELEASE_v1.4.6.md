# RELEASE v1.4.6

## Summary

- `v1.4.6` adds ZCode as a desktop deployment target and stabilizes the macOS desktop state split.
- Compared with `v1.4.5`, installed Skill group tags now survive app updates, and combined Skill groups display the merged tags from their member groups.

## Highlights

### 1. ZCode target support

- ZCode is available as a desktop deployment target.
- Skill groups can use the same target selection and deployment planning flow as other supported local agents.

### 2. Saved group tags survive app updates

- The macOS desktop tag store now migrates legacy source, locator, and repository keys into the stable group tag key.
- Recommendation tags remain default initialization data only; saved group tags remain the single source of truth after they are created.

### 3. Combined groups derive tags from member groups

- Combined Skill group cards now merge member group tags in member order.
- Duplicate tags are collapsed, and only the first three tags are displayed when the merged list exceeds the normal tag limit.

### 4. Desktop state split hardening

- Home filters, import state, source summaries, detail enrichment, collection rows, and recently-updated markers now stay synchronized through their owning logic components.
- Rename and detail document cache behavior is more stable across stale list, inspect, and enrichment responses.

## User-visible changes

- Previously downloaded Skill groups keep their saved tags after updating the app.
- Combined Skill groups no longer show an empty tag row when their member groups have tags.
- ZCode appears as a supported deployment target in desktop target lists.
- Import, detail, rename, collection, and project-scoped deployment views should preserve state more consistently after refreshes.

## Release Artifacts

- `skill-flow-1.4.6.tgz`
- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

## Verification

- `swift test --package-path apps/desktop-mac`
- `npm test`
- `npm run build`
- `scripts/release/release-github.sh all`

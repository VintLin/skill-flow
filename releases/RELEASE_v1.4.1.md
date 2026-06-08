# RELEASE v1.4.1

## Summary

- `v1.4.1` fixes macOS Skill group tag persistence so recommendation tags and user-added tags share the same editable, persisted storage path.
- Compared with `v1.4.0`, refreshed group data no longer resets deleted default tags, drops saved tags, or changes tags because the source locator shape changed.

## Highlights

### 1. Group tags now persist by stable group identity

- The desktop tag store now writes group tags under stable keys derived from normalized GitHub repository identity when available.
- Non-GitHub or local sources fall back to normalized locator keys, then source ids, so each group still has a deterministic tag record.
- Saved empty tag lists are treated as real user state, which means deleting all tags remains persistent across refreshes and relaunches.

### 2. Recommendation tags behave like normal tags

- Recommendation tags are used only as the first-time default for a group that has no saved tag record yet.
- After initialization, users can delete or add tags without the recommendation defaults being restored on refresh.
- Default and user-created tags now flow through the same `GroupTagCollection` model.

### 3. GitHub locator normalization is stricter

- HTTPS, SSH, and shorthand GitHub repository locators normalize to the same `owner/repo` identity.
- Trailing slashes are ignored for matching, while query strings, fragments, local paths, relative paths, and extra repository path segments are not overmatched as GitHub repos.
- The `anthropic/skills` recommendation alias continues to resolve to the canonical `anthropics/skills` identity.

## User-visible changes

- Deleting a default recommendation tag from a macOS group card now stays deleted after refreshing the group list.
- Adding tags to imported recommended groups now survives refreshes even when the bridge returns a different locator spelling.
- Groups with no tags remain visibly tagless until the user adds tags again.

## Release Artifacts

- `skill-flow-1.4.1.tgz`
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
- `swift test --package-path apps/desktop-mac`
- `scripts/release/release-github.sh all`

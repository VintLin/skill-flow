# RELEASE v1.4.8

## Summary

- `v1.4.8` is a macOS desktop usability release for search, import-page state, and target icon rendering.
- Compared with `v1.4.7`, search fields can be cleared directly, home search highlights matching skills inside groups, and successful imports stay on the import page without losing prepared recommendation details.

## Highlights

### 1. Search fields are easier to reset

- Home and import search fields now show a clear action while text is present.
- Clearing import search resets the submitted import query and returns to the default import results.

### 2. Home search surfaces matching skills

- Skills whose names match the home search query are highlighted inside their group card.
- Matching skills sort before non-matching skills in the same group.

### 3. Import-page refresh stays in context

- Successful imports refresh installed state without automatically opening the imported group detail view.
- Recommendation cards keep their prepared preview details after installed-state refreshes.

### 4. Target icons render consistently

- macOS group target icons now use consistent cropped and padded rendering across targets.

## User-visible changes

- Search is easier to clear from both home and import views.
- Searching a group by skill name makes the matched skill easier to spot.
- Importing a recommended group keeps the user on the import page and preserves the recommendation card state.
- Target icons have more consistent visual sizing.

## Release Artifacts

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

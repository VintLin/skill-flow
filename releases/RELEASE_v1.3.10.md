# RELEASE v1.3.10

## Summary

- `v1.3.10` completes the Skill group rename flow in the macOS desktop app.
- Compared with `v1.3.9`, users can see the original import-time group name after renaming, rename from the detail page, and reset a group name by saving an empty rename field.

## Highlights

### 1. Skill group names now keep their import identity

- Skill Flow now persists `originalDisplayName` for source manifests and lock files.
- Existing state is normalized so older data can keep working while gaining original-name metadata.
- Legacy group names derived from `SKILL.md` metadata are corrected back toward the import-time source name when appropriate.

### 2. Desktop rename UI is complete

- Home cards and detail headers show an info indicator only when a group has been renamed.
- Hovering the indicator shows just the original name, without extra explanatory text.
- Detail pages now include the group rename action beside the group title.
- Blank rename saves restore the original group name.

### 3. Packaging is smaller and cleaner

- The desktop bridge helper is staged with only the dependencies it needs.
- macOS packaging prunes bundled npm documentation and avoids shipping an unnecessary stripped executable copy.
- The release helpers keep the Node/npm/npx runtime bundle validation introduced in earlier releases.

## User-visible changes

- Renaming a Skill group changes only Skill Flow's app-level display name. It does not modify `SKILL.md`.
- The rename dialog uses the original name as the input placeholder and no longer shows separate reset-hint copy.
- The Skill Flow brand now sits beside the home search field instead of inside the sidebar.
- Sidebar controls have adjusted spacing and alignment so collapsed and expanded states are easier to scan.

## Release Artifacts

- `skill-flow-1.3.10.tgz`
- `Skill-Flow-arm64.dmg`
- `Skill-Flow-arm64.zip`
- `Skill-Flow-x86_64.dmg`
- `Skill-Flow-x86_64.zip`
- `Skill-Flow-universal.dmg`
- `Skill-Flow-universal.zip`
- `sha256.txt`

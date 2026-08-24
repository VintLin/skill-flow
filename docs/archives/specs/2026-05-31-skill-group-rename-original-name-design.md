# Skill Group Rename Original Name Design

Date: 2026-05-31

## Goal

Improve Skill group renaming so users can see the imported original name, rename from the detail page, and reset a custom name by saving an empty rename field.

## Decisions

- Store the import-time original name as `originalDisplayName` on both manifest source records and lock source records.
- Keep `displayName` as the current visible name.
- For existing state without `originalDisplayName`, read-time normalization uses the current `displayName` as the original name.
- Keep the existing `rename-source` bridge command.
- `rename-source` accepts a blank `displayName`. A blank value resets the current name to `originalDisplayName`.
- The rename response returns `sourceId`, `displayName`, `originalDisplayName`, and `isResetToOriginal`.
- Homepage original-name visibility uses the selected visual direction: show an information icon next to the group title only when the current name differs from the original name. The icon help text shows the original name.
- Detail page rename entry uses the selected visual direction: add a small rename icon next to the group overview header title.
- Rename input placeholder shows `originalDisplayName`.
- Rename dialog hint says that leaving the field empty restores the original name.

## Non-Goals

- Do not rename `sourceId`, checkout directories, deployment paths, leaf ids, bindings, tags, pins, or project drafts.
- Do not add a new bridge command.
- Do not redesign the home card or detail page beyond the rename and original-name affordances.
- Do not add CLI or TUI rename surfaces in this change.

## Data Model

Add optional-compatible fields to domain types:

- `SourceManifestRecord.originalDisplayName`
- `SourceLockRecord.originalDisplayName`

New imports write both `displayName` and `originalDisplayName` to the resolved display name. Existing JSON files are normalized in `StateStore` so missing `originalDisplayName` is filled from `displayName`.

Source updates must preserve the original name. Updating a source refreshes content and metadata but does not rewrite `originalDisplayName` from the locator or repository metadata.

## Bridge And Runtime

`rename-source` keeps the same request shape:

```json
{
  "sourceId": "example-source",
  "displayName": "My Skill Group"
}
```

Blank or whitespace-only `displayName` means reset:

```json
{
  "sourceId": "example-source",
  "displayName": "   "
}
```

Response data:

```json
{
  "sourceId": "example-source",
  "displayName": "anthropic-skills",
  "originalDisplayName": "anthropic-skills",
  "isResetToOriginal": true
}
```

Runtime behavior:

- Missing source returns `SOURCE_NOT_FOUND`.
- Non-empty names are trimmed and saved as current `displayName`.
- Blank names save `originalDisplayName` as current `displayName`.
- Manifest and lock are updated in one serialized mutation.

## Desktop UI

Home group cards:

- Add `originalDisplayName` to `GroupCardModel`.
- If `displayName != originalDisplayName`, show a compact information icon beside the title.
- The icon help text uses localized `group_card.original_name`.
- If names match, do not show the icon.

Detail page:

- Add `originalDisplayName` to `DetailViewModel`.
- Add a rename icon next to the group overview header title.
- The icon opens the same `RenameSourceDialog` used by home.
- Skill-specific detail headers do not show group rename.

Rename dialog:

- Initial value is current `displayName`.
- Placeholder is `originalDisplayName`.
- A hint below the input states that leaving the field empty restores the original name.
- Saving blank submits blank to runtime, then uses the returned `displayName`.
- Success toast distinguishes rename from reset.

## Testing

TypeScript:

- Domain and storage tests cover `originalDisplayName` normalization.
- Source add writes `originalDisplayName`.
- Source update preserves `originalDisplayName`.
- Runtime rename saves non-empty names and resets blank names to `originalDisplayName`.
- Bridge command accepts blank display names and forwards them to runtime.

Swift:

- Bridge client decodes rename response payload with `originalDisplayName` and `isResetToOriginal`.
- MainViewModel parses `originalDisplayName` into group cards and detail data.
- Home card original-name icon appears only when names differ.
- Detail group header exposes a rename action next to the title.
- Rename dialog placeholder and hint use the original name.
- MainViewModel reset behavior updates home card, detail header, sidebar row, and cached detail payload.
- Localization tests include new English, Simplified Chinese, and Japanese keys.

## Manual Verification

1. Import or use an existing group.
2. Rename the group from home.
3. Confirm the home card shows an information icon next to the title, with help text containing the original name.
4. Open the group detail page.
5. Rename from the detail header icon.
6. Open rename again, clear the field, save, and confirm the title returns to the original name.
7. Quit and reopen the app. Confirm the current name and original-name behavior persist.

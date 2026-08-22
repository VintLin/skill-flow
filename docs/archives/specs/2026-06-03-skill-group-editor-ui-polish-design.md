# Skill Group Editor UI Polish Design

Date: 2026-06-03

## Goal

Polish the desktop Skill Group Editor sheet so creation and merge flows match the Home page visual language and remove the target selection UI from those flows.

The update keeps the existing right-side Home header entry, tabbed sheet structure, and virtual group behavior. It changes the icon asset, sheet layout, color treatment, input treatment, skill row metadata, and target reset behavior.

## User Decisions

- Use `/Users/Vint/Downloads/分组.svg` as the group editor icon source.
- Import the icon into the project as `skill-group-editor.svg`.
- Keep the header button visually consistent with the existing top-right header buttons.
- Use layout option A:
  - tabs;
  - function summary;
  - group name label;
  - group name input;
  - skills label;
  - skill list.
- Remove the targets / Agent display from Create and Merge views.
- Create and Merge default to no selected Agent.
- Switching editor modes clears selected skills and selected targets.
- Skill rows show source metadata as `author · group name`.
- Sheet background follows the app page background, equivalent to Color 3.
- Name input and skill list backgrounds follow Home group card fill, equivalent to Color 1.
- Name input uses the Home search-field direction: no visible border, clear fill, compact spacing.

## Non-Goals

- Do not change virtual group persistence or restore semantics beyond target reset behavior.
- Do not redesign Restore unless it needs small spacing or background alignment with the sheet.
- Do not add a dropdown menu to the header button.
- Do not add target selection elsewhere in the editor as a replacement.
- Do not change Home group card layout outside the icon asset and editor entry.

## Current Context

The existing Home header already has icon buttons for import, update, and settings. The Skill Group Editor entry should keep the same control size, fill, foreground color, hover treatment, pressed treatment, spacing, tooltip style, and disabled behavior as those controls.

`MainView.swift` currently contains the Skill Group Editor sheet and `AppTheme`. Theme helpers map page background to neutral Color 3 and group card fill to neutral Color 1. The current editor panels still include target sections and mixed panel backgrounds. Name input also has a visible border treatment that should be removed for this polish.

Runtime and desktop state already support virtual group create, merge, restore, selected skills, and enabled targets. This design only changes what Create and Merge collect from the user and what payloads they send.

## Header Icon

Import the downloaded SVG as a project resource with this filename:

```text
skill-group-editor.svg
```

The imported asset should preserve the source SVG geometry and visual intent. The Swift icon enum or resource lookup should use a semantic case name, for example `skillGroupEditor`.

The header button should:

- reuse the existing header icon button component or style path;
- keep the same dimensions as neighboring top-right controls;
- use the new group icon;
- keep existing localized tooltip and accessibility labeling for the Skill Group Editor entry.

## Sheet Layout

Create and Merge share the same vertical structure:

1. tab selector;
2. short function summary;
3. `group_editor.name` label;
4. name input;
5. `group_editor.skills` label;
6. skill list.

The function summary is plain supporting text, not a separate card. It should explain the current tab in one compact line or short paragraph:

- Create: combine skills from different groups into a new virtual group.
- Merge: combine selected groups into one virtual group and hide the source groups.

Targets / Agents are not rendered in Create or Merge. Impact previews may remain only if they do not reintroduce a target section or create a second card-like block that competes with the main flow. If retained, they should be secondary text below the skill list or near the footer.

Restore can keep its existing source list behavior, but its outer background and row fills should align with the updated sheet theme.

## Visual Theme

The sheet content background uses `AppTheme.pageBackground(for:)`, matching the app page background and neutral Color 3.

Form controls and selectable skill list containers use `AppTheme.groupCardFill(for:)` or the equivalent Color 1 fill. This applies to:

- group name input background;
- skill list container;
- unselected skill rows, unless the existing row design uses a slightly nested neutral fill for scanning.

The name input should remove visible border overlays. It should rely on fill color, height, padding, focus state, and text contrast. Focus state can use the app's standard focus behavior if already provided by SwiftUI or the local control wrapper, but the default resting state should not show a stroke.

Avoid adding new gradients, heavy shadows, or large rounded containers. Radius should remain consistent with existing Home card and header control treatment.

## Skill Source Metadata

Skill rows display:

```text
skill name        author · group name
```

The metadata should be compact, secondary, and aligned so repeated or similar skill names are distinguishable without making the row noisy.

Preferred source resolution:

1. author plus group/source display name;
2. group/source display name if author is unavailable;
3. existing source title if both are unavailable;
4. no placeholder text if no source metadata exists.

The implementation should reuse metadata already present in card/detail/source models where possible. If author metadata is not consistently available, the UI should still render the best available source label and avoid blocking the feature on perfect author coverage.

## Target Reset Behavior

Create and Merge no longer collect targets from the user.

Behavior:

- Initial Create state has empty selected targets.
- Initial Merge state has empty selected targets.
- Switching tabs clears selected skills and selected targets.
- Save payloads for Create and Merge send `enabledTargets: []`.
- Merge still clears selected skills and enabled targets for hidden source groups as defined by the original Skill Group Editor design.

This prevents stale Agent selections from a previous tab or previous session from being applied silently.

## Validation And Errors

Validation remains mostly unchanged:

- Create requires a non-empty group name and at least one selected skill.
- Merge requires a non-empty group name and at least two selected source groups.
- Duplicate deployment conflicts still block save.
- Runtime errors remain inline in the sheet or in the existing toast path.

Target validation is removed from Create and Merge because no targets are selectable and the payload intentionally uses an empty target list.

## Testing

Swift tests should cover:

- Create view no longer exposes a target / Agent section.
- Merge view no longer exposes a target / Agent section.
- Create and Merge save payloads use empty `enabledTargets`.
- Switching tabs clears selected skills and selected targets.
- Skill rows render the best available source metadata, preferring `author · group name`.
- Header entry uses the renamed project icon resource and still matches the existing header control style path.

Manual verification should cover:

1. Launch the desktop app.
2. Confirm the top-right Skill Group Editor button uses the new group icon and matches neighboring header buttons.
3. Open the editor.
4. Confirm the sheet background matches the app page background.
5. Confirm Create layout is `tabs → function summary → group name → input → skills → list`.
6. Confirm Merge uses the same layout direction.
7. Confirm no Targets / Agent section appears in Create or Merge.
8. Select skills in Create, switch tabs, and confirm selections are cleared.
9. Save a Create group and confirm it sends no enabled targets.
10. Save a Merge group and confirm hidden source groups have selected skills and targets cleared.
11. Confirm skill rows show `author · group name` when metadata is available.

## Implementation Boundary

Likely touched areas:

- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- `apps/desktop-mac/Sources/DesktopApp/App/ActionIcon.swift`
- `apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons/`
- desktop tests that exercise the Skill Group Editor view model and bridge payload behavior
- localization keys only if existing labels are missing

The change should not touch query/runtime virtual group semantics unless current Create or Merge payload construction still requires code changes to send an empty target list.

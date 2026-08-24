# Import Page Unified Grid Design

## Context

The desktop Import page currently renders recommended skill groups differently from the Home page:

- recommended groups are wrapped in category sections
- each section renders as a horizontal scrolling row
- section titles are shown outside cards

This diverges from the Home page, which uses one natural grid of group cards. The current import layout also makes local-scan results and other import candidates feel like separate surfaces even though they are all the same conceptual entity: importable skill groups.

Recent import-page cleanup already removed automatic preview and prepare behavior from the display stage. The remaining issue is the outer layout model itself.

## Goal

Unify the Import page outer layout so recommended groups, search results, and local-scan groups all render as a normal grid, consistent with the Home page.

The new layout should:

- remove external category section headers
- remove horizontal scrolling rows
- preserve natural card ordering
- preserve recommendation badges and recommendation descriptions inside each card
- preserve current import behavior and card-level interactions

## Non-Goals

- Do not change import ranking rules beyond the approved display ordering.
- Do not remove recommendation badges or recommendation descriptions from cards.
- Do not change import execution, preview-on-import, selection semantics, or button-state behavior.
- Do not redesign the card component itself.
- Do not introduce a separate layout just for local-scan results.

## Approved Decisions

- Recommended cards should display in the order defined by `recommendations.json.sortOrder`.
- Search results and local-scan results should keep their existing source order.
- Only the outer display container changes. Card internals remain as-is.
- Local-scan results should use the same outer grid layout as the rest of the Import page.

## Current State

### Data Model

`ImportViewModel.Content` currently distinguishes:

- `recommended([RecommendedCategorySection])`
- `searchResults([Card])`

This makes the recommended state structurally different even though the rendered unit is still the same `Card`.

### View Layout

`ImportScreen` currently uses two different outer layouts:

- search results: centered `LazyVGrid`
- recommendations: vertical stack of section titles, each containing a horizontal `ScrollView` and `LazyHStack`

This layout split is the direct cause of the inconsistent experience.

## Proposed Design

### 1. Unify Import Page Content Model

Replace the current section-based recommendation model with a single flat card-list model for all Import page states.

`ImportViewModel` should produce one ordered `[Card]` list for display, regardless of source:

- recommended groups
- search results
- direct locator results
- local-scan results

The page can still distinguish whether the submitted query is empty for empty-state text and loading-state messaging, but not for outer card layout.

### 2. Keep Recommendation Metadata, Remove Recommendation Sections

Recommendation metadata remains valid, but only at the card level.

Keep:

- `recommendationBadgeItems`
- `recommendationDescription`

Remove from the UI model:

- external category section containers
- category section titles
- any layout behavior that depends on recommendation categories

`categoryId`, `primaryTagId`, and `secondaryTagIds` still matter for badge and description decoration, but no longer control page-level layout.

### 3. Use One Grid Layout in ImportScreen

`ImportScreen` should render one grid for any non-empty card list, matching the Home page’s outer presentation:

- centered `LazyVGrid`
- same spacing model already used by the Import search grid
- no horizontal scroll area
- no external labels above groups

This keeps the Import page visually aligned with Home without forcing the two pages to share every implementation detail.

### 4. Preserve Source-Specific Ordering Without Source-Specific Layout

Ordering should remain data-driven:

- recommended groups: sort by `recommendations.json.sortOrder`
- search results: preserve existing source order
- local-scan results: preserve existing source order

The view layer should not regroup or reorder cards after `ImportViewModel` resolves them.

### 5. Keep Import Behavior Separate From Display Layout

No import action logic should move as part of this change.

In particular, this design does not change:

- when preview is requested during import
- how selected skills are derived
- how disabled import actions are explained
- how installed groups are marked

This keeps the change bounded to presentation and presentation-facing view-model structure.

## Architecture Changes

### ImportViewModel

Expected changes:

- remove `RecommendedCategorySection`
- simplify `Content` so the display path consumes a flat `[Card]`
- keep recommendation enrichment logic, but apply it directly to cards in order
- preserve recommendation ordering by `sortOrder`

This is the main structural cleanup in the change.

### ImportScreen

Expected changes:

- remove `recommendedContent(...)`
- remove `sectionTitle(...)`
- remove horizontal recommendation rows
- route all non-empty card rendering through one grid path

`ImportScreen` should still retain distinct loading and empty states, because those are page states rather than layout variants.

### MainViewModel

No major data-source redesign is needed.

`MainViewModel` can continue to expose:

- `recommendedImportGroups`
- `searchImportGroups`
- `localImportGroups`

The important change is that downstream code no longer reconstructs recommendation-only section layout from those arrays.

## Error Handling

No new error states are introduced.

Existing import-page failure handling remains unchanged:

- page load and search failure continue to use `ImportLoadPhase`
- card-level import failure continues to use the current toast and error paths
- missing card details should not render as loading unless an actual preview request is in flight

## Testing Plan

### ImportViewModel Tests

Update tests to reflect the unified display model:

- recommended content resolves to a flat ordered card list
- recommendation order follows `sortOrder`
- recommendation badge and description are preserved on cards
- search and local-scan paths are not resorted by recommendation logic

### ImportScreen Tests

Update tests to validate:

- all non-empty import content uses the same grid-oriented display path
- no section-title or horizontal recommendation-row behavior remains

### Workflow Coverage Tests

Retain behavior coverage for:

- loading recommended import groups
- displaying cached snapshot skills before preview
- successful preview when explicitly requested

Adjust assertions so they no longer depend on recommendation sections or section titles.

## Risks

- Recommendation categories will still exist in data but no longer be visible as external layout groupings. This is intentional, but it removes one layer of page-level explanation.
- Some tests may currently encode section-based assumptions and will need coordinated updates.
- If local-scan display currently relies on implicit layout differences, those assumptions may surface during test updates. The change should resolve those by converging on one layout, not by adding new special cases.

## Validation

Minimum validation after implementation:

- desktop Swift tests covering `ImportViewModel`, `ImportScreen`, and import workflow coverage
- manual verification that recommended groups render in a normal grid
- manual verification that local-scan results render in the same grid
- manual verification that recommendation badges and descriptions still appear on cards
- manual verification that sorting for recommended groups still follows `recommendations.json`

## Completion Criteria

- The Import page no longer shows recommendation category headers.
- The Import page no longer uses horizontal scrolling rows for recommended groups.
- Recommended groups, search results, and local-scan groups all render in one normal grid layout.
- Recommendation badges and recommendation descriptions still appear inside cards.
- Recommended ordering still follows `sortOrder`.
- Related tests pass.

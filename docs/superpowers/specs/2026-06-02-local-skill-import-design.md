# Local Skill Import Design

## Goal

Add a local skill import flow to skill-flow's desktop import page.

The flow scans existing unmanaged local skills, resolves their original skills group when possible, validates the local skill against the origin group preview, and then reuses the existing import page preview, draft, and import behavior.

## Confirmed Decisions

- Opening the import page scans local skill directories every time.
- The scan only displays skills that are not already managed by skill-flow.
- Scanning never imports automatically and never enables targets automatically.
- If a scanned skill can be resolved to an original skills group, the import page should prefer that original group.
- Before importing from the original group, skill-flow must compare the origin group skill with the local skill.
- If origin and local content do not match, the import card lets the user choose between the origin group version and the local version.
- If a skill cannot be resolved to an origin group, it is shown as a local group and can still be imported.
- Multiple local skills resolved to the same origin group are grouped into one import card with all matched skills preselected.
- The import page header gets an `Import Local` button on the right side for manual local directory import.

## Architecture

Add a local discovery pipeline before the existing import flow:

```text
LocalSkillScanner
  -> OriginResolver
  -> OriginValidator
  -> Import Page Candidate Builder
  -> existing previewImportSource/importSource/applyDraft flow
```

The new pipeline is read-only until the existing import flow runs. Runtime import remains the single write path.

## Components

### LocalSkillScanner

Scans target roots derived from skill-flow's existing target configuration.

Inputs:

- built-in target definitions
- custom target definitions
- current manifest and lock file
- current managed deployments

Output per local skill:

- local path
- real path
- directory name
- `SKILL.md` name and description
- content hash
- discovered target ids
- observed target paths

Scanner rules:

- Skip missing directories.
- Skip entries without `SKILL.md`.
- Skip skill-flow store paths, registered local source locators, source checkouts, and managed deployment target paths.
- Treat directories and directory symlinks as scan candidates.
- Do not write files.

### OriginResolver

Attempts to recover the original skills group for each scanned local skill.

Resolution priority:

1. `~/.agents/.skill-lock.json` metadata.
2. Symlink real path if it points into a known source checkout.
3. Git remote and branch metadata from the local skill directory or parent repository.
4. Path hints that can be safely parsed as a repo plus skill path.

Resolved origin data includes:

- origin locator
- canonical repo when available
- requested path or skill selector
- confidence/source of the resolution

If no origin can be resolved, the skill remains a local fallback candidate.

### OriginValidator

Validates a resolved origin against the local skill before the card defaults to origin import.

Validation process:

1. Preview the origin group through the existing `previewImportSource` path.
2. Match the local skill to origin preview leafs by relative path first, then `SKILL.md` name, then directory name.
3. Compare metadata and content where available.
4. Emit a validation status.

Statuses:

- `matched`: origin skill and local skill match.
- `changed`: origin skill exists but differs from local content or metadata.
- `missing`: origin preview did not contain the local skill.
- `ambiguous`: multiple origin skills match the local skill.
- `origin-unavailable`: the origin could not be previewed.

### Import Page Candidate Builder

Converts validated scan results into import page group items.

Rules:

- Group resolved skills by origin group.
- Within the same origin group, preselect all matched local skills.
- Preserve per-skill discovered target information for display.
- For unresolved skills, create local fallback cards.
- For changed, missing, ambiguous, or origin-unavailable statuses, expose enough state for the desktop UI to show a choice or warning.

## Data Flow

### Import Page Open

1. Desktop opens the import page.
2. Runtime scans unmanaged local skills.
3. Runtime resolves origins and validates candidates.
4. Desktop merges local import candidates into the import page display.
5. User chooses skills and targets.
6. `importSource(locator, draft)` imports the selected origin or local source.

### Manual Import Local Button

1. User clicks `Import Local` in the import page header.
2. Desktop asks for a directory path.
3. Runtime previews that path through the same local discovery and validation pipeline.
4. The result appears as an import card.
5. User confirms using the normal card action.

## UI Behavior

The import page keeps the current search behavior and adds a header-right `Import Local` button.

Local cards use the same shared group card model as existing import results.

Card behavior:

- `matched`: show the origin group card with matched skills preselected.
- Multiple skills from the same group: show one origin group card with multiple preselected skills.
- `changed`: show a choice between importing the origin group version and the local version.
- `missing` or `ambiguous`: show the validation warning and require a deliberate user choice.
- `origin-unavailable`: show the local fallback, with origin retry information when available.
- Unresolved local skill: show a local group card.

Target defaults remain empty. Users must explicitly select targets before import applies them.

## Error Handling

- Missing scan roots are ignored.
- Unreadable or invalid `SKILL.md` files become scan warnings and do not produce cards.
- Failed origin resolution becomes a local fallback card.
- Failed origin preview preserves the local fallback and reports the origin as unavailable.
- Missing or ambiguous matches do not silently import the origin group.
- Import and apply failures use existing import result statuses, reason codes, and desktop toast mapping.

## Testing

Runtime and query tests:

- scan unmanaged local skills
- skip managed checkouts and deployment paths
- group multiple local skills by the same origin group
- preselect multiple matched skills on one origin card
- create local fallback cards for unresolved origins
- handle `matched`, `changed`, `missing`, `ambiguous`, and `origin-unavailable`

Integration tests:

- scan target roots from built-in and custom target definitions
- parse `~/.agents/.skill-lock.json`
- resolve symlink real paths
- resolve git remote metadata

Desktop tests:

- import page header shows the local import button
- opening the import page triggers local scan
- local scan results are displayed as import cards
- same-origin local skills are grouped into one card
- conflict cards let the user choose origin or local version

Bridge and shared type tests:

- cover any added command payloads and response contracts.

## Out Of Scope

- Automatic import on first launch.
- Automatic target enablement based on discovery location.
- A separate local import tab.
- Replacing the existing import flow.
- Global refactors unrelated to import page behavior.

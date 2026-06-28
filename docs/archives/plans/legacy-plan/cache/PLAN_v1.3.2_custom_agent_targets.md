# Custom Agent Targets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class custom agent target support so users can create, edit, and delete custom agents in Settings, with per-agent global path and project-relative path templates, while keeping built-in agents immutable.

**Architecture:** Introduce a second target source alongside built-in target definitions: persisted custom target definitions and unified agent display order stored in shared preferences and mirrored into desktop settings state. Runtime target resolution, detection, deployment, doctor, config, and bridge payloads consume a merged target catalog where built-ins remain read-only and customs are dynamic. The macOS Settings screen becomes the only editor for custom targets and exposes validation for target id/name uniqueness, absolute global paths, and project-relative project paths, while keeping built-in definitions view-only.

**Tech Stack:** TypeScript, Vitest, SwiftUI, Swift XCTest, existing `StateStore` / `SharedPreferences` / bridge runtime.

---

## Scope

- Built-in agents remain immutable.
- Users may only add, edit, and delete custom agents.
- Each custom agent has:
  - stable `id`
  - display `name`
  - `globalPath` as absolute path
  - `projectPathTemplate` as project-root-relative path template
- `projectPathTemplate` must reject absolute paths.
- Settings UI must hint that the project path is relative to the project root.
- Custom agents must participate in:
  - target detection
  - deployment planning/application
  - config/apply flows
  - bridge responses used by desktop
  - doctor/reporting surfaces
- Custom agents and built-in agents share one sortable display list.
- Custom agent editing must not permanently occupy the main Settings page.
- Existing built-in target behavior must remain unchanged.

## Approaches Considered

### Approach A: Extend `DeploymentTargetName` with arbitrary strings everywhere

- Pros: lowest conceptual split; customs and built-ins use one path.
- Cons: high risk to existing string-union assumptions; broad compile fallout; weak distinction between immutable built-ins and mutable customs.

### Approach B: Keep built-ins as union, add separate `CustomTargetDefinition[]`, merge at runtime

- Pros: preserves built-in safety, makes immutability explicit, isolates persistence/UI concerns, easiest migration path.
- Cons: requires careful merge helpers and some protocol shape updates.

### Approach C: Reuse env-var override system for customs

- Pros: minimal storage work.
- Cons: wrong ownership model; env vars are process overrides, not user-managed target definitions; cannot support arbitrary count cleanly.

**Recommendation:** Approach B.

## File Structure

### Core model and persistence

- Modify: `packages/domain/src/types.ts`
- Modify: `packages/storage/src/preferences-store.ts`
- Modify: `packages/storage/src/tests/preferences-store.test.ts`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Store/SettingsState.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopSettingsStore.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewModelTests.swift`

### Target catalog and runtime

- Modify: `packages/integration/src/utils/constants.ts`
- Modify: `packages/integration/src/adapters/channel-adapters.ts`
- Modify: `packages/query/src/runtime.ts`
- Modify: `packages/query/src/config-coordinator.ts`
- Modify: `packages/core-engine/src/services/workspace-bootstrap-service.ts`
- Modify: `packages/core-engine/src/services/doctor-service.ts`
- Modify: `apps/cli/src/bridge-command.ts`

### Desktop settings UI

- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/SettingsViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Store/AgentDisplayPreference.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewModelTests.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewTests.swift`

### Tests and docs

- Modify: `apps/cli/src/tests/target-definitions.test.ts`
- Modify: `apps/cli/src/tests/skill-flow.test.ts`
- Modify: `packages/query/src/tests/config-coordinator.test.ts`
- Modify: `packages/query/src/tests/source-lifecycle.test.ts`
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `README.ja.md`

## Data Model Design

### Built-in target shape

- Keep built-ins in code-only definitions.
- Keep current built-in ids and env-var overrides.
- Add explicit metadata flag in merged target view:
  - `kind: "builtin" | "custom"`
  - `isMutable: boolean`

### Custom target shape

```ts
type CustomTargetDefinition = {
  id: string;
  name: string;
  globalPath: string;
  projectPathTemplate: string;
  strategy: "symlink" | "copy";
  createdAt: string;
  updatedAt: string;
};
```

### Unified display order

```ts
type SharedPreferences = {
  // existing fields...
  customTargets: CustomTargetDefinition[];
  agentDisplayOrder: string[];
};
```

- `agentDisplayOrder` stores one unified order for built-ins and customs together.
- It is persisted in shared preferences, not desktop-only state.
- Unknown ids are pruned during normalization.
- Missing built-in or custom ids are appended in deterministic order.
- V1 does not use creation order as a display fallback once `agentDisplayOrder` exists.

### Validation rules

- `id`
  - lowercase slug-like string
  - unique across built-in ids and custom ids
- `name`
  - non-empty
  - unique across custom names, case-insensitive
- `globalPath`
  - must be absolute
  - trimmed before save
- `projectPathTemplate`
  - must be non-empty
  - must be relative
  - normalized without leading `./` requirement
  - reject placeholders that imply absolute filesystem paths

These validation rules must be enforced in three places:

- Settings UI inline validation
- shared preference normalization/persistence
- runtime merged-target resolution before deployment/detection

### Persistence decision

- Store customs in shared preferences, not desktop-only state.
- Store unified display order in shared preferences, not desktop-only state.
- Desktop settings state mirrors shared preferences for UI editing.
- Reason: customs affect CLI/query/runtime, so they belong in shared persisted app state.

## Runtime Design

### Merged target catalog

Add helpers that return:

- built-in target metadata
- custom target metadata from preferences
- merged ordered catalog
- lookup by id

Default normalization order is:

1. existing persisted `agentDisplayOrder`
2. remaining built-ins in built-in default order
3. remaining custom targets in creation order

After normalization, the merged ordered catalog consumes `agentDisplayOrder` as the single source of truth for display order.

### Deployment and detection

- Built-in adapters remain generated from built-in definitions.
- Custom adapters are generated dynamically from stored custom targets.
- Detection roots:
  - built-in: existing logic
  - custom: `globalPath`, plus resolved project path when project scope is active and project root exists
- Deployment root selection:
  - global scope uses `globalPath`
  - project scope uses `projectPathTemplate` resolved against project root
  - if project scope selected but no usable project root exists, return validation failure before deployment

### Bridge / desktop contract

Bridge responses that currently expose target metadata must return merged target entries with:

- `id`
- `label`
- `kind`
- `isMutable`
- `globalPath`
- `projectPathTemplate`
- `displayGlobalPath`
- `displayProjectPath`
- availability / detected path info as relevant

Where relevant, distinguish:

- `display*Path`: human-readable path shown in UI, may preserve `~` for built-ins
- effective resolved path: absolute filesystem path used for detection/deployment

Desktop must use these merged fields instead of assuming the built-in static catalog is complete.

## Settings UI Design

### UX rules

- Built-in agent rows stay visible and reorderable/visibility-toggle only.
- Custom agent rows appear in the same sortable display list as built-ins.
- Built-in rows cannot edit path definitions.
- Built-in agents still show their global path and project path in the management/detail surface as read-only fields.
- Custom agent rows can edit name, global path, project path, and delete.
- Main Settings page only shows a lightweight custom-agent summary/entry point.
- Add/edit/delete flows open in a secondary management surface rather than leaving a full editor expanded on the main page.
- The secondary management surface is a sheet.
- Add button creates a draft row inside the management surface.
- Save validates inline.
- Validation errors block persistence for the edited row.

### Interaction model

- `Agent Display`
  - unified sortable list
  - includes built-ins and customs together
  - supports visibility toggles for both
  - supports drag sorting for both
- `Custom Agents`
  - summary row on the main Settings page
  - shows configured count and `Manage` action
  - opens the `Manage Agents` sheet
- `Manage Agents`
  - shows built-ins and customs together for reference and management
  - built-ins expose `View`
  - customs expose `Edit` and `Delete`
- `Agent Details`
  - built-in and custom agents both show global path and project path
  - built-in agents render those fields as read-only
  - custom agents may use the same read-only detail component if needed later, but v1 opens edit directly from the management list
- `Edit Custom Agent`
  - dedicated form sheet launched from `Manage Agents`
  - explains that project path is relative to the project root
  - rejects absolute project paths inline

### ASCII layout

```text
+----------------------------------------------------------------------------------+
| Settings                                                                         |
|----------------------------------------------------------------------------------|
| Appearance                                                                       |
| ...                                                                              |
|                                                                                  |
| Agent Display                                                                    |
| [drag] [svg] Claude Code                          [visible: on] [built-in]       |
| [drag] [svg] Codex                                [visible: on] [built-in]       |
| [drag] [svg] Trae                                 [visible: on] [built-in]       |
| [drag] [MA ] My Agent                             [visible: on] [custom]         |
|                                                                                  |
| Custom Agents                                                      1 configured  |
| Manage                                                                    [ > ]  |
|                                                                                  |
| Advanced                                                                         |
+----------------------------------------------------------------------------------+
```

```text
+--------------------------------------------------------------------------+
| Manage Agents                                                            |
|--------------------------------------------------------------------------|
| [CC ] Claude Code                                       [View] [built-in]|
|   Global:  ~/.claude/skills                                            |
|   Project: .claude/skills/                                             |
|                                                                          |
| + Add Custom Agent                                                       |
|                                                                          |
| [MA ] My Agent                                          [Edit] [Delete] |
|   Global:  /Users/me/.my-agent/skills                                  |
|   Project: .my-agent/skills                                             |
|                                                                          |
| [TA ] Team Agent                                        [Edit] [Delete] |
|   Global:  /Users/me/.team-agent/skills                                |
|   Project: .team-agent/skills                                          |
+--------------------------------------------------------------------------+
```

```text
+--------------------------------------------------------------------------+
| Agent Details                                                            |
|--------------------------------------------------------------------------|
| Type                  [ built-in                                      ] |
| Name                  [ Claude Code                                   ] |
| ID                    [ claude-code                                   ] |
| Global Path           [ ~/.claude/skills                              ] |
| Project Path          [ .claude/skills/                               ] |
| Note: built-in agents are read-only                                    |
|                                                          [Close]        |
+--------------------------------------------------------------------------+
```

```text
+--------------------------------------------------------------------------+
| Edit Custom Agent                                                        |
|--------------------------------------------------------------------------|
| Name                  [ My Agent                                      ] |
| ID                    [ my-agent                                      ] |
| Global Path           [ /Users/me/.my-agent/skills                    ] |
| Project Path          [ .my-agent/skills                              ] |
| Hint: relative to project root, for example .my-agent/skills/          |
| Error: project path must be relative, not absolute                     |
|                                                [Cancel] [Save]         |
+--------------------------------------------------------------------------+
```

### Built-in vs custom visual language

- Built-ins:
  - badge: `built-in`
  - list action is `View`
  - details view shows both global and project path as read-only
- Customs:
  - badge: `custom`
  - list actions are `Edit` and `Delete`
  - edit opens directly from the management sheet

### Icon model

- Use one unified icon presentation model for built-ins and customs.
- Built-ins keep existing bundled SVG icons.
- Custom agents use generated monogram badges in v1.
- Monogram rule:
  - derive from the custom agent name
  - use 1 to 2 uppercase characters
  - render in the same icon slot size as built-ins
- The UI consumes a resolved icon view model rather than branching ad hoc on target type.
- Do not add custom icon upload/editing in this phase.
- If needed later, extend the custom target definition with optional icon metadata without blocking v1.

## Implementation Tasks

### Task 1: Add shared custom-target domain types

**Files:**
- Modify: `packages/domain/src/types.ts`
- Test: `packages/storage/src/tests/preferences-store.test.ts`

- [ ] Add `CustomTargetDefinition` and `SharedPreferences.customTargets`.
- [ ] Add `SharedPreferences.agentDisplayOrder`.
- [ ] Keep built-in `DeploymentTargetName` union unchanged.
- [ ] Add helper types for merged target metadata without weakening built-in type safety.
- [ ] Run: `npm test --workspace @skill-flow/storage -- preferences-store.test.ts`
- [ ] Expected: failing normalization tests for missing `customTargets`.

### Task 2: Persist and normalize custom targets

**Files:**
- Modify: `packages/storage/src/preferences-store.ts`
- Test: `packages/storage/src/tests/preferences-store.test.ts`

- [ ] Add normalization for `customTargets` with duplicate-id rejection and path cleanup.
- [ ] Add normalization for `agentDisplayOrder` so built-ins and customs share one persisted display order.
- [ ] Preserve forward-compatible schema behavior for older preference files without `customTargets`.
- [ ] Add tests for:
  - valid custom target survives round-trip
  - duplicate ids are pruned
  - built-in id collision is pruned
  - absolute `projectPathTemplate` is pruned
  - stale ids are pruned from `agentDisplayOrder`
  - missing ids are appended deterministically to `agentDisplayOrder`
- [ ] Run: `npm test --workspace @skill-flow/storage -- preferences-store.test.ts`
- [ ] Expected: all storage tests pass.

### Task 3: Build merged target catalog helpers

**Files:**
- Modify: `packages/integration/src/utils/constants.ts`
- Test: `apps/cli/src/tests/target-definitions.test.ts`

- [ ] Refactor current built-in constants into explicit built-in-only catalog helpers.
- [ ] Add merged helpers that accept `customTargets`.
- [ ] Keep existing built-in exports for backward-safe internal migration, then update call sites progressively.
- [ ] Add tests for merged order, immutability metadata, and resolved project/global paths.
- [ ] Run: `npx vitest run apps/cli/src/tests/target-definitions.test.ts`
- [ ] Expected: target definition tests fail before implementation, then pass.

### Task 4: Make channel adapters dynamic

**Files:**
- Modify: `packages/integration/src/adapters/channel-adapters.ts`
- Modify: `packages/query/src/runtime.ts`
- Test: `apps/cli/src/tests/skill-flow.test.ts`

- [ ] Change adapter construction to accept merged target metadata from preferences.
- [ ] Ensure custom targets resolve:
  - global root from `globalPath`
  - project root by joining active project path with `projectPathTemplate`
- [ ] Ensure project deployment fails clearly when project scope has no usable project root.
- [ ] Add focused tests that deploy one source to one custom target in global scope and project scope.
- [ ] Run: `npx vitest run apps/cli/src/tests/skill-flow.test.ts`
- [ ] Expected: custom target deployment tests pass without regressing built-ins.

### Task 5: Expose custom targets through query/config/bridge flows

**Files:**
- Modify: `packages/query/src/runtime.ts`
- Modify: `packages/query/src/config-coordinator.ts`
- Modify: `packages/core-engine/src/services/workspace-bootstrap-service.ts`
- Modify: `packages/core-engine/src/services/doctor-service.ts`
- Modify: `apps/cli/src/bridge-command.ts`
- Test: `packages/query/src/tests/config-coordinator.test.ts`
- Test: `packages/query/src/tests/source-lifecycle.test.ts`

- [ ] Ensure list/config/inspect/apply responses include merged target data.
- [ ] Ensure bootstrap detection can surface custom observed targets.
- [ ] Ensure doctor reports include custom target path failures.
- [ ] Add tests for bridge-facing config payloads and project-scope resolution with customs.
- [ ] Run:
  - `npm test --workspace @skill-flow/query -- config-coordinator.test.ts`
  - `npm test --workspace @skill-flow/query -- source-lifecycle.test.ts`
- [ ] Expected: query tests pass.

### Task 6: Add desktop settings state for custom targets

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Store/SettingsState.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopSettingsStore.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/SettingsViewModel.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewModelTests.swift`

- [ ] Add Swift models mirroring `CustomTargetDefinition`.
- [ ] Add Swift state for unified `agentDisplayOrder`.
- [ ] Load/save custom targets through desktop settings store.
- [ ] Add view-model validation methods for add/edit/delete.
- [ ] Prevent edits to built-in target path definitions in the view model.
- [ ] Add tests for:
  - add custom target
  - edit custom target
  - delete custom target
  - reject absolute project path
  - reject collision with built-in id
  - preserve unified sort order with built-ins and customs together
- [ ] Run: `swift test --filter SettingsViewModelTests`
- [ ] Expected: settings view-model tests pass.

### Task 7: Add Settings UI for custom target management

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Store/AgentDisplayPreference.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsViewTests.swift`

- [ ] Add a `Custom Agents` section under Settings with add/edit/delete controls.
- [ ] Keep the main Settings page compact by using a summary row plus `Manage Agents` sheet.
- [ ] Keep built-in rows visibly immutable.
- [ ] Keep one unified sortable display list for built-ins and customs in `Agent Display`.
- [ ] In the management surface, show path details for both built-ins and customs.
- [ ] Built-in detail rows must show read-only global/project paths.
- [ ] Add project-path hint text explaining relative semantics.
- [ ] Add inline validation messaging for absolute project paths and duplicate ids/names.
- [ ] Add monogram icon rendering for custom agents.
- [ ] Add rendering tests for:
  - built-in read-only rows
  - built-in read-only detail view with global/project paths
  - custom rows in unified display list
  - `Custom Agents` summary row on the main Settings page
  - `Manage Agents` sheet title and action layout
  - custom-agent edit form validation
- [ ] Run: `swift test --filter SettingsViewTests`
- [ ] Expected: UI tests pass.

### Task 8: Update docs and regression coverage

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `README.ja.md`
- Test: targeted CLI and desktop suites

- [ ] Document custom agent support, including:
  - built-ins are immutable
  - custom agents can define global and project paths
  - project path is relative to project root
- [ ] Run targeted verification:
  - `npm test --workspace @skill-flow/storage`
  - `npm test --workspace @skill-flow/query`
  - `npx vitest run apps/cli/src/tests/target-definitions.test.ts apps/cli/src/tests/skill-flow.test.ts`
  - `swift test --filter 'SettingsViewModelTests|SettingsViewTests'`
- [ ] If targeted suites are green, optionally run:
  - `npm test`

## Migration Notes

- Existing users with no `customTargets` field must load cleanly with an empty custom-target list.
- Existing users with no `agentDisplayOrder` field must load cleanly with normalized default order.
- Existing built-in target preferences must keep working unchanged.
- No compatibility layer is needed for previous built-in target path storage because built-ins remain code-defined.

## Open Risks To Watch During Implementation

- Current code assumes `DeploymentTargetName` in many places; avoid widening all paths to raw `string` too early.
- Desktop currently derives labels and mount paths from static `AgentDisplayCatalog`; this must become hybrid instead of purely static.
- Unified display order must not diverge between desktop settings state and shared preferences.
- Custom targets in project scope require a reliable project root; failure messaging must be explicit when recent project metadata is missing.
- Doctor/bootstrap may accidentally ignore custom targets if they still iterate over static built-in order arrays.

## Verification Checklist

- Built-in targets still deploy exactly as before.
- Custom targets can be added, edited, and deleted from Settings.
- Main Settings page stays compact; custom target editing happens in the secondary management surface.
- Built-ins and customs can be reordered together in one display list.
- Unified display order is persisted in shared preferences and survives app/runtime reloads.
- Built-in agents expose read-only global/project path details in the management surface.
- Custom targets appear in config/apply target lists.
- Global scope deploys to `globalPath`.
- Project scope deploys to `<projectRoot>/<projectPathTemplate>`.
- Absolute project path input is rejected with a clear validation message.
- Built-in agents expose no editable path controls.
- Custom agents render monogram icons when no bundled icon exists.

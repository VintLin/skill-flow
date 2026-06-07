# V2 Authority Cleanup Remaining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining V2 authority cleanup so normal Skill Flow runtime, query, CLI, bridge, and desktop paths use one current schema with no V1 compatibility layer outside migration.

**Architecture:** Migration code owns old V1 shapes and discarded legacy fields. Runtime code consumes current authority files directly, with `collection` represented as a collection/materialization concept and `github` represented as its own source kind. The plan finishes P0 in four slices, then removes redundant P1 fields through normalizer tests rather than runtime fallback branches.

**Tech Stack:** TypeScript monorepo, Vitest, Swift XCTest, bridge JSON protocol, Markdown execution plans, subagent review.

---

## Current Worktree

```text
/Users/Vint/.config/superpowers/worktrees/01_skill-flow/import-preparation-cache
```

Branch:

```text
codex/import-preparation-cache
```

Do not commit, push, or open a PR unless explicitly requested.

## Source Of Truth

Use these documents for context:

- `plans/2026-06-07-v2-authority-cleanup-remaining/01-remaining-task-summary.md`
- `plans/archive/2026-06-06-v2-compat-debt-cleanup-superseded/01-data-structure-optimization-recommendations.md`
- `plans/archive/2026-06-06-v2-compat-debt-cleanup-superseded/02-authority-structure-audit.md`
- `plans/archive/2026-06-06-v2-compat-debt-cleanup-superseded/03-decision-confirmations.md`

If older recommendation docs conflict with `03-decision-confirmations.md`, follow `03-decision-confirmations.md`.

## Boundary Rules

Allowed legacy boundary:

```text
packages/core-engine/src/services/state-migration-service.ts
packages/core-engine/src/services/legacy-*.ts
packages/core-engine/src/tests/*migration*
packages/query/src/tests/*migration*
packages/storage/src/tests/*migration*
```

Normal runtime code must not:

- Read V1 authority files as fallback.
- Map `collection` to V1 `virtual`.
- Map `collection` to git checkout/fetch.
- Emit V1-shaped bridge/view payloads for current authority state.
- Read redundant legacy fields with `field ?? newField` fallback.
- Reintroduce `ProjectionRecord.mode` outside migration input.

## Completion Definition

P0 is complete only when Task 1, Task 2, Task 3, and Task 4 all pass their focused verification. The whole cleanup is complete only when P0 is done, Task 5 P1 cleanup is either completed or explicitly deferred in a new plan, and Task 6 final verification passes.

## File Structure

- `packages/domain/src/types.ts`: owns current public domain type names and temporary V2 aliases during migration.
- `packages/storage/src/runtime-store.ts`: owns state directory layout helpers; `source/<kind>/<id>` paths are defined here.
- `packages/storage/src/import-preparation-cache.ts`: owns import-preparation cache normalization and P1 field discard behavior.
- `packages/core-engine/src/services/source-checkout-service.ts`: owns checkout/fetch kinds; accepts `git`, `github`, `local`, `clawhub`, not `collection`.
- `packages/core-engine/src/services/source-authority-service-v2.ts`: owns source commit/update authority behavior and temporary V2 service naming.
- `packages/core-engine/src/services/import-preparation-service-v2.ts`: owns import preparation; must not convert `collection` to git checkout.
- `packages/core-engine/src/services/projection-ledger.ts`: owns active/current projection helper behavior with no `mode` dependency.
- `packages/query/src/runtime.ts`: owns high-level runtime workflows and must consume current authority DTOs directly.
- `packages/query/src/state-v2-view.ts`: current V2-to-V1 projection layer to delete in Task 2.
- `apps/cli/src/**`: owns CLI and bridge command expectations.
- `apps/desktop-mac/Sources/DesktopApp/**`: owns desktop bridge model and import preview state.

## Task 1: P0 5A Authority Kind, Source Paths, And Projection Ledger

**Files:**

- Modify: `packages/domain/src/types.ts`
- Modify: `packages/storage/src/runtime-store.ts`
- Create or modify: `packages/storage/src/tests/runtime-store.test.ts`
- Modify: `packages/core-engine/src/services/source-checkout-service.ts`
- Modify: `packages/core-engine/src/services/import-preparation-service-v2.ts`
- Modify: `packages/core-engine/src/services/projection-ledger.ts`
- Modify: `packages/core-engine/src/services/deployment-planner-v2.ts`
- Modify: `packages/core-engine/src/services/doctor-service.ts`
- Modify: `packages/core-engine/src/services/workspace-bootstrap-service.ts`
- Modify: `packages/query/src/runtime.ts`
- Modify tests under `packages/core-engine/src/tests/**`, `packages/query/src/tests/**`, and `packages/storage/src/tests/**`

- [ ] **Step 1: Write failing RuntimeStore source path tests**

Create or update `packages/storage/src/tests/runtime-store.test.ts`:

```ts
import path from "node:path";
import { access, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import { afterEach, describe, expect, test } from "vitest";
import { RuntimeStore } from "../runtime-store.js";

let sandboxRoot: string | undefined;

afterEach(async () => {
  if (sandboxRoot) {
    await rm(sandboxRoot, { recursive: true, force: true });
    sandboxRoot = undefined;
  }
});

async function createStore(): Promise<RuntimeStore> {
  sandboxRoot = await mkdtemp(path.join(os.tmpdir(), "skill-flow-runtime-store-"));
  return new RuntimeStore(sandboxRoot);
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
}

describe("RuntimeStore source paths", () => {
  test("uses independent physical directories for each current source kind", async () => {
    const store = await createStore();

    expect(store.getSourceRoot("git")).toBe(path.join(store.rootPath, "source", "git"));
    expect(store.getSourceRoot("github")).toBe(path.join(store.rootPath, "source", "github"));
    expect(store.getSourceRoot("local")).toBe(path.join(store.rootPath, "source", "local"));
    expect(store.getSourceRoot("clawhub")).toBe(path.join(store.rootPath, "source", "clawhub"));
    expect(store.getSourceRoot("collection")).toBe(path.join(store.rootPath, "source", "collection"));
    expect(store.getSourceCheckoutPath("github", "repo")).toBe(
      path.join(store.rootPath, "source", "github", "repo"),
    );
    expect(store.getSourceCheckoutPath("git", "repo")).toBe(
      path.join(store.rootPath, "source", "git", "repo"),
    );
  });

  test("initializes github and collection source directories", async () => {
    const store = await createStore();

    await store.initializeRuntimePaths();

    await expect(pathExists(store.getSourceRoot("github"))).resolves.toBe(true);
    await expect(pathExists(store.getSourceRoot("collection"))).resolves.toBe(true);
  });
});
```

Run:

```bash
npm run -w @skill-flow/storage test -- runtime-store.test.ts
```

Expected before implementation: TypeScript fails because current `SourceKind` does not include `github`, or assertions fail because paths are not initialized.

- [ ] **Step 2: Unify current `SourceKind`**

In `packages/domain/src/types.ts`, replace:

```ts
export type SourceKind = "local" | "git" | "clawhub" | "collection";
```

with:

```ts
export type SourceKind = "git" | "github" | "local" | "clawhub" | "collection";
```

Then replace:

```ts
export type SourceKindV2 = "git" | "github" | "local" | "clawhub" | "collection";
```

with:

```ts
export type SourceKindV2 = SourceKind;
```

Run:

```bash
npm run -w @skill-flow/domain build
npm run -w @skill-flow/storage test -- runtime-store.test.ts
```

Expected: domain build passes; the storage test may still fail until Step 3 initializes the new directories.

- [ ] **Step 3: Fix RuntimeStore source directory layout**

In `packages/storage/src/runtime-store.ts`, replace the `sourceRoot` getter:

```ts
get sourceRoot(): string {
  return this.getSourceRoot("git");
}
```

with:

```ts
get sourceRoot(): string {
  return path.join(this.rootPath, "source");
}
```

Keep `getSourceRoot(kind: SourceKind)` as the only kind-specific source root helper.

In `initializeRuntimePaths`, change the source directory list from:

```ts
ensureDir(this.getSourceRoot("local")),
ensureDir(this.getSourceRoot("git")),
ensureDir(this.getSourceRoot("clawhub")),
```

to:

```ts
ensureDir(this.getSourceRoot("local")),
ensureDir(this.getSourceRoot("git")),
ensureDir(this.getSourceRoot("github")),
ensureDir(this.getSourceRoot("clawhub")),
ensureDir(this.getSourceRoot("collection")),
```

Run:

```bash
npm run -w @skill-flow/storage test -- runtime-store.test.ts
```

Expected: `RuntimeStore source paths` tests pass.

- [ ] **Step 4: Split checkout kinds from materialization kinds**

In `packages/core-engine/src/services/source-checkout-service.ts`, replace:

```ts
export type SourceCheckoutKind = Extract<SourceKind, "local" | "git" | "clawhub">;
```

with:

```ts
export type SourceCheckoutKind = Extract<SourceKind, "local" | "git" | "github" | "clawhub">;
```

In `packages/core-engine/src/services/import-preparation-service-v2.ts`, update `sourceCheckoutKind(record)` so `collection` cannot return `"git"`:

```ts
private sourceCheckoutKind(record: ImportPreparationRecord): SourceCheckoutKind {
  switch (record.sourceKind) {
    case "github":
      return "github";
    case "git":
    case "local":
    case "clawhub":
      return record.sourceKind;
    case "collection":
      throw new Error("Collection preparations do not use source checkout");
  }
}
```

If the current caller requires typed failures, change the caller in the same step so the `collection` case returns a failed `Result` with code `COLLECTION_CHECKOUT_UNSUPPORTED`. Do not map `collection` to a checkout kind.

Run:

```bash
npm run -w @skill-flow/core-engine test -- source-checkout-service.test.ts import-preparation-service-v2.test.ts
```

Expected: tests pass, and no current test passes `collection` into `SourceCheckoutService`.

- [ ] **Step 5: Write projection regression tests without `mode`**

In `packages/core-engine/src/tests/deployment-planner-v2.test.ts`, add a test using active V2 projections without `mode`:

```ts
test("keeps active V2 projections without mode", () => {
  const lockFile: LockFileV2 = {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    sources: {},
    leafInventory: [],
    projections: [
      {
        sourceId: "repo",
        leafId: "repo:writer",
        target: "codex",
        targetPath: "/targets/codex/writer",
        strategy: "symlink",
        contentHash: "hash-writer",
        status: "active",
        updatedAt: "2026-06-07T00:00:00.000Z",
      },
    ],
  };

  expect(lockFile.projections).toEqual([
    expect.not.objectContaining({ mode: expect.anything() }),
  ]);
  expect(lockFile.projections.filter((projection) => projection.status === "active")).toHaveLength(1);
});
```

Add `import type { LockFileV2 } from "@skill-flow/domain/types";` at the top of the test file if it is not already imported.

Run:

```bash
npm run -w @skill-flow/core-engine test -- deployment-planner-v2.test.ts
```

Expected before implementation: the test compiles; any failure shows the helper or fixture still expects `mode`.

- [ ] **Step 6: Add required P0 regression coverage from the audit**

Add or update the following focused tests. These tests are required because they came from the P0 audit checklist:

```text
packages/domain/src/source-kind.test.ts
  - enumerates SourceKind as git/github/local/clawhub/collection
  - asserts collection is a source kind but not a checkout kind

packages/query/src/tests/bootstrap-projection-rebuild.test.ts
  - seeds a bootstrap-detected source and active V2 projection without mode
  - runs the rebuild/apply path
  - asserts the projection remains active and still has no mode field

packages/query/src/tests/source-lifecycle.test.ts
  - covers orphan target cleanup after active projection repair
  - asserts ORPHAN_TARGET_SYMLINK_REMOVED still fires after mode removal

packages/core-engine/src/tests/deployment-planner-v2.test.ts
  - covers two active projections pointing at the same targetPath
  - asserts the second owner is blocked rather than silently replacing the first

packages/query/src/tests/state-authority-view.test.ts
  - covers current authority state round-trip without V1 view fields
  - asserts no schemaVersion: 1 view payload, deployments, projectionViews, or mode fields
```

Run:

```bash
npm run -w @skill-flow/domain test -- source-kind.test.ts
npm run -w @skill-flow/query test -- bootstrap-projection-rebuild.test.ts source-lifecycle.test.ts state-authority-view.test.ts
npm run -w @skill-flow/core-engine test -- deployment-planner-v2.test.ts
```

Expected before implementation: at least one test fails or cannot compile until the authority kind and projection changes are implemented.

- [ ] **Step 7: Rewrite projection-ledger to current authority types**

In `packages/core-engine/src/services/projection-ledger.ts`, replace V1 imports and `mode` filters with current V2 types:

```ts
import type {
  DeploymentTargetId,
  LockFileV2,
  ProjectionRecordV2,
  SourceLockRecordV2,
} from "@skill-flow/domain/types";

export function activeProjections(lockFile: Pick<LockFileV2, "projections">): ProjectionRecordV2[] {
  return lockFile.projections.filter((projection) => projection.status === "active");
}

export function bootstrapImportedTargets(
  lockFile: Pick<LockFileV2, "projections">,
  sourceLock: SourceLockRecordV2,
): DeploymentTargetId[] {
  return [
    ...new Set([
      ...lockFile.projections
        .filter(
          (projection) =>
            projection.status === "active" &&
            projection.sourceId === sourceLock.sourceId,
        )
        .map((projection) => projection.target),
      ...(sourceLock.observedTargets?.map((item) => item.target) ?? []),
      ...(sourceLock.importedFromTargets ?? []),
    ]),
  ];
}
```

Keep this temporary exported function until Task 3 removes compatibility names:

```ts
export const managedProjections = activeProjections;
```

Task 3 must remove the alias and update all callers to `activeProjections`.

- [ ] **Step 8: Remove normal runtime `projection.mode` reads**

Update these known runtime reads in `packages/query/src/runtime.ts`:

```text
projection.mode === "managed"
projection.mode === "bootstrap-imported"
candidate.mode === projection.mode
mode: projection.mode
```

Use these replacements:

```text
active projection -> projection.status === "active"
bootstrap source ownership -> sourceLock.importMode === "bootstrap-detected"
same projection identity -> sourceId + leafId + target + targetPath
audit mode output -> sourceLock.importMode or omit mode from current DTO
```

Run:

```bash
rg -n "projection\\.mode|mode: projection\\.mode" packages/query/src packages/core-engine/src --glob '!**/dist/**'
```

Expected: only migration code or tests explicitly describing legacy input may match.

- [ ] **Step 9: Rename deployment planner active owner terminology**

In `packages/core-engine/src/services/deployment-planner-v2.ts`, find the local variable inside `inspectTargetPath`:

```ts
const managedProjections = await this.findActiveProjectionOwners(
  targetPath,
  activeProjections,
);
```

Rename it to `activeOwners`:

```ts
const activeOwners = await this.findActiveProjectionOwners(
  targetPath,
  activeProjections,
);
```

Then update the derived variables in the same method:

```ts
const blockingManagedProjection = activeOwners.find(
  (projection) => !this.matchesProjectionSourceLeaf(projection, sourceId, leaf.id),
);
const managedProjection =
  blockingManagedProjection ??
  activeOwners.find((projection) =>
    this.matchesProjection(projection, sourceId, leaf.id, target),
  ) ??
  activeOwners.find((projection) =>
    this.matchesProjectionSourceLeaf(projection, sourceId, leaf.id),
  );
```

Keep externally visible response field names unchanged in this task if renaming them would change the public plan/action DTO. The purpose here is to remove misleading local V1 mode terminology.

Run:

```bash
npm run -w @skill-flow/core-engine test -- deployment-planner-v2.test.ts
```

Expected: tests pass and no local variable named `managedProjections` remains in `deployment-planner-v2.ts`.

- [ ] **Step 10: Run Task 1 focused verification**

Run:

```bash
npm run -w @skill-flow/domain build
npm run -w @skill-flow/storage build
npm run -w @skill-flow/core-engine build
npm run -w @skill-flow/query build
npm run -w @skill-flow/storage test -- runtime-store.test.ts state-store-v2.test.ts import-preparation-cache.test.ts
npm run -w @skill-flow/core-engine test -- source-checkout-service.test.ts deployment-planner-v2.test.ts state-migration-service.test.ts import-preparation-service-v2.test.ts
npm run -w @skill-flow/query test -- bootstrap-projection-rebuild.test.ts source-lifecycle.test.ts state-authority-view.test.ts collections.test.ts runtime-v2.test.ts runtime-source-v2.test.ts config-coordinator.test.ts
```

Expected: all commands exit 0.

## Task 2: P0 5B Delete V2-To-V1 View Layer And Desktop V1 Import Preview

**Files:**

- Delete: `packages/query/src/state-v2-view.ts`
- Modify: `packages/query/src/index.ts`
- Modify: `packages/query/src/runtime.ts`
- Modify: `packages/query/src/workflow-service.ts`
- Modify: `packages/query/src/tests/state-v2-view.test.ts`
- Modify: `packages/query/src/tests/import-page-flow.test.ts`
- Modify: `packages/query/src/tests/collections.test.ts`
- Modify: `apps/cli/src/bridge-command.ts`
- Modify: `apps/cli/src/tests/config-integration.test.ts`
- Modify: `apps/cli/src/tests/skill-flow.test.ts`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Store/ImportState.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportViewModelTests.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`

- [ ] **Step 1: Add current-authority DTO tests before deleting the view**

Create `packages/query/src/tests/state-authority-view.test.ts` with current authority expectations:

```ts
import { describe, expect, test } from "vitest";
import type { ManifestFileV2, LockFileV2, PreferencesFileV2 } from "@skill-flow/domain/types";

describe("current authority DTO shape", () => {
  test("does not expose V1 view fields", () => {
    const manifest: ManifestFileV2 = {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      sources: [
        {
          id: "repo",
          locator: "https://github.com/acme/repo",
          canonicalLocator: "github:acme/repo",
          kind: "github",
          displayName: "Repo",
          enabled: true,
          createdAt: "2026-06-07T00:00:00.000Z",
          updatedAt: "2026-06-07T00:00:00.000Z",
        },
      ],
      bindings: {},
    };
    const lockFile: LockFileV2 = {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      sources: {},
      leafInventory: [],
      projections: [],
    };
    const preferences: PreferencesFileV2 = {
      schemaVersion: 2,
      migrationGeneration: "mg_test",
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" },
      recentProjects: [],
      projectSourceDrafts: {},
      customTargets: [],
      agentDisplayOrder: [],
    };

    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.sources[0]?.kind).toBe("github");
    expect(lockFile).not.toHaveProperty("deployments");
    expect(lockFile).not.toHaveProperty("projectionViews");
    expect(preferences.schemaVersion).toBe(2);
  });
});
```

Run:

```bash
npm run -w @skill-flow/query test -- state-authority-view.test.ts
```

Expected: the new test passes independently.

- [ ] **Step 2: Replace `projectStateV2ToView` runtime calls**

In `packages/query/src/runtime.ts`, replace each call to:

```ts
projectStateV2ToView(state)
```

with direct current authority state usage. Use these mappings:

```text
view.manifest -> state.manifest
view.lockFile -> state.lockFile
view.preferences -> state.preferences
view.lockFile.sources[] -> Object.values(state.lockFile.sources)
view.lockFile.deployments -> state.lockFile.projections
view.lockFile.projections -> state.lockFile.projections
view.manifest.sources[] -> state.manifest.sources
```

Where a callee still expects V1 `Manifest` / `LockFile`, update that callee in the same step to accept `ManifestFileV2` / `LockFileV2` rather than adding an adapter.

Run:

```bash
rg -n "projectStateV2ToView|StateV2AuthorityView" packages/query/src/runtime.ts
npm run -w @skill-flow/query build
```

Expected: `rg` returns no matches in `runtime.ts`; build passes.

- [ ] **Step 3: Replace CLI test view imports**

In `apps/cli/src/tests/config-integration.test.ts` and `apps/cli/src/tests/skill-flow.test.ts`, remove:

```ts
import { projectStateV2ToView } from "@skill-flow/query";
```

Replace helper usage:

```ts
projectStateV2ToView(await v2(app).readState())
```

with:

```ts
await v2(app).readState()
```

Then update destructuring:

```text
{ manifest, lockFile, preferences } -> same names from the current state object
lockFile.deployments -> lockFile.projections
lockFile.sources array -> Object.values(lockFile.sources)
```

Run:

```bash
npm run -w skill-flow test -- config-integration.test.ts skill-flow.test.ts
```

Expected: tests pass without importing `projectStateV2ToView`.

- [ ] **Step 4: Delete state-v2-view export and file**

Remove this line from `packages/query/src/index.ts`:

```ts
export * from "./state-v2-view.js";
```

Delete:

```text
packages/query/src/state-v2-view.ts
packages/query/src/tests/state-v2-view.test.ts
```

Run:

```bash
rg -n "state-v2-view|projectStateV2ToView|projectManifestV2ToView|LockFileV2View|StateV2AuthorityView" packages apps --glob '!**/dist/**'
npm run -w @skill-flow/query build
```

Expected: `rg` has no production matches. Any remaining match must be a plan/archive document, not source code.

- [ ] **Step 5: Convert desktop import preview state to V2 selectedSkills**

In `apps/desktop-mac/Sources/DesktopApp/Store/ImportState.swift`, remove the computed V1 path property and V1 initializer:

```swift
var selectedSkillPaths: [String] {
    selectedSkills.compactMap(\.repoPath)
}

init(selectedSkillPaths: [String], enabledTargetIds: [String]) {
    self.selectedSkills = selectedSkillPaths.map(ImportSkillSelection.repoPath)
    self.enabledTargetIds = enabledTargetIds
}
```

Keep the V2 initializer:

```swift
init(selectedSkills: [ImportSkillSelection], enabledTargetIds: [String]) {
    self.selectedSkills = selectedSkills
    self.enabledTargetIds = enabledTargetIds
}
```

In `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`, change:

```swift
let selectedSkillPaths: [String]
```

to:

```swift
let selectedSkills: [ImportSkillSelection]
```

Update `parseLocalScanImportChoices` and `parseLocalImportChoices` to read:

```swift
let selectedSkills = parseImportSkillSelections(choice["selectedSkills"])
```

and stop reading:

```swift
choice["selectedSkillPaths"]
```

Run:

```bash
cd apps/desktop-mac && swift test --filter 'ImportViewModelTests'
```

Expected: tests compile only after test fixtures are converted in Step 7.

- [ ] **Step 6: Convert ImportScreen and container selection helpers**

In `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`, delete `selectedSkillPathsForImport(for:)` and keep only a V2 helper:

```swift
func selectedSkillsForImport(for card: ImportViewModel.Card) -> [ImportSkillSelection] {
    guard let choice = localImportChoice(for: card),
          let draft = drafts[card.id],
          !choice.selectedSkills.isEmpty else {
        return drafts[card.id]?.selectedSkills ?? []
    }

    let draftIds = Set(draft.selectedSkills.map(\.uiId))
    return choice.selectedSkills.filter { draftIds.contains($0.uiId) }
}
```

In `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`, replace `selectedSkillPaths` based selection checks with `selectedSkills.map(\.uiId)`.

Run:

```bash
cd apps/desktop-mac && swift test --filter 'ImportScreenContainerTests'
```

Expected: tests pass after fixtures are updated to V2 `selectedSkills`.

- [ ] **Step 7: Update Swift and bridge tests to reject V1 import preview**

Update Swift fixtures from:

```swift
selectedSkillPaths: ["browse"]
```

to:

```swift
selectedSkills: [.repoPath("browse")]
```

Update bridge JSON fixtures from:

```json
{ "selectedSkillPaths": ["browse"] }
```

to:

```json
{ "selectedSkills": [{ "uiId": "browse", "selector": { "kind": "repoPath", "path": "browse" } }] }
```

In `BridgeClientExecutionTests.swift`, remove any branch that accepts both V1 and V2 preview payloads. The expected payload must contain `selectedSkills` and must not contain `selectedSkillPaths`.

Run:

```bash
cd apps/desktop-mac && swift test --filter 'BridgeClientExecutionTests|ImportViewModelTests|ImportScreenContainerTests|WorkflowCoverageTests'
```

Expected: all focused desktop tests pass.

- [ ] **Step 8: Update CLI bridge import draft contract to current selectedSkills**

In `apps/cli/src/bridge-command.ts`, keep bridge import draft parsing on current `selectedSkills` only. The import draft parser must reject V1 path arrays:

```ts
function expectOptionalImportDraft(value: JsonValue | undefined): ImportDraft | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isJsonObject(value)) {
    throw new Error("Field 'draft' must be a JSON object when provided.");
  }

  const selectedSkills = parseOptionalImportSkillSelections(value.selectedSkills);
  if (!selectedSkills) {
    throw new Error("Field 'draft.selectedSkills' must be provided.");
  }

  const enabledTargets = parseOptionalStringArray(value.enabledTargets, "draft.enabledTargets") ?? [];

  return {
    selectedSkills,
    enabledTargets: enabledTargets as ImportDraft["enabledTargets"],
  };
}
```

Add or keep a negative test in `apps/cli/src/tests/bridge-command.test.ts`:

```ts
await expect(
  runBridgeCommand({
    command: "preview-import",
    payload: {
      draft: {
        selectedSkillPaths: ["browse"],
        enabledTargets: ["codex"],
      },
    },
  }),
).rejects.toThrow("draft.selectedSkills");
```

Run:

```bash
npm run -w skill-flow test -- bridge-command.test.ts
```

Expected: bridge accepts V2 `selectedSkills` and rejects V1 `selectedSkillPaths`.

- [ ] **Step 9: Run Task 2 focused verification**

Run:

```bash
npm run -w @skill-flow/query test -- state-authority-view.test.ts collections.test.ts runtime-v2.test.ts runtime-source-v2.test.ts config-coordinator.test.ts source-lifecycle.test.ts import-page-flow.test.ts
npm run -w skill-flow test -- config-integration.test.ts skill-flow.test.ts bridge-command.test.ts
cd apps/desktop-mac && swift test --filter 'BridgeClientExecutionTests|ImportViewModelTests|ImportScreenContainerTests|WorkflowCoverageTests'
rg -n "projectStateV2ToView|state-v2-view|selectedSkillPaths|previewVersion" packages apps --glob '!**/dist/**' --glob '!**/.build/**'
```

Expected: tests pass. `rg` returns no source-code matches except migration tests or explicit negative tests rejecting old payloads.

## Task 3: P0 5C Shadow Types And Public V2 Suffix Cleanup

**Files:**

- Modify: `packages/domain/src/types.ts`
- Move: `packages/storage/src/state-schema-v2.ts` to `packages/storage/src/state-schema.ts`
- Move: `packages/storage/src/state-store-v2.ts` to `packages/storage/src/state-store.ts`
- Move: `packages/core-engine/src/services/source-authority-service-v2.ts` to `packages/core-engine/src/services/source-authority-service.ts`
- Move: `packages/core-engine/src/services/import-preparation-service-v2.ts` to `packages/core-engine/src/services/import-preparation-service.ts`
- Move: `packages/core-engine/src/services/deployment-planner-v2.ts` to `packages/core-engine/src/services/deployment-planner.ts`
- Move: `packages/core-engine/src/services/deployment-applier-v2.ts` to `packages/core-engine/src/services/deployment-applier.ts`
- Modify imports in `packages/**`, `apps/cli/**`, and desktop bridge test fixtures as needed

- [x] **Step 1: Add static no-shadow-type checks**

Create `packages/domain/src/current-type-surface.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const typesSource = readFileSync(path.join(testDir, "types.ts"), "utf8");

describe("current domain type surface", () => {
  test("does not export V1 authority shadow types", () => {
    expect(typesSource).not.toMatch(/export type Manifest = \\{/);
    expect(typesSource).not.toMatch(/export type LockFile = \\{/);
    expect(typesSource).not.toMatch(/export type SharedPreferences = \\{/);
    expect(typesSource).not.toMatch(/export type DeploymentRecord = \\{/);
  });

  test("does not export public V2 suffix aliases after cleanup", () => {
    expect(typesSource).not.toMatch(/export type \\w+V2\\b/);
    expect(typesSource).not.toMatch(/export interface \\w+V2\\b/);
    expect(typesSource).not.toMatch(/export class \\w+V2\\b/);
  });
});
```

Run:

```bash
npm run -w @skill-flow/domain test -- current-type-surface.test.ts
```

Expected before implementation: the test fails because V1 shadow types and `*V2` exports still exist.

- [x] **Step 2: Rename current authority types in domain**

In `packages/domain/src/types.ts`, rename current authority types to unsuffixed names. Apply these mappings:

```text
ManifestFileV2 -> ManifestFile
LockFileV2 -> LockFile
PreferencesFileV2 -> PreferencesFile
CollectionsFileV2 -> CollectionsFile
SourceManifestRecordV2 -> SourceManifestRecord
SourceLockRecordV2 -> SourceLockRecord
SourceBindingV2 -> SourceBinding
LeafRecordV2 -> LeafRecord
ProjectionRecordV2 -> ProjectionRecord
ImportDraftV2 -> ImportDraft
ImportPreviewSkillV2 -> ImportPreviewSkill
ImportPreparationRecordV2 -> ImportPreparationRecord
LocalImportChoiceV2 -> LocalImportChoice
LocalScanImportChoiceV2 -> LocalScanImportChoice
SourceRevisionV2 -> SourceRevision
SourceUpdateResultV2 -> SourceUpdateResult
SourceUpdateDiffV2 -> SourceUpdateDiff
StateStoreV2Error -> StateStoreError
StateStoreV2State -> StateStoreState
```

Delete the old V1 definitions for names that now belong to the current schema. Migration code that still needs V1 shapes must define internal `Legacy*` types inside `packages/core-engine/src/services/state-migration-service.ts`; do not export those legacy shapes from `packages/domain/src/types.ts`.

Run:

```bash
npm run -w @skill-flow/domain build
```

Expected: initial compile errors point to consumers that still import old names; fix them in Step 3.

- [x] **Step 3: Rename files/classes and update imports**

Move current implementation files to unsuffixed names:

```bash
mv packages/storage/src/state-schema-v2.ts packages/storage/src/state-schema.ts
mv packages/storage/src/state-store-v2.ts packages/storage/src/state-store.ts
mv packages/core-engine/src/services/source-authority-service-v2.ts packages/core-engine/src/services/source-authority-service.ts
mv packages/core-engine/src/services/import-preparation-service-v2.ts packages/core-engine/src/services/import-preparation-service.ts
mv packages/core-engine/src/services/deployment-planner-v2.ts packages/core-engine/src/services/deployment-planner.ts
mv packages/core-engine/src/services/deployment-applier-v2.ts packages/core-engine/src/services/deployment-applier.ts
```

Rename classes and exports in the moved files:

```text
StateStoreV2 -> StateStore
SourceAuthorityServiceV2 -> SourceAuthorityService
ImportPreparationServiceV2 -> ImportPreparationService
DeploymentPlannerV2 -> DeploymentPlanner
DeploymentApplierV2 -> DeploymentApplier
```

Update all imports with `rg`:

```bash
rg -n "state-store-v2|state-schema-v2|source-authority-service-v2|import-preparation-service-v2|deployment-planner-v2|deployment-applier-v2|StateStoreV2|SourceAuthorityServiceV2|ImportPreparationServiceV2|DeploymentPlannerV2|DeploymentApplierV2" packages apps --glob '!**/dist/**'
```

Expected: after edits, this command returns no source-code matches except migration command text or archived plan docs outside `packages`/`apps`.

- [x] **Step 4: Remove temporary compatibility aliases**

Remove temporary aliases such as:

```ts
export type SourceKindV2 = SourceKind;
```

Do not replace them with new aliases. Update consumers to import `SourceKind` directly.

Run:

```bash
rg -n "\\b\\w+V2\\b|state-store-v2|state-schema-v2" packages apps --glob '!**/dist/**' --glob '!**/plans/**'
npm run -w @skill-flow/domain test -- current-type-surface.test.ts
```

Expected: the static test passes. Remaining `V2` source matches must be migration command/user-facing version text or test names specifically about migrating to V2.

- [x] **Step 5: Run Task 3 focused verification**

Run:

```bash
npm run -w @skill-flow/domain build
npm run -w @skill-flow/storage build
npm run -w @skill-flow/core-engine build
npm run -w @skill-flow/query build
npm run -w @skill-flow/domain test -- current-type-surface.test.ts
npm run -w @skill-flow/storage test -- state-store.test.ts import-preparation-cache.test.ts
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts import-preparation-service.test.ts deployment-planner.test.ts source-authority-service.test.ts
npm run -w @skill-flow/query test -- collections.test.ts runtime-v2.test.ts import-page-flow.test.ts
```

Expected: all commands pass. If test filenames were renamed, run the renamed filenames.

## Task 4: P0 5D Remove Core-Engine Dead Workflow Service

**Files:**

- Delete: `packages/core-engine/src/services/workflow-service.ts`
- Verify: `packages/core-engine/src/index.ts`
- Verify: `packages/core-engine/package.json`
- Modify tests only if an import exists

- [ ] **Step 1: Confirm no source imports target the dead service**

Run:

```bash
rg -n "core-engine/services/workflow-service|\\.\\/services\\/workflow-service|services/workflow-service" packages apps --glob '!**/dist/**'
```

Expected: no source import matches. Matches in archived plans do not count.

- [ ] **Step 2: Delete the dead service file**

Delete:

```text
packages/core-engine/src/services/workflow-service.ts
```

Do not remove the `"./services/*"` export from `packages/core-engine/package.json`; other service subpaths still use it.

Check `packages/core-engine/src/index.ts`. Current expected content has no workflow-service export:

```ts
export * from "./services/deployment-applier-v2.js";
export * from "./services/deployment-planner-v2.js";
export * from "./services/doctor-service.js";
export * from "./services/inventory-service.js";
export * from "./services/recent-project-service.js";
export * from "./services/state-migration-service.js";
export * from "./services/source-types.js";
export * from "./services/workspace-bootstrap-service.js";
```

After Task 3 renames files, compare against the renamed exports instead. The required assertion is that `workflow-service.js` is not exported by core-engine.

- [ ] **Step 3: Run Task 4 verification**

Run:

```bash
npm run -w @skill-flow/core-engine build
npm run -w @skill-flow/core-engine test
rg -n "packages/core-engine/src/services/workflow-service|core-engine/services/workflow-service" packages apps --glob '!**/dist/**'
```

Expected: build and tests pass; `rg` has no source-code matches.

## Task 5: P1 Redundant Fields With One-Time Normalizer Discard

**Files:**

- Modify: `packages/domain/src/types.ts`
- Modify: `packages/storage/src/import-preparation-cache.ts`
- Modify: `packages/storage/src/tests/import-preparation-cache.test.ts`
- Modify: `packages/storage/src/state-store-v2.ts` or renamed `packages/storage/src/state-store.ts`
- Modify: `packages/storage/src/tests/state-store-v2.test.ts` or renamed test
- Modify: `packages/core-engine/src/services/source-authority-service-v2.ts` or renamed file
- Modify: `packages/core-engine/src/tests/source-authority-service-v2.test.ts` or renamed test
- Modify: `packages/core-engine/src/tests/import-preparation-service-v2.test.ts` or renamed test

- [x] **Step 1: Add failing normalizer tests for import preparation fields**

In `packages/storage/src/tests/import-preparation-cache.test.ts`, add:

```ts
test("normalizes old import preparation cache by discarding locatorIndex and lease", () => {
  const normalized = normalizeImportPreparationCache({
    schemaVersion: 2,
    records: {
      "prep-1": {
        id: "prep-1",
        cacheKey: "github:owner/repo",
        locator: "https://github.com/owner/repo",
        canonicalRepo: "github:owner/repo",
        sourceKind: "github",
        checkoutPath: "/tmp/source/github/repo",
        sourceId: "repo",
        displayName: "Repo",
        status: "ready",
        preparedAt: "2026-06-07T00:00:00.000Z",
        expiresAt: "2026-06-08T00:00:00.000Z",
        skillIds: ["writer"],
        availableTargets: ["codex"],
        lease: {
          token: "legacy-token",
          expiresAt: "2026-06-08T00:00:00.000Z",
          state: "ready",
        },
      },
    },
    locatorIndex: {
      "github:owner/repo": "prep-1",
    },
  });

  expect(normalized).not.toHaveProperty("locatorIndex");
  expect(normalized.records["prep-1"]).not.toHaveProperty("lease");
});

test("writes import preparation cache without locatorIndex and lease", () => {
  const normalized = normalizeImportPreparationCache({
    records: {
      "prep-1": {
        id: "prep-1",
        cacheKey: "github:owner/repo",
        locator: "https://github.com/owner/repo",
        canonicalRepo: "github:owner/repo",
        sourceKind: "github",
        checkoutPath: "/tmp/source/github/repo",
        sourceId: "repo",
        displayName: "Repo",
        status: "ready",
        preparedAt: "2026-06-07T00:00:00.000Z",
        expiresAt: "2026-06-08T00:00:00.000Z",
        skillIds: ["writer"],
        availableTargets: ["codex"],
      },
    },
  });

  expect(JSON.stringify(normalized)).not.toContain("locatorIndex");
  expect(JSON.stringify(normalized)).not.toContain("lease");
});
```

Use the existing exported normalizer name. If the normalizer is private, add this case around the existing public read/write helper that calls it and assert against the public helper output.

Run:

```bash
npm run -w @skill-flow/storage test -- import-preparation-cache.test.ts
```

Expected before implementation: assertions fail because `locatorIndex` or `lease` still survives.

- [x] **Step 2: Delete `locatorIndex` and `lease` from types and normalizer output**

In `packages/domain/src/types.ts`, delete:

```ts
locatorIndex: Record<string, string>;
```

from the import preparation cache type.

Delete the whole `lease` block from the import preparation record type:

```ts
lease: {
  token: string;
  expiresAt: string;
  state: "ready" | "committing" | "committed" | "expired";
};
```

In `packages/storage/src/import-preparation-cache.ts`, make `normalizeImportPreparationCache` return only current fields:

```ts
return {
  records,
};
```

Do not rebuild `locatorIndex`.

In record normalization, omit `lease` entirely. Do not map `lease.state` to `status`.

Run:

```bash
npm run -w @skill-flow/storage test -- import-preparation-cache.test.ts
npm run -w @skill-flow/storage build
```

Expected: tests and build pass.

- [x] **Step 3: Replace locator lookup with record scan**

In `packages/core-engine/src/services/import-preparation-service-v2.ts` or renamed file, replace any lookup like:

```ts
const existingId = cache.locatorIndex[cacheKey];
const existing = existingId ? cache.records[existingId] : undefined;
```

with:

```ts
const existing = Object.values(cache.records).find(
  (record) => record.cacheKey === cacheKey || record.locator === cacheKey,
);
```

Run:

```bash
rg -n "locatorIndex" packages apps --glob '!**/dist/**' --glob '!**/plans/**'
npm run -w @skill-flow/core-engine test -- import-preparation-service-v2.test.ts
```

Expected: no source-code `locatorIndex` matches remain outside migration/normalizer tests; tests pass.

- [x] **Step 4: Add failing normalizer tests for leaf `displayName`**

In `packages/storage/src/tests/state-store-v2.test.ts` or the renamed state-store test, add a fixture with a current leaf that still carries old leaf-level `displayName`:

```ts
test("normalizes leaf inventory by discarding duplicate displayName", async () => {
  const store = new StateStoreV2(sandbox.stateRoot);
  await store.writeState({
    manifest: createManifestFileV2(),
    lockFile: {
      ...createLockFileV2(),
      leafInventory: [
        {
          id: "repo:writer",
          sourceId: "repo",
          relativePath: "writer",
          linkName: "writer",
          title: "Writer",
          description: "Write things",
          absolutePath: "/tmp/repo/writer",
          skillFilePath: "/tmp/repo/writer/SKILL.md",
          displayName: "Legacy Writer",
          contentHash: "hash-writer",
          selectors: { aliases: [] },
          valid: true,
          diagnostics: [],
        },
      ],
      projections: [],
    },
    preferences: createPreferencesFileV2(),
    collections: createCollectionsFileV2(),
  });

  const state = await store.readState();
  expect(state.lockFile.leafInventory[0]).toMatchObject({ title: "Writer" });
  expect(state.lockFile.leafInventory[0]).not.toHaveProperty("displayName");
});
```

Use the actual local fixture helpers in the test file for `createManifestFileV2`, `createLockFileV2`, `createPreferencesFileV2`, `createCollectionsFileV2`, and `sandbox`. The assertion contract is exact: old JSON may contain leaf `displayName`, normalized current state must not.

Run:

```bash
npm run -w @skill-flow/storage test -- state-store-v2.test.ts
```

Expected before implementation: assertion fails because leaf-level `displayName` still survives or type checking still requires it.

- [x] **Step 5: Delete `LeafRecordV2.displayName`**

In `packages/domain/src/types.ts`, delete the current leaf field:

```ts
displayName: string;
```

from the current authority leaf record type. Keep source-level `displayName`; this step only targets leaf-level duplicate display name.

In `packages/core-engine/src/services/source-authority-service-v2.ts` or renamed file, remove writes like:

```ts
displayName: leaf.title ?? leaf.name ?? leaf.linkName,
```

In `packages/storage/src/state-store-v2.ts` or renamed file, make leaf normalization discard old `displayName` and keep `title`.

Add or update tests so a leaf fixture containing old `displayName` normalizes to an object without that key.

Run:

```bash
npm run -w @skill-flow/storage test -- state-store-v2.test.ts
npm run -w @skill-flow/core-engine test -- source-authority-service-v2.test.ts
rg -n "leaf\\.displayName|displayName: leaf\\." packages apps --glob '!**/dist/**' --glob '!**/plans/**'
```

Expected: tests pass; no source-code read/write of leaf-level `displayName` remains.

- [x] **Step 6: Add type/runtime sanity checks for removed P1 fields**

Create or update a focused type-surface test under `packages/domain/src/current-type-surface.test.ts`:

```ts
test("does not expose removed redundant current fields", () => {
  expect(typesSource).not.toMatch(/locatorIndex:/);
  expect(typesSource).not.toMatch(/lease:\\s*\\{/);
  expect(typesSource).not.toMatch(/displayName:\\s*string;\\n\\s*contentHash:/);
});
```

Add runtime static checks to the Task 5 verification step:

```bash
rg -n "locatorIndex|\\.lease\\.|lease:|leaf\\.displayName|displayName: leaf\\." packages apps --glob '!**/dist/**' --glob '!**/plans/**'
```

Expected: matches are zero outside tests that explicitly verify old JSON fields are discarded.

- [x] **Step 7: Evaluate `skillFilePath` before deletion**

Run:

```bash
rg -n "skillFilePath" packages apps --glob '!**/dist/**' --glob '!**/plans/**'
```

When every current use can derive the value as `path.join(leaf.absolutePath, "SKILL.md")`, add tests and delete the field in the same normalizer pattern:

```ts
expect(normalizedLeaf).not.toHaveProperty("skillFilePath");
expect(resolveSkillFilePath(normalizedLeaf)).toBe(path.join(normalizedLeaf.absolutePath, "SKILL.md"));
```

When a current use needs a non-standard filename or persisted explicit path, create `plans/2026-06-07-v2-authority-cleanup-remaining/03-skill-file-path-decision.md` with the exact blocking use and defer only this field.

Run:

```bash
npm run -w @skill-flow/domain build
npm run -w @skill-flow/query test -- runtime-v2.test.ts import-page-flow.test.ts
```

Expected: either the field is deleted with tests passing, or the decision document explains why deletion is deferred.

- [x] **Step 8: Handle `SourceRevisionV2` provider ambiguity**

In `packages/domain/src/types.ts`, inspect `SourceRevisionV2`:

```ts
export type SourceRevisionV2 = {
  provider: "git" | "github" | "local" | "clawhub" | "collection";
  ref?: string;
  commit?: string;
  archiveEtag?: string;
  capturedAt: string;
};
```

If consumers can handle a discriminated union without adding compatibility fallback, replace it with:

```ts
export type SourceRevisionV2 =
  | {
      provider: "git" | "github" | "clawhub";
      ref?: string;
      commit?: string;
      capturedAt: string;
    }
  | {
      provider: "local";
      contentHash?: string;
      capturedAt: string;
    }
  | {
      provider: "collection";
      capturedAt: string;
    };
```

Then update `packages/core-engine/src/services/source-authority-service-v2.ts` so it writes only fields valid for that provider.

If this change conflicts with current persisted revision semantics, create:

```text
plans/2026-06-07-v2-authority-cleanup-remaining/04-source-revision-decision.md
```

with:

```markdown
# SourceRevision Cleanup Decision

## Blocking Current Uses

- `path/to/file.ts:line`: exact reason the field cannot be made provider-specific in this cleanup.

## Deferred Action

- Move `SourceRevisionV2` to a discriminated union after the listed consumers are migrated.
```

Run:

```bash
npm run -w @skill-flow/domain build
npm run -w @skill-flow/core-engine test -- source-authority-service-v2.test.ts state-migration-service.test.ts
```

Expected: either the union change passes tests, or the decision document exists with exact blocking source references.

- [x] **Step 9: Run Task 5 focused verification**

Run:

```bash
npm run -w @skill-flow/domain build
npm run -w @skill-flow/storage build
npm run -w @skill-flow/core-engine build
npm run -w @skill-flow/query build
npm run -w @skill-flow/storage test -- import-preparation-cache.test.ts state-store-v2.test.ts
npm run -w @skill-flow/core-engine test -- import-preparation-service-v2.test.ts source-authority-service-v2.test.ts
npm run -w @skill-flow/query test -- runtime-v2.test.ts import-page-flow.test.ts collections.test.ts
rg -n "locatorIndex|\\.lease\\.|lease:|leaf\\.displayName|displayName: leaf\\." packages apps --glob '!**/dist/**' --glob '!**/plans/**'
```

Expected: all commands pass. After Task 3 renames files/tests, use the renamed test filenames.

## Task 6: Final Verification

**Files:**

- Verify: whole repository

- [x] **Step 1: Run static debt checks**

Run:

```bash
rg -n "projectStateV2ToView|state-v2-view|selectedSkillPaths|previewVersion|projection\\.mode|locatorIndex|\\.lease\\.|SourceKindV2|StateStoreV2|SourceAuthorityServiceV2|ImportPreparationServiceV2" packages apps --glob '!**/dist/**' --glob '!**/.build/**'
rg -n "kind: \"virtual\"|sourceKind.*virtual|source\\.kind === \"virtual\"|source\\.kind !== \"virtual\"" packages apps --glob '!**/dist/**' --glob '!**/.build/**'
rg -n "core-engine/src/services/workflow-service|core-engine/services/workflow-service" packages apps --glob '!**/dist/**' --glob '!**/.build/**'
```

Expected: no normal source-code matches. Allowed matches must be migration boundary, negative tests rejecting old payloads, or archived plan documents outside `packages`/`apps`.

- [x] **Step 2: Run root build**

Run:

```bash
npm run build
```

Expected: exits 0.

- [x] **Step 3: Run root tests**

Run:

```bash
npm test
```

Expected: exits 0.

- [x] **Step 4: Run desktop tests**

Run:

```bash
cd apps/desktop-mac && swift test
```

Expected: exits 0. One skipped helper-timeout test is acceptable if there are 0 failures.

- [x] **Step 5: Rebuild desktop test package if desktop resources or bridge changed**

Run:

```bash
scripts/release/package-desktop-mac-dev.sh dist/desktop-mac-test-current
rm -f dist/desktop-mac-test-current/arm64/Skill-Flow-arm64.zip dist/desktop-mac-test-current/arm64/SHA256SUMS
ditto -c -k --keepParent "dist/desktop-mac-test-current/arm64/Skill Flow.app" dist/desktop-mac-test-current/arm64/Skill-Flow-arm64.zip
shasum -a 256 dist/desktop-mac-test-current/arm64/Skill-Flow-arm64-dev.dmg dist/desktop-mac-test-current/arm64/Skill-Flow-arm64.zip > dist/desktop-mac-test-current/arm64/SHA256SUMS
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac-test-current/arm64/Skill Flow.app" arm64
scripts/release/audit-mac-package-size.sh "dist/desktop-mac-test-current/arm64/Skill Flow.app" dist/desktop-mac-test-current/arm64/Skill-Flow-arm64-dev.dmg
```

Expected: package, artifact validation, and size audit pass.

## Execution Order

Execute in this order:

1. Task 1: Source kind, source paths, checkout kinds, projection ledger.
2. Task 2: Delete view layer and desktop V1 import preview.
3. Task 4: Delete dead workflow service. This can run before Task 3 if a separate worker owns only that file.
4. Task 3: Shadow type and suffix cleanup.
5. Task 5: P1 redundant field cleanup.
6. Task 6: Final verification.

Task 3 is intentionally after Task 2 because deleting V1 view consumers reduces the type rename blast radius.

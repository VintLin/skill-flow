# Skill Group Rename Original Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add import-time original names to Skill group rename so home and detail can expose original-name context, detail can rename groups, and blank rename saves reset to the original name.

**Architecture:** Persist `originalDisplayName` beside the mutable `displayName` in manifest and lock source records. Normalize legacy state at storage boundaries, keep `rename-source` as the single mutation path, and propagate the richer rename payload into Swift view models. UI changes stay scoped to shared group card title affordances, detail group header, and the existing rename dialog.

**Tech Stack:** TypeScript, Vitest, Swift, SwiftUI, XCTest, npm workspaces.

---

## File Structure

- `packages/domain/src/types.ts`: source record types gain `originalDisplayName`.
- `packages/storage/src/store.ts`: read/write normalization backfills missing `originalDisplayName`.
- `packages/storage/src/tests/store.test.ts`: storage normalization tests.
- `packages/core-engine/src/services/source-service.ts`: new source snapshots write original names and updates preserve them.
- `packages/core-engine/src/tests/source-service.test.ts`: source add/update original-name behavior.
- `packages/query/src/runtime.ts`: `renameSource` blank reset behavior and richer response payload.
- `packages/query/src/tests/source-lifecycle.test.ts`: runtime rename reset and preservation tests.
- `apps/cli/src/tests/bridge-command.test.ts`: bridge blank rename behavior changes from error forwarding to reset success.
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`: rename response parsing support if needed by existing dynamic payload helpers.
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopMutationCoordinator.swift`: decode `originalDisplayName` and `isResetToOriginal`.
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`: keep request shape, test response path.
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`: add original-name fields to card/detail models, parse payloads, apply rename/reset results to cached summaries and detail payloads.
- `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`: show selected home info-icon affordance when current name differs from original name.
- `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift`: add selected detail title-row rename icon and pass action to container/view model.
- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`: pass original-name placeholder/hint into rename dialog and support detail-triggered rename.
- `apps/desktop-mac/Sources/DesktopApp/Components/RenameSourceDialog.swift` or existing location inside `MainView.swift`: add placeholder and hint parameters. If the dialog is nested in `MainView.swift`, keep it there and do not create a new file.
- `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`: English strings.
- `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`: Simplified Chinese strings.
- `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`: Japanese strings.
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/*.swift`: focused Swift unit tests for localization, bridge coordinator, view model, and card/detail helpers.

## Task 1: Domain And Storage Original Name Normalization

**Files:**
- Modify: `packages/domain/src/types.ts`
- Modify: `packages/storage/src/store.ts`
- Modify: `packages/storage/src/tests/store.test.ts`

- [ ] **Step 1: Write failing storage tests**

Add these tests to `packages/storage/src/tests/store.test.ts` near existing manifest and lock read/write tests.

```ts
test("readState backfills missing originalDisplayName from displayName", async () => {
  const store = new StateStore(tempDir);
  await store.init();

  await fs.writeFile(store.manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    sources: [
      {
        id: "alpha",
        locator: "https://github.com/acme/alpha.git",
        kind: "git",
        displayName: "Custom Alpha",
        addedAt: "2026-05-31T00:00:00.000Z",
      },
    ],
    bindings: {},
  }, null, 2)}\n`, "utf8");
  await fs.writeFile(store.lockPath, `${JSON.stringify({
    schemaVersion: 1,
    sources: [
      {
        id: "alpha",
        locator: "https://github.com/acme/alpha.git",
        kind: "git",
        displayName: "Custom Alpha",
        checkoutPath: "/tmp/alpha",
        updatedAt: "2026-05-31T00:00:00.000Z",
        leafIds: [],
        invalidLeafs: [],
      },
    ],
    leafInventory: [],
    projections: [],
    deployments: [],
  }, null, 2)}\n`, "utf8");

  const state = await store.readState();

  expect(state.manifest.sources[0]).toMatchObject({
    displayName: "Custom Alpha",
    originalDisplayName: "Custom Alpha",
  });
  expect(state.lockFile.sources[0]).toMatchObject({
    displayName: "Custom Alpha",
    originalDisplayName: "Custom Alpha",
  });
});

test("writeState persists originalDisplayName on manifest and lock sources", async () => {
  const store = new StateStore(tempDir);
  await store.init();

  await store.writeState(
    {
      schemaVersion: 1,
      sources: [
        {
          id: "alpha",
          locator: "https://github.com/acme/alpha.git",
          kind: "git",
          displayName: "Custom Alpha",
          originalDisplayName: "alpha",
          addedAt: "2026-05-31T00:00:00.000Z",
        },
      ],
      bindings: {},
    },
    {
      schemaVersion: 1,
      sources: [
        {
          id: "alpha",
          locator: "https://github.com/acme/alpha.git",
          kind: "git",
          displayName: "Custom Alpha",
          originalDisplayName: "alpha",
          checkoutPath: "/tmp/alpha",
          updatedAt: "2026-05-31T00:00:00.000Z",
          leafIds: [],
          invalidLeafs: [],
        },
      ],
      leafInventory: [],
      projections: [],
      deployments: [],
    },
  );

  const manifest = JSON.parse(await fs.readFile(store.manifestPath, "utf8"));
  const lock = JSON.parse(await fs.readFile(store.lockPath, "utf8"));

  expect(manifest.sources[0].originalDisplayName).toBe("alpha");
  expect(lock.sources[0].originalDisplayName).toBe("alpha");
});
```

- [ ] **Step 2: Run storage tests and verify failure**

Run:

```bash
npm run -w @skill-flow/storage test -- store.test.ts
```

Expected: TypeScript or assertion failure because `originalDisplayName` is not present on normalized source records.

- [ ] **Step 3: Add domain fields**

In `packages/domain/src/types.ts`, update `SourceManifestRecord` and `SourceLockRecord`.

```ts
export type SourceManifestRecord = {
  id: string;
  locator: string;
  kind: SourceKind;
  displayName: string;
  originalDisplayName: string;
  addedAt: string;
  requestedPath?: string;
  selectionMode?: "all" | "partial";
  originLocator?: string;
  originRequestedPath?: string;
};
```

```ts
export type SourceLockRecord = {
  id: string;
  locator: string;
  kind: SourceKind;
  displayName: string;
  originalDisplayName: string;
  checkoutPath: string;
  updatedAt: string;
  leafIds: string[];
  invalidLeafs: InvalidLeafRecord[];
  commitSha?: string;
  packageSlug?: string;
  resolvedVersion?: string;
  contentHash?: string;
  versionMode?: "pinned" | "floating";
  originBranch?: string;
  importedFromTargets?: DeploymentTargetId[];
  observedTargets?: Array<{
    target: DeploymentTargetId;
    rootPath: string;
    targetPath: string;
  }>;
  importMode?: "explicit-add" | "bootstrap-detected";
};
```

- [ ] **Step 4: Normalize manifest and lock source records**

In `packages/storage/src/store.ts`, change `readManifest`, `readState`, `writeManifest`, and `writeState` to normalize manifest records. Add helpers near `normalizeLockFile`.

```ts
  async readManifest(): Promise<Manifest> {
    return this.withIoLock(async () => {
      await this.init();
      return this.normalizeManifest(await this.readManifestRaw());
    });
  }

  async writeManifest(manifest: Manifest): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(this.manifestPath, this.normalizeManifest(manifest));
    });
  }

  async readState(): Promise<{ manifest: Manifest; lockFile: LockFile }> {
    return this.withIoLock(async () => {
      await this.init();
      const manifest = this.normalizeManifest(await this.readManifestRaw());
      const lockFile = this.normalizeLockFile(await this.readLockRaw());
      return { manifest, lockFile };
    });
  }

  async writeState(manifest: Manifest, lockFile: LockFile): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(this.manifestPath, this.normalizeManifest(manifest));
      await writeJsonFile(this.lockPath, this.serializeLockFile(lockFile));
    });
  }
```

Add these helpers:

```ts
  private normalizeManifest(manifest: Manifest): Manifest {
    return {
      ...manifest,
      sources: manifest.sources.map((source) => ({
        ...source,
        originalDisplayName: source.originalDisplayName ?? source.displayName,
      })),
    };
  }

  private normalizeLockFile(lockFile: LockFile): LockFile {
    const projections = normalizeProjectionRecords(lockFile);
    const deployments = projections
      .filter((projection) => projection.mode === "managed")
      .map(({ mode: _mode, ...deployment }) => deployment);

    return {
      ...lockFile,
      sources: lockFile.sources.map((source) => ({
        ...source,
        originalDisplayName: source.originalDisplayName ?? source.displayName,
      })),
      projections,
      deployments,
      leafInventory: lockFile.leafInventory.map((leaf) => ({
        ...leaf,
        linkName:
          leaf.linkName ??
          (leaf.relativePath === "."
            ? leaf.name
            : path.basename(leaf.relativePath) || leaf.name),
        metadataWarnings: leaf.metadataWarnings ?? [],
      })),
    };
  }
```

- [ ] **Step 5: Run storage tests**

Run:

```bash
npm run -w @skill-flow/storage test -- store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/types.ts packages/storage/src/store.ts packages/storage/src/tests/store.test.ts
git commit -m "feat: persist original skill group names"
```

## Task 2: Source Add And Update Original Name Behavior

**Files:**
- Modify: `packages/core-engine/src/services/source-service.ts`
- Modify: `packages/core-engine/src/tests/source-service.test.ts`
- Modify: any test fixtures reported by `npm run -w @skill-flow/core-engine build` as missing `originalDisplayName`

- [ ] **Step 1: Write failing source-service tests**

Add tests to `packages/core-engine/src/tests/source-service.test.ts`.

```ts
test("addSource stores originalDisplayName from resolved display name", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "SKILL.md": skillDoc("alpha", "Alpha skill."),
  });
  const sourceService = createSourceService();

  const added = await sourceService.addSource(repoPath);

  expect(added.ok).toBe(true);
  if (!added.ok) {
    throw new Error("expected source add to succeed");
  }
  expect(added.data.manifest.displayName).toBe("alpha-skills");
  expect(added.data.manifest.originalDisplayName).toBe("alpha-skills");
  expect(added.data.lock.displayName).toBe("alpha-skills");
  expect(added.data.lock.originalDisplayName).toBe("alpha-skills");
});

test("updateSources preserves imported originalDisplayName", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "SKILL.md": skillDoc("alpha", "Alpha skill."),
  });
  const sourceService = createSourceService();
  const stateStore = new StateStore();
  const added = await sourceService.addSource(repoPath);
  expect(added.ok).toBe(true);

  const { manifest, lockFile } = await stateStore.readState();
  manifest.sources[0].displayName = "Custom Alpha";
  manifest.sources[0].originalDisplayName = "alpha-skills";
  lockFile.sources[0].displayName = "Custom Alpha";
  lockFile.sources[0].originalDisplayName = "alpha-skills";
  await stateStore.writeState(manifest, lockFile);

  const updated = await sourceService.updateSources();

  expect(updated.ok).toBe(true);
  const after = await stateStore.readState();
  expect(after.manifest.sources[0]).toMatchObject({
    displayName: "Custom Alpha",
    originalDisplayName: "alpha-skills",
  });
  expect(after.lockFile.sources[0]).toMatchObject({
    displayName: "Custom Alpha",
    originalDisplayName: "alpha-skills",
  });
});
```

- [ ] **Step 2: Run core-engine source-service tests and verify failure**

Run:

```bash
npm run -w @skill-flow/core-engine test -- source-service.test.ts
```

Expected: FAIL because new source snapshots do not set `originalDisplayName` and update may not preserve it.

- [ ] **Step 3: Write `originalDisplayName` on new snapshots**

In `packages/core-engine/src/services/source-service.ts`, inside `buildSnapshot`, set `originalDisplayName` on both returned source records.

```ts
        manifest: {
          id: sourceId,
          locator,
          kind,
          displayName,
          originalDisplayName: displayName,
          addedAt: new Date().toISOString(),
          ...(requestedPath ? { requestedPath } : {}),
          ...(addOptions.selectionMode ? { selectionMode: addOptions.selectionMode } : {}),
          ...(addOptions.originLocator ? { originLocator: addOptions.originLocator } : {}),
          ...(addOptions.originRequestedPath
            ? { originRequestedPath: addOptions.originRequestedPath }
            : {}),
        },
        lock: {
          id: sourceId,
          locator,
          kind,
          displayName,
          originalDisplayName: displayName,
          checkoutPath,
          updatedAt: new Date().toISOString(),
          leafIds: scanned.leafs.map((leaf) => leaf.id),
          invalidLeafs: scanned.invalidLeafs,
          ...sourceMetadata,
          ...(addOptions.originBranch ? { originBranch: addOptions.originBranch } : {}),
          ...(addOptions.importedFromTargets
            ? { importedFromTargets: addOptions.importedFromTargets }
            : {}),
          ...(addOptions.observedTargets
            ? { observedTargets: addOptions.observedTargets }
            : {}),
          ...(addOptions.importMode ? { importMode: addOptions.importMode } : {}),
          ...(kind === "clawhub"
            ? {
                versionMode: locator.includes("@") ? ("pinned" as const) : ("floating" as const),
              }
            : {}),
        },
```

- [ ] **Step 4: Preserve original names during update**

Find the update path where refreshed snapshot records replace or merge current source records. Ensure the existing source's `displayName` and `originalDisplayName` win over the freshly derived snapshot values.

Use this pattern where `nextManifestSource` and `nextLockSource` are assembled:

```ts
const preservedDisplayName = source.displayName;
const preservedOriginalDisplayName = source.originalDisplayName ?? source.displayName;
const preservedLockOriginalDisplayName = currentLock.originalDisplayName ?? currentLock.displayName;

const nextManifestSource = {
  ...snapshot.data.manifest,
  displayName: preservedDisplayName,
  originalDisplayName: preservedOriginalDisplayName,
};

const nextLockSource = {
  ...snapshot.data.lock,
  displayName: currentLock.displayName,
  originalDisplayName: preservedLockOriginalDisplayName,
  checkoutPath: currentLock.checkoutPath,
};
```

If the existing code already mutates `source` and `currentLock` in place, apply the same assignments to the refreshed records before writing state:

```ts
refreshedManifestSource.displayName = source.displayName;
refreshedManifestSource.originalDisplayName = source.originalDisplayName ?? source.displayName;
refreshedLockSource.displayName = currentLock.displayName;
refreshedLockSource.originalDisplayName = currentLock.originalDisplayName ?? currentLock.displayName;
```

- [ ] **Step 5: Fix type fallout in tests**

Run TypeScript build for affected packages:

```bash
npm run -w @skill-flow/core-engine build
```

Expected: FAIL on test fixtures or code literals missing `originalDisplayName`.

For each source fixture, add `originalDisplayName` equal to the fixture's original import name. Example:

```ts
{
  id: "alpha",
  locator: "https://github.com/acme/alpha.git",
  kind: "git",
  displayName: "Alpha Custom",
  originalDisplayName: "alpha",
  addedAt: "2026-05-31T00:00:00.000Z",
}
```

- [ ] **Step 6: Run source-service tests**

Run:

```bash
npm run -w @skill-flow/core-engine test -- source-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/core-engine/src/services/source-service.ts packages/core-engine/src/tests/source-service.test.ts packages/**/*.test.ts
git commit -m "feat: keep imported skill group names through updates"
```

## Task 3: Runtime Rename Reset And Bridge Behavior

**Files:**
- Modify: `packages/query/src/runtime.ts`
- Modify: `packages/query/src/tests/source-lifecycle.test.ts`
- Modify: `apps/cli/src/tests/bridge-command.test.ts`
- Modify: `packages/shared-types/src/tests/protocol.test.ts` only if its existing rename-source expectations assert the old response payload exactly

- [ ] **Step 1: Write failing runtime tests**

In `packages/query/src/tests/source-lifecycle.test.ts`, extend the existing `renameSource` tests.

```ts
test("renameSource returns originalDisplayName and reset status for custom names", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "skills/review/SKILL.md": skillDoc("review", "Review code."),
  });
  const app = new SkillFlowApp();
  const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
  expect(added.ok).toBe(true);

  const renamed = await app.renameSource("demo-source", "  Writing Tools  ");

  expect(renamed).toMatchObject({
    ok: true,
    data: {
      sourceId: "demo-source",
      displayName: "Writing Tools",
      originalDisplayName: "demo-source",
      isResetToOriginal: false,
    },
  });
});

test("renameSource resets blank displayName to originalDisplayName", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "skills/review/SKILL.md": skillDoc("review", "Review code."),
  });
  const app = new SkillFlowApp();
  const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
  expect(added.ok).toBe(true);
  const renamed = await app.renameSource("demo-source", "Writing Tools");
  expect(renamed.ok).toBe(true);

  const reset = await app.renameSource("demo-source", "   ");

  expect(reset).toMatchObject({
    ok: true,
    data: {
      sourceId: "demo-source",
      displayName: "demo-source",
      originalDisplayName: "demo-source",
      isResetToOriginal: true,
    },
  });

  const after = await app.store.readState();
  expect(after.manifest.sources.find((source) => source.id === "demo-source")?.displayName).toBe("demo-source");
  expect(after.lockFile.sources.find((source) => source.id === "demo-source")?.displayName).toBe("demo-source");
});
```

- [ ] **Step 2: Update bridge-command test expectation for blank displayName**

In `apps/cli/src/tests/bridge-command.test.ts`, replace the existing blank-name forwarding test with this reset-success expectation.

```ts
test("accepts blank rename-source displayName as reset request", async () => {
  const app = {
    renameSource: vi.fn(async (sourceId: string, displayName: string) =>
      ok({
        sourceId,
        displayName: "demo-source",
        originalDisplayName: "demo-source",
        isResetToOriginal: displayName.trim() === "",
      }),
    ),
  } as unknown as SkillFlowRuntime;

  const response = await handleBridgeRequest(app, {
    id: "req-1",
    command: "rename-source",
    payload: {
      sourceId: "demo-source",
      displayName: "   ",
    },
  });

  expect(app.renameSource).toHaveBeenCalledWith("demo-source", "   ");
  expect(response).toMatchObject({
    ok: true,
    data: {
      sourceId: "demo-source",
      displayName: "demo-source",
      originalDisplayName: "demo-source",
      isResetToOriginal: true,
    },
  });
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npm run -w @skill-flow/query test -- source-lifecycle.test.ts
npm run -w skill-flow test -- bridge-command.test.ts
```

Expected: FAIL because runtime still rejects blank names or omits the new response fields.

- [ ] **Step 4: Implement reset response type in runtime**

In `packages/query/src/runtime.ts`, change both public and private rename signatures.

```ts
type RenameSourceResult = {
  sourceId: string;
  displayName: string;
  originalDisplayName: string;
  isResetToOriginal: boolean;
};
```

Place the type near other runtime helper types at file scope. Then update methods:

```ts
  async renameSource(
    sourceId: string,
    displayName: string,
  ): Promise<Result<RenameSourceResult>> {
    return this.runSerializedMutation(() => this.renameSourceImpl(sourceId, displayName));
  }
```

```ts
  private async renameSourceImpl(
    sourceId: string,
    displayName: string,
  ): Promise<Result<RenameSourceResult>> {
    const requestedDisplayName = displayName.trim();
    const { manifest, lockFile } = await this.store.readState();
    const manifestSource = manifest.sources.find((source) => source.id === sourceId);
    const lockSource = lockFile.sources.find((source) => source.id === sourceId);

    if (!manifestSource || !lockSource) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${sourceId}' is not registered.`,
      });
    }

    const originalDisplayName =
      manifestSource.originalDisplayName ??
      lockSource.originalDisplayName ??
      manifestSource.displayName;
    const nextDisplayName = requestedDisplayName || originalDisplayName;
    const isResetToOriginal = requestedDisplayName.length === 0;

    const nextManifest: Manifest = {
      ...manifest,
      sources: manifest.sources.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              displayName: nextDisplayName,
              originalDisplayName: source.originalDisplayName ?? originalDisplayName,
            }
          : source,
      ),
    };
    const nextLockFile: LockFile = {
      ...lockFile,
      sources: lockFile.sources.map((source) =>
        source.id === sourceId
          ? {
              ...source,
              displayName: nextDisplayName,
              originalDisplayName: source.originalDisplayName ?? originalDisplayName,
            }
          : source,
      ),
    };

    await this.store.writeState(nextManifest, nextLockFile);
    return ok({
      sourceId,
      displayName: nextDisplayName,
      originalDisplayName,
      isResetToOriginal,
    });
  }
```

Remove the old `DISPLAY_NAME_EMPTY` branch from `renameSourceImpl`. Keep the bridge payload field required; only blank content changes meaning.

- [ ] **Step 5: Run runtime and bridge tests**

Run:

```bash
npm run -w @skill-flow/query test -- source-lifecycle.test.ts
npm run -w skill-flow test -- bridge-command.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run shared-types tests if protocol test fixtures changed**

Run:

```bash
npm run -w @skill-flow/shared-types test -- protocol.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/query/src/runtime.ts packages/query/src/tests/source-lifecycle.test.ts apps/cli/src/tests/bridge-command.test.ts packages/shared-types/src/tests/protocol.test.ts
git commit -m "feat: reset skill group names to original"
```

## Task 4: Desktop Bridge Coordinator And View Model Data

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopMutationCoordinator.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopMutationCoordinatorTests.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`

- [ ] **Step 1: Write failing coordinator test**

In `DesktopMutationCoordinatorTests.swift`, update the rename test to assert the richer response.

```swift
func testRenameSourceReturnsOriginalNameAndResetFlag() async throws {
    let command = RecordingDesktopCommandFacade()
    command.renameResponsePayload = [
        "sourceId": "alpha",
        "displayName": "Alpha",
        "originalDisplayName": "Alpha",
        "isResetToOriginal": true
    ]
    let coordinator = DesktopMutationCoordinator(commandFacade: command)

    let result = try await coordinator.renameSource(sourceId: "alpha", displayName: "   ")

    XCTAssertEqual(command.recordedMutations, ["rename-source:alpha:   "])
    XCTAssertEqual(result.sourceId, "alpha")
    XCTAssertEqual(result.displayName, "Alpha")
    XCTAssertEqual(result.originalDisplayName, "Alpha")
    XCTAssertTrue(result.isResetToOriginal)
}
```

Add `renameResponsePayload` to the recording facade used by this test:

```swift
var renameResponsePayload: [String: Any] = [
    "sourceId": "alpha",
    "displayName": "Writing Tools",
    "originalDisplayName": "Alpha",
    "isResetToOriginal": false
]
```

Return it in `renameSource`:

```swift
return .success(
    command: .renameSource,
    payload: renameResponsePayload
)
```

- [ ] **Step 2: Write failing MainViewModel parsing tests**

In `MainViewModelSelectionTests.swift`, add or extend tests around group card and detail parsing.

```swift
func testGroupCardsExposeOriginalDisplayName() async throws {
    let fixture = MainViewModelFixture()
    fixture.state.sources["alpha"]?.displayName = "Research Tools"
    fixture.state.sources["alpha"]?.originalDisplayName = "anthropic-skills"
    let model = fixture.makeModel()

    await model.bootstrap()

    let card = try XCTUnwrap(model.groupCards.first(where: { $0.id == "alpha" }))
    XCTAssertEqual(card.title, "Research Tools")
    XCTAssertEqual(card.originalDisplayName, "anthropic-skills")
    XCTAssertTrue(card.hasCustomDisplayName)
}

func testRenameResetUpdatesHomeAndCachedDetailNames() async throws {
    let fixture = MainViewModelFixture()
    fixture.state.sources["alpha"]?.displayName = "Research Tools"
    fixture.state.sources["alpha"]?.originalDisplayName = "anthropic-skills"
    fixture.renameResponsePayload = [
        "sourceId": "alpha",
        "displayName": "anthropic-skills",
        "originalDisplayName": "anthropic-skills",
        "isResetToOriginal": true
    ]
    let model = fixture.makeModel()

    await model.bootstrap()
    await model.renameSource(sourceId: "alpha", displayName: "   ")

    let card = try XCTUnwrap(model.groupCards.first(where: { $0.id == "alpha" }))
    XCTAssertEqual(card.title, "anthropic-skills")
    XCTAssertEqual(card.originalDisplayName, "anthropic-skills")
    XCTAssertFalse(card.hasCustomDisplayName)
}
```

- [ ] **Step 3: Run Swift tests and verify failure**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopMutationCoordinatorTests
swift test --filter MainViewModelSelectionTests
```

Expected: FAIL because coordinator and models do not expose `originalDisplayName` or reset flags.

- [ ] **Step 4: Add rename result model**

In `DesktopMutationCoordinator.swift`, add a result struct.

```swift
struct RenameSourceMutationResult: Equatable {
    let sourceId: String
    let displayName: String
    let originalDisplayName: String
    let isResetToOriginal: Bool
}
```

Change `renameSource` to return it.

```swift
func renameSource(sourceId: String, displayName: String) async throws -> RenameSourceMutationResult {
    let response = try await commandFacade.renameSource(sourceId: sourceId, displayName: displayName)
    let payload = try Self.successPayload(response)
    return RenameSourceMutationResult(
        sourceId: payload["sourceId"] as? String ?? sourceId,
        displayName: payload["displayName"] as? String ?? displayName.trimmingCharacters(in: .whitespacesAndNewlines),
        originalDisplayName: payload["originalDisplayName"] as? String ?? payload["displayName"] as? String ?? displayName.trimmingCharacters(in: .whitespacesAndNewlines),
        isResetToOriginal: payload["isResetToOriginal"] as? Bool ?? false
    )
}
```

- [ ] **Step 5: Add original-name fields to desktop models**

In `MainViewModel.swift`, add `originalDisplayName` and helper to card and detail models.

```swift
struct GroupCardModel: Identifiable, Equatable {
    let id: String
    let title: String
    let originalDisplayName: String
    ...

    var hasCustomDisplayName: Bool {
        title.trimmingCharacters(in: .whitespacesAndNewlines) != originalDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
```

In `DetailViewModel`, add:

```swift
let originalDisplayName: String

var hasCustomDisplayName: Bool {
    title.trimmingCharacters(in: .whitespacesAndNewlines) != originalDisplayName.trimmingCharacters(in: .whitespacesAndNewlines)
}
```

When constructing group cards from source rows or summaries, parse:

```swift
let originalDisplayName = (sourcePayload["originalDisplayName"] as? String)?.nonEmpty
    ?? (summarySourcePayload["originalDisplayName"] as? String)?.nonEmpty
    ?? row.displayName
```

When constructing detail data, parse:

```swift
let originalDisplayName = (sourcePayload["originalDisplayName"] as? String)?.nonEmpty
    ?? (summarySourcePayload["originalDisplayName"] as? String)?.nonEmpty
    ?? summary.sourceDisplayName
```

- [ ] **Step 6: Apply rename/reset result to cached data**

In `MainViewModel.renameSource`, use the richer mutation result.

```swift
let result = try await mutationCoordinator.renameSource(
    sourceId: normalizedSourceId,
    displayName: displayName
)
applyRenamedSource(
    sourceId: result.sourceId,
    displayName: result.displayName,
    originalDisplayName: result.originalDisplayName
)
showToast(
    style: .success,
    text: result.isResetToOriginal
        ? localizedText("toast.rename.reset_success", result.displayName)
        : localizedText("toast.rename.success", result.displayName)
)
```

Change helper signatures:

```swift
private func applyRenamedSource(sourceId: String, displayName: String, originalDisplayName: String) {
    renamedSourceDisplayNameOverridesBySourceId[sourceId] = displayName
    renamedSourceOriginalDisplayNameOverridesBySourceId[sourceId] = originalDisplayName
    if let existing = summary(for: sourceId) {
        replaceSummary(existing.renamed(displayName: displayName, originalDisplayName: originalDisplayName))
    }
    updateCachedDetailDisplayName(
        sourceId: sourceId,
        displayName: displayName,
        originalDisplayName: originalDisplayName
    )
}
```

If there is no existing `renamedSourceOriginalDisplayNameOverridesBySourceId`, add:

```swift
private var renamedSourceOriginalDisplayNameOverridesBySourceId: [String: String] = [:]
```

Update `payloadWithDisplayName` and `enrichmentPayloadWithDisplayName` to also write `originalDisplayName` into `source`, `summary.source`, and `sourceSnapshot` where those dictionaries exist:

```swift
sourcePayload["displayName"] = displayName
sourcePayload["originalDisplayName"] = originalDisplayName
```

```swift
summarySourcePayload["displayName"] = displayName
summarySourcePayload["originalDisplayName"] = originalDisplayName
```

- [ ] **Step 7: Run Swift model tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopMutationCoordinatorTests
swift test --filter MainViewModelSelectionTests
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopMutationCoordinator.swift apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopMutationCoordinatorTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift
git commit -m "feat: expose original names in desktop rename state"
```

## Task 5: Home Card Original Name Info Icon

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MenuBarIconTests.swift` or create focused component test in same test target

- [ ] **Step 1: Write failing helper tests**

In `MenuBarIconTests.swift`, add tests for pure helper behavior on `SharedGroupCard`.

```swift
func testOriginalNameHelpAppearsOnlyForCustomDisplayName() {
    let customCard = MainViewModel.GroupCardModel(
        id: "alpha",
        title: "Research Tools",
        originalDisplayName: "anthropic-skills",
        subtitle: "by anthropic",
        groupPath: nil,
        tags: [],
        targets: [],
        skills: [],
        selection: .empty,
        targetSelection: .empty,
        stats: MainViewModel.GroupCardStats(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
        status: .healthy,
        isPinned: false
    )
    let originalCard = MainViewModel.GroupCardModel(
        id: "beta",
        title: "beta-skills",
        originalDisplayName: "beta-skills",
        subtitle: "by beta",
        groupPath: nil,
        tags: [],
        targets: [],
        skills: [],
        selection: .empty,
        targetSelection: .empty,
        stats: MainViewModel.GroupCardStats(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
        status: .healthy,
        isPinned: false
    )

    XCTAssertEqual(
        SharedGroupCard.originalNameHelpText(card: customCard, locale: Locale(identifier: "zh-Hans")),
        "原名 anthropic-skills"
    )
    XCTAssertNil(SharedGroupCard.originalNameHelpText(card: originalCard, locale: Locale(identifier: "zh-Hans")))
}
```

If `GroupCardModel` initializer has additional required fields, fill them with existing defaults from nearby tests.

- [ ] **Step 2: Run component tests and verify failure**

Run:

```bash
cd apps/desktop-mac
swift test --filter MenuBarIconTests/testOriginalNameHelpAppearsOnlyForCustomDisplayName
```

Expected: FAIL because `originalNameHelpText` does not exist.

- [ ] **Step 3: Add helper and title info icon**

In `GroupCardComponents.swift`, add a static helper:

```swift
static func originalNameHelpText(card: MainViewModel.GroupCardModel, locale: Locale) -> String? {
    guard card.hasCustomDisplayName else {
        return nil
    }
    return L10n.string("group_card.original_name", locale: locale, arguments: card.originalDisplayName)
}
```

In the title row where `Text(card.title)` is rendered, add the selected C affordance immediately beside the title:

```swift
if let originalNameHelp = Self.originalNameHelpText(card: card, locale: locale) {
    actionIcon(.info, size: 12)
        .foregroundStyle(AppTheme.textMuted(for: theme))
        .frame(width: 18, height: 18)
        .help(originalNameHelp)
}
```

If `actionIcon(.info, size:)` is not available, add an `info` case to the local icon enum using SF Symbol `info.circle`.

- [ ] **Step 4: Run component tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter MenuBarIconTests/testOriginalNameHelpAppearsOnlyForCustomDisplayName
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MenuBarIconTests.swift
git commit -m "feat: show original name hint on group cards"
```

## Task 6: Detail Header Rename Entry And Dialog Reset Hint

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Modify: existing `RenameSourceDialog` definition location
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailScreenContainerTests.swift`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift`

- [ ] **Step 1: Write failing dialog helper tests**

Create `apps/desktop-mac/Tests/SkillFlowDesktopTests/RenameSourceDialogTests.swift` with this test class.

```swift
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class RenameSourceDialogTests: XCTestCase {
    func testRenameDialogHintUsesOriginalName() {
        XCTAssertEqual(
            RenameSourceDialog.resetHint(originalDisplayName: "anthropic-skills", locale: Locale(identifier: "zh-Hans")),
            "留空将恢复原名：anthropic-skills"
        )
    }
}
```

- [ ] **Step 2: Write failing detail action wiring test**

In `DetailScreenContainerTests.swift`, add a test that the container exposes rename capability for the current group.

```swift
func testDetailContainerRequestsRenameForCurrentGroup() throws {
    let state = DesktopAppState()
    state.view.currentRoute = .detail(sourceId: "alpha")
    var recordedRename: (sourceId: String, title: String, originalDisplayName: String)?
    let container = DetailScreenContainer(
        state: state,
        detailSnapshot: { _ in
            DetailViewModel.Snapshot.fixture(
                sourceId: "alpha",
                title: "Research Tools"
            )
        },
        renameGroup: { sourceId, title, originalDisplayName in
            recordedRename = (sourceId, title, originalDisplayName)
        }
    )

    container.requestRenameCurrentGroup()

    XCTAssertEqual(recordedRename?.sourceId, "alpha")
    XCTAssertEqual(recordedRename?.title, "Research Tools")
    XCTAssertEqual(recordedRename?.originalDisplayName, "Research Tools")
}
```

- [ ] **Step 3: Run detail/dialog tests and verify failure**

Run:

```bash
cd apps/desktop-mac
swift test --filter DetailScreenContainerTests
swift test --filter RenameSourceDialogTests
```

Expected: FAIL because helper and detail rename action do not exist.

- [ ] **Step 4: Extend rename dialog API**

Update `RenameSourceDialog` initializer to accept placeholder and hint:

```swift
let placeholder: String
let hint: String
```

Use placeholder in the text field:

```swift
TextField(placeholder, text: $draft)
```

Render the hint below the text field:

```swift
Text(hint)
    .font(.system(size: 12, weight: .regular))
    .foregroundStyle(AppTheme.textMuted(for: theme))
    .lineLimit(2)
```

Add helper:

```swift
static func resetHint(originalDisplayName: String, locale: Locale) -> String {
    L10n.string("rename.dialog.reset_hint", locale: locale, arguments: originalDisplayName)
}
```

- [ ] **Step 5: Track current rename original name in `MainView`**

In `MainView.swift`, add state:

```swift
@State private var renameOriginalDisplayName = ""
```

Update `beginRenameSource`:

```swift
private func beginRenameSource(_ card: MainViewModel.GroupCardModel) {
    renameSourceId = card.id
    renameDraft = card.title
    renameOriginalDisplayName = card.originalDisplayName
}
```

Add a detail-specific entry:

```swift
private func beginRenameSource(sourceId: String, title: String, originalDisplayName: String) {
    renameSourceId = sourceId
    renameDraft = title
    renameOriginalDisplayName = originalDisplayName
}
```

Update close:

```swift
private func closeRenameDialog() {
    renameSourceId = nil
    renameDraft = ""
    renameOriginalDisplayName = ""
}
```

Pass new dialog values:

```swift
RenameSourceDialog(
    draft: $renameDraft,
    title: t("rename.dialog.title"),
    placeholder: renameOriginalDisplayName,
    hint: RenameSourceDialog.resetHint(
        originalDisplayName: renameOriginalDisplayName,
        locale: settingsViewModel.selectedLocale
    ),
    saveTitle: t("rename.dialog.save"),
    cancelTitle: t("rename.dialog.cancel"),
    theme: theme,
    accent: accent,
    onCancel: {
        closeRenameDialog()
    },
    onSave: {
        saveRenameDialog()
    }
)
```

- [ ] **Step 6: Add detail title-row rename icon**

In `DetailScreen.swift`, change `detailGroupHeader` to pass a rename action into the title row:

```swift
detailHeaderTitleRow(
    title: detail?.title ?? fallbackTitle,
    author: detail?.author ?? "@unknown",
    originalDisplayName: detail?.originalDisplayName ?? fallbackTitle,
    onRename: {
        container.requestRenameCurrentGroup()
    }
)
```

Change the title row signature:

```swift
private func detailHeaderTitleRow(
    title: String,
    author: String,
    originalDisplayName: String? = nil,
    onRename: (() -> Void)? = nil
) -> some View
```

Inside the title row after original-name info icon, add the selected A edit icon:

```swift
if let originalDisplayName, title.trimmingCharacters(in: .whitespacesAndNewlines) != originalDisplayName.trimmingCharacters(in: .whitespacesAndNewlines) {
    actionIcon(.info, size: 12)
        .foregroundStyle(AppTheme.textMuted(for: theme))
        .frame(width: 18, height: 18)
        .help(L10n.string("group_card.original_name", locale: locale, arguments: originalDisplayName))
}

if let onRename {
    Button(action: onRename) {
        actionIcon(.rename, size: 12)
            .foregroundStyle(AppTheme.textMuted(for: theme))
            .frame(width: 24, height: 24)
    }
    .buttonStyle(.plain)
    .help(t("group_card.action.rename"))
}
```

Keep `detailSkillHeader` calls using the default `onRename: nil` so skill headers do not show group rename.

- [ ] **Step 7: Connect detail rename action to `MainView`**

If `DetailScreenContainer` already has callback storage, add:

```swift
let onRenameGroup: (String, String, String) -> Void
```

Expose:

```swift
func requestRenameCurrentGroup() {
    guard let sourceId, let detail = viewModel else {
        return
    }
    onRenameGroup(sourceId, detail.title, detail.originalDisplayName)
}
```

When constructing `DetailScreenContainer` in `HomeScreenContainer` or `MainView`, pass:

```swift
onRenameGroup: { sourceId, title, originalDisplayName in
    beginRenameSource(
        sourceId: sourceId,
        title: title,
        originalDisplayName: originalDisplayName
    )
}
```

If the container cannot reference `beginRenameSource` directly because of ownership, pass the closure through `DetailScreen` from `MainView`.

- [ ] **Step 8: Run Swift tests**

Run:

```bash
cd apps/desktop-mac
swift test --filter DetailScreenContainerTests
swift test --filter RenameSourceDialogTests
swift test --filter MainViewModelSelectionTests
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DetailScreenContainerTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/RenameSourceDialogTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift
git commit -m "feat: rename skill groups from detail"
```

## Task 7: Localization And Final Verification

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`
- Modify: `CHANGELOG.md` if release notes for this branch are expected by the current release workflow

- [ ] **Step 1: Write failing localization tests**

In `DesktopLocalizationTests.swift`, add keys to the existing required-key list:

```swift
"group_card.original_name",
"rename.dialog.reset_hint",
"toast.rename.reset_success",
```

Add focused value checks:

```swift
func testRenameOriginalNameStringsResolvePerLocale() {
    XCTAssertEqual(
        L10n.string("group_card.original_name", locale: Locale(identifier: "zh-Hans"), arguments: "anthropic-skills"),
        "原名 anthropic-skills"
    )
    XCTAssertEqual(
        L10n.string("rename.dialog.reset_hint", locale: Locale(identifier: "zh-Hans"), arguments: "anthropic-skills"),
        "留空将恢复原名：anthropic-skills"
    )
    XCTAssertEqual(
        L10n.string("toast.rename.reset_success", locale: Locale(identifier: "zh-Hans"), arguments: "anthropic-skills"),
        "已恢复原名 anthropic-skills"
    )
}
```

- [ ] **Step 2: Run localization test and verify failure**

Run:

```bash
cd apps/desktop-mac
swift test --filter DesktopLocalizationTests
```

Expected: FAIL because new keys are missing.

- [ ] **Step 3: Add localized strings**

Add to `en.lproj/Localizable.strings`:

```text
"group_card.original_name" = "Original %@";
"rename.dialog.reset_hint" = "Leave empty to restore original name: %@";
"toast.rename.reset_success" = "Restored original name %@.";
```

Add to `zh-Hans.lproj/Localizable.strings`:

```text
"group_card.original_name" = "原名 %@";
"rename.dialog.reset_hint" = "留空将恢复原名：%@";
"toast.rename.reset_success" = "已恢复原名 %@";
```

Add to `ja.lproj/Localizable.strings`:

```text
"group_card.original_name" = "元の名前 %@";
"rename.dialog.reset_hint" = "空のまま保存すると元の名前に戻します：%@";
"toast.rename.reset_success" = "元の名前 %@ に戻しました。";
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npm run -w @skill-flow/storage test -- store.test.ts
npm run -w @skill-flow/core-engine test -- source-service.test.ts
npm run -w @skill-flow/query test -- source-lifecycle.test.ts
npm run -w skill-flow test -- bridge-command.test.ts
cd apps/desktop-mac && swift test --filter DesktopLocalizationTests
cd apps/desktop-mac && swift test --filter DesktopMutationCoordinatorTests
cd apps/desktop-mac && swift test --filter MainViewModelSelectionTests
cd apps/desktop-mac && swift test --filter MenuBarIconTests
cd apps/desktop-mac && swift test --filter DetailScreenContainerTests
```

Expected: all focused tests PASS.

- [ ] **Step 5: Run package builds**

Run:

```bash
npm run build
cd apps/desktop-mac && swift test
```

Expected: TypeScript build PASS and Swift test suite PASS.

- [ ] **Step 6: Manual desktop verification**

Run the desktop app with the existing local workflow used for this repository:

```bash
open apps/desktop-mac/Package.swift
```

Then run the `SkillFlowDesktop` scheme from Xcode.

Verify:

```text
1. Rename one Skill group from home to Research Tools.
2. Confirm home title shows Research Tools.
3. Confirm home title row shows the information icon and help text contains the original imported name.
4. Open the group detail page.
5. Confirm detail group header shows the rename icon next to the title.
6. Rename from detail to Research Tools Detail.
7. Confirm home and detail titles update.
8. Open rename again, clear the input, save.
9. Confirm the title returns to originalDisplayName.
10. Quit and reopen the desktop app.
11. Confirm reset state persists and original-name icon no longer appears when names match.
```

- [ ] **Step 7: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift CHANGELOG.md
git commit -m "test: verify skill group rename original name flow"
```

## Self-Review

- Spec coverage: Tasks 1-2 cover persistent `originalDisplayName`; Task 3 covers blank reset and richer bridge/runtime response; Tasks 4-6 cover Swift model propagation, home info icon, detail rename entry, and dialog hint; Task 7 covers localization and verification.
- Placeholder scan: No incomplete sections or unspecified behavior remain in the plan. Each code-changing step includes concrete snippets and commands.
- Type consistency: The plan consistently uses `originalDisplayName`, `displayName`, `sourceId`, and `isResetToOriginal` across TypeScript and Swift.

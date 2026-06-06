# State Contract And Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加 V2 state contract、V2-only runtime、migration status detection 和 `skill-flow migrate-state --to v2`。

**Architecture:** Domain 定义 V2 类型，storage 只读写 V2 权威 state，core-engine 提供唯一读取 V1 的 migration service，query/CLI 暴露 runtime 与命令入口。迁移写 staging root，验证成功后 atomic replace；cache 只在权威写入成功后 prune。

**Tech Stack:** TypeScript、Vitest、Node fs、Commander CLI、JSON state files。

---

## Files

Create:

- `packages/core-engine/src/services/state-migration-service.ts`
- `packages/core-engine/src/tests/state-migration-service.test.ts`
- `packages/query/src/tests/state-migration-runtime.test.ts`

Modify:

- `packages/domain/src/*`
- `packages/storage/src/*`
- `packages/storage/src/tests/*`
- `packages/core-engine/src/index.ts`
- `packages/query/src/runtime.ts`
- `apps/cli/src/cli.tsx`
- `apps/cli/src/tests/skill-flow.test.ts`

## Test Helpers

Plan tests may add focused helpers in existing test utility locations:

```ts
async function copyFixture(name: string): Promise<string>;
async function seedLegacyVirtualGroupState(input: LegacyVirtualGroupSeed): Promise<string>;
async function seedBrokenVirtualGroupState(input?: Partial<LegacyVirtualGroupSeed>): Promise<string>;
async function readJsonFile<T = unknown>(filePath: string, fallback: T): Promise<T>;
async function writeJsonFile(filePath: string, value: unknown): Promise<void>;
async function pathExists(filePath: string): Promise<boolean>;
```

Helpers must create isolated temp roots, never read or mutate the developer's real `~/.skillflow`, and must write `collections.json` even when the fixture has no collections.

## Task 1: Add V2 Domain And Storage Contract

**Files:**

- Modify: `packages/domain/src/*`
- Modify: `packages/storage/src/*`
- Test: `packages/storage/src/tests/*`

- [ ] **Step 1: Write failing type and serializer tests**

Add tests equivalent to:

```ts
test("writes schemaVersion 2 and migrationGeneration to authority files", async () => {
  const stateRoot = await createTempStateRoot();
  await writeManifestV2(stateRoot, {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    sources: [],
    bindings: {},
    targets: {},
  });
  await writeLockV2(stateRoot, {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    sources: {},
    leafInventory: [],
    projections: [],
  });

  const manifest = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
  const lock = await readJsonFile(path.join(stateRoot, "lock.json"), {});

  expect(manifest.schemaVersion).toBe(2);
  expect(lock.schemaVersion).toBe(2);
  expect(lock.migrationGeneration).toBe(manifest.migrationGeneration);
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/storage test -- state-schema-v2.test.ts
```

Expected: fail because V2 contract helpers do not exist.

- [ ] **Step 3: Implement minimal V2 contract**

Implement the types from `01-overview-and-data-model.md` in the existing domain/storage pattern. Authority writers must write:

```ts
{
  schemaVersion: 2,
  migrationGeneration: currentMigrationGeneration
}
```

Cache writers may write `schemaVersion: 2`, but cache files must not decide migration status.

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/storage test -- state-schema-v2.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/domain packages/storage
git commit -m "feat: add state schema v2 contract"
```

## Task 2: Add Migration Status Detection

**Files:**

- Modify: `packages/storage/src/*`
- Test: `packages/storage/src/tests/state-migration-status.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test("detects v1 state as migration required", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  const status = await inspectStateMigrationStatus(stateRoot);
  expect(status).toMatchObject({
    status: "migration-required",
    fromVersion: 1,
    toVersion: 2,
  });
});

test("detects v2 state with missing generation as incomplete", async () => {
  const stateRoot = await copyFixture("state-v2-missing-generation");
  const status = await inspectStateMigrationStatus(stateRoot);
  expect(status).toMatchObject({
    status: "incomplete",
    reasonCode: "STATE_MIGRATION_INCOMPLETE",
  });
});

test("detects collection marker generation mismatch as incomplete", async () => {
  const stateRoot = await copyFixture("state-v2-collection-generation-mismatch");
  const status = await inspectStateMigrationStatus(stateRoot);
  expect(status).toMatchObject({
    status: "incomplete",
    reasonCode: "STATE_MIGRATION_INCOMPLETE",
  });
  expect(status.diagnostics).toContainEqual(
    expect.objectContaining({
      path: expect.stringContaining("source/collection/group-1/.skillflow-generation.json"),
    }),
  );
});

test.each([
  ["state-v1-broken-json", "manifest.json", "STATE_FILE_PARSE_FAILED"],
  ["state-unsupported-schema", "manifest.json", "STATE_SCHEMA_UNSUPPORTED"],
  ["state-v2-lock-unparseable", "lock.json", "STATE_FILE_PARSE_FAILED"],
])("blocks migration for invalid fixture %s", async (fixtureName, expectedPath, expectedCode) => {
  const stateRoot = await copyFixture(fixtureName);
  const status = await inspectStateMigrationStatus(stateRoot);

  expect(status).toMatchObject({
    status: "invalid",
    reasonCode: "STATE_MIGRATION_BLOCKED",
  });
  expect(status.diagnostics).toContainEqual(
    expect.objectContaining({
      path: expect.stringContaining(expectedPath),
      code: expectedCode,
    }),
  );
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/storage test -- state-migration-status.test.ts
```

Expected: fail because migration status detection does not cover V2 generation.

- [ ] **Step 3: Implement status detection**

Return:

```ts
type StateMigrationStatus =
  | { status: "current"; version: 2; stateRoot: string; migrationGeneration: string }
  | { status: "migration-required"; fromVersion: 1; toVersion: 2; stateRoot: string }
  | { status: "incomplete"; reasonCode: "STATE_MIGRATION_INCOMPLETE"; diagnostics: DiagnosticV2[] }
  | { status: "invalid"; reasonCode: "STATE_MIGRATION_BLOCKED"; diagnostics: DiagnosticV2[] };
```

Rules:

- `.skillflow-migration.json` exists -> `incomplete`.
- any authority file missing `schemaVersion` -> `migration-required`.
- any authority file has `schemaVersion: 2` but missing `migrationGeneration` -> `incomplete`.
- authority files have different `migrationGeneration` -> `incomplete`.
- collection marker missing or mismatched -> `incomplete`.
- corrupted V1 authority JSON, unsupported schema versions, or unparsable V2 authority files -> `invalid` with `STATE_MIGRATION_BLOCKED`.
- every invalid diagnostic must include `path` and `code`.
- cache files never decide `current`.

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/storage test -- state-migration-status.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/storage
git commit -m "feat: detect state schema migration status"
```

## Task 3: Implement Migration Service Dry Run

**Files:**

- Create: `packages/core-engine/src/services/state-migration-service.ts`
- Test: `packages/core-engine/src/tests/state-migration-service.test.ts`

- [ ] **Step 1: Write failing test**

```ts
test("dry-run reports rewrite and prune actions without modifying files", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  const service = new StateMigrationService({ stateRoot });
  const before = await readJsonFile(path.join(stateRoot, "manifest.json"), {});

  const result = await service.migrate({ to: 2, dryRun: true, backup: true });
  const after = await readJsonFile(path.join(stateRoot, "manifest.json"), {});

  expect(result.status).toBe("dry-run");
  expect(result.actions).toContainEqual(expect.objectContaining({ action: "rewrite" }));
  expect(result.actions).toContainEqual(expect.objectContaining({ action: "prune" }));
  expect(after).toEqual(before);
});
```

- [ ] **Step 2: Run failing test**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: fail because service does not exist.

- [ ] **Step 3: Implement dry run**

`migrate({ dryRun: true })` must call `inspectStateMigrationStatus`.

If status is `current`, return:

```ts
{ status: "current", stateRoot, actions: [] }
```

If status is `migration-required`, return planned `rewrite`, `materialize-collection`, and `prune` actions.

If status is `incomplete` or `invalid`, throw or return a structured error:

```ts
{
  reasonCode: "STATE_MIGRATION_INCOMPLETE" | "STATE_MIGRATION_BLOCKED",
  diagnostics
}
```

- [ ] **Step 4: Run test**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core-engine/src/services/state-migration-service.ts packages/core-engine/src/tests/state-migration-service.test.ts
git commit -m "feat: add state migration dry run"
```

## Task 4: Implement Backup, Staging Rewrite, And Cache Prune

**Files:**

- Modify: `packages/core-engine/src/services/state-migration-service.ts`
- Test: `packages/core-engine/src/tests/state-migration-service.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test("migrates authority files to schemaVersion 2 and creates backup", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  const service = new StateMigrationService({ stateRoot });
  const result = await service.migrate({ to: 2, backup: true });

  expect(result.status).toBe("migrated");
  expect(result.backupPath).toBeTruthy();
  expect(await pathExists(result.backupPath!)).toBe(true);

  const manifest = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
  const lock = await readJsonFile(path.join(stateRoot, "lock.json"), {});
  const preferences = await readJsonFile(path.join(stateRoot, "preferences.json"), {});
  const collections = await readJsonFile(path.join(stateRoot, "collections.json"), {});

  expect(manifest.schemaVersion).toBe(2);
  expect(manifest.migrationGeneration).toMatch(/^mg_/);
  expect(lock.migrationGeneration).toBe(manifest.migrationGeneration);
  expect(preferences.migrationGeneration).toBe(manifest.migrationGeneration);
  expect(collections.migrationGeneration).toBe(manifest.migrationGeneration);
});

test("prunes rebuildable cache only after authority state is current", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  const service = new StateMigrationService({ stateRoot });
  await service.migrate({ to: 2, backup: true });

  expect(await pathExists(path.join(stateRoot, "catalog/import-data.json"))).toBe(false);
  expect(await pathExists(path.join(stateRoot, "catalog/source-metadata.json"))).toBe(false);
  expect(await pathExists(path.join(stateRoot, "catalog/import-preparations.json"))).toBe(false);
  expect(await pathExists(path.join(stateRoot, "catalog/import-preparations"))).toBe(false);
  expect(await pathExists(path.join(stateRoot, "catalog/git"))).toBe(false);

  const status = await inspectStateMigrationStatus(stateRoot);
  expect(status.status).toBe("current");
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: fail until migration writes files.

- [ ] **Step 3: Implement write sequence**

Use this exact sequence:

1. inspect status.
2. create backup at `<stateRoot>.backup-YYYYMMDD-HHMMSS`.
3. write `.skillflow-migration.json` as `MigrationMarkerFileV2`.
4. write all converted files into `<stateRoot>.migration-staging-<pid>-<timestamp>`.
5. validate staging authority files and collection markers.
6. atomic replace `manifest.json`, `lock.json`, `preferences.json`, `collections.json`, `source/collection`.
7. verify authority files, collection markers, and materialized content directly.
8. remove `.skillflow-migration.json`.
9. prune rebuildable cache.
10. call `inspectStateMigrationStatus` and require `current`.

- [ ] **Step 4: Add failure outcome tests**

```ts
test("keeps original state and cache when staging validation fails", async () => {
  const stateRoot = await seedBrokenVirtualGroupState();
  const beforeManifest = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
  const beforeCacheExists = await pathExists(path.join(stateRoot, "catalog/import-data.json"));
  const service = new StateMigrationService({ stateRoot });

  await expect(service.migrate({ to: 2, backup: true })).rejects.toThrow(
    "STATE_MIGRATION_VALIDATION_FAILED",
  );

  expect(await readJsonFile(path.join(stateRoot, "manifest.json"), {})).toEqual(beforeManifest);
  expect(await pathExists(path.join(stateRoot, "catalog/import-data.json"))).toBe(beforeCacheExists);
});

test("reports incomplete when migration marker remains", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  await writeJsonFile(path.join(stateRoot, ".skillflow-migration.json"), {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    status: "running",
    startedAt: "2026-06-04T00:00:00.000Z",
    stagingRoot: path.join(stateRoot, ".migration-staging-test"),
    diagnostics: [],
  });

  const service = new StateMigrationService({ stateRoot });
  const status = await service.inspect();

  expect(status).toMatchObject({
    status: "incomplete",
    reasonCode: "STATE_MIGRATION_INCOMPLETE",
  });
});
```

- [ ] **Step 5: Run tests**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core-engine/src/services/state-migration-service.ts packages/core-engine/src/tests/state-migration-service.test.ts
git commit -m "feat: migrate state root to schema v2"
```

## Task 5: Materialize Legacy Virtual Groups As Collections

**Files:**

- Modify: `packages/core-engine/src/services/state-migration-service.ts`
- Test: `packages/core-engine/src/tests/state-migration-service.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test("migrates legacy virtual group refs into materialized collection members", async () => {
  const stateRoot = await seedLegacyVirtualGroupState({
    groupId: "group-1",
    sourceId: "source-a",
    leafId: "leaf-a",
    skillPath: "skills/frontend-design",
    skillContent: "# Frontend Design\n",
  });

  const service = new StateMigrationService({ stateRoot });
  await service.migrate({ to: 2, backup: true });

  const collections = await readJsonFile(path.join(stateRoot, "collections.json"), {});
  const manifest = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
  const generation = await readJsonFile(
    path.join(stateRoot, "source/collection/group-1/.skillflow-generation.json"),
    {},
  );

  expect(collections.collections["group-1"].materializedSourceId).toBe("group-1");
  expect(generation.migrationGeneration).toBe(manifest.migrationGeneration);
  expect(collections.collections["group-1"].members[0]).toMatchObject({
    origin: {
      sourceId: "source-a",
      leafId: "leaf-a",
      repoPath: "skills/frontend-design",
    },
    updatePolicy: "frozen",
  });
});

test("collection restore selections keep original source leaf ids", async () => {
  const stateRoot = await seedLegacyVirtualGroupStateWithRestoreSnapshot({
    originalSourceId: "source-a",
    selectedLeafIds: ["leaf-a", "source-a:missing-legacy-leaf"],
  });

  const service = new StateMigrationService({ stateRoot });
  await service.migrate({ to: 2, backup: true });

  const collections = await readJsonFile(path.join(stateRoot, "collections.json"), {});
  const restoreSelection = collections.collections["group-1"].restoreSelections["source-a"];

  expect(restoreSelection.bestEffort).toBe(true);
  expect(restoreSelection.selectedLeafIds).toContain("leaf-a");
  expect(restoreSelection.selectedLeafIds).not.toContain("group-1:member-1");
  expect(restoreSelection.selectedLeafIds).not.toContain("source-a:missing-legacy-leaf");
  expect(restoreSelection.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RESTORE_SELECTION_LEAF_UNMAPPED",
      details: expect.objectContaining({ legacyLeafId: "source-a:missing-legacy-leaf" }),
    }),
  );
});

test("fails when a virtual group member origin leaf is missing", async () => {
  const stateRoot = await seedBrokenVirtualGroupState({
    groupId: "group-1",
    sourceId: "source-a",
    leafId: "leaf-missing",
    skillPath: "skills/frontend-design",
  });
  const service = new StateMigrationService({ stateRoot });

  await expect(service.migrate({ to: 2, backup: true })).rejects.toMatchObject({
    reasonCode: "STATE_MIGRATION_VIRTUAL_MEMBER_ORIGIN_MISSING",
    diagnostics: expect.arrayContaining([
      expect.objectContaining({
        code: "STATE_MIGRATION_VIRTUAL_MEMBER_ORIGIN_MISSING",
        path: expect.stringContaining("virtual-groups.json"),
        details: expect.objectContaining({ sourceId: "source-a", leafId: "leaf-missing" }),
      }),
    ]),
  });
});

test("fails when copied collection member hash differs from v1 lock hash", async () => {
  const stateRoot = await seedBrokenVirtualGroupState({
    groupId: "group-1",
    sourceId: "source-a",
    leafId: "leaf-a",
    skillPath: "skills/frontend-design",
    skillContent: "# Frontend Design\n",
    lockedContentHash: "hash-original",
    mutateAfterCopy: "# Mutated During Copy\n",
  });
  const service = new StateMigrationService({ stateRoot });

  await expect(service.migrate({ to: 2, backup: true })).rejects.toMatchObject({
    reasonCode: "STATE_MIGRATION_COLLECTION_HASH_MISMATCH",
    diagnostics: expect.arrayContaining([
      expect.objectContaining({
        code: "STATE_MIGRATION_COLLECTION_HASH_MISMATCH",
        path: expect.stringContaining("source/collection/group-1"),
        details: expect.objectContaining({
          expectedHash: "hash-original",
          actualHash: expect.any(String),
        }),
      }),
    ]),
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: fail because collection materialization does not exist.

- [ ] **Step 3: Implement materialization**

During migration:

- read V1 `virtual-groups.json`.
- copy each confirmed skill directory into `source/collection/<collectionId>/<memberId>/`.
- recompute copied content hash.
- fail with `STATE_MIGRATION_VIRTUAL_MEMBER_ORIGIN_MISSING` if an origin source/leaf referenced by a confirmed virtual group cannot be resolved.
- fail with `STATE_MIGRATION_COLLECTION_HASH_MISMATCH` if copied content differs from V1 lock hash.
- write collection marker `.skillflow-generation.json`.
- create `SkillCollectionRecordV2`.
- add `kind: "collection"` source to manifest.
- add collection source and collection leaves to lock.
- rewrite collection source binding and target projections to collection leaf ids.
- preserve origin refs only for diagnostics.
- rewrite `restoreSnapshots[originalSourceId]` to `restoreSelections[originalSourceId]` using original source leaf ids.

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core-engine/src/services/state-migration-service.ts packages/core-engine/src/tests/state-migration-service.test.ts
git commit -m "feat: materialize skill collections during state migration"
```

## Task 6: Expose Migration Through Query Runtime And CLI

**Files:**

- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/state-migration-runtime.test.ts`
- Modify: `apps/cli/src/cli.tsx`
- Test: `apps/cli/src/tests/skill-flow.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test("runtime exposes migration status", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  const app = new SkillFlowApp({ stateRoot });
  const status = await app.inspectStateMigration();
  expect(status.status).toBe("migration-required");
});

test("migrate-state dry-run prints planned actions", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  const output = await runCli(["migrate-state", "--to", "v2", "--dry-run"], {
    env: { SKILL_FLOW_STATE_ROOT: stateRoot },
  });
  expect(output.stdout).toContain("Migration required");
  expect(output.stdout).toContain("manifest.json rewrite");
  expect(output.stdout).toContain("catalog/import-data.json prune");
});

test("ordinary runtime blocks v1 state and requires explicit migration", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  const app = new SkillFlowApp({ stateRoot });

  await expect(app.listInstalledSkills()).rejects.toMatchObject({
    reasonCode: "STATE_MIGRATION_REQUIRED",
    diagnostics: expect.arrayContaining([
      expect.objectContaining({
        code: "STATE_MIGRATION_REQUIRED",
        path: expect.stringContaining("manifest.json"),
      }),
    ]),
  });
});

test("runtime reads v2 state directly", async () => {
  const stateRoot = await copyFixture("state-v2-current-basic");
  const app = new SkillFlowApp({ stateRoot });

  const result = await app.listInstalledSkills();

  expect(result.data.skills).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "frontend-design" }),
    ]),
  );
});

test("invalid v1 state is blocked before ordinary query read", async () => {
  const stateRoot = await copyFixture("state-v1-broken-json");
  const app = new SkillFlowApp({ stateRoot });

  await expect(app.listInstalledSkills()).rejects.toMatchObject({
    reasonCode: "STATE_MIGRATION_BLOCKED",
    diagnostics: expect.arrayContaining([
      expect.objectContaining({
        code: "STATE_FILE_PARSE_FAILED",
        path: expect.stringContaining("manifest.json"),
      }),
    ]),
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/query test -- state-migration-runtime.test.ts
npm run -w skill-flow test -- skill-flow.test.ts
```

Expected: fail because runtime and CLI methods do not exist.

- [ ] **Step 3: Implement runtime and CLI**

Add runtime methods:

```ts
inspectStateMigration(): Promise<StateMigrationStatus>
migrateState(options: { to: 2; dryRun?: boolean; backup?: boolean }): Promise<StateMigrationResult>
```

Runtime state rules:

- ordinary query reads must accept only V2 authority files.
- valid V1 state must be rejected with `STATE_MIGRATION_REQUIRED` and a concrete migration command hint; it must not be normalized into query response data.
- invalid V1 or unsupported schema state must call migration status detection and fail with `STATE_MIGRATION_BLOCKED`; it must not continue into normal query read with partial data.
- the migration service is the only code path allowed to parse V1 authority state.

Add CLI:

```bash
skill-flow migrate-state --to v2
skill-flow migrate-state --to v2 --dry-run
skill-flow migrate-state --to v2 --state-root /path/to/state
skill-flow migrate-state --to v2 --no-backup
```

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/query test -- state-migration-runtime.test.ts
npm run -w skill-flow test -- skill-flow.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/runtime.ts packages/query/src/tests/state-migration-runtime.test.ts apps/cli/src/cli.tsx apps/cli/src/tests/skill-flow.test.ts
git commit -m "feat: expose state migration command"
```

## Runtime Write Chain V2-only Completion Plan

This section is the execution plan for the remaining normal-runtime V1 write chains. The migration service remains the only code path allowed to read legacy V1 authority state. Normal runtime code must read and write V2 authority files through `StateStoreV2` and V2 domain records.

### Files And Responsibilities

Create:

- `packages/core-engine/src/services/source-checkout-service.ts`
  - Owns source resolution, fetch, preview checkout, reusable prepared checkout, snapshot scanning, and update snapshot building.
  - Does not read or write `manifest.json`, `lock.json`, `preferences.json`, or `collections.json`.
  - Returns V2-shaped checkout snapshots and source update snapshots.
- `packages/core-engine/src/services/source-authority-service-v2.ts`
  - Owns V2 authority mutations for add, commit prepared checkout, remove, update, reconcile, and prune missing checkouts.
  - Reads and writes `StateStoreV2`.
  - Does not instantiate or call legacy `StateStore`.
- `packages/core-engine/src/services/import-preparation-service-v2.ts`
  - Owns import preparation cache lifecycle and commits through `SourceAuthorityServiceV2`.
  - Uses cache files only for preparation records; authority source data is written only by `SourceAuthorityServiceV2`.
- `packages/core-engine/src/tests/source-checkout-service.test.ts`
  - Covers fetch/scan behavior without state writes.
- `packages/core-engine/src/tests/source-authority-service-v2.test.ts`
  - Covers V2 add, commit, remove, update, reconcile, and prune authority mutations.
- `packages/core-engine/src/tests/import-preparation-service-v2.test.ts`
  - Covers V2 preparation cache commit, stale record, missing checkout, and commit lease behavior.
- `packages/query/src/tests/runtime-source-v2.test.ts`
  - Covers `SkillFlowApp` add/import/update/remove/repair routes without legacy store reads or writes.

Modify:

- `packages/core-engine/src/services/source-service.ts`
  - Reduce to a legacy-only wrapper used by legacy tests until those tests are converted.
  - Move shared stateless source logic into `source-checkout-service.ts`.
- `packages/core-engine/src/services/import-preparation-service.ts`
  - Leave as legacy-only; normal runtime must instantiate `ImportPreparationServiceV2`.
- `packages/query/src/runtime.ts`
  - Replace normal runtime use of `SourceService` and `ImportPreparationService` with V2 services.
  - Delete normal runtime calls to `this.store.readState()`, `this.store.writeState()`, `this.store.readPreferences()`, and `this.store.writePreferences()` from add/import/update/remove/repair/project-scope paths.
- `packages/domain/src/types.ts`
  - Add V2 result types only when the service API needs strongly typed return values.
- `packages/query/src/tests/import-page-flow.test.ts`
  - Convert import commit tests to assert V2 authority output and no legacy state writes.
- `packages/query/src/tests/source-lifecycle.test.ts`
  - Convert add/remove/update runtime tests to V2 authority.
- `packages/query/src/tests/project-scoped-drafts.test.ts`
  - Convert project scoped apply and unavailable project cleanup to V2 preferences.
- `apps/cli/src/tests/skill-flow.test.ts`
  - Update CLI integration assertions from `lock.deployments` to V2 `lock.projections`.

Do not modify:

- V1 migration input parser except where V2 type changes require migration output updates.
- Desktop Swift files in this section. Desktop bridge selector work belongs to `03-import-desktop-verification.md`.

### Task 1: Extract Stateless Source Checkout Service

**Files:**

- Create: `packages/core-engine/src/services/source-checkout-service.ts`
- Create: `packages/core-engine/src/tests/source-checkout-service.test.ts`
- Modify: `packages/core-engine/src/services/source-service.ts`
- Test: `packages/core-engine/src/tests/source-checkout-service.test.ts`

- [ ] **Step 1: Write failing tests**

Add `packages/core-engine/src/tests/source-checkout-service.test.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { InventoryService } from "../services/inventory-service.js";
import { SourceCheckoutService } from "../services/source-checkout-service.js";
import { createRepo, skillDoc, useCoreSandbox } from "./test-helpers.js";

describe.sequential("SourceCheckoutService", () => {
  const sandbox = useCoreSandbox();

  test("prepares a checkout snapshot without writing authority files", async () => {
    const repoPath = await createRepo(sandbox.root, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const service = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });

    const prepared = await service.prepareSourceCheckout(repoPath, {
      checkoutPath: path.join(sandbox.stateRoot, "catalog", "import-preparations", "prep-1", "checkout"),
      sourceIdOverride: "design-source",
    });

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      return;
    }
    expect(prepared.data).toMatchObject({
      sourceId: "design-source",
      kind: "local",
      locator: repoPath,
      displayName: "design-source",
      checkoutPath: path.join(sandbox.stateRoot, "catalog", "import-preparations", "prep-1", "checkout"),
    });
    expect(prepared.data.leafs).toEqual([
      expect.objectContaining({
        id: "design-source:skills/frontend-design",
        sourceId: "design-source",
        relativePath: "skills/frontend-design",
        linkName: "frontend-design",
        valid: true,
      }),
    ]);
    await expect(fs.access(path.join(sandbox.stateRoot, "manifest.json"))).rejects.toThrow();
    await expect(fs.access(path.join(sandbox.stateRoot, "lock.json"))).rejects.toThrow();
    await expect(fs.access(path.join(sandbox.stateRoot, "preferences.json"))).rejects.toThrow();
    await expect(fs.access(path.join(sandbox.stateRoot, "collections.json"))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
npm run -w @skill-flow/core-engine test -- source-checkout-service.test.ts
```

Expected: fail because `SourceCheckoutService` and `useCoreSandbox` are not defined.

- [ ] **Step 3: Add core test helper**

Create or extend `packages/core-engine/src/tests/test-helpers.ts` with:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach } from "vitest";

export type CoreSandbox = {
  root: string;
  stateRoot: string;
  targetsRoot: string;
};

export function useCoreSandbox(): CoreSandbox {
  const sandbox: CoreSandbox = { root: "", stateRoot: "", targetsRoot: "" };

  beforeEach(async () => {
    sandbox.root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-core-"));
    sandbox.stateRoot = path.join(sandbox.root, "state");
    sandbox.targetsRoot = path.join(sandbox.root, "targets");
    process.env.SKILL_FLOW_STATE_ROOT = sandbox.stateRoot;
    await fs.mkdir(sandbox.targetsRoot, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.SKILL_FLOW_STATE_ROOT;
    if (sandbox.root) {
      await fs.rm(sandbox.root, { recursive: true, force: true });
    }
  });

  return sandbox;
}

export async function createRepo(root: string, files: Record<string, string>): Promise<string> {
  const repoPath = await fs.mkdtemp(path.join(root, "repo-"));
  git(repoPath, ["init"]);
  git(repoPath, ["config", "user.email", "test@example.com"]);
  git(repoPath, ["config", "user.name", "Skill Flow Test"]);
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(repoPath, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");
  }
  git(repoPath, ["add", "."]);
  git(repoPath, ["commit", "-m", "initial"]);
  return repoPath;
}

export function skillDoc(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n`;
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}
```

- [ ] **Step 4: Add service skeleton and move stateless logic**

Create `packages/core-engine/src/services/source-checkout-service.ts`:

```ts
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  LeafRecord,
  LockFile,
  Result,
  SourceKind,
} from "@skill-flow/domain/types";
import {
  ensureDir,
  removePath,
} from "@skill-flow/integration/utils/fs";
import { fail, ok } from "@skill-flow/integration/utils/result";
import { deriveDisplayName, deriveSourceId } from "@skill-flow/integration/utils/source-id";
import type { InventoryService } from "./inventory-service.js";

export type SourceCheckoutOptions = {
  path?: string;
  sourceIdOverride?: string;
  displayNameOverride?: string;
  originLocator?: string;
  originRequestedPath?: string;
  originBranch?: string;
  importedFromTargets?: string[];
  importMode?: "explicit-add" | "bootstrap-detected";
};

export type PreparedSourceCheckoutV2 = {
  locator: string;
  displayName: string;
  requestedPath?: string;
  kind: Exclude<SourceKind, "virtual">;
  sourceId: string;
  checkoutPath: string;
  leafs: LockFile["leafInventory"];
  commitSha?: string;
  contentHash?: string;
  resolvedVersion?: string;
};

export type SourceCheckoutServiceOptions = {
  sourceRoot: string;
  inventoryService: InventoryService;
};

export class SourceCheckoutService {
  constructor(private readonly options: SourceCheckoutServiceOptions) {}

  async prepareSourceCheckout(
    locator: string,
    input: SourceCheckoutOptions & { checkoutPath?: string; suffix?: string } = {},
  ): Promise<Result<PreparedSourceCheckoutV2>> {
    const resolved = await this.resolveSource(locator, input);
    const checkoutPath = input.checkoutPath ?? path.join(
      this.options.sourceRoot,
      resolved.kind,
      `.${input.suffix ?? "prepare"}-${process.pid}-${crypto.randomUUID()}`,
    );
    await ensureDir(path.dirname(checkoutPath));

    try {
      await this.fetchSource(resolved, checkoutPath);
      const snapshot = await this.buildSnapshot(
        resolved.kind,
        resolved.sourceId,
        resolved.locator,
        resolved.displayName,
        checkoutPath,
        resolved.requestedPath,
        input,
      );
      if (!snapshot.ok) {
        await removePath(checkoutPath);
        return fail(snapshot.errors, snapshot.warnings);
      }
      return ok({
        locator: resolved.locator,
        displayName: resolved.displayName,
        ...(resolved.requestedPath ? { requestedPath: resolved.requestedPath } : {}),
        kind: resolved.kind,
        sourceId: resolved.sourceId,
        checkoutPath,
        leafs: snapshot.data.leafs,
        ...(snapshot.data.commitSha ? { commitSha: snapshot.data.commitSha } : {}),
        ...(snapshot.data.contentHash ? { contentHash: snapshot.data.contentHash } : {}),
        ...(snapshot.data.resolvedVersion ? { resolvedVersion: snapshot.data.resolvedVersion } : {}),
      }, snapshot.warnings);
    } catch (error) {
      await removePath(checkoutPath).catch(() => {});
      return fail({
        code: `${resolved.kind.toUpperCase()}_PREPARE_FAILED`,
        message: `Unable to prepare source '${resolved.locator}': ${String(error)}`,
      });
    }
  }

  async buildUpdateSnapshot(
    input: {
      kind: Exclude<SourceKind, "virtual">;
      sourceId: string;
      locator: string;
      displayName: string;
      checkoutPath: string;
      requestedPath?: string;
    },
  ): Promise<Result<{ leafs: LockFile["leafInventory"]; commitSha?: string; contentHash?: string; resolvedVersion?: string }>> {
    const snapshot = await this.buildSnapshot(
      input.kind,
      input.sourceId,
      input.locator,
      input.displayName,
      input.checkoutPath,
      input.requestedPath,
      {},
      { allowEmptyLeafs: true },
    );
    if (!snapshot.ok) {
      return fail(snapshot.errors, snapshot.warnings);
    }
    return ok(snapshot.data, snapshot.warnings);
  }

  private async resolveSource(locator: string, options: SourceCheckoutOptions): Promise<{
    kind: Exclude<SourceKind, "virtual">;
    locator: string;
    displayName: string;
    sourceId: string;
    requestedPath?: string;
  }> {
    const trimmed = locator.trim();
    const sourceId = options.sourceIdOverride ?? deriveSourceId(trimmed);
    return {
      kind: trimmed.startsWith("http") || trimmed.startsWith("git@") ? "git" : "local",
      locator: trimmed,
      displayName: options.displayNameOverride ?? deriveDisplayName(trimmed),
      sourceId,
      ...(options.path ? { requestedPath: options.path } : {}),
    };
  }

  private async fetchSource(
    resolved: {
      kind: Exclude<SourceKind, "virtual">;
      locator: string;
      gitLocator?: string;
      localPath?: string;
      clawhubSlug?: string;
      requestedVersion?: string;
    },
    checkoutPath: string,
  ): Promise<void> {
    if (resolved.kind === "local") {
      await copyDirectory(resolved.localPath ?? resolved.locator, checkoutPath);
      return;
    }

    if (resolved.kind === "git") {
      const gitLocator = resolved.gitLocator ?? resolved.locator;
      if (!(await isGitAvailable())) {
        await this.fetchGitArchive(gitLocator, checkoutPath);
        return;
      }
      try {
        await git(["clone", "--depth", "1", gitLocator, checkoutPath]);
      } catch {
        const fallbackLocator = this.resolveGitCloneFallbackLocator(gitLocator);
        if (fallbackLocator) {
          try {
            await git(["clone", "--depth", "1", fallbackLocator, checkoutPath]);
            return;
          } catch {
            await removePath(checkoutPath);
            await this.fetchGitArchive(fallbackLocator, checkoutPath);
            return;
          }
        }
        await removePath(checkoutPath);
        await this.fetchGitArchive(gitLocator, checkoutPath);
      }
      return;
    }

    if (resolved.kind === "clawhub") {
      const installed = await installClawHubSkill(
        resolved.clawhubSlug!,
        resolved.requestedVersion,
      );
      try {
        await copyDirectory(installed.installedPath, checkoutPath);
      } finally {
        await removePath(installed.workdir);
      }
      return;
    }
  }

  private async buildSnapshot(
    kind: Exclude<SourceKind, "virtual">,
    sourceId: string,
    locator: string,
    displayName: string,
    checkoutPath: string,
    requestedPath: string | undefined,
    options: SourceCheckoutOptions,
    scanOptions: { allowEmptyLeafs?: boolean } = {},
  ): Promise<Result<{ leafs: LeafRecord[]; commitSha?: string; contentHash?: string; resolvedVersion?: string }>> {
    const scan = await this.options.inventoryService.scanSource({
      id: sourceId,
      kind,
      locator,
      displayName,
      checkoutPath,
      requestedPath,
      ...options,
    }, scanOptions);
    return scan.ok ? ok(scan.data, scan.warnings) : fail(scan.errors, scan.warnings);
  }
}
```

Move these current `SourceService` helpers into `SourceCheckoutService` with the same behavior and updated private field references: `resolveSource`, `resolveUniqueLocalSource`, `fetchGitArchive`, `resolveGitCloneFallbackLocator`, `fetchSource`, `fetchFailureCode`, `buildSnapshot`, `normalizeRequestedPath`, `filterLeafsForRequestedPath`, `resolveSourceId`, and the ClawHub version parser helpers. Add the imports used by those helpers: `copyDirectory`, `installClawHubSkill`, `fetchWithTimeout`, `git`, `isGitAvailable`, `parseGitHubRepo`, `parseHostedGitRepo`, `readJsonFile`, `hashDirectory`, `execFileAsync`, `os`, and `promisify`.

- [ ] **Step 5: Run tests**

```bash
npm run -w @skill-flow/core-engine test -- source-checkout-service.test.ts source-service.test.ts source-parsing-compatibility.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core-engine/src/services/source-checkout-service.ts packages/core-engine/src/services/source-service.ts packages/core-engine/src/tests/source-checkout-service.test.ts packages/core-engine/src/tests/test-helpers.ts
git commit -m "refactor: extract stateless source checkout service"
```

### Task 2: Add V2 Source Authority Service For Add And Commit

**Files:**

- Create: `packages/core-engine/src/services/source-authority-service-v2.ts`
- Create: `packages/core-engine/src/tests/source-authority-service-v2.test.ts`
- Modify: `packages/domain/src/types.ts`
- Test: `packages/core-engine/src/tests/source-authority-service-v2.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core-engine/src/tests/source-authority-service-v2.test.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { StateStore } from "@skill-flow/storage/store";
import { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
import { InventoryService } from "../services/inventory-service.js";
import { SourceAuthorityServiceV2 } from "../services/source-authority-service-v2.js";
import { SourceCheckoutService } from "../services/source-checkout-service.js";
import { createRepo, skillDoc, useCoreSandbox } from "./test-helpers.js";

describe.sequential("SourceAuthorityServiceV2", () => {
  const sandbox = useCoreSandbox();

  test("adds a prepared source by writing only v2 authority files", async () => {
    const repoPath = await createRepo(sandbox.root, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const storeV2 = new StateStoreV2(sandbox.stateRoot);
    await storeV2.init();
    const checkout = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const service = new SourceAuthorityServiceV2({
      stateStore: storeV2,
      checkoutService: checkout,
    });
    const legacyStore = new StateStore(sandbox.stateRoot);
    const legacyRead = vi.spyOn(legacyStore, "readState");
    const legacyWrite = vi.spyOn(legacyStore, "writeState");

    const added = await service.addSource(repoPath, {
      sourceIdOverride: "design-source",
      checkoutPath: path.join(sandbox.stateRoot, "source", "local", "design-source"),
    });

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    expect(legacyRead).not.toHaveBeenCalled();
    expect(legacyWrite).not.toHaveBeenCalled();
    const state = await storeV2.readState();
    expect(state.manifest.sources).toEqual([
      expect.objectContaining({
        id: "design-source",
        kind: "local",
        locator: repoPath,
        canonicalLocator: repoPath,
        displayName: "design-source",
        enabled: true,
      }),
    ]);
    expect(state.manifest.bindings["design-source"]).toEqual({
      sourceId: "design-source",
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    });
    expect(state.lockFile.sources["design-source"]).toEqual(expect.objectContaining({
      sourceId: "design-source",
      localPath: path.join(sandbox.stateRoot, "source", "local", "design-source"),
      leafIds: ["design-source:skills/frontend-design"],
    }));
    expect(state.lockFile.leafInventory).toEqual([
      expect.objectContaining({
        id: "design-source:skills/frontend-design",
        sourceId: "design-source",
        relativePath: "skills/frontend-design",
        linkName: "frontend-design",
      }),
    ]);
    expect(state.lockFile).not.toHaveProperty("deployments");
    await expect(fs.access(path.join(sandbox.stateRoot, "virtual-groups.json"))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
npm run -w @skill-flow/core-engine test -- source-authority-service-v2.test.ts
```

Expected: fail because `SourceAuthorityServiceV2` does not exist.

- [ ] **Step 3: Add service implementation**

Create `packages/core-engine/src/services/source-authority-service-v2.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";
import type {
  LeafRecord,
  LeafRecordV2,
  LockFileV2,
  ManifestFileV2,
  Result,
  SourceKindV2,
  SourceManifestRecordV2,
  SourceUpdateDiff,
  SourceUpdateResult,
} from "@skill-flow/domain/types";
import type { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
import { ensureDir, hashDirectory, isPathInside, pathExists, removePath } from "@skill-flow/integration/utils/fs";
import { fail, ok } from "@skill-flow/integration/utils/result";
import type { PreparedSourceCheckoutV2, SourceCheckoutOptions, SourceCheckoutService } from "./source-checkout-service.js";

export type SourceAuthorityServiceV2Options = {
  stateStore: StateStoreV2;
  checkoutService: SourceCheckoutService;
};

export type AddSourceV2Options = SourceCheckoutOptions & {
  checkoutPath?: string;
};

export type SourceSnapshotV2 = {
  manifest: SourceManifestRecordV2;
  lock: LockFileV2["sources"][string];
  leafs: LeafRecordV2[];
  leafCount: number;
  invalidLeafCount: number;
};

export class SourceAuthorityServiceV2 {
  constructor(private readonly options: SourceAuthorityServiceV2Options) {}

  async addSource(locator: string, options: AddSourceV2Options = {}): Promise<Result<SourceSnapshotV2>> {
    const prepared = await this.options.checkoutService.prepareSourceCheckout(locator, {
      ...options,
      suffix: "add",
      checkoutPath: options.checkoutPath,
    });
    if (!prepared.ok) {
      return fail(prepared.errors, prepared.warnings);
    }
    return this.commitPreparedSource({
      locator,
      preparedCheckout: prepared.data,
      removePreparedOnFailure: true,
    });
  }

  async commitPreparedSource(input: {
    locator: string;
    preparedCheckout: PreparedSourceCheckoutV2;
    removePreparedOnFailure?: boolean;
  }): Promise<Result<SourceSnapshotV2>> {
    const state = await this.options.stateStore.readState();
    const sourceId = input.preparedCheckout.sourceId;
    if (state.manifest.sources.some((source) => source.id === sourceId)) {
      if (input.removePreparedOnFailure) {
        await removePath(input.preparedCheckout.checkoutPath).catch(() => {});
      }
      return fail({
        code: "SOURCE_EXISTS",
        message: `Skills group id '${sourceId}' is already registered.`,
      });
    }

    const sourceKind = this.mapSourceKind(input.preparedCheckout.kind);
    const checkoutPath = path.join(this.options.stateStore.rootPath, "source", sourceKind, sourceId);
    if (await pathExists(checkoutPath)) {
      if (input.removePreparedOnFailure) {
        await removePath(input.preparedCheckout.checkoutPath).catch(() => {});
      }
      return fail({
        code: "SOURCE_CHECKOUT_PATH_EXISTS",
        message: `Unable to register source '${input.locator}' because checkout path already exists at ${checkoutPath}.`,
      });
    }

    await ensureDir(path.dirname(checkoutPath));
    await fs.rename(input.preparedCheckout.checkoutPath, checkoutPath);
    const leafs = await Promise.all(input.preparedCheckout.leafs.map((leaf) =>
      this.toLeafRecordV2(leaf, sourceId, checkoutPath),
    ));
    const now = new Date().toISOString();
    const source: SourceManifestRecordV2 = {
      id: sourceId,
      kind: sourceKind,
      locator: input.preparedCheckout.locator,
      canonicalLocator: input.preparedCheckout.locator,
      displayName: input.preparedCheckout.displayName,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    const lockSource: LockFileV2["sources"][string] = {
      sourceId,
      canonicalLocator: source.canonicalLocator,
      revision: {
        provider: sourceKind,
        ...(input.preparedCheckout.commitSha ? { commit: input.preparedCheckout.commitSha } : {}),
        capturedAt: now,
      },
      localPath: checkoutPath,
      leafIds: leafs.map((leaf) => leaf.id),
    };

    await this.options.stateStore.writeState({
      ...state,
      manifest: {
        ...state.manifest,
        sources: [...state.manifest.sources, source],
        bindings: {
          ...state.manifest.bindings,
          [sourceId]: {
            sourceId,
            selectionMode: "selected",
            selectedLeafIds: [],
            enabledTargets: [],
          },
        },
      },
      lockFile: {
        ...state.lockFile,
        sources: {
          ...state.lockFile.sources,
          [sourceId]: lockSource,
        },
        leafInventory: [...state.lockFile.leafInventory, ...leafs],
      },
    });

    return ok({
      manifest: source,
      lock: lockSource,
      leafs,
      leafCount: leafs.length,
      invalidLeafCount: leafs.filter((leaf) => !leaf.valid).length,
    });
  }

  private mapSourceKind(kind: PreparedSourceCheckoutV2["kind"]): SourceKindV2 {
    return kind === "git" || kind === "github" ? "git" : kind === "clawhub" ? "github" : "local";
  }

  private async toLeafRecordV2(leaf: LeafRecord, sourceId: string, checkoutPath: string): Promise<LeafRecordV2> {
    const absolutePath = path.join(checkoutPath, leaf.relativePath);
    return {
      id: `${sourceId}:${leaf.relativePath}`,
      sourceId,
      relativePath: leaf.relativePath,
      linkName: leaf.linkName,
      title: leaf.title ?? leaf.name ?? leaf.linkName,
      description: leaf.description ?? "",
      absolutePath,
      skillFilePath: path.join(absolutePath, "SKILL.md"),
      displayName: leaf.title ?? leaf.name ?? leaf.linkName,
      contentHash: await hashDirectory(absolutePath),
      selectors: {
        legacyAliases: [leaf.id, leaf.relativePath],
      },
      valid: leaf.valid,
      diagnostics: (leaf.metadataWarnings ?? []).map((message) => ({
        code: "LEAF_METADATA_WARNING",
        message,
        retryable: false,
      })),
    };
  }
}
```

The implementation must import the real `PreparedSourceCheckoutV2["kind"]` union from Task 1. If the repo does not use `"github"` or `"clawhub"` in that union after extraction, remove those branches from `mapSourceKind` and keep the compiler exhaustive.

- [ ] **Step 4: Run tests and build**

```bash
npm run -w @skill-flow/core-engine test -- source-authority-service-v2.test.ts source-checkout-service.test.ts
npm run -w @skill-flow/core-engine build
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core-engine/src/services/source-authority-service-v2.ts packages/core-engine/src/tests/source-authority-service-v2.test.ts packages/domain/src/types.ts
git commit -m "feat: add v2 source authority service"
```

### Task 3: Wire Runtime Add Source And Rollback To V2

**Files:**

- Modify: `packages/query/src/runtime.ts`
- Create: `packages/query/src/tests/runtime-source-v2.test.ts`
- Test: `packages/query/src/tests/runtime-source-v2.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Create `packages/query/src/tests/runtime-source-v2.test.ts`:

```ts
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
import { SkillFlowApp } from "../runtime.js";
import { createRepo, pathExists, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("runtime source v2 write chain", () => {
  const sandbox = useSkillFlowSandbox();

  test("addSource writes v2 authority and applies draft without legacy state writes", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const app = new SkillFlowApp();
    await app.stateStoreV2.init();
    const legacyReadState = vi.spyOn(app.store, "readState").mockRejectedValue(new Error("legacy readState"));
    const legacyWriteState = vi.spyOn(app.store, "writeState").mockRejectedValue(new Error("legacy writeState"));

    const added = await app.addSource(repoPath, {
      sourceIdOverride: "design-source",
      draft: {
        selectedLeafIds: ["design-source:skills/frontend-design"],
        enabledTargets: ["codex"],
      },
    });

    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    expect(legacyReadState).not.toHaveBeenCalled();
    expect(legacyWriteState).not.toHaveBeenCalled();
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.manifest.sources).toEqual([
      expect.objectContaining({
        id: "design-source",
        kind: "local",
        locator: repoPath,
      }),
    ]);
    expect(state.manifest.bindings["design-source"]).toEqual({
      sourceId: "design-source",
      selectionMode: "all",
      selectedLeafIds: [],
      enabledTargets: ["codex"],
    });
    expect(state.lockFile.projections).toEqual([
      expect.objectContaining({
        sourceId: "design-source",
        leafId: "design-source:skills/frontend-design",
        target: "codex",
        status: "active",
      }),
    ]);
    await expect(pathExists(path.join(sandbox.targetsRoot, "codex", "frontend-design"))).resolves.toBe(true);
  });

  test("rollbackPreparedSource removes a v2 source with no active projections", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const app = new SkillFlowApp();
    await app.stateStoreV2.init();
    const added = await app.addSource(repoPath, {
      sourceIdOverride: "design-source",
      project: false,
    });
    expect(added.ok).toBe(true);

    const rolledBack = await app.rollbackPreparedSource("design-source");

    expect(rolledBack.ok).toBe(true);
    if (!rolledBack.ok) {
      return;
    }
    const state = await new StateStoreV2(sandbox.stateRoot).readState();
    expect(state.manifest.sources).toEqual([]);
    expect(state.lockFile.sources["design-source"]).toBeUndefined();
    expect(state.lockFile.leafInventory).toEqual([]);
  });
});
```

- [ ] **Step 2: Run failing test**

```bash
npm run -w @skill-flow/query test -- runtime-source-v2.test.ts
```

Expected: fail because runtime add/rollback still calls legacy `SourceService` and legacy `StateStore`.

- [ ] **Step 3: Wire V2 services in runtime constructor**

Modify `packages/query/src/runtime.ts` imports and constructor:

```ts
import { SourceCheckoutService } from "@skill-flow/core-engine/services/source-checkout-service";
import { SourceAuthorityServiceV2 } from "@skill-flow/core-engine/services/source-authority-service-v2";

readonly sourceCheckoutService: SourceCheckoutService;
readonly sourceAuthorityServiceV2: SourceAuthorityServiceV2;

this.sourceCheckoutService = new SourceCheckoutService({
  sourceRoot: path.join(this.stateStoreV2.rootPath, "source"),
  inventoryService: this.inventoryService,
});
this.sourceAuthorityServiceV2 = new SourceAuthorityServiceV2({
  stateStore: this.stateStoreV2,
  checkoutService: this.sourceCheckoutService,
});
```

Keep `this.sourceService` only for methods not yet migrated in this task. Do not call it from `prepareAddSourceImpl` or `rollbackPreparedSourceInternal` after this task.

- [ ] **Step 4: Replace `prepareAddSourceImpl`**

Use this structure in `packages/query/src/runtime.ts`:

```ts
private async prepareAddSourceImpl(
  locator: string,
  options?: SkillFlowAddOptions,
): Promise<Result<AddSourceResult>> {
  const addOptions = options ?? {};
  const result = await this.sourceAuthorityServiceV2.addSource(locator, addOptions);
  if (!result.ok) {
    return fail(result.errors, result.warnings);
  }

  const state = await this.stateStoreV2.readState();
  const view = projectStateV2ToView(state);
  const source = view.manifest.sources.find((item) => item.id === result.data.manifest.id);
  if (!source) {
    return fail({
      code: "SOURCE_NOT_FOUND",
      message: `Skills group id '${result.data.manifest.id}' is not registered.`,
    });
  }

  const sourceLeafs = view.lockFile.leafInventory.filter((leaf) => leaf.sourceId === source.id);
  const availableTargets = addOptions.skipTargetDetection ? [] : await this.getAvailableTargets();
  const preparedDraft = this.buildAddDraft(sourceLeafs, this.normalizeRequestedPath(source.requestedPath), availableTargets, addOptions);
  if (!preparedDraft.ok) {
    await this.rollbackPreparedSourceInternal(source.id);
    return fail(preparedDraft.errors, [...result.warnings, ...preparedDraft.warnings]);
  }

  return ok({
    manifest: source,
    lock: view.lockFile.sources.find((item) => item.id === source.id)!,
    leafCount: result.data.leafCount,
    invalidLeafCount: result.data.invalidLeafCount,
    sourceId: source.id,
    availableTargets,
    draft: preparedDraft.data,
    leafs: sourceLeafs,
    projected: false,
  }, result.warnings);
}
```

If `view.lockFile.sources.find` is not available because V2 view lock sources are array-shaped, use the current projected V1 view type from `state-v2-view.ts` and keep the non-null check explicit with `SOURCE_LOCK_MISSING`.

- [ ] **Step 5: Replace rollback**

Add `removeSource` to `SourceAuthorityServiceV2`:

```ts
async removeSource(sourceIds: string[]): Promise<Result<{ removed: string[] }>> {
  const state = await this.options.stateStore.readState();
  const removed: string[] = [];
  const manifestSources = [...state.manifest.sources];
  const lockSources = { ...state.lockFile.sources };
  let leafInventory = [...state.lockFile.leafInventory];
  let projections = [...state.lockFile.projections];

  for (const sourceId of sourceIds) {
    const source = manifestSources.find((item) => item.id === sourceId);
    const lock = lockSources[sourceId];
    if (!source || !lock) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${sourceId}' is not registered.`,
      });
    }
    if (projections.some((projection) => projection.sourceId === sourceId && projection.status === "active")) {
      return fail({
        code: "SOURCE_HAS_ACTIVE_PROJECTIONS",
        message: `Unable to remove source '${sourceId}' while it has active projections.`,
      });
    }
    delete lockSources[sourceId];
    leafInventory = leafInventory.filter((leaf) => leaf.sourceId !== sourceId);
    projections = projections.filter((projection) => projection.sourceId !== sourceId);
    if (!isPathInside(path.join(this.options.stateStore.rootPath, "source"), lock.localPath)) {
      return fail({
        code: "SOURCE_CHECKOUT_PATH_INVALID",
        message: `Refusing to delete checkout outside managed root: ${lock.localPath}`,
      });
    }
    await removePath(lock.localPath);
    removed.push(sourceId);
  }

  await this.options.stateStore.writeState({
    ...state,
    manifest: {
      ...state.manifest,
      sources: manifestSources.filter((source) => !removed.includes(source.id)),
      bindings: Object.fromEntries(
        Object.entries(state.manifest.bindings).filter(([sourceId]) => !removed.includes(sourceId)),
      ),
    },
    lockFile: {
      ...state.lockFile,
      sources: lockSources,
      leafInventory,
      projections,
    },
  });

  return ok({ removed });
}
```

Then update `rollbackPreparedSourceInternal` to call `this.sourceAuthorityServiceV2.removeSource([sourceId])` after checking V2 active projections.

- [ ] **Step 6: Run tests**

```bash
npm run -w @skill-flow/query test -- runtime-source-v2.test.ts runtime-v2.test.ts
npm run -w @skill-flow/core-engine test -- source-authority-service-v2.test.ts
npm run -w @skill-flow/query build
npm run -w @skill-flow/core-engine build
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/query/src/runtime.ts packages/query/src/tests/runtime-source-v2.test.ts packages/core-engine/src/services/source-authority-service-v2.ts packages/core-engine/src/tests/source-authority-service-v2.test.ts
git commit -m "refactor: add sources through v2 authority"
```

### Task 4: Add V2 Import Preparation Service And Commit Flow

**Files:**

- Create: `packages/core-engine/src/services/import-preparation-service-v2.ts`
- Create: `packages/core-engine/src/tests/import-preparation-service-v2.test.ts`
- Modify: `packages/query/src/runtime.ts`
- Modify: `packages/query/src/tests/import-page-flow.test.ts`
- Test: `packages/core-engine/src/tests/import-preparation-service-v2.test.ts`
- Test: `packages/query/src/tests/import-page-flow.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `packages/core-engine/src/tests/import-preparation-service-v2.test.ts`:

```ts
import path from "node:path";
import { describe, expect, test } from "vitest";
import { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
import { StateStore } from "@skill-flow/storage/store";
import { InventoryService } from "../services/inventory-service.js";
import { ImportPreparationServiceV2 } from "../services/import-preparation-service-v2.js";
import { SourceAuthorityServiceV2 } from "../services/source-authority-service-v2.js";
import { SourceCheckoutService } from "../services/source-checkout-service.js";
import { createRepo, skillDoc, useCoreSandbox } from "./test-helpers.js";

describe.sequential("ImportPreparationServiceV2", () => {
  const sandbox = useCoreSandbox();

  test("commits a prepared checkout through v2 source authority", async () => {
    const repoPath = await createRepo(sandbox.root, {
      "skills/frontend-design/SKILL.md": skillDoc("frontend-design", "Design frontends."),
    });
    const stateStore = new StateStoreV2(sandbox.stateRoot);
    await stateStore.init();
    const cacheStore = new StateStore(sandbox.stateRoot);
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const sourceAuthority = new SourceAuthorityServiceV2({ stateStore, checkoutService });
    const service = new ImportPreparationServiceV2({
      cacheStore,
      sourceAuthority,
      checkoutService,
    });

    const prepared = await service.prepareImportSource(repoPath, {
      sourceIdOverride: "design-source",
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok || prepared.data.status !== "ready") {
      return;
    }

    const committed = await service.commitPreparedImportSource(prepared.data.preparationId);

    expect(committed.ok).toBe(true);
    if (!committed.ok) {
      return;
    }
    expect(committed.data).toMatchObject({
      status: "ready",
      sourceId: "design-source",
      usedPreparation: true,
    });
    const state = await stateStore.readState();
    expect(state.manifest.sources.map((source) => source.id)).toEqual(["design-source"]);
    expect(state.lockFile.sources["design-source"]?.leafIds).toEqual(["design-source:skills/frontend-design"]);
  });

  test("returns stale when prepared checkout is missing", async () => {
    const stateStore = new StateStoreV2(sandbox.stateRoot);
    await stateStore.init();
    const cacheStore = new StateStore(sandbox.stateRoot);
    const checkoutService = new SourceCheckoutService({
      sourceRoot: path.join(sandbox.stateRoot, "source"),
      inventoryService: new InventoryService(),
    });
    const sourceAuthority = new SourceAuthorityServiceV2({ stateStore, checkoutService });
    const service = new ImportPreparationServiceV2({
      cacheStore,
      sourceAuthority,
      checkoutService,
    });

    await cacheStore.writeImportPreparationRecord({
      id: "prep-missing",
      cacheKey: "local:/missing",
      locator: "/missing",
      canonicalRepo: "local:/missing",
      sourceKind: "local",
      checkoutPath: path.join(sandbox.stateRoot, "catalog", "import-preparations", "prep-missing", "checkout"),
      sourceId: "missing-source",
      displayName: "missing-source",
      status: "ready",
      preparedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      skillIds: [],
      availableTargets: [],
    });

    const committed = await service.commitPreparedImportSource("prep-missing");

    expect(committed.ok).toBe(true);
    if (!committed.ok) {
      return;
    }
    expect(committed.data).toEqual({
      status: "failed",
      reasonCode: "IMPORT_PREPARATION_MISSING",
      retryable: true,
    });
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/core-engine test -- import-preparation-service-v2.test.ts
```

Expected: fail because `ImportPreparationServiceV2` does not exist.

- [ ] **Step 3: Implement service**

Create `packages/core-engine/src/services/import-preparation-service-v2.ts`:

```ts
import crypto from "node:crypto";
import type {
  ImportPreparationRecord,
  ImportPreparationResult,
  ImportSourceResult,
  Result,
} from "@skill-flow/domain/types";
import { pathExists, removePath } from "@skill-flow/integration/utils/fs";
import { ok } from "@skill-flow/integration/utils/result";
import { deriveDisplayName, deriveSourceId } from "@skill-flow/integration/utils/source-id";
import { isImportPreparationExpired, pruneImportPreparationCache } from "@skill-flow/storage/import-preparation-cache";
import type { StateStore } from "@skill-flow/storage/store";
import type { AddSourceV2Options, SourceAuthorityServiceV2 } from "./source-authority-service-v2.js";
import type { PreparedSourceCheckoutV2, SourceCheckoutService } from "./source-checkout-service.js";

const IMPORT_PREPARATION_TTL_MS = 24 * 60 * 60 * 1000;

export type ImportPreparationServiceV2Options = {
  cacheStore: StateStore;
  sourceAuthority: SourceAuthorityServiceV2;
  checkoutService: SourceCheckoutService;
};

export class ImportPreparationServiceV2 {
  private readonly inFlight = new Map<string, Promise<Result<ImportPreparationResult>>>();

  constructor(private readonly options: ImportPreparationServiceV2Options) {}

  async prepareImportSource(locator: string, addOptions: AddSourceV2Options = {}): Promise<Result<ImportPreparationResult>> {
    const cacheKey = this.cacheKey(locator, addOptions);
    const cached = await this.findReusablePreparation(cacheKey);
    if (cached) {
      return ok(cached);
    }
    const inFlight = this.inFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
    const task = this.prepareFreshImportSource(locator, cacheKey, addOptions).finally(() => {
      this.inFlight.delete(cacheKey);
    });
    this.inFlight.set(cacheKey, task);
    return task;
  }

  async commitPreparedImportSource(preparationId: string): Promise<Result<ImportSourceResult>> {
    const cache = await this.options.cacheStore.readImportPreparationCache();
    const record = cache.records[preparationId];
    if (!record || record.status !== "ready" || isImportPreparationExpired(record)) {
      return ok({
        status: "failed",
        reasonCode: "IMPORT_PREPARATION_STALE",
        retryable: true,
      });
    }
    if (!(await pathExists(record.checkoutPath))) {
      await this.options.cacheStore.deleteImportPreparationRecord(preparationId);
      return ok({
        status: "failed",
        reasonCode: "IMPORT_PREPARATION_MISSING",
        retryable: true,
      });
    }

    await this.options.cacheStore.writeImportPreparationRecord({ ...record, status: "committing" });
    const committed = await this.options.sourceAuthority.commitPreparedSource({
      locator: record.locator,
      preparedCheckout: {
        locator: record.locator,
        displayName: record.displayName,
        ...(record.requestedPath ? { requestedPath: record.requestedPath } : {}),
        kind: record.sourceKind,
        sourceId: record.sourceId,
        checkoutPath: record.checkoutPath,
        leafs: this.readPreparedLeafs(record),
        ...(record.commitSha ? { commitSha: record.commitSha } : {}),
      },
    });
    if (!committed.ok) {
      await this.options.cacheStore.writeImportPreparationRecord({
        ...record,
        status: "failed",
        failure: {
          reasonCode: committed.errors[0]?.code ?? "IMPORT_COMMIT_FAILED",
          retryable: true,
          message: committed.errors[0]?.message ?? "Unable to commit prepared import.",
        },
      });
      return ok({
        status: "failed",
        reasonCode: committed.errors[0]?.code ?? "IMPORT_COMMIT_FAILED",
        retryable: true,
      }, committed.warnings);
    }

    await this.options.cacheStore.deleteImportPreparationRecord(preparationId);
    return ok({
      status: "ready",
      sourceId: committed.data.manifest.id,
      canonicalRepo: record.canonicalRepo,
      preparationId,
      usedPreparation: true,
    }, committed.warnings);
  }

  private async prepareFreshImportSource(
    locator: string,
    cacheKey: string,
    addOptions: AddSourceV2Options,
  ): Promise<Result<ImportPreparationResult>> {
    const preparationId = `prep-${crypto.randomUUID()}`;
    const checkoutPath = this.options.cacheStore.getImportPreparationCheckoutPath(preparationId);
    const now = Date.now();
    const preparedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + IMPORT_PREPARATION_TTL_MS).toISOString();

    await removePath(checkoutPath).catch(() => {});
    await this.options.cacheStore.writeImportPreparationRecord({
      id: preparationId,
      cacheKey,
      locator,
      canonicalRepo: cacheKey,
      sourceKind: "git",
      checkoutPath,
      sourceId: addOptions.sourceIdOverride ?? deriveSourceId(locator),
      displayName: addOptions.displayNameOverride ?? deriveDisplayName(locator),
      ...(addOptions.path ? { requestedPath: addOptions.path } : {}),
      status: "preparing",
      preparedAt,
      expiresAt,
      skillIds: [],
      availableTargets: [],
    });

    const prepared = await this.options.checkoutService.prepareSourceCheckout(locator, {
      ...addOptions,
      checkoutPath,
    });
    if (!prepared.ok) {
      await this.options.cacheStore.writeImportPreparationRecord({
        id: preparationId,
        cacheKey,
        locator,
        canonicalRepo: cacheKey,
        sourceKind: "git",
        checkoutPath,
        sourceId: addOptions.sourceIdOverride ?? deriveSourceId(locator),
        displayName: addOptions.displayNameOverride ?? deriveDisplayName(locator),
        ...(addOptions.path ? { requestedPath: addOptions.path } : {}),
        status: "failed",
        preparedAt,
        expiresAt,
        skillIds: [],
        availableTargets: [],
        failure: {
          reasonCode: prepared.errors[0]?.code ?? "IMPORT_PREPARE_FAILED",
          retryable: true,
          message: prepared.errors[0]?.message ?? "Unable to prepare import.",
        },
      });
      return ok({
        status: "failed",
        preparationId,
        reasonCode: prepared.errors[0]?.code ?? "IMPORT_PREPARE_FAILED",
        retryable: true,
      }, prepared.warnings);
    }

    const record: ImportPreparationRecord & { preparedLeafs: PreparedSourceCheckoutV2["leafs"] } = {
      id: preparationId,
      cacheKey,
      locator: prepared.data.locator,
      canonicalRepo: cacheKey,
      sourceKind: prepared.data.kind,
      checkoutPath: prepared.data.checkoutPath,
      sourceId: prepared.data.sourceId,
      displayName: prepared.data.displayName,
      ...(prepared.data.requestedPath ? { requestedPath: prepared.data.requestedPath } : {}),
      status: "ready",
      preparedAt,
      expiresAt,
      ...(prepared.data.commitSha ? { commitSha: prepared.data.commitSha } : {}),
      skillIds: prepared.data.leafs.map((leaf) => leaf.name),
      preparedLeafs: prepared.data.leafs,
      availableTargets: [],
    };
    await this.options.cacheStore.writeImportPreparationRecord(record);
    await this.options.cacheStore.writeImportPreparationCache(
      pruneImportPreparationCache(await this.options.cacheStore.readImportPreparationCache()),
    );
    return ok({
      status: "ready",
      preparationId,
      locator: record.locator,
      canonicalRepo: record.canonicalRepo,
      preparedAt,
      expiresAt,
    }, prepared.warnings);
  }

  private async findReusablePreparation(cacheKey: string): Promise<ImportPreparationResult | undefined> {
    const cache = await this.options.cacheStore.pruneImportPreparationRecords();
    const preparationId = cache.locatorIndex[cacheKey];
    const record = preparationId ? cache.records[preparationId] : undefined;
    if (!record) {
      return undefined;
    }
    if (record.status === "ready" && !(await pathExists(record.checkoutPath))) {
      await this.options.cacheStore.deleteImportPreparationRecord(record.id);
      return undefined;
    }
    if (isImportPreparationExpired(record)) {
      return {
        status: "stale",
        preparationId: record.id,
        locator: record.locator,
        canonicalRepo: record.canonicalRepo,
        preparedAt: record.preparedAt,
        expiresAt: record.expiresAt,
      };
    }
    if (record.status === "ready" || record.status === "preparing") {
      return {
        status: record.status,
        preparationId: record.id,
        locator: record.locator,
        canonicalRepo: record.canonicalRepo,
        preparedAt: record.preparedAt,
        expiresAt: record.expiresAt,
      };
    }
    await this.options.cacheStore.deleteImportPreparationRecord(record.id);
    return undefined;
  }

  private readPreparedLeafs(record: ImportPreparationRecord): PreparedSourceCheckoutV2["leafs"] {
    const preparedLeafs = (record as ImportPreparationRecord & {
      preparedLeafs?: PreparedSourceCheckoutV2["leafs"];
    }).preparedLeafs;
    if (!preparedLeafs || preparedLeafs.length === 0) {
      throw new Error(`Import preparation '${record.id}' is missing prepared leaf inventory.`);
    }
    return preparedLeafs;
  }

  private cacheKey(locator: string, options: AddSourceV2Options): string {
    const trimmed = locator.trim();
    return options.path ? `${trimmed}#${options.path}` : trimmed;
  }
}
```

The prepared cache record written by this task must persist `preparedLeafs`. Commit reads those leafs and passes them to `SourceAuthorityServiceV2`; an empty prepared leaf inventory is a hard preparation cache error, not a successful commit.

- [ ] **Step 4: Wire runtime import services**

Modify `SkillFlowApp` constructor:

```ts
import { ImportPreparationServiceV2 } from "@skill-flow/core-engine/services/import-preparation-service-v2";

readonly importPreparationServiceV2: ImportPreparationServiceV2;

this.importPreparationServiceV2 = new ImportPreparationServiceV2({
  cacheStore: this.store,
  sourceAuthority: this.sourceAuthorityServiceV2,
  checkoutService: this.sourceCheckoutService,
});
```

Replace calls in `prepareImportSourceImpl`, `commitPreparedImportSourceImpl`, and `importSourceImpl` from `this.importPreparationService` to `this.importPreparationServiceV2`.

Replace the post-commit leaf read:

```ts
const { lockFile } = await this.store.readState();
const sourceLeafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === committedData.sourceId);
```

with:

```ts
const runtimeView = await this.readRuntimeAuthorityView();
const sourceLeafs = runtimeView.lockFile.leafInventory.filter((leaf) => leaf.sourceId === committedData.sourceId);
```

- [ ] **Step 5: Run tests**

```bash
npm run -w @skill-flow/core-engine test -- import-preparation-service-v2.test.ts source-authority-service-v2.test.ts
npm run -w @skill-flow/query test -- import-page-flow.test.ts runtime-source-v2.test.ts runtime-v2.test.ts
npm run -w @skill-flow/core-engine build
npm run -w @skill-flow/query build
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core-engine/src/services/import-preparation-service-v2.ts packages/core-engine/src/tests/import-preparation-service-v2.test.ts packages/query/src/runtime.ts packages/query/src/tests/import-page-flow.test.ts
git commit -m "refactor: commit prepared imports through v2 authority"
```

### Task 5: Convert Update, Reconcile, Remove, And Repair To V2

**Files:**

- Modify: `packages/core-engine/src/services/source-authority-service-v2.ts`
- Modify: `packages/query/src/runtime.ts`
- Modify: `packages/query/src/tests/runtime-source-v2.test.ts`
- Modify: `packages/query/src/tests/source-lifecycle.test.ts`
- Test: `packages/query/src/tests/runtime-source-v2.test.ts`
- Test: `packages/query/src/tests/source-lifecycle.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Append to `packages/query/src/tests/runtime-source-v2.test.ts`:

```ts
test("updateSources refreshes v2 leaf inventory and replans projections", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "skills/one/SKILL.md": skillDoc("one", "One."),
  });
  const app = new SkillFlowApp();
  await app.stateStoreV2.init();
  const added = await app.addSource(repoPath, {
    sourceIdOverride: "demo",
    draft: { selectedLeafIds: ["demo:skills/one"], enabledTargets: ["codex"] },
  });
  expect(added.ok).toBe(true);
  await writeRepoFiles(repoPath, {
    "skills/two/SKILL.md": skillDoc("two", "Two."),
  });
  git(repoPath, ["add", "."]);
  git(repoPath, ["commit", "-m", "add two"]);
  const legacyReadState = vi.spyOn(app.store, "readState").mockRejectedValue(new Error("legacy readState"));
  const legacyWriteState = vi.spyOn(app.store, "writeState").mockRejectedValue(new Error("legacy writeState"));

  const updated = await app.updateSources(["demo"]);

  expect(updated.ok).toBe(true);
  expect(legacyReadState).not.toHaveBeenCalled();
  expect(legacyWriteState).not.toHaveBeenCalled();
  const state = await new StateStoreV2(sandbox.stateRoot).readState();
  expect(state.lockFile.sources.demo?.leafIds).toEqual(["demo:skills/one", "demo:skills/two"]);
  expect(state.lockFile.leafInventory.map((leaf) => leaf.id).sort()).toEqual(["demo:skills/one", "demo:skills/two"]);
});

test("repairTargets replans from v2 projections without lock.deployments", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "skills/one/SKILL.md": skillDoc("one", "One."),
  });
  const app = new SkillFlowApp();
  await app.stateStoreV2.init();
  const added = await app.addSource(repoPath, {
    sourceIdOverride: "demo",
    draft: { selectedLeafIds: ["demo:skills/one"], enabledTargets: ["codex"] },
  });
  expect(added.ok).toBe(true);
  await fs.rm(path.join(sandbox.targetsRoot, "codex", "one"), { recursive: true, force: true });

  const repaired = await app.repairTargets(["demo"]);

  expect(repaired.ok).toBe(true);
  await expect(pathExists(path.join(sandbox.targetsRoot, "codex", "one"))).resolves.toBe(true);
  const rawLock = JSON.parse(await fs.readFile(path.join(sandbox.stateRoot, "lock.json"), "utf8")) as Record<string, unknown>;
  expect(rawLock.deployments).toBeUndefined();
});
```

Add imports at the top:

```ts
import fs from "node:fs/promises";
import { git, writeRepoFiles } from "./test-helpers.js";
```

If `git` is not exported from `test-helpers.js`, export it in the same style as the existing helper.

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/query test -- runtime-source-v2.test.ts
```

Expected: fail because update and repair still use V1 service and legacy planner.

- [ ] **Step 3: Add V2 update and reconcile service methods**

Add methods to `SourceAuthorityServiceV2`:

```ts
async updateSources(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
  const state = await this.options.stateStore.readState();
  const selectedIds = sourceIds?.length ? sourceIds : state.manifest.sources.map((source) => source.id);
  const updated: SourceUpdateResult["updated"] = [];
  let nextLockFile = { ...state.lockFile, sources: { ...state.lockFile.sources }, leafInventory: [...state.lockFile.leafInventory] };

  for (const sourceId of selectedIds) {
    const source = state.manifest.sources.find((item) => item.id === sourceId);
    const lock = nextLockFile.sources[sourceId];
    if (!source || !lock) {
      return fail({
        code: "SOURCE_NOT_FOUND",
        message: `Skills group id '${sourceId}' is not registered.`,
      });
    }
    if (source.kind === "collection") {
      updated.push({
        sourceId,
        changed: false,
        addedLeafIds: [],
        removedLeafIds: [],
        invalidatedLeafIds: [],
        diffs: [],
      });
      continue;
    }
    const snapshot = await this.options.checkoutService.buildUpdateSnapshot({
      kind: source.kind,
      sourceId,
      locator: source.locator,
      displayName: source.displayName,
      checkoutPath: lock.localPath,
    });
    if (!snapshot.ok) {
      return fail(snapshot.errors, snapshot.warnings);
    }
    const nextLeafs = await Promise.all(snapshot.data.leafs.map((leaf) => this.toLeafRecordV2(leaf, sourceId, lock.localPath)));
    const previousLeafs = nextLockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);
    const diff = this.buildV2SourceUpdateDiff(sourceId, previousLeafs, nextLeafs);
    nextLockFile.sources[sourceId] = {
      ...lock,
      revision: {
        ...lock.revision,
        ...(snapshot.data.commitSha ? { commit: snapshot.data.commitSha } : {}),
        capturedAt: new Date().toISOString(),
      },
      leafIds: nextLeafs.map((leaf) => leaf.id),
    };
    nextLockFile.leafInventory = [
      ...nextLockFile.leafInventory.filter((leaf) => leaf.sourceId !== sourceId),
      ...nextLeafs,
    ];
    updated.push(diff);
  }

  await this.options.stateStore.writeState({
    ...state,
    lockFile: nextLockFile,
  });
  return ok({ updated });
}
```

`buildV2SourceUpdateDiff` must compare previous and current leaf ids and content hashes. It must return `addedLeafIds`, `removedLeafIds`, `invalidatedLeafIds`, and `diffs` using the existing `SourceUpdateResult` shape.

- [ ] **Step 4: Replace runtime update and repair**

In `packages/query/src/runtime.ts`:

- `updateSourcesImpl` calls `this.sourceAuthorityServiceV2.updateSources(requestedIds)`.
- `doctorImpl` reads `readRuntimeAuthorityView()`, then calls the existing `DoctorService` with projected V1 view.
- `repairTargetsImpl` reads V2 state, plans with `DeploymentPlannerV2`, applies with `DeploymentApplierV2`, and writes V2 state.
- `repairSourceImpl` calls V2 update and writes V2 lock only.
- `repairStateImpl` calls V2 reconcile and rebuilds V2 projection state; it must not create `lock.deployments`.
- `uninstallImpl` removes target paths using V2 projections, then calls `this.sourceAuthorityServiceV2.removeSource(sourceIds)`.

Use this V2 planning pattern in each affected runtime method:

```ts
const state = await this.stateStoreV2.readState();
const manifest = this.cloneManifestV2(state.manifest);
const lockFile = this.cloneLockFileV2(state.lockFile);
const preferences = projectStateV2ToView(state).preferences;
const plan = await this.planForSourcesV2(manifest, lockFile, planSourceIds, preferences);
if (!plan.ok) {
  return fail(plan.errors, plan.warnings);
}
const applied = await new DeploymentApplierV2(this.createAdaptersForPreferences(preferences)).applyPlan(lockFile, plan.data.actions);
if (!applied.ok) {
  return fail(applied.errors, [...plan.warnings, ...applied.warnings]);
}
await this.stateStoreV2.writeState({ ...state, manifest, lockFile });
```

- [ ] **Step 5: Run tests**

```bash
npm run -w @skill-flow/query test -- runtime-source-v2.test.ts source-lifecycle.test.ts runtime-v2.test.ts
npm run -w @skill-flow/core-engine test -- source-authority-service-v2.test.ts
npm run -w @skill-flow/query build
npm run -w @skill-flow/core-engine build
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core-engine/src/services/source-authority-service-v2.ts packages/query/src/runtime.ts packages/query/src/tests/runtime-source-v2.test.ts packages/query/src/tests/source-lifecycle.test.ts packages/query/src/tests/test-helpers.ts
git commit -m "refactor: update and repair sources through v2 authority"
```

### Task 6: Convert Project-scoped Drafts And Project Target Cleanup To V2

**Files:**

- Modify: `packages/query/src/runtime.ts`
- Modify: `packages/query/src/tests/project-scoped-drafts.test.ts`
- Test: `packages/query/src/tests/project-scoped-drafts.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/query/src/tests/project-scoped-drafts.test.ts`:

```ts
test("project scoped apply writes projectSourceDrafts in v2 preferences without legacy preferences", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "skills/alpha/SKILL.md": skillDoc("alpha", "Alpha."),
  });
  const app = new SkillFlowApp();
  await app.stateStoreV2.init();
  const added = await app.addSource(repoPath, { sourceIdOverride: "alpha", project: false });
  expect(added.ok).toBe(true);
  await app.writePreferencesV2FromView({
    schemaVersion: 1,
    pinnedSourceIds: [],
    selectedProjectScope: { kind: "project", projectId: "project-a" },
    recentProjects: [{
      projectId: "project-a",
      title: "Project A",
      lastActivityAt: "2026-06-05T00:00:00.000Z",
      projectPath: sandbox.sandboxRoot,
    }],
    projectDrafts: {},
    customTargets: [],
    agentDisplayOrder: [],
  });
  const legacyReadPreferences = vi.spyOn(app.store, "readPreferences").mockRejectedValue(new Error("legacy readPreferences"));
  const legacyWritePreferences = vi.spyOn(app.store, "writePreferences").mockRejectedValue(new Error("legacy writePreferences"));

  const applied = await app.applyDraft("alpha", {
    selectedLeafIds: ["alpha:skills/alpha"],
    enabledTargets: ["codex"],
  }, { kind: "project", projectId: "project-a" });

  expect(applied.ok).toBe(true);
  expect(legacyReadPreferences).not.toHaveBeenCalled();
  expect(legacyWritePreferences).not.toHaveBeenCalled();
  const state = await new StateStoreV2(sandbox.stateRoot).readState();
  expect(state.preferences.projectSourceDrafts["project-a"]?.alpha).toEqual(expect.objectContaining({
    sourceId: "alpha",
    selectedLeafIds: ["alpha:skills/alpha"],
    enabledTargets: ["codex"],
  }));
});
```

If `writePreferencesV2FromView` remains private, seed `preferences.json` directly with `StateStoreV2.writeState` in the test.

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/query test -- project-scoped-drafts.test.ts
```

Expected: fail because project-scoped apply still reads and writes legacy preferences.

- [ ] **Step 3: Replace project scoped preference writes**

In `applyDraftImpl`, replace the project-scope branch with V2 preferences:

```ts
const state = await this.stateStoreV2.readState();
const preferences = projectStateV2ToView(state).preferences;
const nextPreferences = {
  ...preferences,
  projectDrafts: {
    ...preferences.projectDrafts,
    [scope.projectId]: {
      ...(preferences.projectDrafts[scope.projectId] ?? {}),
      [sourceId]: prepared.draft,
    },
  },
};
await this.writePreferencesV2FromView(nextPreferences);
```

When project target roots are unavailable, call `removeUnavailableProjectScope` rewritten to use `writePreferencesV2FromView` instead of legacy `store.writePreferences`.

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/query test -- project-scoped-drafts.test.ts runtime-v2.test.ts
npm run -w @skill-flow/query build
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/runtime.ts packages/query/src/tests/project-scoped-drafts.test.ts
git commit -m "refactor: store project drafts in v2 preferences"
```

### Task 7: Remove Normal Runtime Legacy Source Service Usage

**Files:**

- Modify: `packages/query/src/runtime.ts`
- Modify: `packages/query/src/tests/runtime-source-v2.test.ts`
- Modify: `packages/core-engine/src/tests/source-service.test.ts`
- Test: `packages/query/src/tests/runtime-source-v2.test.ts`

- [ ] **Step 1: Add guard test**

Append to `packages/query/src/tests/runtime-source-v2.test.ts`:

```ts
test("normal runtime source operations do not call legacy SourceService methods", async () => {
  const repoPath = await createRepo(sandbox.sandboxRoot, {
    "skills/alpha/SKILL.md": skillDoc("alpha", "Alpha."),
  });
  const app = new SkillFlowApp();
  await app.stateStoreV2.init();
  const legacyAdd = vi.spyOn(app.sourceService, "addSource").mockRejectedValue(new Error("legacy addSource"));
  const legacyCommit = vi.spyOn(app.sourceService, "commitPreparedSource").mockRejectedValue(new Error("legacy commitPreparedSource"));
  const legacyUpdate = vi.spyOn(app.sourceService, "updateSources").mockRejectedValue(new Error("legacy updateSources"));
  const legacyRemove = vi.spyOn(app.sourceService, "removeSource").mockRejectedValue(new Error("legacy removeSource"));
  const added = await app.addSource(repoPath, { sourceIdOverride: "alpha", project: false });
  expect(added.ok).toBe(true);
  const updated = await app.updateSources(["alpha"]);
  expect(updated.ok).toBe(true);
  const removed = await app.uninstall(["alpha"]);
  expect(removed.ok).toBe(true);
  expect(legacyAdd).not.toHaveBeenCalled();
  expect(legacyCommit).not.toHaveBeenCalled();
  expect(legacyUpdate).not.toHaveBeenCalled();
  expect(legacyRemove).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run failing test**

```bash
npm run -w @skill-flow/query test -- runtime-source-v2.test.ts
```

Expected: fail until every normal runtime source path uses V2 services.

- [ ] **Step 3: Delete normal runtime calls**

In `packages/query/src/runtime.ts`, remove calls to:

```ts
this.sourceService.addSource(...)
this.sourceService.commitPreparedSource(...)
this.sourceService.updateSources(...)
this.sourceService.reconcileInventory(...)
this.sourceService.removeSource(...)
this.importPreparationService.commitPreparedImportSource(...)
this.importPreparationService.prepareImportSource(...)
```

The `sourceService` property can remain only if tests or legacy-only helpers still access it. If it remains, add a comment:

```ts
// Legacy source service remains for legacy service tests; normal runtime mutations use V2 services.
```

Do not use it from normal runtime methods.

- [ ] **Step 4: Run full affected tests**

```bash
npm run -w @skill-flow/query test -- runtime-source-v2.test.ts runtime-v2.test.ts import-page-flow.test.ts source-lifecycle.test.ts project-scoped-drafts.test.ts
npm run -w @skill-flow/core-engine test -- source-authority-service-v2.test.ts import-preparation-service-v2.test.ts source-checkout-service.test.ts
npm run -w @skill-flow/query build
npm run -w @skill-flow/core-engine build
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/runtime.ts packages/query/src/tests/runtime-source-v2.test.ts packages/core-engine/src/tests/source-service.test.ts
git commit -m "refactor: remove legacy source service from runtime mutations"
```

### Task 8: CLI And Integration Assertions Use V2 Projections

**Files:**

- Modify: `apps/cli/src/tests/skill-flow.test.ts`
- Modify: `apps/cli/src/tests/config-integration.test.ts`
- Modify: `apps/cli/src/tests/add-prepare-flow.test.ts`
- Modify: `apps/cli/src/cli.tsx`
- Test: `apps/cli/src/tests/skill-flow.test.ts`

- [ ] **Step 1: Replace deployment assertions**

In CLI tests, replace assertions reading:

```ts
lock.deployments.find((deployment) => deployment.sourceId === sourceId)
```

with:

```ts
lock.projections.find((projection) =>
  projection.sourceId === sourceId &&
  projection.status === "active"
)
```

Replace tests that mutate `lock.deployments` with mutations of `lock.projections`:

```ts
lock.projections = lock.projections.filter((projection) =>
  !(projection.sourceId === sourceId && projection.leafId === `${sourceId}:ghost`)
);
```

- [ ] **Step 2: Update CLI repair output**

If `apps/cli/src/cli.tsx` still prints `removed deployments`, change the label to `removed projections`:

```ts
`repaired sources:${result.data.repairedSourceIds.length}  removed projections:${result.data.removedDeploymentCount}`
```

Keep the result field name until the runtime return type is renamed in a separate mechanical task, because existing CLI output tests can assert the display text.

- [ ] **Step 3: Run CLI tests**

```bash
npm run -w skill-flow test -- skill-flow.test.ts config-integration.test.ts add-prepare-flow.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add apps/cli/src/tests/skill-flow.test.ts apps/cli/src/tests/config-integration.test.ts apps/cli/src/tests/add-prepare-flow.test.ts apps/cli/src/cli.tsx
git commit -m "test: assert cli state through v2 projections"
```

### Task 9: Final V2-only Runtime Sweep

**Files:**

- Modify: files reported by the grep commands in this task
- Test: affected package tests

- [ ] **Step 1: Run legacy runtime grep**

```bash
rg -n "this\\.store\\.(readState|writeState|readManifest|writeManifest|readPreferences|writePreferences|pruneMissingSourceIds|readVirtualGroups|writeVirtualGroups)|this\\.sourceService\\.|this\\.importPreparationService\\." packages/query/src/runtime.ts
```

Expected allowed matches after Tasks 1-8:

```text
packages/query/src/runtime.ts:<line>: readonly sourceService: SourceService;
packages/query/src/runtime.ts:<line>: // Legacy source service remains for legacy service tests; normal runtime mutations use V2 services.
```

No other matches are allowed in normal runtime code. If the grep reports cache-only calls such as import preparation cache reads, move them behind `ImportPreparationServiceV2` and keep runtime free of direct legacy store calls.

- [ ] **Step 2: Run raw V1 state grep**

```bash
rg -n "schemaVersion: 1|lock\\.deployments|deployments:" packages/query/src packages/core-engine/src apps/cli/src
```

Expected allowed matches:

```text
packages/query/src/state-v2-view.ts
packages/core-engine/src/services/state-migration-service.ts
legacy-only test fixtures that explicitly seed V1 migration input
```

Every non-migration production match must be removed or rewritten to V2 projection semantics.

- [ ] **Step 3: Run full targeted validation**

```bash
npm run -w @skill-flow/domain build
npm run -w @skill-flow/storage build
npm run -w @skill-flow/core-engine test -- source-checkout-service.test.ts source-authority-service-v2.test.ts import-preparation-service-v2.test.ts state-migration-service.test.ts deployment-planner-v2.test.ts deployment-applier-v2.test.ts
npm run -w @skill-flow/query test -- runtime-v2.test.ts runtime-source-v2.test.ts import-page-flow.test.ts source-lifecycle.test.ts project-scoped-drafts.test.ts config-coordinator.test.ts workflow-service.test.ts
npm run -w skill-flow test -- skill-flow.test.ts config-integration.test.ts add-prepare-flow.test.ts
npm run -w @skill-flow/core-engine build
npm run -w @skill-flow/query build
```

Expected: all commands pass.

- [ ] **Step 4: Commit final sweep**

```bash
git add packages apps
git commit -m "refactor: complete v2-only runtime source writes"
```

### Completion Criteria

- Normal runtime source add, import prepare, import commit, direct import, update, repair, remove, uninstall, project scoped apply, config list, and settings save use V2 authority.
- V1 authority parsing is limited to `StateMigrationService`.
- Runtime V2 write tests spy on legacy state methods and prove they are not called.
- Raw `lock.json` written by affected flows has `schemaVersion: 2`, `projections`, and no `deployments`.
- Collections remain materialized and restore selections retain original `enabledTargets`.
- Import preparation cache may remain under `catalog/import-preparations*`, but it cannot mint authority source identity and cannot be the source of truth after commit.

### Self-review Result

- Spec coverage: The plan covers the remaining V1 write chains identified in `packages/query/src/runtime.ts`: add, rollback, prepared import commit, direct import fallback, update, doctor, repair targets, repair source, repair state, uninstall, project scoped drafts, and CLI projection assertions.
- Placeholder scan: The plan contains concrete file paths, tests, implementation shapes, validation commands, and commit commands. The final implementation must remove the temporary error string in Task 1 before that task can pass.
- Type consistency: V2 authority files use `ManifestFileV2`, `LockFileV2`, `PreferencesFileV2`, `CollectionsFileV2`, `SourceManifestRecordV2`, and `LeafRecordV2`. Runtime view compatibility remains through `projectStateV2ToView` only at API boundaries.

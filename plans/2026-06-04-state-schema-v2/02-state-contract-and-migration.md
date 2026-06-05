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

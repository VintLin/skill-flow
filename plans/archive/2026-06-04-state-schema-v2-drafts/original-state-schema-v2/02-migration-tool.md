# State Migration Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增加 `skill-flow migrate-state --to v2`，把旧 `~/.skillflow` 转换为 V2，并支持 dry-run、backup、verify 和 cache prune。

**Architecture:** CLI 只负责命令解析；query/core 提供迁移服务；storage 负责文件读写、备份和 atomic replace。迁移只处理 state root，target 目录通过后续 apply/repair 校验。

**Tech Stack:** Commander CLI、TypeScript、Vitest、JSON 文件、Node fs。

---

## 文件范围

创建：

- `packages/core-engine/src/services/state-migration-service.ts`
- `packages/core-engine/src/tests/state-migration-service.test.ts`
- `packages/query/src/tests/state-migration-runtime.test.ts`

修改：

- `packages/core-engine/src/index.ts`
- `packages/query/src/runtime.ts`
- `apps/cli/src/cli.tsx`
- `apps/cli/src/tests/skill-flow.test.ts`

## 命令设计

```bash
skill-flow migrate-state --to v2
skill-flow migrate-state --to v2 --dry-run
skill-flow migrate-state --to v2 --state-root /path/to/state
skill-flow migrate-state --to v2 --no-backup
```

默认行为：

1. 读取 state root。
2. 检查 migration status。
3. 创建 backup：`~/.skillflow.backup-YYYYMMDD-HHMMSS`。
4. 生成 migration generation id。
5. 在 state root 写入 `.skillflow-migration.json` marker。
6. 重写权威 JSON 文件，并写入同一个 `migrationGeneration`。
7. 在 staging state root 中将 V1 `virtual-groups.json` 中旧虚拟组的 `includedSkills` materialize 到 V2 `source/collection/*`，并写入 collection generation marker。
8. 验证 staging 中的 V2 不变量。
9. 原子替换权威文件和 `source/collection/*`。
10. 删除 `.skillflow-migration.json` marker。
11. 删除可重建 cache。
12. 重新读取 V2 state 验证。
13. 输出迁移摘要。

半迁移识别：

- 如果启动时发现 `.skillflow-migration.json`，返回 `STATE_MIGRATION_INCOMPLETE`。
- 如果任一 V2 authority file 缺失 `migrationGeneration`，返回 `STATE_MIGRATION_INCOMPLETE`。
- 如果 `manifest.json`、`lock.json`、`preferences.json`、`collections.json` 的 `migrationGeneration` 不一致，返回 `STATE_MIGRATION_INCOMPLETE`。
- 如果任一 `source/collection/<collectionId>/.skillflow-generation.json` 缺失 `migrationGeneration`，返回 `STATE_MIGRATION_INCOMPLETE`。
- 如果任一 `source/collection/<collectionId>/.skillflow-generation.json` 与权威文件 generation 不一致，返回 `STATE_MIGRATION_INCOMPLETE`。
- `catalog/*` prune 只能发生在 marker 删除和 post-write verify 成功之后。

## Tasks

### Task 1: Implement migration service dry-run

**Files:**

- Create: `packages/core-engine/src/services/state-migration-service.ts`
- Test: `packages/core-engine/src/tests/state-migration-service.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:

```ts
test("dry-run reports rewrite and prune actions without modifying files", async () => {
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

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: fail because service does not exist.

- [ ] **Step 3: Implement dry-run**

Implement:

```ts
export type StateMigrationOptions = {
  to: 2;
  dryRun?: boolean;
  backup?: boolean;
};

export type StateMigrationResult =
  | {
      status: "current";
      stateRoot: string;
      actions: StateFileMigrationPlan[];
    }
  | {
      status: "dry-run";
      stateRoot: string;
      actions: StateFileMigrationPlan[];
    }
  | {
      status: "migrated";
      stateRoot: string;
      backupPath?: string;
      actions: StateFileMigrationPlan[];
    };
```

Dry-run must call `inspectStateMigrationStatus` and return planned actions without writing files.

If `inspectStateMigrationStatus` returns `incomplete` or `invalid`, `migrate()` must not start. It returns or throws a structured error with:

```ts
{
  reasonCode: "STATE_MIGRATION_INCOMPLETE" | "STATE_MIGRATION_BLOCKED";
  diagnostics: StateMigrationDiagnostic[];
}
```

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: pass dry-run tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core-engine/src/services/state-migration-service.ts packages/core-engine/src/tests/state-migration-service.test.ts
git commit -m "feat: add state migration dry run"
```

### Task 2: Implement backup and V2 rewrite

**Files:**

- Modify: `packages/core-engine/src/services/state-migration-service.ts`
- Test: `packages/core-engine/src/tests/state-migration-service.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:

```ts
test("migrates state files to schemaVersion 2 and creates backup", async () => {
  const service = new StateMigrationService({ stateRoot });
  const result = await service.migrate({ to: 2, backup: true });

  expect(result.status).toBe("migrated");
  expect(result.backupPath).toBeTruthy();
  expect(await pathExists(result.backupPath!)).toBe(true);
  expect(await readJsonFile(path.join(stateRoot, "manifest.json"), {})).toMatchObject({
    schemaVersion: 2,
  });
  expect(await readJsonFile(path.join(stateRoot, "collections.json"), {})).toMatchObject({
    schemaVersion: 2,
    collections: expect.any(Object),
  });
});

test("prunes rebuildable cache files", async () => {
  const service = new StateMigrationService({ stateRoot });
  await service.migrate({ to: 2, backup: true });

  expect(await pathExists(path.join(stateRoot, "catalog/import-data.json"))).toBe(false);
  expect(await pathExists(path.join(stateRoot, "catalog/source-metadata.json"))).toBe(false);
  expect(await pathExists(path.join(stateRoot, "catalog/import-preparations.json"))).toBe(false);
  expect(await pathExists(path.join(stateRoot, "catalog/import-preparations"))).toBe(false);
  expect(await pathExists(path.join(stateRoot, "catalog/git"))).toBe(false);
});

test("keeps original state and cache when staging validation fails", async () => {
  await seedBrokenVirtualGroupState(stateRoot);
  const beforeManifest = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
  const beforeCacheExists = await pathExists(path.join(stateRoot, "catalog/import-data.json"));
  const service = new StateMigrationService({ stateRoot });

  await expect(service.migrate({ to: 2, backup: true })).rejects.toThrow(
    "STATE_MIGRATION_VALIDATION_FAILED",
  );

  expect(await readJsonFile(path.join(stateRoot, "manifest.json"), {})).toEqual(beforeManifest);
  expect(await pathExists(path.join(stateRoot, "catalog/import-data.json"))).toBe(beforeCacheExists);
});

test("writes the same migration generation to all authority files", async () => {
  const service = new StateMigrationService({ stateRoot });
  await service.migrate({ to: 2, backup: true });

  const manifest = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
  const lock = await readJsonFile(path.join(stateRoot, "lock.json"), {});
  const preferences = await readJsonFile(path.join(stateRoot, "preferences.json"), {});
  const collections = await readJsonFile(path.join(stateRoot, "collections.json"), {});

  expect(manifest.migrationGeneration).toMatch(/^mg_/);
  expect(lock.migrationGeneration).toBe(manifest.migrationGeneration);
  expect(preferences.migrationGeneration).toBe(manifest.migrationGeneration);
  expect(collections.migrationGeneration).toBe(manifest.migrationGeneration);
});

test("reports incomplete migration when marker remains", async () => {
  await writeJsonFile(path.join(stateRoot, ".skillflow-migration.json"), {
    status: "running",
    generation: "mg_test",
  });

  const service = new StateMigrationService({ stateRoot });
  const status = await service.inspect();

  expect(status).toMatchObject({
    status: "incomplete",
    reasonCode: "STATE_MIGRATION_INCOMPLETE",
  });
});

test("reports incomplete migration when authority generation is missing", async () => {
  await writeJsonFile(path.join(stateRoot, "manifest.json"), {
    schemaVersion: 2,
  });

  const service = new StateMigrationService({ stateRoot });
  const status = await service.inspect();

  expect(status).toMatchObject({
    status: "incomplete",
    reasonCode: "STATE_MIGRATION_INCOMPLETE",
  });
});

test("reports incomplete migration when collection generation marker is missing", async () => {
  await seedMigratedCollectionWithoutGenerationMarker(stateRoot);

  const service = new StateMigrationService({ stateRoot });
  const status = await service.inspect();

  expect(status).toMatchObject({
    status: "incomplete",
    reasonCode: "STATE_MIGRATION_INCOMPLETE",
  });
  expect(status.diagnostics[0].path).toContain("source/collection/group-1/.skillflow-generation.json");
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: fail until migration writes files.

- [ ] **Step 3: Implement backup**

Backup path format:

```text
<stateRoot>.backup-YYYYMMDD-HHMMSS
```

Backup copies the whole state root before any write.

- [ ] **Step 4: Implement staging rewrite**

Migration writes to a staging root first:

```text
<stateRoot>.migration-staging-<pid>-<timestamp>
```

For authority files in staging:

- read JSON
- normalize through storage/domain normalizers
- write `schemaVersion: 2`
- write the same `migrationGeneration`
- always write `collections.json`, even when empty:

```json
{
  "schemaVersion": 2,
  "migrationGeneration": "mg_generated",
  "collections": {}
}
```

- materialize collection content under staging `source/collection/*`

Do not modify the original state root during this step.

- [ ] **Step 5: Validate staging**

Validate:

- every authority file has `schemaVersion: 2`
- every authority file has the same `migrationGeneration`
- `collections.json` exists
- collection bindings/projections point to collection leaf ids
- collection member `snapshot.relativePath` resolves inside collection source
- every collection materialized source has `.skillflow-generation.json` with the same `migrationGeneration`
- copied collection content hash equals `snapshot.contentHash`

- [ ] **Step 6: Atomic replace**

Only after staging validation passes:

- atomically replace `manifest.json`
- atomically replace `lock.json`
- atomically replace `preferences.json`
- atomically replace `collections.json`
- atomically replace `source/collection`
- remove `virtual-groups.json` from state root if present
- remove `.skillflow-migration.json` only after all authority replacements succeed

- [ ] **Step 7: Prune cache**

After authority replacement and authority/collection integrity verification succeed, remove:

- remove `catalog/import-data.json`
- remove `catalog/source-metadata.json`
- remove `catalog/import-preparations.json`
- remove `catalog/import-preparations`
- remove `catalog/git`

- [ ] **Step 8: Verify after write**

After cache prune, call `inspectStateMigrationStatus`. Expected result is `current`.

The verification sequence is:

1. replace authority files and `source/collection`
2. verify authority files, collection markers, and materialized content directly
3. remove `.skillflow-migration.json`
4. prune cache
5. call `inspectStateMigrationStatus` and expect `current`

Failure outcomes:

| Failure point | Expected state root outcome |
| --- | --- |
| backup creation fails | original state remains unchanged; migration returns `STATE_MIGRATION_BACKUP_FAILED` |
| marker write fails | original state remains unchanged; migration returns `STATE_MIGRATION_MARKER_FAILED` |
| staging write or staging validation fails | original state remains unchanged; marker is removed; if marker removal fails, next inspect returns `STATE_MIGRATION_INCOMPLETE` |
| authority replace partially succeeds | state root is `STATE_MIGRATION_INCOMPLETE`; backup path is reported |
| `source/collection` replace partially succeeds | state root is `STATE_MIGRATION_INCOMPLETE`; backup path is reported |
| marker removal fails after complete replace | state root is complete V2 but inspect returns `STATE_MIGRATION_INCOMPLETE` until marker is removed |
| cache prune fails after complete replace | authority state remains complete V2; command returns warning and can retry prune; target state is not rolled back |

- [ ] **Step 9: Run tests**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: pass.

- [ ] **Step 10: Commit**

```bash
git add packages/core-engine/src/services/state-migration-service.ts packages/core-engine/src/tests/state-migration-service.test.ts
git commit -m "feat: migrate state root to schema v2"
```

### Task 3: Materialize legacy skill collections and rewrite references

**Files:**

- Modify: `packages/core-engine/src/services/state-migration-service.ts`
- Test: `packages/core-engine/src/tests/state-migration-service.test.ts`

- [ ] **Step 1: Write failing tests**

Test cases:

```ts
test("migrates legacy virtual group refs into materialized collection members", async () => {
  await seedLegacyVirtualGroupState(stateRoot, {
    groupId: "group-1",
    sourceId: "source-a",
    leafId: "leaf-a",
    skillPath: "skills/frontend-design",
    skillContent: "# Frontend Design\n",
  });

  const service = new StateMigrationService({ stateRoot });
  const result = await service.migrate({ to: 2, backup: true });

  expect(result.status).toBe("migrated");
  expect(await pathExists(path.join(stateRoot, "source/collection/group-1"))).toBe(true);

  const collections = await readJsonFile(path.join(stateRoot, "collections.json"), {});
  const generation = await readJsonFile(
    path.join(stateRoot, "source/collection/group-1/.skillflow-generation.json"),
    {},
  );
  const manifest = await readJsonFile(path.join(stateRoot, "manifest.json"), {});
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

  const lock = await readJsonFile(path.join(stateRoot, "lock.json"), {});
  const collectionLeafId = collections.collections["group-1"].members[0].snapshot.leafId;
  expect(manifest.sources.find((source) => source.id === "group-1")).toMatchObject({
    kind: "collection",
  });
  expect(manifest.bindings["group-1"].selectedLeafIds).toEqual([collectionLeafId]);
  expect(lock.leafInventory).toContainEqual(
    expect.objectContaining({
      id: collectionLeafId,
      sourceId: "group-1",
      relativePath: "member-1",
    }),
  );
});

test("blocks migration when legacy virtual group origin leaf is missing", async () => {
  await seedLegacyVirtualGroupStateWithMissingLeaf(stateRoot);
  const service = new StateMigrationService({ stateRoot });

  await expect(service.migrate({ to: 2, backup: true })).rejects.toThrow(
    "STATE_MIGRATION_VIRTUAL_MEMBER_ORIGIN_MISSING",
  );
});

test("blocks migration when copied collection content hash differs from lock hash", async () => {
  await seedLegacyVirtualGroupStateWithDirtySourceContent(stateRoot);
  const service = new StateMigrationService({ stateRoot });

  await expect(service.migrate({ to: 2, backup: true })).rejects.toThrow(
    "STATE_MIGRATION_COLLECTION_HASH_MISMATCH",
  );
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: fail because skill collection migration only rewrites JSON or does not exist.

- [ ] **Step 3: Implement materialization**

During migration:

1. Read V1 `virtual-groups.json`.
2. Build deterministic mapping for every `groups[].includedSkills[]`:

```ts
{
  collectionId,
  originSourceId,
  originLeafId,
  memberIndex,
  memberId,
  collectionLeafId
}
```

3. For every mapped member, find source and leaf in V1 `lock.json`.
4. Copy `leaf.absolutePath` directory into staging:

```text
source/collection/<collectionId>/<memberId>/
```

5. Recompute hash from copied content.
6. If copied hash differs from V1 lock hash, fail with `STATE_MIGRATION_COLLECTION_HASH_MISMATCH`.
7. Write `source/collection/<collectionId>/.skillflow-generation.json` with the migration generation.
8. Build `SkillCollectionRecordV2` with:

```ts
{
  id: collectionId,
  displayName,
  materializedSourceId: collectionId,
  members: [],
  hiddenSourceIds: legacyGroup.hiddenSourceIds,
  restoreSelections: rewriteLegacyRestoreSelections(legacyGroup.restoreSnapshots, mapping),
  createdAt,
  updatedAt
}
```

`rewriteLegacyRestoreSelections` rules:

- migrate legacy `restoreSnapshots[originalSourceId]` to `restoreSelections[originalSourceId]`
- keep selected leaf ids only when they still exist in current `lock.leafInventory` for that original source
- map legacy ids only when they can be mapped to current leaf ids for the same original source
- do not rewrite restore selection leaf ids to collection leaf ids
- remove unmapped leaf ids from executable `selectedLeafIds`
- set `bestEffort: true`
- add diagnostics for every removed or unmapped leaf id

9. Build each `SkillCollectionMemberV2` with:

```ts
{
  origin: {
    sourceId,
    leafId,
    sourceLocator,
    canonicalLocator,
    repoPath,
    contentHashAtCapture,
    capturedAt
  },
  snapshot: {
    leafId: collectionLeafId,
    materializedPath,
    skillFilePath,
    relativePath: memberId,
    contentHash: copiedContentHash
  },
  updatePolicy: "frozen"
}
```

10. Write V2 `collections.json`.
11. Add or rewrite a `kind: "collection"` source in manifest with `source.id === collectionId`.
12. Add or rewrite a collection source lock record and leaf inventory entries in lock with `sourceId === collectionId`.
13. Rewrite `manifest.bindings[collectionId].selectedLeafIds` and target `leafIds` to collection leaf ids.
14. Rewrite V1 `deployments/projections` for the old virtual source to collection source id and collection leaf ids.

- [ ] **Step 4: Preserve original source refs only for diagnostics**

After migration, deploy/apply must read collection member snapshot content. It must not read original `origin.sourceId + origin.leafId` as deployment content.

- [ ] **Step 5: Run tests**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core-engine/src/services/state-migration-service.ts packages/core-engine/src/tests/state-migration-service.test.ts
git commit -m "feat: materialize skill collections during state migration"
```

### Task 4: Expose migration through runtime and CLI

**Files:**

- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/state-migration-runtime.test.ts`
- Modify: `apps/cli/src/cli.tsx`
- Test: `apps/cli/src/tests/skill-flow.test.ts`

- [ ] **Step 1: Write runtime tests**

```ts
test("runtime exposes migration status", async () => {
  const app = new SkillFlowApp({ stateRoot });
  const status = await app.inspectStateMigration();
  expect(status.status).toBe("migration-required");
});

test("runtime migrates state to v2", async () => {
  const app = new SkillFlowApp({ stateRoot });
  const result = await app.migrateState({ to: 2, dryRun: false });
  expect(result.status).toBe("migrated");
});
```

- [ ] **Step 2: Write CLI tests**

```ts
test("migrate-state dry-run prints planned actions", async () => {
  const output = await runCli(["migrate-state", "--to", "v2", "--dry-run"], {
    env: { SKILL_FLOW_STATE_ROOT: stateRoot },
  });
  expect(output.stdout).toContain("Migration required");
  expect(output.stdout).toContain("catalog/import-data.json");
});
```

- [ ] **Step 3: Run failing tests**

```bash
npm run -w @skill-flow/query test -- state-migration-runtime.test.ts
npm run -w skill-flow test -- skill-flow.test.ts
```

Expected: fail because runtime and CLI methods do not exist.

- [ ] **Step 4: Add runtime methods**

Add to `SkillFlowApp`:

```ts
async inspectStateMigration(): Promise<StateMigrationStatus>
async migrateState(options: StateMigrationOptions): Promise<StateMigrationResult>
```

- [ ] **Step 5: Add CLI command**

Add command:

```ts
program
  .command("migrate-state")
  .requiredOption("--to <version>")
  .option("--dry-run")
  .option("--state-root <path>")
  .option("--no-backup")
```

Reject any `--to` value other than `v2`.

- [ ] **Step 6: Run tests**

```bash
npm run -w @skill-flow/query test -- state-migration-runtime.test.ts
npm run -w skill-flow test -- skill-flow.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/query/src/runtime.ts packages/query/src/tests/state-migration-runtime.test.ts apps/cli/src/cli.tsx apps/cli/src/tests/skill-flow.test.ts
git commit -m "feat: expose state migration command"
```

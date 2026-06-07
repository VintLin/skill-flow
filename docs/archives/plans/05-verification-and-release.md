# State Schema V2 Verification And Release Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 fixture、迁移演练、端到端导入、桌面 bridge 测试和发布说明验证 V2 state schema 可以安全上线。

**Architecture:** 用固定 V1 fixture 覆盖迁移，用真实 import providers 覆盖 preview/prepare/commit，用 bridge fixture 覆盖 desktop payload。发布阶段保留 legacy 读取，不删除旧字段。

**Tech Stack:** Vitest、Swift XCTest、CLI fixture、release docs。

---

## 文件范围

创建：

- `packages/storage/src/tests/fixtures/state-v1-basic/manifest.json`
- `packages/storage/src/tests/fixtures/state-v1-basic/lock.json`
- `packages/storage/src/tests/fixtures/state-v1-basic/preferences.json`
- `packages/storage/src/tests/fixtures/state-v1-import-cache/catalog/import-preparations.json`
- `packages/storage/src/tests/fixtures/state-v1-virtual-group/virtual-groups.json`
- `packages/storage/src/tests/fixtures/state-v2-generation-mismatch/manifest.json`
- `packages/storage/src/tests/fixtures/state-v2-generation-mismatch/lock.json`
- `packages/storage/src/tests/fixtures/state-v2-generation-mismatch/preferences.json`
- `packages/storage/src/tests/fixtures/state-v2-generation-mismatch/collections.json`
- `packages/storage/src/tests/fixtures/state-v2-collection-generation-mismatch/manifest.json`
- `packages/storage/src/tests/fixtures/state-v2-collection-generation-mismatch/lock.json`
- `packages/storage/src/tests/fixtures/state-v2-collection-generation-mismatch/preferences.json`
- `packages/storage/src/tests/fixtures/state-v2-collection-generation-mismatch/collections.json`
- `packages/storage/src/tests/fixtures/state-v2-collection-generation-mismatch/source/collection/group-1/.skillflow-generation.json`
- `packages/query/src/tests/state-schema-v2-e2e.test.ts`

修改：

- `README.md`
- `README.zh.md`
- `releases/` 下对应版本说明
- `packages/query/src/tests/import-page-flow.test.ts`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`

## Tasks

### Task 1: Add V1 state fixtures

**Files:**

- Create fixture files under `packages/storage/src/tests/fixtures/`
- Test: `packages/storage/src/tests/state-migration-status.test.ts`
- Test: `packages/core-engine/src/tests/state-migration-service.test.ts`

- [ ] **Step 1: Create fixture shape**

Fixture `state-v1-basic` contains:

```json
{
  "manifest.json": {
    "sources": [
      {
        "id": "source-anthropics-skills",
        "kind": "git",
        "locator": "github:anthropics/skills",
        "displayName": "anthropics/skills"
      }
    ]
  },
  "lock.json": {
    "sources": [],
    "leaves": []
  },
  "preferences.json": {
    "pinnedSourceIds": ["source-anthropics-skills"]
  }
}
```

- [ ] **Step 2: Write fixture migration tests**

```ts
test("v1 basic fixture migrates to v2", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  const service = new StateMigrationService({ stateRoot });
  const result = await service.migrate({ to: 2, backup: true });
  expect(result.status).toBe("migrated");
  const status = await inspectStateMigrationStatus(stateRoot);
  expect(status).toMatchObject({
    status: "current",
    migrationGeneration: expect.stringMatching(/^mg_/),
  });
});

test("v2 fixture with mismatched generations is reported incomplete", async () => {
  const stateRoot = await copyFixture("state-v2-generation-mismatch");
  const status = await inspectStateMigrationStatus(stateRoot);
  expect(status).toMatchObject({
    status: "incomplete",
    reasonCode: "STATE_MIGRATION_INCOMPLETE",
  });
});

test("v2 fixture with mismatched collection marker generation is reported incomplete", async () => {
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
```

- [ ] **Step 3: Run tests**

```bash
npm run -w @skill-flow/storage test -- state-migration-status.test.ts
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/storage/src/tests/fixtures packages/storage/src/tests/state-migration-status.test.ts packages/core-engine/src/tests/state-migration-service.test.ts
git commit -m "test: add v1 state migration fixtures"
```

### Task 2: Add skill collection materialization fixture

**Files:**

- Create: `packages/storage/src/tests/fixtures/state-v1-virtual-group/manifest.json`
- Create: `packages/storage/src/tests/fixtures/state-v1-virtual-group/lock.json`
- Create: `packages/storage/src/tests/fixtures/state-v1-virtual-group/virtual-groups.json`
- Create: `packages/storage/src/tests/fixtures/state-v1-virtual-group/source/git/source-a/skills/frontend-design/SKILL.md`
- Test: `packages/core-engine/src/tests/state-migration-service.test.ts`

- [ ] **Step 1: Create fixture**

The fixture must represent:

- one original git source
- one leaf under `skills/frontend-design`
- one V1 virtual group containing that leaf by legacy ref
- one legacy restore snapshot containing both the mapped leaf and an unmapped legacy leaf id

- [ ] **Step 2: Add migration assertion**

```ts
test("skill collection fixture preserves confirmed skill content after origin changes", async () => {
  const stateRoot = await copyFixture("state-v1-virtual-group");
  const service = new StateMigrationService({ stateRoot });
  await service.migrate({ to: 2, backup: true });

  await fs.rm(path.join(stateRoot, "source/git/source-a/skills/frontend-design"), {
    recursive: true,
    force: true,
  });

  const collectionSkillPath = path.join(
    stateRoot,
    "source/collection/group-1",
    "member-1",
    "SKILL.md",
  );
  expect(await fs.readFile(collectionSkillPath, "utf8")).toContain("Frontend Design");
});

test("skill collection fixture rewrites restore selections as best effort", async () => {
  const stateRoot = await copyFixture("state-v1-virtual-group");
  const service = new StateMigrationService({ stateRoot });
  await service.migrate({ to: 2, backup: true });

  const collections = await readJsonFile(path.join(stateRoot, "collections.json"), {});
  expect(collections.collections["group-1"].restoreSelections["source-a"]).toMatchObject({
    bestEffort: true,
    selectedLeafIds: expect.arrayContaining(["leaf-a"]),
  });
  expect(collections.collections["group-1"].restoreSnapshots).toBeUndefined();
});

test("skill collection fixture removes unmapped restore selection leaf ids", async () => {
  const stateRoot = await copyFixture("state-v1-virtual-group");
  const service = new StateMigrationService({ stateRoot });
  await service.migrate({ to: 2, backup: true });

  const collections = await readJsonFile(path.join(stateRoot, "collections.json"), {});
  const restoreSelection = collections.collections["group-1"].restoreSelections["source-a"];

  expect(restoreSelection.bestEffort).toBe(true);
  expect(restoreSelection.selectedLeafIds).not.toContain("source-a:missing-legacy-leaf");
  expect(restoreSelection.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "RESTORE_SELECTION_LEAF_UNMAPPED",
      details: expect.objectContaining({
        legacyLeafId: "source-a:missing-legacy-leaf",
      }),
    }),
  );
});
```

- [ ] **Step 3: Run tests**

```bash
npm run -w @skill-flow/core-engine test -- state-migration-service.test.ts
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/storage/src/tests/fixtures/state-v1-virtual-group packages/core-engine/src/tests/state-migration-service.test.ts
git commit -m "test: verify skill collection materialization migration"
```

### Task 3: Add import provider e2e coverage

**Files:**

- Create: `packages/query/src/tests/state-schema-v2-e2e.test.ts`
- Modify: `packages/query/src/tests/import-page-flow.test.ts`

- [ ] **Step 1: Write provider tests**

Cover:

```ts
test.each([
  ["github:anthropics/skills", "skills/frontend-design"],
  ["github:vercel-labs/agent-skills", "skills/frontend-design"],
  ["github:garrytan/gstack", "skills/gstack"],
])("%s imports through preview prepare commit with repoPath selector", async (locator, repoPath) => {
  const preview = await app.previewImportSource(locator);
  const skill = preview.data.skills.find((candidate) => candidate.selector.path === repoPath)!;
  expect(skill.selector).toEqual({ kind: "repoPath", path: repoPath });
  expect(skill.origin.providerSkillId ?? "").not.toBe(skill.uiId);

  const prepared = await app.prepareImportSource(locator);
  const preparation = await app.store.readImportPreparationRecord(prepared.data.preparationId);
  expect(preparation.skillRefs).toContainEqual(expect.objectContaining({ repoPath }));

  const result = await app.commitPreparedImportSource(prepared.data.preparationId, {
    selectedSkills: [{ uiId: skill.uiId, selector: skill.selector }],
    enabledTargets: ["codex"],
  });
  expect(result.data.status).toBe("success");
  expect(result.data.boundLeafIds).toEqual(
    expect.arrayContaining([
      preparation.skillRefs.find((ref) => ref.repoPath === repoPath)!.leafId,
    ]),
  );
});
```

- [ ] **Step 2: Run tests**

```bash
npm run -w @skill-flow/query test -- state-schema-v2-e2e.test.ts import-page-flow.test.ts
```

Expected: pass after import selector implementation.

- [ ] **Step 3: Commit**

```bash
git add packages/query/src/tests/state-schema-v2-e2e.test.ts packages/query/src/tests/import-page-flow.test.ts
git commit -m "test: verify import selector providers"
```

### Task 4: Add desktop bridge fixture coverage

**Files:**

- Modify: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`

- [ ] **Step 1: Add V2 payload assertions**

Assert:

- `commit-import-source` sends `selectedSkills`
- `import-source` fallback sends `selectedSkills`
- legacy mode payload selection sends `selectedSkillIds` only before request send, when selector or capability is unavailable
- new desktop + old CLI retries legacy only after `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2`
- `BRIDGE_REQUEST_INVALID`, `IMPORT_SELECTOR_INVALID`, `IMPORT_SELECTOR_NOT_FOUND`, and `IMPORT_SELECTOR_AMBIGUOUS` do not trigger legacy retry
- old desktop + new CLI still accepts `selectedSkillIds`
- new desktop + new CLI uses `selectedSkills`
- failed import with diagnostics produces inspectable message

- [ ] **Step 2: Run Swift tests**

```bash
cd apps/desktop-mac
swift test
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift
git commit -m "test: verify desktop import v2 bridge payloads"
```

### Task 5: Full verification commands

**Files:**

- No source changes unless failures require fixes.

- [ ] **Step 1: Run TypeScript build**

```bash
npm run build
```

Expected: exit code 0.

- [ ] **Step 2: Run TypeScript tests**

```bash
npm test
```

Expected: exit code 0.

- [ ] **Step 3: Run desktop tests**

```bash
cd apps/desktop-mac
swift test
```

Expected: exit code 0.

- [ ] **Step 4: Run migration dry-run manually**

```bash
SKILL_FLOW_STATE_ROOT=/tmp/skill-flow-v1-fixture skill-flow migrate-state --to v2 --dry-run
```

Expected output includes:

```text
Migration required
manifest.json rewrite
catalog/import-data.json prune
```

- [ ] **Step 5: Run migration apply manually**

```bash
SKILL_FLOW_STATE_ROOT=/tmp/skill-flow-v1-fixture skill-flow migrate-state --to v2
```

Expected output includes:

```text
Migration complete
Backup:
schemaVersion: 2
migrationGeneration:
```

### Task 6: Verify target repair after migration

**Files:**

- Create: `packages/query/src/tests/state-schema-v2-target-repair.test.ts`

- [ ] **Step 1: Add fixture test**

```ts
test("doctor and apply repair target content from v2 lock after migration", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  const app = new SkillFlowApp({ stateRoot });
  await app.migrateState({ to: 2, dryRun: false });

  const targetPath = path.join(targetRoot, "frontend-design", "SKILL.md");
  await fs.writeFile(targetPath, "# Drifted\n", "utf8");

  const doctor = await app.doctor();
  expect(doctor.data.issues).toContainEqual(
    expect.objectContaining({ code: "TARGET_DRIFT_DETECTED" }),
  );

  await app.apply();
  expect(await fs.readFile(targetPath, "utf8")).toContain("Frontend Design");
});

test("repair recalculates target path from current target root", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  const app = new SkillFlowApp({ stateRoot });
  await app.migrateState({ to: 2, dryRun: false });
  await app.setCustomTargetRoot("codex", "/tmp/new-codex-skills");

  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      kind: "relink",
      targetPath: "/tmp/new-codex-skills/frontend-design",
    }),
  );
  expect(repair.data.actions).not.toContainEqual(
    expect.objectContaining({
      targetPath: expect.stringContaining("/tmp/old-codex-skills"),
    }),
  );
});

test("repair blocks unknown target without writing stale target path", async () => {
  const app = await seedMigratedStateWithUnknownTarget();
  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      kind: "blocked",
      target: "missing-agent",
      reason: "Target is not available.",
    }),
  );
});

test("repair marks disabled leaf projection as removed", async () => {
  const app = await seedMigratedStateWithDisabledLeafProjection();
  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      kind: "remove",
      status: "removed",
      leafId: "source-a:skills/frontend-design",
    }),
  );
});

test("repair does not trust stale projection target path or content hash", async () => {
  const app = await seedMigratedStateWithStaleProjection({
    targetPath: "/tmp/old-codex-skills/frontend-design",
    contentHash: "hash-stale",
  });
  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      kind: "relink",
      targetPath: expect.not.stringContaining("/tmp/old-codex-skills"),
      contentHash: expect.not.stringMatching("hash-stale"),
    }),
  );
});

test("collection projection hash comes from materialized snapshot after origin changes", async () => {
  const app = await seedMigratedCollectionFixture();
  await mutateOriginSkillContent(app, "source-a", "leaf-a", "# Updated Origin\n");

  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      sourceId: "group-1",
      contentHash: "hash-copied",
    }),
  );
});
```

- [ ] **Step 2: Run tests**

```bash
npm run -w @skill-flow/query test -- state-schema-v2-target-repair.test.ts
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/query/src/tests/state-schema-v2-target-repair.test.ts
git commit -m "test: verify target repair after state migration"
```

### Task 7: Verify collection origin diagnostics

**Files:**

- Create: `packages/query/src/tests/skill-collection-diagnostics.test.ts`

- [ ] **Step 1: Add diagnostics tests**

```ts
test("collection reports origin hash changed without mutating snapshot", async () => {
  const app = await seedMigratedCollectionFixture();
  await mutateOriginSkillContent(app, "source-a", "leaf-a", "# Updated Origin\n");

  const result = await app.inspectCollection("group-1");
  expect(result.data.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "COLLECTION_ORIGIN_HASH_CHANGED",
      details: expect.objectContaining({
        sourceId: "source-a",
        leafId: "leaf-a",
        repoPath: "skills/frontend-design",
        capturedHash: expect.any(String),
        currentHash: expect.any(String),
      }),
    }),
  );
  expect(await readCollectionSnapshot(app, "group-1", "member-1")).toContain("Frontend Design");
});

test("collection reports origin leaf missing and remains deployable", async () => {
  const app = await seedMigratedCollectionFixture();
  await removeOriginSkill(app, "source-a", "leaf-a");

  const result = await app.inspectCollection("group-1");
  expect(result.data.diagnostics).toContainEqual(
    expect.objectContaining({
      code: "COLLECTION_ORIGIN_LEAF_MISSING",
      details: expect.objectContaining({
        sourceId: "source-a",
        leafId: "leaf-a",
        repoPath: "skills/frontend-design",
      }),
    }),
  );
  const apply = await app.apply();
  expect(apply.ok).toBe(true);
});
```

- [ ] **Step 2: Run tests**

```bash
npm run -w @skill-flow/query test -- skill-collection-diagnostics.test.ts
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add packages/query/src/tests/skill-collection-diagnostics.test.ts
git commit -m "test: verify skill collection origin diagnostics"
```

### Task 8: Documentation and release notes

**Files:**

- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `releases/<version>.md`

- [ ] **Step 1: Update upgrade documentation**

Document:

```text
skill-flow migrate-state --to v2 --dry-run
skill-flow migrate-state --to v2
SKILL_FLOW_STATE_ROOT=/custom/path skill-flow migrate-state --to v2
```

Explain:

- default state root is `~/.skillflow`
- migration creates backup
- cache is pruned and rebuilt
- target directories are not authoritative
- run apply/repair after migration if target directories look stale
- rollback uses `<stateRoot>.backup-YYYYMMDD-HHMMSS`
- after rollback, run `skill-flow doctor --state-schema` or desktop migration status inspection
- cache can be rebuilt after rollback
- do not reconstruct state from target directories

- [ ] **Step 2: Add release note**

Release note must include:

```text
State schema v2 migrates Skill Flow's persisted state under ~/.skillflow.
Legacy state is still readable during the compatibility window.
Run skill-flow migrate-state --to v2 --dry-run before applying migration.
```

- [ ] **Step 3: Commit**

```bash
git add README.md README.zh.md releases
git commit -m "docs: document state schema v2 migration"
```

## Legacy 删除条件

只有满足以下条件后，才删除 legacy 读取：

1. migration CLI 至少发布两个 release 周期。
2. 新桌面 + 新 CLI、旧桌面 + 新 CLI、新桌面 + 旧 CLI 的组合测试都通过。
3. 桌面端稳定发送 V2 draft，并具备 legacy retry。
4. 本地 diagnostics 提供可执行检查命令，例如 `skill-flow doctor --state-schema`。
5. README 和 release note 已标记 legacy 字段弃用版本和预计删除版本。
6. 至少保留一个版本的 rollback 文档。
7. 删除前一版仍保留 warning：`IMPORT_DRAFT_LEGACY_SELECTED_SKILL_IDS`、`STATE_SCHEMA_V1_READ_COMPAT`。

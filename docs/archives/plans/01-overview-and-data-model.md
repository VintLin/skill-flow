# Skill Flow State Schema V2 Overview And Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重新设计 Skill Flow 的持久化数据结构，把早期 `~/.skillflow` state 迁移到可继续演进的 V2 schema。

**Architecture:** `~/.skillflow` 是唯一权威 state root；target 目录只是部署结果，cache 可删除重建。V2 core model 使用稳定 source、leaf、selector、collection 结构；legacy state 只允许由 migration service 读取并转换，应用正常运行态只支持 V2。

**Tech Stack:** TypeScript monorepo、JSON state files、Vitest、Swift desktop bridge、Swift XCTest、Node CLI。

---

## Active Plan Set

本目录当前保留五份活跃/闭环计划：

- `01-overview-and-data-model.md`：总控、术语、数据模型、不变量。
- `02-state-contract-and-migration.md`：TypeScript contract、V2-only runtime、migration CLI。
- `03-import-desktop-verification.md`：import selector、desktop bridge、端到端验证与发布。
- `04-architect-review-and-closure-checklist.md`：架构师闭环审查、P0/P1 验收矩阵。
- `05-v1-authority-public-export-cleanup.md`：V1 authority public export 删除计划与验收证据。

历史草稿位于 `plans/archive/2026-06-04-state-schema-v2-drafts/`，只作追溯材料；实现以本目录五份计划为准。

## Problem Statement

当前 state 经过多轮迭代后存在以下结构性问题：

- `selectedSkillIds` 同时表示 UI id、provider id、archive path、repo path、leaf id。
- import preview、prepare、commit、desktop draft 的选择数据契约不一致。
- `skillIds` 不能表达 leaf 与 repo path 的稳定关系。
- `canonicalRepo`、`cacheKey`、`canonicalLocator` 在不同层混用。
- 早期 virtual group 只保存引用，不能保证确认时的 skill 内容在上游变更后保持不变。
- cache、权威 state、target 写入结果的边界不清晰。

V2 的目标不是为单个 provider 补丁修复，而是建立一套可迁移、可诊断、可回滚的数据结构。

## State Root Boundaries

默认 state root：

```text
~/.skillflow
```

可通过环境变量覆盖：

```text
SKILL_FLOW_STATE_ROOT=/path/to/state
```

权威文件：

```text
~/.skillflow/manifest.json
~/.skillflow/lock.json
~/.skillflow/preferences.json
~/.skillflow/collections.json
```

权威内容目录：

```text
~/.skillflow/source/collection/*
```

可重建缓存：

```text
~/.skillflow/catalog/import-data.json
~/.skillflow/catalog/source-metadata.json
~/.skillflow/catalog/import-preparations.json
~/.skillflow/catalog/import-preparations/*
~/.skillflow/catalog/git/*
```

非权威部署结果：

```text
~/.codex/skills
~/.claude/skills
~/.cursor/skills
其他 target 写入目录
```

桌面端 UserDefaults 只保存 UI 偏好、语言、主题、自定义展示设置，不作为 skill 安装和 import 数据的权威源。

## Unified Terminology

| Concept | V2 Name | Avoid | Definition |
| --- | --- | --- | --- |
| Source identity | `sourceId` | provider id | 本地 state 内 source 的稳定 id。 |
| Canonical source locator | `canonicalLocator` | `canonicalRepo` | 归一化后的 source locator，例如 `github:anthropics/skills`。 |
| Cache key | `cacheKey` | `sourceKey` | cache 索引，不用于权威 identity。 |
| Source selection key | `sourceSelectionKey` | `sourceKey` | `canonicalLocator + requestedPath` 的规范化组合，用于生成 preview `uiId`。 |
| UI selection id | `uiId` | `id`, `leafId` | UI 勾选状态 key，不进入 core commit 解析。 |
| Import selector | `selector` | `selectedSkillIds` | import commit 前用于绑定 prepared leaf 的结构化选择器。 |
| Prepared skill ref | `PreparedSkillRefV2` | cache skill id | preparation cache 内的临时 leaf 引用，只在同一 preparation 生命周期内有效。 |
| Project source draft | `ProjectSourceDraftV2` | `DraftBindingV2`, `binding` | 已安装 source 在 project scope 下尚未 apply 的选择。 |
| Skill collection | `SkillCollectionRecordV2` | virtual group | 实体组合，确认后复制 skill 内容。 |
| Restore selection | `restoreSelections` | `restoreSnapshots` | collection 隐藏原 source 后恢复原 source 选择时使用，不作为部署内容来源。 |
| Materialized snapshot | `snapshot` | provider snapshot | collection member 内复制后的 skill 内容快照。 |
| Member origin | `origin` | preview origin | collection member 的原始 source/leaf 诊断信息。 |
| Local source choice | `sourceChoiceId` | `selectedChoiceId: "origin"` | local import/local scan 的本地选择 id。 |

## V2 Authority Types

这些类型应落在 `packages/domain` 或现有 domain 类型模块中，具体文件按当前仓库模式选择。

```ts
export type SchemaVersionV2 = 2;
export type MigrationGenerationV2 = `mg_${string}`;
export type SourceId = string;
export type SkillLeafId = string;
export type RepoPath = string;

export type DiagnosticV2 = {
  code: string;
  message: string;
  path?: string;
  fieldPath?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export type SourceKindV2 = "git" | "github" | "local" | "collection";

export type SourceManifestRecordV2 = {
  id: SourceId;
  kind: SourceKindV2;
  locator: string;
  canonicalLocator: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SourceBindingV2 = {
  sourceId: SourceId;
  selectionMode: "all" | "selected";
  selectedLeafIds: SkillLeafId[];
  enabledTargets: string[];
};

export type TargetBindingV2 = {
  target: string;
  leafIds: SkillLeafId[];
};

export type ManifestFileV2 = {
  schemaVersion: 2;
  migrationGeneration: MigrationGenerationV2;
  sources: SourceManifestRecordV2[];
  bindings: Record<SourceId, SourceBindingV2>;
  targets: Record<string, TargetBindingV2>;
};
```

```ts
export type SourceRevisionV2 = {
  provider: "git" | "github" | "local" | "collection";
  ref?: string;
  commit?: string;
  archiveEtag?: string;
  capturedAt: string;
};

export type LeafSelectorIndexV2 = {
  providerSkillId?: string;
  legacyAliases: string[];
};

export type LeafRecordV2 = {
  id: SkillLeafId;
  sourceId: SourceId;
  relativePath: RepoPath;
  skillFilePath: string;
  displayName: string;
  contentHash: string;
  selectors: LeafSelectorIndexV2;
  valid: boolean;
  diagnostics: DiagnosticV2[];
};

export type ProjectionRecordV2 = {
  target: string;
  sourceId: SourceId;
  leafId: SkillLeafId;
  targetPath: string;
  contentHash: string;
  status: "active" | "removed" | "blocked";
  updatedAt: string;
};

export type SourceLockRecordV2 = {
  sourceId: SourceId;
  canonicalLocator: string;
  revision: SourceRevisionV2;
  localPath: string;
  leafIds: SkillLeafId[];
};

export type LockFileV2 = {
  schemaVersion: 2;
  migrationGeneration: MigrationGenerationV2;
  sources: Record<SourceId, SourceLockRecordV2>;
  leafInventory: LeafRecordV2[];
  projections: ProjectionRecordV2[];
};
```

```ts
export type ProjectSourceDraftV2 = {
  sourceId: SourceId;
  selectedLeafIds: SkillLeafId[];
  enabledTargets: string[];
  updatedAt: string;
};

export type LocalImportChoiceV2 = {
  sourceChoiceId: string;
  legacyChoiceId?: string;
  label: string;
  locator: string;
  detectedSourcePath: string;
  detectedSkillPath?: RepoPath;
  variant: "single-skill" | "multi-skill" | "source-root";
  selectedSkills: ImportSkillSelectionV2[];
  enabledTargets: string[];
};

export type LocalScanDetectedSkillV2 = {
  leafId: SkillLeafId;
  existingSourceIdHint?: SourceId;
  sourcePath: string;
  skillFilePath: string;
  relativePath: RepoPath;
  displayName: string;
  contentHash: string;
  selector: ImportSkillSelectorV2;
  diagnostics: DiagnosticV2[];
};

export type LocalScanImportChoiceV2 = {
  scanId: string;
  sourceChoiceId: string;
  rootPath: string;
  sourcePath: string;
  variant: "single-source" | "multi-source" | "mixed";
  detectedSkills: LocalScanDetectedSkillV2[];
  selectedSkills: ImportSkillSelectionV2[];
  enabledTargets: string[];
};

export type PreferencesFileV2 = {
  schemaVersion: 2;
  migrationGeneration: MigrationGenerationV2;
  pinnedSourceIds: SourceId[];
  projectSourceDrafts: Record<string, Record<SourceId, ProjectSourceDraftV2>>;
  localImportChoices?: LocalImportChoiceV2[];
  localScanImportChoices?: LocalScanImportChoiceV2[];
};
```

```ts
export type SkillCollectionMemberOriginV2 = {
  sourceId: SourceId;
  leafId: SkillLeafId;
  sourceLocator: string;
  canonicalLocator: string;
  repoPath: RepoPath;
  contentHashAtCapture: string;
  capturedAt: string;
};

export type MaterializedSkillSnapshotV2 = {
  leafId: SkillLeafId;
  materializedPath: string;
  skillFilePath: string;
  relativePath: string;
  contentHash: string;
};

export type SkillCollectionMemberV2 = {
  id: string;
  origin: SkillCollectionMemberOriginV2;
  snapshot: MaterializedSkillSnapshotV2;
  updatePolicy: "frozen";
};

export type SkillCollectionRestoreSelectionV2 = {
  sourceId: SourceId;
  selectedLeafIds: SkillLeafId[];
  bestEffort: boolean;
  diagnostics: DiagnosticV2[];
};

export type SkillCollectionRecordV2 = {
  id: SourceId;
  displayName: string;
  materializedSourceId: SourceId;
  members: SkillCollectionMemberV2[];
  hiddenSourceIds: SourceId[];
  restoreSelections: Record<SourceId, SkillCollectionRestoreSelectionV2>;
  createdAt: string;
  updatedAt: string;
};

export type CollectionsFileV2 = {
  schemaVersion: 2;
  migrationGeneration: MigrationGenerationV2;
  collections: Record<SourceId, SkillCollectionRecordV2>;
};
```

`SkillCollectionRecordV2.id` 是 collection record id，必须等于 `materializedSourceId` 和对应 collection source 的 `sourceId`。保留两个字段是为了让 `collections.json` 的 record key 与 `manifest.sources` 的 materialized source 显式对齐，不允许表达两个不同 source。

## Migration Metadata Types

```ts
export type MigrationMarkerFileV2 = {
  schemaVersion: 2;
  migrationGeneration: MigrationGenerationV2;
  status: "running" | "failed";
  startedAt: string;
  stagingRoot: string;
  backupPath?: string;
  diagnostics: DiagnosticV2[];
};

export type CollectionGenerationMarkerV2 = {
  schemaVersion: 2;
  migrationGeneration: MigrationGenerationV2;
  status: "materialized";
  startedAt: string;
  stagingRoot?: string;
  backupPath?: string;
  collectionId: SourceId;
  materializedSourceId: SourceId;
  diagnostics: DiagnosticV2[];
};
```

`.skillflow-migration.json` 写 `MigrationMarkerFileV2`，位于 state root。每个 `source/collection/<collectionId>/.skillflow-generation.json` 写 `CollectionGenerationMarkerV2`，其 `migrationGeneration` 必须与所有权威文件一致。

## Import Types

```ts
export type ImportSkillSelectorV2 = { kind: "repoPath"; path: RepoPath };

export type ImportPreviewSkillV2 = {
  legacyId?: string;
  uiId: string;
  title: string;
  selector: ImportSkillSelectorV2;
  origin: {
    provider: "github" | "git" | "local" | "archive";
    providerSkillId?: string;
    providerPath?: string;
    archivePath?: string;
    repoPath?: RepoPath;
  };
  diagnostics: DiagnosticV2[];
  legacyAliases: string[];
};

export type ImportSkillSelectionV2 = {
  uiId: string;
  selector: ImportSkillSelectorV2;
};

export type ImportDraftV2 = {
  selectedSkills: ImportSkillSelectionV2[];
  enabledTargets: string[];
};

export type PreparedSkillRefV2 = {
  uiId: string;
  selector: ImportSkillSelectorV2;
  leafId: SkillLeafId;
  repoPath: RepoPath;
  sourceSelectionKey: string;
  contentHash: string;
  legacyAliases: string[];
};

export type ImportPreparationRecordV2 = {
  schemaVersion: 2;
  preparationId: string;
  status: "ready" | "committing" | "committed" | "expired" | "failed";
  sourceLocator: string;
  canonicalLocator: string;
  existingSourceIdHint?: SourceId;
  sourceKind: SourceKindV2;
  requestedPath?: string;
  checkoutPath: string;
  sourceRevision: SourceRevisionV2;
  sourceSelectionKey: string;
  availableTargets: string[];
  skillRefs: PreparedSkillRefV2[];
  currentAttempt?: {
    attemptId: string;
    commitStartedAt: string;
    leaseExpiresAt: string;
  };
  failure?: {
    reasonCode: string;
    failedAt: string;
    retryable: boolean;
    diagnostics: DiagnosticV2[];
  };
  diagnostics: DiagnosticV2[];
  lease: {
    token: string;
    expiresAt: string;
  };
  createdAt: string;
  preparedAt: string;
  expiresAt: string;
  committedAt?: string;
};
```

`PreparedSkillRefV2.leafId` 是 preparation cache 生命周期内的临时 leaf id。`existingSourceIdHint` 只能表示 prepare 时发现的已安装 source hint；commit 必须重新从 `manifest.json` 验证 source 是否仍存在、kind 是否匹配、locator 是否一致。preparation cache 不得 mint 或持久化权威 `sourceId`。commit 必须从同一 preparation record 绑定 selector；如果该 leaf 不存在或 preparation epoch 已失效，返回 `IMPORT_PREPARATION_STALE`。失败时保留 `ImportPreparationRecordV2`，用 `failure` 和 `diagnostics` 支持 retry、toast diagnostics 和 desktop 状态恢复；清理只能在过期后由 cache GC 执行。

## Source Update, Repair, And Direct Add Types

```ts
export type SourceUpdateDiffV2 = {
  sourceId: SourceId;
  previous: {
    canonicalLocator: string;
    revision: SourceRevisionV2;
    leafIds: SkillLeafId[];
  };
  current: {
    canonicalLocator: string;
    revision: SourceRevisionV2;
    leafIds: SkillLeafId[];
  };
  moved: Array<{ leafId: SkillLeafId; previousPath: RepoPath; currentPath: RepoPath }>;
  changed: Array<{ leafId: SkillLeafId; previousHash: string; currentHash: string }>;
  added: LeafRecordV2[];
  removed: LeafRecordV2[];
  invalidated: Array<{ leafId: SkillLeafId; diagnostics: DiagnosticV2[] }>;
};

export type SourceUpdateResultV2 = {
  status: "updated" | "unchanged" | "failed";
  sourceId: SourceId;
  diff?: SourceUpdateDiffV2;
  diagnostics: DiagnosticV2[];
};

export type RepairTargetsResultV2 = {
  status: "repaired" | "unchanged" | "blocked" | "failed";
  actions: Array<{
    kind: "write" | "remove" | "relink" | "block";
    target: string;
    sourceId: SourceId;
    leafId?: SkillLeafId;
    previous?: { targetPath?: string; contentHash?: string; status?: ProjectionRecordV2["status"] };
    current?: { targetPath?: string; contentHash?: string; status?: ProjectionRecordV2["status"] };
    diagnostics: DiagnosticV2[];
  }>;
  diagnostics: DiagnosticV2[];
};

export type AddSourceDraftOptionsV2 = {
  locator: string;
  requestedPath?: string;
  targetNames: string[];
  skillNames?: string[];
};

export type TargetDetectionV2 = {
  target: string;
  available: boolean;
  rootPath?: string;
  reasonCode?: string;
  diagnostics: DiagnosticV2[];
};

export type AddSourcePreparationV2 = {
  preparationId: string;
  canonicalLocator: string;
  sourceKind: SourceKindV2;
  checkoutPath: string;
  sourceRevision: SourceRevisionV2;
  selectedSkills: ImportSkillSelectionV2[];
  detectedTargets: TargetDetectionV2[];
  diagnostics: DiagnosticV2[];
};
```

Direct add 的 `skillNames` 是输入 hint。它们必须先解析成 `ImportSkillSelectorV2` 或 prepared leaf id，再进入 binding；不得复用 `selectedSkillIds` 或把 skill name 当作权威 leaf id。

## Cache And View-Model Contracts

这些文件是可重建 cache 或 UI view-model，不参与 source identity 决策。

```ts
export type SourceMetadataCacheV2 = {
  schemaVersion: 2;
  entries: Record<string, {
    cacheKey: string;
    canonicalLocator: string;
    provider: "github" | "git" | "local" | "archive";
    providerMetadata: Record<string, unknown>;
    fetchedAt: string;
    expiresAt?: string;
    diagnostics: DiagnosticV2[];
  }>;
};

export type ImportDataCacheV2 = {
  schemaVersion: 2;
  entries: Record<string, {
    cacheKey: string;
    canonicalLocator: string;
    requestedPath?: string;
    sourceSelectionKey: string;
    skills: ImportPreviewSkillV2[];
    discoveredAt: string;
    diagnostics: DiagnosticV2[];
  }>;
};

export type ImportDiscoveryCandidateV2 = {
  candidateId: string;
  canonicalLocator: string;
  requestedPath?: string;
  relativePath: RepoPath;
  selector: ImportSkillSelectorV2;
  displayName: string;
  diagnostics: DiagnosticV2[];
};

export type ImportDiscoveryGroupCandidateV2 = {
  groupId: string;
  canonicalLocator: string;
  candidates: ImportDiscoveryCandidateV2[];
  enabledTargets: string[];
  diagnostics: DiagnosticV2[];
};
```

归一化规则：cache 层允许读取 provider 返回的 `canonicalRepo`，但写入 cache contract 前必须转成 `canonicalLocator`；provider metadata 不命名为 snapshot；cache 不能生成或持久化 `sourceId`，只能携带 `canonicalLocator`、`sourceSelectionKey`、`uiId` 和 diagnostics。

## Invariants

1. 所有权威 JSON 文件必须写 `schemaVersion: 2`。
2. `manifest.json`、`lock.json`、`preferences.json`、`collections.json` 必须写同一个 `migrationGeneration`。
3. 每个 `source/collection/<collectionId>/.skillflow-generation.json` 必须写同一个 `migrationGeneration`。
4. `collections.json` 始终存在；没有 collection 时写空 `collections: {}`。
5. `sourceId` 在 `manifest.sources` 内唯一，`leafId` 在 `lock.leafInventory` 内唯一。
6. 每个 `LeafRecordV2.sourceId` 必须存在于 `manifest.sources`。
7. 每个 `ProjectionRecordV2.sourceId + leafId` 必须能在 `manifest.sources` 和 `lock.leafInventory` 中找到。
8. 每个 `SourceBindingV2.sourceId` 必须存在于 `manifest.sources`。
9. `SourceBindingV2.selectedLeafIds` 和 `TargetBindingV2.leafIds` 必须是对应 source selection 的子集；enabled target 不能引用 source 未选中的 leaf。
10. collection `id`、`materializedSourceId`、collection source 的 `sourceId` 三者必须相等，且该 source `kind` 必须为 `"collection"`。
11. collection member `snapshot.relativePath` 必须是 materialized source 内的相对路径，不能复用 origin repo path 作为部署相对路径。
12. `cacheKey` 不进入权威 identity。
13. `canonicalLocator` 不包含 preview provider、archive fallback、checkout mode。
14. `uiId` 只用于 UI selection，不用于 commit core 解析。
15. `selector` 第一阶段只允许 `{ kind: "repoPath"; path }`，匹配 `LeafRecordV2.relativePath`。
16. provider 原始 id 只进入 `origin` 和 diagnostics。
17. `selectedSkillIds` 只允许出现在 bridge/query compat payload，例如 `BridgeImportDraftCompat`，不得进入 V2 权威 state。
18. `sourceChoiceId` 是 local import/local scan 的 V2 选择 id；`selectedChoiceId: "origin"` 只在 legacy parser 出现。
19. collection deploy/apply 读取 materialized snapshot，不读取 origin source 内容。
20. `restoreSelections` 保存原 source 的 leaf id，不保存 collection leaf id。
21. target desired projection 必须由 `manifest.bindings`、当前 target definition、`lock.leafInventory`、collection snapshot 重新计算。
22. unknown target 产生 `status: "blocked"`，不得写入旧 target path。
23. disabled leaf 的旧 projection 应变为 `removed`。

## Execution Order

- [ ] **Step 1: Implement data model and terminology first**

Read this document and implement only the shared V2 type names and invariants in the domain/storage packages.

Expected commit:

```bash
git commit -m "feat: add state schema v2 data model"
```

- [ ] **Step 2: Implement state contract and migration**

Execute `02-state-contract-and-migration.md`.

- [ ] **Step 3: Implement import, desktop, verification**

Execute `03-import-desktop-verification.md`.

Only start the next plan after the previous plan has working tests.

## Self-Review Commands

```bash
rg -n "sourceKey|DraftBindingV2|selectedChoiceId: \"origin\"|restoreSnapshots" packages apps
rg -n "schemaVersion|migrationGeneration|SkillCollectionRecordV2|ImportSkillSelectorV2" packages
```

Expected:

- legacy names only appear in migration, compat parser, or tests explicitly covering legacy behavior.
- V2 core model uses the names defined in this document.

# V2 数据结构优化意见

> 配合 `00-current-execution-plan.md` 使用。本文件只做"清理目标 + 命名映射 + 数据结构优化"三件事，**不动实现步骤**。实施步骤请在主 plan 的 Task 5 / Task 6 流程中追加。

## 1. 背景

`00-current-execution-plan.md` 已经把 V2 兼容代码的债务分类成 `allowed-legacy` / `must-remove` / `contract-change` / `test-contract` / `rename-only`。本文件把这些债务落到**字段、类型、文件、模块**层级，并补充主 plan 没列出的几处歧义源。

**核心目标**：让"v2 schema"成为**唯一**的真源，runtime / query / bridge / desktop / CLI 不再需要 V1 形状的影子类型、不再需要 V2→V1 的投影层、不再需要 `V2` 后缀来区分"新旧"。

## 2. 命名清理原则

清理完成后，**所有公开类型、文件、类、函数、变量都不应再带 `V2` 后缀**。原因：

- `V2` 是迁移期的版本号标记，迁移完成后它就是"现在的"。继续带后缀会让阅读者误以为"V1 和 V2 还在并行"，进而继续走"双轨"思维。
- 真正的 V2 真源概念（schema 版本、migration generation、migration 工具）已经通过字段名（`schemaVersion`、`migrationGeneration`、`MigrationGeneration`）充分表达，不需要在类型/类名上再标一次。

**保留 `V2` 字样的合法位置**：

- `MigrationMarkerFile.version = "1.3.11"` —— 这是版本字符串
- `state-migration-service.ts` / `legacy-virtual-group.ts` —— 名字里的 "migration" / "legacy" 表达的是"V1→V2 迁移的输入边界"，本身合理
- `migrate-state --to v2` CLI 子命令 —— 这是给用户的历史迁移命令
- 历史 plan/archive 目录命名 —— 归档保留

**会被去掉后缀的典型样本**：

| 清理前（带 `V2`） | 清理后（不带后缀） |
| --- | --- |
| `SourceKindV2` | `SourceKind`（V1 `SourceKind` 直接删） |
| `ManifestFileV2` | `ManifestFile` |
| `LockFileV2` | `LockFile` |
| `StateStoreV2` | `StateStore` |
| `SourceAuthorityServiceV2` | `SourceAuthorityService` |
| `importPreparationServiceV2.ts` 文件 | `importPreparationService.ts` |

## 3. 完整重命名映射

### 3.1 核心 authority 文件类型

| 当前名（带 V2 / V1 形状） | 清理后名 | 备注 |
| --- | --- | --- |
| `ManifestFileV2` | `ManifestFile` | V1 `Manifest` 删（V1 schema 不再被任何 runtime 读写） |
| `LockFileV2` | `LockFile` | V1 `LockFile` 删 |
| `PreferencesFileV2` | `PreferencesFile` | V1 `SharedPreferences` 删 |
| `CollectionsFileV2` | `CollectionsFile` | |
| `SourceManifestRecordV2` | `SourceManifestRecord` | V1 `SourceManifestRecord` 删 |
| `SourceLockRecordV2` | `SourceLockRecord` | V1 `SourceLockRecord` 删 |
| `SourceBindingV2` | `SourceBinding` | V1 `SourceBinding` 删 |
| `LeafRecordV2` | `LeafRecord` | V1 `LeafRecord` 删 |
| `ProjectionRecordV2` | `ProjectionRecord` | V1 `ProjectionRecord` 删；`mode` 字段语义重做（见 §4.2） |
| `DeploymentRecord` | （删除） | V2 `ProjectionRecord` 已包含部署信息，不再需要独立 Deployment 类型 |
| `SourceUpdateResultV2` | `SourceUpdateResult` | V1 `SourceUpdateResult` 删 |
| `SourceUpdateDiffV2` | `SourceUpdateDiff` | V1 `SourceUpdateDiff` 删 |

### 3.2 Kind / Selector / ID 别名

| 当前名 | 清理后名 | 备注 |
| --- | --- | --- |
| `SourceKindV2` | `SourceKind` | V1 `SourceKind` 删；`github` 保留为独立 kind |
| `ImportSkillSelectorV2` | `ImportSkillSelector` | |
| `ImportSkillSelectionV2` | `ImportSkillSelection` | |
| `LeafSelectorIndexV2` | `LeafSelectorIndex` | `legacyAliases` 字段删（见 §4.5） |
| `SourceRevisionV2` | `SourceRevision` | 改为 discriminated union（见 §5.6） |
| `SourceIdV2` | `SourceId` | |
| `SkillLeafIdV2` | `SkillLeafId` | |
| `RepoPathV2` | `RepoPath` | |
| `SchemaVersionV2` | （删除） | 用字面量 `2` / union 表达足够 |
| `MigrationGenerationV2` | `MigrationGeneration` | |

### 3.3 Import / Preparation 流程类型

| 当前名 | 清理后名 | 备注 |
| --- | --- | --- |
| `ImportDraftV2` | `ImportDraft` | V1 `ImportDraft` 删 |
| `ImportPreviewSkillV2` | `ImportPreviewSkill` | V1 `ImportPreviewSkill` 删；`legacyId` / `legacyAliases` 删（见 §4.5） |
| `ImportPreparationRecordV2` | `ImportPreparationRecord` | V1 `ImportPreparationRecord` 删 |
| `PreparedSkillRefV2` | `PreparedSkillRef` | `legacyAliases` 删 |
| `LocalImportChoiceV2` | `LocalImportChoice` | V1 `LocalImportChoice` 删；`legacyChoiceId` 删（见 §4.5） |
| `LocalScanDetectedSkillV2` | `LocalScanDetectedSkill` | |
| `LocalScanImportChoiceV2` | `LocalScanImportChoice` | V1 `LocalScanImportChoice` 删 |
| `AddSourceDraftOptionsV2` | `AddSourceDraftOptions` | |
| `AddSourcePreparationV2` | `AddSourcePreparation` | |
| `TargetDetectionV2` | `TargetDetection` | |
| `ImportDiscoveryCandidateV2` | `ImportDiscoveryCandidate` | |
| `ImportDiscoveryGroupCandidateV2` | `ImportDiscoveryGroupCandidate` | |

### 3.4 Collection / Materialize 类型

| 当前名 | 清理后名 |
| --- | --- |
| `SkillCollectionMemberOriginV2` | `SkillCollectionMemberOrigin` |
| `SkillCollectionMemberV2` | `SkillCollectionMember` |
| `SkillCollectionRecordV2` | `SkillCollectionRecord` |
| `SkillCollectionRestoreSelectionV2` | `SkillCollectionRestoreSelection` |
| `MaterializedSkillSnapshotV2` | `MaterializedSkillSnapshot` |
| `CollectionGenerationMarkerV2` | `CollectionGenerationMarker` |
| `MigrationMarkerFileV2` | `MigrationMarkerFile` |

### 3.5 Cache / Metadata 类型

| 当前名 | 清理后名 | 备注 |
| --- | --- | --- |
| `SourceMetadataCacheEntryV2` | `SourceMetadataCacheEntry` | V1 `SourceMetadataCacheEntry` 删 |
| `SourceMetadataCacheV2` | `SourceMetadataCache` | V1 `SourceMetadataCache` 删 |
| `ImportDataCacheV2` | `ImportDataCache` | V1 `ImportDataCache` 删；`searches`/`repos`/`recommendations` 内嵌的 V1 形状类型（`ImportSearchSnapshot` / `RepoMetadataCacheEntry` / `ImportRecommendationFeed`）保留不带后缀 |
| `UnifiedSourceSnapshotCacheEntry` | （保留） | 已经干净 |

### 3.6 Diagnostic / 错误 / 状态

| 当前名 | 清理后名 |
| --- | --- |
| `DiagnosticV2` | `Diagnostic` |
| `StateStoreV2Error` | `StateStoreError` |
| `StateStoreV2ErrorCode` | `StateStoreErrorCode` |
| `StateStoreV2State` | `StateStoreState` |
| `RepairTargetsResultV2` | `RepairTargetsResult` |

### 3.7 类 / 函数 / 文件 / 变量

| 当前名 | 清理后名 |
| --- | --- |
| `class StateStoreV2` | `class StateStore` |
| `writeManifestV2` / `writeLockV2` / `writePreferencesV2` / `writeCollectionsV2` | `writeManifest` / `writeLock` / `writePreferences` / `writeCollections` |
| `class SourceAuthorityServiceV2` | `class SourceAuthorityService` |
| `class ImportPreparationServiceV2` | `class ImportPreparationService` |
| `class DeploymentPlannerV2` | `class DeploymentPlanner` |
| `class DeploymentApplierV2` | `class DeploymentApplier` |
| `PreparedSourceCheckoutV2` | `PreparedSourceCheckout` |
| `SourceSnapshotV2` | `SourceSnapshot` |
| `getActiveProjectionsV2` | `getActiveProjections` |
| `LockFileV2View` | （删除类型） |
| `StateV2AuthorityView` | （删除类型） |
| `StateV2AuthorityFiles` | （删除类型） |
| `ProjectionStatusView` | （删除类型） |
| `projectStateV2ToView` / `projectManifestV2ToView` / `projectSourceBindingV2ToView` / `projectLockFileV2ToView` / `projectPreferencesV2ToView` / `projectSourceKindV2ToView` 等 | （删除整层 `state-v2-view.ts`） |
| 文件 `state-schema-v2.ts` | `state-schema.ts` |
| 文件 `state-store-v2.ts` | `state-store.ts` |
| 文件 `source-authority-service-v2.ts` | `source-authority-service.ts` |
| 文件 `import-preparation-service-v2.ts` | `import-preparation-service.ts` |
| 文件 `deployment-planner-v2.ts` | `deployment-planner.ts` |
| 文件 `deployment-applier-v2.ts` | `deployment-applier.ts` |
| 文件 `domain/projection-v2.ts` | `domain/projection.ts` |
| 文件 `query/state-v2-view.ts` | （删除） |
| 测试文件 `*-v2.test.ts` 中"V2"只指 V1→V2 迁移语义的部分 | 改名去掉 `-v2`；纯迁移测试保留在 `state-migration-service.test.ts` |

### 3.8 路径 / 目录常量

| 当前 | 清理后 |
| --- | --- |
| `RuntimeStore.getSourceRoot(kind: SourceKind)` 不识别 `github` / `collection` | 改签名接受 `SourceKind`（已是 V2 集合），`getSourceRoot("github")` 返回 `stateRoot/source/github/`，`getSourceRoot("collection")` 不存在（collection 不创建 source checkout 目录） |
| `RuntimeStore.sourceRoot` getter 硬编码 `"git"` | 改为派生或显式错误：collection 没有 source root |
| `SourceCheckoutKind = Extract<SourceKind, "local" \| "git" \| "clawhub">` | 改 `SourceKind`（V2 集合）的子集，**包含 `github`**，不含 `collection` |

## 4. 数据结构冗余与歧义（按严重度）

### 4.1 P0 — 歧义源 / 真源不唯一

**P0-1：`SourceKind` 集合不一致**

```ts
// 当前：types.ts:15
export type SourceKind   = "local" | "git" | "clawhub" | "collection";
// 当前：types.ts:847
export type SourceKindV2 = "git" | "github" | "local" | "clawhub" | "collection";
```

V2 多了 `github`。导致：
- `RuntimeStore.getSourceRoot(kind: SourceKind)`（`storage/src/runtime-store.ts:42`）拿到 `github` 时拼路径会落到 `stateRoot/source/github/`，但 `RuntimeStore.sourceRoot` getter 写死 `"git"`，两套路径语义不一致
- `SourceCheckoutKind = Extract<SourceKind, "local" | "git" | "clawhub">`（`source-checkout-service.ts:32`）裁掉了 `collection`，但 v2 集合里 `collection` 是真存在的 kind

**修复**：删 V1 `SourceKind`，统一 `SourceKind`（V2 集合）。同时让 `RuntimeStore` 接受 `SourceKind`，并明确 `collection` 不创建 `stateRoot/source/collection/` 目录。

---

**P0-2：`projection-ledger.ts` 在 V2 数据上读 V1 的 `mode` 字段——是潜在 bug**

```ts
// core-engine/src/services/projection-ledger.ts:8
export function managedProjections(lockFile: Pick<LockFile, "projections">): ProjectionRecord[] {
  return (lockFile.projections ?? []).filter((projection) => projection.mode === "managed");
}
```

V2 的 `ProjectionRecord` 没有 `mode` 字段。`query/runtime.ts:5694` 也调 `managedProjections(lockFile).map(...)`。一旦 V2 真源喂进来，filter 永远返回空数组——"managed"投影全丢。

**修复**：
- 删 `ProjectionRecord.mode`
- `managedProjections(lockFile)` 改为对 V2 真源直接读 `projections` 数组（不按 mode 过滤），由上游 service 在生成 projection 时通过 `importMode` 决定来源（"managed" vs "bootstrap-detected"）—— 这个区分在 `SourceLockRecord.importMode` 已存在，不要在 projection 里再开一条平行的"mode"维度

---

**P0-3：V1/V2 类型成对存在，shadow 大量存在**

types.ts 里至少 16 对 V1/V2 类型并存（详见 §3 表格）。消费方任意使用 V1 类型，就意味着"投影成 V1"是 V2 真源的官方下游形态。`config-coordinator.ts` / `doctor-service.ts` / `inventory-service.ts` / `runtime.ts:5547-5876` / `projection-ledger.ts` / `source-checkout-service.ts` / `source-types.ts` 全在用 V1 形状签名。

**修复**：
1. 给所有 V1 类型标 `@deprecated`，附带"用 §3 表格里对应 V2 类型"提示
2. 走几轮 PR，把 §3 表格里"V1 类型删"标注的全部 consumer 改完
3. 当 §3 表格里所有"删"项都清零后，删 V1 类型
4. `state-v2-view.ts` 整层投影在 V1 类型删完时一起删（见 P0-4）

---

**P0-4：`state-v2-view.ts` 投影时硬写 `schemaVersion: 1`——schemaVersion 不再是真源**

```ts
// state-v2-view.ts:63, 108, 123
schemaVersion: 1,   // projectManifestV2ToView / projectLockFileV2ToView / projectPreferencesV2ToView
```

任何看 `view.manifest.schemaVersion` 的人都会以为这还是 v1 状态。审计/日志/迁移检查都会被骗。

**修复**：直接删 `state-v2-view.ts` 整层（连同 §3.7 列出的 `project*V2ToView` 全部函数），让 query/runtime/doctor 直接消费 V2 类型。当 V1 类型全删时这层自然消失。

---

### 4.2 P1 — 字段语义重叠 / 补丁字段

**P1-1：`legacyId` / `legacyAliases` / `legacyChoiceId` 仍混在 V2 类型里**

```ts
// types.ts:1076 (ImportPreviewSkill — 清理后名)
{
  legacyId: string;        // 强制，V2 时期历史
  uiId: string;            // 强制，V2 选择键
  legacyAliases: string[]; // 跟 LeafSelector.legacyAliases 重叠
}

// types.ts:PreparedSkillRef — 清理后名
{
  ...
  legacyAliases: string[]; // 又一份
}

// types.ts:LocalImportChoice — 清理后名
{
  sourceChoiceId: string;
  legacyChoiceId?: string; // 又是
  ...
}
```

这些是 V1 时期为"老 id 兼容"打的补丁。V2 已有结构化选择器（`ImportSkillSelector = { kind: "repoPath"; path }`）和 `uiId`，不再需要这层。

**修复**：
- `uiId` 保留（V2 对外选择键）
- `legacyId` 删（V1 时期的 id 字段，由 uiId 替代）
- `legacyAliases` 删（`LeafSelector.providerSkillId` + `path` 已足够定位；alias 仅在 migration boundary 内部使用，不进 V2 真源）
- `legacyChoiceId` 删（`LocalImportChoice.sourceChoiceId` 已足够）
- migration 边界需要保留时，把这些字段放到 `state-migration-service.ts` 的内部 legacy 类型里（不入 V2 真源）

---

**P1-2：`ImportPreviewSkill` vs `ImportPreviewSkillV2` 字段可选性不一致**

```ts
// V1 形状
{ id: string; legacyId?: string; uiId?: string; ... }
// V2 形状
{ legacyId: string; uiId: string; ... }
```

清理后只剩 V2 形状，问题消失。

---

**P1-3：`LeafRecord.displayName` 跟 `title` 重叠**

```ts
// types.ts:LeafRecord（清理后名）
{
  ...
  title: string;
  displayName: string;  // 迁移时直接 `displayName: title`
  ...
}
```

迁移代码（`state-migration-service.ts:744`）就是 `displayName: title`，证据表明这是冗余。`projectLeafV2ToView`（state-v2-view.ts:230）把 `displayName` 映射回 V1 的 `name`。

**修复**：删 `displayName`，统一 `title`。`runtime.ts:2234` 用 `displayName` 的地方同步改。

---

**P1-4：`selectedSkillPaths`（V1）跟 `ImportSkillSelection`（V2）双轨**

```ts
// types.ts:LocalImportChoice（V1 形状）
{ ...; selectedSkillPaths: string[]; }
// types.ts:LocalImportChoice（V2 形状 — 清理后名）
{ ...; selectedSkills: ImportSkillSelection[]; }
```

`selectedSkillPaths: string[]` 是 v1 时期为"按 path 选"打的补丁，path 模糊可能重名。V2 已经有结构化选择器。

**修复**：V1 形状的 `selectedSkillPaths` 随 V1 `LocalImportChoice` 一起删。

---

**P1-5：`LockFileV2View` 是 V1 形状 + 一个 V2 字段的混合体**

```ts
// state-v2-view.ts:40
export type LockFileV2View = LockFile & {
  readonly projectionViews: readonly ProjectionStatusView[];
};
// state-v2-view.ts:104-117
return {
  ...
  projections: DeploymentRecord[],          // V1 形状
  projectionViews: ProjectionStatusView[],  // V2 形状
  deployments: DeploymentRecord[],          // V1 形状
};
```

`view.projections` 里全是 `mode: "managed"`（state-v2-view.ts:254），是 V1 语义包袱。

**修复**：随 V1 `ProjectionRecord` / `DeploymentRecord` 删除，`LockFileV2View` 消失，`view.projections` / `view.deployments` 一起消失，只留 `projectionViews`（或重命名 `projections`，让 view 就是 V2 形状）。

---

### 4.3 P2 — 局部可优化

**P2-1：`ImportPreparationCache.locatorIndex` 是冗余二级索引**

```ts
// types.ts:ImportPreparationCache
{
  records: Record<string, ImportPreparationRecord>;
  locatorIndex: Record<string, string>;  // locator → record.id
}
```

`ImportPreparationCacheStore` 每次写都维护 `locatorIndex[record.cacheKey ?? record.locator] = record.id`，但 `pruneImportPreparationCache` 又把过期/非 committing 的删掉。
**真源就是 `records`**——`locatorIndex` 是为 O(1) 查找打的补丁。

**修复**：保留 `records`，在 `findByLocator` 时用 `Map.values().find()`，或建一个 `byLocator` 的纯派生 `Map`，**不持久化到 JSON**。`StateStore` 已经是这个范式（所有真源在文件里，索引在内存里现算）。

---

**P2-2：`SourceRevision` 应该改为 discriminated union**

```ts
// types.ts:SourceRevision（清理后名）
{
  provider: "git" | "github" | "local" | "clawhub" | "collection";
  ref?: string;
  commit?: string;
  archiveEtag?: string;  // 只对 git/github 适用
  capturedAt: string;
}
```

`local` / `clawhub` / `collection` 用不到 `archiveEtag`；`collection` 甚至连 `ref/commit` 都不该有（它是冻结快照）。

**修复**：
```ts
export type SourceRevision =
  | { provider: "git" | "github"; ref?: string; commit?: string; archiveEtag?: string; capturedAt: string; }
  | { provider: "local" | "clawhub"; capturedAt: string; }
  | { provider: "collection"; capturedAt: string; };
```

`collection` 这个分支甚至可以独立成 `CollectionSnapshotRef`，由 `SkillCollectionRecord` 直接持有，跳过 `SourceRevision` 这一层。

---

**P2-3：`LeafRecord.absolutePath` vs `skillFilePath`——容易歧义**

```ts
{
  absolutePath: string;   // skill 目录绝对路径
  skillFilePath: string;  // SKILL.md 绝对路径
}
```

读代码的人每个调用点都要确认一次。

**修复**：保留 `absolutePath`（目录），删 `skillFilePath` 改用 `absolutePath + "SKILL.md"` 派生。或加 JSDoc 强制说明。

---

**P2-4：`ImportPreparationRecord.lease` 跟顶层 `status` 重复**

```ts
{
  status: "ready" | "committing" | "committed" | "failed" | "expired";
  lease: {
    token: string;
    expiresAt: string;
    state: "ready" | "committing" | "committed" | "expired";
  };
  ...
}
```

`status` 和 `lease.state` 是同样的字符串集合。`expiresAt` 跟 `lease.expiresAt` 也重叠。

**修复**：`status` 是对外状态；`lease` 是租约机制（涉及 `token`）。保留，但 `lease.state` 应该跟 `status` 强相关约束（`lease.state === status`），或删 `lease.state`，让 `status` 成为唯一状态字段。

---

## 5. 实施路线

按依赖关系排（每一步都依赖前一步的类型稳定）：

1. **统一 `SourceKind`**（P0-1）——删 V1 `SourceKind`，全部用 V2 集合。同步修 `RuntimeStore.getSourceRoot` / `SourceCheckoutKind`
2. **修 `projection-ledger.ts` 跟 `mode` 字段脱钩**（P0-2）——删 `ProjectionRecord.mode`，改 ledger / runtime 不再按 mode 过滤
3. **V1 类型标 `@deprecated`**（P0-3 起点）——给 types.ts 里 16 对 V1/V2 类型的 V1 一侧加 `@deprecated`，CI 加 lint
4. **清理 `legacyId` / `legacyAliases` / `legacyChoiceId`**（P1-1）——先从 `ImportPreviewSkill` / `PreparedSkillRef` / `LocalImportChoice` 删字段；migration 边界需要的放 `state-migration-service.ts` 内部类型
5. **删冗余字段**（P1-3 / P2-1 / P2-3 / P2-4）——`LeafRecord.displayName`、`ImportPreparationCache.locatorIndex`、`LeafRecord.skillFilePath`、`ImportPreparationRecord.lease.state`
6. **`SourceRevision` 改 discriminated union**（P2-2）
7. **删 V1 类型 + 删 `state-v2-view.ts` 整层**（P0-3 / P0-4 终点）——`config-coordinator` / `doctor-service` / `inventory-service` / `runtime` / `source-checkout-service` / `source-types` 全部迁到 V2 类型；view 投影层删除
8. **最终命名清理**（§3 表格）——`V2` 后缀全清，文件名 / 类名 / 函数名按 §3.7 / §3.8 表重命名

## 6. 验收标准

按以下清单逐项确认，全部通过才算"v2 唯一真源"目标达成：

- [ ] `types.ts` 不存在任何带 `V2` 后缀的公开类型
- [ ] `types.ts` 不存在 V1 形状的 `Manifest` / `LockFile` / `SharedPreferences` / `SourceManifestRecord` / `SourceLockRecord` / `SourceBinding` / `LeafRecord` / `ProjectionRecord` / `DeploymentRecord` / `SourceUpdateResult` / `SourceUpdateDiff` / `ImportDraft` / `ImportPreviewSkill` / `ImportPreparationRecord` / `LocalImportChoice` / `LocalScanImportChoice` / `SourceMetadataCache` / `ImportDataCache`
- [ ] `SourceKind` 类型定义等于当前 `SourceKindV2`
- [ ] `RuntimeStore.getSourceRoot` 接受 `SourceKind`（V2 集合），对 `collection` 显式抛错或返回 `undefined`
- [ ] `state-v2-view.ts` 文件不存在
- [ ] `query/runtime.ts` / `query/config-coordinator.ts` / `core-engine/services/doctor-service.ts` / `core-engine/services/inventory-service.ts` / `core-engine/services/projection-ledger.ts` / `core-engine/services/source-checkout-service.ts` / `core-engine/services/source-types.ts` 全部使用 V2 类型签名
- [ ] `importPreparationServiceV2.ts` / `sourceAuthorityServiceV2.ts` / `deploymentPlannerV2.ts` / `deploymentApplierV2.ts` / `stateStoreV2.ts` / `stateSchemaV2.ts` 文件名不存在（按 §3.7 重命名）
- [ ] `projectionLedger.managedProjections` 不再依赖 `mode` 字段
- [ ] `LeafRecord` 不包含 `displayName` 字段
- [ ] `ImportPreviewSkill` / `PreparedSkillRef` / `LocalImportChoice` 不包含 `legacyId` / `legacyAliases` / `legacyChoiceId` 字段
- [ ] `ImportPreparationCache` 不包含 `locatorIndex` 字段
- [ ] `SourceRevision` 是 discriminated union
- [ ] `npm run build` 通过
- [ ] `npm test` 通过
- [ ] `cd apps/desktop-mac && swift test` 通过

## 7. 与主 plan 的衔接

主 plan 的 Task 5 Step 1 "Remove fallback reads outside migration boundary" 列表中已识别本文件 P0-2 / P0-3 / P0-4 三条，本文件 P0-1 与 §4.2 / §4.3 全部为补充。

实施时建议：
- 把本文件 §3 表格作为主 plan 的"命名映射附录"引用
- 把本文件 §5 路线作为主 plan Task 5 的子步骤拆分依据
- 本文件 §6 验收标准作为主 plan Task 6 Final Verification 的额外检查项

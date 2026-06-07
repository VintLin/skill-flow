# V2 Authority Structure 状态评估（Task 5A 闭环检验）

> 配合 `00-current-execution-plan.md` 和 `01-data-structure-optimization-recommendations.md` 使用。
>
> 本文件只做静态调研，**不动实现**。结论用于给主 plan 增补条目。

## 结论

**Task 5A 当前计划不足以闭环 P0 authority 结构问题**。`state-v2-view.ts` 整层投影 + 16 对 V1/V2 shadow 类型 + desktop 端 V1/V2 协议版本分流 = 三个独立的"P0 真源不唯一"源头未列入 plan。

主要发现：

- 现状下 `query/runtime.ts` 有 50+ 处 import V1 形状类型，`state-v2-view.ts` 的 10 个投影函数是被消费的中心节点。删投影层 = 改 50+ 处方法签名。
- `ProjectionRecord.mode` 字段不只是 plan 已识别的 ledger 残留，**6 处普通 runtime 路径直接读** `projection.mode === "managed"|"bootstrap-imported"`（`runtime.ts:5564, 5619, 5653, 5709, 5892, 5932`），V2 实体已无 `mode` 字段。
- Desktop 端 `MainViewModel.swift` 还在用 `previewVersion == 2` 做 V1/V2 协议分流（line 3036-3052），5 处 Swift struct 仍持 V1 `selectedSkillPaths: [String]` 字段。
- `core-engine/src/services/workflow-service.ts`（V1）整文件死代码——无任何 runtime 路径 import 它。
- P1 字段冗余（`displayName` / `locatorIndex` / `lease.state/expiresAt`）3 个全部经调研可删，但需要补少量 round-trip / 类型层测试。
- `legacyId` / `legacyAliases` / `legacyChoiceId` / `selectedSkillIds` / `kind: "virtual"` 在生产代码已无普通路径残留——**清理任务可能已完成**，需要更新 plan 状态。

## P0 必修

每条都列：文件:行、原因、建议改法、缺什么测试。

### P0-1 `ProjectionRecord.mode` 是 V1 时代的歧义源，6 处普通 runtime 路径直接读

| 文件:行 | 字段/函数 | 路径 | 原因 |
| --- | --- | --- | --- |
| `packages/query/src/runtime.ts:5564` | `isProjectionStillResolvable` 中 `projection.mode === "managed"` | 普通 runtime（doctor 上游 `cleanupOrphanTargetSymlinks`） | V2 `ProjectionRecordV2` 无 `mode` 字段。V1 view 投影时**永远**写 `mode: "managed"`（`state-v2-view.ts:255`），所以该判断在 V2 实体下永远 `true` → 死代码 |
| `packages/query/src/runtime.ts:5619` | `cleanupImportedTargetPaths` 中 `projection.mode === "bootstrap-imported" && projection.sourceId === sourceLock.id` | 普通 runtime | V2 view 下永远 `false`（V2 view 全部 active 都是 "managed"） |
| `packages/query/src/runtime.ts:5653, 5709` | `ensureProjectionLedger` 中 V1 `mode` 过滤 | 普通 runtime（被 `applyDraft` / `uninstall` / `pruneMissingCheckoutsImpl` 调用） | 同上，导致 `bootstrap` 数组的实际数据源是 `sourceLock.importedFromTargets` + `importMode === "bootstrap-detected"`，不是 `mode` 字段 |
| `packages/query/src/runtime.ts:5892, 5932` | `hasPersistentProjectionOwnerForPath` / `captureSourceAuditSnapshot` 中 `projection.mode === projection.mode` 比较 | 普通 runtime | V1 形状等价比较 |
| `packages/core-engine/src/services/projection-ledger.ts:8-29` | `managedProjections` / `bootstrapImportedTargets` | 普通 helper（被 doctor / workspace-bootstrap / runtime 调用） | V1 `LockFile.projections` + V1 `mode` 过滤 |
| `packages/core-engine/src/services/deployment-planner-v2.ts:376, 380, 385, 388, 416, 425` | 局部变量 `managedProjections`（注意：实际只按 `status === "active"` 过滤，不是 V1 mode） | 普通 runtime | 命名误导，让人以为在过滤 V1 mode |

**建议改法**：
1. V2 `ProjectionRecordV2` 删 `mode` 字段（types.ts 已有 `status: "active" | "removed" | "blocked"` 表达状态；`SourceLockRecordV2.importMode` 表达"managed vs bootstrap"维度）
2. `projection-ledger.ts` 重写为 V2：`managedProjections(lockFileV2)` 直接返回 `lockFileV2.projections.filter(p => p.status === "active" && sourceLock.importMode !== "bootstrap-detected")`；`bootstrapImportedTargets(sourceLock)` 只读 `sourceLock`，不再读 `lockFile`
3. `runtime.ts` 6 处 `projection.mode` 读取改为 `projection.status === "active"` + 上游 `sourceLock.importMode` 派生
4. `deployment-planner-v2.ts:376` 局部变量 `managedProjections` 改名为 `activeOwners`，doc 注释说明"managed 在 V2 语义下 = active + 不属于 bootstrap-detected"

**删除前缺什么测试**：
- `packages/query/src/tests/bootstrap-projection-rebuild.test.ts`（新建）：bootstrap-detected 源 + enabled target，`applyDraft` 后断言 V2 `state.lockFile.projections` 没有 `mode` 字段，且 active 集合里这个 sourceId 仍出现
- `packages/query/src/tests/source-lifecycle.test.ts`：orphan-symlink scenario（先 active 投影 → mutate binding 清空 leaf → `app.doctor()` 仍触发 `ORPHAN_TARGET_SYMLINK_REMOVED`），覆盖"删 mode 过滤后 orphan 检测仍工作"
- `packages/core-engine/src/tests/deployment-planner-v2.test.ts` line 700 附近：补一个"两个 active 投影指向同一 targetPath 但 sourceId/leafId 不同，planner 把第二个标记为 blocked"的断言

---

### P0-2 `state-v2-view.ts` 整层投影是 V1/V2 双轨并存的根因

| 文件:行 | 字段/函数 | 路径 | 原因 |
| --- | --- | --- | --- |
| `packages/query/src/state-v2-view.ts:50-56` | `projectStateV2ToView` | 普通 runtime（被 runtime.ts 24+ 处调用） | 输入 V2 真源，输出 V1 形状 |
| `packages/query/src/state-v2-view.ts:58-72` | `projectManifestV2ToView` | 同上 | 写死 `schemaVersion: 1`（line 63）——`schemaVersion` 字段不再是真源 |
| `packages/query/src/state-v2-view.ts:74-94` | `projectSourceBindingV2ToView` | 同上 | V2 `selectionMode: "all"\|"selected"` + `selectedLeafIds` 投影成 V1 `selectedLeafIds?` + 完整 `targets: Record<id, { enabled, leafIds }>` 字典 |
| `packages/query/src/state-v2-view.ts:96-119` | `projectLockFileV2ToView` | 同上 | 同时输出 V1 形状的 `deployments` + `projections`（带 `mode: "managed"`），且数据源等价（`deployments = projections.map(({mode, ...rest}) => rest)`） |
| `packages/query/src/state-v2-view.ts:121-147` | `projectPreferencesV2ToView` | 同上 | `schemaVersion: 1` 写死 |
| `packages/query/src/state-v2-view.ts:149-161` | `projectSourceKindV2ToView` | 同上 | `github → git` 折叠，抹掉 V2 唯一多出的 kind 语义 |
| `packages/query/src/state-v2-view.ts:163-175` | `projectSourceManifestV2ToView` | helper | `createdAt → addedAt`、`displayName` 复制给 `originalDisplayName` |
| `packages/query/src/state-v2-view.ts:177-213` | `projectSourceLockV2ToView` | helper | V2 `revision.capturedAt → updatedAt`、`revision.provider → kind` |
| `packages/query/src/state-v2-view.ts:215-234` | `projectLeafV2ToView` | helper | V2 `displayName → name`、V2 `diagnostics[].message` 扁平化为 V1 `metadataWarnings: string[]` |
| `packages/query/src/state-v2-view.ts:236-257` | `projectProjectionV2ToDeploymentView` + `projectDeploymentToManagedProjectionView` | helper | 制造 V1 `deployments` 跟 V1 `projections` 两份等价数据 |
| `packages/query/src/state-v2-view.ts:259-272` | `projectProjectionV2ToView` | helper | 给 V1 `ProjectionStatusView` 用 |
| `packages/query/src/state-v2-view.ts:22-26` | `type StateV2AuthorityView` | 普通类型 | 输出 V1 形状 `Manifest` / `LockFileV2View` / `SharedPreferences` |
| `packages/query/src/state-v2-view.ts:28-38` | `type ProjectionStatusView` | 普通类型 | 跟 V1 `ProjectionRecord` 数据等价，是 V1 形状的别名 |
| `packages/query/src/state-v2-view.ts:40-42` | `type LockFileV2View` | 普通类型 | `LockFile & { projectionViews }`，projectionViews **零消费**（见 P1） |
| `packages/query/src/state-v2-view.ts:44-48` | `type StateV2AuthorityFiles` | 普通类型 | `collections` 字段被 `projectStateV2ToView` 静默忽略（见 P1） |

**state-v2-view.ts 的 24+ 调用方**（全部普通 runtime）：

- `packages/query/src/runtime.ts:141, 510, 526, 535, 561, 726, 910, 928, 1083, 1101, 1160, 1374, 4176, 4306, 4403, 4423, 4499, 4550, 4619, 4701, 4842`（22 处）
- `apps/cli/src/tests/config-integration.test.ts:6, 19`
- `apps/cli/src/tests/skill-flow.test.ts:6, 21, 1013`

**建议改法**（一次性删 state-v2-view.ts 的路线）：
1. 在 `query/src/runtime.ts` 内建立"内部 adapter"层——把 24+ 处 `projectStateV2ToView` 调用直接换成 V2 形状消费
2. `ManifestFileV2` / `LockFileV2` / `PreferencesFileV2` / `SourceManifestRecordV2` / `SourceLockRecordV2` / `LeafRecordV2` / `ProjectionRecordV2` 替换 V1 view 类型，逐个改 `runtime.ts` 方法签名
3. `config-coordinator.ts` / `doctor-service.ts` / `workflow-service.ts` / `workspace-bootstrap-service.ts` / `source-checkout-service.ts` / `source-types.ts` / `inventory-service.ts` 改 V2 签名
4. `state-v2-view.ts` 文件删除

**删除前缺什么测试**：
- V2 store → V2 视图（无 V1 投影）的 round-trip 测试（新建 `packages/query/src/tests/state-v2-views.test.ts`）
- `applyDraftImpl` 接受 `ManifestFileV2` / `LockFileV2` 输入并产出 V2 plan 的端到端测试
- `app.listWorkflows()` 仍然能返回 `WorkflowSummary[]`（`WorkflowSummary` 本身 V1 形状，待重写）
- desktop bridge JSON payload 不再带 V1 `Manifest` schemaVersion 字段（修改 `BridgeClientExecutionTests.swift`）
- 5 个 `state-v2-view.test.ts` 用例（line 13, 49, 50, 90-175 等）整体改写为 V2 形状期望

---

### P0-3 `SourceKind` / `SourceKindV2` / `SourceCheckoutKind` 三层抽象互相打架

| 文件:行 | 类型 | 路径 | 原因 |
| --- | --- | --- | --- |
| `packages/domain/src/types.ts:15` | `type SourceKind = "local" \| "git" \| "clawhub" \| "collection"` | V1 形状，普通类型 | 4 值，不含 `github` |
| `packages/domain/src/types.ts:847` | `type SourceKindV2 = "git" \| "github" \| "local" \| "clawhub" \| "collection"` | V2 真源 | 5 值 |
| `packages/core-engine/src/services/source-checkout-service.ts:32` | `type SourceCheckoutKind = Extract<SourceKind, "local" \| "git" \| "clawhub">` | 普通 runtime | 3 值，不含 `github`、不含 `collection` |
| `packages/storage/src/runtime-store.ts:38-40, 42, 46` | `RuntimeStore.sourceRoot` getter 硬编码 `"git"` / `getSourceRoot(kind: SourceKind)` / `getSourceCheckoutPath(kind: SourceKind, sourceId)` | 普通 runtime | `sourceRoot` getter 永远返回 `stateRoot/source/git/`——V2 写 `kind: "github"` 跟 V2 写 `kind: "git"` 都落到 `source/git/<id>`（`source-authority-service-v2.ts:109` 路径拼接），但 `sourceRoot` getter 把这个 V1 假设固定下来 |
| `packages/storage/src/runtime-store.ts:201-205` | `initializeRuntimePaths` 只 ensure `local`/`git`/`clawhub` | 普通 runtime | 不 ensure `collection`——首次添加 collection 时 `stateRoot/source/collection/` 不自动建，要等 `skill-collection-materializer.ts:74` 才 mkdir |
| `packages/integration/src/utils/naming.ts:7, naming.d.ts:6` | `kind?: SourceKind` | 普通 runtime | CLI 解析仍依赖 V1 集合 |
| `packages/core-engine/src/services/source-authority-service-v2.ts:488-499, 501-503` | `toCheckoutKind(kind: SourceKindV2)` / `mapSourceKind(kind: PreparedSourceCheckoutV2["kind"])` | 普通 runtime | `github → git` 折叠（line 488-499）；`mapSourceKind` 是 identity passthrough，但入参是 `PreparedSourceCheckoutV2["kind"]`（V1 形状） |
| `packages/core-engine/src/services/import-preparation-service-v2.ts:324-335` | `sourceCheckoutKind(record: ImportPreparationRecord)` | 普通 runtime | 全部 case 折叠到 `"git"` 或 identity，**`collection → git` 是静默吞语义**——若将来 collection 源能进 import preparation 流程，会被当 git 源处理调用 `git clone` 而不是 materialize |

**建议改法**：
1. 删 V1 `SourceKind`，统一用 V2 5 值集合，类型重命名为 `SourceKind`（去掉 V2 后缀）
2. `SourceCheckoutKind` 改 `Extract<SourceKind, "local" | "git" | "github" | "clawhub">`（把 `github` 加回来）
3. `RuntimeStore.sourceRoot` getter 改为 `path.join(this.stateRoot, "source")`（不带 kind 子目录）；`getSourceRoot(kind)` 内部按 kind 拼路径，`collection` 显式抛错或返回 undefined
4. `RuntimeStore.initializeRuntimePaths` 加 `ensureDir(this.getSourceRoot("git"))` + `ensureDir(this.getSourceRoot("github"))` 兜底
5. `sourceKindValue` 跟 `toCheckoutKind` 的 `github → git` 折叠保留（runtime 路径兼容），但 `collection → git` 这条折叠删掉，改抛错或走 materialize 路径

**删除前缺什么测试**：
- `packages/storage/src/tests/runtime-store.test.ts`（新建）：写 V2 `kind: "github"` 源到 lockFile，断言 `getSourceCheckoutPath("github", id)` 跟 `getSourceCheckoutPath("git", id)` 解析到同一物理路径；`sourceRoot` 永远等于 `<stateRoot>/source`
- `packages/domain/src/tests/source-kind.test.ts`（新建）：枚举 `SourceKind` 全部 5 值，调 view 投影（如果保留）/直接读 V2 manifest，断言 view 期望映射
- `packages/core-engine/src/tests/import-preparation-service-v2.test.ts`：mock `sourceKind: "collection"` 的 record，断言 `sourceCheckoutKind` 不返回 `"git"`，要么返回 `"collection"` 要么显式报错
- `packages/storage/src/tests/runtime-store.test.ts`：`new RuntimeStore(emptyRoot).init()` 后断言 `pathExists(path.join(emptyRoot, "source", "collection"))` 为 `true`

---

### P0-4 V1/V2 shadow 类型在普通 runtime/service 中大量残留

**全部 V1 类型 import 站**（排除迁移边界）：

| V1 类型 | 出现的普通路径 |
| --- | --- |
| `Manifest` | `query/state-v2-view.ts:9` / `query/config-coordinator.ts:8` / `query/runtime.ts:36` / `core-engine/services/doctor-service.ts:9` / `core-engine/services/workspace-bootstrap-service.ts:3` / `core-engine/services/source-types.ts:4` / `core-engine/services/workflow-service.ts:3`（dead） |
| `LockFile` | `query/state-v2-view.ts:7` / `query/config-coordinator.ts:7` / `query/runtime.ts:37` / `core-engine/services/doctor-service.ts:8` / `core-engine/services/workspace-bootstrap-service.ts:3` / `core-engine/services/source-types.ts:3` / `core-engine/services/workflow-service.ts:3`（dead） |
| `SharedPreferences` | `query/state-v2-view.ts:13` / `query/config-coordinator.ts:13` / `core-engine/services/doctor-service.ts:11` |
| `SourceManifestRecord` | `query/state-v2-view.ts:19` / `core-engine/services/source-types.ts:5` / `core-engine/services/source-checkout-service.ts:10` / `integration/utils/source-details.ts:2` / `tui/src/add-flow-model.ts:1` |
| `SourceLockRecord` | `query/state-v2-view.ts:18` / `core-engine/services/source-types.ts:4` / `core-engine/services/source-checkout-service.ts:10` / `core-engine/services/projection-ledger.ts:5` |
| `SourceBinding` | `query/state-v2-view.ts:14` / `query/workflow-service.ts:8` / `core-engine/services/source-types.ts:5` |
| `LeafRecord` | `query/state-v2-view.ts:6` / `query/runtime.ts:34` / `core-engine/services/inventory-service.ts:3` / `core-engine/services/source-checkout-service.ts:7` / `core-engine/services/source-authority-service-v2.ts:4` / `tui/src/add-flow-model.ts:3` |
| `ProjectionRecord` | `query/state-v2-view.ts:12` / `query/runtime.ts:44` / `core-engine/services/projection-ledger.ts:4` |
| `DeploymentRecord` | `query/state-v2-view.ts:3` |
| `SourceUpdateResult` | `query/runtime.ts:39` / `query/config-coordinator.ts:14` / `core-engine/services/source-authority-service-v2.ts:11` |
| `SourceUpdateDiff` | `core-engine/services/source-authority-service-v2.ts:10` |
| `ImportDraft` | `query/runtime.ts:18` / `apps/cli/src/bridge-command.ts:9` |
| `ImportPreviewSkill` | `apps/cli/src/bridge-command.ts:9`（间接） |
| `ImportPreparationRecord` | `core-engine/services/import-preparation-service-v2.ts:3, 213, 300, 324, 348` / `storage/import-preparation-cache.ts:4, 40, 67, 80, 165, 178` / `storage/import-preparation-cache-store.ts:4, 53, 66` |
| `LocalImportChoice` | `query/runtime.ts:32`（间接）/ `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift:609-614`（Swift struct） |
| `LocalScanImportChoice` | `query/runtime.ts:32`（间接） |
| `SourceMetadataCache` | `storage/runtime-store.ts:8` / `storage/source-metadata-cache.ts:2` |
| `ImportDataCache` | `storage/runtime-store.ts:4` / `storage/import-data-cache.ts:2` |

**特别值得点出的"真歧义源"**：

1. **`ImportPreparationRecord`（V1 形状）跟 `ImportPreparationRecordV2` 同名同状态字段但枚举不同**
   - V1 落盘 `status: "preparing" | "ready" | "committing" | "failed" | "stale"`
   - V2 类型定义 `status: "ready" | "committing" | "committed" | "failed" | "expired"`
   - `import-preparation-service-v2.ts` 写 V1 shape，storage 存 V1 shape
   - desktop / CLI 升 V2 时会读错状态
   - 修复：service 改用 `ImportPreparationRecord`（V2，去后缀），状态枚举统一到 V2

2. **`PreparedSourceCheckoutV2.leafs: LockFile["leafInventory"]`** 命名/内容不匹配
   - 类型名 V2，字段类型是 V1 `LockFile["leafInventory"]`（即 V1 `LeafRecord[]`）
   - `inventory-service.ts` 产 V1 leafs → `source-checkout-service.ts` 透传 V1 → `source-authority-service-v2.ts:577 toLeafRecordV2` 转 V2
   - 修复：`InventoryService.scanSource` 直接产 `LeafRecordV2[]`，删 `toLeafRecordV2` 中间转换；`PreparedSourceCheckoutV2.leafs` 改 `LeafRecordV2[]`

3. **`SourceUpdateResult` 跟 `SourceUpdateResultV2` 同名不同形状**
   - V1 形状：`updated: SourceUpdateResultItem[]` + `diffs: SourceUpdateDiff[]`
   - V2 形状：`sourceId` / `status` / `diffs: SourceUpdateDiffV2[]`（`previous` + `current` 复合）
   - `source-authority-service-v2.ts:276, 280` 返回 V1；V2 已存在但 runtime 不用
   - 修复：`updateSources` 返回 `Result<SourceUpdateResult>`（V2，去后缀）

4. **Desktop `MainViewModel.swift:3036-3052` V1/V2 协议版本判断 + 5 处 V1 `selectedSkillPaths` 字段**
   - `payload["version"]` 拿 V1/V2 区分
   - `parseLocalScanImportChoices` / `parseLocalImportChoices` 读 V1 `choice["selectedSkillPaths"]`
   - `LocalImportChoice` Swift struct 直接定义 V1 `selectedSkillPaths: [String]`
   - 修复：删 V1 协议路径，Swift struct 改 V2 `selectedSkills: [{ uiId, selector }]`

**建议改法**：
- 按 §3 重命名映射（`01-data-structure-optimization-recommendations.md` 3.1-3.7）一次性替换
- 配合 P0-2 state-v2-view.ts 删除一起做
- 跟 P0-1 mode 字段清理同步

**删除前缺什么测试**：
- 每对 V1/V2 类型的替换都加 round-trip 测试（V2 真源 → V2 视图 → V2 消费）
- desktop `BridgeClientExecutionTests.swift` / `ImportViewModelTests.swift` / `ImportScreenContainerTests.swift` 改 V2 期望
- `WorkflowCoverageTests.swift` 移除 V1 fixture

---

### P0-5 `core-engine/src/services/workflow-service.ts` 整文件 dead code

| 文件:行 | 内容 | 原因 |
| --- | --- | --- |
| `packages/core-engine/src/services/workflow-service.ts:1-76` | `class WorkflowService.getSummaries(manifest, lockFile, audit?)` | 无任何 runtime 路径 import 它（`packages` 全部 import 列表里只有它自己的测试文件；`packages/query/src/workflow-service.ts` 是 V2 包装版本，被 `runtime.ts:138, 471` 等处使用；`core-engine/src/index.ts` 第 3 行 `export * from "./services/workflow-service.js"` 是死 export） |

**建议改法**：直接删除 `packages/core-engine/src/services/workflow-service.ts` 和 `core-engine/src/index.ts:3` 的 export。

**删除前缺什么测试**：删除本身不会破坏任何 test（因无 consumer）。建议在 `core-engine/src/index.ts` 加个 `node test --reporter=verbose` 跑一遍，断言 core-engine 的所有 export 都有非测试 import（防止将来再出现 dead export）。

---

## P1 后续

### P1-1 `LeafRecordV2.displayName` 跟 `title` 永远相等

| 文件:行 | 内容 | 原因 |
| --- | --- | --- |
| `packages/domain/src/types.ts:898` | `LeafRecordV2.displayName: string` | 跟 V2 `title: string` 重复 |
| `packages/core-engine/src/services/state-migration-service.ts:744` | `displayName: title` | 迁移代码直接拷贝 |
| `packages/core-engine/src/services/source-authority-service-v2.ts:588, 592` | `displayName: leaf.title ?? leaf.name ?? leaf.linkName` | V1→V2 转换时跟 `title` 共享同一 fallback chain |
| `packages/query/src/state-v2-view.ts:222` | `projectLeafV2ToView` 读 V2 `leaf.displayName` | 唯一非 migration 读取 |

**desktop 验证**：`rg "leaf\.displayName" --glob '*.swift'` → 0 命中，Swift 端不依赖 `displayName` 字段（`MainViewModel.swift:4287-4310` 只读 `title`/`name`/`linkName`）。

**建议改法**：
1. `types.ts:898` 删 `displayName`
2. `source-authority-service-v2.ts:592` 删 `displayName: ...` 字段
3. `state-v2-view.ts:222` 改用 `leaf.title`
4. `state-migration-service.ts:744` 改为只写 `title`（迁移边界允许保留，但建议同步）

**删除前缺什么测试**：
- `source-authority-service-v2.test.ts` `toLeafRecordV2` 断言 `displayName === title`，删后断言输出不含 `displayName`
- `state-v2-view.test.ts` V2→V1 投影出的 V1 leaf 仍有非空 `name`
- `DetailViewModelTests.swift` / `MainViewModelCollectionTests.swift` 验证 detail page title 跟旧值一致
- `BridgeClientExecutionTests.swift` 验证 desktop 收到 leaf JSON `title` 字段存在

---

### P1-2 `ImportPreparationCache.locatorIndex` 是冗余二级索引

| 文件:行 | 内容 | 原因 |
| --- | --- | --- |
| `packages/domain/src/types.ts:773` | `locatorIndex: Record<string, string>` | `locator → record.id` 二级索引 |
| `packages/storage/src/import-preparation-cache-store.ts:58, 72-73` | 每次 write 维护 / delete 同步 | 写入侧冗余 |
| `packages/core-engine/src/services/import-preparation-service-v2.ts:253` | 唯一查询点：`cache.locatorIndex[cacheKey]` | 可改 O(n) scan records |
| `packages/storage/src/import-preparation-cache.ts:23, 35, 61-62, 163-175` | `createEmptyImportPreparationCache` / `pruneImportPreparationCache` / `normalizeLocatorIndex` | 配套代码 |

**建议改法**：
1. `types.ts:773` 删 `locatorIndex`
2. `import-preparation-cache-store.ts:58, 72-73` 删
3. `import-preparation-service-v2.ts:253` 改为 `Object.values(cache.records).find(r => r.cacheKey === cacheKey || r.locator === cacheKey)?.id`
4. `pruneImportPreparationCache` 不再需要过滤 `locatorIndex`

**删除前缺什么测试**：
- `import-preparation-cache.test.ts`：`pruneImportPreparationCache` 后 records 跟 locator 引用一致（用 `find` over records）
- `import-preparation-service-v2.test.ts`：`findReusablePreparation` 命中/未命中/repeat-key 三场景
- `normalizeImportPreparationCache` 读老 JSON（含 `locatorIndex`）静默丢弃，不报错
- 并发写入：重复 cacheKey 的 write 替换旧 record（当前隐含约束，删后需显式检查）

---

### P1-3 `ImportPreparationRecordV2.lease` 整块跟顶层 `status` / `expiresAt` 重叠

| 文件:行 | 内容 | 原因 |
| --- | --- | --- |
| `packages/domain/src/types.ts:1109` | `status: "ready" \| "committing" \| "committed" \| "failed" \| "expired"` | 顶层状态 |
| `packages/domain/src/types.ts:1124-1128` | `lease: { token: string; expiresAt: string; state: "ready" \| "committing" \| "committed" \| "expired" }` | 嵌套，零消费 |
| `packages/domain/src/types.ts:1137` | 顶层 `expiresAt: string` | 跟 `lease.expiresAt` 重叠 |

**验证**：`rg "\.lease\."` → 0 命中，**生产代码无任何 `lease` 字段读写**。`lease` 嵌套实际已无消费，仅 type definition 还在。

**建议改法**：`types.ts:1124-1128` 整块删 `lease`。

**删除前缺什么测试**：
- `import-preparation-service-v2.test.ts`：`prepareImportSource` / `commitPreparedImportSource` 写的 record JSON 不含 `lease`
- `import-preparation-cache.test.ts`：`normalizeRecord` 处理无 `lease` 的 V2 record 不报错
- 类型测试：验证 `ImportPreparationRecordV2` 不再含 `lease`

---

### P1-4 V1 `SourceManifestRecord` V1 view 多余字段

| 文件:行 | 内容 | 原因 |
| --- | --- | --- |
| `packages/domain/src/types.ts:80` | V1 `SourceManifestRecord.selectionMode?: "all" \| "partial"` | V2 binding 才有 `selectionMode`；V1 view 不输出（`state-v2-view.ts:163-175` 无该字段）→ V1 view 永远 undefined |
| `packages/query/src/state-v2-view.ts:169` | `originalDisplayName: source.displayName` | V1 view 把 V2 `displayName` 复制给自己；`runtime.ts:4113` `renameSourceImpl` 反而从 `manifestSource.locator` 重新派生 `originalDisplayName`，不读 view |
| `packages/query/src/state-v2-view.ts:170` | `addedAt: source.createdAt` | V1 `addedAt` 等价 V2 `createdAt`，纯命名差 |

**建议改法**（跟 P0-2 view 层删除一起做）：
1. V1 `SourceManifestRecord.selectionMode?` 删
2. V1 `SourceManifestRecord.originalDisplayName` 删
3. V1 `SourceManifestRecord.addedAt` 改 `createdAt`（统一 V2 命名）

**删除前缺什么测试**：
- 类型层：断言 V1 `SourceManifestRecord` 不含以上字段
- `runtime-v2.test.ts` rename 流程：rename 源后 listWorkflows 中 `displayName` 变了
- `bridge-command.test.ts` V2 形状输出断言

---

### P1-5 `state-v2-view.ts:41, 105, 116, 252-257` 死字段 / 死函数

| 文件:行 | 内容 | 原因 |
| --- | --- | --- |
| `state-v2-view.ts:41, 105, 116` | `LockFileV2View.projectionViews: readonly ProjectionStatusView[]` | 跟 V1 `LockFileV2View.projections` 数据源等价；`packages/` 和 `apps/` 全部 24+ caller **零次访问** `projectionViews`（验证：`rg "\.projectionViews" --glob '!plans/**'` → 0 命中） |
| `state-v2-view.ts:44-48` | `StateV2AuthorityFiles.collections: CollectionsFileV2` | 声明输入但 `projectStateV2ToView` (line 50-56) 不用；caller 传 `{ ...state }` 把它带进来但被静默忽略 |
| `state-v2-view.ts:252-257` | `projectDeploymentToManagedProjectionView` | 内联死代码，永远只输出 `mode: "managed"` |

**建议改法**：
- `projectionViews` 字段删，`ProjectionStatusView` 类型删
- `StateV2AuthorityFiles.collections` 删字段
- `projectDeploymentToManagedProjectionView` inline 到 caller（line 104）
- `LockFileV2View` 跟 `StateV2AuthorityView` 跟 `StateV2AuthorityFiles` 跟 `ProjectionStatusView` 4 个类型删

**删除前缺什么测试**：
- `state-v2-view.test.ts:140` 删 `expect(lockView.projectionViews).toEqual([...])` 断言，改用 `lockView.projections` 已有断言
- 现有 `state-v2-view.test.ts` 全部 test 都没传 `collections`，删字段不会让 test 失败
- `runtime-v2.test.ts` 端到端：写一个 collection，调 `app.listWorkflows()`，断言 collection source 的 `displayName` 来自 `collections.json`（验证 collections 在 view 路径里有被消费，不是死数据）

---

### P1-6 `SourceRevisionV2.provider` 跟 `SourceManifestRecordV2.kind` 共享 union 但语义不清

| 文件:行 | 内容 | 原因 |
| --- | --- | --- |
| `packages/domain/src/types.ts:851` | `kind: SourceKindV2` | 5 值 |
| `packages/domain/src/types.ts:877` | `provider: "git" \| "github" \| "local" \| "clawhub" \| "collection"` | 5 值，跟 `kind` 完全相同 |
| `packages/core-engine/src/services/source-authority-service-v2.ts:152` | `revision: { provider: sourceKind, ... }` | 写盘时复用 manifest kind |

**建议改法**：
- 把 `SourceRevisionV2.provider` 收窄为 `"git" \| "archive"`（协议标签），不再跟 manifest kind 共享 union
- 或者彻底删 `provider`，只保留 `commit`/`archiveEtag`/`capturedAt`

**删除前缺什么测试**：
- `state-store-v2.test.ts`（已有）覆盖：写 `kind: "github"` 但 `revision.provider: "git"` 不抛错
- 删 `provider` 时补一个 case：lockFile 不带 `revision.provider`，读取后 `lock.source.revision.provider` 为 undefined

---

### P1-7 `state-migration-service.ts:803` 局部变量 `managedProjections` 命名冲突

| 文件:行 | 内容 | 原因 |
| --- | --- | --- |
| `state-migration-service.ts:803` | `const managedProjections = legacyProjections.filter((projection) => projection.mode === "managed")` | 跟 `projection-ledger.ts:8` 的 `managedProjections()` helper 同名同含义但一个是 helper 一个是局部变量 |

**建议改法**：局部变量改名为 `managedLegacyProjections`。仅命名清理（迁移边界允许保留，但建议改）。

---

## 允许保留（迁移边界 / 豁免）

以下文件/位置按 plan 豁免规则保留，**本调研不视为技术债**：

### 迁移边界文件
- `packages/core-engine/src/services/state-migration-service.ts`（整文件）
  - 第 710, 725, 869-874 行 `mapSourceKind`（接受 V2 kind、返回 V1 view string，类型弱化）
  - 第 803 行局部 `managedProjections` 变量（命名重叠，见 P1-7）
  - 第 542, 543, 553, 770, 836 行 `virtualGroups` 引用
- `packages/core-engine/src/services/legacy-virtual-group.ts`（整文件）
- `packages/core-engine/src/services/legacy-agents-lock.ts`（整文件）

### 迁移测试
- `packages/core-engine/src/tests/state-migration-service.test.ts`（整文件）
- `packages/storage/src/tests/state-migration-status.test.ts`（整文件）
- `packages/query/src/tests/state-migration-runtime.test.ts`（如存在）
- `apps/cli/src/tests/state-migration-cli.test.ts`（如存在）

### 负向断言测试（验证 V1 已被拒绝）
- `apps/cli/src/tests/bridge-command.test.ts:773, 794, 839, 851`（拒收 V1 `selectedSkillIds` payload）
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift:375, 403, 429, 454, 484, 870`（`XCTAssertNil(draft["selectedSkillIds"])`）
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift:495`
- `packages/query/src/tests/runtime-v2.test.ts:470, 596`（`pathExists("virtual-groups.json")` 为 false）
- `packages/core-engine/src/tests/source-authority-service-v2.test.ts:76`（同上）
- `packages/core-engine/src/tests/state-migration-service.test.ts:141`（`expect(projection).not.toHaveProperty("mode")`）
- `packages/core-engine/src/tests/deployment-applier-v2.test.ts:11, 101, 169`（`lockFile.projections.every((projection) => !("mode" in projection))`）
- `packages/storage/src/tests/state-store-v2.test.ts:437, 449, 451`（"readLock rejects projections missing strategy or carrying legacy mode"）

### 自然语言资源
- `apps/desktop-mac/Sources/DesktopApp/Resources/*.lproj/Localizable.strings:91`（"virtual team" 自然语言短语，非类型/字段）

### 已完成清理任务（plan 可标记完成）
- `legacyId` / `legacyAliases` / `legacyChoiceId`：源码 0 命中（除 plans 文档）
- `selectedSkillIds`（V1 字段）：生产代码 0 命中
- `kind: "virtual"` / `sourceKind: "virtual"`：types.ts 0 命中

## state-v2-view 删除清单

### 必须删除的导出函数（10 个）
1. `projectStateV2ToView` (`state-v2-view.ts:50`)
2. `projectManifestV2ToView` (`state-v2-view.ts:58`)
3. `projectSourceBindingV2ToView` (`state-v2-view.ts:74`)
4. `projectLockFileV2ToView` (`state-v2-view.ts:96`)
5. `projectPreferencesV2ToView` (`state-v2-view.ts:121`)
6. `projectSourceKindV2ToView` (`state-v2-view.ts:149`)
7. `projectSourceManifestV2ToView` (`state-v2-view.ts:163`)
8. `projectSourceLockV2ToView` (`state-v2-view.ts:177`)
9. `projectLeafV2ToView` (`state-v2-view.ts:215`)
10. `projectProjectionV2ToDeploymentView` (`state-v2-view.ts:236`)
11. `projectDeploymentToManagedProjectionView` (`state-v2-view.ts:252`)
12. `projectProjectionV2ToView` (`state-v2-view.ts:259`)

### 必须删除的导出类型（5 个）
1. `StateV2AuthorityView` (`state-v2-view.ts:22`)
2. `LockFileV2View` (`state-v2-view.ts:40`)
3. `StateV2AuthorityFiles` (`state-v2-view.ts:44`)
4. `ProjectionStatusView` (`state-v2-view.ts:28`)
5. （`LockFileV2View` 内嵌的 `projectionViews` 字段）

### 必须修改的 caller（普通路径）
- `packages/query/src/runtime.ts:141, 223, 510, 526, 535, 561, 726, 910, 928, 1083, 1101, 1160, 1374, 4176, 4306, 4403, 4423, 4499, 4550, 4619, 4701, 4842`（24 处 `projectStateV2ToView` 调用 + 1 处 `StateV2AuthorityView` 类型 import）
- `apps/cli/src/tests/config-integration.test.ts:6, 19`
- `apps/cli/src/tests/skill-flow.test.ts:6, 21, 1013`

### 必须修改的测试
- `packages/query/src/tests/state-v2-view.test.ts`（整文件，line 13/49/50/90-175 全部断言改 V2 形状期望）
- `packages/query/src/tests/runtime-v2.test.ts:909`（projection fixture 去掉 `mode?` 字段）
- `packages/query/src/tests/collections.test.ts:550, 564`（去掉 `projection.mode === "managed"` 过滤，改 `projection.status === "active"`）
- `apps/cli/src/tests/skill-flow.test.ts:1468`（`mode?: string` fixture 改 V2 status）

### 必须删除的文件
- `packages/query/src/state-v2-view.ts`（整文件）

## V2 后缀删除清单

### 类型（46 个）
- `SourceKindV2` → `SourceKind`（V1 `SourceKind` 删）
- `SchemaVersionV2` → 删（用字面量 `2`）
- `MigrationGenerationV2` → `MigrationGeneration`
- `SourceIdV2` → `SourceId`
- `SkillLeafIdV2` → `SkillLeafId`
- `RepoPathV2` → `RepoPath`
- `ManifestFileV2` → `ManifestFile`
- `LockFileV2` → `LockFile`
- `PreferencesFileV2` → `PreferencesFile`
- `CollectionsFileV2` → `CollectionsFile`
- `SourceManifestRecordV2` → `SourceManifestRecord`（V1 删）
- `SourceLockRecordV2` → `SourceLockRecord`
- `SourceBindingV2` → `SourceBinding`
- `LeafRecordV2` → `LeafRecord`
- `ProjectionRecordV2` → `ProjectionRecord`（V1 删）
- `SourceUpdateResultV2` → `SourceUpdateResult`
- `SourceUpdateDiffV2` → `SourceUpdateDiff`
- `LeafSelectorIndexV2` → `LeafSelectorIndex`
- `SourceRevisionV2` → `SourceRevision`
- `ImportSkillSelectorV2` → `ImportSkillSelector`
- `ImportSkillSelectionV2` → `ImportSkillSelection`
- `ProjectSourceDraftV2` → `ProjectSourceDraft`
- `ImportDraftV2` → `ImportDraft`（V1 删）
- `ImportPreviewSkillV2` → `ImportPreviewSkill`（V1 删）
- `ImportPreparationRecordV2` → `ImportPreparationRecord`（V1 删）
- `PreparedSkillRefV2` → `PreparedSkillRef`
- `LocalImportChoiceV2` → `LocalImportChoice`（V1 删）
- `LocalScanDetectedSkillV2` → `LocalScanDetectedSkill`
- `LocalScanImportChoiceV2` → `LocalScanImportChoice`（V1 删）
- `AddSourceDraftOptionsV2` → `AddSourceDraftOptions`
- `AddSourcePreparationV2` → `AddSourcePreparation`
- `TargetDetectionV2` → `TargetDetection`
- `ImportDiscoveryCandidateV2` → `ImportDiscoveryCandidate`
- `ImportDiscoveryGroupCandidateV2` → `ImportDiscoveryGroupCandidate`
- `SkillCollectionMemberOriginV2` → `SkillCollectionMemberOrigin`
- `SkillCollectionMemberV2` → `SkillCollectionMember`
- `SkillCollectionRecordV2` → `SkillCollectionRecord`
- `SkillCollectionRestoreSelectionV2` → `SkillCollectionRestoreSelection`
- `MaterializedSkillSnapshotV2` → `MaterializedSkillSnapshot`
- `CollectionGenerationMarkerV2` → `CollectionGenerationMarker`
- `MigrationMarkerFileV2` → `MigrationMarkerFile`
- `SourceMetadataCacheEntryV2` → `SourceMetadataCacheEntry`（V1 删）
- `SourceMetadataCacheV2` → `SourceMetadataCache`（V1 删）
- `ImportDataCacheV2` → `ImportDataCache`（V1 删）
- `DiagnosticV2` → `Diagnostic`
- `StateStoreV2Error` → `StateStoreError`
- `StateStoreV2ErrorCode` → `StateStoreErrorCode`
- `StateStoreV2State` → `StateStoreState`
- `RepairTargetsResultV2` → `RepairTargetsResult`

### 类 / 函数 / 变量（8 个）
- `class StateStoreV2` → `class StateStore`
- `class SourceAuthorityServiceV2` → `class SourceAuthorityService`
- `class ImportPreparationServiceV2` → `class ImportPreparationService`
- `class DeploymentPlannerV2` → `class DeploymentPlanner`
- `class DeploymentApplierV2` → `class DeploymentApplier`
- `PreparedSourceCheckoutV2` → `PreparedSourceCheckout`（同时改 `.leafs: LeafRecordV2[]`，不是 `LockFile["leafInventory"]`）
- `SourceSnapshotV2` → `SourceSnapshot`
- `getActiveProjectionsV2` → `getActiveProjections`
- `writeManifestV2` / `writeLockV2` / `writePreferencesV2` / `writeCollectionsV2` → `writeManifest` / `writeLock` / `writePreferences` / `writeCollections`

### 文件（7 个）
- `state-schema-v2.ts` → `state-schema.ts`
- `state-store-v2.ts` → `state-store.ts`
- `source-authority-service-v2.ts` → `source-authority-service.ts`
- `import-preparation-service-v2.ts` → `import-preparation-service.ts`
- `deployment-planner-v2.ts` → `deployment-planner.ts`
- `deployment-applier-v2.ts` → `deployment-applier.ts`
- `domain/projection-v2.ts` → `domain/projection.ts`
- `query/state-v2-view.ts` → 删（整文件）

### 保留 `V2` 字样的合法位置
- `MigrationMarkerFile.version = "1.3.11"`（版本字符串）
- `state-migration-service.ts` / `legacy-virtual-group.ts`（迁移服务命名）
- `migrate-state --to v2`（CLI 子命令）
- `plans/2026-06-06-v2-compat-debt-cleanup/`（plan/archive 目录）

## 测试契约问题

### 当前锁住 V1 行为的测试（需更新）

| 文件:行 | 当前断言 | 问题 | 应改为 |
| --- | --- | --- | --- |
| `apps/cli/src/tests/skill-flow.test.ts:1468` | `lock.projections?.[].mode?: string` 在 fixture 里 | V2 storage `assertProjectionsV2` 显式拒绝 `mode` 字段，靠 `cloneLockFileV2` 把 V1 mode 写到 V2 storage | 改用 `v2(app).readState().lockFile.projections` 断言 V2 形状；用 `status === "active"` 替代 `mode === "managed"` |
| `packages/query/src/tests/runtime-v2.test.ts:909` | `projections?: Array<{ mode?: unknown }>` | 同上 | 改 V2 `status` 字段 |
| `packages/query/src/tests/state-v2-view.test.ts:134, 137, 138` | `lockView.projections?.filter((projection) => projection.mode === "managed")` 跟 V1 `deployments` 等价 | 整 view 层删除时一并改 | 整 test 文件改 V2 形状期望 |
| `packages/query/src/tests/collections.test.ts:550, 564` | `projection.mode === "managed" && projection.sourceId === "writing-stack"` | V2 删 mode 字段 | 改 `projection.status === "active" && projection.sourceId === "writing-stack"` |

### 负向断言测试（保留，验证 V1 已被拒绝）

- `apps/cli/src/tests/bridge-command.test.ts:773, 794, 839, 851`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift:375, 403, 429, 454, 484, 870`
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift:495`
- `packages/query/src/tests/runtime-v2.test.ts:470, 596`
- `packages/core-engine/src/tests/source-authority-service-v2.test.ts:76`
- `packages/core-engine/src/tests/state-migration-service.test.ts:141`
- `packages/core-engine/src/tests/deployment-applier-v2.test.ts:11, 101, 169`
- `packages/storage/src/tests/state-store-v2.test.ts:437, 449, 451`

### 待新增测试

| 测试文件 | 覆盖 | 触发条件 |
| --- | --- | --- |
| `packages/storage/src/tests/runtime-store.test.ts`（新建） | `sourceRoot` getter + `getSourceCheckoutPath("github", id)` 解析正确 | 配合 P0-3 |
| `packages/domain/src/tests/source-kind.test.ts`（新建） | `SourceKind` 5 值枚举 + `SourceCheckoutKind` 含 github | 配合 P0-3 |
| `packages/core-engine/src/tests/import-preparation-service-v2.test.ts` | `sourceKind: "collection"` 不返回 `"git"` | 配合 P0-3 |
| `packages/query/src/tests/bootstrap-projection-rebuild.test.ts`（新建） | V2 projection 派生 + 不带 mode 字段 | 配合 P0-1 |
| `packages/query/src/tests/source-lifecycle.test.ts` | orphan-symlink 仍能检测 | 配合 P0-1 |
| `packages/query/src/tests/state-v2-views.test.ts`（新建） | V2 store → V2 view round-trip（无 V1 投影） | 配合 P0-2 |
| `packages/query/src/tests/runtime-v2.test.ts`（加 case） | V2 `applyDraftImpl` 接受 V2 输入 + 产 V2 plan | 配合 P0-2 |
| `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`（加 case） | V2-only payload，旧 V1 显式拒绝 | 配合 P0-4 |
| `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportViewModelTests.swift`（加 case） | V2 `selectedSkills` 渲染 | 配合 P0-4 |
| `packages/storage/src/tests/import-preparation-cache.test.ts`（加 case） | `pruneImportPreparationCache` 后 records 跟 locator 引用一致（用 find 替代 locatorIndex） | 配合 P1-2 |
| `packages/storage/src/tests/import-preparation-cache.test.ts`（加 case） | 读老 JSON（含 `locatorIndex` / `lease`）静默丢弃 | 配合 P1-2 / P1-3 |
| `packages/core-engine/src/tests/source-authority-service-v2.test.ts`（加 case） | `toLeafRecordV2` 输出不含 `displayName` | 配合 P1-1 |
| `packages/core-engine/src/tests/deployment-planner-v2.test.ts`（加 case） | 两个 active 投影指向同一 targetPath → 第二个 blocked | 配合 P0-1 |

## 建议更新计划

把本调研发现作为补丁加到主 plan `00-current-execution-plan.md` 的 Task 5。

### 在 Task 5 Step 1 "Remove fallback reads outside migration boundary" 列表中增补

新增 must-remove 条目：

1. `packages/query/src/state-v2-view.ts`（整文件 273 行，10 个投影函数 + 5 个 V1 形状 DTO 类型）
2. `packages/core-engine/src/services/workflow-service.ts`（V1 dead code）
3. `packages/query/src/runtime.ts:5564, 5619, 5653, 5709, 5892, 5932`（6 处普通路径 `projection.mode` 读取）
4. `packages/core-engine/src/services/projection-ledger.ts:8-29`（V1 mode 过滤 + bootstrapImportedTargets）
5. `packages/storage/src/runtime-store.ts:38-40`（`sourceRoot` getter 硬编码 `"git"`）
6. `packages/storage/src/runtime-store.ts:201-205`（`initializeRuntimePaths` 缺 `collection` / `github`）
7. `packages/integration/src/utils/naming.ts:7` + `naming.d.ts:6`（V1 `SourceKind` 引用）
8. `packages/core-engine/src/services/import-preparation-service-v2.ts:324-335`（`collection → git` 静默折叠）
9. `packages/core-engine/src/services/deployment-planner-v2.ts:376, 380, 385, 388, 416, 425`（局部变量 `managedProjections` 命名误导）
10. `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift:609-614, 2534-2560, 2717-2740, 3022-3090, 3482-3530`（V1/V2 协议版本判断 + 5 处 V1 `selectedSkillPaths`）

### 在 Task 5 Step 1 中增补 contract-change 条目

把 16 对 V1/V2 类型列入 contract-change 列表（按 §P0-4 表格），按 `01-data-structure-optimization-recommendations.md` §3 重命名映射执行。

### 在 Task 5 Step 1 中增补 test-contract 条目

- `apps/cli/src/tests/skill-flow.test.ts:1468` 改 V2 形状
- `packages/query/src/tests/runtime-v2.test.ts:909` 改 V2 status
- `packages/query/src/tests/state-v2-view.test.ts` 整文件改 V2 形状期望
- `packages/query/src/tests/collections.test.ts:550, 564` 改 V2 status

### 在 Task 5 Step 1 中增补 rename-only 条目

- `state-v2-view.ts:41` 字段 `projectionViews` 删
- `state-v2-view.ts:44-48` 字段 `collections` 删
- `state-v2-view.ts:252-257` 函数 `projectDeploymentToManagedProjectionView` 内联
- `deployment-planner-v2.ts:376` 局部变量 `managedProjections` 改名
- `state-migration-service.ts:803` 局部变量 `managedProjections` 改名

### 在 Task 5 末尾增加"已完成的清理任务"

- `legacyId` / `legacyAliases` / `legacyChoiceId`（源码 0 命中）
- `selectedSkillIds`（生产 0 命中）
- `kind: "virtual"` / `sourceKind: "virtual"`（types.ts 0 命中）

### 在 Task 5 增加"待新增测试"清单

按 §"待新增测试" 表格 13 条新增。

### 在 Task 6 Step 4 "Rebuild test package" 之前增加 "V2 view 唯一真源" 验收

按 `01-data-structure-optimization-recommendations.md` §6 14 条 checklist 全部勾选通过。

## 与已有 plan 的差异总览

| 已有 plan 条目 | 本调研补充 |
| --- | --- |
| `must-remove`: `state-v2-view.ts: 10 个投影函数` | ✓ 已识别，**本调研把 caller 全部 24+ 处列全了** |
| `must-remove`: `projection-ledger.ts` mode 过滤 | ✓ 已识别，**本调研把 `runtime.ts` 6 处普通路径 mode 读取也列了** |
| `must-remove`: `desktop-mac/ImportState.swift: legacySkillId` | ✓ 已识别，**本调研把 MainViewModel.swift 5 处 V1 字段也列了** |
| `must-remove`: `desktop-mac/MainViewModel.swift: preview fallback from selectedSkillIds` | ✓ 已识别，**本调研补充了 V1/V2 `previewVersion` 分流** |
| `contract-change`: `types.ts: V1 types mark/isolate` | ✓ 已识别，**本调研把 18 个 V1 类型 import 站全部列了** |
| `rename-only`: `StateStoreV2.readManifest/writeManifest` | ✓ 已识别，**本调研把所有 46+8+7 个待重命名项列全了** |
| **本调研新增 P0-1**: 6 处普通路径 `projection.mode` 读取（plan 漏列） |
| **本调研新增 P0-3**: `SourceKind` 三层抽象打架 + `RuntimeStore.sourceRoot` 硬编码（plan 漏列） |
| **本调研新增 P0-4** P1-6：4 个 V1 类型同名字段不同形状的"真歧义源"（plan 只识别了 `Manifest/LockFile/SharedPreferences`，漏了 `ImportPreparationRecord` 同名同状态字段不同枚举、`SourceUpdateResult` 同名不同形状等） |
| **本调研新增 P0-5**: `core-engine/src/services/workflow-service.ts` dead code（plan 漏列） |
| **本调研新增 P1-1**: `LeafRecordV2.displayName` 冗余（plan 漏列） |
| **本调研新增 P1-2**: `ImportPreparationCache.locatorIndex` 冗余二级索引（plan 漏列） |
| **本调研新增 P1-3**: `ImportPreparationRecordV2.lease` 整块冗余（plan 漏列） |
| **本调研新增 P1-6**: `SourceRevisionV2.provider` 跟 `SourceManifestRecordV2.kind` 共享 union（plan 漏列） |
| **本调研新增**: `state-v2-view.ts` 5 个 V1 形状 DTO 类型（`StateV2AuthorityView` / `LockFileV2View` / `StateV2AuthorityFiles` / `ProjectionStatusView`）+ 3 个死字段（`projectionViews` / `collections` / `projectDeploymentToManagedProjectionView`）（plan 漏列） |
| **本调研新增**: `legacyId` / `selectedSkillIds` / `kind: "virtual"` 清理任务已完成（plan 状态未更新） |

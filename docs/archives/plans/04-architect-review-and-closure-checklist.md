# 04 Architect Review And Closure Checklist

> 本文件是 V2 state schema 重构在 `codex/import-preparation-cache` 分支推进到 `9e7556f` 后的架构师视角闭环审查。当前状态: 5 项 P0 和 7 项 P1 均已按本文件验收闭环。

## 1. 审查背景

已完成项:

- V1 source services 删除（`2f4eca1 refactor: delete v1 source services`）
- V2 authority 写入切换到 `StateStoreV2`（`b338697`、`f18eeb5`、`db59ae9`、`5fa52d8`）
- `RuntimeStore` 隔离 cache、路径、audit（`9e7556f refactor: isolate runtime storage from v1 authority`）
- `ConfigCoordinator`、`WorkspaceBootstrapService` 依赖收窄

本文件原列缺口:

- V1 authority 公开 API 仍可被任意包 import。
- 旧测试 38 个仍直接 `app.store.readManifest` / `readLock` / `readState` / `readVirtualGroups`。
- V2 collections 在 runtime 与 migration 内部存在两套 virtual → collection 转换。

## 2. 闭环判断矩阵

| 编号 | 主题 | 等级 | 状态 | 关键位置 |
| --- | --- | --- | --- | --- |
| 1 | V1 authority 根类公开导出 | P0 | **已闭环** | `store.ts` / `store.test.ts` 已删；`index.ts` 移除 `./store.js` 导出；commit `9e7556f` 后续将由本任务补 |
| 2 | V1 `VirtualGroups` R/W 仍在 `StateStore` | P0 | **已闭环** | `store.ts` 已删除；`rg -n "readVirtualGroups|writeVirtualGroups" packages apps` 为 0 命中 |
| 3 | `WorkspaceBootstrapService` 接触 V1 raw data | P0 | **已闭环** | `.skill-lock.json` 读取移到 `legacy-agents-lock.ts`；`WorkspaceBootstrapService` 默认使用空 reader，legacy reader 需显式注入 |
| 4 | `app.store.init()` 残留 | P0 | **已闭环** | `rg -n "app\.store\.init\(" packages apps` 为 0 命中 |
| 5 | V2 collections 转换两套 | P0 | **已闭环** | V1 `virtual-groups.json` 读取在 `legacy-virtual-group.ts`；collection member 物化在 `skill-collection-materializer.ts`，runtime / migration 复用 |
| 6 | Migration 原子性中间窗口 | P1 | **已闭环** | marker 残留但 authority 已完整替换时 `inspectStateMigrationStatus` 返回 current；core service `migrate` 返回 current |
| 7 | `migrationGeneration` 一致性 | P1 | **已闭环** | authority / marker / collection marker generation 缺失或不一致均返回 incomplete |
| 8 | `sourceAuthorityServiceV2` 写缺 `withMutationLock` 串联 | P1 | **已闭环** | service 写路径内部调用 `StateStoreV2.withMutationLock`；`StateStoreV2` 支持同实例嵌套锁 |
| 9 | `.skillflow-migration.json` marker 状态机 | P1 | **已闭环** | marker 写入 `version`；旧版本 / 缺 version / generation mismatch 均阻塞，完成替换后的残留 marker 可恢复 |
| 10 | Desktop / Swift 桥 V2 形状写入 | P1 | **已闭环** | desktop 生产代码不直接写 authority；Swift bridge/UI fixture 测试通过 |
| 11 | Cache 迁移后未预热 | P1 | **已闭环** | query runtime migration 成功后同步预热 seed recommendations，后台刷新其它 feed / source metadata |
| 12 | 测试架构 V1 API 仍可被 type 访问 | P1 | **已闭环** | `app.store.*` V1 authority 调用 0 命中；CLI/query 测试已改走 `StateStoreV2` raw 或 `projectStateV2ToView` |

## 3. P0 缺口详解

### 3.1 V1 authority 根类公开导出

**问题**：`packages/storage/src/store.ts:46` 仍 export 完整 V1 authority 类，且 `packages/storage/src/index.ts:8` 仍 `export * from "./store.js"`。

**影响**：runtime 隔离是“自觉”，不是“不可达”。任意包都可以重新耦合 V1 路径。

**修补**：

- 把 `store.ts` 拆为 `runtime-store.ts`（已存在，吸收 cache、路径、audit）和 `state-store-v1-legacy.ts`（只允许 `state-migration-service` import）。
- `storage/src/index.ts` 移除 `./store.js` 的 `export *`，改为按需 export 旧 V1 内部 helper。

**验证命令**：

```bash
rg -n "@skill-flow/storage/store" packages apps --glob '!**/dist/**'
# 期望: 仅 packages/core-engine/src/services/state-migration-service.ts 命中
```

### 3.2 V1 `VirtualGroups` R/W 仍在 `StateStore`

**问题**：`store.ts:197, 204` 暴露 `readVirtualGroups/writeVirtualGroups`。runtime 不再使用，但 storage public API 还在，V2 已将 virtual group 物化为 `collections.json`，是 V1/V2 双轨制的根源。

**当前状态**：已删除 `store.ts`，代码中 `readVirtualGroups/writeVirtualGroups` 0 命中。

**影响**：未来任何 caller 都可以从 storage 层读 V1 形状数据并绕过 V2 view 校验。

**修补**：

- 删除 `readVirtualGroups/writeVirtualGroups`。
- 保留 `state-migration-service.ts:679` 的 `readLegacyVirtualGroups` 作为唯一可读 `virtual-groups.json` 的入口。

**验证命令**：

```bash
rg -n "readVirtualGroups|writeVirtualGroups" packages apps --glob '!**/dist/**'
# 期望: 0 命中
```

### 3.3 `WorkspaceBootstrapService` 接触 V1 raw data

**问题**：`workspace-bootstrap-service.ts:43-50` 类型定义还在用 V1 字段（`sourceType`、`sourceUrl`、`skillPath`、`branch`），`:247-264` 解析 `~/.agents/.skill-lock.json`。

**当前状态**：旧 lock 解析已移动到 `legacy-agents-lock.ts`，`WorkspaceBootstrapService` 不再默认读取 `~/.agents/.skill-lock.json`；需要保留旧行为的测试通过显式 `agentsOriginReader` 注入。

**影响**：V1 third-party lock 文件仍是 runtime 的隐式依赖，V2 应当通过 `memberOrigin`、`originLocator` 等 V2 字段表达。

**修补**：

- bootstrap 只作为 V1 兼容桥（migration 时跑一次），runtime 不再依赖。
- 抽出 `readAgentsLockOrigins` helper 到 `core-engine/src/services/legacy-agents-lock.ts`，只允许 migration 调用。

**验证命令**：

```bash
rg -n "\.skill-lock\.json|readAgentsOrigins" packages apps --glob '!**/dist/**'
# 期望: 仅 legacy 文件 + migration 测试命中
```

### 3.4 `app.store.init()` 残留

**问题**：`apps/cli/src/tests/config-integration.test.ts:21, 53, 127, 517, 566` 直接 `app.store.init()`，依赖 V1 store 隐式创建空 manifest 行为。

**当前状态**：代码中 `app.store.init(` 0 命中。

**影响**：测试 fixture 与 V2 显式初始化语义不一致，迁移后这些测试可能通过但行为不反映 V2 真实路径。

**修补**：测试 fixture 改为 `await new StateStoreV2(sandbox.stateRoot).init()`，走 V2 显式初始化。

**验证命令**：

```bash
rg -n "app\.store\.init" packages apps --glob '!**/dist/**'
# 期望: 0 命中
```

### 3.5 V2 collections 转换两套

**问题**：`query/src/runtime.ts:610-914` 的 `createVirtualGroup/mergeGroups` 把 V1 虚拟组转 V2 collection；`state-migration-service.ts:217, 472, 679` 独立写 `readLegacyVirtualGroups` 解析 `virtual-groups.json`。两套逻辑形状不同。

**影响**：迁移后 V1 文件已删，但 runtime 和 migration 各持一套 V1 → V2 转换代码，维护成本高、行为漂移风险。

**当前状态**：`readLegacyVirtualGroups` 已抽到 `core-engine/src/services/legacy-virtual-group.ts`，migration service 复用该入口；collection member 复制、hash、leaf/member 记录生成、`.skillflow-generation.json` 写入已抽到 `core-engine/src/services/skill-collection-materializer.ts`，runtime 的 live collection 和 migration 的 legacy collection 共同复用。runtime / migration 只保留各自 origin 解析和 binding/rewrite 逻辑。

**修补**：

- 抽共享 `materializeSkillCollectionMembers` 到 `core-engine/src/services/skill-collection-materializer.ts`。
- `runtime.ts` 与 `state-migration-service.ts` 共用，legacy 文件解析仍仅在 `legacy-virtual-group.ts`。

**验证命令**：

```bash
rg -n "fs\.cp\(origin\.sourcePath|hashDirectory\(memberPath\)|\.skillflow-generation\.json|SkillCollectionMemberV2\[\]" \
  packages/query/src/runtime.ts packages/core-engine/src/services/state-migration-service.ts packages/core-engine/src/services/skill-collection-materializer.ts \
  --glob '!**/dist/**'
# 期望: collection member 复制、hash、marker 写入仅在 skill-collection-materializer.ts 命中
```

## 4. P1 需二次确认

### 4.1 Migration 原子性中间窗口

`state-migration-service.ts:147-180` 流程：写 marker → cp staging → rewrite authority → replace → prune → 校验。`replaceAuthorityFiles` 是单步 cp，没做 rename + atomic switch。替换后到 `fs.rm(markerPath)` 之间进程被杀，会出现 “marker 存在 + authority 已 V2” 的半完成状态。

**当前状态**：`inspectStateMigrationStatus` 在 marker 存在时会继续检查 authority；如果 authority 已是完整一致的 V2，且 marker generation / version 与当前状态匹配，则返回 `current`。`StateMigrationService.migrate` 在这种半完成恢复场景返回 `{ status: "current", actions: [] }`。

**验证**：

```bash
npm run -w @skill-flow/storage test -- src/tests/state-migration-status.test.ts
npm run -w @skill-flow/core-engine test -- src/tests/state-migration-service.test.ts
```

### 4.2 `migrationGeneration` 一致性

`createMigrationGeneration` 用时间戳 + pid + 随机数。`inspectStateMigrationStatus` 只看 `manifest.migrationGeneration` 和文件是否齐全，不做 half-migration 检测。

**当前状态**：authority 文件缺 `migrationGeneration`、authority 文件 generation 不一致、collection marker generation 不一致、marker generation 与 authority 不一致均返回 `STATE_MIGRATION_INCOMPLETE`。

**验证**：`state-migration-status.test.ts` 覆盖缺 generation、collection marker mismatch、marker generation mismatch。

### 4.3 `sourceAuthorityServiceV2` 写缺 `withMutationLock` 串联

`source-authority-service-v2.ts:148, 222, 346, 442` 多处 `stateStore.writeState` 没拿到 `StateStoreV2.withMutationLock`。`runtime.ts` 在外层做了 `runSerializedMutation` / `mutationQueue`，但 service 被外部直接调用时（desktop bridge、未来 internal hooks）会失去锁。

**当前状态**：`commitPreparedSource`、`removeSource`、`updateSources`、`reconcileInventory` 已在 service 内部走 `StateStoreV2.withMutationLock`；`StateStoreV2.withMutationLock` 对同一 store 实例可重入，避免 runtime 外层 `runSerializedMutation` 与 service 内层锁互相等待。

**验证**：

```bash
npm run -w @skill-flow/storage test -- src/tests/state-store-v2.test.ts
npm run -w @skill-flow/core-engine test -- src/tests/source-authority-service-v2.test.ts
npm run -w @skill-flow/query test -- src/tests/source-lifecycle.test.ts
```

### 4.4 `.skillflow-migration.json` marker 状态机

只有 `inspect` 看 marker（`state-schema-v2.ts:32-49`），`migrate` 写 `status: "running"` 后再删。如果用户再次启动旧版本 CLI 而 marker 还在，会进 `incomplete` 分支但不做恢复。

**当前状态**：marker 写入 `version: "1.3.11"`，`inspectStateMigrationStatus` 对缺 version、旧版本 marker 返回 `STATE_MIGRATION_INCOMPLETE`；对 marker 残留但 authority 已完成替换的同版本状态返回 `current`。

**验证**：`state-migration-status.test.ts` 覆盖 missing version、unsupported version、leftover marker recovery。

### 4.5 Desktop / Swift 桥 V2 形状写入

`apps/desktop-mac/Tests/SkillFlowDesktopTests/.../SourceState` 等 fixture 直接编 `manifest.json` / `lock.json` 形状，没用 `StateStoreV2` 读。Swift 端在落 `manifest.json` 时必须写 V2 形状，否则桌面端会拿到 schema v1 而 V2 runtime 会拒绝（`StateStoreV2Error: STATE_SCHEMA_UNSUPPORTED`）。

**当前状态**：`apps/desktop-mac/Sources/DesktopApp` 没有直接写 `manifest.json` / `lock.json` / `collections.json` 的生产路径，桌面写入通过 bridge 调 CLI/runtime。Swift `SourceState` 命中来自测试 helper 的假 bridge state，不是 `~/.skillflow` authority。

**验证**：

```bash
rg -n "manifest\.json|lock\.json|collections\.json|SourceState" apps/desktop-mac/Sources/DesktopApp apps/desktop-mac/Tests/SkillFlowDesktopTests --glob '*.swift'
cd apps/desktop-mac && swift test --filter WorkflowCoverageTests
cd apps/desktop-mac && swift test --filter MainViewModelSelectionTests
```

### 4.6 Cache 迁移后未预热

`runtime-store.ts` 把 cache 放在 `stateRoot/catalog/`，migration service 会 prune 这个目录（`:131-135`）。迁移完成后旧 cache 不会自动重建；用户首次打开 desktop 时会看到空 recommendation/搜索，然后后台慢慢填。

**当前状态**：`SkillFlowApp.migrateState` 不再通过会初始化 V2 authority 的 `runSerializedMutation` 执行迁移；迁移成功后调用 cache warmup，同步刷新 seed recommendations，后台刷新 official/trending/hot/audits feed 和已安装 source metadata。

**验证**：

```bash
npm run -w @skill-flow/query test -- src/tests/state-migration-runtime.test.ts
npm run -w @skill-flow/query test -- src/tests/import-page-flow.test.ts
```

### 4.7 测试架构 V1 API 仍可被 type 访问

query 38 个测试仍直接用 `app.store.readManifest/readLock/readState/readVirtualGroups`。这些不是“测试耦合”，是“runtime 隔离不彻底”的表现：`app.store` 类型签名上仍挂着 V1 API。

**当前状态**：`app.store.readManifest/readLock/readState/readPreferences/readVirtualGroups/writeVirtualGroups/init` 等直接调用已清零；query/CLI 测试按用途拆成 V2 raw authority 断言和 `projectStateV2ToView` 兼容视图断言。`rg -n 'app\.store\.(readManifest|writeManifest|readLock|writeLock|readState|writeState|readPreferences|writePreferences|readVirtualGroups|writeVirtualGroups|togglePinnedSource|pruneMissingSourceIds|init)\b' packages apps --glob '!**/dist/**'` 为 0 命中。

**验证**：把 `app.store` 类型从 `RuntimeStore` 改为只暴露 V2 view + 路径 helper，删方法不删文件，TypeScript 编译器就能强制所有测试改走 V2。

## 5. 收尾顺序

```text
1. 压面 (3.1, 3.2)       - 移走 V1 authority 公开 API
2. 合并 (3.3, 3.5)       - bootstrap / migration 单一工具
3. 强类型 (3.4, 4.7)     - 测试通过 TS 报错暴露耦合
4. 补测试 (4.1, 4.2, 4.4) - 半迁移 crash / 一致性 / marker 状态
5. 联检 (4.3, 4.5, 4.6)  - 桥接锁 / 桥接写入 / 缓存预热
```

## 6. 验收命令

```bash
# 期望 0 命中
rg -n "@skill-flow/storage/store|new StateStore\b|\bStateStore\b" packages apps --glob '!**/dist/**'

# 期望 0 命中
rg -n "readManifest\(|writeManifest\(|readLock\(|writeLock\(|readVirtualGroups\(|writeVirtualGroups\(" \
  packages/query/src packages/core-engine/src apps/cli/src \
  --glob '!**/tests/**' --glob '!**/dist/**'

# 期望 0 命中
rg -n "app\.store\.init" packages apps --glob '!**/dist/**'

# 期望仅在 legacy helper、migration service 和迁移测试命中
rg -n "readVirtualGroups|virtual-groups\.json" packages apps --glob '!**/dist/**'

# 期望仅在 legacy helper、migration service 和迁移测试命中
rg -n "LegacyVirtualGroup|legacyVirtualGroup" packages apps --glob '!**/dist/**'
```

## 7. 串行固化

- 本文件作为 `02-state-contract-and-migration.md` 的补充审查，纳入 V2 计划。
- 进入实现修补前，需要 subagent 按本文件第 2 节矩阵逐条复审并签字。
- 第 5 节收尾顺序按 07 串行流程执行：每阶段先固化文档，再进入下一阶段。

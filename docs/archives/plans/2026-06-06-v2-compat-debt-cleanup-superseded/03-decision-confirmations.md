# V2 清理决策确认（5 项）

> 配合 `00-current-execution-plan.md` / `01-data-structure-optimization-recommendations.md` / `02-authority-structure-audit.md` 使用。
>
> 本文件针对 user 给出的 5 项需要确认的决策，给调研证据 + 推荐方案 + 任务切片。决策 1 / 5 是语义约束（user 拍板），决策 2 / 3 / 4 是基于代码现状的方案选型。

---

## 决策 1：Task 5A 只作为 P0 第一执行切片，不作为 P0 完成定义

**决策内容（user 拍板）**：当前 plan 的 Task 5 拆分出的 Task 5A 切片只解决 P0 中**有限**的一部分，**不是 P0 全部完成的标准**。

**本调研立场**：采纳，并固化到 plan 文档。

**Task 5A 切片的合理范围**（基于本调研 P0 数量）：

P0 全部共 5 大类 11 项（见 `02-authority-structure-audit.md` §P0 必修）：

1. **P0-1** ProjectionRecord.mode 字段歧义（6 处普通 runtime 路径直接读）
2. **P0-2** state-v2-view.ts 整层投影（10 个函数 + 5 个 V1 形状 DTO + 24+ caller）
3. **P0-3** SourceKind / SourceKindV2 / SourceCheckoutKind 三层抽象打架
4. **P0-4** V1/V2 shadow 类型在普通 runtime/service 中大量残留（18 类）
5. **P0-5** core-engine workflow-service.ts dead public surface

**建议的 Task 5A 切片（第一执行切片）**：

> **只解决 P0-1 + P0-3（authority / projection 的 1-2 项）**，P0-2（view 层）跟 P0-4（shadow 类型）作为 Task 5B、Task 5C 后续切片。

Task 5A 具体包括：

- P0-1: 6 处 `projection.mode` 读取改为 V2 表达
- P0-1: `projection-ledger.ts` 重写为 V2-aware
- P0-1: `deployment-planner-v2.ts:376` 局部变量改名 + doc 注释
- P0-3: 删 V1 `SourceKind`，统一 V2 5 值集合
- P0-3: `SourceCheckoutKind` 改 `Extract<SourceKind, "local" | "git" | "github" | "clawhub">`
- P0-3: `RuntimeStore.sourceRoot` getter 改为 `<stateRoot>/source`
- P0-3: `RuntimeStore.initializeRuntimePaths` 加 `github` 兜底
- P0-3: `import-preparation-service-v2.ts:324-335` `sourceCheckoutKind` `collection` 不再折叠成 `"git"`（抛错或 materialize 路径）

**Task 5A 不包含**：

- state-v2-view.ts 删除（推到 Task 5B）
- V1/V2 shadow 类型批量替换（推到 Task 5C）
- desktop V1/V2 协议版本分流（推 Task 5B 同步 desktop）
- core-engine workflow-service.ts dead public surface 删除（推 Task 5D）

**Task 5A 完成后，P0 完成标准**（按 user 决策）= Task 5A + Task 5B + Task 5C + Task 5D 全部完成，且 `01-data-structure-optimization-recommendations.md` §6 14 条 checklist 全部通过。

**对 plan 文档的修改**：

- 在 `00-current-execution-plan.md` 的 Task 5 段落顶部加一句："Task 5A 是 P0 第一执行切片，完成 ≠ P0 完成；P0 完整定义见 §6 验收标准 + Task 5A/5B/5C/5D 全部完成"
- 引入 Task 5B / 5C / 5D 任务编号（5B = view 层删除，5C = shadow 类型批量替换，5D = dead public surface）

---

## 决策 2：github source kind 的物理路径策略 + collection 不允许映射为 git checkout

**决策内容（user 拍板）**：
- 物理路径策略需要确认
- collection 不允许映射为 git checkout（硬约束）

### 现状证据

**A. 物理路径拼接位置**：

`packages/core-engine/src/services/source-authority-service-v2.ts:108-109`
```ts
const sourceKind = this.mapSourceKind(prepared.kind);
const checkoutPath = path.join(this.options.stateStore.rootPath, "source", sourceKind, sourceId);
```

`mapSourceKind` (line 501-503) 是 identity passthrough——V2 kind 原样进入路径。所以：

| V2 `source.kind` | 物理路径（当前） | V2 走 `toCheckoutKind` |
| --- | --- | --- |
| `"local"` | `stateRoot/source/local/<id>` | `"local"` |
| `"git"` | `stateRoot/source/git/<id>` | `"git"` |
| `"github"` | `stateRoot/source/github/<id>` | `"git"` ← 折叠 |
| `"clawhub"` | `stateRoot/source/clawhub/<id>` | `"git"` ← 折叠 |
| `"collection"` | （不进这条路径，走 materialize 路径） | `undefined` ← 显式禁映射 |

**B. collection 显式不映射**（已在代码里保护）：

`source-authority-service-v2.ts:496-497`
```ts
case "collection":
  return undefined;
```

`toCheckoutKind` 收到 `collection` 返回 `undefined`，调用方在 line 477-480 处理 undefined：直接走 `materializeSkillCollectionMembers` 路径。

**用户硬约束已满足**。无需新增防护代码。

**C. github 物理路径两种候选方案**：

| 方案 | 物理路径 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **A. 独立 `source/github/<id>`** | `stateRoot/source/github/<id>` | 物理路径跟 V2 kind 集合一一对应；磁盘目录可一眼看出 source 来源 | git 协议下 github 源跟 git 源走同一通道（`SourceCheckoutService` 按 `toCheckoutKind` 折叠成 "git"）；独立目录带来的"两个等价目录"需要确保 ID 不冲突 |
| **B. 物理复用 `source/git/<id>`** | `stateRoot/source/git/<id>` | 物理路径跟 checkout 协议对齐；磁盘目录单一；不浪费节点 | V2 kind="github" 跟 V2 kind="git" 物理上混在同一目录；运行时需要查 V2 manifest 才能区分；namespace 风险（如果一个仓库同时被识别为 github 和 git） |

**当前代码状态**：**实际走方案 A**（`source-authority-service-v2.ts:109` 用 V2 kind 拼路径），但有歧义：
- `RuntimeStore.sourceRoot` getter 硬编码 `"git"`（line 38-40），暗示 B 方向
- `query/src/tests/source-lifecycle.test.ts:709` 写 `getSourceCheckoutPath("git", sourceId)` 测试，假设 B 方向
- `source-lifecycle.test.ts:741, 751` 用 `getSourceRoot("local")` 也按 V2 kind 拼路径（局部 A 方向）

**判断**：方案 A 已经被 `source-authority-service-v2.ts:109` 隐式采用；方案 B 在 RuntimeStore 跟部分测试里。两者并存 → 实际行为**取决于调用方传什么 kind**。

**对 disk 上的实际影响**：
- 当前 github 源应该落在 `source/github/<id>`（A 方向）
- `sourceRoot` getter 仍返回 `source/git/`（B 方向）
- 测试用 `getSourceCheckoutPath("git", sourceId)`（B 方向）
- **当前没有任何测试断言 github 源的实际磁盘路径**——A 方向是"未测试的现状"

### 推荐方案

**采纳方案 A（独立 `source/github/<id>`）**，理由：

1. 物理路径跟 V2 kind 集合一一对应，**单一真源**原则贯彻到底
2. 不引入"语义 vs 物理"分裂——`SourceKindV2` 的每个 kind 在磁盘上都有自己的子目录
3. `toCheckoutKind` 折叠 `github → "git"` 是**协议层面**的折叠（git 协议下两个 kind 走同一通道），不破坏磁盘命名空间
4. 磁盘目录直观：`ls ~/.skillflow/source/` 一眼看全所有 kind
5. 跟 collection 的"独立 `source/collection/<id>`"已经存在的事实一致——既然 collection 单独目录，github 也该单独目录

**A 方向下需要修改**：

1. `RuntimeStore.sourceRoot` getter 删（line 38-40）——`sourceRoot` 是单数子目录，违反 A 方向"无单数 sourceRoot"原则
2. `RuntimeStore.initializeRuntimePaths` 加 `ensureDir(this.getSourceRoot("github"))` + `ensureDir(this.getSourceRoot("collection"))`（line 201-205）
3. `query/src/tests/source-lifecycle.test.ts:709` 把 `getSourceCheckoutPath("git", sourceId)` 改为 `getSourceCheckoutPath("github", sourceId)`（如果该测试是用 github 源）
4. `query/src/tests/collections.test.ts:98` 已用 `getSourceCheckoutPath("collection", ...)` 正确
5. 新增测试 `packages/storage/src/tests/runtime-store.test.ts`：
   - 断言 `RuntimeStore` 不暴露 `sourceRoot` getter（或保留但返回 `<stateRoot>/source`）
   - 断言 `getSourceCheckoutPath("github", id)` 解析到 `<stateRoot>/source/github/<id>`
   - 断言 `getSourceCheckoutPath("git", id)` 解析到 `<stateRoot>/source/git/<id>`（**两者不同路径**，验证 A 方向）
6. 删 `source-lifecycle.test.ts` 里"假设 `getSourceRoot("local") === <stateRoot>/source/local`" 的写法（A 方向下要明确传 kind）

**A 方向的 ID 唯一性约束**：

- V2 manifest 用 `id: string`（`SourceIdV2`）作为源标识
- `SourceAuthorityServiceV2.commitPreparedSource` (line 98-105) 在写盘前检查 `state.manifest.sources.some(s => s.id === sourceId)`——**已在 ID 级别做唯一性约束**
- 物理路径只要按 `(kind, id)` 拼就自动保证目录不冲突

**不需要 fallback 兼容代码**：老 V1 状态不会有 `kind: "github"`（V1 `SourceKind` 不含 "github"），migration 边界处理。

### 任务切片

纳入 Task 5A（与 P0-3 同步）：

- 删 `RuntimeStore.sourceRoot` getter（line 38-40）
- `RuntimeStore.initializeRuntimePaths` 加 `github` + `collection` 兜底
- `source-lifecycle.test.ts:709, 741, 751` 测试断言改 A 方向
- 新增 `runtime-store.test.ts` 三个 case
- 文档说明：物理路径跟 V2 kind 一一对应（`stateRoot/source/<kind>/<id>`），无单数 `sourceRoot`

**不**纳入 Task 5A（推到 Task 5B 同步）：

- `MainViewModel.swift` 跟 `ImportState.swift` 跟 `ImportScreenContainer.swift` 改 V2 selectedSkills（见决策 3）

---

## 决策 3：Desktop import preview 必须纳入 P0

**决策内容（user 拍板）**：
- 删 `previewVersion` 分流
- `LocalImportChoice` 改 `selectedSkills`
- 纳入 P0 范围

### 现状证据（具体工作量）

`apps/desktop-mac/Sources/DesktopApp/` 下需要改的文件：

| 文件:行 | 现状 | 需要 |
| --- | --- | --- |
| `Store/ImportState.swift:40, 43-44, 52-53, 57-58` | `selectedSkills: [ImportSkillSelection]` 是 V2，但保留 V1 derived `selectedSkillPaths` computed property + V1 init compat | 删 derived property + V1 init，保留 V2 init |
| `ViewModels/MainViewModel.swift:609-614` | `struct LocalImportChoice` 持 V1 `selectedSkillPaths: [String]` | 改 V2 `selectedSkills: [ImportSkillSelection]` |
| `ViewModels/MainViewModel.swift:2534-2560` | `parseLocalScanImportChoices` 读 V1 `choice["selectedSkillPaths"]` | 改 V2 `choice["selectedSkills"]` 解析 |
| `ViewModels/MainViewModel.swift:2717-2740` | `parseLocalImportChoices` 同上 | 同上 |
| `Screens/Import/ImportScreenContainer.swift:147-166` | **同时存在 V1 (`selectedSkillPathsForImport` line 147) + V2 (`selectedSkillsForImport` line 158) 两个方法** | 删 V1 方法，统一走 V2 |
| `Screens/Import/ImportScreenContainer.swift:111-113, 121, 142` | 调用两套 | 改 V2 |
| `Screens/Import/ImportScreen.swift:188, 286, 300, 316, 350-357` | 大量 V1 `selectedSkillPaths` 引用 | 改 V2 |
| `Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift:870-880` | V1 接受 + V2 接受的 if/else 分流 | 改 V2 only |

`query/src/runtime.ts` 也需要检查（V2 输出到 desktop 的 bridge payload 应该统一是 V2 `selectedSkills`，不再有 V1 字段）：

| 文件:行 | 现状 | 需要 |
| --- | --- | --- |
| `packages/query/src/runtime.ts:1812-1846, 1982-2010, 2286-2299, 2099` | 4 个 helper 构造 V1 `LocalImportChoice`（含 `selectedSkillPaths: string[]`） | 改 V2 `LocalImportChoice`（含 `selectedSkills: ImportSkillSelection[]`） |
| `apps/cli/src/bridge-command.ts:9, 642-663` | bridge protocol import V1 `ImportDraft` + `LocalImportChoice` | 改 V2 |

### 推荐方案

**全量替换 V1 → V2，不保留 V1 fallback**：

1. `ImportState.swift` 删 V1 init（line 52-53）和 derived property（line 43-44），保留 V2 init
2. `MainViewModel.LocalImportChoice` 字段改名 `selectedSkillPaths: [String]` → `selectedSkills: [ImportSkillSelection]`
3. `MainViewModel.parseLocalImportChoices` / `parseLocalScanImportChoices` 读 V2 JSON 字段
4. `ImportScreenContainer` 删 `selectedSkillPathsForImport` (line 147-156)，全走 `selectedSkillsForImport` (line 158-167)
5. `ImportScreen` 全部 V1 引用改 V2
6. `BridgeClientExecutionTests.swift:870-880` 删 V1 accept 分支
7. `query/src/runtime.ts` 4 个 helper 改 V2
8. `bridge-command.ts` 改 V2 import

**对 plan 文档的修改**：

- 把 desktop import preview 修复纳入 P0 必修（不是 P1）
- 在 `02-authority-structure-audit.md` §P0-4 第 6 条升级为 P0（之前是 P0 提示性列出）
- 在 `01-data-structure-optimization-recommendations.md` §5 实施路线 第 7 步 "删 V1 类型 + 删 state-v2-view.ts 整层" 增加 desktop 三文件作为强制前置

### 任务切片

**纳入 Task 5B（与 view 层删除同步）**：

- Swift 三文件（`ImportState.swift` / `MainViewModel.swift` / `ImportScreenContainer.swift` / `ImportScreen.swift`）改 V2
- `query/src/runtime.ts` 4 个 helper 改 V2
- `bridge-command.ts` 改 V2 import
- `BridgeClientExecutionTests.swift:870-880` 删 V1 accept 分支
- 新增测试：bridge payload 必须 V2（拒收 V1 `selectedSkillPaths`）
- 删 `state-v2-view.ts`（P0-2 的核心动作）

**前置测试**：

- `ImportViewModelTests.swift` 用 V2 fixture
- `ImportScreenContainerTests.swift` 用 V2 `selectedSkills` 渲染
- `WorkflowCoverageTests.swift` 删 V1 fixture 引用

---

## 决策 4：core-engine workflow-service.ts 疑似 dead public surface

**决策内容（user 拍板）**：删除前确认 package exports / 外部子路径 import。

### 现状证据

**A. core-engine 包内 export**：

`packages/core-engine/src/index.ts:3`
```ts
export * from "./services/workflow-service.js";
```
**这是 dead public surface #1**：通过主入口暴露的 export。

**B. core-engine 子路径 export**：

`packages/core-engine/package.json`（完整）：
```json
"exports": {
  ".": "./dist/index.js",
  "./services/*": "./dist/services/*.js"
}
```
**这是 dead public surface #2**：通过 `./services/*` 通配符子路径暴露，可能被 `@skill-flow/core-engine/services/workflow-service` 形式 import。

**C. 全代码库 import 验证**：

`rg "core-engine/services/workflow-service" --glob '!**/dist/**' --glob '!**/node_modules/**' --glob '!**/plans/**'` → **0 命中**

`rg "workflow-service" --glob '!**/dist/**' --glob '!**/node_modules/**' --glob '!**/plans/**'` → 4 命中：

| 文件:行 | 内容 | 引用的是 V1 还是 V2 |
| --- | --- | --- |
| `packages/query/src/index.ts:4` | `export * from "./workflow-service.js"` | V2 包装（query 自己的实现） |
| `packages/query/package.json:10` | `"./workflow-service": "./dist/workflow-service.js"` | V2 包装的子路径 |
| `packages/query/src/runtime.ts:138` | `import { WorkflowService } from "./workflow-service.js"` | V2 包装 |
| `packages/query/src/tests/workflow-service.test.ts:3` | `import { WorkflowService } from "../workflow-service.js"` | V2 包装 |

**全部命中都指向 V2 版本（`packages/query/src/workflow-service.ts`）**，**没有任何 import 指向 V1 版本（`packages/core-engine/src/services/workflow-service.ts`）**。

**D. 跟 query 版本的关系**：

`packages/core-engine/src/services/workflow-service.ts` 跟 `packages/query/src/workflow-service.ts` 是**两个独立实现**：
- core-engine 那个是 V1 形状（`getSummaries(manifest: Manifest, lockFile: LockFile, audit?)`）
- query 那个是 V2 形状（`getSummaries(manifest: ManifestFileV2, lockFile: LockFileV2, audit?, collections: CollectionsFileV2)`）
- query 版本被 `runtime.ts:138, 471` 等 50+ 处使用
- core-engine 版本无 consumer

### 推荐方案

**完全删除 V1 版本，不留尾**：

1. 删 `packages/core-engine/src/services/workflow-service.ts`（整文件 76 行）
2. 删 `packages/core-engine/src/index.ts:3` export
3. **不要收紧** `"./services/*"` 子路径 export——保留它作为普通 service 子路径入口（其他 service 仍可受益），只是 V1 workflow-service 这一个 export 自然消失

**不需要 normalizer 兼容代码**：V1 workflow-service 没有持久化数据，它是无状态 helper，不存在"老 JSON 兼容"问题。

**build / test 验证**：

- `npm run -w @skill-flow/core-engine build`：编译通过
- `npm run -w @skill-flow/core-engine test`：测试通过（无自己测试）
- `npm run build` 根构建：所有依赖 core-engine 的包仍能 import 公共 surface
- `npm test` 根测试：所有引用 V2 版本的测试仍通过

### 任务切片

**独立成 Task 5D（dead public surface 清理）**：

- 删 `packages/core-engine/src/services/workflow-service.ts` 整文件
- 删 `packages/core-engine/src/index.ts:3` `export * from "./services/workflow-service.js"`
- 不动 `core-engine/package.json` 子路径 export（保留通配符）
- 跑 `npm run build` + `npm test` + `cd apps/desktop-mac && swift test` 验证
- 在 `01-data-structure-optimization-recommendations.md` §6 验收标准加一条：`packages/core-engine/src/services/workflow-service.ts` 文件不存在

---

## 决策 5：P1 冗余字段删除必须配套老 JSON 一次性 migration / normalizer 丢弃

**决策内容（user 拍板）**：
- 删 P1 字段（`displayName` / `locatorIndex` / `lease.state` / `lease.expiresAt` / `selectionMode` / `originalDisplayName` / `addedAt` / `projectionViews` 等）
- **不在 runtime 加兼容代码**
- 老 JSON 必须一次性 migration / normalizer 丢弃

### 现有 normalizer 模式可套用

调研发现 `state-migration-service.ts:650` 有 `normalizeLegacyMetadataScalar`、`legacy-virtual-group.ts:22` 有 `validateLegacyVirtualGroupsJson`、`state-migration-service.ts:227` 有 `validateLegacyMigrationInputs`——**已有"老 JSON 一次性 normalizer 丢弃"模式**。

**P1 字段删除时按现有模式套用**：

| P1 字段 | normalizer 位置 | 丢弃策略 |
| --- | --- | --- |
| `LeafRecordV2.displayName` | `core-engine/src/services/source-authority-service-v2.ts:592` | 写盘时不带 `displayName` 字段；老 JSON 读盘时 `normalizeLeafRecordV2` 静默丢弃 `displayName`（不发警告、不抛错、不映射到 `title`） |
| `ImportPreparationCache.locatorIndex` | `storage/src/import-preparation-cache.ts:normalizeImportPreparationCache` | 读盘时 `normalizeLocatorIndex` 静默返回 `{}`（不重建索引）；runtime 改为 O(n) scan records |
| `ImportPreparationRecordV2.lease.*` | `storage/src/import-preparation-cache.ts:normalizeRecord` | 读盘时 `normalizeRecord` 丢弃 `lease` 整块；runtime 全部用顶层 `status` / `expiresAt` |
| V1 `SourceManifestRecord.selectionMode` | V1 view 删除时（`state-v2-view.ts:163-175` 不输出此字段） | V1 类型的 `selectionMode?` 直接删；V2 字段已无此概念；老 V1 manifest 读盘时丢弃 |
| V1 `SourceManifestRecord.originalDisplayName` / `addedAt` | V1 view 删除时 | 同上 |
| V1 `SourceManifestRecord.name`（V1 `LeafRecord`） | V1 view `projectLeafV2ToView` 不读 `displayName`，已通过 `title` 派生 | V1 类型的 `name` 删；V2 manifest 读盘时用 `title` 替代 |
| `LockFileV2View.projectionViews` | view 层删除时 | 整 view 层删除，projectionViews 字段随之消失 |

### normalizer 测试要求

**对每个 P1 字段的 normalizer 必须有显式测试**：

1. **写盘不带字段**：测试 prepare → commit → read round-trip 出来的 JSON 不含此字段
2. **读盘丢弃字段**：测试 fixture 手工构造一个含此字段的老 JSON，normalize 后输出不含此字段（**不发警告、不抛错**）
3. **runtime 不读字段**：测试 runtime 路径不依赖此字段（删除后行为一致）
4. **类型层 sanity**：测试 `delete Field` 后 TypeScript 编译通过

### normalizer 文件位置

按字段影响范围：

| 字段 | normalizer 位置 | 理由 |
| --- | --- | --- |
| `LeafRecordV2.displayName` | `packages/core-engine/src/services/source-authority-service-v2.ts`（V1→V2 边界）+ `packages/storage/src/state-store-v2.ts:assertLeafInventoryV2` | 写盘侧删字段，读盘侧 normalizer 丢弃 |
| `ImportPreparationCache.locatorIndex` | `packages/storage/src/import-preparation-cache.ts:normalizeImportPreparationCache` | storage 层 normalizer |
| `ImportPreparationRecordV2.lease.*` | `packages/storage/src/import-preparation-cache.ts:normalizeRecord` | storage 层 normalizer |
| V1 `SourceManifestRecord` 字段 | V1 view 删除 → V1 字段随 V1 类型一起删；V2 读盘侧 normalizer 不动 | 类型层 + view 层同步 |
| `LockFileV2View.projectionViews` | view 层删除 | 随 view 消失 |

### 一次性 migration 路径

跟 `state-migration-service.ts` 的 `migrate-state --to v2` 一致：

- `migrate-state --to v2` 已经在做 V1 → V2 整体转换（包括 `legacy-virtual-group` → `SkillCollectionRecordV2`）
- 新的 P1 字段删除**不引入新 migration 命令**——`migrate-state --to v2` 一次性把所有老 V1 字段（含 `displayName` / `locatorIndex` / `lease` 等）丢弃到 V2 真源
- 老用户跑 `migrate-state --to v2 --dry-run` 看到的就是 V2 真源（无 displayName、无 locatorIndex、无 lease）
- 跑完 `migrate-state --to v2` 后 V1 形状不存在，runtime 不需要兼容

### 任务切片

**纳入 Task 5C（V1/V2 shadow 类型批量替换）**：

- 删 V1 `displayName` 字段（`types.ts:898`）+ normalizer 丢弃
- 删 `ImportPreparationCache.locatorIndex` 字段（`types.ts:773`）+ normalizer 丢弃
- 删 `ImportPreparationRecordV2.lease` 整块（`types.ts:1124-1128`）+ normalizer 丢弃
- 删 V1 `SourceManifestRecord.selectionMode` / `originalDisplayName` / `addedAt` 字段 + view 层不输出
- 删 `LockFileV2View.projectionViews` 字段 + view 层不输出

**测试要求**：

每个 P1 字段的 normalizer 必须有 4 个测试（写盘不带 / 读盘丢弃 / runtime 不读 / 类型层），按 `02-authority-structure-audit.md` §"待新增测试" 表格执行。

**不在 runtime 增加兼容 fallback**：

- `runtime.ts` 不读 `displayName` / `locatorIndex` / `lease.*` / V1 字段
- 任何 `if (record.displayName) ... else (record.title)` 模式都禁止
- 任何 `record.locatorIndex ?? findByLocator(records)` 模式都禁止——直接 `findByLocator(records)`
- 任何 `record.lease?.state ?? record.status` 模式都禁止——直接 `record.status`

**对 plan 文档的修改**：

- 在 `01-data-structure-optimization-recommendations.md` §5 实施路线 增加 "P1 字段删除必须配套 normalizer 丢弃测试" 一段
- 在 `01-data-structure-optimization-recommendations.md` §6 验收标准 加 4 条 normalizer 验收项

---

## 任务切片汇总（5 项决策合并）

| Task | 包含 P0 必修项 | 实施边界 |
| --- | --- | --- |
| **Task 5A**（第一切片） | P0-1 (mode 字段重写) + P0-3 (SourceKind + 路径) | 不动 view 层；不动 desktop；不动 shadow 类型 |
| **Task 5B**（view 层 + desktop） | P0-2 (state-v2-view 删除) + 决策 3 (desktop import preview) | desktop 三文件 + query runtime 24+ caller 改 V2 |
| **Task 5C**（shadow 类型清理） | P0-4 (16 对 V1/V2 类型批量替换) + 决策 5 (P1 normalizer 丢弃) | types.ts 减半；runtime 50+ 方法签名改 V2 |
| **Task 5D**（dead public surface） | P0-5 (core-engine workflow-service) | 删 1 文件 + 1 export；build/test 验证 |

**P0 完成定义** = Task 5A + 5B + 5C + 5D 全部完成 + `01-data-structure-optimization-recommendations.md` §6 14 条 checklist 全过 + `02-authority-structure-audit.md` §"待新增测试" 13 条全过 + Task 6 Final Verification 6 个 npm/swift 命令全过。

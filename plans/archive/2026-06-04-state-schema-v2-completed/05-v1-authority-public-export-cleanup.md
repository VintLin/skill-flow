# 05 V1 Authority Public Export Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 `storage` 包对 V1 authority API 的公开导出，让 V1 文件读取仅允许通过 `state-migration-service`。

**Architecture:** `storage` 公开面只暴露 `StateStoreV2`（authority）、`RuntimeStore`（cache/路径/audit）和 `state-schema-v2` helpers。V1 文件读取被限制在 `state-migration-service` 内部（已用 `readJsonFile`，不需要 `StateStore`）。`store.ts` 整体删除。

**Tech Stack:** TypeScript、Vitest、`rg` 静态验证。

**前置：** 04-architect-review-and-closure-checklist.md 第 3.1 节。`9e7556f` 已创建 `RuntimeStore`。

**后续：** 06-v1-virtual-groups-removal.md (P0 3.2)、07-bootstrap-v1-bridge-removal.md (P0 3.3)、08-v1-collection-conversion-share.md (P0 3.5)、09-app-store-init-test-migration.md (P0 3.4)、10-p1-closure-suite.md (P1 4.1-4.7)、11-failing-test-migration.md (K)、12-desktop-bridge-verification.md (L)。

**当前状态 (2026-06-06)：** 本计划的实现条件已满足：`packages/storage/src/store.ts` 和 `packages/storage/src/tests/store.test.ts` 不存在，`packages/storage/src/index.ts` 不再导出 `./store.js`，`@skill-flow/storage/store` / `new StateStore` / 裸 `StateStore` 均 0 命中，生产代码中的 V1 authority 方法调用 0 命中。全量验证已通过 `npm run build`、`npm test`、`cd apps/desktop-mac && swift test`。

---

## 任务 1: 把 `getSourceRoot` / `getSourceCheckoutPath` 路径 helper 移到 `RuntimeStore`

**Files:**
- Modify: `packages/storage/src/store.ts:60-65`（删除 `getSourceRoot` 与 `getSourceCheckoutPath`，保留 `sourceRoot` getter 以便暂留）
- Modify: `packages/storage/src/runtime-store.ts:37-40`（在 `sourceRoot` getter 之后增加 `getSourceRoot(kind)` 和 `getSourceCheckoutPath(kind, sourceId)`）
- Test: 既有测试（`source-lifecycle.test.ts`、`skill-flow.test.ts`、`virtual-groups.test.ts`）应继续通过，因为 `app.store.getSourceCheckoutPath` 仍可用

- [ ] **Step 1: 在 `runtime-store.ts` 增加路径 helper**

在 `packages/storage/src/runtime-store.ts` 顶部 import 区域补 `import type { SourceKind } from "@skill-flow/domain/types";`，然后在 `sourceRoot` getter 之后插入：

```typescript
  getSourceRoot(kind: SourceKind): string {
    return path.join(this.stateRoot, "source", kind);
  }

  getSourceCheckoutPath(kind: SourceKind, sourceId: string): string {
    return path.join(this.getSourceRoot(kind), sourceId);
  }
```

确认 `RuntimeStore` 自身未引入新的 `getStateRoot` 依赖（路径已用 `this.stateRoot`）。

- [ ] **Step 2: 从 `store.ts` 删除 `getSourceRoot` / `getSourceCheckoutPath`**

删除 `packages/storage/src/store.ts:60-65`：

```typescript
  getSourceRoot(kind: SourceKind): string {
    return path.join(this.stateRoot, "source", kind);
  }

  getSourceCheckoutPath(kind: SourceKind, sourceId: string): string {
    return path.join(this.getSourceRoot(kind), sourceId);
  }
```

同时清理 `import type { ..., SourceKind, ... }` 中的 `SourceKind`（若不再使用）。

- [ ] **Step 3: 跑 storage build 验证**

```bash
npm run -w @skill-flow/storage build
```

期望：PASS。

- [ ] **Step 4: 跑 query + core-engine build 验证**

```bash
npm run -w @skill-flow/core-engine build && npm run -w @skill-flow/query build
```

期望：PASS。

- [ ] **Step 5: 跑相关测试**

```bash
npm run -w @skill-flow/query test -- source-lifecycle.test.ts virtual-groups.test.ts
```

期望：跳过 `app.store.getSourceRoot` 类的测试 PASS（这些测试用 `app.store.getSourceCheckoutPath`，已迁移）。

- [ ] **Step 6: Commit**

```bash
git add packages/storage/src/store.ts packages/storage/src/runtime-store.ts
git commit -m "refactor: move source path helpers into runtime store"
```

---

## 任务 2: 从 `StateStore` 删除 V1 authority 方法

**Files:**
- Modify: `packages/storage/src/store.ts:135-260`（删除 V1 authority 方法）、`store.ts:460-480`（删除 `*Raw` helper）、`store.ts:420-460`（删除 `createEmptyManifest/createEmptyLockFile/createEmptySharedPreferences` 等工厂）、`store.ts:218-260`（删除 `togglePinnedSource/pruneMissingSourceIds`）

需要删除的方法列表（共 12 个）：

```typescript
readManifest, writeManifest, readLock, writeLock, readState, writeState,
readPreferences, writePreferences, readVirtualGroups, writeVirtualGroups,
togglePinnedSource, pruneMissingSourceIds
```

- [ ] **Step 1: 删除 `readManifest` / `writeManifest`**

删除 `store.ts:135-148`（含方法体与 doc 注释）。

- [ ] **Step 2: 删除 `readLock` / `writeLock` / `readState` / `writeState`**

删除 `store.ts:149-178`。

- [ ] **Step 3: 删除 `readPreferences` / `writePreferences`**

删除 `store.ts:180-195`。

- [ ] **Step 4: 删除 `readVirtualGroups` / `writeVirtualGroups`**

删除 `store.ts:197-216`。

- [ ] **Step 5: 删除 `togglePinnedSource` / `pruneMissingSourceIds`**

删除 `store.ts:218-260`。

- [ ] **Step 6: 删除 V1 工厂函数（`createEmptyManifest` 等）**

从 `store.ts` 中找出并删除 `createEmptyManifest`、`createEmptyLockFile`、`createEmptySharedPreferences`、`createEmptyVirtualGroupsState` 等私有工厂（之前散落在 `*Raw` helper 附近）。它们已经没有调用方。

- [ ] **Step 7: 删除 `*Raw` 私有 helper（`readManifestRaw` 等）**

删除 `store.ts:460-480`。如果方法体里还有 `normalize*` 等被别处引用的函数（`normalizeManifest` 等），先 grep 确认无引用后一并删除。

- [ ] **Step 8: 简化 `initializeState`**

`store.ts:440-460` 当前会调用 `getSourceRoot` 等。若这些方法已删除且 `StateStore` 不再承担 init 责任（`StateStoreV2` 已 init），把 `initializeState` 整体删除（连带 `init` 方法与 `initPromise` 字段）。

- [ ] **Step 9: 跑 storage build 验证**

```bash
npm run -w @skill-flow/storage build
```

期望：PASS（`StateStore` 类已退化为仅含路径 helper 或可整个删除）。

- [ ] **Step 10: Commit**

```bash
git add packages/storage/src/store.ts
git commit -m "refactor: drop v1 authority methods from state store"
```

---

## 任务 3: 删除 `StateStore` 与 `store.ts` 公开导出

**Files:**
- Delete: `packages/storage/src/store.ts`
- Delete: `packages/storage/src/tests/store.test.ts`（V1 store 的所有测试已无对应实现）
- Modify: `packages/storage/src/index.ts`（删除 `export * from "./store.js"`）

- [ ] **Step 1: 从 `index.ts` 移除 `./store.js` 导出**

修改 `packages/storage/src/index.ts:8`，从：

```typescript
export * from "./store.js";
```

改为：

```typescript
// store.js removed in 05-closure: V1 authority lives only in state-migration-service.
```

- [ ] **Step 2: 删除 `packages/storage/src/store.ts`**

```bash
rm packages/storage/src/store.ts
```

- [ ] **Step 3: 删除 `packages/storage/src/tests/store.test.ts`**

```bash
rm packages/storage/src/tests/store.test.ts
```

- [ ] **Step 4: 跑 storage build 验证**

```bash
npm run -w @skill-flow/storage build
```

期望：PASS。

- [ ] **Step 5: 跑 core-engine / query / CLI build 验证（确保无 `StateStore` 残留 import）**

```bash
npm run -w @skill-flow/core-engine build && \
  npm run -w @skill-flow/query build && \
  npm run -w skill-flow build
```

期望：编译期会暴露仍在 `import { StateStore }` 或 `app.store.readManifest` 的代码，定位后修复或转交 11-failing-test-migration.md 处理。

- [ ] **Step 6: 跑 04 第 6 节静态验证**

```bash
# 期望 0 命中（@skill-flow/storage/store 不再被引用）
rg -n "@skill-flow/storage/store|new StateStore" packages apps --glob '!**/dist/**'

# 期望 0 命中（生产代码无 V1 authority 调用）
rg -n "readManifest\(|writeManifest\(|readLock\(|writeLock\(|readVirtualGroups\(|writeVirtualGroups\(" \
  packages/query/src packages/core-engine/src apps/cli/src \
  --glob '!**/tests/**' --glob '!**/dist/**'
```

期望：第二条 0 命中；第一条仅在测试 fixture（迁移后处理）。

- [ ] **Step 7: Commit**

```bash
git add packages/storage/src/index.ts packages/storage/src/store.ts packages/storage/src/tests/store.test.ts
git commit -m "refactor: remove v1 state store from storage public surface"
```

---

## 任务 4: 收尾验证与文档更新

**Files:**
- Modify: `plans/2026-06-04-state-schema-v2/04-architect-review-and-closure-checklist.md`（在第 2 节矩阵中将 P0 3.1 状态从 “未闭环” 改为 “已闭环”）
- Verify: 全包 build/test

- [ ] **Step 1: 跑全包 build**

```bash
npm run -w @skill-flow/storage build && \
  npm run -w @skill-flow/core-engine build && \
  npm run -w @skill-flow/query build && \
  npm run -w skill-flow build
```

期望：编译失败点应只来自测试代码（38 个 V1-coupling），不影响生产路径。

- [ ] **Step 2: 跑 storage 自身测试**

```bash
npm run -w @skill-flow/storage test
```

期望：仅 `state-store-v2.test.ts` 与 `state-migration-status.test.ts` 命中，全部 PASS。

- [ ] **Step 3: 更新 04 矩阵**

在 `plans/2026-06-04-state-schema-v2/04-architect-review-and-closure-checklist.md` 第 2 节表格中，将 P0 3.1 行状态从 “未闭环” 改为 “已闭环”，新增 commit hash 引用。

- [ ] **Step 4: Commit 计划文档**

```bash
git add plans/2026-06-04-state-schema-v2/04-architect-review-and-closure-checklist.md
git commit -m "docs: mark v1 authority cleanup as closed in closure checklist"
```

---

## 验证标准

完成 P0 3.1 的硬性条件：

- `packages/storage/src/store.ts` 不再存在。
- `packages/storage/src/index.ts` 不再 `export * from "./store.js"`。
- `packages/storage/src/tests/store.test.ts` 不再存在。
- `@skill-flow/storage` 仅 export `RuntimeStore`、`StateStoreV2`、cache 与 schema helpers。
- `npm run -w @skill-flow/storage build` 通过。
- `npm run -w @skill-flow/core-engine build` 通过。
- 生产代码（`packages/query/src`、`packages/core-engine/src/`、`apps/cli/src/` 排除 `tests/`）无 `readManifest|writeManifest|readLock|writeLock|readVirtualGroups|writeVirtualGroups` 调用。
- 38 个测试失败保留为 P1 4.7 / K 任务，由后续 11-failing-test-migration.md 收尾。

## 风险与回退

- **风险：** 测试编译失败点扩散到非 P0 3.1 任务范围。  
  **回退：** 任务 3 Step 5 编译失败时，先 git stash 当前未提交改动，记录失败点，归并到 11-failing-test-migration.md，不在此 plan 内修复。
- **风险：** `state-migration-service` 隐式依赖 `StateStore` 某 helper。  
  **检测：** 任务 3 Step 5 `core-engine build` 失败即触发；回退到 `git reset --hard HEAD~1`，先抽 helper 进 `state-migration-service.ts` 内部，再重新执行。

## 不做

- 不改 `StateStoreV2` 任何方法。
- 不动 `RuntimeStore` 已有 cache / audit / path 行为。
- 不重写任何测试断言；测试迁移归 11。
- 不改 `state-migration-service.ts`；其 V1 读取用 `readJsonFile`，不依赖 `StateStore`。
- 不改 `index.ts` 中除 `./store.js` 之外的其他行。

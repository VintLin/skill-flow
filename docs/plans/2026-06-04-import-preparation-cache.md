# Import Preparation Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把推荐 skill group 的导入流程改成“预览阶段后台准备 checkout，点击 Import 时提交已准备结果”，减少每次导入等待时间，并让桌面 UI 明确显示准备、就绪、失败和并发限制状态。

**Architecture:** 新增 import preparation cache，把耗时的 git clone / archive download / ClawHub fetch 从提交导入路径前移到预览路径。准备结果写入独立 cache manifest 和独立 checkout 目录；导入时校验 preparationId、TTL、locator 和 snapshot 后，用原子 rename/copy 提交到正式 source checkout，再应用 draft。预览可并发但限制并发数；导入提交继续串行，导入成功后的全量刷新改成非阻塞后台刷新。

**Tech Stack:** TypeScript monorepo, Vitest, Node fs/git utilities, SwiftUI macOS desktop, XCTest, JSON bridge protocol v1.0.

---

## Technical Feasibility Check

已确认当前实现中的关键事实：

- `packages/query/src/runtime.ts` 的 `previewImportSourceImpl()` 主要解析 provider 元数据和临时预览，不保留可复用 checkout。
- `packages/query/src/runtime.ts` 的 `importSourceImpl()` 调用 `prepareAddSourceImpl()`，后者最终会走 `SourceService.addSource()`，因此导入时会重新 fetch/clone。
- `packages/core-engine/src/services/source-service.ts` 的 `SourceService.addSource()` 已经有临时目录、snapshot 构建、rename 到正式 checkout、写 manifest/lock 的完整路径；可以抽取并复用为 prepared checkout 提交流程。
- `packages/storage/src/store.ts` 已有 catalog cache 根目录和 import-data cache 方法；可以新增独立 `catalog/import-preparations.json` 和 `catalog/import-preparations/<id>`，不污染现有 provider 元数据 cache。
- `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift` 当前对可见卡片无上限并发 preview；需要限制并发，避免推荐页同时触发多个网络 clone。
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift` 当前导入成功后 `await synchronizeState(refreshDoctor: true, inspectSourceId:)`，会把刷新时间算进按钮的 `Downloading...` 状态；可以改成先释放导入状态，再启动后台同步和跳转。

本地计时参考：

- `preview-import-source anthropics/skills`: 约 2.7s。
- `import-source anthropics/skills`: 约 4.1s。
- raw `git clone --depth 1 https://github.com/anthropics/skills.git`: 约 6.08s。
- raw GitHub zip download/extract: 约 6.77s。
- `list`: 约 1.1s。
- `doctor`: 约 0.08s。

结论：加速空间主要来自复用预览期间准备好的 checkout，并把导入后的刷新移出按钮等待链路。桥接 helper 仍是每次请求一个进程；本计划不引入常驻 daemon，避免同时改进程模型和导入模型。

## Risk Points

- **数据一致性:** prepared checkout、cache manifest、正式 source checkout、manifest/lock 必须一致。提交时使用正式 checkout 的临时路径，然后 rename；任何失败都清理临时路径，prepared 记录标记 failed 或保持 ready 供重试。
- **过期数据:** prepared checkout 可能来自旧 repo。每条记录保存 `preparedAt`、`expiresAt`、`commitSha`。默认 TTL 24 小时；过期后 UI 显示 stale 并重新准备。
- **磁盘占用:** 准备缓存会保存 repo checkout。每次准备和启动时清理过期记录；最多保留 12 条 ready/failed 记录；不删除 active commit 中的 preparation。
- **并发:** prepare 允许有限并发，同 locator 复用 in-flight promise；commit 继续通过现有 `runAuditedMutation("import-source", ...)` 串行。commit 同一 preparation 时先把状态改为 `committing`，避免重复提交。
- **协议影响:** 新增 bridge command 属于外部协议变更。必须更新 `packages/shared-types/src/protocol.ts`、CLI bridge handler、Swift `BridgeCommand`、桥接测试。
- **ClawHub 语义:** ClawHub 当前通过 `npx` 安装，不一定天然是 git checkout。准备服务必须支持 `git`、`local`、`clawhub` 三种 SourceKind；ClawHub 准备阶段执行现有 fetch，提交阶段复用 prepared checkout。
- **桌面状态:** UI 要避免“点击没反应”。其他卡片在 active import 时明确 disabled reason；准备失败卡片显示 retry 文案；ready 卡片按钮文案从 Downloading 改为 Importing 或 Installing。

## File Structure

### Domain

- Modify: `packages/domain/src/types.ts`
  - 新增 `ImportPreparationStatus`、`ImportPreparationRecord`、`ImportPreparationCache`、`ImportPreparationResult`、`ImportCommitDraft`。
  - 扩展 `ImportGroupCandidate` 和 ready `ImportPreviewResult`，暴露 `preparationId`、`preparationStatus`、`preparedAt`、`expiresAt`。
  - 扩展 `ImportSourceResult`，成功时可返回 `preparationId`、`usedPreparation`。

### Storage

- Create: `packages/storage/src/import-preparation-cache.ts`
  - 负责 preparation cache 归一化、过期判断、排序裁剪。
- Modify: `packages/storage/src/store.ts`
  - 新增 `importPreparationPath`、`importPreparationCheckoutRoot`、`getImportPreparationCheckoutPath()`。
  - 新增 read/write/upsert/delete/list cleanup methods。
- Test: `packages/storage/src/tests/import-preparation-cache.test.ts`
- Test: `packages/storage/src/tests/store.test.ts`

### Core Engine

- Create: `packages/core-engine/src/services/import-preparation-service.ts`
  - 编排 prepare、cache hit、commit、cleanup。
- Modify: `packages/core-engine/src/services/source-service.ts`
  - 抽取 source resolution + fetch + snapshot + commit prepared checkout 的公共能力。
  - 保留 `addSource()` 现有行为，改为调用公共方法。
- Test: `packages/core-engine/src/tests/import-preparation-service.test.ts`
- Test: `packages/core-engine/src/tests/source-service.test.ts`

### Query Runtime

- Modify: `packages/query/src/runtime.ts`
  - 新增 public `prepareImportSource(locator)`。
  - 新增 public `commitPreparedImportSource(preparationId, draft?)`。
  - `previewImportSource()` 启动/复用 preparation，并在 ready preview payload 中返回 preparation 状态。
  - `importSource()` 优先使用 ready preparation；没有 preparation 时保留直接导入 fallback。
- Test: `packages/query/src/tests/import-page-flow.test.ts`

### Bridge Protocol and CLI

- Modify: `packages/shared-types/src/protocol.ts`
  - 新增 commands: `prepare-import-source`、`commit-import-source`。
- Test: `packages/shared-types/src/tests/protocol.test.ts`
- Modify: `apps/cli/src/bridge-command.ts`
  - 新增 payload 校验和命令处理。
- Test: `apps/cli/src/tests/bridge-command.test.ts`

### Desktop Mac

- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
  - 新增 bridge commands。
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
  - 新增 `prepareImportSource(locator:)`、`commitImportSource(preparationId:selectedSkillIds:enabledTargets:)`。
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopQuerying.swift`
  - 新增 prepare query。
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`
  - 新增 commit command。
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeQueryFacade.swift`
  - 转发 prepare query。
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
  - 保存 preparation state，导入 ready preparation，导入后后台同步。
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
  - preview/prepare 并发上限。
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
  - 显示 preparing/ready/failed/stale 和 active import disabled help。
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift`

## Task 1: Domain Types for Import Preparation

**Files:**
- Modify: `packages/domain/src/types.ts`

- [ ] **Step 1: Add preparation domain types**

Insert after `ImportDraft`:

```ts
export type ImportPreparationStatus =
  | "preparing"
  | "ready"
  | "committing"
  | "failed"
  | "stale";

export type ImportPreparationRecord = {
  id: string;
  locator: string;
  canonicalRepo: string;
  sourceKind: SourceKind;
  checkoutPath: string;
  sourceId: string;
  displayName: string;
  requestedPath?: string;
  status: ImportPreparationStatus;
  preparedAt: string;
  expiresAt: string;
  commitSha?: string;
  skillIds: string[];
  availableTargets: DeploymentTargetId[];
  failure?: {
    reasonCode: string;
    retryable: boolean;
    message: string;
  };
};

export type ImportPreparationCache = {
  records: Record<string, ImportPreparationRecord>;
  locatorIndex: Record<string, string>;
};

export type ImportPreparationResult =
  | {
      status: "preparing" | "ready" | "stale";
      preparationId: string;
      locator: string;
      canonicalRepo: string;
      preparedAt?: string;
      expiresAt?: string;
    }
  | {
      status: "failed";
      preparationId?: string;
      reasonCode: ImportReasonCode | string;
      retryable: boolean;
    };

export type ImportCommitDraft = ImportDraft & {
  preparationId: string;
};
```

- [ ] **Step 2: Extend preview result**

Change the ready branch of `ImportPreviewResult` to include:

```ts
      preparationId?: string;
      preparationStatus?: ImportPreparationStatus;
      preparedAt?: string;
      expiresAt?: string;
```

- [ ] **Step 3: Extend import result**

Change the ready branch of `ImportSourceResult` to include:

```ts
      preparationId?: string;
      usedPreparation?: boolean;
```

- [ ] **Step 4: Run type check through build**

Run:

```bash
npm run build
```

Expected: compile errors from storage/query/desktop references are acceptable in this task if they only mention missing new implementations. No syntax errors in `packages/domain/src/types.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/types.ts
git commit -m "feat: add import preparation domain types"
```

## Task 2: Storage Cache for Prepared Imports

**Files:**
- Create: `packages/storage/src/import-preparation-cache.ts`
- Modify: `packages/storage/src/store.ts`
- Test: `packages/storage/src/tests/import-preparation-cache.test.ts`
- Test: `packages/storage/src/tests/store.test.ts`

- [ ] **Step 1: Write cache normalization tests**

Create `packages/storage/src/tests/import-preparation-cache.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  createEmptyImportPreparationCache,
  isImportPreparationExpired,
  normalizeImportPreparationCache,
  pruneImportPreparationCache,
} from "../import-preparation-cache.js";

describe("import-preparation-cache", () => {
  test("creates an empty preparation cache shape", () => {
    expect(createEmptyImportPreparationCache()).toEqual({
      records: {},
      locatorIndex: {},
    });
  });

  test("normalizes valid records and drops invalid locator index entries", () => {
    const cache = normalizeImportPreparationCache({
      records: {
        "prep-1": {
          id: "prep-1",
          locator: "anthropics/skills",
          canonicalRepo: "anthropics/skills",
          sourceKind: "git",
          checkoutPath: "/tmp/prep-1",
          sourceId: "anthropics-skills",
          displayName: "skills",
          status: "ready",
          preparedAt: "2026-06-04T00:00:00.000Z",
          expiresAt: "2026-06-05T00:00:00.000Z",
          commitSha: "abc123",
          skillIds: ["review"],
          availableTargets: ["cursor"],
        },
        broken: {
          id: "broken",
          locator: "bad",
        },
      },
      locatorIndex: {
        "anthropics/skills": "prep-1",
        missing: "not-present",
      },
    });

    expect(cache.records["prep-1"]).toMatchObject({
      id: "prep-1",
      locator: "anthropics/skills",
      canonicalRepo: "anthropics/skills",
      sourceKind: "git",
      status: "ready",
      skillIds: ["review"],
      availableTargets: ["cursor"],
    });
    expect(cache.records.broken).toBeUndefined();
    expect(cache.locatorIndex).toEqual({
      "anthropics/skills": "prep-1",
    });
  });

  test("treats elapsed and invalid expiry timestamps as expired", () => {
    expect(isImportPreparationExpired({ expiresAt: "bad" }, new Date("2026-06-04T12:00:00.000Z"))).toBe(true);
    expect(isImportPreparationExpired({ expiresAt: "2026-06-04T00:00:00.000Z" }, new Date("2026-06-04T12:00:00.000Z"))).toBe(true);
    expect(isImportPreparationExpired({ expiresAt: "2026-06-05T00:00:00.000Z" }, new Date("2026-06-04T12:00:00.000Z"))).toBe(false);
  });

  test("prunes expired records and limits retained records by preparedAt", () => {
    const cache = normalizeImportPreparationCache({
      records: Object.fromEntries(
        Array.from({ length: 14 }, (_, index) => {
          const id = `prep-${index}`;
          return [id, {
            id,
            locator: `owner/repo-${index}`,
            canonicalRepo: `owner/repo-${index}`,
            sourceKind: "git",
            checkoutPath: `/tmp/${id}`,
            sourceId: `owner-repo-${index}`,
            displayName: `repo-${index}`,
            status: "ready",
            preparedAt: `2026-06-04T00:${String(index).padStart(2, "0")}:00.000Z`,
            expiresAt: "2026-06-05T00:00:00.000Z",
            skillIds: [],
            availableTargets: [],
          }];
        }),
      ),
      locatorIndex: {},
    });

    const pruned = pruneImportPreparationCache(cache, {
      now: new Date("2026-06-04T12:00:00.000Z"),
      maxRecords: 12,
    });

    expect(Object.keys(pruned.records)).toHaveLength(12);
    expect(pruned.records["prep-0"]).toBeUndefined();
    expect(pruned.records["prep-1"]).toBeUndefined();
    expect(pruned.records["prep-13"]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- packages/storage/src/tests/import-preparation-cache.test.ts
```

Expected: FAIL with module not found for `../import-preparation-cache.js`.

- [ ] **Step 3: Implement cache normalization**

Create `packages/storage/src/import-preparation-cache.ts`:

```ts
import type {
  DeploymentTargetId,
  ImportPreparationCache,
  ImportPreparationRecord,
  ImportPreparationStatus,
  SourceKind,
} from "@skill-flow/domain/types";

const PREPARATION_STATUSES = new Set<ImportPreparationStatus>([
  "preparing",
  "ready",
  "committing",
  "failed",
  "stale",
]);

const SOURCE_KINDS = new Set<SourceKind>(["git", "local", "clawhub", "virtual"]);

export function createEmptyImportPreparationCache(): ImportPreparationCache {
  return {
    records: {},
    locatorIndex: {},
  };
}

export function normalizeImportPreparationCache(value: unknown): ImportPreparationCache {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return createEmptyImportPreparationCache();
  }

  const candidate = value as Record<string, unknown>;
  const records = normalizeRecords(candidate.records);
  const locatorIndex = normalizeLocatorIndex(candidate.locatorIndex, records);
  return { records, locatorIndex };
}

export function isImportPreparationExpired(
  entry: Pick<ImportPreparationRecord, "expiresAt"> | { expiresAt: string },
  now = new Date(),
): boolean {
  const expiresAt = Date.parse(entry.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return true;
  }
  return expiresAt <= now.getTime();
}

export function pruneImportPreparationCache(
  cache: ImportPreparationCache,
  options: { now?: Date; maxRecords?: number } = {},
): ImportPreparationCache {
  const now = options.now ?? new Date();
  const maxRecords = options.maxRecords ?? 12;
  const retained = Object.values(cache.records)
    .filter((record) => record.status === "committing" || !isImportPreparationExpired(record, now))
    .sort((left, right) => Date.parse(right.preparedAt) - Date.parse(left.preparedAt))
    .slice(0, maxRecords);

  const records = Object.fromEntries(retained.map((record) => [record.id, record]));
  const locatorIndex = Object.fromEntries(
    Object.entries(cache.locatorIndex).filter(([, id]) => records[id]),
  );
  return { records, locatorIndex };
}

function normalizeRecords(value: unknown): Record<string, ImportPreparationRecord> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([id, record]) => {
      const normalized = normalizeRecord(id, record);
      return normalized ? [[id, normalized] as const] : [];
    }),
  );
}

function normalizeRecord(id: string, value: unknown): ImportPreparationRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const locator = stringValue(candidate.locator);
  const canonicalRepo = stringValue(candidate.canonicalRepo);
  const sourceKind = sourceKindValue(candidate.sourceKind);
  const checkoutPath = stringValue(candidate.checkoutPath);
  const sourceId = stringValue(candidate.sourceId);
  const displayName = stringValue(candidate.displayName);
  const status = statusValue(candidate.status);
  const preparedAt = stringValue(candidate.preparedAt);
  const expiresAt = stringValue(candidate.expiresAt);

  if (!locator || !canonicalRepo || !sourceKind || !checkoutPath || !sourceId || !displayName || !status || !preparedAt || !expiresAt) {
    return undefined;
  }

  return {
    id,
    locator,
    canonicalRepo,
    sourceKind,
    checkoutPath,
    sourceId,
    displayName,
    ...(stringValue(candidate.requestedPath) ? { requestedPath: stringValue(candidate.requestedPath)! } : {}),
    status,
    preparedAt,
    expiresAt,
    ...(stringValue(candidate.commitSha) ? { commitSha: stringValue(candidate.commitSha)! } : {}),
    skillIds: stringArray(candidate.skillIds),
    availableTargets: stringArray(candidate.availableTargets) as DeploymentTargetId[],
    ...(normalizeFailure(candidate.failure) ? { failure: normalizeFailure(candidate.failure)! } : {}),
  };
}

function normalizeLocatorIndex(
  value: unknown,
  records: Record<string, ImportPreparationRecord>,
): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(([locator, id]) =>
      typeof locator === "string" && typeof id === "string" && Boolean(records[id]),
    ) as Array<[string, string]>,
  );
}

function normalizeFailure(value: unknown): ImportPreparationRecord["failure"] | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const reasonCode = stringValue(candidate.reasonCode);
  const retryable = typeof candidate.retryable === "boolean" ? candidate.retryable : undefined;
  const message = stringValue(candidate.message);
  if (!reasonCode || retryable === undefined || !message) {
    return undefined;
  }
  return { reasonCode, retryable, message };
}

function statusValue(value: unknown): ImportPreparationStatus | undefined {
  return typeof value === "string" && PREPARATION_STATUSES.has(value as ImportPreparationStatus)
    ? value as ImportPreparationStatus
    : undefined;
}

function sourceKindValue(value: unknown): SourceKind | undefined {
  return typeof value === "string" && SOURCE_KINDS.has(value as SourceKind)
    ? value as SourceKind
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
```

- [ ] **Step 4: Add store tests for preparation paths and persistence**

Append to `packages/storage/src/tests/store.test.ts`:

```ts
  test("persists import preparation records separately from import data cache", async () => {
    const store = new StateStore(stateRoot);
    await store.writeImportPreparationRecord({
      id: "prep-1",
      locator: "anthropics/skills",
      canonicalRepo: "anthropics/skills",
      sourceKind: "git",
      checkoutPath: store.getImportPreparationCheckoutPath("prep-1"),
      sourceId: "anthropics-skills",
      displayName: "skills",
      status: "ready",
      preparedAt: "2026-06-04T00:00:00.000Z",
      expiresAt: "2026-06-05T00:00:00.000Z",
      skillIds: ["review"],
      availableTargets: ["cursor"],
    });

    await expect(fs.stat(store.importPreparationPath)).resolves.toBeTruthy();
    expect(store.getImportPreparationCheckoutPath("prep-1")).toContain("import-preparations/prep-1");
    expect(await store.readImportPreparationCache()).toMatchObject({
      records: {
        "prep-1": {
          locator: "anthropics/skills",
          status: "ready",
        },
      },
      locatorIndex: {
        "anthropics/skills": "prep-1",
      },
    });
    expect(await store.readImportDataCache()).toEqual({
      searches: {},
      repos: {},
      recommendations: {},
    });
  });
```

- [ ] **Step 5: Implement store preparation methods**

Modify `packages/storage/src/store.ts` imports:

```ts
  ImportPreparationCache,
  ImportPreparationRecord,
```

Add import:

```ts
import {
  createEmptyImportPreparationCache,
  normalizeImportPreparationCache,
  pruneImportPreparationCache,
} from "./import-preparation-cache.js";
```

Add getters near `importDataPath`:

```ts
  get importPreparationPath(): string {
    return path.join(this.catalogStateRoot, "import-preparations.json");
  }

  get importPreparationCheckoutRoot(): string {
    return path.join(this.catalogStateRoot, "import-preparations");
  }

  getImportPreparationCheckoutPath(preparationId: string): string {
    return path.join(this.importPreparationCheckoutRoot, preparationId);
  }
```

Add public methods near import data methods:

```ts
  async readImportPreparationCache(): Promise<ImportPreparationCache> {
    return this.withIoLock(async () => {
      await this.init();
      return this.readImportPreparationCacheRaw();
    });
  }

  async writeImportPreparationCache(cache: ImportPreparationCache): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      await writeJsonFile(this.importPreparationPath, normalizeImportPreparationCache(cache));
    });
  }

  async writeImportPreparationRecord(record: ImportPreparationRecord): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      const cache = await this.readImportPreparationCacheRaw();
      cache.records[record.id] = record;
      cache.locatorIndex[record.locator] = record.id;
      await writeJsonFile(this.importPreparationPath, normalizeImportPreparationCache(cache));
    });
  }

  async deleteImportPreparationRecord(preparationId: string): Promise<void> {
    await this.withIoLock(async () => {
      await this.init();
      const cache = await this.readImportPreparationCacheRaw();
      const record = cache.records[preparationId];
      delete cache.records[preparationId];
      if (record && cache.locatorIndex[record.locator] === preparationId) {
        delete cache.locatorIndex[record.locator];
      }
      await writeJsonFile(this.importPreparationPath, normalizeImportPreparationCache(cache));
    });
  }

  async pruneImportPreparationRecords(options: { maxRecords?: number } = {}): Promise<ImportPreparationCache> {
    return this.withIoLock(async () => {
      await this.init();
      const pruned = pruneImportPreparationCache(await this.readImportPreparationCacheRaw(), options);
      await writeJsonFile(this.importPreparationPath, pruned);
      return pruned;
    });
  }
```

Add raw reader near `readImportDataCacheRaw()`:

```ts
  private async readImportPreparationCacheRaw(): Promise<ImportPreparationCache> {
    if (!(await pathExists(this.importPreparationPath))) {
      return createEmptyImportPreparationCache();
    }
    return normalizeImportPreparationCache(await readJsonFile(this.importPreparationPath));
  }
```

Update initialization to ensure directory:

```ts
    await ensureDir(this.importPreparationCheckoutRoot);
```

- [ ] **Step 6: Run storage tests**

Run:

```bash
npm test -- packages/storage/src/tests/import-preparation-cache.test.ts packages/storage/src/tests/store.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/storage/src/import-preparation-cache.ts packages/storage/src/tests/import-preparation-cache.test.ts packages/storage/src/store.ts packages/storage/src/tests/store.test.ts
git commit -m "feat: persist prepared import cache"
```

## Task 3: SourceService Prepared Checkout Commit

**Files:**
- Modify: `packages/core-engine/src/services/source-service.ts`
- Test: `packages/core-engine/src/tests/source-service.test.ts`

- [ ] **Step 1: Write failing source-service tests**

Append to `packages/core-engine/src/tests/source-service.test.ts`:

```ts
  test("commits an existing prepared checkout without fetching the locator again", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const store = new StateStore(sandbox.stateRoot);
    const inventory = new InventoryService(store);
    const service = new SourceService(store, inventory);
    const preparedPath = path.join(sandbox.sandboxRoot, "prepared-review");
    await fs.cp(repoPath, preparedPath, { recursive: true });

    const result = await service.commitPreparedSource({
      locator: repoPath,
      checkoutPath: preparedPath,
      options: { project: false },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.leafCount).toBe(1);
    await expect(fs.stat(store.getSourceCheckoutPath("local", result.data.manifest.id))).resolves.toBeTruthy();
  });
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- packages/core-engine/src/tests/source-service.test.ts
```

Expected: FAIL with `Property 'commitPreparedSource' does not exist on type 'SourceService'`.

- [ ] **Step 3: Add public prepared commit types**

In `packages/core-engine/src/services/source-service.ts`, add:

```ts
export type PreparedSourceCommitInput = {
  locator: string;
  checkoutPath: string;
  options?: AddSourceOptions;
};

export type PreparedSourceCommitResult = SourceSnapshot & {
  leafs: LockFile["leafInventory"];
  availableTargets: DeploymentTargetName[];
};
```

- [ ] **Step 4: Extract addSource finalization into reusable method**

Add method to `SourceService`:

```ts
  async commitPreparedSource(
    input: PreparedSourceCommitInput,
  ): Promise<Result<PreparedSourceCommitResult>> {
    const options = input.options ?? {};
    const { manifest, lockFile } = await this.store.readState();
    const resolved = this.resolveUniqueLocalSource(
      await this.resolveSource(input.locator, options),
      manifest.sources,
      Boolean(options.sourceIdOverride),
    );
    return this.finalizePreparedCheckout({
      resolved,
      preparedCheckoutPath: input.checkoutPath,
      manifest,
      lockFile,
      options,
      removePreparedOnSuccess: true,
    });
  }
```

Extract the addSource post-fetch logic into:

```ts
  private async finalizePreparedCheckout(args: {
    resolved: SourceResolution;
    preparedCheckoutPath: string;
    manifest: Manifest;
    lockFile: LockFile;
    options: AddSourceOptions;
    removePreparedOnSuccess: boolean;
  }): Promise<Result<PreparedSourceCommitResult>> {
    const checkoutPath = this.store.getSourceCheckoutPath(args.resolved.kind, args.resolved.sourceId);
    const tempFinalPath = `${checkoutPath}.${process.pid}.${crypto.randomUUID()}.commit`;
    await ensureDir(this.store.getSourceRoot(args.resolved.kind));

    const snapshot = await this.buildSnapshot(
      args.resolved.kind,
      args.resolved.sourceId,
      args.resolved.locator,
      args.resolved.displayName,
      args.preparedCheckoutPath,
      args.resolved.requestedPath,
      args.options,
    );
    if (!snapshot.ok) {
      return fail(snapshot.errors, snapshot.warnings);
    }

    if (await pathExists(checkoutPath)) {
      return fail({
        code: "SOURCE_CHECKOUT_PATH_EXISTS",
        message: `Unable to register source '${args.resolved.locator}' because checkout path already exists at ${checkoutPath}.`,
      });
    }

    try {
      await fs.rename(args.preparedCheckoutPath, tempFinalPath);
      await fs.rename(tempFinalPath, checkoutPath);
    } catch (error) {
      await removePath(tempFinalPath).catch(() => {});
      return fail({
        code: "SOURCE_CHECKOUT_MOVE_FAILED",
        message: `Unable to finalize source '${args.resolved.locator}' at ${checkoutPath}: ${String(error)}`,
      });
    }

    snapshot.data.lock.checkoutPath = checkoutPath;
    snapshot.data.leafs = snapshot.data.leafs.map((leaf) => ({
      ...leaf,
      absolutePath: path.join(checkoutPath, leaf.relativePath),
      skillFilePath: path.join(checkoutPath, leaf.relativePath, "SKILL.md"),
    }));

    args.manifest.sources.push(snapshot.data.manifest);
    args.manifest.bindings[args.resolved.sourceId] = { targets: {} };
    args.lockFile.sources.push(snapshot.data.lock);
    args.lockFile.leafInventory.push(...snapshot.data.leafs);

    await this.store.writeState(args.manifest, args.lockFile);

    return ok({
      manifest: snapshot.data.manifest,
      lock: snapshot.data.lock,
      leafCount: snapshot.data.leafs.length,
      invalidLeafCount: snapshot.data.lock.invalidLeafs.length,
      leafs: snapshot.data.leafs,
      availableTargets: getManagedDeployments(args.lockFile).map((deployment) => deployment.target),
    }, snapshot.warnings);
  }
```

Change `addSource()` to call `finalizePreparedCheckout()` after `fetchSource()` instead of duplicating finalization. Preserve existing error codes for fetch failure.

- [ ] **Step 5: Run source-service tests**

Run:

```bash
npm test -- packages/core-engine/src/tests/source-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core-engine/src/services/source-service.ts packages/core-engine/src/tests/source-service.test.ts
git commit -m "feat: commit prepared source checkouts"
```

## Task 4: ImportPreparationService

**Files:**
- Create: `packages/core-engine/src/services/import-preparation-service.ts`
- Test: `packages/core-engine/src/tests/import-preparation-service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `packages/core-engine/src/tests/import-preparation-service.test.ts`:

```ts
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { InventoryService } from "../services/inventory-service.js";
import { ImportPreparationService } from "../services/import-preparation-service.js";
import { SourceService } from "../services/source-service.js";
import { StateStore } from "@skill-flow/storage/store";

function skillDoc(title: string, summary: string): string {
  return `---\nname: ${title}\ndescription: ${summary}\n---\n\n# ${title}\n`;
}

async function createRepo(root: string, files: Record<string, string>): Promise<string> {
  const repoPath = path.join(root, `repo-${crypto.randomUUID()}`);
  for (const [relativePath, content] of Object.entries(files)) {
    const filePath = path.join(repoPath, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf8");
  }
  return repoPath;
}

describe("ImportPreparationService", () => {
  let root = "";
  let stateRoot = "";

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-import-prep-"));
    stateRoot = path.join(root, "state");
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  test("prepares a local source and returns a reusable ready record", async () => {
    const repoPath = await createRepo(root, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const store = new StateStore(stateRoot);
    const sourceService = new SourceService(store, new InventoryService(store));
    const service = new ImportPreparationService(store, sourceService);

    const prepared = await service.prepareImportSource(repoPath);

    expect(prepared.ok).toBe(true);
    if (!prepared.ok || prepared.data.status !== "ready") {
      return;
    }
    expect(prepared.data.preparationId).toMatch(/^prep-/);
    await expect(fs.stat(store.getImportPreparationCheckoutPath(prepared.data.preparationId))).resolves.toBeTruthy();
    const cache = await store.readImportPreparationCache();
    expect(cache.locatorIndex[repoPath]).toBe(prepared.data.preparationId);
  });

  test("reuses a non-expired ready preparation for the same locator", async () => {
    const repoPath = await createRepo(root, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const store = new StateStore(stateRoot);
    const sourceService = new SourceService(store, new InventoryService(store));
    const service = new ImportPreparationService(store, sourceService);

    const first = await service.prepareImportSource(repoPath);
    const second = await service.prepareImportSource(repoPath);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok && first.data.status === "ready" && second.data.status === "ready") {
      expect(second.data.preparationId).toBe(first.data.preparationId);
    }
  });

  test("marks preparation failed when source preview cannot be built", async () => {
    const store = new StateStore(stateRoot);
    const sourceService = new SourceService(store, new InventoryService(store));
    const service = new ImportPreparationService(store, sourceService);

    const prepared = await service.prepareImportSource(path.join(root, "missing"));

    expect(prepared.ok).toBe(true);
    expect(prepared.data.status).toBe("failed");
    if (prepared.data.status === "failed") {
      expect(prepared.data.retryable).toBe(true);
      expect(prepared.data.reasonCode).toBe("LOCAL_PREVIEW_FAILED");
    }
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
npm test -- packages/core-engine/src/tests/import-preparation-service.test.ts
```

Expected: FAIL with module not found for `import-preparation-service.js`.

- [ ] **Step 3: Implement preparation service**

Create `packages/core-engine/src/services/import-preparation-service.ts`:

```ts
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  ImportDraft,
  ImportPreparationRecord,
  ImportPreparationResult,
  ImportSourceResult,
  Result,
} from "@skill-flow/domain/types";
import { StateStore } from "@skill-flow/storage/store";
import {
  isImportPreparationExpired,
  pruneImportPreparationCache,
} from "@skill-flow/storage/import-preparation-cache";
import { copyDirectory, ensureDir, pathExists, removePath } from "@skill-flow/integration/utils/fs";
import { ok } from "@skill-flow/integration/utils/result";
import { deriveSourceId } from "@skill-flow/integration/utils/source-id";
import { SourceService } from "./source-service.js";

const PREPARATION_TTL_MS = 24 * 60 * 60 * 1000;

export class ImportPreparationService {
  private readonly inFlight = new Map<string, Promise<Result<ImportPreparationResult>>>();

  constructor(
    private readonly store: StateStore,
    private readonly sourceService: SourceService,
  ) {}

  async prepareImportSource(locator: string): Promise<Result<ImportPreparationResult>> {
    const normalizedLocator = locator.trim();
    const existing = await this.findReusablePreparation(normalizedLocator);
    if (existing) {
      return ok(existing);
    }

    const inFlight = this.inFlight.get(normalizedLocator);
    if (inFlight) {
      return inFlight;
    }

    const task = this.prepareFreshImportSource(normalizedLocator).finally(() => {
      this.inFlight.delete(normalizedLocator);
    });
    this.inFlight.set(normalizedLocator, task);
    return task;
  }

  async commitPreparedImportSource(
    preparationId: string,
    draft?: ImportDraft,
    applyDraft?: (sourceId: string, draft: ImportDraft | undefined) => Promise<Result<void>>,
  ): Promise<Result<ImportSourceResult>> {
    const cache = await this.store.readImportPreparationCache();
    const record = cache.records[preparationId];
    if (!record || record.status !== "ready" || isImportPreparationExpired(record)) {
      return ok({
        status: "failed",
        reasonCode: "IMPORT_PREPARATION_STALE",
        retryable: true,
      });
    }

    await this.store.writeImportPreparationRecord({ ...record, status: "committing" });
    const committed = await this.sourceService.commitPreparedSource({
      locator: record.locator,
      checkoutPath: record.checkoutPath,
      options: {
        project: false,
        sourceIdOverride: record.sourceId,
        displayNameOverride: record.displayName,
        ...(record.requestedPath ? { path: record.requestedPath } : {}),
      },
    });

    if (!committed.ok) {
      await this.store.writeImportPreparationRecord({
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

    if (applyDraft) {
      const applied = await applyDraft(committed.data.manifest.id, draft);
      if (!applied.ok) {
        return ok({
          status: "failed",
          reasonCode: applied.errors[0]?.code ?? "IMPORT_APPLY_FAILED",
          retryable: true,
        }, [...committed.warnings, ...applied.warnings]);
      }
    }

    await this.store.deleteImportPreparationRecord(preparationId);
    return ok({
      status: "ready",
      sourceId: committed.data.manifest.id,
      canonicalRepo: record.canonicalRepo,
      preparationId,
      usedPreparation: true,
    }, committed.warnings);
  }

  private async findReusablePreparation(locator: string): Promise<ImportPreparationResult | undefined> {
    const cache = await this.store.pruneImportPreparationRecords();
    const preparationId = cache.locatorIndex[locator];
    const record = preparationId ? cache.records[preparationId] : undefined;
    if (!record) {
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

    if (record.status === "failed" && record.failure) {
      return {
        status: "failed",
        preparationId: record.id,
        reasonCode: record.failure.reasonCode,
        retryable: record.failure.retryable,
      };
    }

    return undefined;
  }

  private async prepareFreshImportSource(locator: string): Promise<Result<ImportPreparationResult>> {
    const preparationId = `prep-${crypto.randomUUID()}`;
    const checkoutPath = this.store.getImportPreparationCheckoutPath(preparationId);
    const tempCheckoutPath = `${checkoutPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    const now = new Date();
    const preparedAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + PREPARATION_TTL_MS).toISOString();

    await ensureDir(path.dirname(checkoutPath));
    await removePath(tempCheckoutPath).catch(() => {});

    try {
      const preview = await this.sourceService.previewSource(locator, { project: false });
      if (!preview.ok) {
        const failedRecord = this.buildFailedRecord(preparationId, locator, checkoutPath, preparedAt, expiresAt, preview.errors[0]?.code ?? "IMPORT_PREPARE_FAILED", preview.errors[0]?.message ?? "Unable to prepare import.");
        await this.store.writeImportPreparationRecord(failedRecord);
        return ok({
          status: "failed",
          preparationId,
          reasonCode: failedRecord.failure!.reasonCode,
          retryable: true,
        }, preview.warnings);
      }

      await copyDirectory(locator, tempCheckoutPath);
      await fs.rename(tempCheckoutPath, checkoutPath);
      const record: ImportPreparationRecord = {
        id: preparationId,
        locator,
        canonicalRepo: locator,
        sourceKind: "local",
        checkoutPath,
        sourceId: deriveSourceId(locator),
        displayName: preview.data.displayName,
        ...(preview.data.requestedPath ? { requestedPath: preview.data.requestedPath } : {}),
        status: "ready",
        preparedAt,
        expiresAt,
        skillIds: preview.data.leafs.map((leaf) => leaf.name),
        availableTargets: [],
      };
      await this.store.writeImportPreparationRecord(record);
      await this.store.writeImportPreparationCache(
        pruneImportPreparationCache(await this.store.readImportPreparationCache()),
      );

      return ok({
        status: "ready",
        preparationId,
        locator,
        canonicalRepo: locator,
        preparedAt,
        expiresAt,
      }, preview.warnings);
    } catch (error) {
      await removePath(tempCheckoutPath).catch(() => {});
      await removePath(checkoutPath).catch(() => {});
      const failedRecord = this.buildFailedRecord(preparationId, locator, checkoutPath, preparedAt, expiresAt, "IMPORT_PREPARE_FAILED", String(error));
      await this.store.writeImportPreparationRecord(failedRecord);
      return ok({
        status: "failed",
        preparationId,
        reasonCode: "IMPORT_PREPARE_FAILED",
        retryable: true,
      });
    }
  }

  private buildFailedRecord(
    id: string,
    locator: string,
    checkoutPath: string,
    preparedAt: string,
    expiresAt: string,
    reasonCode: string,
    message: string,
  ): ImportPreparationRecord {
    return {
      id,
      locator,
      canonicalRepo: locator,
      sourceKind: "local",
      checkoutPath,
      sourceId: deriveSourceId(locator),
      displayName: locator,
      status: "failed",
      preparedAt,
      expiresAt,
      skillIds: [],
      availableTargets: [],
      failure: {
        reasonCode,
        retryable: true,
        message,
      },
    };
  }
}
```

After this minimal local implementation passes, replace the local-only `copyDirectory(locator, tempCheckoutPath)` with a `SourceService.prepareSourceCheckout()` helper that supports `git`, `local`, and `clawhub`. The helper signature must be:

```ts
async prepareSourceCheckout(locator: string, options: AddSourceOptions = {}): Promise<Result<{
  locator: string;
  canonicalRepo: string;
  sourceKind: SourceKind;
  sourceId: string;
  displayName: string;
  checkoutPath: string;
  requestedPath?: string;
  leafs: LockFile["leafInventory"];
  availableTargets: DeploymentTargetName[];
  commitSha?: string;
}>>
```

It must call the same resolver and fetch implementation used by `addSource()` and write into the caller-provided preparation checkout path.

- [ ] **Step 4: Run service tests**

Run:

```bash
npm test -- packages/core-engine/src/tests/import-preparation-service.test.ts packages/core-engine/src/tests/source-service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core-engine/src/services/import-preparation-service.ts packages/core-engine/src/tests/import-preparation-service.test.ts packages/core-engine/src/services/source-service.ts packages/core-engine/src/tests/source-service.test.ts
git commit -m "feat: prepare imports before commit"
```

## Task 5: Query Runtime Preparation and Commit APIs

**Files:**
- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/import-page-flow.test.ts`

- [ ] **Step 1: Write failing query tests**

Append to `packages/query/src/tests/import-page-flow.test.ts`:

```ts
  test("previewImportSource returns a ready preparation id for local imports", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const preview = await app.previewImportSource(repoPath);

    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }
    expect(preview.data.preparationId).toMatch(/^prep-/);
    expect(preview.data.preparationStatus).toBe("ready");
  });

  test("importSource uses ready preparation from preview without preparing again", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const preview = await app.previewImportSource(repoPath);
    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.data.status !== "ready") {
      return;
    }

    const imported = await app.importSource(repoPath, {
      selectedSkillIds: ["review"],
      enabledTargets: [],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok || imported.data.status !== "ready") {
      return;
    }
    expect(imported.data.usedPreparation).toBe(true);
    expect(imported.data.preparationId).toBe(preview.data.preparationId);
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm test -- packages/query/src/tests/import-page-flow.test.ts
```

Expected: FAIL because preview data does not include `preparationId` or `usedPreparation`.

- [ ] **Step 3: Wire ImportPreparationService into SkillFlowApp**

In `packages/query/src/runtime.ts`, import:

```ts
import { ImportPreparationService } from "@skill-flow/core-engine/services/import-preparation-service";
```

Add private field initialization where services are constructed:

```ts
  private readonly importPreparationService = new ImportPreparationService(
    this.store,
    this.sourceService,
  );
```

Add public methods:

```ts
  async prepareImportSource(locator: string): Promise<Result<ImportPreparationResult>> {
    return this.importPreparationService.prepareImportSource(locator);
  }

  async commitPreparedImportSource(
    preparationId: string,
    draft?: ImportDraft,
  ): Promise<Result<ImportSourceResult>> {
    return this.runAuditedMutation(
      "import-source",
      {
        preparationId,
        selectedSkillIds: draft?.selectedSkillIds ?? [],
        enabledTargets: draft?.enabledTargets ?? [],
      },
      () => this.commitPreparedImportSourceImpl(preparationId, draft),
    );
  }
```

Add private implementation:

```ts
  private async commitPreparedImportSourceImpl(
    preparationId: string,
    draft?: ImportDraft,
  ): Promise<Result<ImportSourceResult>> {
    return this.importPreparationService.commitPreparedImportSource(
      preparationId,
      draft,
      async (sourceId, importDraft) => {
        const state = await this.store.readState();
        const leafs = state.lockFile.leafInventory.filter((leaf) => leaf.sourceId === sourceId);
        const availableTargets = await this.getAvailableTargets();
        const finalDraft = this.resolveImportDraftForPreparedSource(
          leafs,
          availableTargets,
          undefined,
          importDraft,
        );
        if (!finalDraft.ok) {
          return fail(finalDraft.errors, finalDraft.warnings);
        }
        const applied = await this.applyDraftImpl(sourceId, finalDraft.data, { kind: "global" });
        return applied.ok ? ok(undefined, applied.warnings) : fail(applied.errors, applied.warnings);
      },
    );
  }
```

- [ ] **Step 4: Attach preparation state to preview results**

At the start of `previewImportSourceImpl(locator)`, call:

```ts
    const preparation = await this.importPreparationService.prepareImportSource(locator);
```

When returning a ready preview, include:

```ts
        ...(preparation.ok && preparation.data.status !== "failed"
          ? {
              preparationId: preparation.data.preparationId,
              preparationStatus: preparation.data.status,
              ...(preparation.data.preparedAt ? { preparedAt: preparation.data.preparedAt } : {}),
              ...(preparation.data.expiresAt ? { expiresAt: preparation.data.expiresAt } : {}),
            }
          : {}),
```

When preparation failed but provider preview still succeeds, keep preview `status: "ready"` and set:

```ts
        ...(preparation.ok && preparation.data.status === "failed"
          ? { preparationStatus: "failed" as const }
          : {}),
```

- [ ] **Step 5: Prefer preparation during import**

At the start of `importSourceImpl(locator, draft)`, before `prepareAddSourceImpl()`, add:

```ts
    const cache = await this.store.readImportPreparationCache();
    const preparationId = cache.locatorIndex[normalizedLocator];
    const preparation = preparationId ? cache.records[preparationId] : undefined;
    if (preparation?.status === "ready") {
      return this.commitPreparedImportSourceImpl(preparation.id, draft);
    }
```

Keep the existing direct import path as fallback when no ready preparation exists.

- [ ] **Step 6: Run query tests**

Run:

```bash
npm test -- packages/query/src/tests/import-page-flow.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/query/src/runtime.ts packages/query/src/tests/import-page-flow.test.ts
git commit -m "feat: reuse prepared imports in query runtime"
```

## Task 6: Bridge Protocol and CLI Commands

**Files:**
- Modify: `packages/shared-types/src/protocol.ts`
- Test: `packages/shared-types/src/tests/protocol.test.ts`
- Modify: `apps/cli/src/bridge-command.ts`
- Test: `apps/cli/src/tests/bridge-command.test.ts`

- [ ] **Step 1: Write protocol tests**

Append to `packages/shared-types/src/tests/protocol.test.ts`:

```ts
  test("recognizes import preparation commands", () => {
    expect(isBridgeCommandName("prepare-import-source")).toBe(true);
    expect(isBridgeCommandName("commit-import-source")).toBe(true);
    expect(
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        command: "prepare-import-source",
        payload: { locator: "anthropics/skills" },
      }).command,
    ).toBe("prepare-import-source");
  });
```

- [ ] **Step 2: Run protocol test to verify failure**

Run:

```bash
npm test -- packages/shared-types/src/tests/protocol.test.ts
```

Expected: FAIL because new commands are not recognized.

- [ ] **Step 3: Update protocol command union and validator**

In `packages/shared-types/src/protocol.ts`, add commands:

```ts
  | "prepare-import-source"
  | "commit-import-source"
```

Update error message command list to include:

```text
prepare-import-source, commit-import-source
```

Update `isBridgeCommandName()`:

```ts
    value === "prepare-import-source" ||
    value === "commit-import-source" ||
```

- [ ] **Step 4: Write CLI bridge command tests**

Append to `apps/cli/src/tests/bridge-command.test.ts`:

```ts
  test("accepts valid prepare-import-source payload", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "prepare-import-source",
      payload: { locator: repoPath },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("preparationId");
  });

  test("accepts valid commit-import-source payload", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const prepared = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "prepare-import-source",
      payload: { locator: repoPath },
    });
    const preparationId = (prepared.data as Record<string, unknown>).preparationId as string;

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "commit-import-source",
      payload: {
        preparationId,
        draft: {
          selectedSkillIds: ["review"],
          enabledTargets: [],
        },
      },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("status", "ready");
    expect(response.data).toHaveProperty("usedPreparation", true);
  });
```

- [ ] **Step 5: Implement CLI bridge handlers**

In `apps/cli/src/bridge-command.ts`, add cases before `preview-import-source`:

```ts
      case "prepare-import-source": {
        const payload = expectObjectPayload(request.payload, "prepare-import-source");
        const locator = expectString(payload.locator, "locator", "prepare-import-source");
        const result = await app.prepareImportSource(locator);
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "commit-import-source": {
        const payload = expectObjectPayload(request.payload, "commit-import-source");
        const preparationId = expectString(payload.preparationId, "preparationId", "commit-import-source");
        const draft = expectOptionalImportDraft(payload.draft);
        const result = await app.commitPreparedImportSource(preparationId, draft);
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
```

- [ ] **Step 6: Run protocol and CLI tests**

Run:

```bash
npm test -- packages/shared-types/src/tests/protocol.test.ts apps/cli/src/tests/bridge-command.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/protocol.ts packages/shared-types/src/tests/protocol.test.ts apps/cli/src/bridge-command.ts apps/cli/src/tests/bridge-command.test.ts
git commit -m "feat: expose import preparation bridge commands"
```

## Task 7: Desktop Bridge Wiring

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopQuerying.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeQueryFacade.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`

- [ ] **Step 1: Write bridge client tests**

Append to `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`:

```swift
    func testPrepareImportSourceSendsExpectedPayload() async throws {
        let script = """
        const request = JSON.parse(process.argv[2])
        if (request.command !== "prepare-import-source") {
          throw new Error(`unexpected command ${request.command}`)
        }
        if (request.payload.locator !== "anthropics/skills") {
          throw new Error(`unexpected locator ${request.payload.locator}`)
        }
        console.log(JSON.stringify({
          protocolVersion: "1.0",
          requestId: request.requestId,
          command: request.command,
          ok: true,
          data: { status: "ready", preparationId: "prep-1" },
          warnings: [],
          errors: []
        }))
        """
        let client = try makeClient(script: script)

        let response = try await client.prepareImportSource(locator: "anthropics/skills")

        XCTAssertTrue(response.ok)
        XCTAssertEqual(response.command, .prepareImportSource)
    }

    func testCommitImportSourceSendsExpectedPayload() async throws {
        let script = """
        const request = JSON.parse(process.argv[2])
        if (request.command !== "commit-import-source") {
          throw new Error(`unexpected command ${request.command}`)
        }
        if (request.payload.preparationId !== "prep-1") {
          throw new Error(`unexpected preparationId ${request.payload.preparationId}`)
        }
        if (request.payload.draft.selectedSkillIds[0] !== "review") {
          throw new Error("missing selected skill")
        }
        console.log(JSON.stringify({
          protocolVersion: "1.0",
          requestId: request.requestId,
          command: request.command,
          ok: true,
          data: { status: "ready", sourceId: "anthropics-skills", usedPreparation: true },
          warnings: [],
          errors: []
        }))
        """
        let client = try makeClient(script: script)

        let response = try await client.commitImportSource(
            preparationId: "prep-1",
            selectedSkillIds: ["review"],
            enabledTargets: []
        )

        XCTAssertTrue(response.ok)
        XCTAssertEqual(response.command, .commitImportSource)
    }
```

- [ ] **Step 2: Run Swift bridge tests to verify failure**

Run:

```bash
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests
```

Expected: FAIL because new command cases and methods do not exist.

- [ ] **Step 3: Add Swift protocol commands**

In `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`:

```swift
    case prepareImportSource = "prepare-import-source"
    case commitImportSource = "commit-import-source"
```

- [ ] **Step 4: Add bridge client methods**

In `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`:

```swift
    func prepareImportSource(locator: String) async throws -> BridgeResponse {
        try await send(command: .prepareImportSource, payload: ["locator": AnyCodable(locator)])
    }

    func commitImportSource(
        preparationId: String,
        selectedSkillIds: [String],
        enabledTargets: [String]
    ) async throws -> BridgeResponse {
        try await send(
            command: .commitImportSource,
            payload: [
                "preparationId": AnyCodable(preparationId),
                "draft": AnyCodable([
                    "selectedSkillIds": selectedSkillIds,
                    "enabledTargets": enabledTargets,
                ]),
            ]
        )
    }
```

- [ ] **Step 5: Update desktop protocols and facade**

In `DesktopQuerying.swift`:

```swift
    func prepareImportSource(locator: String) async throws -> BridgeResponse
```

In `DesktopCommanding.swift`:

```swift
    func commitImportSource(preparationId: String, selectedSkillIds: [String], enabledTargets: [String]) async throws -> BridgeResponse
```

In `DesktopBridgeQueryFacade.swift`:

```swift
    func prepareImportSource(locator: String) async throws -> BridgeResponse { try await bridgeClient.prepareImportSource(locator: locator) }
```

- [ ] **Step 6: Run Swift bridge tests**

Run:

```bash
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopQuerying.swift apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeQueryFacade.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift
git commit -m "feat: wire desktop import preparation bridge"
```

## Task 8: Desktop View Model Preparation State

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift`

- [ ] **Step 1: Write view model tests for preparation-aware import**

Append to `WorkflowCoverageTests.swift` near import workflow tests:

```swift
    func testImportGroupCommitsReadyPreparationWhenPreviewPreparedIt() async {
        let fixture = DesktopRuntimeFixture()
        fixture.enqueueResponse(command: .previewImportSource, data: [
            "status": "ready",
            "locator": "anthropics/skills",
            "canonicalRepo": "anthropics/skills",
            "preparationId": "prep-1",
            "preparationStatus": "ready",
            "selectedSkillIds": ["review"],
            "enabledTargets": [],
            "skills": [
                ["id": "review", "title": "Review", "summary": "Review code.", "selectedByDefault": true]
            ],
            "targets": [],
        ])
        fixture.enqueueResponse(command: .commitImportSource, data: [
            "status": "ready",
            "sourceId": "anthropics-skills",
            "canonicalRepo": "anthropics/skills",
            "preparationId": "prep-1",
            "usedPreparation": true,
        ])
        let model = MainViewModel(runtime: fixture.runtime)
        await model.loadRecommendedImportGroups()

        await model.previewImportGroupIfNeeded("anthropics-skills")
        await model.importImportGroup(
            groupId: "anthropics-skills",
            locator: "anthropics/skills",
            selectedSkillIds: ["review"],
            enabledTargets: []
        )

        let commands = fixture.loggedRequests().map(\\.command)
        XCTAssertTrue(commands.contains("preview-import-source"))
        XCTAssertTrue(commands.contains("commit-import-source"))
        XCTAssertFalse(commands.contains("import-source"))
    }
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd apps/desktop-mac && swift test --filter WorkflowCoverageTests/testImportGroupCommitsReadyPreparationWhenPreviewPreparedIt
```

Expected: FAIL because view model still calls `import-source`.

- [ ] **Step 3: Store preparation fields in import card model**

In `MainViewModel.swift`, extend the import group item/card backing model with:

```swift
    var preparationId: String?
    var preparationStatus: String?
    var preparedAt: String?
    var expiresAt: String?
```

In `applyImportPreviewPayload(...)`, parse:

```swift
        let preparationId = payload["preparationId"] as? String
        let preparationStatus = payload["preparationStatus"] as? String
        let preparedAt = payload["preparedAt"] as? String
        let expiresAt = payload["expiresAt"] as? String
```

Then assign these fields to the updated item.

- [ ] **Step 4: Commit prepared import when ready**

In `importImportGroup(...)`, before `commandFacade.importSource(...)`, resolve:

```swift
            let item = importGroupItem(id: groupId)
            let response: BridgeResponse
            if let preparationId = item?.preparationId,
               item?.preparationStatus == "ready" {
                response = try await commandFacade.commitImportSource(
                    preparationId: preparationId,
                    selectedSkillIds: finalSelectedSkillIds,
                    enabledTargets: finalEnabledTargets
                )
            } else {
                response = try await commandFacade.importSource(
                    locator: locator,
                    selectedSkillIds: finalSelectedSkillIds,
                    enabledTargets: finalEnabledTargets
                )
            }
```

Remove the old unconditional `let response = try await commandFacade.importSource(...)`.

- [ ] **Step 5: Make post-import refresh non-blocking**

Replace:

```swift
            cancelDeferredDraftSync()
            await synchronizeState(
                refreshDoctor: true,
                inspectSourceId: sourceId.nonEmpty
            )
            if currentRoute != .importPage, let sourceId = sourceId.nonEmpty {
                routeState?.view.currentRoute = .detail(sourceId: sourceId)
            }
            showToast(style: .success, text: localizedText("toast.import.success"))
```

with:

```swift
            cancelDeferredDraftSync()
            importingImportGroupId = nil
            showToast(style: .success, text: localizedText("toast.import.success"))
            Task { [weak self] in
                guard let self else { return }
                await self.synchronizeState(
                    refreshDoctor: true,
                    inspectSourceId: sourceId.nonEmpty
                )
                if self.currentRoute != .importPage, let sourceId = sourceId.nonEmpty {
                    self.routeState?.view.currentRoute = .detail(sourceId: sourceId)
                }
            }
```

Change the `defer { importingImportGroupId = nil }` block to avoid double clearing:

```swift
        defer {
            if importingImportGroupId == groupId {
                importingImportGroupId = nil
            }
        }
```

- [ ] **Step 6: Run view model tests**

Run:

```bash
cd apps/desktop-mac && swift test --filter WorkflowCoverageTests
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift
git commit -m "feat: commit prepared imports from desktop"
```

## Task 9: Desktop Import UI States and Bounded Preparation

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift`

- [ ] **Step 1: Write bounded preview test**

Append to `ImportScreenContainerTests.swift`:

```swift
    func testPreviewGroupsUsesBoundedConcurrency() async {
        let model = MainViewModel(runtime: .previewDelayFixture(delayNanoseconds: 200_000_000))
        let container = ImportScreenContainer(mainViewModel: model)
        let start = Date()

        await container.previewGroupsIfNeeded([
            "anthropics-skills",
            "openai-cookbook",
            "vercel-ai",
            "owner-fourth",
        ])

        let elapsed = Date().timeIntervalSince(start)
        XCTAssertGreaterThanOrEqual(elapsed, 0.35)
        XCTAssertLessThan(elapsed, 0.65)
    }
```

The fixture should simulate four preview calls and record max active calls. If `previewDelayFixture` does not exist, add it in the same test file as:

```swift
extension DesktopRuntime {
    static func previewDelayFixture(delayNanoseconds: UInt64) -> DesktopRuntime {
        let fixture = DesktopRuntimeFixture()
        fixture.previewDelayNanoseconds = delayNanoseconds
        return fixture.runtime
    }
}
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd apps/desktop-mac && swift test --filter ImportScreenContainerTests/testPreviewGroupsUsesBoundedConcurrency
```

Expected: FAIL because previews currently run with unbounded task group.

- [ ] **Step 3: Limit preview concurrency to two**

Replace `previewGroupsIfNeeded(_:)` with:

```swift
    func previewGroupsIfNeeded(_ groupIds: [String]) async {
        let limit = 2
        var iterator = groupIds.makeIterator()

        await withTaskGroup(of: Void.self) { group in
            for _ in 0..<limit {
                guard let groupId = iterator.next() else { break }
                group.addTask { [mainViewModel] in
                    await mainViewModel.previewImportGroupIfNeeded(groupId)
                }
            }

            while await group.next() != nil {
                guard let groupId = iterator.next() else { continue }
                group.addTask { [mainViewModel] in
                    await mainViewModel.previewImportGroupIfNeeded(groupId)
                }
            }
        }
    }
```

- [ ] **Step 4: Update card labels**

In `GroupCardComponents.swift`, map states:

```swift
        if isImporting {
            return L10n.string("import.button.importing")
        }
        if card.preparationStatus == "preparing" {
            return L10n.string("import.button.preparing")
        }
        if card.preparationStatus == "ready" {
            return L10n.string("import.button.ready")
        }
        return L10n.string("import.button.import")
```

For disabled help:

```swift
        if isAnotherImportActive {
            return L10n.string("import.help.wait_for_active_import")
        }
        if card.preparationStatus == "failed" {
            return L10n.string("import.help.prepare_failed")
        }
        if card.preparationStatus == "stale" {
            return L10n.string("import.help.prepare_stale")
        }
```

- [ ] **Step 5: Add localized strings**

Add to `en.lproj/Localizable.strings`:

```text
"import.button.preparing" = "Preparing...";
"import.button.ready" = "Import";
"import.button.importing" = "Importing...";
"import.help.prepare_failed" = "Preparation failed. Try again.";
"import.help.prepare_stale" = "Preparation expired. Refresh and try again.";
"import.help.wait_for_active_import" = "Another import is running. Wait for it to finish.";
```

Add to `zh-Hans.lproj/Localizable.strings`:

```text
"import.button.preparing" = "准备中...";
"import.button.ready" = "导入";
"import.button.importing" = "导入中...";
"import.help.prepare_failed" = "准备失败。请重试。";
"import.help.prepare_stale" = "准备结果已过期。请刷新后重试。";
"import.help.wait_for_active_import" = "另一个导入正在进行，请等待完成。";
```

Add to `ja.lproj/Localizable.strings`:

```text
"import.button.preparing" = "準備中...";
"import.button.ready" = "インポート";
"import.button.importing" = "インポート中...";
"import.help.prepare_failed" = "準備に失敗しました。もう一度お試しください。";
"import.help.prepare_stale" = "準備結果の期限が切れました。更新してから再試行してください。";
"import.help.wait_for_active_import" = "別のインポートを実行中です。完了までお待ちください。";
```

- [ ] **Step 6: Run UI tests**

Run:

```bash
cd apps/desktop-mac && swift test --filter ImportScreenContainerTests
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings apps/desktop-mac/Tests/SkillFlowDesktopTests/ImportScreenContainerTests.swift
git commit -m "feat: show import preparation state"
```

## Task 10: Full Validation and Packaging

**Files:**
- No source files expected.
- Build artifacts may be generated under `dist/desktop-mac`.

- [ ] **Step 1: Run TypeScript build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run Swift tests**

Run:

```bash
cd apps/desktop-mac && swift test
```

Expected: PASS.

- [ ] **Step 4: Manual timing check**

Run one preview then import through bridge:

```bash
node apps/cli/dist/index.js bridge-command '{"protocolVersion":"1.0","command":"preview-import-source","payload":{"locator":"anthropics/skills"}}'
node apps/cli/dist/index.js bridge-command '{"protocolVersion":"1.0","command":"import-source","payload":{"locator":"anthropics/skills","draft":{"selectedSkillIds":[],"enabledTargets":[]}}}'
```

Expected:

- First response has `status: "ready"` and `preparationId`.
- Second response has `status: "ready"` and `usedPreparation: true`.
- Second command avoids a second network fetch for the same locator when preparation is still valid.

- [ ] **Step 5: Package desktop dev build**

Run the existing packaging command used by the project release scripts:

```bash
npm run package:desktop:dev
```

Expected: PASS and a dev DMG under `dist/desktop-mac/arm64/`.

- [ ] **Step 6: Commit validation-only metadata if scripts changed generated tracked files**

If `git status --short` shows only build artifacts ignored by git, do not commit. If tracked package metadata changed because of build scripts, inspect with:

```bash
git diff -- package.json package-lock.json
```

Expected: no unrelated package metadata change.

## Self-Review

- Spec coverage:
  - 加速每次导入：Task 3-5 复用 prepared checkout；Task 8 后台刷新减少按钮等待。
  - 明确提示：Task 9 加 UI 状态和 localized help。
  - 并发点击无反应：Task 9 显示 active import disabled reason；Task 8 保留单导入串行。
  - 一步到位架构重构：Task 1-9 覆盖 domain、storage、core、query、bridge、desktop。
  - 技术可行性和风险：计划顶部列出当前实现事实、计时和风险控制。

- Placeholder scan:
  - 未发现占位式待补内容。
  - 每个代码改动任务都有文件、测试、实现片段和验证命令。

- Type consistency:
  - `ImportPreparationRecord.id` 对应 cache `records` key 和 bridge `preparationId`。
  - `prepare-import-source` 返回 `ImportPreparationResult`。
  - `commit-import-source` 接收 `preparationId` 和 `draft`，返回 `ImportSourceResult`。
  - Swift command cases 与 TypeScript bridge command names 一致。

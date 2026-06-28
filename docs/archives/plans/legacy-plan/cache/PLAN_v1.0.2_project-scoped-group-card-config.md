# Project Scoped Group Card Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为桌面端 Home 页增加 project scope bar，并让 `Group Card` / `Detail` 的草稿配置按 `global` 与具体 `projectId` 隔离读写。

**Architecture:** 项目列表来自本机 AI 工具历史记录，先做工具数据探测与 parser 聚合，再把最近项目列表和 scoped draft 一起放进 query runtime 的单一事实源。桌面端只持久化当前选中 scope 与最近项目 UI 缓存，真正 draft 事实留在 runtime state 中，通过 bridge 在 `bootstrap` / `list` / `inspect` / `apply` 全链路透传。

**Tech Stack:** SwiftUI, Swift XCTest, TypeScript, Vitest, Node.js bridge helper, query/core-engine/integration/storage packages

---

## Scope Lock

### In Scope

- 基于本机 AI 工具本地记录恢复最近活跃项目列表
- Home 页新增 project scope bar，最多展示 `Global + 10` 个项目
- `Group Card` / `Detail` / `inspect` / `apply` 全部按 scope 读取和保存 draft
- runtime 状态新增 project-scoped drafts
- 桌面端本地设置新增 selected scope 与 recent project cache
- 补 parser、runtime、bridge、桌面 ViewModel、桌面 UI 测试

### Out of Scope

- 扫描机器上的全部 git 仓库
- 项目搜索、分页、展开更多、pin/hide、rename
- Import 页推荐逻辑调整
- TUI/CLI 交互界面增加 scope 选择器

### Confirmed Omissions Fixed In This Revision

- `inspect` 也必须接收 scope，否则 Home 与 Detail 会读到不同 draft
- Swift 侧 `BridgeClient` / `DesktopCommanding` / `BridgeProtocol` 需要新增 scope payload 读写
- Swift 侧 `DesktopQuerying` / `DesktopBridgeQueryFacade` / `fetchInspectResponse()` 也要同步带 scope
- project-scoped draft 的真实落点应进 runtime shared preferences，而不是 `UserDefaults`
- `packages/shared-types/src/protocol.ts` 目前只定义通用 bridge 信封，不定义业务 payload；这次不需要改协议版本，也不需要为了 scope 人工扩展该文件
- `list` 刷新后必须重新校验当前已选 project 是否仍在 recent projects 中，否则桌面端会停在失效 scope
- `listWorkflows()` 的 bridge 返回结构也要扩展 recent projects / selected scope；不能只改 bootstrap
- `MainViewModel.parseBootstrapData()` / `applyList()` / `applyPostApplyResponse()` 都要补最近项目和 scope 同步，否则 UI 不会刷新

## File Structure

### Existing files to modify

- `packages/domain/src/types.ts`
  - 增加 `ProjectScope`, `RecentProject`, `ScopedSourceDrafts`, `SharedPreferences` 新字段
- `packages/storage/src/preferences-store.ts`
  - 归一化 `selectedProjectScope`, `recentProjects`, `projectDrafts`
- `packages/query/src/config-coordinator.ts`
  - bootstrap 输出 recent projects 与 scoped drafts 初始数据
- `packages/query/src/runtime.ts`
  - scope-aware `bootstrapWorkspaceState`, `listWorkflows`, `inspectSource`, `applyDraft`
- `apps/cli/src/bridge-command.ts`
  - 解析和透传 `scope`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
  - 新增 scope JSON 解码模型
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`
  - `apply`/`inspect` 新增 scope 参数
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopQuerying.swift`
  - `inspect` 新增 scope 参数
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
  - 构造 scope-aware payload
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeQueryFacade.swift`
  - 透传 scope-aware `inspect`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeCommandFacade.swift`
  - 透传 scope-aware `apply`
- `apps/desktop-mac/Sources/DesktopApp/Store/SettingsState.swift`
  - 新增 `selectedProjectScope` / `recentProjectScopes`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopSettingsStore.swift`
  - 持久化 scope 与 recent project cache
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
  - working draft、save state、detail/home 数据改为 scope-aware，并同步 bootstrap/list/apply 返回的 scope state
- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreenContainer.swift`
  - 暴露 recent projects 与 scope 切换 action
- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
  - 在 tag filter bar 上方渲染 scope bar

### New files to create

- `packages/integration/src/project-observations.ts`
  - 工具目录探测、parser 调度、观测记录归一化
- `packages/integration/src/tests/project-observations.test.ts`
  - parser 与聚合单测
- `packages/core-engine/src/services/recent-project-service.ts`
  - 最近项目聚合服务
- `packages/core-engine/src/tests/recent-project-service.test.ts`
  - 聚合服务单测
- `packages/query/src/tests/project-scoped-drafts.test.ts`
  - runtime scope 行为集成测试
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelProjectScopeTests.swift`
  - scope 选择、隔离、回退、Home/Detail 一致性测试

## Product Rules

1. 项目列表只来自本机 AI 工具已经写入的 session/log/sqlite 数据。
2. scope 只有两类：`global` 与 `project(projectId)`。
3. `Global` 永远可选，recent projects 只显示最近活跃 10 项。
4. `selectedLeafIds` 与 `enabledTargets` 都必须按 scope 隔离。
5. 进入从未保存过 draft 的项目时，读取“重置态”，即从当前 summary 重新生成初始 draft。
6. 项目不再出现在 recent list 时，只隐藏入口，不删除它在 runtime 中已有的 project draft。

## ASCII UI

### Home layout

```text
+--------------------------------------------------------------------------------------+
| Skill Flow                                              [Search............] [Import] |
+--------------------------------------------------------------------------------------+
| Scope:  [ Global ] | [ skill-flow ] [ ai-gateway ] [ infra-panel ] [ mobile-app ]   |
| Tags:   [ #All ] [ #agent ] [ #workflow ] [ #infra ]                                |
+--------------------------------------------------------------------------------------+
| [Group Card A]                  [Group Card B]                  [Group Card C]       |
| Name                            Name                            Name                 |
| Skills  6/8                     Skills  3/5                     Skills  2/4          |
| Targets Claude,Codex            Targets Cursor                  Targets Claude       |
| ...                             ...                             ...                  |
+--------------------------------------------------------------------------------------+
```

### Scope interaction states

```text
Global selected:
[ Global ] | [ skill-flow ] [ ai-gateway ] [ infra-panel ]

Project selected:
[ Global ] | [ skill-flow* ] [ ai-gateway ] [ infra-panel ]

Missing selected project after refresh:
[ Global* ] | [ ai-gateway ] [ infra-panel ]
```

规则：

- scope bar 固定在 tag filter bar 上方
- `Global` 永远在最左侧
- `|` 只是视觉分隔，不可点击
- 最多显示 10 个 project pills，超出直接隐藏
- scope 切换应立即触发全部 group cards 与 detail draft 重算

## Task 1: Define Scope Types And State Storage

**Files:**
- Modify: `packages/domain/src/types.ts`
- Modify: `packages/storage/src/preferences-store.ts`
- Test: `packages/storage/src/tests/preferences-store.test.ts`

- [ ] **Step 1: Write the failing storage tests**

```ts
test("normalizes selected project scope and drops invalid recent projects", async () => {
  const value = normalizeSharedPreferences({
    schemaVersion: 1,
    pinnedSourceIds: ["alpha"],
    selectedProjectScope: { kind: "project", projectId: "repo-a" },
    recentProjects: [
      { projectId: "repo-a", title: "repo-a", lastActivityAt: "2026-03-30T10:00:00.000Z" },
      { projectId: "", title: "bad", lastActivityAt: "2026-03-29T10:00:00.000Z" },
    ],
    projectDrafts: {
      "repo-a": {
        alpha: { selectedLeafIds: ["alpha:a"], enabledTargets: ["codex"] },
      },
    },
  });

  expect(value.selectedProjectScope).toEqual({ kind: "project", projectId: "repo-a" });
  expect(value.recentProjects).toHaveLength(1);
  expect(value.projectDrafts["repo-a"]?.alpha?.enabledTargets).toEqual(["codex"]);
});

test("falls back to global scope when selected project is absent", async () => {
  const value = normalizeSharedPreferences({
    schemaVersion: 1,
    pinnedSourceIds: [],
    selectedProjectScope: { kind: "project", projectId: "missing" },
    recentProjects: [],
    projectDrafts: {},
  });

  expect(value.selectedProjectScope).toEqual({ kind: "global" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest packages/storage/src/tests/preferences-store.test.ts`
Expected: FAIL because `SharedPreferences` and normalization do not know `selectedProjectScope`, `recentProjects`, or `projectDrafts`.

- [ ] **Step 3: Add the minimal domain types**

```ts
export type ProjectScope =
  | { kind: "global" }
  | { kind: "project"; projectId: string };

export type RecentProject = {
  projectId: string;
  title: string;
  lastActivityAt: string;
  tools?: string[];
};

export type ScopedSourceDrafts = Record<string, Record<string, DraftBinding>>;

export type SharedPreferences = {
  schemaVersion: 1;
  pinnedSourceIds: string[];
  selectedProjectScope: ProjectScope;
  recentProjects: RecentProject[];
  projectDrafts: ScopedSourceDrafts;
};
```

- [ ] **Step 4: Normalize the new preferences shape**

```ts
export function createEmptySharedPreferences(): SharedPreferences {
  return {
    schemaVersion: SCHEMA_VERSION,
    pinnedSourceIds: [],
    selectedProjectScope: { kind: "global" },
    recentProjects: [],
    projectDrafts: {},
  };
}

function normalizeProjectScope(
  value: unknown,
  recentProjects: RecentProject[],
): ProjectScope {
  if (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "project" &&
    "projectId" in value &&
    typeof value.projectId === "string" &&
    recentProjects.some((item) => item.projectId === value.projectId)
  ) {
    return { kind: "project", projectId: value.projectId };
  }
  return { kind: "global" };
}
```

- [ ] **Step 5: Run the storage tests**

Run: `pnpm vitest packages/storage/src/tests/preferences-store.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/types.ts packages/storage/src/preferences-store.ts packages/storage/src/tests/preferences-store.test.ts
git commit -m "feat: add project scope preferences state"
```

## Task 2: Build Recent Project Observation Service

**Files:**
- Create: `packages/integration/src/project-observations.ts`
- Create: `packages/integration/src/tests/project-observations.test.ts`
- Create: `packages/core-engine/src/services/recent-project-service.ts`
- Create: `packages/core-engine/src/tests/recent-project-service.test.ts`
- Modify: `packages/integration/src/index.ts`
- Modify: `packages/core-engine/src/index.ts`

- [ ] **Step 1: Write the failing parser and aggregator tests**

```ts
test("prefers codex repository_url and falls back to cwd basename", async () => {
  const records = await collectProjectObservations({
    codexSessions: [
      { session_meta: { payload: { git: { repository_url: "https://github.com/acme/skill-flow" } } } },
      { session_meta: { payload: { cwd: "/tmp/fallback-project" } } },
    ],
  });

  expect(records.map((item) => item.projectId)).toEqual(["acme/skill-flow", "fallback-project"]);
});

test("aggregates by latest activity and truncates to ten projects", () => {
  const recent = aggregateRecentProjects([
    { tool: "codex", projectId: "repo-a", title: "repo-a", observedAt: "2026-03-30T10:00:00.000Z" },
    { tool: "claude-code", projectId: "repo-a", title: "repo-a", observedAt: "2026-03-31T10:00:00.000Z" },
  ]);

  expect(recent[0]).toMatchObject({
    projectId: "repo-a",
    lastActivityAt: "2026-03-31T10:00:00.000Z",
    tools: ["claude-code", "codex"],
  });
});
```

- [ ] **Step 2: Run the new tests**

Run: `pnpm vitest packages/integration/src/tests/project-observations.test.ts packages/core-engine/src/tests/recent-project-service.test.ts`
Expected: FAIL because the observation and aggregation services do not exist.

- [ ] **Step 3: Implement tool observation collection**

```ts
export type ProjectObservation = {
  tool: "claude-code" | "codex" | "gemini-cli" | "opencode";
  projectId: string;
  title: string;
  observedAt: string;
};

export async function collectProjectObservations(homeDir = os.homedir()): Promise<ProjectObservation[]> {
  return [
    ...await collectClaudeObservations(homeDir),
    ...await collectCodexObservations(homeDir),
    ...await collectGeminiObservations(homeDir),
    ...await collectOpencodeObservations(homeDir),
  ];
}
```

- [ ] **Step 4: Implement recent project aggregation**

```ts
export function aggregateRecentProjects(observations: ProjectObservation[]): RecentProject[] {
  const merged = new Map<string, RecentProject>();

  for (const observation of observations) {
    const current = merged.get(observation.projectId);
    const tools = new Set([...(current?.tools ?? []), observation.tool]);
    const lastActivityAt = current && current.lastActivityAt > observation.observedAt
      ? current.lastActivityAt
      : observation.observedAt;

    merged.set(observation.projectId, {
      projectId: observation.projectId,
      title: current?.title ?? observation.title,
      lastActivityAt,
      tools: [...tools].sort(),
    });
  }

  return [...merged.values()]
    .sort((left, right) => right.lastActivityAt.localeCompare(left.lastActivityAt))
    .slice(0, 10);
}
```

- [ ] **Step 5: Run the parser and aggregator tests**

Run: `pnpm vitest packages/integration/src/tests/project-observations.test.ts packages/core-engine/src/tests/recent-project-service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/integration/src/project-observations.ts packages/integration/src/tests/project-observations.test.ts packages/core-engine/src/services/recent-project-service.ts packages/core-engine/src/tests/recent-project-service.test.ts packages/integration/src/index.ts packages/core-engine/src/index.ts
git commit -m "feat: add recent project observation service"
```

## Task 3: Make Query Runtime Scope-Aware

**Files:**
- Modify: `packages/query/src/config-coordinator.ts`
- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/config-coordinator.test.ts`
- Create: `packages/query/src/tests/project-scoped-drafts.test.ts`

- [ ] **Step 1: Write the failing runtime tests**

```ts
test("bootstrap returns recent projects and selected scope", async () => {
  const result = await app.bootstrapWorkspaceState();

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected success");
  expect(result.data.recentProjects[0]?.projectId).toBe("acme/skill-flow");
  expect(result.data.selectedProjectScope).toEqual({ kind: "global" });
});

test("listWorkflows returns recent projects and reconciled selected scope", async () => {
  const result = await app.listWorkflows();

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected success");
  expect(result.data.recentProjects.map((item) => item.projectId)).toEqual(["acme/skill-flow"]);
  expect(result.data.selectedProjectScope).toEqual({ kind: "global" });
});

test("applyDraft(project) only updates the project layer", async () => {
  await app.applyDraft("alpha", { selectedLeafIds: ["alpha:a"], enabledTargets: ["codex"] }, { kind: "project", projectId: "repo-a" });

  const globalInspect = await app.inspectSource("alpha", { kind: "global" });
  const projectInspect = await app.inspectSource("alpha", { kind: "project", projectId: "repo-a" });

  expect(projectInspect.ok && projectInspect.data.draft.enabledTargets).toEqual(["codex"]);
  expect(globalInspect.ok && globalInspect.data.draft.enabledTargets).toEqual(["claude-code"]);
});
```

- [ ] **Step 2: Run the query tests**

Run: `pnpm vitest packages/query/src/tests/config-coordinator.test.ts packages/query/src/tests/project-scoped-drafts.test.ts`
Expected: FAIL because bootstrap, inspect, and apply are still global-only.

- [ ] **Step 3: Extend bootstrap output with recent projects and scoped draft facts**

```ts
export type ConfigBootstrapData = {
  availableTargets: DeploymentTargetName[];
  manifest: Manifest;
  lockFile: LockFile;
  summaries: WorkflowSummary[];
  initialDrafts: Record<string, DraftBinding>;
  audit: DoctorReport;
  recentProjects: RecentProject[];
  selectedProjectScope: ProjectScope;
  projectDrafts: ScopedSourceDrafts;
};
```

- [ ] **Step 4: Add scope-aware draft resolution in runtime**

```ts
private resolveDraftForScope(
  sourceId: string,
  initialDrafts: Record<string, DraftBinding>,
  preferences: SharedPreferences,
  scope: ProjectScope,
): DraftBinding {
  if (scope.kind === "global") {
    return initialDrafts[sourceId] ?? EMPTY_DRAFT;
  }

  return preferences.projectDrafts[scope.projectId]?.[sourceId]
    ?? initialDrafts[sourceId]
    ?? EMPTY_DRAFT;
}
```

- [ ] **Step 5: Thread scope through runtime read/write APIs**

```ts
async inspectSource(sourceId: string, scope: ProjectScope = { kind: "global" }) {
  const boot = await this.bootstrapWorkspaceState();
  if (!boot.ok) return fail(boot.errors, boot.warnings);

  return ok({
    ...existingInspectData,
    draft: this.resolveDraftForScope(sourceId, boot.data.initialDrafts, preferences, scope),
    selectedProjectScope: scope,
  });
}

async listWorkflows(): Promise<Result<{
  summaries: WorkflowSummary[];
  pinnedSourceIds: string[];
  recentProjects: RecentProject[];
  selectedProjectScope: ProjectScope;
}>> {
  ...
}

async applyDraft(
  sourceId: string,
  draft: DraftBinding,
  scope: ProjectScope = { kind: "global" },
): Promise<Result<ApplyDraftResult>> {
  if (scope.kind === "project") {
    return this.writeProjectDraftOnly(sourceId, draft, scope.projectId);
  }
  return this.applyDraftToGlobalState(sourceId, draft);
}
```

- [ ] **Step 6: Reconcile selected scope after bootstrap/list**

```ts
const preferences = normalizeSharedPreferences(await this.store.readPreferences());
const recentProjects = await this.recentProjectService.listRecentProjects();
const selectedProjectScope = normalizeProjectScope(preferences.selectedProjectScope, recentProjects);

await this.store.writePreferences({
  ...preferences,
  selectedProjectScope,
  recentProjects,
});
```

- [ ] **Step 7: Run the query tests**

Run: `pnpm vitest packages/query/src/tests/config-coordinator.test.ts packages/query/src/tests/project-scoped-drafts.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/query/src/config-coordinator.ts packages/query/src/runtime.ts packages/query/src/tests/config-coordinator.test.ts packages/query/src/tests/project-scoped-drafts.test.ts
git commit -m "feat: add scoped draft runtime support"
```

## Task 4: Extend Bridge Commands Without Bumping Protocol Version

**Files:**
- Modify: `apps/cli/src/bridge-command.ts`
- Test: `apps/cli/src/tests/bridge-command.test.ts`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopQuerying.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeCommandFacade.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeQueryFacade.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopRuntimeFacadeTests.swift`

- [ ] **Step 1: Write the failing bridge tests**

```ts
test("apply forwards project scope payload", async () => {
  const response = await executeBridgeRequest(app, {
    protocolVersion: PROTOCOL_VERSION,
    command: "apply",
    payload: {
      sourceId: "alpha",
      scope: { kind: "project", projectId: "repo-a" },
      draft: { selectedLeafIds: ["alpha:a"], enabledTargets: ["codex"] },
    },
  });

  expect(response.ok).toBe(true);
  expect(app.applyDraft).toHaveBeenCalledWith(
    "alpha",
    { selectedLeafIds: ["alpha:a"], enabledTargets: ["codex"] },
    { kind: "project", projectId: "repo-a" },
  );
});
```

```swift
func testApplyEncodesProjectScopePayload() async throws {
    let transport = RecordingBridgeClientTransport()
    let client = BridgeClient(transport: transport)

    _ = try await client.apply(
        sourceId: "alpha",
        scope: .project("repo-a"),
        selectedLeafIds: ["alpha:a"],
        enabledTargets: ["codex"]
    )

    XCTAssertEqual(transport.lastPayload?["scope"]?["kind"] as? String, "project")
    XCTAssertEqual(transport.lastPayload?["scope"]?["projectId"] as? String, "repo-a")
}

func testInspectEncodesProjectScopePayload() async throws {
    let transport = RecordingBridgeClientTransport()
    let client = BridgeClient(transport: transport)

    _ = try await client.inspect(sourceId: "alpha", scope: .project("repo-a"))

    XCTAssertEqual(transport.lastPayload?["scope"]?["kind"] as? String, "project")
    XCTAssertEqual(transport.lastPayload?["scope"]?["projectId"] as? String, "repo-a")
}
```

- [ ] **Step 2: Run the bridge tests**

Run: `pnpm vitest apps/cli/src/tests/bridge-command.test.ts`
Run: `swift test --package-path apps/desktop-mac --filter BridgeClientExecutionTests`
Expected: FAIL because bridge handlers do not accept scope yet.

- [ ] **Step 3: Parse scope in the CLI bridge entry**

```ts
function expectProjectScope(value: JsonValue | undefined): ProjectScope {
  if (!isJsonObject(value) || typeof value.kind !== "string") {
    return { kind: "global" };
  }
  if (value.kind === "project" && typeof value.projectId === "string" && value.projectId.length > 0) {
    return { kind: "project", projectId: value.projectId };
  }
  return { kind: "global" };
}
```

- [ ] **Step 4: Add Swift scope models and payload encoding**

```swift
enum ProjectScopeSelection: Equatable, Codable, Sendable {
    case global
    case project(String)

    enum CodingKeys: String, CodingKey {
        case kind
        case projectId
    }
}
```

```swift
func apply(sourceId: String, scope: ProjectScopeSelection, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
    try await mutationCoordinator.runMutation {
        try await self.send(
            command: .apply,
            payload: [
                "sourceId": AnyCodable(sourceId),
                "scope": AnyCodable(scope.bridgePayload),
                "draft": AnyCodable([
                    "selectedLeafIds": selectedLeafIds,
                    "enabledTargets": enabledTargets,
                ]),
            ]
        )
    }
}
```

```swift
func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse {
    try await send(
        command: .inspect,
        payload: [
            "sourceId": AnyCodable(sourceId),
            "scope": AnyCodable(scope.bridgePayload),
        ]
    )
}
```

- [ ] **Step 5: Run the bridge tests**

Run: `pnpm vitest apps/cli/src/tests/bridge-command.test.ts`
Run: `swift test --package-path apps/desktop-mac --filter "BridgeClientExecutionTests|DesktopRuntimeFacadeTests"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/bridge-command.ts apps/cli/src/tests/bridge-command.test.ts apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopQuerying.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeCommandFacade.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeQueryFacade.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopRuntimeFacadeTests.swift
git commit -m "feat: pass project scope through bridge payloads"
```

## Task 5: Persist Desktop Scope State And Make MainViewModel Scope-Aware

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Store/SettingsState.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopSettingsStore.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsStateTests.swift`
- Create: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelProjectScopeTests.swift`

- [ ] **Step 1: Write the failing Swift tests**

```swift
func testSettingsStorePersistsSelectedProjectScope() {
    let defaults = UserDefaults(suiteName: #function)!
    defaults.removePersistentDomain(forName: #function)
    let store = DesktopSettingsStore(userDefaults: defaults)

    var state = store.load()
    state.selectedProjectScope = .project("repo-a")
    state.recentProjectScopes = [
        .init(projectId: "repo-a", title: "repo-a", lastActivityAt: "2026-03-31T10:00:00.000Z", sourceToolIds: ["codex"])
    ]
    store.save(state)

    XCTAssertEqual(store.load().selectedProjectScope, .project("repo-a"))
}

func testProjectScopedWorkingDraftDoesNotLeakIntoGlobal() async throws {
    let fixture = try TestFixture.install()
    try fixture.reset(state: .baseline)
    let model = try await fixture.makeModel()

    await model.selectProjectScope(.project("repo-a"))
    await model.setTargetEnabled("codex", enabled: true, sourceId: "alpha")
    await model.selectProjectScope(.global)

    XCTAssertFalse(model.isTargetEnabled("codex", sourceId: "alpha"))
}
```

- [ ] **Step 2: Run the Swift tests**

Run: `swift test --package-path apps/desktop-mac --filter "SettingsStateTests|MainViewModelProjectScopeTests"`
Expected: FAIL because desktop state has no project scope fields and `workingDrafts` is keyed only by `sourceId`.

- [ ] **Step 3: Add desktop scope state**

```swift
struct RecentProjectScopeItem: Equatable, Codable {
    var projectId: String
    var title: String
    var lastActivityAt: String
    var sourceToolIds: [String]
}

struct SettingsState: Equatable {
    ...
    var selectedProjectScope: ProjectScopeSelection = .global
    var recentProjectScopes: [RecentProjectScopeItem] = []
}
```

- [ ] **Step 4: Key working drafts and save states by scope plus source**

```swift
private struct ScopedSourceKey: Hashable {
    let scope: ProjectScopeSelection
    let sourceId: String
}

private var workingDrafts: [ScopedSourceKey: DraftState] = [:]
private var saveStateByScopedSource: [ScopedSourceKey: SaveState] = [:]
```

- [ ] **Step 5: Route all draft readers and writers through current scope**

```swift
private func currentProjectScope() -> ProjectScopeSelection {
    routeState?.settings.selectedProjectScope ?? .global
}

private func draft(for sourceId: String?, scope: ProjectScopeSelection? = nil) -> DraftState? {
    let scope = scope ?? currentProjectScope()
    let key = ScopedSourceKey(scope: scope, sourceId: resolveSourceId(sourceId) ?? "")
    ...
}
```

- [ ] **Step 5.1: Sync scope and recent projects from bridge responses**

```swift
private func applyProjectScopeState(
    selectedScope: ProjectScopeSelection,
    recentProjects: [RecentProjectScopeItem]
) {
    routeState?.settings.selectedProjectScope = selectedScope
    routeState?.settings.recentProjectScopes = Array(recentProjects.prefix(10))
}
```

```swift
private func parseBootstrapData(_ value: Any?) {
    ...
    applyProjectScopeState(
        selectedScope: parseSelectedProjectScope(payload),
        recentProjects: parseRecentProjectScopes(payload)
    )
}
```

```swift
private func applyList(_ response: BridgeResponse) {
    ...
    applyProjectScopeState(
        selectedScope: parseSelectedProjectScope(payload),
        recentProjects: parseRecentProjectScopes(payload)
    )
}
```

- [ ] **Step 6: Run the Swift tests**

Run: `swift test --package-path apps/desktop-mac --filter "SettingsStateTests|MainViewModelProjectScopeTests"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Store/SettingsState.swift apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopSettingsStore.swift apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/SettingsStateTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelProjectScopeTests.swift
git commit -m "feat: make desktop drafts scope aware"
```

## Task 6: Add Scope Bar To Home And Verify End-To-End Behavior

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreenContainer.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelProjectScopeTests.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift`

- [ ] **Step 1: Write the failing UI behavior tests**

```swift
func testHomeRendersProjectScopeBarAboveTagFilter() async throws {
    let fixture = try TestFixture.install()
    try fixture.reset(state: .baselineWithRecentProjects)
    let model = try await fixture.makeModel()

    await model.bootstrap()

    XCTAssertEqual(model.recentProjectScopes.map(\.projectId), ["repo-a", "repo-b"])
    XCTAssertEqual(model.selectedProjectScope, .global)
}

func testSelectedProjectFallsBackToGlobalAfterRefreshWhenMissing() async throws {
    let fixture = try TestFixture.install()
    try fixture.reset(state: .baselineWithRecentProjects)
    let model = try await fixture.makeModel()

    await model.selectProjectScope(.project("repo-a"))
    try fixture.reset(state: .baselineWithoutRecentProjects)
    await model.refreshList()

    XCTAssertEqual(model.selectedProjectScope, .global)
}

func testDetailFetchUsesCurrentProjectScope() async throws {
    let fixture = try TestFixture.install()
    try fixture.reset(state: .baselineWithRecentProjects)
    let model = try await fixture.makeModel()

    await model.selectProjectScope(.project("repo-a"))
    await model.selectSource("alpha")

    XCTAssertEqual(fixture.loggedRequests().last?.payload?["scope"]?["projectId"] as? String, "repo-a")
}
```

- [ ] **Step 2: Run the desktop regression tests**

Run: `swift test --package-path apps/desktop-mac --filter "MainViewModelProjectScopeTests|WorkflowCoverageTests"`
Expected: FAIL because Home UI has no scope bar and refresh does not invalidate stale project scope.

- [ ] **Step 3: Expose scope actions from the container**

```swift
func recentProjectScopes() -> [RecentProjectScopeItem] {
    mainViewModel.recentProjectScopes
}

func selectProjectScope(_ scope: ProjectScopeSelection) {
    mainViewModel.selectProjectScope(scope)
}
```

- [ ] **Step 4: Render the scope bar above the tag filter bar**

```swift
private var homeProjectScopeBar: some View {
    ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
            scopePill(title: "Global", isSelected: viewModel.selectedProjectScope == .global) {
                homeContainer.selectProjectScope(.global)
            }

            Rectangle()
                .fill(AppTheme.textMuted(for: theme).opacity(0.25))
                .frame(width: 1, height: 18)

            ForEach(homeContainer.recentProjectScopes(), id: \.projectId) { item in
                scopePill(
                    title: item.title,
                    isSelected: viewModel.selectedProjectScope == .project(item.projectId)
                ) {
                    homeContainer.selectProjectScope(.project(item.projectId))
                }
            }
        }
    }
}
```

- [ ] **Step 5: Verify the full regression slice**

Run: `pnpm vitest packages/integration/src/tests/project-observations.test.ts packages/core-engine/src/tests/recent-project-service.test.ts packages/query/src/tests/config-coordinator.test.ts packages/query/src/tests/project-scoped-drafts.test.ts apps/cli/src/tests/bridge-command.test.ts`
Run: `swift test --package-path apps/desktop-mac --filter "SettingsStateTests|MainViewModelSelectionTests|MainViewModelProjectScopeTests|WorkflowCoverageTests|BridgeClientExecutionTests|DesktopRuntimeFacadeTests"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreenContainer.swift apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelProjectScopeTests.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/WorkflowCoverageTests.swift
git commit -m "feat: add project scope bar to home"
```

## Spec Coverage Check

- Recent project source rule: covered by Task 2
- Scope switch and persistence: covered by Task 5 and Task 6
- Scoped draft isolation for Home and Detail: covered by Task 3 and Task 5
- Bridge/runtime contract changes: covered by Task 3 and Task 4
- Recent 10 project visibility: covered by Task 2 and Task 6
- Refresh fallback when selected project disappears: covered by Task 3 and Task 6
- Desktop inspect/apply/list bridge chain: covered by Task 4, Task 5, and Task 6
- Import page and agent display preference non-regression: covered by Task 6 regression suite

## Placeholder Scan

- No `TODO` / `TBD`
- No “write tests for the above” style placeholders
- All code steps include concrete types or method signatures
- All verification steps include exact commands and expected outcomes

## Type Consistency Check

- TS side uses `ProjectScope`, Swift side uses `ProjectScopeSelection`
- runtime storage field is consistently `projectDrafts`
- desktop cache field is consistently `recentProjectScopes`
- `apply` / `inspect` are the only bridge commands gaining `scope` payload in this plan
- `list` / `bootstrap` 不接收 scope 参数，但都必须返回 `recentProjects` 和 `selectedProjectScope`
- `packages/shared-types/src/protocol.ts` intentionally stays unchanged because the bridge envelope is unchanged

## Success Criteria

- Home 页顶部出现 `Global | recent projects`
- project 切换后 `Group Card` 与 `Detail` 读取同一 scope draft
- `apply(project)` 不覆盖 global draft，`apply(global)` 不覆盖 project draft
- recent project list 只来自本机 AI 工具历史记录
- 刷新后已失效 project scope 自动回退 `Global`
- Import 页、tag filter、agent display 偏好无回归

## Implementation Checklist

- `apply(global)` 仍走现有真实配置写路径；`apply(project)` 只能写 `projectDrafts[projectId][sourceId]`，不能改 manifest/lock 的 global 绑定
- `inspect`、`apply` 两条 Swift bridge 链都必须显式透传 scope；只改其中一条会导致 Home 和 Detail 不一致
- `bootstrap`、`list`、`apply` 返回后，`MainViewModel` 必须同步 `selectedProjectScope` 和 `recentProjectScopes`
- `workingDrafts` 和保存态都必须按 `scope + sourceId` 双键存储，不能残留单维 `sourceId` 键控
- `project` scope 未命中已保存 draft 时，返回值必须来自当前 summary 的重置态，不能继承 global working draft 或上一个 project draft
- 最近项目掉出前 10 时，不删除其 `projectDrafts`；但如果它正被选中，下一次 `bootstrap` 或 `list` 后必须回退 `Global`
- `listWorkflows()` 与 `bootstrapWorkspaceState()` 返回结构必须保持一致的 scope 元数据，否则刷新与首次加载行为会分叉
- 桌面端 `UserDefaults` 只保存 UI 选择态和 recent project cache，不能变成 scoped draft 的事实源

Plan complete and saved to `docs/plan/PLAN_v1.0.2_project-scoped-group-card-config.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

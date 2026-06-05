# State Schema V2 数据结构设计

日期：2026-06-04

## 目标

本文定义 Skill Flow V2 的完整持久化数据结构。

目标不是给现有 V1 字段追加补丁，而是重新明确：

- 哪些数据是权威状态。
- 哪些数据是派生缓存。
- 哪些数据只是一次导入过程中的临时状态。
- source、skill leaf、target deployment、import preview、prepare、commit 之间如何关联。
- V1 数据如何迁移到 V2。

## 状态根目录

默认状态根目录：

```text
~/.skillflow
```

环境变量覆盖：

```text
SKILL_FLOW_STATE_ROOT=/path/to/state
```

V2 仍使用同一个 state root，不迁移到新目录。迁移工具只转换 state root 内的文件，不把 agent target 目录作为权威源。

## 文件分层

### 权威文件

这些文件是 V2 的权威数据。迁移必须保留并转换。

```text
manifest.json
lock.json
preferences.json
collections.json
```

### 权威内容目录

这些目录保存 V2 中被 materialize 的实体内容。迁移必须保留。

```text
source/collection/*
```

`source/collection/*` 用于保存技能集合确认时冻结下来的 skill 内容。原始 source 后续删除、更新或不可访问，不应改变这里已经确认的内容。

### 可重建缓存

这些文件可以在迁移时删除，由新版 runtime 重新生成。

```text
catalog/import-data.json
catalog/source-metadata.json
catalog/import-preparations.json
catalog/import-preparations/*
catalog/git/*
```

### 非权威部署结果

这些目录不是权威数据源。迁移后通过 apply/repair 与 `lock.json` 对齐。

```text
~/.codex/skills
~/.claude/skills
~/.cursor/skills
其他 target 写入目录
```

### 桌面端偏好

桌面端 UserDefaults 只保存 UI 偏好，不参与 V2 state schema：

- 语言
- 主题
- 首页密度
- agent 展示顺序
- 自定义 tag

如需统一管理，后续单独设计 desktop preferences migration，不和本次 state schema migration 混在一起。

## 字段归一化规则

V2 schema 避免把同一语义长期保存为多份字段。实现时按以下规则处理：

- `LeafRecordV2.relativePath` 是 leaf 的 repo path 权威字段。不要再把同一值写入 `selectors.repoPath`。
- `SkillCollectionMemberOriginV2.repoPath` 是 collection member 的原始 repo path 权威字段。`MaterializedSkillSnapshotV2` 只描述冻结后的 materialized 内容，不重复保存原始 repo path。
- `ImportPreviewSkillV2.id` 是 legacy 选择值。只有存在额外旧值时才写 `legacyAliases`，不要写总是等于 `id` 的 `legacyId`。
- `ImportPreviewSkillV2.selector` 是提交解析入口。`origin` 只保存 provider/archive 诊断字段，不重复保存 `selector.repoPath`。
- `RepoMetadataCacheEntryV2.identity.canonicalLocator` 是 repo metadata cache 的 canonical identity。不要同时保存顶层 `canonicalLocator`。
- `selectedSkillIds`、`canonicalRepo`、旧 `skillIds` 是边界兼容字段；V2 core model 不消费这些字段。

## 全局约定

### 时间

所有时间使用 ISO 8601 UTC 字符串：

```ts
export type IsoTimestamp = string;
```

### Schema Version

每个权威文件都必须有：

```ts
schemaVersion: 2;
```

缺失 `schemaVersion` 视为 V1。V2 runtime normalizer 必须能读取 V1，但写回时必须写 V2。

### Migration Generation

每次 V1 -> V2 迁移生成一个 generation id，用于判断多个权威文件和 collection materialized 内容是否来自同一次迁移。

```ts
export type MigrationGenerationV2 = string;
```

规则：

- generation id 由迁移服务或 V2 state 初始化流程生成，格式为 `mg_` + base32url random/sha256 值。
- `manifest.json`、`lock.json`、`preferences.json`、`collections.json` 必须写入同一个 `migrationGeneration`。
- 每个 `source/collection/<collectionId>/.skillflow-generation.json` 必须写入同一个 `migrationGeneration`。
- runtime 读取 V2 时如果发现 generation 缺失、不一致，或 staging/marker 残留，返回 `STATE_MIGRATION_INCOMPLETE`，不继续按 current state 运行。
- 新安装 V2 state 也必须生成 `migrationGeneration`。普通 add/import/apply 不改变 `migrationGeneration`；它只描述 state schema generation，不描述业务数据更新时间。

### SourceId

```ts
export type SourceId = string;
```

稳定规则：

- V2 不要求改变现有 source id。
- 迁移 V1 时保留原 `source.id`。
- 新增 source 时继续使用现有 source id 派生策略。
- source id 表示“用户安装的 source 实例”，不是 canonical repo。

### SourceIdentity

```ts
export type SourceIdentityV2 = {
  provider: "github" | "skills" | "local" | "clawhub" | "collection" | string;
  locator: string;
  canonicalLocator: string;
  requestedPath?: string;
  originLocator?: string;
  originRequestedPath?: string;
};
```

说明：

- `locator` 是用户或推荐页请求导入时使用的 locator。
- `canonicalLocator` 是稳定 canonical identity，例如 `github:anthropics/skills`。
- `requestedPath` 表示 repo 内子路径，不拼进 `canonicalLocator`。
- `originLocator` 用于 local import 对应的远端来源。

### SkillLeafId

```ts
export type SkillLeafId = string;
```

稳定规则：

- V2 迁移保留 V1 leaf id。
- leaf id 表示“某个 source 实例下的具体 skill leaf”。
- leaf id 不作为 import preview selector。
- preview 使用 `ImportSkillSelector`，commit 后才得到 leaf id。

### RepoPath

```ts
export type RepoPath = string;
```

规则：

- 使用 POSIX `/`。
- `.` 表示 source 根目录就是一个 skill。
- 不允许绝对路径。
- 不允许 `../`。
- 不允许 GitHub archive root。

### Diagnostics

```ts
export type StateDiagnosticV2 = {
  code: string;
  message: string;
  details?: Record<string, string | number | boolean | string[]>;
};
```

diagnostics 用于迁移、导入、校验，不作为业务流程分支的唯一依据。

## manifest.json V2

职责：

- 记录用户声明安装了哪些 source。
- 记录 source 的展示名、选择模式、启用 target。
- 不记录 checkout path。
- 不记录 leaf content hash。
- 不记录实际部署结果。

结构：

```ts
export type ManifestV2 = {
  schemaVersion: 2;
  migrationGeneration: MigrationGenerationV2;
  generatedAt?: IsoTimestamp;
  sources: SourceManifestRecordV2[];
  bindings: Record<SourceId, SourceBindingV2>;
};
```

### SourceManifestRecordV2

```ts
export type SourceManifestRecordV2 = {
  id: SourceId;
  kind: "local" | "git" | "clawhub" | "collection";
  identity: SourceIdentityV2;
  displayName: string;
  originalDisplayName: string;
  addedAt: IsoTimestamp;
  updatedAt?: IsoTimestamp;
  selectionMode: "all" | "partial";
  status?: "active" | "hidden" | "archived";
  metadata?: {
    title?: string;
    description?: string;
    sourceUrl?: string;
    repoUrl?: string;
  };
};
```

V1 字段映射：

```text
locator              -> identity.locator
requestedPath        -> identity.requestedPath
originLocator        -> identity.originLocator
originRequestedPath  -> identity.originRequestedPath
kind                 -> kind
displayName          -> displayName
originalDisplayName  -> originalDisplayName
addedAt              -> addedAt
selectionMode        -> selectionMode
```

迁移默认值：

- `identity.provider` 由 `kind + locator` 推导：GitHub locator 为 `"github"`，skills catalog locator 为 `"skills"`，本地路径为 `"local"`，clawhub locator 为 `"clawhub"`，V1 virtual source 为 `"collection"`。
- `identity.canonicalLocator` 由 locator resolver 计算。无法可靠计算时，使用原 locator，并记录 `STATE_MIGRATION_CANONICAL_LOCATOR_FALLBACK` warning。
- `updatedAt` 使用迁移时间。
- `selectionMode` 缺失时按 binding 是否覆盖全部 leaf 推断；无法推断时使用 `"partial"` 并记录 warning。

### SourceBindingV2

```ts
export type SourceBindingV2 = {
  selectedLeafIds: SkillLeafId[];
  targets: Record<DeploymentTargetId, TargetBindingV2>;
};
```

### TargetBindingV2

```ts
export type TargetBindingV2 = {
  enabled: boolean;
  leafIds: SkillLeafId[];
  strategy?: "symlink" | "copy";
  updatedAt?: IsoTimestamp;
};
```

规则：

- `selectedLeafIds` 是 source 级选择。
- `targets[target].leafIds` 是 target 级实际启用 leaf。
- 每个 enabled target 的 `leafIds` 必须是 `selectedLeafIds` 的子集。
- 如果 `selectionMode === "all"`，`selectedLeafIds` 可以由 lock leaf inventory 推导，但 V2 写入时建议显式保存，减少歧义。

## lock.json V2

职责：

- 记录 source 的实际解析结果。
- 记录 leaf inventory。
- 记录部署 projection。
- 支撑 doctor/apply/repair。

结构：

```ts
export type LockFileV2 = {
  schemaVersion: 2;
  migrationGeneration: MigrationGenerationV2;
  updatedAt: IsoTimestamp;
  sources: SourceLockRecordV2[];
  leafInventory: LeafRecordV2[];
  projections: ProjectionRecordV2[];
};
```

V2 不再需要单独长期维护 `deployments` 和 `projections` 两套并行结构。迁移期可读 V1 `deployments`，写回时统一写 `projections`。

### SourceLockRecordV2

```ts
export type SourceLockRecordV2 = {
  id: SourceId;
  kind: "local" | "git" | "clawhub" | "collection";
  identity: SourceIdentityV2;
  displayName: string;
  originalDisplayName: string;
  checkoutPath: string;
  updatedAt: IsoTimestamp;
  leafIds: SkillLeafId[];
  invalidLeafs: InvalidLeafRecordV2[];
  sourceRevision?: SourceRevisionV2;
  contentHash?: string;
  versionMode?: "pinned" | "floating";
  importInfo?: SourceImportInfoV2;
};
```

### SourceRevisionV2

```ts
export type SourceRevisionV2 = {
  commitSha?: string;
  branch?: string;
  packageSlug?: string;
  resolvedVersion?: string;
};
```

V1 字段映射：

```text
commitSha       -> sourceRevision.commitSha
originBranch    -> sourceRevision.branch
packageSlug     -> sourceRevision.packageSlug
resolvedVersion -> sourceRevision.resolvedVersion
```

### SourceImportInfoV2

```ts
export type SourceImportInfoV2 = {
  mode: "explicit-add" | "bootstrap-detected" | "recommended-import" | "local-import";
  importedFromTargets?: DeploymentTargetId[];
  observedTargets?: Array<{
    target: DeploymentTargetId;
    rootPath: string;
    targetPath: string;
  }>;
};
```

V1 字段映射：

```text
importMode           -> importInfo.mode
importedFromTargets  -> importInfo.importedFromTargets
observedTargets      -> importInfo.observedTargets
```

### LeafRecordV2

```ts
export type LeafRecordV2 = {
  id: SkillLeafId;
  sourceId: SourceId;
  name: string;
  linkName: string;
  title: string;
  description: string;
  relativePath: RepoPath;
  absolutePath: string;
  skillFilePath: string;
  contentHash: string;
  metadataWarnings: string[];
  sourceTitle?: string;
  valid: true;
  selectors: LeafSelectorIndexV2;
};
```

### LeafSelectorIndexV2

```ts
export type LeafSelectorIndexV2 = {
  skillName: string;
  linkName: string;
  aliases: string[];
};
```

说明：

- import commit 通过 `repoPath` selector 绑定 leaf 时匹配 `LeafRecordV2.relativePath`。
- `aliases` 可包含历史 linkName 或 provider id，但不作为 preview selector 的主要来源。
- `absolutePath` 和 `skillFilePath` 是 lock runtime snapshot 字段。state root、checkout path 或 collection materialized path 改变后，repair/migration 必须由 `checkoutPath + relativePath` 重建，不能把旧绝对路径当作权威身份。

### InvalidLeafRecordV2

```ts
export type InvalidLeafRecordV2 = {
  path: RepoPath;
  reason: string;
};
```

### ProjectionRecordV2

```ts
export type ProjectionRecordV2 = {
  mode: "managed" | "bootstrap-imported";
  sourceId: SourceId;
  leafId: SkillLeafId;
  target: DeploymentTargetId;
  targetPath: string;
  targetRootPath?: string;
  strategy: "symlink" | "copy";
  status: "active" | "drifted" | "blocked" | "removed";
  contentHash: string;
  appliedAt: IsoTimestamp;
  lastCheckedAt?: IsoTimestamp;
  driftReason?: string;
};
```

V1 映射：

- 如果 V1 有 `projections`，直接迁移并补齐缺失字段。
- 如果 V1 只有 `deployments`，转换为 `mode: "managed"` 的 projections。
- V2 写入时只写 `projections`。

Repair rule:

- repair never trusts old `ProjectionRecordV2.targetPath` as desired state.
- desired projection is recalculated from `ManifestV2.bindings`, current target definitions, `LockFileV2.leafInventory`, and collection member `snapshot`.
- active projection `targetPath` must be inside the current target root.
- unknown targets produce `status: "blocked"` and do not write files.
- disabled leaf projections become `status: "removed"`.
- collection projection `contentHash` comes from materialized snapshot content, not from `origin`.

## preferences.json V2

职责：

- 保存用户偏好。
- 保存最近 project scope。
- 保存 project scoped draft。
- 保存 custom targets 和 agent display order。

结构：

```ts
export type SharedPreferencesV2 = {
  schemaVersion: 2;
  migrationGeneration: MigrationGenerationV2;
  updatedAt?: IsoTimestamp;
  pinnedSourceIds: SourceId[];
  selectedProjectScope: ProjectScopeV2;
  recentProjects: RecentProjectV2[];
  projectDrafts: ScopedSourceDraftsV2;
  customTargets: CustomTargetDefinitionV2[];
  agentDisplayOrder: DeploymentTargetId[];
};
```

### ProjectScopeV2

```ts
export type ProjectScopeV2 =
  | { kind: "global" }
  | { kind: "project"; projectId: string; projectPath?: string };
```

### RecentProjectV2

```ts
export type RecentProjectV2 = {
  projectId: string;
  title: string;
  lastActivityAt: IsoTimestamp;
  projectPath?: string;
  tools?: string[];
};
```

### ScopedSourceDraftsV2

```ts
export type ScopedSourceDraftsV2 = Record<string, Record<SourceId, ProjectSourceDraftV2>>;
```

### ProjectSourceDraftV2

```ts
export type ProjectSourceDraftV2 = {
  enabledTargets: DeploymentTargetId[];
  selectedLeafIds: SkillLeafId[];
};
```

说明：

- project draft 仍以 leaf id 为主，因为它保存的是已安装 source 的后续 apply draft，不是 import preview draft。
- import preview draft 使用 `ImportDraftV2`，不写入 preferences。

### CustomTargetDefinitionV2

```ts
export type CustomTargetDefinitionV2 = {
  id: DeploymentTargetId;
  name: string;
  globalPath: string;
  projectPathTemplate: string;
  strategy: "symlink" | "copy";
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};
```

## collections.json V2

职责：

- 记录技能集合。
- 保存用户确认时的 skill 快照。
- 记录 materialized collection source 与 member leaf 的关系。
- 保留原始 source/leaf 引用用于比较和提示。
- 记录隐藏 source。
- 记录 restore selection。

V2 中，技能集合不再只是 source/leaf ref 的集合。它是一个实体组合。用户确认加入技能集合的 skill 会被冻结到：

```text
~/.skillflow/source/collection/<collectionId>/<memberId>/
```

后续原始 source 更新、删除或对应 leaf 消失，都不会自动改变技能集合中已确认的内容。系统只能提示：

- 原始 skill 已更新。
- 原始 skill 已删除。
- 原始 source 不可访问。
- 当前技能集合快照仍可继续部署。

结构：

```ts
export type SkillCollectionsStateV2 = {
  schemaVersion: 2;
  migrationGeneration: MigrationGenerationV2;
  updatedAt?: IsoTimestamp;
  collections: Record<string, SkillCollectionRecordV2>;
};
```

### SkillCollectionRecordV2

```ts
export type SkillCollectionRecordV2 = {
  id: string;
  displayName: string;
  materializedSourceId: SourceId;
  members: SkillCollectionMemberV2[];
  hiddenSourceIds: SourceId[];
  restoreSelections: Record<SourceId, SkillCollectionRestoreSelectionV2>;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
};
```

### SkillCollectionMemberV2

```ts
export type SkillCollectionMemberV2 = {
  id: string;
  origin: SkillCollectionMemberOriginV2;
  snapshot: MaterializedSkillSnapshotV2;
  updatePolicy: "frozen" | "manual-refresh";
  addedAt: IsoTimestamp;
  refreshedAt?: IsoTimestamp;
};
```

说明：

- V2 第一版要求 `materializedSourceId === id`。这样 collection leaf id、manifest binding、lock source、projection 都使用同一个 source 前缀，避免同一 collection 出现两个 source namespace。
- `id` 是技能集合内 member id，不等于原始 leaf id。
- `origin` 记录来源，用于后续比较。
- `snapshot` 是 collection member 内部字段，语义等价于 materialized snapshot，是部署使用的冻结实体。provider metadata 和 restore selection 不得复用 `snapshot` 这个字段名。
- 默认 `updatePolicy` 为 `"frozen"`。
- `"manual-refresh"` 也不能自动更新内容，只表示 UI 可以主动提示用户刷新。

### SkillCollectionMemberOriginV2

```ts
export type SkillCollectionMemberOriginV2 = {
  sourceId: SourceId;
  leafId: SkillLeafId;
  sourceLocator: string;
  canonicalLocator?: string;
  repoPath: RepoPath;
  contentHashAtCapture: string;
  capturedAt: IsoTimestamp;
};
```

来源引用的作用：

- 检查原 skill 是否仍存在。
- 比较 `contentHash` 是否变化。
- 在用户明确确认时刷新 snapshot。

来源引用不能作为部署内容来源。部署必须读取 `snapshot.materializedPath`。

### MaterializedSkillSnapshotV2

```ts
export type MaterializedSkillSnapshotV2 = {
  leafId: SkillLeafId;
  name: string;
  linkName: string;
  title: string;
  description: string;
  relativePath: RepoPath;
  materializedPath: string;
  skillFilePath: string;
  contentHash: string;
  metadataWarnings: string[];
};
```

说明：

- `leafId` 是 collection source 下的新 leaf id。
- `relativePath` 是 collection source 内路径，必须等于 `memberId` 或 `memberId/...`，不能复用原始 repo path。
- 原始 leaf 的 repo path 只保存在 `SkillCollectionMemberOriginV2.repoPath`，用于比较和展示。
- `materializedPath` 指向 `~/.skillflow/source/collection/<collectionId>/<memberId>/`。
- `contentHash` 是复制到 `materializedPath` 后重新计算的真实 hash。
- 原始 leaf 的后续 hash 变化只产生 diagnostics，不改变这里的 hash。

### SkillCollectionRestoreSelectionV2

```ts
export type SkillCollectionRestoreSelectionV2 = {
  selectedLeafIds: SkillLeafId[];
  enabledTargets: DeploymentTargetId[];
  bestEffort: true;
  diagnostics?: StateDiagnosticV2[];
};
```

说明：

- restore selection 只用于尝试恢复被 collection 隐藏的原 source 选择。
- 它不是部署内容 snapshot，不能作为 collection 部署来源。
- migration 后必须校验 `selectedLeafIds` 是否仍在当前 `lock.leafInventory` 中。
- 无法可靠映射的旧 leaf id 应从可执行 selection 中移除，并写入 diagnostics。

### LegacyVirtualGroupSkillRefV1

V1 兼容读取旧字段：

```ts
export type LegacyVirtualGroupSkillRefV1 = {
  sourceId: SourceId;
  leafId: SkillLeafId;
};
```

迁移时，旧 `includedSkills` 不能直接原样写入 V2。必须转换为 `members`：

1. 为每个旧 ref 生成确定性 mapping。
2. 从 V1 lock 中找到 `sourceId + leafId` 对应 leaf。
3. 将 leaf 内容复制到 `source/collection/<collectionId>/<memberId>/`。
4. 复制后重新计算 materialized 内容 hash。
5. 写入 `members[].origin` 和 `members[].snapshot`。
6. 在 `manifest.json` 和 `lock.json` 中写入对应 `kind: "collection"` 的 materialized source。

确定性 mapping：

```ts
export type LegacyVirtualToCollectionMappingV2 = {
  collectionId: string;
  originSourceId: SourceId;
  originLeafId: SkillLeafId;
  memberIndex: number;
  memberId: string;
  collectionLeafId: SkillLeafId;
};
```

生成规则：

```text
memberId = "member_" + base32url(sha256(collectionId + "\0" + originSourceId + "\0" + originLeafId + "\0" + memberIndex)).slice(0, 16)
collectionLeafId = collectionId + ":" + memberId
```

同一个 V1 virtual group 中如果同一 leaf 被引用多次，`memberIndex` 用于区分。

hash 规则：

- `origin.contentHashAtCapture` 保存 V1 lock 中的 leaf hash。
- `snapshot.contentHash` 保存复制到 `source/collection/*` 后重新计算的 hash。
- 如果复制后的 hash 与 `origin.contentHashAtCapture` 不一致，迁移默认阻塞并返回 `STATE_MIGRATION_COLLECTION_HASH_MISMATCH`。
- 后续可以增加显式 `--allow-dirty-collection-capture` 参数，但第一阶段不默认接受脏内容。

如果原始 leaf 找不到：

- 保留 legacy ref 到 diagnostics。
- group 标记为 migration blocked 或 partial。
- 不静默删除用户确认过的条目。

## catalog/import-data.json V2

职责：

- 缓存推荐列表、搜索结果、repo metadata。
- 不作为权威状态。
- 迁移时可以删除。

结构：

```ts
export type ImportDataCacheV2 = {
  schemaVersion: 2;
  searches: Record<string, ImportSearchSnapshotV2>;
  repos: Record<string, RepoMetadataCacheEntryV2>;
  recommendations: Record<string, ImportRecommendationFeedV2>;
};
```

### RepoMetadataCacheEntryV2

```ts
export type RepoMetadataCacheEntryV2 = {
  checkedAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
  identity: {
    canonicalLocator: string;
    aliases: string[];
    origins: Array<"skills" | "github" | "clawhub" | "local" | string>;
  };
  providers: Partial<Record<string, RepoMetadataProviderEntryV2>>;
  resolved: ResolvedRepoMetadataV2;
};
```

V1 的 `canonicalRepo` 在 V2 中改名为 `canonicalLocator`。迁移不强制转换 cache；建议 prune 后重建。

## catalog/import-preparations.json V2

职责：

- 保存 import prepare 的短期状态。
- 用于 preview/prepare/commit 跨请求衔接。
- 不作为长期权威状态。
- 迁移时可以删除。

结构：

```ts
export type ImportPreparationCacheV2 = {
  schemaVersion: 2;
  records: Record<string, ImportPreparationRecordV2>;
  locatorIndex: Record<string, string>;
};
```

### ImportPreparationRecordV2

```ts
export type ImportPreparationRecordV2 = {
  id: string;
  locator: string;
  cacheKey: string;
  canonicalLocator: string;
  sourceKind: "local" | "git" | "clawhub" | "collection";
  checkoutPath: string;
  sourceId: SourceId;
  displayName: string;
  requestedPath?: RepoPath;
  status: "preparing" | "ready" | "committing" | "failed" | "stale";
  attemptId?: string;
  commitStartedAt?: IsoTimestamp;
  leaseExpiresAt?: IsoTimestamp;
  preparedAt: IsoTimestamp;
  expiresAt: IsoTimestamp;
  sourceRevision?: SourceRevisionV2;
  skillRefs: PreparedSkillRefV2[];
  availableTargets: DeploymentTargetId[];
  failure?: {
    reasonCode: string;
    retryable: boolean;
    message: string;
    diagnostics?: StateDiagnosticV2[];
  };
};
```

### PreparedSkillRefV2

```ts
export type PreparedSkillRefV2 = {
  leafId: SkillLeafId;
  name: string;
  linkName: string;
  repoPath: RepoPath;
  contentHash?: string;
};
```

V1 兼容：

- V1 `skillIds` 可读。
- 新写入只写 `skillRefs`。
- 如果 V2 commit 遇到只有 `skillIds` 的旧 preparation record，优先要求刷新 preview/prepare；必要时 legacy resolver 只在 query 边界启用。

Prepared leaf id rule:

- `PreparedSkillRefV2.leafId` is provisional while the preparation record is cached.
- During commit, selector binding must produce `BoundImportDraft.selectedLeafIds` from the same preparation record.
- The committed lock leaf id must equal the prepared `leafId` for unchanged checkout content.
- If checkout content changed and prepared `leafId` no longer exists, commit returns `IMPORT_PREPARATION_STALE` and keeps the record for diagnostics.
- Commit must not invent a new leaf id from `uiId`, provider id, archive path, or title.

提交生命周期：

- 只有 `ready` 状态可以进入 commit。
- commit 必须通过 compare-and-set 把 `ready` 改为 `committing`，并同时写入 `attemptId`、`commitStartedAt`、`leaseExpiresAt`。
- 同一 `preparationId` 已处于未过期 `committing` 时，第二个 commit 返回 `IMPORT_PREPARATION_ALREADY_COMMITTING`。
- 过期 `committing` 只能转为 `failed` 或 `stale`，并保留 diagnostics。
- state 写入和 apply 成功后才能删除 preparation record。
- selector binding 或 apply 失败时，不删除 record；写入 `failure`，供 retry 和 toast diagnostics 使用。

## Import Preview / Draft V2

import preview 不写入权威文件，但它是 commit 的关键数据契约。

### ImportSkillSelectorV2

```ts
export type ImportSkillSelectorV2 =
  | {
      kind: "repoPath";
      path: RepoPath;
    }
  | {
      kind: "skillName";
      name: string;
    };
```

### ImportPreviewSkillV2

```ts
export type ImportPreviewSkillV2 = {
  id: string;
  uiId: string;
  legacyAliases?: string[];
  title: string;
  summary: string;
  selectedByDefault: boolean;
  selector: ImportSkillSelectorV2;
  origin: {
    provider: "skills" | "github" | "local" | "clawhub" | string;
    providerSkillId?: string;
    providerPath?: string;
    archivePath?: string;
    sourceUrl?: string;
  };
  diagnostics?: {
    confidence: "exact" | "normalized" | "fallback";
    notes?: string[];
  };
};
```

`uiId` 生成：

```text
uiId = "skill_" + base32url(sha256(stableJson({
  sourceSelectionKey,
  selectorKey
}))).slice(0, 20)
```

规则：

- `uiId` 是新 UI 稳定 key。
- `id` 在兼容窗口内保持 legacy 可解析语义，例如 repo path、skill name 或 provider 旧 id。
- `legacyAliases` 只在存在额外旧选择值时写入，例如旧 provider id 或 archive path；不要写入与 `id` 相同的值。
- 不要求 `id === uiId`。只有旧桌面全部淘汰后，才允许删除 `id/legacyAliases`。
- 不使用 provider id、archive path、本地绝对路径、title、summary 生成 `uiId`。
- 同一 preview result 内 `uiId` 必须唯一。

### ImportDraftV2

```ts
export type ImportDraftV2 = {
  selectedSkills: ImportSkillSelectionV2[];
  enabledTargets: DeploymentTargetId[];
};
```

### ImportSkillSelectionV2

```ts
export type ImportSkillSelectionV2 = {
  uiId: string;
  selector: ImportSkillSelectorV2;
};
```

V1 兼容：

```ts
export type ImportDraftCompat =
  | ImportDraftV2
  | {
      selectedSkillIds: string[];
      enabledTargets: DeploymentTargetId[];
    };
```

legacy draft 只在 bridge/query 边界解析，不能进入 core 业务路径。

### Local Source Choice V2

本地导入和本地扫描中，“用户选择哪一个匹配来源”不得再使用 `"origin"` 作为 choice id。V2 使用：

```ts
export type LocalSourceChoiceV2 = {
  sourceChoiceId: "matched-source" | "new-source";
  matchedSourceId?: SourceId;
  selector: ImportSkillSelectorV2;
  diagnostics?: StateDiagnosticV2[];
};
```

规则：

- `sourceChoiceId` 只表示 UI 中选择的是“匹配已有 source”还是“创建新 source”。
- `origin` 只用于 provenance，不用于 local choice id。
- local single-skill source 使用 `{ kind: "repoPath", path: "." }`。
- local multi-skill source 使用 `{ kind: "repoPath", path: "<relative skill path>" }`。

## Migration Metadata

迁移工具不在每个文件中记录备份路径。备份目录本身就是回滚依据。

迁移中间态 marker：

```text
.skillflow-migration.json
```

marker 只在迁移过程中写入 state root。正常完成后必须删除。启动时如果发现 marker，或权威文件 generation 不一致，runtime 必须返回 `STATE_MIGRATION_INCOMPLETE`。

可选写入迁移审计日志：

```text
audit.log.jsonl
```

事件结构：

```ts
export type StateMigrationAuditEventV2 = {
  type: "state-migration";
  fromVersion: 1;
  toVersion: 2;
  startedAt: IsoTimestamp;
  completedAt: IsoTimestamp;
  backupPath: string;
  actions: Array<{
    path: string;
    action: "rewrite" | "prune" | "keep";
  }>;
  diagnostics: StateDiagnosticV2[];
};
```

## V1 到 V2 迁移策略

### manifest.json

操作：rewrite。

映射：

```text
schemaVersion          -> 2
sources[].locator      -> sources[].identity.locator
sources[].requestedPath -> sources[].identity.requestedPath
sources[].originLocator -> sources[].identity.originLocator
bindings               -> bindings
```

补充：

- 计算 `identity.canonicalLocator`。
- `selectionMode` 缺失时按是否选择全部 leaf 推断，无法推断则使用 `"partial"`。

### lock.json

操作：rewrite。

映射：

```text
schemaVersion                 -> 2
sources[].locator             -> sources[].identity.locator
sources[].requestedPath        -> sources[].identity.requestedPath
sources[].commitSha            -> sources[].sourceRevision.commitSha
sources[].originBranch         -> sources[].sourceRevision.branch
sources[].packageSlug          -> sources[].sourceRevision.packageSlug
sources[].resolvedVersion      -> sources[].sourceRevision.resolvedVersion
sources[].importMode           -> sources[].importInfo.mode
deployments                    -> projections with mode managed
projections                    -> projections
leafInventory[].relativePath   -> leafInventory[].relativePath
leafInventory[].name           -> leafInventory[].selectors.skillName
leafInventory[].linkName       -> leafInventory[].selectors.linkName
```

补充：

- 如果同时存在 `deployments` 和 `projections`，以 `projections` 为准。
- 如果 leaf 缺少 selector index，迁移时补齐。

### preferences.json

操作：rewrite。

映射基本同构：

```text
schemaVersion -> 2
pinnedSourceIds -> pinnedSourceIds
selectedProjectScope -> selectedProjectScope
recentProjects -> recentProjects
projectDrafts -> projectDrafts
customTargets -> customTargets
agentDisplayOrder -> agentDisplayOrder
```

补充：

- project draft 仍使用 leaf id，不使用 import selector。

### collections.json

操作：rewrite。

V2 不再做同构迁移。V1 `virtual-groups.json` 中的旧虚拟组必须 materialize 为 V2 `collections.json` 中的实体技能集合。

```text
schemaVersion -> 2
virtual-groups.groups[].includedSkills -> collections[].members
virtual-groups.groups[].includedSkills[].sourceId -> collections[].members[].origin.sourceId
virtual-groups.groups[].includedSkills[].leafId -> collections[].members[].origin.leafId
virtual-groups.groups[].hiddenSourceIds -> collections[].hiddenSourceIds
virtual-groups.groups[].restoreSnapshots -> collections[].restoreSelections
```

补充：

- V2 state root 必须始终写入 `collections.json`。即使没有集合，也写入 `{ "schemaVersion": 2, "collections": {} }`。
- 每个 member 必须复制原 leaf 内容到 `source/collection/<collectionId>/<memberId>/`。
- 每个 member 必须生成新的 collection leaf id。
- `manifest.json` 必须新增或更新 `kind: "collection"` 的 materialized source。
- `lock.json` 必须新增或更新 collection source lock record 和 collection leaf inventory。
- `manifest.bindings[collectionSourceId].selectedLeafIds` 必须重写为 collection leaf id。
- `manifest.bindings[collectionSourceId].targets[*].leafIds` 必须重写为 collection leaf id。
- V1 `deployments/projections` 中属于旧 virtual source 的记录必须重写为 collection source id 和 collection leaf id。
- 原始 leaf 不存在时，迁移不能静默删除，应返回 `STATE_MIGRATION_VIRTUAL_MEMBER_ORIGIN_MISSING`。
- 迁移成功后，`virtual-groups.json` 不再保留在 state root 中；旧文件只存在于 backup 中。

### catalog

操作：prune。

删除：

```text
catalog/import-data.json
catalog/source-metadata.json
catalog/import-preparations.json
catalog/import-preparations/*
catalog/git/*
```

理由：

- 这些文件不是权威状态。
- V1/V2 cache schema 差异大。
- 删除重建比迁移更简单，也避免补丁代码扩散。

## 数据不变量

迁移后必须满足：

1. 每个权威文件 `schemaVersion === 2`。
2. 每个权威文件的 `migrationGeneration` 一致。
3. 每个 collection materialized marker 的 `migrationGeneration` 与权威文件一致。
4. `manifest.sources[].id` 唯一。
5. `lock.sources[].id` 唯一。
6. `lock.leafInventory[].id` 唯一。
7. 每个 leaf 的 `sourceId` 能在 `lock.sources` 中找到。
8. 每个 projection 的 `sourceId + leafId` 能在 lock 中找到。
9. 每个 manifest binding 的 source id 能在 manifest source 中找到。
10. 每个 enabled target 的 `leafIds` 是对应 source `selectedLeafIds` 的子集。
11. `canonicalLocator` 不包含 repo subpath。
12. `cacheKey` 不写入权威文件。
13. import preview 的 `uiId` 不包含 archive root 或本地绝对路径。
14. import commit 内部只处理 selector 绑定后的 leaf id。
15. target 目录状态不能反向覆盖 manifest/lock。
16. skill collection 部署内容必须来自 `members[].snapshot.materializedPath`。
17. skill collection 的 origin ref 只能用于比较和提示，不能作为部署内容来源。
18. 原始 leaf 更新或删除不能自动改变 skill collection snapshot。
19. `collections.json` 必须存在，即使没有任何 collection。
20. `collection.materializedSourceId === collection.id`。
21. collection leaf 的 `relativePath` 必须能在 collection source 内解析，不能复用原始 repo path。
22. V1 virtual source 的 bindings/projections 必须完整重写到 V2 collection source。
23. restore selection 不能使用 `snapshot` 字段名，也不能作为部署内容来源。
24. V2 authority files 必须写入同一个 `migrationGeneration`；缺失 generation 视为半迁移或损坏状态。
25. local import/local scan 的 V2 choice 使用 `sourceChoiceId`，不能使用 `"origin"` 作为新 choice id。

## Runtime 兼容边界

允许 legacy 逻辑存在的位置：

- storage normalizer
- migration service
- CLI migration command
- bridge payload parser

不允许 legacy 逻辑扩散的位置：

- core deployment planner
- core import commit apply
- desktop UI selection model
- query V2 selector binding 主路径

## 打开旧版本数据时的行为

如果 runtime 发现 state root 是 V1：

1. CLI 普通命令可以继续读取。
2. 会返回 warning：`STATE_MIGRATION_RECOMMENDED`。
3. `migrate-state --to v2 --dry-run` 显示改动清单。
4. desktop 启动时显示迁移提示。
5. 执行迁移前不会删除 cache。

如果 V1 数据损坏：

1. 不自动迁移。
2. 输出 `STATE_MIGRATION_BLOCKED`。
3. diagnostics 列出损坏文件和字段。
4. 用户可从 backup 或手工修复后重试。

## 写入策略

迁移写入必须遵循：

1. 先完整 backup state root。
2. 在临时目录生成 V2 文件。
3. 读取临时目录并验证不变量。
4. 原子替换权威文件。
5. prune cache。
6. 再次读取 state root 验证。
7. 写 audit event。

如果任一步失败：

- 不删除 backup。
- 不继续 prune cache。
- 返回 `STATE_MIGRATION_FAILED`。

## 回滚策略

回滚不通过反向迁移实现。推荐方式：

```bash
rm -rf ~/.skillflow
mv ~/.skillflow.backup-YYYYMMDD-HHMMSS ~/.skillflow
```

如果使用 `SKILL_FLOW_STATE_ROOT`，按实际 state root 替换路径。

## 与实施计划的关系

本文是 V2 数据结构设计源文件。实施顺序：

1. 按本文更新 [01-state-contract.md](01-state-contract.md)。
2. 按本文实现 [02-migration-tool.md](02-migration-tool.md)。
3. 按 import 契约实现 [03-import-selector-contract.md](03-import-selector-contract.md)。
4. 按桌面 payload 更新 [04-desktop-bridge.md](04-desktop-bridge.md)。
5. 按 [05-verification-and-release.md](05-verification-and-release.md) 做迁移与发布验证。

## Stage 1 固化自检

Stage 1 完成后，本文必须满足：

```json
{
  "authoritativeFilesNamed": true,
  "cacheFilesNamed": true,
  "transientContractsNamed": true,
  "allAuthorityFilesHaveMigrationGeneration": true,
  "collectionSnapshotOnlyMeansMaterializedContent": true,
  "restoreSelectionIsNotSnapshot": true,
  "importSelectorDoesNotUseLegacyStringIds": true,
  "localChoiceDoesNotUseOriginAsId": true,
  "repairDesiredProjectionIsRecomputed": true,
  "legacyFieldsHaveBoundary": true
}
```

权威 model：

- `ManifestV2`
- `LockFileV2`
- `SharedPreferencesV2`
- `SkillCollectionsStateV2`
- `source/collection/<collectionId>/*`

可重建 cache model：

- `ImportDataCacheV2`
- `RepoMetadataCacheEntryV2`
- `ImportPreparationCacheV2`
- `ImportPreparationRecordV2`

transient contract：

- `ImportPreviewSkillV2`
- `ImportDraftV2`
- `ImportSkillSelectionV2`
- `LocalSourceChoiceV2`
- `BoundImportDraft`

Stage 2 输入要求：

- `01-state-contract.md` 必须把 authority file 类型落到 TypeScript domain/state 类型。
- `01-state-contract.md` 必须把 `migrationGeneration` 缺失或不一致解析为 `STATE_MIGRATION_INCOMPLETE`。
- `01-state-contract.md` 不能把 `selectedSkillIds`、`canonicalRepo`、V1 `skillIds`、`selectedChoiceId: "origin"` 放入 V2 core model。

自检命令：

```bash
rg -n "migrationGeneration\\?:|Restore""Snapshot|source""Key|Draft""BindingV2" plans/2026-06-04-state-schema-v2/00-data-model.md
rg -n "restore""Snapshots" plans/2026-06-04-state-schema-v2/00-data-model.md
rg -n "部分覆盖|已识别，计划需固化" plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md
rg -n "selected""SkillIds|canonical""Repo|skill""Ids|selected""ChoiceId: \"origin\"" plans/2026-06-04-state-schema-v2/00-data-model.md
for f in plans/2026-06-04-state-schema-v2/00-data-model.md plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md; do
  n=$(rg -n '^```' "$f" | wc -l | tr -d ' ')
  r=$((n % 2))
  printf "%s fences=%s parity=%s\n" "$f" "$n" "$r"
done
```

预期：

- 第一条命令无命中。
- 第二条命令只命中 V1 到 V2 的 restore selection 迁移映射行。
- 第三条命令无命中。
- 第四条命令只命中 legacy boundary、V1 mapping 或 compat type。
- Markdown fence 检查全部 `parity=0`。

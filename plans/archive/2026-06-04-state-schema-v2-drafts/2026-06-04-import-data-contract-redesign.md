# Import 数据契约重设计

日期：2026-06-04

## 背景

当前推荐导入、预览、本地扫描、prepare cache、commit draft 共用同一类字符串字段：

- preview skill 的 `id`
- draft 的 `selectedSkillIds[]`
- local import choice 的 `selectedSkillIds[]`
- prepare record 的 `skillIds[]`

这些字符串在不同阶段承担了多种语义：

- UI 勾选状态 key
- skills provider 原始 id
- GitHub archive 解压路径
- git checkout 后的 repo 相对路径
- lockfile leaf id
- commit 阶段选择 leaf 的 selector

典型失败如下：

```text
preview archive fallback 路径: skills-main/skills/frontend-design
git checkout 后真实路径:        skills/frontend-design
commit draft 传入:              skills-main/skills/frontend-design
结果:                           ADD_SKILL_NOT_FOUND
```

当前可以在 commit resolver 中继续增加字符串归一化规则，但这不是根本解决方案。根本问题是 preview 和 commit 之间没有稳定、结构化、可验证的 selector 契约。

## 设计目标

1. 区分 UI id、provider id、repo path、leaf id、commit selector。
2. `preview` 返回的每个可导入 skill 都必须携带可提交 selector。
3. `commit` 不再猜测普通字符串语义。
4. 支持当前已有来源：`skills`、`github`、`local`、`clawhub`。
5. 支持 GitHub archive fallback、GitHub subpath、single skill、本地单 skill、本地多 skill。
6. 桌面端可以继续用字符串 key 做 UI 勾选，但提交必须使用 selector。
7. 错误结果必须携带可排查的 diagnostics，toast 能显示 reason code 和关键 selector 信息。
8. bridge 不提升 `PROTOCOL_VERSION`，只在 payload 内做 V1/V2 兼容。

## 非目标

1. 不改推荐列表的 group 级产品模型。
2. 不把 provider 原始 id 作为长期提交凭据。
3. 不在第一阶段删除 legacy 字段。
4. 不迁移历史安装结果和 lockfile。
5. 不把 `docs` 作为交付位置；本设计放在 `plans/`。

## 核心判断

这是数据结构设计缺陷，不只是 anthropics 或 archive fallback 的单点 bug。

缺陷点是 `selectedSkillIds` 这个字段名表达的是“选择了哪些 skill id”，但系统没有定义这里的 skill id 来自哪里、在哪个阶段稳定、能否跨 archive/checkout 边界复用。因此任何 provider 只要返回的路径形态和 checkout 后路径不完全一致，就可能失败。

新的契约应让 preview 负责把 provider 结果转换为提交阶段可以理解的 selector，让 commit 只处理有限、显式的数据结构。

## 类型增量

### ImportOriginProvider

```ts
export type ImportOriginProvider =
  | "skills"
  | "github"
  | "local"
  | "clawhub"
  | string;
```

说明：

- 代码层统一使用 `"skills"`，不使用 `"skills.sh"`。
- UI 如需展示 `skills.sh`，由展示层映射。
- `string` 保留给未来 provider，但 commit 不得因为未知 provider 自动解析 provider id。

### ImportSkillSelector

第一阶段只保留两种 selector：

```ts
export type ImportSkillSelector =
  | {
      kind: "repoPath";
      path: string;
    }
  | {
      kind: "skillName";
      name: string;
    };
```

字段含义：

- `repoPath`：repo 或本地 scan 根目录内的稳定相对路径。优先使用。
- `skillName`：仅在无法得到 repo path 时使用。commit 阶段如果匹配多个 leaf，必须返回 ambiguous。

约束：

- `repoPath.path === "."` 表示 repo 根目录就是一个 skill。
- 除 `"."` 外，`repoPath.path` 必须使用 POSIX `/`。
- 除 `"."` 外，`repoPath.path` 不允许以 `/`、`./`、`../` 开头。
- `repoPath.path` 不允许包含 GitHub archive 根目录，例如 `skills-main/`。
- `skillName.name` 是 skill 逻辑名称，不是 provider 原始 id。

暂不加入 `providerSkillId` selector。provider id 只放在 `origin` 和 `diagnostics`。这样可以避免把字符串多义问题从 `selectedSkillIds` 转移到另一个字段。

### ImportDiagnostic

```ts
export type ImportDiagnostic = {
  code: string;
  message: string;
  details?: Record<string, string | number | boolean | string[]>;
};
```

示例：

```ts
{
  code: "IMPORT_SELECTOR_NORMALIZED",
  message: "Removed GitHub archive root from preview path.",
  details: {
    from: "skills-main/skills/frontend-design",
    to: "skills/frontend-design"
  }
}
```

diagnostics 放在业务 response data 内，不放入 bridge envelope。bridge envelope 继续只表达命令执行成功或协议级失败。

### ImportPreviewSkillV2

迁移期保留 `id`，并新增 `uiId`。二者不能强制相同。

`uiId` 不应直接使用 provider id、archive path、本地绝对路径或标题生成。它应由 preview 层通过稳定输入派生：

```ts
export type ImportSkillUiIdInput = {
  sourceSelectionKey: string;
  selector: ImportSkillSelector;
};
```

生成规则：

```text
uiId = "skill_" + base32url(sha256(stableJson({
  sourceSelectionKey,
  selectorKey
}))).slice(0, 20)
```

其中：

- `sourceSelectionKey` 使用 `canonicalLocator + requestedPath` 的规范化组合，表达“同一个导入选择范围”，不表达 preview 使用的是 provider、checkout 还是 archive fallback。
- `selectorKey` 使用 selector 的规范化形式，例如 `repoPath:skills/frontend-design` 或 `repoPath:.`。
- 不把 `origin.archivePath`、`origin.providerPath`、标题、summary 纳入 hash。
- hash 长度建议 80 bit 以上，避免同一 preview result 内碰撞。
- 如果发生碰撞，preview 生成阶段应报 `IMPORT_PREVIEW_UI_ID_COLLISION`，不能静默覆盖。

```ts
export type ImportPreviewSkillV2 = {
  id: string;
  uiId: string;
  legacyAliases?: string[];
  title: string;
  summary: string;
  selectedByDefault: boolean;
  selector: ImportSkillSelector;
  origin: {
    provider: ImportOriginProvider;
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

字段说明：

- `id`：legacy UI key 和 legacy `selectedSkillIds` 值，必须保持 query legacy resolver 可解析。
- `uiId`：新版桌面端和 TUI 勾选状态使用的稳定 key，由 `sourceSelectionKey + selectorKey` 派生。
- `legacyAliases`：只保存额外旧选择值，例如旧 provider id 或 archive path；不得写入与 `id` 相同的值。
- `selector`：commit 使用的唯一结构化入口。
- `origin.providerSkillId`：provider 原始 id，仅用于展示、日志、诊断。
- `origin.archivePath`：archive fallback 解压后路径，例如 `skills-main/skills/frontend-design`。

ready 状态下的 skill 必须有 selector。缺失 selector 是 preview 生成错误，应返回 warning 或 failed。因为 `uiId` 从 selector 派生，缺少 selector 时也不能生成 V2 `uiId`。

兼容窗口规则：

- 新 UI 使用 `uiId`。
- 旧 UI 继续使用 `id`。
- 旧 `selectedSkillIds` 只允许在 bridge/query 边界解析，不能进入 core。
- query 必须能把 legacy `id/legacyAliases` 映射到同一个 selector 或 prepared leaf。

### ImportSkillSelection

```ts
export type ImportSkillSelection = {
  uiId: string;
  selector: ImportSkillSelector;
};
```

`uiId` 用于把提交选择和 UI 状态关联起来，`selector` 用于实际解析 leaf。

### ImportDraftV2

```ts
export type ImportDraftV2 = {
  selectedSkills: ImportSkillSelection[];
  enabledTargets: DeploymentTargetId[];
};
```

约束：

- V2 draft 必须传 `selectedSkills[].selector`。
- 只传 `uiId` 的 draft 是无效 V2。
- 如果 payload 只有 `selectedSkillIds`，视为 legacy draft。

### ImportDraftCompat

```ts
export type ImportDraftCompat =
  | ImportDraftV2
  | {
      selectedSkillIds: string[];
      enabledTargets: DeploymentTargetId[];
    };
```

兼容规则：

- 有 `selectedSkills` 时走 V2 严格解析。
- 只有 `selectedSkillIds` 时走 legacy resolver，并在业务结果 diagnostics 中加入 `IMPORT_DRAFT_LEGACY_SELECTED_SKILL_IDS`。
- 同时传 `selectedSkills` 和 `selectedSkillIds` 时，以 `selectedSkills` 为准，并加入 warning。

### ImportPreviewResultV2

V2 core result 只使用嵌套 `preparation`。bridge/query 兼容序列化层可以为旧 Swift 调用方额外镜像扁平 preparation 字段，但这些字段不进入 V2 core contract。

```ts
export type ImportPreviewResultV2 =
  | {
      version: 2;
      status: "ready";
      locator: string;
      canonicalLocator: string;
      previewSource: {
        provider: ImportOriginProvider;
        mode: "directory" | "repoCheckout" | "archiveFallback" | "localPath";
      };
      preparation?: {
        preparationId?: string;
        status?: ImportPreparationStatus;
        preparedAt?: string;
        expiresAt?: string;
      };
      selectedSkillIds: string[];
      selectedSkills: ImportSkillSelection[];
      enabledTargets: DeploymentTargetId[];
      skills: ImportPreviewSkillV2[];
      targets: ImportPreviewTarget[];
      warnings?: ImportDiagnostic[];
    }
  | {
      version: 2;
      status: "failed";
      reasonCode: ImportReasonCode | string;
      retryable: boolean;
      diagnostics?: ImportDiagnostic[];
    };
```

兼容字段说明：

- `skills[].id` 保留到所有桌面端都改读 `uiId`。
- `selectedSkillIds` 保留到所有提交路径都改发 `selectedSkills`。
- 扁平 `preparationId/preparationStatus/preparedAt/expiresAt` 只允许由 bridge/query serializer 在兼容响应中追加。
- `canonicalRepo` 只允许由 bridge/query serializer 在兼容响应中作为 `canonicalLocator` 的别名追加。

### ImportSourceResultV2

```ts
export type ImportSourceResultV2 =
  | {
      version?: 2;
      status: "success";
      locator: string;
      importedSkillIds: string[];
      enabledTargets: DeploymentTargetId[];
      diagnostics?: ImportDiagnostic[];
    }
  | {
      version?: 2;
      status: "failed";
      reasonCode: ImportReasonCode | string;
      retryable: boolean;
      diagnostics?: ImportDiagnostic[];
    };
```

说明：

- `version` 可选，避免破坏旧调用方。
- selector 解析失败属于业务失败，返回 `status: "failed"`。
- JSON 结构非法属于 bridge 请求非法，返回 `BRIDGE_REQUEST_INVALID`。

### PreparedSkillRef

```ts
export type PreparedSkillRef = {
  leafId: string;
  name: string;
  linkName: string;
  repoPath: string;
};
```

prepare record 迁移为双读结构：

```ts
export type ImportPreparationRecordV2 = {
  id: string;
  locator: string;
  cacheKey: string;
  canonicalLocator: string;
  checkoutPath: string;
  status: ImportPreparationStatus;
  skillRefs: PreparedSkillRef[];
  preparedAt?: string;
  expiresAt?: string;
};
```

说明：

- `cacheKey` 只用于缓存索引。
- `canonicalLocator` 始终表示 canonical source identity，例如 `github:owner/repo`、本地 canonical locator 或 clawhub canonical locator。
- `canonicalLocator` 不应写成 `locator#path`。
- V2 新记录只写入 `skillRefs`。
- 旧记录没有 `skillRefs` 时，由 normalizer 读取旧 `skillIds` 并尝试转换；如果无法可靠转换，返回 `IMPORT_PREPARATION_STALE` 或 `IMPORT_SELECTOR_NOT_FOUND`。

### LocalImportChoiceV2

本地导入和本地扫描也必须升级，不能继续只存字符串 id。

```ts
export type LocalImportChoiceV2 = {
  selectedSkills: ImportSkillSelection[];
  selectedSkillIds?: string[];
  enabledTargets: DeploymentTargetId[];
};

export type LocalScanImportChoiceV2 = {
  selectedSkills: ImportSkillSelection[];
  selectedSkillIds?: string[];
  enabledTargets: DeploymentTargetId[];
};
```

`selectedSkillIds` 仅作为兼容字段。

### Swift Payload 类型

桌面端需要增加对应 payload 类型：

```swift
struct ImportSkillSelectorPayload: Codable, Equatable {
    let kind: String
    let path: String?
    let name: String?
}

struct ImportSkillSelectionPayload: Codable, Equatable {
    let uiId: String
    let selector: ImportSkillSelectorPayload
}

struct ImportDraftState {
    var selectedSkills: [ImportSkillSelectionPayload]
    var selectedSkillIds: [String]
    var enabledTargetIds: [String]
}
```

迁移期 `selectedSkillIds` 仍保留，用于读取旧 preview、旧 local choice 和选择恢复。

## 数据流

### 推荐列表

推荐列表继续返回 group 级候选项：

```ts
ImportGroupCandidate {
  id,
  locator,
  canonicalLocator,
  title,
  previewState
}
```

推荐列表不产生 commit draft。只有进入 preview 后，才生成 skill selector。

### Preview

preview 的责任：

1. 解析 locator 和 provider。
2. 读取 provider snapshot、repo checkout、archive fallback 或本地 scan 结果。
3. 为每个可导入 skill 生成 `selector`。
4. 通过 `sourceSelectionKey + selectorKey` 派生 `uiId`，并把 `id` 设置为 legacy resolver 可解析值。
5. 为每个 skill 填充 `origin/diagnostics`。
6. 返回 `selectedSkills` 和兼容用的 `selectedSkillIds`。`selectedSkillIds` 使用 `id`，不使用 `uiId`。
7. V2 core 返回嵌套 `preparation`；bridge/query 兼容序列化层按需追加扁平 preparation 字段。

skills provider 正常示例：

```json
{
  "id": "skills/frontend-design",
  "uiId": "skill_b6hm2m3d9nd8c4k7q2ea",
  "title": "frontend-design",
  "selector": {
    "kind": "repoPath",
    "path": "skills/frontend-design"
  },
  "origin": {
    "provider": "skills",
    "providerSkillId": "frontend-design"
  },
  "diagnostics": {
    "confidence": "exact"
  }
}
```

GitHub archive fallback 示例：

```json
{
  "id": "skills/frontend-design",
  "uiId": "skill_b6hm2m3d9nd8c4k7q2ea",
  "title": "frontend-design",
  "selector": {
    "kind": "repoPath",
    "path": "skills/frontend-design"
  },
  "origin": {
    "provider": "github",
    "archivePath": "skills-main/skills/frontend-design"
  },
  "diagnostics": {
    "confidence": "normalized",
    "notes": ["Removed archive root 'skills-main'."]
  }
}
```

本地单 skill 示例：

```json
{
  "id": ".",
  "uiId": "skill_h3f6x9gq5t2w8md4p1sv",
  "title": "foo",
  "selector": {
    "kind": "repoPath",
    "path": "."
  },
  "origin": {
    "provider": "local"
  },
  "diagnostics": {
    "confidence": "exact"
  }
}
```

### Prepare

prepare 的责任：

1. 建立 checkout cache 或本地 scan snapshot。
2. 生成 `PreparedSkillRef[]`。
3. 持久化 `cacheKey`、`canonicalLocator`、`checkoutPath`、`skillRefs`。
4. 不再写入旧 `skillIds`。

prepare 不负责 UI 选择，也不把 provider 原始 id 写成 leaf id。

### Commit

commit 的关键变化是 selector binding 必须发生在 preparation record 删除之前。

可选实现方式：

1. query 在调用 commit 前读取 preparation record，解析 V2 draft 为 `selectedLeafIds`，再调用 core commit。
2. 或者把 draft 解析整体下沉到 `ImportPreparationService.commitPreparedImportSource`，由 core 在同一个事务边界内解析、应用、删除 record。

建议使用第 1 种，改动范围更小：

1. `SkillFlowApp.commitPreparedImportSourceImpl` 先读取 preparation record。
2. 根据 `draft.selectedSkills[].selector` 匹配 `record.skillRefs`。
3. 得到 `selectedLeafIds` 和 `enabledTargets` 后，再调用 core commit。
4. core commit 成功后删除 preparation record。
5. query 返回 `ImportSourceResultV2`，包含 diagnostics。

selector 解析规则：

- `repoPath`：按 `PreparedSkillRef.repoPath` 精确匹配。
- `skillName`：按 `name` 或 `linkName` 匹配。
- `skillName` 匹配 0 个返回 `IMPORT_SELECTOR_NOT_FOUND`。
- `skillName` 匹配多个返回 `IMPORT_SELECTOR_AMBIGUOUS`。
- enabled target 不可用返回现有 `ADD_AGENT_NOT_AVAILABLE`，并附带 target diagnostics。

失败示例：

```json
{
  "version": 2,
  "status": "failed",
  "reasonCode": "IMPORT_SELECTOR_NOT_FOUND",
  "retryable": false,
  "diagnostics": [
    {
      "code": "IMPORT_SELECTOR_NOT_FOUND",
      "message": "No prepared skill matched selector.",
      "details": {
        "kind": "repoPath",
        "value": "skills/frontend-design",
        "preparationId": "prep-123"
      }
    }
  ]
}
```

## Bridge 协议

### 协议版本

不提升 `PROTOCOL_VERSION`。保持 shared protocol envelope 不变，在 command payload 内兼容 V1/V2。

原因：

- 当前请求 envelope 只校验命令和 JSON 形态。
- draft 结构校验位于 CLI bridge parser。
- payload 兼容足以支持旧桌面和新 CLI 混用。

### commit-import-source payload

```json
{
  "command": "commit-import-source",
  "payload": {
    "preparationId": "prep-123",
    "draft": {
      "selectedSkills": [
        {
          "uiId": "skill_b6hm2m3d9nd8c4k7q2ea",
          "selector": {
            "kind": "repoPath",
            "path": "skills/frontend-design"
          }
        }
      ],
      "enabledTargets": ["codex"]
    }
  }
}
```

### import-source fallback payload

`import-source` 也接受同一份 `ImportDraftCompat`：

```json
{
  "command": "import-source",
  "payload": {
    "locator": "github:anthropics/skills",
    "draft": {
      "selectedSkills": [
        {
          "uiId": "skill_b6hm2m3d9nd8c4k7q2ea",
          "selector": {
            "kind": "repoPath",
            "path": "skills/frontend-design"
          }
        }
      ],
      "enabledTargets": ["codex"]
    }
  }
}
```

兼容规则：

- `commit-import-source` 和 `import-source` 都接受 V2 draft。
- 只有 legacy `selectedSkillIds` 时继续走 legacy resolver。
- V2 draft 结构非法返回 `BRIDGE_REQUEST_INVALID`。
- V2 selector 结构合法但无法解析返回业务失败 `IMPORT_SELECTOR_NOT_FOUND`、`IMPORT_SELECTOR_AMBIGUOUS` 或 `IMPORT_SELECTOR_INVALID`。

## 桌面端状态设计

需要同步升级这些状态和模型：

- `ImportGroupSkill`
- preview parser
- `ImportDraftState`
- `LocalImportChoice`
- `LocalScanImportChoice`
- import card 勾选逻辑
- `commit-import-source` payload
- `import-source` fallback payload
- toast 错误解析

### ImportGroupSkill

迁移期字段：

```swift
struct ImportGroupSkill: Identifiable, Equatable {
    let id: String
    let uiId: String
    let title: String
    let summary: String
    let selector: ImportSkillSelectorPayload?
}
```

规则：

- `id` 从 payload 的 `id` 读取，作为 legacy selection id。
- `uiId` 优先读 payload 的 `uiId`，缺失时回退到 `id`。
- `selector` 缺失时，该 skill 只能走 legacy draft。

### 勾选状态

UI 勾选使用 `uiId`：

```text
isSelected = draft.selectedSkills contains skill.uiId
```

提交 payload 使用 `selectedSkills`：

```text
selectedSkills = checked skills map { uiId, selector }
```

如果某个选中 skill 没有 selector：

- 如果来源是 legacy preview，发送 `selectedSkillIds`。
- 如果来源声明 `version: 2`，阻止提交并显示 `IMPORT_PREVIEW_SELECTOR_MISSING`。

### preview reload 选择恢复

当 preview 重新加载后，用以下顺序恢复选择：

1. `uiId` 完全相同。
2. selector 等价：
   - `repoPath` 用规范化后的 `path` 比较。
   - `skillName` 用 `name` 比较。
3. legacy id 匹配：
   - `skill.id`
   - `skill.legacyAliases`
   - `skill.uiId`
   - `origin.providerSkillId`
   - `origin.providerPath`
   - `origin.archivePath`
4. 仍无法匹配时丢弃该选择，并记录 warning，不静默提交旧 id。

### toast diagnostics

桌面端不能只显示“导入失败”。应解析 `ImportSourceResultV2.diagnostics`。

显示规则：

- 有 `reasonCode` 时显示 reason code。
- diagnostics 中有 selector details 时显示 `kind` 和 `value`。
- `ADD_AGENT_NOT_AVAILABLE` 显示不可用 target。
- bridge envelope 的 `BridgeIssue` 仍用于协议层或命令层错误；import 业务失败读取 result data 内的 diagnostics。

示例文案信息结构：

```text
导入失败：IMPORT_SELECTOR_NOT_FOUND
selector: repoPath skills/frontend-design
```

## 错误码

新增或明确以下业务错误码：

- `IMPORT_SELECTOR_NOT_FOUND`
- `IMPORT_SELECTOR_AMBIGUOUS`
- `IMPORT_SELECTOR_INVALID`
- `IMPORT_DRAFT_LEGACY_SELECTED_SKILL_IDS`
- `IMPORT_PREVIEW_SELECTOR_MISSING`
- `IMPORT_PREVIEW_UI_ID_COLLISION`
- `IMPORT_PREPARATION_STALE`

错误码层级：

- JSON payload 类型错误：`BRIDGE_REQUEST_INVALID`。
- selector 对象结构非法：`BRIDGE_REQUEST_INVALID`。
- selector 结构合法但语义非法：`IMPORT_SELECTOR_INVALID`。
- selector 合法但无法匹配 prepared leaf：`IMPORT_SELECTOR_NOT_FOUND`。
- selector 合法但匹配多个 prepared leaf：`IMPORT_SELECTOR_AMBIGUOUS`。
- target 不可用：保留 `ADD_AGENT_NOT_AVAILABLE`。

## 文件影响范围

### Domain

预计修改：

- `packages/domain/src/types.ts`

类型增量：

- `ImportOriginProvider`
- `ImportSkillSelector`
- `ImportSkillSelection`
- `ImportDraftV2`
- `ImportDraftCompat`
- `ImportPreviewSkillV2`
- `ImportPreviewResultV2`
- `ImportSourceResultV2`
- `PreparedSkillRef`
- `LocalImportChoiceV2`
- `LocalScanImportChoiceV2`

### Storage

预计修改：

- `packages/storage/src/import-preparation-cache.ts`

改动：

- normalizer 双读 `skillRefs` 和 `skillIds`。
- 新 record 写入 `skillRefs`。
- 新 record 不再写入 `skillIds`。
- 拆清 `cacheKey` 和 `canonicalLocator`。

### Core Engine

预计修改：

- `packages/core-engine/src/services/import-preparation-service.ts`

改动：

- prepare record 生成 `PreparedSkillRef[]`。
- commit 删除 record 前，必须让 query 或 core 完成 selector binding。
- 不把 `canonicalLocator` 写成带 subpath 的 cache key。

### Query

预计修改：

- `packages/query/src/runtime.ts`
- `packages/query/src/tests/import-page-flow.test.ts`

改动：

- preview 生成 selector。
- archive fallback 归一化 `origin.archivePath` 和 `selector.repoPath`。
- commit 接受 `ImportDraftCompat`。
- V2 draft 优先按 `PreparedSkillRef` 匹配。
- legacy draft 仍可导入并产生 warning。
- target 不可用附带 diagnostics。

### CLI Bridge

预计修改：

- `apps/cli/src/bridge-command.ts`

改动：

- parser 接受 `selectedSkills`。
- parser 保留 `selectedSkillIds`。
- 无效 selector payload 返回 `BRIDGE_REQUEST_INVALID`。
- `preview-import-source`、`commit-import-source`、`import-source` 均覆盖 V2 payload。

### Shared Types

预计修改：

- `packages/shared-types/src/protocol.ts`

改动：

- 不提升 `PROTOCOL_VERSION`。
- 如需要，只补充 payload 类型测试或注释，不改变 envelope 结构。

### Desktop

预计修改：

- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`

改动：

- preview parser 读取 `id/uiId/selector/origin`。
- `ImportDraftState` 保存 `selectedSkills`。
- local import choice 保存 `selectedSkills`。
- 勾选用 `uiId`。
- 提交优先发送 V2 draft。
- toast 解析 `diagnostics`。

## 测试矩阵

### Query

1. `skills` provider 正常 preview：selector 为 `repoPath`。
2. `github` archive fallback preview：`origin.archivePath` 带 archive root，`selector.repoPath` 不带 archive root。
3. GitHub subpath preview：selector 是 repo 内相对路径，不包含 locator subpath 标记。
4. GitHub single skill selector：只导入目标 skill。
5. 本地单 skill：selector 为 `{ kind: "repoPath", path: "." }`。
6. 本地多 skill：selector 为各自相对路径。
7. `clawhub` direct import：至少保持 legacy 可用；如果 preview 进入 V2，provider 为 `"clawhub"`。
8. `anthropics/skills`：标准 skills bucket，断言 selector 形态和 commit leaf。
9. `vercel-labs/agent-skills`：provider id 与目录名可能不一致，断言 commit 不依赖 provider id。
10. `garrytan/gstack`：非标准或递归扫描，断言 repoPath selector 可提交。
11. preview archive fallback + prepare checkout + commit V2 组合测试，不触发 `ADD_SKILL_NOT_FOUND`。
12. commit V2 draft 成功。
13. commit legacy draft 成功并返回 `IMPORT_DRAFT_LEGACY_SELECTED_SKILL_IDS`。
14. selector not found 返回 `IMPORT_SELECTOR_NOT_FOUND`。
15. selector ambiguous 返回 `IMPORT_SELECTOR_AMBIGUOUS`。
16. V2 selector 正确但 target 不可用，返回 `ADD_AGENT_NOT_AVAILABLE`。

### Storage

1. 新 cache record 写入 `skillRefs`。
2. 旧 cache record 只有 `skillIds` 时可以读取。
3. `cacheKey` 与 `canonicalLocator` 不混用。
4. 缺少 `skillRefs` 且 legacy 也无法解析时返回 stale 或 not found。

### CLI / Bridge

1. `preview-import-source` 返回 `version: 2`、`skills[].id`、`skills[].uiId`、`skills[].selector`。
2. `commit-import-source` 接受 V2 draft。
3. `import-source` fallback 接受 V2 draft。
4. legacy `selectedSkillIds` payload 仍可解析。
5. 同时传 V1/V2 字段时优先 V2。
6. selector payload 结构错误返回 `BRIDGE_REQUEST_INVALID`。
7. selector 合法但无法匹配时返回业务失败，不返回 bridge parser 错误。

### Desktop

1. 推荐导入页 skill 勾选使用 `uiId`。
2. import payload 使用 `selectedSkills`。
3. preview reload 后按 `uiId`、selector、legacy id 顺序恢复选择。
4. local import choice 发送 `selectedSkills`。
5. `ADD_SKILL_NOT_FOUND` 不再由 archive root id 触发。
6. `IMPORT_SELECTOR_NOT_FOUND` toast 显示 reason code 和 selector kind/value。
7. `ADD_AGENT_NOT_AVAILABLE` toast 显示 target。
8. legacy preview 缺少 selector 时仍可导入，但产生 warning。

## 迁移步骤

1. 在 `packages/domain` 增加 V2 类型和 compat 类型。
2. 在 storage normalizer 中加入 `skillRefs` 双读。
3. prepare record 只写入 `PreparedSkillRef[]`，旧 `skillIds` 只读不写。
4. query preview 同时返回 V2 字段和 legacy 字段。
5. CLI bridge parser 接受 V2 draft 和 legacy draft。
6. query commit 在 record 删除前完成 selector binding。
7. desktop preview parser 保存 selector。
8. desktop draft 和 local choice 改为保存 `selectedSkills`。
9. desktop commit 和 import fallback 优先发送 V2 draft。
10. desktop toast 读取 import result diagnostics。
11. 添加 query、storage、bridge、desktop 测试。
12. 观察一个 minor release 后，移除或降级 legacy 字段。

## 删除 legacy 条件

必须同时满足：

1. 桌面端所有导入路径都发送 `selectedSkills`。
2. CLI bridge 测试覆盖 V2 `commit-import-source` 和 `import-source`。
3. 线上或本地诊断中不再出现 `IMPORT_DRAFT_LEGACY_SELECTED_SKILL_IDS`。
4. README 或 release note 已说明旧 payload 字段废弃。
5. 至少经过一个 minor release。

## 风险与处理

### Bridge payload 变更

风险：Swift 和 TypeScript payload 不一致会导致桌面导入失败。

处理：

- 不提升 `PROTOCOL_VERSION`。
- parser 同时接受 V1/V2。
- 增加 bridge payload fixture 测试。

### selector 与 prepared record 生命周期

风险：当前 commit 可能先删除 preparation record，再解析 draft。

处理：

- selector binding 必须前置。
- 或下沉到 `ImportPreparationService` 内部完成。
- 测试要覆盖 commit 后 record 删除，但解析发生在删除前。

### 旧 cache record

风险：旧 record 没有 `skillRefs`，V2 selector 无法匹配。

处理：

- normalizer 双读。
- 旧 record 尝试 legacy resolver。
- 无法解析时返回 `IMPORT_PREPARATION_STALE`，提示刷新 preview。

### provider 数据不完整

风险：部分 provider 没有 repo path，只有名称或 id。

处理：

- preview 尽量通过 checkout/archive scan 补 repoPath。
- 无法补 repoPath 时使用 `skillName`。
- `skillName` ambiguous 时要求刷新或缩小选择范围。

### local import 边界

风险：本地单 skill 的 repo path 是 `"."`，容易被 validator 误拒绝。

处理：

- validator 显式允许 `"."`。
- local 单 skill 和多 skill 分别补测试。

## 验收标准

1. 每个 V2 ready preview skill 都有 selector。
2. V2 commit 不读取 `uiId` 或 provider id 也能解析 leaf。
3. archive fallback preview 到 prepare checkout 的路径差异不影响导入。
4. `anthropics/skills`、`vercel-labs/agent-skills`、`garrytan/gstack` 都有明确 selector 断言。
5. 本地单 skill 使用 `repoPath: "."` 可导入。
6. target 不可用返回 `ADD_AGENT_NOT_AVAILABLE`，toast 能显示 target。
7. selector not found toast 能显示 reason code、kind、value。
8. `npm test`、`npm run build`、桌面相关 `swift test` 通过。

## Subagent 审核记录

本设计经过两个 subagent 审核：

- `Copernicus`：从 TypeScript、domain、bridge 协议角度审核。
- `Aristotle`：从桌面端状态、Swift payload、测试落地性角度审核。

已吸收的主要反馈：

- 明确 `skills[].id` 是 legacy resolver 可解析值，`skills[].uiId` 是 hash 派生的稳定 UI key，二者不能强制相同。
- `legacyAliases` 只保存额外旧选择值，不保存与 `id` 相同的重复值。
- `origin` 不重复保存 `selector.repoPath`。
- V2 core 只保留嵌套 `preparation`，扁平 preparation 字段只由兼容序列化层追加。
- 补充 commit selector binding 必须发生在 preparation record 删除之前。
- 明确 `skillRefs` 与旧 `skillIds` 的 cache 双读迁移。
- provider 命名统一为 `"skills"`，展示层再映射为 `skills.sh`。
- 覆盖 `clawhub` 和 local choice。
- 明确 bridge 不提升 `PROTOCOL_VERSION`。
- 增加 `ImportSourceResultV2` 和 diagnostics 落点。
- 区分 `BRIDGE_REQUEST_INVALID` 与业务 selector 错误。
- 拆分 `cacheKey` 和 `canonicalLocator`。
- 增加 target 不可用、三类推荐 group、archive fallback preview+commit 组合测试。

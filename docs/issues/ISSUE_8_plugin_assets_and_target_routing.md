# Issue 8: 插件资产扫描与目标路径路由分析

## 背景

Issue 8 指出两个相关问题：

1. Source 扫描只识别 `skills/` 和 `SKILL.md`，上游插件仓库中的 `commands/` 等资产不会进入 inventory。
2. `customTargets` 只能表达一个 skills 目录，不能把同一个 Claude profile 下的不同资产类型分别同步到 `skills/`、`commands/`、`agents/` 等目录。

这两个问题共用同一个根因：当前系统的数据模型和部署路径都默认 leaf 等于 skill，target 等于一个 skills 根目录。

## 当前实现观察

- `packages/core-engine/src/services/inventory-service.ts` 只查找 `SKILL.md`，并生成 `LeafRecord`。
- `LeafRecord` 在 `packages/domain/src/types.ts` 中包含 `skillFilePath`，说明领域模型已经把 leaf 绑定到了 skill 语义。
- `DeploymentPlanner` 使用 `buildProjectedSkillNameCandidates` 和 `adapter.resolveTargetPath(rootPath, linkName)` 生成目标路径，目标根目录只有一个。
- `ChannelAdapter` 的 `detect()` 对自定义目标只使用 `definition.globalPath`，没有资产类型维度。
- `CustomTargetDefinition` 当前只有 `globalPath` 和 `projectPathTemplate`，无法表达 `commands -> commands/`、`agents -> agents/` 这类映射。
- `SourceBinding.selectedLeafIds` 和 `TargetBinding.leafIds` 只存 leaf id 字符串，当前格式实际为 `<sourceId>:<skillRelativePath>`。

因此，单独扩展扫描器不足以解决问题。即使扫描出了 `commands/foo.md`，部署层也不知道它应该写入 `<profile>/commands/foo.md`，并且 UI/CLI 文案仍会把它当作 skill。

## 影响面

### 必须改动的核心模块

- `packages/domain`
  - 引入资产类型概念。
  - 调整 leaf / deployment / target 类型，避免继续使用纯 skill 字段表达所有资产。
- `packages/core-engine`
  - 扩展 inventory 扫描。
  - 调整部署计划，让目标路径按资产类型解析。
  - 调整冲突检测、漂移检测和 removal 逻辑。
- `packages/integration`
  - 扩展 target definition 和 adapter。
  - 保留 built-in target 的默认 skills 行为，同时支持 Claude Code 资产目录映射。
- `packages/storage`
  - 在当前 V2 authority 中定义 `PreferencesFile.customTargets` 的最终结构。
  - 如果持久化结构必须变化，通过显式 schema migration 一次性升级，不在正常读写链路叠加旧形状兼容。
- `packages/query`
  - 调整 add、apply draft、detail、import、doctor、update 的 leaf 展示和选择逻辑。
- `apps/cli`
  - 调整 `bridge --json` 协议解析和输出。
  - CLI 文案不能继续把所有 leaf 都称为 skill。
- `apps/desktop-mac`
  - Source detail 文件树展示非 skill 资产。
  - Settings 中自定义 target 需要配置资产路径映射。

### 外部行为变化

这是外部变更，原因：

- `manifest.json` / `lock.json` 中 leaf id 形态会新增 `commands/...`、`agents/...` 等路径。
- `preferences.json` 的 custom target 结构需要扩展。
- bridge payload 会新增资产类型和 target path mapping。
- CLI、TUI、desktop 的展示和选择行为会变化。

这些改动必须补测试和必要文档。

## 设计建议

### 资产类型

建议先支持 Claude Code 插件规范中的常见目录：

```ts
type PluginAssetType =
  | "skills"
  | "commands"
  | "agents"
  | "hooks"
  | "output-styles";
```

其中 `skills` 继续使用目录级 leaf，`commands` 等文件型资产需要单独定义 leaf 规则。

建议 leaf id 采用稳定格式：

```text
<sourceId>:skills/<name>
<sourceId>:commands/<name>.md
<sourceId>:agents/<name>.md
<sourceId>:hooks/<name>.json
<sourceId>:output-styles/<name>.md
```

不要把资产类型放到额外字段后仍保留旧 id。id 本身应能稳定表达 source 内相对位置。

### Leaf 模型

建议把当前 `LeafRecord` 改为更通用的 `AssetLeafRecord`，至少包含：

```ts
type AssetLeafRecord = {
  id: string;
  sourceId: string;
  assetType: PluginAssetType;
  name: string;
  linkName: string;
  title: string;
  description: string;
  relativePath: string;
  absolutePath: string;
  entryFilePath?: string;
  contentHash: string;
  metadataWarnings: string[];
  valid: true;
};
```

`skillFilePath` 是 skill 专用字段。最终模型应直接以可选的 `entryFilePath` 取代它；如果 authority schema 需要升级，由显式 migration 完成重写，正常运行时不同时维护两套字段。

### Target 模型

建议给 target 引入资产路径映射：

```ts
type TargetAssetPathMapping = Partial<Record<PluginAssetType, {
  globalPath: string;
  projectPathTemplate?: string;
}>>;

type CustomTargetDefinition = {
  id: string;
  name: string;
  strategy: "symlink" | "copy";
  assetPaths: TargetAssetPathMapping;
  createdAt: string;
  updatedAt: string;
};
```

状态演进策略：

- 为持久化的 target mapping 定义单一最终结构；不要在 normalizer 中长期双读 `globalPath` / `projectPathTemplate` 与 `assetPaths`。
- 已有 V2 authority 通过显式 schema migration 一次性把 skills 路径重写为 `assetPaths.skills`，迁移后只写新结构。
- built-in target 也应进入同一套 mapping，只是由代码定义。

对 Claude Code，默认映射应是：

```text
skills        -> ~/.claude/skills
commands      -> ~/.claude/commands
agents        -> ~/.claude/agents
hooks         -> ~/.claude/hooks
output-styles -> ~/.claude/output-styles
```

对没有明确支持非 skill 资产的 built-in target，只声明 `skills`，避免把 commands 错投到未知目录。

## 分阶段计划

### Phase 1: 定义最终契约和迁移边界

- 在 `packages/domain` 增加 `PluginAssetType`、通用 leaf 类型和 target asset mapping 类型。
- 在 `packages/storage` 定义新的 authority schema，并通过显式 migration 一次性转换已有 custom target：
  - `globalPath` -> `assetPaths.skills.globalPath`
  - `projectPathTemplate` -> `assetPaths.skills.projectPathTemplate`
- 在 `packages/integration` 为 built-in target 增加 `assetPaths`，先保持只有 `skills` 行为不变。
- 补测试：
  - 迁移后的 preferences 只包含最终结构。
  - 正常读写链路不接受或写回旧字段。
  - built-in target 输出仍包含原 skills 路径。
  - custom target 新结构可读写。

### Phase 2: 扩展 inventory 扫描

- 将 `InventoryService` 从 `findSkillFiles()` 扩展为按资产类型扫描。
- `skills` 继续解析 `SKILL.md` frontmatter。
- `commands` 等文件型资产先采用保守规则：
  - 只扫描约定目录直属文件。
  - 跳过隐藏文件和子目录。
  - 用文件名生成 `name/linkName`。
  - `title/description` 可从首个 Markdown 标题或文件名兜底。
- 保留现有 skills dedupe 规则，不把 commands 纳入 skill dedupe。
- 补测试：
  - 同一 source 同时包含 `skills/` 和 `commands/`。
  - `commands/foo.md` 生成稳定 leaf id。
  - 没有 `SKILL.md` 但有 `commands/` 的 source 是否允许导入，需要先明确产品行为。

### Phase 3: 调整部署计划和应用

- `ChannelAdapter.resolveTargetPath()` 增加 `assetType` 参数。
- `DeploymentPlanner` 按 leaf 的 `assetType` 选择 target root。
- 对 target 不支持的资产类型产生 blocked action，而不是静默跳过。
- 拆分 skill 专属命名逻辑：
  - skills 继续使用 `buildProjectedSkillNameCandidates`。
  - commands 等文件型资产默认保持文件名。
- 调整 drift / external identity 检测：
  - skills 仍可读取 `SKILL.md` identity。
  - 文件型资产先用 hash 和路径判断。
- 补测试：
  - `commands/foo.md` 投影到 `<profile>/commands/foo.md`。
  - target 不支持 commands 时报告 blocked。
  - 删除 commands leaf 后会删除对应投影。
  - skills 既有部署行为不回归。

### Phase 4: 更新 CLI / query / bridge

- Bridge 响应中的 leaf 增加 `assetType`。
- `save-settings` 支持新 `assetPaths`。
- `prepare-add` / `apply-draft` 保持 selected leaf id 机制，但展示按资产类型分组。
- CLI 文案从 `skills` 调整为 `assets` 或按类型显示。
- 补测试：
  - bridge 可读写新 custom target。
  - draft selected leaf ids 可以混合 skills 和 commands。
  - doctor 能报告非 skill asset 的 missing / blocked / drift。

### Phase 5: 更新 desktop UI

- Source detail 中按资产类型展示 leaf。
- 文件树中显示 `commands/` 等目录。
- Enable/disable 操作继续使用 leaf id，不为每种资产另建选择状态。
- Settings 的 custom target 编辑器增加资产路径映射：
  - 简化版可先提供 profile root，然后自动生成 `skills/commands/agents/...`。
  - 高级版再允许逐项覆盖。
- 补 XCTest：
  - source detail 能展示 commands。
  - 自定义 Claude profile target 能保存 commands path。
  - migration 后的既有 custom target 在 UI 中显示为只配置 skills。

### Phase 6: 文档与迁移说明

- 更新 `README.md`、`README.zh.md`、`README.ja.md` 中 target 和支持资产类型说明。
- 增加 release note，说明：
  - 已有 custom target 通过显式 state migration 转为 skills-only mapping。
  - 新的 Claude profile target 可同步 commands。
  - 不支持某资产类型的 target 会显示 blocked，而不是安装失败。

## 风险

- 当前 authority schema 是 V2。扩展 leaf 与 custom target 持久化结构属于外部变更；应升级 schema version 并走显式 migration，不能在 V2 normalizer 中静默长期兼容两种形状。
- commands / hooks / output-styles 的验证规则不如 skills 明确。初版应少做推断，只保证路径、hash 和投影正确。
- 部署层现有命名冲突逻辑是 skill 专属。直接复用到文件型资产会产生错误路径。
- Desktop UI 当前大量命名使用 `skills`，改文案和状态字段容易引入回归。
- Multi-profile 需求主要集中在 Claude Code。不要把非 skill 资产默认扩散到所有 agent target。

## 建议的最小可交付

第一版只交付：

1. 扫描 `commands/*.md`。
2. Claude Code built-in target 支持 `commands -> ~/.claude/commands`。
3. Custom target 支持 `assetPaths.skills` 和 `assetPaths.commands`。
4. CLI / bridge / desktop detail 能展示和选择 commands。
5. 既有 custom target 通过显式 state migration 转为 skills-only mapping。

暂缓：

- `agents/`、`hooks/`、`output-styles/` 的完整 UI。
- 所有 built-in target 的非 skill 映射。
- 复杂 commands metadata 解析。

## 验证清单

- `npm run -w @skill-flow/core-engine test -- src/tests/inventory-service-precedence.test.ts`
- `npm run -w @skill-flow/storage test`
- `npm run -w @skill-flow/query test -- src/tests/source-lifecycle.test.ts`
- `npm run -w skill-flow test -- src/tests/bridge-command.test.ts src/tests/skill-flow.test.ts`
- `swift test` in `apps/desktop-mac`
- 手动验证：
  - 添加包含 `skills/` 和 `commands/` 的本地 fixture。
  - 启用 Claude Code target。
  - 确认 `~/.claude/skills` 和 `~/.claude/commands` 分别生成投影。
  - 自定义 `CLAUDE_CONFIG_DIR` profile target 确认 commands 写入 profile 下的 `commands/`。

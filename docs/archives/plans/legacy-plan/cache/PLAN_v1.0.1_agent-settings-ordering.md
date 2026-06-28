# Agent Settings Ordering Plan

## Goal

为桌面端设置页新增一组 Agent 管理能力：

- 针对当前检测到的 Agent，逐项设置是否在桌面界面中启用显示
- 允许拖拽调整 Agent 行顺序
- 让该顺序成为 `Group Card` 与 `Group Detail` 中 Agent 展示的唯一事实来源

本次改动只覆盖 `apps/desktop-mac` 的本地设置与展示顺序，不修改 CLI、bridge 协议、source draft、真实部署绑定逻辑。

## Problem

当前桌面端对 Agent 的展示顺序和可见性没有用户级设置：

- 设置页只有 `homeCardDensity` / `menuCardDensity`，没有 Agent 列表配置
- `Group Card` 与 `Group Detail` 的 Agent 顺序都来自 `MainViewModel.targetOrder`
- `visibleTargetIds()` 只基于静态 `targetOrder` 和 `detectedTargets` 过滤，不能按用户偏好重排
- “是否显示某个 Agent” 与 “source 是否启用某个 target” 还是同一个概念，缺少纯 UI 层的显示开关

结果：

- 用户不能隐藏已检测但当前不想展示的 Agent
- 用户不能调整 `Group Card / Group Detail` 中 Agent 的阅读顺序
- 设置页无法承担“桌面展示偏好”的职责

## Boundary

### In Scope

- `SettingsState` 增加桌面端 Agent 显示配置
- `DesktopSettingsStore` 持久化新配置
- `SettingsViewModel` 提供读取、切换、重排能力
- `SettingsView` 新增 Agent section，支持每行开关与拖拽
- `MainViewModel.visibleTargetIds()` 改为读取用户配置后的顺序与可见性
- `Group Card` 与 `Group Detail` 自动复用同一排序结果
- 补充状态、存储、ViewModel、View 层测试

### Out of Scope

- 不修改 source 的 `enabledTargets`
- 不修改 bridge 返回结构
- 不增加新的 target 定义来源
- 不改 CLI/TUI 的 target 排序
- 不处理“未检测到但用户手动添加 target”的配置入口

## Existing Reusable Parts

- `SettingsState -> DesktopSettingsStore -> SettingsViewModel -> SettingsView`
  现有设置页已经有完整的本地持久化链路。
- `MainViewModel.visibleTargetIds()`
  已经是 `Group Card` 与 `Group Detail` 的展示入口，适合作为唯一接入点。
- `MainViewModel.targetOrder`
  可作为首次启动和配置修复时的默认顺序。
- `SettingsView.settingsSection / settingsRow`
  现有 section-row 结构可直接复用，不需要新建另一套设置容器。

## Proposed Data Model

新增桌面端展示配置，和真实部署状态分离。

```swift
struct AgentDisplayPreference: Equatable, Codable {
    var targetId: String
    var isVisible: Bool
    var sortOrder: Int
}

struct SettingsState: Equatable {
    ...
    var agentDisplayPreferences: [AgentDisplayPreference] = []
}
```

约束：

1. `agentDisplayPreferences` 只描述桌面展示偏好，不代表该 target 是否对某个 source 启用。
2. `targetId` 必须属于 `MainViewModel.targetOrder` 支持的 target 集。
3. 未落库时，默认按 `targetOrder` 初始化，`isVisible = true`。
4. 若用户已有旧配置但新增了新 target，新增项自动追加到末尾，默认可见。
5. 若配置中包含未知 target，读取时直接丢弃。

## Read / Write Rules

### Load

`DesktopSettingsStore.load()` 负责把 `UserDefaults` 中的原始值归一化为完整配置：

- 按 `targetOrder` 补齐缺失 target
- 清理未知 target
- 重新生成连续 `sortOrder`
- 如果当前 target 没有被检测到，也保留配置，但设置页默认只渲染“当前检测到的 Agent”

### Save

`SettingsViewModel` 在以下操作后立即持久化：

- 切换 Agent 显示开关
- 拖拽完成后的重排
- 重置设置

### Render

`MainViewModel.visibleTargetIds()` 改为：

1. 取 `detectedTargets`
2. 取 `settings.agentDisplayPreferences`
3. 按 `sortOrder` 排序
4. 仅保留 `isVisible == true` 且当前已检测到的 target
5. `showAllTargets == true` 时仍遵守用户顺序，但不绕过显示开关

这样 `Group Card.targets` 与 `DetailViewData.targets` 都无需单独维护顺序。

## UI Structure

在设置页新增一个 section，位置放在现有 `菜单栏` section 之后、`应用更新` 之前更合适，因为它同样属于桌面展示配置。

Section 名称建议：

- `settings.section.agent_display`
- 行标题格式：Agent 名称
- 行描述：当前 target id，必要时可附带 “Detected”

每一行包含：

- 左侧拖拽把手
- 中间 Agent 名称与补充描述
- 右侧 dark/light 风格的 `Toggle`

## ASCII Reference

### Light

```text
+----------------------------------------------------------------------------------+
| 设置                                                                             |
|                                                                                  |
|  外观                                                                            |
|  ...                                                                             |
|                                                                                  |
|  菜单栏                                                                          |
|  ...                                                                             |
|                                                                                  |
|  Agent Display                                                                   |
|  Configure which detected agents appear in group views and in what order.        |
|                                                                                  |
|  [::] Claude Code                                              [ ON ]  light     |
|       target: claude-code                                                          |
|                                                                                  |
|  [::] Codex                                                    [ ON ]  light     |
|       target: codex                                                                |
|                                                                                  |
|  [::] Cursor                                                   [OFF ] light      |
|       target: cursor                                                               |
|                                                                                  |
|  [::] Gemini CLI                                              [ ON ]  light     |
|       target: gemini-cli                                                           |
|                                                                                  |
|  drag to reorder -> affects Group Card / Group Detail agent order                |
+----------------------------------------------------------------------------------+
```

### Dark

```text
+----------------------------------------------------------------------------------+
| 设置                                                                             |
|                                                                                  |
|  Agent Display                                                                   |
|  Configure which detected agents appear in group views and in what order.        |
|                                                                                  |
|  [::] Claude Code                                              [ ON ]  dark      |
|  [::] Codex                                                    [ ON ]  dark      |
|  [::] Cursor                                                   [OFF ] dark       |
|  [::] Gemini CLI                                              [ ON ]  dark      |
|                                                                                  |
|  order preview: Claude Code -> Codex -> Gemini CLI                              |
+----------------------------------------------------------------------------------+
```

说明：

- `ON/OFF` 只是 ASCII 占位，实际继续使用系统 `Toggle`
- 行拖拽后立即更新 section 内顺序
- 关闭的 Agent 不从配置删除，只是从 `Group Card / Group Detail` 隐藏

## Interaction Semantics

### Toggle

- 关闭某个 Agent 时，只隐藏桌面显示入口
- 不改变任意 source 的 `draft.enabledTargets`
- 若某个 source 实际启用了该 target，只是不在桌面 `Group Card / Group Detail` 中展示

### Drag Reorder

- 只允许在“当前检测到的 Agent”列表中拖拽
- 拖拽结束后同步更新对应 target 的 `sortOrder`
- 未检测到的 target 保留在持久化配置里，但不参与当前 section 的拖拽列表
- 若之后再次检测到，按上次保存顺序恢复

### Reset Configuration

- 清空用户自定义可见性和顺序
- 恢复到 `targetOrder` 默认顺序
- 默认全部可见

## Implementation Plan

### Phase 1. State and persistence

- 在 `SettingsState` 增加 `agentDisplayPreferences`
- 在 `SettingsViewModel` 增加 key，例如 `desktop.agentDisplayPreferences`
- `DesktopSettingsStore` 增加 load/save 归一化逻辑
- 把“默认顺序”和“合法 target 列表”抽成一份可复用常量，避免 `SettingsViewModel` 和 `MainViewModel` 各自维护不同名单

### Phase 2. ViewModel behavior

- `SettingsViewModel` 提供：
  - `detectedAgentRows(detectedTargetIds:)`
  - `setAgentVisibility(targetId:isVisible:)`
  - `moveAgents(from:to:detectedTargetIds:)`
  - `resetAgentDisplayPreferences()`
- 明确区分：
  - 全量持久化配置
  - 当前检测到并可在设置页展示的配置

### Phase 3. Settings UI

- 在 `SettingsView` 增加 `Agent Display` section
- 复用现有 section card 样式
- 每行包含 drag handle + title/meta + toggle
- 拖拽使用 SwiftUI 原生重排能力；若现有 row 容器不适合，再最小化增加一个专用 list row
- 补三语文案：
  - section title
  - section description
  - 可能需要的 empty state，例如 “No detected agents”

### Phase 4. Consumption in group surfaces

- `MainViewModel.visibleTargetIds()` 改为先读取设置中的顺序与可见性
- `GroupCardModel.targets`
- `DetailViewData.targets`
- 相关 selection summary / toast 中依赖 `visibleTargetIds()` 的位置一起走同一结果

### Phase 5. Regression check

- 验证 Home `Group Card`
- 验证 Detail `Agent rail`
- 验证 Menu bar quick config 中引用到的 target 顺序是否应跟随新设置

说明：

`MenuBarQuickConfigView` 目前也走 `groupCards`。若其 card 内 target 展示同样依赖 `visibleTargetIds()`，则会自然继承新顺序；这是预期，不另起第二套规则。

## Test Checklist

### Unit

- `SettingsStateTests`
  - 默认状态包含空的 `agentDisplayPreferences`
  - store 保存后可正确重载
- `SettingsViewModelTests`
  - 旧用户无配置时自动生成默认顺序
  - 读取时丢弃未知 target
  - 新增 target 时自动追加并默认可见
  - toggle 后立即落库
  - reorder 后 `sortOrder` 连续且稳定
  - reset 后恢复默认顺序与可见性

### Integration

- `SettingsViewTests`
  - Agent section 使用现有背景/层级体系
  - 空列表时展示空态文案
- `MainViewModel` 相关测试
  - `visibleTargetIds()` 遵守设置顺序
  - 关闭某个 detected target 后，`Group Card` 与 `Detail` 均不再展示
  - 打开 `showAllTargets` 时仍遵守用户顺序和显示开关

### E2E-ish desktop workflow

- 从设置页拖拽 `Codex` 到 `Claude Code` 前面
- 返回 Home，确认 `Group Card` 的 Agent 顺序同步变化
- 进入 Detail，确认顶部 Agent rail 顺序一致
- 关闭 `Cursor`
- 返回 Home / Detail，确认 `Cursor` 消失，但 source 的真实 target 启用状态未被改写

## Risks

1. `detectedTargets` 是运行时集合，设置页只显示当前检测到的 target，容易让“未检测到但已配置”的 target 看起来消失。
   处理：计划中保留持久化但不显示，并在实现时评估是否需要附加说明文案。

2. `visibleTargetIds()` 当前还被 selection summary 等逻辑复用，改动后可能让某些计数或 toast 文案也跟着隐藏 target。
   处理：实现时逐个检查调用点，确认“显示隐藏”是否应该影响这些 UI 文案。

3. SwiftUI 拖拽容器若与现有 section card 结构冲突，可能需要把 Agent section 单独包成可重排子视图。
   处理：先保持 section 外观不变，只对内部行容器做最小必要调整。

## Success Criteria

- 设置页能列出当前检测到的 Agent
- 每个 Agent 都能独立开关显示
- Agent 行支持拖拽重排
- `Group Card` 与 `Group Detail` 使用同一顺序和可见性结果
- 关闭某个 Agent 不影响真实部署绑定
- 重启桌面 app 后设置仍然保留

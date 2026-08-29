# Click Target Audit

## Scope

- Pages reviewed: Home, Import, Detail, Settings
- Shared components reviewed: `SharedGroupCard`, `EditableGroupTagSection`
- Review method: static inspection of SwiftUI view hierarchy, focusing on `Button`, `buttonStyle(.plain)`, `contentShape`, and whether the visible control chrome is inside or outside the tappable label

## Conclusion

当前代码里，绝大多数 toolbar 按钮、筛选 pill、导入按钮、文档 tab、agent pill 的点击范围与视觉范围一致。

需要后续统一修复的点击区域问题主要集中在两类：

1. `buttonStyle(.plain)` 后，把 `frame/background/clipShape/overlay` 挂在 `Button` 外层，导致视觉上是完整按钮，但实际命中区域大概率仍偏向文本本身。
2. 只把局部文本包进 `Button`，导致视觉上像整块都可点，但实际上只有文本区域可点。

## Findings

### 1. Settings / Check Updates

- Page: Settings
- Control: `Check Updates`
- File: [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L199)
- Expected hit area: 整个 `168 x 32` 的圆角按钮
- Actual hit area from code: 更接近按钮文本本身；圆角背景和边框是在 `Button` 外层追加的
- Why:
  `Button(t("settings.action.check_updates")) { ... }`
  后面才接 `.frame(...).background(...).clipShape(...)`
- Risk:
  用户点击按钮左右留白区域时，可能没有响应

### 2. Settings / Open Releases

- Page: Settings
- Control: `Open Releases`
- File: [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L218)
- Expected hit area: 整个 `168 x 32` 的圆角按钮
- Actual hit area from code: 更接近文本本身；视觉按钮外框没有进入 label 命中区域
- Root cause:
  与 `Check Updates` 相同，`frame/background/clipShape` 都在 `Button` 外层

### 3. Settings / Clear Cache

- Page: Settings
- Control: `Clear Cache`
- File: [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L275)
- Expected hit area: 整个 `168 x 32` 的圆角按钮
- Actual hit area from code: 更接近文本本身
- Root cause:
  与上面相同，属于同一类 plain button 命中区域问题

### 4. Settings / Reset Configuration

- Page: Settings
- Control: `Reset Configuration`
- File: [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L291)
- Expected hit area: 整个 `168 x 32` 的圆角按钮
- Actual hit area from code: 更接近文本本身
- Root cause:
  与上面相同，属于同一类 plain button 命中区域问题

### 5. Detail / Sidebar Skill On-Off Toggle

- Page: Detail
- Control: 每个 skill 行右侧的 `ON/OFF` 小开关
- File: [DetailScreen.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift#L453)
- Expected hit area: 整个 `34 x 34` 的圆角状态块
- Actual hit area from code: 更接近 `ON/OFF` 文本本身；视觉块体积大于实际命中范围
- Why:
  `Button("ON"/"OFF") { ... }`
  后面才接 `.frame(width: detailToggleWidth, height: detailToggleHeight)`, `.background(...)`, `.clipShape(...)`
- Extra risk:
  这个控件还嵌在整行 `.onTapGesture` 内，用户点中状态块周边空白时，可能不是切换启用状态，而是触发行选中

### 6. Home / Group Card Title Entry

- Page: Home
- Control: 组卡片头部标题入口
- File: [GroupCardComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift#L409)
- Expected hit area: 头部左侧整块标题区，至少包含标题与副标题所在视觉块
- Actual hit area from code: 只有 `headerPrimaryContent` 的文字内容区域进入 `Button`
- Why:
  `Button(action: onOpen) { headerPrimaryContent }`
  外层承载布局的 `VStack.frame(maxWidth: .infinity, alignment: .leading)` 不在按钮内部
- Scope:
  该组件用于 Home 页卡片；Import 页这里 `onOpen` 为 `nil`，不受此项影响
- Note:
  这一项是否算缺陷，取决于产品预期。如果预期是“点标题文字进入详情”，则现状成立；如果预期是“点标题区进入详情”，则需要纳入统一修复

### 7. Home / Header Brand Block

- Page: Home
- Control: 左上角品牌区
- File: [MainView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift#L245)
- Expected hit area: 如果设计意图是“图标 + app 名称”整体作为一个入口，那么整块都应可点
- Actual hit area from code: 只有左侧图标是 `Button`，右侧 `app.name` 文本不可点
- Why:
  `Button` 只包住图标，没有包住旁边标题文本
- Note:
  这项同样取决于预期。如果产品只希望图标可点、标题仅展示文本，则不必修

## Controls Checked And Currently Aligned

以下控件从代码结构看，点击区域和视觉范围基本一致，当前不列入修复清单：

- Home / top bar 返回、导入、更新、设置按钮
- Home / 标签筛选 pills
- Import / 卡片主操作按钮
- Detail / 文档 tabs
- Detail / group/skill 全量切换小开关 `detailToggleButton`
- Detail / agents 横向 pills
- Settings / 自定义 dropdown 主触发器和下拉选项
- Shared / 标签新增按钮、建议标签 pills、可选标签 pills

## Suggested Fix Direction

后续统一修复时，建议只做一类收敛，不要分散打补丁：

- 对所有 `plain` 按钮，优先把 `frame/background/clipShape/overlay/contentShape` 收进 `label` 内部
- 或者统一封装一个桌面端按钮样式组件，避免各页面重复写出“看起来有按钮外框、实际上只点中文字”的结构
- 对“整行选择 + 行内小按钮”并存的场景，明确主次命中区，避免切换按钮与整行选中互相抢手势

## Priority

建议优先级如下：

1. Settings 页 4 个操作按钮
2. Detail 页 skill `ON/OFF` 开关
3. Home 页 Group Card 标题入口
4. Home 页品牌区是否整块可点，等产品预期确认后决定

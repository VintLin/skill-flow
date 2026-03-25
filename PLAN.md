# PLAN - MAC GUI vCurrent

## 目标
- 按 `docs/plan/PLAN_MAC_GUI.md` 完成当前版本 GUI 开发。
- 主窗口与 `docs/gui/index.html` 视觉与结构对齐（无 Footer 品牌区）。
- 菜单栏与 `docs/gui/enum.html` 视觉与交互对齐。
- TUI 关键语义在 GUI 层完整可用：tri-state、draft/apply、clawhub 批量 update、失败恢复。

## 任务分配

- [x] T1 `MainViewModel` 语义补齐（Owner: subagent-A）
  - 新增 `SelectionState.swift`
  - 新增 `ProjectionRules.swift`
  - `MainViewModel` 增加 skill/target tri-state API
  - draft 初始化 fallback、target 顺序归一化、state map prune
  - save failed -> edit reset -> retry 语义
  - clawhub 组批量 update 语义

- [x] T2 主窗口 UI 对齐 `index.html`（Owner: subagent-B）
  - Header / Toolbar / Config Grid / Stats / Detail Overlay
  - 断点布局：>1120, <=1120, <=860, <=620
  - Detail active-line 与 warning/projected name 展示
  - 不渲染 Footer 品牌区

- [x] T3 菜单栏 UI 对齐 `enum.html`（Owner: subagent-C）
  - Popover topbar + list + actionbar
  - Import 展开与输入 focus
  - Details 联动开关及 close 清理
  - 与主窗口共享状态同步

- [x] T4 测试补齐（Owner: subagent-A）
  - `MainViewModelSelectionTests.swift`
  - `ProjectionRulesTests.swift`
  - `WorkflowCoverageTests.swift` 补充关键集成路径

- [x] T5 集成验收（Owner: main）
  - `swift build`
  - `swift test`
  - 校对交互与样式偏差并做最后修正

## 回填记录
- T1 已完成：`MainViewModel` 已补齐 tri-state API、fallback draft 初始化、TARGET_ORDER 归一化、save failed 恢复、group update（含 clawhub 组 sourceIds）与状态 prune；新增 `SelectionState.swift`、`ProjectionRules.swift`。
- T2 已完成：`apps/desktop-mac/Sources/SkillFlowDesktop/Features/Main/MainView.swift` 现已接入真实 `viewModel` 数据，完成 header / toolbar / config grid / stats / detail overlay 结构与响应式断点。
- T3 已完成：`MenuBarQuickConfigView.swift` 已对齐 topbar/list/actionbar，补齐 import 展开+focus、details active 联动、close/onDisappear 清理状态。
- T4 已完成：新增 `MainViewModelSelectionTests.swift`、`ProjectionRulesTests.swift`，并补充 `WorkflowCoverageTests.swift` 断言。
- T5 已完成：主线程复验 `cd apps/desktop-mac && swift build`、`cd apps/desktop-mac && swift test` 全部通过（6 tests, 0 failures）。

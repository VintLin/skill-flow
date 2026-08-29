# Animation Candidate Audit

## Scope

- Pages reviewed: Home, Import, Detail, Settings
- Shared components reviewed: `SharedGroupCard`, `EditableGroupTagSection`
- Review method: static inspection of current SwiftUI interaction controls, grouped by visual role and interaction density
- Goal: 只判断是否适合补充 `hover` / `press` 动画，不直接决定实现方式

## Decision Rules

- `Recommended`: 适合加轻量 `hover` 和 `press`，有明确点击语义，动画能增强反馈
- `Optional`: 可以加，但收益一般，应该服从统一风格，不建议单独定制
- `Avoid`: 不建议加，容易引入噪音、抢主视觉或干扰已有状态表达
- `Group-only`: 必须作为一整组统一处理，不能单个控件先行

## Summary

最适合先考虑动画的，是高频、小体积、显式按钮类控件：

- 顶部 toolbar 按钮
- Settings 页操作按钮和 dropdown
- Detail 页文档 tab、agent pill、树节点行
- GroupCard 内的主操作按钮、更多按钮、技能/目标切换 pills

不建议优先做动画的，是已经依赖“选中态 / loading 态 / drag 态”表达状态的控件，或者输入过程中的辅助元素：

- Settings 页 segmented `Picker`
- 系统 `Toggle`
- 正在 loading 的 placeholder / progress
- 标签输入框本身

## Findings By Area

### Home / Top Bar

#### 1. Toolbar icon buttons

- Controls: back / import / update / settings
- File: [MainView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift#L935)
- Current shape: 34x34 rounded icon button
- Recommendation: `Recommended`
- Suggested motion level: 轻量 `hover` 提亮或边框增强，`press` 做 0.96-0.98 的缩放或轻微下压
- Why:
  这是标准高频工具栏按钮，尺寸固定，交互语义简单，最适合承载统一按钮动画
- Constraint:
  不要影响当前阴影和边框层次；`update` 按钮已有旋转状态，hover/press 动画要避免和旋转打架

#### 2. Home tag filter pills

- Controls: tag filter pills
- File: [MainView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift#L812)
- Recommendation: `Recommended`
- Suggested motion level: `hover` 做背景 alpha 或边框轻微增强，`press` 用很轻的缩放
- Why:
  这是典型 chip 类控件，动画收益高，而且和后续 GroupCard 内的 skill/target pills 可以共用一套语言
- Constraint:
  `selected` 态已经靠 opacity 和边框表达，hover 动画要弱于 selected 态，避免状态优先级混乱

### Home / Import / Menu Shared Card

#### 3. Group card title entry

- Control: card header title area
- File: [GroupCardComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift#L405)
- Recommendation: `Optional`
- Suggested motion level: 仅 `hover`，例如标题颜色或底层透明蒙层轻微变化；不建议明显 `press`
- Why:
  它像“进入详情”的点击区，但视觉上不是独立按钮；强按压动画会让用户误以为整卡都可按
- Constraint:
  如果后续决定整卡也支持点击，这一块要重新归类为 `Group-only`

#### 4. Group card stats icons

- Controls: github / local path icons
- File: [GroupCardComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift#L461)
- Recommendation: `Optional`
- Suggested motion level: 仅 `hover` 变亮，不建议缩放
- Why:
  这是次级 icon action，适合给可点击暗示，但不值得做明显按压效果
- Constraint:
  图标尺寸很小，过度 motion 会显得抖动

#### 5. Group card more / pin button

- Control: more / pin action button
- File: [GroupCardComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift#L504)
- Recommendation: `Recommended`
- Suggested motion level: `hover` 提亮图标和背景，`press` 轻微缩放
- Why:
  这是标准 icon action，且已经有 `onHover` 状态来源，接动画成本最低
- Constraint:
  打开 popover 时应优先维持“active/open”状态，不要继续播放 hover 动画

#### 6. Group card primary action button

- Control: import button / compact icon action
- File: [GroupCardComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift#L605)
- Recommendation: `Recommended`
- Suggested motion level: `hover` 提亮背景或边框，`press` 轻微缩放
- Why:
  这是卡片内最明确的 CTA，动画收益高
- Constraint:
  `disabled` 和 `busy` 态不能继续有 hover/press 反馈

#### 7. Group card skill pills / target pills / tri-state switch

- Controls: skills, targets, all-on/off switch
- File: [GroupCardComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift#L773)
- Related files:
  [GroupCardComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift#L859)
  [GroupCardComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift#L884)
  [GroupCardComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift#L940)
- Recommendation: `Group-only`
- Suggested motion level: 整组统一；建议所有 chip 类控件使用同一 hover/press 规则
- Why:
  这几类控件在视觉上属于同一语言层级，如果只给某一类加动画，会非常不统一
- Constraint:
  `isOn` / `selection` 是主状态，hover 只能是附加层，不能盖过已选中的品牌色填充

#### 8. Group card action menu items

- Control: popover menu entries
- File: [GroupCardComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift#L1036)
- Recommendation: `Optional`
- Suggested motion level: 只建议 `hover` 背景显色；一般不需要额外 `press`
- Why:
  菜单项更适合清晰的 hover 高亮，不需要卡片式按压
- Constraint:
  应与 macOS 菜单感一致，避免做成移动端按钮感

### Detail

#### 9. Sidebar group row / skill rows

- Controls: selectable rows in sidebar
- File:
  [DetailScreen.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift#L400)
  [DetailScreen.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift#L436)
- Recommendation: `Recommended`
- Suggested motion level: 仅 `hover` 背景轻微显色；不建议整行 `press`
- Why:
  这是典型列表选择项，hover 可以增强可导航感
- Constraint:
  行内已有独立的小开关按钮，整行动画必须弱，不然会和行内控件抢焦点

#### 10. Sidebar small toggles

- Controls: group / skill selection switch, target all switch
- File:
  [DetailScreen.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift#L453)
  [DetailScreen.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift#L1133)
- Recommendation: `Group-only`
- Suggested motion level: 仅在 switch 系列内部统一考虑；hover 可做亮度变化，press 可做极轻微缩放
- Why:
  这些控件本身已经承担强状态切换语义，动画必须非常克制
- Constraint:
  不能让动画影响 `ON/OFF/PARTIAL` 的可读性

#### 11. Document tabs

- Control: group/skill document tab chips
- File: [DetailScreen.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift#L1172)
- Recommendation: `Recommended`
- Suggested motion level: `hover` 背景浮起或边框增强，`press` 轻微缩放
- Why:
  这是很标准的 tab/chip 控件，动画收益高，也容易统一
- Constraint:
  已选中 tab 要保持稳定，不要持续 pulse；外链按钮与 tab 本体要区分反馈

#### 12. External link icon in document tabs

- Control: tiny external-link button
- File: [DetailScreen.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift#L1191)
- Recommendation: `Optional`
- Suggested motion level: 仅 `hover` 变亮
- Why:
  是小型辅助动作，强动画价值不高

#### 13. Agent pills

- Control: target pills in detail agent rail
- File: [DetailScreen.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift#L596)
- Recommendation: `Recommended`
- Suggested motion level: `hover` 背景/边框增强，`press` 轻微缩放
- Why:
  形态稳定、密度适中，和 Home/GroupCard 内 target pills 可共用交互语言
- Constraint:
  enable/disable 是主状态，hover 必须是次级叠加

#### 14. File tree rows

- Control: file tree item rows
- File: [DetailScreen.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift#L724)
- Recommendation: `Recommended`
- Suggested motion level: 仅 `hover` 背景轻微显色，不建议缩放
- Why:
  这是导航列表项，更适合桌面式 hover，不适合按钮式 press
- Constraint:
  文件树有层级线和选中指示条，动画只能弱化地辅助，不要影响树结构阅读

### Settings

#### 15. Settings action buttons

- Controls: check updates / open releases / clear cache / reset configuration
- File: [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L567)
- Recommendation: `Recommended`
- Suggested motion level: `hover` 背景提亮，`press` 轻微缩放或下压
- Why:
  这些是最传统的按钮形态，适合成为“统一桌面按钮动画”的基准样式

#### 16. Dropdown trigger and options

- Controls: accent / language / log level dropdown trigger and option rows
- File:
  [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L585)
  [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L627)
- Recommendation: `Recommended`
- Suggested motion level: trigger 允许 `hover` + 很轻的 `press`；option rows 只建议 `hover`
- Why:
  dropdown trigger 是按钮，option row 更接近菜单项，两者都适合统一但不应完全同一套 motion

#### 17. Segmented Pickers

- Controls: theme / home density / menu density
- File: [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L106)
- Recommendation: `Avoid`
- Why:
  这是系统 `Picker(.segmented)`，强行叠加自定义动画容易和系统行为不一致，也更难保持跨主题稳定

#### 18. System Toggles

- Controls: auto launch / external helper / agent visibility toggle
- File:
  [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L219)
  [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L432)
- Recommendation: `Avoid`
- Why:
  系统控件已经有原生交互反馈，再额外包动画一般收益低且容易不协调

#### 19. Agent display row drag handle

- Control: drag handle chip
- File: [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L384)
- Recommendation: `Optional`
- Current state: 已有 hover 视觉变化
- Suggested motion level: 如果做，只做 hover 过渡补间，不建议额外 press
- Why:
  这个元素本质上偏拖拽 affordance，不是普通点击按钮

#### 20. Agent display row card

- Control: draggable setting row container
- File: [SettingsView.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift#L437)
- Recommendation: `Avoid`
- Why:
  它主要是承载拖拽、toggle 和信息，不是单一点击入口；给整个 row 加 hover 或 press 容易误导

### Tags

#### 21. Add tag button

- Control: plus button in tag section
- File: [GroupTagComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupTagComponents.swift#L117)
- Recommendation: `Recommended`
- Suggested motion level: `hover` 提亮，`press` 轻微缩放
- Why:
  这是标准小型 icon action，适合和其它 small icon button 共用规则

#### 22. Suggested tag pills / selectable tag pills

- Controls: tag suggestion pills, selectable tag pills
- File:
  [GroupTagComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupTagComponents.swift#L98)
  [GroupTagComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupTagComponents.swift#L172)
- Recommendation: `Group-only`
- Why:
  它们和 Home filter pills、GroupCard skill pills 属于同一 chip 家族，应该统一决定是否加动画

#### 23. Delete tag close button

- Control: inline close button inside tag pill
- File: [GroupTagComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupTagComponents.swift#L197)
- Recommendation: `Optional`
- Suggested motion level: 只做 hover 变亮
- Why:
  按钮太小，缩放收益不高，容易显得抖

#### 24. Tag input field

- Control: text input while editing tags
- File: [GroupTagComponents.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/Components/GroupTagComponents.swift#L70)
- Recommendation: `Avoid`
- Why:
  输入框更适合 focus ring / border 变化，而不是 hover / press 动画

### App Bridge

#### 25. Settings bridge prominent button

- Control: open settings button in app settings bridge
- File: [SkillFlowDesktopApp.swift](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/apps/desktop-mac/Sources/DesktopApp/App/SkillFlowDesktopApp.swift#L69)
- Recommendation: `Avoid`
- Why:
  这是 `.borderedProminent` 系统按钮，优先保留系统行为，不建议单独定制动画

## Suggested Grouping For Confirmation

如果后续要统一确认是否加动画，建议按下面 5 组来做决定，而不是 25 个控件逐个拍板：

1. `Toolbar/Icon Buttons`
   Includes: top bar buttons, card more button, add tag button, tiny auxiliary icons

2. `Primary Buttons`
   Includes: Settings action buttons, card primary action button

3. `Chip/Tab/Pill Controls`
   Includes: home filter pills, detail document tabs, detail agent pills, group card skill/target pills, suggestion tags

4. `List Row Hover`
   Includes: detail sidebar rows, file tree rows

5. `System Controls / No Custom Motion`
   Includes: segmented pickers, toggles, text fields, system prominent button, drag/drop containers

## Recommended Default Decisions

如果你希望我先给一个默认建议，我会这样推荐：

- Approve:
  `Toolbar/Icon Buttons`
  `Primary Buttons`
  `Chip/Tab/Pill Controls`
  `List Row Hover`

- Reject:
  `System Controls / No Custom Motion`

## Notes

- `GroupCard` 的整卡点击边界补充结论：
  `Home` 页可以考虑“整卡非子控件区域进入 detail”；
  `Import` 页不建议整卡进入 detail，主任务应保持为导入或导入提示；
  `Menu` 场景也不建议整卡进入 detail，避免小空间误触
- 当前 [`.gitignore`](/Users/Vint/.superset/worktrees/skill-flow/feat-animation/.gitignore) 仍有未提交变更，和本次文档梳理无关
- 本文档只基于代码结构和当前视觉语义判断，没有启动桌面应用进行实际 hover 体验验证

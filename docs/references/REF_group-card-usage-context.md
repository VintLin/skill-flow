# Group Card 使用位置与状态模型

## 结论

`SharedGroupCard` 只有一个实现，但文档层不应再把当前代码里的 6 个 `displayMode` 当成一级状态。

应该使用下面这套状态模型：

- `Context`
  - `home`
  - `menu`
  - `import`
- `Variant`
  - `home`
    - `comfortable`
    - `compact`
  - `menu`
    - `comfortable`
    - `compact`
  - `import`
    - `search`
    - `recommendation`
- `RuntimeState`
  - `skillsCollapsed`
  - `showsTagSummary`
  - `isBusy`

核心约束：

- 缩放因子只允许在 `menu` 中使用
- `homeComfortable`
- `homeCompact`
- `importSearch`
- `importRecommendation`

以上 4 类都不进入缩放路径

---

## 当前实现状态与规范化状态的映射

| 当前实现状态 | Context | Variant |
|---|---|---|
| `homeComfortable` | `home` | `comfortable` |
| `homeCompact` | `home` | `compact` |
| `menuComfortable` | `menu` | `comfortable` |
| `menuCompact` | `menu` | `compact` |
| `importSearch` | `import` | `search` |
| `importRecommendation` | `import` | `recommendation` |

---

## 应合并的状态

以下状态在文档层应先合并，再讨论差异：

- `homeComfortable` / `homeCompact`
  - 先合并为 `Context = home`
- `menuComfortable` / `menuCompact`
  - 先合并为 `Context = menu`
- `importSearch` / `importRecommendation`
  - 先合并为 `Context = import`

---

## 冗余状态

以下状态都不应再作为一级判断状态单独建模，它们只是派生结果：

- `isMenuContext`
- `usesPlainPrimaryActionIcon`
- `supportsCollapsedSkills`
- `showsMetaLine`
- `showsSectionTitles`
- `reservesHeaderStatsRow(...)`
- `showsHeaderDivider(...)`

这些状态应从 `Context + Variant + RuntimeState` 推导。

---

## 必须保留的状态

以下状态不能合并掉，因为它们不是静态派生量：

- `skillsCollapsed`
  - 运行时展开状态
- `showsTagSummary`
  - 数据存在性状态
- `isBusy`
  - 异步交互状态

---

## 使用位置

### Home

- 文件：`apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- 当前实现状态：
  - `homeComfortable`
  - `homeCompact`
- `clickPolicy = .home`
- `onOpen != nil`
- tag 可编辑

### Menu Bar Quick Config

- 文件：`apps/desktop-mac/Sources/DesktopApp/Components/MenuBar/MenuBarQuickConfigView.swift`
- 当前实现状态：
  - `menuComfortable`
  - `menuCompact`
- `clickPolicy = .menu`
- `onOpen = nil`
- tag 只读
- `menuCompact` 下 `skillsCollapsed = hoveredGroupId != card.id`

### Import Search

- 文件：`apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`
- 当前实现状态：`importSearch`
- `clickPolicy = .importSearch`
- `onOpen = nil`
- 使用 import 主操作按钮

### Import Recommendation

- 文件：`apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`
- 当前实现状态：`importRecommendation`
- `clickPolicy = .importSearch`
- `onOpen = nil`
- 使用 import 主操作按钮
- 使用推荐标签和推荐文案，不使用普通 tag 语义

---

## 已确认的显示规则

### `homeComfortable`

- 显示 `MetaLine`
- 显示 `MetaLine` 下方 divider
- 显示 `Agent` 标题
- 显示 `Skill` 标题
- 显示 summary 前 divider
- tag 可编辑
- 不使用缩放因子

### `homeCompact`

- 隐藏 `MetaLine`
- 隐藏 `MetaLine` 下方 divider
- 隐藏 `Agent` 标题
- 隐藏 `Skill` 标题
- 隐藏 summary 前 divider
- tag 可编辑
- 不使用缩放因子

### `menuComfortable`

- 基于 `homeComfortable`
- 隐藏 `MetaLine` 下方 divider
- 隐藏 `Agent` 标题
- 隐藏 `Skill` 标题
- 隐藏 summary 前 divider
- tag 不可编辑
- `Skills` 默认展开
- 使用 menu 缩放

### `menuCompact`

- 基于 `homeComfortable`
- 隐藏 `MetaLine`
- 隐藏 `MetaLine` 下方 divider
- 隐藏 `Agent` 标题
- 隐藏 `Skill` 标题
- 隐藏 summary 前 divider
- tag 不可编辑
- `Skills` 默认折叠，hover 显示
- 使用 menu 缩放

### `importSearch`

- 显示 `MetaLine`
- 显示 `MetaLine` 下方 divider
- 显示 `Agent` 标题
- 显示 `Skill` 标题
- 不显示推荐标签
- 不显示推荐文案
- 不进入缩放路径

### `importRecommendation`

- 显示 `MetaLine`
- 显示 `MetaLine` 下方 divider
- 显示 `Agent` 标题
- 显示 `Skill` 标题
- 用推荐标签和推荐文案替换 tags summary
- recommendation tag 和普通 tag 不是同一种东西
- 不进入缩放路径

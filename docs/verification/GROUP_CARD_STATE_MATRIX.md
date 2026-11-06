# Group Card 页面状态梳理

## 范围

本文只梳理 macOS 桌面端 `SharedGroupCard` 在不同页面中的实际状态。

- 组件定义：`apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
- 实际挂载页：
  - Home：`apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
  - Import：`apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`
  - Menu Bar：`apps/desktop-mac/Sources/DesktopApp/Components/MenuBar/MenuBarQuickConfigView.swift`
- 非 Group Card：Detail 页不直接复用 `SharedGroupCard`，只复用部分 header metadata 语义。

## 页面归类

```text
SharedGroupCard
|
+-- Home
|   +-- Home / Standard      -> displayMode = .homeComfortable
|   `-- Home / Compact       -> displayMode = .homeCompact
|
+-- Import
|   +-- Search Result        -> displayMode = .importSearch
|   `-- Recommendation       -> displayMode = .importRecommendation
|
`-- Menu Bar
    +-- Menu / Comfortable   -> displayMode = .menuComfortable
    `-- Menu / Compact       -> displayMode = .menuCompact
```

## Canonical state model

The six implementation display modes are derived from three dimensions:

| Dimension | Values |
| --- | --- |
| Context | `home`, `menu`, `import` |
| Variant | `comfortable`, `compact`, `search`, `recommendation` |
| Runtime state | `skillsCollapsed`, `showsTagSummary`, `isBusy` |

Mapping rules:

- `homeComfortable` and `homeCompact` are Home variants.
- `menuComfortable` and `menuCompact` are Menu variants; only Menu may use the compact scale factor.
- `importSearch` and `importRecommendation` are Import variants and never use the scale factor.
- `skillsCollapsed` is a runtime state and is only active in Menu compact behavior.
- Recommendation badges and descriptions are a recommendation summary, not ordinary Group Tags.

Callers and tests should reason in these dimensions first. `displayMode` remains the implementation mapping used by the SwiftUI card.

## 统一骨架

所有页面的 Group Card 基本骨架一致：

```text
+--------------------------------------------------+
| Title / Byline                         [Action]  |
| stats row / reserved empty row                   |
| ------------------------------------------------ |
| tag row OR recommendation badges / description   |
| ------------------------------------------------ |
| AGENTS [arrow only when overflowing]             |
| [ALL] [Agent] [Agent] [Agent] ...               |
| SKILLS (N) [arrow only when overflowing]         |
| [ALL] [Skill] [Skill] [Skill] ...               |
+--------------------------------------------------+
```

其中以下部分会随页面状态变化：

- 右上角动作区：`[More/Pin]` 或 `[Import]`
- header divider：有的页面显示，有的页面不显示
- tag 区：显示自定义标签，或显示推荐 badge，或完全不显示
- skills 区：在 Menu Bar display mode 下允许折叠
- Agent / Skill overflow：以渲染后的真实 Item 宽度判断，不以数量判断
- loading/busy 文案：`Applying` / `Updating` / `Downloading`

## 页面状态矩阵

| 页面 | displayMode | 顶部动作 | tag/recommendation 区 | skills 区 | overflow 入口 | header divider | 典型用途 |
|---|---|---|---|---|---|---|
| Home / Standard | `.homeComfortable` | 更多菜单 | 自定义标签，可增删 | 始终展开 | 标题始终显示；溢出时加箭头 | 有 | 主工作台卡片 |
| Home / Compact | `.homeCompact` | 更多菜单 | 自定义标签，只读摘要 | 始终展开 | 无溢出时隐藏标题；溢出时显示标题 + 箭头 | 无 | Home 的紧凑外观 |
| Import / Search | `.importSearch` | 导入按钮 | 无标签；无推荐 badge | 始终展开 | 标题始终显示；溢出时加箭头 | 有 | 搜索结果 |
| Import / Recommendation | `.importRecommendation` | 导入按钮 | 推荐 badge + 推荐说明 | 始终展开 | 标题始终显示；溢出时加箭头 | 有 | 推荐流内容 |
| Menu / Comfortable | `.menuComfortable` | 更多菜单 | 标签摘要，只读 | 可折叠 | 无溢出时隐藏标题；溢出时显示标题 + 箭头 | 无 | 菜单栏完整卡片 |
| Menu / Compact | `.menuCompact` | 更多菜单 | 标签摘要，只读 | 默认折叠，hover 0.5s 后展开 | 展开且溢出时显示标题 + 箭头 | 无 | 菜单栏默认紧凑卡片 |

## 各页面 ASCII 对照

### 1. Home / Standard

```text
+--------------------------------------------------+
| Alpha Hub                              [ ... ]   |
| by @owner                                         |
| dl 5,045   star 1,200   github                    |
| ------------------------------------------------ |
| #tag-a  #tag-b  [+ add / delete when editing]    |
| ------------------------------------------------ |
| AGENTS ∨                                          |
| [ALL] [C] [G] [K]                                |
| SKILLS (12) ∨                                     |
| [ALL] [browse] [qa] [ship] ...                   |
+--------------------------------------------------+
```

特征：

- 可点击标题进入 Detail
- 更多菜单包含 Pin / Update / Edit Tags / Delete Tags / Delete
- 卡片 busy 时显示 `Updating`

### 2. Home / Compact

```text
+----------------------------------------------+
| Alpha Hub                          [ ... ]   |
| by @owner                                     |
| #tag-a  #tag-b                                |
| AGENTS                                        |
| [ALL] [C] [G] [K]                             |
| SKILLS                                        |
| [ALL] [browse] [qa] [ship] ...                |
+----------------------------------------------+
```

特征：

- 使用 `.homeCompact` 外观，因此没有 header divider
- section title 在没有 overflow 时隐藏
- 目标行更紧凑
- Home 中固定 `skillsCollapsed = false`

### 3. Import / Search

```text
+--------------------------------------------------+
| Alpha Hub                            [import]    |
| by @owner / github.com/acme/alpha-hub            |
| dl 5,045   star 1,200   github                    |
| ------------------------------------------------ |
| AGENTS ∨                                          |
| [ALL] [C] [G] [K]                                |
| SKILLS (12) ∨                                     |
| [ALL] [br[ow]se] [qa] [ship] ...                 |
+--------------------------------------------------+
```

特征：

- 右上角是纯图标导入按钮，不是更多菜单
- skill 可带搜索高亮
- 无 group tag
- 如果已安装，本地仍显示卡片；导入按钮显示 `Installed` 并保持禁用，不再触发导入或 toast
- 卡片 busy 时显示 `Downloading`

### 4. Import / Recommendation

```text
+--------------------------------------------------+
| Alpha Hub                            [import]    |
| by @owner / github.com/acme/alpha-hub            |
| dl 5,045   star 1,200   github                    |
| ------------------------------------------------ |
| #Development   #Research                         |
| Best for exploring repo workflows quickly.       |
| ------------------------------------------------ |
| AGENTS ∨                                          |
| [ALL] [C] [G] [K]                                |
| SKILLS (12) ∨                                     |
| [ALL] [browse] [qa] [ship] ...                   |
+--------------------------------------------------+
```

特征：

- 仅推荐页会出现 recommendation badges 与 description
- 仍然没有标签编辑能力
- 与 Search 共用导入 busy 态和纯图标导入按钮

### 5. Menu / Compact

```text
+------------------------------------------+
| Alpha Hub                      [ ... ]   |
| by @owner                                 |
| #tag-a  #tag-b                            |
| AGENTS [∨ only when overflowing]          |
| [ALL] [C] [G] [K]                         |
|                                          |
|  (skills collapsed by default)           |
+------------------------------------------+

hover 0.5s

+------------------------------------------+
| Alpha Hub                      [ ... ]   |
| by @owner                                 |
| #tag-a  #tag-b                            |
| AGENTS [∨ only when overflowing]          |
| [ALL] [C] [G] [K]                         |
| SKILLS [∨ only when overflowing]         |
| [ALL] [browse] [qa] [ship] ...           |
+------------------------------------------+
```

特征：

- 默认紧凑模式；无 overflow 时不显示 section title
- 只有 Menu Bar 的 compact 模式会真实使用 `skillsCollapsed`
- 标签只展示，不允许新增/删除
- 标题不可点击进入 Detail；页面通过外层导航控制

### 6. Agent / Skill Overflow Popover

```text
条件：真实 Item 宽度 > 卡片可视宽度

AGENTS ∨  <- 点击标题或箭头
   |
   +--> +--------------------------------------+
        | AGENT                                |
        | [OFF] [Agent] [Agent] [Agent]         |
        | [Agent] [Agent] [Agent]               |
        |                                      |
        | 宽度约 320px，最高约 280px             |
        | 内容过高时在浮窗内部滚动                 |
        +--------------------------------------+

关闭：点击外部区域 / Escape
```

- loading 或 empty section 不显示箭头。
- busy card 仍可打开浮窗，但浮窗内 mutation 保持 disabled。
- popover 保留 tri-state、Item enabled、source title 和 search highlight 语义。
- title / arrow 命中优先于整卡导航，点击入口不会进入 Detail。

## 关键差异清单

### 1. 动作区差异

- Home / Menu：右上角是更多菜单；可 Pin、Update、Delete。
- Import：右上角是导入按钮；不提供 Pin、Delete、Tag 编辑。

### 2. 标签区差异

- Home：真实标签编辑场景，支持新增、删除、筛选联动。
- Menu：只展示已解析标签，不支持编辑。
- Import / Search：标签区为空。
- Import / Recommendation：标签区被推荐 badge + 推荐文案替代。

### 3. skills 展开差异

- `.homeComfortable`、`.homeCompact`、`.importSearch`、`.importRecommendation`：skills 永远展开。
- `.menuComfortable`、`.menuCompact`：允许折叠。
- 真正使用默认折叠能力的只有 Menu Bar compact。

### 4. 分隔线与信息密度差异

- `.homeComfortable` / `import*`：显示 header divider 与 section title。
- `.homeCompact` / `.menuComfortable` / `.menuCompact`：不显示 header divider；section title 只在 overflow 时作为入口出现。

### 5. loading 文案差异

- 保存配置中：`Applying`
- Home / Menu 更新组：`Updating`
- Import 导入中：`Downloading`

### 6. 数据来源差异

- Home / Menu：数据来自本地已安装 group summary + draft 状态。
- Import：数据来自 `ImportViewModel.Card`，带 `isInstalledLocally`、`recommendationBadgeItems`、搜索高亮、preview 装载态。

### 7. overflow 判定差异

- overflow 使用渲染宽度测量，不使用 Item 数量阈值。
- Home / Import 通常在 section 标题常驻的布局中追加箭头。
- Home Compact 与 Menu Bar Compact 在没有 overflow 时保持 section title 隐藏；检测到 overflow 后才显示标题与入口。

## 不属于 Group Card 的页面

Detail 页有自己的 header，实现上没有复用 `SharedGroupCard`，只是继续使用了 `GroupCardStats` 的统计语义：

```text
Detail Header
|
+-- Title
+-- by @author
`-- skills / downloads / stars / github
```

因此如果后续要做“Group Card 与 Group Detail 的完全一致性”对齐，需要单独处理，不应把 Detail 当作同一张卡的页面变体。

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
|   +-- Home / Standard      -> displayMode = .home
|   `-- Home / Compact       -> displayMode = .menu
|
+-- Import
|   +-- Search Result        -> displayMode = .importSearch
|   `-- Recommendation       -> displayMode = .importRecommendation
|
`-- Menu Bar
    +-- Menu / Standard      -> displayMode = .home
    `-- Menu / Compact       -> displayMode = .menu
```

## 统一骨架

所有页面的 Group Card 基本骨架一致：

```text
+--------------------------------------------------+
| Title / Byline                         [Action]  |
| stats row / reserved empty row                   |
| ------------------------------------------------ |
| tag row OR recommendation badges / description   |
| ------------------------------------------------ |
| AGENTS                                           |
| [ALL] [Agent] [Agent] [Agent] ...               |
| SKILLS (N)                                       |
| [ALL] [Skill] [Skill] [Skill] ...               |
+--------------------------------------------------+
```

其中以下部分会随页面状态变化：

- 右上角动作区：`[More/Pin]` 或 `[Import]`
- header divider：有的页面显示，有的页面不显示
- tag 区：显示自定义标签，或显示推荐 badge，或完全不显示
- skills 区：在 `.menu` 模式下允许折叠
- loading/busy 文案：`Applying` / `Updating` / `Downloading`

## 页面状态矩阵

| 页面 | displayMode | 顶部动作 | tag/recommendation 区 | skills 区 | header divider | 典型用途 |
|---|---|---|---|---|---|---|
| Home / Standard | `.home` | 更多菜单 | 自定义标签，可增删 | 始终展开 | 有 | 主工作台卡片 |
| Home / Compact | `.menu` | 更多菜单 | 自定义标签，只读摘要 | 可折叠，但 Home 里实际仍传 `false`，所以保持展开 | 无 | Home 的紧凑外观 |
| Import / Search | `.importSearch` | 导入按钮 | 无标签；无推荐 badge | 始终展开 | 有 | 搜索结果 |
| Import / Recommendation | `.importRecommendation` | 导入按钮 | 推荐 badge + 推荐说明 | 始终展开 | 有 | 推荐流内容 |
| Menu / Standard | `.home` | 更多菜单 | 标签摘要，只读 | 始终展开 | 有 | 菜单栏完整卡片 |
| Menu / Compact | `.menu` | 更多菜单 | 标签摘要，只读 | 默认折叠，hover 0.5s 后展开 | 无 | 菜单栏默认紧凑卡片 |

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
| AGENTS                                            |
| [ALL] [C] [G] [K]                                |
| SKILLS (12)                                       |
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

- 使用 `.menu` 外观，因此没有 header divider
- section title 隐藏
- 目标行更紧凑
- 虽然 `.menu` 支持折叠 skills，但 Home 中固定 `skillsCollapsed = false`

### 3. Import / Search

```text
+--------------------------------------------------+
| Alpha Hub                            [import]    |
| by @owner / github.com/acme/alpha-hub            |
| dl 5,045   star 1,200   github                    |
| ------------------------------------------------ |
| AGENTS                                            |
| [ALL] [C] [G] [K]                                |
| SKILLS (12)                                       |
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
| AGENTS                                            |
| [ALL] [C] [G] [K]                                |
| SKILLS (12)                                       |
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
| AGENTS                                    |
| [ALL] [C] [G] [K]                         |
|                                          |
|  (skills collapsed by default)           |
+------------------------------------------+

hover 0.5s

+------------------------------------------+
| Alpha Hub                      [ ... ]   |
| by @owner                                 |
| #tag-a  #tag-b                            |
| AGENTS                                    |
| [ALL] [C] [G] [K]                         |
| [ALL] [browse] [qa] [ship] ...           |
+------------------------------------------+
```

特征：

- 默认紧凑模式
- 只有 Menu Bar 的 compact 模式会真实使用 `skillsCollapsed`
- 标签只展示，不允许新增/删除
- 标题不可点击进入 Detail；页面通过外层导航控制

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

- `.home`、`.importSearch`、`.importRecommendation`：skills 永远展开。
- `.menu`：允许折叠。
- 但真正把 `.menu` 的折叠能力用起来的只有 Menu Bar compact。

### 4. 分隔线与信息密度差异

- `.home` / `import*`：显示 header divider 与 section title。
- `.menu`：不显示 header divider，也不显示 section title，视觉更压缩。

### 5. loading 文案差异

- 保存配置中：`Applying`
- Home / Menu 更新组：`Updating`
- Import 导入中：`Downloading`

### 6. 数据来源差异

- Home / Menu：数据来自本地已安装 group summary + draft 状态。
- Import：数据来自 `ImportViewModel.Card`，带 `isInstalledLocally`、`recommendationBadgeItems`、搜索高亮、preview 装载态。

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

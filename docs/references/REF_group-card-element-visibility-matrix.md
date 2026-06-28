# Group Card 元素组与可见性矩阵

## 目的

这份文档只记录两件事：

1. `SharedGroupCard` 里有哪些天然成组的 UI 元素
2. 每种 Group Card 类型下，这些元素组是否显示

基线文件：

- `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`

---

## 元素组

### G1. Card Chrome

- 卡片背景
- 卡片圆角
- 卡片边框
- 卡片最小高度
- 卡片 inset / spacing

### G2. Header Primary

- 标题
- 副标题
- 标题按钮态

### G3. MetaLine

- 下载数
- Star 数
- GitHub 按钮
- 本地路径按钮
- Import loading placeholder

### G4. Header Action

#### G4-A. More Menu

- more / pin 按钮
- popover actions

#### G4-B. Import Primary Action

- import icon
- import title
- disabled / busy 状态

### G5. Header Divider

- `MetaLine` 下方虚线

### G6. Agents Row

- Agent 标题
- tri-state
- loading placeholders
- target buttons

### G7. Skills Row

- Skill 标题
- tri-state
- loading placeholders
- skill pills

### G8. Summary

#### G8-A. Editable Tags

- add
- input
- suggestions
- tags
- delete controls

#### G8-B. Readonly Tags

- 只读 tag pills

#### G8-C. Recommendation Badges

- 推荐标签

#### G8-D. Recommendation Description

- 推荐文案

说明：

- `Recommendation Badges` 不是普通 tag
- `Recommendation Description` 不是 tag 文案扩展
- recommendation summary 与普通 tags summary 不是同一种语义

### G9. Summary Divider

- Summary 前虚线

### G10. Busy Overlay

- scrim
- spinner
- busy 文案

---

## 可见性矩阵

类型定义：

- `HC` = `homeComfortable`
- `HX` = `homeCompact`
- `MC` = `menuComfortable`
- `MX` = `menuCompact`
- `IS` = `importSearch`
- `IR` = `importRecommendation`

说明：

- `Y` = 显示
- `N` = 隐藏
- `C` = 条件显示，依赖数据或运行时状态

### 组级矩阵

| 元素组 | HC | HX | MC | MX | IS | IR | 说明 |
|---|---|---|---|---|---|---|---|
| G1 Card Chrome | Y | Y | Y | Y | Y | Y | 全类型都有 |
| G2 Header Primary | Y | Y | Y | Y | Y | Y | 标题总有，副标题依赖数据 |
| G3 MetaLine | C | N | C | N | C | C | 由已确认规则决定 |
| G4-A More Menu | Y | Y | Y | Y | N | N | Home/Menu 使用 |
| G4-B Import Primary Action | N | N | N | N | Y | Y | Import 使用 |
| G5 Header Divider | Y | N | N | N | Y | Y | 由已确认规则决定 |
| G6 Agents Row | Y | Y | Y | Y | Y | Y | 全类型都有 |
| G7 Skills Row | Y | Y | Y | C | Y | Y | `MX` 默认折叠 hover 展示 |
| G8 Summary | C | C | C | C | N | C | Import recommendation 用 recommendation summary |
| G9 Summary Divider | C | N | N | N | N | C | 由已确认规则决定 |
| G10 Busy Overlay | C | C | C | C | C | C | busy 时显示 |

### G6 Agents Row 组内矩阵

| 子项 | HC | HX | MC | MX | IS | IR | 说明 |
|---|---|---|---|---|---|---|---|
| Agent 标题 | Y | N | N | N | Y | Y | 已确认规则 |
| Tri-state | Y | Y | Y | Y | Y | Y | 全类型都有 |
| Loading placeholders | C | C | C | C | C | C | `targetsLoading` |
| Target buttons | C | C | C | C | C | C | 非 loading 时 |

### G7 Skills Row 组内矩阵

| 子项 | HC | HX | MC | MX | IS | IR | 说明 |
|---|---|---|---|---|---|---|---|
| Skill 标题 | Y | N | N | N | Y | Y | 已确认规则 |
| Tri-state | Y | Y | Y | C | Y | Y | `MX` 折叠时整组隐藏 |
| Loading placeholders | C | C | C | C | C | C | `skillsLoading` |
| Skill pills | C | C | C | C | C | C | 非 loading 时 |

### G8 Summary 组内矩阵

| 子组 | HC | HX | MC | MX | IS | IR | 说明 |
|---|---|---|---|---|---|---|---|
| Editable Tags | C | C | N | N | N | N | Home 可编辑 |
| Readonly Tags | C | C | C | C | N | N | Menu 只读 |
| Recommendation Badges | N | N | N | N | N | C | 只在 recommendation |
| Recommendation Description | N | N | N | N | N | C | 只在 recommendation |

---

## 缩放规则

唯一约束：

- 缩放因子只允许在 `menu` 中使用
- `HC`
- `HX`
- `IS`
- `IR`

这四类都不进入缩放路径

因此目标上应为：

| 类型 | 是否允许缩放 |
|---|---|
| HC | 否 |
| HX | 否 |
| MC | 是 |
| MX | 是 |
| IS | 否 |
| IR | 否 |

---

## 当前文档结论

后续修改代码时，不再围绕“6 个 displayMode 各自写一套规则”推进，而是按下面顺序判断：

1. 先定 `Context`
2. 再定该 `Context` 下的 `Variant`
3. 再定是否存在 `Summary`
4. 最后再叠加运行时状态

当前已经确认的关键规则只有 4 条：

1. `homeCompact` 通过隐藏组变紧凑，不通过缩放变紧凑
2. `menuComfortable` 和 `menuCompact` 都属于 menu，并且都允许缩放
3. `menuCompact` 比 `menuComfortable` 多一个 `Skills` 默认折叠规则
4. `recommendation` 不是 tag，必须和普通 tags summary 分开建模

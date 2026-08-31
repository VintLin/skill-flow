---
version: beta
name: Skill Flow Desktop
description: A compact macOS operations workspace built from layered neutral surfaces, user-selectable accents, reusable group cards, and explicit selection and runtime states.

colors:
  light-page: "#f2f2f2"
  light-surface: "#fdfdfd"
  light-surface-nested: "#f9f9f9"
  light-surface-strong: "#e6e6e6"
  dark-page: "#222222"
  dark-surface: "#0e0e0e"
  dark-surface-nested: "#151515"
  dark-surface-strong: "#353535"
  light-ink: "#262626"
  dark-ink: "#efeff1"
  light-muted: "rgba(38, 38, 38, 0.62)"
  dark-muted: "rgba(229, 229, 231, 0.68)"
  light-border: "rgba(0, 0, 0, 0.12)"
  dark-border: "rgba(255, 255, 255, 0.12)"
  light-glass: "rgba(255, 255, 255, 0.44)"
  dark-glass: "rgba(255, 255, 255, 0.08)"
  accent-blue-light: "#3b82f6"
  accent-blue-dark: "#7db0ff"
  accent-green-light: "#22c55e"
  accent-green-dark: "#4ade80"
  accent-yellow-light: "#eab308"
  accent-yellow-dark: "#facc15"
  accent-pink-light: "#ec4899"
  accent-pink-dark: "#f472b6"
  accent-orange-light: "#f97316"
  accent-orange-dark: "#fb923c"
  accent-purple-light: "#8b5cf6"
  accent-purple-dark: "#a78bfa"
  semantic-success-light: "#22c55e"
  semantic-success-dark: "#4ade80"
  semantic-warning-light: "#eab308"
  semantic-warning-dark: "#facc15"
  semantic-error-light: "#f97316"
  semantic-error-dark: "#fca5a5"
  toast-success-light: "#dcfce7"
  toast-success-dark: "#14532d"
  toast-error-light: "#fef2f2"
  toast-error-dark: "#7f1d1d"

typography:
  dialog-title:
    fontFamily: "SF Pro / system-ui"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "platform-default"
    letterSpacing: "0"
  group-title:
    fontFamily: "SF Pro / system-ui"
    fontSize: "21px"
    fontWeight: 400
    lineHeight: "platform-default"
    letterSpacing: "0"
  page-title:
    fontFamily: "SF Pro / system-ui"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "platform-default"
    letterSpacing: "0"
  section-title:
    fontFamily: "SF Pro / system-ui"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "platform-default"
    letterSpacing: "0"
  row-title:
    fontFamily: "SF Pro / system-ui"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "platform-default"
    letterSpacing: "0"
  body:
    fontFamily: "SF Pro / system-ui"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "platform-default"
    letterSpacing: "0"
  body-strong:
    fontFamily: "SF Pro / system-ui"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "platform-default"
    letterSpacing: "0"
  caption:
    fontFamily: "SF Pro / system-ui"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "platform-default"
    letterSpacing: "0"
  micro:
    fontFamily: "SF Pro / system-ui"
    fontSize: "10px"
    fontWeight: 600
    lineHeight: "platform-default"
    letterSpacing: "0"
  mono-body:
    fontFamily: "SF Mono / ui-monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "platform-default"
    letterSpacing: "0"
  mono-label:
    fontFamily: "SF Mono / ui-monospace"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: "platform-default"
    letterSpacing: "0"

rounded:
  xs: "4px"
  sm: "6px"
  row: "7px"
  control: "8px"
  card: "10px"
  section: "12px"
  large: "14px"
  pill: "999px"

spacing:
  xxs: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  xxl: "14px"
  xxxl: "16px"
  loose: "20px"
  page: "32px"

motion:
  hover-duration: "140ms"
  press-duration: "100ms"
  compact-transition: "180ms"
  state-transition: "240-280ms"
  spinner-cycle: "900ms"
  button-press-scale: "0.97"
  chip-press-scale: "0.985"
  hover-overlay-opacity: "0.06"

components:
  top-bar:
    backgroundColor: "{colors.light-page} / {colors.dark-page}"
    textColor: "{colors.light-ink} / {colors.dark-ink}"
    typography: "{typography.page-title}"
    height: "52px"
  search-field:
    backgroundColor: "{colors.light-surface} / {colors.dark-surface}"
    textColor: "{colors.light-ink} / {colors.dark-ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    width: "384px maximum"
    height: "34px"
    padding: "0 12px"
  toolbar-icon-button:
    backgroundColor: "{colors.light-surface} / {colors.dark-surface}"
    textColor: "{colors.light-ink} / {colors.dark-ink}"
    rounded: "{rounded.control}"
    width: "34px"
    height: "34px"
  group-card:
    backgroundColor: "{colors.light-surface} / {colors.dark-surface}"
    textColor: "{colors.light-ink} / {colors.dark-ink}"
    rounded: "{rounded.card}"
    width: "304px"
    minHeight: "206px in comfortable home mode"
    padding: "12px"
  group-card-title:
    textColor: "active accent"
    typography: "{typography.group-title}"
  selection-control:
    backgroundColor: "neutral / warning-soft / success-soft"
    textColor: "neutral / warning / success"
    rounded: "{rounded.control}"
    width: "34px"
    height: "34px"
  project-pill:
    backgroundColor: "{colors.light-surface} / {colors.dark-surface}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.control}"
    height: "28px"
  tag-label:
    textColor: "tag accent"
    typography: "{typography.body}"
    height: "16px"
  settings-section:
    backgroundColor: "{colors.light-surface} / {colors.dark-surface}"
    rounded: "{rounded.section}"
    padding: "14px"
  detail-pane:
    backgroundColor: "{colors.light-surface-nested} / {colors.dark-surface-nested}"
    rounded: "{rounded.card}"
    padding: "14px"
  menu-bar-shell:
    backgroundColor: "{colors.light-page} / {colors.dark-page}"
    rounded: "{rounded.section}"
    width: "360px"
  toast:
    typography: "{typography.body-strong}"
    rounded: "{rounded.pill}"
    padding: "10px 14px"
---

# Design System: Skill Flow Desktop

## Overview

**Creative North Star: “The Skill Operations Board”**

Skill Flow Desktop 是一个用于检查、导入、分组、部署和维护 agent skills 的 macOS 工作台。视觉上应像安静、精密的运维面板：信息密度高，但状态边界清楚；交互紧凑，但不会挤成传统管理后台；强调真实对象、当前选择和下一步操作，而不是装饰性指标。

主界面使用四级中性灰建立层次，用户选择的 accent 只负责当前对象、选中状态、主操作和局部身份。卡片、列表与详情页共享同一套 8–12px 圆角、0.5px 边框和 11–13px 信息字体。阴影只用于输入控件、浮层和独立空状态，不用于制造卡片墙。

**Key Characteristics**

- macOS 原生系统字体与紧凑控件节奏。
- light / dark 双主题，结构一致，只调整明度与对比度。
- 六种用户可选 accent，但单个界面上下文只使用一种主 accent。
- Group Card 是 Home、Import 和 menu bar 的共享核心组件。
- 状态通过颜色、图标、计数和文字共同表达。
- 边框优先、阴影克制、无装饰性渐变。
- 整卡点击关闭；详情导航限定在标题、署名和统计等明确区域。

## Scope

覆盖：

- macOS desktop 主窗口。
- Home、Import、Detail、Settings 页面。
- menu bar quick config。
- Group Card、标签、选择控件、浮层、toast、空状态和 Markdown 文档呈现。

不覆盖：

- CLI / TUI 的终端排版规范。
- README、官网或发布截图的 marketing 风格。
- App Icon、第三方 agent icon 和内容图片本身的绘制规范。

## Colors

### Surface Ladder

界面使用四级无彩色 surface。层级由相邻 surface 的明度差和 0.5–1px 边界建立，不依赖大面积阴影。

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Page | `{colors.light-page}` #f2f2f2 | `{colors.dark-page}` #222222 | 主页面底色、header、menu bar 背景、文档 block |
| Surface | `{colors.light-surface}` #fdfdfd | `{colors.dark-surface}` #0e0e0e | Group Card、详情 header、设置 section、输入控件 |
| Nested Surface | `{colors.light-surface-nested}` #f9f9f9 | `{colors.dark-surface-nested}` #151515 | Detail body、一级嵌套工作区 |
| Strong Neutral | `{colors.light-surface-strong}` #e6e6e6 | `{colors.dark-surface-strong}` #353535 | 选中边界、scope pill 边框、较强分隔 |

Surface mapping：

- Page background 使用 Page，不直接使用纯白或纯黑。
- Page 上的卡片使用 Surface。
- 卡片内部的可编辑块、文件内容块和未选控件通常回落到 Page。
- Detail 主内容区域使用 Nested Surface，内部文档内容块再使用 Page。
- 同一层级不通过随机灰度制造差异；优先复用上述四级结构。

### Text

- **Primary Ink**：light `{colors.light-ink}`，dark `{colors.dark-ink}`。用于标题、控件文本、主要数据。
- **Muted Ink**：light `{colors.light-muted}`，dark `{colors.dark-muted}`。用于署名、路径、说明、统计和未选状态。
- 深色模式的搜索 placeholder 比普通 muted 更亮，避免输入框内提示失去可读性。
- 禁用态通过 muted、透明度和不可交互状态共同表达，不能只降低透明度到难以阅读。

### Accent Palette

用户可在 Settings 中选择一种主 accent。light / dark 使用独立色值，避免机械复用同一 RGB。

| Accent | Light | Dark |
| --- | --- | --- |
| Blue | `{colors.accent-blue-light}` #3b82f6 | `{colors.accent-blue-dark}` #7db0ff |
| Green | `{colors.accent-green-light}` #22c55e | `{colors.accent-green-dark}` #4ade80 |
| Yellow | `{colors.accent-yellow-light}` #eab308 | `{colors.accent-yellow-dark}` #facc15 |
| Pink | `{colors.accent-pink-light}` #ec4899 | `{colors.accent-pink-dark}` #f472b6 |
| Orange | `{colors.accent-orange-light}` #f97316 | `{colors.accent-orange-dark}` #fb923c |
| Purple | `{colors.accent-purple-light}` #8b5cf6 | `{colors.accent-purple-dark}` #a78bfa |

**The Single Accent Rule.** 同一 screen context 只激活一个全局 accent。自定义标签可使用自己的 accent，但标签色不能替代页面的主操作色。

Accent 用于：

- Group Card 标题和当前对象标识。
- 选中 scope、sidebar indicator、active tab 和 checked state。
- 主操作、可操作文字和 focus tint。
- 拖拽插入线、最近选择的强调和局部 tag identity。

Accent 不用于：

- 大面积页面背景。
- 普通说明文字。
- 所有图标的默认着色。
- 健康、警告和错误语义的替代色。

### Agent Identity Colors

- Agent identity color 用于 Usage「每日趋势」中代表 Agent 的数据系列，以及「最常用 Agent」排名圆点；图例、面积、曲线、tooltip 和排名圆点保持同一颜色映射。
- 每日趋势显示 Skill 系列时使用普通图表色板；未知与 Custom Agent 同样回退到该色板。
- 「最常用 Agent」中的未知与 Custom Agent 回退到中性色；Group Card 及其他界面不展示 Agent identity color，图标与辅助圆点使用中性前景色。
- Agent identity color 不替代页面 accent，也不修改第三方 logo 原始资产。选中背景、focus 和主操作继续使用当前用户 accent。
- 色值、证据等级和官方来源记录见 [Agent identity colors](references/REF_agent-identity-colors.md)。

### Semantic Color

- **Success / healthy / fully selected**：green。
- **Warning / partial / needs review**：yellow。
- **Error / destructive / failed**：orange-red；dark 模式使用更浅的 red 以保证对比度。
- **Neutral / loading / unknown**：neutral surface + primary or muted ink。

状态不能只靠颜色：warning 与 error 使用图标和计数；选择状态使用 `OFF / PARTIAL / ON`；loading 使用 ProgressView 与文案；toast 使用背景、边框和文字共同表达。

### Glass, Borders, and Scrims

- Header glass：light white 44% / dark white 8%。只用于工具栏的轻微层次。
- Toolbar button fill：light white 55% / dark white 10%。
- 通用结构边界：light black 12% / dark white 12%。
- 卡片常用 0.5px border；pane divider 和 metadata row divider 使用 1px。
- Modal scrim：light black 18% / dark black 35%。
- Busy card scrim 必须保留底层结构可辨识，但阻止误以为仍可操作。

## Typography

### Font Family

- **UI Sans**：SwiftUI `.system`，在 macOS 上解析为 SF Pro 系列。
- **Technical Mono**：SwiftUI `.monospaced` / SF Mono，用于路径、版本、数量、metadata、搜索提示中的固定技术片段和 fallback agent abbreviation。
- 不引入 Geist、Inter 或自定义 display font。当前产品的视觉语言依赖 macOS 原生字形与控件比例。

### Hierarchy

| Token | Size | Weight | Use |
| --- | --- | --- | --- |
| `{typography.dialog-title}` | 20px | 600 | 大型编辑 sheet 标题 |
| `{typography.group-title}` | 21px | 400 | Group Card 与 Detail 主对象标题 |
| `{typography.page-title}` | 17px | 600 | Top bar 页面标题、App 名称 |
| `{typography.section-title}` | 14px | 600 | Dialog 标题、空状态标题、局部 section 标题 |
| `{typography.row-title}` | 13px | 600 | Settings row、sidebar 主要条目 |
| `{typography.body}` | 12px | 400 | 搜索、说明、卡片 metadata、普通控件 |
| `{typography.body-strong}` | 12px | 600 | 按钮、toast、强调型小标题 |
| `{typography.caption}` | 11px | 400 | 路径、次要说明、compact metadata |
| `{typography.micro}` | 10px | 600 | 状态计数、窄控件、fallback 标识 |
| `{typography.mono-body}` | 11px | 400 mono | 文档 metadata、路径、版本和原始内容 |
| `{typography.mono-label}` | 11px | 600 mono | Metadata key、技术标签 |

### Principles

- 21px Group 标题保持 regular，避免每张卡都产生过强视觉重量。
- 17px page title 与 13px row title 使用 semibold 建立结构。
- 11–12px 是主要信息密度区间；不要随意降到 9px 以下。
- Uppercase 只用于搜索提示和短 section label，不用于长句或本地化正文。
- Mono 只标记技术内容，不用于全部产品 UI。
- 行高和字距沿用平台默认；若未来引入显式 token，必须同时验证中、英、日三种语言。

## Layout

### Spacing System

基础节奏以 2px / 4px 为微调单位，以 8px / 12px / 14px / 16px 为结构单位。

- 2–4px：标题与 metadata、标签内部、紧凑对齐。
- 6–8px：同组控件、icon 与 label、chip 间距。
- 10–12px：卡片内部 section、列表项、top bar item。
- 14px：Grid 横向 gap、Detail pane gap、Detail content padding。
- 16px：页面边距、Import 内容 padding、modal 基础 padding。
- 20–32px：仅用于大型 sheet 或页面外层，不用于 Group Card 内部。

### Main Window Grid

- Group Card 固定列宽 304px。
- 横向 grid gap 14px，纵向 gap 12px。
- Home 根据扣除 sidebar 后的可用宽度计算 1–4 列。
- Import 使用窗口断点：≤620px 为 1 列，621–860px 为 2 列，861–1120px 为 3 列，>1120px 为 4 列。
- Import grid 最大宽度 1260px；内容在可用空间内居中。
- Home 主内容左右总 padding 32px。

### Sidebar and Header Geometry

- Home sidebar：常规 244px，窗口 ≤760px 时 208px。
- Home sidebar header：52px；traffic-light leading inset 68px。
- Top bar：52px；窗口 ≤860px 时 Home header 可拆成上下两行。
- Search field：最大 384px，最小可用宽度由当前 header 的固定按钮动态扣除。
- Toolbar icon button：34 × 34px。
- Project / filter pill：28px 高。

### Detail Workspace

- Detail 外层 padding 16px，sidebar 与 main pane 间距 14px。
- Sidebar 常规宽 280px；窗口 ≤860px 时 230px。
- Sidebar 与 main pane 使用 10px radius、0.5px border。
- Detail header 最小高度 84px，内部 padding 14px。
- Group sidebar row 64px，skill row 60px，分组间隔 10px。
- Selected indicator 为 4 × 36px accent bar，并使用 spring 过渡。
- File tree row 高 28px，guide column 16px，icon column 14px。

### Menu Bar Geometry

- menu shell 固定宽度 360px，圆角 12px。
- 卡片列表可视高度 360–440px。
- 顶部搜索区域 44px，底部 action bar 30px。
- 列表水平 padding 8px，卡片间距 8px。
- 卡片技能列表在 hover 500ms 后展开，离开时以 180ms 收起。

### Whitespace Philosophy

空白服务于对象边界，不服务于展示感。Page 外层保持 16px；卡片内部保持 12px；信息行通常保持 6–10px。不要在同一页面混入 40px 以上的大段营销留白，也不要用多层卡片 padding 叠加制造过厚边缘。

## Elevation and Depth

Skill Flow 使用 **surface + border first** 的深度语言。

| Level | Treatment | Use |
| --- | --- | --- |
| Page | Page neutral，无 shadow | 主窗口、menu bar canvas |
| Card / Pane | Surface + 0.5px border | Group Card、Settings section、Detail pane |
| Control | Surface + 0.5px border + `0 2px 4px` compact shadow | Search、toolbar icon button |
| Empty state | Glass surface + `0 6px 10px` soft shadow | 需要独立识别的空状态 |
| Modal | Surface + 0.5px border + `0 8–10px 18–20px` shadow | Rename、Group Editor、Custom Agent sheet |

### Shadow Vocabulary

- **Control Lift**：radius 4px，y 2px；仅用于 header 和 menu bar 的精密控件。
- **Empty Lift**：radius 10px，y 6px；仅用于启用 chrome 的空状态。
- **Modal Lift**：radius 18–20px，y 8–10px；配合 scrim 表示独立操作层。
- Group Card、Settings section、Detail pane 默认无 drop shadow。
- dark 模式 shadow 使用低透明白色，避免黑色阴影在深色表面完全消失。

## Shapes

### Border Radius Scale

| Token | Value | Use |
| --- | --- | --- |
| `{rounded.xs}` | 4px | Skeleton、极小 metadata block |
| `{rounded.sm}` | 6px | menu chip、compact control |
| `{rounded.row}` | 7px | Popover row、subtle button |
| `{rounded.control}` | 8px | 默认按钮、输入框、selection control、pill-like scope |
| `{rounded.card}` | 10px | Group Card、Detail pane、文档 block、dropdown shell |
| `{rounded.section}` | 12px | Settings section、menu shell、custom agent sheet |
| `{rounded.large}` | 14px | 少量大容器；不得作为默认卡片半径 |
| `{rounded.pill}` | 999px | Toast capsule、selection indicator 端点 |

**The 8/10/12 Rule.** 8px 表示 control，10px 表示工作对象或 pane，12px 表示更高一级的 section 或 shell。不要为相邻组件随意新增 9px、11px、13px 半径。

## Components

### Top Bar

**`top-bar`** — 52px 高，背景使用 Page surface。左侧呈现 App identity 或 back + page title；中间可放 search；右侧放导入、分组编辑、更新和设置等操作。Header 不使用独立大阴影，层级来自 Page 与下方内容的 surface 差。

**`toolbar-icon-button`** — 34 × 34px，8px radius，Surface fill、0.5px border、Control Lift。图标通常 14px，默认使用 Primary Ink，active 或 identity 状态才使用 accent。

### Search

**`search-field`** — 最大宽 384px、高 34px、水平 padding 12px、8px radius。leading search icon 为 11px；clear action 为 22px 可点击区。Home 使用普通 UI sans；Import 的固定提示片段使用 mono。

Rules：

- 未聚焦且 query 为空时显示 placeholder。
- Query 非空时提供明确 clear action。
- Enter 触发搜索或导航；清除后恢复 idle 状态。
- Import 搜索 action 的出现使用 opacity + 0.92 scale transition。

### Home Sidebar

Sidebar 负责 Status、Source Type、Tags、Agents 和 Projects 等筛选。Section header 使用 11px semibold uppercase；row title 使用 12–13px。选中项使用 accent soft fill 与明确文字/数量，不用单纯改变文字颜色。

Sidebar 可折叠；折叠控制保持 28 × 28px。自定义标签支持拖拽排序，drag handle 与 insertion indicator 使用 accent。

### Group Card

**`group-card`** 是 Home、Import 和 menu bar 的共享交互单元。

- 固定 grid 宽 304px。
- comfortable home 模式最小高度 206px。
- 默认 padding 12px、section spacing 10px、radius 10px、0.5px border。
- 标题 21px regular + accent；署名和统计 12px muted。
- Agent / Skill 区域使用水平 fade scroll，避免强制压缩 chip。
- Header、Agents、Skills、Summary 的显示由 display mode 决定，不复制出平行卡片实现。

Display modes：

| Mode | Purpose | Density behavior |
| --- | --- | --- |
| Home Comfortable | 主窗口完整管理 | subtitle、meta、section title、divider、最小高度 |
| Home Compact | 主窗口快速扫描 | 移除部分 meta、section title 和 divider |
| Menu Comfortable | menu bar 快速配置 | 0.8 visual scale，skills 可 hover 展开 |
| Menu Compact | menu bar 高密度 | 进一步减少辅助信息 |
| Import Search | 搜索导入 | 强调选择与 import action |
| Import Recommendation | 推荐导入 | 增加推荐 badge 与说明 |

**Click Policy.** 整卡点击始终关闭。只有标题、署名、统计或明确按钮可触发详情、外部链接、路径打开和 mutation，避免误点 Agent、Skill、Tag 或 tri-state control。

### Group Card Header and Actions

- 标题区域可显示 recently-updated 6px green dot、warning icon + count、error icon + count、original-name info。
- More / Pin action 使用 22 × 22px 内容区；popover 宽 176px，row 高 30px、radius 7px。
- destructive action 使用 error semantic，不使用 accent。
- Import 主操作在 enabled 时使用 accent fill 或 accent soft fill；disabled 时回到 neutral surface + muted ink。

### Selection Controls

Tri-state selection 必须保持三种明确语义：

| State | Fill | Text | Label |
| --- | --- | --- | --- |
| Empty | neutral Page block | primary/muted | `OFF` |
| Partial | warning at 32–38% opacity | warning | `PARTIAL` |
| Full | success at 30–36% opacity | success | `ON` |

Home / Detail 的 selection control 基准为 34 × 34px。选择行为同时改变 fill、text 和 label；加载时保留同一 control geometry，内部替换为 ProgressView，避免布局跳动。

### Agent and Skill Chips

- Agent target cell：34px 高，短标签或 agent icon，selected 使用 accent soft fill。
- Skill chip：34px 高、12px regular；长文本允许横向滚动，不压缩到不可读。
- Group tag：16px 高、12px regular，以文字和 accent 表达 identity，不绘制厚重胶囊背景。
- Tag editor 的 add/delete control 仅在相关 hover / edit context 出现，避免常驻噪声。

### Import Surface

Import 复用 Group Card，不创建第二套卡片语言。搜索、推荐和 local scan 只改变 header action、badge、说明和本地 variant selector。

- 空结果、失败和 loading 在无 card 时居中呈现，最小高度 200–220px。
- Loading 使用 regular ProgressView + 12px muted message。
- 本地 variant 使用 segmented Picker，置于卡片下方，水平 inset 2px。
- 多个 import 可进入 queue；queued、running、disabled 必须有可辨识状态。

### Busy and Loading State

Group Card busy 时：

- 内容 opacity 降至 0.34。
- 内容 blur 0.8px。
- 顶层 scrim 覆盖卡片。
- 中心显示 small ProgressView + semibold message。
- 禁止 card、menu 和 selection mutation。

Loading placeholder 保持最终内容几何：stats、agent tiles、document tabs 和 text lines 使用固定宽度 skeleton，减少完成加载后的跳动。

### Detail Workspace

Detail 采用 sidebar + main 双 pane：

- Sidebar 选择 Group Overview 或某个 Skill。
- Main header 始终保留对象 title、author、stats 和 action。
- Main body 使用 Nested Surface；文档内容使用 Page block。
- Group Overview 先展示 tags、agents，再展示 group documents。
- Skill Overview 先展示 document tabs，再展示 Markdown / raw content。
- File tree selected row 使用 accent soft fill + 2px leading accent marker。

Detail sidebar selection indicator 使用 spring response 220ms、damping 0.82；其他内容切换保持 180–240ms，不能出现大幅滑动。

### Markdown and Technical Content

- Markdown 使用 GitHub-like structured text style，并允许 text selection。
- Metadata table 使用 11px mono；key semibold、固定宽 120px，value regular。
- Metadata row 水平 padding 12px、垂直 padding 10px，row 间 1px divider，container radius 10px。
- Path、version、word count 和 raw fallback content 使用 mono。
- 外部链接交由系统默认浏览器打开。

### Settings

Settings content 最大宽度 900px。每个 section 使用 14px padding、12px radius、0.5px border；section 间距 12px，页面 section stack 间距 16px。

- Section label：11px bold uppercase muted。
- Row title：13px semibold；description：11px regular muted。
- 控制列固定 168px；dropdown 宽 148px、高 32px。
- Dropdown option 高 30px、radius 7px；shell radius 10px。
- Agent row 使用 10px vertical / 12px horizontal padding、10px radius。
- Drag handle 32 × 32px，agent icon 28 × 28px。
- 不可见 agent row 保持可读，但 content opacity 降至 0.45，surface opacity 降至 0.55。

### Dialogs, Popovers, and Sheets

- Rename dialog：最大宽 360px、padding 16px、8px radius。
- Group Editor：560 × 520px、padding 16px、8px radius；内部使用 segmented tabs、search 和 selectable rows。
- Custom Agent sheet：最小宽 560px、padding 20px、12px radius。
- Modal 使用 light 18% / dark 35% scrim；点击 scrim 可关闭非破坏性编辑。
- 浮层 action row 统一使用 30–34px 高和 7–8px radius。

### Menu Bar Quick Config

Menu bar 保留完整 Group Card 的 Agent / Skill selection 能力，但去除详情跳转。顶部为 search + close，底部只保留 Import 和 Settings 入口。

- Shell 固定 360px，不做可变宽 popover。
- Top / bottom overlay 与 menu canvas 使用同一 Page surface，避免形成三段式重边框。
- Scroll indicator 默认隐藏。
- Hover 展开只影响 skill content，不改变 card ownership 或 selection state。

### Toasts and Feedback

Toast 使用 capsule，12px semibold，padding 10 × 14px，最多两行。

| Style | Background | Extra signal |
| --- | --- | --- |
| Loading | neutral Surface | small ProgressView |
| Success | green soft surface | green foreground / border |
| Neutral | neutral Surface | neutral border |
| Error | red soft surface | error border；text 保持可读 |

非 loading toast 默认约 2 秒后消失；点击可提前关闭。Toast 文案必须使用用户可理解的 presentation copy，不直接暴露 bridge 内部错误码。

### Empty States

空状态由 title + subtitle 构成，通常 14px semibold + 12px regular muted，最小高度 200px。只有需要从背景中独立识别时才启用 glass chrome 与 soft shadow；Import 的 standalone empty / loading 默认保持无额外 chrome。

## Interaction and Motion

Motion 用于确认 hover、press、selection、loading 和层级变化，不用于装饰。

| Token | Value | Use |
| --- | --- | --- |
| `{motion.hover-duration}` | 140ms | Button / chip hover overlay |
| `{motion.press-duration}` | 100ms | Press scale |
| `{motion.compact-transition}` | 180ms | Card collapse、sidebar toggle、menu hover collapse |
| `{motion.state-transition}` | 240–280ms | Header action、update completion、placeholder change |
| `{motion.spinner-cycle}` | 900ms | Refresh / update icon rotation |

Rules：

- Button press scale 0.97；chip press scale 0.985。
- Hover overlay opacity 0.06；selected chip hover 可降至 0.03。
- Disabled controls不缩放、不显示 active hover。
- Card 本身不做 press scale，因为整卡不是 action。
- Skill collapse 使用 180ms easeInOut。
- Menu skill hover expand 延迟 500ms，避免掠过时闪烁。
- Tag hover editor 可延迟 1s 收起，给精密指针操作留出容错。
- Update / refresh 旋转 900ms linear repeat，结束回位 280ms。
- Import rotating prompt 每 2.2s 切换，transition 280ms；不能抢过真实搜索结果的注意力。

## State Language

### Selection

- `empty`：没有任何 child 被启用。
- `partial`：部分 child 被启用。
- `full`：全部 child 被启用。

### Runtime

- `idle`：可操作，无进行中任务。
- `queued`：已进入 Group Operation Queue，等待执行。
- `saving / updating / downloading`：禁止冲突 mutation，显示 busy overlay。
- `recently updated`：短时 green dot，仅表示刚完成，不写入长期 health。
- `warning / error`：显示 icon + count，不用 badge 文字堆叠替代问题详情。

### Health

Menu bar health 只使用 `unknown / healthy / warnings / error` 四级 icon。Group Card 不重复绘制一整套 health badge；优先展示具体 warning / error count 和可操作入口。

## Accessibility

- 所有核心 action 必须可通过 keyboard focus 到达；TextField 支持 Enter submit。
- 纯 icon control 必须提供 accessibility label 或 help text。
- 状态不能只靠颜色：同时提供图标、文字、计数、形状或 ProgressView。
- Card detail navigation 限定在明确区域，避免嵌套 control 产生误触。
- 技术内容和 Markdown 文档允许 text selection。
- 未选、禁用和 loading 状态仍需保持可读对比度。
- Desktop precision control 基准为 28–34px；核心 selection 与 toolbar control 使用 34px。不得将可点击图标缩成视觉 glyph 本身的 10–14px hit area。
- 支持 system、简体中文、English、日本語；新增固定宽度、uppercase 或截断规则时必须验证三种语言。
- 减少动态效果时，重复旋转、自动 placeholder 和非必要 transition 应能够被关闭或降级。

## Content Tone

产品文案使用“状态 → 原因 → 下一步”的工具型语言。

Do：

- 明确对象：group、skill、agent、project、document。
- 明确动作：Import、Update、Enable、Disable、Restore、Open。
- 对失败提供下一步，而不是只给内部错误。
- 路径、版本和原始标识保留技术准确性。

Don't：

- 不使用营销口号或拟人化成功文案。
- 不直接向用户显示 `BRIDGE_REQUEST_INVALID` 一类内部代码。
- 不用 `Something went wrong` 取代可定位原因。
- 不在按钮中混入完整说明句；说明放在 subtitle、help 或 issue detail。

## Do's and Don'ts

### Do

- 使用四级 neutral surface 建立 Page、Card、Nested content 和 Strong border。
- 同一 screen context 只使用一个主 accent。
- 默认使用 8px control、10px card、12px section 半径。
- 复用 Shared Group Card 的 display mode，而不是复制 Home / Import / Menu 卡片。
- 使用 0.5px card border 和 1px divider 保持 macOS 精密感。
- 将 destructive action 固定映射到 error semantic。
- 在 selection、loading、warning 和 error 中保留文字或图标信号。
- 让布局变化优先通过信息裁剪和 display mode 降密度，再考虑缩小字体。

### Don't

- 不把 accent 铺满 page、card 或大面积 header。
- 不在普通 Group Card 上添加 drop shadow。
- 不把整张 Group Card 变成点击目标。
- 不新增与 8 / 10 / 12px 冲突的随机半径。
- 不把正常正文压到 10px 以下。
- 不用 decorative gradient、glow 或玻璃拟态替代真实层级。
- 不让 dark mode 只是 light RGB 的机械反转。
- 不为 Home、Import、Detail 和 menu bar 创建不同的 selection 语义。

## Responsive Behavior

### Breakpoints

| Width | Key Changes |
| --- | --- |
| ≤620px | Import 1 列；detail sidebar 使用接近可用宽度的窄窗策略 |
| 621–760px | Import 2 列；Home sidebar 使用 208px narrow width |
| 761–860px | Home sidebar 回到 244px；Home top bar 可使用窄布局；Detail sidebar 230px |
| 861–1120px | Import 3 列；常规单行 top bar；Detail sidebar 280px |
| >1120px | Import 4 列；Home 依据主列可用宽度最多 4 列 |

### Density Strategy

- 窄窗口先减少 meta line、section title、divider 和辅助说明。
- Group title、selection control 和核心 action 尺寸保持稳定。
- Grid 从 4 → 3 → 2 → 1 列，不压缩 304px card 到不可维护宽度。
- Header search 先缩短到最小宽度，再切换两行布局。
- Menu bar 固定宽 360px，不参与主窗口 breakpoint。

## Implementation Map

| Design area | Current source |
| --- | --- |
| Theme、accent、surface、text、semantic color | `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift` 中的 `AppTheme` |
| Header、grid、sidebar、responsive geometry | `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift` 中的 `MainView` / `LayoutMetrics` |
| Group Card geometry and display modes | `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift` |
| Tag editing and tag presentation | `apps/desktop-mac/Sources/DesktopApp/Components/GroupTagComponents.swift` |
| Hover and press motion | `apps/desktop-mac/Sources/DesktopApp/Components/DesktopInteractionMotion.swift` |
| Menu bar quick config | `apps/desktop-mac/Sources/DesktopApp/Components/MenuBar/MenuBarQuickConfigView.swift` |
| Detail pane and file tree geometry | `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift` |
| Settings sections and controls | `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift` |
| Markdown presentation | `apps/desktop-mac/Sources/DesktopApp/Components/MarkdownDocumentView.swift` |

## Iteration Guide

1. 先确定改动属于 Page、Control、Card、Section 还是 Modal 层级。
2. 优先引用现有 color / typography / rounded / spacing token，不在单个 view 内新增近似值。
3. 新 Group Card 需求先扩展 display mode profile，不复制整个组件。
4. 新状态至少定义 default、hover、pressed、disabled、loading、selected 和 error 中适用的部分。
5. 每个视觉状态都检查 light / dark 与六种 accent，尤其 yellow 在 light surface 上的对比度。
6. 每个布局变化验证中文、英文、日文长度和 mono path 截断。
7. 结构变化后同步本文件与对应 snapshot / layout test；纯实现重构不得无故改变已记录 token。

## Known Gaps

- `AppTheme`、layout metrics 和 component metrics 仍分散在多个 Swift 文件中，尚未形成独立 token module。
- 字体 line height 与 letter spacing 依赖 SwiftUI 平台默认值，未建立显式 typography renderer。
- Keyboard focus ring 主要依赖系统行为与 tint，尚未定义统一的自绘 focus halo。
- Reduce Motion 降级策略尚未在所有自动旋转和 placeholder animation 中集中实现。
- Detail 在极窄窗口下的 pane collapse 仍需进一步统一；当前主要通过 sidebar 宽度与内容压缩适配。
- Group Card、Settings、Detail 的部分 8 / 10 / 12px 值仍直接写在 view 中，文档是规范事实源，但实现尚未全部 token 化。
- Menu bar 固定 360px，尚未定义超大字体或极端本地化长度下的替代布局。

## Related Verification

- [Group Card state matrix](verification/GROUP_CARD_STATE_MATRIX.md)
- [Group Card usage context](references/REF_group-card-usage-context.md)
- [Group Card element visibility matrix](references/REF_group-card-element-visibility-matrix.md)

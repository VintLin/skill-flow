# Desktop Presentation Order and Group Card Overflow

Home 侧边栏、Group Card 和设置页需要共同表达 Agent 的顺序，同时让高密度卡片在窄宽度下仍能访问完整的 Agent 和 Skill 列表。展示排序属于桌面工作区状态；它不改变 source、group、skill 或 target projection 的权威数据。

## Decision

- `Agent Display Order` 是 Home 侧边栏、Group Card、Import、Menu Bar 和设置页共享的顺序。侧边栏与设置页的拖拽都更新同一份 Agent 展示顺序。
- Home 侧边栏的分组顺序为 Status、Tags、Agents、Source Type、Projects。
- Source Type 继续使用 Local、Remote、Collection 三种产品语义；Git 和 ClawHub 仍归入 Remote。
- Source Type 的 `All` 固定在首位，其余选项按关联 Group 数量降序排列，数量相同时按本地化标题排序。
- Tags 在 Default Count Order 下按关联 Group 数量降序排列，数量相同时按本地化标题排序。用户手动调整后进入 Custom Tag Order；Tags 标题旁提供恢复默认排序的操作。
- Source Type、Tags 和 Agents 的数量都在当前 Project Scope 内计算；切换 Project Scope 后重新计算和排序。
- 旧标签状态迁移时，将旧顺序与历史默认字母顺序比较：一致时进入 Default Count Order；明显经过用户调整的顺序保留为 Custom Tag Order。迁移后显式保存 Tag Ordering Mode。
- Group Card 的 Agent 和 Skill 在当前宽度无法完整展示时，在 section 标题旁显示入口箭头。点击标题或箭头打开 Group Card Overflow Popover，浮窗展示完整列表并保留现有选择状态与操作语义。
- 没有溢出时不显示箭头。Menu Bar compact 卡片继续隐藏没有溢出的 section 标题；发生溢出时显示紧凑标题和箭头作为浮窗入口。
- 浮窗沿用卡片已有 Item 顺序，不引入第二套排序规则。浮窗内容换行展示，内容过多时在浮窗内部滚动，点击外部或按 Escape 关闭。

## State and interaction rules

- Loading sections keep their existing loading pills and do not show an overflow arrow until the real Item list has been measured.
- Busy cards may open the popover, but Item actions remain disabled by the existing busy state.
- Empty sections keep their existing section presentation and do not show an overflow arrow.
- A section-title click opens the popover before the card-level Detail navigation gesture can act.
- The popover is approximately 320px wide and at most 280px high; excess content scrolls inside it.

## Validation boundary

The acceptance evidence must cover Home sidebar count ordering and Agent drag placement, Group Card no-overflow and overflow states, popover wrapping and selection, Menu Bar compact overflow entry, Settings synchronization, and persistence after application restart. The validation should produce repeatable desktop E2E output plus screenshots or an inspectable report.

## Considered Options

- **Shared Agent Display Order plus anchored overflow popover (chosen)** — reuses the existing preference boundary, keeps all card modes consistent, and exposes hidden items without permanently increasing card height.
- **Separate sidebar and settings orders** — simpler local view code, but creates contradictory Agent order and makes Group Card behavior unpredictable.
- **Always wrap all card items** — exposes every item, but increases card height and weakens the compact Menu Bar layout even when there is no overflow.
- **Keep horizontal scrolling as the only overflow mechanism** — requires less UI work, but hides the existence of additional items and does not provide the requested sidebar-like full view.

## Consequences

- The desktop presentation state needs an explicit Tag Ordering Mode so default ordering can be distinguished from a user-customized order.
- Agent drag handling must preserve hidden or currently undetected Agent positions while reordering the visible subset.
- Group Card must measure whether each section overflows before rendering its arrow and popover entry.
- The popover must be covered in Home, Import, Menu Bar compact, Menu Bar comfortable, loading, busy, empty, selected, and partially selected states.
- Count calculations must follow the active Project Scope and be recalculated when that scope changes.
- CLI, TUI, bridge payloads, source state, group state, and deployment projections remain unchanged.

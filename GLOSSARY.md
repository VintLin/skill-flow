# Skill Flow

Skill Flow 管理可选择的 skill group、权威 source state 和由其生成的 target projections。

## Source lifecycle

**Source Lifecycle**:
受管 source 的生命周期操作集合，包括新增或最终导入、更新、修复和卸载。
_Avoid_: Import Discovery, Project Health Check, generic mutation

**Managed Source Operation**:
一次同时改变受管 source 的权威状态和 Skill Flow-owned target projections 的操作。
_Avoid_: deployment-only operation, external source update

## Workspace presentation

**Agent Display Order**:
用户在 Skill Flow 中看到 Agent 的统一顺序，适用于 Home 侧边栏、Group Card 和设置页。
_Avoid_: 单个 Group 的启用状态或 Agent 的部署状态

**Default Count Order**:
来源类型和标签在没有用户自定义顺序时，按关联 Group 数量从多到少排列的默认展示顺序；数量相同时按名称排序。
_Avoid_: 改变 source 或 tag 的权威数据

**Custom Tag Order**:
用户主动调整标签顺序后形成的展示顺序；它覆盖 Default Count Order，直到用户恢复默认排序。
_Avoid_: Agent Display Order

**Tag Ordering Mode**:
标签列表当前采用的排序方式：Default Count Order 或 Custom Tag Order。
_Avoid_: 单个 Group 上标签的添加顺序

**Group Card Overflow Popover**:
当 Group Card 中的 Agent 或 Skill 无法在当前卡片宽度内完整展示时，通过 section 标题打开的完整 Item 浮窗。
_Avoid_: 改变 Group Card 的选择状态模型

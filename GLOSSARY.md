# Skill Flow

Skill Flow 管理可选择的 skill group、权威 source state 和由其生成的 target projections。

## Source lifecycle

**Source Lifecycle**:
受管 source 的生命周期操作集合，包括新增或最终导入、更新、修复和卸载。
_Avoid_: Import Discovery, Project Health Check, generic mutation

**Managed Source Operation**:
一次同时改变受管 source 的权威状态和 Skill Flow-owned target projections 的操作。
_Avoid_: deployment-only operation, external source update

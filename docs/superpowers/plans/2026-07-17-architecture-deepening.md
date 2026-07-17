# 架构深化候选清单

> 状态：进行中。本文记录审查发现和实施顺序；每项进入实现前先确认 seam、行为不变量与测试面。

## 目标

以最小必要改动提升 Skill Flow 的 module depth、locality 与 leverage；不改变既有 CLI、TUI、desktop bridge 的外部行为，除非单项设计明确确认并补齐契约测试与文档。

## 约束

- 保留 `SkillFlowApp` 作为 CLI、TUI 与 desktop bridge 的稳定外部 interface。
- 延续 `docs/adr/0001-shared-desktop-suite-for-workspace-memory.md`：Desktop Workspace Memory 不进入 Shared Skill State。
- 延续 `docs/adr/0002-desktop-group-operation-queue.md`：Group Operation Queue 是 session-scoped FIFO；不重开该决定。
- 只有出现两个真实 adapter 时才引入新的 seam；禁止为便于测试新增假设 seam。
- 每项先补最小测试，再实现；独立逻辑单元单独提交。

## 候选与顺序

### 1. 深化 `SkillFlowApp` 的内部 implementation（优先）

**范围**：`packages/query/src/runtime.ts`。

`SkillFlowApp` 的外部 interface 已提供调用侧 leverage，但 8,097 行 implementation 同时拥有 Source、Import、Collection、Projection、Repair 与 Migration 工作流，locality 不足。

方向：保持外部 interface 不变，按既有领域概念收拢内部 implementation；优先识别 deployment reconciliation 中重复的 plan、apply、state write、cleanup、audit 流程。已有 ChannelAdapter 变体构成真实 seam。

完成条件：调用方行为不变；相关 implementation 的测试面集中，不让 CLI/TUI/bridge 承担内部 orchestration。

### 2. 收拢 desktop bridge 的动态 payload 解码

**范围**：`apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`、`ViewModels/ImportLogic.swift`、`DetailLogic.swift`、`MainViewModel.swift`。

`[String: Any]` payload 的 key / cast 判断穿透多个 UI module，source snapshot 等 implementation 重复，bridge seam 泄漏。

方向：让一个 decoder module 吸收动态 JSON；Import、Detail、Source module 仅消费已解码数据。保留现有 transport adapter。

完成条件：desktop payload 规则有单一 test surface，字段变化不再需要跨多个 UI module 同步。

### 3. 缩小 desktop 查询与命令 interface

**范围**：`Runtime/DesktopQuerying.swift`、`Runtime/DesktopCommanding.swift` 及其消费方。

两份广义 interface 逐项转发 BridgeClient，测试 adapter 被迫实现大量 `fatalError("unused")`。这说明 interface 浅、调用方缺少 locality。

方向：按 Source、Import、Collection、Settings 的实际消费收窄 interface；先以候选 2 的 decoder 模块为基础确认可见数据形状。

完成条件：测试 adapter 只实现真实使用的行为，且不引入只拥有一个 adapter 的假设 seam。

### 4. 解除 `DetailLogic` 对完整 `MainViewModel` 的反向依赖

**范围**：`ViewModels/DetailLogic.swift`、`ViewModels/MainViewModel.swift`。

`DetailLogic` 通过 `mainProvider` 访问完整 MainViewModel，同时 MainViewModel 又驱动 DetailLogic，导致隐式大 interface 与双向 implementation 依赖。

方向：将 Detail 所需的不可变输入与结果置于明确 seam；MainViewModel 只负责 desktop route 编排。清理 MainViewModel 中已由 SourceManagement / DetailLogic 接管的浅残留。

完成条件：Detail 的行为可用小输入直接测试，修改 Detail 不再要求理解完整 MainViewModel。

### 5. 将 bridge command catalog 作为契约中心（探索项）

**范围**：`packages/shared-types/src/protocol.ts`、`apps/cli/src/bridge-command.ts`、Swift bridge protocol / facade。

共享 protocol 目前集中 command name，但 payload 规则与 response envelope 仍在多端重复。跨 TypeScript / Swift 的共享形状须先验证，故暂不承诺 implementation。

方向：评估能否以 compatibility fixture 集中 command identity、payload rule 与 response envelope，且不增加不必要的 adapter。

完成条件：仅在跨语言契约确有重复维护成本时实施；外部 bridge 行为变化必须补兼容检查和文档。

## 本轮测试清单

- `packages/query`：deployment planner / applier、runtime lifecycle、project-scoped drafts。
- desktop：bridge protocol decode、Detail 输入/结果、对应 SwiftUI state 测试。
- bridge：command catalog 与 request / response compatibility。
- 每个阶段运行受影响的最小测试；完成候选后再运行对应 package build / test。

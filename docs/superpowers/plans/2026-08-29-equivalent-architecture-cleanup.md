# Equivalent Architecture Cleanup

Date: 2026-08-29
Status: Active

## Objective

清理可证明的冗余代码、死代码、历史兼容残留和误导性文档，并在严格保持行为等价的前提下提高 module depth、locality 与 Agent 可导航性。

## Non-negotiable invariants

- 不改变 CLI、TUI、Desktop 的任何可观察结果或功能。
- 不改变 bridge protocol、state schema、持久化格式或兼容窗口。
- 不改变 ADR 0002 的 Bounded Preparation Pool、Serial Mutation Channel、FIFO 与 per-group commit 语义。
- 不改变 ADR 0003 的 recovery、quit、conflict 和 completed-operation 语义。
- 不删除公开支持的 v1→v2 state migration。
- 每个清理项必须通过 deletion test：删除后复杂度消失，且不会转移到生产 caller。
- 无法证明无 caller、无行为影响或无外部契约影响的候选，本轮不处理。

## Confirmed order

### 1. Desktop deterministic cleanup

- 删除零引用类型、状态、方法和空 callback。
- 删除已被 Group Operation Queue 完整替代的 Desktop 旧 Update All 直连路径。
- 删除只保护 no-op 或已废弃行为的测试与本地化文案。
- 保留当前 mutation workspace fallback 和正式 bridge 行为。

Verification:

- `MainViewModelSelectionTests`
- `WorkflowCoverageTests`
- `ImportScreenContainerTests`
- `GroupOperationQueueTests`
- `DesktopLocalizationTests`
- Desktop Swift build

### 2. TypeScript deterministic cleanup

- 删除零 caller alias、重复 parser 和只有测试 adapter 的 hypothetical seam。
- 收窄 Import Preparation Cache 中没有任何行为消费者的派生字段；cache 仍保持可重建和当前 TTL 行为。
- 收窄仅供内部实现使用的 runtime surface；生产调用统一经过现有 SkillFlowApp interface。
- bridge 常量字段、state migration 和任何外部契约项不在本轮删除范围。

Verification:

- affected CodeGraph tests
- `npm run build`
- affected workspace tests

### 3. Documentation truth cleanup

- 归档已完成但仍位于 active 目录的 Usage spec、plan 和 issue。
- 归档已落实且指向旧工作区的交互审计。
- 修正当前 verification、Issue 8 和 reference 中与 v2 implementation 冲突的结论或失效绝对链接。
- archives 保留历史原文，不作为当前实现事实源。

Verification:

- 当前 docs 索引与真实文件位置一致。
- 当前文档不再把已完成功能标记为 ready-for-agent。
- 当前文档链接使用仓库相对路径。

### 4. Protected Group Operation Transaction organization

- 只整理 managed Update、Bulk Update 中的单组提交和 final Import 已有 implementation。
- 保持现有 begin、target preparation、checkpoint、commit、recover 的执行结果和顺序语义。
- 让 transaction implementation 吸收 caller 重复的阶段编排；不扩大到普通 Apply、Repair 或 Uninstall。
- 不修改 recovery journal schema。

Verification:

- protected Update success/failure/recovery
- final Import success/failure/recovery
- Bulk Update partial commit
- target ownership conflict
- quit recovery

## Commit discipline

每个独立逻辑单元单独提交，不混合行为等价重构、文档归档和机械格式化。若测试证明行为发生变化，立即停止该项并恢复到现有语义。

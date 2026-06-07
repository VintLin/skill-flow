# Skill Flow State Schema V2 总控计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重新设计 Skill Flow 的核心持久化数据结构，让早期 `~/.skillflow` 数据可以迁移到 V2，并让后续 import、preview、prepare、commit、desktop bridge 基于稳定数据契约继续演进。

**Architecture:** 以 `~/.skillflow` state root 为权威数据源，新增 V2 schema 与迁移入口；旧格式只在 normalizer、migration CLI、bridge parser 等边界兼容，业务核心只消费 V2 domain model。cache 允许删除重建，agent 目标目录不作为权威数据源，迁移后通过 apply/repair 重新校验。

**Tech Stack:** TypeScript monorepo、SwiftUI desktop bridge、JSON state files、Vitest、Swift XCTest、Node CLI。

---

## 背景

当前项目经过多轮迭代后，早期数据结构已经难以支持新功能：

- `selectedSkillIds` 同时表示 UI id、provider id、archive path、repo path、leaf id。
- `skillIds` 在 prepare cache 中无法表达 leaf 与 repo path 的稳定关系。
- `canonicalRepo` 和 `cacheKey` 在部分路径中混用；V2 内部统一改为 `canonicalLocator`。
- import preview、prepare、commit、desktop draft 的数据契约不一致。
- 旧 `~/.skillflow` 中的数据可被新版 normalizer 读取，但无法清晰区分“权威状态”和“可重建缓存”。

这次重构目标不是为某个 provider 增加补丁，而是建立一个能支撑后续迭代的 V2 state schema。

## 状态目录边界

默认状态目录：

```text
~/.skillflow
```

可通过环境变量覆盖：

```text
SKILL_FLOW_STATE_ROOT=/path/to/state
```

权威数据：

```text
~/.skillflow/manifest.json
~/.skillflow/lock.json
~/.skillflow/preferences.json
~/.skillflow/collections.json
~/.skillflow/source/collection/*
```

可重建缓存：

```text
~/.skillflow/catalog/import-data.json
~/.skillflow/catalog/source-metadata.json
~/.skillflow/catalog/import-preparations.json
~/.skillflow/catalog/import-preparations/*
~/.skillflow/catalog/git/*
```

非权威部署结果：

```text
~/.codex/skills
~/.claude/skills
~/.cursor/skills
其他 target 写入目录
```

桌面端补充状态：

```text
macOS UserDefaults
```

桌面端 UserDefaults 只保存 UI 偏好、语言、主题、自定义展示设置，不作为 skill 安装和 import 数据的权威源。

## 目标数据原则

1. `manifest.json` 记录用户声明的 source、display、enabled targets。
2. `lock.json` 记录实际安装 leaf、source snapshot、target binding。
3. import draft 使用 `selectedSkills: { uiId, selector }[]`。
4. `uiId` 只用于 UI，由 `sourceSelectionKey + selectorKey` 稳定派生。
5. `selector` 只用于提交解析，第一阶段只允许 `repoPath | skillName`。
6. provider 原始 id 只进入 `origin` 和 diagnostics。
7. `cacheKey` 只用于缓存索引，`canonicalLocator` 只表达 canonical source identity。
8. 技能集合是实体组合，确认时复制 skill 内容到 `source/collection/*`，后续原始 skill 变化不自动影响技能集合。
9. migration 工具负责一次性转换旧 state，runtime normalizer 保留最小双读能力。
10. cache 清理后可由新版 runtime 重建。
11. target 目录通过 apply/repair 校验，不直接从 target 目录反向生成权威状态。
12. 可由同一记录内其他字段稳定推导的字段不写入权威文件；兼容字段只停留在 bridge/query/cache 边界。

## 分阶段子计划

前置. [06-data-structure-inventory-and-terminology.md](06-data-structure-inventory-and-terminology.md)  
   提取当前应用数据结构、建立统一术语表，并反查数据结构漏洞与不闭环处。

流程. [07-serial-documentation-workflow.md](07-serial-documentation-workflow.md)  
   定义串行文档固化规则。每个阶段先固化文档，再进入下一阶段；subagent 只审查当前阶段。

闭环. [08-stage-0-terminology-closure.md](08-stage-0-terminology-closure.md)  
   将 `06` 中仍未完全闭合的术语、PreparedSkillRef 权威性和 target repair 规则回写到对应阶段文档。

0. [00-data-model.md](00-data-model.md)  
   定义完整 V2 state schema、文件分层、实体关系、迁移映射和数据不变量。

1. [01-state-contract.md](01-state-contract.md)  
   定义 V2 domain/state 类型、schemaVersion、兼容 normalizer 和文件边界。

2. [02-migration-tool.md](02-migration-tool.md)  
   增加 `skill-flow migrate-state --to v2`，支持 dry-run、backup、atomic write、cache prune。

3. [03-import-selector-contract.md](03-import-selector-contract.md)  
   把 import preview/prepare/commit 切到结构化 selector，消除 `selectedSkillIds` 多义。

4. [04-desktop-bridge.md](04-desktop-bridge.md)  
   桌面端 parser、draft、bridge payload、toast diagnostics 支持 V2，并保留旧 payload 回退。

5. [05-verification-and-release.md](05-verification-and-release.md)  
   端到端验证、fixture、迁移回滚、release note、legacy 删除条件。

## 总体执行顺序

- [ ] **Step 0: 固化当前数据盘点、术语表和串行流程**

先阅读并固化 [06-data-structure-inventory-and-terminology.md](06-data-structure-inventory-and-terminology.md)、[07-serial-documentation-workflow.md](07-serial-documentation-workflow.md) 与 [08-stage-0-terminology-closure.md](08-stage-0-terminology-closure.md)。完成后应明确当前应用数据结构、统一术语、已知漏洞、串行门槛和每阶段文档出口条件。执行 Stage 1 前，`06` 覆盖矩阵不得再出现 `部分覆盖` 或 `已识别，计划需固化`。

- [ ] **Step 1: 完成 V2 数据模型**

执行 [00-data-model.md](00-data-model.md)。完成后应得到与术语表一致的 V2 state schema，并列出所有权威字段、兼容字段和 invariant。

- [ ] **Step 2: 完成 V2 state contract**

执行 [01-state-contract.md](01-state-contract.md)。完成后应能在 TypeScript 层读取 V1/V2 state，并输出统一 V2 domain model。

- [ ] **Step 3: 完成 migration CLI**

执行 [02-migration-tool.md](02-migration-tool.md)。完成后应能对任意 state root 做 dry-run、backup、migrate、verify。

- [ ] **Step 4: 完成 import selector contract**

执行 [03-import-selector-contract.md](03-import-selector-contract.md)。完成后 import 业务核心不再依赖 legacy string id。

- [ ] **Step 5: 完成 desktop bridge V2**

执行 [04-desktop-bridge.md](04-desktop-bridge.md)。完成后桌面端可优先发送 V2 payload，旧 CLI 或旧 preview 下可回退。

- [ ] **Step 6: 完成验证与发布准备**

执行 [05-verification-and-release.md](05-verification-and-release.md)。完成后可给出升级说明和回滚方式。

执行规则：上述步骤必须串行完成。每一步都先固化对应文档，并通过该文档自检；不能在前一步未固化时并行推进后续步骤。

## 提交边界

每个子计划至少一个 commit：

```text
feat: add state schema v2 contract
feat: add state migration command
feat: add import selector contract
feat: support import v2 in desktop bridge
test: verify state schema v2 migration flow
```

如果某个子计划中包含重构和行为变化，应拆成两个 commit：先测试和类型，再实现行为。

## 验收标准

1. 新版 runtime 能读取旧 `~/.skillflow` 并提示是否需要迁移。
2. `skill-flow migrate-state --to v2 --dry-run` 能列出将修改的文件和将清理的 cache。
3. migration 会自动备份 state root。
4. V2 import draft 不依赖 provider id、archive path 或 leaf id。
5. `anthropics/skills`、`vercel-labs/agent-skills`、`garrytan/gstack` 均能完成 preview、prepare、commit。
6. 桌面端导入失败 toast 能显示 reason code 和 selector diagnostics。
7. cache 删除后可以重建，不影响权威 state。
8. target 目录可通过 apply/repair 与 V2 lock 对齐。
9. `npm test`、`npm run build`、desktop `swift test` 通过。

## 风险

### 旧用户直接升级失败

处理方式：runtime normalizer 保留 V1/V2 双读；桌面启动时通过 bridge 检测 migration status；CLI 提供显式 migration。

### 迁移写坏 state

处理方式：迁移前强制 backup；写入临时目录后 atomic replace；迁移后重新读取并校验。

### 补丁代码扩散

处理方式：legacy 逻辑只允许出现在 normalizer、migration CLI、bridge parser 三类边界文件中。query/core/desktop UI 的业务路径只消费 V2 model。

### target 目录与 lock 不一致

处理方式：不直接迁移 target 目录；迁移后运行 apply/repair，按 V2 lock 重新校验 target。

### legacy 删除过早

处理方式：至少保留两个 release 周期；删除前必须通过新/旧 CLI 与新/旧桌面组合测试，并提供本地 diagnostics 检查命令。

## 关联设计

- [../2026-06-04-import-data-contract-redesign.md](../2026-06-04-import-data-contract-redesign.md)

# 串行文档固化流程

日期：2026-06-04

## 目标

V2 state schema 重构必须串行推进。每一步先固化文档，再进入下一步实现或计划拆分。subagent 可以参与审核，但不能并行推进多个阶段，也不能绕过文档固化。

## 串行规则

1. 一个阶段只能有一个当前权威文档。
2. 当前阶段文档未固化前，不开始下一阶段的实现计划。
3. subagent 只审查当前阶段文档或当前阶段产物。
4. subagent 审查意见必须汇总回当前阶段文档。
5. 当前阶段文档通过自检后，才允许更新下一阶段计划。
6. 如果后续阶段发现前置文档有漏洞，必须回到前置阶段修正文档，再重新检查受影响的后续文档。

## 文档固化定义

一个阶段的文档只有同时满足以下条件，才视为固化：

```json
{
  "documented": true,
  "scopeIsExplicit": true,
  "terminologyIsConsistent": true,
  "dataContractsAreConcrete": true,
  "invariantsAreListed": true,
  "migrationOrCompatBoundaryIsNamed": true,
  "reviewFindingsAreResolved": true,
  "markdownStructureVerified": true
}
```

固化不等于实现完成。固化只表示该阶段的判断依据已经写入文件，后续执行者可以按文档工作。

## 阶段顺序

### Stage 0: 当前数据盘点与术语固化

固化文档：

```text
06-data-structure-inventory-and-terminology.md
08-stage-0-terminology-closure.md
```

必须完成：

- 提取当前应用已出现的数据结构。
- 用 JSON 展示关键结构。
- 建立统一术语表。
- 基于术语表反查逻辑漏洞。
- 吸收 subagent 对结构覆盖、术语一致性、闭环风险的审查意见。

出口条件：

- 不再存在未解释的 `selectedSkillIds`、`canonicalRepo`、`skillIds`、`virtual` 等 legacy 字段。
- 每个 legacy 字段都明确位于 V1 当前结构、compat serializer、normalizer 或问题描述中。
- 每个 V2 新字段都有唯一语义。
- `06` 覆盖矩阵中所有行必须是 `已覆盖` 或 `已修正计划`。
- `08-stage-0-terminology-closure.md` 中所有任务必须完成，或明确被后续阶段文档中的更具体任务替代。

### Stage 1: V2 数据模型固化

固化文档：

```text
00-data-model.md
```

输入：

```text
06-data-structure-inventory-and-terminology.md
```

必须完成：

- 根据术语表更新 V2 类型。
- 明确权威文件、可重建缓存、runtime transient 的边界。
- 明确所有 invariant。
- 明确 collection materialization、migration generation、preparation lifecycle、repair 的数据要求。

出口条件：

- `00-data-model.md` 不得与术语表冲突。
- 所有 V2 类型中的字段都能在术语表中找到定义。
- 兼容字段不进入 core model。
- V2 权威文件必须全部写入同一个 `migrationGeneration`。
- restore selection 不得继续命名为 restore snapshot，也不得作为部署内容来源。
- local import/local scan 的 V2 choice 不得使用 `"origin"` 作为新 choice id。

### Stage 2: State Contract 固化

固化文档：

```text
01-state-contract.md
```

输入：

```text
00-data-model.md
```

必须完成：

- 定义 TypeScript domain/state 类型落点。
- 定义 V1/V2 normalizer 读取边界。
- 定义 schemaVersion 和 migration generation 校验。
- 定义 cache prune 后 runtime 行为。

出口条件：

- 测试计划能证明 V1/V2 读取统一为 V2 domain model。
- 半迁移状态有明确错误码或恢复策略。

### Stage 3: Migration Tool 固化

固化文档：

```text
02-migration-tool.md
```

输入：

```text
00-data-model.md
01-state-contract.md
```

必须完成：

- 定义 dry-run、backup、staging、generation、atomic replace、post-commit verify。
- 定义 collection materialization 复制和 hash 校验。
- 定义 project drafts、restore selections、bindings、projections 的 leaf id 重写规则。
- 定义失败恢复和 cache prune 顺序。

出口条件：

- 任意失败点都能说明 state root 是旧状态、完整 V2 状态，还是 `STATE_MIGRATION_INCOMPLETE`。

### Stage 4: Import Selector Contract 固化

固化文档：

```text
03-import-selector-contract.md
```

输入：

```text
06-data-structure-inventory-and-terminology.md
00-data-model.md
```

必须完成：

- 定义 `sourceSelectionKey`、`selectorKey`、`uiId`。
- 定义 `repoPath` 坐标系。
- 定义 `PreparedSkillRef` 与 selector binding。
- 定义 preparation lifecycle 状态机和并发规则。
- 定义 local import/local scan 的 V2 selector 结构。

出口条件：

- commit core 不读取 `uiId`、provider id、archive path 或 legacy `selectedSkillIds`。
- 旧 payload 只在 query/bridge 边界转换。

### Stage 5: Desktop Bridge Contract 固化

固化文档：

```text
04-desktop-bridge.md
```

输入：

```text
03-import-selector-contract.md
```

必须完成：

- 定义 Swift preview parser。
- 定义 V2 payload 和 legacy payload fallback。
- 区分 `BRIDGE_UNSUPPORTED_IMPORT_DRAFT_V2` 与 selector 语义错误。
- 定义 toast diagnostics。
- 定义 migration/cache epoch 失效提示。

出口条件：

- legacy retry 只用于旧 CLI 不支持 V2 payload。
- selector invalid/not found 不允许 fallback 到 legacy。

### Stage 6: Verification And Release 固化

固化文档：

```text
05-verification-and-release.md
```

输入：

```text
01-state-contract.md
02-migration-tool.md
03-import-selector-contract.md
04-desktop-bridge.md
```

必须完成：

- 定义端到端 fixture。
- 定义新旧 CLI/desktop 组合验证。
- 定义 migration rollback 验证。
- 定义 target repair 验证。
- 定义 legacy 字段删除门槛。

出口条件：

- 每个外部可见行为都有验证命令或手工验证步骤。
- release note 能准确说明升级、回滚和兼容窗口。

## Subagent 使用规则

subagent 只用于当前阶段的审查或当前阶段内的局部验证：

```json
{
  "allowed": [
    "审查当前阶段文档是否遗漏结构",
    "审查当前阶段术语是否一致",
    "审查当前阶段 invariant 是否闭环"
  ],
  "notAllowed": [
    "并行编写后续阶段文档",
    "在当前阶段未固化时开始实现",
    "让多个 subagent 同时修改同一个文档",
    "绕过当前阶段文档直接改代码"
  ]
}
```

如果需要多个 subagent 审查同一阶段，审查可以并行收集，但文档修改必须由主线程串行整合。整合完成后重新执行该阶段自检。

## 自检命令

每次固化文档后至少执行：

```bash
rg -n "TO""DO|TB""D|待[定]|未[定]" plans/2026-06-04-state-schema-v2
for f in plans/2026-06-04-state-schema-v2/*.md plans/2026-06-04-import-data-contract-redesign.md; do
  n=$(rg -n '^```' "$f" | wc -l | tr -d ' ')
  r=$((n % 2))
  printf "%s fences=%s parity=%s\n" "$f" "$n" "$r"
done
```

预期：

```text
无占位词命中
所有 parity=0
```

# Multi-Agent Audit Result — 2026-06-07 v2-authority-cleanup-remaining

> 6 个 subagent 并行审计（角色 A–F），只读不写。每个 subagent 输出 ≤ 120 行，本文件做汇总。

## 总体判断

**With fixes**。`V1/V2 view 层 / bridge V1 fallback / mode 字段读取 / desktop V1 selectedSkillPaths` 等 P0 全部已闭环（角色 B/D 一致结论）。残余风险集中在 **migration 边界写盘原子性** 和 **公共错误码/类型命名的 V1 术语回潮**。

| 角色 | 范围 | Verdict | P0 | P1 | P2 |
| --- | --- | --- | --- | --- | --- |
| A | Schema | With fixes (P2 only) | 0 | 2 | 3 |
| B | Runtime/Bridge | With fixes | 0 | 1 | 4 |
| C | Core Engine | With fixes | 0 | 2 | 3 |
| D | Desktop | Approved (P2 only) | 0 | 0 | 4 |
| E | Migration | **With fixes** | **2** | 4 | 0 |
| F | Testing/Verify | Approved with notes | 0 | 0 | 3 |

## 必须修的 P0（仅角色 E）

### P0-1 `replaceCollectionSource` 非原子写盘，半路中断会留下混合数据
- File: `packages/core-engine/src/services/state-migration-service.ts:926-936`
- Problem: `fs.rm` 后 `fs.cp` 顺序执行；中途中断则 `stateRoot/source/collection/<id>/` 留下 staging 残片。`fs.cp` 提前写完 `.skillflow-generation.json` 但 `.skillflow-complete` sentinel 缺失时，post-replace `inspectStateMigrationStatus` 误判 `current`。
- Risk: collection 成员静默丢失，下一次 `migrate()` 不重试（`state-migration-service.test.ts:292-319` 证明）。
- Fix: (a) staging 目录 + atomic rename；(b) 必须含 `.skillflow-complete` sentinel 否则判 `incomplete`；(c) 加中断模拟测试。

### P0-2 `replaceAuthorityFiles` 顺序写盘半途失败，混合版本
- File: `packages/core-engine/src/services/state-migration-service.ts:920-924`
- Problem: 4 个文件 sequential `fs.copyFile`；`manifest.json`/`lock.json` 已写但 `preferences.json` 抛错时，盘上是 v2 manifest+lock + v1 preferences。catch 只清 staging 和 marker，不回滚。
- Risk: 读到 `preferences` 会抛 `STATE_MIGRATION_REQUIRED` 掩盖真因。
- Fix: 写 staging 目录然后 atomic rename；或回滚到 backup。

## 关键 P1（建议本批修）

| 来源 | 位置 | 简述 |
| --- | --- | --- |
| B | `query/runtime.ts:813/819/837/950/990/5220` | `VIRTUAL_GROUP_*` 错误码 + `VIRTUAL_GROUP_SKILL_NAME_CONFLICT` 残留；message 已用 "Collection"，code 仍是 VIRTUAL。**Breaking change 风险**，需决策保留 vs 改 `COLLECTION_*`。 |
| C | `core-engine/services/import-preparation-service.ts:282-315` | `findReusablePreparation` 把 `committing` 记录当 stale 删除；并发 prepare 会清掉正在 commit 的记录，导致 `commitPreparedImportSource` 失败分支写已删 id。 |
| C | `core-engine/services/projection-ledger.ts:31` | `export const managedProjections = activeProjections` 兼容别名没清（plan Task 3 要求移除）。 |
| E | `state-migration-service.ts:541-543` | 孤儿 `kind: "virtual"` source 静默 drop，无 diagnostic。 |
| E | `state-migration-service.ts:825` | legacy projection 无 `status` 字段时 `status: undefined` → JSON.stringify drop → runtime filter `status === "active"` 全部漏掉。 |
| E | `state-migration-service.ts:758` | `toLeafRecord` 硬编码 `valid: true`；V1 `valid: false` 静默翻 true。 |
| E | `state-migration-service.test.ts:130-140` | 测试不验 `status`；上述 silent loss 回归无防御。 |

## P2 汇总（次轮清理）

- **A**: `state-schema-v2.test.ts` 文件名残留 V2 后缀；`packages/*/dist/` 旧 build artifacts；`normalizeLockFile` 写盘侧 defensive（无 fallback 但不强制 TS）；`SourceLockRecord` 缺 `locator` 字段（manifest/lock 拆分设计，但无 contract 测试）。
- **B**: `RuntimeLockView` 死类型；`workflow-service.test.ts:370` 等 fixture 残留 `metadataWarnings`/`displayName`；`config-integration.test.ts:322-357` "tolerates legacy lock without deployments" 是 no-op 死测试。
- **C**: `source-checkout-service.ts:61-71` `SourceCheckoutLock` 内部 DTO 含 V1 字段名误导；`doctor-service.ts:259-271` `sourceLockById` 返回合成形状命名误导。
- **D**: `MainViewModel.swift:1383/1619` `homeSourceType` 漏 `"github"` kind + 含 dead `"path"/"filesystem"`；`gstack` 描述三语种 `"virtual team"` 营销词（产品口径决策，非技术债）；`pinnedSourceIdsMigrationKey` 改名 `migratedToRuntimePreferences` 导致已迁移用户重跑（无副作用但冗余读）。
- **F**: `vitest.config.ts` 7 个包用同款 `exclude: ["dist/**"]` 单行防御；`swift test` 未在本审计执行（清单数字需运行验证）；`bridge-command.test.ts:65,93` `as any` 是合法 JsonValue 负向断言。

## 测试缺口

| 缺口 | 来源 | 严重度 |
| --- | --- | --- |
| `findReusablePreparation` 对 `committing` 记录的处理 | C | P1 |
| `findReusablePreparation` 在 ready + checkoutPath 缺失时删除记录的 prepare 端断言 | C | P1 |
| 旧数据 → migrate → CLI bridge 端到端 round-trip（当前由两相邻测试覆盖但不连贯） | F | P2 |
| 旧 V1 `kind: "virtual"` 孤儿 source migration 行为 | E | P1 |
| Legacy projection 无 `status` 字段 migration 行为 | E | P1 |
| Legacy leaf `valid: false` migration 行为 | E | P1 |
| `replaceCollectionSource` / `replaceAuthorityFiles` 中断模拟测试 | E | P0 |
| Legacy lock `sources` 为对象（record）shape 而非数组时行为 | E | P2 |
| V1 projection 持久字段读盘 round-trip | A | P2 |
| `projection-ledger` 不再 export `managedProjections` 的静态断言 | C | P2 |
| `homeSourceType` 对 `github` kind 走 "remote" 的 positive 断言 | D | P2 |
| Swift `swift test` 实际跑通（470 tests / 1 skipped / 0 failures 数字需运行验证） | F | P2 |

## 残余风险（需人工决策）

1. **错误码 VIRTUAL→COLLECTION 重命名是否 breaking change**（角色 B 标记）：桥/桌面若按 code 字符串路由 UI 提示，改名是 breaking；仅按 message 显示可安全替换。
2. **gstack 文案 `"virtual team"`**（角色 D）：第三方营销词非 V1 数据类型，但若产品口径要求统一需文案 owner 拍板。
3. **swift test 数字未运行验证**（角色 F）：本审计仅做结构性检查，最终 470 tests 通过数字需 `cd apps/desktop-mac && swift test` 实际跑通确认。
4. **`SourceRevision` 判别联合 vs `source-authority-service.ts:604-622` `createSourceRevision` 旧 union 分派**：TypeScript 静默接受（子集字面量），但新增 provider 变体会被静默吞掉。需在 `04-source-revision-decision.md` 立决策文档（目前缺失）。
5. **plan 文档 ledger-hygiene**（角色 F）：`00-current-execution-plan.md` 仍含未勾选 Task 1/2/4 checkbox，跟"完成"语义不符；change list 已建议分 commit 解决。
6. **`legacy-agents-lock.ts` 命名误导**（角色 E）：文件被 `runtime.ts:147` 跟 `workspace-bootstrap-service.ts:15` 引用（不是 migration 代码），仅作外部 Codex skill lock interop 用。plan 应确认 `agentsOriginReader` 注入点本身是 migration boundary surface，或把文件重命名为 `codex-skill-lock-interop.ts`。

## 建议处理顺序

1. **本批必修**：P0-1 + P0-2（migration 写盘原子性）—— 涉及数据完整性，不修不能 merge
2. **本批建议修**：P1 六条 —— 都是 silent data loss 或 breaking change 风险
3. **次轮清理**：P2 全部 —— 命名/死代码/文案
4. **执行验证**：`cd apps/desktop-mac && swift test` + `npm run build && npm test` 跑通

## 修复记录

### 2026-06-07 P0 migration 写盘原子性

- `packages/core-engine/src/services/state-migration-service.ts`
  - `replaceAuthorityFiles` 改为先写 transaction incoming，并在异常时从 backup 恢复四个 authority 文件。
  - `replaceMigratedState` 将 authority 替换和 collection 替换视为同一落盘事务；collection 替换失败时恢复旧 authority。
  - `replaceCollectionSource` 改为 incoming 目录 + rename 替换；异常时恢复旧 collection 目录。
- `packages/core-engine/src/services/skill-collection-materializer.ts`
  - collection materialize 完成后写 `.skillflow-complete` sentinel。
- `packages/storage/src/state-schema.ts`
  - `inspectStateMigrationStatus` 对 collections 中声明的 collection 强制检查 `.skillflow-complete`，缺失时返回 `STATE_MIGRATION_INCOMPLETE`。
- 回归测试：
  - authority replace 失败回滚旧 authority。
  - collection replace 失败回滚旧 authority 和旧 collection 目录。
  - materialized collection 写入 `.skillflow-complete`。
  - 缺 `.skillflow-complete` 的 collection 状态判定为 incomplete。
- 已验证：
  - `npm run -w @skill-flow/core-engine test -- src/tests/state-migration-service.test.ts`
  - `npm run -w @skill-flow/storage test -- src/tests/state-migration-status.test.ts`
  - `npm run build`
  - `npm test`

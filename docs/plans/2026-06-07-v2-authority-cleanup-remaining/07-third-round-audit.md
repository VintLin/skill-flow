# Third-Round Audit — 修复后 + 测试/文档/卫生

> 配合 `05-multi-agent-audit-result.md` / `06-fix-verification-and-closure-review.md`。
> 6 P1 修复 + 1 bug 全确认修完；本轮新发现 3 条修复边界 P1 已修复，仍剩 2 条 commit/ledger P1 + 2 条 P2。

## 2026-06-07 follow-up 修复

| 项 | 状态 | 证据 |
| --- | --- | --- |
| P1-A current authority union 校验 | ✅ 已修 | `StateStore.assertLeafInventory` 校验 `valid: boolean`；`StateStore.assertProjections` 校验 `status ∈ active/removed/blocked`；legacy projection 非法 status 迁移为 `active` |
| P1-B committing 卡死 | ✅ 已修 | `pruneImportPreparationCache` 对 `committing` 记录增加 5 分钟 abandoned 回收 |
| P1-C orphan virtual recovery | ✅ 已修 | `StateMigrationOptions.tolerateOrphanSources` + CLI `--tolerate-orphans` + bridge payload `tolerateOrphanSources` |

验证：
- `npm run test --workspace @skill-flow/storage -- src/tests/state-store.test.ts src/tests/import-preparation-cache.test.ts` → 25 passed
- `npm run test --workspace @skill-flow/core-engine -- src/tests/state-migration-service.test.ts` → 19 passed
- `npm run test --workspace skill-flow -- src/tests/state-migration-cli.test.ts src/tests/bridge-command.test.ts` → 42 passed

## 修复确认（06 文档 6+1 条）

| 修复点 | 位置 | 状态 |
| --- | --- | --- |
| P1-3 `valid: leaf.valid ?? true` | `state-migration-service.ts:765` | ✅ |
| P1-4 `status: typeof projection.status === "string" ? : "active"` | `state-migration-service.ts:832` | ✅ |
| P1-5 `if (record.status === "committing")` 显式分支 | `import-preparation-service.ts:314` | ✅ |
| P1-2 orphan virtual 抛 `legacySourceOrphaned` | `state-migration-service.ts:470-472` | ✅ |
| P1-1 `VIRTUAL_*` → `COLLECTION_*` 错误码 | `runtime.ts` 全清 | ✅ |
| `homeSourceType` 漏 github bug | `MainViewModel.swift:1380+` | ✅ |
| 负向断言 | 6 P1 fix 全有真实 fs.spyOn 负向测试 | ✅ |

## 第 3 轮新发现：P1（修复边界 / 修复引入）

### P1-A P1-3/P1-4 修复的边界——`typeof` 检查不是 union 校验
- File: `state-migration-service.ts:645, 765, 832`
- Problem: V1 leaf `valid: 0`（number）/ `"false"`（string）走非 boolean 分支变 `undefined` → `?? true` 默认成 `true`；V1 projection `status: "PENDING"`（任意 string）会被原样保留到 V2，但 V2 union 是 `active | removed | blocked`，下游 `=== "active"` 过滤会静默漏掉。
- Risk: 与 P1-3/4 修复的"silent data loss"同类，但更窄（malformed V1 数据）；`assertLeafInventory:507` 与 `assertProjections:523`（state-store.ts）都不验证 union 成员。
- Fix: `assertLeafInventory` 加 `valid: boolean` 检查；`assertProjections` 加 `status` ∈ union 检查；或降级为 diagnostics 不写入 V2。

### P1-B P1-5 修复引入——committing 卡死
- File: `import-preparation-service.ts:314-321` + `import-preparation-cache.ts:52`
- Problem: 修复后 `committing` 记录被 `pruneImportPreparationCache:52` 永远保留（绕过 24h TTL），commit 中途进程崩溃时该记录无人清理。`prepareImportSource` 直接返回 failed，`cacheKey` 永久卡死，需手动删 `catalog/import-preparations/<id>/`。
- Risk: 用户 kill 进程后无 self-recovery。
- Fix: 给 committing 加 wall-clock stale-after-write（5 分钟）；或加 "abandoned preparation cleanup" 工具。

### P1-C P1-2 修复——orphan 抛错无 user recovery
- File: `state-migration-service.ts:470-472` + `state-migration-command.ts:36-80`
- Problem: 从 "silent drop" 切到 "hard throw"，但 `StateMigrationOptions`（line 60-64）只有 `dryRun/backup`，无 `--tolerate-orphans`；CLI `runMigrateStateCli`（line 36）也不接受 force flag。
- Risk: 手工编辑过 manifest.json 残留的 V1 用户硬失败，无 escape hatch。
- Fix: `StateMigrationOptions.tolerateOrphanSources?: boolean` + CLI `--tolerate-orphans`；或 diagnostic 中给 actionable 提示。

## 第 3 轮新发现：P1（commit / ledger 卫生）

### P1-D 102 文件巨型 working tree，04 推荐 4 笔 split 未落地
- File: `git status` 102 files, 3678+/10978- 改 + 39 untracked
- Problem: `04-final-change-list.md:236-242` 明确推荐 split（authority → bridge → redundant field → docs），但实际未拆。
- Risk: 巨型 commit 难回滚、blame 丢失、code review 不可分块。
- Fix: 按 04 推荐顺序拆 4 笔；或先 commit docs/plans 再分批 code。

### P1-E Plan ledger 22 个未勾 checkbox 跟实际不一致
- File: `00-current-execution-plan.md:93-1053`
- Problem: Task 1（10 步）/ Task 2（9 步）/ Task 4（3 步）全 unchecked，但对应实现已落（`state-migration-service.ts:963-1017` 含 transactionRoot+backupRoot；`projection-ledger.ts` 重写；`state-v2-view.ts` 已删；`workflow-service.ts` 已删）。
- Risk: 文档"未完成"语义和"实际已合入"不一致。
- Fix: 同步勾选 Task 1/2/4 全部 step；或加注 `[x] (verified 2026-06-07)`。

## P2（次轮清理）

### P2-A CHANGELOG / README 未同步 v1.3.12 cleanup
- File: `CHANGELOG.md:5` 仍 v1.3.11；`README*.md` 无 "v2 cleanup"
- Risk: 涉及 `VIRTUAL_* → COLLECTION_*` breaking，升级用户遇 6 处错误码消失无预警。
- Fix: 提交前补 `## v1.3.12` + `releases/RELEASE_v1.3.12.md`，列 breaking change。

### P2-B `createSourceRevision` 缺 assertNever
- File: `source-authority-service.ts:604-622`
- Risk: 新增 SOURCE_KINDS 元素会静默 `undefined`；`04-source-revision-decision.md` 已记录。
- Fix: 接受本批推下批；下次 SOURCE_KINDS 扩展前补 `assertNever(provider)`。

## 6 角色 "可推下批" 项风险再评估

| 项 | 真实风险 |
| --- | --- |
| `managedProjections` 死别名（projection-ledger.ts:31） | **0 风险**（全文 0 引用） |
| `createSourceRevision` exhaustive | 已有 decision doc，本批推下批 OK |
| `legacy-agents-lock.ts` 改名 | 35 个 import 纯命名，零行为 |
| `gstack` "virtual team" 营销词 | 纯 Localizable.strings 描述，无风险 |
| `swift test` 工具链 | ✅ 已跑通 471/1/0 |

## Missing Coverage（剩 3 项 deferred + 1 项死测试）

- `createSourceRevision` exhaustive 检查（已 deferred）
- `managedProjections` 静态断言（已 deferred）
- 端到端 V1→migrate→bridge round-trip（已 deferred）
- 死测试 `config-integration.test.ts:322` "tolerates legacy lock without deployments"（V2-only 后无意义，建议删）

## 测试 / 构建 / 工具链基线

- `npm test` → **491 vitest tests / 0 failures**（domain 5 + shared 11 + integration 34 + storage 44 + core-engine 78 + query 150 + tui 10 + cli 159）
- `npm run build` → exit 0
- `cd apps/desktop-mac && swift test` → **471 tests / 1 skipped / 0 failures**（Apple Swift 6.3.2 arm64）

## 本批必修（剩余 2 条 P1）

1. **P1-D**: 拆 working tree 为 4 笔 commit
2. **P1-E**: 同步 plan ledger 22 个未勾 checkbox

## 本批建议修（2 条 P2）

- **P2-A**: CHANGELOG / RELEASE_v1.3.12 同步
- **P2-B**: 接受本批推下批，下批前补 `assertNever`

## 结论

**业务逻辑层闭环**（P0 全修，6 P1 全修，6 负向断言全有，491+471 tests 全过）。

**流程层未闭环**（2 条 commit/ledger P1）—— 提交前需要完成拆分提交和 plan ledger 同步。

**架构层面干净**（6 角色"可推下批"项全部 0 真实风险）。

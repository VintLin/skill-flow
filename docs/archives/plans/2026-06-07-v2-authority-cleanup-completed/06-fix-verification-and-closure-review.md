# Fix Verification & Architect Closure Review

> 配合 `05-multi-agent-audit-result.md` 使用。
> 审计员：基于上一轮 6 角色 subagent 审计的修复结果做验证 + 派架构师 subagent 做闭环分析。

## 总体判断

**Closed for this pass**。V1→V2 schema 语义唯一、authority 写盘原子性、desktop/CLI 边界已闭环。原本批必修 P1 已处理；剩余项为已明确可推下批的命名、死别名和增强型架构检查。

## P0 修复验证

| P0 | 位置 | 修复 | 状态 |
| --- | --- | --- | --- |
| P0-1 | `state-migration-service.ts:926-936` | `replaceCollectionSource` 用 `incomingRoot` + `fs.rename` + `backupRoot` 回滚 | ✅ 已修 |
| P0-2 | `state-migration-service.ts:920-924` | `replaceMigratedState` 包装 + `replaceAuthorityFiles` 用 `transactionRoot` 暂存 + `backupRoot` 回滚 | ✅ 已修 |
| 测试 | `state-migration-service.test.ts:270-340` | 新增 "rolls back authority files when authority replace fails" | ✅ 已加 |

## V2 后缀清理验证

- ✅ `ManifestFileV2` / `LockFileV2` / `PreferencesFileV2` / `StateStoreV2` / `StateMigrationStatus` 等 12+ type 去后缀
- ✅ `SourceAuthorityServiceV2` / `ImportPreparationServiceV2` / `DeploymentPlannerV2` / `DeploymentApplierV2` 去后缀
- ✅ `state-v2-view.ts` / `projection-compat` / `SharedPreferences` / `VirtualGroupRecord` / `legacyAliases` 全部下线
- ✅ 文件名 `state-store-v2.ts` → `state-store.ts` / `state-schema-v2.ts` → `state-schema.ts` 等

## 本批 P1 修复状态

| 序 | 位置 | 严重度 | 状态 |
| --- | --- | --- | --- |
| **P1-3** | `state-migration-service.ts:760` `valid: true` 硬编码 | **HIGH** silent data loss | 已修 |
| **P1-4** | `state-migration-service.ts:826` `status: projection.status`（undefined → JSON drop） | **HIGH** silent field loss | 已修 |
| **P1-5** | `import-preparation-service.ts:314` `committing` 记录被 delete 兜底 | MEDIUM 并发安全 | 已修 |
| **P1-2** | `state-migration-service.ts:541-543` 孤儿 `kind: "virtual"` source 静默 drop | MEDIUM 静默丢数据 | 已修 |
| P1-1 | `runtime.ts:813, 819, 837, 950, 990, 5220` `VIRTUAL_GROUP_*` 错误码 6 处 | MEDIUM 语义回潮 | 已修 |
| P1-6 | `projection-ledger.ts:31` `export const managedProjections` 死别名 | LOW | 推下批 |

## 架构师新发现（不在原 P0/P1 列表）

1. **`MainViewModel.swift:1383, 1619` `homeSourceType` 真 bug** — `["local", "path", "filesystem"]` 含 dead `"path"/"filesystem"`，且漏 `"github"`。当前 github kind 卡片只能靠 `github.com` 启发式兜底，脆弱。已修并加 MainViewModelCollectionTests 正断言。
2. **`createSourceRevision` (`source-authority-service.ts:604-622`) 缺 exhaustive check** — TypeScript 不强制，新增 `SourceKind` 变体会静默返回 `undefined`。需 `assertNever(provider)` 或判别联合收紧。
3. **`legacy-agents-lock.ts` 命名误导** — 被 `runtime.ts:147` 跟 `workspace-bootstrap-service.ts:15` 引用（实为 Codex skill lock interop，非 migration 边界）。建议改名 `codex-skill-lock-interop.ts`。
4. **测试死角** — `state-migration-service.test.ts:130-140` 不验 `status`；`collections.test.ts` 全 happy path，孤儿 V1 group / `valid: false` / missing `status` 均无负向断言。
5. **Plan ledger-hygiene** — `00-current-execution-plan.md` 41 未勾 vs 19 勾，跟"完成"语义不符。

## 本批必做完成情况

1. **P1-3**: `valid: leaf.valid ?? true`（V1 `valid: false` 保留）— 已完成
2. **P1-4**: `status: typeof projection.status === "string" ? projection.status : "active"` — 已完成
3. **P1-5**: `committing` 分支 return 错误，不 delete — 已完成
4. **P1-2**: 加 `legacySourceOrphaned` diagnostic — 已完成
5. **P1-1**: 6 处 `VIRTUAL_*` → `COLLECTION_*` — 已完成
6. **负向测试**: orphan virtual / legacy `valid: false` / missing `status` / `committing` race — 已完成
7. **bug fix**: `MainViewModel.swift:1383, 1619` `homeSourceType` 加 `"github"`, 删 dead `"path"/"filesystem"` — 已完成

## 可推下批

- **P1-6** `managedProjections` 死别名删
- `createSourceRevision` exhaustive check
- `legacy-agents-lock.ts` 改名
- P2 全部（schema 角色 A 标记：`state-schema-v2.test.ts` 文件名 / dist 残留 / normalizeLockFile 写盘侧 defensive；角色 B 标记：`RuntimeLockView` 死类型 / fixture 残留字段 / 死测试；角色 C 标记：`SourceCheckoutLock` V1 字段命名 / `sourceLockById` 命名误导）
- `gstack` 三语种 `"virtual team"` 营销词（产品口径）
- Plan ledger 修整

## 缺失的 Plan 文档

| 缺失 | 类型 | 优先级 |
| --- | --- | --- |
| `04-architect-review-and-closure-checklist.md` 本批对应版 | 闭环清单 | 已加 |
| `04-source-revision-decision.md` | `createSourceRevision` exhaustive + SOURCE_KINDS 扩展机制 | 已加 |
| `06-error-code-naming-decision.md` | `VIRTUAL_* → COLLECTION_*` breaking 影响面 | 已加 |
| `07-test-coverage-matrix.md` | 12 项测试缺口按 P0/P1/P2 归类 | 已加 |

## 验证命令（执行用）

```bash
cd /Users/Vint/.config/superpowers/worktrees/01_skill-flow/import-preparation-cache
npm run build
npm test
cd apps/desktop-mac && swift test
```

预期：0 failure（允许 1 个 skip 跟 audit 时一致）。本批修完 6 条 P1 后已重跑；当前桌面测试数字为 471 tests / 1 skipped / 0 failures。

## 修复记录

### 2026-06-07 本批 P1 和 closure 文档

- `packages/core-engine/src/services/state-migration-service.ts`
  - 保留 legacy leaf `valid: false`。
  - legacy projection 缺 `status` 时迁移为 `"active"`。
  - legacy `kind: "virtual"` source 缺少对应 virtual group 时抛 `STATE_MIGRATION_LEGACY_SOURCE_ORPHANED`，不再静默 drop。
- `packages/core-engine/src/services/import-preparation-service.ts`
  - `committing` preparation 记录返回 `IMPORT_PREPARATION_COMMITTING`，不删除正在提交的记录。
- `packages/query/src/runtime.ts`
  - `VIRTUAL_GROUP_NAME_EMPTY` / `VIRTUAL_GROUP_SKILLS_EMPTY` / `VIRTUAL_GROUP_SKILL_NAME_CONFLICT` 改为 `COLLECTION_*`。
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
  - `github` kind 归类为 remote；删除 `path` / `filesystem` 作为 source kind 的当前分支。
- 新增 / 更新测试：
  - migration: orphan virtual / `valid: false` / missing projection `status`。
  - import preparation: committing race。
  - query collections: `COLLECTION_*` error codes。
  - desktop: github kind remote predicate。
- 补齐 plan 文档：
  - `04-architect-review-and-closure-checklist.md`
  - `04-source-revision-decision.md`
  - `06-error-code-naming-decision.md`
  - `07-test-coverage-matrix.md`
- 已验证：
  - `npm run -w @skill-flow/core-engine test -- src/tests/state-migration-service.test.ts src/tests/import-preparation-service.test.ts`
  - `npm run -w @skill-flow/query test -- src/tests/collections.test.ts`
  - `cd apps/desktop-mac && swift test --filter MainViewModelCollectionTests/testGithubKindCountsAsRemoteHomeSource`
  - `npm run build`
  - `npm test`
  - `cd apps/desktop-mac && swift test`

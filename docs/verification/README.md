# Verification

这里存放当前实现的验证矩阵和测试入口。运行时行为以源码和测试为准；本目录不保存历史验收数字，也不把未实现的计划当作当前事实。

| 文件 | 用途 |
| --- | --- |
| `GROUP_CARD_STATE_MATRIX.md` | macOS 桌面端 `SharedGroupCard` 页面状态矩阵。 |
| `mount-lifecycle-matrix.md` | mount / unmount 生命周期边界场景矩阵。 |

## Test entry points

TypeScript workspace checks:

```bash
npm run build
npm test
```

The root `npm test` runs the seven TypeScript packages and the CLI in dependency order. It does not run the macOS package.

macOS desktop checks:

```bash
cd apps/desktop-mac
swift build
swift test
```

The opt-in real bridge/update E2E is separate from the default desktop suite:

```bash
SKILL_FLOW_RUN_PROGRESS_E2E=1 swift test --filter BulkUpdateProgressE2ETests
```

It uses [`scripts/testing/bulk-update-progress-fixture.mjs`](../../scripts/testing/bulk-update-progress-fixture.mjs) and writes repeatable evidence under `.scratch/issues/bulk-update-per-group-loading/validation/`.

## Test file ownership

TypeScript tests stay with the package whose interface they exercise. The three local `test-helpers.ts` files intentionally differ in sandbox setup and dependencies; they are not a shared test module. Vitest configuration also stays package-local because CLI and package discovery rules are not identical.

Do not record a hand-maintained total test count here. Use the test runner output for the current count, and keep historical counts only in archived acceptance records.


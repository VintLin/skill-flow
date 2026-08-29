# Contracts

本目录索引外部契约的事实源位置。不要在这里复制 TypeScript 类型正文；契约正文以源码和测试为准。

## Bridge Protocol

| 项 | 位置 |
| --- | --- |
| Protocol version | `packages/shared-types/src/protocol.ts` |
| Request / response types | `packages/shared-types/src/protocol.ts` |
| Protocol parser tests | `packages/shared-types/src/tests/protocol.test.ts` |
| CLI bridge entry | `apps/cli/src/cli.tsx` |
| CLI bridge handlers | `apps/cli/src/bridge-command.ts` |
| Desktop bridge models | `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift` |
| Desktop bridge client | `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift` |
| Cross-language command fixture | `packages/shared-types/src/fixtures/bridge-command-catalog.json` |
| Desktop catalog tests | `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeProtocolCatalogTests.swift` |

Current protocol version: `1.0`.

Current command names:

```text
bootstrap
list
inspect-state-migration
migrate-state
inspect
inspect-enrichment
search-import-groups
scan-local-import-groups
prepare-import-source
preview-import-source
commit-import-source
import-source
toggle-pin
rename-source
create-collection
merge-groups
restore-collection-sources
doctor
adopt-external-source
configure-external-source
external-status
external-update
add
apply
update
uninstall
save-settings
```

Bridge changes are external changes. Update parser tests, CLI bridge behavior, desktop bridge models, and release/user docs when changing this surface.

`bootstrap` 返回桌面首屏所需的读取模型：工作流摘要、草稿、项目范围、设置与缓存的卡片补充数据。权威状态 `manifest`、`lockFile` 和诊断报告不进入首屏响应，避免随技能清单规模放大启动负载；需要权威状态或诊断时应使用对应的查询或命令。

Desktop helper execution is always time-bounded. Ordinary commands use 60
seconds, import/add commands use 5 minutes, and managed update scales by the
number of explicitly selected sources at 5 minutes each with a 15-minute
ceiling. Update-all uses the 15-minute ceiling. These budgets are desktop
process behavior and do not change the protocol payload shape.

When adding, removing, or renaming a bridge command:

1. Update `BRIDGE_COMMAND_NAMES` in `packages/shared-types/src/protocol.ts`.
2. Update the golden fixture in `packages/shared-types/src/fixtures/bridge-command-catalog.json`.
3. Update the CLI handler table in `apps/cli/src/bridge-command.ts`.
4. Update `BridgeCommand` in `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`.
5. Update `BridgeCommand.usesExtendedNetworkTimeout` when the command should use the extended desktop helper timeout.
6. Run the TypeScript protocol tests, CLI bridge tests, and Swift bridge catalog tests.

## State Files

| 文件 | 用途 |
| --- | --- |
| `manifest.json` | User intent: sources, selected skills, enabled targets, display state. |
| `lock.json` | Resolved state: inventory snapshots, projections, source metadata. |
| `preferences.json` | Local preferences, target overrides, desktop-facing settings. |
| `recovery/active.json` | Internal compensation journal for one interrupted managed Update or final Import; not authority and never resumed as queued work. |

State compatibility is implemented in `packages/storage` and domain types live in `packages/domain`.

State shape changes are external changes. Add storage/domain tests and migration or normalizer coverage.

The recovery journal has structural and semantic validation and must be
recovered before bootstrap prunes missing checkouts. It records source kind,
checkout/source ownership, and target IDs. Recovery re-detects current target
roots and validates the entire authority snapshot and every path before any
fingerprint, cleanup, or restore. Invalid structure returns
`RECOVERY_JOURNAL_INVALID`; invalid path ownership returns
`RECOVERY_PATH_OWNERSHIP_INVALID`. Neither supplies filesystem paths to cleanup
logic. Migration under the schema-independent mutation lock recovers current
V2 state first, rejects V1 plus an active journal, and leaves dry-run read-only.

External sources use `ownership: "external"` in manifest/lock state. Their
paths are observation-only: they cannot receive target bindings, managed
updates, or repair operations. `external-update` requires
`confirmExternalUpdate: true` and runs only a locally configured executable
delegate.

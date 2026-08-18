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
5. Update `BridgeCommand.usesImportTimeout` when the command should use the import timeout.
6. Run the TypeScript protocol tests, CLI bridge tests, and Swift bridge catalog tests.

## State Files

| 文件 | 用途 |
| --- | --- |
| `manifest.json` | User intent: sources, selected skills, enabled targets, display state. |
| `lock.json` | Resolved state: inventory snapshots, projections, source metadata. |
| `preferences.json` | Local preferences, target overrides, desktop-facing settings. |

State compatibility is implemented in `packages/storage` and domain types live in `packages/domain`.

State shape changes are external changes. Add storage/domain tests and migration or normalizer coverage.

External sources use `ownership: "external"` in manifest/lock state. Their
paths are observation-only: they cannot receive target bindings, managed
updates, or repair operations. `external-update` requires
`confirmExternalUpdate: true` and runs only a locally configured executable
delegate.

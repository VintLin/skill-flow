# Contracts

本目录索引外部契约的事实源位置。不要在这里复制 TypeScript 类型正文；契约正文以源码和测试为准。

## Bridge Protocol

| 项 | 位置 |
| --- | --- |
| Protocol version | `packages/shared-types/src/protocol.ts` |
| Request / response types | `packages/shared-types/src/protocol.ts` |
| Protocol parser tests | `packages/shared-types/src/tests/protocol.test.ts` |
| CLI bridge entry | `apps/cli/src/cli.tsx` |
| Desktop bridge models | `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift` |
| Desktop bridge client | `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift` |

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
add
apply
update
uninstall
save-settings
```

Bridge changes are external changes. Update parser tests, CLI bridge behavior, desktop bridge models, and release/user docs when changing this surface.

## State Files

| 文件 | 用途 |
| --- | --- |
| `manifest.json` | User intent: sources, selected skills, enabled targets, display state. |
| `lock.json` | Resolved state: inventory snapshots, projections, source metadata. |
| `preferences.json` | Local preferences, target overrides, desktop-facing settings. |

State compatibility is implemented in `packages/storage` and domain types live in `packages/domain`.

State shape changes are external changes. Add storage/domain tests and migration or normalizer coverage.


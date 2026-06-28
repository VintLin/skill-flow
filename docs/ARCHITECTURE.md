# Architecture

Skill Flow 是 TypeScript monorepo 加 macOS SwiftUI desktop 的单仓项目。核心原则是：状态文件是权威源，target 目录是投影输出，CLI / TUI / desktop 共享同一套 query runtime。

## Layering

```text
apps/cli
apps/desktop-mac
packages/tui
        |
        v
packages/query
        |
        v
packages/core-engine
        |
        +--> packages/storage
        +--> packages/integration
        +--> packages/domain

packages/shared-types  <--> bridge protocol users
```

## Package Roles

| 包 | 职责 |
| --- | --- |
| `packages/domain` | 领域模型、source kind、projection 纯逻辑。 |
| `packages/shared-types` | bridge protocol request/response 类型和解析。 |
| `packages/integration` | Git/GitHub/skills.sh/source locator/target adapter 等外部集成。 |
| `packages/storage` | 状态根、manifest、lock、preferences、cache 读写。 |
| `packages/core-engine` | source service、inventory、deployment planner/applier、doctor、migration。 |
| `packages/query` | 面向 CLI/TUI/desktop 的 runtime facade 和工作流编排。 |
| `packages/tui` | Ink add/config/find 交互 UI。 |
| `apps/cli` | 用户 CLI 和 `bridge --json` 入口。 |
| `apps/desktop-mac` | SwiftUI desktop shell、menu bar、bridge client、视图状态。 |

## State Model

默认状态根：

```text
~/.skillflow
```

权威文件：

```text
manifest.json
lock.json
preferences.json
source/*
```

可重建 cache：

```text
catalog/*
```

部署输出：

```text
~/.claude/skills
~/.codex/skills
其他 agent target 目录
```

Target 目录不参与权威状态重建。修复流程只能根据 `manifest` / `lock` 重新投影或清理。

## Runtime Flow

```text
User command / Desktop action
  -> query runtime
  -> core-engine service
  -> storage + integration
  -> updated state and target projections
```

桌面端不直接写 `~/.skillflow`，而是通过 bridge 命令调用 CLI runtime。共享协议入口见 [contracts/README.md](contracts/README.md)。

## External Contracts

稳定边界：

- CLI command surface。
- bridge protocol shape。
- state file shape。
- desktop release artifact behavior。

内部边界：

- package 间类型和服务可以随仓库直接演进。
- 不为内部旧调用新增 alias、shim 或 adapter。

## Verification

根验证：

```bash
npm run build
npm test
```

桌面验证：

```bash
cd apps/desktop-mac
swift test
```

专题验证矩阵见 [verification/README.md](verification/README.md)。


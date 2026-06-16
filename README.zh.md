# Skill Flow

<div align="center">

将散落的 AI agent skill 整合为有序工作流。

[English](./README.md) · [日本語](./README.ja.md)

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-43853d?style=flat-square)](https://nodejs.org)
[![npm Version](https://img.shields.io/npm/v/skill-flow?style=flat-square)](https://www.npmjs.com/package/skill-flow)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](./LICENSE)

<img src="./img/img-icon.png" alt="Skill Flow 图标" width="120" />

</div>

在所有主流编码 agent 中安装、管理和共享 skill —— Claude Code、Cursor、Copilot、Trae、ZCode 等。

从 skills.sh、GitHub 或本地来源搜索并导入 skill。一次部署到多个 agent。保持一切井然有序且及时更新。

![Skill Flow 桌面总览](./img/img-home.png)

## 为什么要做这个

逐个安装 skill 在规模化后会崩溃：

- 仓库包含多个相关 skill，但你分别安装它们
- 不同 agent 期望不同的位置
- 更新会悄悄漂移
- 未管理的目录不断累积
- 没人追踪实际部署了什么

`skill-flow` 保留了工作流分组。一个 source 始终是一个内聚单元——检查它、选择 skill、部署到多个目标、干净地更新，并始终了解你的状态。

## 当前能力

- **分组化 source 管理**：本地、Git、skills.sh 统一走同一套导入模型。
- **多 agent 部署**：把同一组选中的 skill 部署到 Claude Code、Codex、Cursor、Gemini CLI、OpenCode、OpenClaw、Hermes Agent、MiniMax Code、Trae、Windsurf、ZCode 等目标。
- **交互式配置流程**：基于 Ink 的 add/config/find TUI，覆盖选择、审阅和修复流程。
- **macOS 15+ 桌面应用**：SwiftUI 主窗口、导入页、详情页、设置页和菜单栏快速配置。
- **显式状态**：`manifest.json` 记录意图，`lock.json` 记录实际 inventory 与 deployment。
- **Bridge 协议**：通过 `skill-flow bridge --json` 提供机器可读入口。
- **修复与诊断**：`doctor`、`repair-source`、`repair-state`、`repair-targets` 负责处理最容易坏掉的地方。

## 界面预览

| 菜单栏 | 导入页 |
| --- | --- |
| ![菜单栏快速配置](./img/img-menu.png) | ![导入页](./img/img-import.png) |

| 详情页 | 设置页 |
| --- | --- |
| ![详情页](./img/img-detail.png) | ![设置页](./img/img-setting.png) |

## 快速开始

### 安装

```bash
npm install -g skill-flow
skill-flow --help
```

也可以不全局安装，直接运行：

```bash
npx skill-flow --help
```

### 桌面端前置依赖

Skill Flow Desktop release 构建会内置用于 desktop helper 和 skills.sh 导入的原生 Node.js/npm/npx 工具链，因此双击启动不再依赖 `asdf` 或 `nvm` 写入 shell 的 Node 路径。

- 导入非 GitHub Git source 需要 `git`

开发构建和损坏的 release bundle 仍会 fallback 到系统 Node.js 20 或更高版本及 npm/npx。如果桌面应用检测到依赖缺失，会直接提示可执行的错误信息，并引导回本节处理。

### 常见使用流程

```bash
# 添加一个 source
skill-flow add garrytan/gstack

# 查看当前 workflow group
skill-flow list

# 打开交互式配置 UI
skill-flow config

# 搜索本地技能、内置目录和 skills.sh
skill-flow find browser

# 更新单个 source 或全部 source
skill-flow update garrytan-gstack
skill-flow update --all

# 诊断漂移和坏掉的部署
skill-flow doctor
```

### 机器桥接入口

桌面端和辅助工具通过版本化 JSON 协议调用 CLI：

```bash
printf '%s' '{"protocolVersion":"1.0","command":"list"}' | skill-flow bridge --json
```

## 支持的来源

`skill-flow add <source>` 目前支持：

- 本地目录
- `owner/repo` GitHub 简写
- 完整 HTTPS Git URL
- SSH Git URL
- GitHub tree URL
- `clawhub:<slug>[@version]`

示例：

```bash
skill-flow add ~/code/my-skills
skill-flow add garrytan/gstack
skill-flow add https://github.com/garrytan/gstack.git
skill-flow add git@github.com:garrytan/gstack.git
skill-flow add https://github.com/garrytan/gstack/tree/main/skills
skill-flow add clawhub:example/skill-pack
skill-flow add clawhub:example/skill-pack@1.2.3
```

如果仓库很大，但默认只想从某个子目录开始预选，可以加 `--path <repoSubpath>`。

## 支持的目标 Agent

当前内置目标：

- Claude Code
- Codex
- Cursor
- GitHub Copilot
- Gemini CLI
- OpenCode
- OpenClaw
- Hermes Agent
- MiniMax Code
- Pi
- Trae
- Windsurf
- Roo Code
- Cline
- Amp
- Kiro
- ZCode

目标路径可以通过 `SKILL_FLOW_TARGET_*` 环境变量覆盖。

## 命令总览

| 命令 | 作用 |
| --- | --- |
| `add <source>` | 导入 source，并选择 skill 与目标 |
| `list` | 查看 workflow group 和当前健康状态 |
| `find <query>` / `search <query>` | 搜索本地技能、内置 Git 目录与 skills.sh |
| `config` | 打开交互式配置 UI |
| `update [sourceId] --all` | 更新单个或全部已注册 source |
| `doctor` | 诊断漂移、缺失路径和投影问题 |
| `migrate-state --to v2 [--dry-run]` | 检查或迁移本地状态目录到 schema v2 |
| `repair-source [sourceId] --all` | 修复 source checkout 元数据 |
| `repair-state [sourceId] --all` | 重建 source 侧状态 |
| `repair-targets [sourceId] --all` | 修复目标部署内容 |
| `uninstall <sourceIds...>` | 移除 group 及其部署 |
| `bridge --json` | 执行机器协议请求 |

## 状态如何组织

`skill-flow` 默认把状态放在 `~/.skillflow/`：

- `manifest.json`：你想要什么
- `lock.json`：系统实际装成了什么
- `source/local/*`：本地导入或接管的外部 source
- `source/git/*`：Git source 缓存
- `source/clawhub/*`：skills.sh source 缓存
- `catalog/git/*`：内置 Git catalog 缓存

目标目录只是部署结果，不是真正的事实源。

### 状态 schema 迁移

迁移前先 dry-run：

```bash
skill-flow migrate-state --to v2 --dry-run
skill-flow migrate-state --to v2
SKILL_FLOW_STATE_ROOT=/custom/path skill-flow migrate-state --to v2
```

默认状态目录是 `~/.skillflow/`。正常迁移会创建 `<stateRoot>.backup-YYYYMMDD-HHMMSS` 备份，重写权威状态文件，并清理 `catalog/` 下可重建的 cache；cache 会在后续 CLI 或桌面读取时重建。目标目录不是权威来源，不要用目标目录反推状态。迁移后如果目标目录看起来过期，运行 `skill-flow repair-targets --all`。

回滚时先停止 Skill Flow，把备份状态目录移回原位置，再运行 `skill-flow migrate-state --to v2 --dry-run` 或通过桌面迁移状态检查确认后重新迁移。

## Monorepo 结构

- `apps/cli`：对外发布的 npm CLI 包
- `apps/desktop-mac`：macOS 15+ SwiftUI 桌面应用
- `packages/domain`：领域模型和核心类型
- `packages/storage`：manifest/lock/preferences/cache 持久化
- `packages/integration`：Git、GitHub、skills.sh、路径与命名集成
- `packages/core-engine`：inventory、deployment、doctor、bootstrap 等服务
- `packages/query`：共享运行时与 bridge 编排
- `packages/shared-types`：bridge 协议类型
- `packages/tui`：Ink add/find/config UI
- `docs`：架构、贡献指南、参考资料、计划与打包文档

## 开发

```bash
npm install
npm run build
npm test
```

CLI 开发调试：

```bash
npm run -w skill-flow dev -- --help
```

桌面端开发调试：

```bash
npm run build
cd apps/desktop-mac
swift build
swift test
```

让桌面端使用本地 CLI 构建产物：

```bash
export SKILL_FLOW_DESKTOP_HELPER_OVERRIDE=/absolute/path/to/apps/cli/dist/cli.js
```

## 文档入口

- [架构文档](./docs/ARCHITECTURE.md)
- [贡献指南](./docs/CONTRIBUTING.md)
- [文档索引](./docs/README.md)
- [CLI 参考](./docs/references/REF_00_cli-commands.md)
- [桌面打包参考](./docs/references/REF_09_desktop-packaging.md)
- [v1.3.7 发布说明](./releases/RELEASE_v1.3.7.md)

## 许可证

Apache License 2.0。见 [LICENSE](./LICENSE)。

# Project Structure

本文件记录当前仓库真实结构和路径职责。创建、移动、删除项目级目录前先更新这里。

```text
.
├── AGENTS.md                 # agent 协作规则
├── PROJECT_STRUCTURE.md      # 当前结构事实源
├── CHANGELOG.md              # 用户可见变更记录
├── README.md                 # 英文用户入口
├── README.zh.md              # 中文用户入口
├── README.ja.md              # 日文用户入口
├── docs/                     # 当前文档入口；历史材料在 docs/archives/
├── apps/
│   ├── cli/                  # npm 包 skill-flow，CLI 入口
│   └── desktop-mac/          # macOS SwiftUI 桌面端
├── packages/
│   ├── domain/               # 领域模型、投影规则、核心类型
│   ├── shared-types/         # bridge 机器协议共享类型
│   ├── integration/          # Git、GitHub、skills.sh、target adapter、路径工具
│   ├── storage/              # manifest、lock、preferences、cache 持久化
│   ├── core-engine/          # inventory、source、deployment、doctor、migration 服务
│   ├── query/                # CLI/TUI/desktop 共用 runtime 和编排入口
│   └── tui/                  # Ink 交互界面
├── releases/                 # 版本发布说明
├── scripts/release/          # 发布、打包、校验脚本
├── skills/skill-flow/        # skill-flow 自身 skill 定义
├── img/                      # README 图片资源
├── logs/                     # 本地日志，默认不作为事实源
└── dist/                     # 构建产物，默认不作为事实源
```

## Workspace 边界

根 `package.json` 只声明两个 npm workspace 范围：

- `apps/*`
- `packages/*`

`packages/bridge` 和 `packages/core` 当前没有 `package.json`，只看到产物目录；不得当作活跃 workspace 入口新增依赖。

## 文档边界

`docs/` 是真实目录，不是符号链接。当前文档入口见 [docs/README.md](docs/README.md)。

工作中的问题和方案默认写入 `.scratch/issues/<topic>/`。

稳定结论进入 `docs/` 的既有分类；完成或废弃的规格、计划、验收和研究资料归档到 `docs/archives/`。

不要重新创建 `docs/plan`、`docs/plans`、`docs/specs` 这类平行目录。

## 验证入口

根命令：

```bash
npm run build
npm test
```

桌面端：

```bash
cd apps/desktop-mac
swift build
swift test
```


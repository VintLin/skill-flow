# AGENTS.md

本文件定义 `skill-flow` 仓库内 agent 的默认协作规则。除非用户明确要求相反，否则按本文执行。

## 1. 目标与边界

- 目标：以最小必要改动完成当前任务，优先保证 CLI、核心状态管理、TUI 和桌面桥接行为一致。（聚体根据情况，若当前出现整体架构问题，请进行完整梳理后大刀阔斧重构）
- 边界：这是单仓 monorepo，内部改动默认直接演进，不为仓库内部调用保留兼容层。
- 对外变更：凡涉及 CLI 命令、配置文件格式、bridge 协议、桌面打包产物的行为变化，都按外部变更处理，必须补测试和必要文档。

## 2. 仓库结构

```text
.
├── apps
│   ├── cli
│   └── desktop-mac
├── packages
│   ├── core-engine
│   ├── domain
│   ├── integration
│   ├── query
│   ├── shared-types
│   ├── storage
│   └── tui
├── docs
├── releases
├── scripts
├── README.md
├── README.zh.md
└── package.json
```

- `apps/cli`：发布到 npm 的 CLI 入口。
- `apps/desktop-mac`：macOS 桌面壳与相关测试，活动源码位于 `Sources/DesktopApp`，旧 GUI 参考位于 `Sources/Deprecated/SkillFlowDesktop`。
- `packages/domain`：领域模型与核心类型定义。
- `packages/storage`：状态存储、缓存与本地持久化。
- `packages/integration`：Git、GitHub、ClawHub、CLI 等外部集成与解析逻辑。
- `packages/core-engine`：部署、库存、诊断、工作流编排等核心服务。
- `packages/query`：CLI / TUI / desktop 共享的查询与运行时入口。
- `packages/tui`：Ink 交互界面。
- `packages/shared-types`：跨包共享协议与类型。
- `docs`：设计、架构、计划、参考资料。当前仓库内该目录可能是符号链接，修改前先确认目标路径。
- `releases`：版本发布说明。
- `scripts/release`：桌面构建和打包脚本。

## 3. 默认工作方式

1. 先确认改动落在哪个包，避免跨 `apps/*` 和 `packages/*` 无关扩散。
2. 先写测试清单，再实现；修 bug、改命令行为、改协议时不得跳过测试。
3. 内部代码直接替换旧实现，不新增 alias、shim、adapter。
4. 只在真实复用已经出现时提取抽象，避免为假想场景预埋结构。
5. 改完一个独立逻辑单元就提交，不把重构、行为修改、格式化混在同一个 commit。

## 4. 初始化检查

收到 `/init` 或等价请求时，默认执行以下检查：

1. 用树状图列出当前项目路径，默认深度 3，并过滤 `.git`、`node_modules`、`dist`、`build`、`coverage`、`.next`、`.turbo`、`.cache`。
2. 标记 monorepo 关键入口：`apps/*`、`packages/*`、`docs`、`scripts`。
3. 如任务即将涉及文档，先确认 `docs` 是否为符号链接，避免误以为是普通目录。

## 5. 测试与验证

- 根命令：
  - `npm run build`
  - `npm test`
- 单包开发时优先运行最小必要范围的测试，不默认全量重跑。
- CLI 改动至少覆盖命令入口或集成路径。
- `packages/query`、`packages/core-engine`、`packages/storage` 改动优先补单元测试和状态/投影相关回归测试。
- TUI 改动除测试外，应尽量验证真实交互入口。
- bridge 机器协议或 `packages/shared-types` 改动必须检查协议兼容性与调用方影响。

## 6. 文档更新规则

- 只有外部使用方式、约定、发布内容改变时才更新文档。
- 修改文档时直接更新最终结论，不追加过程性说明。
- 涉及发布面的改动，优先检查 `README.md`、`README.zh.md`、`docs/ARCHITECTURE.md`、`releases/` 是否需要同步。

## 7. 禁止事项

- 不顺手修复与当前任务无关的问题。
- 不为了“可能以后会用到”引入兼容层或额外抽象。
- 不在未确认影响面的情况下修改 CLI 对外行为或 bridge 协议。
- 不忽略 `docs` 可能是符号链接这一事实直接大范围改文档。

一句话准则：先定边界，先列测试，最小改动，内部直接演进，改完立即验证。

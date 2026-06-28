# Product

Skill Flow 用来把分散在不同来源的 AI agent skills 管理成可检查、可选择、可部署、可更新的 workflow group。

## 定位

用户导入一个 source，Skill Flow 解析其中的 skills，记录用户想启用的内容，再把选中的 skills 投影到多个 agent target。

目标不是替代 agent 本身，也不是成为通用插件市场；目标是管理本地技能来源、选择状态、部署结果和漂移修复。

## 目标用户

- 同时使用多个 coding agent 的开发者。
- 维护多组技能仓库、团队 skill pack 或本地 skill 集合的人。
- 需要在 CLI、桌面端和自动化脚本中复用同一份 skill 状态的人。

## 核心场景

1. 从本地目录、GitHub/Git URL、GitHub tree URL 或 skills.sh 导入 source。
2. 查看 source 下解析出的 skill group 和 leaf。
3. 选择要启用的 skills 和 agent targets。
4. 将选择状态应用到 Claude Code、Codex、Cursor、Gemini CLI、Copilot 等 target。
5. 更新 source 后检查新增、删除、漂移和投影状态。
6. 通过 `doctor`、`repair-source`、`repair-state`、`repair-targets` 修复状态或部署输出。
7. 桌面端通过 bridge protocol 复用 CLI runtime。

## 当前能力边界

- Source 是权威输入，默认状态根是 `~/.skillflow/`。
- `manifest.json` 记录用户期望状态。
- `lock.json` 记录解析结果、source snapshot 和部署投影。
- Target 目录是生成输出，不是事实源。
- macOS 桌面端依赖 CLI bridge 协议，不另建第二套状态模型。

## 非目标

- 不从 agent target 目录反向重建完整权威状态。
- 不把 cache 当作不可丢失数据。
- 不为仓库内部调用保留兼容层；内部结构可以随版本直接演进。
- 不在没有明确规格时扩展到非 skill 插件资产。相关缺口见 [Issue 8](issues/ISSUE_8_plugin_assets_and_target_routing.md)。

## 发布面

以下变化属于外部可见变更，必须同步测试和必要文档：

- CLI 命令和输出语义。
- `manifest.json`、`lock.json`、`preferences.json` 格式。
- bridge protocol request/response。
- desktop bridge payload 或打包产物行为。
- README、release notes 中承诺的用户流程。


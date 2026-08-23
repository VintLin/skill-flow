# 跨 Agent Skill 使用记录读取调研

日期：2026-08-23  
范围：SkillFlow 内置 target 与用户点名的相邻 agent。本文只做一手资料调研，不代表已实现 collector，也未读取任何用户本机会话。

## 结论摘要

可优先落地的来源分三类：

1. **直接事件优先**：Claude Code OTel、Gemini CLI OTel、Cursor Enterprise OTel、VS Code Copilot OTel、Amp plugin event、Grok Build OTel。这些能把 skill/tool 调用作为运行期事件读取，误报最少。
2. **本地会话解析次之**：Claude Code、Codex、Copilot CLI、Kimi Code、Pi、Hermes、可能的 OpenClaw。它们有本地会话或日志，但格式稳定性差异很大；默认必须 opt-in、按 agent 单独授权目录，并只抽取最小 observation。
3. **仅生命周期或不支持**：Windsurf、Roo/Cline、Kiro、Trae、ZCode、CodeBuddy、WorkBuddy、Minimax Code 等公开资料未确认可稳定读取“skill 被实际调用”。这些只能展示安装、启用、导入、hook 或会话存在，不能显示“0 次使用”这类误导性统计。

建议 SkillFlow 的主计数只纳入 `direct observed` 和经版本化 parser 明确命中的 `local session parser`；安装、同步、导入、更新、启用、hook 触发、普通工具调用都单独作为 `Lifecycle Event`。

## 等级定义

| 等级 | 统计含义 | 可进入主使用次数 |
| --- | --- | --- |
| `direct observed` | 一手事件或 hook 中直接出现 skill/tool 调用，能拿到 skill 名称或调用工具名 | 是 |
| `local session parser` | 本地 transcript/session/log 中能解析出 skill/tool 调用；格式非公开稳定时必须版本化 | 是，标 parser revision |
| `lifecycle only` | 只能证明 skill 安装、启用、导入、同步、hook 触发、会话存在或普通 agent 活动 | 否 |
| `unsupported` | 未找到可读取的公开一手事件、日志或稳定目录证据 | 否 |

## Collector 矩阵

| Agent / target | 一手证据 | 等级 | 建议 collector | 隐私注意事项 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| Claude Code | 官方监控文档说明 Claude Code 通过 OTel 导出 metrics、events、traces，并在 cost/token 事件属性中包含 `skill.name`；官方 session 文档说明 CLI transcript 写入 `~/.claude/projects/<project>/<session-id>.jsonl`，但 entry format 是内部格式、版本间会变 | `direct observed`；备选 `local session parser` | `ClaudeCodeOtelCollector` 优先；`ClaudeCodeSessionJsonlCollector` 只做 opt-in 备选 | OTel 已有第三方 skill 名称脱敏规则；本地 JSONL 含完整对话、工具调用和结果，默认不得扫描 | P0 |
| Codex | OpenAI Learn 文档说明 Codex 支持 standalone skills，CLI/IDE 可用 `/skills` 或 `$` 显式提及，且选中 skill 时读取完整 `SKILL.md`；OpenAI Codex 官方 repo issue 多处确认 `CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`、`session_index.jsonl`、`state_5.sqlite` 等本地状态，但公开文档未承诺 transcript schema | `local session parser`；受控 app-server 可做 `direct observed` | `CodexSessionJsonlCollector`，仅识别明确 skill input / response item；如 SkillFlow 后续嵌入 Codex app-server，再做 direct collector | rollout JSONL 可能包含完整 prompts、tool outputs、reasoning 和路径；只读流式解析，绝不回显原文 | P0 |
| Gemini CLI | 官方 skills 文档说明 Gemini CLI 在匹配 skill 时调用 `activate_skill` tool；官方 OTel 文档说明可本地写 `.gemini/telemetry.log`，日志包含 `gemini_cli.tool_call`、`function_name`、`function_args` | `direct observed` | `GeminiTelemetryCollector`，从 OTLP 或 `.gemini/telemetry.log` 识别 `function_name=activate_skill` | `function_args` 可能含路径或参数；`log_prompts_enabled` 可能记录 prompt，collector 必须字段白名单 | P0 |
| Cursor | Cursor Enterprise OTel Export beta 官方文档说明服务端导出 metrics 和 logs，logs 覆盖 API requests、errors、corrections、skills、hooks、plugins、cloud agent lifecycle；Analytics API 提供团队级使用指标但不是 skill 调用 | `direct observed`，Enterprise beta only | `CursorOtelCollector`，接 OTLP/log stream；不做本地 DB parser | 服务端团队数据，需管理员配置；beta wire surface 可能变 | P1 |
| GitHub Copilot CLI | GitHub 官方 Copilot CLI session data 文档说明每次 CLI session 记录在本机，含 prompts、responses、tools used、modified files；文件位于 `~/.copilot/session-state/`，另有本地 SQLite session store；官方 Copilot CLI skills 文档确认 agent skills | `local session parser` | `CopilotCliSessionCollector`，解析 session-state + SQLite 中的 tool/skill 记录 | 默认会同步到 GitHub 账号；本地记录含 prompts、responses、文件修改详情 | P1 |
| GitHub Copilot / VS Code | VS Code 官方文档说明 Copilot Chat agent interactions 可通过 OTel 导出 traces、metrics、events，覆盖 LLM calls、tool executions、token usage；GitHub metrics API 只适合汇总 adoption/usage | `direct observed` | `VsCodeCopilotOtelCollector` | 需要用户/企业启用 OTel；事件可能包含工具参数或 workspace 元数据 | P1 |
| OpenCode | OpenCode 官方 skills 文档说明 skills 通过 native `skill` tool on-demand 加载；官方 plugin 文档说明插件可 hook events，并可添加 custom tool；CLI 文档说明有 headless server API | `direct observed` if plugin installed；否则 `lifecycle only` | `OpenCodePluginCollector`，由用户安装只读插件监听 `skill` tool call；不默认解析未知会话文件 | 插件直接进入 agent runtime，必须最小权限、只写本地 SkillFlow event sink | P2 |
| OpenClaw | OpenClaw 官方 skills 文档说明 bundled/local skills 与 `SKILL.md`；官方 logging 文档说明 Gateway 写 JSON lines file logs；OpenClaw repo/ClawHub 是一手 skill registry 证据 | `local session parser` 待验证；保守为 `lifecycle only` | 先做 `OpenClawLogProbe` 只读目录发现和 lifecycle；若 JSONL 中出现明确 skill dispatch，再升级 parser | Gateway logs 可能包含消息、工具和渠道信息；需用户指定目录 | P2 |
| Kimi Code | Kimi Code 官方 data locations 文档说明 runtime data 位于 `~/.kimi-code/`，包含 `sessions/`、`session_index.jsonl`、global/session logs、`user-history/<md5(workDir)>.jsonl`；官方 env vars 文档说明可 relocation 和关闭 telemetry；changelog 提到内置 `/check-kimi-code-docs` skill | `local session parser` | `KimiCodeSessionCollector`，只读 `sessions/` 和 `session_index.jsonl`，parser revision 固定到 Kimi Code 版本 | `sessions/` 和 session logs 含对话/诊断；`user-history` 是输入历史，默认不读取 | P2 |
| Amp | Amp manual 说明 agent skills；plugin API 说明可注册 bundled skill，并有 `session.start -> agent.start -> tool.call -> tool.result -> agent.end` 事件链，`tool.call` 在工具运行前触发 | `direct observed` if plugin installed | `AmpPluginCollector`，监听 `tool.call` 中 skill/bundled-skill 工具 | 插件事件可见工具输入；只保留 skill 名称、时间、thread id hash | P2 |
| Pi | Pi 官方 sessions 文档说明 session 自动保存到 `~/.pi/agent/sessions/`，按 working directory 组织，每个 session 是 JSONL tree；skills 文档说明 skills on-demand loaded | `local session parser` | `PiSessionJsonlCollector`，解析 session-format 中明确 tool/skill 节点 | JSONL session 是完整会话树，含 tokens/cost/工具；读取需单独授权 | P2 |
| Hermes Agent | Hermes FAQ 说明不收集 telemetry/analytics，conversations、memory、skills 本地存 `~/.hermes/`；skills 文档说明 skills 主要目录为 `~/.hermes/skills/` | `local session parser`，无 direct telemetry | `HermesLocalCollector`，仅在开源 schema 确认后解析 conversations；第三方 OTel plugin 只作为用户自选 | 本地包含 conversations、memory、skills；不得读取 memory 作为 usage 证据 | P2 |
| Grok Build | xAI 官方 Grok Build 文档说明 TUI、headless scripts/bots、ACP；第三方可观测文档称其有 OTel exporter，但需用 xAI 官方 docs/source 复核事件名；官方 docs 未在本轮确认 skill event 字段 | `direct observed` 待复核；当前 `lifecycle only` | 先做 `GrokBuildOtelProbe`，只接受官方 OTel event/attribute 后升级 | Grok Build 可能涉及仓库快照/上传/trace；默认不读 `~/.grok` 原始日志 | P3 |
| ZCode | ZCode 官方 skill 文档说明可从 Claude Code、Codex CLI、OpenClaw、Augment、Windsurf 导入外部 skill；在聊天中用 `$$skill-name` 调用；侧栏有 Usage Stats 文档入口，但本轮未确认可导出结构化 skill 调用 | `lifecycle only` | `ZCodeUsageStatsProbe`，先只读取导入/启用和官方 usage export（若后续确认） | ZCode 是 ADE，可能含远程 workspace 同步；避免扫描全局历史 | P3 |
| Kiro | Kiro 官方 hooks 文档说明 hooks 可在 session 中 agent 修改文件、调用工具、完成任务时运行 shell command 或 agent prompt；examples 包含 centralized user prompt logging | `direct observed` only if user-created hook captures skill/tool event；默认 `lifecycle only` | `KiroHookCollector`，由用户显式安装 hook，把 tool event 最小化写入 SkillFlow | Hook 可能记录 prompt；默认模板不得保存 prompt 文本 | P3 |
| Roo Code | Roo 官方 settings 文档说明 task history/settings 默认存 VS Code extension storage，可配置 custom storage path；GitHub issue 显示 task history 还涉及 VS Code `state.vscdb`；Roo skills 公开信息多来自社区/issue | `lifecycle only` | `RooStorageProbe` 只探测 task history 位置；不进入主 usage | VS Code global storage 可能混有所有任务内容和 secrets-adjacent state | P3 |
| Cline | Cline 官方 telemetry 文档说明匿名 usage events 覆盖 features/tools/commands、task completion、errors、performance，且不含代码/文件内容；任务历史位置/恢复更多见 GitHub issue，未确认 skill 调用事件 | `lifecycle only` | `ClineTelemetryProbe` 或 task-history parser 暂缓 | 匿名 telemetry 不足以映射 skill 名；task history 含完整任务上下文 | P3 |
| Windsurf / Cascade | Devin/Windsurf Cascade skills 文档说明 skill 可 model decision 或 `@mention` 调用，enterprise system skills 有固定目录；memories 文档仅确认 `~/.codeium/windsurf/memories/`，不是会话/skill usage | `lifecycle only` | `WindsurfSkillInventoryCollector`，只记录可见 skill 目录和启用状态 | 不读取 memories 作为 usage；没有官方会话格式前不解析本地 app data | P4 |
| Trae / Trae CN | Trae 官方 skills 文档说明 skill 是给 agent 的专业能力文档；本轮未找到官方 usage event、本地 session path 或 telemetry schema | `lifecycle only` | `TraeSkillInventoryCollector` | 仅技能库存，不推断使用次数 | P4 |
| CodeBuddy | CodeBuddy 官方 SDK 文档说明可程序化控制 CodeBuddy Agent；本轮未找到官方 skill 使用事件、本地 session path 或 telemetry schema | `unsupported` | 暂不实现；只保留 custom target 支持 | 无证据不扫描 | P4 |
| WorkBuddy | 本轮未找到可核验的一手公开 docs/source 说明 skill、session、telemetry 或 local logs | `unsupported` | 暂不实现 | 无证据不扫描 | P4 |
| Minimax Code / Mini-Agent | MiniMax 官方 Mini-Agent 页面/GitHub 说明 Claude Skills integration 和 detailed logs for request/response/tool execution；但这更像示例 agent 项目，不等同于 SkillFlow `minimax-code` 产品级 target | `local session parser` for Mini-Agent only；目标默认 `unsupported` | `MiniAgentLogCollector` 作为实验性 custom collector；`minimax-code` 保守不做主计数 | logs 可能含请求、响应、工具执行细节 | P4 |

## 实现建议

### 1. 数据模型

建议新增或复用以下字段，不把第三方格式直接泄漏到 domain：

| 字段 | 说明 |
| --- | --- |
| `agent` | SkillFlow `UsageAgent` 或 target id |
| `sourceKind` | `direct-event` / `local-session` / `lifecycle` |
| `evidenceKind` | `skill_activated` / `tool_call` / `explicit_command` / `selected` |
| `rawSkillName` | 第三方原始 skill 名；存储前做长度限制 |
| `projectRef` | cwd/project path hash，不存原始路径 |
| `parserRevision` | `agent@version/parser@version` |
| `sourceEventId` | hash(agent, file identity, offset/event id, parser revision) |

### 2. 默认开关

- 默认只启用 direct event collector；本地 session parser 默认关闭。
- 每个 agent 单独授权，不提供“扫描所有 agent 历史”的总开关。
- 授权界面展示将读取的精确目录、可能包含的数据类型、保留字段、不会保存的字段。
- dry-run 只展示 coverage 和预计 observations 数，不写入 usage store。

### 3. 隐私底线

- 不保存 prompt、assistant response、tool output、tool args、文件内容、绝对路径、凭据、原始错误。
- 不读取 `history`、`memory`、`user-history`、`state.vscdb` 这类非必要来源，除非某 agent 的一手文档明确要求且用户单独授权。
- parser 只做 streaming extraction，处理后丢弃原始记录。
- 任何 parser schema unknown / parse failed 只产出 diagnostic，不产出 0 次使用。

### 4. 优先级路线

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0 | Claude OTel + Claude local parser；Gemini OTel；Codex local parser | 能产出 observed usage，parser 有 revision、offset 和隐私白名单测试 |
| P1 | Cursor Enterprise OTel；GitHub Copilot CLI parser；VS Code Copilot OTel | 无企业配置时显示 unsupported/needs config，不显示 0 |
| P2 | OpenCode plugin；Amp plugin；Kimi/Pi/Hermes parser；OpenClaw probe | plugin collector 有最小事件 schema；parser 默认 opt-in |
| P3 | Kiro hook、ZCode/Grok usage probe、Roo/Cline storage probe | 仅 lifecycle/diagnostic，除非一手事件确认 |
| P4 | Trae、CodeBuddy、WorkBuddy、Minimax Code | 维持 unsupported 或 custom collector，不进入主计数 |

## 参考链接

- Claude Code Monitoring: https://code.claude.com/docs/en/monitoring-usage
- Claude Code Sessions: https://code.claude.com/docs/en/sessions
- OpenAI Build Skills: https://learn.chatgpt.com/docs/build-skills
- OpenAI Codex repo issues, local rollout examples: https://github.com/openai/codex/issues/2288
- OpenAI Codex repo issue, session storage sharing: https://github.com/openai/codex/issues/20864
- Gemini CLI Agent Skills: https://geminicli.com/docs/cli/skills/
- Gemini CLI Telemetry: https://geminicli.com/docs/cli/telemetry/
- Cursor OpenTelemetry Export: https://cursor.com/docs/enterprise/opentelemetry-export
- Cursor Analytics API: https://cursor.com/docs/account/teams/analytics-api
- GitHub Copilot CLI Session Data: https://docs.github.com/en/copilot/concepts/agents/copilot-cli/chronicle
- GitHub Copilot CLI Skills: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
- VS Code Copilot OTel: https://code.visualstudio.com/docs/agents/guides/monitoring-agents
- OpenCode Skills: https://opencode.ai/docs/skills/
- OpenCode Plugins: https://opencode.ai/docs/plugins/
- OpenCode CLI/server: https://opencode.ai/docs/cli/
- OpenClaw Skills: https://docs.openclaw.ai/tools/skills
- OpenClaw Logging: https://docs.openclaw.ai/logging
- Windsurf/Cascade Skills: https://docs.devin.ai/desktop/cascade/skills
- Windsurf/Cascade Memories: https://docs.devin.ai/desktop/cascade/memories
- Roo Code Settings/Storage: https://roocodeinc.github.io/Roo-Code/features/settings-management/
- Cline Telemetry: https://docs.cline.bot/enterprise-solutions/monitoring/telemetry
- Amp Manual: https://ampcode.com/manual
- Amp SDK: https://ampcode.com/manual/sdk
- Kiro Hooks: https://kiro.dev/docs/hooks/
- Kiro Hook Examples: https://kiro.dev/docs/hooks/examples/
- Kimi Code Data Locations: https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/data-locations.html
- Kimi Code Env Vars: https://www.kimi.com/code/docs/en/kimi-code-cli/configuration/env-vars.html
- Pi Sessions: https://pi.dev/docs/latest/sessions
- Pi Skills: https://pi.dev/docs/latest/skills
- ZCode Skill: https://zcode.z.ai/en/docs/skill
- ZCode Agent: https://zcode.z.ai/en/docs/agents
- Grok Build Overview: https://docs.x.ai/build/overview
- Hermes FAQ: https://hermes-agent.nousresearch.com/docs/reference/faq
- Hermes Skills: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills
- MiniMax Mini-Agent: https://platform.minimax.io/docs/token-plan/mini-agent
- MiniMax-AI/Mini-Agent: https://github.com/MiniMax-AI/Mini-Agent
- CodeBuddy Agent SDK: https://www.codebuddy.ai/docs/cli/sdk

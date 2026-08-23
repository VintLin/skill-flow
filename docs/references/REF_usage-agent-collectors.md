# 跨 Agent Skill 使用记录读取调研

日期：2026-08-23；2026-08-24 补充本机字段级验证
范围：SkillFlow 内置 target 与用户点名的相邻 agent。本文记录一手资料调研与本机字段级验证结论；验证过程只读取结构字段和聚合结果，不保存 prompt、response、tool output 或原始路径。

## 结论摘要

可优先落地的来源分三类：

1. **直接事件优先**：Claude Code OTel、Gemini CLI OTel、Cursor Enterprise OTel、VS Code Copilot OTel、Amp plugin event、Grok Build OTel/Hook、CodeBuddy OTel/Hook。这些能把 skill/tool 调用作为运行期事件读取，误报最少。
2. **本地会话解析次之**：Claude Code、Codex、OpenCode、ZCode、Copilot CLI、Kimi Code、Pi、Hermes、可能的 OpenClaw。它们有本地会话或日志，但格式稳定性差异很大；必须标 parser revision，并只抽取最小 observation。
3. **仅生命周期或不支持**：Windsurf、Roo/Cline、Kiro、Trae、WorkBuddy、Minimax Code 等公开资料未确认可稳定读取“skill 被实际调用”。这些只能展示安装、启用、导入、hook 或会话存在，不能显示“0 次使用”这类误导性统计。

建议 SkillFlow 的主计数只纳入 `direct observed` 和经版本化 parser 明确命中的 `local session parser`；安装、同步、导入、更新、启用、hook 触发、普通工具调用都单独作为 `Lifecycle Event`。普通 `toolCalls` 不是 skill 调用；只有 tool 名明确为 `Skill` / `skill` / `activate_skill`，且能取到 skill 名称时才算。

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
| OpenCode | OpenCode 官方 skills 文档说明 skills 通过 native `skill` tool on-demand 加载；本机 SQLite `~/.local/share/opencode/opencode.db` 的 `part.data` 可解析 `type=tool`、`tool=skill`、`state.status=completed`、`state.input.skill/name`、`session.directory` | `local session parser`；plugin 可升级为 `direct observed` | `OpenCodeSqliteCollector` 只读 SQLite completed skill parts；插件 collector 作为后续增强 | SQLite 属于本地会话状态，只读取字段白名单；不读取普通 read/edit/tool output | P1 |
| OpenClaw | OpenClaw 官方 skills 文档说明 bundled/local skills 与 `SKILL.md`；官方 logging 文档说明 Gateway 写 JSON lines file logs；OpenClaw repo/ClawHub 是一手 skill registry 证据 | `local session parser` 待验证；保守为 `lifecycle only` | 先做 `OpenClawLogProbe` 只读目录发现和 lifecycle；若 JSONL 中出现明确 skill dispatch，再升级 parser | Gateway logs 可能包含消息、工具和渠道信息；需用户指定目录 | P2 |
| Kimi Code | Kimi Code 官方 data locations 文档说明 runtime data 位于 `~/.kimi-code/`，包含 `sessions/`、`session_index.jsonl`、global/session logs、`user-history/<md5(workDir)>.jsonl`；官方 env vars 文档说明可 relocation 和关闭 telemetry；changelog 提到内置 `/check-kimi-code-docs` skill | `local session parser` | `KimiCodeSessionCollector`，只读 `sessions/` 和 `session_index.jsonl`，parser revision 固定到 Kimi Code 版本 | `sessions/` 和 session logs 含对话/诊断；`user-history` 是输入历史，默认不读取 | P2 |
| Amp | Amp manual 说明 agent skills；plugin API 说明可注册 bundled skill，并有 `session.start -> agent.start -> tool.call -> tool.result -> agent.end` 事件链，`tool.call` 在工具运行前触发 | `direct observed` if plugin installed | `AmpPluginCollector`，监听 `tool.call` 中 skill/bundled-skill 工具 | 插件事件可见工具输入；只保留 skill 名称、时间、thread id hash | P2 |
| Pi | Pi 官方 sessions 文档说明 session 自动保存到 `~/.pi/agent/sessions/`，按 working directory 组织，每个 session 是 JSONL tree；skills 文档说明 skills on-demand loaded | `local session parser` | `PiSessionJsonlCollector`，解析 session-format 中明确 tool/skill 节点 | JSONL session 是完整会话树，含 tokens/cost/工具；读取需单独授权 | P2 |
| Hermes Agent | Hermes FAQ 说明不收集 telemetry/analytics，conversations、memory、skills 本地存 `~/.hermes/`；skills 文档说明 skills 主要目录为 `~/.hermes/skills/` | `local session parser`，无 direct telemetry | `HermesLocalCollector`，仅在开源 schema 确认后解析 conversations；第三方 OTel plugin 只作为用户自选 | 本地包含 conversations、memory、skills；不得读取 memory 作为 usage 证据 | P2 |
| Grok Build | xAI 官方 docs/source 确认 skills 目录、`~/.grok/sessions/` 会话、hooks，以及外部 OTel v1：metrics `grok_code.tool.usage` / `grok_code.tool.decision`，events `grok_code.skill_activated`，字段含 `skill_source`、`trigger`、`skill.name`（需 `OTEL_LOG_TOOL_DETAILS=1` 才暴露名称） | `direct observed`；默认 OTel 只能到 skill/plugin 类别，精确 skill 名需 details gate、hook 或 opt-in session parser | `GrokBuildOtelCollector` 读取 OTel event；`GrokBuildHookCollector` 读取 `hookEventName`、`sessionId`、`toolName`；session parser 仅用户授权后读取 `~/.grok/sessions/` | 默认不读 `~/.grok` 原始会话；OTel details gate 可能带工具参数/路径，collector 必须字段白名单 | P2 |
| ZCode | ZCode 官方 skill 文档说明 user skills 在 `~/.zcode/skills/<skill-name>/SKILL.md`，聊天可用 `$skill-name`；Usage Stats 读取本机 local session records；本机 SQLite `~/.zcode/cli/db/db.sqlite` 与 OpenCode 同构，`part.data` 可解析 `type=tool`、`tool=Skill`、`state.status=completed`、`state.input.skill/name`、`session.directory`；`tool_usage.tool_name=Skill` 可旁证完成状态但单独缺少 skill 名 | `local session parser` | `ZCodeSqliteCollector` 只读 completed skill parts；hook collector 作为后续旁路 | SQLite 属于本地会话状态，只读取字段白名单；不读取 `transcript_path`、prompt、response、tool output | P1 |
| Kiro | Kiro 官方 hooks 文档说明 hooks 可在 session 中 agent 修改文件、调用工具、完成任务时运行 shell command 或 agent prompt；examples 包含 centralized user prompt logging | `direct observed` only if user-created hook captures skill/tool event；默认 `lifecycle only` | `KiroHookCollector`，由用户显式安装 hook，把 tool event 最小化写入 SkillFlow | Hook 可能记录 prompt；默认模板不得保存 prompt 文本 | P3 |
| Roo Code | Roo 官方 settings 文档说明 task history/settings 默认存 VS Code extension storage，可配置 custom storage path；GitHub issue 显示 task history 还涉及 VS Code `state.vscdb`；Roo skills 公开信息多来自社区/issue | `lifecycle only` | `RooStorageProbe` 只探测 task history 位置；不进入主 usage | VS Code global storage 可能混有所有任务内容和 secrets-adjacent state | P3 |
| Cline | Cline 官方 telemetry 文档说明匿名 usage events 覆盖 features/tools/commands、task completion、errors、performance，且不含代码/文件内容；任务历史位置/恢复更多见 GitHub issue，未确认 skill 调用事件 | `lifecycle only` | `ClineTelemetryProbe` 或 task-history parser 暂缓 | 匿名 telemetry 不足以映射 skill 名；task history 含完整任务上下文 | P3 |
| Windsurf / Cascade | Devin/Windsurf Cascade skills 文档说明 skill 可 model decision 或 `@mention` 调用，enterprise system skills 有固定目录；memories 文档仅确认 `~/.codeium/windsurf/memories/`，不是会话/skill usage | `lifecycle only` | `WindsurfSkillInventoryCollector`，只记录可见 skill 目录和启用状态 | 不读取 memories 作为 usage；没有官方会话格式前不解析本地 app data | P4 |
| Trae / Trae CN | Trae CN 官方 skills 文档确认 skill 由 `SKILL.md` 定义，项目目录 `<project>/.trae/skills/`，全局目录 macOS/Linux `~/.trae-cn/skills`，字段 `name`、`description`；skill 仅在任务高度相关时按需加载；未找到官方 usage event、本地 session path 或 telemetry schema | `lifecycle only` | `TraeSkillInventoryCollector`，Trae 国际版与 CN 分开识别目录 | 仅技能库存，不推断使用次数 | P4 |
| CodeBuddy | CodeBuddy 官方 skills 文档确认 `.codebuddy/skills/`、`~/.codebuddy/skills/`，字段 `name`、`description`、`allowed-tools`、`disable-model-invocation`、`user-invocable`、`context: fork`、`hooks`；hooks 有 `SessionStart`、`PreToolUse`、`PostToolUse`、`SubagentStart` 等，stdin 字段含 `session_id`、`transcript_path`、`hook_event_name`、`tool_name`、`tool_input`；OTel spans 有 `codebuddy_code.interaction` / `codebuddy_code.tool`，字段含 `span.type`、`conversation.id`、`tool_name`、`tool.call_id`、`tool_input`（details gate） | `direct observed` for tool/hook；真实 skill identity 仅在 explicit skill/fork skill lifecycle 或 trace 明确标识时计数，普通注入式 skill 不能只靠工具 span 判定 | `CodeBuddyOtelCollector` + `CodeBuddyHookCollector`；HTTP `/api/v1/stats`、`/api/v1/traces` 只做 diagnostic | 不读 `~/.codebuddy/projects/...` transcript/tool-results；OTel 默认只保留工具名和 call id，details/content gate 默认不打开 | P2 |
| WorkBuddy | 官方 WorkBuddy docs 入口未公开可解析的 skill/session/telemetry/local log schema；同域 CLI 页面属于 CodeBuddy Code，不应自动等同 WorkBuddy 产品 | `unsupported` | 暂不实现；若运行时 fingerprint 明确是 CodeBuddy CLI，可复用 CodeBuddy collector | 无 WorkBuddy 一手字段证据，不扫描 | P4 |
| Minimax Code / Mini-Agent | MiniMax 官方 Mini-Agent 页面/GitHub 说明 Claude Skills integration 和 detailed logs for request/response/tool execution；但这更像示例 agent 项目，不等同于 SkillFlow `minimax-code` 产品级 target | `local session parser` for Mini-Agent only；目标默认 `unsupported` | `MiniAgentLogCollector` 作为实验性 custom collector；`minimax-code` 保守不做主计数 | logs 可能含请求、响应、工具执行细节 | P4 |

## 实现建议

### 0. 代码层统一边界

当前实现以 `packages/integration/src/utils/usage/agent-usage-policies.ts` 的 `USAGE_AGENT_POLICIES` 作为 22 个内置 Agent 的代码层边界表：

- `implemented`：进入 `createDefaultUsageCollectors()`，并有 parser revision、source kind、evidence kind 单测校验。
- `candidate`：存在候选一手数据源，但缺少当前可安全默认读取的字段样本；不进入默认 collector，coverage 显示 `parser_unsupported`。
- `unsupported` / `lifecycle only`：不得进入主使用次数；不把安装、同步、目录存在、匿名 telemetry、普通 tool call 或 history/memory 当作 skill 调用。

`createDefaultSupportedUsageAgents()` 从 policy 派生；测试要求 `TARGET_ORDER`、`USAGE_AGENT_POLICIES` 与默认 collectors 不漂移。

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

### 2. 默认读取策略

- 当前桌面模块直接读取当前用户本机已知 agent 数据源，不需要导入/导出。
- 每个 collector 必须声明精确读取路径、parser revision、字段白名单。
- dry-run 可展示 coverage 和预计 observations 数；正式 refresh 写入派生的 usage store。
- 派生 store 只保存 observation，不保存原始会话、prompt、response、tool output 或绝对路径。

### 3. 隐私底线

- 不保存 prompt、assistant response、tool output、tool args、文件内容、绝对路径、凭据、原始错误。
- 不读取 `history`、`memory`、`user-history`、`state.vscdb` 这类非必要来源，除非某 agent 的一手文档明确要求且用户单独授权。
- parser 只做 streaming extraction，处理后丢弃原始记录。
- 任何 parser schema unknown / parse failed 只产出 diagnostic，不产出 0 次使用。

### 4. 优先级路线

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| P0 | Claude OTel + Claude local parser；Gemini OTel；Codex local parser | 能产出 observed usage，parser 有 revision、offset 和隐私白名单测试 |
| P1 | OpenCode SQLite；ZCode SQLite；Cursor Enterprise OTel；GitHub Copilot CLI parser；VS Code Copilot OTel | SQLite collector 必须只收 completed skill part；无企业配置时显示 unsupported/needs config，不显示 0 |
| P2 | OpenCode plugin；Amp plugin；Grok Build OTel/Hook；CodeBuddy OTel/Hook；Kimi/Pi/Hermes parser；OpenClaw probe | plugin/OTel collector 有最小事件 schema；parser 默认 opt-in |
| P3 | Kiro hook、Roo/Cline storage probe | 仅 lifecycle/diagnostic，除非一手事件确认 |
| P4 | Trae、WorkBuddy、Minimax Code | 维持 unsupported 或 custom collector，不进入主计数 |

## 字段级结论（2026-08-23 补充）

| Target | 可获取记录与字段 | 能否区分真实 skill 调用 | Collector 结论 |
| --- | --- | --- | --- |
| `zcode` | 本地 skill 库 `~/.zcode/skills/<skill-name>/SKILL.md`；Usage Stats 读取 local session records；本机 `~/.zcode/cli/db/db.sqlite` 表含 `session`、`part`、`tool_usage`。`part.data` JSON 中可字段级命中 `type=tool`、`tool=Skill`、`state.status=completed`、`state.input.skill/name`、`state.time.start`；`session.directory` 提供项目路径；`tool_usage` 可验证 `tool_name=Skill` completed，但单独缺 skill 名称 | 能。本机验证严格 completed skill part 可提取 242 条；另有 error 状态不计数 | `ZCodeSqliteCollector` 进主计数；hook 仅作为后续旁证 |
| `cursor` | Enterprise OTel logs 覆盖 skills/hooks/plugins/cloud agent lifecycle；Analytics API 是团队汇总 | 能，限 Enterprise OTel logs 中明确的 skill event | `CursorOtelCollector` |
| `grok-build` | OTel metrics `grok_code.tool.usage`、`grok_code.tool.decision`；OTel event `grok_code.skill_activated`，字段 `skill_source`、`trigger`、`skill.name`；hooks 字段 `hookEventName`、`sessionId`、`toolName`；sessions 在 `~/.grok/sessions/` | 能。`grok_code.skill_activated` 是真实调用；但默认隐藏具体 `skill.name`，需 details gate 或 session parser 才能归因到名称 | `GrokBuildOtelCollector` 优先；hook/session 作为 opt-in |
| `workbuddy` | 未找到 WorkBuddy 产品的一手 skill/session/telemetry/local log schema | 不能 | `unsupported`；不得套用 CodeBuddy，除非产品 fingerprint 明确 |
| `codebuddy` | skill 库 `.codebuddy/skills/`、`~/.codebuddy/skills/`；skill fields `name`、`description`、`allowed-tools`、`disable-model-invocation`、`user-invocable`、`context: fork`、`hooks`；hooks 字段 `hook_event_name`、`tool_name`、`tool_input`、`session_id`；OTel span `codebuddy_code.tool` 字段 `span.type`、`conversation.id`、`tool_name`、`tool.call_id`、`tool_input` | 部分能。fork skill lifecycle 或 explicit skill trace 可计数；普通注入式 skill 只产生下游工具 span 时不能判定是 skill 调用 | `CodeBuddyOtelCollector` + `CodeBuddyHookCollector`；精确 skill 只在明确标识时入主计数 |
| `trae` | 未找到国际版可公开解析的 usage event/session/telemetry schema；按 CN 文档仅可确定 skill 目录族 | 不能 | `TraeSkillInventoryCollector` only |
| `trae-cn` | `<project>/.trae/skills/`、`~/.trae-cn/skills`；`SKILL.md` fields `name`、`description` | 不能。官方只说明按需加载，没有公开调用事件 | `TraeSkillInventoryCollector` only |
| `minimax-code` | MiniMax Mini-Agent 一手资料有 request/response/tool execution logs 和 Claude Skills integration，但不能证明 `minimax-code` 产品 target 有稳定 schema | 对 Mini-Agent 可解析；对 `minimax-code` 不能 | `MiniAgentLogCollector` 仅 custom/实验；`minimax-code` unsupported |
| `hermes-agent` | `~/.hermes/` 本地 conversations/memory/skills；skills 在 `~/.hermes/skills/` | 仅当 conversations schema 中有明确 skill/tool 节点；无 telemetry | `HermesLocalCollector` opt-in parser |
| `openclaw` | bundled/local skills 与 `SKILL.md`；Gateway JSONL logs | 未复核到稳定 skill dispatch 字段，默认不能 | `OpenClawLogProbe` lifecycle；命中明确 dispatch 后再升级 |
| `github-copilot` | CLI session data 在 `~/.copilot/session-state/` 和 local SQLite，含 prompts/responses/tools used/modified files；VS Code OTel 覆盖 tool executions | CLI parser 可按 tools used/skill 记录区分；VS Code OTel 可按 tool execution 区分 | `CopilotCliSessionCollector`、`VsCodeCopilotOtelCollector` |
| `windsurf` | Cascade skills 支持 model decision 或 `@mention`；公开本地 memories 路径不是 usage | 不能 | `WindsurfSkillInventoryCollector` only |
| `amp` | Plugin API 事件链 `session.start`、`agent.start`、`tool.call`、`tool.result`、`agent.end`；manual 有 agent skills | 能，限安装 plugin 后观察到 bundled skill/tool call | `AmpPluginCollector` |
| `kiro` | Hooks 可在工具调用、文件修改、任务完成时运行；examples 有 user prompt logging | 只有用户安装 hook 且字段中明确 skill/tool 时能 | `KiroHookCollector` opt-in；默认 lifecycle |
| `roo-code` | VS Code extension storage / custom storage path；task history 还涉及 VS Code `state.vscdb` | 不能。公开资料未确认 skill 调用字段 | `RooStorageProbe` diagnostic only |
| `cline` | 匿名 telemetry 包含 features/tools/commands、task completion、errors、performance | 不能映射具体 skill 名；task history schema 未稳定 | `ClineTelemetryProbe` diagnostic only |
| `codex` | `CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`、`CODEX_HOME/archived_sessions/YYYY/MM/DD/rollout-*.jsonl`、`session_index.jsonl`、`state_5.sqlite` 等本地状态；skills 可用 `/skills` 或 `$` 显式提及 | 能。结构化 tool call 只有明确 skill input 才算；用户 role 文本和 `payload.type=user_message` 中的 `$skill` / `/skill` 作为 `explicit_command` 候选，必须匹配当前 SkillFlow inventory 才入库；assistant/system 文本和 XML tag 不计数；同一用户消息的 mirrored projection 去重 | `CodexSessionJsonlCollector` |
| `pi` | `~/.pi/agent/sessions/` JSONL tree；skills on-demand loaded | 能，限 session tree 中明确 tool/skill 节点 | `PiSessionJsonlCollector` opt-in |
| `gemini` | OTel / `.gemini/telemetry.log` 事件 `gemini_cli.tool_call`，字段 `function_name`、`function_args`；skill 调用为 `activate_skill` tool | 能，`function_name=activate_skill` 是真实 skill 激活 | `GeminiTelemetryCollector` |
| `kimi` | `~/.kimi-code/sessions/`、`session_index.jsonl`、global/session logs、`user-history/<md5(workDir)>.jsonl` | 能，限 sessions/logs 中明确 skill/tool 节点；不读 user-history | `KimiCodeSessionCollector` opt-in |

## 本机字段级验证快照（2026-08-24）

验证命令使用真实本机 agent 数据源与真实 `~/.skillflow/lock.json` inventory，写入临时 usage store。口径：

- `tool_call`：只接受结构化 Skill 执行记录；OpenCode/ZCode 额外要求 `state.status=completed`。
- `explicit_command`：只从 user-role 文本解析 `$skill` / `/skill`；必须匹配当前 SkillFlow inventory。
- 普通 toolCalls、文件路径、`SKILL.md` 文本、assistant 输出、XML closing tag、lifecycle 事件不计数。

| Agent | 数据源 | 原始命中 | 服务层 accepted | 说明 |
| --- | --- | ---: | ---: | --- |
| `claude-code` | `~/.claude/projects/**/*.jsonl` | 77 | 11 | 7 条结构化 `Skill` tool_use；其余为显式命令候选，未匹配 inventory 的候选被丢弃 |
| `codex` | `~/.codex/sessions/**/*.jsonl`、`~/.codex/archived_sessions/**/*.jsonl` | 401 | 359 | accepted 全部来自 user-role 或 `user_message` 显式 `$skill` / `/skill`；普通 response toolCalls 未作为 skill 调用计数；active 与 archived 均已扫描 |
| `opencode` | `~/.local/share/opencode/opencode.db` | 5 | 5 | 只统计 completed `tool=skill` SQLite part；本机另有 error 状态已排除 |
| `zcode` | `~/.zcode/cli/db/db.sqlite` | 242 | 242 | 只统计 completed `tool=Skill` SQLite part；`tool_usage` 仅旁证，不用于取 skill 名 |
| `pi` | `~/.pi/agent/sessions/**/*.jsonl` | 0 | 0 | 数据源存在但无明确 skill 信号 |
| `gemini-cli` | `.gemini/telemetry.log` | 0 | 0 | 本机未找到 telemetry 文件 |
| `kimi-code` | `~/.kimi-code/sessions/**/*.jsonl` | 0 | 0 | 本机未找到 sessions 目录 |

临时服务层总计：`observedAccepted=617`、`activeSkills=59`、`activeAgents=4`、`activeProjects=30`。其中部分结构化执行记录无法匹配当前 inventory，会保留 `skillLabel` 并标记 `inventoryStatus=unknown`；显式命令不允许 unknown 入库。

Codex 单项补充验证：collector 原始命中 401 条，时间范围 `2026-07-19T14:25:00.240Z` 到 `2026-08-23T18:09:08.670Z`；服务层 accepted 359 条，active skill 20 个，active project 12 个，diagnostics 0。

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
- ZCode Hooks: https://zcode.z.ai/en/docs/hooks
- ZCode Usage Stats: https://zcode.z.ai/en/docs/usage-stats
- Grok Build Overview: https://docs.x.ai/build/overview
- Grok Build Skills, Plugins & Marketplaces: https://docs.x.ai/build/features/skills-plugins-marketplaces
- Grok Build Sessions: https://docs.x.ai/build/features/sessions
- Grok Build Hooks: https://docs.x.ai/build/features/hooks
- Grok Build Monitoring Usage source: https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/24-monitoring-usage.md
- Hermes FAQ: https://hermes-agent.nousresearch.com/docs/reference/faq
- Hermes Skills: https://hermes-agent.nousresearch.com/docs/user-guide/features/skills
- MiniMax Mini-Agent: https://platform.minimax.io/docs/token-plan/mini-agent
- MiniMax-AI/Mini-Agent: https://github.com/MiniMax-AI/Mini-Agent
- CodeBuddy Agent SDK: https://www.codebuddy.ai/docs/cli/sdk
- CodeBuddy Skills: https://www.codebuddy.ai/docs/cli/skills
- CodeBuddy Hooks: https://www.codebuddy.ai/docs/cli/hooks
- CodeBuddy Monitoring: https://www.codebuddy.ai/docs/cli/monitoring
- CodeBuddy Directory Structure: https://www.codebuddy.ai/docs/cli/codebuddy-dir
- CodeBuddy HTTP API: https://www.codebuddy.ai/docs/cli/http-api
- CodeBuddy ACP Protocol: https://www.codebuddy.ai/docs/cli/acp
- Trae Skills: https://docs.trae.ai/ide/skills
- Trae CN Skills: https://docs.trae.cn/ide/skills
- WorkBuddy Docs: https://www.workbuddy.ai/docs/workbuddy/

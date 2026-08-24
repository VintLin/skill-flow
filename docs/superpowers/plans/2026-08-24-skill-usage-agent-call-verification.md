# Skill 使用记录跨 Agent 核对计划

日期：2026-08-24

## 目标

核对 SkillFlow 当前可配置的 Agent，以及每个 Agent 应如何识别其中的 Skill 调用记录。这里的“Skill 调用”只指能证明某个 skill 被 agent 使用的记录，不包含安装、同步、导入、启用、普通 tool call、读取 `SKILL.md` 文件路径或 UI 生命周期事件。

本计划先明确核对清单和判定口径，后续实现或修正 collector 时逐项打勾。

## 事实源

- 可配置 Agent 清单：`packages/integration/src/utils/constants.ts` 中的 `TARGET_ORDER` 与 `TARGET_DEFINITIONS`。
- Usage 边界清单：`packages/integration/src/utils/usage/agent-usage-policies.ts` 中的 `USAGE_AGENT_POLICIES`。
- 当前已实现 Usage collector：`packages/integration/src/utils/usage-collectors.ts` 中的 `createDefaultUsageCollectors()`。
- 使用记录调研结论：`docs/references/REF_usage-agent-collectors.md`。
- 入库口径：`packages/core-engine/src/services/skill-usage-service.ts`。

## 主判定规则

1. 结构化执行记录优先。
   - tool 名必须能明确对应 skill 激活或 skill 执行，例如 `Skill`、`skill`、`activate_skill`。
   - 必须能取到 skill 名称，例如 `skill`、`skillName`、`skill_name`、`name`。
   - OpenCode / ZCode 这类 SQLite part 记录必须额外满足 `state.status=completed`。

2. 显式命令只作为候选。
   - 只从 user-role 文本读取 `$skill-name` 或 `/skill-name`。
   - 必须匹配当前 SkillFlow inventory 才入库。
   - 不从 assistant/system 文本识别。
   - 不识别 XML closing tag、普通文件路径、`SKILL.md` 文本或 `/tmp/...`。

3. 不可证明 skill 身份的记录不进入主计数。
   - 普通 toolCalls 不是 Skill 调用。
   - hook 触发不是 Skill 调用。
   - session 存在不是 Skill 调用。
   - skill 安装、启用、导入、同步不是 Skill 调用。

4. 入库只保存派生 observation。
   - 保存：agent、skillRef 或 skillLabel、时间、project hash/label、evidenceKind、confidence、outcome、parserRevision。
   - 不保存：prompt、assistant response、tool output、tool args、原始绝对路径、原始 session 内容。

## 当前可配置 Agent 清单

| 顺序 | Agent id | 展示名 | 配置环境变量 | 默认全局 skill 路径 | 部署策略 |
| ---: | --- | --- | --- | --- | --- |
| 1 | `claude-code` | Claude Code | `SKILL_FLOW_TARGET_CLAUDE_CODE` | `~/.claude/skills/` | symlink |
| 2 | `codex` | Codex | `SKILL_FLOW_TARGET_CODEX` | `~/.codex/skills/` | symlink |
| 3 | `zcode` | ZCode | `SKILL_FLOW_TARGET_ZCODE` | `~/.zcode/skills/` | symlink |
| 4 | `cursor` | Cursor | `SKILL_FLOW_TARGET_CURSOR` | `~/.cursor/skills/` | symlink |
| 5 | `grok-build` | Grok Build | `SKILL_FLOW_TARGET_GROK_BUILD` | `~/.grok/skills/` | symlink |
| 6 | `pi` | Pi | `SKILL_FLOW_TARGET_PI` | `~/.pi/agent/skills/` | symlink |
| 7 | `workbuddy` | WorkBuddy | `SKILL_FLOW_TARGET_WORKBUDDY` | `~/.workbuddy/skills/` | symlink |
| 8 | `codebuddy` | CodeBuddy | `SKILL_FLOW_TARGET_CODEBUDDY` | `~/.codebuddy/skills/` | symlink |
| 9 | `trae` | Trae | `SKILL_FLOW_TARGET_TRAE` | `~/.trae/skills/` | symlink |
| 10 | `trae-cn` | Trae CN | `SKILL_FLOW_TARGET_TRAE_CN` | `~/.trae-cn/skills/` | symlink |
| 11 | `kimi-code` | Kimi Code | `SKILL_FLOW_TARGET_KIMI_CODE` | `~/.kimi-code/skills/` | symlink |
| 12 | `opencode` | OpenCode | `SKILL_FLOW_TARGET_OPENCODE` | `~/.config/opencode/skills/` | symlink |
| 13 | `minimax-code` | MiniMax Code | `SKILL_FLOW_TARGET_MINIMAX_CODE` | `~/.minimax/skills/` | symlink |
| 14 | `hermes-agent` | Hermes Agent | `SKILL_FLOW_TARGET_HERMES_AGENT` | `~/.hermes/skills/` | symlink |
| 15 | `openclaw` | OpenClaw | `SKILL_FLOW_TARGET_OPENCLAW` | `~/.openclaw/skills/` | copy |
| 16 | `github-copilot` | GitHub Copilot | `SKILL_FLOW_TARGET_GITHUB_COPILOT` | `~/.copilot/skills/` | symlink |
| 17 | `gemini-cli` | Gemini CLI | `SKILL_FLOW_TARGET_GEMINI_CLI` | `~/.gemini/skills/` | symlink |
| 18 | `windsurf` | Windsurf | `SKILL_FLOW_TARGET_WINDSURF` | `~/.codeium/windsurf/skills/` | symlink |
| 19 | `amp` | Amp | `SKILL_FLOW_TARGET_AMP` | `~/.config/agents/skills/` | symlink |
| 20 | `kiro` | Kiro | `SKILL_FLOW_TARGET_KIRO` | `~/.kiro/skills/` | symlink |
| 21 | `roo-code` | Roo Code | `SKILL_FLOW_TARGET_ROO_CODE` | `~/.roo/skills/` | symlink |
| 22 | `cline` | Cline | `SKILL_FLOW_TARGET_CLINE` | `~/.cline/skills/` | symlink |

补充：除内置 Agent 外，SkillFlow 也支持 custom target；custom target 可以配置 skill 写入路径，但当前没有通用 usage parser，不能默认推断 Skill 调用次数。

## 代码层处理确认

`USAGE_AGENT_POLICIES` 是当前 22 个内置 Agent 的统一边界表；`createDefaultSupportedUsageAgents()` 从该表派生，测试会阻止 `TARGET_ORDER`、policy 与默认 collector 漂移。`implemented` 表示已经进入默认 collector；`candidate` 表示有候选一手数据源但缺少当前可安全默认读取的字段样本；`unsupported` / `lifecycle only` 表示不得进入主使用次数，只能显示 `parser_unsupported` 或后续 lifecycle/diagnostic。

| Agent id | Policy 状态 | 默认 collector | 代码层边界确认 |
| --- | --- | --- | --- |
| `claude-code` | `implemented` | `claude-code-session@1` | 只统计结构化 `Skill` tool_use 与 inventory 匹配的用户显式命令 |
| `codex` | `implemented` | `codex-session@1` | 扫描 active + archived rollout；只统计结构化 Skill/activate_skill 与去重后的用户显式命令；默认 refresh budget 覆盖当前本机全量 Codex 历史 |
| `zcode` | `implemented` | `zcode-sqlite@1` | 只统计 completed SQLite skill part；`tool_usage` 不单独计数 |
| `cursor` | `implemented` | `cursor-agent-transcript@1` | 只扫描 `agent-transcripts` JSONL；user-role 显式命令必须匹配 inventory；普通 plans/config 不计数 |
| `grok-build` | `implemented` | `grok-build-session@1` | 只扫描 `chat_history.jsonl`；仅用户消息开头 `$skill` / `/skill` 进入候选并必须匹配 inventory；events/updates lifecycle 不计数 |
| `pi` | `implemented` | `pi-session@1` | 只统计 JSONL 中明确 Skill/activate_skill 或 inventory 匹配的用户显式命令 |
| `workbuddy` | `implemented` | `workbuddy-usage-log@1` | 保留旧 parser revision 用于替换历史派生数据；实际读取 `traces` 中结构化 `toolName=Skill` span，`usage-log.json` 仅无 trace 信号时兜底 |
| `codebuddy` | `candidate` | 无 | 仅 explicit/fork skill lifecycle 或 trace 明确 skill 名后可实现；当前 `parser_unsupported` |
| `trae` | `unsupported` | 无 | 只有 lifecycle/inventory 证据；当前 `parser_unsupported` |
| `trae-cn` | `unsupported` | 无 | 只有 lifecycle/inventory 证据；当前 `parser_unsupported` |
| `kimi-code` | `implemented` | `kimi-code-session@1` | 只统计 sessions 中明确 Skill/activate_skill 或 inventory 匹配的用户显式命令；不读 user-history |
| `opencode` | `implemented` | `opencode-sqlite@1` | 只统计 completed SQLite skill part |
| `minimax-code` | `unsupported` | 无 | Mini-Agent 日志不等同产品 target；当前 `parser_unsupported` |
| `hermes-agent` | `candidate` | 无 | 仅 conversation schema 明确 Skill tool/activation/name 后可实现；当前 `parser_unsupported` |
| `openclaw` | `candidate` | 无 | 仅 log/session 明确 skill dispatch/name 后可实现；当前 `parser_unsupported` |
| `github-copilot` | `candidate` | 无 | 需分别验证 CLI session 或 VS Code OTel 中明确 skill identity；当前 `parser_unsupported` |
| `gemini-cli` | `implemented` | `gemini-telemetry@1` | 只统计 telemetry 中 activate_skill 且 args 含 skill/name 的事件 |
| `windsurf` | `unsupported` | 无 | 只有 lifecycle/inventory 证据；不读 memories；当前 `parser_unsupported` |
| `amp` | `candidate` | 无 | 仅 plugin event 明确 skill/bundled skill 名后可实现；当前 `parser_unsupported` |
| `kiro` | `candidate` | 无 | 仅用户安装 hook 且 payload 明确 skill identity 后可实现；当前 `parser_unsupported` |
| `roo-code` | `unsupported` | 无 | 不泛读 VS Code storage/state.vscdb；当前 `parser_unsupported` |
| `cline` | `unsupported` | 无 | 匿名 telemetry 不能映射 skill 名；当前 `parser_unsupported` |

## 各 Agent Skill 调用识别方式

| Agent id | 当前识别状态 | 数据源 | Skill 调用识别规则 | 不计数内容 | 核对动作 |
| --- | --- | --- | --- | --- | --- |
| `claude-code` | 已实现 local parser；OTel 待接入 | `~/.claude/projects/**/*.jsonl`；未来可接 Claude Code OTel | 结构化：`message.content[]` 中 `type=tool_use`、`name=Skill`、`input.skill` 有值；显式：user-role 文本中的 `$skill` / `/skill` 且匹配 inventory | `SKILL.md` 路径、Read/Edit tool、assistant 文本、未匹配 inventory 的显式命令 | 用真实 JSONL 抽样核对字段；补 OTel `skill.name` collector 时只收字段白名单 |
| `codex` | 已实现 local parser | `~/.codex/sessions/**/*.jsonl`、`~/.codex/archived_sessions/**/*.jsonl` | 结构化：payload 或 content block 中 tool/function 名为 `Skill` / `activate_skill` 且参数含 `skill/name`；显式：user-role 文本和 `payload.type=user_message` 中的 `$skill` / `/skill` 且匹配 inventory；project 从 `session_meta.cwd` 继承；同一用户消息的 mirrored projection 去重 | response 普通 `toolCalls`、assistant/system 文本、XML tag、路径文本 | 核对 active 与 archived rollout JSONL；确认 user role、`user_message`、session_meta 路径继承与显式命令去重 |
| `zcode` | 已实现 SQLite parser | `~/.zcode/cli/db/db.sqlite` | `part.data` JSON 满足 `type=tool`、`tool=Skill/skill/activate_skill`、`state.status=completed`、`state.input.skill/name` 有值；project 从 `session.directory` 读取后 hash | `tool_usage` 单独记录、error 状态、hook lifecycle、`$skill` 文本但无结构执行旁证 | 核对 `part` 与 `tool_usage` 的 call id / session id 对应关系；确认是否需要额外解析用户显式 `$skill` |
| `cursor` | 已实现 local parser；OTel 待接入 | `~/.cursor/projects/**/agent-transcripts/**/*.jsonl`；Cursor Enterprise OTel logs | agent transcript user-role 文本中的 `$skill` / `/skill` 且匹配 inventory；结构化 Skill/activate_skill tool call 需能取得 skill/name | 本地 `.cursor` 配置、plans、assistant 文本、普通聊天状态、团队 analytics 汇总、MCP/tool metadata | 本机 transcript 原始候选均未匹配 inventory，服务层 accepted=0；后续接 Enterprise OTel direct event |
| `grok-build` | 已实现 conservative local parser；OTel / hook 待接入 | `~/.grok/sessions/**/chat_history.jsonl`；Grok Build OTel、hooks | chat history 中 user 类型文本必须以 `$skill` / `/skill` 开头，且匹配 inventory；OTel event `grok_code.skill_activated` 未来可作为 direct event | 句中 `$skill`、普通 `/path`、events/updates lifecycle、只有 `tool.usage` 但无 skill 名、普通 hook、session 存在 | 本机严格规则 dry-run 为 `no_skill_signals`；广义匹配会误报，已禁止 |
| `pi` | 已实现 local parser | `~/.pi/agent/sessions/**/*.jsonl` | 结构化：session JSONL 中 tool block 名为 `Skill` / `activate_skill` 且参数含 `skill/name`；显式：user-role 文本 `$skill` / `/skill` 且匹配 inventory；project 从 `cwd/projectPath/workspaceRoot` 继承 | session tree 普通节点、工具结果、assistant 文本、未匹配 inventory 的显式命令 | 用真实 Pi session 样本核对 content block shape；无 skill 信号时返回 `no_skill_signals` |
| `workbuddy` | 已实现 direct trace parser，aggregate 兜底 | `~/.workbuddy/traces/**/*.json`、`~/.workbuddy/app/sessions.json`、`~/.workbuddy/usage-log.json` | trace `spans[]` 中 `name/toolName=Skill`、`type=function`、`toolInput.skill`、`startedAt`；`status=ok/completed` 记 completed；`sessions.json` 用 `trace.sessionId` 映射项目 | generation prompt/response/tool output、tasks 原文、普通 span/tool 信息、`mcps` 聚合字段、同域 CodeBuddy 文档；有 trace 命中时不再叠加 usage-log | 本机 trace 可读取 5 个 skill、14 次调用、7 个日期；6 条可映射项目，8 条项目未知；usage-log 只有 8 个 skill/date 聚合，作为兜底 |
| `codebuddy` | 未实现；候选 OTel / hook | CodeBuddy OTel spans、hooks | 只有 explicit skill / fork skill lifecycle / trace 明确标识 skill 名时计数；普通 `tool_name` 只能作下游工具，不等同 skill | 普通 tool span、HTTP stats/traces 汇总、transcript_path 原文 | 获取最小 hook/OTel 样本；确认 skill identity 字段后再实现 |
| `trae` | 未实现；lifecycle only | `.trae/skills/`、`~/.trae/skills/` | 暂无 usage 计数规则；只能识别 skill inventory | skill 目录存在、按需加载说明、普通会话 | 继续找国际版 usage/session schema；无字段前不计数 |
| `trae-cn` | 未实现；lifecycle only | `<project>/.trae/skills/`、`~/.trae-cn/skills/` | 暂无 usage 计数规则；只能识别 skill inventory | skill 目录存在、`SKILL.md` 元数据 | 继续找 CN usage/session schema；无字段前不计数 |
| `kimi-code` | 已实现 local parser | `~/.kimi-code/sessions/**/*.jsonl` | 结构化：tool block 名为 `Skill` / `activate_skill` 且参数含 `skill/name`；显式：user-role 文本 `$skill` / `/skill` 且匹配 inventory；project 从 `cwd/projectPath/workspaceRoot/workingDirectory` 继承 | `user-history`、普通日志、assistant 文本、未匹配 inventory 的显式命令 | 本机若出现 sessions，核对版本字段和 session index；不读取 user-history |
| `opencode` | 已实现 SQLite parser | `~/.local/share/opencode/opencode.db` | `part.data` JSON 满足 `type=tool`、`tool=skill/Skill/activate_skill`、`state.status=completed`、`state.input.skill/name` 有值；project 从 `session.directory` 读取后 hash | error 状态、read/edit tool、普通 tool_usage、插件 lifecycle | 核对 SQLite schema 版本；确认 completed 过滤是否覆盖 abort/cancel 状态 |
| `minimax-code` | 未实现；unsupported / custom only | Mini-Agent logs 仅作 custom 候选 | 只有 Mini-Agent 日志明确记录 skill execution/name 时可做 custom parser；内置 `minimax-code` 暂无规则 | MiniMax 产品 target 与 Mini-Agent 示例混用、普通 request/response/tool logs | 明确产品 fingerprint 和本地日志路径后再判断 |
| `hermes-agent` | 未实现；候选 local parser | `~/.hermes/` conversations | conversation schema 中若出现明确 Skill tool/activation/name 才计数 | memory、skills 目录、普通 conversation 文本 | 只做 schema probe；禁止读取 memory 作为 usage 证据 |
| `openclaw` | 未实现；候选 log parser | Gateway JSONL logs、OpenClaw sessions 若存在 | log/session 中明确 skill dispatch/name 时计数 | Gateway 启动日志、普通 tool、skill inventory | 获取 JSONL 字段样本；无 dispatch 字段保持 lifecycle/unsupported |
| `github-copilot` | 未实现；候选 CLI parser / VS Code OTel | `~/.copilot/session-state/`、local SQLite、VS Code OTel | CLI session 的 tools used 中若明确 skill/tool skill 名；VS Code OTel tool execution 若明确 skill activation/name | Copilot metrics API 汇总、modified files、普通 tool used 无 skill 名 | 分开核对 Copilot CLI 与 VS Code Copilot；避免把团队 metrics 当调用 |
| `gemini-cli` | 已实现 telemetry parser | `.gemini/telemetry.log` 或 `GEMINI_TELEMETRY_OUTFILE` | event 中 `function_name=activate_skill` 或等价 skill tool；`function_args` JSON 含 `skill/skillName/skill_name/name` | 普通 tool_call、prompt logs、无 skill 参数事件 | 核对 telemetry 文件是否存在；确认 `log_prompts_enabled` 不影响字段白名单 |
| `windsurf` | 未实现；lifecycle only | `~/.codeium/windsurf/skills/`、企业 system skills；可能的 Cascade session/telemetry 待证实 | 暂无 usage 计数规则；除非找到 session/OTel 中明确 `@mention` 或 skill activation/name | memories、skill 目录、Cascade 普通活动 | 不读取 memories；继续找稳定 session/OTel schema |
| `amp` | 未实现；候选 plugin direct event | Amp plugin event stream | plugin 事件链中 `tool.call` 明确为 skill/bundled skill 且能取得 skill 名时计数 | 普通 tool.call、session.start、agent.start/end | 设计只读 Amp plugin event sink；确认字段最小化 |
| `kiro` | 未实现；hook only | Kiro hooks | 用户安装 hook 且 hook payload 明确 skill/tool skill name 时计数 | 普通工具调用 hook、文件修改 hook、任务完成 hook | 先做 hook probe，不自动修改用户 hook 配置 |
| `roo-code` | 未实现；diagnostic only | VS Code extension storage / custom storage path | 暂无 usage 计数规则；只有未来 task history schema 明确 skill activation/name 才计数 | `state.vscdb` 泛读、task history 普通文本、匿名状态 | 只探测存储位置；不读 VS Code 全局数据库作主计数 |
| `cline` | 未实现；diagnostic only | Cline anonymous telemetry、task history | 暂无可映射具体 skill 名的规则；只有 task history 明确 skill activation/name 才计数 | 匿名 features/tools/commands 汇总、task completion、errors | 不把匿名 telemetry 映射为 skill 使用；继续找 task schema |

## 核对步骤

### 1. 配置面核对

- 从 `TARGET_ORDER` 生成可配置 Agent 清单，确认 UI、CLI、bridge 三处展示顺序一致。
- 对每个 Agent 核对：
  - `label`
  - `strategy`
  - `envVar`
  - `documentedGlobalPath`
  - `documentedProjectPath`
  - `detectionRootCandidates`
  - `compatReadRootCandidates`
- 检查 custom target 在 usage coverage 中的行为：可以部署 skill，但没有通用 usage parser 时不得显示成“0 次使用”。

### 2. 数据源存在性核对

- 对已实现 collector：
  - `claude-code`：检查 `~/.claude/projects` 是否存在。
  - `codex`：检查 `CODEX_HOME/sessions`、`CODEX_HOME/archived_sessions` 或 `~/.codex/sessions`、`~/.codex/archived_sessions` 是否存在。
  - `gemini-cli`：检查 `SKILL_FLOW_USAGE_GEMINI_TELEMETRY_FILE`、`GEMINI_TELEMETRY_OUTFILE` 或 `~/.gemini/telemetry.log`。
  - `pi`：检查 `~/.pi/agent/sessions` 是否存在。
  - `cursor`：检查 `~/.cursor/projects/**/agent-transcripts/**/*.jsonl` 是否存在。
  - `grok-build`：检查 `~/.grok/sessions/**/chat_history.jsonl` 是否存在。
  - `workbuddy`：检查 `~/.workbuddy/traces`、`~/.workbuddy/app/sessions.json`、`~/.workbuddy/usage-log.json` 是否存在。
  - `opencode`：检查 `SKILL_FLOW_USAGE_OPENCODE_DB_PATH` 或 `~/.local/share/opencode/opencode.db`。
  - `kimi-code`：检查 `~/.kimi-code/sessions` 是否存在。
  - `zcode`：检查 `SKILL_FLOW_USAGE_ZCODE_DB_PATH` 或 `~/.zcode/cli/db/db.sqlite`。
- 对未实现 collector：
  - 只做目录或配置探测，不读取原始 conversation / memory / history。

#### 2026-08-24 剩余 Agent 本机 probe 结果

本轮只做路径存在性、文件数量和顶层结构探测；不读取 prompt、response、tool output、memory、VS Code 全局数据库或 task history 原文。结论：以下 12 个未实现 Agent 在默认路径下均未发现可进入字段级 parser 的本机数据源，因此继续按 policy 显示 `parser_unsupported`，不能显示为“已扫描 0 次使用”。

| Agent id | Probe 路径族 | 本机结果 | 处理结论 |
| --- | --- | --- | --- |
| `codebuddy` | `~/.codebuddy`、`~/.codebuddy/skills`、`~/.codebuddy/projects`、`~/.codebuddy/logs`、`~/.codebuddy/hooks` | 均不存在 | 保持 `candidate`；等待 OTel/hook 中明确 skill identity 字段 |
| `trae` | `~/.trae`、`~/.trae/skills`、`~/.trae/sessions`、`~/.trae/logs` | 均不存在 | 保持 `unsupported` / lifecycle only；不推断使用次数 |
| `trae-cn` | `~/.trae-cn`、`~/.trae-cn/skills`、`~/.trae-cn/sessions`、`~/.trae-cn/logs` | 均不存在 | 保持 `unsupported` / lifecycle only；不推断使用次数 |
| `minimax-code` | `~/.minimax`、`~/.mavis`、`~/.minimax/logs`、`~/.mavis/logs` | 均不存在 | 保持 `unsupported`；Mini-Agent 示例日志不等同产品 target |
| `hermes-agent` | `~/.hermes`、`~/.hermes/skills`、`~/.hermes/conversations`、`~/.hermes/sessions` | 均不存在 | 保持 `candidate`；没有 conversation schema 样本不实现 parser |
| `openclaw` | `~/.openclaw`、`~/.openclaw/skills`、`~/.openclaw/logs`、`~/.openclaw/sessions` | 均不存在 | 保持 `candidate`；无 dispatch/name 字段样本不实现 parser |
| `github-copilot` | `~/.copilot`、`~/.copilot/session-state`、VS Code `globalStorage/github.copilot-chat` | 均不存在 | 保持 `candidate`；CLI/VS Code OTel 需分别验证 |
| `windsurf` | `~/.codeium`、`~/.codeium/windsurf`、`skills`、`memories` | 均不存在 | 保持 `unsupported` / lifecycle only；不读取 memories |
| `amp` | `~/.config/agents`、`~/.config/agents/skills`、`~/.config/agents/logs`、`~/.amp` | 均不存在 | 保持 `candidate`；需要 plugin event sink 样本 |
| `kiro` | `~/.kiro`、`~/.kiro/skills`、`~/.kiro/hooks`、`~/.kiro/logs` | 均不存在 | 保持 `candidate`；默认不安装 hook |
| `roo-code` | `~/.roo`、`~/.roo/tasks`、VS Code `globalStorage/rooveterinaryinc.roo-cline` | 均不存在 | 保持 `unsupported` / diagnostic only；不泛读 `state.vscdb` |
| `cline` | `~/.cline`、`~/.cline/tasks`、VS Code `globalStorage/saoudrizwan.claude-dev` | 均不存在 | 保持 `unsupported` / diagnostic only；匿名 telemetry 不映射 skill 名 |

### 3. 字段级核对

- JSONL parser：
  - 流式逐行解析。
  - 只保留行号、时间、project 路径候选、tool block 的 skill 名。
  - 记录 invalid JSON count，但不回显原始行。
- SQLite parser：
  - 只查询 `session`、`part` 必要字段。
  - 查询条件必须过滤到 completed skill part。
  - `tool_usage` 仅可作为旁证，不能单独提供 skill 名时不得入库。
- OTel / hook parser：
  - 只接受明确 skill activation/name 字段。
  - tool input / prompt / output 默认不读取、不保存。

### 4. 入库核对

- 结构化 Skill 执行记录：
  - skill 能匹配 inventory：保存 `skillRef`，展示 inventory label。
  - skill 不能匹配 inventory：保存受限 `skillLabel`，标记 unknown，保留 unmatched diagnostic。
- 显式 `$skill` / `/skill`：
  - 必须匹配 inventory 才保存。
  - 不匹配直接丢弃，不产生 unknown skill 使用。
- project：
  - 保存 hash 后的 `projectRef`。
  - `projectLabel` 仅保存 basename。
  - 不保存原始绝对路径。

### 5. 测试核对

- collector 单测：
  - 每个已实现 Agent 至少有一条正例。
  - 至少覆盖 `SKILL.md` 路径不计数。
  - Codex 覆盖 active + archived root、`payload.type=user_message`、mirrored user projection 去重。
  - OpenCode / ZCode 覆盖 `state.status=error` 不计数。
  - 显式命令覆盖 user-role 正例、assistant-role 反例、XML tag 反例、路径反例。
  - Grok 覆盖“用户消息开头命令才计数，句中 `$skill` 和 `/tmp/...` 不计数”。
- service 单测：
  - 结构化 unknown skill 可入库并产生 unmatched diagnostic。
  - 显式 unknown skill 必须被丢弃。
  - project 路径不落盘。
  - retention 与 duplicate 行为不变。
- 真实 dry-run：
  - 输出每个 Agent 的 `sourcesFound`、`status`、`observedUses`、`parserRevision`。
  - 不输出原始 prompt/response/tool output。

## 当前优先级

| 优先级 | 内容 | 原因 |
| --- | --- | --- |
| P0 | 稳定现有 `claude-code`、`codex`、`opencode`、`zcode`、`gemini-cli`、`pi`、`kimi-code`、`cursor`、`grok-build`、`workbuddy` parser | 已有实现或明确本机数据源，能快速防止误计数 |
| P1 | 补 Cursor / Grok Build / CodeBuddy 的 OTel 或 hook proof | Cursor/Grok 已有 conservative local parser；direct event 仍需真实字段样本 |
| P2 | 调研 GitHub Copilot CLI / VS Code Copilot、Amp、Hermes、OpenClaw | 有潜在 session 或 event 来源，但隐私和 schema 风险更高 |
| P3 | Trae / Trae CN / Windsurf / Roo / Cline / Kiro / MiniMax Code | 当前主要是 lifecycle、diagnostic 或 unsupported，不能进入主计数 |

## 验收标准

- 文档中 22 个内置 Agent 均有配置路径和 usage 识别结论。
- 已实现 collector 的识别规则都有单测覆盖。
- 未实现或 unsupported Agent 不显示为“已扫描 0 次使用”，而是显示 parser 状态。
- 真实本机 refresh 后，主计数只包含结构化 Skill 执行或 inventory 匹配的显式命令。
- 派生 usage store 不包含原始 prompt、response、tool output 或绝对路径。

## 完成审计（2026-08-24）

| 要求 | 当前证据 | 状态 |
| --- | --- | --- |
| 逐一覆盖当前可配置 Agent | `TARGET_ORDER` 22 个 Agent 与本文件“当前可配置 Agent 清单”“代码层处理确认”“各 Agent Skill 调用识别方式”逐项对应；`usage-collectors.test.ts` 校验 `USAGE_AGENT_POLICIES` 覆盖 `TARGET_ORDER` | 已满足 |
| 统一标准和边界 | 主判定规则明确区分结构化 Skill 执行、user-role 显式命令、普通 tool call、lifecycle、安装/同步/导入；`USAGE_AGENT_POLICIES` 为代码层唯一边界表 | 已满足 |
| 已有可证明字段的 Agent 能读取 skill 调用记录 | 默认 collector 覆盖 `claude-code`、`codex`、`zcode`、`cursor`、`grok-build`、`pi`、`workbuddy`、`kimi-code`、`opencode`、`gemini-cli`；每个 implemented policy 有 parserRevision 与 collector 匹配测试 | 已满足 |
| 不能证明 skill identity 的 Agent 不误计数 | `candidate` / `unsupported` Agent 不进入默认 collector；`SkillUsageService` 全量 supportedAgents 测试证明无 collector 的 Agent 输出 `parser_unsupported`，不显示 `scanned/no_skill_signals` | 已满足 |
| 显式 `$skill` / `/skill` 不产生 unknown 误报 | `extractExplicitSkillCommands` 标记 `requiresKnownSkillMatch`；service 测试覆盖 unknown explicit command 被丢弃、known explicit command 入库 | 已满足 |
| 普通 toolCalls 不等于 skill 调用 | parser 只接受 `Skill` / `skill` / `activate_skill` 且有 skill/name；OpenCode/ZCode 只收 completed skill part；Grok 严格限制开头命令，广义误报被禁止 | 已满足 |
| Codex 覆盖 active + archived 会话 | `CodexUsageCollector` 默认读取 `sessions` 与 `archived_sessions`；本机验证 active 58 个、archived 207 个 JSONL 均已扫描，accepted 359 条 | 已满足 |
| 不保存原始敏感内容 | service 持久化测试确认不保存原始 project path、`sourceEventId`、`rawSkillName`；collector 只输出派生 observation；文档禁止保存 prompt/response/tool output/tool args | 已满足 |
| 后续维护不漂移 | `createDefaultSupportedUsageAgents()` 从 policy 派生；测试校验 policy、collector parserRevision、TARGET_ORDER 三者关系；coverage 按 supportedAgents 顺序输出 | 已满足 |

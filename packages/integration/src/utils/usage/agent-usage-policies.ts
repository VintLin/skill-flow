import type {
  DeploymentTargetName,
  UsageAgent,
  UsageEvidenceKind,
  UsageSourceKind,
} from "@skill-flow/domain/types";
import { TARGET_ORDER } from "../constants.js";

export type UsageAgentPolicyStatus = "implemented" | "candidate" | "unsupported";

export type UsageAgentEvidenceLevel =
  | "direct observed"
  | "local session parser"
  | "lifecycle only"
  | "unsupported";

export type UsageAgentCollectorPolicy = {
  kind: "jsonl-session" | "sqlite-session" | "telemetry";
  parserRevision: string;
  sourceKind: UsageSourceKind;
  evidenceKinds: readonly UsageEvidenceKind[];
};

export type UsageAgentPolicy = {
  agent: UsageAgent;
  status: UsageAgentPolicyStatus;
  evidenceLevels: readonly UsageAgentEvidenceLevel[];
  collector?: UsageAgentCollectorPolicy;
  sourceCandidates: readonly string[];
  acceptedSignals: readonly string[];
  rejectedSignals: readonly string[];
  privacyBoundary: string;
  planNote: string;
};

const STRUCTURED_OR_EXPLICIT = [
  "结构化 Skill/activate_skill tool call，且能取得 skill/name",
  "user-authored $skill 或 /skill 显式命令，且匹配当前 SkillFlow inventory",
];

const COMMON_REJECTED_SIGNALS = [
  "普通 tool call",
  "assistant/system 文本",
  "SKILL.md 路径或普通文件路径",
  "skill 安装、同步、导入、启用或会话存在",
];

const LOCAL_SESSION_PRIVACY = "只流式读取必要字段，派生 observation 后丢弃原始记录；不保存 prompt、response、tool output、tool args 或原始绝对路径。";
const DIRECT_EVENT_PRIVACY = "只接受字段白名单中的 skill identity、时间、agent/session/project hash 候选；不保存 prompt、content、tool args 或原始 payload。";
const UNSUPPORTED_PRIVACY = "不扫描原始 conversation/history/memory；无明确 skill identity 字段前只产生 parser_unsupported coverage。";

export const USAGE_AGENT_POLICY_REVISION = "usage-agent-policy@1";

function unsupportedDeploymentTargetPolicy(
  agent: DeploymentTargetName,
  sourceCandidates: readonly string[],
): UsageAgentPolicy {
  return {
    agent,
    status: "unsupported",
    evidenceLevels: ["lifecycle only"],
    sourceCandidates,
    acceptedSignals: ["无可进入主计数的默认信号"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "skill 目录存在"],
    privacyBoundary: UNSUPPORTED_PRIVACY,
    planNote: "当前仅支持部署与生命周期检测；未确认稳定调用事件前保持 parser_unsupported。",
  };
}

export const USAGE_AGENT_POLICIES = {
  "claude-code": {
    agent: "claude-code",
    status: "implemented",
    evidenceLevels: ["local session parser", "direct observed"],
    collector: {
      kind: "jsonl-session",
      parserRevision: "claude-code-session@1",
      sourceKind: "local-session",
      evidenceKinds: ["tool_call", "explicit_command"],
    },
    sourceCandidates: ["~/.claude/projects/**/*.jsonl", "Claude Code OTel skill.name event"],
    acceptedSignals: [
      "message.content[] 中 type=tool_use、name=Skill、input.skill 有值",
      ...STRUCTURED_OR_EXPLICIT.slice(1),
    ],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "Read/Edit tool use"],
    privacyBoundary: LOCAL_SESSION_PRIVACY,
    planNote: "已实现本地 JSONL parser；OTel direct event 可后续接入同一 policy。",
  },
  codex: {
    agent: "codex",
    status: "implemented",
    evidenceLevels: ["local session parser"],
    collector: {
      kind: "jsonl-session",
      parserRevision: "codex-session@1",
      sourceKind: "local-session",
      evidenceKinds: ["tool_call", "explicit_command"],
    },
    sourceCandidates: ["~/.codex/sessions/**/*.jsonl", "~/.codex/archived_sessions/**/*.jsonl"],
    acceptedSignals: [
      "payload/content block 中 tool/function 名为 Skill 或 activate_skill，且参数含 skill/name",
      "payload.role=user content 中的 $skill 或 /skill，且匹配当前 SkillFlow inventory",
      "payload.type=user_message message/text_elements/content 中的 $skill 或 /skill，且匹配当前 SkillFlow inventory",
    ],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "mirrored user projection 重复记录", "response 普通 toolCalls"],
    privacyBoundary: LOCAL_SESSION_PRIVACY,
    planNote: "已实现 active + archived rollout 扫描、user_message 读取与 mirrored projection 去重。",
  },
  zcode: {
    agent: "zcode",
    status: "implemented",
    evidenceLevels: ["local session parser"],
    collector: {
      kind: "sqlite-session",
      parserRevision: "zcode-sqlite@1",
      sourceKind: "local-session",
      evidenceKinds: ["tool_call"],
    },
    sourceCandidates: ["~/.zcode/cli/db/db.sqlite"],
    acceptedSignals: [
      "SQLite part.data 满足 type=tool、tool=Skill/skill/activate_skill、state.status=completed、state.input.skill/name 有值",
    ],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "state.status=error/aborted", "tool_usage 单独记录"],
    privacyBoundary: "只查询 session.directory、part.id、part.session_id、part.time_created、part.data 中的 completed skill part；不读取 transcript_path、prompt、response 或 tool output。",
    planNote: "已实现 SQLite completed skill part parser。",
  },
  cursor: {
    agent: "cursor",
    status: "implemented",
    evidenceLevels: ["local session parser", "direct observed"],
    collector: {
      kind: "jsonl-session",
      parserRevision: "cursor-agent-transcript@1",
      sourceKind: "local-session",
      evidenceKinds: ["tool_call", "explicit_command"],
    },
    sourceCandidates: ["~/.cursor/projects/**/agent-transcripts/**/*.jsonl", "Cursor Enterprise OTel logs"],
    acceptedSignals: [
      "agent transcript user-role 文本中的 $skill 或 /skill，且匹配当前 SkillFlow inventory",
      "agent transcript 中结构化 Skill/activate_skill tool call，且能取得 skill/name",
    ],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "团队 analytics 汇总", "本地 .cursor 配置或 plans", "MCP tool metadata"],
    privacyBoundary: LOCAL_SESSION_PRIVACY,
    planNote: "已实现 agent-transcripts JSONL parser；Enterprise OTel 可后续补 direct event parser。",
  },
  "grok-build": {
    agent: "grok-build",
    status: "implemented",
    evidenceLevels: ["local session parser", "direct observed"],
    collector: {
      kind: "jsonl-session",
      parserRevision: "grok-build-session@1",
      sourceKind: "local-session",
      evidenceKinds: ["tool_call", "explicit_command"],
    },
    sourceCandidates: ["~/.grok/sessions/**/chat_history.jsonl", "Grok Build OTel skill_activated event", "Grok hooks"],
    acceptedSignals: [
      "chat_history user 类型文本中的 $skill 或 /skill，且匹配当前 SkillFlow inventory",
      "grok_code.skill_activated 且能取得 skill.name",
      "hook/session 明确提供 skill activation/name",
    ],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "只有 tool.usage 但无 skill.name", "events/updates phase lifecycle"],
    privacyBoundary: LOCAL_SESSION_PRIVACY,
    planNote: "已实现 chat_history JSONL parser；本机严格扫描无结构化 Skill tool call，仅显式命令候选入 inventory-match 流程。",
  },
  pi: {
    agent: "pi",
    status: "implemented",
    evidenceLevels: ["local session parser"],
    collector: {
      kind: "jsonl-session",
      parserRevision: "pi-session@1",
      sourceKind: "local-session",
      evidenceKinds: ["tool_call", "explicit_command"],
    },
    sourceCandidates: ["~/.pi/agent/sessions/**/*.jsonl"],
    acceptedSignals: STRUCTURED_OR_EXPLICIT,
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "session tree 普通节点或工具结果"],
    privacyBoundary: LOCAL_SESSION_PRIVACY,
    planNote: "已实现 JSONL parser；本机当前 source 存在但无 skill signals。",
  },
  workbuddy: {
    agent: "workbuddy",
    status: "implemented",
    evidenceLevels: ["direct observed"],
    collector: {
      kind: "telemetry",
      parserRevision: "workbuddy-usage-log@1",
      sourceKind: "direct-event",
      evidenceKinds: ["selected"],
    },
    sourceCandidates: ["~/.workbuddy/usage-log.json"],
    acceptedSignals: ["usage-log.json 中 skills.<name>.type=skill 且 recentDates/lastUsedDate/firstSeenDate 为 ISO date"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "把 CodeBuddy 文档套用于 WorkBuddy", "traces/tasks 中普通 span/tool 信息", "mcps 聚合字段"],
    privacyBoundary: "只读取 usage-log.json 的 skills 聚合日期；不读取 traces/tasks 原文作为主计数，不保存 prompt、response、tool args 或原始路径。",
    planNote: "已实现 usage-log 聚合 parser；按日期记录至少一次使用，不伪造精确项目或单日多次调用。",
  },
  codebuddy: {
    agent: "codebuddy",
    status: "candidate",
    evidenceLevels: ["direct observed"],
    sourceCandidates: ["CodeBuddy OTel spans", "CodeBuddy hooks"],
    acceptedSignals: ["explicit skill/fork skill lifecycle 或 trace 明确标识 skill 名"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "普通 tool span", "HTTP stats/traces 汇总", "transcript_path 原文"],
    privacyBoundary: DIRECT_EVENT_PRIVACY,
    planNote: "普通注入式 skill 只产生下游工具 span 时不能判定为 skill 调用。",
  },
  trae: {
    agent: "trae",
    status: "unsupported",
    evidenceLevels: ["lifecycle only"],
    sourceCandidates: ["~/.trae/skills", ".trae/skills"],
    acceptedSignals: ["无可进入主计数的默认信号"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "skill 目录存在", "按需加载说明"],
    privacyBoundary: UNSUPPORTED_PRIVACY,
    planNote: "只有 inventory/lifecycle 证据，保持 parser_unsupported。",
  },
  "trae-cn": {
    agent: "trae-cn",
    status: "unsupported",
    evidenceLevels: ["lifecycle only"],
    sourceCandidates: ["~/.trae-cn/skills", "<project>/.trae/skills"],
    acceptedSignals: ["无可进入主计数的默认信号"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "SKILL.md 元数据或 skill 目录存在"],
    privacyBoundary: UNSUPPORTED_PRIVACY,
    planNote: "官方资料未提供调用事件，保持 parser_unsupported。",
  },
  "kimi-code": {
    agent: "kimi-code",
    status: "implemented",
    evidenceLevels: ["local session parser"],
    collector: {
      kind: "jsonl-session",
      parserRevision: "kimi-code-session@1",
      sourceKind: "local-session",
      evidenceKinds: ["tool_call", "explicit_command"],
    },
    sourceCandidates: ["~/.kimi-code/sessions/**/*.jsonl"],
    acceptedSignals: STRUCTURED_OR_EXPLICIT,
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "user-history"],
    privacyBoundary: LOCAL_SESSION_PRIVACY,
    planNote: "已实现 sessions parser；不读取 user-history。",
  },
  opencode: {
    agent: "opencode",
    status: "implemented",
    evidenceLevels: ["local session parser"],
    collector: {
      kind: "sqlite-session",
      parserRevision: "opencode-sqlite@1",
      sourceKind: "local-session",
      evidenceKinds: ["tool_call"],
    },
    sourceCandidates: ["~/.local/share/opencode/opencode.db"],
    acceptedSignals: [
      "SQLite part.data 满足 type=tool、tool=skill/Skill/activate_skill、state.status=completed、state.input.skill/name 有值",
    ],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "state.status=error/aborted", "普通 tool_usage"],
    privacyBoundary: "只查询 session.directory、part.id、part.session_id、part.time_created、part.data 中的 completed skill part；不读取 prompt、response 或 tool output。",
    planNote: "已实现 SQLite completed skill part parser。",
  },
  "minimax-code": {
    agent: "minimax-code",
    status: "unsupported",
    evidenceLevels: ["unsupported"],
    sourceCandidates: ["Mini-Agent logs 仅作 custom/实验候选"],
    acceptedSignals: ["内置 minimax-code target 无可进入主计数的默认信号"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "把 Mini-Agent 示例日志等同于 minimax-code 产品 target"],
    privacyBoundary: UNSUPPORTED_PRIVACY,
    planNote: "产品级 target 缺少稳定 schema，保持 parser_unsupported。",
  },
  "hermes-agent": {
    agent: "hermes-agent",
    status: "candidate",
    evidenceLevels: ["local session parser"],
    sourceCandidates: ["~/.hermes/ conversations"],
    acceptedSignals: ["conversation schema 中明确 Skill tool/activation/name"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "memory", "skills 目录"],
    privacyBoundary: "不得读取 memory 作为 usage 证据；conversation parser 需先确认 schema 并只抽取 skill identity 字段。",
    planNote: "未确认字段样本前保持 parser_unsupported。",
  },
  openclaw: {
    agent: "openclaw",
    status: "candidate",
    evidenceLevels: ["local session parser"],
    sourceCandidates: ["OpenClaw Gateway JSONL logs", "OpenClaw sessions"],
    acceptedSignals: ["log/session 明确包含 skill dispatch/name"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "Gateway 启动日志", "skill inventory"],
    privacyBoundary: LOCAL_SESSION_PRIVACY,
    planNote: "未复核到稳定 dispatch 字段前保持 parser_unsupported。",
  },
  "github-copilot": {
    agent: "github-copilot",
    status: "candidate",
    evidenceLevels: ["direct observed", "local session parser"],
    sourceCandidates: ["~/.copilot/session-state", "Copilot CLI SQLite", "VS Code Copilot OTel"],
    acceptedSignals: ["CLI session tools used 中明确 skill/tool skill 名", "VS Code OTel 明确 skill activation/name"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "Copilot metrics API 汇总", "modified files"],
    privacyBoundary: DIRECT_EVENT_PRIVACY,
    planNote: "需分别验证 CLI 与 VS Code Copilot schema 后再实现。",
  },
  "gemini-cli": {
    agent: "gemini-cli",
    status: "implemented",
    evidenceLevels: ["direct observed"],
    collector: {
      kind: "telemetry",
      parserRevision: "gemini-telemetry@1",
      sourceKind: "direct-event",
      evidenceKinds: ["skill_activated"],
    },
    sourceCandidates: ["GEMINI_TELEMETRY_OUTFILE", "~/.gemini/telemetry.log"],
    acceptedSignals: ["telemetry event 中 function_name=activate_skill 或等价 skill tool，且 function_args 含 skill/name"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "普通 tool_call", "prompt logs"],
    privacyBoundary: DIRECT_EVENT_PRIVACY,
    planNote: "已实现 telemetry parser。",
  },
  windsurf: {
    agent: "windsurf",
    status: "unsupported",
    evidenceLevels: ["lifecycle only"],
    sourceCandidates: ["~/.codeium/windsurf/skills", "enterprise system skills"],
    acceptedSignals: ["无可进入主计数的默认信号"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "memories", "skill 目录", "Cascade 普通活动"],
    privacyBoundary: UNSUPPORTED_PRIVACY,
    planNote: "无官方会话/调用 schema，保持 parser_unsupported。",
  },
  amp: {
    agent: "amp",
    status: "candidate",
    evidenceLevels: ["direct observed"],
    sourceCandidates: ["Amp plugin event stream"],
    acceptedSignals: ["plugin event 中 tool.call 明确为 skill/bundled skill 且能取得 skill 名"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "session.start", "agent.start/end", "普通 tool.call"],
    privacyBoundary: DIRECT_EVENT_PRIVACY,
    planNote: "需要用户安装/配置最小事件 sink 后才能实现。",
  },
  kiro: {
    agent: "kiro",
    status: "candidate",
    evidenceLevels: ["direct observed"],
    sourceCandidates: ["Kiro hooks"],
    acceptedSignals: ["用户安装 hook 且 hook payload 明确 skill/tool skill name"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "普通工具调用 hook", "文件修改 hook", "任务完成 hook"],
    privacyBoundary: DIRECT_EVENT_PRIVACY,
    planNote: "默认不安装 hook，不满足字段前保持 parser_unsupported。",
  },
  "roo-code": {
    agent: "roo-code",
    status: "unsupported",
    evidenceLevels: ["lifecycle only"],
    sourceCandidates: ["VS Code extension storage", "custom storage path"],
    acceptedSignals: ["无可进入主计数的默认信号"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "state.vscdb 泛读", "task history 普通文本"],
    privacyBoundary: UNSUPPORTED_PRIVACY,
    planNote: "公开资料未确认 skill 调用字段，保持 parser_unsupported。",
  },
  cline: {
    agent: "cline",
    status: "unsupported",
    evidenceLevels: ["lifecycle only"],
    sourceCandidates: ["Cline anonymous telemetry", "task history"],
    acceptedSignals: ["无可进入主计数的默认信号"],
    rejectedSignals: [...COMMON_REJECTED_SIGNALS, "匿名 features/tools/commands 汇总", "task completion/errors"],
    privacyBoundary: UNSUPPORTED_PRIVACY,
    planNote: "匿名 telemetry 不能映射具体 skill 名，保持 parser_unsupported。",
  },
  "deepseek-harness": unsupportedDeploymentTargetPolicy("deepseek-harness", ["~/.dsh/skills"]),
  antigravity: unsupportedDeploymentTargetPolicy("antigravity", ["~/.gemini/config/skills"]),
  junie: unsupportedDeploymentTargetPolicy("junie", ["~/.junie/skills"]),
  "mistral-vibe": unsupportedDeploymentTargetPolicy("mistral-vibe", ["~/.vibe/skills"]),
  openhands: unsupportedDeploymentTargetPolicy("openhands", ["~/.openhands/skills"]),
  qoder: unsupportedDeploymentTargetPolicy("qoder", ["~/.qoder/skills"]),
  "qwen-code": unsupportedDeploymentTargetPolicy("qwen-code", ["~/.qwen/skills"]),
  zencoder: unsupportedDeploymentTargetPolicy("zencoder", ["~/.zencoder/skills"]),
  "kilo-code": unsupportedDeploymentTargetPolicy("kilo-code", ["~/.kilocode/skills"]),
  goose: unsupportedDeploymentTargetPolicy("goose", ["~/.config/goose/skills"]),
} as const satisfies Record<DeploymentTargetName, UsageAgentPolicy>;

export function createDefaultUsageAgentPolicies(): UsageAgentPolicy[] {
  return TARGET_ORDER.map((agent) => USAGE_AGENT_POLICIES[agent]);
}

export function createDefaultUsagePolicyAgents(): UsageAgent[] {
  return createDefaultUsageAgentPolicies().map((policy) => policy.agent);
}

export function createImplementedUsageAgentPolicies(): UsageAgentPolicy[] {
  return createDefaultUsageAgentPolicies().filter((policy) => policy.status === "implemented");
}

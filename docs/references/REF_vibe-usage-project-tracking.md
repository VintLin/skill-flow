# Vibe Usage 项目跟踪参考

## 结论

`vibe-usage` 的“项目跟踪”不是扫描机器上的所有项目，也不是维护一个项目注册表。它做的是：

1. 先按工具定义好的本地数据目录判断该工具是否存在。
2. 再解析这些工具已经落盘的 session / log / sqlite 数据。
3. 从每条会话记录里抽取统一字段，至少包括：
   - `source`
   - `project`
   - `model`
   - `timestamp`
   - `inputTokens`
   - `outputTokens`
   - `cachedInputTokens`
   - `reasoningOutputTokens`
4. 再把逐条 usage 归并成半小时 bucket，并把消息时间线归并成 session 摘要。
5. 最后才上传或展示。

这套设计的关键价值不是“发现项目”，而是把“AI coding 工具已经产出的项目使用记录”统一成一个稳定结构。

## 从 `tools.js` 开始

`src/tools.js` 只负责一件事：定义支持哪些工具，以及这些工具的本地数据目录在哪里。

当前 `@vibe-cafe/vibe-usage` 0.7.1 内置的目录映射是：

| tool | local data dir |
| --- | --- |
| `antigravity` | `~/.gemini/antigravity` |
| `claude-code` | `~/.claude/projects` |
| `codex` | `~/.codex/sessions` |
| `copilot-cli` | `~/.copilot/session-state` |
| `gemini-cli` | `~/.gemini/tmp` |
| `opencode` | `~/.local/share/opencode` |
| `openclaw` | `~/.openclaw/agents` |
| `pi-coding-agent` | `~/.pi/agent/sessions` |
| `qwen-code` | `~/.qwen/tmp` |
| `kimi-code` | `~/.kimi/sessions` |
| `amp` | `~/.local/share/amp/threads` |
| `droid` | `~/.factory/sessions` |

检测逻辑非常直接：

- 不读配置
- 不做深度探测
- 不验证工具是否正在运行
- 仅用 `existsSync(dataDir)` 判断本地是否存在这个工具的可解析数据根目录

这意味着第一层只是“是否值得尝试解析”，不是“工具一定可用”。

## 从 `sync.js` 开始

`src/sync.js` 是统一编排层，不理解任何单个工具的数据格式。它的步骤是：

1. 读取本地 config，确保 API key 存在。
2. 遍历 `parsers/index.js` 中注册的每个 parser。
3. 每个 parser 返回：
   - `buckets`
   - `sessions`
4. 汇总所有 parser 结果。
5. 如果没有任何 bucket/session，直接返回 `No new usage data found.`
6. 给所有 bucket/session 打上当前机器 `hostname`。
7. 拉远端设置，判断是否允许上传真实 `project`。
8. 若不允许，则把全部 `project` 强制改成 `unknown`。
9. 分批上传：
   - bucket 每批 100
   - session 每批 500

这个分层很重要：

- `tools.js` 负责“目录存在性”
- 各 parser 负责“本地格式解析”
- `sync.js` 负责“统一编排、隐私处理、批量上传”

因此“项目跟踪”的核心并不在 `sync.js`，而在每个 parser 如何从本地会话里恢复 `project`。

## parser 的统一抽象

每个 parser 最终都要产出两类数据。

### 1. usage entries

最小结构可以理解为：

```ts
type UsageEntry = {
  source: string
  model: string
  project: string
  timestamp: Date
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  reasoningOutputTokens: number
}
```

这些 entry 最后会被 `aggregateToBuckets()` 按下面的 key 聚合：

```ts
${source}|${model}|${project}|${bucketStart}
```

其中 `bucketStart` 会被规整到整点或半点。

### 2. session events

最小结构是：

```ts
type SessionEvent = {
  sessionId: string
  source: string
  project: string
  timestamp: Date
  role: "user" | "assistant"
}
```

这些 event 最后会被 `extractSessions()` 归并成 session 摘要：

- `sessionHash`
- `firstMessageAt`
- `lastMessageAt`
- `durationSeconds`
- `activeSeconds`
- `messageCount`
- `userMessageCount`
- `userPromptHours`

也就是说，`vibe-usage` 真正稳定的不是底层日志格式，而是这两个中间层模型。

## `project` 是怎么提取出来的

`project` 不是统一字段，而是每个工具各自猜出来的。常见模式有四种。

### 1. 直接从 session meta 里的 `cwd` 或 git 信息取

典型是 `codex`：

- 先扫描 `~/.codex/sessions/**/*.jsonl`
- 找 `session_meta`
- 优先从 `payload.git.repository_url` 提取 `org/repo`
- 否则从 `payload.cwd` 取最后一个路径段

这属于最稳的一类，因为 session header 通常比消息正文更稳定。

### 2. 从文件路径反推项目名

典型是 `claude-code`：

- 扫 `~/.claude/projects/**/*.jsonl`
- Claude 把项目路径编码进目录名
- parser 从 `projects/{encodedProjectPath}/...` 的第一段目录恢复项目名

这类方式依赖工具自己的落盘目录命名约定。

### 3. 从消息记录里的上下文字段取

典型是 `copilot-cli` / `openclaw` / `pi-coding-agent`：

- `copilot-cli` 从 `session.start` / `session.resume` 的 `context.gitRoot` 或 `context.cwd` 取项目名
- `openclaw` 直接把 agent 目录名当项目名
- `pi-coding-agent` 优先读 session header 里的 `cwd`

这类方式本质上是“会话上下文字段优先，路径推断兜底”。

### 4. 从 sqlite 或结构化 JSON 中的 root path 取

典型是 `opencode`：

- 先尝试读 `~/.local/share/opencode/opencode.db`
- 用 `sqlite3` 查询 `message` 表
- 从 `$.path.root` 取项目根路径
- 取 basename 作为 `project`
- 若 sqlite 不可用，再回退到 legacy JSON

这类方式说明一个重要原则：同一个工具可以有多套存储格式，但输出结构不变。

## `session` 是怎么恢复出来的

`vibe-usage` 不要求每个工具本身提供完整 session summary。它只要求 parser 先吐出消息时间线，再统一归并。

`extractSessions()` 的逻辑是：

1. 按 `sessionId` 分组。
2. 按时间排序。
3. `durationSeconds` = 最后一条消息时间 - 第一条消息时间。
4. `activeSeconds` 不算整段 wall clock，而是只累计：
   - 用户发出 prompt 后
   - 第一条 assistant 响应开始
   - 到该轮最后一条 assistant 响应结束
5. 再统计用户消息数和用户 prompt 小时分布。

这说明它在做的是“会话活跃度估算”，不是严格审计。

## `sync.js` 之后的数据边界

`sync.js` 在上传前做了一次非常关键的收口：

- 所有 parser 自己决定如何提取 `project`
- 但是否保留真实项目名，不由 parser 决定
- 而由同步层统一按隐私设置改写成 `unknown`

这意味着：

- parser 负责尽量真实
- sync 层负责合规和隐私

这层边界适合复用。

## 本机可直接验证到的目录

按 `tools.js` 的规则，这台机器当前可直接命中的目录有：

- `antigravity`
- `claude-code`
- `codex`
- `gemini-cli`
- `opencode`
- `openclaw`

缺失的有：

- `copilot-cli`
- `pi-coding-agent`
- `qwen-code`
- `kimi-code`
- `amp`
- `droid`

本机实际文件形态也和 parser 假设一致：

- `~/.claude/projects/.../*.jsonl`
- `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`
- `~/.gemini/tmp/<project>/chats/session-*.json`
- `~/.local/share/opencode/...`

因此这份参考不是纸上推演，至少 Claude Code、Codex、Gemini CLI、OpenCode 这几类路径在本机上可直接落地验证。

## 对 `skill-flow` 的可复用点

如果把这套逻辑迁移到 `skill` 挂载项目，建议只复用它的“分层方式”，不要照搬 usage 语义。

### 可直接复用的设计

1. 先做工具根目录探测，不做重扫描。
2. 每个工具单独 parser，输出统一中间层。
3. 编排层只负责：
   - 聚合
   - 去隐私
   - 去重
   - 批处理
4. 观测数据和期望状态分离。

这与当前仓库已经在做的事情是一致的：

- [runtime.ts](../../packages/query/src/runtime.ts)
  已经承担统一编排和状态写入角色。
- [source-checkout-service.ts](../../packages/core-engine/src/services/source-checkout-service.ts)
  已经承担 source 解析、拉取和快照构建角色。
- [PLAN_v1.0.0_mount-projection-unification.md](../archives/plans/legacy-plan/cache/PLAN_v1.0.0_mount-projection-unification.md)
  已经明确区分 `manifest` 的期望状态和本地观察状态。

### 建议映射到 skill 挂载场景的中间层

不要直接复用 `UsageEntry`，而是抽象成“挂载观测事件”：

```ts
type MountedSkillObservation = {
  source: string
  tool: string
  project: string
  target: string
  skillName: string
  observedAt: string
  sessionId?: string
  mountPath?: string
  evidence: "session_meta" | "jsonl_path" | "sqlite_root" | "workspace_context"
}
```

再补一个按 session 或按项目归并后的摘要层：

```ts
type MountedSkillSession = {
  tool: string
  project: string
  sessionHash: string
  firstObservedAt: string
  lastObservedAt: string
  skillNames: string[]
  targetNames: string[]
  evidenceCount: number
}
```

这里保留 `project`，但把 token 统计换成与挂载相关的事实：

- 哪个工具
- 在哪个项目里
- 使用了哪些 skill
- 命中了哪个挂载目标
- 证据来自哪里

## 推荐的处理步骤

如果要在 `skill-flow` 里参考这套逻辑，建议处理顺序如下：

1. 定义支持的工具根目录表。
2. 只判断目录是否存在，得出“可尝试解析的工具集合”。
3. 为每个工具实现 parser。
4. 每个 parser 只负责把原始 session/log/sqlite 转成统一 observation。
5. 在统一层做：
   - `project` 归一化
   - `skillName` 归一化
   - 去重
   - session 聚合
6. 把结果写入单独的 observed ledger，不回写成用户 intent。

这一步非常关键：它应该像 `vibe-usage` 一样，只记录“已经发生过的事实”，而不是据此自动推断“用户想永久挂载什么”。

## 不建议直接照搬的部分

以下内容不适合直接搬进 `skill-flow`：

- `bucket` 的半小时聚合
  `skill` 挂载并不一定需要 token 时间桶。
- 以 token 为中心的 schema
  这里更关心 skill 命中、挂载目标、项目上下文。
- 远端隐私开关直接改写原始数据
  `skill-flow` 更适合保留本地原始观测，再在展示层决定是否脱敏。

## 对当前仓库最有价值的借鉴

最值得借鉴的不是某个 parser，而是这三个工程决定：

1. 用“工具目录存在性”做第一层过滤。
2. 用“每工具一个 parser”隔离底层格式差异。
3. 用“统一中间层”避免业务代码直接依赖各家 session/log/sqlite 细节。

如果后续在 `skill-flow` 中加入“skill 被哪些 AI coding 工具在哪些项目里实际使用过”的观测能力，这套结构足够作为第一版参考。

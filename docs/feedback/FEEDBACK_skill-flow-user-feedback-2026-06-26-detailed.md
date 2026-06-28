# skill-flow 用户反馈与优化建议

日期：2026-06-26

## 背景

本次使用 `skill-flow` 的目标是：根据一份已有的 skill group 安装清单，在一台新的 Windows 机器上重新安装并配置 skill group，最终只保留指定的 5 个 group 处于 ON 状态：

- `superpowers`
- `ponytail`
- `qiaomu-goal-meta-skill`
- `action-browser`
- `computer-care-skills`

实际过程中完成了安装、状态调整和投射修复，但遇到了若干用户体验、可观测性、性能和状态管理问题。本文从真实操作路径出发，整理问题与优化建议。

## 最终结果

最终状态符合用户目标：

- 22 个 group 已注册在 `skill-flow` 状态中。
- 仅 5 个目标 group 为 `ACTIVE`，并启用到 2 个 targets。
- 其它 group 保留安装记录，但 `enabledTargets` 为空，因此显示为 `INACTIVE` 或 `PARTIAL` 且 `0 targets`。
- 执行 `skill-flow repair-targets --all` 后，移除了 742 个不再需要的投射文件。

## 主要问题

### 1. 批量安装缺少原生命令

安装清单中有大量 source，需要逐个执行：

```bash
skill-flow add <source> --yes
```

实际操作中只能手写脚本循环调用 `skill-flow add`。这带来几个问题：

- 无法原生跳过已安装 source。
- 无法获得结构化的批量进度。
- 某一项耗时过长时，整批任务的状态不清晰。
- 批量命令超时后，需要手动检查哪些 group 已经写入状态。

建议新增：

```bash
skill-flow add-many <manifest-file> --yes
skill-flow add-many <source-list.txt> --yes
skill-flow import-manifest <manifest.json|md|jsonl>
```

并提供：

- `--continue-on-error`
- `--skip-existing`
- `--timeout-per-source <seconds>`
- `--summary <path>`
- `--dry-run`

批量结束后输出结构化结果：

```text
added: 16
skipped: 3
failed: 2
timed_out: 1
remaining: 7
```

### 2. 长耗时 add 缺少进度反馈

部分 group 安装明显较慢，例如：

- `garrytan/gstack`
- `wshobson/agents`
- `jimliu/baoyu-skills`

用户只能看到命令长时间无输出。由于 `skill-flow` 在安装期间持有全局 state lock，其他命令如 `skill-flow list` 也会被阻塞，进一步降低可见性。

建议 `skill-flow add` 输出阶段性进度：

```text
Resolving source...
Cloning repository...
Scanning skills...
Found 22 skills.
Resolving targets...
Writing manifest...
Repairing projections...
Done.
```

对于大型仓库，建议输出当前扫描路径或 skill 数量：

```text
Scanning repository: 128 files checked, 22 skill candidates found...
```

### 3. state lock 阻塞读操作

当一个 `skill-flow add` 正在运行时，`skill-flow list` 会等待同一个 mutation lock，并可能报错：

```text
Timed out waiting for state lock at C:\Users\babybus\.skillflow\.mutation.lock
```

从用户角度看，`list` 是读操作，应该尽量可用。即使不能读取最新一致状态，也应该能提供明确说明。

建议：

- 区分 read lock 与 write lock。
- 允许 `skill-flow list --stale` 读取最近一次完整状态。
- 当锁被占用时显示持有者信息：

```text
State is locked by:
  command: skill-flow add jimliu/baoyu-skills --yes
  pid: 16680
  started: 2026-06-26 10:47:28
  elapsed: 04:31
```

### 4. ON/OFF 概念不清晰

用户说“只想让这些 group ON，其它 OFF”。但 CLI 中没有直观的 `enable` / `disable` 命令。当前只能通过状态文件中的 `enabledTargets` 判断 active/inactive：

- `enabledTargets` 非空：group 对 target 生效。
- `enabledTargets` 为空：group 保留注册，但不投射到 target。

这对普通用户不透明，也容易导致误用 `uninstall`。`uninstall` 会删除 group，而不是仅关闭 group。

建议新增：

```bash
skill-flow enable <sourceId...>
skill-flow disable <sourceId...>
skill-flow only <sourceId...>
```

其中：

```bash
skill-flow only obra-superpowers dietrichgebert-ponytail joeseesun-qiaomu-goal-meta-skill vintlin-action-browser vintlin-computer-care-skills
```

语义应为：

- 指定 group 保持 enabled targets。
- 其它 group 清空 enabled targets。
- 不删除 source，不删除 lock 中的 source metadata。
- 自动执行 target repair 或提示用户确认。

### 5. source id 与显示名不一致

`skill-flow list` 输出中有些 group 带 owner 后缀：

```text
action-browser@vintlin
computer-care-skills@vintlin
ponytail@dietrichgebert
```

但 manifest 中真实 source id 是：

```text
vintlin-action-browser
vintlin-computer-care-skills
dietrichgebert-ponytail
```

用户在执行 enable/disable/uninstall 时需要 source id，但 `list` 默认没有直接显示 source id，容易混淆。

建议 `skill-flow list` 增加选项：

```bash
skill-flow list --ids
skill-flow list --json
skill-flow list --verbose
```

示例输出：

```text
DISPLAY                         SOURCE ID                         STATUS    TARGETS
action-browser@vintlin          vintlin-action-browser             ACTIVE    codex, cline
ponytail@dietrichgebert         dietrichgebert-ponytail            ACTIVE    codex, cline
```

### 6. Markdown 安装清单不能直接导入

用户提供的是 Markdown 表格，其中包含：

- Source ID
- Group
- Kind
- 来源

人类可读性很好，但 `skill-flow` 不能直接消费。需要手动复制“来源”列，并处理本地路径和 Git locator 的差异。

建议提供清单格式规范，并支持从 Markdown 表格导入：

```bash
skill-flow import skill-group-install-manifest.md --kind-column Kind --source-column 来源
```

同时对 local source 做迁移检查：

```text
Skipped local source because path does not exist on this machine:
  /Users/Vint/Repos/04_Skills/05_公司 Skills/bbcloud-passport
```

### 7. Windows 与跨机器迁移体验不足

清单中包含 macOS 路径：

```text
/Users/Vint/Repos/04_Skills/05_公司 Skills/bbcloud-passport
```

在 Windows 机器上显然不可用。当前需要使用者自己判断并跳过。

建议 `skill-flow` 在导入或 add 时提供平台诊断：

```text
Local source path appears to be from another OS.
Current OS: Windows
Source path: /Users/Vint/...
Action: skipped
```

并支持路径映射：

```bash
skill-flow import manifest.md --map-path "/Users/Vint/Repos=E:/Repos"
```

### 8. JSON 状态文件对 UTF-8 BOM 不兼容

手动修改 `manifest.json` 后，PowerShell 写入了 UTF-8 BOM，导致 `skill-flow` 读取失败：

```text
STATE_MIGRATION_BLOCKED
State authority file could not be read.
details: { cause: 'STATE_FILE_PARSE_FAILED' }
```

实际 JSON 内容有效，失败原因是文件开头存在 BOM。

建议：

- JSON 读取时兼容 UTF-8 BOM。
- 报错时明确提示：

```text
manifest.json contains a UTF-8 BOM. Remove the BOM or run:
  skill-flow repair-state-file --strip-bom
```

- 提供安全修复命令：

```bash
skill-flow repair-state-file --strip-bom
skill-flow doctor --fix-state-encoding
```

### 9. 缺少安全的状态编辑入口

为了实现“只保留 5 个 ON”，实际只能直接编辑：

```text
C:\Users\babybus\.skillflow\manifest.json
```

这很脆弱：

- 容易写错 JSON。
- 容易产生 BOM。
- 容易和 lock 文件或投射文件不一致。
- 必须手动运行 `repair-targets --all`。

建议提供正式的状态变更命令，而不是要求用户理解内部结构：

```bash
skill-flow apply-selection --only <sourceIds...>
skill-flow set-targets <sourceId> --targets codex,cline
skill-flow clear-targets <sourceId...>
```

这些命令应自动：

- 创建状态备份。
- 修改 manifest。
- 校验 lock 一致性。
- 修复 targets。
- 输出变更摘要。

### 10. PARTIAL 状态解释不够具体

`skill-flow list` 中出现：

```text
agents  PARTIAL  158 skills  0 targets, 1 warnings
anysearch-skill  PARTIAL  1 skills  0 targets, 1 warnings
```

但列表没有直接展示 warning 内容。用户需要额外运行 `doctor` 或其它命令才知道原因。

建议：

```bash
skill-flow list --warnings
```

输出：

```text
agents  PARTIAL  158 skills  0 targets
  warning: unmanaged external skill ...
```

同时需要区分两类 partial：

- group 自身解析/投射存在问题。
- 外部环境存在 unmanaged skill warning。

## 建议的目标用户流程

理想流程应当是：

```bash
skill-flow import skill-group-install-manifest-2026-06-26.md --yes --skip-local-missing
skill-flow only obra-superpowers dietrichgebert-ponytail joeseesun-qiaomu-goal-meta-skill vintlin-action-browser vintlin-computer-care-skills
skill-flow list --ids --warnings
```

用户应看到：

```text
Imported 22 groups.
Skipped 4 local sources because paths do not exist.
Enabled only 5 groups.
Removed 742 stale target projections.
```

最终列表应明确展示：

```text
SOURCE ID                              DISPLAY                         STATUS    TARGETS
obra-superpowers                       superpowers                     ACTIVE    codex, cline
dietrichgebert-ponytail                ponytail@dietrichgebert         ACTIVE    codex, cline
joeseesun-qiaomu-goal-meta-skill       qiaomu-goal-meta-skill          ACTIVE    codex, cline
vintlin-action-browser                 action-browser@vintlin          ACTIVE    codex, cline
vintlin-computer-care-skills           computer-care-skills@vintlin    ACTIVE    codex, cline
```

## 优先级建议

### P0

- 增加 `enable` / `disable` / `only` 命令。
- `skill-flow list --ids` 显示 source id。
- JSON 读取兼容 UTF-8 BOM。
- 锁等待时显示当前持锁命令和 PID。

### P1

- 增加批量安装命令 `add-many` 或 `import-manifest`。
- 为 `add` 输出阶段性进度。
- 支持 `list --json` 和 `list --warnings`。
- 支持 `--timeout-per-source` 和 `--continue-on-error`。

### P2

- Markdown 表格清单导入。
- local source 跨平台路径诊断。
- 路径映射参数。
- `doctor --fix-state-encoding`。

## 总结

`skill-flow` 的核心能力已经可用：它可以注册 group、解析 skills、投射到多个 agent target，并通过 `repair-targets` 修复最终状态。但当前 CLI 更像内部状态管理工具，缺少面向用户的批量迁移、启停管理和故障可观测性。

本次最明显的改进方向是把常见用户意图提升为一等命令：

- “根据清单安装” -> `import-manifest` 或 `add-many`
- “只打开这几个” -> `only`
- “查看真实 id 和 warning” -> `list --ids --warnings`
- “命令为什么卡住” -> lock owner 和 add progress
- “状态文件坏了怎么办” -> BOM 兼容和修复命令

这些改动不需要改变 skill-flow 的核心状态模型，但能显著降低跨机器迁移和批量管理时的操作成本。

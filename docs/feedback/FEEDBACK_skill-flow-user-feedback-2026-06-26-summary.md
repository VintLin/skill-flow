# SkillFlow 用户反馈与优化建议

日期：2026-06-26

## 背景

本反馈基于一次真实初始化操作：

- 从 `skills-install.md` 中导入 29 个 Git source skill groups。
- 只启用以下 5 个 group 到 `codex` target：
  - `superpowers`
  - `ponytail@dietrichgebert`
  - `qiaomu-goal-meta-skill`
  - `action-browser@vintlin`
  - `computer-care-skills@vintlin`
- 其余 group 只保持导入状态，不部署到任何 agent target。

最终结果可以完成，但过程中暴露出一些 CLI 语义、批量操作、状态可观察性和 Windows 体验上的问题。

## 总体评价

SkillFlow 的核心模型是有效的：source、leaf、binding、target 的分层清晰，`bridge --json` 能支持精确自动化，最终可以实现“批量导入但只启用部分 group”的目标。

主要问题不在底层能力，而在用户可发现性和非交互操作路径：普通 CLI 更偏交互式，批量初始化用户需要理解 bridge 协议和内部状态语义，学习成本偏高。

## 关键问题

### 1. `skill-flow add --yes` 语义容易误解

观察：

- 用户自然会认为 `--yes` 只是“跳过确认，使用默认选择”。
- 实际行为接近“启用该 source 下所有发现的 skills，并启用所有检测到的 targets”。
- 这与“只导入 source，稍后再配置”这种初始化场景冲突。

影响：

- 自动化脚本如果直接使用 `skill-flow add --yes`，可能意外部署大量 skills。
- 用户必须阅读源码或实验 bridge 行为，才能安全执行批量导入。

建议：

- 增加明确的 source-only 参数：

```bash
skill-flow add <source> --register-only
```

- 或增加配置更明确的参数组合：

```bash
skill-flow add <source> --skills none --agents none
skill-flow add <source> --skills all --agents codex
```

- 在 `--yes` 帮助文案中明确说明它会启用哪些 skills 和 targets。

优先级：P0

### 2. 缺少批量导入的一等命令

观察：

- 初始化清单通常是一个 source 列表。
- 当前需要写 PowerShell 脚本循环调用 `bridge --json`。
- 出错恢复、部分成功、重复导入、结果汇总都需要用户自己处理。

影响：

- 批量导入门槛高。
- 用户容易混淆“source 已导入”和“skills 已部署”。

建议：

- 支持 manifest 文件导入：

```yaml
sources:
  - source: obra/superpowers
    id: obra-superpowers
    skills: all
    targets: [codex]
  - source: garrytan/gstack
    skills: none
    targets: []
```

```bash
skill-flow import sources.yaml --dry-run
skill-flow import sources.yaml --apply
```

- 输出结构化 summary：

```text
Imported: 29
Enabled: 5
Inactive: 24
Failed: 0
Backup: C:\Users\...\skillflow.backup-...
```

优先级：P0

### 3. 普通 CLI 缺少精确配置命令

观察：

- `bridge --json` 可以精确 `apply` draft。
- 普通 CLI 中没有明显等价命令来设置某个 group 的 skills/targets。

影响：

- 用户需要绕到 bridge 协议。
- bridge 协议虽强，但对普通 CLI 用户不友好。

建议：

提供非交互配置命令：

```bash
skill-flow set obra-superpowers --skills all --targets codex
skill-flow set garrytan-gstack --skills none --targets none
skill-flow set --all-unmentioned --skills none --targets none
```

或者扩展 `config`：

```bash
skill-flow config set <sourceId> --skills all --agent codex
skill-flow config set <sourceId> --skills none --no-agents
```

优先级：P0

### 4. 状态语义不够直观：`selectionMode=all` 但 `selectedLeafIds=[]`

观察：

- 启用所有 skills 后，`manifest.json` 中表现为：

```json
{
  "selectionMode": "all",
  "selectedLeafIds": [],
  "enabledTargets": ["codex"]
}
```

- 如果用户只看 `selectedLeafIds.Count`，会误以为没有选中任何 skill。
- `skill-flow list` 能正确显示 active skill 数，但状态文件本身容易误读。

影响：

- 自动化验证脚本容易写错。
- 排查时容易怀疑配置失败。

建议：

- 在 `inspect` 或 `bridge list` 输出中增加 resolved 字段：

```json
{
  "selectionMode": "all",
  "selectedLeafIds": [],
  "resolvedSelectedLeafCount": 14,
  "resolvedEnabledTargets": ["codex"]
}
```

- 文档中明确说明：`selectionMode=all` 时空 `selectedLeafIds` 不是未选择，而是表示全选。

优先级：P1

### 5. `list` 输出中 display name 重复，source 身份不够清楚

观察：

- 多个 group 都显示为 `skills`：
  - `vercel-labs-skills`
  - `mattpocock-skills`
  - `anthropics-skills`
- `skill-flow list` 默认只显示 display name，不显示 source id。

影响：

- 用户难以确认具体是哪一个 source。
- 对初始化清单做核对时需要再查 manifest。

建议：

- 增加 `--ids` 或默认显示 source id：

```bash
skill-flow list --ids
```

示例输出：

```text
skills  vercel-labs-skills  INACTIVE  1 skills  0 targets
skills  anthropics-skills   PARTIAL   18 skills 0 targets
```

优先级：P1

### 6. `PARTIAL` 状态需要更清楚地区分来源

观察：

- 部分未启用 target 的 group 显示 `PARTIAL`，原因是 metadata warning 或无效 leaf。
- `skill-flow doctor` 也显示 `PARTIAL`，但原因是本地已有 unmanaged Codex skills。

影响：

- 用户容易把 `PARTIAL` 理解为导入失败或部署失败。
- 需要额外判断 warning 是否影响当前目标。

建议：

- 将状态拆细：

```text
INACTIVE_WITH_WARNINGS
ACTIVE_WITH_WARNINGS
UNMANAGED_EXTERNALS
```

- `doctor` 输出增加结论摘要：

```text
Managed sources: OK
Managed projections: OK
External unmanaged skills: 7 warnings
```

优先级：P1

### 7. Windows / PowerShell JSON 调用体验较差

观察：

- 在 PowerShell 中直接传：

```powershell
skill-flow bridge --json --request '{"protocolVersion":"1.0"}'
```

容易因为引号转义失败导致 JSON parse error。

- 可行方式是：

```powershell
$req = @{ protocolVersion = '1.0'; command = 'list' } | ConvertTo-Json -Compress
$req | skill-flow bridge --json
```

影响：

- Windows 用户调试 bridge API 时容易卡在 shell quoting，而不是 SkillFlow 本身。

建议：

- 文档增加 PowerShell 示例。
- `bridge --json --request` 在 JSON parse 失败时提示 PowerShell 推荐写法。
- 支持 `--request-file`：

```bash
skill-flow bridge --json --request-file request.json
```

优先级：P1

### 8. 缺少自动备份与回滚提示

观察：

- 批量导入前需要手动备份 `~/.skillflow`。
- 用户需要自己决定备份路径和恢复方式。

影响：

- 批量操作风险偏高。
- 出错后回滚流程不够显式。

建议：

- 对批量导入、批量配置、迁移类命令默认创建备份。
- 输出恢复命令：

```text
Backup created: C:\Users\...\skillflow.backup-20260626-143552
Rollback: skill-flow restore-backup C:\Users\...\skillflow.backup-20260626-143552
```

优先级：P1

### 9. CLI 版本来源容易混淆

观察：

- 本地仓库 `apps/cli/package.json` 中版本是 `1.5.1`。
- `npm install -g skill-flow` 后实际 CLI 版本是 `1.4.3`。

影响：

- 用户可能以为正在使用本地仓库最新版，实际使用的是 npm 上的旧版。
- 排查行为差异时容易误判。

建议：

- `skill-flow --version --verbose` 输出安装来源：

```text
skill-flow 1.4.3
installedFrom: npm global
binary: C:\Users\...\npm\skill-flow.ps1
stateRoot: C:\Users\...\skillflow
```

- README 中明确区分 npm release 与本地开发版本。

优先级：P2

## 推荐目标工作流

理想初始化体验应支持以下路径：

```bash
skill-flow import skills-install.yaml --dry-run
skill-flow import skills-install.yaml --apply
skill-flow list --ids --summary
skill-flow doctor --managed-only
```

其中 `skills-install.yaml` 可以表达：

```yaml
sources:
  - source: obra/superpowers
    skills: all
    targets: [codex]
  - source: https://github.com/vintlin/action-browser.git
    skills: all
    targets: [codex]
  - source: garrytan/gstack
    skills: none
    targets: []
```

执行后应输出：

```text
Backup: C:\Users\babybus\.skillflow.backup-20260626-143552
Sources imported: 29
Groups enabled: 5
Groups kept inactive: 24
Managed projections changed: 31
Warnings: 0 blocking, 7 external unmanaged
```

## 建议优先级汇总

| 优先级 | 建议 |
| --- | --- |
| P0 | 增加 `--register-only` 或 `--skills none --agents none` |
| P0 | 增加批量 import 命令，支持 dry-run/apply |
| P0 | 增加非交互 `set/config set` 命令 |
| P1 | 在 inspect/list 中输出 resolved selected skill count |
| P1 | `list --ids` 显示 source id，解决 display name 重复 |
| P1 | 细分 `PARTIAL`，区分 managed warning 与 external unmanaged warning |
| P1 | 增加 PowerShell bridge 示例和 `--request-file` |
| P1 | 批量操作默认备份，并提供恢复命令 |
| P2 | `--version --verbose` 显示 CLI 来源、binary 路径、state root |

## 用户侧临时规避方案

在上述能力落地前，安全批量初始化可以按以下原则执行：

1. 批量操作前备份 `~/.skillflow`。
2. 不使用 `skill-flow add --yes` 做“仅导入”。
3. 使用 `bridge --json`：
   - `add` 时传 `skipTargetDetection=true`。
   - 对不启用的 group 立刻 `apply` 空 draft。
   - 对要启用的 group `apply` `{ selectedLeafIds: all leaf ids, enabledTargets: ["codex"] }`。
4. 验证时以 `skill-flow list`、`bridge inspect` 和 `.codex/skills` junction 为准，不直接用 `selectedLeafIds.Count` 判断是否启用。


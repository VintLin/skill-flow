> 中英对照 / English & Chinese

## Summary｜概述

**EN.** Two related gaps that share one root cause: skillflow's source scanner and target model are hardcoded to `/skills` only. Upstream plugin repos ship more than skills, and users with multi-profile setups need each asset type synced to the right directory in each profile.

**中.** 两个相互关联的问题，根因相同：skillflow 的源扫描和 target 模型都写死了 `/skills`。但上游插件仓库里不止有 skills，并且多 profile 用户需要把每种资产类型同步到每个 profile 对应的目录。

---

## Gap 1 — skillflow only scans `skills/`｜只扫描 skills/ 目录

**EN.** Sources cloned under `~/.skillflow/source/git/*` often contain other Claude Code plugin asset directories that skillflow never surfaces.

**中.** `~/.skillflow/source/git/*` 下克隆的源仓库里经常包含其它 Claude Code 插件资产目录，但 skillflow 完全看不到。

### Reproduction｜复现步骤

1. Add `obra/superpowers` as a source and enable it.｜把 `obra/superpowers` 加为 source 并启用。
2. Inspect the cloned source｜查看本地克隆：
	```
	~/.skillflow/source/git/obra-superpowers/
	├── skills/         ← scanned & installable｜被扫描，可安装 ✅
	└── commands/       ← exists on disk, ignored｜文件存在，但被忽略 ❌
	    ├── brainstorm.md
	    ├── execute-plan.md
	    └── write-plan.md
	```
3. **EN.** UI source-detail "文件树" omits `commands/` entirely; `~/.claude/commands/` gets no entries.  
	**中.** UI 源详情的"文件树"完全没显示 `commands/`；`~/.claude/commands/` 里也不会出现任何来自此源的条目。

### Affected upstream sources (sampling)｜受影响的上游源（部分）

```
obra-superpowers/commands/
anthropics-knowledge-work-plugins/*/commands/   (brand-voice, slack, common-room, pdf-viewer, product-management)
composiohq-awesome-claude-skills/connect-apps-plugin/commands/
```

### Evidence in local state｜本地状态佐证

```
$ grep -c '"commands"' ~/.skillflow/{manifest.json,lock.json}
manifest.json:0
lock.json:0
```

**EN.** All `bindings[*].selectedLeafIds` use the shape `<source>:skills/<name>` — no other leaf shape exists.  
**中.** 所有 `bindings[*].selectedLeafIds` 都是 `<source>:skills/<name>` 形态，不存在其它 leaf 形态。

---

## Gap 2 — `customTargets` is locked to `/skills` paths｜customTargets 只能指向 /skills

**EN.** This matters because many users (myself included) run multiple Claude Code profiles via `CLAUDE_CONFIG_DIR=~/claude-profiles/<profile>` and need every asset type synced to that profile, not just skills.

**中.** 这点很关键，因为很多用户（包括我自己）会用 `CLAUDE_CONFIG_DIR=~/claude-profiles/<profile>` 跑多个 Claude Code profile，需要的是把**每种**资产类型都同步到该 profile，而不仅仅是 skills。

### Current shape｜当前数据形态

`~/.skillflow/preferences.json`:

```json
\"customTargets\": [{
  \"id\": \"claude-dom-work\",
  \"name\": \"claude-dom (work)\",
  \"globalPath\": \"/Users/renzhen/claude-profiles/work/skills\",   // hardcoded｜写死
  \"projectPathTemplate\": \".claude/skills\",                      // hardcoded｜写死
  \"strategy\": \"symlink\"
}]
```

**EN.** A custom target points to a single `<profile>/skills` directory. There is no way to tell skillflow that the same target should also sync `commands/` → `<profile>/commands`, `agents/` → `<profile>/agents`, etc.

**中.** 一个 custom target 只能指向单个 `<profile>/skills` 目录。无法告诉 skillflow：同一个 target 也应该把 `commands/` 同步到 `<profile>/commands`，`agents/` 同步到 `<profile>/agents`，等等。

### My layout｜我的实际目录布局

work profile via paseo-launcher｜通过 paseo-launcher 启动的 work profile：

```
~/claude-profiles/work/
├── skills/      (30 symlinks, managed by skillflow｜30 个软链接，由 skillflow 管理 ✅)
└── commands/    (1 file, hand-copied｜1 个文件，手动复制 ❌)
```

**EN.** Today I have to hand-copy `to-paseo.md` into both `~/.claude/commands/` and `~/claude-profiles/work/commands/` after every edit.

**中.** 现在每次改完 `to-paseo.md` 都要手动复制到 `~/.claude/commands/` 和 `~/claude-profiles/work/commands/` 两个位置。

---

## Proposed direction｜建议方向

1. **EN.** Source scanner: recognize all Claude Code plugin asset dirs per the plugin spec (`skills/`, `commands/`, `agents/`, `hooks/`, `output-styles/`), with stable leaf IDs like `<source>:commands/<name>`.  
	**中.** 源扫描器：按 Claude Code 插件规范识别所有资产目录（`skills/`、`commands/`、`agents/`、`hooks/`、`output-styles/`），用稳定的 leaf id 例如 `<source>:commands/<name>`。
2. **EN.** Custom target model: replace the single `globalPath` / `projectPathTemplate` with a per-asset-type mapping (or a parent path + conventional subdirs), so one "claude-dom (work)" target covers `skills`, `commands`, `agents`, etc.  
	**中.** Custom target 模型：把单一的 `globalPath` / `projectPathTemplate` 改成"按资产类型分别配置"（或一个父路径 + 约定子目录），让一个 "claude-dom (work)" target 同时覆盖 `skills`、`commands`、`agents` 等。
3. **EN.** UI: list non-skill leaves in the source detail view and allow per-leaf enable/disable just like skills.  
	**中.** UI：在源详情里列出非 skill 的 leaves，像 skill 一样允许逐个启用/禁用。

**EN.** Without (2), even if (1) ships, multi-profile users still can't direct commands to the right place.  
**中.** 没有 (2) 的话，即使 (1) 落地了，多 profile 用户仍然无法把 commands 安装到正确目录。

---

## Environment｜环境

- skillflow manifest schemaVersion: 1
- macOS, default install at `~/.skillflow/`
- **EN.** Profiles managed via a `paseo-launcher` wrapper that exports `CLAUDE_CONFIG_DIR=~/claude-profiles/<profile>`  
	**中.** 通过 `paseo-launcher` 脚本切换 profile，由它导出 `CLAUDE_CONFIG_DIR=~/claude-profiles/<profile>`
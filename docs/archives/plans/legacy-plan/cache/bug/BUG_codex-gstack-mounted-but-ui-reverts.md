# Codex 挂载状态回退但磁盘软链接保留

## 问题概述

在桌面端对 `gstack` 执行「挂载到 Codex」操作后，界面最初会正确显示为已挂载，且目标目录 `/Users/Vint/.codex/skills` 中也会成功创建软链接。

但在短时间后，桌面端图标状态会回退为未挂载。

此时实际磁盘状态与界面状态不一致：

- UI：显示未挂载
- `/Users/Vint/.codex/skills`：仍保留完整且可用的 `gstack` 相关软链接
- `manifest.json` / `lock.json`：回退为未挂载状态

这不是“挂载失败”，而是“挂载成功后，状态文件被后续流程覆盖为关闭态”。

## 复现现象

复现路径：

1. 在桌面端打开 `gstack`
2. 点击 `codex` 挂载按钮
3. 初始表现：
   - 按钮/图标显示已挂载
   - `/Users/Vint/.codex/skills` 下生成 `gstack` 与其子 skill 软链接
4. 稍后表现：
   - UI 回退为未挂载
   - `/Users/Vint/.codex/skills` 中软链接仍然存在

最终形成“状态文件认为未挂载，磁盘实际上仍挂载”的分叉。

## 当前证据

### 1. 审计日志证明最后一次挂载操作成功

文件：

- `/Users/Vint/.skillflow/audit.log.jsonl`

最后一次关键 `apply-draft` 记录显示：

- `sourceId = garrytan-gstack`
- `enabledTargets` 从 `[]` 变为 `["codex"]`
- `after.projectionCount = 32`
- `after.projections[*].targetPath` 指向 `/Users/Vint/.codex/skills/*`

说明：

- 用户点击挂载时，底层保存成功
- 目标路径软链接创建成功
- 该次 mutation 本身没有失败

### 2. 当前磁盘仍处于已挂载状态

文件系统检查结果：

- `/Users/Vint/.codex/skills/gstack`
- `/Users/Vint/.codex/skills/autoplan`
- `/Users/Vint/.codex/skills/benchmark`
- 以及其余 `gstack` 子 skill 软链接均存在

说明：

- 文件系统层面的挂载并未被后续流程清理
- 因此“UI 变灰”不是因为卸载真的执行完成

### 3. 当前状态文件已回退为未挂载

文件：

- `/Users/Vint/.skillflow/manifest.json`
- `/Users/Vint/.skillflow/lock.json`

当前状态：

- `manifest.bindings["garrytan-gstack"].selectedLeafIds` 仍然存在
- `manifest.bindings["garrytan-gstack"].targets = {}`
- `lock.json` 中 `garrytan-gstack` 对应 `projections = []`

说明：

- source 仍存在
- skill 选择仍存在
- 但 target 绑定和 projection 记录被后续流程清空

这正好解释了为什么：

- UI 读到的是“未挂载”
- 磁盘仍保留“已挂载”

## 根因判断

## 结论

这是一个架构层问题在具体代码路径上的表现，不是单一按钮逻辑错误。

核心问题是：

- 用户主动保存挂载状态的路径
- 刷新 / 自愈 / 重建状态的路径

两者都在修改同一份主状态文件 `manifest.json` / `lock.json`，导致系统中不存在严格单一的状态写入入口。

最终结果是：

- `applyDraft` 刚写入“已挂载”
- 后续某条刷新路径又拿旧状态或推导状态覆盖写回
- 状态文件回退，但磁盘没有同步清理

因此形成：

- 状态层：未挂载
- 文件系统层：已挂载

## 疑似问题链路

### A. 正常写入路径

桌面端保存 target toggle 时，调用：

- `MainViewModel.commitDraftChange(...)`
- bridge `apply`
- runtime `applyDraft(...)`

这条路径会：

- 写 `manifest.bindings[sourceId].targets`
- 规划并应用 deployment
- 写 `lock.projections`
- 审计记录到 `audit.log.jsonl`

这条路径的行为从日志看是正确的。

### B. 可疑覆盖路径

桌面端保存成功后，还会触发延迟刷新：

- `scheduleDeferredDraftSync(for:)`
- 250ms 后执行 `refreshList()`

而 `refreshList()` 会调用 bridge `list()`，进而进入：

- `listWorkflowsImpl()`

这条刷新路径内部会执行：

- `pruneMissingCheckoutsImpl()`
- `sourceService.reconcileInventory(force: true)`
- `persistNormalizedBindings(manifest, lockFile)`

这些步骤会再次写 `manifest.json` / `lock.json`，但并不属于同一次 `apply-draft` 审计 mutation。

换言之，系统存在“刷新流程也能改主状态”的设计。

## 关键矛盾

当前系统把以下两类操作混在一起了：

### 1. 用户意图写入

例如：

- 开启/关闭 target
- 开启/关闭 leaf

这是主状态，应该以用户操作为准。

### 2. 刷新/推导/自愈

例如：

- reconcile inventory
- normalize bindings
- list/bootstrap/doctor 期间的重建

这些本质上应该是派生、校正或补全逻辑，不应该覆盖刚刚由用户保存的 target enabled 状态。

当前问题说明：

- 刷新链路拥有过高写权限
- 并且它可能基于旧快照、推导结果或不完整状态回写主配置

## 当前最可能的直接故障点

现象表明，后续写回时丢失的是：

- `manifest.bindings["garrytan-gstack"].targets`
- `lock.projections` 中属于 `garrytan-gstack` 的 managed records

但没有丢失的是：

- `manifest.bindings["garrytan-gstack"].selectedLeafIds`
- source 本身
- 实际磁盘软链接

这说明后续覆盖更像是“状态重建不完整”而不是“完整卸载执行成功”。

也即：

- 不是先正确卸载再残留文件
- 而是状态层被覆盖为空，但磁盘没有被清理

## 为什么这不是单点按钮 bug

如果只是按钮点击逻辑错误，通常会出现以下之一：

1. 根本没有创建软链接
2. `apply-draft` 审计直接显示失败
3. UI 和磁盘同时错误

但本次不是：

1. 审计显示 `apply-draft` 成功
2. 软链接确实创建成功
3. 只有后续状态文件回退

所以问题不在按钮点击入口，而在保存后的系统同步与状态收敛机制。

## 影响范围

该问题理论上不只影响：

- `codex`
- `gstack`

只要满足以下条件，都可能复发：

- 保存后立即触发 `refreshList`
- 刷新链路继续写 `manifest/lock`
- 目标路径仍保留旧的或新的投影

因此潜在影响范围包括：

- 其他 agent target
- 其他 source group
- doctor / bootstrap / list 之后的 UI 状态一致性

## 风险

当前风险主要有三类：

### 1. 用户认知错误

用户看到 UI 未挂载，会误以为没有生效，但实际磁盘仍生效。

### 2. 后续操作基于错误状态继续执行

因为状态文件已回退为空，后续再点击挂载/卸载时，系统会基于错误前提继续计算。

### 3. 自愈流程继续扩大分叉

如果未来又有清理逻辑只看状态文件、不看磁盘，可能进一步出现：

- 状态未挂载
- 磁盘仍挂载
- 后续部分清理或部分重建

最终形成更复杂的漂移。

## 修复约束

后续修复必须满足以下约束：

1. 主状态写入权必须收敛
   - 用户绑定状态只能由明确 mutation 写入

2. 刷新链路默认只读或只修派生数据
   - `list` / `bootstrap` / `doctor` 不应覆盖用户刚保存的 target enabled 状态

3. 状态与磁盘必须原子收敛
   - 不能再出现“状态未挂载但磁盘仍挂载”的长时间分叉

4. 审计范围应覆盖关键写状态路径
   - 至少要能看见是谁在 `apply-draft` 之后又写坏了 `manifest/lock`

## 当前阶段结论

当前可以确认的最终结论：

- 最后一次挂载操作成功
- UI 回退不是因为卸载成功
- 是后续刷新/同步流程把状态文件覆盖成了未挂载
- 文件系统未同步清理，因此产生状态分叉

该问题属于：

- 架构级状态写入边界不清
- 在具体实现上表现为刷新链路覆盖主状态


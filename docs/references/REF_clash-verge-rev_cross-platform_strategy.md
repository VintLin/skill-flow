# `clash-verge-rev` 跨平台实现与 `skill-flow` 桌面扩展参考

## 结论

`clash-verge-rev` 采用的是一条很典型、也很成熟的跨平台桌面路线：

1. 前端 UI 统一为一套 Web 应用：`React + Vite`。
2. 桌面壳统一为一套跨平台运行时：`Tauri 2`。
3. 系统能力、后台守护、托盘、开机启动、安装器、权限提升等放在 `Rust` 层。
4. 平台差异不在 UI 层分叉，而是在：
   - `tauri.*.conf.json`
   - Rust 的 `cfg(target_os = ...)`
   - sidecar / service 安装脚本
   - CI 打包矩阵

对 `skill-flow` 来说，最合适的 Windows / Ubuntu 支持方案不是继续把当前 `apps/desktop-mac` 的 SwiftUI 壳横向复制成 WinUI / GTK / Qt 多套原生壳，而是把当前已经稳定的 `CLI + bridge protocol + shared runtime` 保留为单一事实源，再新增一个统一的跨平台桌面壳。

推荐路线：

1. 保留 `skill-flow bridge --json` 作为唯一业务入口和协议边界。
2. 新建跨平台桌面应用，优先选 `Tauri 2 + React/Vite + TypeScript`。
3. 将当前 SwiftUI 桌面端逐步降级为：
   - 短期继续维护的 macOS 专用壳，或
   - 在跨平台桌面版稳定后直接替换。
4. Windows / Ubuntu 不要继续依赖“桌面壳再拉起外部 Node helper”的方式发布，改为桌面应用自己内置运行时和平台打包能力。

如果目标是“最小新增复杂度下尽快支持 Windows 和 Ubuntu”，最佳策略是：

- 业务层继续复用现有 monorepo 的 TypeScript 包。
- 桌面层新增一个跨平台壳。
- 逐步把现在只存在于 SwiftUI 的视图状态和交互模型迁回共享 TS 层，避免未来再出现两套 UI 逻辑。

## `clash-verge-rev` 的技术栈

从仓库结构和构建入口看，`clash-verge-rev` 的桌面栈是：

### Web / UI 层

- `React 19`
- `Vite 8`
- `TypeScript`
- `MUI`
- `React Router`
- `SWR`
- 若干前端编辑器、表格、虚拟列表、i18n 相关库

对应入口：

- `package.json`
- `src/`

### 桌面宿主层

- `Tauri 2`
- `@tauri-apps/api`
- 多个官方/社区 Tauri plugin

对应入口：

- `src-tauri/tauri.conf.json`
- `src-tauri/tauri.windows.conf.json`
- `src-tauri/tauri.linux.conf.json`
- `src-tauri/tauri.macos.conf.json`

### 系统能力层

- `Rust`
- 大量平台条件编译
- sidecar 二进制
- service 安装/卸载程序
- tray / global shortcut / autostart / updater / deep link 等系统集成

对应入口：

- `src-tauri/src/`
- `src-tauri/src/core/service.rs`
- `src-tauri/src/core/tray/mod.rs`
- `src-tauri/src/core/hotkey.rs`
- `src-tauri/src/core/sysopt.rs`

### 打包 / 发布层

- GitHub Actions 多平台矩阵
- Windows: `nsis`
- Linux: `deb` / `rpm`
- macOS: `app` / `dmg`
- updater 元数据按平台生成

对应入口：

- `.github/workflows/release.yml`
- `.github/workflows/autobuild.yml`
- `scripts/updater.mjs`
- `scripts/portable.mjs`

## `clash-verge-rev` 的跨平台实现方式

`clash-verge-rev` 的关键不是“代码里写了很多 `if windows/linux/macos`”，而是边界切得比较清楚。

## 1. UI 只保留一套

前端页面都在 `src/` 下，Windows、Linux、macOS 不分别维护三套窗口 UI。这样平台扩展时，主成本不会落在页面重写，而是在系统能力适配。

这点非常关键。只要桌面交互的主体还是列表、设置、表单、日志、详情页，Web UI 的跨平台复用率远高于多套原生 GUI。

## 2. 平台差异集中在宿主配置

Tauri 基础配置放在 `src-tauri/tauri.conf.json`，平台特定差异拆分为：

- `tauri.windows.conf.json`
- `tauri.linux.conf.json`
- `tauri.macos.conf.json`

这种拆法的价值是：

- 通用配置只写一次
- 打包目标、安装器、依赖、权限、资源按平台覆盖
- 不把大量平台发布逻辑塞回前端工程

例如：

- Windows 配 `nsis`、WebView2 安装模式、安装器模板
- Linux 配 `deb/rpm`、系统依赖、desktop 文件、安装/卸载脚本
- macOS 配 `dmg`、entitlements、Info.plist 合并

## 3. 系统能力在 Rust 层收口

`clash-verge-rev` 的 tray、service、hotkey、权限提升、系统代理、深链等能力不从前端直接拼凑，而是收口到 Rust。

具体做法是：

- 通用命令通过 Tauri command 暴露给前端
- 平台差异通过 `#[cfg(target_os = "...")]` 收敛
- 同一能力保持统一调用口径，内部再按系统分实现

这比在前端散落调用 `shell`、外部脚本、平台命令要稳定得多，原因有三个：

1. 打包后更可控。
2. 权限与错误处理集中。
3. Windows / Linux / macOS 的行为差异能在一个模块内看清。

## 4. sidecar / service 也是平台化管理

`clash-verge-rev` 不只做 GUI，它还有后台服务和 sidecar。这里的处理方式是：

- sidecar 二进制通过 Tauri bundle 一起分发
- 安装、卸载、启动、停止由 Rust 统一编排
- Linux 和 Windows 分别有不同安装逻辑

这说明它把“跨平台”理解为完整产品交付，而不是“同一套窗口能打开”。

## 5. CI 从一开始就是平台矩阵

它的工作流已经把：

- `windows-latest`
- `macos-latest`
- `ubuntu` / Linux 交叉编译

当成一等公民。跨平台之所以能长期维持，不只是代码结构对，还因为发布流程从设计上就是多平台。

## `skill-flow` 当前状态

`skill-flow` 已经具备一部分非常好的跨平台基础，但桌面端仍然是明显的单平台设计。

## 1. 已有的跨平台基础

### 业务核心基本是平台无关的

当前 monorepo 主体在 TypeScript 包中：

- `packages/domain`
- `packages/storage`
- `packages/integration`
- `packages/core-engine`
- `packages/query`
- `packages/shared-types`
- `packages/tui`

这层的价值非常高，因为：

- CLI、bridge、未来桌面端都能复用同一套 runtime
- 事实源已经集中在 `manifest.json`、`lock.json`、`preferences.json`
- `bridge protocol` 已经抽象成独立协议包

也就是说，`skill-flow` 的“产品核心”不是写死在 SwiftUI 里的。

### 桌面与核心已通过协议解耦

当前 macOS 桌面端的调用链是：

`SwiftUI -> ViewModel -> BridgeClient -> skill-flow bridge --json -> shared runtime`

这是一个正确方向。因为它意味着：

- 桌面壳不是第二套业务系统
- 桌面行为与 CLI 行为天然更容易保持一致
- 新桌面壳理论上只要能讲同一个协议，就能复用全部能力

### 状态根和存储模型已经统一

当前桌面 README 明确说明：

- 不维护单独桌面数据库
- `~/.skillflow` 是统一状态根

这和未来做跨平台桌面端是兼容的。

## 2. 当前不适合直接扩展到 Windows / Ubuntu 的部分

### 桌面壳完全绑定 macOS / SwiftUI / AppKit

当前桌面应用在：

- `apps/desktop-mac`

并且：

- `Package.swift` 明确只支持 `macOS(.v15)`
- 大量代码直接依赖 `AppKit`
- 打包脚本全部是 `.app/.dmg` 产物

这意味着如果继续沿这条路支持 Windows / Ubuntu，实际上会演变为：

1. 继续保留一套 SwiftUI macOS 壳
2. 再新写一套 Windows 壳
3. 再新写一套 Linux 壳
4. 同时维护三套桌面 UI、三套打包、三套系统适配

这对 `skill-flow` 当前规模来说不合适。

### 当前桌面 helper 仍依赖系统 Node

桌面 README 已明确：

- 启动内置 helper 仍需要 `node` 20+

而且 `BridgeClient.swift` 现在通过：

- 查找常见 Node 路径
- 启动 `cli.js`

来执行 bridge 请求。

这个方案在 macOS 开发期没问题，但扩展到 Windows / Ubuntu 会带来几个问题：

1. 用户机器必须具备兼容 Node 运行时。
2. 不同平台 PATH、安装位置、权限和签名行为更复杂。
3. 桌面产品的发布体验会退化成“GUI 只是 Node 程序的启动器”。

如果想把桌面端当正式跨平台产品发布，这不是最优形态。

### 当前若干路径约定偏 Unix/macOS

目前一些目标路径和状态路径约定仍主要围绕 `os.homedir()` 下的点目录，例如：

- `~/.skillflow`
- `~/.claude/skills`
- `~/.codex/skills`
- `~/.config/opencode/skills`

其中一部分在 Ubuntu 上问题不大，但在 Windows 上要重新梳理：

- 哪些工具真实使用 `AppData`
- 哪些仍支持用户目录点路径
- 符号链接策略在 Windows 上是否需要管理员权限或 junction 回退

另外，`source-service.ts` 当前 ZIP 解压逻辑仍是：

- macOS 用 `ditto`
- 其他平台用 `unzip`

这在 Ubuntu 可行，但在 Windows 上并不合适，说明核心层还有少量平台补齐工作要做。

## 为什么不建议继续走“多套原生壳”

如果 `skill-flow` 继续沿现在路线扩展，会得到：

- macOS: SwiftUI
- Windows: 可能是 WinUI / WPF / Tauri / Electron 任一套
- Ubuntu: 可能是 GTK / Qt / Tauri / Electron 任一套

问题不在“能不能做”，而在“长期维护是否划算”。

不划算的原因：

1. 当前产品核心并不是图形特效型应用，而是状态管理、导入、预览、配置、投影和部署编排。
2. 这类产品最值钱的是共享业务行为，不是平台专属 UI。
3. 一旦三套原生壳分叉，后续每个功能都要做三次：
   - 页面
   - 交互状态
   - 测试
   - 打包
   - 发布

对现在的 `skill-flow`，这会把迭代速度直接拖慢。

## `skill-flow` 支持 Windows 和 Ubuntu 的最合适方案

## 方案选择

推荐方案：`Tauri 2 + React/Vite + TypeScript`。

原因不是“它最流行”，而是它与当前仓库状态最匹配。

### 为什么是 Tauri 2

1. `skill-flow` 已经有稳定的 TypeScript runtime 和 bridge 协议。
2. 桌面 UI 当前没有必须依赖原生 Cocoa 控件的硬需求。
3. Windows / Ubuntu / macOS 打包能力是现成的。
4. 如果未来需要：
   - tray
   - deep link
   - autostart
   - updater
   - 打开文件/目录
   - 原生对话框

   Tauri 的宿主层比“纯 Node helper + 多套原生壳”更统一。
5. `clash-verge-rev` 已经证明这条路在同类桌面工具上是可行的。

### 为什么不是继续强化 SwiftUI 壳

SwiftUI 适合把 macOS 产品做到很精细，但它不能自然扩展到 Windows / Ubuntu。

如果 `skill-flow` 的目标只是“把 macOS 做到极致”，现在路线成立。  
如果目标变成“正式支持 Windows 和 Ubuntu”，继续强化 SwiftUI 只会增加未来替换成本。

### 为什么不是 Electron 优先

Electron 也能做，但对 `skill-flow` 当前体量和定位，Tauri 更合适：

- 包体更轻
- 系统集成更像一个真正桌面产品
- 与 Rust sidecar / native command 的组合更自然

只有当未来明确需要大量 Node/Electron 生态特性，并且更看重前端开发速度而不是安装体积与桌面分发体验时，Electron 才值得反选。

## 推荐架构

建议把未来桌面版分成四层。

### 1. 共享业务层

继续复用现有包：

- `packages/domain`
- `packages/storage`
- `packages/integration`
- `packages/core-engine`
- `packages/query`
- `packages/shared-types`

这层继续做单一事实源。

### 2. 协议层

保留 `packages/shared-types` 里的 bridge 协议，作为桌面端和 runtime 的正式契约。

但建议把“桌面如何调用 runtime”从“调用外部 CLI 进程”升级成两种可选实现：

1. 开发期：仍可直接调用 CLI bridge，便于复用和调试。
2. 产品期：桌面宿主直接调用内嵌 runtime 适配层，减少对外部 Node 环境的依赖。

也就是说，协议保留，但 transport 可以调整。

### 3. 桌面宿主层

新增例如：

- `apps/desktop`

内部结构建议：

- `src/` 负责 React UI
- `src-tauri/` 负责宿主、打包、平台命令

平台差异放到：

- `tauri.conf.json`
- `tauri.windows.conf.json`
- `tauri.linux.conf.json`
- `tauri.macos.conf.json`

### 4. 平台能力层

把真正与系统绑定的内容单独收口，例如：

- 打开目录
- 托盘
- 开机启动
- 自动更新
- 原生文件选择器
- Windows junction / symlink 策略
- Linux desktop entry / package metadata

这层不要再散落在 UI 中。

## 对现有代码的具体建议

## 1. 先把跨平台阻塞点从核心层清掉

在新增桌面壳前，先把这些点处理掉最划算：

### ZIP 解压不要依赖系统命令

当前 `source-service.ts` 用：

- macOS: `ditto`
- 其他: `unzip`

建议改成 Node 内可控实现，例如统一使用 JS 库处理 ZIP，避免：

- Windows 无 `unzip`
- 用户环境差异
- 打包后外部命令依赖不稳定

### 重新梳理目标路径策略

需要明确三类路径：

1. `skill-flow` 自己的状态根
2. 各 AI 工具的全局 skills 目录
3. 各 AI 工具的 project-scoped 目录

Windows 上建议优先核实每个目标工具真实目录，不要简单把 Unix 点目录硬搬过去。

### 统一符号链接策略

Windows 下 symlink、junction、copy 的行为与权限模型不同。  
当前 `createSymlink(..., "junction")` 是一个不错的起点，但需要明确：

- 哪些目标允许目录 junction
- 哪些目标必须是真正 symlink
- 哪些场景要自动回退到 copy

这部分最好形成显式平台策略，而不是隐含在工具函数里。

## 2. 桌面 UI 状态不要继续只长在 SwiftUI 里

当前桌面交互状态大量存在于：

- `DesktopAppState`
- `ViewModel`
- 各 screen container

如果计划做跨平台桌面版，后续新增复杂交互时，尽量把可共享的部分移回 TypeScript：

- 视图查询模型
- 筛选/排序逻辑
- 表单状态映射
- mutation orchestration

否则将来 React 桌面版要再重写一次。

## 3. 不要让 Windows / Ubuntu 版依赖系统 Node

正式跨平台桌面版应当做到：

- 安装后可直接运行
- 不要求用户先安装 Node

实现上有两条路：

1. 桌面应用内嵌 Node/runtime 产物
2. 将 bridge 能力进一步收口为宿主原生命令，减少外部进程调用

对于 `skill-flow`，更现实的是分两步走：

- 第一步先保持 CLI bridge，不改变业务边界
- 第二步再逐步收敛运行时依赖，去掉“系统 Node 必须存在”的发布前提

## 4. 发布体系要从 macOS 单线改成矩阵

当前 `scripts/release` 主要服务 macOS 打包。  
如果要正式支持 Windows / Ubuntu，需要把发布体系升级为：

- Windows 安装器
- Ubuntu 包或 AppImage
- GitHub Actions 平台矩阵
- 每个平台的最小验证脚本

这里应直接借鉴 `clash-verge-rev` 的做法：配置分平台，CI 分平台，产物分平台。

## 建议的落地顺序

## Phase 1: 先清核心层跨平台问题

目标：不改产品形态，只让 runtime 真正可在 Windows / Ubuntu 上稳定运行。

应做：

1. 去掉对 `ditto` / `unzip` 这类外部解压命令的依赖。
2. 梳理状态目录和目标目录的跨平台映射。
3. 补 Windows / Linux 相关测试，特别是路径、链接、解压和部署策略。

完成标准：

- CLI 在 Windows / Ubuntu 可跑通核心用例。
- `bridge --json` 在三平台协议行为一致。

## Phase 2: 新增统一跨平台桌面壳

目标：不碰核心业务，只替换桌面宿主。

应做：

1. 新建 `apps/desktop`。
2. 用 React/Vite 实现：
   - 首页
   - 导入页
   - 详情页
   - 设置页
3. 通过统一 bridge/runtime 接口连到现有业务层。
4. 先把 macOS 跑通，再接 Windows / Ubuntu。

完成标准：

- 三平台能完成列表、导入、预览、应用、更新、卸载主流程。

## Phase 3: 决定是否淘汰 SwiftUI 壳

这里有两种策略：

### 策略 A

保留 `apps/desktop-mac` 作为高质量 macOS 专用前端，Windows / Ubuntu 走跨平台壳。

优点：

- macOS 体验可以继续非常原生。

缺点：

- 仍然要维护两套桌面 UI。

### 策略 B

跨平台桌面版成熟后，逐步用它替换 `apps/desktop-mac`。

优点：

- 统一桌面代码库
- 长期维护成本最低

缺点：

- macOS 的原生感可能不如 SwiftUI 壳

对 `skill-flow` 当前阶段，我更推荐策略 B。原因很简单：当前产品更需要一致性和维护效率，而不是三平台分别追求极致原生 UI。

## 最终建议

如果 `skill-flow` 未来明确要支持 Windows 和 Ubuntu，最合适的方案是：

1. 保留现有 TypeScript monorepo 作为唯一业务核心。
2. 保留 bridge 协议作为正式契约。
3. 先补齐 runtime 的真实跨平台能力。
4. 新增 `Tauri 2 + React/Vite` 的统一桌面壳。
5. 将发布体系升级为多平台矩阵。
6. 在跨平台桌面版稳定后，评估是否逐步替换 `apps/desktop-mac`。

一句话总结：

`clash-verge-rev` 的可借鉴点，不是“用了 Tauri”，而是“把 UI、宿主、系统能力、打包发布分层，并把平台差异压缩到宿主层和发布层”。  
`skill-flow` 现在已经有共享业务层和协议层，只差把桌面壳从 macOS 专用实现升级为统一跨平台实现。

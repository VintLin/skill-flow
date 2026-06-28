# Cross-Platform Desktop Parity Plan

**目标**

把跨平台桌面端 `apps/desktop` 按模块推进到可与原版 `apps/desktop-mac` 对齐的状态。这里的“对齐”以用户可感知行为为准，不以文件名或技术栈一致为目标。

**范围边界**

- 对比对象：
  - 原版：`apps/desktop-mac`
  - 复刻版：`apps/desktop`
- 本计划只覆盖桌面端模块复刻，不扩展 CLI、核心引擎、发布流程以外的新功能。
- 内部直接演进，不保留兼容层。

## 一、模块划分

### 1. 应用壳与依赖装配

**原版主文件**

- `apps/desktop-mac/Sources/DesktopApp/App/SkillFlowDesktopApp.swift`
- `apps/desktop-mac/Sources/DesktopApp/App/DesktopAppContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopRuntime.swift`

**复刻版主文件**

- `apps/desktop/src/app/App.tsx`
- `apps/desktop/src/runtime/desktop-runtime.ts`

**模块职责**

- 应用入口
- 依赖装配
- 共享状态初始化
- 各屏幕和运行时对象的连接

**当前判断**

- 主流程已可运行
- 依赖装配分散在 `App.tsx`
- 缺少与原版接近的统一容器层

**复刻进度**

- `70%`

### 2. 路由与全局状态

**原版主文件**

- `apps/desktop-mac/Sources/DesktopApp/Navigation/DesktopRoute.swift`
- `apps/desktop-mac/Sources/DesktopApp/Navigation/DesktopNavigator.swift`
- `apps/desktop-mac/Sources/DesktopApp/Store/DesktopAppState.swift`
- `apps/desktop-mac/Sources/DesktopApp/Store/ViewState.swift`
- `apps/desktop-mac/Sources/DesktopApp/Store/WorkspaceState.swift`

**复刻版主文件**

- `apps/desktop/src/navigation/desktop-route.ts`
- `apps/desktop/src/navigation/desktop-navigator.ts`
- `apps/desktop/src/store/desktop-app-state.ts`
- `apps/desktop/src/store/view-state.ts`
- `apps/desktop/src/store/workspace-state.ts`

**模块职责**

- 路由表达
- 路由切换
- 已选 source、当前页面、工作区数据等全局状态承载

**当前判断**

- 结构和职责基本齐全
- 可作为后续各模块对齐的稳定基础

**复刻进度**

- `85%`

### 3. 首页与分组卡片主界面

**原版主文件**

- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreen.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/HomeScreenContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
- `apps/desktop-mac/Sources/DesktopApp/Components/GroupTagComponents.swift`

**复刻版主文件**

- `apps/desktop/src/screens/home-main-view.tsx`
- `apps/desktop/src/screens/home-screen.tsx`
- `apps/desktop/src/view-models/home-view-model.ts`
- `apps/desktop/src/view-models/main-view-model.ts`
- `apps/desktop/src/components/group-card.tsx`
- `apps/desktop/src/components/group-tags.tsx`
- `apps/desktop/src/components/shared-group-card.tsx`

**模块职责**

- 首页布局
- source 列表与分组卡片展示
- 搜索、筛选、固定、更新、删除等主操作
- 分组标签视图与筛选
- 主入口交互密度和视觉层级

**当前判断**

- 骨架已在
- 主界面承载行为明显少于原版
- `MainViewModel` 在原版是首页核心能力汇总点，复刻版对应职责尚未完整回补
- 首页是当前最主要的体验差距来源

**复刻进度**

- `55%`

### 4. 详情页与文档查看

**原版主文件**

- `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreen.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailScreenContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Detail/DetailDocumentStore.swift`
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/DetailViewModel.swift`
- `apps/desktop-mac/Sources/DesktopApp/Components/MarkdownDocumentView.swift`
- `apps/desktop-mac/Sources/DesktopApp/Components/MarkdownDocumentRenderer.swift`

**复刻版主文件**

- `apps/desktop/src/screens/detail-screen.tsx`
- `apps/desktop/src/view-models/detail-view-model.ts`
- `apps/desktop/src/components/detail-header.tsx`
- `apps/desktop/src/components/detail-sidebar.tsx`
- `apps/desktop/src/components/markdown-document.tsx`

**模块职责**

- source 详情信息展示
- 技能、targets、版本等细节区域
- 文档切换与文档内容展示
- 详情页内的状态切换和操作反馈

**当前判断**

- 已有基础信息展示
- 文档读取、缓存、渲染、细节布局与原版还有明显距离
- 详情页交互完整度不足

**复刻进度**

- `50%`

### 5. 导入流程

**原版主文件**

- `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreen.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Import/ImportScreenContainer.swift`
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/ImportViewModel.swift`
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/ImportRecommendations.swift`

**复刻版主文件**

- `apps/desktop/src/screens/import-screen.tsx`
- `apps/desktop/src/view-models/import-view-model.ts`
- `apps/desktop/src/assets/ImportRecommendations/recommendations.json`

**模块职责**

- 导入搜索
- 导入预览
- 导入执行
- 推荐内容展示

**当前判断**

- 主流程较完整
- 功能层已接近可用对齐
- 主要差距更偏展示细节和局部交互

**复刻进度**

- `75%`

### 6. 设置、偏好、更新、维护

**原版主文件**

- `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsScreen.swift`
- `apps/desktop-mac/Sources/DesktopApp/Screens/Settings/SettingsView.swift`
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/SettingsViewModel.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopSettingsStore.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopUpdateChecker.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCacheMaintenance.swift`

**复刻版主文件**

- `apps/desktop/src/screens/settings-screen.tsx`
- `apps/desktop/src/view-models/settings-view-model.ts`
- `apps/desktop/src/runtime/settings-store.ts`
- `apps/desktop/src/runtime/update-checker.ts`
- `apps/desktop/src/runtime/desktop-maintenance.ts`

**模块职责**

- 语言与显示偏好
- agent 显示偏好
- 更新检查
- 缓存维护

**当前判断**

- 这部分复刻度较高
- 已具备后续做细节对齐的基础

**复刻进度**

- `80%`

### 7. Bridge、Runtime、Mutation 协调

**原版主文件**

- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeQueryFacade.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeCommandFacade.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopMutationCoordinator.swift`
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopGroupTagStore.swift`

**复刻版主文件**

- `apps/desktop/src/bridge/client.ts`
- `apps/desktop/src/runtime/desktop-integration.ts`
- `apps/desktop/src/runtime/mutation-coordinator.ts`
- `apps/desktop/src/runtime/group-tag-store.ts`

**模块职责**

- bridge 调用
- 查询与命令分层
- mutation 串行化
- group tag 存储
- 桌面端运行时与共享状态同步

**当前判断**

- 功能主干已具备
- 与原版相比，查询层、命令层、运行时装配层的职责边界还不够清晰

**复刻进度**

- `75%`

### 8. 菜单栏 / 托盘快控

**原版主文件**

- `apps/desktop-mac/Sources/DesktopApp/Components/MenuBar/MenuBarQuickConfigView.swift`
- `apps/desktop-mac/Sources/DesktopApp/Components/MenuBar/MenuBarScreenState.swift`
- `apps/desktop-mac/Sources/DesktopApp/App/MenuBarIcon.swift`

**复刻版主文件**

- `apps/desktop/src/menu/tray.ts`
- `apps/desktop/src-tauri/src/menu.rs`
- `apps/desktop/src/components/desktop-top-bar.tsx`

**模块职责**

- 菜单栏入口
- 快速搜索和查看 source
- 快速切换、更新、删除
- 从菜单栏直接跳转主窗口

**当前判断**

- 目前只有托盘菜单和路由事件
- 原版完整的“轻量控制面板”还没有复刻
- 这是差距最直观的模块

**复刻进度**

- `20%`

## 二、优先级与推进顺序

### P0：先补主视图能力，不先做大重构

1. 首页与分组卡片主界面
2. 详情页与文档查看
3. 菜单栏 / 托盘快控

理由：

- 这三块决定当前“看起来像不像原版”
- 也是用户最容易直接感知差异的区域
- 先把用户可见差距拉近，再处理内部组织层

### P1：在推进 P0 时同步收口组织层

1. 应用壳与依赖装配
2. Bridge、Runtime、Mutation 协调

理由：

- 不需要先做独立重构
- 但每推进一个大模块，都应顺手把新增职责放回清晰边界
- 避免 `App.tsx` 和若干 runtime 文件继续膨胀

### P2：最后做补齐与统一

1. 设置、偏好、更新、维护
2. 路由与全局状态回归检查
3. 回归测试覆盖补齐

理由：

- 这部分基础较稳
- 适合在主要视图对齐后做统一校验

## 三、逐模块推进方法

每个模块都按同一套方式推进：

1. 先列原版能力清单
2. 标记复刻版现状：已对齐 / 部分对齐 / 缺失
3. 只补当前模块缺口，不顺手扩散
4. 增加该模块对应测试
5. 单独验收后再进下一个模块

## 四、建议的执行批次

### 批次 1：首页模块对齐

**目标**

把首页作为第一优先模块，先对齐主结构、主操作、卡片展示密度、筛选与标签能力。

**完成标准**

- 首页核心操作路径与原版一致
- 分组卡片信息密度达到原版主视图级别
- 与首页相关的状态流不再依赖临时拼接逻辑

### 批次 2：详情页模块对齐

**目标**

补齐详情页的结构、文档查看体验、状态切换与细节信息展示。

**完成标准**

- 详情页主区域、侧边栏、文档区域职责清楚
- 文档切换和展示行为稳定
- 技能和 target 的切换行为与首页、详情页保持一致

### 批次 3：菜单栏模块对齐

**目标**

把当前托盘路由入口升级为接近原版的快控面板。

**完成标准**

- 支持搜索和浏览 source
- 支持基础快捷操作
- 与主窗口路由和状态同步

### 批次 4：组织层收口与回归测试

**目标**

收口装配层与运行时边界，并补齐模块级回归测试。

**完成标准**

- 主要职责不再堆积在 `App.tsx`
- 关键模块都有独立测试入口
- 复刻版具备可持续继续对齐的结构

## 五、当前总判断

- 以“能否跑通主流程”衡量，复刻版已具备基础可用性。
- 以“是否接近原版体验”衡量，当前主要卡在首页、详情页、菜单栏三大模块。
- 接下来应按模块对齐，不应继续按零散功能点推进。

## 六、下一步建议

下一轮从“首页模块”开始，单独输出一份首页对照清单，逐条列出：

- 原版能力项
- 复刻版当前状态
- 缺失项
- 建议实现顺序

这样后续每一轮都可以按模块验收，而不是靠感觉判断接近程度。

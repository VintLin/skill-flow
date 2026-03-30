# PLAN_v1.0.2 Group Tags

日期：2026-03-30

## 目标

为桌面端 Group Card、Home 页、Group Detail 页补齐 group 标签能力，并保持推荐 preset 标签与本地自定义标签的一致展示。

## 边界

- 仅改 `apps/desktop-mac` 相关实现与对应测试。
- 内部直接演进，不引入兼容层。
- 不扩散到 CLI、TUI、bridge 协议。
- 不碰当前用户已修改的 `Settings` 相关文件逻辑，标签状态走独立存储。

## 单一事实来源

- 推荐 preset 标签：`Resources/ImportRecommendations/recommendations.json`
- 本地自定义标签：新增桌面端独立 group tag state/store
- 展示解析规则：
  - group 命中推荐 preset 标签时，展示 preset 标签
  - group 无 preset 标签时，展示本地自定义标签

## 实现拆分

1. 新增 group tag 模型、持久化存储、状态同步入口。
2. 从推荐配置解析 preset 标签，并提供 group -> tags 的统一解析函数。
3. Group Card 增加标签展示区，位置对齐推荐卡片现有 badge 区。
4. Group Card / Detail 增加无标签时的编辑 UI：
   - 初始为主题色半透明圆角正方形 `+`
   - 点击后切换为输入框 + 横向标签选择列表
   - 输入框固定，和标签列表之间有细线
   - 标签列表横向滚动
   - 新建标签最多 4 字，颜色随机
5. Home 页 header 下增加标签筛选条：
   - 第一个为 `ALL`
   - 后续展示当前现存全部标签
   - 点击标签筛选当前 group cards
6. Group Detail 在 Agent 区块上方展示当前 group 标签；无标签时展示同款编辑 UI。
7. 补最小必要测试。

## 测试清单

- 单元：
  - preset 标签解析与优先级
  - 自定义标签新增、字符长度限制、随机颜色持久化
  - Home 标签筛选结果
- 集成：
  - 推荐 group card 显示 preset 标签
  - 非 preset group card 可进入编辑态并显示新增标签
  - Detail 页显示与 Home/Group Card 一致的标签
- 回归：
  - 无标签 group 不影响原有 Agent / Skill 操作
  - Home `ALL` 可恢复全部 group

## 明确不做

- 不支持一个 group 同时混合 preset 标签和自定义标签
- 不修改推荐标签文案与推荐分组规则
- 不扩展标签搜索、排序、删除历史等附加能力

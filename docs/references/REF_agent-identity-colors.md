# Agent identity colors

日期：2026-08-31

## 用途与边界

本表用于 Usage「每日趋势」中代表 Agent 的数据系列，以及「最常用 Agent」排名圆点；不用于 Group Card，也不用于重绘或替代第三方 logo。图表中的面积、曲线、图例、tooltip 与排名圆点使用同一映射；其他界面的交互选中态始终使用 SkillFlow 当前 accent。

light / dark 值的代码事实源为 `apps/desktop-mac/Sources/DesktopApp/Components/AgentIdentityColor.swift`。官方色在不能满足浅色或深色背景的 3:1 非文本对比度时，保留色相方向并使用明度适配值；适配值不得称为官方 HEX。

颜色证据严格分为四级：

- `official-hex`：第一方品牌指南明确发布 HEX，可称为官方色。
- `official-asset`：第一方官网、官方仓库或应用图标可直接看到或提取颜色，但官方没有声明唯一 HEX；只能称为“官方图标色”或“产品视觉色”。
- `visual-only`：第一方页面能确认色相方向，但页面未提供可稳定下载的原始资产或精确色值。
- `none`：第一方标志为黑白，或没有找到足够的颜色证据。项目为了辨识度选择的颜色只能称为 SkillFlow identity color。

网络核验只使用第一方来源：官方品牌指南、产品官网、官方文档和官方 GitHub 组织/仓库。官网的某个按钮色、截图中的状态色或模型图表颜色不等于产品主题色。

## 当前映射与网络核验

| Target | 当前 Light / Dark | 网络核验状态 | 官方 HEX / 官方图标色 | 第一方来源 | 建议 |
| --- | --- | --- | --- | --- | --- |
| `claude-code` | `#C96443` / `#E89B7E` | `visual-only` | Claude / Anthropic 产品视觉持续使用暖陶土、米白与黑色；未找到 Claude Code 单独发布的唯一 HEX | [Claude 官方产品页](https://www.anthropic.com/claude)、[Claude Code 官方仓库](https://github.com/anthropics/claude-code) | **保留方向**；Light 加深以满足浅色页面对比度，当前值不标记为官方 HEX |
| `codex` | `#2563EB` / `#60A5FA` | `official-asset` | Codex 桌面应用的默认组合图标是蓝色；OpenAI Blossom 的黑白规则不能替代 Codex 产品图标色。官方未公开唯一 Codex HEX | [Codex 官方产品页](https://openai.com/codex/)、[OpenAI Codex 官方仓库中的应用图标证据](https://github.com/openai/codex/issues/31068) | **已改为蓝色系**；当前值是 SkillFlow 浅/深主题适配色，后续拿到官方原始 app icon 后可再次校准 |
| `zcode` | `#0284C7` / `#38BDF8` | `visual-only` | 官方站点与应用界面使用明亮蓝色方向，未找到公开品牌指南或唯一 HEX | [ZCode 官网](https://zcode.z.ai/en) | **保留蓝色方向**；当前值仍是 SkillFlow 适配色，不称官方 HEX |
| `cursor` | `#14120B` / `#F7F7F4` | `official-hex` | 官方品牌页源码与资产明确使用深色 `#14120B`、浅色 `#F7F7F4` | [Cursor Brand Guidelines](https://cursor.com/brand) | **保留**；当前映射与官方色一致 |
| `grok-build` | `#334155` / `#CBD5E1` | `none` | Grok / Grok Build 官方视觉以黑白为主；未找到 Grok Build 的独立主题 HEX | [Grok Build 官方仓库](https://github.com/xai-org/grok-build)、[xAI Grok Code Fast 1 模型卡](https://data.x.ai/2025-08-26-grok-code-fast-1-model-card.pdf) | 当前 slate 仅作辨识色；若强调品牌一致性应使用黑白，若强调列表区分可保留并标记为项目色 |
| `pi` | `#C2410C` / `#FB923C` | `none` | 官方仓库和 π 标志没有公开单一品牌色，仓库展示以终端/黑白视觉为主 | [Pi 官方仓库](https://github.com/badlogic/pi-mono) | 橙色没有第一方依据；可保留为项目辨识色，或改用黑白但会降低区分度 |
| `workbuddy` | `#07856F` / `#0EC8A9` | `official-asset` | 官方 SVG 图标是青绿渐变 `#0EC8A9 → #01C886`，另有 `#FFE355` 辉光 | [腾讯 WorkBuddy 官网](https://www.workbuddy.ai/)、[WorkBuddy 官方 SVG](https://codebuddy-1328495429.cos.accelerate.myqcloud.com/web/workbuddy/0fadefe472cfb64411edc82a21f5625ea892e899/assets/logo.svg) | **已同步青绿色与独立官方图标**；Light 使用更深适配值，Dark 使用官方图标主色 |
| `codebuddy` | `#6C4DFF` / `#A694FF` | `official-asset` | 官方 SVG 背景渐变 `#6C4DFF → #583ED3`，辅色 `#32E6B9` | [CodeBuddy 官网](https://www.codebuddy.ai/)、[CodeBuddy 官方 SVG](https://codebuddy-1328495429.cos.accelerate.myqcloud.com/web/ide/logo.svg) | **已校准**；Light 使用官方图标主色，Dark 使用同色相的可读性适配值 |
| `trae` | `#4F46E5` / `#818CF8` | `visual-only` | TRAE 官方产品页面确认蓝紫/靛青的产品视觉方向，没有公开唯一 HEX | [TRAE 官网](https://www.trae.ai/)、[TRAE 下载页](https://www.trae.ai/download) | **保留靛青方向**；不称官方 HEX |
| `trae-cn` | `#1D4ED8` / `#93C5FD` | `none` | 未找到国际版与中国版分别发布不同品牌色的第一方规则；两者属于同一 TRAE 品牌 | [TRAE 官网](https://www.trae.ai/) | 不应暗示 CN 有独立官方蓝色；若必须区分，明确记录为 SkillFlow 人工区分色 |
| `kimi-code` | `#007CFF` / `#66B5FF` | `official-hex` | Kimi 官方 Brand Book 明确使用 signature brand blue，并发布 `#002F5B`、`#007CFF`、`#00A1FF`、`#A0DAF7`、`#00F6FF` 等色板 | [Kimi Brand Resources](https://www.kimi.com/resources/kimi-brand)、[Kimi Code 官网](https://www.kimi.com/coding/en) | **已改为官方蓝色方向**；Light 使用官方 `#007CFF`，Dark 使用可读性适配值 |
| `opencode` | `#4B4646` / `#F1ECEC` | `official-asset` | 官方品牌资产直接包含深暖灰 `#4B4646` 与浅暖灰 `#F1ECEC` | [OpenCode Brand Assets](https://opencode.ai/brand) | **保留**；这组值与官方图标资产一致 |
| `minimax-code` | `#3977A8` / `#7DC6FF` | `official-asset` | MiniMax Code 官方 favicon 的最大非黑色像素为浅蓝 `#7DC6FF` | [MiniMax Code 官网](https://code.minimax.io/)、[MiniMax Code 官方 favicon](https://code.minimax.io/assets/logo/favicon_v2.png?v=4) | **已改为浅蓝/蓝色方向**；Light 使用更深适配值，Dark 使用官方图标提取色 |
| `hermes-agent` | `#0000F2` / `#7B7BFF` | `official-asset` | 官方站点主强调色反复使用电蓝 `#0000F2`；文档主题也出现 `#FFD700`，但金色不是唯一 logo 色 | [Hermes Agent 官网](https://hermes-agent.nousresearch.com/)、[Hermes Agent 官方仓库](https://github.com/NousResearch/hermes-agent) | **已改为电蓝方向**；Light 使用官网产品色，Dark 使用同色相适配值 |
| `openclaw` | `#D14A22` / `#FF7A3D` | `official-hex` | 官方 CLI 文档直接定义 lobster palette：accent `#FF5A2D`、accentBright `#FF7A3D`、accentDim `#D14A22`、info `#FF8A5B` | [OpenClaw CLI 官方文档](https://docs.openclaw.ai/cli)、[OpenClaw 官方仓库](https://github.com/openclaw/openclaw) | **已改为龙虾橙**；Light / Dark 分别使用官方 accentDim / accentBright |
| `github-copilot` | `#8534F3` / `#C898FD` | `official-hex` | GitHub 官方明确发布 Copilot Purple `#8534F3`；Copilot 色板还包含粉色与橙色 | [GitHub Copilot Brand Toolkit](https://brand.github.com/brand-identity/copilot)、[GitHub Brand Guidelines PDF](https://brand.github.com/GitHub-BrandGuidelines-2026.pdf) | **保留 Light `#8534F3`**；Dark 是可读性适配色，不应称为官方主色 |
| `gemini-cli` | `#1A73E8` / `#8AB4F8` | `official-asset` | Gemini 官方标志是蓝、紫等多色渐变；Google 没有为 Gemini CLI 声明单一代表色。`#1A73E8` 是 Google Blue，不等于 Gemini CLI 官方主题色 | [Gemini CLI 官方仓库](https://github.com/google-gemini/gemini-cli)、[Gemini 视觉设计说明](https://design.google/library/gemini-ai-visual-design) | 可继续用蓝色作单点降维，但文档必须写为“从多色视觉选取的代表色” |
| `windsurf` | `#008F83` / `#5EEAD4` | `none` | 官方品牌指南只允许黑/白 symbol，并明确禁止给 symbol 上色 | [Windsurf Brand Guidelines](https://windsurf.com/brand) | teal 不是官方色；若保留，明确为 SkillFlow 辨识色。品牌忠实方案应使用黑白 |
| `amp` | `#C65A18` / `#F6833B` | `official-asset` | Amp 官网与文档反复使用橙色强调 `#F6833B`，同时使用深背景 `#091C1E` 与浅背景 `#DFDFC1`；未见命名品牌色板 | [Amp 官网](https://ampcode.com/)、[Amp 官方文档](https://ampcode.com/docs)、[Amp Press Kit](https://ampcode.com/press-kit) | **已校准为橙色**；Light 使用更深适配值，Dark 使用官网强调色 |
| `kiro` | `#7E22CE` / `#C084FC` | `visual-only` | Kiro 官方文档明确描述首次启动画面为紫色 KIRO logo，但没有发布唯一 HEX | [Kiro Setup & First Run](https://kiro.dev/docs/chat/vibe/)、[Kiro 官方 GitHub 组织](https://github.com/kirodotdev) | **保留紫色方向**；当前 HEX 是项目适配值 |
| `roo-code` | `#0F766E` / `#5EEAD4` | `official-asset` | 官方仓库中的 Roo 图形与产品资产能确认 teal / cyan 方向，但没有公开唯一 HEX；官方扩展已于 2026-05-15 停止 | [Roo Code 官方仓库](https://github.com/RooCodeInc/Roo-Code) | 保留 teal 方向；与 Windsurf 太接近，后续可把 Roo 调得更青、Windsurf 回归黑白或另选项目色 |
| `cline` | `#0369A1` / `#7DD3FC` | `official-asset` | 官方品牌资产的 SVG 只使用深色 `#18181B` 与浅色 `#F9F9F9`；当前蓝色没有第一方依据 | [Cline Brand Guidelines](https://cline.bot/brand)、[Cline 官方品牌资产包](https://cline.bot/assets/branding/brand/cline-brand-assets.zip) | 品牌忠实方案改为黑白；若为列表区分保留蓝色，必须降级标记为 SkillFlow 辨识色 |

未知或自定义 Agent 不进入本表；每日趋势使用既有稳定哈希色板回退，其他界面保持中性前景色。

## 核验结论

### 可直接称为官方 HEX

- `cursor`：`#14120B` / `#F7F7F4`。
- `kimi-code`：官方蓝色色板，单点代表色建议 `#007CFF`。
- `openclaw`：官方 lobster accent `#FF5A2D`。
- `github-copilot`：Copilot Purple `#8534F3`。
- `opencode`：当前两色可从官方品牌图标资产直接确认，但更准确的称呼是“官方资产色”，不是官方声明的单一品牌主色。

### 有第一方图标或产品视觉支持，但没有唯一 HEX

`claude-code`、`codex`、`zcode`、`workbuddy`、`codebuddy`、`trae`、`minimax-code`、`hermes-agent`、`gemini-cli`、`amp`、`kiro`、`roo-code`、`cline`。

其中最需要纠正的是：

1. `codex`：已从 OpenAI 通用黑白改为 Codex 默认应用图标的蓝色系；最终 HEX 仍可在取得官方安装包原始图标后进一步校准。
2. `workbuddy`：已改为官方图标的青绿方向并使用独立图标；`codebuddy` 已校准为官方紫色方向。
3. `kimi-code`：已从紫色改为官方 Brand Book 的蓝色。
4. `minimax-code`：已从红色改为官方图标浅蓝方向。
5. `hermes-agent`：已从金色改为官网产品电蓝方向。
6. `openclaw`：已从红色校准为官方 lobster orange 色板。
7. `amp`：已从黄橙校准为官网强调橙。
8. `cline`：官方资产为 `#18181B` / `#F9F9F9`，当前蓝色只能算项目辨识色。

### 仅为 SkillFlow 辨识色或仍无颜色证据

`grok-build`、`pi`、`trae-cn`、`windsurf`。`workbuddy` / `codebuddy` 现已使用各自独立图标，不再共用资产。

## 后续落地建议

1. 先把颜色数据模型中的证据类型固定为 `officialHex`、`officialAsset`、`visualOnly`、`recognition`，避免 UI 或文档把推断色称为官方色。
2. Codex 后续可从官方签名应用的默认 app icon 做固定算法取色（建议排除白色背景后取高占比蓝色），把原始资产版本、提取算法与结果一起记录。
3. Cline、Roo Code 等仍可从官方 app icon 继续校准候选值；渐变图标同时记录主色与辅助色，但身份圆点只选择一个满足浅/深背景对比度的代表色。
4. Windsurf、Amp、Pi、Grok Build 等官方黑白品牌若为了列表辨识必须使用彩色，应继续使用稳定人工色，但 UI 不应暗示它来自品牌方。
5. 修改 Swift 映射时同步更新本表和 `AgentIdentityColorTests`，并重点检查 `Codex / ZCode`、`Windsurf / Roo Code`、`WorkBuddy / Trae CN` 的相邻辨识度。

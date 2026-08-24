# Skill Flow Docs

本目录只保留当前项目需要的文档入口。新文档优先放到下列固定位置，避免再新增 `plan` / `plans` 这类平行目录。

## 当前事实源

| 路径 | 用途 |
| --- | --- |
| `FEATURE_INDEX.md` | 当前仍有参考价值的功能、问题和验证矩阵索引。 |
| `PRODUCT.md` | 产品定位、目标用户、核心场景和非目标。 |
| `ARCHITECTURE.md` | 运行时分层、状态模型和 package 边界。 |
| `DESIGN.md` | desktop UI design token、交互语言和可访问性规则。 |
| `contracts/` | bridge protocol 和 state file 契约入口。 |
| `superpowers/specs/` | 当前或近期需求规格。无活跃规格时只保留情况说明。 |
| `superpowers/plans/` | 针对 specs 的实施计划和审计记录。无活跃计划时只保留情况说明。 |
| `verification/` | 验证矩阵、测试覆盖说明和 UI 状态矩阵。 |
| `issues/` | 仍需跟踪的问题记录。 |
| `feedback/` | 用户反馈、交互审计和改进建议。 |
| `references/` | 外部参考资料，不作为当前实现事实源。 |
| `archives/` | 历史 specs / plans。默认不能直接作为当前实现依据。 |

## 顶层文档

| 文件 | 用途 |
| --- | --- |
| `COMMIT_AND_PACKAGE.md` | 提交、打包和发布前的本地操作流程。 |
| `RELEASE_PROCESS.md` | GitHub Release 和 npm 发布流程。 |

## 归档规则

完成或废弃的 spec 移到 `archives/specs/`，完成或废弃的 plan 移到 `archives/plans/`。旧目录整体迁移时保留原始层级，例如 `archives/plans/legacy-plan/`。

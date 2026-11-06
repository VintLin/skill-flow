# Skill Flow Docs

本目录只保留当前项目需要的文档入口。工作中的问题和方案放在 `.scratch/issues/`；稳定结论才进入本目录，避免再新增 `plan` / `plans` 这类平行目录。

文档与实现不具有同等权威性：运行时行为以源码和测试为准，本文档只记录稳定边界、设计决策和当前工作入口。发现描述与实现不一致时，先修正文档索引或将历史材料移入 `archives/`，不要在多个文档中复制同一份契约。

## 当前事实源

| 路径 | 用途 |
| --- | --- |
| `PRODUCT.md` | 产品定位、目标用户、核心场景和非目标。 |
| `ARCHITECTURE.md` | 运行时分层、状态模型和 package 边界。 |
| `DESIGN.md` | desktop UI design token、交互语言和可访问性规则。 |
| `adr/0007-desktop-workspace-persistence.md` | `desktop.json`、旧 UserDefaults 迁移、Agent 顺序单一事实源和文件写入保护。 |
| `adr/0005-first-use-cli-mental-model.md` | CLI 首次使用路径、命名和 source/group 关系的设计决策。 |
| `adr/0006-desktop-presentation-order-and-group-card-overflow.md` | Agent 共享展示顺序、标签数量排序和 Group Card 溢出浮窗的设计决策。 |
| `contracts/` | bridge protocol 和 state file 契约入口。 |
| `verification/` | 验证矩阵、测试覆盖说明和 UI 状态矩阵。 |
| `archives/` | 仍有追溯价值的历史规格和计划。默认不能直接作为当前实现依据。 |

## 顶层文档

| 文件 | 用途 |
| --- | --- |
| `COMMIT_AND_PACKAGE.md` | 提交前的本地检查和 commit 约定；发布与打包流程见 `RELEASE_PROCESS.md`。 |
| `RELEASE_PROCESS.md` | GitHub Release、npm 发布和桌面打包的唯一流程入口。 |

## 归档规则

完成或废弃的规格、计划、验收、反馈和研究资料统一移到 `archives/`。归档目录只保留仍有追溯价值的材料。

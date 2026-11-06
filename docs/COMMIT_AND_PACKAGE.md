# Commit 和打包正确操作

本文只说明当前仓库已经存在、应直接使用的操作方式，不引入额外流程。

## Commit

原则：

- 一个 commit 只做一件事。
- 完成一个独立逻辑单元就提交，不要攒一大批改动再一次提交。
- 不把重构、行为修改、格式化、文档更新混进同一个 commit。
- 先验证再提交。代码改动至少运行对应最小必要范围的测试；跨包或不确定影响面时，再补 `npm run build` 和 `npm test`。

推荐顺序：

```bash
git status --short
git diff --stat
git diff
```

确认改动边界后，按逻辑单元提交：

```bash
git add <相关文件>
git commit -m "fix: 简短描述"
```

message 格式：

```text
<type>: <简短描述>
```

可用 type：

- `feat`
- `fix`
- `refactor`
- `test`
- `docs`
- `chore`
- `delete`

示例：

```bash
git add packages/query/src/runtime.ts packages/query/src/runtime.test.ts
git commit -m "fix: handle runtime restart after source refresh"
```

提交前最低检查：

- `git diff --cached` 已确认没有无关文件。
- 对应测试已经执行。
- 若是 CLI、配置、bridge 协议、桌面打包行为变更，必须补测试，必要时同步 README 或 release note。

## 打包与发布

桌面打包、产物校验、GitHub Release 和 npm 发布的唯一流程见
[RELEASE_PROCESS.md](RELEASE_PROCESS.md)。本文件不复制脚本清单或产物命名。

## 最小正确流程

日常开发完成后：

```bash
npm run build
npm test
git add <相关文件>
git commit -m "feat: 简短描述"
```

准备桌面发布时，按 [RELEASE_PROCESS.md](RELEASE_PROCESS.md) 的完整顺序执行。

## 备注

- `docs/` 是受 Git 跟踪的项目文档目录；文档改动应和对应代码或流程改动一起提交。
- 本仓库内部改动默认直接演进，不为内部调用保留兼容层。

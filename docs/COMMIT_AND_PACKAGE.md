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

## 打包

当前仓库的桌面打包脚本都在 `scripts/release/` 下，默认输出到 `dist/desktop-mac/`。

### 1. 先构建 JS 部分

```bash
npm run build
```

如果你直接运行下面的主打包脚本，它默认也会先执行这一步。

### 2. 打单个架构的未签名包

```bash
scripts/release/package-desktop-mac.sh --arch arm64
scripts/release/package-desktop-mac.sh --arch x86_64
scripts/release/package-desktop-mac.sh --arch universal
```

说明：

- `arm64` 适用于 Apple Silicon。
- `x86_64` 适用于 Intel Mac。
- `universal` 同时包含 `arm64` 和 `x86_64`。

### 3. 只打当前机器架构的开发包

```bash
scripts/release/package-desktop-mac-dev.sh
```

这个脚本会按当前机器架构生成 dev 包。

### 4. 一次生成 GitHub Release 需要的全部产物

```bash
scripts/release/release-github.sh all
```

该命令会依次完成：

- 构建桌面 app
- 生成各架构 `.dmg`
- 生成各架构 `.zip`
- 生成 `sha256.txt`
- 校验产物架构是否正确

输出结果默认在：

```text
dist/desktop-mac/
```

### 5. 发布 GitHub Release

确认本地已有对应版本的 release note，例如：

```text
releases/RELEASE_v1.2.0.md
```

然后执行：

```bash
scripts/release/publish-github-release.sh
```

如果你已经提前生成过产物，可复用已有结果：

```bash
scripts/release/publish-github-release.sh --skip-build
```

### 6. 单独补 zip 或校验

只补 zip：

```bash
scripts/release/package-desktop-mac-zip.sh universal
```

只校验 app bundle：

```bash
scripts/release/validate-mac-artifacts.sh \
  "dist/desktop-mac/universal/Skill Flow.app" \
  "arm64,x86_64"
```

### 7. 打包自测

如需快速验证打包链路，可运行：

```bash
scripts/release/test-mac-packaging.sh
```

## 最小正确流程

日常开发完成后：

```bash
npm run build
npm test
git add <相关文件>
git commit -m "feat: 简短描述"
```

准备桌面发布时：

```bash
scripts/release/release-github.sh all
scripts/release/publish-github-release.sh --skip-build
```

## 备注

- `docs/` 目录当前被 `.gitignore` 忽略，这份文件默认不会进入 Git 提交。
- 本仓库内部改动默认直接演进，不为内部调用保留兼容层。

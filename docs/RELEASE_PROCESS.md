# GitHub Release 发布流程

本文面向接手发布任务的 Agent。按顺序执行；任何一步失败，先停下报告失败命令和输出，不要跳步发布。

## 0. 发布边界

- GitHub Release 版本号来自 `apps/cli/package.json` 的 `version`，tag 固定为 `v<version>`。
- Release notes 固定读取 `releases/RELEASE_v<version>.md`。
- 桌面产物固定输出到 `dist/desktop-mac/`。
- CLI npm 包用仓库发布脚本发布，不要在 `apps/cli` 里直接执行 `npm publish`。

## 1. 发布前检查

```bash
git status --short
git branch --show-current
gh auth status
npm whoami
```

要求：

- 工作树只包含本次发布相关改动。
- 当前分支是准备发布的分支，且最终发布 commit 会先 push 到 GitHub。
- `gh` 已登录并有 `VintLin/skill-flow` Release 权限。
- 需要发布 CLI 到 npm 时，`npm whoami` 必须成功。

## 2. 同步版本号

同步修改这些文件里的版本号：

- `apps/cli/package.json`
- `packages/*/package.json`
- `apps/cli/package.json` 内部 `@skill-flow/*` 依赖版本
- `package-lock.json`

验证：

```bash
rg -n '"version": "|"@skill-flow/' apps packages package-lock.json
```

要求：本次发布相关的 `skill-flow` 和 `@skill-flow/*` 版本都指向同一个目标版本。

## 3. 写发布记录

更新：

- `CHANGELOG.md`
- `releases/RELEASE_v<version>.md`

Release note 至少包含：

- `Summary`
- `Highlights`
- `User-visible changes`
- `Release Artifacts`
- `Verification`

桌面 GitHub Release 资产列表固定为：

```text
Skill-Flow-arm64.dmg
Skill-Flow-arm64.zip
Skill-Flow-x86_64.dmg
Skill-Flow-x86_64.zip
Skill-Flow-universal.dmg
Skill-Flow-universal.zip
sha256.txt
```

## 4. 验证源码

最小完整发布检查：

```bash
npm run build
npm test
```

如果改动只影响某个包，可以先跑更小范围测试；但真正发布前必须跑上面两条。

## 5. 提交并推送发布 commit

```bash
git status --short
git diff --stat
git add <本次发布相关文件>
git diff --cached --stat
git commit -m "chore: release v<version>"
git push origin HEAD
```

提交前确认 `git diff --cached` 没有无关文件，尤其不要把 `dist/`、本地缓存、临时打包目录加进去。

## 6. 生成桌面发布产物

```bash
scripts/release/release-github.sh all
```

该命令会构建桌面 app、生成三种架构的 `.dmg` 和 `.zip`、生成 `sha256.txt`，并校验架构。

产物检查：

```bash
ls -lh dist/desktop-mac/arm64/
ls -lh dist/desktop-mac/x86_64/
ls -lh dist/desktop-mac/universal/
cat dist/desktop-mac/sha256.txt
```

如果只需要复查架构：

```bash
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac/arm64/Skill Flow.app" arm64
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac/x86_64/Skill Flow.app" x86_64
scripts/release/validate-mac-artifacts.sh "dist/desktop-mac/universal/Skill Flow.app" arm64,x86_64
```

## 7. 发布 GitHub Release

如果第 6 步刚成功：

```bash
scripts/release/publish-github-release.sh --skip-build
```

如果还没有生成产物，也可以直接运行：

```bash
scripts/release/publish-github-release.sh
```

脚本行为：

- 使用 `apps/cli/package.json` 计算 tag。
- 使用 `releases/RELEASE_v<version>.md` 作为 release notes。
- 如果 GitHub Release 已存在，会更新 notes 并覆盖上传资产。
- 如果 GitHub Release 不存在，会以当前 `HEAD` 创建 release。

发布后验证：

```bash
gh release view v<version> --repo VintLin/skill-flow --json tagName,name,url,isDraft,isPrerelease,assets
```

要求：

- `tagName` 是 `v<version>`。
- `isDraft` 和 `isPrerelease` 符合本次发布要求。
- 7 个资产都存在：三份 `.dmg`、三份 `.zip`、一份 `sha256.txt`。

## 8. 发布 CLI npm 包

仅当本次版本需要同步 npm 时执行：

```bash
npm run -w skill-flow publish:release -- --access public
```

验证：

```bash
npm view skill-flow@<version> version
npm view skill-flow@<version> dist.tarball
```

不要使用：

```bash
cd apps/cli && npm publish
```

该路径会被仓库 guard 拒绝，因为发布前需要生成只包含外部依赖的 staged package。

## 9. 最终检查

```bash
git status --short
gh release view v<version> --repo VintLin/skill-flow --json url,assets
npm view skill-flow@<version> version
```

最终回复必须包含：

- 发布版本和 GitHub Release URL。
- 已上传资产数量。
- npm 是否发布；如果未发布，说明原因。
- 实际执行过的验证命令。
- 任何失败、重试或保留的本地未提交文件。

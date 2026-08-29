# Import Discovery Deepening

Date: 2026-08-29
Status: Active

## Objective

将推荐、搜索、本地扫描、预览、provider fallback、可重建 cache 和请求去重收拢为 deep Import Discovery module；保留 `SkillFlowApp` 的稳定外部 interface，并让 preparation、final Import 与 Protected Group Operation Transaction 保持独立。

## Invariants

- Import Discovery 只读；不得写 manifest、lock、preferences、target projection 或 recovery journal。
- discovery、scan、preview 继续允许并发；不得进入 Serial Mutation Channel。
- Bounded Preparation Pool、final Import transaction、quit recovery 与 Recovery Required 行为保持不变。
- one-shot `importSource` 只能组合正式 preparation → transaction commit，不再回退到旧 add/apply 路径。
- fresh cache 直接返回；stale cache 立即返回并后台刷新；相同 query、feed、source 同时最多一个 in-flight request。
- cold recommendations 只同步 seed；其余 feed 后台加载；preview prewarm 上限保持 4。
- locator 与 selector 规则必须由 discovery 与 final Import 共用，不允许复制。
- replace-don't-layer：module interface 测试稳定后删除穿透 `SkillFlowApp` 的重复测试。

## Module placement

```text
packages/query / SkillFlowApp
        ↓
packages/core-engine / ImportDiscovery
        ↓
packages/storage + packages/integration + packages/domain
```

`SkillFlowApp` 保留 authority snapshot、mutation queue、audit、preparation、final Import 和 transaction 编排。Import Discovery 使用 domain 的 `ManifestFile` / `LockFile`，不得反向依赖 query 类型。

## Implementation order

### 1. Import source policy

- 收拢 GitHub locator、direct locator、selector normalization、selector ranking 与 leaf matching 纯规则。
- runtime discovery 与 final Import 同时改用该 policy。
- 删除 one-shot Import 的非 transaction fallback。

Tests:

- exact repo、tree URL、`owner/repo@selector`、shorthand subpath。
- quoted local path、home-relative path、ClawHub、GitLab。
- root Skill、standard skills bucket、curated/experimental/system bucket 的 selector precedence。
- preparation 失败不得进入旧 add/apply fallback。

### 2. Catalog, preview, and cache

- 新增 `ImportDiscovery`，迁移 recommendations、search、preview、source snapshot 与三组 in-flight state。
- provider adapter 只负责外部读取；cache、fallback、reason code 和 stale-while-revalidate 留在 module implementation。
- `inspectSourceEnrichment` 与 migration warmup 改为调用 module。

Tests:

- concurrent query/source/feed request dedupe。
- fresh cache 不发请求。
- stale cache 立即返回并后台刷新。
- provider failure 回退 stale snapshot。
- cold recommendation 不等待 remote feeds。
- preview prewarm 上限不变。

### 3. Local Scan

- 迁移 local scan classification、variant grouping、managed 判断和 choices。
- 删除旧 `groups` + 新 `localScanGroups` 双结果计算，只保留最终 `localScanGroups` 逻辑。
- 删除 production 不可达的 legacy Agents origin reader 及其 origin preview/match 分支。

Tests:

- realpath dedupe。
- same-name same-hash / different-hash。
- managed、manual、target-agent。
- local-only、version-conflict、already-managed。
- scan 前后 authority state 完全不变。

### 4. Cleanup and verification

- 删除 runtime 内旧 implementation、in-flight maps、无用 imports 和被替代测试。
- 删除 production 不可达的 legacy Agents origin test seam。
- 删除 Import preparation cache 中无消费的 `schemaVersion`、selector snapshot、target snapshot 与 revision snapshot 字段；不改变 Shared Skill State schema。
- 将可重建 Import Data repo cache 收敛为单一 Skills snapshot，删除无人生产的 multi-provider、identity 与 resolved metadata 投影。

Verification:

- `npm run build`
- `npm test -w @skill-flow/core-engine`
- `npm test -w @skill-flow/query`
- `npm test -w skill-flow`
- affected desktop bridge/workflow tests
- `codegraph sync` / `codegraph status`

## Commit discipline

每个阶段独立提交；不把 policy 移动、行为清理、cache shape 变化和 Local Scan 重写混入同一提交。任何外部 bridge 行为变化必须同步契约测试和文档。

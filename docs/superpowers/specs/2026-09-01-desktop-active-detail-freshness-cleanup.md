# Desktop Active Detail Freshness Cleanup

## Problem Statement

用户在 macOS 桌面端打开 Skill Group 详情并执行 Update 后，源 checkout 可能已经成功提交到新版本，但当前详情 projection 仍继续展示更新前的 inspect payload 或已经准备好的文档内容。新增、删除或修改的 Skill 因而可能没有及时反映到完整文档、内容统计、目录树和当前选择中，用户无法确认屏幕内容是否与刚完成的更新一致。

问题的根因不是源更新失败，而是 durable mutation commit 与 detail projection 之间没有明确的新版本边界：普通详情检查可能复用更新前的 in-flight inspect，旧 inspect 或旧文档准备又可能在更新完成后迟到并覆盖新结果。当前 PR 虽然覆盖了这些竞争，但把 freshness、重试、同步策略和 route/scope 资格拆散为多组布尔参数、重复 payload cache 与旁路 retry set，同时混入最近更新徽标和无关测试维护，扩大了变更范围和理解成本。

在继续开发前，需要先把当前分支恢复为只包含本工作包所需证据的聚焦基线，再以单一 detail projection 状态和单一提交后刷新流程重新实现相同行为。

## Solution

用户完成单个或批量 Update 后，桌面端只对更新完成时仍处于当前 route、仍是受影响 Skill Group、且 project scope 未改变的详情启动一次提交后的全新 inspect。新 inspect 必须拥有高于更新前请求的 generation，旧请求和旧文档准备不得回写。新 payload 被接受后，桌面端撤销旧的已准备内容，并重新生成完整 Skill 文档、内容统计和目录树。

详情 projection 只保留一个权威状态 owner。该状态同时表达最后可用 payload 与 freshness；刷新失败时保留最后可用 payload，并把状态显式标记为需要重新检查，而不是把“存在但已过期”伪装成“没有 payload”。用户重新进入详情时，桌面端根据 freshness 自动重试。

单个 Update 与 Bulk Update 共享同一个提交后详情刷新流程。调用方只提供更新范围与 operation scope，并消费明确的刷新 outcome，不再组装多组布尔策略。Update 已提交但详情刷新失败时，不回滚 mutation、不显示普通成功提示，只显示一次明确警告。

Bulk Update 只允许已经成功到达 mutation commit 的 Skill Group 进入提交后详情刷新。mutation partial failure 与 detail refresh failure 是两个独立事实；两者同时发生时，用户必须在同一个明确结果中同时看到 mutation 失败与详情仍旧的风险，任一事实都不能覆盖另一个。

远程 enrichment 不因 Update 被强制重新获取，但它与 inspect projection 具有明确的字段所有权和接受代次。更新前启动的 enrichment 不能覆盖新 inspect 所拥有的 source、summary、leaf、路径或本地内容事实，也不能重新启动旧版本的文档准备。

开始实现前，先从最终 diff 中移除与详情 freshness 无关的测试维护、最近更新徽标 generation 和固定 sleep 放宽，确认工作区与结构索引干净后再建立失败测试。

## User Stories

1. As a desktop user, I want the open Skill Group detail to reflect the source version that just finished updating, so that I can trust the content I am reading.
2. As a desktop user, I want a newly added Skill to appear immediately after Update, so that I do not need to leave and reopen the group.
3. As a desktop user, I want an updated Skill document to show its complete local content, so that its description is not mistaken for the full document.
4. As a desktop user, I want content statistics to be recomputed from the accepted source version, so that displayed counts match the current document.
5. As a desktop user, I want the detail file tree to be rebuilt from the accepted source version, so that newly added or removed files are represented correctly.
6. As a desktop user, I want a no-op Update started from the active detail to perform a fresh inspect, so that local drift or previously stale presentation state can be corrected.
7. As a desktop user, I want a no-op Update started away from the detail page to avoid preparing unrelated detail content, so that background work remains bounded.
8. As a desktop user, I want Bulk Update to refresh only a currently open group that belongs to the submitted update range, so that unrelated details are not inspected.
9. As a desktop user, I want returning Home before Update completes to remain on Home, so that completion does not reopen an old detail route.
10. As a desktop user, I want switching to another Skill Group before Update completes to keep the new group selected, so that completion does not steal navigation.
11. As a desktop user, I want switching project scope before Update completes to preserve the new scope, so that an old operation cannot project data into the current workspace.
12. As a desktop user, I want an inspect started before Update to be ignored if it completes after the post-update inspect, so that old payload cannot overwrite current content.
13. As a desktop user, I want document preparation started before Update to be ignored if it completes after the new detail version, so that stale prepared content cannot return.
14. As a desktop user, I want a committed Update to remain committed when the follow-up detail refresh fails, so that a presentation failure does not undo durable source work.
15. As a desktop user, I want one clear warning when the follow-up detail refresh fails, so that I understand the source is updated but the visible detail may be stale.
16. As a desktop user, I want the last usable detail to remain visible after a refresh failure, so that the page does not collapse into an unnecessary empty state.
17. As a desktop user, I want reopening a stale detail to retry automatically, so that recovery does not require another source Update.
18. As a desktop user, I want a removed selected Skill to fall back to the first remaining Skill, so that the detail does not retain a ghost selection.
19. As a desktop user, I want a group with no remaining Skills to return to its overview, so that all selection and tree state remain valid.
20. As a maintainer, I want one authoritative detail projection state per project scope and source, so that payload and freshness cannot diverge across modules.
21. As a maintainer, I want single and bulk updates to use the same post-commit refresh flow, so that failure and route behavior cannot drift.
22. As a maintainer, I want request generation and stale-result rejection hidden behind the inspect interface, so that callers do not coordinate token maps themselves.
23. As a maintainer, I want explicit refresh outcomes instead of boolean policy combinations, so that each caller handles only observable results.
24. As a maintainer, I want tests to observe behavior through the update and detail interfaces, so that internal refactoring does not require rewriting the suite.
25. As a maintainer, I want unrelated test maintenance removed before implementation begins, so that the final diff communicates one coherent change.
26. As a desktop user, I want a failed superseded inspect to remain invisible after a newer inspect succeeds, so that a late error cannot replace a valid update result.
27. As a desktop user, I want Bulk Update to refresh only groups that actually reached their mutation commit, so that failed source updates are not presented as refreshed.
28. As a desktop user, I want Bulk mutation failures and detail refresh failures to remain simultaneously visible, so that one warning cannot hide another failure.
29. As a desktop user, I want a malformed successful inspect response to be treated as a detail refresh failure, so that stale content is never labelled fresh without a usable payload.
30. As a desktop user, I want re-entering a stale detail route to trigger the retry automatically, so that the recovery behavior is proven at the real screen-entry lifecycle.
31. As a desktop user, I want an enrichment request started before Update to remain metadata-only when it finishes later, so that it cannot restore old source content.
32. As a maintainer, I want source deletion to clear all newly owned projection, freshness, request-generation, and prepared-content state, so that a reused source identifier cannot inherit stale update state.

## Implementation Decisions

- The work begins with a cleanup phase. The final diff must remove unrelated luminance type-inference maintenance, generic async assertion concurrency maintenance, bridge timeout relaxation, and tag-order fixture maintenance. Those changes may be preserved only in a separate work item with their own evidence.
- Recently Updated indicator timing, registration ordering, generation tokens, pruning races, and fixed-sleep test relaxations are outside this work package. Their current branch changes and associated claims are removed before implementation. If the indicator still has a reproducible race, it receives a separate spec and regression test.
- Current cleanup evidence identifies three wholly unrelated test-maintenance commits and four marker-only or marker-stability commits. One additional mixed commit changes both marker registration timing and Update coordination, so cleanup is performed by behavior and final diff rather than by blindly reverting every commit.
- The current PR head is retained as a recoverable evidence reference. After the spec is committed, the feature history is rebuilt from the current `origin/main` baseline; the `main` branch itself is neither switched nor modified. This is safer than stacking reverts across the interdependent current commits.
- The cleanup phase is complete only when the spec is tracked, the worktree contains no uncommitted files, the branch diff contains only active-detail-freshness scope, diff whitespace checks pass, and the structural index reports current source state.
- Detail projection state has one authoritative owner in the presentation layer. Source inspection orchestration owns in-flight requests and generation comparison, but does not retain a second payload cache.
- Each scoped detail projection stores the last usable payload and an explicit freshness state. Freshness distinguishes at least absent, fresh, and refresh-required states.
- Detail entry decides whether an inspect is needed from explicit freshness and in-flight state. A cached but refresh-required payload remains renderable while still causing re-entry to retry.
- Normal navigation inspect may share an existing request for the same scoped source. Post-update inspect always starts a new generation and cannot reuse a request that began before the mutation commit.
- Only the latest inspect generation for a scoped source may update the detail projection. Completion of an older generation is a no-op whether it succeeds or fails; it does not throw into presentation handling and does not mutate toast, warnings, freshness, selection, payload, or prepared content.
- Single Update and Bulk Update call one purpose-specific post-commit detail refresh module. Its interface accepts the affected source identifiers and captured operation scope, performs completion-time route/source/scope eligibility checks, and returns a named outcome.
- The mutation result supplies the identifiers that successfully reached commit, including successful no-op updates. A source reported as failed is never eligible for post-commit detail refresh even if it was originally requested.
- The refresh outcome distinguishes not-applicable, refreshed, and refresh-failed behavior. Ineligibility before inspect and route/source/scope changes while inspect is running both produce not-applicable. Not-applicable preserves the ordinary mutation outcome; only a still-eligible inspect failure produces refresh-failed.
- Bulk mutation outcome remains independent from detail refresh outcome. If mutation partial failure and refresh failure both occur, one combined localized warning preserves the partial mutation summary, first actionable mutation failure, and stale-detail recovery instruction.
- The caller does not receive flags for selection mutation, forced inspection, scope preservation, or failure presentation.
- Mutation workspace synchronization must not overwrite the user's current route or project scope. Update-specific synchronization expresses this invariant through a named interface rather than a Boolean option.
- A successful post-update inspect atomically replaces the scoped payload, marks it fresh, invalidates prepared detail content for the accepted version, and schedules new preparation only when that detail is still active.
- A bridge response is accepted as a successful inspect only when it is successful and contains a valid detail payload for the requested scoped source. Missing, malformed, or mismatched payload is refresh-failed for a post-update refresh and an ordinary load failure for first entry.
- A failed post-update inspect leaves the last usable payload intact, marks the scoped projection refresh-required, suppresses the ordinary update-success presentation, and emits one localized warning. It does not roll back the committed mutation.
- Enrichment has its own generation and metadata-only ownership. A pre-commit enrichment result may be retained without a new network request only when its source identity still matches; its merge cannot replace inspect-owned source, summary, leaf, path, revision, document, statistics, or tree facts. A superseded or identity-mismatched enrichment completion is a no-op.
- A successful later inspect clears refresh-required state.
- The presentation owner exposes one source-removal cleanup entry point. It removes scoped projection and freshness entries, asks inspection orchestration to cancel and invalidate all generations for the source, and invalidates prepared detail content. Existing app-lifetime selection/document stores are not rearchitected by this work; accepted detail reconciliation must still prevent ghost selections when the same identifier is introduced again.
- Detail selection reconciliation runs when the accepted detail version changes. A missing selected Skill falls back to the first remaining Skill; an empty Skill list clears pending/current/tree selection and returns to the group overview.
- Detail version observation may expose an existing revision value to the view, but revision exists only to identify accepted projection changes. It does not become a second freshness source.
- Detail screen entry delegates its lifecycle work to one testable container entry point. That entry point decides from freshness and in-flight state whether to inspect, performs the inspect, and applies accepted selection reconciliation. SwiftUI task wiring remains thin.
- No alias, shim, compatibility branch, new persistent setting, new bridge command, or new external protocol is introduced.
- Existing Group Operation Queue serialization and quit recovery semantics remain unchanged. The post-commit detail refresh occurs after a source transaction reaches its existing commit point.
- The final implementation removes replaced helpers, overloads, Boolean policy parameters, retry sets, duplicate caches, obsolete tests, and obsolete PR claims in the same change; no intermediate compatibility path remains. The three-language detail-refresh warning remains part of the required behavior.

## Testing Decisions

- The primary test seam is the desktop view model's existing Update and Bulk Update behavior with the local bridge fixture. Tests invoke the same update entry points as the UI and observe route, scope, visible detail projection, localized presentation, and logged bridge requests.
- Automatic retry on route re-entry is tested through the detail container's real entry operation used by the screen lifecycle. The test does not manually call the predicate and then manually invoke source selection as a substitute for entry.
- Tests assert external behavior rather than token values, cache dictionaries, private retry sets, or helper call order. Generation is verified by completing an older inspect after a newer one and asserting that visible detail remains current.
- The primary seam covers active-detail single Update, active-detail no-op Update, Home no-op Update, Bulk Update eligibility, leaving detail, switching groups, switching project scope, stale inspect completion, stale document preparation, committed-update refresh failure, and automatic retry on re-entry.
- Stale inspect coverage includes both late success and late failure after a newer accepted inspect. Both outcomes must leave the newer detail, toast, warnings, freshness, and preparation unchanged.
- Enrichment coverage completes a pre-commit enrichment after the post-update inspect and verifies that only enrichment-owned metadata may change; inspect-owned content and warmup generation remain current without forcing another remote request.
- The existing pure detail-route selection seam is retained only for selected-Skill deletion and empty-group fallback, because those are deterministic presentation-state rules that do not require bridge execution.
- Failure-first evidence is required before implementation for the stale-detail root cause, stale inspect overwrite, refresh-required retry, and Bulk refresh-failure presentation.
- Tests use request gates, continuations, logged-request milestones, or bounded eventually assertions to control concurrency. New fixed sleeps are not accepted as the sole synchronization mechanism.
- The suite verifies that a cached refresh-required detail remains renderable while the detail entry still requests a new inspect.
- The suite verifies that source deletion clears freshness and retry behavior before the same source identifier can be reintroduced.
- Source deletion coverage also verifies cancellation/no-op behavior for an in-flight inspect and invalidation of prepared detail content. Existing selection state is reconciled against the newly accepted detail rather than trusted by identifier alone.
- The suite verifies that an inactive or out-of-scope detail never receives post-update payload, selection, warning, or warmup changes.
- The suite verifies both the mutation response path that contains a workspace projection and the fallback path that requires list/doctor synchronization.
- At least one core active-detail refresh success case uses the mutation workspace path, and at least one uses list/doctor fallback; failure behavior is not inferred from only one synchronization path.
- Bulk coverage includes a requested active source whose mutation fails, plus a partial mutation failure combined with a detail refresh failure. It verifies that failed sources are not inspected and neither failure is hidden.
- Inspect contract coverage treats missing, malformed, or source-mismatched successful payloads as non-acceptable.
- Existing detail document hydration and render-cache tests remain the prior art for complete document, statistics, and file-tree rebuilding. Existing route and project-scope tests remain prior art for navigation ownership.
- Validation runs the smallest affected desktop tests first, then the complete desktop test suite, then the repository build and test entry points. A platform-dependent skip is recorded rather than described as a pass.
- Final installed-app visual verification checks that Update immediately refreshes full content, statistics, and file tree without reopening the group and without error 599.

## Out of Scope

- Recently Updated indicator duration, generation, pruning, and cross-scope marker behavior.
- Generic macOS CI timing stabilization, compiler type-inference cleanup, Sendable cleanup, tag ordering, and bridge timeout tuning.
- CLI or TUI behavior changes.
- Bridge request or response schema changes.
- Group Operation Queue ordering, preparation concurrency, cancellation, or durable recovery changes.
- Forcing a new remote enrichment request solely because a source Update completed. Enrichment ownership and stale-result isolation remain in scope.
- A broad decomposition of the entire desktop view model beyond the detail projection and post-update refresh seam.
- New user settings, persistent retry queues, background job panels, manual Cancel actions, or cross-launch detail refresh jobs.
- Release packaging, publication, merge to `main`, or modification of unrelated documentation.

## Further Notes

- The authoritative terminology is mutation commit, detail projection, scoped source, inspect generation, prepared detail content, and refresh-required freshness.
- The current branch is evidence for the required behavior but is not the desired implementation shape. Cleanup removes unrelated and replaced logic before new implementation begins rather than layering another refactor on top.
- Cleanup restores `origin/main` Recently Updated behavior exactly; it does not delete the existing indicator feature. The removed scope is only the current branch's marker registration relocation, generation tokens, timing relaxations, related tests, and PR claims.
- Cleanup removes the current branch's unrelated luminance, async assertion, bridge timeout, and tag-order changes. Existing baseline tests remain untouched.
- Safe execution order is: preserve the current PR reference; commit and record this spec commit; rebuild the feature branch from `origin/main`; explicitly reapply the recorded spec commit to the rebuilt history; restore failure-first behavior tests; implement the single projection state and post-commit refresh flow; delete replaced state and helpers; run focused and full validation; then rewrite PR claims and evidence.
- The repository currently lacks the configured Matt Pocock Issue Tracker and triage vocabulary files. Publishing this spec and applying `ready-for-agent` remains pending until `setup-matt-pocock-skills` restores that configuration.
- The existing PR's installed-app visual acceptance remains incomplete and must not be inferred from automated tests.

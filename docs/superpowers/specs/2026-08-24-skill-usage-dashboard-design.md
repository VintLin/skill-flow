# Skill Usage Dashboard Design

Date: 2026-08-24

## Problem Statement

Skill Flow 已经可以从本地 Agent 会话、日志和调用记录中采集 Skill Usage Observation，但当前 Usage 页面和统计契约还不足以支撑用户真正判断 Skill 使用情况。

用户现在遇到的问题是：

- 页面只能展示列表摘要，不能直观看到 Skill 使用随时间变化。
- 图表、Skill 列表、Agent 列表容易使用不同统计口径，导致点击联动后数量不一致。
- Agent Coverage 被误用成 Agent 使用排行；但 Agent Coverage 实际表示采集健康度，不是使用分析。
- Skill 总数、使用技能总数、技能运行总数、聊天/调用记录等指标含义不够清晰。
- Codex、Zcode、OpenCode、WorkBuddy、Claude Code 等不同 Agent 的 Skill 调用来源不同，UI 需要展示统一结果，而不是暴露每个 Agent 的日志细节。
- label-only Skill 也要能被统计和点击；不能因为没有匹配到库存 Skill ref 就失去交互能力。

## Solution

Usage 页面改为由统一的 Usage Snapshot analytics contract 驱动。Snapshot 在后端完成同一口径的时间范围过滤、Skill 去重、Agent 聚合、Skill-Agent matrix、分时活跃和排行统计。桌面端只负责展示和轻量交互，不直接读取或重新解释 Agent 原始日志。

用户将在桌面 Usage 页面看到：

- 标题为 `Skills Usage` 的页面。
- 时间范围切换：今天、24H、7D、30D、90D、自定义。
- 时间范围下方的分时活跃卡片，用 7 天 × 24 小时热力图展示本地时间活跃度。
- 分离面积图，不使用 stack 叠加；默认按 Skill 展示。
- 图表 hover 信息卡片，展示当前时间点的总调用次数和各 series 调用次数。
- 三列统计面板：
  - 活动洞察：技能总数、使用技能总数、技能运行总数、聊天/调用记录。
  - 最常用的技能：前 20 个 Skill，显示与图表一致的颜色点和运行次数。
  - 最常用的 Agent：前 20 个 Agent，显示运行次数。
- 点击 Skill 后：
  - 图表只展示该 Skill，并按 Agent 区分调用次数。
  - Agent 列显示该 Skill 在各 Agent 中的调用次数。
- 点击 Agent 后：
  - 图表展示该 Agent 调用过的 Skill。
  - Skill 列显示该 Agent 下的 Skill 调用记录。

## User Stories

1. As a Skill Flow desktop user, I want to open a Skills Usage page, so that I can understand how my local Skills are actually being used.
2. As a Skill Flow desktop user, I want the page title to be `Skills Usage`, so that the page purpose is immediately clear.
3. As a Skill Flow desktop user, I want unnecessary explanatory copy removed from the top of the page, so that the dashboard feels compact and focused.
4. As a Skill Flow desktop user, I want to switch between 今天, 24H, 7D, 30D, 90D, and 自定义 ranges, so that I can inspect short-term and long-term usage.
5. As a Skill Flow desktop user, I want `24H` labels to show real local clock hours, so that I do not have to mentally translate relative labels like `-4h`.
6. As a Skill Flow desktop user, I want `今天` to mean the current local day, so that it matches my desktop context.
7. As a Skill Flow desktop user, I want `7D`, `30D`, and `90D` to use local date buckets, so that day labels match what I expect visually.
8. As a Skill Flow desktop user, I want a 分时活跃 heatmap above the usage chart, so that I can quickly see which weekdays and hours are most active.
9. As a Skill Flow desktop user, I want the heatmap to use low-noise neutral styling, so that it matches the rest of Skill Flow.
10. As a Skill Flow desktop user, I want the heatmap to summarize the currently selected range, so that it changes when I inspect a different time period.
11. As a Skill Flow desktop user, I want the usage chart to use separated areas rather than stacked areas, so that each Skill or Agent can be read independently.
12. As a Skill Flow desktop user, I want the usage chart lines to be curved, so that the trend view is visually smoother and easier to scan.
13. As a Skill Flow desktop user, I want the chart colors to match the dots beside Skill names, so that I can connect the chart to the list.
14. As a Skill Flow desktop user, I want hover on the chart to show a compact information card, so that I can inspect exact values at a time point.
15. As a Skill Flow desktop user, I want the hover card to show the bucket label, total calls, and per-series calls, so that I can reconcile the chart with list values.
16. As a Skill Flow desktop user, I want the left KPI column to show total available Skills, so that I know the denominator of adoption.
17. As a Skill Flow desktop user, I want total available Skills to be de-duplicated from Skill Flow inventory, so that duplicate install paths do not inflate the number.
18. As a Skill Flow desktop user, I want the KPI column to show used Skill count, so that I know how many distinct Skills were activated in the selected range.
19. As a Skill Flow desktop user, I want the KPI column to show Skill run count, so that I can see the raw number of Skill activations without de-duplication.
20. As a Skill Flow desktop user, I want the KPI column to show chat/call records, so that I can compare usage observations against future session-level counts.
21. As a Skill Flow desktop user, I want the KPI column to be non-clickable, so that it behaves like a stable summary rather than a filter.
22. As a Skill Flow desktop user, I want to see the top 20 most-used Skills, so that I can quickly identify the Skills that matter most.
23. As a Skill Flow desktop user, I want each Skill row to show its run count, so that I can compare popularity without opening details.
24. As a Skill Flow desktop user, I want each Skill row to show a color dot matching the chart, so that I can map row to series.
25. As a Skill Flow desktop user, I want to click a Skill row, so that I can isolate that Skill’s usage.
26. As a Skill Flow desktop user, I want a selected Skill row to be visibly highlighted, so that I know the dashboard is filtered.
27. As a Skill Flow desktop user, I want clicking the same Skill again to clear the Skill selection, so that I can return to the default dashboard quickly.
28. As a Skill Flow desktop user, I want the chart to split a selected Skill by Agent, so that I can see where that Skill was used.
29. As a Skill Flow desktop user, I want the Agent column to recalculate for the selected Skill, so that the Agent counts match the chart.
30. As a Skill Flow desktop user, I want to see the top 20 most-used Agents, so that I can understand which Agent environments use Skills most.
31. As a Skill Flow desktop user, I want each Agent row to show Skill run count, so that Agent usage is comparable.
32. As a Skill Flow desktop user, I want to click an Agent row, so that I can inspect only that Agent’s Skill usage.
33. As a Skill Flow desktop user, I want a selected Agent row to be visibly highlighted, so that I know the dashboard is filtered.
34. As a Skill Flow desktop user, I want clicking the same Agent again to clear the Agent selection, so that I can return to the default dashboard quickly.
35. As a Skill Flow desktop user, I want the chart to show Skills used by the selected Agent, so that I can understand that Agent’s usage mix.
36. As a Skill Flow desktop user, I want the Skill column to recalculate for the selected Agent, so that the Skill counts match the chart.
37. As a Skill Flow desktop user, I want Skill and Agent selections to be mutually understandable, so that the dashboard never mixes incompatible filters silently.
38. As a Skill Flow desktop user, I want Codex Skill calls to include archived local sessions when the Codex collector can read them, so that old work is not silently omitted.
39. As a Skill Flow desktop user, I want Zcode Skill calls to be counted from its supported local records, so that Zcode usage appears beside Codex usage.
40. As a Skill Flow desktop user, I want OpenCode Skill calls to be counted from its supported session/tool records, so that OpenCode usage is not shown as zero when local records exist.
41. As a Skill Flow desktop user, I want WorkBuddy Skill calls to be counted from its trace/session records, so that WorkBuddy usage is accurately represented.
42. As a Skill Flow desktop user, I want Claude Code Skill calls to be counted when local session records contain explicit Skill invocations, so that Claude usage is represented with the same observation model.
43. As a Skill Flow desktop user, I want unsupported or unreadable Agent sources to show as coverage diagnostics rather than fake zero usage, so that I can distinguish no data from no usage.
44. As a Skill Flow desktop user, I want local-only automatic collection, so that I do not need import/export flows to analyze usage.
45. As a Skill Flow desktop user, I want Skill Flow to avoid remote telemetry, so that local Agent records remain local.
46. As a Skill Flow desktop user, I want label-only Skill names to appear in usage analytics, so that Skills invoked by name are not lost when inventory matching fails.
47. As a Skill Flow desktop user, I want label-only Skills to still be clickable, so that I can inspect their Agent/time breakdown.
48. As a Skill Flow desktop user, I want installed Skills and unknown label-only Skills to share one ranking, so that the dashboard reflects actual usage instead of inventory status only.
49. As a Skill Flow desktop user, I want chart, Skill list, Agent list, and KPI counts to reconcile, so that I can trust the dashboard.
50. As a Skill Flow desktop user, I want the dashboard to follow Skill Flow’s native visual style, so that it feels like part of the app rather than a web prototype.
51. As a Skill Flow maintainer, I want Usage analytics to be computed in the runtime/storage layer, so that SwiftUI does not duplicate metric definitions.
52. As a Skill Flow maintainer, I want collector-specific parsing to remain modular, so that Agent log format changes can be fixed without touching the dashboard.
53. As a Skill Flow maintainer, I want the bridge response to include bounded analytics structures, so that the desktop can stay responsive.
54. As a Skill Flow maintainer, I want Agent Coverage separated from Top Agent analytics, so that health diagnostics and usage rankings do not get conflated.
55. As a Skill Flow maintainer, I want tests at the bridge snapshot seam, so that UI-facing behavior is protected without overfitting storage internals.
56. As a Skill Flow maintainer, I want tests for label-only Skill identity, so that unmatched Skills remain usable in the dashboard.
57. As a Skill Flow maintainer, I want tests for Skill-Agent matrix counts, so that click-driven chart/list updates stay consistent.
58. As a Skill Flow maintainer, I want tests for time bucket labels, so that today and 24H views do not regress to relative offset labels.
59. As a Skill Flow maintainer, I want tests for Agent collector counts, so that Codex, Zcode, OpenCode, WorkBuddy, and Claude Code remain independently maintainable.
60. As a Skill Flow maintainer, I want a documented analytics contract, so that future UI changes do not reintroduce inconsistent counting.

## Implementation Decisions

- Usage Snapshot is the sole data contract for the Usage dashboard. The desktop does not read Agent logs or recompute usage from raw observations.
- Skill Usage Observation remains the stored fact: one local, explainable observation that an Agent activated, selected, invoked by name, or invoked through a named tool a Skill.
- Skill Run is the user-facing count of Skill Usage Observations included in the current analytics range. It is not de-duplicated.
- Total Skill count is derived from current Skill Flow inventory and de-duplicated independently of usage observations.
- Used Skill count is derived from distinct Skill identities in the selected range.
- Skill identity must support both inventory-backed refs and label-only names. The normalized identity model is:

```ts
type UsageSkillIdentity =
  | { kind: "ref"; key: `ref:${string}`; skillRef: string; label: string }
  | { kind: "label"; key: `label:${string}`; skillRef: null; label: string };
```

This shape came from the prototype/data investigation because WorkBuddy, OpenCode, and some Zcode observations can expose a Skill name before Skill Flow can resolve a stable inventory ref.

- Agent Coverage remains a collection-health concept. It answers whether Skill Flow scanned a local Agent source, how many files/sources were scanned, the parser revision, scan status, and diagnostics.
- Top Agent is a usage analytics concept. It answers how many Skill Runs an Agent produced in the current range.
- The Usage dashboard presents Top Agents in the primary three-column panel. Agent Coverage should remain diagnostic and must not drive the Top Agent column.
- The default chart grouping is by Skill.
- A selected Skill changes chart grouping to Agent, using only runs for that Skill.
- A selected Agent changes chart grouping to Skill, using only runs for that Agent.
- The chart is separated area/line rendering. It must not stack series totals on top of one another.
- Chart y values are raw per-series counts for each time bucket. The visible total at a bucket is the sum of all visible series at that bucket, but individual series do not visually offset each other.
- The chart hover card uses the nearest time bucket and lists visible series counts plus a total.
- Time ranges are normalized in the runtime using local machine time for presentation buckets.
- `today` means the current local calendar day.
- `24H` means a rolling 24-hour window ending at the current rounded hour, with labels displayed as local clock times.
- `7D`, `30D`, and `90D` use local date buckets.
- `custom` accepts explicit range endpoints and uses the same aggregation path.
- The 分时活跃 heatmap is calculated from the same filtered observations as the rest of the snapshot.
- The heatmap uses weekday × hour buckets in local time.
- The bridge accepts range and limit options for `usage-snapshot`.
- The bridge output includes bounded dashboard-ready structures: KPIs, time buckets, top Skills, top Agents, Skill-Agent matrix, hourly activity, coverage diagnostics, and recent observations.
- Limits default to the UI needs: 20 visible Skills, 20 visible Agents, up to 100 chart Skill series, and bounded matrix data sufficient for click interactions. If the chart Skill cap is reached, the snapshot exposes `chartSkillsTruncated` and the UI keeps the KPI total unchanged while warning that some series are omitted.
- Matrix rows are prioritized for the visible top Skills and top Agents before the hard row cap, so normal click-through views remain reconcilable even when long-tail combinations are truncated.
- The desktop may keep selection state locally. It should not request or persist a separate import/export step.
- Automatic Local Collection remains read-only against Agent data roots. It does not write back to Agent session stores.
- Existing Agent collectors remain modular. Each collector owns how it recognizes Skill calls for one Agent family.
- Codex, Zcode, OpenCode, WorkBuddy, and Claude Code remain first-class supported Agent collectors when local records are readable.
- Unsupported Agent sources should show coverage diagnostics and should not be treated as zero usage unless a supported collector produced an empty result from a readable source.
- The HTML prototype remains a reference artifact only. Production UI must be implemented in native desktop components and project visual style.
- No gradients should be introduced. Cards, typography, borders, spacing, and neutral surfaces should follow the existing Skill Flow desktop design system.

## Testing Decisions

- The highest-value test seam is the `usage-snapshot` contract. Tests should assert externally visible counts, ranges, matrix values, and labels rather than internal helper function names.
- Storage tests should verify that a set of observations produces correct KPIs, time buckets, top Skills, top Agents, matrix, and hourly activity.
- Storage tests should include at least one inventory-backed Skill and one label-only Skill.
- Storage tests should verify that Skill Runs are not de-duplicated.
- Storage tests should verify that Used Skill count is de-duplicated by normalized Skill identity.
- Storage tests should verify that Total Skill count can be supplied from inventory and does not come from observation rows.
- Storage tests should verify today and 24H range behavior with local-time bucket labels.
- Storage tests should verify that clicking a Skill can be represented by the matrix as Agent series whose sum equals the selected Skill count.
- Storage tests should verify that clicking an Agent can be represented by the matrix as Skill series whose sum equals the selected Agent count.
- Core service tests should verify that inventory labels and inventory status are applied to the snapshot without changing raw observation counts.
- Core service tests should verify that Agent Coverage is preserved as diagnostic metadata and does not define Top Agent usage ranking.
- Bridge command tests should verify that usage-snapshot accepts today, 24H, 7D, 30D, 90D, available, and custom ranges.
- Bridge command tests should verify that unsafe or invalid limits are sanitized.
- Integration tests should continue to cover Agent collector parsing behavior independently, especially Codex archived sessions, Zcode local records, OpenCode skill/tool records, WorkBuddy traces/session records, and Claude Code explicit Skill invocations.
- Desktop decoder tests should verify that the bridge payload decodes into UI-facing Usage view data without dropping matrix, buckets, top Agents, or hourly activity.
- Desktop UI model tests should verify the selection transformation: default by Skill, selected Skill by Agent, selected Agent by Skill.
- Manual verification should run a refresh, request a 30D snapshot, open the desktop Usage page, and reconcile chart/list/KPI counts for at least one Skill and one Agent.
- Tests should not assert pixel-perfect chart drawing. They should assert data mapping, interaction state, and count reconciliation.

## Out of Scope

- Remote telemetry or cloud sync of usage analytics.
- Import/export flows for usage data.
- Writing back to Agent session stores.
- Deleting or modifying Agent logs, archived conversations, traces, or local databases.
- Replacing collector-specific parsers with a generic tool-call counter.
- Counting arbitrary tool calls as Skill usage.
- Treating lifecycle events such as install, update, sync, deployment, or removal as Skill usage.
- Full session/chat semantic reconstruction beyond the current observation count.
- New cross-machine analytics or team analytics.
- Replacing the rest of the Home UI.
- Shipping the HTML prototype as production UI.

## Further Notes

- The most important correctness rule is that chart, Skill list, Agent list, and KPIs must all come from the same filtered observation set and normalized Skill identities.
- `Agent Coverage` and `Top Agent` must remain separate terms in docs and code. Coverage is scan health; Top Agent is usage ranking.
- The first production version should optimize for local correctness and maintainability over exhaustive historical reconstruction from every possible third-party Agent.
- When an Agent source cannot be read or its schema drifts, the dashboard should surface diagnostics rather than silently manufacturing zero usage.
- The existing local demo confirms the desired visual direction and interaction model, but production should use the native desktop style system.

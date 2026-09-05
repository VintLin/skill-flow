# Skill Flow Architecture Boundaries and Runtime Deepening

## Problem Statement

Skill Flow 已经具备状态权威模型、source authority、deployment projection、CLI/TUI/Desktop 多入口和 bridge protocol，但应用层边界正在变得模糊。共享的 query runtime 持续吸收 workflow、cache、import、collection、usage、migration、external source 和 deployment orchestration；integration utils 同时承载外部适配、命名、格式化和 CLI 辅助；projection reconciliation 横跨多个包；Swift 与 TypeScript 分别维护一套 bridge payload 解释。随着功能增加，修改半径、协议漂移和 projection 状态风险都会上升。

## Solution

将 Skill Flow 的下一阶段架构收敛为三个稳定边界：Application Commands/Queries、Projection Subsystem 和 Bridge Contract。保留当前状态驱动模型与 CLI bridge 运行方式，先通过内部模块边界和契约测试降低耦合，再根据真实的后台任务需求评估 daemon 化。状态文件仍是权威源，target 目录仍是派生投影，external source 仍由外部安装器拥有。

## User Stories

1. As a CLI user, I want source mutations to follow one application command path, so that CLI behavior remains consistent across add, update, uninstall, import, and apply.
2. As a desktop user, I want bridge commands to expose stable request and response contracts, so that desktop updates do not silently break when the TypeScript runtime evolves.
3. As a TUI user, I want workflow views to be produced by application queries, so that presentation code does not need to know storage or integration internals.
4. As a maintainer, I want command and query responsibilities separated, so that read-only features do not depend on mutation orchestration.
5. As a maintainer, I want projection planning, execution, ledger updates, and recovery to share one subsystem boundary, so that target state can be reconciled safely.
6. As a maintainer, I want projection operations to be idempotent, so that retries after interruption do not duplicate or remove unrelated files.
7. As a maintainer, I want ownership rules to be enforced by the projection subsystem, so that external sources and unmanaged target paths are never mutated accidentally.
8. As a maintainer, I want bridge commands to declare their request schema, response schema, error codes, timeout class, and mutation status, so that protocol behavior is reviewable.
9. As a desktop maintainer, I want TypeScript and Swift bridge command catalogs to be checked against one contract source, so that command drift is detected before release.
10. As a maintainer, I want persisted domain state, runtime cache, and presentation DTOs to remain distinct, so that UI changes do not force state migrations.
11. As a maintainer, I want integration adapters to own external IO while application services own use cases, so that provider-specific behavior does not leak into UI modules.
12. As a maintainer, I want existing CLI, TUI, query, core-engine, storage, and bridge tests to remain valid at the highest available seam, so that refactoring does not weaken behavioral coverage.
13. As a release owner, I want architecture changes to preserve the existing CLI surface and bridge protocol behavior unless explicitly versioned, so that current users can upgrade safely.
14. As a future client author, I want application queries to be reusable without constructing the entire mutation facade, so that new clients can share runtime behavior.
15. As a future background-task owner, I want the transport boundary to remain independent from command semantics, so that a long-lived helper can be introduced without rewriting the domain.
16. As a user recovering from an interrupted operation, I want doctor and recovery results to be derived from authority state and the projection ledger, so that filesystem accidents do not become new authority.
17. As a maintainer, I want migration and recovery commands to remain explicit, so that state transitions are observable and reversible where supported.
18. As a maintainer, I want architecture documentation to state the authority, ownership, idempotency, and protocol invariants, so that future changes can be evaluated consistently.

## Implementation Decisions

- Introduce an application-layer distinction between mutation commands and read-only queries. Existing runtime behavior remains the source of truth while responsibilities are extracted behind stable internal interfaces.
- Keep the current package direction: presentation clients depend on application/query APIs; application services depend on core-engine, storage, integration, and domain; domain remains free of infrastructure dependencies.
- Treat the current shared runtime as a composition root during the transition. Do not add compatibility aliases or shims for internal callers; move callers directly to the new application seams.
- Define a projection subsystem around plan, execute, ledger, recovery, conflict policy, and target adapter capabilities. The subsystem must preserve manifest authority, lock/ledger semantics, external ownership, and unmanaged-path safety.
- Keep persisted state files as authority. Do not add UI-only, cache-only, or transport-only fields to manifest or lock unless a separate state contract requires them.
- Define bridge command metadata for request/response shape, error codes, read/mutation classification, timeout class, and cancellation behavior. Preserve protocol version `1.0` for compatible changes; version only incompatible changes.
- Add contract fixtures or generated catalog data sufficient to detect TypeScript/Swift command-name and envelope drift. Payload validation should become command-specific at the application boundary rather than relying only on generic JSON validity.
- Keep the current process-based CLI bridge as the transport for this stage. A daemon or long-lived helper is explicitly deferred until background-task requirements justify it.
- Keep integration utilities focused on external IO, provider/source locators, and adapter capabilities. Move application policy and presentation formatting toward their owning layers when touched by this work.
- Preserve the existing external behavior of CLI commands, state schema, bridge response envelope, target ownership, and external-source lifecycle unless a separate versioned decision is approved.

## Testing Decisions

- Prefer the highest seam available: application command/query behavior and bridge request/response behavior, rather than private helper tests.
- Preserve and extend existing query end-to-end tests for state transitions, source lifecycle, import, collections, usage, and projection rebuild behavior.
- Add projection subsystem tests that assert external behavior: plans, applied target files, ledger records, idempotent retries, conflict outcomes, recovery outcomes, unmanaged paths, and external source ownership.
- Extend shared-types protocol tests with command metadata and command-specific payload/response fixtures.
- Add a cross-language catalog check or checked-in fixture consumed by Swift tests and TypeScript tests; the test should fail when command names, protocol version, or required envelope fields drift.
- Keep storage tests focused on authority-file atomicity, migration generation, locking, and recovery semantics.
- Keep CLI/TUI tests focused on user-visible command and interaction behavior; do not assert the internal class layout.
- Use the existing `npm run build` and `npm test` entry points as required validation. Run desktop Swift tests when bridge contract or desktop-facing behavior changes.
- Tests must verify external behavior and invariants, not the number of classes, file names, or private method calls used to implement the seams.

## Out of Scope

- Rewriting the system as a daemon or background service.
- Changing the public CLI command surface or introducing a new bridge protocol version.
- Replacing the JSON state model with a database.
- Redesigning the SwiftUI user interface.
- Adding new source providers or deployment targets.
- Reworking unrelated domain features, release packaging, or usage collection semantics.
- Publishing, deploying, or changing release artifacts as part of the architecture boundary work.

## Further Notes

Validation results are recorded when this work is executed. The historical analysis snapshot is not a current build or test guarantee.

The repository does not currently contain the configured Matt Pocock issue tracker and triage vocabulary files. This local spec is therefore not published and is not marked in an external tracker. Run `/setup-matt-pocock-skills` before publishing and applying the `ready-for-agent` label.

## Completion Criteria

The architecture work is complete only when every criterion below is satisfied:

1. Application mutation commands and read-only queries have explicit, documented seams; CLI, TUI, and Desktop callers use those seams without depending on private runtime internals.
2. The shared runtime is reduced to composition/orchestration responsibility; no new feature-specific behavior is added to a monolithic facade.
3. Projection planning, execution, ledger updates, recovery, conflict policy, and target adapter capabilities are exposed through one coherent subsystem boundary.
4. Projection behavior is proven idempotent for retry, interruption, recovery, unmanaged paths, and external-source ownership cases.
5. Persisted authority state, runtime caches, and presentation DTOs remain separate; no UI-only or transport-only fields are added to authority files.
6. Every bridge command has an explicit request/response contract, error vocabulary, mutation/read classification, timeout class, and cancellation behavior.
7. TypeScript and Swift bridge catalogs and response envelopes are checked by automated contract validation, with no command drift.
8. Existing CLI behavior, state schema compatibility, external-source ownership, and protocol version `1.0` remain compatible unless a separately approved versioned change is required.
9. Existing relevant tests are preserved and new tests verify external behavior at the application, projection, storage, and bridge seams; tests do not assert implementation layout.
10. `npm run build`, `npm test`, and the relevant macOS `swift test` suite are run for the affected surfaces; platform-specific skips and unrelated pre-existing failures are recorded.
11. `docs/ARCHITECTURE.md` and relevant ADRs describe the final boundaries and invariants, and the local issue records the validation commands and outcomes.
12. The affected architecture has no newly introduced compatibility shim, duplicate command path, or undocumented ownership rule. Unrelated TODOs are outside this spec's completion criterion.

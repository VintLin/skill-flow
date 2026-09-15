# Project Doctor implementation and acceptance record

Scope: [spec #5](https://github.com/ren2019/skill-flow/issues/5), tasks [#6](https://github.com/ren2019/skill-flow/issues/6), [#7](https://github.com/ren2019/skill-flow/issues/7), [#8](https://github.com/ren2019/skill-flow/issues/8), [#9](https://github.com/ren2019/skill-flow/issues/9). Latest issue bodies and comments were read on 2026-09-13; none had comments. The explicit GitHub tracker instruction takes precedence over the repository's older local-tracker document. Vocabulary and decisions are in [CONTEXT.md](../../CONTEXT.md) and [ADR 0004](../adr/0004-read-only-project-health-check.md).

**Automated acceptance is complete:** implementation, TypeScript checks, the full macOS build/test gate, and packaging pass. The user-facing desktop Doctor control/report was intentionally removed; the desktop bridge and internal synchronization compatibility remain covered. No issue was edited or closed, application installed, or release published. Following the explicit review/PR request on 2026-09-14, a separate PR branch was prepared from fork main; the original implementation branch remains preserved locally.

## Use

```sh
# Explicit path, including an unregistered project; does not register or initialize state.
skill-flow doctor --project /absolute/path/to/project

# Existing global maintenance behavior.
skill-flow doctor
```

Desktop keeps the shared Doctor bridge and internal synchronization behavior, but does not expose a user-facing Doctor toolbar control or report sheet. Use the CLI for an explicit project report. Changing selection while an internal request is running does not relabel its result. Requests for the same path share a running check; different projects remain separate.

`SkillFlowApp.doctor({ projectPath })` is the shared project entry point. Omitted options preserve the global path. Project reports add optional fields to the existing report contract; legacy global reports remain decodable. `coverage.complete` describes inspection, independently of whether a deployment baseline exists. `externalSkillCount` counts valid external candidates; `managedSkillCount` counts present expected deployment paths examined, including paths with reported conflicts.

## Evidence map

The following test suites use the public runtime entry point and real temporary projects/sources:

- **R** — [project-doctor.test.ts](../../packages/query/src/tests/project-doctor.test.ts): 27 tests for baseline, roots, missing targets, naming, symlinks, managed validity, uncertainty, and read-only failures.
- **C** — [project-doctor-copy.test.ts](../../packages/query/src/tests/project-doctor-copy.test.ts): 12 tests for current content comparison, source validity, capability-specific advice, mixed status, and read-only results.
- **E** — [project-doctor-external.test.ts](../../packages/query/src/tests/project-doctor-external.test.ts): 10 tests for external candidates, scope, validity, links, coverage, and read-only results.
- **B** — [bridge-command.test.ts](../../apps/cli/src/tests/bridge-command.test.ts), [doctor-command.test.ts](../../apps/cli/src/tests/doctor-command.test.ts), and [doctor-format.test.ts](../../packages/integration/src/tests/doctor-format.test.ts): path propagation, real CLI invocation, legacy/global compatibility, every new issue family, paths, Agent associations, counts, coverage, and advice.
- **D** — [MainViewModelSelectionTests.swift](../../apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelSelectionTests.swift): captured scope/path, same-project coalescing versus separate project checks, no global fallback for a missing project path, and report decoding. The full merged desktop suite passes.

R/C/E snapshot file bytes, file modes, directory entries, and symlink destinations across the whole sandbox before and after diagnosis. They include shared authority, sources, project paths, and foreign contents. Access times are deliberately excluded. Script fixtures remain unexecuted. Error injection covers EACCES and files disappearing during reads; normal filesystem fixtures cover missing paths, broken/cyclic links, and foreign occupancy.

### Task #6

| Criterion | Implementation and evidence |
| --- | --- |
| 1. Shared desktop/CLI project entry and asynchronous attribution | `--project`, bridge payload, captured desktop request path, report scope/path; B and D pass. |
| 2. Omitted/global compatibility and maintenance | Original runtime global method retained; existing global cleanup tests and B pass. |
| 3. Last successful application per group, no global/draft fallback | Reads only persisted `projectSourceDrafts` for the matching registered path; R verifies different global/project selections. |
| 4. Never-applied groups, absent versus empty baseline, unregistered paths | R verifies all four cases and absence of new shared-state files. |
| 5. All known roots, custom paths, hidden/disabled Agents, deduplication | R/E verify known project roots, shared Agent associations, custom roots, and no arbitrary/global scan. |
| 6. Deployment names, missing targets, retained anomalous entries | R covers missing targets plus multiple groups retaining different naming variants; direct `lstat` retains broken entries. |
| 7. Absent unused roots, unreadable roots/targets, unavailable projects | R covers each case, including broken parent links and failed absence verification; saved state remains unchanged. |
| 8. Status aggregation and completed diagnostic extensions | Final integration removes the temporary `PROJECT_CHECKS_INCOMPLETE` finding. R/C/E prove HEALTHY controls and BLOCKED over PARTIAL while preserving warnings/counts. |
| 9. Read-only success/failure boundary | Runtime branches before audited mutation; `StateStore.readStateReadonly()` bypasses initialization/migration/filesystem locks. R/C/E snapshots cover successful and failed checks. |
| 10. Public runtime integration matrix | R plus existing project-scoped draft tests; no private diagnostic helper is the primary test seam. |
| 11. State/link evidence and interface compatibility | R/C/E snapshots plus B and the full desktop gate pass. |

### Task #7

| Criterion | Implementation and evidence |
| --- | --- |
| 1. Applied baseline/current source/naming | Shared expected-entry map and existing naming candidates; R multi-group naming regression. |
| 2. Normal relative links, broken and wrong destinations | R healthy/relative/broken/cyclic/misdirected matrix; realpath identity comparison. |
| 3. Files/foreign valid directories occupying expected links | R verifies BLOCKED path conflicts without ownership adoption or modification. |
| 4. Missing/invalid managed Skill, unknown readability | R missing/invalid SKILL.md and EACCES cases; existing parser extracted unchanged. |
| 5. Full context and shared-root deduplication | R/B paths, Skill/Agent context and associations; expected entries excluded from external pass; D passes. |
| 6. Healthy controls and error precedence | R/C/E controls; no unfinished-check placeholders remain. |
| 7. Public apply-then-corrupt scenarios | R creates deployments through `applyDraft`, then changes disk; healthy controls retained. |
| 8. Read-only evidence and thin interfaces | R snapshots include foreign files/links and executable script fixtures; B and D pass. |

### Task #8

| Criterion | Implementation and evidence |
| --- | --- |
| 1. Current source/copy comparison using existing semantics | `hashDirectory(..., { symlinkPolicy: "preserve-safe" })`, no historical snapshot added; C. |
| 2. Either side changes, neutral warning | C tests source and copy edits; message states only current content differs. |
| 3. PARTIAL difference, BLOCKED precedence, equal copies pass | C verifies isolated differences, mixed missing deployment, and equal edits on both sides. |
| 4. Read failures incomplete; missing paths blocking | C source/copy EACCES, nested disappearing file, missing source and deployment. |
| 5. Path/Skill/Agent and capability-specific advice | C custom configurable target gets symlink advice; builtin OpenClaw does not; B preserves metadata; D passes. |
| 6. Accurate advisory-only guidance | Advice describes applying an explicit strategy change and subsequent linked local source changes, without claiming remote freshness; C/B. |
| 7. Public runtime matrix | C's 12 tests use real applied project copies. Invalid current source is also blocking. |
| 8. Unchanged source/copy/state and thin presentation tests | C snapshots plus B and D pass. |

### Task #9

| Criterion | Implementation and evidence |
| --- | --- |
| 1. Full known-root candidate scan independent of display settings | E hidden/disabled Claude root and shared `.agents/skills` cases; arbitrary/global directories excluded. |
| 2. Valid external Skills informational only | E counts valid directories and links with HEALTHY when a baseline exists; no adoption writes. |
| 3. Links, readability, SKILL.md, existing validity rules | E missing/invalid/broken/cyclic matrix; shared read-only parser; scripts not executed. |
| 4. Unknown readability is incomplete and scanning continues | E readFile/stat EACCES; R root EACCES; valid findings retained. |
| 5. Physical roots/Agent associations, managed exclusions | R/E deduplicate shared roots; same-named external Skill under another root remains external; expected paths are excluded. |
| 6. No baseline preserves disk findings and status precedence | E unregistered path yields PARTIAL with valid count; confirmed invalidity/mixed missing deployment yields BLOCKED. |
| 7. Counts, locations, complete findings, true HEALTHY | R/C/E status and count assertions; B report contract; D passes. |
| 8. Public runtime integration matrix | E's 10 cases plus R missing/coverage cases. |
| 9. Read-only content/state/link proof, interfaces/global compatibility | E snapshots plus B, the full npm suite, and D/full desktop gate pass. |

## Commands and results

Executed from the repository root unless specified otherwise:

| Command | Result |
| --- | --- |
| `npm run build` | PASS; all workspace builds and CLI package build. |
| `npm test` | PASS, 71 test files / 773 tests (2 domain + 13 shared-types + 64 integration + 72 storage + 163 core-engine + 232 query + 10 TUI + 217 CLI). |
| `npm run -w @skill-flow/query test -- src/tests/project-doctor.test.ts src/tests/project-doctor-copy.test.ts src/tests/project-doctor-external.test.ts` | R/C/E pass; final suites contain 49 tests (27 + 12 + 10). |
| `npm run -w @skill-flow/storage test -- src/tests/state-store.test.ts` | PASS, 25 tests. |
| `npm run -w @skill-flow/core-engine test -- src/tests/inventory-service-precedence.test.ts src/tests/skill-frontmatter.test.ts` | PASS, 11 tests; full core-engine suite also passes. |
| CLI/bridge focused tests | PASS, 66 tests; formatter 2 tests also pass. |
| `swift build` in `apps/desktop-mac` | PASS with the current Swift 6.4 toolchain. |
| `swift test` in `apps/desktop-mac` on the synthetic merge result (`origin/main` + PR fixes) | PASS, 646 tests / 0 failures. |
| Built CLI smoke: `node apps/cli/dist/cli.js doctor --project <temporary-path>` | PASS; unregistered project reports PARTIAL / complete coverage / external count 1, unavailable project reports BLOCKED; sandbox unchanged and no shared state initialized. |
| `scripts/release/package-desktop-mac-dev.sh <output-path>` | PASS; arm64 app and DMG built, signed, and launched. |
| Packaged-app UI smoke | PASS; packaged app launches with the Doctor toolbar control/report sheet absent. |
| `scripts/release/validate-mac-artifacts.sh <app-path> arm64` | PASS after explicitly clearing inherited `com.apple.quarantine` attributes from bundled `npm`/`npx` symlinks; the release script's symlink-attribute cleanup remains a separate packaging concern. |
| `git diff --check` | PASS. |

Full build/test logs are local at `/tmp/project-doctor-pr-build.log`, `/tmp/project-doctor-pr-test.log`, `/tmp/project-doctor-pr-fixed-npm-test.log`, `/tmp/project-doctor-pr-merged-fixed-swift-test.log`, and `/tmp/skill-flow-cli-smoke.log`.

### Desktop and packaging note

The current Swift 6.4 command-line toolchain builds the application successfully. The PR branch predates current `main`, so the authoritative desktop acceptance run used a synthetic merge worktree; all 646 tests pass there. The packaged arm64 application launches and the real Doctor sheet presents the selected project report correctly.

Artifact validation exposed an inherited packaging issue outside this PR's diff: recursive attribute cleanup did not remove `com.apple.quarantine` from the bundled `npm` and `npx` symlink objects. Clearing those two symlink attributes made the existing signature and artifact validator pass. This should be handled separately in the release packaging workflow rather than mixed into Project Doctor.

## Local commits

PR branch: `feat/project-doctor-reviewed`, based on fork main `8023bb7`. Review fixed point was explicitly confirmed as `8d6a42d`. The original branch `feat/read-only-project-doctor` remains local; only Project Doctor commits were copied to the PR branch, excluding the inherited Agent-Specific Skill File tabs change.

| Commit | Logical unit |
| --- | --- |
| `d6513d4` | #6 runtime baseline/coverage/read-only entry, domain vocabulary and ADR 0004. |
| `39ee9b6` | #6 CLI/bridge and desktop entry/report presentation. |
| `44cbade` | #7 link integrity, managed validity and conflict tests. |
| `8b3b3fa` | #9 external diagnostics and public runtime tests. |
| `22a0367` | #8 copy diagnostics and public runtime tests. |
| `ff1095b` | Final interface contracts and per-project request coalescing. |
| `243b7a2` | Integrated #6–#9 checks, completed coverage, naming and root-failure regressions. |
| `e444d88` | Deduplicate repeated read-failure findings for one expected path. |
| `4bdc561` | Initial acceptance evidence and outstanding desktop gate. |
| `1c249ef` | Fix review finding: ambiguous naming alternatives cannot hide copy differences or yield HEALTHY. |
| `2e344d8` | Route unavailable desktop project selections through the shared Doctor check and fix the async desktop bridge test fixture. |
| `8687935` | Remove the inventory parser's trailing blank line so repository whitespace validation passes. |

The initial user changes to CONTEXT.md and ADR 0004 were preserved and committed with the related runtime work. No unrelated existing feature changes were included.


## Code review — 2026-09-14

### Standards

No hard violations were found against repository instructions, domain vocabulary, or ADR 0004. Review noted judgment-level follow-ups rather than merge blockers: the long `resolveExpectedProjectPath` parameter list, unconstrained Doctor status/scope strings in Swift UI models, duplicated `doctorReport`/`doctorIssues` state, and hard-coded English presentation strings.

### Spec

1. **P1, fixed in `1c249ef`:** an edited deployed copy could be bypassed when another naming candidate matched the source hash. The report then incorrectly returned HEALTHY and classified the edited path as valid external content, violating #8's requirement to warn whenever current source and project copy differ. Multiple occupied candidates now lower coverage certainty, retain copy-difference evidence with uncertain-ownership wording, and never silently produce HEALTHY. Public runtime regressions cover copy/link alternatives and reversed saved group order.
2. **P1, fixed in `2e344d8`:** the desktop returned early when a saved project had no usable path, bypassing the shared Doctor runtime and preventing the required `PROJECT_PATH_UNAVAILABLE` BLOCKED report. The desktop now sends an explicit empty project path to the shared check; the public bridge fixture and desktop regression assert the same report as CLI/runtime.
3. **Test-fixture blocker, fixed in `2e344d8`:** the desktop bridge helper used `await` inside a non-async JavaScript function, so project-scoped Doctor requests failed before logging. The helper is async and the full merged desktop suite passes.

Review totals: Standards 0 hard findings; Spec 3 findings, all fixed. Automated gates and the packaged-app presentation smoke pass; no actionable scope creep was found.

# Mount Lifecycle Edge-Case Matrix

## Scope

This document defines the expected behavior for skill mount and unmount flows across:

- explicit projection ownership recorded in `lock.projections`
- bootstrap observation hints recorded in `lock.sources[].importedFromTargets`
- migration from legacy `lock.deployments`
- shared target roots
- external user-owned content already present at target paths

The current implementation and its covered tests center on:

- [packages/query/src/runtime.ts](../../packages/query/src/runtime.ts)
- [packages/core-engine/src/services/deployment-planner.ts](../../packages/core-engine/src/services/deployment-planner.ts)
- [packages/core-engine/src/services/deployment-applier.ts](../../packages/core-engine/src/services/deployment-applier.ts)
- [packages/core-engine/src/services/workspace-bootstrap-service.ts](../../packages/core-engine/src/services/workspace-bootstrap-service.ts)
- [apps/cli/src/tests/skill-flow.test.ts](../../apps/cli/src/tests/skill-flow.test.ts)

## Rules

1. Only remove paths inside the managed target root for that target.
2. Never remove the target root directory itself.
3. If the target path contains foreign content, do not delete it unless the planner has explicitly relocated or replaced it as safe content.
4. If a source was imported from an existing agent target via bootstrap detection, turning that target off must still remove the observed target path even when no managed projection exists.
5. If multiple logical targets point to the same physical root, turning one off must not remove a path still needed by another enabled target.
6. Uninstall must remove all mounts owned by the source, whether they came from explicit deployment or bootstrap-detected import.
7. If a mount operation reuses or moves an existing path, rollback paths such as `previousTargetPath` and `relocateExternalToTargetPath` must stay inside the same managed root guarantees.
8. Repair flows must recreate missing mounts only when the target is still logically enabled, never after a target has been turned off or a source has been uninstalled.
9. Explicit target mode changes must not strand old mounts just because the current detection root set changed.
10. A broken symlink at a managed target path should be treated as missing managed state, not as protected foreign content.
11. Bootstrap ownership may be claimed only from explicit observation or an already confirmed projection path, never from name guessing alone.
12. Bootstrap observation must not fabricate multiple leaf owners from one source-level hint.

## Covered Scenario Matrix

| ID | Scenario | Operation | Expected result | Automated status |
|---|---|---|---|---|
| M01 | Managed copy deployment drifts on disk | `uninstall` | Mounted path removed | Covered |
| M02 | Managed deployment path moved outside target root | `uninstall` | Refuse delete, keep source registered, return incomplete error | Covered |
| M03 | Managed deployment path equals target root | `uninstall` | Refuse delete target root | Covered |
| M04 | Managed deployment target root changes after mount | `applyDraft(enabledTargets: [])` | Remove old mounted path using recorded root | Covered |
| M05 | Managed deployment target root changes after mount | `uninstall` | Remove old mounted path using recorded root | Covered |
| M06 | Target path already has identical external directory | `applyDraft` | Replace with managed projection | Covered |
| M07 | Target path already has identical external symlink | `applyDraft` | Replace with managed projection | Covered |
| M08 | Target path already has foreign non-identical content | `preview/applyDraft` | Keep foreign content, rename managed target if safe fallback exists | Covered |
| M09 | Source inventory deletes a previously projected skill | `updateSources` | Remove stale projection | Covered |
| B01 | Bootstrap-detected source in codex root, no deployment record | `uninstall` | Remove mounted target path | Covered |
| B02 | Bootstrap-detected source in codex root, no deployment record | `applyDraft(enabledTargets: [])` | Remove mounted target path | Covered |
| B03 | Bootstrap-detected source, target path already missing because user deleted it manually | `applyDraft(enabledTargets: [])` or `uninstall` | Succeed without error, just clean state | Covered |
| B04 | Bootstrap-detected source, checkout path missing | config bootstrap / prune | Remove source state without trying to delete foreign content outside managed root | Covered |
| S01 | Two enabled targets resolve to the same physical root | enable second target | Reuse the same mounted path, do not rename into a duplicate sibling path | Covered |
| S02 | Two enabled targets resolve to the same physical root | disable first target only | Keep path because second target still owns it | Covered |
| S03 | Two enabled targets resolve to the same physical root | disable second target after first already disabled | Remove path when final owner disappears | Covered |
| S04 | Two app instances mutate overlapping target state concurrently | concurrent `applyDraft` | Serialize writes, final state matches last draft | Covered |
| D02 | User manually deletes mounted path and then turns target off | `applyDraft(enabledTargets: [])` | No error, state cleanup only | Covered |
| D03 | User manually deletes mounted path and then uninstalls source | `uninstall` | No error, source removed cleanly | Covered |
| C01 | Duplicate skill already selected from another source on same target | `applyDraft` | Skip duplicate leaf selection | Covered |
| C02 | Duplicate skill name from multiple sources on same target | `applyDraft` | Use projected names to disambiguate | Covered |

## End-State Invariants

- `lock.projections` is the primary managed ownership ledger; `importedFromTargets` supplements it with explicit bootstrap observation evidence.
- Bootstrap ownership is derived only from explicit observation or an already confirmed projection path.
- Shared managed and bootstrap-imported paths use the same last-owner deletion rule.
- `repairTargets` recreates only `managed` projections and never recreates missing `bootstrap-imported` paths.
- Projection ownership remains leaf-level. If bootstrap observation cannot identify leaves safely, the system must restrict that source shape rather than infer owners.

## Verification Strategy

For each scenario:

1. Build a sandbox with explicit target roots.
2. Set up source, lock, and target disk state to match the case.
3. Run the mutation under test.
4. Assert:
   - target path exists or does not exist as expected
   - manifest and lock state are updated correctly
   - no unrelated target path is removed
   - incomplete cleanup returns warnings or errors only when foreign content is actually protected

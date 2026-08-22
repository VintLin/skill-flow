# Local Scan Import Source Path Policy Design

## Context

Local scan import can discover skills in two places:

- agent target roots, such as the configured Codex, Claude, Cursor, and other target directories
- manual local directories outside those agent roots

The current import runtime can identify local scan source paths as `target-agent` or `manual` using the existing target scan root rules. A recent local import change replaces every imported local skill directory with a symlink to the managed SkillFlow checkout. That is correct for agent target roots, but it is too broad for manual local directories.

## Goal

After a local scan import:

- If the imported skill came from an agent target root, SkillFlow removes the original skill directory and replaces it with a symlink to the managed checkout.
- If the imported skill came from any other local directory, SkillFlow imports a managed copy and leaves the original directory unchanged.

The rule should use the same agent-root definition already used by local scan: `getTargetScanRoots()` across all configured targets.

## Non-Goals

- Do not change the bridge protocol.
- Do not add UI state or a new import draft field.
- Do not change GitHub, ClawHub, or non-local import behavior.
- Do not add a compatibility layer for old local import behavior.

## Current Flow

`importSource(locator, draft)` resolves local skill directories with `resolveLocalImportSkillPath()`. If import succeeds, the runtime currently calls `replaceLocalImportWithManagedSymlink(localSkillPath, sourceId)` for any resolved local skill path.

Local scan already has the needed source classification:

- `detectLocalImportObservedTargets(skillPath)` checks whether a path is inside any configured target scan root.
- `localScanSourceKind()` maps paths with observed targets to `target-agent`; everything else is `manual`.

## Proposed Design

Keep the existing import flow and narrow only the symlink replacement condition.

`replaceLocalImportWithManagedSymlink()` should:

1. Return immediately when `localSkillPath` is missing.
2. Call `detectLocalImportObservedTargets(localSkillPath)`.
3. Return immediately when no observed target is found.
4. Read the managed source checkout path from `lockFile.sources[sourceId].localPath`.
5. Replace the original agent-root skill directory with a symlink to the managed checkout.

This keeps the rule local to the cleanup step and reuses the same target-root logic used by local scan display.

## Testing

Add focused CLI integration coverage:

- Agent-root local skill: create a skill under `SKILL_FLOW_TARGET_CODEX`, import it, assert the original path is a symlink pointing at the managed checkout.
- Manual local skill: create a skill under the test sandbox outside all target roots, import it, assert the original path is still a normal directory.

Run:

- `npm run -w @skill-flow/query build`
- `npm run -w skill-flow test -- src/tests/config-integration.test.ts`

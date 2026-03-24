# Skill Flow v1.0.8 Release Notes

Date: 2026-03-25
Version: `v1.0.8`

## Summary

`v1.0.8` is a reliability release for source import and managed cleanup.

This release removes low-signal duplicate warnings from `skill-flow add`, prevents failed imports from deleting existing checkouts, and hardens uninstall / prune / redeploy flows so cleanup stays inside recorded managed roots even after target paths change.

## Highlights

### 1. `add` no longer shows duplicate mirror warnings

Generated mirror directories such as `.agents/skills/*` can legitimately contain the same content as canonical `source/skills/*` entries.

`skill-flow add` still de-duplicates those entries, but it no longer surfaces the repetitive warning spam when the generated mirror copy is skipped.

### 2. Failed imports no longer risk existing source checkouts

Source fetch now lands in a temporary checkout first and only moves into the managed source directory after the snapshot is validated.

This prevents failed `add` attempts from removing an already existing managed checkout path.

### 3. Managed cleanup is now root-safe

Uninstall, config bootstrap pruning, and deployment application now enforce two cleanup rules:

- never delete the managed root directory itself
- never delete paths outside the managed source or target root

This closes the main accidental-deletion paths when lock state or deployment paths are stale or corrupted.

### 4. Cleanup still works after target roots move

Deployment records now preserve the managed target root that was active when the deployment was created.

That means normal cleanup can still remove an existing deployment even if the user later changes `SKILL_FLOW_TARGET_*` to a different location.

## User-visible Behavior Changes

### Add flow

- duplicate generated-skill warnings are hidden from add output
- existing managed source checkouts are protected from failed import cleanup

### Cleanup flows

- uninstall refuses to remove unmanaged paths
- config bootstrap prune skips unmanaged deployment paths instead of deleting them
- deployments created under an older target root can still be cleaned up later

## Verification

Commands run:

```bash
npm run build
npm test
```

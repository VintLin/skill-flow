# Error Code Naming Decision

Date: 2026-06-07

## Decision

Normal runtime collection errors use `COLLECTION_*` codes. `VIRTUAL_GROUP_*` is not a current-runtime public code prefix.

Renamed codes:

- `VIRTUAL_GROUP_NAME_EMPTY` -> `COLLECTION_NAME_EMPTY`
- `VIRTUAL_GROUP_SKILLS_EMPTY` -> `COLLECTION_SKILLS_EMPTY`
- `VIRTUAL_GROUP_SKILL_NAME_CONFLICT` -> `COLLECTION_SKILL_NAME_CONFLICT`

## Breaking Impact

CLI bridge and desktop currently pass diagnostic codes through as strings; no switch-based UI routing on these specific old codes was found in normal runtime.

This is still a public protocol string change. Release notes should mention it if this branch is released independently.

## Allowed Legacy Uses

Migration-only diagnostics may still use `virtual` wording when the source data being diagnosed is an old virtual-group file or old virtual source.

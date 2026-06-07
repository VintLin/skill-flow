# skillFilePath Cleanup Decision

## Blocking Current Uses

- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift:4295`: desktop detail warmup builds document placeholder tabs from persisted `leaf.skillFilePath`.
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift:4320`: desktop detail warmup reads document content from `leaf.skillFilePath`, with description only as fallback.
- `packages/query/src/runtime.ts:1782`: runtime document metadata reader accepts an explicit `skillFilePath` and reads that path directly.
- `packages/query/src/workflow-service.ts:226`: workflow summaries expose `skillFilePath` to consumers as part of `LeafSummaryRecord`.

## Deferred Action

- Defer removing `LeafRecord.skillFilePath` until desktop bridge/detail document loading and query summaries are migrated to a shared derived helper based on `leaf.absolutePath`.

## Required Helper Contract

Create one shared helper before removing `LeafRecord.skillFilePath`.

Suggested location:

- `packages/query/src/leaf-document-path.ts` if only query and bridge need it.
- `packages/core-engine/src/services/leaf-document-path.ts` only if core services need to derive document paths before query.

Contract:

```ts
type LeafDocumentPathInput = {
  absolutePath: string;
};

function resolveLeafSkillFilePath(leaf: LeafDocumentPathInput): string;
```

Rules:

- Derive the path as `path.join(leaf.absolutePath, "SKILL.md")`.
- Do not read `leaf.skillFilePath` as fallback.
- Do not persist the derived path back into `LockFile.leafInventory`.
- Keep bridge/view DTO fields if the desktop protocol still needs `skillFilePath`; those fields must be derived at the DTO boundary.

## Migration Checkpoints

Remove `LeafRecord.skillFilePath` only after these checkpoints are complete:

- Query document metadata loading derives the file path from `leaf.absolutePath`.
- `WorkflowService` and other summary builders derive DTO `skillFilePath` at the output boundary or rename the DTO field if the consumer no longer needs it.
- Desktop bridge responses continue to include document path/content data without reading persisted `leaf.skillFilePath`.
- `StateStore.normalizeLockFile()` discards legacy persisted `skillFilePath` from `leafInventory`.
- Migration code may read old `skillFilePath` only as V1/V2 legacy input if needed to compute `absolutePath`; normal runtime must not use it.

## Validation

Focused validation for the eventual removal:

```bash
npm run -w @skill-flow/domain build
npm run -w @skill-flow/storage test -- state-store.test.ts
npm run -w @skill-flow/query test -- workflow-service.test.ts runtime-v2.test.ts
npm run -w skill-flow test -- skill-flow.test.ts bridge.test.ts
```

Static validation:

```bash
rg -n "skillFilePath" packages apps
```

Expected result:

- `packages/domain/src/types.ts` no longer exposes `LeafRecord.skillFilePath`.
- `skillFilePath` appears only in derived DTO/output code, tests, desktop protocol models, or migration tests.
- No normal runtime path uses `leaf.skillFilePath ?? ...` or equivalent compatibility fallback.

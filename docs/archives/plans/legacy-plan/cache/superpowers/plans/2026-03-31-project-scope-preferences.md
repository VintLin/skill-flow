# Project Scope Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make SharedPreferences aware of project scope, recent projects, and drafts while keeping normalization centered in the storage layer.
**Architecture:** Keep the domain types in `packages/domain` and let the storage module normalize preferences using those types, ensuring `normalizeSharedPreferences` filters stale projects before returning a complete view; normalization should deduplicate `pinnedSourceIds` and guard the scoped state.
**Tech Stack:** TypeScript (pnpm, vitest) with existing storage helpers under `packages/storage`.

I'm using the writing-plans skill to create the implementation plan.

---

### Task 1: Extend preferences-store tests

**Files:**
- Modify: `packages/storage/src/tests/preferences-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test('normalizes selected project scope and drops invalid recent projects', () => {
  const prefs: SharedPreferences = {
    schemaVersion: 1,
    pinnedSourceIds: ['alpha'],
    selectedProjectScope: { kind: 'project', projectId: 'repo-a' },
    recentProjects: [
      { projectId: 'repo-a', title: 'Repo A', lastActivityAt: '2026-03-30T00:00:00.000Z', tools: ['codex'] },
      { projectId: '', title: 'Trash', lastActivityAt: '2021-01-01T00:00:00.000Z' },
    ],
    projectDrafts: {
      'repo-a': {
        alpha: { sourceId: 'alpha', enabledTargets: ['codex'] },
      },
    },
  };

  const normalized = normalizeSharedPreferences(prefs);

  expect(normalized.selectedProjectScope).toEqual({ kind: 'project', projectId: 'repo-a' });
  expect(normalized.recentProjects.map((p) => p.projectId)).toEqual(['repo-a']);
  expect(normalized.projectDrafts['repo-a']?.alpha.enabledTargets).toEqual(['codex']);
}

test('falls back to global scope when the selected project is missing', () => {
  const prefs: SharedPreferences = {
    schemaVersion: 1,
    pinnedSourceIds: [],
    selectedProjectScope: { kind: 'project', projectId: 'missing-repo' },
    recentProjects: [],
    projectDrafts: {},
  };

  const normalized = normalizeSharedPreferences(prefs);

  expect(normalized.selectedProjectScope).toEqual({ kind: 'global' });
}
```

- [ ] **Step 2: Run the new test suite and observe failure**

```
pnpm vitest packages/storage/src/tests/preferences-store.test.ts
```
Expected: FAIL because `normalizeSharedPreferences` and `SharedPreferences` still know only `schemaVersion` and `pinnedSourceIds`, so the new fields do not exist yet.

### Task 2: Add the new domain types

**Files:**
- Modify: `packages/domain/src/types.ts`

- [ ] **Step 1: Declare ProjectScope, RecentProject, and ScopedSourceDrafts plus SharedPreferences extensions**

```ts
export type ProjectScope =
  | { kind: 'global' }
  | { kind: 'project'; projectId: string };

export type RecentProject = {
  projectId: string;
  title: string;
  lastActivityAt: string;
  tools?: string[];
};

export type ScopedSourceDrafts = Record<string, Record<string, DraftBinding>>;

export interface SharedPreferences {
  schemaVersion: number;
  pinnedSourceIds: string[];
  selectedProjectScope: ProjectScope;
  recentProjects: RecentProject[];
  projectDrafts: ScopedSourceDrafts;
}
```

- [ ] **Step 2: Re-run the vitest command to confirm it still fails for normalization**

```
pnpm vitest packages/storage/src/tests/preferences-store.test.ts
```
Expected: FAIL for the same reasons because normalization logic has yet to be implemented.

### Task 3: Normalize the new properties inside preferences-store

**Files:**
- Modify: `packages/storage/src/preferences-store.ts`

- [ ] **Step 1: Update `createEmptySharedPreferences` and `normalizeSharedPreferences`**

```ts
export function createEmptySharedPreferences(): SharedPreferences {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    pinnedSourceIds: [],
    selectedProjectScope: { kind: 'global' },
    recentProjects: [],
    projectDrafts: {},
  };
}

export function normalizeSharedPreferences(input: Partial<SharedPreferences>): SharedPreferences {
  const schemaVersion =
    input.schemaVersion === CURRENT_SCHEMA_VERSION ? CURRENT_SCHEMA_VERSION : CURRENT_SCHEMA_VERSION;
  const pinnedSourceIds = Array.from(new Set(input.pinnedSourceIds ?? [])).filter(Boolean);

  const recentProjects = (input.recentProjects ?? []).filter((project) => project.projectId);
  const selectedProjectScope = (() => {
    if (
      input.selectedProjectScope?.kind === 'project' &&
      recentProjects.some((project) => project.projectId === input.selectedProjectScope.projectId)
    ) {
      return input.selectedProjectScope;
    }
    return { kind: 'global' } as ProjectScope;
  })();

  const projectDrafts: ScopedSourceDrafts = {};
  for (const [projectId, drafts] of Object.entries(input.projectDrafts ?? {})) {
    if (!projectId) continue;
    projectDrafts[projectId] = {};
    for (const [sourceId, draft] of Object.entries(drafts ?? {})) {
      if (sourceId) {
        projectDrafts[projectId][sourceId] = draft;
      }
    }
  }

  return {
    schemaVersion,
    pinnedSourceIds,
    selectedProjectScope,
    recentProjects,
    projectDrafts,
  };
}
```

- [ ] **Step 2: Run vitest again and expect it to pass**

```
pnpm vitest packages/storage/src/tests/preferences-store.test.ts
```
Expected: PASS because the normalization pathway now understands the new fields and enforces project scope limits.

### Task 4: Commit the change

**Files:**
- Mention: `packages/domain/src/types.ts`, `packages/storage/src/preferences-store.ts`, `packages/storage/src/tests/preferences-store.test.ts`, `docs/superpowers/plans/2026-03-31-project-scope-preferences.md`

- [ ] **Step 1: Commit the implementation**

```
git add packages/domain/src/types.ts packages/storage/src/preferences-store.ts packages/storage/src/tests/preferences-store.test.ts docs/superpowers/plans/2026-03-31-project-scope-preferences.md
git commit -m "feat: add project scope preferences state"
```

Plan complete and saved to `docs/superpowers/plans/2026-03-31-project-scope-preferences.md`. Execution options: 1) Subagent-Driven Development (requires superpowers:subagent-driven-development) 2) Inline Execution (requires superpowers:executing-plans). I will proceed with Inline Execution using executing-plans so I can continue in this session.

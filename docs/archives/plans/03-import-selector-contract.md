# Import Selector Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 import preview、prepare、commit 从 legacy 字符串 id 切到结构化 selector，解决 archive fallback、provider id、repo path 混用问题。

**Architecture:** preview 生成 `uiId + selector + origin`；prepare cache 记录 `PreparedSkillRef[]`；commit 在 preparation record 删除前把 selector 绑定到 leaf id。legacy draft 只在 bridge/query 边界转换。

**Tech Stack:** TypeScript、Vitest、bridge JSON payload。

---

## 文件范围

创建：

- `packages/query/src/import-selector.ts`
- `packages/query/src/tests/import-selector.test.ts`

修改：

- `packages/domain/src/types.ts`
- `packages/storage/src/import-preparation-cache.ts`
- `packages/core-engine/src/services/import-preparation-service.ts`
- `packages/query/src/runtime.ts`
- `packages/query/src/tests/import-page-flow.test.ts`
- `apps/cli/src/bridge-command.ts`
- `apps/cli/src/tests/bridge-command.test.ts`

## Contract

V2 selector 第一阶段只支持：

```ts
export type ImportSkillSelector =
  | { kind: "repoPath"; path: string }
  | { kind: "skillName"; name: string };
```

V2 draft：

```ts
export type ImportDraftV2 = {
  selectedSkills: {
    uiId: string;
    selector: ImportSkillSelector;
  }[];
  enabledTargets: DeploymentTargetId[];
};
```

## Tasks

### Task 1: Add selector utilities

**Files:**

- Create: `packages/query/src/import-selector.ts`
- Test: `packages/query/src/tests/import-selector.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test("normalizes archive fallback path into repoPath selector", () => {
  expect(
    buildRepoPathSelectorFromPreviewPath({
      previewPath: "skills-main/skills/frontend-design",
      archiveRoot: "skills-main",
    }),
  ).toEqual({ kind: "repoPath", path: "skills/frontend-design" });
});

test("allows repo root selector", () => {
  expect(validateImportSkillSelector({ kind: "repoPath", path: "." })).toEqual({
    kind: "repoPath",
    path: ".",
  });
});

test("rejects parent directory repoPath selector", () => {
  expect(() => validateImportSkillSelector({ kind: "repoPath", path: "../x" })).toThrow(
    "IMPORT_SELECTOR_INVALID",
  );
});

test("rejects unsafe repoPath segments", () => {
  for (const path of ["skills/../x", "./skills/x", "skills//x", "/skills/x", "skills-main/skills/x"]) {
    expect(() => validateImportSkillSelector({ kind: "repoPath", path })).toThrow(
      "IMPORT_SELECTOR_INVALID",
    );
  }
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/query test -- import-selector.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 3: Implement utilities**

Create functions:

```ts
export function validateImportSkillSelector(selector: ImportSkillSelector): ImportSkillSelector
export function buildRepoPathSelectorFromPreviewPath(input: {
  previewPath: string;
  archiveRoot?: string;
}): ImportSkillSelector
export function selectorToDiagnosticValue(selector: ImportSkillSelector): string
```

Validation rules:

- `repoPath.path === "."` is valid.
- reject empty path.
- reject absolute path.
- reject `./` prefix and any `.` segment except the whole path `"."`.
- reject any `..` segment, including `skills/../x`.
- reject empty segments, including `skills//x`.
- normalize backslash to `/`, then validate again.
- reject archive root segments such as `skills-main` only during preview construction; commit must not strip or guess archive roots.

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/query test -- import-selector.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/query/src/import-selector.ts packages/query/src/tests/import-selector.test.ts
git commit -m "feat: add import selector utilities"
```

### Task 2: Add preview V2 fields

**Files:**

- Modify: `packages/domain/src/types.ts`
- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/import-page-flow.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:

```ts
test("preview returns stable uiId and repoPath selector", async () => {
  const result = await app.previewImportSource("github:anthropics/skills");
  expect(result.data.status).toBe("ready");
  expect(result.data.skills[0]).toMatchObject({
    id: expect.any(String),
    uiId: expect.stringMatching(/^skill_[a-z2-7]{20}$/),
    selector: { kind: "repoPath" },
  });
  expect(result.data.skills[0].id).not.toBe(result.data.skills[0].uiId);
  expect(result.data.skills[0].legacyAliases ?? []).not.toContain(result.data.skills[0].id);
});

test("archive fallback keeps archive path only in origin", async () => {
  const result = await app.previewImportSource("github:anthropics/skills");
  const skill = result.data.skills.find((candidate) => candidate.title === "frontend-design");
  expect(skill.origin.archivePath).toContain("skills-main/");
  expect(skill.selector).toEqual({ kind: "repoPath", path: "skills/frontend-design" });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts
```

Expected: fail because preview lacks V2 fields.

- [ ] **Step 3: Extend domain types**

Add:

- `ImportOriginProvider`
- `ImportSkillSelector`
- `ImportSkillSelection`
- `ImportDraftV2`
- `ImportDraftCompat`
- `ImportPreviewSkillV2`
- `ImportPreviewResultV2`
- `ImportDiagnostic`

- [ ] **Step 4: Build V2 preview payload**

In runtime preview path:

- derive `sourceSelectionKey`
- build selector for each skill
- build stable `uiId`
- keep `id` as a legacy resolver-compatible value, such as repo path or skill name
- set `legacyAliases` only when extra historical selector strings exist
- keep provider id/path/archive path in `origin`
- keep legacy `selectedSkillIds`
- add `selectedSkills`

- [ ] **Step 5: Run query tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts import-selector.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/types.ts packages/query/src/runtime.ts packages/query/src/tests/import-page-flow.test.ts
git commit -m "feat: return import preview selectors"
```

### Task 3: Add PreparedSkillRef and selector binding

**Files:**

- Modify: `packages/domain/src/types.ts`
- Modify: `packages/storage/src/import-preparation-cache.ts`
- Modify: `packages/core-engine/src/services/import-preparation-service.ts`
- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/import-page-flow.test.ts`
- Test: `packages/storage/src/tests/import-preparation-cache.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test("prepare record stores skillRefs", async () => {
  const prepared = await app.prepareImportSource("github:anthropics/skills");
  const cache = await app.store.readImportPreparationCache();
  const record = cache.records[prepared.data.preparationId];
  expect(record.skillRefs).toContainEqual(
    expect.objectContaining({
      repoPath: "skills/frontend-design",
      leafId: expect.any(String),
    }),
  );
});

test("commit v2 selector matches prepared repoPath before deleting record", async () => {
  const preview = await app.previewImportSource("github:anthropics/skills");
  const prepared = await app.prepareImportSource("github:anthropics/skills");
  const skill = preview.data.skills.find((candidate) => candidate.title === "frontend-design")!;
  const result = await app.commitPreparedImportSource(prepared.data.preparationId, {
    selectedSkills: [{ uiId: skill.uiId, selector: skill.selector }],
    enabledTargets: ["codex"],
  });
  expect(result.data.status).toBe("success");
});

test("commit marks preparation committing with lease before applying", async () => {
  const prepared = await app.prepareImportSource("github:anthropics/skills");
  const skill = (await app.previewImportSource("github:anthropics/skills")).data.skills[0];

  await app.commitPreparedImportSource(prepared.data.preparationId, {
    selectedSkills: [{ uiId: skill.uiId, selector: skill.selector }],
    enabledTargets: ["codex"],
  });

  const events = app.importPreparationEvents();
  expect(events).toContainEqual(
    expect.objectContaining({
      preparationId: prepared.data.preparationId,
      fromStatus: "ready",
      toStatus: "committing",
      attemptId: expect.stringMatching(/^attempt_/),
      leaseExpiresAt: expect.any(String),
    }),
  );
});

test("second commit fails while preparation lease is active", async () => {
  const prepared = await app.prepareImportSource("github:anthropics/skills");
  await app.store.markImportPreparationCommitting(prepared.data.preparationId, {
    attemptId: "attempt_existing",
    commitStartedAt: "2026-06-04T00:00:00.000Z",
    leaseExpiresAt: "2099-01-01T00:00:00.000Z",
  });

  await expect(
    app.commitPreparedImportSource(prepared.data.preparationId, {
      selectedSkills: [
        {
          uiId: "skill_aaaaaaaaaaaaaaaaaaaa",
          selector: { kind: "repoPath", path: "skills/frontend-design" },
        },
      ],
      enabledTargets: ["codex"],
    }),
  ).rejects.toThrow("IMPORT_PREPARATION_ALREADY_COMMITTING");
});

test("committed leaf id must come from prepared skill ref", async () => {
  const prepared = await app.prepareImportSource("github:anthropics/skills");
  const record = await app.store.readImportPreparationRecord(prepared.data.preparationId);
  const preparedRef = record.skillRefs.find((ref) => ref.repoPath === "skills/frontend-design")!;

  const result = await app.commitPreparedImportSource(prepared.data.preparationId, {
    selectedSkills: [
      {
        uiId: "skill_aaaaaaaaaaaaaaaaaaaa",
        selector: { kind: "repoPath", path: "skills/frontend-design" },
      },
    ],
    enabledTargets: ["codex"],
  });

  expect(result.data.boundLeafIds).toEqual([preparedRef.leafId]);
});

test("commit returns stale when prepared leaf id no longer exists", async () => {
  const prepared = await app.prepareImportSource("github:anthropics/skills");
  await app.store.removePreparedSkillRef(prepared.data.preparationId, "skills/frontend-design");

  await expect(
    app.commitPreparedImportSource(prepared.data.preparationId, {
      selectedSkills: [
        {
          uiId: "skill_aaaaaaaaaaaaaaaaaaaa",
          selector: { kind: "repoPath", path: "skills/frontend-design" },
        },
      ],
      enabledTargets: ["codex"],
    }),
  ).rejects.toThrow("IMPORT_PREPARATION_STALE");
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts
npm run -w @skill-flow/storage test -- import-preparation-cache.test.ts
```

Expected: fail because `skillRefs` and V2 commit binding do not exist.

- [ ] **Step 3: Add PreparedSkillRef**

```ts
export type PreparedSkillRef = {
  leafId: string;
  name: string;
  linkName: string;
  repoPath: string;
};
```

`leafId` is provisional while cached in the preparation record. Commit must bind selectors to refs from the same preparation record, and return `IMPORT_PREPARATION_STALE` if that provisional id no longer exists in the prepared checkout inventory.

Preparation record fields:

```ts
export type ImportPreparationRecord = {
  id: string;
  status: "preparing" | "ready" | "committing" | "failed" | "stale";
  attemptId?: string;
  commitStartedAt?: string;
  leaseExpiresAt?: string;
  skillRefs: PreparedSkillRef[];
  failure?: {
    reasonCode: string;
    retryable: boolean;
    message: string;
    diagnostics?: ImportDiagnostic[];
  };
};
```

Normalizer must preserve both `skillRefs` and legacy `skillIds`.

- [ ] **Step 4: Write skillRefs during prepare**

When prepare scans leaf records, write:

```ts
skillRefs: leafRecords.map((leaf) => ({
  leafId: leaf.id,
  name: leaf.name,
  linkName: leaf.linkName,
  repoPath: leaf.relativePath,
}))
```

- [ ] **Step 5: Bind selector before core commit deletes record**

Selector binding must happen before the preparation record is deleted. Use one of these concrete API shapes:

```ts
type BoundImportDraft = {
  selectedLeafIds: string[];
  enabledTargets: DeploymentTargetId[];
  diagnostics: ImportDiagnostic[];
};
```

Preferred service boundary:

```ts
ImportPreparationService.commitPreparedImportSource(preparationId, boundDraft)
```

If query owns binding, core must expose read/mark/delete APIs:

```ts
readImportPreparationRecord(preparationId)
markImportPreparationCommitting(preparationId, {
  expectedStatus: "ready",
  attemptId,
  commitStartedAt,
  leaseExpiresAt
})
commitPreparedImportSourceWithBoundDraft(preparationId, boundDraft)
markImportPreparationFailed(preparationId, failure)
deleteImportPreparationRecord(preparationId, { expectedAttemptId: attemptId })
```

In either implementation:

1. read preparation record
2. resolve selected leaf ids from `draft.selectedSkills`
3. resolve legacy `selectedSkillIds` only at query/bridge boundary using `id/legacyAliases -> selector` or prepared skill refs
4. pass bound leaf ids into commit flow
5. delete preparation record only after commit/apply succeeds
6. keep or mark record `failed` when selector binding or apply fails, so retry and diagnostics remain possible
7. reject active `committing` records with `IMPORT_PREPARATION_ALREADY_COMMITTING`
8. convert expired `committing` records to `stale` before allowing a new preview/prepare
9. return `IMPORT_PREPARATION_STALE` if a selector resolves to a prepared ref whose `leafId` no longer exists in the prepared checkout inventory
10. never derive committed leaf ids from `uiId`, provider id, archive path, title, or summary

- [ ] **Step 6: Run tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts
npm run -w @skill-flow/storage test -- import-preparation-cache.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/types.ts packages/storage/src/import-preparation-cache.ts packages/core-engine/src/services/import-preparation-service.ts packages/query/src/runtime.ts packages/query/src/tests/import-page-flow.test.ts packages/storage/src/tests/import-preparation-cache.test.ts
git commit -m "feat: bind import selectors to prepared skills"
```

### Task 4: Local source choice selector contract

**Files:**

- Modify: `packages/domain/src/types.ts`
- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/import-page-flow.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test("local source choice does not use origin as choice id", async () => {
  const preview = await app.previewLocalImport("/tmp/my-skill");
  expect(preview.data.choices).toContainEqual(
    expect.objectContaining({
      sourceChoiceId: "new-source",
      selector: { kind: "repoPath", path: "." },
    }),
  );
  expect(preview.data.choices.map((choice) => choice.id)).not.toContain("origin");
});

test("legacy local origin choice is converted at compat boundary", async () => {
  const draft = parseLocalImportChoiceCompat({
    selectedChoiceId: "origin",
    selectedSkillIds: ["."],
    enabledTargets: ["codex"],
  });

  expect(draft).toEqual({
    sourceChoiceId: "matched-source",
    selectedSkills: [{ selector: { kind: "repoPath", path: "." } }],
    enabledTargets: ["codex"],
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts
```

Expected: fail because local choices still use legacy `"origin"` choice ids.

- [ ] **Step 3: Update local choice contract**

Parser rules:

- accept `sourceChoiceId`
- reject new V2 payloads that use `selectedChoiceId: "origin"`
- read legacy `selectedChoiceId: "origin"` only in query/bridge compat
- convert legacy local single-skill selection to `{ kind: "repoPath", path: "." }`
- convert local multi-skill selections to `{ kind: "repoPath", path: "<relative skill path>" }`

- [ ] **Step 4: Run tests**

```bash
npm run -w @skill-flow/query test -- import-page-flow.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/types.ts packages/query/src/runtime.ts packages/query/src/tests/import-page-flow.test.ts
git commit -m "feat: add local import source choice selectors"
```

### Task 5: Bridge parser V2 draft compatibility

**Files:**

- Modify: `apps/cli/src/bridge-command.ts`
- Test: `apps/cli/src/tests/bridge-command.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
test("commit-import-source accepts selectedSkills draft", async () => {
  const response = await runBridgeCommand(app, {
    protocolVersion: PROTOCOL_VERSION,
    requestId: "req-1",
    command: "commit-import-source",
    payload: {
      preparationId: "prep-1",
      draft: {
        selectedSkills: [
          {
            uiId: "skill_aaaaaaaaaaaaaaaaaaaa",
            selector: { kind: "repoPath", path: "skills/frontend-design" },
          },
        ],
        enabledTargets: ["codex"],
      },
    },
  });
  expect(response.ok).toBe(true);
});

test("invalid selector object returns bridge request invalid", async () => {
  const response = await runBridgeCommand(app, {
    protocolVersion: PROTOCOL_VERSION,
    requestId: "req-1",
    command: "commit-import-source",
    payload: {
      preparationId: "prep-1",
      draft: {
        selectedSkills: [{ uiId: "x", selector: { kind: "repoPath", path: "../bad" } }],
        enabledTargets: ["codex"],
      },
    },
  });
  expect(response.ok).toBe(false);
  expect(response.error.code).toBe("BRIDGE_REQUEST_INVALID");
});

test("import-source accepts selectedSkills draft", async () => {
  const response = await runBridgeCommand(app, {
    protocolVersion: PROTOCOL_VERSION,
    requestId: "req-1",
    command: "import-source",
    payload: {
      locator: "github:anthropics/skills",
      draft: {
        selectedSkills: [
          {
            uiId: "skill_aaaaaaaaaaaaaaaaaaaa",
            selector: { kind: "repoPath", path: "skills/frontend-design" },
          },
        ],
        enabledTargets: ["codex"],
      },
    },
  });
  expect(response.ok).toBe(true);
});
```

- [ ] **Step 2: Run failing tests**

```bash
npm run -w skill-flow test -- bridge-command.test.ts
```

Expected: fail because bridge parser only accepts `selectedSkillIds`.

- [ ] **Step 3: Update parser**

Parser rules:

- accept `selectedSkills`
- accept legacy `selectedSkillIds`
- if both exist, prefer `selectedSkills`
- reject invalid selector shape as `BRIDGE_REQUEST_INVALID`
- apply the same parser to both `commit-import-source` and `import-source`

- [ ] **Step 4: Run tests**

```bash
npm run -w skill-flow test -- bridge-command.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/cli/src/bridge-command.ts apps/cli/src/tests/bridge-command.test.ts
git commit -m "feat: accept import v2 bridge drafts"
```

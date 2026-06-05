# Stage 0 Terminology Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `06-data-structure-inventory-and-terminology.md` 中仍未完全闭合的术语、结构和 invariant 回写到 V2 子计划，作为进入 Stage 1 实现前的文档门槛。

**Architecture:** 这是文档固化计划，不修改 TypeScript、Swift 或运行时代码。每个任务先把一个未闭合问题写入对应阶段计划，再更新 `06` 覆盖矩阵，并用 `rg` 和 Markdown fence 检查确认没有遗留占位文本。

**Tech Stack:** Markdown、ripgrep、shell verification、Skill Flow plans。

---

## 文件范围

修改：

- `plans/2026-06-04-state-schema-v2/00-data-model.md`
- `plans/2026-06-04-state-schema-v2/03-import-selector-contract.md`
- `plans/2026-06-04-state-schema-v2/05-verification-and-release.md`
- `plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md`
- `plans/2026-06-04-state-schema-v2/07-serial-documentation-workflow.md`
- `plans/2026-06-04-state-schema-v2/README.md`

不修改：

- `packages/*`
- `apps/*`
- `docs/*`

## Tasks

### Task 1: Close local choice origin terminology

**Files:**

- Modify: `plans/2026-06-04-state-schema-v2/00-data-model.md`
- Modify: `plans/2026-06-04-state-schema-v2/03-import-selector-contract.md`
- Modify: `plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md`

- [x] **Step 1: Update data model terminology**

In `00-data-model.md`, under `Import Preview / Draft V2`, add:

```markdown
### Local Source Choice V2

本地导入和本地扫描中，“用户选择哪一个匹配来源”不得再使用 `"origin"` 作为 choice id。V2 使用：

```ts
export type LocalSourceChoiceV2 = {
  sourceChoiceId: "matched-source" | "new-source";
  matchedSourceId?: SourceId;
  selector: ImportSkillSelectorV2;
  diagnostics?: StateDiagnosticV2[];
};
```

规则：

- `sourceChoiceId` 只表示 UI 中选择的是“匹配已有 source”还是“创建新 source”。
- `origin` 只用于 provenance，不用于 local choice id。
- local single-skill source 使用 `{ kind: "repoPath", path: "." }`。
- local multi-skill source 使用 `{ kind: "repoPath", path: "<relative skill path>" }`。
```

- [x] **Step 2: Update import selector contract**

In `03-import-selector-contract.md`, add a test under the local import task:

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
```

Then add parser rules:

```markdown
Parser rules:

- accept `sourceChoiceId`
- reject new V2 payloads that use `selectedChoiceId: "origin"`
- read legacy `selectedChoiceId: "origin"` only in query/bridge compat
- convert legacy local single-skill selection to `{ kind: "repoPath", path: "." }`
```

- [x] **Step 3: Update terminology matrix**

In `06-data-structure-inventory-and-terminology.md`, replace the `origin` row in the coverage matrix with:

```markdown
| 术语不统一 | `origin` 同时表示 member origin、preview provenance、local choice id | 已修正计划 | 本文术语表拆成 member origin、preview origin、matched source choice；`00-data-model.md` 和 `03-import-selector-contract.md` 使用 `sourceChoiceId` 表示本地选择 | Stage 4 实现时 legacy `selectedChoiceId: "origin"` 只能在 compat parser 出现 |
```

- [x] **Step 4: Verify terminology**

Run:

```bash
rg -n "selectedChoiceId: \"origin\"|sourceChoiceId|\\borigin\\b" plans/2026-06-04-state-schema-v2/00-data-model.md plans/2026-06-04-state-schema-v2/03-import-selector-contract.md plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md
```

Expected:

```text
`sourceChoiceId` appears in 00/03/06.
`selectedChoiceId: "origin"` appears only in legacy/compat/problem-description context.
```

- [ ] **Step 5: Commit**

```bash
git add plans/2026-06-04-state-schema-v2/00-data-model.md plans/2026-06-04-state-schema-v2/03-import-selector-contract.md plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md
git commit -m "docs: close local import origin terminology"
```

### Task 2: Close PreparedSkillRef authority semantics

**Files:**

- Modify: `plans/2026-06-04-state-schema-v2/00-data-model.md`
- Modify: `plans/2026-06-04-state-schema-v2/03-import-selector-contract.md`
- Modify: `plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md`

- [x] **Step 1: Update data model invariant**

In `00-data-model.md`, under `PreparedSkillRefV2`, add:

```markdown
Prepared leaf id rule:

- `PreparedSkillRefV2.leafId` is provisional while the preparation record is cached.
- During commit, selector binding must produce `BoundImportDraft.selectedLeafIds` from the same preparation record.
- The committed lock leaf id must equal the prepared `leafId` for unchanged checkout content.
- If checkout content changed and prepared `leafId` no longer exists, commit returns `IMPORT_PREPARATION_STALE` and keeps the record for diagnostics.
- Commit must not invent a new leaf id from `uiId`, provider id, archive path, or title.
```

- [x] **Step 2: Update import selector tests**

In `03-import-selector-contract.md`, add:

```ts
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

- [x] **Step 3: Update terminology matrix**

In `06-data-structure-inventory-and-terminology.md`, replace the `PreparedSkillRef.leafId` row with:

```markdown
| 概念不清 | `PreparedSkillRef.leafId` 在 prepare 阶段是否权威 | 已修正计划 | `00-data-model.md` 明确 prepared leaf id 是缓存期 provisional id；`03-import-selector-contract.md` 验证 committed leaf id 必须来自 prepared skill ref | Stage 4 实现时 checkout 变化返回 `IMPORT_PREPARATION_STALE` |
```

- [x] **Step 4: Verify PreparedSkillRef wording**

Run:

```bash
rg -n "PreparedSkillRef\\.leafId|IMPORT_PREPARATION_STALE|boundLeafIds|provisional" plans/2026-06-04-state-schema-v2/00-data-model.md plans/2026-06-04-state-schema-v2/03-import-selector-contract.md plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md
```

Expected:

```text
All four patterns appear at least once.
The matrix row says `已修正计划`.
```

- [ ] **Step 5: Commit**

```bash
git add plans/2026-06-04-state-schema-v2/00-data-model.md plans/2026-06-04-state-schema-v2/03-import-selector-contract.md plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md
git commit -m "docs: define prepared skill ref authority"
```

### Task 3: Close target projection repair rules

**Files:**

- Modify: `plans/2026-06-04-state-schema-v2/00-data-model.md`
- Modify: `plans/2026-06-04-state-schema-v2/05-verification-and-release.md`
- Modify: `plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md`

- [x] **Step 1: Add desired projection rule to data model**

In `00-data-model.md`, under `ProjectionRecordV2`, add:

```markdown
Repair rule:

- repair never trusts old `ProjectionRecordV2.targetPath` as desired state.
- desired projection is recalculated from `ManifestV2.bindings`, current target definitions, `LockFileV2.leafInventory`, and collection member `snapshot`.
- active projection `targetPath` must be inside the current target root.
- unknown targets produce `status: "blocked"` and do not write files.
- disabled leaf projections become `status: "removed"`.
- collection projection `contentHash` comes from materialized snapshot content, not from `origin`.
```

- [x] **Step 2: Strengthen verification tests**

In `05-verification-and-release.md`, extend Task 6 with:

```ts
test("repair recalculates target path from current target root", async () => {
  const stateRoot = await copyFixture("state-v1-basic");
  const app = new SkillFlowApp({ stateRoot });
  await app.migrateState({ to: 2, dryRun: false });
  await app.setCustomTargetRoot("codex", "/tmp/new-codex-skills");

  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      kind: "relink",
      targetPath: "/tmp/new-codex-skills/frontend-design",
    }),
  );
  expect(repair.data.actions).not.toContainEqual(
    expect.objectContaining({
      targetPath: expect.stringContaining("/tmp/old-codex-skills"),
    }),
  );
});

test("repair blocks unknown target without writing stale target path", async () => {
  const app = await seedMigratedStateWithUnknownTarget();
  const repair = await app.repairTargets();

  expect(repair.data.actions).toContainEqual(
    expect.objectContaining({
      kind: "blocked",
      target: "missing-agent",
      reason: "Target is not available.",
    }),
  );
});
```

- [x] **Step 3: Update terminology matrix**

In `06-data-structure-inventory-and-terminology.md`, replace the target repair row with:

```markdown
| 逻辑不闭环 | target projection repair 只信任旧 projection | 已修正计划 | `00-data-model.md` 明确 desired projection 必须重算；`05-verification-and-release.md` 覆盖 target root 改变和 unknown target blocked | Stage 6 实现时验证 collection projection hash 来自 materialized snapshot |
```

- [x] **Step 4: Verify repair wording**

Run:

```bash
rg -n "desired projection|repair recalculates|unknown target|materialized snapshot" plans/2026-06-04-state-schema-v2/00-data-model.md plans/2026-06-04-state-schema-v2/05-verification-and-release.md plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md
```

Expected:

```text
Each pattern appears in the relevant plan file.
The matrix row says `已修正计划`.
```

- [ ] **Step 5: Commit**

```bash
git add plans/2026-06-04-state-schema-v2/00-data-model.md plans/2026-06-04-state-schema-v2/05-verification-and-release.md plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md
git commit -m "docs: define target projection repair rules"
```

### Task 4: Register Stage 0 closure gate

**Files:**

- Modify: `plans/2026-06-04-state-schema-v2/README.md`
- Modify: `plans/2026-06-04-state-schema-v2/07-serial-documentation-workflow.md`

- [x] **Step 1: Update README plan list**

In `README.md`, add this entry after the `07` workflow entry:

```markdown
闭环. [08-stage-0-terminology-closure.md](08-stage-0-terminology-closure.md)  
   将 `06` 中仍未完全闭合的术语、PreparedSkillRef 权威性和 target repair 规则回写到对应阶段文档。
```

- [x] **Step 2: Update Step 0 instruction**

In `README.md`, replace Step 0 with:

```markdown
- [ ] **Step 0: 固化当前数据盘点、术语表和串行流程**

先阅读并固化 [06-data-structure-inventory-and-terminology.md](06-data-structure-inventory-and-terminology.md)、[07-serial-documentation-workflow.md](07-serial-documentation-workflow.md) 与 [08-stage-0-terminology-closure.md](08-stage-0-terminology-closure.md)。完成后应明确当前应用数据结构、统一术语、已知漏洞、串行门槛和每阶段文档出口条件。`06` 覆盖矩阵不得再出现 `部分覆盖` 或 `已识别，计划需固化`。
```

- [x] **Step 3: Update Stage 0 exit conditions**

In `07-serial-documentation-workflow.md`, append to Stage 0 exit conditions:

```markdown
- `06` 覆盖矩阵中所有行必须是 `已覆盖` 或 `已修正计划`。
- `08-stage-0-terminology-closure.md` 中所有任务必须完成或明确被后续阶段替代。
```

- [x] **Step 4: Verify plan registration**

Run:

```bash
rg -n "08-stage-0-terminology-closure|部分覆盖|已识别，计划需固化" plans/2026-06-04-state-schema-v2/README.md plans/2026-06-04-state-schema-v2/07-serial-documentation-workflow.md plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md
```

Expected:

```text
README and 07 reference 08-stage-0-terminology-closure.md.
After Tasks 1-3, 06 has no `部分覆盖` or `已识别，计划需固化` rows.
```

- [ ] **Step 5: Commit**

```bash
git add plans/2026-06-04-state-schema-v2/README.md plans/2026-06-04-state-schema-v2/07-serial-documentation-workflow.md
git commit -m "docs: register stage zero closure gate"
```

### Task 5: Final self-review and verification

**Files:**

- Verify: `plans/2026-06-04-state-schema-v2/*.md`
- Verify: `plans/2026-06-04-import-data-contract-redesign.md`

- [x] **Step 1: Check unresolved placeholders**

Run:

```bash
rg -n "TO""DO|TB""D|待[定]|未[定]" plans/2026-06-04-state-schema-v2 plans/2026-06-04-import-data-contract-redesign.md
```

Expected:

```text
No matches.
```

- [x] **Step 2: Check Stage 0 matrix closure**

Run:

```bash
rg -n "部分覆盖|已识别，计划需固化" plans/2026-06-04-state-schema-v2/06-data-structure-inventory-and-terminology.md
```

Expected:

```text
No matches.
```

- [x] **Step 3: Check legacy field context**

Run:

```bash
rg -n "sourceKey|DraftBindingV2|selectedChoiceId: \"origin\"|BRIDGE_REQUEST_INVALID" plans/2026-06-04-state-schema-v2 plans/2026-06-04-import-data-contract-redesign.md
```

Expected:

```text
`sourceKey` and `DraftBindingV2` appear only in not-recommended or renamed contexts.
`selectedChoiceId: "origin"` appears only in legacy/compat/problem-description contexts.
`BRIDGE_REQUEST_INVALID` appears only for malformed payload, not as legacy retry trigger.
```

- [x] **Step 4: Check Markdown fences**

Run:

```bash
for f in plans/2026-06-04-state-schema-v2/*.md plans/2026-06-04-import-data-contract-redesign.md; do
  n=$(rg -n '^```' "$f" | wc -l | tr -d ' ')
  r=$((n % 2))
  printf "%s fences=%s parity=%s\n" "$f" "$n" "$r"
done
```

Expected:

```text
Every line ends with `parity=0`.
```

- [ ] **Step 5: Commit final plan verification**

```bash
git status --short
git add plans/2026-06-04-state-schema-v2 plans/2026-06-04-import-data-contract-redesign.md
git commit -m "docs: finalize state schema v2 stage zero"
```

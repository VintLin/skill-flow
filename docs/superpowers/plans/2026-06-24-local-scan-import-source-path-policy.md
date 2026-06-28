# Local Scan Import Source Path Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Local scan import replaces the original skill directory with a managed symlink only when the skill came from an agent target root.

**Architecture:** Keep the existing local import flow. Narrow `replaceLocalImportWithManagedSymlink()` so it reuses the existing `detectLocalImportObservedTargets()` target-root check before deleting and replacing the original path.

**Tech Stack:** TypeScript, Vitest, Node `fs/promises`, existing SkillFlow runtime services.

## Global Constraints

- Use `getTargetScanRoots()` across all configured targets as the definition of an agent directory.
- Do not change the bridge protocol.
- Do not add UI state or a new import draft field.
- Do not change GitHub, ClawHub, or non-local import behavior.
- Do not add a compatibility layer for old local import behavior.
- Keep the diff to `packages/query/src/runtime.ts` and `apps/cli/src/tests/config-integration.test.ts`.

---

### Task 1: Gate Local Import Symlink Replacement By Agent Root

**Files:**
- Modify: `apps/cli/src/tests/config-integration.test.ts`
- Modify: `packages/query/src/runtime.ts`

**Interfaces:**
- Consumes: `SkillFlowApp.importSource(locator, draft)` from `@skill-flow/query/runtime`.
- Consumes: `detectLocalImportObservedTargets(skillPath: string): Promise<LocalSkillScanResult["observedTargets"]>` inside `SkillFlowApp`.
- Produces: `replaceLocalImportWithManagedSymlink(localSkillPath: string | undefined, sourceId: string): Promise<void>` that only replaces paths inside configured agent target roots.

- [ ] **Step 1: Add the failing manual-directory test**

In `apps/cli/src/tests/config-integration.test.ts`, insert this test immediately after `local skill import replaces the original skill directory with a managed symlink`:

```typescript
  test("local skill import leaves manual source directories unchanged", async () => {
    const app = new SkillFlowApp();
    const localSkillPath = path.join(sandbox.sandboxRoot, "manual-local-writer");
    await writeRepoFiles(localSkillPath, {
      "SKILL.md": skillDoc("manual-local-writer", "Writes manual drafts."),
    });

    const imported = await app.importSource(localSkillPath, {
      selectedSkills: [{
        uiId: "manual-local-writer",
        selector: { kind: "repoPath", path: "manual-local-writer" },
      }],
      enabledTargets: [],
    });

    expect(imported.ok).toBe(true);
    if (!imported.ok || imported.data.status !== "ready") {
      return;
    }
    const source = (await v2State(app)).lockFile.sources[imported.data.sourceId];
    expect(source).toBeDefined();
    const stats = await fs.lstat(localSkillPath);
    expect(stats.isDirectory()).toBe(true);
    expect(stats.isSymbolicLink()).toBe(false);
    expect(path.resolve(localSkillPath)).not.toBe(source?.localPath);
  });
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
npm run -w @skill-flow/query build && npm run -w skill-flow test -- src/tests/config-integration.test.ts -t "local skill import"
```

Expected: the new manual-directory test fails because the original manual directory is currently replaced by a symlink.

- [ ] **Step 3: Add the minimal agent-root guard**

In `packages/query/src/runtime.ts`, update `replaceLocalImportWithManagedSymlink()` to return before reading lock state when the path is not under a configured agent target root:

```typescript
  private async replaceLocalImportWithManagedSymlink(
    localSkillPath: string | undefined,
    sourceId: string,
  ): Promise<void> {
    if (!localSkillPath) {
      return;
    }
    const observedTargets = await this.detectLocalImportObservedTargets(localSkillPath);
    if (observedTargets.length === 0) {
      return;
    }
    const { lockFile } = await this.readRuntimeAuthorityView();
    const source = lockFile.sources[sourceId];
    if (source?.localPath) {
      await createSymlink(source.localPath, localSkillPath);
    }
  }
```

- [ ] **Step 4: Run focused tests and verify both local cases pass**

Run:

```bash
npm run -w @skill-flow/query build && npm run -w skill-flow test -- src/tests/config-integration.test.ts -t "local skill import"
```

Expected: both `local skill import replaces the original skill directory with a managed symlink` and `local skill import leaves manual source directories unchanged` pass.

- [ ] **Step 5: Run the full integration file**

Run:

```bash
npm run -w skill-flow test -- src/tests/config-integration.test.ts
```

Expected: all tests in `config-integration.test.ts` pass.

- [ ] **Step 6: Commit the implementation**

Run:

```bash
git status --short
git add packages/query/src/runtime.ts apps/cli/src/tests/config-integration.test.ts
git commit -m "Limit local import symlinks to agent roots"
```

Expected: commit succeeds and only the two implementation files are committed.

## Self-Review

- Spec coverage: Task 1 covers agent-root replacement, manual directory preservation, reuse of existing target-root detection, no protocol changes, and focused tests.
- Placeholder scan: no placeholders remain.
- Type consistency: method names and signatures match the current runtime source.

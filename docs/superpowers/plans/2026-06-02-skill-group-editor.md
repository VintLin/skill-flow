# Skill Group Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a desktop Skill Group Editor that creates virtual groups, merges groups into a virtual replacement, and restores groups hidden by a merge.

**Architecture:** Add virtual group support in core state, then expose it through runtime and bridge commands. Desktop uses a focused sheet with Create, Merge, and Restore tabs, while core runtime owns all persistence, conflict checks, hiding, clearing bindings, and restore behavior.

**Tech Stack:** TypeScript domain/storage/query packages with Vitest; CLI bridge protocol; SwiftUI desktop app with Swift Package tests.

---

## Scope Check

This is one connected feature across core state, bridge protocol, and desktop UI. It should stay one plan because each layer depends on the same virtual group contract and every task produces a testable slice of the same behavior.

## File Structure

- `packages/domain/src/types.ts`: add `virtual` source kind and virtual group state types.
- `packages/storage/src/store.ts`: add `virtualGroupsPath`, read/write virtual group state, and include state writes in mutation-safe helpers.
- `packages/storage/src/tests/store.test.ts`: verify virtual group state defaults, writes, and round trips.
- `packages/shared-types/src/protocol.ts`: add virtual group bridge command names.
- `packages/shared-types/src/tests/protocol.test.ts`: verify parser accepts virtual group commands.
- `apps/cli/src/bridge-command.ts`: parse payloads and call runtime virtual group methods.
- `apps/cli/src/tests/bridge-command.test.ts`: verify request parsing and runtime dispatch.
- `packages/query/src/runtime.ts`: implement virtual group create, merge, restore, conflict detection, hidden filtering, and virtual summary materialization.
- `packages/query/src/tests/virtual-groups.test.ts`: cover runtime behavior.
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`: add Swift bridge command cases.
- `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`: add virtual group command methods.
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`: send virtual group bridge requests.
- `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeCommandFacade.swift`: forward virtual group commands.
- `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`: add editor models, validation, options, and mutation methods.
- `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`: add header button and Skill Group Editor sheet.
- `apps/desktop-mac/Sources/DesktopApp/App/ActionIcon.swift`: add a group editor icon case using the existing action icon pattern.
- `apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons/group-editor.svg`: add the group editor icon asset.
- `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`: add English UI strings.
- `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`: add Simplified Chinese UI strings.
- `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`: add Japanese UI strings.
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`: verify bridge request payloads.
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelVirtualGroupTests.swift`: cover editor view model behavior.
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopMutationCoordinatorTests.swift`: no virtual group tests are added because `MainViewModel` calls the command facade directly.
- `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`: cover added localization keys.

---

### Task 1: Domain And Storage Virtual Group State

**Files:**
- Modify: `packages/domain/src/types.ts`
- Modify: `packages/storage/src/store.ts`
- Test: `packages/storage/src/tests/store.test.ts`

- [ ] **Step 1: Write failing storage tests**

Append these tests to `packages/storage/src/tests/store.test.ts` near other state file tests:

```ts
test("virtual group state defaults to an empty file shape", async () => {
  const store = new StateStore(sandbox.sandboxRoot);

  const virtualGroups = await store.readVirtualGroups();

  expect(virtualGroups).toEqual({
    schemaVersion: 1,
    groups: {},
  });
});

test("virtual group state round trips merge metadata", async () => {
  const store = new StateStore(sandbox.sandboxRoot);

  await store.writeVirtualGroups({
    schemaVersion: 1,
    groups: {
      "writing-stack": {
        id: "writing-stack",
        displayName: "Writing Stack",
        includedSkills: [
          { sourceId: "alpha", leafId: "alpha:skills/review" },
          { sourceId: "beta", leafId: "beta:skills/plan" },
        ],
        hiddenSourceIds: ["alpha", "beta"],
        restoreSnapshots: {
          alpha: { selectedLeafIds: ["alpha:skills/review"], enabledTargets: ["codex"] },
          beta: { selectedLeafIds: ["beta:skills/plan"], enabledTargets: ["cursor"] },
        },
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    },
  });

  await expect(store.readVirtualGroups()).resolves.toEqual({
    schemaVersion: 1,
    groups: {
      "writing-stack": {
        id: "writing-stack",
        displayName: "Writing Stack",
        includedSkills: [
          { sourceId: "alpha", leafId: "alpha:skills/review" },
          { sourceId: "beta", leafId: "beta:skills/plan" },
        ],
        hiddenSourceIds: ["alpha", "beta"],
        restoreSnapshots: {
          alpha: { selectedLeafIds: ["alpha:skills/review"], enabledTargets: ["codex"] },
          beta: { selectedLeafIds: ["beta:skills/plan"], enabledTargets: ["cursor"] },
        },
        createdAt: "2026-06-02T00:00:00.000Z",
        updatedAt: "2026-06-02T00:00:00.000Z",
      },
    },
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm --workspace @skill-flow/storage test -- --run packages/storage/src/tests/store.test.ts -t "virtual group"
```

Expected: FAIL because `StateStore.readVirtualGroups` is not defined.

- [ ] **Step 3: Add domain types**

In `packages/domain/src/types.ts`, change `SourceKind` and add these types near `SharedPreferences`:

```ts
export type SourceKind = "local" | "git" | "clawhub" | "virtual";
```

```ts
export type VirtualGroupSkillRef = {
  sourceId: string;
  leafId: string;
};

export type VirtualGroupRestoreSnapshot = {
  selectedLeafIds: string[];
  enabledTargets: DeploymentTargetId[];
};

export type VirtualGroupRecord = {
  id: string;
  displayName: string;
  includedSkills: VirtualGroupSkillRef[];
  hiddenSourceIds: string[];
  restoreSnapshots: Record<string, VirtualGroupRestoreSnapshot>;
  createdAt: string;
  updatedAt: string;
};

export type VirtualGroupsState = {
  schemaVersion: 1;
  groups: Record<string, VirtualGroupRecord>;
};
```

- [ ] **Step 4: Add storage read/write methods**

In `packages/storage/src/store.ts`, add `DeploymentTargetId`, `VirtualGroupRecord`, `VirtualGroupSkillRef`, and `VirtualGroupsState` to the type import. Add this getter near `preferencesPath`:

```ts
get virtualGroupsPath(): string {
  return path.join(this.stateRoot, "virtual-groups.json");
}
```

Add these public methods after `writePreferences`:

```ts
async readVirtualGroups(): Promise<VirtualGroupsState> {
  return this.withIoLock(async () => {
    await this.init();
    return this.readVirtualGroupsRaw();
  });
}

async writeVirtualGroups(virtualGroups: VirtualGroupsState): Promise<void> {
  await this.withIoLock(async () => {
    await this.init();
    await writeJsonFile(this.virtualGroupsPath, normalizeVirtualGroupsState(virtualGroups));
  });
}
```

Add this private raw reader near `readPreferencesRaw`:

```ts
private async readVirtualGroupsRaw(): Promise<VirtualGroupsState> {
  if (!(await pathExists(this.virtualGroupsPath))) {
    return createEmptyVirtualGroupsState();
  }

  return normalizeVirtualGroupsState(
    await readJsonFile<VirtualGroupsState>(this.virtualGroupsPath),
  );
}
```

Add these helpers at the bottom of the file:

```ts
function createEmptyVirtualGroupsState(): VirtualGroupsState {
  return {
    schemaVersion: 1,
    groups: {},
  };
}

function normalizeVirtualGroupsState(input: Partial<VirtualGroupsState> | undefined): VirtualGroupsState {
  const groups: Record<string, VirtualGroupRecord> = {};

  for (const [id, group] of Object.entries(input?.groups ?? {})) {
    if (!group || typeof group !== "object") {
      continue;
    }

    const record = group as Partial<VirtualGroupRecord>;
    const normalizedId = typeof record.id === "string" && record.id.trim() ? record.id : id;
    groups[normalizedId] = {
      id: normalizedId,
      displayName: typeof record.displayName === "string" ? record.displayName : normalizedId,
      includedSkills: Array.isArray(record.includedSkills)
        ? record.includedSkills
            .filter((skill): skill is VirtualGroupSkillRef =>
              Boolean(skill) &&
              typeof skill.sourceId === "string" &&
              typeof skill.leafId === "string",
            )
            .map((skill) => ({ sourceId: skill.sourceId, leafId: skill.leafId }))
        : [],
      hiddenSourceIds: Array.isArray(record.hiddenSourceIds)
        ? [...new Set(record.hiddenSourceIds.filter((value): value is string => typeof value === "string"))]
        : [],
      restoreSnapshots: normalizeRestoreSnapshots(record.restoreSnapshots),
      createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
      updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : new Date(0).toISOString(),
    };
  }

  return {
    schemaVersion: 1,
    groups,
  };
}

function normalizeRestoreSnapshots(
  input: VirtualGroupRecord["restoreSnapshots"] | undefined,
): VirtualGroupRecord["restoreSnapshots"] {
  const snapshots: VirtualGroupRecord["restoreSnapshots"] = {};

  for (const [sourceId, snapshot] of Object.entries(input ?? {})) {
    snapshots[sourceId] = {
      selectedLeafIds: Array.isArray(snapshot?.selectedLeafIds)
        ? snapshot.selectedLeafIds.filter((value): value is string => typeof value === "string")
        : [],
      enabledTargets: Array.isArray(snapshot?.enabledTargets)
        ? snapshot.enabledTargets.filter((value): value is DeploymentTargetId => typeof value === "string")
        : [],
    };
  }

  return snapshots;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
npm --workspace @skill-flow/storage test -- --run packages/storage/src/tests/store.test.ts -t "virtual group"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/types.ts packages/storage/src/store.ts packages/storage/src/tests/store.test.ts
git commit -m "feat: add virtual group state storage"
```

---

### Task 2: Bridge Protocol And CLI Dispatch

**Files:**
- Modify: `packages/shared-types/src/protocol.ts`
- Modify: `packages/shared-types/src/tests/protocol.test.ts`
- Modify: `apps/cli/src/bridge-command.ts`
- Test: `apps/cli/src/tests/bridge-command.test.ts`

- [ ] **Step 1: Write failing shared protocol test**

Append this test to `packages/shared-types/src/tests/protocol.test.ts`:

```ts
test("recognizes virtual group bridge commands", () => {
  expect(isBridgeCommandName("create-virtual-group")).toBe(true);
  expect(isBridgeCommandName("merge-groups")).toBe(true);
  expect(isBridgeCommandName("restore-merged-groups")).toBe(true);

  expect(
    parseBridgeRequest({
      protocolVersion: "1.0",
      requestId: "request-virtual",
      command: "create-virtual-group",
      payload: {
        displayName: "Writing Stack",
        skills: [{ sourceId: "alpha", leafId: "alpha:skills/review" }],
        enabledTargets: ["codex"],
      },
    }),
  ).toEqual({
    protocolVersion: "1.0",
    requestId: "request-virtual",
    command: "create-virtual-group",
    payload: {
      displayName: "Writing Stack",
      skills: [{ sourceId: "alpha", leafId: "alpha:skills/review" }],
      enabledTargets: ["codex"],
    },
  });
});
```

- [ ] **Step 2: Write failing CLI dispatch test**

In `apps/cli/src/tests/bridge-command.test.ts`, add three test cases using the existing app stub pattern:

```ts
test("dispatches create virtual group bridge command", async () => {
  const app = {
    createVirtualGroup: vi.fn().mockResolvedValue(ok({ sourceId: "writing-stack" })),
  } as unknown as SkillFlowApp;

  const response = await executeBridgeRequest(app, {
    protocolVersion: "1.0",
    requestId: "create-virtual",
    command: "create-virtual-group",
    payload: {
      displayName: "Writing Stack",
      skills: [{ sourceId: "alpha", leafId: "alpha:skills/review" }],
      enabledTargets: ["codex"],
    },
  });

  expect(response.ok).toBe(true);
  expect(app.createVirtualGroup).toHaveBeenCalledWith({
    displayName: "Writing Stack",
    skills: [{ sourceId: "alpha", leafId: "alpha:skills/review" }],
    enabledTargets: ["codex"],
  });
});

test("dispatches merge groups bridge command", async () => {
  const app = {
    mergeGroups: vi.fn().mockResolvedValue(ok({ sourceId: "writing-stack" })),
  } as unknown as SkillFlowApp;

  const response = await executeBridgeRequest(app, {
    protocolVersion: "1.0",
    requestId: "merge-virtual",
    command: "merge-groups",
    payload: {
      displayName: "Writing Stack",
      sourceIds: ["alpha", "beta"],
      enabledTargets: ["codex"],
    },
  });

  expect(response.ok).toBe(true);
  expect(app.mergeGroups).toHaveBeenCalledWith({
    displayName: "Writing Stack",
    sourceIds: ["alpha", "beta"],
    enabledTargets: ["codex"],
  });
});

test("dispatches restore merged groups bridge command", async () => {
  const app = {
    restoreMergedGroups: vi.fn().mockResolvedValue(ok({ restoredSourceIds: ["alpha", "beta"] })),
  } as unknown as SkillFlowApp;

  const response = await executeBridgeRequest(app, {
    protocolVersion: "1.0",
    requestId: "restore-virtual",
    command: "restore-merged-groups",
    payload: {
      virtualGroupId: "writing-stack",
    },
  });

  expect(response.ok).toBe(true);
  expect(app.restoreMergedGroups).toHaveBeenCalledWith("writing-stack");
});
```

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm --workspace @skill-flow/shared-types test -- --run packages/shared-types/src/tests/protocol.test.ts -t "virtual group"
npm --workspace @skill-flow/cli test -- --run apps/cli/src/tests/bridge-command.test.ts -t "virtual"
```

Expected: FAIL because command names and dispatch handlers are missing.

- [ ] **Step 4: Add protocol command names**

In `packages/shared-types/src/protocol.ts`, extend `BridgeCommandName`:

```ts
  | "create-virtual-group"
  | "merge-groups"
  | "restore-merged-groups"
```

Update the command error message list to include the three new commands.

Update `isBridgeCommandName`:

```ts
    value === "create-virtual-group" ||
    value === "merge-groups" ||
    value === "restore-merged-groups" ||
```

- [ ] **Step 5: Add CLI parsing helpers and dispatch**

In `apps/cli/src/bridge-command.ts`, add switch cases before `toggle-pin`:

```ts
      case "create-virtual-group": {
        const payload = expectObjectPayload(request.payload, "create-virtual-group");
        const displayName = expectString(payload.displayName, "displayName", "create-virtual-group");
        const skills = parseVirtualSkillRefs(payload.skills, "skills", "create-virtual-group");
        const enabledTargets = parseOptionalStringArray(payload.enabledTargets, "enabledTargets") ?? [];
        const result = await app.createVirtualGroup({ displayName, skills, enabledTargets });
        return buildBridgeResult({ request, result });
      }
      case "merge-groups": {
        const payload = expectObjectPayload(request.payload, "merge-groups");
        const displayName = expectString(payload.displayName, "displayName", "merge-groups");
        const sourceIds = parseRequiredStringArray(payload.sourceIds, "sourceIds");
        const enabledTargets = parseOptionalStringArray(payload.enabledTargets, "enabledTargets") ?? [];
        const result = await app.mergeGroups({ displayName, sourceIds, enabledTargets });
        return buildBridgeResult({ request, result });
      }
      case "restore-merged-groups": {
        const payload = expectObjectPayload(request.payload, "restore-merged-groups");
        const virtualGroupId = expectString(payload.virtualGroupId, "virtualGroupId", "restore-merged-groups");
        const result = await app.restoreMergedGroups(virtualGroupId);
        return buildBridgeResult({ request, result });
      }
```

Add this helper near `parseRequiredStringArray`:

```ts
function parseVirtualSkillRefs(value: JsonValue | undefined, field: string, command: string): Array<{ sourceId: string; leafId: string }> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Bridge command '${command}' requires non-empty array field '${field}'.`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Bridge command '${command}' requires object entries in '${field}'.`);
    }
    const object = item as JsonObject;
    return {
      sourceId: expectString(object.sourceId, `${field}[${index}].sourceId`, command),
      leafId: expectString(object.leafId, `${field}[${index}].leafId`, command),
    };
  });
}
```

- [ ] **Step 6: Run tests to verify pass**

Run:

```bash
npm --workspace @skill-flow/shared-types test -- --run packages/shared-types/src/tests/protocol.test.ts -t "virtual group"
npm --workspace @skill-flow/cli test -- --run apps/cli/src/tests/bridge-command.test.ts -t "virtual"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared-types/src/protocol.ts packages/shared-types/src/tests/protocol.test.ts apps/cli/src/bridge-command.ts apps/cli/src/tests/bridge-command.test.ts
git commit -m "feat: add virtual group bridge commands"
```

---

### Task 3: Runtime Virtual Group Create

**Files:**
- Create: `packages/query/src/tests/virtual-groups.test.ts`
- Modify: `packages/query/src/runtime.ts`

- [ ] **Step 1: Write failing create tests**

Create `packages/query/src/tests/virtual-groups.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { SkillFlowApp } from "../runtime.js";
import {
  createRepo,
  pathExists,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

describe.sequential("virtual groups", () => {
  const sandbox = useSkillFlowSandbox();

  test("creates a virtual group from skills in multiple source groups without a checkout", async () => {
    const alphaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const betaRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/plan/SKILL.md": skillDoc("plan", "Plan work."),
    });
    const app = new SkillFlowApp();
    const alpha = await app.addSource(alphaRepo, { sourceIdOverride: "alpha" });
    const beta = await app.addSource(betaRepo, { sourceIdOverride: "beta" });
    expect(alpha.ok).toBe(true);
    expect(beta.ok).toBe(true);

    const created = await app.createVirtualGroup({
      displayName: "Writing Stack",
      skills: [
        { sourceId: "alpha", leafId: "alpha:skills/review" },
        { sourceId: "beta", leafId: "beta:skills/plan" },
      ],
      enabledTargets: ["codex"],
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.sourceId).toBe("writing-stack");
    expect(await pathExists(app.store.getSourceCheckoutPath("virtual", "writing-stack"))).toBe(false);

    const { manifest } = await app.store.readState();
    expect(manifest.sources.find((source) => source.id === "writing-stack")).toMatchObject({
      id: "writing-stack",
      kind: "virtual",
      displayName: "Writing Stack",
    });
    expect(manifest.bindings["writing-stack"]?.selectedLeafIds).toEqual([
      "alpha:skills/review",
      "beta:skills/plan",
    ]);
    expect(manifest.bindings["writing-stack"]?.targets.codex?.leafIds).toEqual([
      "alpha:skills/review",
      "beta:skills/plan",
    ]);

    const virtualGroups = await app.store.readVirtualGroups();
    expect(virtualGroups.groups["writing-stack"]?.includedSkills).toEqual([
      { sourceId: "alpha", leafId: "alpha:skills/review" },
      { sourceId: "beta", leafId: "beta:skills/plan" },
    ]);
    expect(virtualGroups.groups["writing-stack"]?.hiddenSourceIds).toEqual([]);
  });

  test("create virtual group rejects empty names and empty skill selections", async () => {
    const app = new SkillFlowApp();

    await expect(app.createVirtualGroup({ displayName: "   ", skills: [], enabledTargets: [] })).resolves.toMatchObject({
      ok: false,
      errors: [{ code: "VIRTUAL_GROUP_NAME_EMPTY" }],
    });

    await expect(app.createVirtualGroup({ displayName: "Writing Stack", skills: [], enabledTargets: [] })).resolves.toMatchObject({
      ok: false,
      errors: [{ code: "VIRTUAL_GROUP_SKILLS_EMPTY" }],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm --workspace @skill-flow/query test -- --run packages/query/src/tests/virtual-groups.test.ts -t "creates a virtual group"
```

Expected: FAIL because `createVirtualGroup` is not defined.

- [ ] **Step 3: Add runtime create types**

In `packages/query/src/runtime.ts`, import `Failure`, `VirtualGroupSkillRef`, `VirtualGroupRecord`, and `VirtualGroupsState` from domain types. Add these local result types near `RenameSourceResult`:

```ts
type CreateVirtualGroupOptions = {
  displayName: string;
  skills: VirtualGroupSkillRef[];
  enabledTargets: DeploymentTargetId[];
};

type CreateVirtualGroupResult = {
  sourceId: string;
  displayName: string;
  selectedLeafIds: string[];
  enabledTargets: DeploymentTargetId[];
};
```

- [ ] **Step 4: Add `createVirtualGroup` runtime method**

Add this method after `renameSource`:

```ts
async createVirtualGroup(options: CreateVirtualGroupOptions): Promise<Result<CreateVirtualGroupResult>> {
  return this.runSerializedMutation(() => this.createVirtualGroupImpl(options));
}
```

Add this private implementation near `renameSourceImpl`:

```ts
private async createVirtualGroupImpl(options: CreateVirtualGroupOptions): Promise<Result<CreateVirtualGroupResult>> {
  const displayName = options.displayName.trim();
  if (!displayName) {
    return fail({ code: "VIRTUAL_GROUP_NAME_EMPTY", message: "Virtual group name is required." });
  }
  if (options.skills.length === 0) {
    return fail({ code: "VIRTUAL_GROUP_SKILLS_EMPTY", message: "Select at least one skill for the virtual group." });
  }

  const { manifest, lockFile } = await this.store.readState();
  const virtualGroups = await this.store.readVirtualGroups();
  const sourceId = this.uniqueVirtualSourceId(displayName, manifest, virtualGroups);
  const validation = this.validateVirtualSkillRefs(options.skills, manifest, lockFile);
  if (!validation.ok) {
    return validation;
  }

  const selectedLeafIds = validation.data.map((skill) => skill.leafId);
  const now = new Date().toISOString();
  const source = {
    id: sourceId,
    locator: `virtual:${sourceId}`,
    kind: "virtual" as const,
    displayName,
    originalDisplayName: displayName,
    addedAt: now,
    selectionMode: "all" as const,
  };
  const record: VirtualGroupRecord = {
    id: sourceId,
    displayName,
    includedSkills: validation.data,
    hiddenSourceIds: [],
    restoreSnapshots: {},
    createdAt: now,
    updatedAt: now,
  };

  manifest.sources.push(source);
  manifest.bindings[sourceId] = this.bindingFromDraft({
    selectedLeafIds,
    enabledTargets: [...new Set(options.enabledTargets)],
  });
  virtualGroups.groups[sourceId] = record;

  await this.store.writeState(manifest, lockFile);
  await this.store.writeVirtualGroups(virtualGroups);

  return ok({
    sourceId,
    displayName,
    selectedLeafIds,
    enabledTargets: [...new Set(options.enabledTargets)],
  });
}
```

Add these helpers near other private helpers:

```ts
private uniqueVirtualSourceId(displayName: string, manifest: Manifest, virtualGroups: VirtualGroupsState): string {
  const base = deriveSourceId(displayName).replace(/[^a-z0-9_-]/gi, "-") || "virtual-group";
  const used = new Set([
    ...manifest.sources.map((source) => source.id),
    ...Object.keys(virtualGroups.groups),
  ]);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

private validateVirtualSkillRefs(
  skills: VirtualGroupSkillRef[],
  manifest: Manifest,
  lockFile: LockFile,
): Result<VirtualGroupSkillRef[]> {
  const sourceIds = new Set(manifest.sources.map((source) => source.id));
  const leafsById = new Map(lockFile.leafInventory.map((leaf) => [leaf.id, leaf]));
  const unique: VirtualGroupSkillRef[] = [];
  const seen = new Set<string>();

  for (const skill of skills) {
    if (!sourceIds.has(skill.sourceId)) {
      return fail({ code: "SOURCE_NOT_FOUND", message: `Skills group id '${skill.sourceId}' is not registered.` });
    }
    const leaf = leafsById.get(skill.leafId);
    if (!leaf || leaf.sourceId !== skill.sourceId) {
      return fail({ code: "LEAF_NOT_FOUND", message: `Skill '${skill.leafId}' is not available in skills group '${skill.sourceId}'.` });
    }
    if (!seen.has(skill.leafId)) {
      seen.add(skill.leafId);
      unique.push({ sourceId: skill.sourceId, leafId: skill.leafId });
    }
  }

  return ok(unique);
}
```

- [ ] **Step 5: Run tests to verify pass**

Run:

```bash
npm --workspace @skill-flow/query test -- --run packages/query/src/tests/virtual-groups.test.ts -t "virtual group"
```

Expected: PASS for create tests.

- [ ] **Step 6: Commit**

```bash
git add packages/query/src/runtime.ts packages/query/src/tests/virtual-groups.test.ts
git commit -m "feat: create virtual skill groups"
```

---

### Task 4: Runtime Merge, Restore, Hidden Filtering, And Conflict Blocking

**Files:**
- Modify: `packages/query/src/runtime.ts`
- Test: `packages/query/src/tests/virtual-groups.test.ts`

- [ ] **Step 1: Add failing merge, restore, and conflict tests**

Append these tests inside the `describe.sequential("virtual groups", ...)` block:

```ts
test("merge groups hides source groups, clears bindings, and stores restore snapshots", async () => {
  const alphaRepo = await createRepo(sandbox.sandboxRoot, {
    "skills/review/SKILL.md": skillDoc("review", "Review code."),
  });
  const betaRepo = await createRepo(sandbox.sandboxRoot, {
    "skills/plan/SKILL.md": skillDoc("plan", "Plan work."),
  });
  const app = new SkillFlowApp();
  await app.addSource(alphaRepo, { sourceIdOverride: "alpha" });
  await app.addSource(betaRepo, { sourceIdOverride: "beta" });
  await app.applyDraft("alpha", { selectedLeafIds: ["alpha:skills/review"], enabledTargets: ["codex"] });
  await app.applyDraft("beta", { selectedLeafIds: ["beta:skills/plan"], enabledTargets: ["cursor"] });

  const merged = await app.mergeGroups({
    displayName: "Writing Stack",
    sourceIds: ["alpha", "beta"],
    enabledTargets: ["codex"],
  });

  expect(merged.ok).toBe(true);
  if (!merged.ok) return;
  expect(merged.data.sourceId).toBe("writing-stack");

  const { manifest } = await app.store.readState();
  expect(manifest.bindings.alpha).toEqual({ selectedLeafIds: [], targets: {} });
  expect(manifest.bindings.beta).toEqual({ selectedLeafIds: [], targets: {} });

  const virtualGroups = await app.store.readVirtualGroups();
  expect(virtualGroups.groups["writing-stack"]?.hiddenSourceIds).toEqual(["alpha", "beta"]);
  expect(virtualGroups.groups["writing-stack"]?.restoreSnapshots).toEqual({
    alpha: { selectedLeafIds: ["alpha:skills/review"], enabledTargets: ["codex"] },
    beta: { selectedLeafIds: ["beta:skills/plan"], enabledTargets: ["cursor"] },
  });

  const list = await app.listWorkflows();
  expect(list.ok).toBe(true);
  if (!list.ok) return;
  expect(list.data.summaries.map((summary) => summary.source.id)).toEqual(["writing-stack"]);
});

test("restore merged groups re-shows source groups and deletes the virtual group", async () => {
  const alphaRepo = await createRepo(sandbox.sandboxRoot, {
    "skills/review/SKILL.md": skillDoc("review", "Review code."),
  });
  const betaRepo = await createRepo(sandbox.sandboxRoot, {
    "skills/plan/SKILL.md": skillDoc("plan", "Plan work."),
  });
  const app = new SkillFlowApp();
  await app.addSource(alphaRepo, { sourceIdOverride: "alpha" });
  await app.addSource(betaRepo, { sourceIdOverride: "beta" });
  await app.applyDraft("alpha", { selectedLeafIds: ["alpha:skills/review"], enabledTargets: ["codex"] });
  await app.applyDraft("beta", { selectedLeafIds: ["beta:skills/plan"], enabledTargets: ["cursor"] });
  await app.mergeGroups({ displayName: "Writing Stack", sourceIds: ["alpha", "beta"], enabledTargets: ["codex"] });

  const restored = await app.restoreMergedGroups("writing-stack");

  expect(restored.ok).toBe(true);
  if (!restored.ok) return;
  expect(restored.data.restoredSourceIds).toEqual(["alpha", "beta"]);
  const { manifest } = await app.store.readState();
  expect(manifest.sources.some((source) => source.id === "writing-stack")).toBe(false);
  expect(manifest.bindings.alpha?.selectedLeafIds).toEqual(["alpha:skills/review"]);
  expect(manifest.bindings.alpha?.targets.codex?.leafIds).toEqual(["alpha:skills/review"]);
  expect(manifest.bindings.beta?.selectedLeafIds).toEqual(["beta:skills/plan"]);
  expect(manifest.bindings.beta?.targets.cursor?.leafIds).toEqual(["beta:skills/plan"]);
});

test("virtual group creation blocks duplicate projected skill names", async () => {
  const alphaRepo = await createRepo(sandbox.sandboxRoot, {
    "skills/review/SKILL.md": skillDoc("review", "Review code."),
  });
  const betaRepo = await createRepo(sandbox.sandboxRoot, {
    "other/review/SKILL.md": skillDoc("review", "Review code elsewhere."),
  });
  const app = new SkillFlowApp();
  await app.addSource(alphaRepo, { sourceIdOverride: "alpha" });
  await app.addSource(betaRepo, { sourceIdOverride: "beta" });

  const created = await app.createVirtualGroup({
    displayName: "Review Stack",
    skills: [
      { sourceId: "alpha", leafId: "alpha:skills/review" },
      { sourceId: "beta", leafId: "beta:other/review" },
    ],
    enabledTargets: ["codex"],
  });

  expect(created.ok).toBe(false);
  expect(created.errors[0]).toMatchObject({
    code: "VIRTUAL_GROUP_SKILL_NAME_CONFLICT",
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
npm --workspace @skill-flow/query test -- --run packages/query/src/tests/virtual-groups.test.ts -t "merge groups|restore merged|blocks duplicate"
```

Expected: FAIL because merge, restore, hidden filtering, and conflict checks are missing.

- [ ] **Step 3: Add merge and restore public methods**

In `packages/query/src/runtime.ts`, add local types:

```ts
type MergeGroupsOptions = {
  displayName: string;
  sourceIds: string[];
  enabledTargets: DeploymentTargetId[];
};

type RestoreMergedGroupsResult = {
  virtualGroupId: string;
  restoredSourceIds: string[];
  skippedSourceIds: string[];
};
```

Add methods:

```ts
async mergeGroups(options: MergeGroupsOptions): Promise<Result<CreateVirtualGroupResult>> {
  return this.runSerializedMutation(() => this.mergeGroupsImpl(options));
}

async restoreMergedGroups(virtualGroupId: string): Promise<Result<RestoreMergedGroupsResult>> {
  return this.runSerializedMutation(() => this.restoreMergedGroupsImpl(virtualGroupId));
}
```

- [ ] **Step 4: Add conflict check helper**

Add this helper and call it from `createVirtualGroupImpl` after `validation` succeeds:

```ts
private detectVirtualSkillNameConflict(skills: VirtualGroupSkillRef[], lockFile: LockFile): Failure | null {
  const leafsById = new Map(lockFile.leafInventory.map((leaf) => [leaf.id, leaf]));
  const ownersByLinkName = new Map<string, string[]>();

  for (const skill of skills) {
    const leaf = leafsById.get(skill.leafId);
    if (!leaf) {
      continue;
    }
    const owners = ownersByLinkName.get(leaf.linkName) ?? [];
    owners.push(`${skill.sourceId}:${leaf.linkName}`);
    ownersByLinkName.set(leaf.linkName, owners);
  }

  for (const [linkName, owners] of ownersByLinkName.entries()) {
    if (owners.length > 1) {
      return {
        code: "VIRTUAL_GROUP_SKILL_NAME_CONFLICT",
        message: `Virtual group contains duplicate skill deployment name '${linkName}' from ${owners.join(", ")}.`,
      };
    }
  }

  return null;
}
```

In `createVirtualGroupImpl`, add:

```ts
const conflict = this.detectVirtualSkillNameConflict(validation.data, lockFile);
if (conflict) {
  return fail(conflict);
}
```

- [ ] **Step 5: Implement merge**

Add:

```ts
private async mergeGroupsImpl(options: MergeGroupsOptions): Promise<Result<CreateVirtualGroupResult>> {
  const displayName = options.displayName.trim();
  const sourceIds = [...new Set(options.sourceIds.map((sourceId) => sourceId.trim()).filter(Boolean))];
  if (!displayName) {
    return fail({ code: "VIRTUAL_GROUP_NAME_EMPTY", message: "Virtual group name is required." });
  }
  if (sourceIds.length < 2) {
    return fail({ code: "MERGE_GROUPS_TOO_FEW", message: "Select at least two skills groups to merge." });
  }

  const { manifest, lockFile } = await this.store.readState();
  const virtualGroups = await this.store.readVirtualGroups();
  for (const sourceId of sourceIds) {
    if (!manifest.sources.some((source) => source.id === sourceId && source.kind !== "virtual")) {
      return fail({ code: "SOURCE_NOT_FOUND", message: `Skills group id '${sourceId}' is not registered.` });
    }
  }

  const skills = lockFile.leafInventory
    .filter((leaf) => sourceIds.includes(leaf.sourceId))
    .map((leaf) => ({ sourceId: leaf.sourceId, leafId: leaf.id }));
  if (skills.length === 0) {
    return fail({ code: "VIRTUAL_GROUP_SKILLS_EMPTY", message: "Merged groups do not contain any available skills." });
  }
  const conflict = this.detectVirtualSkillNameConflict(skills, lockFile);
  if (conflict) {
    return fail(conflict);
  }

  const sourceId = this.uniqueVirtualSourceId(displayName, manifest, virtualGroups);
  const now = new Date().toISOString();
  const restoreSnapshots = Object.fromEntries(
    sourceIds.map((sourceId) => [sourceId, this.draftFromBinding(sourceId, manifest.bindings[sourceId] ?? { targets: {} }, lockFile)]),
  );

  manifest.sources.push({
    id: sourceId,
    locator: `virtual:${sourceId}`,
    kind: "virtual",
    displayName,
    originalDisplayName: displayName,
    addedAt: now,
    selectionMode: "all",
  });
  manifest.bindings[sourceId] = this.bindingFromDraft({
    selectedLeafIds: skills.map((skill) => skill.leafId),
    enabledTargets: [...new Set(options.enabledTargets)],
  });
  for (const hiddenSourceId of sourceIds) {
    manifest.bindings[hiddenSourceId] = this.bindingFromDraft(EMPTY_DRAFT);
  }
  virtualGroups.groups[sourceId] = {
    id: sourceId,
    displayName,
    includedSkills: skills,
    hiddenSourceIds: sourceIds,
    restoreSnapshots,
    createdAt: now,
    updatedAt: now,
  };

  await this.store.writeState(manifest, lockFile);
  await this.store.writeVirtualGroups(virtualGroups);

  return ok({
    sourceId,
    displayName,
    selectedLeafIds: skills.map((skill) => skill.leafId),
    enabledTargets: [...new Set(options.enabledTargets)],
  });
}
```

- [ ] **Step 6: Implement restore**

Add:

```ts
private async restoreMergedGroupsImpl(virtualGroupId: string): Promise<Result<RestoreMergedGroupsResult>> {
  const { manifest, lockFile } = await this.store.readState();
  const virtualGroups = await this.store.readVirtualGroups();
  const virtualGroup = virtualGroups.groups[virtualGroupId];
  if (!virtualGroup) {
    return fail({ code: "VIRTUAL_GROUP_NOT_FOUND", message: `Virtual group '${virtualGroupId}' is not registered.` });
  }
  if (virtualGroup.hiddenSourceIds.length === 0) {
    return fail({ code: "VIRTUAL_GROUP_RESTORE_UNAVAILABLE", message: `Virtual group '${virtualGroupId}' has no hidden groups to restore.` });
  }

  const restoredSourceIds: string[] = [];
  const skippedSourceIds: string[] = [];
  for (const sourceId of virtualGroup.hiddenSourceIds) {
    if (!manifest.sources.some((source) => source.id === sourceId)) {
      skippedSourceIds.push(sourceId);
      continue;
    }
    const snapshot = virtualGroup.restoreSnapshots[sourceId];
    if (!snapshot) {
      skippedSourceIds.push(sourceId);
      continue;
    }
    manifest.bindings[sourceId] = this.bindingFromDraft(snapshot);
    restoredSourceIds.push(sourceId);
  }

  manifest.sources = manifest.sources.filter((source) => source.id !== virtualGroupId);
  delete manifest.bindings[virtualGroupId];
  delete virtualGroups.groups[virtualGroupId];

  await this.store.writeState(manifest, lockFile);
  await this.store.writeVirtualGroups(virtualGroups);

  return ok({ virtualGroupId, restoredSourceIds, skippedSourceIds });
}
```

- [ ] **Step 7: Filter hidden groups in list outputs**

Find `listWorkflows` summary generation in `packages/query/src/runtime.ts`. After reading `virtualGroups`, exclude any summary whose source id appears in any `hiddenSourceIds`:

```ts
const hiddenSourceIds = this.hiddenSourceIdsFromVirtualGroups(await this.store.readVirtualGroups());
const visibleSummaries = summaries.filter((summary) => !hiddenSourceIds.has(summary.source.id));
```

Add helper:

```ts
private hiddenSourceIdsFromVirtualGroups(virtualGroups: VirtualGroupsState): Set<string> {
  return new Set(Object.values(virtualGroups.groups).flatMap((group) => group.hiddenSourceIds));
}
```

Return `visibleSummaries` instead of `summaries`.

- [ ] **Step 8: Run tests to verify pass**

Run:

```bash
npm --workspace @skill-flow/query test -- --run packages/query/src/tests/virtual-groups.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/query/src/runtime.ts packages/query/src/tests/virtual-groups.test.ts
git commit -m "feat: merge and restore virtual skill groups"
```

---

### Task 5: Swift Bridge Surface

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeCommandFacade.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/BridgeClientExecutionTests.swift`

- [ ] **Step 1: Write failing BridgeClient tests**

Add tests to `BridgeClientExecutionTests.swift` near the existing rename/apply command tests:

```swift
func testCreateVirtualGroupSendsExpectedPayload() async throws {
    let fixture = try BridgeClientFixture(responseCommand: "create-virtual-group")
    defer { fixture.cleanup() }
    let bridge = fixture.makeBridgeClient()

    _ = try await bridge.createVirtualGroup(
        displayName: "Writing Stack",
        skills: [
            .init(sourceId: "alpha", leafId: "alpha:skills/review"),
            .init(sourceId: "beta", leafId: "beta:skills/plan"),
        ],
        enabledTargets: ["codex"]
    )

    XCTAssertEqual(try fixture.lastCommand(), "create-virtual-group")
    let payload = try fixture.lastPayload()
    XCTAssertEqual(payload["displayName"] as? String, "Writing Stack")
    XCTAssertEqual(payload["enabledTargets"] as? [String], ["codex"])
    let skills = try XCTUnwrap(payload["skills"] as? [[String: Any]])
    XCTAssertEqual(skills.first?["sourceId"] as? String, "alpha")
    XCTAssertEqual(skills.first?["leafId"] as? String, "alpha:skills/review")
}

func testMergeGroupsSendsExpectedPayload() async throws {
    let fixture = try BridgeClientFixture(responseCommand: "merge-groups")
    defer { fixture.cleanup() }
    let bridge = fixture.makeBridgeClient()

    _ = try await bridge.mergeGroups(displayName: "Writing Stack", sourceIds: ["alpha", "beta"], enabledTargets: ["codex"])

    XCTAssertEqual(try fixture.lastCommand(), "merge-groups")
    let payload = try fixture.lastPayload()
    XCTAssertEqual(payload["displayName"] as? String, "Writing Stack")
    XCTAssertEqual(payload["sourceIds"] as? [String], ["alpha", "beta"])
    XCTAssertEqual(payload["enabledTargets"] as? [String], ["codex"])
}

func testRestoreMergedGroupsSendsExpectedPayload() async throws {
    let fixture = try BridgeClientFixture(responseCommand: "restore-merged-groups")
    defer { fixture.cleanup() }
    let bridge = fixture.makeBridgeClient()

    _ = try await bridge.restoreMergedGroups(virtualGroupId: "writing-stack")

    XCTAssertEqual(try fixture.lastCommand(), "restore-merged-groups")
    let payload = try fixture.lastPayload()
    XCTAssertEqual(payload["virtualGroupId"] as? String, "writing-stack")
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests/testCreateVirtualGroupSendsExpectedPayload
```

Expected: FAIL because Swift bridge methods and command cases are missing.

- [ ] **Step 3: Add Swift bridge command cases and skill ref**

In `BridgeProtocol.swift`, add cases:

```swift
case createVirtualGroup = "create-virtual-group"
case mergeGroups = "merge-groups"
case restoreMergedGroups = "restore-merged-groups"
```

Add:

```swift
struct VirtualGroupSkillRef: Hashable, Sendable {
    let sourceId: String
    let leafId: String
}
```

- [ ] **Step 4: Add command facade protocol methods**

In `DesktopCommanding.swift`, add:

```swift
func createVirtualGroup(displayName: String, skills: [VirtualGroupSkillRef], enabledTargets: [String]) async throws -> BridgeResponse
func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse
func restoreMergedGroups(virtualGroupId: String) async throws -> BridgeResponse
```

- [ ] **Step 5: Add BridgeClient methods**

In `BridgeClient.swift`, add:

```swift
func createVirtualGroup(displayName: String, skills: [VirtualGroupSkillRef], enabledTargets: [String]) async throws -> BridgeResponse {
    try await mutationCoordinator.runMutation {
        try await self.send(
            command: .createVirtualGroup,
            payload: [
                "displayName": AnyCodable(displayName),
                "skills": AnyCodable(skills.map { ["sourceId": $0.sourceId, "leafId": $0.leafId] }),
                "enabledTargets": AnyCodable(enabledTargets),
            ]
        )
    }
}

func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
    try await mutationCoordinator.runMutation {
        try await self.send(
            command: .mergeGroups,
            payload: [
                "displayName": AnyCodable(displayName),
                "sourceIds": AnyCodable(sourceIds),
                "enabledTargets": AnyCodable(enabledTargets),
            ]
        )
    }
}

func restoreMergedGroups(virtualGroupId: String) async throws -> BridgeResponse {
    try await mutationCoordinator.runMutation {
        try await self.send(
            command: .restoreMergedGroups,
            payload: [
                "virtualGroupId": AnyCodable(virtualGroupId),
            ]
        )
    }
}
```

- [ ] **Step 6: Add facade forwarding**

In `DesktopBridgeCommandFacade.swift`, add:

```swift
func createVirtualGroup(displayName: String, skills: [VirtualGroupSkillRef], enabledTargets: [String]) async throws -> BridgeResponse {
    try await bridgeClient.createVirtualGroup(displayName: displayName, skills: skills, enabledTargets: enabledTargets)
}

func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
    try await bridgeClient.mergeGroups(displayName: displayName, sourceIds: sourceIds, enabledTargets: enabledTargets)
}

func restoreMergedGroups(virtualGroupId: String) async throws -> BridgeResponse {
    try await bridgeClient.restoreMergedGroups(virtualGroupId: virtualGroupId)
}
```

- [ ] **Step 7: Update test stubs**

For every test stub conforming to `DesktopCommanding`, add methods that call `fatalError("unused")`:

```swift
func createVirtualGroup(displayName: String, skills: [VirtualGroupSkillRef], enabledTargets: [String]) async throws -> BridgeResponse { fatalError("unused") }
func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse { fatalError("unused") }
func restoreMergedGroups(virtualGroupId: String) async throws -> BridgeResponse { fatalError("unused") }
```

- [ ] **Step 8: Run tests to verify pass**

Run:

```bash
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests/testCreateVirtualGroupSendsExpectedPayload
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests/testMergeGroupsSendsExpectedPayload
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests/testRestoreMergedGroupsSendsExpectedPayload
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Runtime/Models/BridgeProtocol.swift apps/desktop-mac/Sources/DesktopApp/Runtime/DesktopCommanding.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift apps/desktop-mac/Sources/DesktopApp/Runtime/Bridge/DesktopBridgeCommandFacade.swift apps/desktop-mac/Tests/SkillFlowDesktopTests
git commit -m "feat: expose virtual group desktop bridge commands"
```

---

### Task 6: MainViewModel Virtual Group Editor State

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Create: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelVirtualGroupTests.swift`

- [ ] **Step 1: Write failing view model tests**

Create `MainViewModelVirtualGroupTests.swift`:

```swift
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MainViewModelVirtualGroupTests: XCTestCase {
    func testCreateVirtualGroupDraftValidatesNameAndSelection() {
        let viewModel = MainViewModel(bridgeClient: BridgeClient(), commandFacade: RecordingVirtualGroupCommandFacade())

        XCTAssertEqual(viewModel.validateVirtualGroupCreate(displayName: " ", selectedSkills: []), .nameRequired)
        XCTAssertEqual(viewModel.validateVirtualGroupCreate(displayName: "Writing Stack", selectedSkills: []), .skillsRequired)
        XCTAssertEqual(
            viewModel.validateVirtualGroupCreate(
                displayName: "Writing Stack",
                selectedSkills: [VirtualGroupSkillRef(sourceId: "alpha", leafId: "alpha:skills/review")]
            ),
            .valid
        )
    }

    func testMergeVirtualGroupRequiresTwoGroups() {
        let viewModel = MainViewModel(bridgeClient: BridgeClient(), commandFacade: RecordingVirtualGroupCommandFacade())

        XCTAssertEqual(viewModel.validateVirtualGroupMerge(displayName: "Writing Stack", sourceIds: ["alpha"]), .groupsRequired)
        XCTAssertEqual(viewModel.validateVirtualGroupMerge(displayName: "Writing Stack", sourceIds: ["alpha", "beta"]), .valid)
    }

    func testCreateVirtualGroupCallsCommandFacade() async {
        let command = RecordingVirtualGroupCommandFacade()
        let viewModel = MainViewModel(bridgeClient: BridgeClient(), commandFacade: command)

        await viewModel.createVirtualGroup(
            displayName: "Writing Stack",
            skills: [VirtualGroupSkillRef(sourceId: "alpha", leafId: "alpha:skills/review")],
            enabledTargets: ["codex"]
        )

        XCTAssertEqual(command.createCalls.count, 1)
        XCTAssertEqual(command.createCalls.first?.displayName, "Writing Stack")
        XCTAssertEqual(command.createCalls.first?.skills, [VirtualGroupSkillRef(sourceId: "alpha", leafId: "alpha:skills/review")])
    }
}

private final class RecordingVirtualGroupCommandFacade: DesktopCommanding {
    struct CreateCall {
        let displayName: String
        let skills: [VirtualGroupSkillRef]
        let enabledTargets: [String]
    }

    var createCalls: [CreateCall] = []

    func createVirtualGroup(displayName: String, skills: [VirtualGroupSkillRef], enabledTargets: [String]) async throws -> BridgeResponse {
        createCalls.append(CreateCall(displayName: displayName, skills: skills, enabledTargets: enabledTargets))
        return BridgeResponse.success(command: .createVirtualGroup, payload: ["sourceId": displayName])
    }

    func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        BridgeResponse.success(command: .mergeGroups, payload: ["sourceId": displayName])
    }

    func restoreMergedGroups(virtualGroupId: String) async throws -> BridgeResponse {
        BridgeResponse.success(command: .restoreMergedGroups, payload: ["virtualGroupId": virtualGroupId])
    }

    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse { fatalError("unused") }
    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse { fatalError("unused") }
    func importSource(locator: String, selectedSkillIds: [String], enabledTargets: [String]) async throws -> BridgeResponse { fatalError("unused") }
    func renameSource(sourceId: String, displayName: String) async throws -> BridgeResponse { fatalError("unused") }
    func uninstall(sourceIds: [String]) async throws -> BridgeResponse { fatalError("unused") }
    func apply(sourceId: String, scope: ProjectScopeSelection, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse { fatalError("unused") }
    func saveSettings(customTargets: [[String: String]], agentDisplayOrder: [String]) async throws -> BridgeResponse { fatalError("unused") }
}

private extension BridgeResponse {
    static func success(command: BridgeCommand, payload: [String: Any]) -> BridgeResponse {
        BridgeResponse(
            protocolVersion: "1.0",
            requestId: nil,
            command: command,
            ok: true,
            data: AnyCodable(payload),
            warnings: [],
            errors: []
        )
    }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd apps/desktop-mac && swift test --filter MainViewModelVirtualGroupTests
```

Expected: FAIL because validation methods and mutation methods are missing.

- [ ] **Step 3: Add validation enum and editor option models**

In `MainViewModel.swift`, add near other nested models:

```swift
enum VirtualGroupValidationResult: Equatable {
    case valid
    case nameRequired
    case skillsRequired
    case groupsRequired
}

struct VirtualGroupSkillOption: Identifiable, Equatable {
    let id: String
    let sourceId: String
    let sourceTitle: String
    let leafId: String
    let title: String
    let isEnabled: Bool
}

struct VirtualGroupSourceOption: Identifiable, Equatable {
    let id: String
    let title: String
    let skillCount: Int
    let isVirtual: Bool
}
```

- [ ] **Step 4: Add validation methods**

Add:

```swift
func validateVirtualGroupCreate(displayName: String, selectedSkills: [VirtualGroupSkillRef]) -> VirtualGroupValidationResult {
    if displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return .nameRequired
    }
    if selectedSkills.isEmpty {
        return .skillsRequired
    }
    return .valid
}

func validateVirtualGroupMerge(displayName: String, sourceIds: [String]) -> VirtualGroupValidationResult {
    if displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        return .nameRequired
    }
    if Set(sourceIds).count < 2 {
        return .groupsRequired
    }
    return .valid
}
```

- [ ] **Step 5: Add editor option derivation**

Add:

```swift
var virtualGroupSourceOptions: [VirtualGroupSourceOption] {
    groupCards.map { card in
        VirtualGroupSourceOption(
            id: card.id,
            title: card.title,
            skillCount: card.skills.count,
            isVirtual: card.sourceKind == "virtual"
        )
    }
}

func virtualGroupSkillOptions(for sourceId: String) -> [VirtualGroupSkillOption] {
    guard let card = groupCards.first(where: { $0.id == sourceId }) else {
        return []
    }
    return card.skills.map { skill in
        VirtualGroupSkillOption(
            id: skill.id,
            sourceId: card.id,
            sourceTitle: card.title,
            leafId: skill.id,
            title: skill.label,
            isEnabled: skill.isEnabled
        )
    }
}
```

- [ ] **Step 6: Add mutation methods**

Add:

```swift
func createVirtualGroup(displayName: String, skills: [VirtualGroupSkillRef], enabledTargets: [String]) async {
    guard validateVirtualGroupCreate(displayName: displayName, selectedSkills: skills) == .valid else {
        return
    }
    do {
        let response = try await commandFacade.createVirtualGroup(
            displayName: displayName,
            skills: skills,
            enabledTargets: enabledTargets
        )
        if !response.ok {
            presentBridgeErrorToast(response)
            return
        }
        await refreshList()
    } catch {
        presentToast(message: error.localizedDescription, style: .error)
    }
}

func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async {
    guard validateVirtualGroupMerge(displayName: displayName, sourceIds: sourceIds) == .valid else {
        return
    }
    do {
        let response = try await commandFacade.mergeGroups(
            displayName: displayName,
            sourceIds: sourceIds,
            enabledTargets: enabledTargets
        )
        if !response.ok {
            presentBridgeErrorToast(response)
            return
        }
        await refreshList()
    } catch {
        presentToast(message: error.localizedDescription, style: .error)
    }
}

func restoreMergedGroups(virtualGroupId: String) async {
    do {
        let response = try await commandFacade.restoreMergedGroups(virtualGroupId: virtualGroupId)
        if !response.ok {
            presentBridgeErrorToast(response)
            return
        }
        await refreshList()
    } catch {
        presentToast(message: error.localizedDescription, style: .error)
    }
}
```

- [ ] **Step 7: Run tests to verify pass**

Run:

```bash
cd apps/desktop-mac && swift test --filter MainViewModelVirtualGroupTests
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelVirtualGroupTests.swift
git commit -m "feat: add virtual group editor view model state"
```

---

### Task 7: SwiftUI Header Entry And Editor Sheet

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/App/ActionIcon.swift`
- Create: `apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons/group-editor.svg`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/DesktopLocalizationTests.swift`

- [ ] **Step 1: Write failing localization test**

Add this test to `DesktopLocalizationTests.swift`:

```swift
func testGroupEditorLocalizationKeysExist() {
    let keys = [
        "group_editor.title",
        "group_editor.tab.create",
        "group_editor.tab.merge",
        "group_editor.tab.restore",
        "group_editor.action.save",
        "group_editor.action.restore",
        "group_editor.validation.name_required",
        "group_editor.validation.skills_required",
        "group_editor.validation.groups_required",
        "group_editor.impact.create_virtual_group",
        "group_editor.impact.hide_groups",
        "group_editor.impact.clear_bindings",
        "group_editor.impact.save_restore_snapshot",
    ]
    for key in keys {
        XCTAssertFalse(L10n.string(key, locale: Locale(identifier: "en")).isEmpty)
        XCTAssertFalse(L10n.string(key, locale: Locale(identifier: "zh-Hans")).isEmpty)
        XCTAssertFalse(L10n.string(key, locale: Locale(identifier: "ja")).isEmpty)
    }
}
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd apps/desktop-mac && swift test --filter DesktopLocalizationTests/testGroupEditorLocalizationKeysExist
```

Expected: FAIL because keys do not exist.

- [ ] **Step 3: Add localizations**

Append to `en.lproj/Localizable.strings`:

```text
"group_editor.title" = "Skill Group Editor";
"group_editor.tab.create" = "Create";
"group_editor.tab.merge" = "Merge";
"group_editor.tab.restore" = "Restore";
"group_editor.action.save" = "Save";
"group_editor.action.restore" = "Restore";
"group_editor.validation.name_required" = "Enter a group name.";
"group_editor.validation.skills_required" = "Select at least one skill.";
"group_editor.validation.groups_required" = "Select at least two groups.";
"group_editor.impact.create_virtual_group" = "Create one virtual group";
"group_editor.impact.hide_groups" = "Hide selected source groups";
"group_editor.impact.clear_bindings" = "Clear selected skills and targets from hidden groups";
"group_editor.impact.save_restore_snapshot" = "Save restore snapshots";
```

Append Simplified Chinese:

```text
"group_editor.title" = "Skill Group Editor";
"group_editor.tab.create" = "创建";
"group_editor.tab.merge" = "合并";
"group_editor.tab.restore" = "恢复";
"group_editor.action.save" = "保存";
"group_editor.action.restore" = "恢复";
"group_editor.validation.name_required" = "请输入 group 名称。";
"group_editor.validation.skills_required" = "至少选择一个 skill。";
"group_editor.validation.groups_required" = "至少选择两个 group。";
"group_editor.impact.create_virtual_group" = "创建一个虚拟 group";
"group_editor.impact.hide_groups" = "隐藏选中的源 group";
"group_editor.impact.clear_bindings" = "清空隐藏 group 的已选 skills 和 targets";
"group_editor.impact.save_restore_snapshot" = "保存恢复快照";
```

Append Japanese:

```text
"group_editor.title" = "Skill Group Editor";
"group_editor.tab.create" = "作成";
"group_editor.tab.merge" = "結合";
"group_editor.tab.restore" = "復元";
"group_editor.action.save" = "保存";
"group_editor.action.restore" = "復元";
"group_editor.validation.name_required" = "グループ名を入力してください。";
"group_editor.validation.skills_required" = "少なくとも 1 つの skill を選択してください。";
"group_editor.validation.groups_required" = "少なくとも 2 つの group を選択してください。";
"group_editor.impact.create_virtual_group" = "仮想 group を 1 つ作成";
"group_editor.impact.hide_groups" = "選択した元 group を非表示";
"group_editor.impact.clear_bindings" = "非表示 group の選択済み skills と targets をクリア";
"group_editor.impact.save_restore_snapshot" = "復元スナップショットを保存";
```

- [ ] **Step 4: Add action icon**

In `ActionIcon.swift`, add:

```swift
case groupEditor = "group-editor"
```

Create `group-editor.svg` using the existing icon style:

```xml
<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M4 5.5H9.5V11H4V5.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M10.5 4H16V9.5H10.5V4Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M10.5 10.5H16V16H10.5V10.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M6.75 11V13.5H10.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 5: Add MainView sheet state and header button**

In `MainView.swift`, add state:

```swift
@State private var isSkillGroupEditorPresented = false
@State private var skillGroupEditorTab: SkillGroupEditorTab = .create
@State private var virtualGroupNameDraft = ""
@State private var selectedVirtualGroupSkillRefs: Set<VirtualGroupSkillRef> = []
@State private var selectedMergeSourceIds: Set<String> = []
@State private var selectedVirtualGroupTargets: Set<String> = []
```

Add this enum at file scope near `MainView`:

```swift
fileprivate enum SkillGroupEditorTab: String, CaseIterable, Identifiable {
    case create
    case merge
    case restore

    var id: String { rawValue }
}
```

Add button near `importButton`, `homeUpdateButton`, `settingsButton` in `homeMainHeader`:

```swift
skillGroupEditorButton
```

Add:

```swift
private var skillGroupEditorButton: some View {
    toolbarIconButton(.groupEditor) {
        isSkillGroupEditorPresented = true
    }
}
```

- [ ] **Step 6: Add sheet presentation**

Inside the main `ZStack`, add above toast:

```swift
if isSkillGroupEditorPresented {
    ZStack {
        Color.black.opacity(theme == .dark ? 0.35 : 0.18)
            .ignoresSafeArea()
            .contentShape(Rectangle())
            .onTapGesture {
                isSkillGroupEditorPresented = false
            }

        SkillGroupEditorSheet(
            selectedTab: $skillGroupEditorTab,
            nameDraft: $virtualGroupNameDraft,
            selectedSkills: $selectedVirtualGroupSkillRefs,
            selectedMergeSourceIds: $selectedMergeSourceIds,
            selectedTargets: $selectedVirtualGroupTargets,
            sourceOptions: viewModel.virtualGroupSourceOptions,
            skillOptions: { sourceId in viewModel.virtualGroupSkillOptions(for: sourceId) },
            targetOptions: viewModel.visibleTargets,
            theme: theme,
            accent: accent,
            t: t,
            onCancel: {
                isSkillGroupEditorPresented = false
            },
            onCreate: {
                let skills = Array(selectedVirtualGroupSkillRefs)
                let targets = Array(selectedVirtualGroupTargets)
                Task {
                    await viewModel.createVirtualGroup(displayName: virtualGroupNameDraft, skills: skills, enabledTargets: targets)
                    isSkillGroupEditorPresented = false
                }
            },
            onMerge: {
                let sourceIds = Array(selectedMergeSourceIds)
                let targets = Array(selectedVirtualGroupTargets)
                Task {
                    await viewModel.mergeGroups(displayName: virtualGroupNameDraft, sourceIds: sourceIds, enabledTargets: targets)
                    isSkillGroupEditorPresented = false
                }
            },
            onRestore: { virtualGroupId in
                Task {
                    await viewModel.restoreMergedGroups(virtualGroupId: virtualGroupId)
                    isSkillGroupEditorPresented = false
                }
            }
        )
        .frame(maxWidth: 720, maxHeight: 560)
        .shadow(color: AppTheme.softShadow(for: theme), radius: 20, y: 10)
    }
    .transition(.opacity)
    .zIndex(70)
}
```

- [ ] **Step 7: Add `SkillGroupEditorSheet` focused view**

Add the sheet as a private view at the bottom of `MainView.swift`:

```swift
private struct SkillGroupEditorSheet: View {
    @Binding var selectedTab: SkillGroupEditorTab
    @Binding var nameDraft: String
    @Binding var selectedSkills: Set<VirtualGroupSkillRef>
    @Binding var selectedMergeSourceIds: Set<String>
    @Binding var selectedTargets: Set<String>

    let sourceOptions: [MainViewModel.VirtualGroupSourceOption]
    let skillOptions: (String) -> [MainViewModel.VirtualGroupSkillOption]
    let targetOptions: [MainViewModel.TargetOption]
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let t: (String) -> String
    let onCancel: () -> Void
    let onCreate: () -> Void
    let onMerge: () -> Void
    let onRestore: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text(t("group_editor.title"))
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Spacer()
                Button(action: onCancel) {
                    Image(systemName: "xmark")
                }
                .buttonStyle(.plain)
            }

            Picker("", selection: $selectedTab) {
                Text(t("group_editor.tab.create")).tag(SkillGroupEditorTab.create)
                Text(t("group_editor.tab.merge")).tag(SkillGroupEditorTab.merge)
                Text(t("group_editor.tab.restore")).tag(SkillGroupEditorTab.restore)
            }
            .pickerStyle(.segmented)

            switch selectedTab {
            case .create:
                createTab
            case .merge:
                mergeTab
            case .restore:
                restoreTab
            }
        }
        .padding(18)
        .background(AppTheme.cardFill(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var createTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField(t("group_editor.title"), text: $nameDraft)
                .textFieldStyle(.roundedBorder)
            sourceSkillPicker
            targetPicker
            Button(t("group_editor.action.save"), action: onCreate)
                .disabled(nameDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || selectedSkills.isEmpty)
        }
    }

    private var mergeTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField(t("group_editor.title"), text: $nameDraft)
                .textFieldStyle(.roundedBorder)
            ForEach(sourceOptions.filter { !$0.isVirtual }) { source in
                Toggle("\(source.title) (\(source.skillCount))", isOn: binding(forSourceId: source.id))
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(t("group_editor.impact.create_virtual_group"))
                Text(t("group_editor.impact.hide_groups"))
                Text(t("group_editor.impact.clear_bindings"))
                Text(t("group_editor.impact.save_restore_snapshot"))
            }
            .font(.system(size: 11))
            .foregroundStyle(AppTheme.textMuted(for: theme))
            targetPicker
            Button(t("group_editor.action.save"), action: onMerge)
                .disabled(nameDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || selectedMergeSourceIds.count < 2)
        }
    }

    private var restoreTab: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(sourceOptions.filter(\.isVirtual)) { source in
                HStack {
                    Text(source.title)
                    Spacer()
                    Button(t("group_editor.action.restore")) {
                        onRestore(source.id)
                    }
                }
            }
        }
    }

    private var sourceSkillPicker: some View {
        HStack(alignment: .top, spacing: 12) {
            ForEach(sourceOptions.filter { !$0.isVirtual }) { source in
                VStack(alignment: .leading, spacing: 6) {
                    Text(source.title)
                        .font(.system(size: 12, weight: .semibold))
                    ForEach(skillOptions(source.id)) { skill in
                        Toggle(skill.title, isOn: binding(forSkill: VirtualGroupSkillRef(sourceId: skill.sourceId, leafId: skill.leafId)))
                    }
                }
            }
        }
    }

    private var targetPicker: some View {
        HStack(spacing: 8) {
            ForEach(targetOptions) { target in
                Toggle(target.label, isOn: binding(forTarget: target.id))
            }
        }
    }

    private func binding(forSkill skill: VirtualGroupSkillRef) -> Binding<Bool> {
        Binding(
            get: { selectedSkills.contains(skill) },
            set: { isSelected in
                if isSelected { selectedSkills.insert(skill) } else { selectedSkills.remove(skill) }
            }
        )
    }

    private func binding(forSourceId sourceId: String) -> Binding<Bool> {
        Binding(
            get: { selectedMergeSourceIds.contains(sourceId) },
            set: { isSelected in
                if isSelected { selectedMergeSourceIds.insert(sourceId) } else { selectedMergeSourceIds.remove(sourceId) }
            }
        )
    }

    private func binding(forTarget targetId: String) -> Binding<Bool> {
        Binding(
            get: { selectedTargets.contains(targetId) },
            set: { isSelected in
                if isSelected { selectedTargets.insert(targetId) } else { selectedTargets.remove(targetId) }
            }
        )
    }
}
```

- [ ] **Step 8: Run UI-related tests**

Run:

```bash
cd apps/desktop-mac && swift test --filter DesktopLocalizationTests/testGroupEditorLocalizationKeysExist
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift apps/desktop-mac/Sources/DesktopApp/App/ActionIcon.swift apps/desktop-mac/Sources/DesktopApp/Resources/ActionIcons/group-editor.svg apps/desktop-mac/Sources/DesktopApp/Resources/en.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/zh-Hans.lproj/Localizable.strings apps/desktop-mac/Sources/DesktopApp/Resources/ja.lproj/Localizable.strings apps/desktop-mac/Tests/SkillFlowDesktopTests
git commit -m "feat: add skill group editor sheet"
```

---

### Task 8: Virtual Group Presentation And Source Type Filter

**Files:**
- Modify: `apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift`
- Modify: `apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift`
- Test: `apps/desktop-mac/Tests/SkillFlowDesktopTests/MainViewModelVirtualGroupTests.swift`

- [ ] **Step 1: Write failing filter test**

Add to `MainViewModelVirtualGroupTests.swift`:

```swift
func testVirtualHomeSourcePredicateMatchesVirtualCards() {
    let virtualCard = MainViewModel.GroupCardModel(
        id: "writing-stack",
        title: "Writing Stack",
        byline: nil,
        groupPath: nil,
        sourceKind: "virtual",
        sourceLocator: "virtual:writing-stack",
        isPinned: false,
        health: "HEALTHY",
        warningCount: 0,
        errorCount: 0,
        skillSelection: .none,
        targetSelection: .none,
        stats: MainViewModel.GroupCardStats(skillCount: 1, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
        skillsLoading: false,
        targetsLoading: false,
        skills: [],
        targets: [],
        saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
    )
    let gitCard = MainViewModel.GroupCardModel(
        id: "alpha",
        title: "Alpha",
        byline: nil,
        groupPath: nil,
        sourceKind: "git",
        sourceLocator: "https://example.com/alpha.git",
        isPinned: false,
        health: "HEALTHY",
        warningCount: 0,
        errorCount: 0,
        skillSelection: .none,
        targetSelection: .none,
        stats: MainViewModel.GroupCardStats(skillCount: 1, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil),
        skillsLoading: false,
        targetsLoading: false,
        skills: [],
        targets: [],
        saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
    )

    XCTAssertTrue(MainViewModel.isVirtualHomeSource(virtualCard))
    XCTAssertFalse(MainViewModel.isVirtualHomeSource(gitCard))
}
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
cd apps/desktop-mac && swift test --filter MainViewModelVirtualGroupTests/testVirtualHomeSourcePredicateMatchesVirtualCards
```

Expected: FAIL because `MainViewModel.isVirtualHomeSource` does not exist.

- [ ] **Step 3: Add virtual source filter**

In `MainViewModel.homeSourceTypeFilterOptions`, add:

```swift
HomeSidebarFilterOption(id: "virtual", count: cards.filter(Self.isVirtualHomeSource).count),
```

In `setSelectedHomeSourceTypeFilter`, include `"virtual"`:

```swift
selectedHomeSourceTypeFilterId = ["all", "local", "remote", "virtual"].contains(filterId) ? filterId : "all"
```

In `matchesHomeSidebarFilters`, add:

```swift
if selectedHomeSourceTypeFilterId == "virtual", !Self.isVirtualHomeSource(card) {
    return false
}
```

Add:

```swift
static func isVirtualHomeSource(_ card: GroupCardModel) -> Bool {
    card.sourceKind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "virtual"
}
```

- [ ] **Step 4: Display virtual label and source badges**

In `GroupCardSkill`, add:

```swift
let sourceTitle: String?
```

Update initializers to default `sourceTitle: nil`.

Add `sourceTitleByLeafId` to the `WorkflowSummary` parsing path by reading each leaf payload's `sourceTitle` string when present, defaulting to `nil` for ordinary source groups. When building `GroupCardSkill`, pass that mapped source title:

```swift
sourceTitle: leaf.sourceTitle
```

In `GroupCardComponents.swift`, render a small source title badge next to the skill label when `sourceTitle` exists:

```swift
if let sourceTitle = item.sourceTitle {
    Text(sourceTitle)
        .font(.system(size: 9, weight: .medium))
        .foregroundStyle(AppTheme.textMuted(for: theme))
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd apps/desktop-mac && swift test --filter MainViewModelVirtualGroupTests/testVirtualHomeSourcePredicateMatchesVirtualCards
cd apps/desktop-mac && swift test --filter GroupCardScaleTests
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop-mac/Sources/DesktopApp/ViewModels/MainViewModel.swift apps/desktop-mac/Sources/DesktopApp/Components/GroupCardComponents.swift apps/desktop-mac/Sources/DesktopApp/Screens/Home/MainView.swift apps/desktop-mac/Tests/SkillFlowDesktopTests
git commit -m "feat: show virtual groups in home filters"
```

---

### Task 9: End-To-End Verification

**Files:**
- Verification task only; source files are modified only when a verification failure is caused by virtual group changes.

- [ ] **Step 1: Run focused TypeScript tests**

Run:

```bash
npm --workspace @skill-flow/storage test -- --run packages/storage/src/tests/store.test.ts -t "virtual group"
npm --workspace @skill-flow/shared-types test -- --run packages/shared-types/src/tests/protocol.test.ts -t "virtual group"
npm --workspace @skill-flow/cli test -- --run apps/cli/src/tests/bridge-command.test.ts -t "virtual"
npm --workspace @skill-flow/query test -- --run packages/query/src/tests/virtual-groups.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run focused Swift tests**

Run:

```bash
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests/testCreateVirtualGroupSendsExpectedPayload
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests/testMergeGroupsSendsExpectedPayload
cd apps/desktop-mac && swift test --filter BridgeClientExecutionTests/testRestoreMergedGroupsSendsExpectedPayload
cd apps/desktop-mac && swift test --filter MainViewModelVirtualGroupTests
cd apps/desktop-mac && swift test --filter DesktopLocalizationTests/testGroupEditorLocalizationKeysExist
```

Expected: all PASS.

- [ ] **Step 3: Run broader package checks**

Run:

```bash
npm test
cd apps/desktop-mac && swift test
```

Expected: all PASS. When a failure occurs, record the failing test name and exact error message, then fix it when it is caused by virtual group changes.

- [ ] **Step 4: Manual desktop smoke check**

Run the desktop app from Xcode or the existing desktop launch workflow. Verify:

- Home header shows the group editor icon next to existing right-side buttons.
- Create tab can select skills from two groups and save a virtual group.
- Merge tab shows impact preview and hides source groups after save.
- Restore tab restores hidden source groups and removes the virtual group.
- Duplicate skill names produce an error and do not save.

- [ ] **Step 5: Commit no code**

This verification-only task does not create a commit. When a required fix is found, create a focused commit with only the changed files and the message `fix: stabilize skill group editor verification`.

---

## Self-Review

- Spec coverage: The plan covers virtual state, create, merge, restore, hiding, clearing bindings, restore snapshots, conflict blocking, bridge commands, desktop header entry, editor tabs, source badges, virtual filter, errors, and tests.
- Placeholder scan: No placeholder markers remain.
- Type consistency: Shared names are `VirtualGroupSkillRef`, `createVirtualGroup`, `mergeGroups`, `restoreMergedGroups`, and bridge command strings `create-virtual-group`, `merge-groups`, `restore-merged-groups` across TypeScript and Swift.

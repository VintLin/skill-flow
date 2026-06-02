import { describe, expect, test, vi } from "vitest";
import { SkillFlowApp } from "../runtime.js";
import {
  createRepo,
  pathExists,
  skillDoc,
  useSkillFlowSandbox,
} from "./test-helpers.js";

describe.sequential("virtual groups", () => {
  const sandbox = useSkillFlowSandbox();

  test("creates a virtual group from leafs across source groups without creating a checkout", async () => {
    const writingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/drafting/SKILL.md": skillDoc("drafting", "Draft writing."),
      "skills/outlining/SKILL.md": skillDoc("outlining", "Outline writing."),
    });
    const editingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/revision/SKILL.md": skillDoc("revision", "Revise writing."),
    });
    const app = new SkillFlowApp();
    const lockSpy = vi.spyOn(app.store, "withMutationLock");

    const writing = await app.addSource(writingRepo, { sourceIdOverride: "writing-source" });
    const editing = await app.addSource(editingRepo, { sourceIdOverride: "editing-source" });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    if (!writing.ok || !editing.ok) {
      return;
    }

    lockSpy.mockClear();
    const result = await app.createVirtualGroup({
      displayName: " Writing Stack ",
      skills: [
        {
          sourceId: "writing-source",
          leafId: "writing-source:skills/drafting",
        },
        {
          sourceId: "editing-source",
          leafId: "editing-source:skills/revision",
        },
        {
          sourceId: "writing-source",
          leafId: "writing-source:skills/drafting",
        },
      ],
      enabledTargets: ["codex", "codex", "cursor"],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(lockSpy).toHaveBeenCalledTimes(1);
    expect(result.data.group.id).toBe("writing-stack");
    expect(result.data.group.displayName).toBe("Writing Stack");
    expect(result.data.group.includedSkills).toEqual([
      { sourceId: "writing-source", leafId: "writing-source:skills/drafting" },
      { sourceId: "editing-source", leafId: "editing-source:skills/revision" },
    ]);

    const { manifest, lockFile } = await app.store.readState();
    expect(manifest.sources).toContainEqual({
      id: "writing-stack",
      locator: "virtual:writing-stack",
      kind: "virtual",
      displayName: "Writing Stack",
      originalDisplayName: "Writing Stack",
      addedAt: result.data.group.createdAt,
      selectionMode: "all",
    });
    expect(manifest.bindings["writing-stack"]).toEqual({
      selectedLeafIds: [
        "writing-source:skills/drafting",
        "editing-source:skills/revision",
      ],
      targets: {
        codex: {
          enabled: true,
          leafIds: [
            "writing-source:skills/drafting",
            "editing-source:skills/revision",
          ],
        },
        cursor: {
          enabled: true,
          leafIds: [
            "writing-source:skills/drafting",
            "editing-source:skills/revision",
          ],
        },
      },
    });
    expect(lockFile.sources.some((source) => source.id === "writing-stack")).toBe(false);
    expect(await pathExists(app.store.getSourceCheckoutPath("virtual", "writing-stack"))).toBe(false);

    const virtualGroups = await app.store.readVirtualGroups();
    expect(virtualGroups.groups["writing-stack"]).toEqual({
      id: "writing-stack",
      displayName: "Writing Stack",
      includedSkills: [
        { sourceId: "writing-source", leafId: "writing-source:skills/drafting" },
        { sourceId: "editing-source", leafId: "editing-source:skills/revision" },
      ],
      hiddenSourceIds: [],
      restoreSnapshots: {},
      createdAt: result.data.group.createdAt,
      updatedAt: result.data.group.updatedAt,
    });
  });

  test("keeps virtual group selected leafs after inspect normalizes bindings", async () => {
    const writingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/drafting/SKILL.md": skillDoc("drafting", "Draft writing."),
    });
    const editingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/revision/SKILL.md": skillDoc("revision", "Revise writing."),
    });
    const app = new SkillFlowApp();
    const writing = await app.addSource(writingRepo, { sourceIdOverride: "writing-source" });
    const editing = await app.addSource(editingRepo, { sourceIdOverride: "editing-source" });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    if (!writing.ok || !editing.ok) {
      return;
    }
    const leafIds = [
      "writing-source:skills/drafting",
      "editing-source:skills/revision",
    ];

    const created = await app.createVirtualGroup({
      displayName: "Writing Stack",
      skills: [
        { sourceId: "writing-source", leafId: leafIds[0]! },
        { sourceId: "editing-source", leafId: leafIds[1]! },
      ],
      enabledTargets: ["codex"],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const inspected = await app.inspectSource("writing-stack");

    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.binding.selectedLeafIds).toEqual(leafIds);

    const { manifest } = await app.store.readState();
    expect(manifest.bindings["writing-stack"]?.selectedLeafIds).toEqual(leafIds);
    expect(manifest.bindings["writing-stack"]?.targets.codex?.leafIds).toEqual(leafIds);
  });

  test("treats virtual group as a source-like group in summaries inspect and preview planning", async () => {
    const writingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/drafting/SKILL.md": skillDoc("drafting", "Draft writing."),
    });
    const editingRepo = await createRepo(sandbox.sandboxRoot, {
      "skills/revision/SKILL.md": skillDoc("revision", "Revise writing."),
    });
    const app = new SkillFlowApp();
    const writing = await app.addSource(writingRepo, {
      sourceIdOverride: "writing-source",
      project: false,
    });
    const editing = await app.addSource(editingRepo, {
      sourceIdOverride: "editing-source",
      project: false,
    });
    expect(writing.ok).toBe(true);
    expect(editing.ok).toBe(true);
    if (!writing.ok || !editing.ok) {
      return;
    }
    const leafIds = [
      "writing-source:skills/drafting",
      "editing-source:skills/revision",
    ];

    const created = await app.createVirtualGroup({
      displayName: "Writing Stack",
      skills: [
        { sourceId: "writing-source", leafId: leafIds[0]! },
        { sourceId: "editing-source", leafId: leafIds[1]! },
      ],
      enabledTargets: [],
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      return;
    }

    const listed = await app.listWorkflows();
    expect(listed.ok).toBe(true);
    if (!listed.ok) {
      return;
    }
    const summary = listed.data.summaries.find((item) => item.source.id === "writing-stack");
    expect(summary?.leafs.map((leaf) => leaf.id)).toEqual(leafIds);
    expect(summary?.health).not.toBe("BLOCKED");

    const inspected = await app.inspectSource("writing-stack");
    expect(inspected.ok).toBe(true);
    if (!inspected.ok) {
      return;
    }
    expect(inspected.data.leafs.map((leaf) => leaf.id)).toEqual(leafIds);

    const preview = await app.previewDraft("writing-stack", {
      selectedLeafIds: leafIds,
      enabledTargets: ["codex"],
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok) {
      return;
    }
    const plannedLeafIds = preview.data.plan.actions
      .filter((action) => action.target === "codex")
      .map((action) => action.leafId)
      .sort();
    expect(plannedLeafIds).toEqual([...leafIds].sort());
  });

  test("rejects empty virtual group name", async () => {
    const app = new SkillFlowApp();

    const result = await app.createVirtualGroup({
      displayName: "   ",
      skills: [{ sourceId: "source", leafId: "source:skill" }],
      enabledTargets: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("VIRTUAL_GROUP_NAME_EMPTY");
  });

  test("rejects empty virtual group skills", async () => {
    const app = new SkillFlowApp();

    const result = await app.createVirtualGroup({
      displayName: "Writing Stack",
      skills: [],
      enabledTargets: [],
    });

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.code).toBe("VIRTUAL_GROUP_SKILLS_EMPTY");
  });
});

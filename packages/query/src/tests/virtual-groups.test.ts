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

import { describe, expect, test } from "vitest";
import type { LeafSummaryRecord } from "@skill-flow/domain/types";
import {
  ALL_AGENTS_CHOICE_ID,
  ALL_SKILLS_CHOICE_ID,
  areAllSelected,
  buildDefaultSelectedLeafIds,
  buildInitialDraft,
  normalizeRequestedPath,
  resolveRequestedLeafIds,
  toggleAllSelections,
  withAllChoice,
} from "../add-flow-model.js";

function createLeaf(params: {
  id: string;
  name: string;
  linkName?: string;
  relativePath: string;
}): LeafSummaryRecord {
  return {
    id: params.id,
    sourceId: "demo-source",
    name: params.name,
    linkName: params.linkName ?? params.name,
    title: params.name,
    description: `${params.name} description`,
    relativePath: params.relativePath,
    absolutePath: `/tmp/${params.relativePath}`,
    skillFilePath: `/tmp/${params.relativePath}/SKILL.md`,
    contentHash: params.id,
    metadataWarnings: [],
    valid: true,
  };
}

describe("add flow model", () => {
  test("normalizes requested paths and treats '.' as full selection", () => {
    expect(normalizeRequestedPath("./skills/find-skills/")).toBe("skills/find-skills");
    expect(normalizeRequestedPath(".")).toBeUndefined();
  });

  test("builds default selected leaf ids from requested path", () => {
    const leafs = [
      createLeaf({ id: "a", name: "find-skills", relativePath: "skills/find-skills" }),
      createLeaf({ id: "b", name: "review", relativePath: "skills/review" }),
    ];

    expect(buildDefaultSelectedLeafIds(leafs, "./skills/find-skills/")).toEqual(["a"]);
  });

  test("resolves --skill selectors by relativePath before linkName and name", () => {
    const leafs = [
      createLeaf({
        id: "a",
        name: "review",
        linkName: "repo-review",
        relativePath: "skills/review",
      }),
      createLeaf({
        id: "b",
        name: "review",
        linkName: "review",
        relativePath: "nested/review",
      }),
    ];

    expect(resolveRequestedLeafIds(leafs, ["skills/review"])).toEqual({
      ok: true,
      value: ["a"],
    });
    expect(resolveRequestedLeafIds(leafs, ["repo-review"])).toEqual({
      ok: true,
      value: ["a"],
    });
  });

  test("rejects ambiguous --skill selectors when linkName or name are duplicated", () => {
    const leafs = [
      createLeaf({ id: "a", name: "review", relativePath: "skills/review" }),
      createLeaf({ id: "b", name: "review", relativePath: "nested/review" }),
    ];

    const result = resolveRequestedLeafIds(leafs, ["review"]);
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toContain("ambiguous");
    expect(result.message).toContain("relative path");
  });

  test("does not use title as a --skill selector", () => {
    const leafs = [
      {
        ...createLeaf({ id: "a", name: "review", relativePath: "skills/review" }),
        title: "Review Code",
      },
    ];

    const result = resolveRequestedLeafIds(leafs, ["Review Code"]);
    expect(result.ok).toBe(false);
  });

  test("buildInitialDraft uses explicit skills and agents when provided", () => {
    const leafs = [
      createLeaf({ id: "a", name: "find-skills", relativePath: "skills/find-skills" }),
      createLeaf({ id: "b", name: "review", relativePath: "skills/review" }),
    ];

    const result = buildInitialDraft(leafs, ["claude-code", "codex"], {
      requestedSkills: ["skills/review"],
      requestedAgents: ["codex"],
    });

    expect(result).toEqual({
      ok: true,
      value: {
        selectedLeafIds: ["b"],
        enabledTargets: ["codex"],
      },
    });
  });

  test("prepends all-choice rows and toggles full selection", () => {
    const choices = withAllChoice(
      [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
      "All skills",
      ALL_SKILLS_CHOICE_ID,
    );

    expect(choices[0]).toEqual({ id: ALL_SKILLS_CHOICE_ID, label: "All skills" });
    expect(areAllSelected(["a"], ["a", "b"])).toBe(false);
    expect(areAllSelected(["a", "b"], ["a", "b"])).toBe(true);
    expect(toggleAllSelections([], ["a", "b"])).toEqual(["a", "b"]);
    expect(toggleAllSelections(["a", "b"], ["a", "b"])).toEqual([]);
    expect(withAllChoice([], "All agents", ALL_AGENTS_CHOICE_ID)[0]?.id).toBe(
      ALL_AGENTS_CHOICE_ID,
    );
  });
});

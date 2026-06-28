import { describe, expect, test } from "vitest";
import type { WorkflowSummary } from "@skill-flow/domain/types";
import { filterAddWarnings, resolveAddSourceLocator } from "@skill-flow/integration/utils/cli";
import { formatWorkflowList } from "@skill-flow/integration/utils/format";

describe("cli utils", () => {
  test("leaves direct source locators unchanged without a catalog override", () => {
    expect(resolveAddSourceLocator("JimLiu/baoyu-skills")).toBe("JimLiu/baoyu-skills");
  });

  test("maps --from clawhub sources to clawhub locators", () => {
    expect(resolveAddSourceLocator("find-skills-skill", "clawhub")).toBe(
      "clawhub:find-skills-skill",
    );
    expect(resolveAddSourceLocator("clawhub:find-skills-skill", "clawhub")).toBe(
      "clawhub:find-skills-skill",
    );
  });

  test("rejects unsupported source catalogs", () => {
    expect(() => resolveAddSourceLocator("find-skills-skill", "github")).toThrow(
      "Unsupported source catalog 'github'.",
    );
  });

  test("filters generated duplicate add warnings but keeps other warnings", () => {
    expect(
      filterAddWarnings([
        ".agents/skills/adapt: Duplicate skill content skipped because source/skills/adapt was discovered first",
        ".codex/skills/animate: Duplicate skill content skipped because source/skills/animate was discovered first",
        "source/skills/broken: Missing title",
      ]),
    ).toEqual([
      "source/skills/broken: Missing title",
    ]);
  });

  test("formatWorkflowList can show ids and warnings", () => {
    const output = formatWorkflowList([
      makeWorkflowSummary({
        displayName: "action-browser@vintlin",
        sourceId: "vintlin-action-browser",
        health: "PARTIAL",
        warningMessages: ["unmanaged external content in codex target"],
      }),
    ], { showIds: true, showWarnings: true });

    expect(output).toContain("action-browser@vintlin");
    expect(output).toContain("vintlin-action-browser");
    expect(output).toContain("warning: unmanaged external content in codex target");
  });

  test("formatWorkflowList default output preserves compact summary format", () => {
    const output = formatWorkflowList([
      makeWorkflowSummary({
        displayName: "action-browser@vintlin",
        sourceId: "vintlin-action-browser",
        health: "PARTIAL",
        warningMessages: ["unmanaged external content in codex target"],
      }),
    ]);

    expect(output).toBe(
      "action-browser@vintlin@local  PARTIAL  1 skills  0 targets, 1 warnings",
    );
    expect(output).not.toContain("  vintlin-action-browser  ");
    expect(output).not.toContain("warning: unmanaged external content in codex target");
  });
});

function makeWorkflowSummary(options: {
  displayName: string;
  sourceId: string;
  health: WorkflowSummary["health"];
  warningMessages: string[];
}): WorkflowSummary {
  return {
    source: {
      id: options.sourceId,
      locator: `file://${options.sourceId}`,
      kind: "local",
      displayName: options.displayName,
      originalDisplayName: options.displayName,
      addedAt: "2026-06-26T00:00:00.000Z",
    },
    lock: undefined,
    leafs: [
      {
        id: `${options.sourceId}:browse`,
        sourceId: options.sourceId,
        name: "browse",
        linkName: "browse",
        title: "browse",
        description: "Browse flow.",
        relativePath: "browse",
        absolutePath: `/tmp/${options.sourceId}/browse`,
        skillFilePath: `/tmp/${options.sourceId}/browse/SKILL.md`,
        contentHash: "hash",
        metadataWarnings: options.warningMessages,
        valid: true,
      },
    ],
    bindings: {
      selectedLeafIds: [],
      resolvedSelectedLeafCount: 1,
      targets: {},
    },
    activeTargetCount: 0,
    health: options.health,
  };
}

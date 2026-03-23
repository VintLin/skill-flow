import { describe, expect, test } from "vitest";
import type { DraftBinding, WorkflowSummary } from "../domain/types.js";
import {
  buildDraftsFromSummaries,
  buildProjectionWarningMap,
  buildTopBar,
  captureFocusSnapshot,
  draftsEqual,
  getInitialDetailFocus,
  getNextSelectionIndexAfterDelete,
  getPaneViewportCount,
  getPaneWidths,
  getRequestedAction,
  getStatusDisplay,
  moveDetailFocus,
  prioritizeAlerts,
  reconcileFocusAfterReload,
} from "../tui/config-app.js";
import {
  getParentSelectionState,
  toggleChild,
  toggleParent,
  type TreeSelectionState,
} from "../tui/selection-state.js";

describe("config ui utils", () => {
  test("selection state machine handles parent child partial transitions", () => {
    let state: TreeSelectionState = {
      allLeafIds: ["a", "b"],
      selectedLeafIds: [],
    };

    expect(getParentSelectionState(state)).toBe("empty");
    state = toggleChild(state, "a");
    expect(getParentSelectionState(state)).toBe("partial");
    state = toggleParent(state);
    expect(getParentSelectionState(state)).toBe("full");
    state = toggleChild(state, "b");
    expect(getParentSelectionState(state)).toBe("partial");
  });

  test("top bar and status helpers follow the v1.1.1 contract", () => {
    expect(
      draftsEqual(
        {
          enabledTargets: ["codex", "claude-code"],
          selectedLeafIds: ["b", "a"],
        },
        {
          enabledTargets: ["claude-code", "codex"],
          selectedLeafIds: ["a", "b"],
        },
      ),
    ).toBe(true);
    expect(getPaneViewportCount(16, 1)).toBe(10);
    expect(getPaneWidths(100).reduce((sum, width) => sum + width, 0)).toBeLessThanOrEqual(99);
    expect(
      buildTopBar({
        width: 120,
        isDirty: true,
        changeCount: 3,
        statusLabel: "Saved",
      }),
    ).toContain("Changes: 3");
    expect(
      buildTopBar({
        width: 90,
        isDirty: false,
        changeCount: 3,
        statusLabel: "Saved",
      }),
    ).not.toContain("Changes:");

    expect(
      getStatusDisplay({
        deleteState: {
          phase: "deleting",
          sourceId: "alpha",
          message: undefined,
        },
        isSelectedDelete: true,
        saveState: { phase: "saving", message: undefined },
        updateState: { phase: "failed", message: "boom" },
      }).label,
    ).toBe("Deleting");
    expect(
      getStatusDisplay({
        deleteState: {
          phase: "idle",
          sourceId: undefined,
          message: undefined,
        },
        isSelectedDelete: false,
        saveState: { phase: "failed", message: "boom" },
        updateState: { phase: "updated", message: undefined },
      }).label,
    ).toBe("Failed");
  });

  test("alerts are prioritized error before blocked before warning", () => {
    const alerts = prioritizeAlerts([
      { level: "warning", message: "rename warning" },
      { level: "blocked", message: "target path blocked" },
      { level: "error", message: "update failed" },
      { level: "warning", message: "rename warning" },
    ]);

    expect(alerts).toEqual([
      { level: "error", message: "update failed" },
      { level: "blocked", message: "target path blocked" },
    ]);
  });

  test("detail focus enters agents first and skips empty sections", () => {
    expect(getInitialDetailFocus({ hasAgents: true, hasSkills: true })).toBe("detail.agents");
    expect(getInitialDetailFocus({ hasAgents: false, hasSkills: true })).toBe("detail.skills");
    expect(getInitialDetailFocus({ hasAgents: false, hasSkills: false })).toBe("detail.actions");

    expect(
      moveDetailFocus({
        actionCursor: 0,
        agentCount: 2,
        agentCursor: 1,
        direction: 1,
        focus: "detail.agents",
        skillCount: 3,
        skillCursor: 0,
      }),
    ).toMatchObject({
      focus: "detail.skills",
      skillCursor: 0,
    });

    expect(
      moveDetailFocus({
        actionCursor: 0,
        agentCount: 0,
        agentCursor: 0,
        direction: -1,
        focus: "detail.actions",
        skillCount: 0,
        skillCursor: 0,
      }),
    ).toMatchObject({
      focus: "detail.actions",
      actionCursor: 0,
    });
  });

  test("keyboard action resolution keeps d and action enter equivalent", () => {
    expect(
      getRequestedAction({
        actionCursor: 0,
        focus: "groups",
        input: "d",
        keyReturn: false,
      }),
    ).toBe("delete");
    expect(
      getRequestedAction({
        actionCursor: 1,
        focus: "detail.actions",
        input: "",
        keyReturn: true,
      }),
    ).toBe("delete");
    expect(
      getRequestedAction({
        actionCursor: 0,
        focus: "detail.actions",
        input: "",
        keyReturn: true,
      }),
    ).toBe("update");
  });

  test("focus reconciliation preserves section and falls back to the first surviving item", () => {
    const nextSummaries = [
      createSummary({
        sourceId: "alpha",
        leafIds: ["alpha:browse", "alpha:review"],
      }),
    ];

    const snapshot = captureFocusSnapshot({
      actionCursor: 0,
      agentCursor: 1,
      availableTargets: ["claude-code", "codex"],
      focus: "detail.skills",
      selectedGroupIndex: 0,
      selectedSummary: createSummary({
        sourceId: "alpha",
        leafIds: ["alpha:browse", "alpha:slides"],
      }),
      skillCursor: 2,
    });

    expect(
      reconcileFocusAfterReload({
        availableTargets: ["claude-code", "codex"],
        nextSummaries,
        snapshot,
      }),
    ).toMatchObject({
      focus: "detail.skills",
      skillCursor: 0,
      selectedGroupIndex: 0,
    });
  });

  test("focus reconciliation falls back to the nearest remaining group after update removal", () => {
    const snapshot = captureFocusSnapshot({
      actionCursor: 1,
      agentCursor: 0,
      availableTargets: ["claude-code"],
      focus: "detail.actions",
      selectedGroupIndex: 1,
      selectedSummary: createSummary({
        sourceId: "beta",
        leafIds: ["beta:browse"],
      }),
      skillCursor: 0,
    });

    expect(
      reconcileFocusAfterReload({
        availableTargets: ["claude-code"],
        nextSummaries: [
          createSummary({
            sourceId: "alpha",
            leafIds: ["alpha:browse"],
          }),
        ],
        snapshot,
      }),
    ).toMatchObject({
      focus: "detail.actions",
      selectedGroupIndex: 0,
      actionCursor: 1,
    });
  });

  test("delete selection falls back to the nearest remaining group", () => {
    expect(getNextSelectionIndexAfterDelete(2, 2)).toBe(1);
    expect(getNextSelectionIndexAfterDelete(0, 0)).toBe(-1);
  });

  test("buildDraftsFromSummaries normalizes enabled targets and leaf ids", () => {
    const drafts = buildDraftsFromSummaries([
      {
        ...createSummary({
          sourceId: "alpha",
          leafIds: ["alpha:browse", "alpha:review"],
        }),
        bindings: {
          targets: {
            codex: {
              enabled: true,
              leafIds: ["alpha:review", "alpha:browse"],
            },
            "claude-code": {
              enabled: true,
              leafIds: ["alpha:browse"],
            },
          },
        },
      },
    ]);

    expect(drafts.alpha).toEqual<DraftBinding>({
      enabledTargets: ["claude-code", "codex"],
      selectedLeafIds: ["alpha:browse", "alpha:review"],
    });
  });

  test("projection warning helper marks identical cross-group skills as skipped", () => {
    const warnings = buildProjectionWarningMap({
      drafts: {
        alpha: { enabledTargets: ["claude-code"], selectedLeafIds: ["alpha:browse"] },
        beta: { enabledTargets: ["claude-code"], selectedLeafIds: ["beta:browse"] },
      },
      summaries: [
        createSummary({
          sourceId: "alpha",
          leafIds: ["alpha:browse"],
          descriptions: { "alpha:browse": "Browser flow." },
        }),
        createSummary({
          sourceId: "beta",
          leafIds: ["beta:browse"],
          descriptions: { "beta:browse": "Browser flow." },
        }),
      ],
      sourceId: "beta",
    });

    expect(warnings["beta:browse"]?.[0]).toContain("will be skipped");
  });

  test("projection warning helper marks cross-group name collisions as renamed", () => {
    const warnings = buildProjectionWarningMap({
      drafts: {
        alpha: { enabledTargets: ["claude-code"], selectedLeafIds: ["alpha:browse"] },
        beta: { enabledTargets: ["claude-code"], selectedLeafIds: ["beta:browse"] },
      },
      summaries: [
        createSummary({
          sourceId: "alpha",
          leafIds: ["alpha:browse"],
          descriptions: { "alpha:browse": "Browser flow A." },
        }),
        createSummary({
          sourceId: "beta",
          leafIds: ["beta:browse"],
          descriptions: { "beta:browse": "Browser flow B." },
        }),
      ],
      sourceId: "beta",
    });

    expect(warnings["beta:browse"]?.[0]).toContain("will deploy as");
  });
});

function createSummary({
  sourceId,
  leafIds,
  descriptions = {},
}: {
  sourceId: string;
  leafIds: string[];
  descriptions?: Record<string, string>;
}): WorkflowSummary {
  return {
    source: {
      id: sourceId,
      locator: sourceId,
      kind: "git",
      displayName: sourceId,
      addedAt: "",
    },
    lock: undefined,
    bindings: { targets: {} },
    activeTargetCount: 0,
    health: "ACTIVE",
    leafs: leafIds.map((leafId) => {
      const name = leafId.split(":")[1] ?? leafId;
      return {
        id: leafId,
        sourceId,
        name,
        linkName: name,
        title: name,
        description: descriptions[leafId] ?? `${name} description`,
        relativePath: name,
        absolutePath: `/tmp/${sourceId}/${name}`,
        skillFilePath: `/tmp/${sourceId}/${name}/SKILL.md`,
        contentHash: leafId,
        metadataWarnings: [],
        valid: true as const,
      };
    }),
  };
}

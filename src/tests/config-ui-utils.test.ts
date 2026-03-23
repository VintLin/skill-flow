import { describe, expect, test } from "vitest";
import type { DraftBinding, WorkflowSummary } from "../domain/types.js";
import {
  buildActionRows,
  buildDetailMetadataRows,
  buildDraftsFromSummaries,
  buildConfigGroupSkillRows,
  buildConfigGroups,
  buildProjectionWarningMap,
  buildScrollableRows,
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

  test("top bar and status helpers only show actionable top bar context", () => {
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
        showDelete: true,
        statusLabel: "Saved",
      }),
    ).toMatchObject({
      title: "Skill Flow",
      detail: "Changes: 3",
    });
    expect(
      buildTopBar({
        width: 120,
        isDirty: true,
        changeCount: 3,
        showDelete: true,
        statusLabel: "Saved",
      }),
    ).toMatchObject({
      title: "Skill Flow",
    });
    expect(
      buildTopBar({
        width: 120,
        isDirty: true,
        changeCount: 3,
        showDelete: true,
        statusLabel: "Saved",
      }).detailColor,
    ).toBeUndefined();
    expect(
      buildTopBar({
        width: 120,
        isDirty: true,
        changeCount: 3,
        showDelete: true,
        statusLabel: "Saved",
      }),
    ).toMatchObject({
      titleColor: "blue",
    });
    expect(
      buildTopBar({
        width: 120,
        isDirty: true,
        changeCount: 3,
        showDelete: true,
        statusLabel: "Saved",
      }),
    ).toMatchObject({
      title: "Skill Flow",
    });
    expect(
      buildTopBar({
        width: 120,
        isDirty: true,
        changeCount: 3,
        showDelete: true,
        statusLabel: "Saved",
      }),
    ).toMatchObject({
      detail: "Changes: 3",
    });
    expect(
      buildTopBar({
        width: 90,
        isDirty: false,
        changeCount: 3,
        showDelete: false,
        statusLabel: "Saved",
      }),
    ).toMatchObject({
      detail: "Changes: 3",
    });
    expect(
      buildTopBar({
        width: 120,
        isDirty: false,
        changeCount: 0,
        showDelete: false,
        statusLabel: "Clean",
      }),
    ).toMatchObject({
      title: "Skill Flow",
    });
    expect(
      buildTopBar({
        width: 120,
        isDirty: false,
        changeCount: 0,
        showDelete: false,
        statusLabel: "Clean",
      }).detail,
    ).toBeUndefined();
    expect(
      buildTopBar({
        width: 120,
        isDirty: false,
        changeCount: 0,
        showDelete: false,
        statusLabel: "Clean",
      }).detailColor,
    ).toBeUndefined();
    expect(
      buildTopBar({
        width: 120,
        isDirty: false,
        changeCount: 0,
        showDelete: false,
        statusLabel: "Saving",
      }),
    ).toMatchObject({
      detail: "Status: Saving",
      detailColor: "cyan",
    });
    expect(
      buildTopBar({
        width: 120,
        isDirty: false,
        changeCount: 0,
        showDelete: false,
        statusLabel: "Failed",
      }),
    ).toMatchObject({
      detail: "Status: Failed",
      detailColor: "red",
    });

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
        actionCount: 2,
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
        actionCount: 1,
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
        canDelete: true,
        focus: "groups",
        input: "d",
        keyReturn: false,
      }),
    ).toBe("delete");
    expect(
      getRequestedAction({
        actionCursor: 1,
        canDelete: false,
        focus: "detail.actions",
        input: "",
        keyReturn: true,
      }),
    ).toBe("update");
    expect(
      getRequestedAction({
        actionCursor: 0,
        canDelete: true,
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
      groupId: "alpha",
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
        nextGroups: buildConfigGroups(nextSummaries),
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
      groupId: "beta",
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
        nextGroups: buildConfigGroups([
          createSummary({
            sourceId: "alpha",
            leafIds: ["alpha:browse"],
          }),
        ]),
        snapshot,
      }),
    ).toMatchObject({
      focus: "detail.actions",
      selectedGroupIndex: 0,
      actionCursor: 1,
    });
  });

  test("buildConfigGroups folds clawhub sources into one view group", () => {
    const groups = buildConfigGroups([
      createSummary({ sourceId: "alpha", leafIds: ["alpha:browse"] }),
      createSummary({ sourceId: "beta", kind: "clawhub", leafIds: ["beta:summary"] }),
      createSummary({ sourceId: "gamma", kind: "clawhub", leafIds: ["gamma:review"] }),
      createSummary({ sourceId: "delta", leafIds: ["delta:slides"] }),
    ]);

    expect(groups.map((group) => group.title)).toEqual([
      "alpha",
      "ClawHub Skills",
      "delta",
    ]);
    expect(groups[1]?.kind).toBe("clawhub");
    expect(groups[1]?.summaries.map((summary) => summary.source.id)).toEqual(["beta", "gamma"]);
    expect(buildConfigGroupSkillRows(groups[1]!).map((row) => row.summary.source.id)).toEqual([
      "beta",
      "gamma",
    ]);
  });

  test("buildActionRows hides delete for clawhub aggregate detail", () => {
    const rows = buildActionRows({
      actionCursor: 0,
      canRunActions: true,
      deleteState: {
        phase: "idle",
        sourceId: undefined,
        message: undefined,
      },
      focus: "detail.actions",
      isSelectedDelete: false,
      showDeleteAction: false,
      updateState: { phase: "idle", message: undefined },
    });

    expect(rows.map((row) => row.key)).toEqual(["__actions_separator__", "__action_update__"]);
  });

  test("buildDetailMetadataRows hides clean-state status noise", () => {
    const rows = buildDetailMetadataRows({
      alerts: [],
      detailWidth: 80,
      group: buildConfigGroups([createSummary({ sourceId: "alpha", leafIds: ["alpha:browse"] })])[0]!,
      summary: createSummary({ sourceId: "alpha", leafIds: ["alpha:browse"] }),
    });

    expect(rows.map((row) => row.key)).toEqual(["__title__", "__source__"]);
  });

  test("buildDetailMetadataRows never shows status/save/preview rows", () => {
    const rows = buildDetailMetadataRows({
      alerts: [],
      detailWidth: 80,
      group: buildConfigGroups([createSummary({ sourceId: "alpha", leafIds: ["alpha:browse"] })])[0]!,
      summary: createSummary({ sourceId: "alpha", leafIds: ["alpha:browse"] }),
    });

    expect(rows.map((row) => row.key)).toEqual(["__title__", "__source__"]);
  });

  test("buildDetailMetadataRows describes clawhub aggregate detail as a group", () => {
    const group = buildConfigGroups([
      createSummary({ sourceId: "beta", kind: "clawhub", leafIds: ["beta:summary"] }),
      createSummary({ sourceId: "gamma", kind: "clawhub", leafIds: ["gamma:review"] }),
    ])[0]!;
    const rows = buildDetailMetadataRows({
      alerts: [],
      detailWidth: 80,
      group,
      summary: group.summaries[0]!,
    });

    expect(rows.find((row) => row.key === "__source__")?.text).toContain("2 clawhub sources");
    expect(rows.find((row) => row.key === "__focused_source__")?.text).toContain("beta@clawhub");
  });

  test("buildScrollableRows adds up/down hints when content is clipped", () => {
    const rows = buildScrollableRows(
      Array.from({ length: 8 }, (_, index) => ({
        key: `row-${index}`,
        text: `row ${index}`,
        active: false,
        color: undefined,
      })),
      4,
      4,
      "skills",
    );

    expect(rows.rows[0]?.key).toBe("__scroll_up__:skills");
    expect(rows.rows.at(-1)?.key).toBe("__scroll_down__:skills");
  });

  test("buildScrollableRows can reserve blank hint slots without overflow", () => {
    const rows = buildScrollableRows(
      Array.from({ length: 2 }, (_, index) => ({
        key: `row-${index}`,
        text: `row ${index}`,
        active: false,
        color: undefined,
      })),
      0,
      4,
      "skills",
      true,
    );

    expect(rows.rows[0]).toMatchObject({ key: "__scroll_up__:skills", text: "" });
    expect(rows.rows.at(-1)).toMatchObject({ key: "__scroll_down__:skills", text: "" });
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
  kind = "git",
  descriptions = {},
}: {
  sourceId: string;
  leafIds: string[];
  kind?: "git" | "clawhub";
  descriptions?: Record<string, string>;
}): WorkflowSummary {
  return {
    source: {
      id: sourceId,
      locator: sourceId,
      kind,
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

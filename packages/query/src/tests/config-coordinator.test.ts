import { describe, expect, test, vi } from "vitest";
import type {
  DoctorReport,
  DraftBinding,
  LockFile,
  Manifest,
  WorkflowSummary,
  VirtualGroupsState,
} from "@skill-flow/domain/types";
import { ConfigCoordinator } from "../config-coordinator.js";

const manifest: Manifest = {
  schemaVersion: 1,
  sources: [
    {
      id: "alpha",
      locator: "/tmp/alpha",
      kind: "local",
      displayName: "alpha",
      addedAt: "2026-03-23T00:00:00.000Z",
    },
    {
      id: "beta",
      locator: "/tmp/beta",
      kind: "local",
      displayName: "beta",
      addedAt: "2026-03-23T00:00:00.000Z",
    },
  ],
  bindings: {
    alpha: {
      targets: {
        codex: {
          enabled: true,
          leafIds: ["alpha:browse"],
        },
      },
    },
    beta: {
      targets: {},
    },
  },
};

const lockFile: LockFile = {
  schemaVersion: 1,
  sources: [],
  leafInventory: [
    {
      id: "alpha:browse",
      sourceId: "alpha",
      name: "browse",
      linkName: "browse",
      title: "browse",
      description: "Browse things.",
      relativePath: "browse",
      absolutePath: "/tmp/alpha/browse",
      skillFilePath: "/tmp/alpha/browse/SKILL.md",
      contentHash: "hash-alpha",
      metadataWarnings: [],
      valid: true,
    },
  ],
  deployments: [],
};

const audit: DoctorReport = {
  status: "HEALTHY",
  issues: [],
};

const emptyVirtualGroups: VirtualGroupsState = {
  schemaVersion: 1,
  groups: {},
};

const summaries: WorkflowSummary[] = [
  {
    source: manifest.sources[0]!,
    lock: undefined,
    leafs: [lockFile.leafInventory[0]!],
    bindings: manifest.bindings.alpha!,
    activeTargetCount: 1,
    health: "ACTIVE",
    issueCounts: { warning: 0, error: 0 },
  },
  {
    source: manifest.sources[1]!,
    lock: undefined,
    leafs: [],
    bindings: manifest.bindings.beta!,
    activeTargetCount: 0,
    health: "INACTIVE",
    issueCounts: { warning: 0, error: 0 },
  },
];

describe("ConfigCoordinator", () => {
  test("boots config and derives initial drafts from normalized summaries", async () => {
    const initialPreferences = {
      schemaVersion: 1,
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" as const },
      recentProjects: [],
      projectDrafts: {},
    };
    const refreshedPreferences = {
      ...initialPreferences,
      recentProjects: [
        {
          projectId: "acme/skill-flow",
          title: "Skill Flow",
          lastActivityAt: "2026-03-30T00:00:00.000Z",
          tools: ["codex"],
        },
      ],
    };

    const coordinator = new ConfigCoordinator({
      store: {
        init: vi.fn().mockResolvedValue(undefined),
        readManifest: vi.fn(),
        readPreferences: vi
          .fn()
          .mockResolvedValueOnce(initialPreferences)
          .mockResolvedValueOnce(refreshedPreferences),
        readVirtualGroups: vi.fn().mockResolvedValue(emptyVirtualGroups),
        writePreferences: vi.fn().mockResolvedValue(undefined),
      },
      recentProjectService: {
        listRecentProjects: vi.fn().mockResolvedValue(refreshedPreferences.recentProjects),
      },
      doctorService: {
        run: vi.fn().mockResolvedValue({ ok: true, data: audit, warnings: [], errors: [] }),
      },
      workflowService: {
        getSummaries: vi.fn().mockReturnValue(summaries),
      },
      getAvailableTargets: vi.fn().mockResolvedValue(["codex"]),
      pruneMissingCheckouts: vi.fn().mockResolvedValue({
        ok: true,
        data: { removedSourceIds: [] },
        warnings: [],
        errors: [],
      }),
      getConfigData: vi.fn().mockResolvedValue({
        ok: true,
        data: { manifest, lockFile, summaries },
        warnings: [],
        errors: [],
      }),
    });

    const result = await coordinator.bootstrapWorkspaceState();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.bootStatus).toEqual({
      phase: "success",
      updatedSourceIds: [],
      failedSources: [],
    });
    expect(result.data.initialDrafts).toEqual<Record<string, DraftBinding>>({
      alpha: {
        enabledTargets: ["codex"],
        selectedLeafIds: ["alpha:browse"],
      },
      beta: {
        enabledTargets: [],
        selectedLeafIds: [],
      },
    });
    expect(result.data.recentProjects[0]?.projectId).toBe("acme/skill-flow");
    expect(result.data.selectedProjectScope).toEqual({ kind: "global" });
    expect(result.data.projectDrafts).toEqual({});
  });

  test("keeps config boot usable when prune removes missing groups", async () => {
    const onEvent = vi.fn();
    const preferences = {
      schemaVersion: 1,
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" as const },
      recentProjects: [],
      projectDrafts: {},
    };
    const coordinator = new ConfigCoordinator({
      store: {
        init: vi.fn().mockResolvedValue(undefined),
        readManifest: vi.fn(),
        readPreferences: vi.fn().mockResolvedValue(preferences),
        readVirtualGroups: vi.fn().mockResolvedValue(emptyVirtualGroups),
        writePreferences: vi.fn().mockResolvedValue(undefined),
      },
      recentProjectService: {
        listRecentProjects: vi.fn().mockResolvedValue([]),
      },
      doctorService: {
        run: vi.fn().mockResolvedValue({ ok: true, data: audit, warnings: [], errors: [] }),
      },
      workflowService: {
        getSummaries: vi.fn().mockReturnValue(summaries),
      },
      getAvailableTargets: vi.fn().mockResolvedValue(["codex"]),
      pruneMissingCheckouts: vi.fn().mockResolvedValue({
        ok: true,
        data: { removedSourceIds: ["beta"] },
        warnings: [],
        errors: [],
      }),
      getConfigData: vi.fn().mockResolvedValue({
        ok: true,
        data: { manifest, lockFile, summaries },
        warnings: [],
        errors: [],
      }),
    });

    const result = await coordinator.bootstrapWorkspaceState(onEvent);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.bootStatus).toEqual({
      phase: "success",
      updatedSourceIds: [],
      failedSources: [],
    });
    expect(onEvent).toHaveBeenCalledWith({
      phase: "refresh-sources",
      level: "warning",
      message: "Removed 1 missing group from config state.",
    });
  });

  test("restores selected skills from binding even when enabled targets are empty", async () => {
    const summariesWithLocalOnly: WorkflowSummary[] = [
      {
        ...summaries[0]!,
        bindings: {
          selectedLeafIds: ["alpha:browse"],
          targets: {},
        },
        activeTargetCount: 0,
        health: "INACTIVE",
      },
    ];

    const preferences = {
      schemaVersion: 1,
      pinnedSourceIds: [],
      selectedProjectScope: { kind: "global" as const },
      recentProjects: [],
      projectDrafts: {},
    };
    const coordinator = new ConfigCoordinator({
      store: {
        init: vi.fn().mockResolvedValue(undefined),
        readManifest: vi.fn(),
        readPreferences: vi.fn().mockResolvedValue(preferences),
        readVirtualGroups: vi.fn().mockResolvedValue(emptyVirtualGroups),
        writePreferences: vi.fn().mockResolvedValue(undefined),
      },
      recentProjectService: {
        listRecentProjects: vi.fn().mockResolvedValue([]),
      },
      doctorService: {
        run: vi.fn().mockResolvedValue({ ok: true, data: audit, warnings: [], errors: [] }),
      },
      workflowService: {
        getSummaries: vi.fn().mockReturnValue(summariesWithLocalOnly),
      },
      getAvailableTargets: vi.fn().mockResolvedValue(["codex"]),
      pruneMissingCheckouts: vi.fn().mockResolvedValue({
        ok: true,
        data: { removedSourceIds: [] },
        warnings: [],
        errors: [],
      }),
      getConfigData: vi.fn().mockResolvedValue({
        ok: true,
        data: { manifest, lockFile, summaries: summariesWithLocalOnly },
        warnings: [],
        errors: [],
      }),
    });

    const result = await coordinator.bootstrapWorkspaceState();

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.initialDrafts.alpha).toEqual({
      enabledTargets: [],
      selectedLeafIds: ["alpha:browse"],
    });
  });
});

import { describe, expect, test, vi } from "vitest";
import type {
  CollectionsFile,
  DoctorReport,
  DraftBinding,
  LockFile,
  ManifestFile,
  PreferencesFile,
  WorkflowSummary,
} from "@skill-flow/domain/types";
import { ConfigCoordinator } from "../config-coordinator.js";
import { WorkflowService } from "../workflow-service.js";

const manifest: ManifestFile = {
  schemaVersion: 2,
  migrationGeneration: "mg_test",
  sources: [
    {
      id: "alpha",
      locator: "/tmp/alpha",
      canonicalLocator: "/tmp/alpha",
      kind: "local",
      displayName: "alpha",
      enabled: true,
      createdAt: "2026-03-23T00:00:00.000Z",
      updatedAt: "2026-03-23T00:00:00.000Z",
    },
    {
      id: "beta",
      locator: "/tmp/beta",
      canonicalLocator: "/tmp/beta",
      kind: "local",
      displayName: "beta",
      enabled: true,
      createdAt: "2026-03-23T00:00:00.000Z",
      updatedAt: "2026-03-23T00:00:00.000Z",
    },
  ],
  bindings: {
    alpha: {
      sourceId: "alpha",
      selectionMode: "selected",
      selectedLeafIds: ["alpha:browse"],
      enabledTargets: ["codex"],
    },
    beta: {
      sourceId: "beta",
      selectionMode: "selected",
      selectedLeafIds: [],
      enabledTargets: [],
    },
  },
};

const lockFile: LockFile = {
  schemaVersion: 2,
  migrationGeneration: "mg_test",
  sources: {
    alpha: {
      sourceId: "alpha",
      canonicalLocator: "/tmp/alpha",
      revision: {
        provider: "local",
        capturedAt: "2026-03-23T00:00:00.000Z",
      },
      localPath: "/tmp/alpha",
      leafIds: ["alpha:browse"],
    },
  },
  leafInventory: [
    {
      id: "alpha:browse",
      sourceId: "alpha",
      displayName: "browse",
      linkName: "browse",
      title: "browse",
      description: "Browse things.",
      relativePath: "browse",
      absolutePath: "/tmp/alpha/browse",
      skillFilePath: "/tmp/alpha/browse/SKILL.md",
      contentHash: "hash-alpha",
      selectors: { aliases: [] },
      diagnostics: [],
      valid: true,
    },
  ],
  projections: [],
};

const audit: DoctorReport = {
  status: "HEALTHY",
  issues: [],
};

const emptyCollections: CollectionsFile = {
  schemaVersion: 2,
  migrationGeneration: "mg_test",
  collections: {},
};

const summaries: WorkflowSummary[] = [
  {
    source: {
      id: "alpha",
      locator: "/tmp/alpha",
      kind: "local",
      displayName: "alpha",
      originalDisplayName: "alpha",
      addedAt: "2026-03-23T00:00:00.000Z",
    },
    lock: undefined,
    leafs: [{
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
    }],
    bindings: {
      selectedLeafIds: ["alpha:browse"],
      resolvedSelectedLeafCount: 1,
      targets: {
        codex: {
          enabled: true,
          leafIds: ["alpha:browse"],
        },
      },
    },
    activeTargetCount: 1,
    health: "ACTIVE",
    issueCounts: { warning: 0, error: 0 },
  },
  {
    source: {
      id: "beta",
      locator: "/tmp/beta",
      kind: "local",
      displayName: "beta",
      originalDisplayName: "beta",
      addedAt: "2026-03-23T00:00:00.000Z",
    },
    lock: undefined,
    leafs: [],
    bindings: { selectedLeafIds: [], resolvedSelectedLeafCount: 0, targets: {} },
    activeTargetCount: 0,
    health: "INACTIVE",
    issueCounts: { warning: 0, error: 0 },
  },
];

const allModeSummaries: WorkflowSummary[] = [
  {
    ...summaries[0]!,
    source: {
      ...summaries[0]!.source,
      selectionMode: "all",
    },
    bindings: {
      selectedLeafIds: [],
      resolvedSelectedLeafCount: 1,
      targets: {
        codex: {
          enabled: true,
          leafIds: ["alpha:browse"],
        },
      },
    },
  },
];

function createPreferences(overrides: Partial<PreferencesFile> = {}): PreferencesFile {
  return {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    pinnedSourceIds: [],
    selectedProjectScope: { kind: "global" },
    recentProjects: [],
    projectSourceDrafts: {},
    customTargets: [],
    agentDisplayOrder: [],
    ...overrides,
  };
}

describe("ConfigCoordinator", () => {
  test("builds summaries with authoritative selectionMode from workflow service", async () => {
    const preferences = createPreferences();
    const workflowService = new WorkflowService();
    const coordinator = new ConfigCoordinator({
      store: {
        readPreferences: vi.fn().mockResolvedValue(preferences),
        readCollections: vi.fn().mockResolvedValue(emptyCollections),
        writePreferences: vi.fn().mockResolvedValue(undefined),
      },
      recentProjectService: {
        listRecentProjects: vi.fn().mockResolvedValue([]),
      },
      doctorService: {
        run: vi.fn().mockResolvedValue({ ok: true, data: audit, warnings: [], errors: [] }),
      },
      workflowService,
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
    expect(result.data.summaries.map((summary) => ({
      sourceId: summary.source.id,
      selectionMode: summary.source.selectionMode,
    }))).toEqual([
      { sourceId: "alpha", selectionMode: "selected" },
      { sourceId: "beta", selectionMode: "selected" },
    ]);
  });

  test("boots config and derives initial drafts from normalized summaries", async () => {
    const initialPreferences = createPreferences();
    const refreshedPreferences = createPreferences({
      recentProjects: [
        {
          projectId: "acme/skill-flow",
          title: "Skill Flow",
          lastActivityAt: "2026-03-30T00:00:00.000Z",
          tools: ["codex"],
        },
      ],
    });

    const getSummaries = vi.fn().mockReturnValue(summaries);
    const coordinator = new ConfigCoordinator({
      store: {
        readPreferences: vi
          .fn()
          .mockResolvedValueOnce(initialPreferences)
          .mockResolvedValueOnce(refreshedPreferences),
        readCollections: vi.fn().mockResolvedValue(emptyCollections),
        writePreferences: vi.fn().mockResolvedValue(undefined),
      },
      recentProjectService: {
        listRecentProjects: vi.fn().mockResolvedValue(refreshedPreferences.recentProjects),
      },
      doctorService: {
        run: vi.fn().mockResolvedValue({ ok: true, data: audit, warnings: [], errors: [] }),
      },
      workflowService: {
        getSummaries,
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
    expect(getSummaries).toHaveBeenCalledWith(manifest, lockFile, audit, emptyCollections);
  });

  test("derives all-mode initial draft selections from enabled target leaf ids", async () => {
    const preferences = createPreferences();
    const coordinator = new ConfigCoordinator({
      store: {
        readPreferences: vi.fn().mockResolvedValue(preferences),
        readCollections: vi.fn().mockResolvedValue(emptyCollections),
        writePreferences: vi.fn().mockResolvedValue(undefined),
      },
      recentProjectService: {
        listRecentProjects: vi.fn().mockResolvedValue([]),
      },
      doctorService: {
        run: vi.fn().mockResolvedValue({ ok: true, data: audit, warnings: [], errors: [] }),
      },
      workflowService: {
        getSummaries: vi.fn().mockReturnValue(allModeSummaries),
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
        data: { manifest, lockFile, summaries: allModeSummaries },
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
      enabledTargets: ["codex"],
      selectedLeafIds: ["alpha:browse"],
    });
  });

  test("keeps config boot usable when prune removes missing groups", async () => {
    const onEvent = vi.fn();
    const preferences = createPreferences();
    const coordinator = new ConfigCoordinator({
      store: {
        readPreferences: vi.fn().mockResolvedValue(preferences),
        readCollections: vi.fn().mockResolvedValue(emptyCollections),
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

  test("ensures built-in sources after pruning and before reading config data", async () => {
    const preferences = createPreferences();
    const calls: string[] = [];
    const coordinator = new ConfigCoordinator({
      store: {
        readPreferences: vi.fn().mockResolvedValue(preferences),
        readCollections: vi.fn().mockResolvedValue(emptyCollections),
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
      pruneMissingCheckouts: vi.fn().mockImplementation(async () => {
        calls.push("prune");
        return {
          ok: true,
          data: { removedSourceIds: ["skill-flow"] },
          warnings: [],
          errors: [],
        };
      }),
      ensureBuiltInSources: vi.fn().mockImplementation(async () => {
        calls.push("ensure-built-in");
        return {
          ok: true,
          data: { sourceIds: ["skill-flow"] },
          warnings: [],
          errors: [],
        };
      }),
      getConfigData: vi.fn().mockImplementation(async () => {
        calls.push("config-data");
        return {
          ok: true,
          data: { manifest, lockFile, summaries },
          warnings: [],
          errors: [],
        };
      }),
    });

    const result = await coordinator.bootstrapWorkspaceState();

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["prune", "ensure-built-in", "config-data"]);
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

    const preferences = createPreferences();
    const coordinator = new ConfigCoordinator({
      store: {
        readPreferences: vi.fn().mockResolvedValue(preferences),
        readCollections: vi.fn().mockResolvedValue(emptyCollections),
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

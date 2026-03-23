import { describe, expect, test, vi } from "vitest";
import type {
  DoctorReport,
  DraftBinding,
  LockFile,
  Manifest,
  WorkflowSummary,
} from "../domain/types.js";
import { ConfigCoordinator } from "../services/config-coordinator.js";

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
    const updateSources = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: { updated: [{ sourceId: "alpha", changed: false, addedLeafIds: [], removedLeafIds: [], invalidatedLeafIds: [] }] }, warnings: [], errors: [] })
      .mockResolvedValueOnce({ ok: true, data: { updated: [{ sourceId: "beta", changed: true, addedLeafIds: [], removedLeafIds: [], invalidatedLeafIds: [] }] }, warnings: [], errors: [] });
    const coordinator = new ConfigCoordinator({
      store: {
        init: vi.fn().mockResolvedValue(undefined),
        readManifest: vi.fn().mockResolvedValue(manifest),
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
      updateSources,
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
      updatedSourceIds: ["alpha", "beta"],
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
    expect(updateSources).toHaveBeenCalledTimes(2);
    expect(updateSources).toHaveBeenNthCalledWith(1, ["alpha"]);
    expect(updateSources).toHaveBeenNthCalledWith(2, ["beta"]);
  });

  test("keeps config boot usable when one group update fails", async () => {
    const updateSources = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        data: {
          updated: [
            {
              sourceId: "alpha",
              changed: false,
              addedLeafIds: [],
              removedLeafIds: [],
              invalidatedLeafIds: [],
            },
          ],
        },
        warnings: [],
        errors: [],
      })
      .mockResolvedValueOnce({
        ok: false,
        warnings: [],
        errors: [
          {
            code: "LOCAL_UPDATE_FAILED",
            message: "Unable to update skills group id 'beta': boom",
          },
        ],
      });
    const onEvent = vi.fn();
    const coordinator = new ConfigCoordinator({
      store: {
        init: vi.fn().mockResolvedValue(undefined),
        readManifest: vi.fn().mockResolvedValue(manifest),
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
      updateSources,
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
      phase: "partial_failure",
      updatedSourceIds: ["alpha"],
      failedSources: [
        {
          sourceId: "beta",
          message: "Unable to update skills group id 'beta': boom",
        },
      ],
    });
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "refresh-sources",
        level: "error",
        message: expect.stringContaining("beta update failed"),
      }),
    );
  });
});

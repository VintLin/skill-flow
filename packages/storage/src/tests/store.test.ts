import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createEmptySharedPreferences } from "../preferences-store.js";
import { StateStore } from "../store.js";

const emptyPreferences = createEmptySharedPreferences();

describe("StateStore", () => {
  let stateRoot = "";

  beforeEach(async () => {
    stateRoot = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-storage-"));
  });

  afterEach(async () => {
    if (stateRoot) {
      await fs.rm(stateRoot, { recursive: true, force: true });
    }
  });

  test("initializes manifest, lock, and managed directories on first read", async () => {
    const store = new StateStore(stateRoot);

    expect(await store.readManifest()).toEqual({
      schemaVersion: 1,
      sources: [],
      bindings: {},
    });
    expect(await store.readLock()).toEqual({
      schemaVersion: 1,
      sources: [],
      leafInventory: [],
      projections: [],
      deployments: [],
    });

    await expect(fs.stat(store.getSourceRoot("local"))).resolves.toBeTruthy();
    await expect(fs.stat(store.getSourceRoot("git"))).resolves.toBeTruthy();
    await expect(fs.stat(store.getSourceRoot("clawhub"))).resolves.toBeTruthy();
    await expect(fs.stat(store.catalogRoot)).resolves.toBeTruthy();
  });

  test("backfills legacy lock leaf fields when reading", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    await fs.writeFile(
      store.lockPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          sources: [],
          leafInventory: [
            {
              id: "alpha:browse",
              sourceId: "alpha",
              name: "browse",
              title: "Browse",
              description: "Browse things.",
              relativePath: "skills/browse",
              absolutePath: "/tmp/alpha/skills/browse",
              skillFilePath: "/tmp/alpha/skills/browse/SKILL.md",
              contentHash: "hash",
              valid: true,
            },
          ],
          deployments: [],
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    const lock = await store.readLock();

    expect(lock.leafInventory[0]?.linkName).toBe("browse");
    expect(lock.leafInventory[0]?.metadataWarnings).toEqual([]);
  });

  test("readState backfills missing originalDisplayName from displayName", async () => {
    const store = new StateStore(stateRoot);
    await store.init();

    await fs.writeFile(store.manifestPath, `${JSON.stringify({
      schemaVersion: 1,
      sources: [
        {
          id: "alpha",
          locator: "https://github.com/acme/alpha.git",
          kind: "git",
          displayName: "Custom Alpha",
          addedAt: "2026-05-31T00:00:00.000Z",
        },
      ],
      bindings: {},
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(store.lockPath, `${JSON.stringify({
      schemaVersion: 1,
      sources: [
        {
          id: "alpha",
          locator: "https://github.com/acme/alpha.git",
          kind: "git",
          displayName: "Custom Alpha",
          checkoutPath: "/tmp/alpha",
          updatedAt: "2026-05-31T00:00:00.000Z",
          leafIds: [],
          invalidLeafs: [],
        },
      ],
      leafInventory: [],
      projections: [],
      deployments: [],
    }, null, 2)}\n`, "utf8");

    const state = await store.readState();

    expect(state.manifest.sources[0]).toMatchObject({
      displayName: "Custom Alpha",
      originalDisplayName: "Custom Alpha",
    });
    expect(state.lockFile.sources[0]).toMatchObject({
      displayName: "Custom Alpha",
      originalDisplayName: "Custom Alpha",
    });
  });

  test("readState migrates legacy metadata titles back to locator-derived default names", async () => {
    const store = new StateStore(stateRoot);
    await store.init();

    await fs.writeFile(store.manifestPath, `${JSON.stringify({
      schemaVersion: 1,
      sources: [
        {
          id: "dontbesilent2025-dbskill",
          locator: "dontbesilent2025/dbskill",
          kind: "git",
          displayName: "商业分析",
          originalDisplayName: "商业分析",
          addedAt: "2026-05-31T00:00:00.000Z",
        },
      ],
      bindings: {},
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(store.lockPath, `${JSON.stringify({
      schemaVersion: 1,
      sources: [
        {
          id: "dontbesilent2025-dbskill",
          locator: "dontbesilent2025/dbskill",
          kind: "git",
          displayName: "商业分析",
          originalDisplayName: "商业分析",
          checkoutPath: "/tmp/dbskill",
          updatedAt: "2026-05-31T00:00:00.000Z",
          leafIds: [],
          invalidLeafs: [],
        },
      ],
      leafInventory: [],
      projections: [],
      deployments: [],
    }, null, 2)}\n`, "utf8");

    const state = await store.readState();

    expect(state.manifest.sources[0]).toMatchObject({
      displayName: "dbskill",
      originalDisplayName: "dbskill",
    });
    expect(state.lockFile.sources[0]).toMatchObject({
      displayName: "dbskill",
      originalDisplayName: "dbskill",
    });
  });

  test("readState preserves non-ASCII virtual group display names", async () => {
    const store = new StateStore(stateRoot);
    await store.init();

    await fs.writeFile(store.manifestPath, `${JSON.stringify({
      schemaVersion: 1,
      sources: [
        {
          id: "skills-2",
          locator: "virtual:skills-2",
          kind: "virtual",
          displayName: "组合工具",
          originalDisplayName: "组合工具",
          addedAt: "2026-05-31T00:00:00.000Z",
        },
      ],
      bindings: {},
    }, null, 2)}\n`, "utf8");
    await fs.writeFile(store.lockPath, `${JSON.stringify({
      schemaVersion: 1,
      sources: [],
      leafInventory: [],
      projections: [],
      deployments: [],
    }, null, 2)}\n`, "utf8");

    const state = await store.readState();

    expect(state.manifest.sources[0]).toMatchObject({
      displayName: "组合工具",
      originalDisplayName: "组合工具",
    });
  });

  test("writeState persists originalDisplayName on manifest and lock sources", async () => {
    const store = new StateStore(stateRoot);
    await store.init();

    await store.writeState(
      {
        schemaVersion: 1,
        sources: [
          {
            id: "alpha",
            locator: "https://github.com/acme/alpha.git",
            kind: "git",
            displayName: "Custom Alpha",
            originalDisplayName: "alpha",
            addedAt: "2026-05-31T00:00:00.000Z",
          },
        ],
        bindings: {},
      },
      {
        schemaVersion: 1,
        sources: [
          {
            id: "alpha",
            locator: "https://github.com/acme/alpha.git",
            kind: "git",
            displayName: "Custom Alpha",
            originalDisplayName: "alpha",
            checkoutPath: "/tmp/alpha",
            updatedAt: "2026-05-31T00:00:00.000Z",
            leafIds: [],
            invalidLeafs: [],
          },
        ],
        leafInventory: [],
        projections: [],
        deployments: [],
      },
    );

    const manifest = JSON.parse(await fs.readFile(store.manifestPath, "utf8"));
    const lock = JSON.parse(await fs.readFile(store.lockPath, "utf8"));

    expect(manifest.sources[0].originalDisplayName).toBe("alpha");
    expect(lock.sources[0].originalDisplayName).toBe("alpha");
  });

  test("preserves managed projections when deployments are empty", async () => {
    const store = new StateStore(stateRoot);

    await store.writeLock({
      schemaVersion: 1,
      sources: [],
      leafInventory: [],
      deployments: [],
      projections: [
        {
          sourceId: "alpha",
          leafId: "alpha:browse",
          target: "claude-code",
          targetPath: "/tmp/alpha-browse",
          targetRootPath: "/tmp",
          strategy: "symlink",
          status: "active",
          contentHash: "hash",
          appliedAt: "2026-03-30T00:00:00.000Z",
          mode: "managed",
        },
      ],
    });

    const lock = await store.readLock();

    expect(lock.projections ?? []).toHaveLength(1);
    expect(lock.projections?.[0]?.mode).toBe("managed");
    expect(lock.deployments).toHaveLength(1);
    expect(lock.deployments[0]?.leafId).toBe("alpha:browse");
  });

  test("writes compact lock state without deployments and drops bootstrap metadata after projections exist", async () => {
    const store = new StateStore(stateRoot);

    await store.writeLock({
      schemaVersion: 1,
      sources: [
        {
          id: "alpha",
          locator: "/tmp/alpha",
          kind: "local",
          displayName: "alpha",
          originalDisplayName: "alpha",
          checkoutPath: "/tmp/alpha",
          updatedAt: "2026-03-30T00:00:00.000Z",
          leafIds: ["alpha:browse"],
          invalidLeafs: [],
          importMode: "bootstrap-detected",
          importedFromTargets: ["codex"],
          observedTargets: [
            {
              target: "codex",
              rootPath: "/tmp/targets",
              targetPath: "/tmp/targets/browse",
            },
          ],
        },
      ],
      leafInventory: [],
      deployments: [
        {
          sourceId: "alpha",
          leafId: "alpha:browse",
          target: "codex",
          targetPath: "/tmp/targets/browse",
          targetRootPath: "/tmp/targets",
          strategy: "symlink",
          status: "active",
          contentHash: "hash",
          appliedAt: "2026-03-30T00:00:00.000Z",
        },
      ],
      projections: [
        {
          sourceId: "alpha",
          leafId: "alpha:browse",
          target: "codex",
          targetPath: "/tmp/targets/browse",
          targetRootPath: "/tmp/targets",
          strategy: "symlink",
          status: "active",
          contentHash: "hash",
          appliedAt: "2026-03-30T00:00:00.000Z",
          mode: "managed",
        },
        {
          sourceId: "alpha",
          leafId: "alpha:browse",
          target: "codex",
          targetPath: "/tmp/targets/browse",
          targetRootPath: "/tmp/targets",
          strategy: "symlink",
          status: "active",
          contentHash: "hash",
          appliedAt: "2026-03-30T00:00:00.000Z",
          mode: "bootstrap-imported",
        },
      ],
    });

    const raw = JSON.parse(await fs.readFile(store.lockPath, "utf8")) as Record<string, unknown>;
    const sources = raw.sources as Array<Record<string, unknown>>;

    expect(raw).not.toHaveProperty("deployments");
    expect(sources[0]).not.toHaveProperty("importedFromTargets");
    expect(raw).toHaveProperty("projections");
  });

  test("toggles pinned sources and prunes missing ids against the manifest", async () => {
    const store = new StateStore(stateRoot);
    await store.writeManifest({
      schemaVersion: 1,
      sources: [
        {
          id: "alpha",
          locator: "/tmp/alpha",
          kind: "local",
          displayName: "alpha",
          originalDisplayName: "alpha",
          addedAt: "2026-03-28T00:00:00.000Z",
        },
      ],
      bindings: {},
    });

    expect(await store.togglePinnedSource("alpha")).toEqual({
      ...emptyPreferences,
      pinnedSourceIds: ["alpha"],
    });
    expect(await store.togglePinnedSource("beta")).toEqual({
      ...emptyPreferences,
      pinnedSourceIds: ["alpha", "beta"],
    });
    expect(await store.pruneMissingSourceIds()).toEqual({
      ...emptyPreferences,
      pinnedSourceIds: ["alpha"],
    });
  });

  test("virtual group state defaults to an empty file shape", async () => {
    const store = new StateStore(stateRoot);

    const virtualGroups = await store.readVirtualGroups();

    expect(virtualGroups).toEqual({
      schemaVersion: 1,
      groups: {},
    });
  });

  test("virtual group state round trips merge metadata", async () => {
    const store = new StateStore(stateRoot);

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

  test("virtual group state normalizes malformed persisted metadata", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    await fs.writeFile(
      store.virtualGroupsPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          groups: {
            "writing-stack": {
              displayName: 42,
              includedSkills: [
                { sourceId: "alpha", leafId: "alpha:skills/review" },
                { sourceId: "beta" },
                null,
              ],
              hiddenSourceIds: ["alpha", "alpha", "beta", 42],
              restoreSnapshots: {
                alpha: {
                  selectedLeafIds: ["alpha:skills/review", 42],
                  enabledTargets: ["codex", 42],
                },
                beta: null,
              },
              createdAt: 42,
            },
            ignored: null,
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await expect(store.readVirtualGroups()).resolves.toEqual({
      schemaVersion: 1,
      groups: {
        "writing-stack": {
          id: "writing-stack",
          displayName: "writing-stack",
          includedSkills: [
            { sourceId: "alpha", leafId: "alpha:skills/review" },
          ],
          hiddenSourceIds: ["alpha", "beta"],
          restoreSnapshots: {
            alpha: {
              selectedLeafIds: ["alpha:skills/review"],
              enabledTargets: ["codex"],
            },
            beta: {
              selectedLeafIds: [],
              enabledTargets: [],
            },
          },
          createdAt: "1970-01-01T00:00:00.000Z",
          updatedAt: "1970-01-01T00:00:00.000Z",
        },
      },
    });
  });

  test("virtual group state uses map keys as canonical group ids", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    await fs.writeFile(
      store.virtualGroupsPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          groups: {
            oldKey: {
              id: "newKey",
              displayName: "Old Key",
            },
            newKey: {
              id: "newKey",
              displayName: "New Key",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await expect(store.readVirtualGroups()).resolves.toMatchObject({
      groups: {
        oldKey: {
          id: "oldKey",
          displayName: "Old Key",
        },
        newKey: {
          id: "newKey",
          displayName: "New Key",
        },
      },
    });
  });

  test("virtual group state ignores non-object restore snapshots", async () => {
    const store = new StateStore(stateRoot);
    await store.init();
    await fs.writeFile(
      store.virtualGroupsPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          groups: {
            arraySnapshots: {
              restoreSnapshots: [
                { selectedLeafIds: ["array:skill"], enabledTargets: ["codex"] },
              ],
            },
            stringSnapshots: {
              restoreSnapshots: "abc",
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    await expect(store.readVirtualGroups()).resolves.toEqual({
      schemaVersion: 1,
      groups: {
        arraySnapshots: {
          id: "arraySnapshots",
          displayName: "arraySnapshots",
          includedSkills: [],
          hiddenSourceIds: [],
          restoreSnapshots: {},
          createdAt: "1970-01-01T00:00:00.000Z",
          updatedAt: "1970-01-01T00:00:00.000Z",
        },
        stringSnapshots: {
          id: "stringSnapshots",
          displayName: "stringSnapshots",
          includedSkills: [],
          hiddenSourceIds: [],
          restoreSnapshots: {},
          createdAt: "1970-01-01T00:00:00.000Z",
          updatedAt: "1970-01-01T00:00:00.000Z",
        },
      },
    });
  });

  test("writes and prunes source metadata and import cache entries", async () => {
    const store = new StateStore(stateRoot);

    await store.writeSourceMetadataEntry({
      sourceId: "alpha",
      status: "unsupported",
      checkedAt: "2026-03-28T00:00:00.000Z",
      expiresAt: "2026-03-29T00:00:00.000Z",
      reasonCode: "provider_not_supported",
    });
    await store.writeSourceMetadataEntry({
      sourceId: "beta",
      status: "unsupported",
      checkedAt: "2026-03-28T00:00:00.000Z",
      expiresAt: "2026-03-29T00:00:00.000Z",
      reasonCode: "provider_not_supported",
    });
    await store.writeImportSearchSnapshotEntry("browse", {
      query: "browse",
      checkedAt: "2026-03-28T00:00:00.000Z",
      expiresAt: "2026-03-29T00:00:00.000Z",
      hits: [],
      groups: [],
    });

    expect(Object.keys(await store.readSourceMetadataCache())).toEqual(["alpha", "beta"]);
    expect(Object.keys((await store.readImportDataCache()).searches)).toEqual(["browse"]);

    expect(await store.pruneSourceMetadataCache(["beta"])).toEqual({
      beta: {
        sourceId: "beta",
        status: "unsupported",
        checkedAt: "2026-03-28T00:00:00.000Z",
        expiresAt: "2026-03-29T00:00:00.000Z",
        reasonCode: "provider_not_supported",
      },
    });
  });

  test("persists import preparation records separately from import data cache", async () => {
    const store = new StateStore(stateRoot);
    await store.writeImportPreparationRecord({
      id: "prep-1",
      locator: "anthropics/skills",
      canonicalRepo: "anthropics/skills",
      sourceKind: "git",
      checkoutPath: store.getImportPreparationCheckoutPath("prep-1"),
      sourceId: "anthropics-skills",
      displayName: "skills",
      status: "ready",
      preparedAt: "2026-06-04T00:00:00.000Z",
      expiresAt: "2026-06-05T00:00:00.000Z",
      skillIds: ["review"],
      availableTargets: ["cursor"],
    });

    await expect(fs.stat(store.importPreparationPath)).resolves.toBeTruthy();
    expect(store.getImportPreparationCheckoutPath("prep-1")).toContain("import-preparations/prep-1");
    expect(await store.readImportPreparationCache()).toMatchObject({
      records: {
        "prep-1": {
          locator: "anthropics/skills",
          status: "ready",
        },
      },
      locatorIndex: {
        "anthropics/skills": "prep-1",
      },
    });
    expect(await store.readImportDataCache()).toEqual({
      searches: {},
      repos: {},
      recommendations: {},
    });
  });
});

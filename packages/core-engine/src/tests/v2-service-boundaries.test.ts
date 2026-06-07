import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import type {
  LockFile,
  ManifestFile,
  PreferencesFile,
} from "@skill-flow/domain/types";
import { DoctorService } from "../services/doctor-service.js";
import { WorkspaceBootstrapService } from "../services/workspace-bootstrap-service.js";
import { skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

const capturedAt = "2026-06-07T00:00:00.000Z";

describe("v2 service boundaries", () => {
  const sandbox = useSkillFlowSandbox();

  test("doctor ignores malformed legacy targets on v2 bindings", async () => {
    const manifest = createManifest({
      binding: {
        sourceId: "source-a",
        selectionMode: "selected",
        selectedLeafIds: [],
        ["targets"]: {
          codex: {
            enabled: true,
            leafIds: ["source-a:one"],
          },
        },
      } as unknown as ManifestFile["bindings"][string],
    });
    const lockFile = createLockFile({
      localPath: path.join(sandbox.stateRoot, "source", "local", "source-a"),
    });

    const result = await new DoctorService().run(manifest, lockFile, defaultPreferences());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.data.issues).toEqual([]);
  });

  test("workspace bootstrap skips managed v2 local paths", async () => {
    const checkoutPath = path.join(sandbox.stateRoot, "source", "local", "source-a");
    await fs.mkdir(path.join(checkoutPath, "one"), { recursive: true });
    await fs.writeFile(path.join(checkoutPath, "one", "SKILL.md"), skillDoc("one", "One skill."), "utf8");
    await fs.symlink(checkoutPath, path.join(process.env.SKILL_FLOW_TARGET_CODEX!, "one"), "junction");
    const service = new WorkspaceBootstrapService({ stateRoot: sandbox.stateRoot });

    const detected = await service.detectUnmanagedExternalSkills(
      createManifest(),
      createLockFile({ localPath: checkoutPath }),
    );

    expect(detected).toEqual([]);
  });
});

function assertV2OnlyServiceInputs(
  doctor: DoctorService,
  bootstrap: WorkspaceBootstrapService,
) {
  const v1Manifest = {
    schemaVersion: 1,
    sources: [],
    bindings: {},
  };
  const v1LockFile = {
    schemaVersion: 1,
    sources: [],
    leafInventory: [],
    deployments: [],
  };

  // @ts-expect-error V1 manifest/lock are migration inputs only, not DoctorService inputs.
  void doctor.run(v1Manifest, v1LockFile, defaultPreferences());
  // @ts-expect-error V1 manifest/lock are migration inputs only, not WorkspaceBootstrapService inputs.
  void bootstrap.detectUnmanagedExternalSkills(v1Manifest, v1LockFile);
}

void assertV2OnlyServiceInputs;

function createManifest(
  overrides: {
    binding?: ManifestFile["bindings"][string];
  } = {},
): ManifestFile {
  return {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    sources: [
      {
        id: "source-a",
        kind: "local",
        locator: "/sources/source-a",
        canonicalLocator: "/sources/source-a",
        displayName: "Source A",
        enabled: true,
        createdAt: capturedAt,
        updatedAt: capturedAt,
      },
    ],
    bindings: {
      "source-a": overrides.binding ?? {
        sourceId: "source-a",
        selectionMode: "selected",
        selectedLeafIds: [],
        enabledTargets: [],
      },
    },
  };
}

function createLockFile(
  overrides: {
    localPath?: string;
  } = {},
): LockFile {
  const localPath = overrides.localPath ?? "/sources/source-a";
  return {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    sources: {
      "source-a": {
        sourceId: "source-a",
        canonicalLocator: "/sources/source-a",
        revision: {
          provider: "local",
          capturedAt,
        },
        localPath,
        leafIds: ["source-a:one"],
      },
    },
    leafInventory: [
      {
        id: "source-a:one",
        sourceId: "source-a",
        relativePath: "one",
        linkName: "one",
        title: "One",
        description: "One skill.",
        absolutePath: path.join(localPath, "one"),
        skillFilePath: path.join(localPath, "one", "SKILL.md"),
        contentHash: "hash-one",
        selectors: { aliases: [] },
        valid: true,
        diagnostics: [],
      },
    ],
    projections: [],
  };
}

function defaultPreferences(): PreferencesFile {
  return {
    schemaVersion: 2,
    migrationGeneration: "mg_test",
    pinnedSourceIds: [],
    selectedProjectScope: { kind: "global" },
    recentProjects: [],
    projectSourceDrafts: {},
    customTargets: [],
    agentDisplayOrder: [],
  };
}

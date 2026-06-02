import { describe, expect, test, vi } from "vitest";
import { SkillFlowApp } from "@skill-flow/query/runtime";
import * as githubCatalog from "@skill-flow/integration/utils/github-catalog";
import { ok } from "@skill-flow/integration/utils/result";
import { executeBridgeRequest } from "../bridge-command.js";
import { PROTOCOL_VERSION } from "@skill-flow/shared-types/protocol";
import { createRepo, skillDoc, useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("bridge command dispatcher", () => {
  const sandbox = useSkillFlowSandbox();

  test("returns list envelope", async () => {
    const app = new SkillFlowApp();
    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "list",
      requestId: "r1",
    });

    expect(response.ok).toBe(true);
    expect(response.command).toBe("list");
    expect(response.requestId).toBe("r1");
    expect(response.data).toHaveProperty("summaries");
    expect(response.data).toHaveProperty("pinnedSourceIds");
  });

  test("returns pinned source ids in bootstrap payload", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }
    await app.store.togglePinnedSource(added.data.manifest.id);

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "bootstrap",
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("pinnedSourceIds", [added.data.manifest.id]);
    expect(response.data).toHaveProperty("customTargets");
    expect(response.data).toHaveProperty("agentDisplayOrder");
  });

  test("save-settings writes normalized custom targets to shared preferences", async () => {
    const app = new SkillFlowApp();

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "save-settings",
      payload: {
        customTargets: [
          {
            id: "my-agent",
            name: "My Agent",
            globalPath: "/Users/test/.my-agent/skills",
            projectPathTemplate: "./.my-agent/skills",
            strategy: "copy",
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T01:00:00.000Z",
          },
        ],
        agentDisplayOrder: ["codex", "my-agent"],
      },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("customTargets");
    expect(response.data).toHaveProperty("agentDisplayOrder");
    expect((response.data as any).customTargets[0].projectPathTemplate).toBe(".my-agent/skills");
  });

  test("rejects invalid apply payload", async () => {
    const app = new SkillFlowApp();
    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "apply",
      payload: { sourceId: "x" },
    });

    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe("BRIDGE_REQUEST_INVALID");
  });

  test("accepts valid inspect payload", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "inspect",
      payload: { sourceId: added.data.manifest.id },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("summary");
    expect(response.data).not.toHaveProperty("sourceMetadata");
  });

  test("accepts valid inspect-enrichment payload", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "inspect-enrichment",
      payload: { sourceId: added.data.manifest.id },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("sourceMetadata");
  });

  test("accepts valid add payload", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "add",
      payload: {
        locator: repoPath,
        applyNow: false,
      },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("sourceId");
  });

  test("accepts valid toggle-pin payload", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "toggle-pin",
      payload: {
        sourceId: added.data.manifest.id,
      },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("pinnedSourceIds", [added.data.manifest.id]);
  });

  test("rejects invalid toggle-pin payload", async () => {
    const app = new SkillFlowApp();
    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "toggle-pin",
      payload: {},
    });

    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe("BRIDGE_REQUEST_INVALID");
  });

  test("accepts valid rename-source payload", async () => {
    const app = {
      renameSource: vi.fn(async (sourceId: string, displayName: string) => ok({
        sourceId,
        displayName,
        originalDisplayName: "demo-source",
        isResetToOriginal: false,
      })),
    } as unknown as SkillFlowApp;

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "rename-source",
      payload: {
        sourceId: "demo-source",
        displayName: "Writing Tools",
      },
    });

    expect(app.renameSource).toHaveBeenCalledWith("demo-source", "Writing Tools");
    expect(response.ok).toBe(true);
    expect(response.data).toEqual({
      sourceId: "demo-source",
      displayName: "Writing Tools",
      originalDisplayName: "demo-source",
      isResetToOriginal: false,
    });
  });

  test("rejects rename-source payload without sourceId", async () => {
    const app = new SkillFlowApp();

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "rename-source",
      payload: {
        displayName: "Writing Tools",
      },
    });

    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe("BRIDGE_REQUEST_INVALID");
  });

  test("rejects rename-source payload without displayName", async () => {
    const app = new SkillFlowApp();

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "rename-source",
      payload: {
        sourceId: "demo-source",
      },
    });

    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe("BRIDGE_REQUEST_INVALID");
  });

  test("rejects rename-source payload with non-string displayName", async () => {
    const app = {
      renameSource: vi.fn(),
    } as unknown as SkillFlowApp;

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "rename-source",
      payload: {
        sourceId: "demo-source",
        displayName: 123,
      },
    });

    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe("BRIDGE_REQUEST_INVALID");
    expect(app.renameSource).not.toHaveBeenCalled();
  });

  test("accepts blank rename-source displayName as reset request", async () => {
    const app = {
      renameSource: vi.fn(async (sourceId: string, displayName: string) => ok({
        sourceId,
        displayName: "demo-source",
        originalDisplayName: "demo-source",
        isResetToOriginal: displayName.trim() === "",
      })),
    } as unknown as SkillFlowApp;

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "rename-source",
      payload: {
        sourceId: "demo-source",
        displayName: "   ",
      },
    });

    expect(app.renameSource).toHaveBeenCalledWith("demo-source", "   ");
    expect(response).toMatchObject({
      ok: true,
      data: {
        sourceId: "demo-source",
        displayName: "demo-source",
        originalDisplayName: "demo-source",
        isResetToOriginal: true,
      },
    });
  });

  test("accepts empty rename-source displayName as reset request", async () => {
    const app = {
      renameSource: vi.fn(async (sourceId: string, displayName: string) => ok({
        sourceId,
        displayName: "demo-source",
        originalDisplayName: "demo-source",
        isResetToOriginal: displayName === "",
      })),
    } as unknown as SkillFlowApp;

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "rename-source",
      payload: {
        sourceId: "demo-source",
        displayName: "",
      },
    });

    expect(app.renameSource).toHaveBeenCalledWith("demo-source", "");
    expect(response).toMatchObject({
      ok: true,
      data: {
        sourceId: "demo-source",
        displayName: "demo-source",
        originalDisplayName: "demo-source",
        isResetToOriginal: true,
      },
    });
  });

  test("accepts valid apply payload with empty skill selection", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "apply",
      payload: {
        sourceId: added.data.manifest.id,
        draft: {
          selectedLeafIds: [],
          enabledTargets: [],
        },
      },
    });

    expect(response.ok).toBe(true);
  });

  test("apply bridge response includes fresh summary and inspect payload", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();
    const added = await app.addSource(repoPath, { sourceIdOverride: "demo-source" });
    expect(added.ok).toBe(true);
    if (!added.ok) {
      return;
    }

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "apply",
      payload: {
        sourceId: added.data.manifest.id,
        draft: {
          selectedLeafIds: [`${added.data.manifest.id}:skills/review`],
          enabledTargets: ["codex"],
        },
      },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("summary");
    expect(response.data).toHaveProperty("inspect");
  });

  test("apply forwards project scope payload", async () => {
    const app = new SkillFlowApp();
    const applySpy = vi.spyOn(app, "applyDraft").mockResolvedValue({
      ok: true,
      data: {
        actions: [],
        draft: { selectedLeafIds: ["alpha:a"], enabledTargets: ["codex"] },
      },
      warnings: [],
      errors: [],
    });

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "apply",
      payload: {
        sourceId: "alpha",
        scope: { kind: "project", projectId: "repo-a" },
        draft: {
          selectedLeafIds: ["alpha:a"],
          enabledTargets: ["codex"],
        },
      },
    });

    expect(response.ok).toBe(true);
    expect(applySpy).toHaveBeenCalledWith(
      "alpha",
      { selectedLeafIds: ["alpha:a"], enabledTargets: ["codex"] },
      { kind: "project", projectId: "repo-a" },
    );
  });

  test("rejects malformed project scope payload instead of downgrading to global", async () => {
    const app = new SkillFlowApp();
    const applySpy = vi.spyOn(app, "applyDraft");

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "apply",
      payload: {
        sourceId: "alpha",
        scope: { kind: "project" },
        draft: {
          selectedLeafIds: ["alpha:a"],
          enabledTargets: ["codex"],
        },
      },
    });

    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe("BRIDGE_REQUEST_INVALID");
    expect(applySpy).not.toHaveBeenCalled();
  });

  test("accepts valid search-import-groups payload", async () => {
    vi.spyOn(githubCatalog, "fetchGitHubRepoDetails").mockResolvedValue({
      provider: "github",
      repoLabel: "anthropics/skills",
      repoUrl: "https://github.com/anthropics/skills",
      starCount: 406,
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        skills: [
          {
            id: "anthropic/skills/research",
            skillId: "research",
            name: "research",
            installs: 1200,
            source: "anthropic/skills",
          },
        ],
      }),
      text: async () => `
        <h1>anthropics<!-- -->/<!-- -->skills</h1>
        <span>18<!-- --> <!-- -->skills</span>
        <span>735.1K<!-- --> total installs</span>
        <a href="https://github.com/anthropics/skills">GitHub</a>
      `,
    })));

    const app = new SkillFlowApp();
    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "search-import-groups",
      payload: {
        query: "skills",
      },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("groups");
    expect(response.data).toHaveProperty("exact", false);
  });

  test("accepts valid scan-local-import-groups payload", async () => {
    const app = {
      scanLocalImportGroups: vi.fn(async (path?: string) => ok({ groups: [], path })),
    } as unknown as SkillFlowApp;

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "scan-local-import-groups",
      payload: { path: "/tmp/local-skill" },
    });

    expect(response.ok).toBe(true);
    expect(app.scanLocalImportGroups).toHaveBeenCalledWith("/tmp/local-skill");
  });

  test("rejects invalid scan-local-import-groups path payload", async () => {
    const app = {
      scanLocalImportGroups: vi.fn(async (path?: string) => ok({ groups: [], path })),
    } as unknown as SkillFlowApp;

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "scan-local-import-groups",
      payload: { path: 123 },
    });

    expect(response.ok).toBe(false);
    expect(response.errors[0]?.code).toBe("BRIDGE_REQUEST_INVALID");
    expect(app.scanLocalImportGroups).not.toHaveBeenCalled();
  });

  test("accepts scan-local-import-groups without path payload", async () => {
    const app = {
      scanLocalImportGroups: vi.fn(async (path?: string) => ok({ groups: [], path })),
    } as unknown as SkillFlowApp;

    const responseWithoutPayload = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "scan-local-import-groups",
    });
    const responseWithEmptyPayload = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "scan-local-import-groups",
      payload: {},
    });

    expect(responseWithoutPayload.ok).toBe(true);
    expect(responseWithEmptyPayload.ok).toBe(true);
    expect(app.scanLocalImportGroups).toHaveBeenNthCalledWith(1, undefined);
    expect(app.scanLocalImportGroups).toHaveBeenNthCalledWith(2, undefined);
  });

  test("accepts valid preview-import-source payload", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <a href="/anthropics/skills/research"><h3>research</h3></a>
        <a href="/anthropics/skills/debugging"><h3>debugging</h3></a>
      `,
      json: async () => {
        throw new Error("not json");
      },
    })));

    const app = new SkillFlowApp();
    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "preview-import-source",
      payload: {
        locator: "anthropic/skills",
      },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("status", "ready");
  });

  test("accepts valid import-source payload", async () => {
    const repoPath = await createRepo(sandbox.sandboxRoot, {
      "skills/review/SKILL.md": skillDoc("review", "Review code."),
    });
    const app = new SkillFlowApp();

    const response = await executeBridgeRequest(app, {
      protocolVersion: PROTOCOL_VERSION,
      command: "import-source",
      payload: {
        locator: repoPath,
        draft: {
          selectedSkillIds: ["review"],
          enabledTargets: ["cursor"],
        },
      },
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty("status", "ready");
  });
});

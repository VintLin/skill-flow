import { describe, expect, test, vi } from "vitest";
import { SkillFlowApp } from "@skill-flow/query/runtime";
import * as githubCatalog from "@skill-flow/integration/utils/github-catalog";
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

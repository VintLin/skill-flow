import { describe, expect, test } from "vitest";
import { SkillFlowApp } from "@skill-flow/core/services/skill-flow.js";
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
});

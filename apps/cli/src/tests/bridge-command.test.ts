import { describe, expect, test } from "vitest";
import { SkillFlowApp } from "@skill-flow/core/services/skill-flow.js";
import { executeBridgeRequest } from "../bridge-command.js";
import { PROTOCOL_VERSION } from "@skill-flow/shared-types/protocol";
import { useSkillFlowSandbox } from "./test-helpers.js";

describe.sequential("bridge command dispatcher", () => {
  useSkillFlowSandbox();

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
});

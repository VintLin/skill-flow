import { describe, expect, test } from "vitest";
import {
  PROTOCOL_VERSION,
  buildBridgeResponse,
  parseBridgeRequest,
} from "../protocol.js";

describe("protocol", () => {
  test("parses valid request", () => {
    const request = parseBridgeRequest({
      protocolVersion: PROTOCOL_VERSION,
      requestId: "req-1",
      command: "toggle-pin",
      payload: { include: "all" },
    });

    expect(request.command).toBe("toggle-pin");
    expect(request.requestId).toBe("req-1");
  });

  test("rejects mismatched protocol version", () => {
    expect(() =>
      parseBridgeRequest({
        protocolVersion: "0.9",
        command: "list",
      }),
    ).toThrow(/Protocol version mismatch/);
  });

  test("builds response envelope", () => {
    const response = buildBridgeResponse({
      command: "doctor",
      requestId: "x",
      ok: true,
      data: { status: "healthy" },
    });

    expect(response).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      requestId: "x",
      command: "doctor",
      ok: true,
    });
  });
});

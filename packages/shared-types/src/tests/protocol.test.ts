import { describe, expect, test } from "vitest";
import {
  buildBridgeResponse,
  isBridgeCommandName,
  isJsonObject,
  isJsonValue,
  parseBridgeRequest,
  PROTOCOL_VERSION,
} from "../protocol.js";

describe("bridge protocol", () => {
  test("parses a valid bridge request with nested JSON payload", () => {
    expect(
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        requestId: "req-1",
        command: "import-source",
        payload: {
          locator: "owner/repo",
          selectedSkillIds: ["browse"],
          options: {
            dryRun: false,
          },
        },
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      requestId: "req-1",
      command: "import-source",
      payload: {
        locator: "owner/repo",
        selectedSkillIds: ["browse"],
        options: {
          dryRun: false,
        },
      },
    });
  });

  test("rejects protocol mismatches and invalid commands", () => {
    expect(() =>
      parseBridgeRequest({
        protocolVersion: "9.9",
        command: "list",
      }),
    ).toThrow(`Protocol version mismatch. Expected '${PROTOCOL_VERSION}', received '9.9'.`);

    expect(() =>
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        command: "unknown",
      }),
    ).toThrow("Bridge request 'command' must be one of:");
  });

  test("rejects non-json payloads and malformed request ids", () => {
    expect(() =>
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        command: "list",
        requestId: 123,
      }),
    ).toThrow("Bridge request 'requestId' must be a string when provided.");

    expect(() =>
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        command: "list",
        payload: {
          invalid: () => "nope",
        },
      }),
    ).toThrow("Bridge request 'payload' must be valid JSON.");
  });

  test("builds bridge responses with defaults and optional fields", () => {
    expect(
      buildBridgeResponse({
        command: "list",
        ok: true,
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      command: "list",
      ok: true,
      warnings: [],
      errors: [],
    });

    expect(
      buildBridgeResponse({
        command: "doctor",
        requestId: "req-2",
        ok: false,
        data: { status: "BLOCKED" },
        warnings: [{ code: "WARN", message: "warning" }],
        errors: [{ code: "ERR", message: "error" }],
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      command: "doctor",
      requestId: "req-2",
      ok: false,
      data: { status: "BLOCKED" },
      warnings: [{ code: "WARN", message: "warning" }],
      errors: [{ code: "ERR", message: "error" }],
    });
  });

  test("recognizes supported commands and valid json values", () => {
    expect(isBridgeCommandName("bootstrap")).toBe(true);
    expect(isBridgeCommandName("not-real")).toBe(false);

    expect(isJsonObject({ ok: true })).toBe(true);
    expect(isJsonObject(["x"])).toBe(false);

    expect(
      isJsonValue({
        nested: ["x", 1, null, { enabled: true }],
      }),
    ).toBe(true);
    expect(isJsonValue({ bad: () => "nope" })).toBe(false);
  });
});

import { describe, expect, test } from "vitest";
import bridgeCommandCatalogFixture from "../fixtures/bridge-command-catalog.json" with { type: "json" };
import {
  BRIDGE_COMMAND_NAMES,
  buildBridgeResponse,
  isBridgeCommandName,
  isJsonObject,
  isJsonValue,
  parseBridgeRequest,
  PROTOCOL_VERSION,
} from "../protocol.js";

describe("bridge protocol", () => {
  test("matches the bridge command catalog fixture", () => {
    expect(bridgeCommandCatalogFixture).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      commands: BRIDGE_COMMAND_NAMES,
    });
  });

  test("derives supported bridge commands from one catalog", () => {
    expect(BRIDGE_COMMAND_NAMES).toEqual([
      "bootstrap",
      "list",
      "inspect-state-migration",
      "migrate-state",
      "inspect",
      "inspect-enrichment",
      "search-import-groups",
      "scan-local-import-groups",
      "prepare-import-source",
      "preview-import-source",
      "commit-import-source",
      "import-source",
      "toggle-pin",
      "rename-source",
      "create-collection",
      "merge-groups",
      "restore-collection-sources",
      "doctor",
      "add",
      "apply",
      "update",
      "uninstall",
      "save-settings",
    ]);

    for (const command of BRIDGE_COMMAND_NAMES) {
      expect(isBridgeCommandName(command)).toBe(true);
    }

    expect(() =>
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        command: "unknown",
      }),
    ).toThrow(`Bridge request 'command' must be one of: ${BRIDGE_COMMAND_NAMES.join(", ")}.`);
  });

  test("parses a valid bridge request with nested JSON payload", () => {
    expect(
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        requestId: "req-1",
        command: "import-source",
        payload: {
          locator: "owner/repo",
          draft: {
            selectedSkills: [
              {
                uiId: "browse",
                selector: { kind: "repoPath", path: "browse" },
              },
            ],
            enabledTargets: [],
          },
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
        draft: {
          selectedSkills: [
            {
              uiId: "browse",
              selector: { kind: "repoPath", path: "browse" },
            },
          ],
          enabledTargets: [],
        },
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
    expect(isBridgeCommandName("inspect-state-migration")).toBe(true);
    expect(isBridgeCommandName("migrate-state")).toBe(true);
    expect(isBridgeCommandName("inspect-enrichment")).toBe(true);
    expect(isBridgeCommandName("prepare-import-source")).toBe(true);
    expect(isBridgeCommandName("commit-import-source")).toBe(true);
    expect(isBridgeCommandName("save-settings")).toBe(true);
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

  test("builds and parses state migration bridge messages", () => {
    expect(
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        requestId: "req-migrate",
        command: "migrate-state",
        payload: {
          to: 2,
          backup: true,
        },
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      requestId: "req-migrate",
      command: "migrate-state",
      payload: {
        to: 2,
        backup: true,
      },
    });

    expect(
      buildBridgeResponse({
        command: "inspect-state-migration",
        ok: true,
        data: { status: "current" },
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      command: "inspect-state-migration",
      ok: true,
      data: { status: "current" },
      warnings: [],
      errors: [],
    });
  });

  test("builds and parses inspect-enrichment bridge messages", () => {
    expect(
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        requestId: "req-enrich",
        command: "inspect-enrichment",
        payload: {
          sourceId: "demo-source",
        },
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      requestId: "req-enrich",
      command: "inspect-enrichment",
      payload: {
        sourceId: "demo-source",
      },
    });

    expect(
      buildBridgeResponse({
        command: "inspect-enrichment",
        ok: true,
        data: { sourceMetadata: { status: "ready" } },
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      command: "inspect-enrichment",
      ok: true,
      data: { sourceMetadata: { status: "ready" } },
      warnings: [],
      errors: [],
    });
  });

  test("builds and parses rename-source bridge messages", () => {
    expect(
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        requestId: "req-rename",
        command: "rename-source",
        payload: {
          sourceId: "demo-source",
          displayName: "Writing Tools",
        },
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      requestId: "req-rename",
      command: "rename-source",
      payload: {
        sourceId: "demo-source",
        displayName: "Writing Tools",
      },
    });

    expect(isBridgeCommandName("rename-source")).toBe(true);

    expect(
      buildBridgeResponse({
        command: "rename-source",
        ok: true,
        data: {
          sourceId: "demo-source",
          displayName: "Writing Tools",
        },
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      command: "rename-source",
      ok: true,
      data: {
        sourceId: "demo-source",
        displayName: "Writing Tools",
      },
      warnings: [],
      errors: [],
    });
  });

  test("accepts scan-local-import-groups bridge command", () => {
    const request = parseBridgeRequest({
      protocolVersion: PROTOCOL_VERSION,
      command: "scan-local-import-groups",
      payload: { path: "/tmp/local-skill" },
    });

    expect(request.command).toBe("scan-local-import-groups");
    expect(request.payload).toEqual({ path: "/tmp/local-skill" });
  });

  test("recognizes collection bridge commands", () => {
    expect(isBridgeCommandName("create-collection")).toBe(true);
    expect(isBridgeCommandName("merge-groups")).toBe(true);
    expect(isBridgeCommandName("restore-collection-sources")).toBe(true);
  });

  test("parses create-collection bridge request", () => {
    expect(
      parseBridgeRequest({
        protocolVersion: PROTOCOL_VERSION,
        requestId: "req-collection",
        command: "create-collection",
        payload: {
          displayName: "Writing Stack",
          skills: [
            {
              sourceId: "writing-source",
              leafId: "writing-source:skills/drafting",
              skillPath: "skills/drafting",
            },
          ],
          enabledTargets: ["codex"],
        },
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      requestId: "req-collection",
      command: "create-collection",
      payload: {
        displayName: "Writing Stack",
        skills: [
          {
            sourceId: "writing-source",
            leafId: "writing-source:skills/drafting",
            skillPath: "skills/drafting",
          },
        ],
        enabledTargets: ["codex"],
      },
    });
  });
});

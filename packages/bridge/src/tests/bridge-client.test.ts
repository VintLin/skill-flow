import path from "node:path";
import { describe, expect, test } from "vitest";
import { BridgeClient } from "../index.js";
import { PROTOCOL_VERSION } from "@skill-flow/shared-types/protocol";

describe("BridgeClient", () => {
  test("rejects when helper path does not exist", async () => {
    const client = new BridgeClient({
      cliPath: path.join(process.cwd(), "missing-cli.js"),
      timeoutMs: 500,
    });

    await expect(
      client.execute({
        protocolVersion: PROTOCOL_VERSION,
        command: "list",
      }),
    ).rejects.toThrow(/exited with code|Cannot find module/);
  });
});

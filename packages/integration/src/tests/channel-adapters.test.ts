import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

const originalHome = process.env.HOME;

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
});

async function withHome(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "skill-flow-targets-"));
  process.env.HOME = root;
  return root;
}

describe("channel adapters", () => {
  test("detects a built-in target from its agent root while returning the skills write root", async () => {
    const home = await withHome();
    vi.resetModules();
    const { createChannelAdapters } = await import("../adapters/channel-adapters.js");
    await fs.mkdir(path.join(home, ".zcode"), { recursive: true });
    const adapter = createChannelAdapters().find((item) => item.target === "zcode");
    expect(adapter).toBeDefined();
    if (!adapter) {
      return;
    }

    const detection = await adapter.detect();

    expect(detection.available).toBe(true);
    expect(detection.rootPath).toBe(path.join(home, ".zcode", "skills"));
  });

  test("custom targets still require the configured global path", async () => {
    const home = await withHome();
    vi.resetModules();
    const { createChannelAdapters } = await import("../adapters/channel-adapters.js");
    const globalPath = path.join(home, "custom-agent", "skills");
    await fs.mkdir(path.dirname(globalPath), { recursive: true });
    const [adapter] = createChannelAdapters([
      {
        id: "custom-agent",
        label: "Custom Agent",
        strategy: "symlink",
        kind: "custom",
        isMutable: true,
        globalPath,
      },
    ]);

    const detection = await adapter!.detect();

    expect(detection.available).toBe(false);
    expect(detection.rootPath).toBe(globalPath);
  });
});

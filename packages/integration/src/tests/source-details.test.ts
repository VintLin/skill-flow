import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchSkillsDirectorySourceDetails } from "../utils/source-details.js";

describe("source details", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("times out when skills directory source detail body hangs", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: vi.fn(() => new Promise(() => {})),
    })));

    const details = fetchSkillsDirectorySourceDetails("anthropics/skills");
    const assertion = expect(details).rejects.toMatchObject({
      name: "FetchTimeoutError",
      code: "FETCH_TIMEOUT",
      timeoutMs: 30_000,
      url: "https://skills.sh/anthropics/skills",
    });
    await vi.advanceTimersByTimeAsync(30_000);

    await assertion;
  });
});

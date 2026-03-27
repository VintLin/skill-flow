import { afterEach, describe, expect, test, vi } from "vitest";
import { fetchGitHubRepoStarCount } from "../utils/github-catalog.js";

describe("fetchGitHubRepoStarCount", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("returns stargazer count from the GitHub repo endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stargazers_count: 321 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchGitHubRepoStarCount("https://github.com/acme/alpha-hub")).resolves.toBe(321);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/alpha-hub",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/vnd.github+json",
        }),
      }),
    );
  });
});

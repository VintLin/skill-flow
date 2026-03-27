import { afterEach, describe, expect, test, vi } from "vitest";
import { inspectClawHubSkill } from "../utils/clawhub.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inspectClawHubSkill", () => {
  test("fetches clawhub skill details over http", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        skill: {
          slug: "ontology",
          displayName: "ontology",
          summary: "Typed knowledge graph",
          stats: {
            downloads: 134907,
            installsAllTime: 821,
            installsCurrent: 794,
            stars: 406,
          },
        },
        owner: {
          handle: "oswalpalash",
          displayName: "oswalpalash",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(inspectClawHubSkill("ontology")).resolves.toMatchObject({
      skill: {
        slug: "ontology",
        stats: {
          downloads: 134907,
          stars: 406,
        },
      },
      owner: {
        handle: "oswalpalash",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith("https://clawhub.ai/api/v1/skills/ontology");
  });

  test("throws a rate-limited error when clawhub returns 429", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    }));

    const error = await inspectClawHubSkill("ontology").catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error).toHaveProperty("code", "CLAWHUB_RATE_LIMITED");
  });
});

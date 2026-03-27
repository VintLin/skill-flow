import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildFailedSourceMetadataResult,
  buildSourceMetadataResult,
  parseSkillsSourcePage,
} from "../utils/source-details.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("parseSkillsSourcePage", () => {
  test("extracts total installs and repo URL from a skills.sh source page", () => {
    const html = `
      <div>
        <span>735.1K<!-- --> total installs</span>
        <a href="https://github.com/vercel-labs/skills">GitHub</a>
      </div>
    `;

    expect(parseSkillsSourcePage(html)).toEqual({
      totalInstalls: 735100,
      repoUrl: "https://github.com/vercel-labs/skills",
      repoLabel: "vercel-labs/skills",
    });
  });
});

describe("buildSourceMetadataResult", () => {
  test("returns a ready result when provider data exists", () => {
    expect(
      buildSourceMetadataResult({
        provider: "skills",
        totalInstalls: 735100,
      }),
    ).toEqual({
      status: "ready",
      provider: "skills",
      data: {
        provider: "skills",
        totalInstalls: 735100,
      },
    });
  });

  test("returns unsupported when provider data is empty", () => {
    expect(buildSourceMetadataResult({}, "github")).toEqual({
      status: "unsupported",
      provider: "github",
      reasonCode: "provider_data_unavailable",
    });
  });
});

describe("buildFailedSourceMetadataResult", () => {
  test("marks provider request failures as retryable failed results", () => {
    expect(
      buildFailedSourceMetadataResult("github", new Error("GitHub repo request failed with 403.")),
    ).toEqual({
      status: "failed",
      provider: "github",
      reasonCode: "provider_request_failed",
      retryable: true,
    });
  });

  test("maps provider-specific error codes to stable metadata reasons", () => {
    expect(
      buildFailedSourceMetadataResult(
        "github",
        Object.assign(new Error("limited"), { code: "GITHUB_RATE_LIMITED" }),
      ),
    ).toEqual({
      status: "failed",
      provider: "github",
      reasonCode: "provider_rate_limited",
      retryable: true,
    });

    expect(
      buildFailedSourceMetadataResult(
        "skills",
        Object.assign(new Error("invalid"), { code: "SKILLS_SOURCE_PARSE_FAILED" }),
      ),
    ).toEqual({
      status: "failed",
      provider: "skills",
      reasonCode: "provider_response_invalid",
      retryable: false,
    });
  });
});

describe("fetchFreshSourceMetadata", () => {
  test("resolves clawhub sources as clawhub metadata", async () => {
    vi.resetModules();
    vi.doMock("../utils/clawhub.js", () => ({
      inspectClawHubSkill: async () => ({
        owner: {
          handle: "oswalpalash",
          displayName: "oswalpalash",
        },
        skill: {
          summary: "Typed knowledge graph",
          stats: {
            stars: 406,
            installsAllTime: 821,
            installsCurrent: 794,
            downloads: 134907,
          },
        },
      }),
    }));
    const { fetchFreshSourceMetadata } = await import("../utils/source-details.js");

    await expect(
      fetchFreshSourceMetadata(
        {
          id: "ontology",
          locator: "clawhub:ontology",
          kind: "clawhub",
          displayName: "ontology",
          addedAt: "2026-03-27T00:00:00.000Z",
        },
        {
          id: "ontology",
          locator: "clawhub:ontology",
          kind: "clawhub",
          displayName: "ontology",
          checkoutPath: "/tmp/ontology",
          updatedAt: "2026-03-27T00:00:00.000Z",
          leafIds: [],
          invalidLeafs: [],
          packageSlug: "ontology",
        },
      ),
    ).resolves.toMatchObject({
      status: "ready",
      provider: "clawhub",
      data: {
        ownerHandle: "@oswalpalash",
        starCount: 406,
      },
    });
  });

  test("prefers skills metadata when a skills.sh page exists", async () => {
    vi.resetModules();
    vi.doMock("../utils/github-catalog.js", () => ({
      fetchGitHubRepoDetails: async () => ({
        provider: "github",
        repoLabel: "vercel-labs/agent-browser",
        repoUrl: "https://github.com/vercel-labs/agent-browser",
        starCount: 25087,
      }),
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => `
          <span>179.8K<!-- --> total installs</span>
          <a href="https://github.com/vercel-labs/agent-browser">GitHub</a>
        `,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ stargazers_count: 25087 }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchFreshSourceMetadata } = await import("../utils/source-details.js");

    await expect(fetchFreshSourceMetadata(
      {
        id: "agent-browser",
        locator: "https://github.com/vercel-labs/agent-browser",
        kind: "git",
        displayName: "agent-browser",
        addedAt: "2026-03-27T00:00:00.000Z",
      },
      undefined,
    )).resolves.toEqual({
      status: "ready",
      provider: "skills",
      data: {
        provider: "skills",
        repoLabel: "vercel-labs/agent-browser",
        repoUrl: "https://github.com/vercel-labs/agent-browser",
        sourceUrl: "https://skills.sh/vercel-labs/agent-browser",
        starCount: 25087,
        totalInstalls: 179800,
      },
    });
  });

  test("keeps skills metadata ready when github stars cannot be fetched", async () => {
    vi.resetModules();
    vi.doMock("../utils/github-catalog.js", () => ({
      fetchGitHubRepoDetails: async () => {
        throw Object.assign(new Error("limited"), { code: "GITHUB_RATE_LIMITED" });
      },
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `
        <span>179.8K<!-- --> total installs</span>
        <a href="https://github.com/vercel-labs/agent-browser">GitHub</a>
      `,
    }));
    const { fetchFreshSourceMetadata } = await import("../utils/source-details.js");

    await expect(fetchFreshSourceMetadata(
      {
        id: "agent-browser",
        locator: "https://github.com/vercel-labs/agent-browser",
        kind: "git",
        displayName: "agent-browser",
        addedAt: "2026-03-27T00:00:00.000Z",
      },
      undefined,
    )).resolves.toEqual({
      status: "ready",
      provider: "skills",
      data: {
        provider: "skills",
        repoLabel: "vercel-labs/agent-browser",
        repoUrl: "https://github.com/vercel-labs/agent-browser",
        sourceUrl: "https://skills.sh/vercel-labs/agent-browser",
        totalInstalls: 179800,
      },
    });
  });

  test("falls back to github when the skills.sh page is missing", async () => {
    vi.resetModules();
    vi.doMock("../utils/github-catalog.js", () => ({
      fetchGitHubRepoDetails: async () => ({
        provider: "github",
        repoLabel: "acme/alpha",
        repoUrl: "https://github.com/acme/alpha",
        starCount: 321,
      }),
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ stargazers_count: 321 }),
      });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchFreshSourceMetadata } = await import("../utils/source-details.js");

    await expect(fetchFreshSourceMetadata(
      {
        id: "alpha",
        locator: "https://github.com/acme/alpha",
        kind: "git",
        displayName: "alpha",
        addedAt: "2026-03-27T00:00:00.000Z",
      },
      undefined,
    )).resolves.toEqual({
      status: "ready",
      provider: "github",
      data: {
        provider: "github",
        repoLabel: "acme/alpha",
        repoUrl: "https://github.com/acme/alpha",
        starCount: 321,
      },
    });
  });

  test("returns a rate-limited failure when github rejects the repo request", async () => {
    vi.resetModules();
    vi.doMock("../utils/github-catalog.js", () => ({
      fetchGitHubRepoDetails: async () => {
        throw Object.assign(new Error("limited"), { code: "GITHUB_RATE_LIMITED" });
      },
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    }));
    const { fetchFreshSourceMetadata } = await import("../utils/source-details.js");

    await expect(fetchFreshSourceMetadata(
      {
        id: "alpha",
        locator: "https://github.com/acme/alpha",
        kind: "git",
        displayName: "alpha",
        addedAt: "2026-03-27T00:00:00.000Z",
      },
      undefined,
    )).resolves.toEqual({
      status: "failed",
      provider: "github",
      reasonCode: "provider_rate_limited",
      retryable: true,
    });
  });

  test("returns a parse failure when the skills page exists but installs cannot be parsed", async () => {
    vi.resetModules();
    vi.doMock("../utils/github-catalog.js", () => ({
      fetchGitHubRepoDetails: async () => ({
        provider: "github",
        repoLabel: "vercel-labs/agent-browser",
        repoUrl: "https://github.com/vercel-labs/agent-browser",
        starCount: 25087,
      }),
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<a href="https://github.com/vercel-labs/agent-browser">GitHub</a>`,
    }));
    const { fetchFreshSourceMetadata } = await import("../utils/source-details.js");

    await expect(fetchFreshSourceMetadata(
      {
        id: "agent-browser",
        locator: "https://github.com/vercel-labs/agent-browser",
        kind: "git",
        displayName: "agent-browser",
        addedAt: "2026-03-27T00:00:00.000Z",
      },
      undefined,
    )).resolves.toEqual({
      status: "failed",
      provider: "skills",
      reasonCode: "provider_response_invalid",
      retryable: false,
    });
  });
});

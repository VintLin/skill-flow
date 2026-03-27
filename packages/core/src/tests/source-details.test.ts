import { describe, expect, test } from "vitest";
import {
  buildFailedSourceMetadataResult,
  buildSourceMetadataResult,
  parseSkillsSourcePage,
} from "../utils/source-details.js";

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
});

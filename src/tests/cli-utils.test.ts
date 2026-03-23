import { describe, expect, test } from "vitest";
import { resolveAddSourceLocator } from "../utils/cli.js";

describe("cli utils", () => {
  test("leaves direct source locators unchanged without a catalog override", () => {
    expect(resolveAddSourceLocator("JimLiu/baoyu-skills")).toBe("JimLiu/baoyu-skills");
  });

  test("maps --from clawhub sources to clawhub locators", () => {
    expect(resolveAddSourceLocator("find-skills-skill", "clawhub")).toBe(
      "clawhub:find-skills-skill",
    );
    expect(resolveAddSourceLocator("clawhub:find-skills-skill", "clawhub")).toBe(
      "clawhub:find-skills-skill",
    );
  });

  test("rejects unsupported source catalogs", () => {
    expect(() => resolveAddSourceLocator("find-skills-skill", "github")).toThrow(
      "Unsupported source catalog 'github'.",
    );
  });
});

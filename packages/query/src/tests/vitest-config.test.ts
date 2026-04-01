import { describe, expect, test } from "vitest";
import config from "../../vitest.config.js";

describe("vitest config", () => {
  test("runs source tests without picking up dist artifacts", () => {
    expect(config.test?.include).toEqual(["src/tests/**/*.test.ts"]);
    expect(config.test?.exclude).toEqual(expect.arrayContaining(["dist/**"]));
  });
});

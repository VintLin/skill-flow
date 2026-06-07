import { describe, expect, test } from "vitest";
import { SOURCE_KINDS } from "./types.js";
import type { SourceKind } from "./types.js";

describe("SourceKind", () => {
  test("enumerates the current public source kinds", () => {
    const sourceKinds: readonly SourceKind[] = SOURCE_KINDS;
    const currentSourceKinds: readonly SourceKind[] = SOURCE_KINDS;

    expect(sourceKinds).toEqual(["git", "local", "clawhub", "collection"]);
    expect(currentSourceKinds).toBe(sourceKinds);
  });
});

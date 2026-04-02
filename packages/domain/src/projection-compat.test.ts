import { describe, expect, test } from "vitest";
import { getManagedDeployments } from "./projection-compat.js";
import type { LockFile } from "./types.js";

describe("projection compatibility", () => {
  test("treats missing legacy deployments as an empty managed deployment list", () => {
    const lockFile = {
      schemaVersion: 1,
      sources: [],
      leafInventory: [],
    } as unknown as LockFile;

    expect(getManagedDeployments(lockFile)).toEqual([]);
  });
});

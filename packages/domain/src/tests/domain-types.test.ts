import { describe, expect, test } from "vitest";

import type { LockFile, Manifest, WorkflowSummary } from "../types.js";

describe("domain types", () => {
  test("exports core workflow shapes", () => {
    const manifest = {} as Manifest;
    const lockFile = {} as LockFile;
    const summary = {} as WorkflowSummary;

    expect(manifest).toBeDefined();
    expect(lockFile).toBeDefined();
    expect(summary).toBeDefined();
  });
});

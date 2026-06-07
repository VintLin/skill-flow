import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const typesSource = readFileSync(path.join(testDir, "types.ts"), "utf8");

describe("current domain type surface", () => {
  test("does not export V1 authority shadow types", () => {
    expect(typesSource).not.toMatch(/export (?:type|interface) Manifest\b/);
    expect(typesSource).not.toMatch(/export (?:type|interface) SharedPreferences\b/);
    expect(typesSource).not.toMatch(/export (?:type|interface) DeploymentRecord\b/);
  });

  test("does not export public V2 suffix aliases after cleanup", () => {
    expect(typesSource).not.toMatch(/export type \w+V2\b/);
    expect(typesSource).not.toMatch(/export interface \w+V2\b/);
    expect(typesSource).not.toMatch(/export class \w+V2\b/);
  });

  test("does not expose removed redundant current fields", () => {
    const leafRecordSource = typesSource.slice(
      typesSource.indexOf("export type LeafRecord = {"),
      typesSource.indexOf("export type ProjectionRecord = {"),
    );
    const sourceLockRecordSource = typesSource.slice(
      typesSource.indexOf("export type SourceLockRecord = {"),
      typesSource.indexOf("export interface LockFile"),
    );

    expect(typesSource).not.toMatch(/locatorIndex:/);
    expect(typesSource).not.toMatch(/lease:\s*\{/);
    expect(leafRecordSource).not.toMatch(/displayName\s*\??:\s*string/);
    for (const field of [
      "id",
      "locator",
      "kind",
      "displayName",
      "originalDisplayName",
      "checkoutPath",
      "updatedAt",
      "invalidLeafs",
      "invalidLeafPaths",
      "commitSha",
    ]) {
      expect(sourceLockRecordSource).not.toMatch(new RegExp(`${field}\\s*\\??:`));
    }
  });
});

import { describe, expect, test } from "vitest";
import {
  createEmptySharedPreferences,
  normalizeSharedPreferences,
} from "../preferences-store.js";

describe("preferences-store", () => {
  test("creates empty shared preferences with no pinned sources", () => {
    expect(createEmptySharedPreferences()).toEqual({
      schemaVersion: 1,
      pinnedSourceIds: [],
    });
  });

  test("normalizes invalid preferences payloads to an empty shape", () => {
    expect(normalizeSharedPreferences(null)).toEqual(createEmptySharedPreferences());
    expect(normalizeSharedPreferences({})).toEqual(createEmptySharedPreferences());
    expect(
      normalizeSharedPreferences({
        schemaVersion: 999,
        pinnedSourceIds: ["alpha"],
      }),
    ).toEqual(createEmptySharedPreferences());
  });

  test("deduplicates pinned ids and drops invalid entries", () => {
    expect(
      normalizeSharedPreferences({
        schemaVersion: 1,
        pinnedSourceIds: ["alpha", "", "beta", "alpha", 42],
      }),
    ).toEqual({
      schemaVersion: 1,
      pinnedSourceIds: ["alpha", "beta"],
    });
  });
});

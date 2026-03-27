import { SCHEMA_VERSION } from "../utils/constants.js";
import type { SharedPreferences } from "../domain/types.js";

export function createEmptySharedPreferences(): SharedPreferences {
  return {
    schemaVersion: SCHEMA_VERSION,
    pinnedSourceIds: [],
  };
}

export function normalizeSharedPreferences(value: unknown): SharedPreferences {
  if (!isSharedPreferencesShape(value)) {
    return createEmptySharedPreferences();
  }

  const seen = new Set<string>();
  const pinnedSourceIds: string[] = [];

  for (const pinnedSourceId of value.pinnedSourceIds) {
    if (typeof pinnedSourceId !== "string" || pinnedSourceId.length === 0 || seen.has(pinnedSourceId)) {
      continue;
    }
    seen.add(pinnedSourceId);
    pinnedSourceIds.push(pinnedSourceId);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    pinnedSourceIds,
  };
}

function isSharedPreferencesShape(value: unknown): value is SharedPreferences {
  return (
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === SCHEMA_VERSION &&
    "pinnedSourceIds" in value &&
    Array.isArray(value.pinnedSourceIds)
  );
}

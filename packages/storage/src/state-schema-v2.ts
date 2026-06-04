import fs from "node:fs/promises";
import path from "node:path";
import type {
  CollectionsFileV2,
  LockFileV2,
  ManifestFileV2,
  PreferencesFileV2,
} from "@skill-flow/domain/types";

async function writeAuthorityFile(stateRoot: string, fileName: string, payload: unknown): Promise<void> {
  await fs.mkdir(stateRoot, { recursive: true });
  await fs.writeFile(path.join(stateRoot, fileName), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function writeManifestV2(stateRoot: string, manifest: ManifestFileV2): Promise<void> {
  return writeAuthorityFile(stateRoot, "manifest.json", manifest);
}

export function writeLockV2(stateRoot: string, lockFile: LockFileV2): Promise<void> {
  return writeAuthorityFile(stateRoot, "lock.json", lockFile);
}

export function writePreferencesV2(stateRoot: string, preferences: PreferencesFileV2): Promise<void> {
  return writeAuthorityFile(stateRoot, "preferences.json", preferences);
}

export function writeCollectionsV2(stateRoot: string, collections: CollectionsFileV2): Promise<void> {
  return writeAuthorityFile(stateRoot, "collections.json", collections);
}

import type {
  DeploymentTargetName,
  LockFile,
  SourceLockRecord,
  SourceManifestRecord,
} from "@skill-flow/domain/types";

export type SourceSnapshot = {
  manifest: SourceManifestRecord;
  lock: SourceLockRecord;
  leafCount: number;
  invalidLeafCount: number;
};

export type SourcePreview = {
  locator: string;
  displayName: string;
  requestedPath?: string;
  leafs: LockFile["leafInventory"];
};

export type AddSourceOptions = {
  path?: string;
  enabledTargets?: DeploymentTargetName[];
  selectionMode?: "all" | "selected";
  project?: boolean;
  sourceIdOverride?: string;
  displayNameOverride?: string;
  originLocator?: string;
  originRequestedPath?: string;
  originBranch?: string;
  importedFromTargets?: DeploymentTargetName[];
  observedTargets?: Array<{
    target: DeploymentTargetName;
    rootPath: string;
    targetPath: string;
  }>;
  importMode?: "explicit-add" | "bootstrap-detected";
};

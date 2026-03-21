export type Warning = {
  code: string;
  message: string;
};

export type Failure = {
  code: string;
  message: string;
};

export type Result<T> =
  | { ok: true; data: T; warnings: Warning[]; errors: [] }
  | { ok: false; data?: T; warnings: Warning[]; errors: Failure[] };

export type SourceKind = "git";

export type DeploymentTargetName =
  | "claude-code"
  | "codex"
  | "cursor"
  | "opencode"
  | "openclaw"
  | "pi";

export type DeploymentStrategy = "symlink" | "copy";

export type HealthStatus =
  | "HEALTHY"
  | "ACTIVE"
  | "INACTIVE"
  | "PARTIAL"
  | "BLOCKED"
  | "INVALID"
  | "UPDATE AVAILABLE"
  | "UP TO DATE"
  | "DRIFT DETECTED";

export type SourceManifestRecord = {
  id: string;
  locator: string;
  kind: SourceKind;
  displayName: string;
  addedAt: string;
};

export type TargetBinding = {
  enabled: boolean;
  leafIds: string[];
};

export type SourceBinding = {
  targets: Partial<Record<DeploymentTargetName, TargetBinding>>;
};

export type Manifest = {
  schemaVersion: 1;
  sources: SourceManifestRecord[];
  bindings: Record<string, SourceBinding>;
};

export type InvalidLeafRecord = {
  path: string;
  reason: string;
};

export type SourceLockRecord = {
  id: string;
  locator: string;
  kind: SourceKind;
  displayName: string;
  checkoutPath: string;
  commitSha: string;
  updatedAt: string;
  leafIds: string[];
  invalidLeafs: InvalidLeafRecord[];
};

export type LeafRecord = {
  id: string;
  sourceId: string;
  name: string;
  linkName: string;
  title: string;
  description: string;
  relativePath: string;
  absolutePath: string;
  skillFilePath: string;
  contentHash: string;
  metadataWarnings: string[];
  valid: true;
};

export type DeploymentRecord = {
  sourceId: string;
  leafId: string;
  target: DeploymentTargetName;
  targetPath: string;
  strategy: DeploymentStrategy;
  status: "active" | "drifted" | "blocked" | "removed";
  contentHash: string;
  appliedAt: string;
};

export type LockFile = {
  schemaVersion: 1;
  sources: SourceLockRecord[];
  leafInventory: LeafRecord[];
  deployments: DeploymentRecord[];
};

export type ChannelDetection = {
  target: DeploymentTargetName;
  strategy: DeploymentStrategy;
  available: boolean;
  rootPath: string;
  reason?: string;
};

export type DeploymentActionKind =
  | "create"
  | "update"
  | "remove"
  | "noop"
  | "blocked";

export type DeploymentAction = {
  kind: DeploymentActionKind;
  sourceId: string;
  leafId: string;
  target: DeploymentTargetName;
  strategy: DeploymentStrategy;
  sourcePath: string;
  targetPath: string;
  previousTargetPath?: string;
  reason?: string;
  contentHash: string;
};

export type DeploymentPlan = {
  actions: DeploymentAction[];
  warnings: Warning[];
  blocked: DeploymentAction[];
};

export type DoctorIssueSeverity = "info" | "warning" | "error";

export type DoctorIssue = {
  severity: DoctorIssueSeverity;
  sourceId: string;
  target?: DeploymentTargetName;
  leafId?: string;
  code: string;
  message: string;
};

export type DoctorReport = {
  status: "HEALTHY" | "PARTIAL" | "BLOCKED";
  issues: DoctorIssue[];
};

export type WorkflowSummary = {
  source: SourceManifestRecord;
  lock: SourceLockRecord | undefined;
  leafs: LeafRecord[];
  bindings: SourceBinding;
  activeTargetCount: number;
  health: HealthStatus;
};

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

export type SourceKind = "local" | "git" | "clawhub";

export type DeploymentTargetName =
  | "claude-code"
  | "codex"
  | "cursor"
  | "github-copilot"
  | "gemini-cli"
  | "opencode"
  | "openclaw"
  | "pi"
  | "windsurf"
  | "roo-code"
  | "cline"
  | "amp"
  | "kiro";

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
  requestedPath?: string;
  selectionMode?: "all" | "partial";
  originLocator?: string;
  originRequestedPath?: string;
};

export type TargetBinding = {
  enabled: boolean;
  leafIds: string[];
};

export type SourceBinding = {
  targets: Partial<Record<DeploymentTargetName, TargetBinding>>;
};

export type DraftBinding = {
  enabledTargets: DeploymentTargetName[];
  selectedLeafIds: string[];
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

export type DuplicateLeafRecord = {
  path: string;
  keptPath: string;
};

export type SourceLockRecord = {
  id: string;
  locator: string;
  kind: SourceKind;
  displayName: string;
  checkoutPath: string;
  updatedAt: string;
  leafIds: string[];
  invalidLeafs: InvalidLeafRecord[];
  commitSha?: string;
  packageSlug?: string;
  resolvedVersion?: string;
  contentHash?: string;
  versionMode?: "pinned" | "floating";
  originBranch?: string;
  importedFromTargets?: DeploymentTargetName[];
  importMode?: "explicit-add" | "bootstrap-detected";
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

export type SourceUpdateDiffKind =
  | "added"
  | "removed"
  | "moved"
  | "invalidated"
  | "changed";

export type SourceUpdateDiff = {
  kind: SourceUpdateDiffKind;
  sourceId: string;
  leafId: string;
  relativePath: string;
  contentHash: string;
  requestedPath?: string;
  previousLeafId?: string;
  previousRelativePath?: string;
  previousContentHash?: string;
};

export type SourceUpdateResultItem = {
  sourceId: string;
  changed: boolean;
  requestedPath?: string;
  selectionMode?: "all" | "partial";
  addedLeafIds: string[];
  removedLeafIds: string[];
  invalidatedLeafIds: string[];
  diffs: SourceUpdateDiff[];
};

export type SourceUpdateResult = {
  updated: SourceUpdateResultItem[];
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
  relocateExternalToTargetPath?: string;
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
  sourceLabel?: string;
  target?: DeploymentTargetName;
  leafId?: string;
  leafLabel?: string;
  code: string;
  message: string;
};

export type DoctorReport = {
  status: "HEALTHY" | "PARTIAL" | "BLOCKED";
  issues: DoctorIssue[];
};

export type ConfigBootFailure = {
  sourceId: string;
  message: string;
};

export type ConfigBootStatus = {
  phase: "success" | "partial_failure";
  updatedSourceIds: string[];
  failedSources: ConfigBootFailure[];
};

export type WorkflowSummary = {
  source: SourceManifestRecord;
  lock: SourceLockRecord | undefined;
  leafs: LeafRecord[];
  bindings: SourceBinding;
  activeTargetCount: number;
  health: HealthStatus;
  issueCounts?: { warning: number; error: number };
  healthReason?: string;
};

export type SkillCandidateAction =
  | { type: "none" }
  | { type: "add-git"; locator: string; requestedPath?: string }
  | { type: "add-clawhub"; slug: string; version?: string };

export type SkillCandidate = {
  id: string;
  title: string;
  description: string;
  source: "local" | "builtin-git" | "clawhub";
  sourceLabel: string;
  sourceId: string;
  sourceKind: SourceKind;
  locator: string;
  relativePath?: string;
  installed: boolean;
  action: SkillCandidateAction;
};

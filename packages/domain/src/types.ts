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
  selectedLeafIds?: string[];
  targets: Partial<Record<DeploymentTargetName, TargetBinding>>;
};

export type DraftBinding = {
  enabledTargets: DeploymentTargetName[];
  selectedLeafIds: string[];
};

export type AddSourceDraftOptions = {
  skillNames?: string[];
  agentTargets?: DeploymentTargetName[];
  draft?: DraftBinding;
  skipTargetDetection?: boolean;
};

export type AddSourcePreparation = {
  sourceId: string;
  availableTargets: DeploymentTargetName[];
  draft: DraftBinding;
  leafs: LeafRecord[];
};

export type Manifest = {
  schemaVersion: 1;
  sources: SourceManifestRecord[];
  bindings: Record<string, SourceBinding>;
};

export type SharedPreferences = {
  schemaVersion: 1;
  pinnedSourceIds: string[];
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
  targetRootPath?: string;
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
  targetRootPath?: string;
  previousTargetPath?: string;
  previousTargetRootPath?: string;
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

export type SourceStats = {
  provider?: SourceMetadataProvider;
  repoLabel?: string;
  repoUrl?: string;
  sourceUrl?: string;
  starCount?: number;
  forkCount?: number;
  totalInstalls?: number;
  weeklyInstalls?: number;
  downloadCount?: number;
  ownerHandle?: string;
  ownerDisplayName?: string;
  summary?: string;
  description?: string;
  topics?: string[];
  language?: string;
  defaultBranch?: string;
  pushedAt?: string;
};

export type SourceMetadataProvider = "github" | "skills" | "clawhub";

export type SourceMetadataReasonCode =
  | "provider_not_supported"
  | "provider_data_unavailable"
  | "provider_request_failed"
  | "provider_rate_limited"
  | "provider_response_invalid";

export type SourceMetadataResult =
  | { status: "ready"; provider: SourceMetadataProvider; data: SourceStats }
  | {
      status: "unsupported";
      provider?: SourceMetadataProvider;
      reasonCode: SourceMetadataReasonCode;
    }
  | {
      status: "failed";
      provider?: SourceMetadataProvider;
      reasonCode: SourceMetadataReasonCode;
      retryable: boolean;
    };

export type SourceMetadataCacheEntry = {
  sourceId: string;
  provider?: SourceMetadataProvider;
  status: SourceMetadataResult["status"];
  reasonCode?: SourceMetadataReasonCode;
  retryable?: boolean;
  checkedAt: string;
  expiresAt: string;
  data?: SourceStats;
};

export type SourceMetadataCache = Record<string, SourceMetadataCacheEntry>;

export type ImportReasonCode = SourceMetadataReasonCode;

export type UnifiedSourceTrust = {
  official?: boolean;
  trending?: boolean;
  hot?: boolean;
  audited?: boolean;
};

export type UnifiedSourceOwner = {
  slug: string;
  sourceUrl: string;
  githubUrl?: string;
  sourceCount?: number;
  skillCount?: number;
  totalInstalls?: number;
};

export type UnifiedSourceSkillInstalledOn = {
  agent: string;
  installs?: number;
};

export type UnifiedSourceSkillAudits = {
  gen?: string;
  socket?: string;
  snyk?: string;
  riskLevel?: string;
};

export type UnifiedSourceSkill = {
  skillId: string;
  title: string;
  installs?: number;
  weeklyInstalls?: number;
  firstSeen?: string;
  summary?: string;
  installedOn?: UnifiedSourceSkillInstalledOn[];
  audits?: UnifiedSourceSkillAudits;
};

export type UnifiedSourceSnapshot = {
  canonicalRepo: string;
  aliases: string[];
  title: string;
  provider: "skills";
  sourceUrl: string;
  repoUrl: string;
  repoLabel: string;
  totalInstalls?: number;
  skillCount?: number;
  repoStars?: number;
  forkCount?: number;
  description?: string;
  topics?: string[];
  language?: string;
  defaultBranch?: string;
  pushedAt?: string;
  owner: UnifiedSourceOwner;
  skills: UnifiedSourceSkill[];
  trust?: UnifiedSourceTrust;
};

export type UnifiedSourceSnapshotCacheEntry = {
  canonicalRepo: string;
  checkedAt: string;
  expiresAt: string;
  data: UnifiedSourceSnapshot;
};

export type ImportSearchHit = {
  id: string;
  skillId: string;
  title: string;
  installs?: number;
  source: string;
  canonicalRepo: string;
};

export type ImportSearchSnapshot = {
  query: string;
  checkedAt: string;
  expiresAt: string;
  hits: ImportSearchHit[];
  groups: string[];
};

export type ImportRecommendationFeedId =
  | "seed"
  | "official"
  | "trending"
  | "hot"
  | "audits";

export type ImportRecommendationFeed = {
  id: ImportRecommendationFeedId;
  checkedAt: string;
  expiresAt: string;
  groups: string[];
};

export type ImportDataCache = {
  searches: Record<string, ImportSearchSnapshot>;
  sources: Record<string, UnifiedSourceSnapshotCacheEntry>;
  recommendations: Record<string, ImportRecommendationFeed>;
};

export type ImportAsyncState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | {
      status: "failed";
      reasonCode: ImportReasonCode;
      retryable: boolean;
    };

export type ImportGroupCandidate = {
  id: string;
  provider: "skills";
  locator: string;
  canonicalRepo: string;
  aliases: string[];
  title: string;
  installed: boolean;
  summary?: string;
  sourceUrl?: string;
  repoUrl?: string;
  starCount?: number;
  totalInstalls?: number;
  skillCount?: number;
  matchedSkillNames?: string[];
  matchedSkills?: Array<{
    skillId: string;
    title: string;
    installs?: number;
  }>;
  snapshot?: UnifiedSourceSnapshot;
  enrichState: ImportAsyncState;
  previewState: ImportAsyncState;
};

export type ImportPreviewSkill = {
  id: string;
  title: string;
  summary: string;
  selectedByDefault: boolean;
};

export type ImportPreviewTarget = {
  id: DeploymentTargetName;
  selectedByDefault: boolean;
};

export type ImportDraft = {
  selectedSkillIds: string[];
  enabledTargets: DeploymentTargetName[];
};

export type ImportPreviewResult =
  | {
      status: "ready";
      locator: string;
      canonicalRepo: string;
      snapshot?: UnifiedSourceSnapshot;
      selectedSkillIds: string[];
      enabledTargets: DeploymentTargetName[];
      skills: ImportPreviewSkill[];
      targets: ImportPreviewTarget[];
    }
  | {
      status: "failed";
      reasonCode: ImportReasonCode;
      retryable: boolean;
    };

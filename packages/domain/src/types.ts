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

export const SOURCE_KINDS = ["git", "local", "clawhub", "collection"] as const;

export type SourceKind = typeof SOURCE_KINDS[number];

export type DeploymentTargetName =
  | "claude-code"
  | "codex"
  | "cursor"
  | "github-copilot"
  | "gemini-cli"
  | "opencode"
  | "openclaw"
  | "hermes-agent"
  | "minimax-code"
  | "kimi-code"
  | "workbuddy"
  | "codebuddy"
  | "pi"
  | "trae"
  | "trae-cn"
  | "windsurf"
  | "roo-code"
  | "cline"
  | "amp"
  | "kiro"
  | "zcode"
  | "grok-build";

export type DeploymentTargetId = DeploymentTargetName | (string & {});

export type DeploymentStrategy = "symlink" | "copy";

export type CustomTargetDefinition = {
  id: string;
  name?: string;
  globalPath: string;
  projectPathTemplate: string;
  strategy: DeploymentStrategy;
  createdAt: string;
  updatedAt: string;
};

export type TargetKind = "builtin" | "custom";

export type MergedTargetDefinition = {
  id: string;
  label: string;
  strategy: DeploymentStrategy;
  kind: TargetKind;
  isMutable: boolean;
  globalPath: string;
  projectPathTemplate?: string;
  iconAssetName?: string;
};

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

export type DraftBinding = {
  enabledTargets: DeploymentTargetId[];
  selectedLeafIds: string[];
};

export type ProjectScope =
  | { kind: "global" }
  | { kind: "project"; projectId: string };

export type RecentProject = {
  projectId: string;
  title: string;
  lastActivityAt: string;
  projectPath?: string;
  tools?: string[];
};

export type ScopedSourceDrafts = Record<string, Record<string, DraftBinding>>;

export type CollectionSkillRef = {
  sourceId: string;
  leafId: string;
};

export type CollectionRestoreSnapshot = {
  selectedLeafIds: string[];
  enabledTargets: DeploymentTargetId[];
};

export type CollectionViewRecord = {
  id: string;
  displayName: string;
  includedSkills: CollectionSkillRef[];
  hiddenSourceIds: string[];
  restoreSnapshots: Record<string, CollectionRestoreSnapshot>;
  createdAt: string;
  updatedAt: string;
};

export type InvalidLeafRecord = {
  path: string;
  reason: string;
};

export type DuplicateLeafRecord = {
  path: string;
  keptPath: string;
};

export type ProjectionMode = "managed" | "bootstrap-imported";

export type SourceUpdateDiffKind =
  | "added"
  | "removed"
  | "moved"
  | "invalidated"
  | "changed";

export type ChannelDetection = {
  target: DeploymentTargetId;
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
  target: DeploymentTargetId;
  strategy: DeploymentStrategy;
  sourcePath: string;
  targetPath: string;
  targetRootPath?: string;
  previousTargetPath?: string;
  previousTargetRootPath?: string;
  relocateExternalToTargetPath?: string;
  reason?: string;
  diagnostics?: Diagnostic[];
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
  target?: DeploymentTargetId;
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

export type SourceSummaryRecord = {
  id: SourceId;
  locator: string;
  kind: SourceKind;
  displayName: string;
  originalDisplayName: string;
  addedAt: string;
  selectionMode?: "all" | "selected";
  requestedPath?: string;
  originRequestedPath?: string;
  originLocator?: string;
};

export type SourceLockSummaryRecord = {
  id: SourceId;
  locator: string;
  kind: SourceKind;
  displayName: string;
  originalDisplayName: string;
  checkoutPath: string;
  updatedAt: string;
  leafIds: SkillLeafId[];
  invalidLeafs: InvalidLeafRecord[];
  commitSha?: string;
  packageSlug?: string;
  resolvedVersion?: string;
  contentHash?: string;
  versionMode?: "pinned" | "floating";
  originBranch?: string;
  importedFromTargets?: DeploymentTargetId[];
  observedTargets?: Array<{
    target: DeploymentTargetId;
    rootPath: string;
    targetPath: string;
  }>;
  importMode?: "explicit-add" | "bootstrap-detected";
};

export type LeafSummaryRecord = {
  id: SkillLeafId;
  sourceId: SourceId;
  name: string;
  linkName: string;
  title: string;
  description: string;
  relativePath: RepoPath;
  absolutePath: string;
  skillFilePath: string;
  contentHash: string;
  metadataWarnings: string[];
  sourceTitle?: string;
  valid: boolean;
};

export type SourceTargetBindingSummary = {
  enabled: boolean;
  leafIds: SkillLeafId[];
};

export type SourceBindingSummary = {
  selectedLeafIds: SkillLeafId[];
  resolvedSelectedLeafCount: number;
  targets: Partial<Record<DeploymentTargetId, SourceTargetBindingSummary>>;
};

export type DeploymentSummaryRecord = {
  sourceId: SourceId;
  leafId: SkillLeafId;
  target: DeploymentTargetId;
  targetPath: string;
  targetRootPath?: string;
  strategy: DeploymentStrategy;
  status: "active" | "removed" | "blocked";
  contentHash: string;
  appliedAt: string;
};

export type WorkflowSummary = {
  source: SourceSummaryRecord;
  lock: SourceLockSummaryRecord | undefined;
  leafs: LeafSummaryRecord[];
  bindings: SourceBindingSummary;
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

export type RepoMetadataProvider = "skills" | "github" | "clawhub" | "local";

export type RepoMetadataIdentity = {
  canonicalRepo: string;
  aliases: string[];
  origins: RepoMetadataProvider[];
};

export type RepoMetadataProviderEntry = {
  provider: RepoMetadataProvider;
  status: "ready" | "failed" | "unsupported";
  checkedAt: string;
  expiresAt: string;
  reasonCode?: SourceMetadataReasonCode;
  retryable?: boolean;
  data?: SourceStats;
  snapshot?: UnifiedSourceSnapshot;
};

export type ResolvedRepoMetadataField =
  | "title"
  | "author"
  | "summary"
  | "githubUrl"
  | "sourceUrl"
  | "skillCount"
  | "downloadCount"
  | "starCount";

export type ResolvedRepoMetadata = {
  title?: string;
  author?: string;
  summary?: string;
  githubUrl?: string;
  sourceUrl?: string;
  skillCount?: number;
  downloadCount?: number;
  starCount?: number;
  fieldSources: Partial<Record<ResolvedRepoMetadataField, RepoMetadataProvider>>;
};

export type RepoMetadataCacheEntry = {
  canonicalRepo: string;
  checkedAt: string;
  expiresAt: string;
  identity: RepoMetadataIdentity;
  providers: Partial<Record<RepoMetadataProvider, RepoMetadataProviderEntry>>;
  resolved: ResolvedRepoMetadata;
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
  repos: Record<string, RepoMetadataCacheEntry>;
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

export type LocalImportValidationStatus =
  | "matched"
  | "changed"
  | "missing"
  | "ambiguous"
  | "origin-unavailable"
  | "local-only";

export type LocalImportChoiceId = "origin" | "local";

export type LocalImportDetectedSkill = {
  id: string;
  title: string;
  localPath: string;
  discoveredTargets: DeploymentTargetId[];
  validationStatus: LocalImportValidationStatus;
  originSkillId?: string;
};

export type LocalImportCandidateInfo = {
  validationStatus: LocalImportValidationStatus;
  selectedChoiceId: LocalImportChoiceId;
  choices: LocalImportChoice[];
  detectedSkills: LocalImportDetectedSkill[];
};

export type LocalScanSourcePathKind = "target-agent" | "manual";

export type LocalScanGroupStatus =
  | "local-only"
  | "matched"
  | "changed"
  | "missing"
  | "ambiguous"
  | "origin-unavailable"
  | "version-conflict"
  | "already-managed";

export type LocalScanSourcePath = {
  path: string;
  kind: LocalScanSourcePathKind;
  contentHash: string;
  alreadyManaged: boolean;
  target?: DeploymentTargetId;
};

export type LocalScanSkillVariant = {
  id: string;
  path: string;
  contentHash: string;
  selectedByDefault: boolean;
  importable: boolean;
};

export type LocalScanSkill = {
  id: string;
  title: string;
  status: LocalScanGroupStatus;
  variants: LocalScanSkillVariant[];
  selectionRequired: boolean;
  originSkillId?: string;
};

export type LocalScanOrigin = {
  canonicalRepo: string;
  locator: string;
  previewStatus: "ready" | "failed";
};

export type LocalScanGroup = {
  id: string;
  title: string;
  status: LocalScanGroupStatus;
  sourcePaths: LocalScanSourcePath[];
  skills: LocalScanSkill[];
  importChoices: LocalScanImportChoice[];
  origin?: LocalScanOrigin;
};

export type ImportGroupCandidate = {
  id: string;
  provider: "skills" | "local";
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
  localImport?: LocalImportCandidateInfo;
};

export type ImportPreviewTarget = {
  id: DeploymentTargetId;
  selectedByDefault: boolean;
};

export type ImportPreparationStatus =
  | "preparing"
  | "ready"
  | "committing"
  | "failed"
  | "stale";

export type ImportPreparationCache = {
  records: Record<string, ImportPreparationRecord>;
};

export type ImportPreparationResult =
  | {
      status: "preparing" | "ready" | "stale";
      preparationId: string;
      locator: string;
      canonicalRepo: string;
      preparedAt?: string;
      expiresAt?: string;
    }
  | {
      status: "failed";
      preparationId?: string;
      reasonCode: ImportReasonCode | string;
      retryable: boolean;
    };

export type ImportCommitDraft = ImportDraft & {
  preparationId: string;
};

export type ImportPreviewResult =
  | {
      status: "ready";
      version: 2;
      locator: string;
      canonicalRepo: string;
      preparationId?: string;
      preparationStatus?: ImportPreparationStatus;
      preparedAt?: string;
      expiresAt?: string;
      snapshot?: UnifiedSourceSnapshot;
      selectedSkills: ImportSkillSelection[];
      enabledTargets: DeploymentTargetId[];
      skills: ImportPreviewSkill[];
      targets: ImportPreviewTarget[];
    }
  | {
      status: "failed";
      reasonCode: ImportReasonCode;
      retryable: boolean;
    };

export type ImportSourceResult =
  | {
      status: "ready";
      sourceId: string;
      canonicalRepo: string;
      preparationId?: string;
      usedPreparation?: boolean;
    }
  | {
      status: "failed";
      reasonCode: string;
      retryable: boolean;
    };

export type SchemaVersion = 2;
export type MigrationGeneration = `mg_${string}`;
export type SourceId = string;
export type SkillLeafId = string;
export type RepoPath = string;

export type Diagnostic = {
  code: string;
  message: string;
  path?: string;
  fieldPath?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export type SourceManifestRecord = {
  id: SourceId;
  kind: SourceKind;
  locator: string;
  canonicalLocator: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  requestedPath?: string;
  originRequestedPath?: string;
};

export type SourceBinding = {
  sourceId: SourceId;
  selectionMode: "all" | "selected";
  selectedLeafIds: SkillLeafId[];
  enabledTargets: DeploymentTargetId[];
};

export type ManifestFile = {
  schemaVersion: SchemaVersion;
  migrationGeneration: MigrationGeneration;
  sources: SourceManifestRecord[];
  bindings: Record<SourceId, SourceBinding>;
};

export type SourceRevision =
  | {
      provider: "git" | "clawhub";
      ref?: string;
      commit?: string;
      capturedAt: string;
    }
  | {
      provider: "local";
      contentHash?: string;
      capturedAt: string;
    }
  | {
      provider: "collection";
      capturedAt: string;
    };

export type LeafSelectorIndex = {
  providerSkillId?: string;
  aliases: string[];
};

export type LeafRecord = {
  id: SkillLeafId;
  sourceId: SourceId;
  name?: string;
  relativePath: RepoPath;
  linkName: string;
  title: string;
  description: string;
  absolutePath: string;
  skillFilePath: string;
  contentHash: string;
  selectors?: LeafSelectorIndex;
  valid: boolean;
  sourceTitle?: string;
  diagnostics?: Diagnostic[];
};

export type ProjectionRecord = {
  target: DeploymentTargetId;
  sourceId: SourceId;
  leafId: SkillLeafId;
  targetPath: string;
  targetRootPath?: string;
  strategy: DeploymentStrategy;
  contentHash: string;
  status: "active" | "removed" | "blocked";
  updatedAt: string;
};

export type SourceLockRecord = {
  sourceId: SourceId;
  canonicalLocator: string;
  revision: SourceRevision;
  localPath: string;
  leafIds: SkillLeafId[];
  packageSlug?: string;
  resolvedVersion?: string;
  contentHash?: string;
  versionMode?: "pinned" | "floating";
  originBranch?: string;
  importedFromTargets?: DeploymentTargetId[];
  observedTargets?: Array<{
    target: DeploymentTargetId;
    rootPath: string;
    targetPath: string;
  }>;
  importMode?: "explicit-add" | "bootstrap-detected";
};

export interface LockFile {
  schemaVersion: SchemaVersion;
  migrationGeneration: MigrationGeneration;
  sources: Record<SourceId, SourceLockRecord>;
  leafInventory: LeafRecord[];
  projections: ProjectionRecord[];
}

export type ProjectSourceDraft = {
  sourceId: SourceId;
  selectedLeafIds: SkillLeafId[];
  enabledTargets: DeploymentTargetId[];
  updatedAt: string;
};

export type ImportSkillSelector = { kind: "repoPath"; path: RepoPath };

export type ImportSkillSelection = {
  uiId: string;
  selector: ImportSkillSelector;
};

export type LocalImportChoice = {
  sourceChoiceId: string;
  sourceChoiceAlias?: string;
  label: string;
  locator: string;
  detectedSourcePath: string;
  detectedSkillPath?: RepoPath;
  variant: "single-skill" | "multi-skill" | "source-root";
  selectedSkills: ImportSkillSelection[];
  enabledTargets: DeploymentTargetId[];
};

export type LocalScanDetectedSkill = {
  leafId: SkillLeafId;
  existingSourceIdHint?: SourceId;
  sourcePath: string;
  skillFilePath: string;
  relativePath: RepoPath;
  displayName: string;
  contentHash: string;
  selector: ImportSkillSelector;
  diagnostics?: Diagnostic[];
};

export type LocalScanImportChoice = {
  scanId: string;
  sourceChoiceId: string;
  rootPath: string;
  sourcePath: string;
  variant: "single-source" | "multi-source" | "mixed";
  detectedSkills: LocalScanDetectedSkill[];
  selectedSkills: ImportSkillSelection[];
  enabledTargets: DeploymentTargetId[];
};

export type PreferencesFile = {
  schemaVersion: SchemaVersion;
  migrationGeneration: MigrationGeneration;
  pinnedSourceIds: SourceId[];
  selectedProjectScope: ProjectScope;
  recentProjects: RecentProject[];
  projectSourceDrafts: Record<string, Record<SourceId, ProjectSourceDraft>>;
  customTargets: CustomTargetDefinition[];
  agentDisplayOrder: DeploymentTargetId[];
  localImportChoices?: LocalImportChoice[];
  localScanImportChoices?: LocalScanImportChoice[];
};

export type SkillCollectionMemberOrigin = {
  sourceId: SourceId;
  leafId: SkillLeafId;
  sourceLocator: string;
  canonicalLocator: string;
  repoPath: RepoPath;
  contentHashAtCapture: string;
  capturedAt: string;
};

export type MaterializedSkillSnapshot = {
  leafId: SkillLeafId;
  materializedPath: string;
  skillFilePath: string;
  relativePath: string;
  contentHash: string;
};

export type SkillCollectionMember = {
  id: string;
  origin: SkillCollectionMemberOrigin;
  snapshot: MaterializedSkillSnapshot;
  updatePolicy: "frozen";
};

export type SkillCollectionRestoreSelection = {
  sourceId: SourceId;
  selectedLeafIds: SkillLeafId[];
  enabledTargets: DeploymentTargetId[];
  bestEffort: boolean;
  diagnostics?: Diagnostic[];
};

export type SkillCollectionRecord = {
  id: SourceId;
  displayName: string;
  materializedSourceId: SourceId;
  members: SkillCollectionMember[];
  hiddenSourceIds: SourceId[];
  restoreSelections: Record<SourceId, SkillCollectionRestoreSelection>;
  createdAt: string;
  updatedAt: string;
};

export type CollectionsFile = {
  schemaVersion: SchemaVersion;
  migrationGeneration: MigrationGeneration;
  collections: Record<SourceId, SkillCollectionRecord>;
};

export type MigrationMarkerFile = {
  schemaVersion: SchemaVersion;
  version: string;
  migrationGeneration: MigrationGeneration;
  status: "running" | "failed";
  startedAt: string;
  stagingRoot: string;
  backupPath?: string;
  diagnostics?: Diagnostic[];
};

export type CollectionGenerationMarker = {
  schemaVersion: SchemaVersion;
  migrationGeneration: MigrationGeneration;
  collectionId: SourceId;
  createdAt: string;
  diagnostics?: Diagnostic[];
};

export type ImportPreviewSkill = {
  providerSkillId: string;
  uiId: string;
  title: string;
  contentHash?: string;
  selector: ImportSkillSelector;
  origin: {
    provider: "github" | "git" | "local" | "archive";
    providerSkillId?: string;
    providerPath?: string;
    archivePath?: string;
    repoPath?: RepoPath;
  };
  diagnostics?: Diagnostic[];
  selectorAliases: string[];
};

export type ImportDraft = {
  skillSelectionMode?: "all" | "selected";
  selectedSkills: ImportSkillSelection[];
  enabledTargets: DeploymentTargetId[];
};

export type PreparedSkillRef = {
  uiId: string;
  selector: ImportSkillSelector;
  leafId: SkillLeafId;
  repoPath: RepoPath;
  contentHash: string;
  selectorAliases: string[];
};

export type ImportPreparationRecord = {
  schemaVersion?: SchemaVersion;
  id: string;
  preparationId?: string;
  cacheKey?: string;
  locator: string;
  canonicalRepo: string;
  sourceLocator?: string;
  canonicalLocator?: string;
  requestedPath?: string;
  sourceSelectionKey?: string;
  existingSourceIdHint?: SourceId;
  sourceKind: SourceKind;
  checkoutPath: string;
  sourceId: string;
  displayName: string;
  sourceRevision?: SourceRevision;
  availableTargets: DeploymentTargetId[];
  commitSha?: string;
  skillIds: string[];
  skillRefs?: PreparedSkillRef[];
  currentAttempt?: {
    attemptId: string;
    commitStartedAt?: string;
  };
  status: ImportPreparationStatus | "committed" | "expired";
  failure?: {
    reasonCode: string;
    retryable: boolean;
    message: string;
    diagnostics?: Diagnostic[];
  };
  diagnostics?: Diagnostic[];
  preparedAt: string;
  expiresAt: string;
  createdAt?: string;
};

export type SourceUpdateDiff = {
  kind: "moved" | "changed" | "added" | "removed" | "invalidated";
  sourceId: SourceId;
  leafId: SkillLeafId;
  relativePath?: string;
  contentHash?: string;
  requestedPath?: string;
  previousLeafId?: string;
  previousRelativePath?: string;
  previousContentHash?: string;
  previous?: Partial<LeafRecord>;
  current?: Partial<LeafRecord>;
  diagnostics?: Diagnostic[];
};

export type SourceUpdateResultItem = {
  sourceId: SourceId;
  changed: boolean;
  requestedPath?: string;
  selectionMode?: "all" | "selected";
  addedLeafIds: string[];
  removedLeafIds: string[];
  invalidatedLeafIds: string[];
  diffs: SourceUpdateDiff[];
};

export type SourceUpdateResult = {
  sourceId?: SourceId;
  status?: "updated" | "unchanged" | "failed";
  updated: SourceUpdateResultItem[];
  diffs?: SourceUpdateDiff[];
  diagnostics?: Diagnostic[];
};

export type RepairTargetsResult = {
  actions: Array<{
    kind: "relink" | "remove" | "block" | "noop";
    target: DeploymentTargetId;
    sourceId?: SourceId;
    leafId?: SkillLeafId;
    previous?: Partial<ProjectionRecord>;
    current?: Partial<ProjectionRecord>;
    diagnostics: Diagnostic[];
  }>;
  diagnostics: Diagnostic[];
};

export type ImportDiscoveryCandidate = {
  uiId: string;
  providerSkillId: string;
  title: string;
  selector: ImportSkillSelector;
  origin: ImportPreviewSkill["origin"];
  diagnostics: Diagnostic[];
};

export type ImportDiscoveryGroupCandidate = {
  groupId: string;
  canonicalLocator: string;
  title: string;
  candidates: ImportDiscoveryCandidate[];
  installed: boolean;
  diagnostics: Diagnostic[];
};

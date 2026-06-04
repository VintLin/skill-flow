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

export type SourceKind = "local" | "git" | "clawhub" | "virtual";

export type DeploymentTargetName =
  | "claude-code"
  | "codex"
  | "cursor"
  | "github-copilot"
  | "gemini-cli"
  | "opencode"
  | "openclaw"
  | "hermes-agent"
  | "pi"
  | "trae"
  | "windsurf"
  | "roo-code"
  | "cline"
  | "amp"
  | "kiro";

export type DeploymentTargetId = DeploymentTargetName | (string & {});

export type DeploymentStrategy = "symlink" | "copy";

export type CustomTargetDefinition = {
  id: string;
  name: string;
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

export type SourceManifestRecord = {
  id: string;
  locator: string;
  kind: SourceKind;
  displayName: string;
  originalDisplayName: string;
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
  targets: Partial<Record<DeploymentTargetId, TargetBinding>>;
};

export type DraftBinding = {
  enabledTargets: DeploymentTargetId[];
  selectedLeafIds: string[];
};

export type AddSourceDraftOptions = {
  skillNames?: string[];
  agentTargets?: DeploymentTargetId[];
  draft?: DraftBinding;
  skipTargetDetection?: boolean;
};

export type AddSourcePreparation = {
  sourceId: string;
  availableTargets: DeploymentTargetId[];
  draft: DraftBinding;
  leafs: LeafRecord[];
};

export type Manifest = {
  schemaVersion: 1;
  sources: SourceManifestRecord[];
  bindings: Record<string, SourceBinding>;
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

export type SharedPreferences = {
  schemaVersion: 1;
  pinnedSourceIds: string[];
  selectedProjectScope: ProjectScope;
  recentProjects: RecentProject[];
  projectDrafts: ScopedSourceDrafts;
  customTargets: CustomTargetDefinition[];
  agentDisplayOrder: string[];
};

export type VirtualGroupSkillRef = {
  sourceId: string;
  leafId: string;
};

export type VirtualGroupRestoreSnapshot = {
  selectedLeafIds: string[];
  enabledTargets: DeploymentTargetId[];
};

export type VirtualGroupRecord = {
  id: string;
  displayName: string;
  includedSkills: VirtualGroupSkillRef[];
  hiddenSourceIds: string[];
  restoreSnapshots: Record<string, VirtualGroupRestoreSnapshot>;
  createdAt: string;
  updatedAt: string;
};

export type VirtualGroupsState = {
  schemaVersion: 1;
  groups: Record<string, VirtualGroupRecord>;
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
  originalDisplayName: string;
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
  importedFromTargets?: DeploymentTargetId[];
  observedTargets?: Array<{
    target: DeploymentTargetId;
    rootPath: string;
    targetPath: string;
  }>;
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
  sourceTitle?: string;
  valid: true;
};

export type DeploymentRecord = {
  sourceId: string;
  leafId: string;
  target: DeploymentTargetId;
  targetPath: string;
  targetRootPath?: string;
  strategy: DeploymentStrategy;
  status: "active" | "drifted" | "blocked" | "removed";
  contentHash: string;
  appliedAt: string;
};

export type ProjectionMode = "managed" | "bootstrap-imported";

export type ProjectionRecord = DeploymentRecord & {
  mode: ProjectionMode;
};

export type LockFile = {
  schemaVersion: 1;
  sources: SourceLockRecord[];
  leafInventory: LeafRecord[];
  projections?: ProjectionRecord[];
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

export type LocalImportChoice = {
  id: LocalImportChoiceId;
  label: string;
  locator: string;
  selectedSkillIds: string[];
};

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

export type LocalScanImportChoice = {
  id: string;
  label: string;
  locator: string;
  selectedSkillIds: string[];
  enabled: boolean;
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
  previewState: ImportAsyncState;
  localImport?: LocalImportCandidateInfo;
};

export type ImportPreviewSkill = {
  id: string;
  title: string;
  summary: string;
  selectedByDefault: boolean;
};

export type ImportPreviewTarget = {
  id: DeploymentTargetId;
  selectedByDefault: boolean;
};

export type ImportDraft = {
  selectedSkillIds: string[];
  enabledTargets: DeploymentTargetId[];
};

export type ImportPreparationStatus =
  | "preparing"
  | "ready"
  | "committing"
  | "failed"
  | "stale";

export type ImportPreparationRecord = {
  id: string;
  cacheKey?: string;
  locator: string;
  canonicalRepo: string;
  sourceKind: SourceKind;
  checkoutPath: string;
  sourceId: string;
  displayName: string;
  requestedPath?: string;
  status: ImportPreparationStatus;
  preparedAt: string;
  expiresAt: string;
  commitSha?: string;
  skillIds: string[];
  availableTargets: DeploymentTargetId[];
  failure?: {
    reasonCode: string;
    retryable: boolean;
    message: string;
  };
};

export type ImportPreparationCache = {
  records: Record<string, ImportPreparationRecord>;
  locatorIndex: Record<string, string>;
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
      locator: string;
      canonicalRepo: string;
      preparationId?: string;
      preparationStatus?: ImportPreparationStatus;
      preparedAt?: string;
      expiresAt?: string;
      snapshot?: UnifiedSourceSnapshot;
      selectedSkillIds: string[];
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

export type SchemaVersionV2 = 2;
export type MigrationGenerationV2 = `mg_${string}`;
export type SourceIdV2 = string;
export type SkillLeafIdV2 = string;
export type RepoPathV2 = string;

export type DiagnosticV2 = {
  code: string;
  message: string;
  path?: string;
  fieldPath?: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export type SourceKindV2 = "git" | "github" | "local" | "collection";

export type SourceManifestRecordV2 = {
  id: SourceIdV2;
  kind: SourceKindV2;
  locator: string;
  canonicalLocator: string;
  displayName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SourceBindingV2 = {
  sourceId: SourceIdV2;
  selectionMode: "all" | "selected";
  selectedLeafIds: SkillLeafIdV2[];
  enabledTargets: DeploymentTargetId[];
};

export type ManifestFileV2 = {
  schemaVersion: SchemaVersionV2;
  migrationGeneration: MigrationGenerationV2;
  sources: SourceManifestRecordV2[];
  bindings: Record<SourceIdV2, SourceBindingV2>;
};

export type SourceRevisionV2 = {
  provider: "git" | "github" | "local" | "collection";
  ref?: string;
  commit?: string;
  archiveEtag?: string;
  capturedAt: string;
};

export type LeafSelectorIndexV2 = {
  providerSkillId?: string;
  legacyAliases: string[];
};

export type LeafRecordV2 = {
  id: SkillLeafIdV2;
  sourceId: SourceIdV2;
  relativePath: RepoPathV2;
  linkName: string;
  title: string;
  description: string;
  absolutePath: string;
  skillFilePath: string;
  displayName: string;
  contentHash: string;
  selectors: LeafSelectorIndexV2;
  valid: boolean;
  diagnostics: DiagnosticV2[];
};

export type ProjectionRecordV2 = {
  target: DeploymentTargetId;
  sourceId: SourceIdV2;
  leafId: SkillLeafIdV2;
  targetPath: string;
  targetRootPath?: string;
  strategy: DeploymentStrategy;
  contentHash: string;
  status: "active" | "removed" | "blocked";
  updatedAt: string;
};

export type SourceLockRecordV2 = {
  sourceId: SourceIdV2;
  canonicalLocator: string;
  revision: SourceRevisionV2;
  localPath: string;
  leafIds: SkillLeafIdV2[];
};

export type LockFileV2 = {
  schemaVersion: SchemaVersionV2;
  migrationGeneration: MigrationGenerationV2;
  sources: Record<SourceIdV2, SourceLockRecordV2>;
  leafInventory: LeafRecordV2[];
  projections: ProjectionRecordV2[];
};

export type ProjectSourceDraftV2 = {
  sourceId: SourceIdV2;
  selectedLeafIds: SkillLeafIdV2[];
  enabledTargets: DeploymentTargetId[];
  updatedAt: string;
};

export type ImportSkillSelectorV2 = { kind: "repoPath"; path: RepoPathV2 };

export type ImportSkillSelectionV2 = {
  uiId: string;
  selector: ImportSkillSelectorV2;
};

export type LocalImportChoiceV2 = {
  sourceChoiceId: string;
  legacyChoiceId?: string;
  label: string;
  locator: string;
  detectedSourcePath: string;
  detectedSkillPath?: RepoPathV2;
  variant: "single-skill" | "multi-skill" | "source-root";
  selectedSkills: ImportSkillSelectionV2[];
  enabledTargets: DeploymentTargetId[];
};

export type LocalScanDetectedSkillV2 = {
  leafId: SkillLeafIdV2;
  existingSourceIdHint?: SourceIdV2;
  sourcePath: string;
  skillFilePath: string;
  relativePath: RepoPathV2;
  displayName: string;
  contentHash: string;
  selector: ImportSkillSelectorV2;
  diagnostics: DiagnosticV2[];
};

export type LocalScanImportChoiceV2 = {
  scanId: string;
  sourceChoiceId: string;
  rootPath: string;
  sourcePath: string;
  variant: "single-source" | "multi-source" | "mixed";
  detectedSkills: LocalScanDetectedSkillV2[];
  selectedSkills: ImportSkillSelectionV2[];
  enabledTargets: DeploymentTargetId[];
};

export type PreferencesFileV2 = {
  schemaVersion: SchemaVersionV2;
  migrationGeneration: MigrationGenerationV2;
  pinnedSourceIds: SourceIdV2[];
  selectedProjectScope: ProjectScope;
  recentProjects: RecentProject[];
  projectSourceDrafts: Record<string, Record<SourceIdV2, ProjectSourceDraftV2>>;
  customTargets: CustomTargetDefinition[];
  agentDisplayOrder: DeploymentTargetId[];
  localImportChoices?: LocalImportChoiceV2[];
  localScanImportChoices?: LocalScanImportChoiceV2[];
};

export type SkillCollectionMemberOriginV2 = {
  sourceId: SourceIdV2;
  leafId: SkillLeafIdV2;
  sourceLocator: string;
  canonicalLocator: string;
  repoPath: RepoPathV2;
  contentHashAtCapture: string;
  capturedAt: string;
};

export type MaterializedSkillSnapshotV2 = {
  leafId: SkillLeafIdV2;
  materializedPath: string;
  skillFilePath: string;
  relativePath: string;
  contentHash: string;
};

export type SkillCollectionMemberV2 = {
  id: string;
  origin: SkillCollectionMemberOriginV2;
  snapshot: MaterializedSkillSnapshotV2;
  updatePolicy: "frozen";
};

export type SkillCollectionRestoreSelectionV2 = {
  sourceId: SourceIdV2;
  selectedLeafIds: SkillLeafIdV2[];
  bestEffort: boolean;
  diagnostics: DiagnosticV2[];
};

export type SkillCollectionRecordV2 = {
  id: SourceIdV2;
  displayName: string;
  materializedSourceId: SourceIdV2;
  members: SkillCollectionMemberV2[];
  hiddenSourceIds: SourceIdV2[];
  restoreSelections: Record<SourceIdV2, SkillCollectionRestoreSelectionV2>;
  createdAt: string;
  updatedAt: string;
};

export type CollectionsFileV2 = {
  schemaVersion: SchemaVersionV2;
  migrationGeneration: MigrationGenerationV2;
  collections: Record<SourceIdV2, SkillCollectionRecordV2>;
};

export type MigrationMarkerFileV2 = {
  schemaVersion: SchemaVersionV2;
  migrationGeneration: MigrationGenerationV2;
  status: "running" | "failed";
  startedAt: string;
  stagingRoot: string;
  backupPath?: string;
  diagnostics: DiagnosticV2[];
};

export type CollectionGenerationMarkerV2 = {
  schemaVersion: SchemaVersionV2;
  migrationGeneration: MigrationGenerationV2;
  collectionId: SourceIdV2;
  createdAt: string;
  diagnostics: DiagnosticV2[];
};

export type ImportPreviewSkillV2 = {
  legacyId: string;
  uiId: string;
  title: string;
  selector: ImportSkillSelectorV2;
  origin: {
    provider: "github" | "git" | "local" | "archive";
    providerSkillId?: string;
    providerPath?: string;
    archivePath?: string;
    repoPath?: RepoPathV2;
  };
  diagnostics: DiagnosticV2[];
  legacyAliases: string[];
};

export type ImportDraftV2 = {
  selectedSkills: ImportSkillSelectionV2[];
  enabledTargets: DeploymentTargetId[];
};

export type PreparedSkillRefV2 = {
  uiId: string;
  selector: ImportSkillSelectorV2;
  leafId: SkillLeafIdV2;
  repoPath: RepoPathV2;
  contentHash: string;
  legacyAliases: string[];
};

export type ImportPreparationRecordV2 = {
  schemaVersion: SchemaVersionV2;
  preparationId: string;
  status: "ready" | "committing" | "committed" | "failed" | "expired";
  sourceLocator: string;
  canonicalLocator: string;
  requestedPath?: string;
  sourceSelectionKey: string;
  existingSourceIdHint?: SourceIdV2;
  sourceKind: SourceKindV2;
  checkoutPath: string;
  sourceRevision: SourceRevisionV2;
  availableTargets: DeploymentTargetId[];
  skillRefs: PreparedSkillRefV2[];
  currentAttempt?: {
    attemptId: string;
    commitStartedAt?: string;
  };
  lease: {
    token: string;
    expiresAt: string;
    state: "ready" | "committing" | "committed" | "expired";
  };
  failure?: {
    reasonCode: string;
    retryable: boolean;
    message: string;
    diagnostics: DiagnosticV2[];
  };
  diagnostics: DiagnosticV2[];
  preparedAt: string;
  expiresAt: string;
  createdAt: string;
};

export type SourceUpdateDiffV2 = {
  kind: "moved" | "changed" | "added" | "removed" | "invalidated";
  sourceId: SourceIdV2;
  leafId: SkillLeafIdV2;
  previous?: Partial<LeafRecordV2>;
  current?: Partial<LeafRecordV2>;
  diagnostics: DiagnosticV2[];
};

export type SourceUpdateResultV2 = {
  sourceId: SourceIdV2;
  status: "updated" | "unchanged" | "failed";
  diffs: SourceUpdateDiffV2[];
  diagnostics: DiagnosticV2[];
};

export type RepairTargetsResultV2 = {
  actions: Array<{
    kind: "relink" | "remove" | "block" | "noop";
    target: DeploymentTargetId;
    sourceId?: SourceIdV2;
    leafId?: SkillLeafIdV2;
    previous?: Partial<ProjectionRecordV2>;
    current?: Partial<ProjectionRecordV2>;
    diagnostics: DiagnosticV2[];
  }>;
  diagnostics: DiagnosticV2[];
};

export type AddSourceDraftOptionsV2 = {
  locator: string;
  skillNames?: string[];
  selectedSkills?: ImportSkillSelectionV2[];
  enabledTargets?: DeploymentTargetId[];
  skipTargetDetection?: boolean;
};

export type TargetDetectionV2 = {
  target: DeploymentTargetId;
  available: boolean;
  rootPath: string;
  reasonCode?: string;
  diagnostics: DiagnosticV2[];
};

export type AddSourcePreparationV2 = {
  sourceId: SourceIdV2;
  selectors: ImportSkillSelectorV2[];
  leafIds: SkillLeafIdV2[];
  detectedTargets: TargetDetectionV2[];
  diagnostics: DiagnosticV2[];
};

export type SourceMetadataCacheEntryV2 = {
  cacheKey: string;
  canonicalLocator: string;
  provider: RepoMetadataProvider;
  status: "ready" | "failed" | "unsupported";
  checkedAt: string;
  expiresAt: string;
  providerMetadata?: SourceStats;
  diagnostics: DiagnosticV2[];
};

export type SourceMetadataCacheV2 = Record<string, SourceMetadataCacheEntryV2>;

export type ImportDataCacheV2 = {
  searches: Record<string, ImportSearchSnapshot>;
  repos: Record<string, RepoMetadataCacheEntry>;
  recommendations: Record<string, ImportRecommendationFeed>;
};

export type ImportDiscoveryCandidateV2 = {
  uiId: string;
  legacyId: string;
  title: string;
  selector: ImportSkillSelectorV2;
  origin: ImportPreviewSkillV2["origin"];
  diagnostics: DiagnosticV2[];
};

export type ImportDiscoveryGroupCandidateV2 = {
  groupId: string;
  canonicalLocator: string;
  title: string;
  candidates: ImportDiscoveryCandidateV2[];
  installed: boolean;
  diagnostics: DiagnosticV2[];
};

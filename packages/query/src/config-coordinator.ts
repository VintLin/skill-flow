import type {
  CollectionsFile,
  ConfigBootStatus,
  DeploymentTargetId,
  DoctorReport,
  DraftBinding,
  LockFile,
  ManifestFile,
  PreferencesFile,
  ProjectScope,
  RecentProject,
  Result,
  ScopedSourceDrafts,
  SourceUpdateResult,
  Warning,
  WorkflowSummary,
} from "@skill-flow/domain/types";
import { formatGroupLabel } from "@skill-flow/integration/utils/naming";
import { fail, ok } from "@skill-flow/integration/utils/result";
import type { BootstrapEvent } from "@skill-flow/core-engine/services/workspace-bootstrap-service";

type ConfigCoordinatorDeps = {
  store: {
    readPreferences(): Promise<PreferencesFile>;
    readCollections(): Promise<CollectionsFile>;
    writePreferences(preferences: PreferencesFile): Promise<void>;
  };
  recentProjectService: {
    listRecentProjects(): Promise<RecentProject[]>;
  };
  doctorService: {
    run(
      manifest: ManifestFile,
      lockFile: LockFile,
      preferences: PreferencesFile,
    ): Promise<Result<DoctorReport>>;
  };
  workflowService: {
    getSummaries(
      manifest: ManifestFile,
      lockFile: LockFile,
      audit: DoctorReport | undefined,
      collections: CollectionsFile,
    ): WorkflowSummary[];
  };
  getAvailableTargets(): Promise<DeploymentTargetId[]>;
  pruneMissingCheckouts(): Promise<Result<{ removedSourceIds: string[] }>>;
  ensureBuiltInSources?(): Promise<Result<{ sourceIds: string[] }>>;
  getConfigData(): Promise<
    Result<{ manifest: ManifestFile; lockFile: LockFile; summaries: WorkflowSummary[] }>
  >;
};

export type ConfigBootstrapData = {
  availableTargets: DeploymentTargetId[];
  manifest: ManifestFile;
  lockFile: LockFile;
  summaries: WorkflowSummary[];
  initialDrafts: Record<string, DraftBinding>;
  audit: DoctorReport;
  bootStatus: ConfigBootStatus;
  recentProjects: RecentProject[];
  selectedProjectScope: ProjectScope;
  projectDrafts: ScopedSourceDrafts;
};

export class ConfigCoordinator {
  constructor(private readonly deps: ConfigCoordinatorDeps) {}

  async bootstrapWorkspaceState(
    onEvent?: (event: BootstrapEvent) => void,
  ): Promise<Result<ConfigBootstrapData>> {
    onEvent?.({
      phase: "detect-targets",
      level: "info",
      message: "Detecting available agent targets...",
    });
    const availableTargets = await this.deps.getAvailableTargets();

    const pruned = await this.deps.pruneMissingCheckouts();
    if (!pruned.ok) {
      return fail(pruned.errors, pruned.warnings);
    }
    const warnings: Warning[] = [...pruned.warnings];
    if (pruned.data.removedSourceIds.length > 0) {
      onEvent?.({
        phase: "refresh-sources",
        level: "warning",
        message: `Removed ${pruned.data.removedSourceIds.length} missing group${pruned.data.removedSourceIds.length === 1 ? "" : "s"} from config state.`,
      });
    }

    if (this.deps.ensureBuiltInSources) {
      const ensured = await this.deps.ensureBuiltInSources();
      if (!ensured.ok) {
        return fail(ensured.errors, [...warnings, ...ensured.warnings]);
      }
      warnings.push(...ensured.warnings);
      if (ensured.data.sourceIds.length > 0) {
        onEvent?.({
          phase: "refresh-sources",
          level: "info",
          message: `Registered ${ensured.data.sourceIds.length} built-in group${ensured.data.sourceIds.length === 1 ? "" : "s"}.`,
        });
      }
    }

    onEvent?.({
      phase: "normalize-bindings",
      level: "info",
      message: "Loading config state...",
    });
    const configData = await this.deps.getConfigData();
    if (!configData.ok) {
      return fail(configData.errors, [...warnings, ...configData.warnings]);
    }
    warnings.push(...configData.warnings);

    onEvent?.({
      phase: "audit-projections",
      level: "info",
      message: "Auditing current projections...",
    });
    const currentPreferences = await this.deps.store.readPreferences();
    const audit = await this.deps.doctorService.run(
      configData.data.manifest,
      configData.data.lockFile,
      currentPreferences,
    );
    if (!audit.ok) {
      return fail(audit.errors, [...warnings, ...audit.warnings]);
    }
    warnings.push(...audit.warnings);

    onEvent?.({
      phase: "build-summaries",
      level: "info",
      message: "Building config summaries...",
    });
    const collections = await this.deps.store.readCollections();
    const summaries = this.deps.workflowService.getSummaries(
      configData.data.manifest,
      configData.data.lockFile,
      audit.data,
      collections,
    );
    const bootStatus: ConfigBootStatus = {
      phase: "success",
      updatedSourceIds: [],
      failedSources: [],
    };

    // Refresh recent projects and reconcile selected scope against them.
    // This is preference-layer state, not part of manifest/lock global config.
    const recentProjects = await this.deps.recentProjectService.listRecentProjects().catch(() => []);
    await this.deps.store.writePreferences({
      ...currentPreferences,
      recentProjects,
    });
    const reconciledPreferences = await this.deps.store.readPreferences();

    onEvent?.({
      phase: "done",
      level: "success",
      message: "Config bootstrap complete.",
    });

    return ok({
      availableTargets,
      manifest: configData.data.manifest,
      lockFile: configData.data.lockFile,
      summaries,
      initialDrafts: buildInitialDrafts(summaries),
      audit: audit.data,
      bootStatus,
      recentProjects: reconciledPreferences.recentProjects,
      selectedProjectScope: reconciledPreferences.selectedProjectScope,
      projectDrafts: projectDraftsFromPreferences(reconciledPreferences),
    }, warnings);
  }
}

function buildInitialDrafts(summaries: WorkflowSummary[]): Record<string, DraftBinding> {
  return Object.fromEntries(
    summaries.map((summary) => {
      const enabledTargets = Object.entries(summary.bindings.targets)
        .filter(([, value]) => value?.enabled)
        .map(([target]) => target) as DraftBinding["enabledTargets"];
      const selectedLeafIds = [...new Set(summary.bindings.selectedLeafIds)];
      return [summary.source.id, { enabledTargets, selectedLeafIds }];
    }),
  );
}

function projectDraftsFromPreferences(preferences: PreferencesFile): ScopedSourceDrafts {
  return Object.fromEntries(
    Object.entries(preferences.projectSourceDrafts).map(([projectId, drafts]) => [
      projectId,
      Object.fromEntries(
        Object.entries(drafts).map(([sourceId, draft]) => [
          sourceId,
          {
            selectedLeafIds: [...draft.selectedLeafIds],
            enabledTargets: [...draft.enabledTargets],
          },
        ]),
      ),
    ]),
  );
}

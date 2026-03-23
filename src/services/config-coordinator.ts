import type {
  ConfigBootStatus,
  ConfigBootFailure,
  DeploymentTargetName,
  DoctorReport,
  DraftBinding,
  LockFile,
  Manifest,
  Result,
  SourceUpdateResult,
  WorkflowSummary,
} from "../domain/types.js";
import { formatGroupLabel } from "../utils/naming.js";
import { fail, ok } from "../utils/result.js";
import type { BootstrapEvent } from "./workspace-bootstrap-service.js";

type ConfigCoordinatorDeps = {
  store: {
    init(): Promise<void>;
    readManifest(): Promise<Manifest>;
  };
  doctorService: {
    run(manifest: Manifest, lockFile: LockFile): Promise<Result<DoctorReport>>;
  };
  workflowService: {
    getSummaries(
      manifest: Manifest,
      lockFile: LockFile,
      audit?: DoctorReport,
    ): WorkflowSummary[];
  };
  getAvailableTargets(): Promise<DeploymentTargetName[]>;
  pruneMissingCheckouts(): Promise<Result<{ removedSourceIds: string[] }>>;
  updateSources(sourceIds?: string[]): Promise<Result<SourceUpdateResult>>;
  getConfigData(): Promise<
    Result<{ manifest: Manifest; lockFile: LockFile; summaries: WorkflowSummary[] }>
  >;
};

export type ConfigBootstrapData = {
  availableTargets: DeploymentTargetName[];
  manifest: Manifest;
  lockFile: LockFile;
  summaries: WorkflowSummary[];
  initialDrafts: Record<string, DraftBinding>;
  audit: DoctorReport;
  bootStatus: ConfigBootStatus;
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
    if (pruned.data.removedSourceIds.length > 0) {
      onEvent?.({
        phase: "refresh-sources",
        level: "warning",
        message: `Removed ${pruned.data.removedSourceIds.length} missing group${pruned.data.removedSourceIds.length === 1 ? "" : "s"} from config state.`,
      });
    }

    await this.deps.store.init();
    const manifestBeforeUpdate = await this.deps.store.readManifest();
    const updatedSourceIds: string[] = [];
    const failedSources: ConfigBootStatus["failedSources"] = [];

    for (const source of manifestBeforeUpdate.sources) {
      onEvent?.({
        phase: "refresh-sources",
        level: "info",
        message: `Updating ${source.displayName}...`,
      });

      const updated = await this.deps.updateSources([source.id]);
      if (!updated.ok) {
        const message = updated.errors[0]?.message ?? `Unable to update ${source.displayName}.`;
        failedSources.push({
          sourceId: source.id,
          message,
        });
        onEvent?.({
          phase: "refresh-sources",
          level: "error",
          message: `${source.displayName} update failed: ${message}`,
        });
        continue;
      }

      if (updated.data.updated.length === 0) {
        continue;
      }

      updatedSourceIds.push(source.id);
      const updatedSource = updated.data.updated[0];
      const changed = updatedSource?.changed ? "updated" : "already current";
      onEvent?.({
        phase: "refresh-sources",
        level: "success",
        message: `${source.displayName} ${changed}.`,
      });
    }

    onEvent?.({
      phase: "normalize-bindings",
      level: "info",
      message: "Loading config state...",
    });
    const configData = await this.deps.getConfigData();
    if (!configData.ok) {
      return fail(configData.errors, configData.warnings);
    }

    onEvent?.({
      phase: "audit-projections",
      level: "info",
      message: "Auditing current projections...",
    });
    const audit = await this.deps.doctorService.run(
      configData.data.manifest,
      configData.data.lockFile,
    );
    if (!audit.ok) {
      return fail(audit.errors, audit.warnings);
    }

    onEvent?.({
      phase: "build-summaries",
      level: "info",
      message: "Building config summaries...",
    });
    const auditWithBootstrapFailures = this.mergeBootstrapFailuresIntoAudit(
      configData.data.manifest,
      audit.data,
      failedSources,
    );
    const summaries = this.deps.workflowService.getSummaries(
      configData.data.manifest,
      configData.data.lockFile,
      auditWithBootstrapFailures,
    );
    const bootStatus: ConfigBootStatus = {
      phase: failedSources.length > 0 ? "partial_failure" : "success",
      updatedSourceIds,
      failedSources,
    };
    onEvent?.({
      phase: "done",
      level: failedSources.length > 0 ? "warning" : "success",
      message:
        failedSources.length > 0
          ? `Config bootstrap complete with ${failedSources.length} failed group${failedSources.length === 1 ? "" : "s"}.`
          : "Config bootstrap complete.",
    });

    return ok({
      availableTargets,
      manifest: configData.data.manifest,
      lockFile: configData.data.lockFile,
      summaries,
      initialDrafts: buildInitialDrafts(summaries),
      audit: auditWithBootstrapFailures,
      bootStatus,
    });
  }

  private mergeBootstrapFailuresIntoAudit(
    manifest: Manifest,
    audit: DoctorReport,
    failedSources: ConfigBootFailure[],
  ): DoctorReport {
    if (failedSources.length === 0) {
      return audit;
    }

    return {
      status: audit.status === "HEALTHY" ? "PARTIAL" : audit.status,
      issues: [
        ...audit.issues,
        ...failedSources.map((failed) => {
          const source = manifest.sources.find((item) => item.id === failed.sourceId);
          return {
            severity: "warning" as const,
            sourceId: failed.sourceId,
            ...(source ? { sourceLabel: formatGroupLabel(source) } : {}),
            code: "SOURCE_REFRESH_FAILED",
            message: `Source refresh failed during bootstrap: ${failed.message}`,
          };
        }),
      ],
    };
  }
}

function buildInitialDrafts(summaries: WorkflowSummary[]): Record<string, DraftBinding> {
  return Object.fromEntries(
    summaries.map((summary) => {
      const enabledTargets = Object.entries(summary.bindings.targets)
        .filter(([, value]) => value?.enabled)
        .map(([target]) => target) as DraftBinding["enabledTargets"];
      const selectedLeafIds = [
        ...new Set(
          enabledTargets.flatMap((target) => summary.bindings.targets[target]?.leafIds ?? []),
        ),
      ];
      return [summary.source.id, { enabledTargets, selectedLeafIds }];
    }),
  );
}

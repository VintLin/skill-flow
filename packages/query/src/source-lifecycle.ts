import path from "node:path";
import type {
  ChannelAdapter,
} from "@skill-flow/integration/adapters/channel-adapters";
import { fail, ok } from "@skill-flow/integration/utils/result";
import { isPathInside, pathExists, removePath } from "@skill-flow/integration/utils/fs";
import type {
  DeploymentTargetId,
  DraftBinding,
  ImportDraft,
  ImportSourceResult,
  LockFile,
  ManifestFile,
  PreferencesFile,
  Result,
  ProjectScope,
  SourceUpdateResult,
  SourceUpdateResultItem,
  Warning,
} from "@skill-flow/domain/types";
import { ExternalSourceLifecycle } from "@skill-flow/core-engine/services/external-source-lifecycle";
import {
  ProtectedGroupOperationService,
} from "@skill-flow/core-engine/services/protected-group-operation-service";
import { SourceAuthorityService } from "@skill-flow/core-engine/services/source-authority-service";
import type { StateStore } from "@skill-flow/storage/state-store";
import type { ImportPreparationCacheStore } from "@skill-flow/storage/import-preparation-cache-store";
import { ImportPreparationService } from "@skill-flow/core-engine/services/import-preparation-service";
import type { SelectableImportLeaf } from "@skill-flow/core-engine/services/import-source-policy";
import type { OperationRecoveryTransaction } from "@skill-flow/core-engine/services/operation-recovery-service";
import { DeploymentReconciler } from "./deployment-reconciler.js";

type ApplyDraftOutcome = Result<{ draft: DraftBinding }>;
type AddSourceLifecycleOptions = {
  project?: boolean;
  draft?: DraftBinding;
  onProgress?: (message: string) => void;
};
type AddSourceLifecycleResult = {
  sourceId: string;
  draft: DraftBinding;
  projected: boolean;
};

export type SourceUninstallResult = {
  removed: string[];
  removedRefs: Array<{ id: string; locator: string; displayName: string }>;
  warnings: string[];
};
export type SourceRepairStateResult = {
  repairedSourceIds: string[];
  removedDeploymentCount: number;
};

type SourceLifecycleDependencies = {
  stateStore: StateStore;
  sourceAuthorityService: SourceAuthorityService;
  protectedGroupOperationService: ProtectedGroupOperationService;
  externalSourceLifecycle: ExternalSourceLifecycle;
  deploymentReconciler: DeploymentReconciler;
  createAdaptersForPreferences: (
    preferences: Pick<PreferencesFile, "customTargets" | "agentDisplayOrder">,
  ) => ChannelAdapter[];
  cloneAuthorityManifest: (manifest: ManifestFile) => ManifestFile;
  cloneLockFile: (lockFile: LockFile) => LockFile;
  importPreparationCacheStore: ImportPreparationCacheStore;
  importPreparationService: ImportPreparationService;
  getAvailableTargets: () => Promise<DeploymentTargetId[]>;
  readAuthorityLockFile: () => Promise<LockFile>;
  resolveImportDraftForPreparedSource: (
    sourceLeafs: SelectableImportLeaf[],
    availableTargets: DeploymentTargetId[],
    canonicalRepo: string | undefined,
    draft?: ImportDraft,
  ) => Result<DraftBinding>;
  applyDraft: (
    sourceId: string,
    draft: DraftBinding,
    scope: ProjectScope,
    transaction?: OperationRecoveryTransaction,
  ) => Promise<ApplyDraftOutcome>;
  replaceLocalImportWithManagedSymlink: (
    localSkillPath: string | undefined,
    sourceId: string,
    transaction?: OperationRecoveryTransaction,
  ) => Promise<void>;
};

/**
 * Owns the mutation lifecycle for managed source groups.
 *
 * Source authority promotion, target reconciliation, recovery, state writes,
 * and warning aggregation belong to this module. The runtime facade remains
 * responsible for composing this module and preserving the public CLI/TUI/
 * desktop methods.
 */
export class SourceLifecycle {
  constructor(private readonly dependencies: SourceLifecycleDependencies) {}

  async addSource<T extends AddSourceLifecycleResult>(
    options: AddSourceLifecycleOptions | undefined,
    prepare: () => Promise<Result<T>>,
    applyDraft: (sourceId: string, draft: DraftBinding) => Promise<ApplyDraftOutcome>,
  ): Promise<Result<T>> {
    const prepared = await prepare();
    if (!prepared.ok) {
      return prepared;
    }

    if (options?.project === false) {
      return prepared;
    }

    options?.onProgress?.("Applying projections");
    const applied = await applyDraft(
      prepared.data.sourceId,
      options?.draft ?? prepared.data.draft,
    );
    if (!applied.ok) {
      return fail(applied.errors, [...prepared.warnings, ...applied.warnings]);
    }

    return ok(
      {
        ...prepared.data,
        draft: applied.data.draft,
        projected: true,
      },
      [...prepared.warnings, ...applied.warnings],
    );
  }

  async uninstall(sourceIds: string[]): Promise<Result<SourceUninstallResult>> {
    const {
      stateStore,
      deploymentReconciler,
      createAdaptersForPreferences,
      sourceAuthorityService,
    } = this.dependencies;
    const state = await stateStore.readState();
    const warnings: string[] = [];
    const removedRefs = sourceIds
      .map((sourceId) => state.manifest.sources.find((source) => source.id === sourceId))
      .filter((source): source is ManifestFile["sources"][number] => Boolean(source))
      .map((source) => ({
        id: source.id,
        locator: source.locator,
        displayName: source.displayName,
      }));
    const importedCleanupWarnings = await deploymentReconciler.cleanupImportedTargetPaths({
      manifest: state.manifest,
      lockFile: state.lockFile,
      sourceIds,
      adapters: createAdaptersForPreferences(state.preferences),
    });

    for (const sourceId of sourceIds) {
      const projections = state.lockFile.projections.filter(
        (projection) => projection.sourceId === sourceId,
      );

      for (const projection of projections) {
        if (!(await pathExists(projection.targetPath))) {
          continue;
        }
        if (
          !projection.targetRootPath ||
          !isPathInside(projection.targetRootPath, projection.targetPath)
        ) {
          warnings.push(`Refusing to remove unmanaged target path ${projection.targetPath}.`);
          continue;
        }
        try {
          const hasPersistentOwner = state.lockFile.projections.some((candidate) =>
            candidate.targetPath === projection.targetPath &&
            !(
              candidate.sourceId === projection.sourceId &&
              candidate.leafId === projection.leafId &&
              candidate.target === projection.target
            )
          );
          if (!hasPersistentOwner) {
            await removePath(projection.targetPath);
          }
        } catch (error) {
          warnings.push(`Unable to remove ${projection.targetPath}: ${String(error)}`);
        }
      }
    }

    if (warnings.length > 0) {
      return fail(
        {
          code: "GROUP_DELETE_INCOMPLETE",
          message: `Unable to fully delete ${warnings.length} managed path${warnings.length === 1 ? "" : "s"}.`,
        },
        warnings.map((message) => ({
          code: "GROUP_DELETE_PATH_FAILED",
          message,
        })),
      );
    }

    let removed;
    try {
      removed = await sourceAuthorityService.removeSource(sourceIds);
    } catch (error) {
      return fail({
        code: "GROUP_DELETE_INCOMPLETE",
        message: `Unable to fully delete selected skills groups: ${String(error)}`,
      });
    }
    if (!removed.ok) {
      return fail(removed.errors, removed.warnings);
    }

    return ok(
      { removed: removed.data.removed, removedRefs, warnings },
      [...importedCleanupWarnings, ...removed.warnings],
    );
  }

  async repairState(
    sourceIds: string[] | undefined,
    pruneMissingCheckouts: () => Promise<Result<{ removedSourceIds: string[] }>>,
  ): Promise<Result<SourceRepairStateResult>> {
    const {
      stateStore,
      sourceAuthorityService,
      deploymentReconciler,
      createAdaptersForPreferences,
      cloneAuthorityManifest,
      cloneLockFile,
    } = this.dependencies;
    const pruned = await pruneMissingCheckouts();
    if (!pruned.ok) {
      return fail(pruned.errors, pruned.warnings);
    }

    const requestedIds = sourceIds?.filter(
      (sourceId) => !pruned.data.removedSourceIds.includes(sourceId),
    );
    if (sourceIds?.length && requestedIds?.length === 0) {
      return ok(
        { repairedSourceIds: [], removedDeploymentCount: 0 },
        pruned.warnings,
      );
    }

    const reconciled = await sourceAuthorityService.reconcileInventory(requestedIds, {
      force: true,
    });
    if (!reconciled.ok) {
      return fail(reconciled.errors, [...pruned.warnings, ...reconciled.warnings]);
    }

    const state = await stateStore.readState();
    const manifest = cloneAuthorityManifest(state.manifest);
    const lockFile = cloneLockFile(state.lockFile);
    const planSourceIds = requestedIds?.length
      ? requestedIds
      : manifest.sources.map((source) => source.id);
    const requestedSet = new Set(planSourceIds);
    const previousActiveProjectionCount = lockFile.projections.filter((projection) =>
      projection.status === "active" && requestedSet.has(projection.sourceId)
    ).length;

    const applied = await deploymentReconciler.reconcile({
      manifest,
      lockFile,
      sourceIds: planSourceIds,
      adapters: createAdaptersForPreferences(state.preferences),
    });
    if (!applied.ok) {
      return fail(applied.errors, [
        ...pruned.warnings,
        ...reconciled.warnings,
        ...applied.warnings,
      ]);
    }

    const nextActiveProjectionCount = lockFile.projections.filter((projection) =>
      projection.status === "active" && requestedSet.has(projection.sourceId)
    ).length;
    await stateStore.writeState({
      ...state,
      manifest,
      lockFile,
    });
    return ok(
      {
        repairedSourceIds: reconciled.data.updatedSourceIds,
        removedDeploymentCount: Math.max(
          0,
          previousActiveProjectionCount - nextActiveProjectionCount,
        ),
      },
      [...pruned.warnings, ...reconciled.warnings, ...applied.warnings],
    );
  }

  async updateSources(sourceIds?: string[]): Promise<Result<SourceUpdateResult>> {
    const {
      stateStore,
      sourceAuthorityService,
      protectedGroupOperationService,
      externalSourceLifecycle,
      deploymentReconciler,
      createAdaptersForPreferences,
      cloneAuthorityManifest,
      cloneLockFile,
    } = this.dependencies;
    const precheck = await sourceAuthorityService.precheckUpdateSources(sourceIds);
    if (!precheck.ok) {
      return fail(precheck.errors, precheck.warnings);
    }

    const initialState = await stateStore.readState();
    const requestedIds = sourceIds?.length
      ? [...new Set(sourceIds)]
      : initialState.manifest.sources
        .filter((source) => source.ownership !== "external")
        .map((source) => source.id);
    const externalSourceIds = sourceIds?.length
      ? []
      : initialState.manifest.sources
        .filter((source) => source.ownership === "external")
        .map((source) => source.id);
    const updatedItems: SourceUpdateResultItem[] = [];
    const failed: NonNullable<SourceUpdateResult["failed"]> = [];
    const warnings: Warning[] = [];
    const warningKeys = new Set<string>();
    const appendWarnings = (nextWarnings: readonly Warning[]) => {
      for (const warning of nextWarnings) {
        const key = `${warning.code}\0${warning.message}`;
        if (warningKeys.has(key)) {
          continue;
        }
        warningKeys.add(key);
        warnings.push(warning);
      }
    };

    appendWarnings(precheck.warnings);
    const precheckFallbackSourceIds: string[] = [...precheck.data.precheckFallbackSourceIds];
    const unchangedBySourceId = new Map(
      precheck.data.unchanged.map((item) => [item.sourceId, item]),
    );
    const skipRemotePrecheckSourceIds = new Set([
      ...precheck.data.remoteChangedSourceIds,
      ...precheck.data.precheckFallbackSourceIds,
    ]);
    const hardErrors: Array<{ code: string; message: string }> = [];

    for (const sourceId of requestedIds) {
      const unchanged = unchangedBySourceId.get(sourceId);
      if (unchanged) {
        updatedItems.push(unchanged);
        continue;
      }

      const currentState = await stateStore.readState();
      const source = currentState.manifest.sources.find((candidate) => candidate.id === sourceId);
      const lock = currentState.lockFile.sources[sourceId];
      const managed = source
        && lock
        && source.kind !== "collection"
        && source.ownership !== "external"
        && lock.ownership !== "external";

      try {
        if (!managed) {
          const updated = await sourceAuthorityService.updateSources([sourceId], {
            ...(skipRemotePrecheckSourceIds.has(sourceId) ? { skipGitRemotePrecheck: true } : {}),
          });
          appendWarnings(updated.warnings);
          if (!updated.ok) {
            hardErrors.push(...updated.errors);
            failed.push({
              sourceId,
              code: updated.errors[0]?.code ?? "SOURCE_UPDATE_FAILED",
              message: updated.errors[0]?.message ?? "Source update failed.",
            });
            continue;
          }
          precheckFallbackSourceIds.push(...(updated.data.precheckFallbackSourceIds ?? []));
          updatedItems.push(...updated.data.updated);
          continue;
        }

        const protectedResult = await protectedGroupOperationService.execute<
          SourceUpdateResultItem[],
          SourceUpdateResult
        >(
          { kind: "update", sourceId, sourceKind: source.kind },
          {
            promote: async (transaction) => {
              const updated = await sourceAuthorityService.updateSources([sourceId], {
                ...(skipRemotePrecheckSourceIds.has(sourceId) ? { skipGitRemotePrecheck: true } : {}),
                checkoutBackupPath: transaction.checkoutBackupPath,
                retainCheckoutBackup: true,
              });
              appendWarnings(updated.warnings);
              if (!updated.ok) return fail<SourceUpdateResult>(updated.errors, updated.warnings);
              precheckFallbackSourceIds.push(...(updated.data.precheckFallbackSourceIds ?? []));
              return ok(updated.data, updated.warnings);
            },
            apply: async (updated, transaction) => {
              const sourceUpdate = updated.updated.find((item) => item.sourceId === sourceId);
              if (sourceUpdate && !sourceUpdate.changed && !sourceUpdate.repaired) {
                return ok(updated.updated);
              }

              const state = await stateStore.readState();
              const manifest = cloneAuthorityManifest(state.manifest);
              const lockFile = cloneLockFile(state.lockFile);
              const adapters = createAdaptersForPreferences(state.preferences);
              const planned = await deploymentReconciler.plan({
                manifest,
                lockFile,
                sourceIds: [sourceId],
                adapters,
              });
              appendWarnings(planned.warnings);
              if (!planned.ok) return fail<SourceUpdateResultItem[]>(planned.errors, planned.warnings);
              await transaction.prepareTargetMutations(planned.data.actions);
              const applied = await deploymentReconciler.apply({
                lockFile,
                actions: planned.data.actions,
                adapters,
              });
              appendWarnings(applied.warnings);
              if (!applied.ok) return fail<SourceUpdateResultItem[]>(applied.errors, applied.warnings);
              await stateStore.writeState({ ...state, manifest, lockFile });
              return ok(updated.updated);
            },
          },
        );
        if (!protectedResult.ok) {
          hardErrors.push(...protectedResult.errors);
          failed.push({
            sourceId,
            code: protectedResult.errors[0]?.code ?? "SOURCE_UPDATE_FAILED",
            message: protectedResult.errors[0]?.message ?? "Source update failed.",
          });
          appendWarnings(protectedResult.warnings);
          continue;
        }
        updatedItems.push(...protectedResult.data);
      } catch (error) {
        const failure = {
          code: "SOURCE_UPDATE_FAILED",
          message: `Unable to update skills group '${sourceId}': ${String(error)}`,
        };
        hardErrors.push(failure);
        failed.push({ sourceId, ...failure });
      }
    }

    if (updatedItems.length === 0 && hardErrors.length > 0) {
      return fail(hardErrors, warnings);
    }

    const externalWarnings: Warning[] = [];
    for (const sourceId of externalSourceIds) {
      const refreshed = await externalSourceLifecycle.refresh(sourceId);
      if (!refreshed.ok) {
        externalWarnings.push(...refreshed.errors.map((error) => ({
          code: error.code,
          message: `External source '${sourceId}' was not refreshed: ${error.message}`,
        })));
      } else {
        externalWarnings.push(...refreshed.warnings);
      }
    }

    const status: SourceUpdateResult["status"] = failed.length === 0
      ? "updated"
      : updatedItems.length === 0
        ? "failed"
        : "partial";
    return ok({
      status,
      updated: updatedItems,
      ...(failed.length > 0 ? { failed } : {}),
      ...(precheckFallbackSourceIds.length > 0 ? { precheckFallbackSourceIds } : {}),
    }, [...warnings, ...externalWarnings]);
  }

  async commitPreparedImportSource(
    preparationId: string,
    draft?: ImportDraft,
    canonicalRepo?: string,
    localSkillPath?: string,
  ): Promise<Result<ImportSourceResult>> {
    const {
      stateStore,
      importPreparationCacheStore,
      importPreparationService,
      protectedGroupOperationService,
      getAvailableTargets,
      readAuthorityLockFile,
      resolveImportDraftForPreparedSource,
      applyDraft,
      replaceLocalImportWithManagedSymlink,
    } = this.dependencies;
    const preparation = (await importPreparationCacheStore.readImportPreparationCache()).records[preparationId];
    if (!preparation || preparation.status !== "ready") {
      return importPreparationService.commitPreparedImportSource(preparationId);
    }

    const canonicalCheckoutPath = path.join(
      stateStore.rootPath,
      "source",
      preparation.sourceKind,
      preparation.sourceId,
    );
    type ImportPromotion = {
      committed: ImportSourceResult;
      warnings: Warning[];
      transaction: OperationRecoveryTransaction;
    };
    const protectedResult = await protectedGroupOperationService.execute<ImportSourceResult, ImportPromotion>(
      {
        kind: "import",
        sourceId: preparation.sourceId,
        sourceKind: preparation.sourceKind,
        checkoutPath: canonicalCheckoutPath,
        preparationId,
      },
      {
        promote: (transaction) => importPreparationService
          .commitPreparedImportSource(preparationId)
          .then((committed) => {
            if (!committed.ok) return fail<ImportPromotion>(committed.errors, committed.warnings);
            return ok({ committed: committed.data, warnings: committed.warnings, transaction });
          }),
        apply: async ({ committed, warnings: committedWarnings, transaction }): Promise<Result<ImportSourceResult>> => {
          if (committed.status !== "ready") {
            return ok(committed, committedWarnings);
          }
          const lockFile = await readAuthorityLockFile();
          const sourceLeafs = lockFile.leafInventory.filter((leaf) => leaf.sourceId === committed.sourceId);
          const availableTargets = await getAvailableTargets();
          const finalDraft = resolveImportDraftForPreparedSource(
            sourceLeafs,
            availableTargets,
            canonicalRepo ?? committed.canonicalRepo,
            draft,
          );
          if (!finalDraft.ok) {
            return fail({
              code: finalDraft.errors[0]?.code ?? "IMPORT_PREVIEW_INVALID",
              message: "Unable to resolve the final import draft.",
            }, [...committedWarnings, ...finalDraft.warnings]);
          }
          const applied = await applyDraft(
            committed.sourceId,
            finalDraft.data,
            { kind: "global" },
            transaction,
          );
          if (!applied.ok) {
            return fail({
              code: applied.errors[0]?.code ?? "IMPORT_APPLY_FAILED",
              message: "Unable to apply the imported group.",
            }, [...committedWarnings, ...finalDraft.warnings, ...applied.warnings]);
          }
          await replaceLocalImportWithManagedSymlink(localSkillPath, committed.sourceId, transaction);
          return ok(committed, [...committedWarnings, ...finalDraft.warnings, ...applied.warnings]);
        },
      },
    );
    if (protectedResult.ok) return protectedResult;
    return ok({
      status: "failed",
      reasonCode: protectedResult.errors[0]?.code ?? "IMPORT_APPLY_FAILED",
      retryable: true,
    }, protectedResult.warnings);
  }
}

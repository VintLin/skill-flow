import fs from "node:fs/promises";
import path from "node:path";
import type {
  LeafRecord,
  LeafRecordV2,
  LockFileV2,
  Result,
  SourceKindV2,
  SourceManifestRecordV2,
} from "@skill-flow/domain/types";
import type { StateStoreV2 } from "@skill-flow/storage/state-store-v2";
import {
  ensureDir,
  hashDirectory,
  isPathInside,
  pathExists,
  removePath,
} from "@skill-flow/integration/utils/fs";
import { fail, ok } from "@skill-flow/integration/utils/result";
import type {
  PreparedSourceCheckoutV2,
  SourceCheckoutService,
} from "./source-checkout-service.js";
import type { AddSourceOptions } from "./source-service.js";

export type SourceAuthorityServiceV2Options = {
  stateStore: StateStoreV2;
  checkoutService: SourceCheckoutService;
};

export type AddSourceV2Options = AddSourceOptions & {
  checkoutPath?: string;
};

export type SourceSnapshotV2 = {
  manifest: SourceManifestRecordV2;
  lock: LockFileV2["sources"][string];
  leafs: LeafRecordV2[];
  leafCount: number;
  invalidLeafCount: number;
};

export class SourceAuthorityServiceV2 {
  constructor(private readonly options: SourceAuthorityServiceV2Options) {}

  async addSource(
    locator: string,
    options: AddSourceV2Options = {},
  ): Promise<Result<SourceSnapshotV2>> {
    const state = await this.options.stateStore.readState();
    const prepared = await this.options.checkoutService.prepareSourceCheckout(locator, {
      options,
      existingSources: state.manifest.sources.map((source) => ({
        id: source.id,
        locator: source.locator,
        displayName: source.displayName,
        ...(source.kind === "local" ? { kind: "local" as const } : {}),
      })),
      suffix: "add",
      ...(options.checkoutPath ? { checkoutPath: options.checkoutPath } : {}),
    });
    if (!prepared.ok) {
      return fail(prepared.errors, prepared.warnings);
    }

    return this.commitPreparedSource({
      preparedCheckout: prepared.data,
      removePreparedOnFailure: true,
    });
  }

  async commitPreparedSource(input: {
    preparedCheckout: PreparedSourceCheckoutV2;
    removePreparedOnFailure?: boolean;
  }): Promise<Result<SourceSnapshotV2>> {
    const state = await this.options.stateStore.readState();
    const prepared = input.preparedCheckout;
    const sourceId = prepared.sourceId;
    if (state.manifest.sources.some((source) => source.id === sourceId)) {
      if (input.removePreparedOnFailure) {
        await removePath(prepared.checkoutPath).catch(() => {});
      }
      return fail({
        code: "SOURCE_EXISTS",
        message: `Skills group id '${sourceId}' is already registered.`,
      });
    }

    const sourceKind = this.mapSourceKind(prepared.kind);
    const checkoutPath = path.join(this.options.stateStore.rootPath, "source", sourceKind, sourceId);
    if (await pathExists(checkoutPath)) {
      if (input.removePreparedOnFailure) {
        await removePath(prepared.checkoutPath).catch(() => {});
      }
      return fail({
        code: "SOURCE_CHECKOUT_PATH_EXISTS",
        message: `Unable to register source '${prepared.locator}' because checkout path already exists at ${checkoutPath}.`,
      });
    }

    try {
      await ensureDir(path.dirname(checkoutPath));
      await fs.rename(prepared.checkoutPath, checkoutPath);
    } catch (error) {
      if (input.removePreparedOnFailure) {
        await removePath(prepared.checkoutPath).catch(() => {});
      }
      return fail({
        code: "SOURCE_CHECKOUT_MOVE_FAILED",
        message: `Unable to finalize source '${prepared.locator}' at ${checkoutPath}: ${String(error)}`,
      });
    }

    const leafs = await Promise.all(
      prepared.leafs.map((leaf) => this.toLeafRecordV2(leaf, sourceId, checkoutPath)),
    );
    const now = new Date().toISOString();
    const source: SourceManifestRecordV2 = {
      id: sourceId,
      kind: sourceKind,
      locator: prepared.locator,
      canonicalLocator: prepared.locator,
      displayName: prepared.displayName,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    const lock: LockFileV2["sources"][string] = {
      sourceId,
      canonicalLocator: source.canonicalLocator,
      revision: {
        provider: sourceKind,
        ...(prepared.commitSha ? { commit: prepared.commitSha } : {}),
        capturedAt: now,
      },
      localPath: checkoutPath,
      leafIds: leafs.map((leaf) => leaf.id),
    };

    await this.options.stateStore.writeState({
      ...state,
      manifest: {
        ...state.manifest,
        sources: [...state.manifest.sources, source],
        bindings: {
          ...state.manifest.bindings,
          [sourceId]: {
            sourceId,
            selectionMode: "selected",
            selectedLeafIds: [],
            enabledTargets: [],
          },
        },
      },
      lockFile: {
        ...state.lockFile,
        sources: {
          ...state.lockFile.sources,
          [sourceId]: lock,
        },
        leafInventory: [...state.lockFile.leafInventory, ...leafs],
      },
    });

    return ok({
      manifest: source,
      lock,
      leafs,
      leafCount: leafs.length,
      invalidLeafCount: prepared.invalidLeafs.length,
    });
  }

  async removeSource(sourceIds: string[]): Promise<Result<{ removed: string[] }>> {
    const state = await this.options.stateStore.readState();
    const removed: string[] = [];
    const sourceRoot = path.join(this.options.stateStore.rootPath, "source");
    const nextManifestSources = [...state.manifest.sources];
    const nextBindings = { ...state.manifest.bindings };
    const nextLockSources = { ...state.lockFile.sources };
    let nextLeafInventory = [...state.lockFile.leafInventory];
    let nextProjections = [...state.lockFile.projections];

    for (const sourceId of sourceIds) {
      const source = nextManifestSources.find((item) => item.id === sourceId);
      const lock = nextLockSources[sourceId];
      if (!source || !lock) {
        return fail({
          code: "SOURCE_NOT_FOUND",
          message: `Skills group id '${sourceId}' is not registered.`,
        });
      }
      if (!isPathInside(sourceRoot, lock.localPath)) {
        return fail({
          code: "SOURCE_CHECKOUT_PATH_INVALID",
          message: `Refusing to delete checkout outside managed root: ${lock.localPath}`,
        });
      }

      delete nextLockSources[sourceId];
      delete nextBindings[sourceId];
      nextLeafInventory = nextLeafInventory.filter((leaf) => leaf.sourceId !== sourceId);
      nextProjections = nextProjections.filter((projection) => projection.sourceId !== sourceId);
      await removePath(lock.localPath);
      removed.push(sourceId);
    }

    await this.options.stateStore.writeState({
      ...state,
      manifest: {
        ...state.manifest,
        sources: nextManifestSources.filter((source) => !removed.includes(source.id)),
        bindings: nextBindings,
      },
      lockFile: {
        ...state.lockFile,
        sources: nextLockSources,
        leafInventory: nextLeafInventory,
        projections: nextProjections,
      },
    });

    return ok({ removed });
  }

  private mapSourceKind(kind: PreparedSourceCheckoutV2["kind"]): SourceKindV2 {
    if (kind === "clawhub") {
      return "github";
    }
    return kind;
  }

  private async toLeafRecordV2(
    leaf: LeafRecord,
    sourceId: string,
    checkoutPath: string,
  ): Promise<LeafRecordV2> {
    const absolutePath = path.join(checkoutPath, leaf.relativePath);
    return {
      id: `${sourceId}:${leaf.relativePath}`,
      sourceId,
      relativePath: leaf.relativePath,
      linkName: leaf.linkName,
      title: leaf.title ?? leaf.name ?? leaf.linkName,
      description: leaf.description ?? "",
      absolutePath,
      skillFilePath: path.join(absolutePath, "SKILL.md"),
      displayName: leaf.title ?? leaf.name ?? leaf.linkName,
      contentHash: await hashDirectory(absolutePath),
      selectors: {
        legacyAliases: [leaf.id, leaf.relativePath].filter((value, index, values) =>
          value && values.indexOf(value) === index
        ),
      },
      valid: leaf.valid,
      diagnostics: leaf.metadataWarnings.map((message) => ({
        code: "LEAF_METADATA_WARNING",
        message,
        retryable: false,
      })),
    };
  }
}

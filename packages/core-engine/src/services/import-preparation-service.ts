import crypto from "node:crypto";
import type {
  ImportPreparationRecord,
  ImportPreparationResult,
  ImportSourceResult,
  Result,
} from "@skill-flow/domain/types";
import { pathExists, removePath } from "@skill-flow/integration/utils/fs";
import { ok } from "@skill-flow/integration/utils/result";
import { deriveDisplayName, deriveSourceId } from "@skill-flow/integration/utils/source-id";
import {
  isImportPreparationExpired,
  pruneImportPreparationCache,
} from "@skill-flow/storage/import-preparation-cache";
import type { ImportPreparationCacheStore } from "@skill-flow/storage/import-preparation-cache-store";
import type {
  AddSourceOptionsWithCheckout,
  SourceAuthorityService,
} from "./source-authority-service.js";
import type {
  SourceCheckoutKind,
  SourceCheckoutService,
} from "./source-checkout-service.js";

const IMPORT_PREPARATION_TTL_MS = 24 * 60 * 60 * 1000;

export type ImportPreparationServiceOptions = {
  cacheStore: ImportPreparationCacheStore;
  sourceAuthority: SourceAuthorityService;
  checkoutService: SourceCheckoutService;
};

export class ImportPreparationService {
  private readonly inFlight = new Map<string, Promise<Result<ImportPreparationResult>>>();

  constructor(private readonly options: ImportPreparationServiceOptions) {}

  async prepareImportSource(
    locator: string,
    addOptions: AddSourceOptionsWithCheckout = {},
  ): Promise<Result<ImportPreparationResult>> {
    const cacheKey = this.cacheKey(locator, addOptions);
    const cached = await this.findReusablePreparation(cacheKey);
    if (cached) {
      return ok(cached);
    }

    const inFlight = this.inFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const task = this.prepareFreshImportSource(locator, cacheKey, addOptions).finally(() => {
      this.inFlight.delete(cacheKey);
    });
    this.inFlight.set(cacheKey, task);
    return task;
  }

  async commitPreparedImportSource(preparationId: string): Promise<Result<ImportSourceResult>> {
    const cache = await this.options.cacheStore.readImportPreparationCache();
    const record = cache.records[preparationId];
    if (!record || record.status !== "ready" || isImportPreparationExpired(record)) {
      return ok({
        status: "failed",
        reasonCode: "IMPORT_PREPARATION_STALE",
        retryable: true,
      });
    }

    if (!(await pathExists(record.checkoutPath))) {
      await this.options.cacheStore.deleteImportPreparationRecord(preparationId);
      return ok({
        status: "failed",
        reasonCode: "IMPORT_PREPARATION_MISSING",
        retryable: true,
      });
    }

    const checkoutKind = this.sourceCheckoutKind(record);
    if (!checkoutKind) {
      await this.options.cacheStore.writeImportPreparationRecord({
        ...record,
        status: "failed",
        failure: {
          reasonCode: "COLLECTION_CHECKOUT_UNSUPPORTED",
          retryable: false,
          message: "Collection preparations do not use source checkout.",
        },
      });
      return ok({
        status: "failed",
        reasonCode: "COLLECTION_CHECKOUT_UNSUPPORTED",
        retryable: false,
      });
    }

    const snapshot = await this.options.checkoutService.buildUpdateSnapshot({
      kind: checkoutKind,
      sourceId: record.sourceId,
      locator: record.locator,
      displayName: record.displayName,
      checkoutPath: record.checkoutPath,
      ...(record.requestedPath ? { requestedPath: record.requestedPath } : {}),
    });
    if (!snapshot.ok || snapshot.data.leafs.length === 0) {
      const reasonCode = snapshot.ok
        ? "IMPORT_PREPARATION_EMPTY"
        : snapshot.errors[0]?.code ?? "IMPORT_PREPARATION_INVALID";
      await this.options.cacheStore.writeImportPreparationRecord({
        ...record,
        status: "failed",
        failure: {
          reasonCode,
          retryable: true,
          message: snapshot.ok
            ? "Prepared import contains no valid skills."
            : snapshot.errors[0]?.message ?? "Unable to read prepared import.",
        },
      });
      return ok({
        status: "failed",
        reasonCode,
        retryable: true,
      }, snapshot.ok ? snapshot.warnings : snapshot.warnings);
    }

    await this.options.cacheStore.writeImportPreparationRecord({ ...record, status: "committing" });
    const committed = await this.options.sourceAuthority.commitPreparedSource({
      preparedCheckout: {
        locator: record.locator,
        displayName: record.displayName,
        ...(record.requestedPath ? { requestedPath: record.requestedPath } : {}),
        kind: checkoutKind,
        sourceId: record.sourceId,
        checkoutPath: record.checkoutPath,
        leafs: snapshot.data.leafs,
        invalidLeafs: snapshot.data.invalidLeafs,
        ...(snapshot.data.commitSha ? { commitSha: snapshot.data.commitSha } : {}),
        ...(snapshot.data.contentHash ? { contentHash: snapshot.data.contentHash } : {}),
        ...(snapshot.data.resolvedVersion ? { resolvedVersion: snapshot.data.resolvedVersion } : {}),
        ...(snapshot.data.packageSlug ? { packageSlug: snapshot.data.packageSlug } : {}),
      },
    });

    if (!committed.ok) {
      await this.options.cacheStore.writeImportPreparationRecord({
        ...record,
        status: "failed",
        failure: {
          reasonCode: committed.errors[0]?.code ?? "IMPORT_COMMIT_FAILED",
          retryable: true,
          message: committed.errors[0]?.message ?? "Unable to commit prepared import.",
        },
      });
      return ok({
        status: "failed",
        reasonCode: committed.errors[0]?.code ?? "IMPORT_COMMIT_FAILED",
        retryable: true,
      }, [...snapshot.warnings, ...committed.warnings]);
    }

    await this.options.cacheStore.deleteImportPreparationRecord(preparationId);
    return ok({
      status: "ready",
      sourceId: committed.data.manifest.id,
      canonicalRepo: record.canonicalRepo,
      preparationId,
      usedPreparation: true,
    }, [...snapshot.warnings, ...committed.warnings]);
  }

  private async prepareFreshImportSource(
    locator: string,
    cacheKey: string,
    addOptions: AddSourceOptionsWithCheckout,
  ): Promise<Result<ImportPreparationResult>> {
    const preparationId = `prep-${crypto.randomUUID()}`;
    const checkoutPath = this.options.cacheStore.getImportPreparationCheckoutPath(preparationId);
    const now = Date.now();
    const preparedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + IMPORT_PREPARATION_TTL_MS).toISOString();

    await removePath(checkoutPath).catch(() => {});
    await this.options.cacheStore.writeImportPreparationRecord({
      id: preparationId,
      cacheKey,
      locator,
      canonicalRepo: cacheKey,
      sourceKind: "git",
      checkoutPath,
      sourceId: addOptions.sourceIdOverride ?? deriveSourceId(locator),
      displayName: addOptions.displayNameOverride ?? deriveDisplayName(locator),
      ...(addOptions.path ? { requestedPath: addOptions.path } : {}),
      status: "preparing",
      preparedAt,
      expiresAt,
    });

    const prepared = await this.options.checkoutService.prepareSourceCheckout(locator, {
      options: addOptions,
      checkoutPath,
    });
    if (!prepared.ok) {
      await this.options.cacheStore.writeImportPreparationRecord(
        this.failedRecord({
          preparationId,
          locator,
          cacheKey,
          checkoutPath,
          addOptions,
          preparedAt,
          expiresAt,
          reasonCode: prepared.errors[0]?.code ?? "IMPORT_PREPARE_FAILED",
          message: prepared.errors[0]?.message ?? "Unable to prepare import.",
        }),
      );
      return ok({
        status: "failed",
        preparationId,
        reasonCode: prepared.errors[0]?.code ?? "IMPORT_PREPARE_FAILED",
        retryable: true,
      }, prepared.warnings);
    }

    const record: ImportPreparationRecord = {
      id: preparationId,
      cacheKey,
      locator: prepared.data.locator,
      canonicalRepo: cacheKey,
      sourceKind: prepared.data.kind,
      checkoutPath: prepared.data.checkoutPath,
      sourceId: prepared.data.sourceId,
      displayName: prepared.data.displayName,
      ...(prepared.data.requestedPath ? { requestedPath: prepared.data.requestedPath } : {}),
      status: "ready",
      preparedAt,
      expiresAt,
    };
    await this.options.cacheStore.writeImportPreparationRecord(record);
    await this.options.cacheStore.writeImportPreparationCache(
      pruneImportPreparationCache(await this.options.cacheStore.readImportPreparationCache()),
    );

    return ok({
      status: "ready",
      preparationId,
      locator: record.locator,
      canonicalRepo: record.canonicalRepo,
      preparedAt,
      expiresAt,
    }, prepared.warnings);
  }

  private async findReusablePreparation(cacheKey: string): Promise<ImportPreparationResult | undefined> {
    const cache = await this.options.cacheStore.pruneImportPreparationRecords();
    const records = Object.values(cache.records)
      .filter((candidate) => candidate.cacheKey === cacheKey || candidate.locator === cacheKey)
      .sort((left, right) => {
        const preparedAtOrder = Date.parse(right.preparedAt) - Date.parse(left.preparedAt);
        return preparedAtOrder || right.id.localeCompare(left.id);
      });
    if (records.length === 0) {
      return undefined;
    }

    let staleRecord: ImportPreparationRecord | undefined;
    for (const record of records) {
      if (isImportPreparationExpired(record)) {
        staleRecord ??= record;
        continue;
      }

      if (record.status === "ready") {
        if (await pathExists(record.checkoutPath)) {
          return {
            status: "ready",
            preparationId: record.id,
            locator: record.locator,
            canonicalRepo: record.canonicalRepo,
            preparedAt: record.preparedAt,
            expiresAt: record.expiresAt,
          };
        }
        await this.options.cacheStore.deleteImportPreparationRecord(record.id);
        continue;
      }

      if (record.status === "preparing") {
        return {
          status: "preparing",
          preparationId: record.id,
          locator: record.locator,
          canonicalRepo: record.canonicalRepo,
          preparedAt: record.preparedAt,
          expiresAt: record.expiresAt,
        };
      }

      if (record.status === "committing") {
        return {
          status: "failed",
          preparationId: record.id,
          reasonCode: "IMPORT_PREPARATION_COMMITTING",
          retryable: true,
        };
      }

      await this.options.cacheStore.deleteImportPreparationRecord(record.id);
    }

    if (staleRecord) {
      return {
        status: "stale",
        preparationId: staleRecord.id,
        locator: staleRecord.locator,
        canonicalRepo: staleRecord.canonicalRepo,
        preparedAt: staleRecord.preparedAt,
        expiresAt: staleRecord.expiresAt,
      };
    }

    return undefined;
  }

  private failedRecord(args: {
    preparationId: string;
    locator: string;
    cacheKey: string;
    checkoutPath: string;
    addOptions: AddSourceOptionsWithCheckout;
    preparedAt: string;
    expiresAt: string;
    reasonCode: string;
    message: string;
  }): ImportPreparationRecord {
    return {
      id: args.preparationId,
      cacheKey: args.cacheKey,
      locator: args.locator,
      canonicalRepo: args.cacheKey,
      sourceKind: "git",
      checkoutPath: args.checkoutPath,
      sourceId: args.addOptions.sourceIdOverride ?? deriveSourceId(args.locator),
      displayName: args.addOptions.displayNameOverride ?? deriveDisplayName(args.locator),
      ...(args.addOptions.path ? { requestedPath: args.addOptions.path } : {}),
      status: "failed",
      preparedAt: args.preparedAt,
      expiresAt: args.expiresAt,
      failure: {
        reasonCode: args.reasonCode,
        retryable: true,
        message: args.message,
      },
    };
  }

  private sourceCheckoutKind(record: ImportPreparationRecord): SourceCheckoutKind | undefined {
    switch (record.sourceKind) {
      case "local":
      case "git":
      case "clawhub":
        return record.sourceKind;
      case "collection":
        return undefined;
    }
  }

  private cacheKey(locator: string, options: AddSourceOptionsWithCheckout): string {
    const trimmed = locator.trim();
    return options.path ? `${trimmed}#${options.path}` : trimmed;
  }

}

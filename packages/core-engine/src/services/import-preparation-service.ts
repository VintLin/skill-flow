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
import { StateStore } from "@skill-flow/storage/store";
import type { AddSourceOptions } from "./source-service.js";
import { SourceService } from "./source-service.js";

const IMPORT_PREPARATION_TTL_MS = 24 * 60 * 60 * 1000;

export class ImportPreparationService {
  private readonly inFlight = new Map<string, Promise<Result<ImportPreparationResult>>>();

  constructor(
    private readonly store: StateStore,
    private readonly sourceService: SourceService,
  ) {}

  async prepareImportSource(
    locator: string,
    options: AddSourceOptions = {},
  ): Promise<Result<ImportPreparationResult>> {
    const cacheKey = this.cacheKey(locator, options);
    const cached = await this.findReusablePreparation(cacheKey);
    if (cached) {
      return ok(cached);
    }

    const inFlight = this.inFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const task = this.prepareFreshImportSource(locator, cacheKey, options).finally(() => {
      this.inFlight.delete(cacheKey);
    });
    this.inFlight.set(cacheKey, task);
    return task;
  }

  async commitPreparedImportSource(preparationId: string): Promise<Result<ImportSourceResult>> {
    const cache = await this.store.readImportPreparationCache();
    const record = cache.records[preparationId];
    if (!record || record.status !== "ready" || isImportPreparationExpired(record)) {
      return ok({
        status: "failed",
        reasonCode: "IMPORT_PREPARATION_STALE",
        retryable: true,
      });
    }

    if (!(await pathExists(record.checkoutPath))) {
      await this.store.deleteImportPreparationRecord(preparationId);
      return ok({
        status: "failed",
        reasonCode: "IMPORT_PREPARATION_MISSING",
        retryable: true,
      });
    }

    await this.store.writeImportPreparationRecord({ ...record, status: "committing" });
    const committed = await this.sourceService.commitPreparedSource({
      locator: record.locator,
      checkoutPath: record.checkoutPath,
      options: {
        project: false,
        sourceIdOverride: record.sourceId,
        displayNameOverride: record.displayName,
        ...(record.requestedPath ? { path: record.requestedPath } : {}),
      },
    });

    if (!committed.ok) {
      await this.store.writeImportPreparationRecord({
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
      }, committed.warnings);
    }

    await this.store.deleteImportPreparationRecord(preparationId);
    return ok({
      status: "ready",
      sourceId: committed.data.manifest.id,
      canonicalRepo: record.canonicalRepo,
      preparationId,
      usedPreparation: true,
    }, committed.warnings);
  }

  private async findReusablePreparation(cacheKey: string): Promise<ImportPreparationResult | undefined> {
    const cache = await this.store.pruneImportPreparationRecords();
    const preparationId = cache.locatorIndex[cacheKey];
    const record = preparationId ? cache.records[preparationId] : undefined;
    if (!record) {
      return undefined;
    }

    if (record.status === "ready" && !(await pathExists(record.checkoutPath))) {
      await this.store.deleteImportPreparationRecord(record.id);
      return undefined;
    }

    if (isImportPreparationExpired(record)) {
      return {
        status: "stale",
        preparationId: record.id,
        locator: record.locator,
        canonicalRepo: record.canonicalRepo,
        preparedAt: record.preparedAt,
        expiresAt: record.expiresAt,
      };
    }

    if (record.status === "ready" || record.status === "preparing") {
      return {
        status: record.status,
        preparationId: record.id,
        locator: record.locator,
        canonicalRepo: record.canonicalRepo,
        preparedAt: record.preparedAt,
        expiresAt: record.expiresAt,
      };
    }

    if (record.status === "failed") {
      await this.store.deleteImportPreparationRecord(record.id);
      return undefined;
    }

    return undefined;
  }

  private async prepareFreshImportSource(
    locator: string,
    cacheKey: string,
    options: AddSourceOptions,
  ): Promise<Result<ImportPreparationResult>> {
    const preparationId = `prep-${crypto.randomUUID()}`;
    const checkoutPath = this.store.getImportPreparationCheckoutPath(preparationId);
    const now = Date.now();
    const preparedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + IMPORT_PREPARATION_TTL_MS).toISOString();

    await removePath(checkoutPath).catch(() => {});
    await this.store.writeImportPreparationRecord({
      id: preparationId,
      cacheKey,
      locator,
      canonicalRepo: cacheKey,
      sourceKind: "git",
      checkoutPath,
      sourceId: options.sourceIdOverride ?? deriveSourceId(locator),
      displayName: options.displayNameOverride ?? deriveDisplayName(locator),
      ...(options.path ? { requestedPath: options.path } : {}),
      status: "preparing",
      preparedAt,
      expiresAt,
      skillIds: [],
      availableTargets: [],
    });

    const prepared = await this.sourceService.prepareSourceCheckout(locator, {
      checkoutPath,
      options,
    });
    if (!prepared.ok) {
      const failedRecord = this.failedRecord({
        preparationId,
        locator,
        cacheKey,
        checkoutPath,
        options,
        preparedAt,
        expiresAt,
        reasonCode: prepared.errors[0]?.code ?? "IMPORT_PREPARE_FAILED",
        message: prepared.errors[0]?.message ?? "Unable to prepare import.",
      });
      await this.store.writeImportPreparationRecord(failedRecord);
      return ok({
        status: "failed",
        preparationId,
        reasonCode: failedRecord.failure!.reasonCode,
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
      ...(prepared.data.commitSha ? { commitSha: prepared.data.commitSha } : {}),
      skillIds: prepared.data.leafs.map((leaf) => leaf.name),
      availableTargets: [],
    };
    await this.store.writeImportPreparationRecord(record);
    await this.store.writeImportPreparationCache(
      pruneImportPreparationCache(await this.store.readImportPreparationCache()),
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

  private failedRecord(args: {
    preparationId: string;
    locator: string;
    cacheKey: string;
    checkoutPath: string;
    options: AddSourceOptions;
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
      sourceId: args.options.sourceIdOverride ?? deriveSourceId(args.locator),
      displayName: args.options.displayNameOverride ?? deriveDisplayName(args.locator),
      ...(args.options.path ? { requestedPath: args.options.path } : {}),
      status: "failed",
      preparedAt: args.preparedAt,
      expiresAt: args.expiresAt,
      skillIds: [],
      availableTargets: [],
      failure: {
        reasonCode: args.reasonCode,
        retryable: true,
        message: args.message,
      },
    };
  }

  private cacheKey(locator: string, options: AddSourceOptions): string {
    const trimmed = locator.trim();
    return options.path ? `${trimmed}#${options.path}` : trimmed;
  }
}

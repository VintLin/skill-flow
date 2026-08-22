import fs from "node:fs/promises";
import path from "node:path";
import type { ImportPreparationRecord } from "@skill-flow/domain/types";
import type { StateStoreState } from "./state-store.js";
import { writeJsonFile } from "@skill-flow/integration/utils/fs";

export type RecoveryOperationKind = "update" | "import";

export type RecoveryPathSnapshot = {
  path: string;
  existed: boolean;
  backupName?: string;
  beforeFingerprint?: string;
  mutationFingerprint?: string;
  allowedMutationFingerprints?: string[];
};

export type RecoveryJournal = {
  schemaVersion: 1;
  transactionId: string;
  kind: RecoveryOperationKind;
  sourceId: string;
  startedAt: string;
  phase: "prepared" | "mutated";
  authorityBefore: StateStoreState;
  importPreparationBefore?: ImportPreparationRecord;
  checkout?: RecoveryPathSnapshot;
  targets: RecoveryPathSnapshot[];
};

export class RecoveryJournalStore {
  constructor(private readonly stateRoot: string) {}

  get recoveryRoot(): string {
    return path.join(this.stateRoot, "recovery");
  }

  get journalPath(): string {
    return path.join(this.recoveryRoot, "active.json");
  }

  backupPath(transactionId: string, backupName: string): string {
    assertTransactionId(transactionId);
    assertBackupName(backupName);
    return safeRecoveryChild(this.recoveryRoot, transactionId, backupName);
  }

  async read(): Promise<RecoveryJournal | undefined> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(this.journalPath, "utf8"));
      assertRecoveryJournal(parsed);
      return parsed;
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  async write(journal: RecoveryJournal): Promise<void> {
    await writeJsonFile(this.journalPath, journal);
  }

  async clear(journal: RecoveryJournal): Promise<void> {
    assertRecoveryJournal(journal);
    await fs.rm(this.journalPath, { force: true });
    await fs.rm(safeRecoveryChild(this.recoveryRoot, journal.transactionId), {
      recursive: true,
      force: true,
    });
  }
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function assertRecoveryJournal(value: unknown): asserts value is RecoveryJournal {
  if (!value || typeof value !== "object") invalidJournal("root must be an object");
  const journal = value as Partial<RecoveryJournal>;
  if (journal.schemaVersion !== 1) invalidJournal("unsupported schemaVersion");
  assertTransactionId(journal.transactionId);
  if (journal.kind !== "update" && journal.kind !== "import") invalidJournal("invalid operation kind");
  if (typeof journal.sourceId !== "string" || journal.sourceId.trim().length === 0) {
    invalidJournal("missing sourceId");
  }
  if (typeof journal.startedAt !== "string" || Number.isNaN(Date.parse(journal.startedAt))) {
    invalidJournal("invalid startedAt");
  }
  if (journal.phase !== "prepared" && journal.phase !== "mutated") invalidJournal("invalid phase");
  if (!journal.authorityBefore || typeof journal.authorityBefore !== "object") {
    invalidJournal("missing authority snapshot");
  }
  if (!Array.isArray(journal.targets)) invalidJournal("targets must be an array");
  if (journal.checkout) assertPathSnapshot(journal.checkout);
  for (const target of journal.targets ?? []) assertPathSnapshot(target);
}

function assertPathSnapshot(value: RecoveryPathSnapshot): void {
  if (!value || typeof value !== "object") invalidJournal("invalid path snapshot");
  if (typeof value.path !== "string" || !path.isAbsolute(value.path)) {
    invalidJournal("snapshot path must be absolute");
  }
  if (typeof value.existed !== "boolean") invalidJournal("snapshot existed flag must be boolean");
  if (value.backupName !== undefined) assertBackupName(value.backupName);
  if (value.allowedMutationFingerprints !== undefined && (
    !Array.isArray(value.allowedMutationFingerprints)
    || value.allowedMutationFingerprints.some((entry) => typeof entry !== "string")
  )) {
    invalidJournal("invalid allowed mutation fingerprints");
  }
}

function assertTransactionId(value: unknown): asserts value is string {
  if (
    typeof value !== "string"
    || !/^recovery-[1-9]\d*-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    invalidJournal("invalid transactionId");
  }
}

function assertBackupName(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^(checkout|target-\d+)$/.test(value)) {
    invalidJournal("invalid backup name");
  }
}

function safeRecoveryChild(root: string, ...segments: string[]): string {
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, ...segments);
  if (!candidate.startsWith(`${resolvedRoot}${path.sep}`)) invalidJournal("recovery path escapes root");
  return candidate;
}

function invalidJournal(reason: string): never {
  throw new Error(`Invalid recovery journal: ${reason}.`);
}

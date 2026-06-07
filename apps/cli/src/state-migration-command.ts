import path from "node:path";

export type MigrateStateRuntime = {
  store: {
    rootPath: string;
  };
  inspectStateMigration(): Promise<{ status: string }>;
  migrateState(options: { to: 2; dryRun?: boolean; backup?: boolean; tolerateOrphanSources?: boolean }): Promise<
    | {
        status: "current";
        actions: Array<{ action: string; path: string }>;
      }
    | {
        status: "dry-run";
        actions: Array<{ action: string; path: string }>;
      }
    | {
        status: "migrated";
        migrationGeneration: string;
        backupPath?: string;
      }
  >;
};

export type MigrateStateCliOptions = {
  to: string;
  dryRun?: boolean;
  backup?: boolean;
  tolerateOrphanSources?: boolean;
};

export type MigrateStateCliIo = {
  stdout(message: string): void;
  stderr(message: string): void;
};

export async function runMigrateStateCli(
  runtime: MigrateStateRuntime,
  options: MigrateStateCliOptions,
  io: MigrateStateCliIo = {
    stdout: (message) => console.log(message),
    stderr: (message) => console.error(message),
  },
): Promise<number> {
  if (options.to !== "v2" && options.to !== "2") {
    io.stderr("Only --to v2 is supported.");
    return 1;
  }

  try {
    const status = await runtime.inspectStateMigration();
    if (status.status === "migration-required") {
      io.stdout("Migration required");
    } else if (status.status === "current") {
      io.stdout("State schema is current.");
    }

    const migrateOptions: { to: 2; dryRun?: boolean; backup?: boolean; tolerateOrphanSources?: boolean } = { to: 2 };
    if (options.dryRun !== undefined) {
      migrateOptions.dryRun = options.dryRun;
    }
    if (options.backup !== undefined) {
      migrateOptions.backup = options.backup;
    }
    if (options.tolerateOrphanSources !== undefined) {
      migrateOptions.tolerateOrphanSources = options.tolerateOrphanSources;
    }
    const result = await runtime.migrateState(migrateOptions);
    if (result.status === "dry-run") {
      for (const action of result.actions) {
        io.stdout(`${formatMigrationActionPath(runtime, action.path)} ${action.action}`);
      }
    } else if (result.status === "migrated") {
      io.stdout(`Migrated state to schema v2: ${result.migrationGeneration}`);
      if (result.backupPath) {
        io.stdout(`Backup: ${result.backupPath}`);
      }
    }
    return 0;
  } catch (error) {
    printMigrationError(error, io);
    return 1;
  }
}

function formatMigrationActionPath(runtime: MigrateStateRuntime, actionPath: string): string {
  const relativePath = path.relative(runtime.store.rootPath, actionPath);
  return relativePath && !relativePath.startsWith("..") ? relativePath : actionPath;
}

function printMigrationError(error: unknown, io: MigrateStateCliIo) {
  if (
    typeof error === "object" &&
    error !== null &&
    "reasonCode" in error &&
    typeof error.reasonCode === "string"
  ) {
    io.stderr(error.reasonCode);
    if ("diagnostics" in error && Array.isArray(error.diagnostics)) {
      for (const diagnostic of error.diagnostics) {
        if (typeof diagnostic === "object" && diagnostic !== null && "message" in diagnostic) {
          io.stderr(String(diagnostic.message));
        }
      }
    }
    return;
  }
  io.stderr(error instanceof Error ? error.message : String(error));
}

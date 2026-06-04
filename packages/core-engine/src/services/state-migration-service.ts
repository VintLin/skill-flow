import fs from "node:fs/promises";
import path from "node:path";
import type { DiagnosticV2 } from "@skill-flow/domain/types";
import {
  inspectStateMigrationStatus,
  type StateMigrationStatus,
} from "@skill-flow/storage/state-schema-v2";

export type StateMigrationAction =
  | {
      action: "rewrite";
      path: string;
    }
  | {
      action: "materialize-collection";
      path: string;
    }
  | {
      action: "prune";
      path: string;
    };

export type StateMigrationResult =
  | {
      status: "current";
      stateRoot: string;
      actions: StateMigrationAction[];
    }
  | {
      status: "dry-run";
      stateRoot: string;
      actions: StateMigrationAction[];
      backup: boolean;
    };

export type StateMigrationOptions = {
  to: 2;
  dryRun?: boolean;
  backup?: boolean;
};

export type StateMigrationServiceOptions = {
  stateRoot: string;
};

export class StateMigrationError extends Error {
  readonly reasonCode: "STATE_MIGRATION_INCOMPLETE" | "STATE_MIGRATION_BLOCKED";
  readonly diagnostics: DiagnosticV2[];

  constructor(input: {
    reasonCode: "STATE_MIGRATION_INCOMPLETE" | "STATE_MIGRATION_BLOCKED";
    diagnostics: DiagnosticV2[];
  }) {
    super(input.reasonCode);
    this.name = "StateMigrationError";
    this.reasonCode = input.reasonCode;
    this.diagnostics = input.diagnostics;
  }
}

export class StateMigrationService {
  private readonly stateRoot: string;

  constructor(options: StateMigrationServiceOptions) {
    this.stateRoot = options.stateRoot;
  }

  inspect(): Promise<StateMigrationStatus> {
    return inspectStateMigrationStatus(this.stateRoot);
  }

  async migrate(options: StateMigrationOptions): Promise<StateMigrationResult> {
    const status = await this.inspect();

    if (status.status === "current") {
      return {
        status: "current",
        stateRoot: this.stateRoot,
        actions: [],
      };
    }

    if (status.status === "incomplete" || status.status === "invalid") {
      throw new StateMigrationError({
        reasonCode: status.reasonCode,
        diagnostics: status.diagnostics,
      });
    }

    const actions = await this.planMigrationActions();
    if (options.dryRun) {
      return {
        status: "dry-run",
        stateRoot: this.stateRoot,
        actions,
        backup: options.backup !== false,
      };
    }

    throw new StateMigrationError({
      reasonCode: "STATE_MIGRATION_INCOMPLETE",
      diagnostics: [
        {
          code: "STATE_MIGRATION_WRITE_NOT_IMPLEMENTED",
          message: "State migration write mode is not implemented yet.",
          path: this.stateRoot,
          retryable: false,
        },
      ],
    });
  }

  private async planMigrationActions(): Promise<StateMigrationAction[]> {
    const actions: StateMigrationAction[] = [
      { action: "rewrite", path: path.join(this.stateRoot, "manifest.json") },
      { action: "rewrite", path: path.join(this.stateRoot, "lock.json") },
      { action: "rewrite", path: path.join(this.stateRoot, "preferences.json") },
      { action: "rewrite", path: path.join(this.stateRoot, "collections.json") },
    ];

    if (await pathExists(path.join(this.stateRoot, "virtual-groups.json"))) {
      actions.push({
        action: "materialize-collection",
        path: path.join(this.stateRoot, "source", "collection"),
      });
    }

    actions.push(
      { action: "prune", path: path.join(this.stateRoot, "catalog", "import-data.json") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "source-metadata.json") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "import-preparations.json") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "import-preparations") },
      { action: "prune", path: path.join(this.stateRoot, "catalog", "git") },
    );

    return actions;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

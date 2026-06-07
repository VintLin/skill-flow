import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import { runMigrateStateCli, type MigrateStateRuntime } from "../state-migration-command.js";

describe("migrate-state cli", () => {
  test("migrate-state dry-run prints planned actions", async () => {
    const stateRoot = "/tmp/skill-flow-state";
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runtime: MigrateStateRuntime = {
      store: { rootPath: stateRoot },
      inspectStateMigration: async () => ({ status: "migration-required" }),
      migrateState: async () => ({
        status: "dry-run",
        actions: [
          { action: "rewrite", path: path.join(stateRoot, "manifest.json") },
          { action: "prune", path: path.join(stateRoot, "catalog", "import-data.json") },
        ],
      }),
    };

    const exitCode = await runMigrateStateCli(
      runtime,
      { to: "v2", dryRun: true },
      {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).toContain("Migration required");
    expect(stdout.join("\n")).toContain("manifest.json rewrite");
    expect(stdout.join("\n")).toContain("catalog/import-data.json prune");
  });

  test("migrate-state forwards tolerate orphan sources option", async () => {
    const stateRoot = "/tmp/skill-flow-state";
    const stdout: string[] = [];
    const stderr: string[] = [];
    const migrateState = vi.fn(async () => ({
      status: "current" as const,
      actions: [],
    }));
    const runtime: MigrateStateRuntime = {
      store: { rootPath: stateRoot },
      inspectStateMigration: async () => ({ status: "migration-required" }),
      migrateState,
    };

    const exitCode = await runMigrateStateCli(
      runtime,
      { to: "v2", tolerateOrphanSources: true },
      {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(migrateState).toHaveBeenCalledWith({ to: 2, tolerateOrphanSources: true });
  });
});

#!/usr/bin/env node
import fs from "node:fs/promises";
import React from "react";
import { Command } from "commander";
import { render } from "ink";
import packageJson from "../package.json" with { type: "json" };
import { SkillFlowApp } from "@skill-flow/query/runtime";
import { ConfigBootstrapApp } from "@skill-flow/tui/config-app.js";
import { FindApp } from "@skill-flow/tui/find-app.js";
import { AddFlowApp, runAddFlowNonInteractive, type AddFlowExitResult } from "@skill-flow/tui/add-flow.js";
import { formatGroupRef } from "@skill-flow/integration/utils/naming";
import {
  formatActionSummary,
  formatDoctorIssue,
  formatSkillCandidates,
  formatWorkflowList,
} from "@skill-flow/integration/utils/format";
import { filterAddWarnings, resolveAddSourceLocator } from "@skill-flow/integration/utils/cli";
import { buildFindCommand } from "@skill-flow/integration/utils/find-command";
import { runBridgeCommand } from "./bridge-runner.js";
import { runMigrateStateCli } from "./state-migration-command.js";
import { parseImportManifestText } from "./import-manifest-command.js";

const program = new Command();
const app = new SkillFlowApp();

process.env.SKILL_FLOW_CALLER ??= "cli";

program
  .name("skill-flow")
  .description("Workflow-first skill projection manager")
  .version(packageJson.version);

program
  .command("add")
  .argument("<source>", "Source locator")
  .option("--path <repoSubpath>", "Filter Git sources to a specific repo subpath")
  .option("--from <catalog>", "Interpret source using a named catalog")
  .option("--skill <id>", "Enable a specific skill selector", collectOption, [])
  .option("--agent <target>", "Enable a specific deployment target", collectOption, [])
  .option("--yes", "Skip prompts and use default selections")
  .option("--all", "Enable all discovered skills and all detected targets")
  .action(async (
    source: string,
    options: {
      path?: string;
      from?: string;
      skill?: string[];
      agent?: string[];
      yes?: boolean;
      all?: boolean;
    },
  ) => {
    let resolvedSource: string;
    try {
      resolvedSource = resolveAddSourceLocator(source, options.from);
    } catch (error) {
      printErrors([{ message: error instanceof Error ? error.message : String(error) }]);
      process.exitCode = 1;
      return;
    }

    const request = {
      locator: resolvedSource,
      ...(options.path ? { path: options.path } : {}),
      ...(options.skill?.length ? { requestedSkills: options.skill } : {}),
      ...(options.agent?.length ? { requestedAgents: options.agent } : {}),
      ...(options.yes ? { yes: true } : {}),
      ...(options.all ? { all: true } : {}),
    };

    if (options.all || options.yes) {
      const result = await runAddFlowNonInteractive(createProgressReportingAddApp(app), request);
      handleAddFlowResult(result);
      return;
    }

    const result = await runRenderedAddFlow(app, request);
    handleAddFlowResult(result, { rendered: true });
  });

program
  .command("list")
  .option("--ids", "Show source ids next to display names")
  .option("--warnings", "Show warning details under affected groups")
  .option("--json", "Print JSON output")
  .action(async (options: { ids?: boolean; warnings?: boolean; json?: boolean }) => {
    const result = await app.listWorkflows();
    if (!result.ok) {
      printErrors(result.errors);
      process.exitCode = 1;
      return;
    }
    if (options.json) {
      console.log(JSON.stringify(result.data.summaries, null, 2));
      return;
    }
    console.log(formatWorkflowList(result.data.summaries, {
      showIds: Boolean(options.ids),
      showWarnings: Boolean(options.warnings),
    }));
  });

program
  .command("enable")
  .argument("<sourceIds...>", "Skills group ids to enable")
  .option("--targets <ids>", "Comma-separated target ids to enable")
  .option("--all-skills", "If a group has no selected skills, select all current skills before enabling targets")
  .action(async (sourceIds: string[], options: { targets?: string; allSkills?: boolean }) => {
    const result = await app.enableSources(sourceIds, parseTargets(options.targets) as never, {
      allSkills: Boolean(options.allSkills),
    });
    handleSourceTargetUpdate(result);
  });

program
  .command("disable")
  .argument("<sourceIds...>", "Skills group ids to disable")
  .action(async (sourceIds: string[]) => {
    const result = await app.disableSources(sourceIds);
    handleSourceTargetUpdate(result);
  });

program
  .command("only")
  .argument("<sourceIds...>", "Skills group ids to keep enabled")
  .option("--targets <ids>", "Comma-separated target ids to enable")
  .option("--all-skills", "If a group has no selected skills, select all current skills before enabling targets")
  .action(async (sourceIds: string[], options: { targets?: string; allSkills?: boolean }) => {
    const result = await app.onlySources(sourceIds, parseTargets(options.targets) as never, {
      allSkills: Boolean(options.allSkills),
    });
    handleSourceTargetUpdate(result);
  });

program
  .command("find")
  .alias("search")
  .argument("<query>", "Search query")
  .option("--json", "Print JSON output")
  .action(async (query: string, options: { json?: boolean }) => {
    if (options.json) {
      const result = await app.findSkills(query);
      if (!result.ok) {
        printErrors(result.errors);
        process.exitCode = 1;
        return;
      }
      console.log(
        JSON.stringify(
          result.data.candidates.map((candidate) => ({
            ...candidate,
            nextCommand: buildFindCommand(candidate),
          })),
          null,
          2,
        ),
      );
      return;
    }
    const instance = render(<FindApp app={app} query={query} />);
    await instance.waitUntilExit();
  });

program.command("config").action(async () => {
  const instance = render(<ConfigBootstrapApp app={app} />);
  await instance.waitUntilExit();
});

program
  .command("repair-source")
  .argument("[sourceId]", "Optional skills group id")
  .option("--all", "Repair owned source checkouts for all registered skills groups")
  .action(async (sourceId: string | undefined, options: { all?: boolean }) => {
    const ids = options.all || !sourceId ? undefined : [sourceId];
    const result = await app.repairSource(ids);
    if (!result.ok) {
      printErrors(result.errors);
      process.exitCode = 1;
      return;
    }
    for (const item of result.data.updated) {
      console.log(
        `${item.sourceId}  changed:${item.changed}  +${item.addedLeafIds.length}  -${item.removedLeafIds.length}  invalidated:${item.invalidatedLeafIds.length}`,
      );
    }
    printWarnings(result.warnings.map((warning) => warning.message));
  });

program
  .command("repair-state")
  .argument("[sourceId]", "Optional skills group id")
  .option("--all", "Rebuild source-side state for all registered skills groups")
  .action(async (sourceId: string | undefined, options: { all?: boolean }) => {
    const ids = options.all || !sourceId ? undefined : [sourceId];
    const result = await app.repairState(ids);
    if (!result.ok) {
      printErrors(result.errors);
      process.exitCode = 1;
      return;
    }
    console.log(
      `repaired sources:${result.data.repairedSourceIds.length}  removed deployments:${result.data.removedDeploymentCount}`,
    );
    printWarnings(result.warnings.map((warning) => warning.message));
  });

program
  .command("migrate-state")
  .requiredOption("--to <version>", "Target state schema version")
  .option("--dry-run", "Print planned migration actions without modifying state")
  .option("--state-root <path>", "Override the skill-flow state root for this command")
  .option("--no-backup", "Do not create a backup before migration")
  .option("--tolerate-orphans", "Drop legacy virtual sources that have no virtual group definition")
  .action(async (options: {
    to: string;
    dryRun?: boolean;
    stateRoot?: string;
    backup?: boolean;
    tolerateOrphans?: boolean;
  }) => {
    const runtime = options.stateRoot ? createAppForStateRoot(options.stateRoot) : app;
    process.exitCode = await runMigrateStateCli(runtime, {
      ...options,
      ...(options.tolerateOrphans !== undefined
        ? { tolerateOrphanSources: options.tolerateOrphans }
        : {}),
    });
  });

program
  .command("import-manifest")
  .argument("<file>", "Import manifest file")
  .option("--dry-run", "Validate and summarize without writing state")
  .option("--apply", "Apply the import manifest")
  .option("--continue-on-error", "Continue after per-source failures")
  .option("--skip-existing", "Skip sources already in state")
  .option("--skip-local-missing", "Skip missing local source paths")
  .option("--summary <path>", "Write JSON summary to a file")
  .action(async (
    file: string,
    options: {
      dryRun?: boolean;
      apply?: boolean;
      continueOnError?: boolean;
      skipExisting?: boolean;
      skipLocalMissing?: boolean;
      summary?: string;
    },
  ) => {
    let manifest;
    try {
      manifest = parseImportManifestText(await fs.readFile(file, "utf8"), file);
    } catch (error) {
      printErrors([{ message: error instanceof Error ? error.message : String(error) }]);
      process.exitCode = 1;
      return;
    }
    const result = await app.importManifest({
      ...manifest,
      dryRun: options.apply ? Boolean(options.dryRun) : true,
      apply: Boolean(options.apply),
      skipExisting: Boolean(options.skipExisting),
      continueOnError: Boolean(options.continueOnError),
      skipLocalMissing: Boolean(options.skipLocalMissing),
    });
    await handleImportManifestResult(result, options.summary);
  });

program
  .command("update")
  .argument("[sourceId]", "Optional skills group id")
  .option("--all", "Update all registered skills groups")
  .action(async (sourceId: string | undefined, options: { all?: boolean }) => {
    const ids = options.all || !sourceId ? undefined : [sourceId];
    const result = await app.updateSources(ids);
    if (!result.ok) {
      printErrors(result.errors);
      process.exitCode = 1;
      return;
    }
    const summariesResult = await app.listWorkflows();
    const summaries = summariesResult.ok ? summariesResult.data.summaries : [];
    for (const item of result.data.updated) {
      const summary = summaries.find((summary) => summary.source.id === item.sourceId);
      const groupRef = summary ? formatGroupRef(summary.source) : item.sourceId;
      console.log(
        `${groupRef}  changed:${item.changed}  +${item.addedLeafIds.length}  -${item.removedLeafIds.length}  invalidated:${item.invalidatedLeafIds.length}`,
      );
    }
    printWarnings(result.warnings.map((warning) => warning.message));
  });

program
  .command("repair-targets")
  .argument("[sourceId]", "Optional skills group id")
  .option("--all", "Repair targets for all registered skills groups")
  .action(async (sourceId: string | undefined, options: { all?: boolean }) => {
    const ids = options.all || !sourceId ? undefined : [sourceId];
    const result = await app.repairTargets(ids);
    if (!result.ok) {
      printErrors(result.errors);
      process.exitCode = 1;
      return;
    }
    console.log(formatActionSummary(result.data.actions));
    printWarnings(result.warnings.map((warning) => warning.message));
  });

program.command("doctor").action(async () => {
  const result = await app.doctor();
  if (!result.ok) {
    printErrors(result.errors);
    process.exitCode = 1;
    return;
  }
  console.log(result.data.status);
  if (result.data.issues.length === 0) {
    console.log("No issues detected.");
    return;
  }
  for (const issue of result.data.issues) {
    console.log(formatDoctorIssue(issue));
  }
});

program
  .command("uninstall")
  .argument("<sourceIds...>", "Skills group ids to remove")
  .action(async (sourceIds: string[]) => {
    const result = await app.uninstall(sourceIds);
    if (!result.ok) {
      printErrors(result.errors);
      process.exitCode = 1;
      return;
    }
    const removed = result.data.removedRefs.map((source) => formatGroupRef(source));
    console.log(`Removed: ${removed.join(", ")}`);
    printWarnings(result.data.warnings);
  });

program
  .command("bridge")
  .description("Execute machine protocol requests for desktop/helper integrations")
  .option("--json", "Require JSON request/response envelope")
  .option("--request <json>", "Raw request JSON (falls back to stdin if omitted)")
  .action(async (options: { json?: boolean; request?: string }) => {
    process.exitCode = await runBridgeCommand(app, options);
  });

await program.parseAsync(process.argv);

function printErrors(errors: Array<{ message: string }>) {
  for (const error of errors) {
    console.error(error.message);
  }
}

function printWarnings(messages: string[]) {
  for (const message of messages) {
    console.warn(`warning: ${message}`);
  }
}

function parseTargets(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function handleSourceTargetUpdate(result: Awaited<ReturnType<SkillFlowApp["onlySources"]>>) {
  if (!result.ok) {
    printErrors(result.errors);
    process.exitCode = 1;
    return;
  }

  if (result.data.backupPath) {
    console.log(`Backup: ${result.data.backupPath}`);
  }
  console.log(`Enabled: ${result.data.enabledSourceIds.length}`);
  console.log(`Disabled: ${result.data.disabledSourceIds.length}`);
  const summary = formatActionSummary(result.data.actions);
  if (summary) {
    console.log(summary);
  }
  printWarnings(result.warnings.map((warning) => warning.message));
}

async function handleImportManifestResult(
  result: Awaited<ReturnType<SkillFlowApp["importManifest"]>>,
  summaryPath: string | undefined,
) {
  if (!result.ok) {
    printErrors(result.errors);
    process.exitCode = 1;
    return;
  }

  if (result.data.backupPath) {
    console.log(`Backup: ${result.data.backupPath}`);
  }
  console.log(`Imported: ${result.data.imported}`);
  console.log(`Enabled: ${result.data.enabled}`);
  console.log(`Inactive: ${result.data.inactive}`);
  console.log(`Skipped existing: ${result.data.skippedExisting}`);
  console.log(`Skipped local missing: ${result.data.skippedLocalMissing}`);
  console.log(`Failed: ${result.data.failed}`);
  if (summaryPath) {
    await fs.writeFile(summaryPath, `${JSON.stringify(result.data, null, 2)}\n`, "utf8");
  }
  printWarnings(result.warnings.map((warning) => warning.message));
}

function createAppForStateRoot(stateRoot: string): SkillFlowApp {
  const previousStateRoot = process.env.SKILL_FLOW_STATE_ROOT;
  process.env.SKILL_FLOW_STATE_ROOT = stateRoot;
  const runtime = new SkillFlowApp();
  if (previousStateRoot === undefined) {
    delete process.env.SKILL_FLOW_STATE_ROOT;
  } else {
    process.env.SKILL_FLOW_STATE_ROOT = previousStateRoot;
  }
  return runtime;
}

function createProgressReportingAddApp(runtime: SkillFlowApp): SkillFlowApp {
  const progressApp = Object.create(runtime) as SkillFlowApp;
  progressApp.prepareAddSource = (locator, options) =>
    runtime.prepareAddSource(locator, {
      ...options,
      onProgress: (message) => console.log(message),
    });
  progressApp.applyDraft = (sourceId, draft, scope) => {
    console.log("Applying projections");
    return runtime.applyDraft(sourceId, draft, scope);
  };
  return progressApp;
}

async function runRenderedAddFlow(
  app: SkillFlowApp,
  request: {
    locator: string;
    path?: string;
    requestedSkills?: string[];
    requestedAgents?: string[];
    yes?: boolean;
    all?: boolean;
  },
): Promise<AddFlowExitResult> {
  return new Promise<AddFlowExitResult>((resolve) => {
    const instance = render(
      <AddFlowApp
        app={app}
        request={request}
        onExit={(result) => {
          resolve(result);
          instance.unmount();
        }}
      />,
    );
  });
}

function handleAddFlowResult(
  result: AddFlowExitResult,
  options?: { rendered?: boolean },
) {
  if (result.status === "applied") {
    if (!options?.rendered) {
      console.log(result.message);
    }
    printWarnings(filterAddWarnings(result.warnings));
    return;
  }

  if (result.status === "cancelled") {
    console.log(result.message);
    return;
  }

  printErrors([{ message: result.message }]);
  printWarnings(filterAddWarnings(result.warnings ?? []));
  process.exitCode = 1;
}

function collectOption(value: string, previous: string[]) {
  return [...previous, value];
}

#!/usr/bin/env node
import React from "react";
import { Command } from "commander";
import { render } from "ink";
import { SkillFlowApp } from "./services/skill-flow.js";
import { ConfigBootstrapApp } from "./tui/config-app.js";
import { FindApp } from "./tui/find-app.js";
import { formatGroupRef } from "./utils/naming.js";
import {
  formatActionSummary,
  formatDoctorIssue,
  formatSkillCandidates,
  formatWorkflowList,
} from "./utils/format.js";
import { buildFindCommand } from "./utils/find-command.js";

const program = new Command();
const app = new SkillFlowApp();

program
  .name("skill-flow")
  .description("Workflow-first skill projection manager")
  .version("1.0.3");

program
  .command("add")
  .argument("<source>", "Source locator")
  .option("--path <repoSubpath>", "Filter Git sources to a specific repo subpath")
  .action(async (source: string, options: { path?: string }) => {
    const result = await app.addSource(
      source,
      options.path ? { path: options.path } : undefined,
    );
    if (!result.ok) {
      printErrors(result.errors);
      process.exitCode = 1;
      return;
    }
    const duplicateSkipCount = result.warnings.filter((warning) =>
      warning.message.includes("Duplicate skill content skipped because"),
    ).length;
    const visibleWarnings = result.warnings.filter(
      (warning) => !warning.message.includes("Duplicate skill content skipped because"),
    );
    const duplicateSummary =
      duplicateSkipCount > 0
        ? `, skipped ${duplicateSkipCount} duplicate skill${duplicateSkipCount === 1 ? "" : "s"}`
        : "";
    console.log(
      `Added ${formatGroupRef(result.data.manifest)} with ${result.data.leafCount} valid skills${duplicateSummary}.`,
    );
    printWarnings(visibleWarnings.map((warning) => warning.message));
  });

program.command("list").action(async () => {
  const result = await app.listWorkflows();
  if (!result.ok) {
    printErrors(result.errors);
    process.exitCode = 1;
    return;
  }
  console.log(formatWorkflowList(result.data.summaries));
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
      printWarnings(result.warnings.map((warning) => warning.message));
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

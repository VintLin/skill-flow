#!/usr/bin/env node
import { SkillFlowApp } from "@skill-flow/query/runtime";
import { parseBridgeProcessArgs, runBridgeCommand } from "./bridge-runner.js";

process.env.SKILL_FLOW_CALLER ??= "desktop-bridge";

const app = new SkillFlowApp();
process.exitCode = await runBridgeCommand(app, parseBridgeProcessArgs(process.argv.slice(2)));

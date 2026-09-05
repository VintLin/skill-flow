import {
  BRIDGE_COMMAND_NAMES,
  buildBridgeResponse,
  type BridgeCommandName,
  type BridgeRequest,
  type BridgeResponse,
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from "@skill-flow/shared-types/protocol";
import {
  USAGE_AGENTS,
  type DraftBinding,
  type ImportDraft,
  type ProjectScope,
  type UsageAgent,
  type UsageConfidence,
  type UsageRefreshTrigger,
  type UsageSnapshotFilters,
} from "@skill-flow/domain/types";
import type { SkillFlowApp } from "@skill-flow/query/runtime";
import { listWorkflows, type WorkflowListQuery } from "@skill-flow/query/application-queries";

type BridgeFailure = {
  code: string;
  message: string;
};

type BridgeResult<T> = {
  ok: true;
  data: T;
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
} | {
  ok: false;
  data?: T;
  warnings: Array<{ code: string; message: string }>;
  errors: Array<{ code: string; message: string }>;
};

type BridgeCommandHandler = (app: SkillFlowApp, request: BridgeRequest) => Promise<BridgeResponse>;
type BridgeCommandHandlerMap = Record<BridgeCommandName, BridgeCommandHandler>;
type BridgeResultCommand<T> = () => Promise<BridgeResult<T>>;
type BridgeValueCommand<T> = () => Promise<T>;

type CollectionSkillRef = {
  sourceId: string;
  leafId: string;
  skillPath?: string;
};

type CollectionBridgeApp = {
  createCollection(args: {
    displayName: string;
    skills: CollectionSkillRef[];
    enabledTargets: string[];
  }): Promise<BridgeResult<unknown>>;
  mergeGroups(args: {
    displayName: string;
    sourceIds: string[];
    enabledTargets: string[];
  }): Promise<BridgeResult<unknown>>;
  restoreCollectionSources(collectionId: string): Promise<BridgeResult<unknown>>;
};

export async function executeBridgeRequest(
  app: SkillFlowApp,
  request: BridgeRequest,
): Promise<BridgeResponse> {
  try {
    const previousCaller = process.env.SKILL_FLOW_CALLER;
    process.env.SKILL_FLOW_CALLER = previousCaller?.trim() || "bridge";
    try {
      if (!BRIDGE_COMMAND_NAMES.includes(request.command as BridgeCommandName)) {
        return buildResponseWithRequest({
          request,
          ok: false,
          errors: [
            {
              code: "UNSUPPORTED_COMMAND",
              message: `Bridge command '${request.command}' is not supported.`,
            },
          ],
        });
      }
      return await bridgeCommandHandlers[request.command](app, request);
    } finally {
      if (previousCaller === undefined) {
        delete process.env.SKILL_FLOW_CALLER;
      } else {
        process.env.SKILL_FLOW_CALLER = previousCaller;
      }
    }
  } catch (error) {
    return buildResponseWithRequest({
      request,
      ok: false,
      errors: [
        {
          code: "BRIDGE_REQUEST_INVALID",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    });
  }
}

export function getBridgeCommandHandlerNames(): BridgeCommandName[] {
  return BRIDGE_COMMAND_NAMES.filter((command) => bridgeCommandHandlers[command]);
}

const bridgeCommandHandlers = {
  bootstrap: (app, request) => runBridgeResult(request, () => app.bootstrapWorkspaceState()),
  list: (app, request) => runBridgeResult(request, () => listWorkflows(app as SkillFlowApp & WorkflowListQuery)),
  "inspect-state-migration": (app, request) => runBridgeValue(request, () => app.inspectStateMigration()),
  "migrate-state": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "migrate-state");
    const to = expectMigrationTarget(payload.to);
    const dryRun = expectOptionalBoolean(payload.dryRun, "dryRun", "migrate-state");
    const backup = expectOptionalBoolean(payload.backup, "backup", "migrate-state");
    const tolerateOrphanSources = expectOptionalBoolean(
      payload.tolerateOrphanSources,
      "tolerateOrphanSources",
      "migrate-state",
    );
    return runBridgeValue(request, () => app.migrateState({
      to,
      ...(dryRun !== undefined ? { dryRun } : {}),
      ...(backup !== undefined ? { backup } : {}),
      ...(tolerateOrphanSources !== undefined ? { tolerateOrphanSources } : {}),
    }));
  },
  inspect: async (app, request) => {
    const payload = expectObjectPayload(request.payload, "inspect");
    const sourceId = expectString(payload.sourceId, "sourceId", "inspect");
    const scope = expectProjectScope(payload.scope);
    return runBridgeResult(request, () => app.inspectSource(sourceId, scope));
  },
  "inspect-enrichment": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "inspect-enrichment");
    const sourceId = expectString(payload.sourceId, "sourceId", "inspect-enrichment");
    return runBridgeResult(request, () => app.inspectSourceEnrichment(sourceId));
  },
  "search-import-groups": async (app, request) => {
    const payload = expectOptionalObject(request.payload, "search-import-groups");
    const query = payload ? expectOptionalString(payload.query, "query", "search-import-groups") : undefined;
    return runBridgeResult(request, () => app.searchImportGroups(query ?? ""));
  },
  "scan-local-import-groups": async (app, request) => {
    const payload = expectOptionalObject(request.payload, "scan-local-import-groups");
    const localPath = payload ? expectOptionalString(payload.path, "path", "scan-local-import-groups") : undefined;
    return runBridgeResult(request, () => app.scanLocalImportGroups(localPath));
  },
  "prepare-import-source": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "prepare-import-source");
    const locator = expectString(payload.locator, "locator", "prepare-import-source");
    return runBridgeResult(request, () => app.prepareImportSource(locator));
  },
  "preview-import-source": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "preview-import-source");
    const locator = expectString(payload.locator, "locator", "preview-import-source");
    return runBridgeResult(request, () => app.previewImportSource(locator));
  },
  "commit-import-source": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "commit-import-source");
    const preparationId = expectString(payload.preparationId, "preparationId", "commit-import-source");
    const draft = expectOptionalImportDraft(payload.draft);
    return runBridgeMutationWithWorkspace(app, request, () => app.commitPreparedImportSource(preparationId, draft));
  },
  "import-source": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "import-source");
    const locator = expectString(payload.locator, "locator", "import-source");
    const draft = expectOptionalImportDraft(payload.draft);
    return runBridgeMutationWithWorkspace(app, request, () => app.importSource(locator, draft));
  },
  "toggle-pin": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "toggle-pin");
    const sourceId = expectString(payload.sourceId, "sourceId", "toggle-pin");
    return runBridgeResult(request, () => app.togglePinnedSource(sourceId));
  },
  "rename-source": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "rename-source");
    const sourceId = expectString(payload.sourceId, "sourceId", "rename-source");
    const displayName = expectPossiblyEmptyString(payload.displayName, "displayName", "rename-source");
    return runBridgeResult(request, () => app.renameSource(sourceId, displayName));
  },
  "create-collection": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "create-collection");
    const displayName = expectString(payload.displayName, "displayName", "create-collection");
    const skills = parseCollectionSkillRefs(payload.skills, "create-collection");
    const enabledTargets = parseOptionalStringArray(
      payload.enabledTargets,
      "create-collection.enabledTargets",
    ) ?? [];
    return runBridgeResult(request, () => (app as SkillFlowApp & CollectionBridgeApp).createCollection({
      displayName,
      skills,
      enabledTargets,
    }));
  },
  "merge-groups": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "merge-groups");
    const displayName = expectString(payload.displayName, "displayName", "merge-groups");
    const sourceIds = parseRequiredStringArray(payload.sourceIds, "merge-groups.sourceIds");
    const enabledTargets = parseOptionalStringArray(
      payload.enabledTargets,
      "merge-groups.enabledTargets",
    ) ?? [];
    return runBridgeResult(request, () => (app as SkillFlowApp & CollectionBridgeApp).mergeGroups({
      displayName,
      sourceIds,
      enabledTargets,
    }));
  },
  "restore-collection-sources": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "restore-collection-sources");
    const collectionId = expectString(
      payload.collectionId,
      "collectionId",
      "restore-collection-sources",
    );
    return runBridgeResult(request, () => (
      app as SkillFlowApp & CollectionBridgeApp
    ).restoreCollectionSources(collectionId));
  },
  doctor: (app, request) => runBridgeResult(request, () => app.doctor()),
  "adopt-external-source": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "adopt-external-source");
    const paths = parseRequiredStringArray(payload.paths, "adopt-external-source.paths");
    const displayName = expectOptionalString(payload.displayName, "displayName", "adopt-external-source");
    return runBridgeResult(request, () => app.adoptExternalSource(paths, {
      ...(displayName !== undefined ? { displayName } : {}),
    }));
  },
  "configure-external-source": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "configure-external-source");
    const sourceId = expectString(payload.sourceId, "sourceId", "configure-external-source");
    const updateSteps = payload.updateSteps === undefined
      ? undefined
      : parseExternalCommandSteps(payload.updateSteps, "configure-external-source.updateSteps");
    const versionProbe = payload.versionProbe === undefined
      ? undefined
      : parseExternalCommandStep(payload.versionProbe, "configure-external-source.versionProbe");
    const upstream = payload.upstream === undefined
      ? undefined
      : parseExternalUpstream(payload.upstream);
    if (!updateSteps && !versionProbe && !upstream) {
      throw new Error("Bridge command 'configure-external-source' requires updateSteps, versionProbe, or upstream.");
    }
    return runBridgeResult(request, () => app.configureExternalSource(sourceId, {
      ...(updateSteps ? { updateSteps } : {}),
      ...(versionProbe ? { versionProbe } : {}),
      ...(upstream ? { upstream } : {}),
    }));
  },
  "external-status": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "external-status");
    const sourceId = expectString(payload.sourceId, "sourceId", "external-status");
    return runBridgeResult(request, () => app.refreshExternalSource(sourceId));
  },
  "external-update": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "external-update");
    const sourceId = expectString(payload.sourceId, "sourceId", "external-update");
    if (payload.confirmExternalUpdate !== true) {
      throw new Error("Bridge command 'external-update' requires confirmExternalUpdate: true.");
    }
    return runBridgeResult(request, () => app.updateExternalSource(sourceId));
  },
  "refresh-usage": async (app, request) => {
    const payload = expectOptionalObject(request.payload, "refresh-usage");
    const trigger = expectOptionalUsageRefreshTrigger(payload?.trigger);
    return runBridgeValue(request, () => app.refreshUsageObservations({
      trigger: trigger ?? "scheduled",
    }));
  },
  "usage-snapshot": async (app, request) => {
    const payload = expectOptionalObject(request.payload, "usage-snapshot");
    return runBridgeValue(request, () => app.getUsageSnapshot(parseUsageSnapshotFilters(payload)));
  },
  add: async (app, request) => {
    const payload = expectObjectPayload(request.payload, "add");
    const locator = expectString(payload.locator, "locator", "add");
    const options = expectOptionalObject(payload.options, "add.options");
    const applyNow = payload.applyNow === true;
    return runBridgeResult(request, () => applyNow
      ? app.addSource(locator, options as Parameters<SkillFlowApp["addSource"]>[1])
      : app.prepareAddSource(locator, options as Parameters<SkillFlowApp["prepareAddSource"]>[1]));
  },
  apply: async (app, request) => {
    const payload = expectObjectPayload(request.payload, "apply");
    const sourceId = expectString(payload.sourceId, "sourceId", "apply");
    const draft = expectDraftBinding(payload.draft);
    const scope = expectProjectScope(payload.scope);
    return runBridgeResult(request, () => app.applyDraft(sourceId, draft, scope));
  },
  update: async (app, request) => {
    const payload = expectOptionalObject(request.payload, "update");
    const sourceIds = parseOptionalStringArray(payload?.sourceIds, "update.sourceIds");
    return runBridgeMutationWithWorkspace(app, request, () => app.updateSources(sourceIds));
  },
  uninstall: async (app, request) => {
    const payload = expectObjectPayload(request.payload, "uninstall");
    const sourceIds = parseRequiredStringArray(payload.sourceIds, "uninstall.sourceIds");
    return runBridgeResult(request, () => app.uninstall(sourceIds), { includeSuccessWarnings: false });
  },
  "save-settings": async (app, request) => {
    const payload = expectObjectPayload(request.payload, "save-settings");
    const customTargets = expectCustomTargets(payload.customTargets);
    const agentDisplayOrder = parseOptionalStringArray(
      payload.agentDisplayOrder,
      "save-settings.agentDisplayOrder",
    ) ?? [];
    return runBridgeResult(request, () => app.saveSettings({ customTargets, agentDisplayOrder }));
  },
} satisfies BridgeCommandHandlerMap;

async function runBridgeResult<T>(
  request: BridgeRequest,
  command: BridgeResultCommand<T>,
  options: { includeSuccessWarnings?: boolean } = {},
): Promise<BridgeResponse> {
  const result = await command();
  if (!result.ok) {
    return toFailureResponse(request, result.errors, result.warnings);
  }
  return buildResponseWithRequest({
    request,
    ok: true,
    data: sanitizeForJson(result.data),
    ...(options.includeSuccessWarnings === false ? {} : {
      warnings: result.warnings.map((warning) => ({
        code: warning.code,
        message: warning.message,
      })),
    }),
  });
}

async function runBridgeMutationWithWorkspace<T>(
  app: SkillFlowApp,
  request: BridgeRequest,
  command: BridgeResultCommand<T>,
): Promise<BridgeResponse> {
  const result = await command();
  if (!result.ok) {
    return toFailureResponse(request, result.errors, result.warnings);
  }

  const workspace = await app.bootstrapWorkspaceState();
  const resultData = sanitizeForJson(result.data);
  const data = workspace.ok && isJsonObject(resultData)
    ? { ...resultData, workspace: sanitizeForJson(workspace.data) }
    : resultData;

  return buildResponseWithRequest({
    request,
    ok: true,
    data,
    warnings: result.warnings.map((warning) => ({
      code: warning.code,
      message: warning.message,
    })),
  });
}

async function runBridgeValue<T>(
  request: BridgeRequest,
  command: BridgeValueCommand<T>,
): Promise<BridgeResponse> {
  const result = await command();
  return buildResponseWithRequest({
    request,
    ok: true,
    data: sanitizeForJson(result),
  });
}

function toFailureResponse(
  request: BridgeRequest,
  errors: Array<{ code: string; message: string }>,
  warnings: Array<{ code: string; message: string }>,
): BridgeResponse {
  return buildResponseWithRequest({
    request,
    ok: false,
    warnings: warnings.map((warning) => ({ code: warning.code, message: warning.message })),
    errors: errors.map((error) => ({ code: error.code, message: error.message })),
  });
}

function buildResponseWithRequest(
  args: Omit<Parameters<typeof buildBridgeResponse>[0], "command" | "requestId"> & {
    request: BridgeRequest;
  },
): BridgeResponse {
  return buildBridgeResponse({
    command: args.request.command,
    ...(args.request.requestId ? { requestId: args.request.requestId } : {}),
    ok: args.ok,
    ...(args.data !== undefined ? { data: args.data } : {}),
    ...(args.warnings ? { warnings: args.warnings } : {}),
    ...(args.errors ? { errors: args.errors } : {}),
  });
}

function expectObjectPayload(payload: JsonValue | undefined, command: string): JsonObject {
  if (!isJsonObject(payload)) {
    throw new Error(`Bridge command '${command}' requires an object payload.`);
  }
  return payload;
}

function expectOptionalObject(value: JsonValue | undefined, field: string): JsonObject | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isJsonObject(value)) {
    throw new Error(`Field '${field}' must be a JSON object when provided.`);
  }
  return value;
}

function expectString(value: JsonValue | undefined, field: string, command: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Bridge command '${command}' requires a non-empty string field '${field}'.`);
  }
  return value;
}

function expectPossiblyEmptyString(value: JsonValue | undefined, field: string, command: string): string {
  if (typeof value !== "string") {
    throw new Error(`Bridge command '${command}' requires string field '${field}'.`);
  }
  return value;
}

function expectOptionalString(
  value: JsonValue | undefined,
  field: string,
  command: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`Bridge command '${command}' requires string field '${field}' when provided.`);
  }
  return value;
}

function expectOptionalBoolean(
  value: JsonValue | undefined,
  field: string,
  command: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    throw new Error(`Bridge command '${command}' requires boolean field '${field}' when provided.`);
  }
  return value;
}

function expectMigrationTarget(value: JsonValue | undefined): 2 {
  if (value !== 2) {
    throw new Error("Bridge command 'migrate-state' requires numeric field 'to' to be 2.");
  }
  return 2;
}

function parseRequiredStringArray(value: JsonValue | undefined, field: string): string[] {
  const parsed = parseOptionalStringArray(value, field);
  if (!parsed || parsed.length === 0) {
    throw new Error(`Field '${field}' must be a non-empty string array.`);
  }
  return parsed;
}

function parseOptionalStringArray(value: JsonValue | undefined, field: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new Error(`Field '${field}' must be a string array.`);
  }
  return value as string[];
}

function parseExternalCommandSteps(value: JsonValue | undefined, field: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Field '${field}' must be a non-empty command-step array.`);
  }
  return value.map((entry, index) => parseExternalCommandStep(entry, `${field}[${index}]`));
}

function parseExternalCommandStep(value: JsonValue | undefined, field: string) {
  if (!isJsonObject(value)) throw new Error(`Field '${field}' must be an object.`);
  const executable = expectString(value.executable, `${field}.executable`, "configure-external-source");
  const args = parseOptionalStringArray(value.args, `${field}.args`);
  if (!args) throw new Error(`Field '${field}.args' must be a string array.`);
  const workingDirectory = expectOptionalString(
    value.workingDirectory,
    `${field}.workingDirectory`,
    "configure-external-source",
  );
  return { executable, args, ...(workingDirectory !== undefined ? { workingDirectory } : {}) };
}

function parseExternalUpstream(value: JsonValue | undefined) {
  if (!isJsonObject(value)) throw new Error("Field 'upstream' must be an object.");
  const kind = expectString(value.kind, "upstream.kind", "configure-external-source");
  if (kind !== "github-release") throw new Error("Field 'upstream.kind' must be 'github-release'.");
  const repository = expectString(value.repository, "upstream.repository", "configure-external-source");
  const includePrerelease = expectOptionalBoolean(value.includePrerelease, "upstream.includePrerelease", "configure-external-source");
  return { kind: "github-release" as const, repository, ...(includePrerelease ? { includePrerelease: true } : {}) };
}

function parseCollectionSkillRefs(value: JsonValue | undefined, command: string): CollectionSkillRef[] {
  if (!Array.isArray(value)) {
    throw new Error(`Bridge command '${command}' requires array field 'skills'.`);
  }
  if (value.length === 0) {
    throw new Error(`Bridge command '${command}' requires non-empty array field 'skills'.`);
  }

  return value.map((entry, index) => {
    if (!isJsonObject(entry)) {
      throw new Error(`Field 'skills[${index}]' must be a JSON object.`);
    }

    const skillPath = expectOptionalString(entry.skillPath, `skills[${index}].skillPath`, command);
    return {
      sourceId: expectString(entry.sourceId, `skills[${index}].sourceId`, command),
      leafId: expectString(entry.leafId, `skills[${index}].leafId`, command),
      ...(skillPath !== undefined ? { skillPath } : {}),
    };
  });
}

function expectDraftBinding(value: JsonValue | undefined): DraftBinding {
  if (!isJsonObject(value)) {
    throw new Error("Bridge command 'apply' requires object field 'draft'.");
  }
  const selectedLeafIds = parseOptionalStringArray(value.selectedLeafIds, "draft.selectedLeafIds");
  if (!selectedLeafIds) {
    throw new Error("Field 'draft.selectedLeafIds' must be a string array.");
  }
  const enabledTargets = parseOptionalStringArray(value.enabledTargets, "draft.enabledTargets") ?? [];
  return {
    selectedLeafIds,
    enabledTargets: enabledTargets as DraftBinding["enabledTargets"],
  };
}

function expectOptionalImportDraft(value: JsonValue | undefined): ImportDraft | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isJsonObject(value)) {
    throw new Error("Field 'draft' must be a JSON object when provided.");
  }

  const skillSelectionMode = parseOptionalSkillSelectionMode(value.skillSelectionMode);
  const selectedSkills = parseOptionalImportSkillSelections(value.selectedSkills);
  if (skillSelectionMode !== "all" && !selectedSkills) {
    throw new Error("Field 'draft.selectedSkills' must be provided.");
  }

  const enabledTargets = parseOptionalStringArray(value.enabledTargets, "draft.enabledTargets") ?? [];

  return {
    ...(skillSelectionMode ? { skillSelectionMode } : {}),
    selectedSkills: selectedSkills ?? [],
    enabledTargets: enabledTargets as ImportDraft["enabledTargets"],
  };
}

function parseOptionalSkillSelectionMode(value: JsonValue | undefined): ImportDraft["skillSelectionMode"] {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "all" && value !== "selected") {
    throw new Error("Field 'draft.skillSelectionMode' must be 'all' or 'selected'.");
  }
  return value;
}

function parseOptionalImportSkillSelections(value: JsonValue | undefined): ImportDraft["selectedSkills"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("Field 'draft.selectedSkills' must be an array.");
  }

  return value.map((entry, index) => {
    if (!isJsonObject(entry)) {
      throw new Error(`Field 'draft.selectedSkills[${index}]' must be a JSON object.`);
    }
    const selector = entry.selector;
    if (!isJsonObject(selector)) {
      throw new Error(`Field 'draft.selectedSkills[${index}].selector' must be a JSON object.`);
    }
    const kind = expectString(selector.kind, `draft.selectedSkills[${index}].selector.kind`, "import-source");
    if (kind !== "repoPath") {
      throw new Error(`Field 'draft.selectedSkills[${index}].selector.kind' must be 'repoPath'.`);
    }
    return {
      uiId: expectString(entry.uiId, `draft.selectedSkills[${index}].uiId`, "import-source"),
      selector: {
        kind,
        path: expectString(selector.path, `draft.selectedSkills[${index}].selector.path`, "import-source"),
      },
    };
  });
}

function expectCustomTargets(value: JsonValue | undefined) {
  if (!Array.isArray(value)) {
    throw new Error("Field 'customTargets' must be an array.");
  }

  return value.map((entry, index) => {
    if (!isJsonObject(entry)) {
      throw new Error(`Field 'customTargets[${index}]' must be an object.`);
    }

    return {
      id: expectString(entry.id, `customTargets[${index}].id`, "save-settings"),
      name: expectString(entry.name, `customTargets[${index}].name`, "save-settings"),
      globalPath: expectString(entry.globalPath, `customTargets[${index}].globalPath`, "save-settings"),
      projectPathTemplate: expectString(entry.projectPathTemplate, `customTargets[${index}].projectPathTemplate`, "save-settings"),
      strategy: expectString(entry.strategy, `customTargets[${index}].strategy`, "save-settings") as "symlink" | "copy",
      createdAt: expectString(entry.createdAt, `customTargets[${index}].createdAt`, "save-settings"),
      updatedAt: expectString(entry.updatedAt, `customTargets[${index}].updatedAt`, "save-settings"),
    };
  });
}

function expectProjectScope(value: JsonValue | undefined): ProjectScope {
  if (value === undefined) {
    return { kind: "global" };
  }

  if (!isJsonObject(value) || typeof value.kind !== "string") {
    throw new Error(
      "Field 'scope' must be a JSON object with kind 'global' or kind 'project' and a non-empty string 'projectId'.",
    );
  }

  if (value.kind === "global") {
    return { kind: "global" };
  }

  if (value.kind === "project") {
    if (typeof value.projectId === "string" && value.projectId.length > 0) {
      return { kind: "project", projectId: value.projectId };
    }

    throw new Error("Field 'scope.projectId' must be a non-empty string when scope.kind is 'project'.");
  }

  throw new Error("Field 'scope.kind' must be either 'global' or 'project'.");
}

function expectOptionalUsageRefreshTrigger(value: JsonValue | undefined): UsageRefreshTrigger | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "bootstrap" && value !== "scheduled" && value !== "manual") {
    throw new Error("Field 'trigger' must be 'bootstrap', 'scheduled', or 'manual'.");
  }
  return value;
}

function parseUsageSnapshotFilters(payload: JsonObject | undefined): UsageSnapshotFilters {
  if (!payload) {
    return {};
  }
  const range = payload.range === undefined ? undefined : parseUsageRange(payload.range);
  const filters = payload.filters === undefined ? undefined : parseUsageFilters(payload.filters);
  const limits = payload.limits === undefined ? undefined : parseUsageLimits(payload.limits);
  return {
    ...(range ? { range } : {}),
    ...(filters ? { filters } : {}),
    ...(limits ? { limits } : {}),
  };
}

function parseUsageRange(value: JsonValue | undefined): NonNullable<UsageSnapshotFilters["range"]> {
  if (!isJsonObject(value)) {
    throw new Error("Field 'range' must be an object when provided.");
  }
  const preset = value.preset;
  if (
    preset !== undefined &&
    preset !== "today" &&
    preset !== "24h" &&
    preset !== "7d" &&
    preset !== "30d" &&
    preset !== "90d" &&
    preset !== "available" &&
    preset !== "custom"
  ) {
    throw new Error("Field 'range.preset' must be 'today', '24h', '7d', '30d', '90d', 'available', or 'custom'.");
  }
  const from = expectOptionalString(value.from, "range.from", "usage-snapshot");
  const to = expectOptionalString(value.to, "range.to", "usage-snapshot");
  if ((preset === "custom" || from !== undefined || to !== undefined) && (!from || !to)) {
    throw new Error("Fields 'range.from' and 'range.to' must be provided together for a custom usage range.");
  }
  return {
    ...(preset ? { preset } : {}),
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
  };
}

function parseUsageFilters(value: JsonValue | undefined): NonNullable<UsageSnapshotFilters["filters"]> {
  if (!isJsonObject(value)) {
    throw new Error("Field 'filters' must be an object when provided.");
  }
  const agents = parseOptionalUsageAgents(value.agents);
  const skillRefs = parseOptionalStringArray(value.skillRefs, "filters.skillRefs");
  const projectRefs = parseOptionalStringArray(value.projectRefs, "filters.projectRefs");
  const confidence = parseOptionalUsageConfidence(value.confidence);
  const includeInferred = expectOptionalBoolean(value.includeInferred, "filters.includeInferred", "usage-snapshot");
  return {
    ...(agents ? { agents } : {}),
    ...(skillRefs ? { skillRefs } : {}),
    ...(projectRefs ? { projectRefs } : {}),
    ...(confidence ? { confidence } : {}),
    ...(includeInferred !== undefined ? { includeInferred } : {}),
  };
}

function parseOptionalUsageAgents(value: JsonValue | undefined): UsageAgent[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const agents = parseOptionalStringArray(value, "filters.agents");
  const allowed = new Set<UsageAgent>(USAGE_AGENTS);
  if (!agents?.every((agent): agent is UsageAgent => allowed.has(agent as UsageAgent))) {
    throw new Error("Field 'filters.agents' contains an unsupported usage agent.");
  }
  return agents;
}

function parseOptionalUsageConfidence(value: JsonValue | undefined): UsageConfidence[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const confidence = parseOptionalStringArray(value, "filters.confidence");
  if (!confidence?.every((item): item is UsageConfidence => item === "observed" || item === "inferred")) {
    throw new Error("Field 'filters.confidence' must contain only 'observed' or 'inferred'.");
  }
  return confidence;
}

function parseUsageLimits(value: JsonValue | undefined): NonNullable<UsageSnapshotFilters["limits"]> {
  if (!isJsonObject(value)) {
    throw new Error("Field 'limits' must be an object when provided.");
  }
  const topSkills = expectOptionalSafeInteger(value.topSkills, "limits.topSkills");
  const topAgents = expectOptionalSafeInteger(value.topAgents, "limits.topAgents");
  const chartSkills = expectOptionalSafeInteger(value.chartSkills, "limits.chartSkills");
  const projects = expectOptionalSafeInteger(value.projects, "limits.projects");
  const matrixEntries = expectOptionalSafeInteger(value.matrixEntries, "limits.matrixEntries");
  const recentObservations = expectOptionalSafeInteger(value.recentObservations, "limits.recentObservations");
  return {
    ...(topSkills !== undefined ? { topSkills } : {}),
    ...(topAgents !== undefined ? { topAgents } : {}),
    ...(chartSkills !== undefined ? { chartSkills } : {}),
    ...(projects !== undefined ? { projects } : {}),
    ...(matrixEntries !== undefined ? { matrixEntries } : {}),
    ...(recentObservations !== undefined ? { recentObservations } : {}),
  };
}

function expectOptionalSafeInteger(value: JsonValue | undefined, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Field '${field}' must be a non-negative safe integer when provided.`);
  }
  return value;
}

function sanitizeForJson<T>(value: T): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

export function buildBridgeParseFailure(command: string, failure: BridgeFailure): BridgeResponse {
  return buildBridgeResponse({
    command: command as BridgeRequest["command"],
    ok: false,
    errors: [failure],
  });
}

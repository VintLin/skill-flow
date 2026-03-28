import {
  buildBridgeResponse,
  type BridgeRequest,
  type BridgeResponse,
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from "@skill-flow/shared-types/protocol";
import type { DraftBinding, ImportDraft } from "@skill-flow/domain/types";
import type { SkillFlowApp } from "@skill-flow/query/runtime";

type BridgeFailure = {
  code: string;
  message: string;
};

export async function executeBridgeRequest(
  app: SkillFlowApp,
  request: BridgeRequest,
): Promise<BridgeResponse> {
  try {
    switch (request.command) {
      case "bootstrap": {
        const result = await app.bootstrapWorkspaceState();
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "list": {
        const result = await app.listWorkflows();
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "inspect": {
        const payload = expectObjectPayload(request.payload, "inspect");
        const sourceId = expectString(payload.sourceId, "sourceId", "inspect");
        const result = await app.inspectSource(sourceId);
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "inspect-enrichment": {
        const payload = expectObjectPayload(request.payload, "inspect-enrichment");
        const sourceId = expectString(payload.sourceId, "sourceId", "inspect-enrichment");
        const result = await app.inspectSourceEnrichment(sourceId);
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "search-import-groups": {
        const payload = expectOptionalObject(request.payload, "search-import-groups");
        const query = payload ? expectOptionalString(payload.query, "query", "search-import-groups") : undefined;
        const result = await app.searchImportGroups(query ?? "");
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "preview-import-source": {
        const payload = expectObjectPayload(request.payload, "preview-import-source");
        const locator = expectString(payload.locator, "locator", "preview-import-source");
        const result = await app.previewImportSource(locator);
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "import-source": {
        const payload = expectObjectPayload(request.payload, "import-source");
        const locator = expectString(payload.locator, "locator", "import-source");
        const draft = expectOptionalImportDraft(payload.draft);
        const result = await app.importSource(locator, draft);
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "toggle-pin": {
        const payload = expectObjectPayload(request.payload, "toggle-pin");
        const sourceId = expectString(payload.sourceId, "sourceId", "toggle-pin");
        const result = await app.togglePinnedSource(sourceId);
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "doctor": {
        const result = await app.doctor();
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "add": {
        const payload = expectObjectPayload(request.payload, "add");
        const locator = expectString(payload.locator, "locator", "add");
        const options = expectOptionalObject(payload.options, "add.options");
        const applyNow = payload.applyNow === true;
        const result = applyNow
          ? await app.addSource(locator, options as Parameters<SkillFlowApp["addSource"]>[1])
          : await app.prepareAddSource(locator, options as Parameters<SkillFlowApp["prepareAddSource"]>[1]);
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "apply": {
        const payload = expectObjectPayload(request.payload, "apply");
        const sourceId = expectString(payload.sourceId, "sourceId", "apply");
        const draft = expectDraftBinding(payload.draft);
        const result = await app.applyDraft(sourceId, draft);
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "update": {
        const payload = expectOptionalObject(request.payload, "update");
        const sourceIds = parseOptionalStringArray(payload?.sourceIds, "update.sourceIds");
        const result = await app.updateSources(sourceIds);
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
          warnings: result.warnings.map((warning) => ({
            code: warning.code,
            message: warning.message,
          })),
        });
      }
      case "uninstall": {
        const payload = expectObjectPayload(request.payload, "uninstall");
        const sourceIds = parseRequiredStringArray(payload.sourceIds, "uninstall.sourceIds");
        const result = await app.uninstall(sourceIds);
        if (!result.ok) {
          return toFailureResponse(request, result.errors, result.warnings);
        }
        return buildResponseWithRequest({
          request,
          ok: true,
          data: sanitizeForJson(result.data),
        });
      }
      default:
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

  const selectedSkillIds = parseOptionalStringArray(value.selectedSkillIds, "draft.selectedSkillIds");
  if (!selectedSkillIds) {
    throw new Error("Field 'draft.selectedSkillIds' must be a string array.");
  }

  const enabledTargets = parseOptionalStringArray(value.enabledTargets, "draft.enabledTargets") ?? [];

  return {
    selectedSkillIds,
    enabledTargets: enabledTargets as ImportDraft["enabledTargets"],
  };
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

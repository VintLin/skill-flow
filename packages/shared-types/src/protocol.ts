export const PROTOCOL_VERSION = "1.0" as const;

export const BRIDGE_COMMAND_NAMES = [
  "bootstrap",
  "list",
  "inspect-state-migration",
  "migrate-state",
  "inspect",
  "inspect-enrichment",
  "search-import-groups",
  "scan-local-import-groups",
  "prepare-import-source",
  "preview-import-source",
  "commit-import-source",
  "import-source",
  "toggle-pin",
  "rename-source",
  "create-collection",
  "merge-groups",
  "restore-collection-sources",
  "doctor",
  "adopt-external-source",
  "configure-external-source",
  "external-status",
  "external-update",
  "refresh-usage",
  "usage-snapshot",
  "add",
  "apply",
  "update",
  "uninstall",
  "save-settings",
] as const;

const BRIDGE_COMMAND_NAME_SET = new Set<string>(BRIDGE_COMMAND_NAMES);

export type BridgeCommandName = typeof BRIDGE_COMMAND_NAMES[number];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type BridgeRequest = {
  protocolVersion: string;
  requestId?: string;
  command: BridgeCommandName;
  payload?: JsonValue;
};

export type BridgeError = {
  code: string;
  message: string;
};

export type BridgeResponse = {
  protocolVersion: string;
  requestId?: string;
  command: BridgeCommandName;
  ok: boolean;
  data?: JsonValue;
  warnings: BridgeError[];
  errors: BridgeError[];
};

export function parseBridgeRequest(input: unknown): BridgeRequest {
  if (!isJsonObject(input)) {
    throw new Error("Bridge request must be a JSON object.");
  }
  const protocolVersion = input.protocolVersion;
  const command = input.command;
  const requestId = input.requestId;

  if (typeof protocolVersion !== "string" || protocolVersion.length === 0) {
    throw new Error("Bridge request requires a non-empty 'protocolVersion'.");
  }
  if (protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `Protocol version mismatch. Expected '${PROTOCOL_VERSION}', received '${protocolVersion}'.`,
    );
  }

  if (!isBridgeCommandName(command)) {
    throw new Error(
      `Bridge request 'command' must be one of: ${BRIDGE_COMMAND_NAMES.join(", ")}.`,
    );
  }

  if (requestId !== undefined && typeof requestId !== "string") {
    throw new Error("Bridge request 'requestId' must be a string when provided.");
  }

  if ("payload" in input && !isJsonValue(input.payload)) {
    throw new Error("Bridge request 'payload' must be valid JSON.");
  }

  return {
    protocolVersion,
    command,
    ...(requestId ? { requestId } : {}),
    ...("payload" in input ? { payload: input.payload } : {}),
  };
}

export function buildBridgeResponse(args: {
  command: BridgeCommandName;
  requestId?: string;
  ok: boolean;
  data?: JsonValue;
  warnings?: BridgeError[];
  errors?: BridgeError[];
}): BridgeResponse {
  return {
    protocolVersion: PROTOCOL_VERSION,
    command: args.command,
    ...(args.requestId ? { requestId: args.requestId } : {}),
    ok: args.ok,
    ...(args.data !== undefined ? { data: args.data } : {}),
    warnings: args.warnings ?? [],
    errors: args.errors ?? [],
  };
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }
  if (isJsonObject(value)) {
    return Object.values(value).every((item) => isJsonValue(item));
  }
  return false;
}

export function isBridgeCommandName(value: unknown): value is BridgeCommandName {
  return typeof value === "string" && BRIDGE_COMMAND_NAME_SET.has(value);
}

export type BridgeOperationKind = "query" | "mutation";
export type BridgeTimeoutClass = "standard" | "long" | "update";

export type BridgeCommandMetadata = {
  kind: BridgeOperationKind;
  timeoutClass: BridgeTimeoutClass;
  cancellable: boolean;
};

const QUERY_COMMANDS = new Set<BridgeCommandName>([
  "list", "inspect-state-migration", "inspect", "inspect-enrichment",
  "search-import-groups", "scan-local-import-groups", "preview-import-source",
  "external-status", "doctor", "usage-snapshot",
]);
const LONG_COMMANDS = new Set<BridgeCommandName>([
  "search-import-groups", "scan-local-import-groups", "prepare-import-source",
  "preview-import-source", "commit-import-source", "import-source", "update",
  "external-update", "refresh-usage", "migrate-state",
]);
const UPDATE_COMMANDS = new Set<BridgeCommandName>(["update", "external-update"]);

export const BRIDGE_COMMAND_METADATA: Readonly<Record<BridgeCommandName, BridgeCommandMetadata>> =
  Object.fromEntries(BRIDGE_COMMAND_NAMES.map((command) => [
    command,
    {
      kind: QUERY_COMMANDS.has(command) ? "query" : "mutation",
      timeoutClass: UPDATE_COMMANDS.has(command)
        ? "update"
        : LONG_COMMANDS.has(command)
          ? "long"
          : "standard",
      cancellable: !QUERY_COMMANDS.has(command),
    },
  ])) as Record<BridgeCommandName, BridgeCommandMetadata>;

export function getBridgeCommandMetadata(command: BridgeCommandName): BridgeCommandMetadata {
  return BRIDGE_COMMAND_METADATA[command];
}

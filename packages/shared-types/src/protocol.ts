export const PROTOCOL_VERSION = "1.0" as const;

export type BridgeCommandName =
  | "bootstrap"
  | "list"
  | "inspect"
  | "doctor"
  | "add"
  | "apply"
  | "update"
  | "uninstall";

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
      "Bridge request 'command' must be one of: bootstrap, list, inspect, doctor, add, apply, update, uninstall.",
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
  return (
    value === "bootstrap" ||
    value === "list" ||
    value === "inspect" ||
    value === "doctor" ||
    value === "add" ||
    value === "apply" ||
    value === "update" ||
    value === "uninstall"
  );
}

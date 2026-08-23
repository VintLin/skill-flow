import crypto from "node:crypto";
import type {
  UsageAgent,
  UsageCollectorObservation,
} from "@skill-flow/domain/types";

export function collectPotentialToolCallBlocks(value: unknown): unknown[] {
  const blocks: unknown[] = [];
  if (typeof value !== "object" || value === null) {
    return blocks;
  }
  blocks.push(value);
  const content = objectField(value, "content");
  if (Array.isArray(content)) {
    blocks.push(...content);
  }
  const message = objectField(value, "message");
  if (typeof message === "object" && message !== null) {
    const messageContent = objectField(message, "content");
    if (Array.isArray(messageContent)) {
      blocks.push(...messageContent);
    }
  }
  const toolCalls = objectField(value, "tool_calls");
  if (Array.isArray(toolCalls)) {
    blocks.push(...toolCalls);
  }
  return blocks;
}

export function collectTextValues(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === "string") {
      return [item];
    }
    if (typeof item === "object" && item !== null) {
      const text = objectField(item, "text");
      return typeof text === "string" ? [text] : [];
    }
    return [];
  });
}

export function collectCodexUserMessageTextValues(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }
  const texts: string[] = [];
  const message = objectField(payload, "message");
  if (typeof message === "string") {
    texts.push(message);
  }
  texts.push(...collectTextValues(objectField(payload, "text_elements")));
  texts.push(...collectTextValues(objectField(payload, "content")));

  const seen = new Set<string>();
  return texts.filter((text) => {
    if (seen.has(text)) {
      return false;
    }
    seen.add(text);
    return true;
  });
}

export function extractExplicitSkillCommands(args: {
  agent: UsageAgent;
  parserRevision: string;
  sourceKind: "local-session";
  filePath: string;
  lineIndex: number;
  observedAt: string;
  rawProjectPath?: string | undefined;
  texts: string[];
  seenDedupeKeys?: Set<string>;
  position?: "anywhere" | "leading";
}): UsageCollectorObservation[] {
  const observations: UsageCollectorObservation[] = [];
  const commandPattern = args.position === "leading"
    ? /^\s*([$/])([a-zA-Z0-9][a-zA-Z0-9._:-]{1,120})(?=$|[\s\])}>.,;:!?])/
    : /(^|[\s([{])([$/])([a-zA-Z0-9][a-zA-Z0-9._:-]{1,120})(?=$|[\s\])}>.,;:!?])/g;
  for (let textIndex = 0; textIndex < args.texts.length; textIndex += 1) {
    const text = args.texts[textIndex] ?? "";
    let match: RegExpExecArray | null;
    while ((match = commandPattern.exec(text))) {
      const rawSkillName = (args.position === "leading" ? match[2] : match[3])?.replace(/[.,;!?]+$/, "");
      if (!rawSkillName) {
        continue;
      }
      const dedupeKey = `${args.agent}:${args.observedAt}:${args.rawProjectPath ?? ""}:${rawSkillName}:${match.index}:${sha256(text)}`;
      if (args.seenDedupeKeys?.has(dedupeKey)) {
        continue;
      }
      args.seenDedupeKeys?.add(dedupeKey);
      observations.push({
        sourceEventId: sha256(`${args.filePath}:${args.lineIndex}:${textIndex}:${match.index}:${args.observedAt}:${rawSkillName}`),
        observedAt: args.observedAt,
        agent: args.agent,
        rawSkillName,
        evidenceKind: "explicit_command",
        confidence: "observed",
        outcome: "unknown",
        sourceKind: args.sourceKind,
        parserRevision: args.parserRevision,
        projectRef: null,
        projectLabel: "Unknown project",
        requiresKnownSkillMatch: true,
        ...(args.rawProjectPath ? { rawProjectPath: args.rawProjectPath } : {}),
      });
      if (args.position === "leading") {
        break;
      }
    }
  }
  return observations;
}

export function extractRawSkillFromToolCall(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const toolName = firstString([
    objectField(value, "name"),
    objectField(value, "tool"),
    objectField(value, "toolName"),
    objectField(value, "function_name"),
  ]);
  if (!toolName || !isSkillToolName(toolName)) {
    return null;
  }

  const state = objectField(value, "state");
  const input = firstObject([
    objectField(value, "input"),
    objectField(value, "arguments"),
    objectField(value, "args"),
    objectField(value, "parameters"),
    objectField(state, "input"),
    objectField(state, "metadata"),
    state,
  ]);
  const parsedInput = typeof input === "string" ? parseJsonObject(input) : input;
  if (!parsedInput) {
    return null;
  }
  return firstString([
    objectField(parsedInput, "skill"),
    objectField(parsedInput, "skillName"),
    objectField(parsedInput, "skill_name"),
    objectField(parsedInput, "name"),
  ]) ?? null;
}

export function isSkillToolName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "skill" || normalized === "activate_skill" || normalized.endsWith(".activate_skill");
}

export function firstString(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

export function firstObject(values: unknown[]): Record<string, unknown> | string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

export function objectField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;
}

export function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function findStringField(value: unknown, fieldName: string): string | undefined {
  const field = findField(value, fieldName);
  return typeof field === "string" && field.trim().length > 0 ? field : undefined;
}

export function findField(value: unknown, fieldName: string, depth = 0): unknown {
  if (depth > 8 || typeof value !== "object" || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, fieldName)) {
    return (value as Record<string, unknown>)[fieldName];
  }
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const child of children) {
    const matched = findField(child, fieldName, depth + 1);
    if (matched !== undefined) {
      return matched;
    }
  }
  return undefined;
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

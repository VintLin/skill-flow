import type { UsageCollectorObservation } from "@skill-flow/domain/types";
import {
  collectCodexUserMessageTextValues,
  collectPotentialToolCallBlocks,
  collectTextValues,
  extractExplicitSkillCommands,
  extractRawSkillFromToolCall,
  firstString,
  objectField,
  sha256,
} from "./skill-signal-parser.js";

export type ProjectSessionState = {
  currentProjectPath: string | undefined;
};

export type CodexSessionState = ProjectSessionState & {
  seenExplicitCommandKeys: Set<string>;
};

export function createProjectSessionState(): ProjectSessionState {
  return { currentProjectPath: undefined };
}

export function createCodexSessionState(): CodexSessionState {
  return {
    currentProjectPath: undefined,
    seenExplicitCommandKeys: new Set<string>(),
  };
}

export function extractClaudeSkillUses(
  value: unknown,
  filePath: string,
  lineIndex: number,
): UsageCollectorObservation[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }
  const record = value as {
    timestamp?: unknown;
    cwd?: unknown;
    projectPath?: unknown;
    message?: {
      role?: unknown;
      content?: unknown;
    };
  };
  const blocks = Array.isArray(record.message?.content) ? record.message.content : [];
  const observedAt = typeof record.timestamp === "string" ? record.timestamp : new Date().toISOString();
  const rawProjectPath = typeof record.cwd === "string"
    ? record.cwd
    : typeof record.projectPath === "string"
      ? record.projectPath
      : undefined;

  const observations: UsageCollectorObservation[] = [];
  if (record.message?.role === "user") {
    observations.push(...extractExplicitSkillCommands({
      agent: "claude-code",
      parserRevision: "claude-code-session@1",
      sourceKind: "local-session",
      filePath,
      lineIndex,
      observedAt,
      rawProjectPath,
      texts: collectTextValues(record.message.content),
    }));
  }

  observations.push(...blocks.flatMap((block, blockIndex) => {
    if (typeof block !== "object" || block === null) {
      return [];
    }
    const candidate = block as {
      type?: unknown;
      name?: unknown;
      input?: {
        skill?: unknown;
      };
    };
    if (candidate.type !== "tool_use" || candidate.name !== "Skill") {
      return [];
    }
    const rawSkillName = typeof candidate.input?.skill === "string" && candidate.input.skill.length > 0
      ? candidate.input.skill
      : null;
    if (!rawSkillName) {
      return [];
    }
    const sourceEventId = sha256(`${filePath}:${lineIndex}:${blockIndex}:${observedAt}:${rawSkillName}`);
    return [{
      sourceEventId,
      observedAt,
      agent: "claude-code" as const,
      rawSkillName,
      evidenceKind: "tool_call" as const,
      confidence: "observed" as const,
      outcome: "unknown" as const,
      sourceKind: "local-session" as const,
      parserRevision: "claude-code-session@1",
      projectRef: null,
      projectLabel: "Unknown project",
      ...(rawProjectPath ? { rawProjectPath } : {}),
    }];
  }));
  return observations;
}

export function extractCodexSkillUses(
  value: unknown,
  filePath: string,
  lineIndex: number,
  state: CodexSessionState,
  fallbackTimestamp: string,
): { observations: UsageCollectorObservation[]; state: CodexSessionState } {
  if (typeof value !== "object" || value === null) {
    return { observations: [], state };
  }
  const record = value as {
    timestamp?: unknown;
    type?: unknown;
    payload?: unknown;
  };
  const payload = typeof record.payload === "object" && record.payload !== null ? record.payload : value;
  const sessionProjectPath = extractCodexProjectPath(record, payload);
  const nextProjectPath = sessionProjectPath ?? state.currentProjectPath;
  const nextState: CodexSessionState = {
    currentProjectPath: nextProjectPath,
    seenExplicitCommandKeys: state.seenExplicitCommandKeys,
  };
  const observedAt = firstString([
    record.timestamp,
    objectField(payload, "timestamp"),
    objectField(payload, "created_at"),
    objectField(payload, "createdAt"),
  ]) ?? fallbackTimestamp;
  const blocks = collectPotentialToolCallBlocks(payload);
  const observations: UsageCollectorObservation[] = [];
  const role = objectField(payload, "role");
  const payloadType = objectField(payload, "type");
  if (role === "user") {
    observations.push(...extractExplicitSkillCommands({
      agent: "codex",
      parserRevision: "codex-session@1",
      sourceKind: "local-session",
      filePath,
      lineIndex,
      observedAt,
      rawProjectPath: nextProjectPath,
      texts: collectTextValues(objectField(payload, "content")),
      seenDedupeKeys: nextState.seenExplicitCommandKeys,
    }));
  } else if (payloadType === "user_message") {
    observations.push(...extractExplicitSkillCommands({
      agent: "codex",
      parserRevision: "codex-session@1",
      sourceKind: "local-session",
      filePath,
      lineIndex,
      observedAt,
      rawProjectPath: nextProjectPath,
      texts: collectCodexUserMessageTextValues(payload),
      seenDedupeKeys: nextState.seenExplicitCommandKeys,
    }));
  }

  return {
    state: nextState,
    observations: [
      ...observations,
      ...blocks.flatMap((block, blockIndex) => {
        const rawSkillName = extractRawSkillFromToolCall(block);
        if (!rawSkillName) {
          return [];
        }
        const sourceEventId = sha256(`${filePath}:${lineIndex}:${blockIndex}:${observedAt}:${rawSkillName}`);
        return [{
          sourceEventId,
          observedAt,
          agent: "codex" as const,
          rawSkillName,
          evidenceKind: "tool_call" as const,
          confidence: "observed" as const,
          outcome: "unknown" as const,
          sourceKind: "local-session" as const,
          parserRevision: "codex-session@1",
          projectRef: null,
          projectLabel: "Unknown project",
          ...(nextProjectPath ? { rawProjectPath: nextProjectPath } : {}),
        }];
      }),
    ],
  };
}

export function extractPiSkillUses(
  value: unknown,
  filePath: string,
  lineIndex: number,
  state: ProjectSessionState,
  fallbackTimestamp: string,
): { observations: UsageCollectorObservation[]; state: ProjectSessionState } {
  if (typeof value !== "object" || value === null) {
    return { observations: [], state };
  }
  const nextProjectPath = firstString([
    objectField(value, "cwd"),
    objectField(value, "projectPath"),
    objectField(value, "workspaceRoot"),
  ]) ?? state.currentProjectPath;
  const nextState = { currentProjectPath: nextProjectPath };
  const observedAt = firstString([
    objectField(value, "timestamp"),
    objectField(objectField(value, "message"), "timestamp"),
  ]) ?? fallbackTimestamp;
  const blocks = collectPotentialToolCallBlocks(value);
  const observations: UsageCollectorObservation[] = [];
  const message = objectField(value, "message");
  if (typeof message === "object" && message !== null && objectField(message, "role") === "user") {
    observations.push(...extractExplicitSkillCommands({
      agent: "pi",
      parserRevision: "pi-session@1",
      sourceKind: "local-session",
      filePath,
      lineIndex,
      observedAt,
      rawProjectPath: nextProjectPath,
      texts: collectTextValues(objectField(message, "content")),
    }));
  }

  return {
    state: nextState,
    observations: [
      ...observations,
      ...blocks.flatMap((block, blockIndex) => {
        const rawSkillName = extractRawSkillFromToolCall(block);
        if (!rawSkillName) {
          return [];
        }
        return [{
          sourceEventId: sha256(`${filePath}:${lineIndex}:${blockIndex}:${observedAt}:${rawSkillName}`),
          observedAt,
          agent: "pi" as const,
          rawSkillName,
          evidenceKind: "tool_call" as const,
          confidence: "observed" as const,
          outcome: "unknown" as const,
          sourceKind: "local-session" as const,
          parserRevision: "pi-session@1",
          projectRef: null,
          projectLabel: "Unknown project",
          ...(nextProjectPath ? { rawProjectPath: nextProjectPath } : {}),
        }];
      }),
    ],
  };
}

export function extractKimiCodeSkillUses(
  value: unknown,
  filePath: string,
  lineIndex: number,
  state: ProjectSessionState,
  fallbackTimestamp: string,
): { observations: UsageCollectorObservation[]; state: ProjectSessionState } {
  if (typeof value !== "object" || value === null) {
    return { observations: [], state };
  }
  const nextProjectPath = firstString([
    objectField(value, "cwd"),
    objectField(value, "projectPath"),
    objectField(value, "workspaceRoot"),
    objectField(value, "workingDirectory"),
  ]) ?? state.currentProjectPath;
  const nextState = { currentProjectPath: nextProjectPath };
  const observedAt = firstString([
    objectField(value, "timestamp"),
    objectField(value, "createdAt"),
    objectField(objectField(value, "message"), "timestamp"),
  ]) ?? fallbackTimestamp;
  const blocks = collectPotentialToolCallBlocks(value);
  const observations: UsageCollectorObservation[] = [];
  const message = objectField(value, "message");
  if (typeof message === "object" && message !== null && objectField(message, "role") === "user") {
    observations.push(...extractExplicitSkillCommands({
      agent: "kimi-code",
      parserRevision: "kimi-code-session@1",
      sourceKind: "local-session",
      filePath,
      lineIndex,
      observedAt,
      rawProjectPath: nextProjectPath,
      texts: collectTextValues(objectField(message, "content")),
    }));
  }

  return {
    state: nextState,
    observations: [
      ...observations,
      ...blocks.flatMap((block, blockIndex) => {
        const rawSkillName = extractRawSkillFromToolCall(block);
        if (!rawSkillName) {
          return [];
        }
        return [{
          sourceEventId: sha256(`${filePath}:${lineIndex}:${blockIndex}:${observedAt}:${rawSkillName}`),
          observedAt,
          agent: "kimi-code" as const,
          rawSkillName,
          evidenceKind: "tool_call" as const,
          confidence: "observed" as const,
          outcome: "unknown" as const,
          sourceKind: "local-session" as const,
          parserRevision: "kimi-code-session@1",
          projectRef: null,
          projectLabel: "Unknown project",
          ...(nextProjectPath ? { rawProjectPath: nextProjectPath } : {}),
        }];
      }),
    ],
  };
}

function extractCodexProjectPath(record: { type?: unknown }, payload: unknown): string | undefined {
  if (record.type !== "session_meta" || typeof payload !== "object" || payload === null) {
    return undefined;
  }
  return firstString([
    objectField(payload, "cwd"),
    objectField(payload, "projectPath"),
    objectField(payload, "workspaceRoot"),
  ]);
}

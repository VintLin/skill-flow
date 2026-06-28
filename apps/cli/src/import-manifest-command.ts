export type ImportManifestSourceEntry = {
  source: string;
  skills?: "all" | "none";
  targets?: string[];
};

export type ImportManifest = {
  sources: ImportManifestSourceEntry[];
};

export function parseImportManifestText(text: string, fileName: string): ImportManifest {
  const textWithoutBom = stripUtf8Bom(text);
  const trimmed = textWithoutBom.trim();
  if (fileName.endsWith(".json") || trimmed.startsWith("{")) {
    return parseJsonManifest(trimmed);
  }

  return {
    sources: textWithoutBom
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((source) => ({ source })),
  };
}

function parseJsonManifest(text: string): ImportManifest {
  const payload = JSON.parse(text) as unknown;
  if (!isRecord(payload) || !Array.isArray(payload.sources)) {
    throw new Error("Import manifest JSON must contain a sources array.");
  }

  return {
    sources: payload.sources.map((entry, index) => normalizeEntry(entry, index)),
  };
}

function normalizeEntry(entry: unknown, index: number): ImportManifestSourceEntry {
  if (!isRecord(entry) || typeof entry.source !== "string" || entry.source.trim().length === 0) {
    throw new Error(`Import manifest source at index ${index} requires a non-empty source.`);
  }

  const result: ImportManifestSourceEntry = { source: entry.source.trim() };
  if (entry.skills !== undefined) {
    if (entry.skills !== "all" && entry.skills !== "none") {
      throw new Error(`Import manifest source ${result.source} has invalid skills value.`);
    }
    result.skills = entry.skills;
  }

  if (entry.targets !== undefined) {
    if (!Array.isArray(entry.targets) || !entry.targets.every((target) => typeof target === "string")) {
      throw new Error(`Import manifest source ${result.source} targets must be strings.`);
    }
    const targets = entry.targets.map((target) => target.trim());
    if (targets.some((target) => target.length === 0)) {
      throw new Error(`Import manifest source ${result.source} targets must not be empty.`);
    }
    result.targets = targets;
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

import type { SkillCandidate } from "@skill-flow/domain/types";

export function buildFindCommand(candidate: SkillCandidate): string | null {
  if (candidate.action.type === "none") {
    return null;
  }

  if (candidate.action.type === "add-clawhub") {
    const suffix = candidate.action.version ? `@${candidate.action.version}` : "";
    return `skill-flow add clawhub:${candidate.action.slug}${suffix}`;
  }

  const parts = ["skill-flow", "add", shellQuote(candidate.action.locator)];
  const requestedPath = normalizeRequestedPath(candidate.action.requestedPath);
  if (requestedPath) {
    parts.push("--path", shellQuote(requestedPath));
  }
  return parts.join(" ");
}

function normalizeRequestedPath(requestedPath?: string): string | undefined {
  if (!requestedPath) {
    return undefined;
  }

  const normalized = requestedPath.trim().replace(/^\.\/+/, "").replace(/\/+$/, "");
  return normalized.length > 0 && normalized !== "." ? normalized : undefined;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

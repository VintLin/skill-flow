import type { SkillCandidate } from "../domain/types.js";

export function buildFindCommand(candidate: SkillCandidate): string | null {
  if (candidate.action.type === "none") {
    return null;
  }

  if (candidate.action.type === "add-clawhub") {
    const suffix = candidate.action.version ? `@${candidate.action.version}` : "";
    return `skill-flow add clawhub:${candidate.action.slug}${suffix}`;
  }

  const parts = ["skill-flow", "add", shellQuote(candidate.action.locator)];
  if (candidate.action.requestedPath) {
    parts.push("--path", shellQuote(candidate.action.requestedPath));
  }
  return parts.join(" ");
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@-]+$/.test(value)) {
    return value;
  }

  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

import path from "node:path";
import { slugify } from "./fs.js";
import { parseGitHubRepo } from "./naming.js";

export function deriveDisplayName(locator: string): string {
  const githubRepo = parseGitHubRepo(locator);
  if (githubRepo) {
    return githubRepo.repo;
  }

  const trimmed = locator.replace(/\/+$/, "");
  if (/^[^/\s]+\/[^/\s]+$/.test(trimmed)) {
    return trimmed.split("/")[1] ?? trimmed;
  }

  if (trimmed.endsWith(".git")) {
    return path.basename(trimmed, ".git");
  }

  return path.basename(trimmed) || slugify(locator);
}

export function deriveSourceId(locator: string): string {
  const githubRepo = parseGitHubRepo(locator);
  if (githubRepo) {
    return slugify(`${githubRepo.owner}-${githubRepo.repo}`);
  }

  return slugify(deriveDisplayName(locator) || locator);
}

import path from "node:path";
import { slugify } from "./fs.js";
import { parseGitHubRepo } from "./naming.js";

function parseClawHubLocator(locator: string): { slug: string; version?: string } | null {
  const match = locator.trim().match(/^clawhub:([^@\s]+)(?:@(.+))?$/);
  if (!match) {
    return null;
  }

  const slug = match[1];
  const version = match[2];
  if (!slug) {
    return null;
  }

  return version ? { slug, version } : { slug };
}

export function deriveDisplayName(locator: string): string {
  const clawHubLocator = parseClawHubLocator(locator);
  if (clawHubLocator) {
    return clawHubLocator.slug.split("/").pop() ?? clawHubLocator.slug;
  }

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
  const clawHubLocator = parseClawHubLocator(locator);
  if (clawHubLocator) {
    return slugify(`clawhub-${clawHubLocator.slug}`);
  }

  const githubRepo = parseGitHubRepo(locator);
  if (githubRepo) {
    return slugify(`${githubRepo.owner}-${githubRepo.repo}`);
  }

  return slugify(deriveDisplayName(locator) || locator);
}

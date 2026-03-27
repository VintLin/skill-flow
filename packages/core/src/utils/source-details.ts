import type { SourceManifestRecord, SourceStats, WorkflowSummary } from "../domain/types.js";
import { inspectClawHubSkill } from "./clawhub.js";
import { fetchGitHubRepoDetails } from "./github-catalog.js";
import { parseGitHubRepo } from "./naming.js";

export async function fetchSourceDetails(
  source: SourceManifestRecord,
  lock: WorkflowSummary["lock"],
): Promise<SourceStats> {
  if (source.kind === "clawhub") {
    const slug = lock?.packageSlug ?? parseClawHubSlug(source.locator);
    if (!slug) {
      return {};
    }

    const inspected = await inspectClawHubSkill(slug);
    const ownerHandle = inspected.owner?.handle ? `@${inspected.owner.handle}` : undefined;
    return {
      provider: "clawhub",
      sourceUrl: `https://clawhub.ai/search?q=${encodeURIComponent(slug)}`,
      ...(inspected.skill.stats?.stars !== undefined ? { starCount: inspected.skill.stats.stars } : {}),
      ...(inspected.skill.stats?.installsAllTime !== undefined
        ? { totalInstalls: inspected.skill.stats.installsAllTime }
        : {}),
      ...(inspected.skill.stats?.installsCurrent !== undefined
        ? { weeklyInstalls: inspected.skill.stats.installsCurrent }
        : {}),
      ...(inspected.skill.stats?.downloads !== undefined
        ? { downloadCount: inspected.skill.stats.downloads }
        : {}),
      ...(ownerHandle ? { ownerHandle } : {}),
      ...(inspected.owner?.displayName ? { ownerDisplayName: inspected.owner.displayName } : {}),
      ...(inspected.skill.summary ? { summary: inspected.skill.summary } : {}),
    };
  }

  const skillsOriginLocator = resolveSkillsOriginLocator(source);
  if (skillsOriginLocator) {
    const skillsDetails = await fetchSkillsDirectorySourceDetails(skillsOriginLocator);
    return {
      provider: "skills",
      ...skillsDetails,
    };
  }

  const gitHubDetails = await fetchGitHubRepoDetails(source.locator);
  return gitHubDetails;
}

export async function fetchSkillsDirectorySourceDetails(locator: string): Promise<SourceStats> {
  const repo = parseGitHubRepo(locator);
  if (!repo) {
    return {};
  }

  const sourceUrl = `https://skills.sh/${repo.owner}/${repo.repo}`;
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`skills.sh source page request failed with ${response.status}.`);
  }

  const html = await response.text();
  const parsed = parseSkillsSourcePage(html);
  const repoDetails = await fetchGitHubRepoDetails(locator);

  return {
    provider: "skills",
    ...((parsed.repoLabel ?? repoDetails.repoLabel) ? { repoLabel: parsed.repoLabel ?? repoDetails.repoLabel } : {}),
    ...((parsed.repoUrl ?? repoDetails.repoUrl) ? { repoUrl: parsed.repoUrl ?? repoDetails.repoUrl } : {}),
    sourceUrl,
    ...(repoDetails.starCount !== undefined ? { starCount: repoDetails.starCount } : {}),
    ...(parsed.totalInstalls !== undefined ? { totalInstalls: parsed.totalInstalls } : {}),
  };
}

export function parseSkillsSourcePage(html: string): {
  totalInstalls?: number;
  repoUrl?: string;
  repoLabel?: string;
} {
  const totalInstallsMatch = html.match(/>([\d.]+[KMB]?)<!-- --> total installs</i);
  const repoUrlMatch = html.match(/href="(https:\/\/github\.com\/[^"]+)"/i);

  const repoUrl = repoUrlMatch?.[1];
  const repo = repoUrl ? parseGitHubRepo(repoUrl) : null;
  return {
    ...(totalInstallsMatch?.[1] ? { totalInstalls: parseCompactNumber(totalInstallsMatch[1]) } : {}),
    ...(repoUrl ? { repoUrl } : {}),
    ...(repo ? { repoLabel: `${repo.owner}/${repo.repo}` } : {}),
  };
}

function parseCompactNumber(value: string): number {
  const trimmed = value.trim().toUpperCase();
  const suffix = trimmed.slice(-1);
  const base = Number.parseFloat(["K", "M", "B"].includes(suffix) ? trimmed.slice(0, -1) : trimmed);

  if (!Number.isFinite(base)) {
    return 0;
  }

  switch (suffix) {
    case "K":
      return Math.round(base * 1_000);
    case "M":
      return Math.round(base * 1_000_000);
    case "B":
      return Math.round(base * 1_000_000_000);
    default:
      return Math.round(base);
  }
}

function resolveSkillsOriginLocator(source: SourceManifestRecord): string | undefined {
  const originLocator = source.originLocator?.trim();
  if (!originLocator || source.kind !== "local") {
    return undefined;
  }

  return parseGitHubRepo(originLocator) ? originLocator : undefined;
}

function parseClawHubSlug(locator: string): string | undefined {
  const match = locator.match(/^clawhub:([^@\s]+)(?:@.+)?$/);
  return match?.[1];
}

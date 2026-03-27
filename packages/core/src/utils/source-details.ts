import type {
  SourceManifestRecord,
  SourceMetadataProvider,
  SourceMetadataReasonCode,
  SourceMetadataResult,
  SourceStats,
  WorkflowSummary,
} from "../domain/types.js";
import { inspectClawHubSkill } from "./clawhub.js";
import { fetchGitHubRepoDetails } from "./github-catalog.js";
import { parseGitHubRepo } from "./naming.js";

export const SOURCE_METADATA_CACHE_TTL_MS = 15 * 60_000;

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

  const githubLocator = resolveGitHubLocatorForMetadata(source);
  if (!githubLocator) {
    return {};
  }

  const skillsDetails = await fetchSkillsDirectorySourceDetails(githubLocator);
  return {
    provider: "skills",
    ...skillsDetails,
  };
}

export async function fetchFreshSourceMetadata(
  source: SourceManifestRecord,
  lock: WorkflowSummary["lock"],
  providerHint?: SourceMetadataProvider,
): Promise<SourceMetadataResult> {
  if (source.kind === "clawhub") {
    try {
      return buildSourceMetadataResult(await fetchSourceDetails(source, lock), "clawhub");
    } catch (error) {
      return buildFailedSourceMetadataResult("clawhub", error);
    }
  }

  const githubLocator = resolveGitHubLocatorForMetadata(source);
  if (!githubLocator) {
    return {
      status: "unsupported",
      reasonCode: "provider_not_supported",
    };
  }

  if (providerHint === "skills") {
    try {
      return buildSourceMetadataResult(
        await fetchSkillsDirectorySourceDetails(githubLocator),
        "skills",
      );
    } catch (error) {
      return buildFailedSourceMetadataResult("skills", error);
    }
  }

  if (providerHint === "github") {
    try {
      return buildSourceMetadataResult(
        await fetchGitHubRepoDetails(githubLocator),
        "github",
      );
    } catch (error) {
      return buildFailedSourceMetadataResult("github", error);
    }
  }

  try {
    return buildSourceMetadataResult(
      await fetchSkillsDirectorySourceDetails(githubLocator),
      "skills",
    );
  } catch (error) {
    if (!isSkillsSourceNotFoundError(error)) {
      return buildFailedSourceMetadataResult("skills", error);
    }
  }

  try {
    return buildSourceMetadataResult(
      await fetchGitHubRepoDetails(githubLocator),
      "github",
    );
  } catch (error) {
    return buildFailedSourceMetadataResult("github", error);
  }
}

export async function fetchSkillsDirectorySourceDetails(locator: string): Promise<SourceStats> {
  const repo = parseGitHubRepo(locator);
  if (!repo) {
    return {};
  }

  const sourceUrl = `https://skills.sh/${repo.owner}/${repo.repo}`;
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    if (response.status === 404) {
      throw createProviderError(
        "SKILLS_SOURCE_NOT_FOUND",
        `skills.sh source page request failed with ${response.status}.`,
      );
    }
    throw createProviderError(
      "SKILLS_SOURCE_REQUEST_FAILED",
      `skills.sh source page request failed with ${response.status}.`,
    );
  }

  const html = await response.text();
  const parsed = parseSkillsSourcePage(html);
  if (parsed.totalInstalls === undefined) {
    throw createProviderError(
      "SKILLS_SOURCE_PARSE_FAILED",
      "skills.sh source page payload was missing total installs.",
    );
  }
  const repoDetails: SourceStats = await fetchGitHubRepoDetails(locator).catch(() => ({}));
  const repoLabel = parsed.repoLabel ?? `${repo.owner}/${repo.repo}`;
  const repoUrl = parsed.repoUrl ?? `https://github.com/${repo.owner}/${repo.repo}`;

  return {
    provider: "skills",
    repoLabel,
    repoUrl,
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

export function buildSourceMetadataResult(
  sourceStats: SourceStats,
  providerHint?: SourceMetadataProvider,
): SourceMetadataResult {
  const provider = sourceStats.provider ?? providerHint;
  if (!provider) {
    return {
      status: "unsupported",
      reasonCode: "provider_not_supported",
    };
  }

  const normalizedSourceStats = {
    ...sourceStats,
    provider,
  };

  if (!hasSourceStatsData(normalizedSourceStats)) {
    return {
      status: "unsupported",
      provider,
      reasonCode: "provider_data_unavailable",
    };
  }

  return {
    status: "ready",
    provider,
    data: normalizedSourceStats,
  };
}

export function buildFailedSourceMetadataResult(
  provider: SourceMetadataProvider | undefined,
  error: unknown,
): SourceMetadataResult {
  const reasonCode = inferFailedReasonCode(error);
  return {
    status: "failed",
    ...(provider ? { provider } : {}),
    reasonCode,
    retryable: reasonCode !== "provider_response_invalid",
  };
}

export function inferSourceMetadataProvider(
  source: SourceManifestRecord,
): SourceMetadataProvider | undefined {
  if (source.kind === "clawhub") {
    return "clawhub";
  }

  return resolveGitHubLocatorForMetadata(source) ? "github" : undefined;
}

export function isSkillsSourceNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "SKILLS_SOURCE_NOT_FOUND"
  );
}

function resolveGitHubLocatorForMetadata(source: SourceManifestRecord): string | undefined {
  if (parseGitHubRepo(source.locator)) {
    return source.locator;
  }

  const originLocator = source.originLocator?.trim();
  if (originLocator && parseGitHubRepo(originLocator)) {
    return originLocator;
  }

  return undefined;
}

function inferFailedReasonCode(error: unknown): SourceMetadataReasonCode {
  if (hasProviderErrorCode(error, "GITHUB_RATE_LIMITED")) {
    return "provider_rate_limited";
  }

  if (hasProviderErrorCode(error, "CLAWHUB_RATE_LIMITED")) {
    return "provider_rate_limited";
  }

  if (
    hasProviderErrorCode(error, "GITHUB_REPO_RESPONSE_INVALID") ||
    hasProviderErrorCode(error, "SKILLS_SOURCE_PARSE_FAILED") ||
    hasProviderErrorCode(error, "CLAWHUB_RESPONSE_INVALID")
  ) {
    return "provider_response_invalid";
  }

  return "provider_request_failed";
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

function parseClawHubSlug(locator: string): string | undefined {
  const match = locator.match(/^clawhub:([^@\s]+)(?:@.+)?$/);
  return match?.[1];
}

function hasSourceStatsData(sourceStats: SourceStats): boolean {
  return Object.entries(sourceStats).some(([key, value]) => key !== "provider" && value !== undefined);
}

function createProviderError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function hasProviderErrorCode(error: unknown, code: string): error is Error & { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

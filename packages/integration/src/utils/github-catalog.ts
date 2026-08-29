import type { SourceStats } from "@skill-flow/domain/types";
import { fetchWithTimeout } from "./fetch-timeout.js";
import { parseGitHubRepo } from "./naming.js";

type GitHubTreeResponse = {
  tree?: Array<{
    path?: string;
    type?: string;
  }>;
};

type GitHubRepoResponse = {
  stargazers_count?: number;
  forks_count?: number;
  html_url?: string;
  description?: string;
  topics?: string[];
  language?: string | null;
  default_branch?: string;
  pushed_at?: string;
};

export async function fetchGitHubSkillPaths(
  locator: string,
  branch: string,
): Promise<string[]> {
  const repo = parseGitHubRepo(locator);
  if (!repo) {
    throw new Error(`Unsupported GitHub locator '${locator}'.`);
  }

  const response = await fetchWithTimeout(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${branch}?recursive=1`,
    { headers: buildGitHubHeaders() },
  );

  if (!response.ok) {
    throw new Error(`GitHub tree request failed with ${response.status}.`);
  }

  const payload = await response.json() as GitHubTreeResponse;
  return (payload.tree ?? [])
    .filter((entry) => entry.type === "blob" && entry.path?.endsWith("SKILL.md"))
    .map((entry) => entry.path!)
    .sort((left, right) => left.localeCompare(right));
}

export async function fetchGitHubRepoDetails(locator: string): Promise<SourceStats> {
  const repo = parseGitHubRepo(locator);
  if (!repo) {
    return {};
  }

  const response = await fetchWithTimeout(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}`,
    { headers: buildGitHubHeaders() },
  );

  if (!response.ok) {
    if (response.status === 403) {
      throw createProviderError(
        "GITHUB_RATE_LIMITED",
        `GitHub repo request failed with ${response.status}.`,
      );
    }

    throw createProviderError(
      "GITHUB_REPO_REQUEST_FAILED",
      `GitHub repo request failed with ${response.status}.`,
    );
  }

  let payload: GitHubRepoResponse;
  try {
    payload = await response.json() as GitHubRepoResponse;
  } catch {
    throw createProviderError(
      "GITHUB_REPO_RESPONSE_INVALID",
      "GitHub repo response payload was invalid.",
    );
  }

  const starCount = typeof payload.stargazers_count === "number"
    ? payload.stargazers_count
    : undefined;
  const forkCount = typeof payload.forks_count === "number"
    ? payload.forks_count
    : undefined;
  const repoUrl = typeof payload.html_url === "string" && payload.html_url.length > 0
    ? payload.html_url
    : `https://github.com/${repo.owner}/${repo.repo}`;

  return {
    provider: "github",
    repoLabel: `${repo.owner}/${repo.repo}`,
    repoUrl,
    ...(starCount !== undefined ? { starCount } : {}),
    ...(forkCount !== undefined ? { forkCount } : {}),
    ...(typeof payload.description === "string" && payload.description.length > 0
      ? { description: payload.description }
      : {}),
    ...(Array.isArray(payload.topics) ? { topics: payload.topics.filter((item): item is string => typeof item === "string" && item.length > 0) } : {}),
    ...(typeof payload.language === "string" && payload.language.length > 0
      ? { language: payload.language }
      : {}),
    ...(typeof payload.default_branch === "string" && payload.default_branch.length > 0
      ? { defaultBranch: payload.default_branch }
      : {}),
    ...(typeof payload.pushed_at === "string" && payload.pushed_at.length > 0
      ? { pushedAt: payload.pushed_at }
      : {}),
  };
}

function buildGitHubHeaders(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2026-03-10",
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
  };
}

function createProviderError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

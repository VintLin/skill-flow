import type { SourceStats } from "../domain/types.js";
import { parseGitHubRepo } from "./naming.js";

type GitHubTreeResponse = {
  tree?: Array<{
    path?: string;
    type?: string;
  }>;
};

type GitHubRepoResponse = {
  stargazers_count?: number;
};

export async function fetchGitHubSkillPaths(
  locator: string,
  branch: string,
): Promise<string[]> {
  const repo = parseGitHubRepo(locator);
  if (!repo) {
    throw new Error(`Unsupported GitHub locator '${locator}'.`);
  }

  const response = await fetch(
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

export async function fetchGitHubRepoStarCount(locator: string): Promise<number | undefined> {
  const details = await fetchGitHubRepoDetails(locator);
  return details.starCount;
}

export async function fetchGitHubRepoDetails(locator: string): Promise<SourceStats> {
  const repo = parseGitHubRepo(locator);
  if (!repo) {
    return {};
  }

  const response = await fetch(
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

  return {
    provider: "github",
    repoLabel: `${repo.owner}/${repo.repo}`,
    repoUrl: `https://github.com/${repo.owner}/${repo.repo}`,
    ...(starCount !== undefined ? { starCount } : {}),
  };
}

function buildGitHubHeaders(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
  };
}

function createProviderError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

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
  const repo = parseGitHubRepo(locator);
  if (!repo) {
    return undefined;
  }

  const response = await fetch(
    `https://api.github.com/repos/${repo.owner}/${repo.repo}`,
    { headers: buildGitHubHeaders() },
  );

  if (!response.ok) {
    throw new Error(`GitHub repo request failed with ${response.status}.`);
  }

  const payload = await response.json() as GitHubRepoResponse;
  return typeof payload.stargazers_count === "number"
    ? payload.stargazers_count
    : undefined;
}

function buildGitHubHeaders(): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
  };
}

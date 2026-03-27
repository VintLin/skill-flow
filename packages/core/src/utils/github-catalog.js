import { parseGitHubRepo } from "./naming.js";
export async function fetchGitHubSkillPaths(locator, branch) {
    const repo = parseGitHubRepo(locator);
    if (!repo) {
        throw new Error(`Unsupported GitHub locator '${locator}'.`);
    }
    const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${branch}?recursive=1`, { headers: buildGitHubHeaders() });
    if (!response.ok) {
        throw new Error(`GitHub tree request failed with ${response.status}.`);
    }
    const payload = await response.json();
    return (payload.tree ?? [])
        .filter((entry) => entry.type === "blob" && entry.path?.endsWith("SKILL.md"))
        .map((entry) => entry.path)
        .sort((left, right) => left.localeCompare(right));
}
export async function fetchGitHubRepoStarCount(locator) {
    const repo = parseGitHubRepo(locator);
    if (!repo) {
        return undefined;
    }
    const response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}`, { headers: buildGitHubHeaders() });
    if (!response.ok) {
        throw new Error(`GitHub repo request failed with ${response.status}.`);
    }
    const payload = await response.json();
    return typeof payload.stargazers_count === "number"
        ? payload.stargazers_count
        : undefined;
}
function buildGitHubHeaders() {
    return {
        Accept: "application/vnd.github+json",
        ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
    };
}
//# sourceMappingURL=github-catalog.js.map
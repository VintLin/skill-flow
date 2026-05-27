type SourceLike = {
  id: string;
  locator: string;
  displayName: string;
  kind?: "local" | "git" | "clawhub";
};

type ProjectedSkillInput = {
  leafId: string;
  groupId: string;
  groupName: string;
  groupAuthor?: string | undefined;
  skillName: string;
};

export function parseHostedGitRepo(
  locator: string,
): { host: string; owner: string; repo: string } | null {
  const trimmed = locator.trim().replace(/\/+$/, "");

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      const host = url.hostname.toLowerCase();
      const parts = url.pathname.split("/").filter(Boolean);

      if (host === "github.com") {
        const [owner, rawRepo] = parts;
        const repo = rawRepo?.replace(/\.git$/i, "");
        const isRepoRoot = parts.length === 2;
        const isTreePath = parts.length >= 4 && parts[2] === "tree";
        if ((!isRepoRoot && !isTreePath) || !owner || !repo) {
          return null;
        }
        return { host, owner, repo };
      }

      if (host.includes("gitlab")) {
        const treeMarkerIndex = parts.findIndex(
          (segment, index) => segment === "-" && parts[index + 1] === "tree",
        );
        const projectParts = treeMarkerIndex >= 0 ? parts.slice(0, treeMarkerIndex) : parts;
        const isRepoRoot = treeMarkerIndex < 0;
        const isTreePath = treeMarkerIndex >= 2 && parts.length >= treeMarkerIndex + 3;
        const hasUnsupportedPagePath =
          parts.includes("-") ||
          parts.some((segment) => [
            "tree",
            "blob",
            "issues",
            "merge_requests",
          ].includes(segment));
        if ((!isRepoRoot && !isTreePath) || (isRepoRoot && hasUnsupportedPagePath)) {
          return null;
        }

        const rawRepo = projectParts.at(-1);
        const owner = projectParts.slice(0, -1).join("/");
        const repo = rawRepo?.replace(/\.git$/i, "");
        if (!owner || !repo) {
          return null;
        }
        return { host, owner, repo };
      }

      const [owner, rawRepo] = parts;
      const repo = rawRepo?.replace(/\.git$/i, "");
      const isRepoRoot = parts.length === 2;
      const isTreePath = parts.length >= 4 && parts[2] === "tree";
      if ((!isRepoRoot && !isTreePath) || !host || !owner || !repo) {
        return null;
      }
      return { host, owner, repo };
    } catch {
      return null;
    }
  }

  const sshMatch = trimmed.match(/^git@([^:\s]+):([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (!sshMatch) {
    return null;
  }

  const host = sshMatch[1]?.toLowerCase();
  const owner = sshMatch[2];
  const repo = sshMatch[3];
  if (!host || !owner || !repo) {
    return null;
  }

  return { host, owner, repo };
}

export function parseGitHubRepo(locator: string): { owner: string; repo: string } | null {
  const hostedRepo = parseHostedGitRepo(locator);
  if (hostedRepo?.host === "github.com") {
    return { owner: hostedRepo.owner, repo: hostedRepo.repo };
  }

  const trimmed = locator.trim().replace(/\/+$/, "");
  const shorthandMatch = trimmed.match(/^([^/\s:]+)\/([^/\s]+)$/);
  if (shorthandMatch) {
    const owner = shorthandMatch[1];
    const rawRepo = shorthandMatch[2];
    if (!owner || !rawRepo) {
      return null;
    }
    return {
      owner,
      repo: rawRepo.replace(/\.git$/i, ""),
    };
  }

  return null;
}

export function formatGroupLabel(source: SourceLike): string {
  if (source.kind === "local") {
    return `${source.displayName}@local`;
  }

  if (source.kind === "clawhub") {
    return `${source.displayName}@clawhub`;
  }

  const hostedRepo = parseHostedGitRepo(source.locator);
  if (!hostedRepo) {
    return source.displayName;
  }
  return `${source.displayName}@${hostedRepo.owner}`;
}

export function getHostedGitOwner(locator: string): string | undefined {
  return parseHostedGitRepo(locator)?.owner ?? parseGitHubRepo(locator)?.owner;
}

export function formatGroupRef(source: SourceLike): string {
  return `${formatGroupLabel(source)} [${source.id}]`;
}

export function buildProjectedSkillName(
  groupName: string,
  skillName: string,
  groupAuthor?: string,
): string {
  return `${getPreferredProjectedPrefix(groupName, skillName, groupAuthor)}-${skillName}`;
}

export function buildProjectedSkillNameCandidates({
  preferredName,
  groupId,
  groupName,
  groupAuthor,
  skillName,
}: {
  preferredName: string;
  groupId: string;
  groupName: string;
  groupAuthor?: string | undefined;
  skillName: string;
}) {
  const candidates = [
    preferredName,
    buildProjectedSkillName(groupName, skillName, groupAuthor),
    buildRepoAuthorProjectedSkillName(groupName, skillName, groupAuthor),
    `${groupId}-${skillName}`,
  ];

  return [...new Set(candidates.filter((value): value is string => Boolean(value)))];
}

export function resolveProjectedSkillNames(
  items: ProjectedSkillInput[],
): Map<string, string> {
  const result = new Map<string, string>();
  const bySkillName = new Map<string, ProjectedSkillInput[]>();

  for (const item of items) {
    const group = bySkillName.get(item.skillName) ?? [];
    group.push(item);
    bySkillName.set(item.skillName, group);
  }

  for (const group of bySkillName.values()) {
    if (group.length <= 1) {
      const item = group[0];
      if (item) {
        result.set(item.leafId, item.skillName);
      }
      continue;
    }

    const preferredNames = group.map((item) => ({
      item,
      projectedName: buildProjectedSkillName(
        item.groupName,
        item.skillName,
        item.groupAuthor,
      ),
    }));
    const projectedNameCounts = new Map<string, number>();
    for (const preferred of preferredNames) {
      projectedNameCounts.set(
        preferred.projectedName,
        (projectedNameCounts.get(preferred.projectedName) ?? 0) + 1,
      );
    }

    for (const preferred of preferredNames) {
      if ((projectedNameCounts.get(preferred.projectedName) ?? 0) === 1) {
        result.set(preferred.item.leafId, preferred.projectedName);
        continue;
      }

      const repoAuthorProjectedName = buildRepoAuthorProjectedSkillName(
        preferred.item.groupName,
        preferred.item.skillName,
        preferred.item.groupAuthor,
      );
      if (
        repoAuthorProjectedName &&
        (projectedNameCounts.get(repoAuthorProjectedName) ?? 0) === 0
      ) {
        result.set(preferred.item.leafId, repoAuthorProjectedName);
        continue;
      }

      result.set(preferred.item.leafId, `${preferred.item.groupId}-${preferred.item.skillName}`);
    }
  }

  return result;
}

function getPreferredProjectedPrefix(
  groupName: string,
  skillName: string,
  groupAuthor?: string,
) {
  if (skillName.startsWith(`${groupName}-`) && groupAuthor) {
    return groupAuthor;
  }
  return groupName;
}

function buildRepoAuthorProjectedSkillName(
  groupName: string,
  skillName: string,
  groupAuthor?: string,
) {
  if (!groupAuthor) {
    return undefined;
  }
  return `${groupName}(${groupAuthor})-${skillName}`;
}

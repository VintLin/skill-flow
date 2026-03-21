type SourceLike = {
  id: string;
  locator: string;
  displayName: string;
};

type ProjectedSkillInput = {
  leafId: string;
  groupId: string;
  groupName: string;
  skillName: string;
};

export function parseGitHubRepo(locator: string): { owner: string; repo: string } | null {
  const trimmed = locator.trim().replace(/\/+$/, "");

  const httpsMatch = trimmed.match(
    /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i,
  );
  if (httpsMatch) {
    const owner = httpsMatch[1];
    const repo = httpsMatch[2];
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo };
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo };
  }

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
  const githubRepo = parseGitHubRepo(source.locator);
  if (!githubRepo) {
    return source.displayName;
  }
  return `${source.displayName}(@${githubRepo.owner})`;
}

export function formatGroupRef(source: SourceLike): string {
  return `${formatGroupLabel(source)} [${source.id}]`;
}

export function buildProjectedSkillName(groupName: string, skillName: string): string {
  return `${groupName}-${skillName}`;
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
      projectedName: buildProjectedSkillName(item.groupName, item.skillName),
    }));
    const preferredCounts = new Map<string, number>();
    for (const preferred of preferredNames) {
      preferredCounts.set(
        preferred.projectedName,
        (preferredCounts.get(preferred.projectedName) ?? 0) + 1,
      );
    }

    for (const preferred of preferredNames) {
      if ((preferredCounts.get(preferred.projectedName) ?? 0) === 1) {
        result.set(preferred.item.leafId, preferred.projectedName);
        continue;
      }
      result.set(preferred.item.leafId, `${preferred.item.groupId}-${preferred.item.skillName}`);
    }
  }

  return result;
}

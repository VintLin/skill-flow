export function parseGitHubRepo(locator) {
    const trimmed = locator.trim().replace(/\/+$/, "");
    const httpsMatch = trimmed.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
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
export function formatGroupLabel(source) {
    if (source.kind === "local") {
        return `${source.displayName}@local`;
    }
    if (source.kind === "clawhub") {
        return `${source.displayName}@clawhub`;
    }
    const githubRepo = parseGitHubRepo(source.locator);
    if (!githubRepo) {
        return source.displayName;
    }
    return `${source.displayName}@${githubRepo.owner}`;
}
export function formatGroupRef(source) {
    return `${formatGroupLabel(source)} [${source.id}]`;
}
export function buildProjectedSkillName(groupName, skillName, groupAuthor) {
    return `${getPreferredProjectedPrefix(groupName, skillName, groupAuthor)}-${skillName}`;
}
export function buildProjectedSkillNameCandidates({ preferredName, groupId, groupName, groupAuthor, skillName, }) {
    const candidates = [
        preferredName,
        buildProjectedSkillName(groupName, skillName, groupAuthor),
        buildRepoAuthorProjectedSkillName(groupName, skillName, groupAuthor),
        `${groupId}-${skillName}`,
    ];
    return [...new Set(candidates.filter((value) => Boolean(value)))];
}
export function resolveProjectedSkillNames(items) {
    const result = new Map();
    const bySkillName = new Map();
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
            projectedName: buildProjectedSkillName(item.groupName, item.skillName, item.groupAuthor),
        }));
        const projectedNameCounts = new Map();
        for (const preferred of preferredNames) {
            projectedNameCounts.set(preferred.projectedName, (projectedNameCounts.get(preferred.projectedName) ?? 0) + 1);
        }
        for (const preferred of preferredNames) {
            if ((projectedNameCounts.get(preferred.projectedName) ?? 0) === 1) {
                result.set(preferred.item.leafId, preferred.projectedName);
                continue;
            }
            const repoAuthorProjectedName = buildRepoAuthorProjectedSkillName(preferred.item.groupName, preferred.item.skillName, preferred.item.groupAuthor);
            if (repoAuthorProjectedName &&
                (projectedNameCounts.get(repoAuthorProjectedName) ?? 0) === 0) {
                result.set(preferred.item.leafId, repoAuthorProjectedName);
                continue;
            }
            result.set(preferred.item.leafId, `${preferred.item.groupId}-${preferred.item.skillName}`);
        }
    }
    return result;
}
function getPreferredProjectedPrefix(groupName, skillName, groupAuthor) {
    if (skillName.startsWith(`${groupName}-`) && groupAuthor) {
        return groupAuthor;
    }
    return groupName;
}
function buildRepoAuthorProjectedSkillName(groupName, skillName, groupAuthor) {
    if (!groupAuthor) {
        return undefined;
    }
    return `${groupName}(${groupAuthor})-${skillName}`;
}
//# sourceMappingURL=naming.js.map
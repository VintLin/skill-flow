import type { SourceKind } from "@skill-flow/domain/types";
type SourceLike = {
    id: string;
    locator: string;
    displayName: string;
    kind?: SourceKind;
};
type ProjectedSkillInput = {
    leafId: string;
    groupId: string;
    groupName: string;
    groupAuthor?: string | undefined;
    skillName: string;
};
export declare function parseGitHubRepo(locator: string): {
    owner: string;
    repo: string;
} | null;
export declare function formatGroupLabel(source: SourceLike): string;
export declare function formatGroupRef(source: SourceLike): string;
export declare function buildProjectedSkillName(groupName: string, skillName: string, groupAuthor?: string): string;
export declare function buildProjectedSkillNameCandidates({ preferredName, groupId, groupName, groupAuthor, skillName, }: {
    preferredName: string;
    groupId: string;
    groupName: string;
    groupAuthor?: string | undefined;
    skillName: string;
}): string[];
export declare function resolveProjectedSkillNames(items: ProjectedSkillInput[]): Map<string, string>;
export {};

export declare class ClawHubSecurityBlockError extends Error {
    constructor(message: string);
}
export type ClawHubInstallResult = {
    workdir: string;
    installedPath: string;
    slug: string;
    resolvedVersion: string;
};
export type ClawHubSearchResult = {
    slug: string;
    title: string;
    score: number;
};
export type ClawHubInspectResult = {
    skill: {
        slug: string;
        displayName: string;
        summary: string;
        stats?: {
            installsAllTime?: number;
            installsCurrent?: number;
            stars?: number;
        };
    };
    latestVersion?: {
        version: string;
    } | null;
    version?: {
        version: string;
    } | null;
};
export declare function clawhub(args: string[], options?: {
    cwd?: string;
}): Promise<string>;
export declare function installClawHubSkill(slug: string, version?: string): Promise<ClawHubInstallResult>;
export declare function inspectClawHubSkill(slug: string, options?: {
    version?: string;
    files?: boolean;
}): Promise<ClawHubInspectResult>;
export declare function searchClawHubSkills(query: string, limit?: number): Promise<ClawHubSearchResult[]>;

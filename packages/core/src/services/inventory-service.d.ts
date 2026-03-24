import type { DuplicateLeafRecord, InvalidLeafRecord, LeafRecord } from "../domain/types.js";
type InventoryScan = {
    leafs: LeafRecord[];
    invalidLeafs: InvalidLeafRecord[];
    duplicateLeafs: DuplicateLeafRecord[];
    skillFileCount: number;
};
export declare class InventoryService {
    private static readonly IGNORED_DIRECTORIES;
    scanSource(sourceId: string, checkoutPath: string, rootLinkName?: string): Promise<InventoryScan>;
    private findSkillFiles;
    private walkSkillTree;
    private parseSkillFile;
    private dedupeCandidates;
    private parseFrontmatter;
}
export {};

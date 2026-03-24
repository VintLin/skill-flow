export type ParentSelectionState = "empty" | "partial" | "full";
export type TreeSelectionState = {
    allLeafIds: string[];
    selectedLeafIds: string[];
};
export declare function getParentSelectionState(state: TreeSelectionState): ParentSelectionState;
export declare function toggleParent(state: TreeSelectionState): TreeSelectionState;
export declare function toggleChild(state: TreeSelectionState, leafId: string): TreeSelectionState;

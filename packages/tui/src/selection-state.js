export function getParentSelectionState(state) {
    if (state.selectedLeafIds.length === 0) {
        return "empty";
    }
    if (state.selectedLeafIds.length === state.allLeafIds.length) {
        return "full";
    }
    return "partial";
}
// parent
//   [ ] -> [x] -> [-] transitions come from child toggles
// children
//   toggle child recalculates parent from current selected set
export function toggleParent(state) {
    return getParentSelectionState(state) === "full"
        ? { ...state, selectedLeafIds: [] }
        : { ...state, selectedLeafIds: [...state.allLeafIds] };
}
export function toggleChild(state, leafId) {
    const selected = new Set(state.selectedLeafIds);
    if (selected.has(leafId)) {
        selected.delete(leafId);
    }
    else {
        selected.add(leafId);
    }
    return {
        ...state,
        selectedLeafIds: state.allLeafIds.filter((id) => selected.has(id)),
    };
}
//# sourceMappingURL=selection-state.js.map
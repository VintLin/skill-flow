export type ParentSelectionState = "empty" | "partial" | "full";

export type TreeSelectionState = {
  allLeafIds: string[];
  selectedLeafIds: string[];
};

export function getParentSelectionState(
  state: TreeSelectionState,
): ParentSelectionState {
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
export function toggleParent(state: TreeSelectionState): TreeSelectionState {
  return getParentSelectionState(state) === "full"
    ? { ...state, selectedLeafIds: [] }
    : { ...state, selectedLeafIds: [...state.allLeafIds] };
}

export function toggleChild(
  state: TreeSelectionState,
  leafId: string,
): TreeSelectionState {
  const selected = new Set(state.selectedLeafIds);
  if (selected.has(leafId)) {
    selected.delete(leafId);
  } else {
    selected.add(leafId);
  }

  return {
    ...state,
    selectedLeafIds: state.allLeafIds.filter((id) => selected.has(id)),
  };
}

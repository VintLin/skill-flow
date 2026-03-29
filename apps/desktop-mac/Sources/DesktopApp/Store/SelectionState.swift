import Foundation

enum SelectionState: String, Equatable {
    case empty
    case partial
    case full
}

struct TreeSelectionState {
    var allLeafIds: [String]
    var selectedLeafIds: [String]
}

func selectionState(allIds: [String], selectedIds: [String]) -> SelectionState {
    getParentSelectionState(TreeSelectionState(allLeafIds: allIds, selectedLeafIds: selectedIds))
}

func getParentSelectionState(_ state: TreeSelectionState) -> SelectionState {
    if state.selectedLeafIds.isEmpty {
        return .empty
    }
    if state.selectedLeafIds.count == state.allLeafIds.count {
        return .full
    }
    return .partial
}

func toggleParent(_ state: TreeSelectionState) -> TreeSelectionState {
    getParentSelectionState(state) == .full
        ? TreeSelectionState(allLeafIds: state.allLeafIds, selectedLeafIds: [])
        : TreeSelectionState(allLeafIds: state.allLeafIds, selectedLeafIds: state.allLeafIds)
}

func toggleChild(_ state: TreeSelectionState, leafId: String) -> TreeSelectionState {
    let selected = Set(state.selectedLeafIds)
    var nextSelected = selected
    if nextSelected.contains(leafId) {
        nextSelected.remove(leafId)
    } else {
        nextSelected.insert(leafId)
    }

    return TreeSelectionState(
        allLeafIds: state.allLeafIds,
        selectedLeafIds: state.allLeafIds.filter { nextSelected.contains($0) }
    )
}

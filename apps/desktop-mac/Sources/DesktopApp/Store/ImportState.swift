import Foundation

struct ImportDraftState: Equatable {
    let selectedSkillIds: [String]
    let enabledTargetIds: [String]
}

struct ImportState {
    var draftsByItemId: [String: ImportDraftState] = [:]
}

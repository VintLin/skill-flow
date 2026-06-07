import Foundation

enum ImportSkillSelector: Equatable, Sendable {
    case repoPath(String)

    var bridgePayload: [String: Any] {
        switch self {
        case .repoPath(let path):
            return [
                "kind": "repoPath",
                "path": path,
            ]
        }
    }

}

struct ImportSkillSelection: Equatable, Sendable {
    let uiId: String
    let selector: ImportSkillSelector

    init(uiId: String, selector: ImportSkillSelector) {
        self.uiId = uiId
        self.selector = selector
    }

    var bridgePayload: [String: Any] {
        [
            "uiId": uiId,
            "selector": selector.bridgePayload,
        ]
    }

    static func repoPath(_ path: String) -> ImportSkillSelection {
        ImportSkillSelection(uiId: path, selector: .repoPath(path))
    }
}

enum ImportSkillSelectionMode: String, Equatable, Sendable {
    case all
    case selected
}

struct ImportDraftState: Equatable {
    let selectedSkills: [ImportSkillSelection]
    let enabledTargetIds: [String]

    init(selectedSkills: [ImportSkillSelection], enabledTargetIds: [String]) {
        self.selectedSkills = selectedSkills
        self.enabledTargetIds = enabledTargetIds
    }
}

struct ImportState {
    var draftsByItemId: [String: ImportDraftState] = [:]
}

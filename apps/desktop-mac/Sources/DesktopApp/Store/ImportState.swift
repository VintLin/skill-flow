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

    var legacySkillId: String {
        switch self {
        case .repoPath(let path):
            return path
        }
    }
}

struct ImportSkillSelection: Equatable, Sendable {
    let uiId: String
    let selector: ImportSkillSelector
    let importDraftV2Compatible: Bool

    init(uiId: String, selector: ImportSkillSelector, importDraftV2Compatible: Bool = true) {
        self.uiId = uiId
        self.selector = selector
        self.importDraftV2Compatible = importDraftV2Compatible
    }

    var bridgePayload: [String: Any] {
        [
            "uiId": uiId,
            "selector": selector.bridgePayload,
        ]
    }

    static func repoPath(_ path: String) -> ImportSkillSelection {
        ImportSkillSelection(uiId: path, selector: .repoPath(path), importDraftV2Compatible: false)
    }
}

struct ImportDraftState: Equatable {
    let selectedSkills: [ImportSkillSelection]
    let enabledTargetIds: [String]

    var selectedSkillIds: [String] {
        selectedSkills.map(\.selector.legacySkillId)
    }

    init(selectedSkillIds: [String], enabledTargetIds: [String]) {
        self.selectedSkills = selectedSkillIds.map(ImportSkillSelection.repoPath)
        self.enabledTargetIds = enabledTargetIds
    }

    init(selectedSkills: [ImportSkillSelection], enabledTargetIds: [String]) {
        self.selectedSkills = selectedSkills
        self.enabledTargetIds = enabledTargetIds
    }
}

struct ImportState {
    var draftsByItemId: [String: ImportDraftState] = [:]
}

import Foundation

struct AgentDisplayPreference: Codable, Equatable, Identifiable {
    let targetId: String
    var isVisible: Bool
    var sortOrder: Int

    var id: String { targetId }
}

enum AgentDisplayCatalog {
    static let defaultTargetOrder: [String] = [
        "claude-code",
        "codex",
        "cursor",
        "github-copilot",
        "gemini-cli",
        "opencode",
        "openclaw",
        "pi",
        "windsurf",
        "roo-code",
        "cline",
        "amp",
        "kiro",
    ]

    private static let labelsByTargetId: [String: String] = [
        "claude-code": "Claude Code",
        "codex": "Codex",
        "cursor": "Cursor",
        "github-copilot": "GitHub Copilot",
        "gemini-cli": "Gemini CLI",
        "opencode": "OpenCode",
        "openclaw": "OpenClaw",
        "pi": "Pi",
        "windsurf": "Windsurf",
        "roo-code": "Roo Code",
        "cline": "Cline",
        "amp": "Amp",
        "kiro": "Kiro",
    ]

    private static let shortLabelsByTargetId: [String: String] = [
        "claude-code": "CC",
        "codex": "CX",
        "cursor": "CU",
        "github-copilot": "GH",
        "gemini-cli": "GM",
        "opencode": "OP",
        "openclaw": "OC",
        "pi": "PI",
        "windsurf": "WS",
        "roo-code": "RO",
        "cline": "CL",
        "amp": "AM",
        "kiro": "KI",
    ]

    static func defaultPreferences() -> [AgentDisplayPreference] {
        defaultTargetOrder.enumerated().map { index, targetId in
            AgentDisplayPreference(targetId: targetId, isVisible: true, sortOrder: index)
        }
    }

    static func normalize(_ rawPreferences: [AgentDisplayPreference]) -> [AgentDisplayPreference] {
        let knownTargetIds = Set(defaultTargetOrder)
        let validPreferences = rawPreferences.filter { knownTargetIds.contains($0.targetId) }
        let rawByTargetId = Dictionary(uniqueKeysWithValues: validPreferences.map { ($0.targetId, $0) })
        let baseOrder = validPreferences
            .sorted {
                if $0.sortOrder != $1.sortOrder {
                    return $0.sortOrder < $1.sortOrder
                }
                return defaultIndex(for: $0.targetId) < defaultIndex(for: $1.targetId)
            }
            .map(\.targetId)
        let missingTargets = defaultTargetOrder.filter { rawByTargetId[$0] == nil }
        let orderedTargetIds = baseOrder + missingTargets

        return orderedTargetIds.enumerated().map { index, targetId in
            let raw = rawByTargetId[targetId]
            return AgentDisplayPreference(
                targetId: targetId,
                isVisible: raw?.isVisible ?? true,
                sortOrder: index
            )
        }
    }

    static func label(for targetId: String) -> String {
        labelsByTargetId[targetId] ?? targetId
    }

    static func shortLabel(for targetId: String) -> String {
        shortLabelsByTargetId[targetId] ?? String(label(for: targetId).prefix(2)).uppercased()
    }

    static func orderedTargetIds(in targetIds: some Sequence<String>) -> [String] {
        let selected = Set(targetIds)
        return defaultTargetOrder.filter { selected.contains($0) }
    }

    private static func defaultIndex(for targetId: String) -> Int {
        defaultTargetOrder.firstIndex(of: targetId) ?? defaultTargetOrder.count
    }
}

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
        "hermes-agent",
        "pi",
        "trae",
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
        "hermes-agent": "Hermes Agent",
        "pi": "Pi",
        "trae": "Trae",
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
        "hermes-agent": "HA",
        "pi": "PI",
        "trae": "TR",
        "windsurf": "WS",
        "roo-code": "RO",
        "cline": "CL",
        "amp": "AM",
        "kiro": "KI",
    ]

    static func defaultPreferences(customAgents: [CustomAgentDefinition] = []) -> [AgentDisplayPreference] {
        orderedTargetIds(customAgents: customAgents).enumerated().map { index, targetId in
            AgentDisplayPreference(targetId: targetId, isVisible: true, sortOrder: index)
        }
    }

    static func normalize(
        _ rawPreferences: [AgentDisplayPreference],
        customAgents: [CustomAgentDefinition] = []
    ) -> [AgentDisplayPreference] {
        let orderedIds = orderedTargetIds(customAgents: customAgents)
        let knownTargetIds = Set(orderedIds)
        let validPreferences = rawPreferences.filter { knownTargetIds.contains($0.targetId) }
        let rawByTargetId = Dictionary(uniqueKeysWithValues: validPreferences.map { ($0.targetId, $0) })
        let baseOrder = validPreferences
            .sorted {
                if $0.sortOrder != $1.sortOrder {
                    return $0.sortOrder < $1.sortOrder
                }
                return defaultIndex(for: $0.targetId, customAgents: customAgents) < defaultIndex(for: $1.targetId, customAgents: customAgents)
            }
            .map(\.targetId)
        let missingTargets = orderedIds.filter { rawByTargetId[$0] == nil }
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

    static func label(for targetId: String, customAgents: [CustomAgentDefinition] = []) -> String {
        customAgents.first(where: { $0.id == targetId })?.name ?? labelsByTargetId[targetId] ?? targetId
    }

    static func shortLabel(for targetId: String, customAgents: [CustomAgentDefinition] = []) -> String {
        if let customAgent = customAgents.first(where: { $0.id == targetId }) {
            return monogram(for: customAgent.name)
        }
        return shortLabelsByTargetId[targetId] ?? String(label(for: targetId, customAgents: customAgents).prefix(2)).uppercased()
    }

    static func mountPath(for targetId: String, customAgents: [CustomAgentDefinition] = []) -> String {
        if let customAgent = customAgents.first(where: { $0.id == targetId }) {
            return customAgent.globalPath
        }
        let homeDirectory = FileManager.default.homeDirectoryForCurrentUser

        switch targetId {
        case "claude-code":
            return homeDirectory.appendingPathComponent(".claude/skills", isDirectory: true).path
        case "codex":
            return homeDirectory.appendingPathComponent(".codex/skills", isDirectory: true).path
        case "cursor":
            return homeDirectory.appendingPathComponent(".cursor/skills", isDirectory: true).path
        case "github-copilot":
            return homeDirectory.appendingPathComponent(".copilot/skills", isDirectory: true).path
        case "gemini-cli":
            return homeDirectory.appendingPathComponent(".gemini/skills", isDirectory: true).path
        case "opencode":
            return homeDirectory.appendingPathComponent(".config/opencode/skills", isDirectory: true).path
        case "openclaw":
            return homeDirectory.appendingPathComponent(".openclaw/skills", isDirectory: true).path
        case "hermes-agent":
            return homeDirectory.appendingPathComponent(".hermes/skills", isDirectory: true).path
        case "pi":
            return homeDirectory.appendingPathComponent(".pi/agent/skills", isDirectory: true).path
        case "trae":
            return homeDirectory.appendingPathComponent(".trae/skills", isDirectory: true).path
        case "windsurf":
            return homeDirectory.appendingPathComponent(".codeium/windsurf/skills", isDirectory: true).path
        case "roo-code":
            return homeDirectory.appendingPathComponent(".roo/skills", isDirectory: true).path
        case "cline":
            return homeDirectory.appendingPathComponent(".agents/skills", isDirectory: true).path
        case "amp":
            return homeDirectory.appendingPathComponent(".config/agents/skills", isDirectory: true).path
        case "kiro":
            return homeDirectory.appendingPathComponent(".kiro/skills", isDirectory: true).path
        default:
            return targetId
        }
    }

    static func projectPath(for targetId: String, customAgents: [CustomAgentDefinition] = []) -> String? {
        if let customAgent = customAgents.first(where: { $0.id == targetId }) {
            return customAgent.projectPathTemplate.nonEmpty
        }

        switch targetId {
        case "claude-code":
            return ".claude/skills"
        case "codex", "cursor", "github-copilot", "gemini-cli", "opencode", "cline":
            return ".agents/skills"
        case "openclaw":
            return "skills"
        case "hermes-agent":
            return ".hermes/skills"
        case "pi":
            return ".pi/skills"
        case "trae":
            return ".trae/skills"
        case "windsurf":
            return ".windsurf/skills"
        case "roo-code":
            return ".roo/skills"
        case "amp":
            return ".agents/skills"
        case "kiro":
            return ".kiro/skills"
        default:
            return nil
        }
    }

    static func orderedTargetIds(in targetIds: some Sequence<String>, customAgents: [CustomAgentDefinition] = []) -> [String] {
        let selected = Set(targetIds)
        return orderedTargetIds(customAgents: customAgents).filter { selected.contains($0) }
    }

    static func isBuiltIn(targetId: String) -> Bool {
        defaultTargetOrder.contains(targetId)
    }

    private static func orderedTargetIds(customAgents: [CustomAgentDefinition]) -> [String] {
        defaultTargetOrder + customAgents.map(\.id)
    }

    private static func defaultIndex(for targetId: String, customAgents: [CustomAgentDefinition]) -> Int {
        orderedTargetIds(customAgents: customAgents).firstIndex(of: targetId) ?? orderedTargetIds(customAgents: customAgents).count
    }

    private static func monogram(for name: String) -> String {
        let tokens = name
            .split(whereSeparator: { $0.isWhitespace || $0 == "-" || $0 == "_" })
            .map(String.init)
            .filter { !$0.isEmpty }
        if tokens.count >= 2 {
            return String(tokens.prefix(2).compactMap { $0.first }).uppercased()
        }
        return String(name.prefix(2)).uppercased()
    }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}

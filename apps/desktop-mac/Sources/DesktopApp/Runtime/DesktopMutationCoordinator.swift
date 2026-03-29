import Foundation

enum UpdateSelectionResult {
    case missingSelection
    case submitted(sourceId: String, response: BridgeResponse)
}

struct PinnedMutationResult {
    let response: BridgeResponse
    let pinnedSourceIds: [String]
}

@MainActor
final class DesktopMutationCoordinator {
    private let commandFacade: any DesktopCommanding

    init(commandFacade: any DesktopCommanding) {
        self.commandFacade = commandFacade
    }

    func togglePinned(sourceId: String) async throws -> PinnedMutationResult {
        let response = try await commandFacade.togglePinnedSource(sourceId: sourceId)
        return PinnedMutationResult(
            response: response,
            pinnedSourceIds: pinnedSourceIds(from: response.data?.value)
        )
    }

    func updateSelectedSource(_ sourceId: String?) async throws -> UpdateSelectionResult {
        guard let normalizedSourceId = normalizedSourceId(sourceId) else {
            return .missingSelection
        }

        let response = try await commandFacade.updateSources([normalizedSourceId])
        return .submitted(sourceId: normalizedSourceId, response: response)
    }

    private func pinnedSourceIds(from value: Any?) -> [String] {
        guard
            let data = value as? [String: Any],
            let pinnedSourceIds = data["pinnedSourceIds"] as? [String]
        else {
            return []
        }

        var seen = Set<String>()
        var normalized: [String] = []

        for sourceId in pinnedSourceIds {
            let trimmed = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !seen.contains(trimmed) else {
                continue
            }
            seen.insert(trimmed)
            normalized.append(trimmed)
        }

        return normalized
    }

    private func normalizedSourceId(_ sourceId: String?) -> String? {
        guard let sourceId else {
            return nil
        }

        let trimmed = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

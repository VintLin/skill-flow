import Foundation

enum UpdateSelectionResult {
    case missingSelection
    case submitted(sourceId: String, response: BridgeResponse)
}

struct PinnedMutationResult {
    let response: BridgeResponse
    let pinnedSourceIds: [String]
}

struct RenameSourceMutationResult: Equatable {
    let sourceId: String
    let displayName: String
    let originalDisplayName: String
    let isResetToOriginal: Bool
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

    func renameSource(sourceId: String, displayName: String) async throws -> RenameSourceMutationResult {
        let response = try await commandFacade.renameSource(sourceId: sourceId, displayName: displayName)
        guard response.ok else {
            throw BridgeClientError.commandFailed(commandFailedMessage(from: response), response: response)
        }
        let payload = Self.successPayload(response)
        let resolvedDisplayName = payload["displayName"] as? String
            ?? displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolvedOriginal = payload["originalDisplayName"] as? String
            ?? resolvedDisplayName
        return RenameSourceMutationResult(
            sourceId: payload["sourceId"] as? String ?? sourceId,
            displayName: resolvedDisplayName,
            originalDisplayName: resolvedOriginal,
            isResetToOriginal: payload["isResetToOriginal"] as? Bool ?? false
        )
    }

    private static func successPayload(_ response: BridgeResponse) -> [String: Any] {
        response.data?.value as? [String: Any] ?? [:]
    }

    private func commandFailedMessage(from response: BridgeResponse) -> String {
        if !response.errors.isEmpty {
            return response.errors.map(\.message).joined(separator: "\n")
        }

        let rawValue = UserDefaults.standard.string(forKey: DesktopLanguage.storageKey) ?? DesktopLanguage.system.rawValue
        let locale = DesktopLanguage(storageValue: rawValue).locale
        return L10n.string("bridge.error.command_failed_default", locale: locale)
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

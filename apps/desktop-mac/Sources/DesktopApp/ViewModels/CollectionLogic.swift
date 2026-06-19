import Foundation
import Observation

@MainActor
@Observable
final class CollectionLogic {
    private let commandFacade: any DesktopCommanding
    var onRefreshList: (() async -> Void)?
    var onShowToast: ((ToastStyle, String) -> Void)?
    var onShowBridgeCommandFailure: ((BridgeResponse) -> Void)?
    var groupCardsProvider: () -> [GroupCardModel] = { [] }

    init(commandFacade: any DesktopCommanding) {
        self.commandFacade = commandFacade
    }

    func collectionEditorOptions() -> CollectionEditorOptions {
        let cards = groupCardsProvider()
        let sourceOptions = cards.map { collectionSourceOption(for: $0) }
        let mergeSourceIds = Set(sourceOptions.filter { !$0.isCollection }.map(\.id))
        return CollectionEditorOptions(
            skillOptions: cards
                .filter { mergeSourceIds.contains($0.id) }
                .flatMap { collectionSkillOptions(for: $0) },
            mergeSourceOptions: sourceOptions.filter { !$0.isCollection },
            restoreSourceOptions: sourceOptions.filter(\.isCollection)
        )
    }

    func collectionSourceOption(for card: GroupCardModel) -> CollectionSourceOption {
        CollectionSourceOption(
            id: card.id,
            title: card.title,
            sourceSubtitle: collectionSkillSourceSubtitle(for: card),
            skillCount: card.skills.count,
            isCollection: card.sourceKind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "collection"
        )
    }

    func collectionSkillOptions(for sourceId: String) -> [CollectionSkillOption] {
        guard let card = groupCardsProvider().first(where: { $0.id == sourceId }) else {
            return []
        }
        return collectionSkillOptions(for: card)
    }

    private func collectionSkillOptions(for card: GroupCardModel) -> [CollectionSkillOption] {
        let sourceSubtitle = collectionSkillSourceSubtitle(for: card)
        return card.skills.map { skill in
            CollectionSkillOption(
                id: "\(card.id):\(skill.id)",
                sourceId: card.id,
                sourceTitle: card.title,
                sourceSubtitle: sourceSubtitle,
                leafId: skill.id,
                title: skill.label,
                isEnabled: skill.isEnabled
            )
        }
    }

    func validateCollectionCreate(
        displayName: String,
        selectedSkills: [CollectionSkillRef]
    ) -> CollectionValidationResult {
        if displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .nameRequired
        }
        if selectedSkills.isEmpty {
            return .skillsRequired
        }
        return .valid
    }

    func validateCollectionMerge(
        displayName: String,
        sourceIds: [String]
    ) -> CollectionValidationResult {
        if displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return .nameRequired
        }
        if normalizedUniqueValues(sourceIds).count < 2 {
            return .groupsRequired
        }
        return .valid
    }

    func createCollection(
        displayName: String,
        skills: [CollectionSkillRef],
        enabledTargets: [String]
    ) async {
        let normalizedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard validateCollectionCreate(displayName: normalizedDisplayName, selectedSkills: skills) == .valid else {
            return
        }

        do {
            let response = try await commandFacade.createCollection(
                displayName: normalizedDisplayName,
                skills: skills,
                enabledTargets: enabledTargets
            )
            guard response.ok else {
                onShowBridgeCommandFailure?(response)
                return
            }
            await onRefreshList?()
        } catch {
            onShowToast?(.error, firstErrorLine(from: error))
        }
    }

    func mergeGroups(
        displayName: String,
        sourceIds: [String],
        enabledTargets: [String]
    ) async {
        let normalizedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedSourceIds = normalizedUniqueValues(sourceIds)
        guard validateCollectionMerge(displayName: normalizedDisplayName, sourceIds: normalizedSourceIds) == .valid else {
            return
        }

        do {
            let response = try await commandFacade.mergeGroups(
                displayName: normalizedDisplayName,
                sourceIds: normalizedSourceIds,
                enabledTargets: enabledTargets
            )
            guard response.ok else {
                onShowBridgeCommandFailure?(response)
                return
            }
            await onRefreshList?()
        } catch {
            onShowToast?(.error, firstErrorLine(from: error))
        }
    }

    func restoreCollectionSources(collectionId: String) async {
        let normalizedCollectionId = collectionId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedCollectionId.isEmpty else {
            return
        }

        do {
            let response = try await commandFacade.restoreCollectionSources(collectionId: normalizedCollectionId)
            guard response.ok else {
                onShowBridgeCommandFailure?(response)
                return
            }
            await onRefreshList?()
        } catch {
            onShowToast?(.error, firstErrorLine(from: error))
        }
    }

    private func normalizedUniqueValues(_ values: [String]) -> [String] {
        var seen = Set<String>()
        var normalized: [String] = []

        for value in values {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !seen.contains(trimmed) else {
                continue
            }
            seen.insert(trimmed)
            normalized.append(trimmed)
        }

        return normalized
    }

    private func collectionSkillSourceSubtitle(for card: GroupCardModel) -> String {
        let author = Self.normalizedCollectionAuthor(from: card.byline)
        if let author {
            return "\(author) · \(card.title)"
        }
        return card.title
    }

    nonisolated private static func normalizedCollectionAuthor(from byline: String?) -> String? {
        let trimmed = byline?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmed.isEmpty else {
            return nil
        }
        if trimmed.lowercased().hasPrefix("by ") {
            let value = String(trimmed.dropFirst(3)).trimmingCharacters(in: .whitespacesAndNewlines)
            return value.isEmpty ? nil : value
        }
        return trimmed
    }

    nonisolated private static func isCollectionSourceKind(_ value: String) -> Bool {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "collection"
    }

    private func firstErrorLine(from error: Error) -> String {
        let nsError = error as NSError
        let userInfo = nsError.userInfo
        if let underlyingErrors = userInfo["NSDetailedErrors"] as? [Error], let first = underlyingErrors.first {
            return firstErrorLine(from: first)
        }
        return nsError.localizedDescription
    }
}

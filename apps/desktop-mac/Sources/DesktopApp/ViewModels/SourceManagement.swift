import Foundation
import Observation

@MainActor
@Observable
final class SourceManagement {
    private struct ScopedSourceKey: Hashable {
        let scope: ProjectScopeSelection
        let sourceId: String
    }

    struct DraftState: Equatable {
        var selectedLeafIds: [String]
        var enabledTargets: [String]
    }

    enum InspectIntent: Equatable {
        case navigation
        case postCommit
    }

    enum InspectOutcome {
        case current(BridgeResponse)
        case superseded
    }

    struct WorkflowSummary: Sendable {
        enum SelectionMode: String, Sendable {
            case all
            case selected
        }

        let sourceId: String
        let sourceKind: String
        let ownership: String
        let sourceDisplayName: String
        let sourceOriginalDisplayName: String
        let sourceLocator: String
        let sourceCanonicalRepo: String?
        let selectionMode: SelectionMode?
        let leafs: [LeafSummary]
        let selectedLeafIds: [String]
        let enabledTargets: [String]
        let targetLeafIdsByTarget: [String: [String]]
        let health: String
        let warningCount: Int
        let errorCount: Int
        let updatedAt: String

        init(
            sourceId: String,
            sourceKind: String,
            ownership: String = "managed",
            sourceDisplayName: String,
            sourceOriginalDisplayName: String,
            sourceLocator: String,
            sourceCanonicalRepo: String?,
            selectionMode: SelectionMode?,
            leafs: [LeafSummary],
            selectedLeafIds: [String],
            enabledTargets: [String],
            targetLeafIdsByTarget: [String: [String]],
            health: String,
            warningCount: Int,
            errorCount: Int,
            updatedAt: String
        ) {
            self.sourceId = sourceId
            self.sourceKind = sourceKind
            self.ownership = ownership
            self.sourceDisplayName = sourceDisplayName
            self.sourceOriginalDisplayName = sourceOriginalDisplayName
            self.sourceLocator = sourceLocator
            self.sourceCanonicalRepo = sourceCanonicalRepo
            self.selectionMode = selectionMode
            self.leafs = leafs
            self.selectedLeafIds = selectedLeafIds
            self.enabledTargets = enabledTargets
            self.targetLeafIdsByTarget = targetLeafIdsByTarget
            self.health = health
            self.warningCount = warningCount
            self.errorCount = errorCount
            self.updatedAt = updatedAt
        }

        func renamed(displayName: String, originalDisplayName: String) -> WorkflowSummary {
            WorkflowSummary(
                sourceId: sourceId,
                sourceKind: sourceKind,
                ownership: ownership,
                sourceDisplayName: displayName,
                sourceOriginalDisplayName: originalDisplayName,
                sourceLocator: sourceLocator,
                sourceCanonicalRepo: sourceCanonicalRepo,
                selectionMode: selectionMode,
                leafs: leafs,
                selectedLeafIds: selectedLeafIds,
                enabledTargets: enabledTargets,
                targetLeafIdsByTarget: targetLeafIdsByTarget,
                health: health,
                warningCount: warningCount,
                errorCount: errorCount,
                updatedAt: updatedAt
            )
        }
    }

    struct LeafSummary: Sendable {
        let id: String
        let sourceId: String?
        let linkName: String
        let name: String
        let description: String
        let sourceTitle: String?
        let metadataWarnings: [String]
    }

    private let bridgeClient: BridgeClient
    private let queryFacade: any DesktopSourceQuerying
    private let commandFacade: any DesktopSourceApplying
    private let mutationCoordinator: DesktopMutationCoordinator
    private weak var delegate: SourceManagementDelegate?

    private var allSummaries: [WorkflowSummary] = []
    private var workingDrafts: [ScopedSourceKey: DraftState] = [:]
    private var detectedTargets: Set<String> = []
    private var saveStateBySourceId: [ScopedSourceKey: SaveState] = [:]
    private var recentlyUpdatedSourceKeys: Set<ScopedSourceKey> = []
    private var renamedSourceDisplayNameOverridesBySourceId: [String: String] = [:]
    private var renamedSourceOriginalDisplayNameOverridesBySourceId: [String: String] = [:]

    @ObservationIgnored private var listRequestTask: Task<BridgeResponse, Error>?
    private var listRequestToken: UInt64 = 0
    private var activeListRequestToken: UInt64?
    @ObservationIgnored private var doctorRequestTask: Task<BridgeResponse, Error>?
    private var doctorRequestToken: UInt64 = 0
    private var activeDoctorRequestToken: UInt64?
    @ObservationIgnored private var inspectRequestTasksBySourceId: [ScopedSourceKey: Task<BridgeResponse, Error>] = [:]
    private var inspectRequestTokensBySourceId: [ScopedSourceKey: UInt64] = [:]
    private var inspectRequestTokenSeed: UInt64 = 0
    @ObservationIgnored private var saveStateResetTasksBySourceId: [ScopedSourceKey: Task<Void, Never>] = [:]
    @ObservationIgnored private var recentlyUpdatedClearTasksBySourceId: [ScopedSourceKey: Task<Void, Never>] = [:]
    @ObservationIgnored var recentlyUpdatedIndicatorDuration: Duration = .seconds(2)

    var sourceIds: [String] {
        allSummaries.map(\.sourceId)
    }

    init(
        bridgeClient: BridgeClient,
        queryFacade: any DesktopSourceQuerying,
        commandFacade: any DesktopSourceApplying,
        mutationCoordinator: DesktopMutationCoordinator,
        delegate: SourceManagementDelegate? = nil
    ) {
        self.bridgeClient = bridgeClient
        self.queryFacade = queryFacade
        self.commandFacade = commandFacade
        self.mutationCoordinator = mutationCoordinator
        self.delegate = delegate
    }

    func setDelegate(_ delegate: SourceManagementDelegate?) {
        self.delegate = delegate
    }

    func summary(for sourceId: String?) -> WorkflowSummary? {
        guard let sourceId = resolveSourceId(sourceId) else {
            return nil
        }
        return allSummaries.first(where: { $0.sourceId == sourceId })
    }

    func summaries() -> [WorkflowSummary] {
        allSummaries
    }

    func draft(for sourceId: String?) -> DraftState? {
        draft(for: sourceId, scope: .global)
    }

    func draft(for sourceId: String?, scope: ProjectScopeSelection) -> DraftState? {
        guard let sourceId = resolveSourceId(sourceId) else {
            return nil
        }
        guard let summary = summary(for: sourceId) else {
            return nil
        }

        let serverDraft = buildInitialDraftFromSummary(summary: summary)
        guard let key = scopedSourceKey(sourceId: sourceId, scope: scope) else {
            return serverDraft
        }
        return workingDrafts[key] ?? serverDraft
    }

    func detectedTargetIds() -> Set<String> {
        detectedTargets
    }

    func saveState(for sourceId: String) -> SaveState {
        saveState(for: sourceId, scope: .global)
    }

    func saveState(for sourceId: String, scope: ProjectScopeSelection) -> SaveState {
        guard let key = scopedSourceKey(sourceId: sourceId, scope: scope) else {
            return SaveState(phase: .idle, detail: nil)
        }
        return saveStateBySourceId[key] ?? SaveState(phase: .idle, detail: nil)
    }

    func isSaving(sourceId: String? = nil) -> Bool {
        saveState(for: resolveSourceId(sourceId) ?? "").phase == .saving
    }

    func isSaving(sourceId: String? = nil, scope: ProjectScopeSelection) -> Bool {
        saveState(for: resolveSourceId(sourceId) ?? "", scope: scope).phase == .saving
    }

    func recentlyUpdatedSourceIds(scope: ProjectScopeSelection) -> Set<String> {
        Set(
            recentlyUpdatedSourceKeys
                .filter { $0.scope == scope }
                .map(\.sourceId)
        )
    }

    func addRecentlyUpdatedSource(sourceId: String, scope: ProjectScopeSelection) {
        guard let key = scopedSourceKey(sourceId: sourceId, scope: scope) else { return }
        recentlyUpdatedSourceKeys.insert(key)
        scheduleRecentlyUpdatedIndicatorClear(for: key)
    }

    func isInspectRequestInFlight(for sourceId: String, scope: ProjectScopeSelection) -> Bool {
        let key = ScopedSourceKey(scope: scope, sourceId: sourceId)
        return inspectRequestTasksBySourceId[key] != nil
    }

    func invalidateInspectState(for sourceId: String) {
        let keys = Set(inspectRequestTasksBySourceId.keys)
            .union(inspectRequestTokensBySourceId.keys)
            .filter { $0.sourceId == sourceId }
        for key in keys {
            inspectRequestTasksBySourceId[key]?.cancel()
            inspectRequestTasksBySourceId.removeValue(forKey: key)
            inspectRequestTokensBySourceId.removeValue(forKey: key)
        }
    }

    func bootstrap() async throws -> [BridgeIssue] {
        let bootstrap = try await queryFacade.bootstrap()
        parseBootstrapData(bootstrap.data?.value)
        return bootstrap.warnings
    }

    @discardableResult
    func applyMutationWorkspace(_ value: Any?) -> Bool {
        guard
            let data = value as? [String: Any],
            let workspace = data["workspace"] as? [String: Any],
            workspace["summaries"] is [[String: Any]]
        else {
            return false
        }
        parseBootstrapData(workspace)
        return true
    }

    @discardableResult
    func applyUpdateWorkspace(_ value: Any?) -> Bool {
        guard
            let data = value as? [String: Any],
            let workspace = data["workspace"] as? [String: Any],
            workspace["summaries"] is [[String: Any]]
        else {
            return false
        }
        parseWorkspaceState(workspace)
        return true
    }

    func refreshList() async throws -> BridgeResponse {
        let response = try await fetchListResponse()
        applyList(response)
        return response
    }

    func refreshListAfterUpdate() async throws -> BridgeResponse {
        let response = try await fetchListResponse()
        applyUpdateList(response)
        return response
    }

    func inspectSource(
        _ sourceId: String,
        scope: ProjectScopeSelection,
        intent: InspectIntent
    ) async throws -> InspectOutcome {
        try await fetchInspectResponse(sourceId: sourceId, scope: scope, intent: intent)
    }

    func runDoctor() async throws -> ([DoctorIssueRow], [BridgeIssue]) {
        let response = try await fetchDoctorResponse()
        let issues = parseDoctorIssues(response.data?.value)
        return (issues, response.warnings)
    }

    func togglePinned(sourceId: String) async throws -> [String] {
        let result = try await mutationCoordinator.togglePinned(sourceId: sourceId)
        return result.pinnedSourceIds
    }

    func renameSource(sourceId: String, displayName: String) async throws -> (sourceId: String, displayName: String, originalDisplayName: String, isResetToOriginal: Bool) {
        let result = try await mutationCoordinator.renameSource(
            sourceId: sourceId,
            displayName: displayName
        )
        return (
            result.sourceId,
            result.displayName,
            result.originalDisplayName,
            result.isResetToOriginal
        )
    }

    func deleteSource(sourceId: String) async throws {
        _ = try await bridgeClient.uninstall(sourceIds: [sourceId])
        removeStateForSource(sourceId)
    }

    func updateSourcesReturningResponse(_ sourceIds: [String]) async throws -> BridgeResponse {
        let response = try await bridgeClient.updateSources(sourceIds)
        registerRecentlyUpdatedSources(from: response.data?.value)
        return response
    }

    func updateSelectedSource(_ sourceId: String) async throws -> BridgeResponse? {
        let result = try await mutationCoordinator.updateSelectedSource(sourceId)
        if case let .submitted(_, response) = result {
            registerRecentlyUpdatedSources(from: response.data?.value)
            return response
        }
        return nil
    }

    func commitDraftChange(
        sourceId: String,
        scope: ProjectScopeSelection,
        nextDraft: DraftState,
        successMessage: PresentationText,
        successStyle: ToastStyle
    ) async throws {
        let normalizedDraft = normalizeDraft(nextDraft)
        let currentDraft = normalizeDraft(draft(for: sourceId, scope: scope) ?? normalizedDraft)
        guard currentDraft != normalizedDraft else {
            return
        }

        let key = ScopedSourceKey(scope: scope, sourceId: sourceId)

        let previousDraft = currentDraft
        workingDrafts[key] = normalizedDraft
        saveStateBySourceId[key] = SaveState(phase: .saving, detail: nil)

        do {
            let response = try await commandFacade.apply(
                sourceId: sourceId,
                scope: scope,
                selectedLeafIds: normalizedDraft.selectedLeafIds,
                enabledTargets: normalizedDraft.enabledTargets
            )
            workingDrafts[key] = normalizedDraft
            saveStateBySourceId[key] = SaveState(phase: .saved, detail: nil)
            applyPostApplyResponse(response, sourceId: sourceId, scope: scope)
            scheduleSaveStateReset(for: key)
            delegate?.showToast(style: successStyle, text: successMessage)
        } catch {
            let firstReason = firstErrorLine(from: error)
            applyProjectScopeStateIfAvailable(from: error)
            workingDrafts[key] = previousDraft
            saveStateBySourceId[key] = SaveState(phase: .failed, detail: firstReason)
            throw error
        }
    }

    func applyRenamedSource(sourceId: String, displayName: String, originalDisplayName: String) {
        renamedSourceDisplayNameOverridesBySourceId[sourceId] = displayName
        renamedSourceOriginalDisplayNameOverridesBySourceId[sourceId] = originalDisplayName
        guard let existing = summary(for: sourceId) else {
            return
        }

        let renamed = existing.renamed(displayName: displayName, originalDisplayName: originalDisplayName)
        if let index = allSummaries.firstIndex(where: { $0.sourceId == sourceId }) {
            allSummaries[index] = renamed
        }
    }

    func pruneStateMaps(allowedSourceIds: Set<String>) {
        workingDrafts = workingDrafts.filter { allowedSourceIds.contains($0.key.sourceId) }
        saveStateBySourceId = saveStateBySourceId.filter { allowedSourceIds.contains($0.key.sourceId) }

        let removedInspectSourceIds = Set(
            inspectRequestTasksBySourceId.keys
                .map(\.sourceId)
                .filter { !allowedSourceIds.contains($0) }
        )
        for sourceId in removedInspectSourceIds {
            invalidateInspectState(for: sourceId)
        }

        let removedRecentlyUpdatedKeys = Set(
            recentlyUpdatedSourceKeys.filter { !allowedSourceIds.contains($0.sourceId) }
        )
        for key in removedRecentlyUpdatedKeys {
            recentlyUpdatedClearTasksBySourceId[key]?.cancel()
        }
        recentlyUpdatedSourceKeys = Set(
            recentlyUpdatedSourceKeys.filter { allowedSourceIds.contains($0.sourceId) }
        )
        recentlyUpdatedClearTasksBySourceId = recentlyUpdatedClearTasksBySourceId.filter { allowedSourceIds.contains($0.key.sourceId) }
    }

    func buildInitialDraftFromSummary(summary: WorkflowSummary) -> DraftState {
        let selectedLeafIds: [String]
        if summary.selectionMode == .all {
            selectedLeafIds = uniqueSorted(summary.leafs.map(\.id))
        } else if summary.selectionMode == .selected {
            selectedLeafIds = uniqueSorted(summary.selectedLeafIds)
        } else {
            if !summary.selectedLeafIds.isEmpty {
                selectedLeafIds = uniqueSorted(summary.selectedLeafIds)
            } else {
                let enabledTargetLeafIds = normalizedTargets(summary.enabledTargets).flatMap { target in
                    summary.targetLeafIdsByTarget[target] ?? []
                }
                selectedLeafIds = uniqueSorted(enabledTargetLeafIds)
            }
        }

        return DraftState(
            selectedLeafIds: selectedLeafIds,
            enabledTargets: normalizedTargets(summary.enabledTargets)
        )
    }

    func ensureProjectDraftsInitializedIfNeeded(for scope: ProjectScopeSelection) -> Bool {
        guard case .project(let projectId) = scope else {
            return false
        }

        var didInitialize = false
        for summary in allSummaries {
            let key = ScopedSourceKey(scope: .project(projectId), sourceId: summary.sourceId)
            guard workingDrafts[key] == nil else {
                continue
            }

            workingDrafts[key] = buildInitialDraftFromSummary(summary: summary)
            saveStateBySourceId[key] = SaveState(phase: .idle, detail: nil)
            didInitialize = true
        }

        return didInitialize
    }

    func deploymentRows(scope: ProjectScopeSelection) -> [DeploymentRow] {
        var rows: [DeploymentRow] = []

        for summary in allSummaries {
            let draft = draft(for: summary.sourceId, scope: scope) ?? buildInitialDraftFromSummary(summary: summary)
            let selectedLeafIds = draft.selectedLeafIds
            let enabledTargets = draft.enabledTargets

            if enabledTargets.isEmpty {
                rows.append(
                    DeploymentRow(
                        id: "noop-\(summary.sourceId)",
                        kind: "noop",
                        skill: "-",
                        target: "-",
                        path: "-",
                        result: "No enabled targets"
                    )
                )
                continue
            }

            for target in enabledTargets {
                if selectedLeafIds.isEmpty {
                    rows.append(
                        DeploymentRow(
                            id: "blocked-\(summary.sourceId)-\(target)",
                            kind: "blocked",
                            skill: "-",
                            target: target,
                            path: "-",
                            result: "No selected skills"
                        )
                    )
                    continue
                }

                for leafId in selectedLeafIds {
                    rows.append(
                        DeploymentRow(
                            id: "\(summary.sourceId)-\(target)-\(leafId)",
                            kind: "update",
                            skill: leafId,
                            target: target,
                            path: "~/.skillflow/<target>/\(leafId)",
                            result: summary.health
                        )
                    )
                }
            }
        }

        return rows
    }

    private func removeStateForSource(_ sourceId: String) {
        invalidateInspectState(for: sourceId)
        workingDrafts = workingDrafts.filter { $0.key.sourceId != sourceId }
        saveStateBySourceId = saveStateBySourceId.filter { $0.key.sourceId != sourceId }
    }

    private func resolveSourceId(_ sourceId: String?) -> String? {
        let resolved = (sourceId)?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let resolved, !resolved.isEmpty else {
            return nil
        }
        return resolved
    }

    private func scopedSourceKey(sourceId: String, scope: ProjectScopeSelection? = nil) -> ScopedSourceKey? {
        guard let sourceId = resolveSourceId(sourceId) else {
            return nil
        }
        return ScopedSourceKey(scope: scope ?? .global, sourceId: sourceId)
    }

    private func normalizeDraft(_ draft: DraftState) -> DraftState {
        DraftState(
            selectedLeafIds: uniqueSorted(draft.selectedLeafIds),
            enabledTargets: normalizedTargets(draft.enabledTargets)
        )
    }

    private func normalizedTargets(_ values: [String]) -> [String] {
        AgentDisplayCatalog.orderedTargetIds(in: values, customAgents: delegate?.customAgentsForSourceManagement() ?? [])
    }

    private func uniqueSorted(_ values: [String]) -> [String] {
        Array(Set(values)).sorted()
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

    private func parseBootstrapData(_ value: Any?) {
        parseWorkspaceState(value)
        guard let data = value as? [String: Any] else { return }
        delegate?.applyProjectScopeState(data)
    }

    private func parseWorkspaceState(_ value: Any?) {
        guard let data = value as? [String: Any] else { return }

        delegate?.applyCachedGroupCardEnrichment(data)
        applyPinnedSourceIds(data)
        applySummaries(parseSummariesPayload(data))
        if let availableTargets = data["availableTargets"] as? [String] {
            detectedTargets.formUnion(availableTargets)
        }

        if let initialDrafts = data["initialDrafts"] as? [String: Any] {
            for (sourceId, rawDraft) in initialDrafts {
                guard let draftObject = rawDraft as? [String: Any] else { continue }
                let key = ScopedSourceKey(scope: .global, sourceId: sourceId)
                guard workingDrafts[key] == nil else { continue }
                let selectedLeafIds = uniqueSorted(draftObject["selectedLeafIds"] as? [String] ?? [])
                let enabledTargets = normalizedTargets(draftObject["enabledTargets"] as? [String] ?? [])
                let draft = DraftState(selectedLeafIds: selectedLeafIds, enabledTargets: enabledTargets)
                workingDrafts[key] = draft
            }
        }

        if let projectDrafts = data["projectDrafts"] as? [String: Any] {
            for (projectId, rawSourceDrafts) in projectDrafts {
                guard let sourceDrafts = rawSourceDrafts as? [String: Any] else { continue }
                for (sourceId, rawDraft) in sourceDrafts {
                    guard let draftObject = rawDraft as? [String: Any] else { continue }
                    let selectedLeafIds = uniqueSorted(draftObject["selectedLeafIds"] as? [String] ?? [])
                    let enabledTargets = normalizedTargets(draftObject["enabledTargets"] as? [String] ?? [])
                    let draft = DraftState(selectedLeafIds: selectedLeafIds, enabledTargets: enabledTargets)
                    workingDrafts[ScopedSourceKey(scope: .project(projectId), sourceId: sourceId)] = draft
                }
            }
        }
    }

    private func applyList(_ response: BridgeResponse) {
        applyListState(response)
        if let data = response.data?.value as? [String: Any] {
            delegate?.applyProjectScopeState(data)
        }
    }

    private func applyUpdateList(_ response: BridgeResponse) {
        applyListState(response)
    }

    private func applyListState(_ response: BridgeResponse) {
        let summaries = parseSummariesPayload(response.data?.value)
        if let data = response.data?.value as? [String: Any] {
            delegate?.applyCachedGroupCardEnrichment(data)
            if let availableTargets = data["availableTargets"] as? [String] {
                detectedTargets = Set(availableTargets)
                for summary in summaries {
                    detectedTargets.formUnion(summary.enabledTargets)
                }
            }
        }
        applyPinnedSourceIds(response.data?.value)
        applySummaries(summaries)
    }

    private func applyPinnedSourceIds(_ value: Any?) {
        guard
            let data = value as? [String: Any],
            let pinnedSourceIds = data["pinnedSourceIds"] as? [String]
        else {
            return
        }

        delegate?.updatePinnedSourceIds(normalizedPinnedSourceIds(pinnedSourceIds))
    }

    private func applySummaries(_ summaries: [WorkflowSummary]) {
        pruneStateMaps(allowedSourceIds: Set(summaries.map(\.sourceId)))
        allSummaries = summaries
        delegate?.updateSourceIds(summaries.map(\.sourceId))

        if let first = summaries.first, delegate?.selectedSourceId == nil || !(summaries.map(\.sourceId).contains(delegate?.selectedSourceId ?? "")) {
            delegate?.selectSource(first.sourceId)
        }

        for summary in summaries {
            let key = ScopedSourceKey(scope: .global, sourceId: summary.sourceId)
            let savePhase = saveStateBySourceId[key]?.phase ?? .idle

            if savePhase == .saving {
                if workingDrafts[key] == nil {
                    workingDrafts[key] = buildInitialDraftFromSummary(summary: summary)
                }
            } else {
                workingDrafts[key] = buildInitialDraftFromSummary(summary: summary)
            }

            detectedTargets.formUnion(summary.enabledTargets)
        }
    }

    private func fetchListResponse() async throws -> BridgeResponse {
        if let existingTask = listRequestTask {
            return try await existingTask.value
        }

        listRequestToken &+= 1
        let token = listRequestToken
        let task = Task { try await queryFacade.list() }
        listRequestTask = task
        activeListRequestToken = token

        do {
            let response = try await task.value
            if activeListRequestToken == token {
                listRequestTask = nil
                activeListRequestToken = nil
            }
            return response
        } catch {
            if activeListRequestToken == token {
                listRequestTask = nil
                activeListRequestToken = nil
            }
            throw error
        }
    }

    private func fetchDoctorResponse() async throws -> BridgeResponse {
        if let existingTask = doctorRequestTask {
            return try await existingTask.value
        }

        doctorRequestToken &+= 1
        let token = doctorRequestToken
        let task = Task { try await bridgeClient.doctor() }
        doctorRequestTask = task
        activeDoctorRequestToken = token

        do {
            let response = try await task.value
            if activeDoctorRequestToken == token {
                doctorRequestTask = nil
                activeDoctorRequestToken = nil
            }
            return response
        } catch {
            if activeDoctorRequestToken == token {
                doctorRequestTask = nil
                activeDoctorRequestToken = nil
            }
            throw error
        }
    }

    private func fetchInspectResponse(
        sourceId: String,
        scope: ProjectScopeSelection,
        intent: InspectIntent
    ) async throws -> InspectOutcome {
        let key = ScopedSourceKey(scope: scope, sourceId: sourceId)
        if intent == .navigation,
           let existingTask = inspectRequestTasksBySourceId[key],
           let token = inspectRequestTokensBySourceId[key] {
            return try await inspectOutcome(for: existingTask, key: key, token: token)
        }

        inspectRequestTokenSeed &+= 1
        let token = inspectRequestTokenSeed
        let task = Task { try await queryFacade.inspect(sourceId: sourceId, scope: key.scope) }
        inspectRequestTasksBySourceId[key] = task
        inspectRequestTokensBySourceId[key] = token

        return try await inspectOutcome(for: task, key: key, token: token)
    }

    private func inspectOutcome(
        for task: Task<BridgeResponse, Error>,
        key: ScopedSourceKey,
        token: UInt64
    ) async throws -> InspectOutcome {
        do {
            let response = try await task.value
            guard inspectRequestTokensBySourceId[key] == token else {
                return .superseded
            }
            inspectRequestTasksBySourceId.removeValue(forKey: key)
            inspectRequestTokensBySourceId.removeValue(forKey: key)
            return .current(response)
        } catch {
            guard inspectRequestTokensBySourceId[key] == token else {
                return .superseded
            }
            inspectRequestTasksBySourceId.removeValue(forKey: key)
            inspectRequestTokensBySourceId.removeValue(forKey: key)
            throw error
        }
    }

    private func applyPostApplyResponse(_ response: BridgeResponse, sourceId: String, scope: ProjectScopeSelection) {
        delegate?.applyWarningsFromApplyResponse(response.warnings)

        guard let data = response.data?.value as? [String: Any] else {
            return
        }

        delegate?.applyProjectScopeState(data)

        if let summaryPayload = data["summary"] as? [String: Any],
           let summary = parseSummaryPayload(summaryPayload) {
            if scope == .global {
                replaceSummary(summary)
            } else {
                let key = ScopedSourceKey(scope: scope, sourceId: sourceId)
                workingDrafts[key] = buildInitialDraftFromSummary(summary: summary)
                saveStateBySourceId[key] = SaveState(phase: .saved, detail: nil)
            }
        }
    }

    private func applyProjectScopeStateIfAvailable(from error: Error) {
        guard let bridgeError = error as? BridgeClientError,
              case .commandFailed(_, let response) = bridgeError,
              let data = response?.data?.value as? [String: Any] else {
            return
        }

        delegate?.applyProjectScopeState(data)
    }

    private func replaceSummary(_ summary: WorkflowSummary) {
        var nextSummaries = allSummaries
        if let existingIndex = nextSummaries.firstIndex(where: { $0.sourceId == summary.sourceId }) {
            nextSummaries[existingIndex] = summary
        } else {
            nextSummaries.append(summary)
        }
        applySummaries(nextSummaries)
    }

    private func scheduleSaveStateReset(for key: ScopedSourceKey) {
        saveStateResetTasksBySourceId[key]?.cancel()
        saveStateResetTasksBySourceId[key] = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            if saveStateBySourceId[key]?.phase == .saved {
                saveStateBySourceId[key] = SaveState(phase: .idle, detail: nil)
            }
            saveStateResetTasksBySourceId.removeValue(forKey: key)
        }
    }

    private func registerRecentlyUpdatedSources(from value: Any?) {
        guard
            let payload = value as? [String: Any],
            let items = payload["updated"] as? [[String: Any]]
        else {
            return
        }

        for item in items {
            guard
                let sourceId = (item["sourceId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                !sourceId.isEmpty,
                item["changed"] as? Bool == true ||
                item["repaired"] as? Bool == true ||
                ((item["addedLeafIds"] as? [String])?.isEmpty == false) ||
                ((item["removedLeafIds"] as? [String])?.isEmpty == false) ||
                ((item["invalidatedLeafIds"] as? [String])?.isEmpty == false),
                let key = scopedSourceKey(sourceId: sourceId, scope: delegate?.currentProjectScopeForSourceManagement() ?? .global)
            else {
                continue
            }

            recentlyUpdatedSourceKeys.insert(key)
            scheduleRecentlyUpdatedIndicatorClear(for: key)
        }
    }

    private func scheduleRecentlyUpdatedIndicatorClear(for key: ScopedSourceKey) {
        recentlyUpdatedClearTasksBySourceId[key]?.cancel()
        let delay = recentlyUpdatedIndicatorDuration
        recentlyUpdatedClearTasksBySourceId[key] = Task { @MainActor in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            recentlyUpdatedSourceKeys.remove(key)
            recentlyUpdatedClearTasksBySourceId.removeValue(forKey: key)
        }
    }

    private func normalizedPinnedSourceIds(_ sourceIds: [String]) -> [String] {
        var seen = Set<String>()
        var normalized: [String] = []

        for sourceId in sourceIds {
            let trimmed = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !seen.contains(trimmed) else {
                continue
            }
            seen.insert(trimmed)
            normalized.append(trimmed)
        }

        return normalized
    }

    private func firstErrorLine(from error: Error) -> String {
        error.localizedDescription
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .first(where: { !$0.isEmpty }) ?? error.localizedDescription
    }

    private func parseSummariesPayload(_ value: Any?) -> [WorkflowSummary] {
        guard
            let data = value as? [String: Any],
            let summaries = data["summaries"] as? [[String: Any]]
        else {
            return []
        }

        return summaries.compactMap { summary in
            guard
                let source = summary["source"] as? [String: Any],
                let rawSourceId = source["id"] as? String
            else {
                return nil
            }
            let sourceId = rawSourceId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !sourceId.isEmpty else {
                return nil
            }

            let kind = source["kind"] as? String ?? "unknown"
            let ownership = source["ownership"] as? String == "external" ? "external" : "managed"
            let rawSourceDisplayName = source["displayName"] as? String
            let rawSourceOriginalDisplayName = source["originalDisplayName"] as? String
            let parsedSourceDisplayName = displaySourceName(
                kind: kind,
                displayName: rawSourceDisplayName,
                originalDisplayName: rawSourceOriginalDisplayName,
                fallback: sourceId
            )
            clearRenameDisplayNameOverrideIfConfirmed(sourceId: sourceId, displayName: rawSourceDisplayName)
            clearRenameOriginalDisplayNameOverrideIfConfirmed(sourceId: sourceId, originalDisplayName: rawSourceOriginalDisplayName)
            let sourceDisplayName = renamedSourceDisplayNameOverridesBySourceId[sourceId] ?? parsedSourceDisplayName
            let sourceOriginalDisplayName = renamedSourceOriginalDisplayNameOverridesBySourceId[sourceId]
                ?? rawSourceOriginalDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
                ?? sourceDisplayName
            let sourceLocator = source["locator"] as? String ?? ""
            let sourceCanonicalRepo = [
                source["canonicalRepo"] as? String,
                source["originLocator"] as? String,
                source["locator"] as? String,
            ].compactMap { ImportRepositoryIdentity.normalizedGitHubRepo($0) }.first
            let selectionMode = (source["selectionMode"] as? String)
                .flatMap(WorkflowSummary.SelectionMode.init(rawValue:))

            let lock = summary["lock"] as? [String: Any]
            let updatedAt = lock?["updatedAt"] as? String ?? "-"

            let leafs: [LeafSummary] = (summary["leafs"] as? [[String: Any]] ?? []).compactMap { leaf in
                guard let leafId = leaf["id"] as? String else {
                    return nil
                }
                return LeafSummary(
                    id: leafId,
                    sourceId: (leaf["sourceId"] as? String)?.nonEmpty,
                    linkName: leaf["linkName"] as? String ?? leafId,
                    name: leaf["name"] as? String ?? leafId,
                    description: leaf["description"] as? String ?? "",
                    sourceTitle: [
                        (leaf["sourceTitle"] as? String)?.nonEmpty,
                        (leaf["sourceLabel"] as? String)?.nonEmpty,
                        (leaf["sourceName"] as? String)?.nonEmpty,
                        (leaf["sourceDisplayName"] as? String)?.nonEmpty,
                    ].compactMap { $0 }.first,
                    metadataWarnings: leaf["metadataWarnings"] as? [String] ?? []
                )
            }

            let bindings = summary["bindings"] as? [String: Any] ?? [:]
            let selectedLeafIds = uniqueSorted(bindings["selectedLeafIds"] as? [String] ?? [])
            let targets = bindings["targets"] as? [String: Any] ?? [:]

            var enabledTargets: [String] = []
            var targetLeafIdsByTarget: [String: [String]] = [:]

            for (targetId, rawBinding) in targets {
                guard let binding = rawBinding as? [String: Any] else { continue }
                let leafIds = uniqueSorted(binding["leafIds"] as? [String] ?? [])
                targetLeafIdsByTarget[targetId] = leafIds
                if (binding["enabled"] as? Bool) == true {
                    enabledTargets.append(targetId)
                }
            }

            let issueCounts = summary["issueCounts"] as? [String: Int] ?? [:]
            let warningCount = issueCounts["warning"] ?? 0
            let errorCount = issueCounts["error"] ?? 0

            return WorkflowSummary(
                sourceId: sourceId,
                sourceKind: kind,
                ownership: ownership,
                sourceDisplayName: sourceDisplayName,
                sourceOriginalDisplayName: sourceOriginalDisplayName,
                sourceLocator: sourceLocator,
                sourceCanonicalRepo: sourceCanonicalRepo,
                selectionMode: selectionMode,
                leafs: leafs,
                selectedLeafIds: selectedLeafIds,
                enabledTargets: normalizedTargets(enabledTargets),
                targetLeafIdsByTarget: targetLeafIdsByTarget,
                health: summary["health"] as? String ?? "UNKNOWN",
                warningCount: warningCount,
                errorCount: errorCount,
                updatedAt: updatedAt
            )
        }
    }

    private func parseSummaryPayload(_ summary: [String: Any]) -> WorkflowSummary? {
        parseSummariesPayload(["summaries": [summary]]).first
    }

    private func displaySourceName(kind: String, displayName: String?, originalDisplayName: String?, fallback: String) -> String {
        let normalizedKind = kind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let trimmedDisplayName = displayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedOriginalDisplayName = originalDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalizedKind == "collection",
           trimmedDisplayName?.lowercased().hasPrefix("collection:") == true,
           let original = trimmedOriginalDisplayName,
           !original.isEmpty,
           !original.lowercased().hasPrefix("collection:") {
            return original
        }
        return trimmedDisplayName?.nonEmpty ?? trimmedOriginalDisplayName?.nonEmpty ?? fallback
    }

    private func clearRenameDisplayNameOverrideIfConfirmed(sourceId: String, displayName: String?) {
        guard let override = renamedSourceDisplayNameOverridesBySourceId[sourceId],
              let displayName = displayName?.trimmingCharacters(in: .whitespacesAndNewlines),
              !displayName.isEmpty,
              displayName == override else {
            return
        }
        renamedSourceDisplayNameOverridesBySourceId.removeValue(forKey: sourceId)
    }

    private func clearRenameOriginalDisplayNameOverrideIfConfirmed(sourceId: String, originalDisplayName: String?) {
        guard let override = renamedSourceOriginalDisplayNameOverridesBySourceId[sourceId],
              let originalDisplayName = originalDisplayName?.trimmingCharacters(in: .whitespacesAndNewlines),
              !originalDisplayName.isEmpty,
              originalDisplayName == override else {
            return
        }
        renamedSourceOriginalDisplayNameOverridesBySourceId.removeValue(forKey: sourceId)
    }

    private func parseDoctorIssues(_ value: Any?) -> [DoctorIssueRow] {
        guard let data = value as? [String: Any] else { return [] }
        guard let issues = data["issues"] as? [[String: Any]] else { return [] }

        return issues.enumerated().map { index, issue in
            let severity = (issue["severity"] as? String) ?? "info"
            let code = (issue["code"] as? String) ?? "UNKNOWN"
            let message = (issue["message"] as? String) ?? "No message"
            let sourceId = (issue["sourceId"] as? String) ?? "-"
            let target = (issue["target"] as? String) ?? "-"

            return DoctorIssueRow(
                id: "\(severity)-\(code)-\(index)",
                severity: severity,
                code: code,
                message: message,
                sourceId: sourceId,
                target: target
            )
        }
    }
}

@MainActor
protocol SourceManagementDelegate: AnyObject {
    func showToast(style: ToastStyle, text: PresentationText)
    func updatePinnedSourceIds(_ ids: [String])
    func updateSourceIds(_ ids: [String])
    func selectSource(_ sourceId: String)
    func applyWarningsFromApplyResponse(_ warnings: [BridgeIssue])
    func applyProjectScopeState(_ data: [String: Any])
    func applyCachedGroupCardEnrichment(_ data: [String: Any])
    func customAgentsForSourceManagement() -> [CustomAgentDefinition]
    func currentProjectScopeForSourceManagement() -> ProjectScopeSelection
    var selectedSourceId: String? { get }
}

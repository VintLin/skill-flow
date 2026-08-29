import Foundation
import Observation
import CryptoKit
import Yams

@MainActor
@Observable
final class MainViewModel: SourceManagementDelegate, ImportLogicDelegate {
    struct ScopedSourceKey: Hashable {
        let scope: ProjectScopeSelection
        let sourceId: String
    }

    private struct ParsedUpdateItem {
        let sourceId: String?
        let changed: Bool
        let addedLeafIds: [String]
        let removedLeafIds: [String]
        let invalidatedLeafIds: [String]

        var hasActualChange: Bool {
            changed
                || !addedLeafIds.isEmpty
                || !removedLeafIds.isEmpty
                || !invalidatedLeafIds.isEmpty
        }

        var summaryBucket: UpdateSummaryBucket {
            if !invalidatedLeafIds.isEmpty {
                return .needsReview
            }
            if changed || !addedLeafIds.isEmpty || !removedLeafIds.isEmpty {
                return .updated
            }
            return .upToDate
        }
    }

    private enum UpdateSummaryBucket {
        case updated
        case upToDate
        case needsReview
    }

    enum Page: Equatable {
        case home
        case importPage
        case usage
        case settings
        case detail(sourceId: String)
    }

    private struct FileTreeNode: Sendable {
        var name: String
        var isFile: Bool
        var children: [String: FileTreeNode]

        init(name: String, isFile: Bool = false, children: [String: FileTreeNode] = [:]) {
            self.name = name
            self.isFile = isFile
            self.children = children
        }
    }

    private struct FileTreeSkillReference: Sendable {
        let skillId: String
        let folderPath: String
        let displayTitle: String
    }

    private struct ParsedDocument: Sendable {
        let frontMatter: SkillFrontMatter?
        let metadata: [MetadataEntry]
        let body: String
    }

    private struct SkillFrontMatter: Decodable, Sendable {
        let name: String?
        let description: String?
        let version: String?
        let enabled: Bool?
    }

    private let stateManager: AppStateManager
    private let taskCoordinator: TaskCoordinator
    private let sourceManagement: SourceManagement
    private let importLogic: ImportLogic
    private let settingsStore: DesktopSettingsStore
    @ObservationIgnored private lazy var detailLogic = DetailLogic(
        detailEnrichmentQuery: detailEnrichmentQuery,
        warningsSink: { [weak self] warnings in self?.stateManager.setLatestWarnings(warnings) }
    )
    private let collectionLogic: CollectionLogic
    let bridgeClient: BridgeClient
    private let detailEnrichmentQuery: any DesktopDetailEnrichmentQuerying
    private let usageQuery: any DesktopUsageQuerying

    @ObservationIgnored weak var routeState: DesktopAppState?

    nonisolated private static var presentationLocale: Locale {
        let rawValue = UserDefaults.standard.string(forKey: DesktopLanguage.storageKey)
        if rawValue == nil, ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil {
            return DesktopLanguage.en.locale
        }
        return DesktopLanguage(storageValue: rawValue ?? DesktopLanguage.system.rawValue).locale
    }

    @MainActor static var currentDateProvider: () -> Date = Date.init

    private static var targetOrder: [String] { AgentDisplayCatalog.defaultTargetOrder }
    private static var defaultRecentlyUpdatedIndicatorDuration: Duration { .seconds(2) }

    private let legacyPinnedSourceIdsKey = "desktop.pinnedSourceIds"
    private let pinnedSourceIdsMigrationKey = "desktop.pinnedSourceIds.migratedToRuntimePreferences"
    private var detectedTargets: Set<String> = []
    var inspectedPayloadBySourceId: [ScopedSourceKey: [String: Any]] = [:]
    private var detailEnrichmentPayloadBySourceId: [String: [String: Any]] = [:]
    var usageSnapshot: UsageSnapshotViewData?
    var usageLoadState: LoadState = .idle
    var renamedSourceDisplayNameOverridesBySourceId: [String: String] = [:]
    var renamedSourceOriginalDisplayNameOverridesBySourceId: [String: String] = [:]
    private var projectScopeChangeToken: UInt64 = 0
    private var cachedSelectedProjectScope: ProjectScopeSelection = .global
    private var cachedRecentProjectScopes: [RecentProjectScopeItem] = []

    private let groupOperations = GroupOperationCoordinator()
    /// Published mirrors of the coordinator (single writer: GroupOperationCoordinator).
    private(set) var updateOperationPhases: [String: GroupOperationQueue.Phase] = [:]
    private(set) var importOperationPhases: [String: GroupOperationQueue.Phase] = [:]

    var hasActiveProtectedOperation: Bool {
        groupOperations.activeProtectedOperation != nil
    }

    func shutdownProtectedOperationsForTermination() {
        groupOperations.shutdownForTermination()
    }

    func resumeProtectedOperationsAfterRecovery() {
        groupOperations.resumeAfterRecovery()
    }

    var loadState: LoadState { stateManager.loadState }
    var selectedSection: Section { stateManager.selectedSection }
    var sourceIds: [String] {
        get { stateManager.sourceIds }
        set { stateManager.sourceIds = newValue }
    }
    var selectedSourceId: String? {
        get { stateManager.selectedSourceId }
        set { stateManager.selectedSourceId = newValue }
    }
    var searchQuery: String {
        get { stateManager.searchQuery }
        set { stateManager.searchQuery = newValue }
    }
    var importSubmittedQuery: String {
        get { importLogic.importSubmittedQuery }
        set { importLogic.importSubmittedQuery = newValue }
    }
    var importSearchPhase: ImportLoadPhase {
        get { importLogic.importSearchPhase }
        set { importLogic.importSearchPhase = newValue }
    }
    var importPageMode: ImportPageMode {
        get { importLogic.importPageMode }
        set { importLogic.importPageMode = newValue }
    }
    var recommendedImportGroups: [ImportGroupItem] {
        get { importLogic.recommendedImportGroups }
        set { importLogic.recommendedImportGroups = newValue }
    }
    var localImportGroups: [ImportGroupItem] {
        get { importLogic.localImportGroups }
        set { importLogic.localImportGroups = newValue }
    }
    var localImportScanPhase: ImportLoadPhase { importLogic.localImportScanPhase }
    var searchImportGroups: [ImportGroupItem] {
        get { importLogic.searchImportGroups }
        set { importLogic.searchImportGroups = newValue }
    }
    var importingImportGroupId: String? {
        get { groupOperations.importingImportGroupId }
        set { groupOperations.testing_seedImportRunning(newValue) }
    }
    var healthStatus: HealthStatus { stateManager.healthStatus }
    var latestWarnings: [BridgeIssue] {
        get { stateManager.latestWarnings }
        set { stateManager.setLatestWarnings(newValue) }
    }
    var latestWarningPresentations: [DesktopWarningPresentation] { stateManager.latestWarningPresentations }
    var inspectorVisible: Bool { stateManager.inspectorVisible }
    var compactSidebarVisible: Bool { stateManager.compactSidebarVisible }
    var isRefreshing: Bool { stateManager.isRefreshing }
    var updatingSourceIds: Set<String> { stateManager.updatingSourceIds }
    var toast: ToastState? {
        get { stateManager.toast }
        set { stateManager.toast = newValue }
    }
    var pendingDetailRename: PendingDetailRename? {
        get { stateManager.pendingDetailRename }
        set { stateManager.pendingDetailRename = newValue }
    }
    var doctorIssues: [DoctorIssueRow] { stateManager.doctorIssues }
    var lastDoctorError: String? { stateManager.lastDoctorError }
    var deploymentFilterTarget: String { stateManager.deploymentFilterTarget }
    var deploymentFilterKind: String { stateManager.deploymentFilterKind }
    var pinnedSourceIds: [String] { stateManager.pinnedSourceIds }
    @ObservationIgnored var detailWarmupDelay: Duration {
        get { detailLogic.detailWarmupDelay }
        set { detailLogic.detailWarmupDelay = newValue }
    }
    @ObservationIgnored var recentlyUpdatedIndicatorDuration: Duration {
        get { sourceManagement.recentlyUpdatedIndicatorDuration }
        set { sourceManagement.recentlyUpdatedIndicatorDuration = newValue }
    }

    init(
        bridgeClient: BridgeClient,
        queryFacade: (any DesktopQueryTransporting)? = nil,
        commandFacade: (any DesktopCommandTransporting)? = nil,
        mutationCoordinator: DesktopMutationCoordinator? = nil,
        settingsStore: DesktopSettingsStore = DesktopSettingsStore(),
        recommendationsProvider: @escaping () -> [ImportRecommendationEntry] = { ImportRecommendationLoader.load() }
    ) {
        let resolvedQueryFacade = queryFacade ?? DesktopBridgeQueryFacade(bridgeClient: bridgeClient)
        let resolvedCommandFacade = commandFacade ?? DesktopBridgeCommandFacade(bridgeClient: bridgeClient)
        let resolvedMutationCoordinator = mutationCoordinator ?? DesktopMutationCoordinator(commandFacade: resolvedCommandFacade)

        self.stateManager = AppStateManager()
        self.taskCoordinator = TaskCoordinator()
        self.bridgeClient = bridgeClient
        self.detailEnrichmentQuery = resolvedQueryFacade
        self.usageQuery = resolvedQueryFacade
        self.settingsStore = settingsStore
        self.sourceManagement = SourceManagement(
            bridgeClient: bridgeClient,
            queryFacade: resolvedQueryFacade,
            commandFacade: resolvedCommandFacade,
            mutationCoordinator: resolvedMutationCoordinator,
            delegate: nil
        )
        self.importLogic = ImportLogic(
            queryFacade: resolvedQueryFacade,
            commandFacade: resolvedCommandFacade,
            recommendationsProvider: recommendationsProvider,
            delegate: nil
        )
        self.collectionLogic = CollectionLogic(commandFacade: resolvedCommandFacade)

        sourceManagement.setDelegate(self)
        importLogic.setDelegate(self)

        collectionLogic.onRefreshList = { [weak self] in await self?.refreshList() }
        collectionLogic.onShowToast = { [weak self] style, message in self?.stateManager.showToast(style: style, message: message) }
        collectionLogic.onShowBridgeCommandFailure = { [weak self] response in self?.showBridgeCommandFailure(response) }
        collectionLogic.groupCardsProvider = { [weak self] in self?.groupCards ?? [] }

        groupOperations.bind(
            GroupOperationCoordinator.Hosts(
                isSourcePresent: { [weak self] sourceId in
                    guard let self else { return false }
                    return self.sourceIds.contains(sourceId) || self.sourceManagement.summary(for: sourceId) != nil
                },
                isImportInstalledLocally: { [weak self] groupId in
                    self?.importLogic.isImportGroupInstalledLocally(groupId) == true
                },
                prepareImport: { [weak self] groupId, request in
                    await self?.importLogic.prepareImportGroupIfNeeded(
                        groupId: groupId,
                        locator: request.locator
                    )
                },
                performUpdate: { [weak self] sourceId in
                    await self?.performQueuedUpdate(sourceId: sourceId)
                },
                performBulkUpdate: { [weak self] sourceIds in
                    await self?.performQueuedBulkUpdate(sourceIds: sourceIds)
                },
                performImport: { [weak self] groupId, request in
                    await self?.importLogic.importImportGroup(
                        groupId: groupId,
                        locator: request.locator,
                        selectedSkills: request.selectedSkills,
                        skillSelectionMode: request.skillSelectionMode,
                        enabledTargets: request.enabledTargets
                    )
                },
                onAlreadyQueued: { [weak self] in
                    self?.showOperationAlreadyQueuedToast()
                },
                onSkippedMissing: { [weak self] in
                    self?.showToast(style: .neutral, text: self?.localizedText("toast.operation.skipped.missing_group") ?? .plain(""))
                },
                onImportAlreadyExists: { [weak self] in
                    self?.showImportAlreadyExistsToast()
                },
                onPhasesChange: { [weak self] updatePhases, importPhases in
                    guard let self else { return }
                    self.updateOperationPhases = updatePhases
                    self.importOperationPhases = importPhases
                    self.stateManager.setUpdatingSourceIds(Set(updatePhases.keys))
                }
            )
        )
    }

    func showToast(style: ToastStyle, text: PresentationText) {
        stateManager.showToast(style: style, text: text)
    }

    func showImportInProgressToast() {
        showToast(style: .neutral, text: localizedText("toast.import.in_progress"))
    }

    func showImportAnotherRunningToast() {
        showToast(style: .neutral, text: localizedText("toast.operation.already_queued"))
    }

    func showOperationAlreadyQueuedToast() {
        showToast(style: .neutral, text: localizedText("toast.operation.already_queued"))
    }

    func showImportAlreadyExistsToast() {
        showToast(style: .neutral, text: localizedText("toast.import.exists"))
    }

    func showImportLocalVariantRequiredToast() {
        showToast(style: .neutral, text: localizedText("toast.import.choose_local_variant"))
    }

    func showImportPreparationInProgressToast() {
        showToast(style: .neutral, text: localizedText("toast.import.preparing"))
    }

    func showImportLocalSourceTargetLockedToast(targetId: String) {
        showToast(style: .neutral, text: localizedText("toast.import.local_source_target_locked", importTargetLabel(for: targetId)))
    }

    func presentToast(style: ToastStyle = .neutral, message: String) {
        stateManager.presentToast(style: style, message: message)
    }

    func dismissToast(id: ToastState.ID? = nil) {
        stateManager.dismissToast(id: id)
    }

    func updatePinnedSourceIds(_ ids: [String]) {
        stateManager.setPinnedSourceIds(ids)
    }

    func updateSourceIds(_ ids: [String]) {
        stateManager.sourceIds = ids
        importLogic.updateAllSummaries(sourceManagement.summaries())
    }

    func selectSource(_ sourceId: String) {
        stateManager.selectSource(sourceId)
    }

    var availableGroups: [String] {
        sourceIds
    }

    var selectedGroupId: String? {
        selectedSourceId
    }

    var selectedGroupSourceIds: [String] {
        guard let groupId = selectedGroupId,
              let summary = sourceManagement.summary(for: groupId) else {
            return []
        }
        if summary.sourceKind == "clawhub" {
            return sourceManagement.summaries()
                .filter { $0.sourceKind == "clawhub" }
                .map(\.sourceId)
        }
        let leafSourceIds = summary.leafs.compactMap { $0.sourceId }
        return leafSourceIds.isEmpty ? [groupId] : Array(Set(leafSourceIds)).sorted()
    }

    func collectionMemberSourceIds(for sourceId: String) -> [String] {
        guard let summary = sourceManagement.summary(for: sourceId),
              Self.isCollectionSourceKind(summary.sourceKind) else {
            return []
        }
        var memberSourceIds: [String] = []
        var seen = Set<String>()
        for leafSourceId in summary.leafs.compactMap(\.sourceId) {
            let trimmed = leafSourceId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, seen.insert(trimmed).inserted else {
                continue
            }
            memberSourceIds.append(trimmed)
        }
        return memberSourceIds
    }

    var currentRoute: DesktopRoute {
        routeState?.view.currentRoute ?? .home
    }

    var recentlyUpdatedSourceIds: Set<String> {
        sourceManagement.recentlyUpdatedSourceIds(scope: currentProjectScope())
    }

    var selectedHomeAgentFilterId: String? {
        get { routeState?.view.selectedHomeAgentFilterId }
        set { routeState?.view.selectedHomeAgentFilterId = newValue }
    }

    var selectedHomeStatusFilterId: String {
        get { routeState?.view.selectedHomeStatusFilterId ?? "all" }
        set { routeState?.view.selectedHomeStatusFilterId = newValue }
    }

    var selectedHomeSourceTypeFilterId: String {
        get { routeState?.view.selectedHomeSourceTypeFilterId ?? "all" }
        set { routeState?.view.selectedHomeSourceTypeFilterId = newValue }
    }

    var isUpdatingCurrentGroup: Bool {
        guard let selectedSourceId else { return false }
        return isUpdatingSource(selectedSourceId)
    }

    var visibleTargets: [TargetOption] {
        let targetIds = visibleTargetIds()
        return targetIds.map { target in
            TargetOption(id: target, label: AgentDisplayCatalog.label(for: target, customAgents: routeState?.settings.customAgents ?? []))
        }
    }

    var importPageTargetIds: [String] {
        let customTargetIds = Set((routeState?.settings.customAgents ?? []).map(\.id))
        return AgentDisplayCatalog.normalize(
            routeState?.settings.agentDisplayPreferences ?? [],
            customAgents: routeState?.settings.customAgents ?? []
        )
        .filter { $0.isVisible && (detectedTargets.contains($0.targetId) || customTargetIds.contains($0.targetId)) }
        .map(\.targetId)
    }

    func importTargetLabel(for targetId: String) -> String {
        AgentDisplayCatalog.label(for: targetId, customAgents: routeState?.settings.customAgents ?? [])
    }

    var homeAgentFilterOptions: [HomeAgentFilterOption] {
        let cards = groupCards
        let enabledGroupCountsByTargetId = Dictionary(
            grouping: cards.flatMap { card in
                card.targets.filter(\.isEnabled).map { target in (target.id, card.id) }
            },
            by: { $0.0 }
        ).mapValues { entries in Set(entries.map(\.1)).count }

        return visibleTargetIds().map { targetId in
            HomeAgentFilterOption(
                id: targetId,
                label: AgentDisplayCatalog.label(for: targetId, customAgents: routeState?.settings.customAgents ?? []),
                enabledGroupCount: enabledGroupCountsByTargetId[targetId] ?? 0
            )
        }
    }

    var homeStatusFilterOptions: [HomeSidebarFilterOption] {
        let cards = groupCards
        return [
            HomeSidebarFilterOption(id: "all", count: cards.count),
            HomeSidebarFilterOption(id: "pinned", count: cards.filter(\.isPinned).count),
        ]
    }

    var homeSourceTypeFilterOptions: [HomeSidebarFilterOption] {
        let cards = groupCards
        return [
            HomeSidebarFilterOption(id: "all", count: cards.count),
            HomeSidebarFilterOption(id: "local", count: cards.filter(Self.isLocalHomeSource).count),
            HomeSidebarFilterOption(id: "remote", count: cards.filter(Self.isRemoteHomeSource).count),
            HomeSidebarFilterOption(id: "collection", count: cards.filter(Self.isCollectionHomeSource).count),
        ]
    }

    var effectiveSelectedHomeAgentFilterId: String? {
        guard let selectedHomeAgentFilterId else { return nil }
        let optionIds = Set(homeAgentFilterOptions.map(\.id))
        return optionIds.contains(selectedHomeAgentFilterId) ? selectedHomeAgentFilterId : nil
    }

    var detectedTargetIdsForSettings: [String] {
        AgentDisplayCatalog.orderedTargetIds(in: detectedTargets, customAgents: routeState?.settings.customAgents ?? [])
    }

    var sourceRows: [SourceRow] {
        sourceRows(matching: searchQuery)
    }

    func sourceRows(matching rawQuery: String) -> [SourceRow] {
        let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let summaries = query.isEmpty
            ? sourceManagement.summaries()
            : sourceManagement.summaries().filter { summary in
                summary.sourceId.lowercased().contains(query)
                    || summary.sourceDisplayName.lowercased().contains(query)
                    || summary.sourceLocator.lowercased().contains(query)
                    || summary.sourceKind.lowercased().contains(query)
                    || summary.health.lowercased().contains(query)
                    || summary.leafs.contains(where: { leaf in
                        leaf.name.lowercased().contains(query)
                            || leaf.linkName.lowercased().contains(query)
                    })
            }
        let rows = summaries.map { summary in
            SourceRow(
                id: summary.sourceId,
                displayName: summary.sourceDisplayName,
                locator: summary.sourceLocator,
                kind: summary.sourceKind,
                status: summary.health,
                lastUpdate: summary.updatedAt,
                warningCount: summary.warningCount,
                errorCount: summary.errorCount
            )
        }
        return sortedSourceRows(rows)
    }

    var groupCards: [GroupCardModel] {
        groupCards(matching: searchQuery)
    }

    var collectionSourceOptions: [CollectionSourceOption] {
        groupCards.map { collectionLogic.collectionSourceOption(for: $0) }
    }

    func collectionSkillOptions(for sourceId: String) -> [CollectionSkillOption] {
        collectionLogic.collectionSkillOptions(for: sourceId)
    }

    func collectionEditorOptions() -> CollectionEditorOptions {
        collectionLogic.collectionEditorOptions()
    }

    func validateCollectionCreate(displayName: String, selectedSkills: [CollectionSkillRef]) -> CollectionValidationResult {
        collectionLogic.validateCollectionCreate(displayName: displayName, selectedSkills: selectedSkills)
    }

    func validateCollectionMerge(displayName: String, sourceIds: [String]) -> CollectionValidationResult {
        collectionLogic.validateCollectionMerge(displayName: displayName, sourceIds: sourceIds)
    }

    func setSelectedHomeAgentFilter(_ targetId: String?) {
        selectedHomeAgentFilterId = targetId
    }

    func setSelectedHomeStatusFilter(_ filterId: String) {
        selectedHomeStatusFilterId = ["all", "pinned"].contains(filterId) ? filterId : "all"
    }

    func setSelectedHomeSourceTypeFilter(_ filterId: String) {
        selectedHomeSourceTypeFilterId = ["all", "local", "remote", "collection"].contains(filterId) ? filterId : "all"
    }

    func reconcileHomeAgentFilter() {
        guard selectedHomeAgentFilterId != nil else { return }
        if effectiveSelectedHomeAgentFilterId == nil {
            self.selectedHomeAgentFilterId = nil
        }
    }

    func filteredHomeGroupCards(locale: Locale) -> [GroupCardModel] {
        _ = locale
        return groupCards.filter { matchesHomeSidebarFilters($0) }
    }

    func matchesHomeSidebarFilters(_ card: GroupCardModel) -> Bool {
        if selectedHomeStatusFilterId == "pinned", !card.isPinned { return false }
        if selectedHomeSourceTypeFilterId == "local", !Self.isLocalHomeSource(card) { return false }
        if selectedHomeSourceTypeFilterId == "remote", !Self.isRemoteHomeSource(card) { return false }
        if selectedHomeSourceTypeFilterId == "collection", !Self.isCollectionHomeSource(card) { return false }
        guard let selectedHomeAgentFilterId = effectiveSelectedHomeAgentFilterId else { return true }
        return card.targets.contains { $0.id == selectedHomeAgentFilterId && $0.isEnabled }
    }

    static func isLocalHomeSource(_ card: GroupCardModel) -> Bool { homeSourceType(for: card) == "local" }
    static func isRemoteHomeSource(_ card: GroupCardModel) -> Bool { homeSourceType(for: card) == "remote" }
    static func isCollectionHomeSource(_ card: GroupCardModel) -> Bool { homeSourceType(for: card) == "collection" }

    static func isCollectionSourceKind(_ value: String) -> Bool {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "collection"
    }

    private static func homeSourceType(for card: GroupCardModel) -> String {
        let kind = card.sourceKind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let locator = card.sourceLocator.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if kind == "collection" { return "collection" }
        if kind == "local" { return "local" }
        if ["git", "clawhub"].contains(kind) { return "remote" }
        if locator.hasPrefix("~/") || locator.hasPrefix("/") || locator.hasPrefix("file://") { return "local" }
        if locator.hasPrefix("http://") || locator.hasPrefix("https://") || locator.hasPrefix("git@") || locator.contains("github.com") || locator.contains("gitlab.com") { return "remote" }
        return "remote"
    }

    func groupCards(matching rawQuery: String) -> [GroupCardModel] {
        let normalizedQuery = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        let queryKey = normalizedQuery.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
        return sourceRows(matching: rawQuery).compactMap { row -> GroupCardModel? in
            guard let summary = sourceManagement.summary(for: row.id), let draft = draft(for: row.id) else { return nil }

            let enabledLeafIds = Set(draft.selectedLeafIds)
            let enabledTargets = Set(draft.enabledTargets)
            let isExternal = summary.ownership == "external"
            let metadata = groupCardMetadata(sourceId: row.id, summary: summary, row: row)
            let payload = detailEnrichmentPayloadBySourceId[row.id] ?? [:]
            let cachedGroupPath = (payload["groupPath"] as? String)?.nonEmpty
            let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
            let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
            let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []
            let groupPath = cachedGroupPath ?? preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads)
            let sourceTitlesById = Dictionary(uniqueKeysWithValues: sourceManagement.summaries().map { ($0.sourceId, $0.sourceDisplayName) })
            let showsSkillSourceTitles = row.kind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "collection"

            return GroupCardModel(
                id: row.id,
                title: row.displayName,
                showsRecentlyUpdatedIndicator: recentlyUpdatedSourceIds.contains(row.id),
                originalDisplayName: summary.sourceOriginalDisplayName,
                byline: metadata.byline,
                headerMetaLine: isExternal ? "Externally managed · target projection unavailable" : nil,
                groupPath: groupPath,
                sourceKind: row.kind,
                sourceLocator: row.locator,
                isPinned: pinnedSourceIds.contains(row.id),
                health: row.status,
                warningCount: row.warningCount,
                errorCount: row.errorCount,
                skillSelection: skillSelectionState(sourceId: row.id),
                targetSelection: isExternal ? .empty : targetSelectionState(sourceId: row.id),
                stats: metadata.stats,
                skillsLoading: false,
                targetsLoading: false,
                skills: sortedGroupCardSkills(summary.leafs.map { leaf in
                    let nameKey = leaf.name.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
                    let linkNameKey = leaf.linkName.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
                    let matchesQuery = !queryKey.isEmpty && (
                        nameKey.contains(queryKey) || linkNameKey.contains(queryKey)
                    )
                    return GroupCardSkill(
                        id: leaf.id,
                        label: leaf.name,
                        description: leaf.description,
                        isEnabled: enabledLeafIds.contains(leaf.id),
                        sourceTitle: showsSkillSourceTitles
                            ? leaf.sourceTitle ?? leaf.sourceId.flatMap { sourceId in
                                sourceId == summary.sourceId ? nil : sourceTitlesById[sourceId]
                            }
                            : nil,
                        highlightQuery: matchesQuery ? normalizedQuery : nil
                    )
                }),
                targets: isExternal ? [] : visibleTargetIds().map { targetId in
                    GroupCardTarget(
                        id: targetId,
                        label: AgentDisplayCatalog.label(for: targetId, customAgents: routeState?.settings.customAgents ?? []),
                        shortLabel: AgentDisplayCatalog.shortLabel(for: targetId, customAgents: routeState?.settings.customAgents ?? []),
                        isEnabled: enabledTargets.contains(targetId)
                    )
                },
                saveState: saveState(for: row.id)
            )
        }
    }

    func sourceCanonicalRepo(for sourceId: String) -> String? {
        sourceManagement.summary(for: sourceId)?.sourceCanonicalRepo
    }

    func summary(for sourceId: String?) -> SourceManagement.WorkflowSummary? {
        sourceManagement.summary(for: sourceId)
    }

    func draft(for sourceId: String?) -> SourceManagement.DraftState? {
        sourceManagement.draft(for: sourceId, scope: currentProjectScope())
    }

    private func detailInput(for sourceId: String) -> DetailLogic.DetailInput? {
        guard let summary = summary(for: sourceId), let draft = draft(for: sourceId) else {
            return nil
        }

        let payload = scopedSourceKey(sourceId: sourceId).flatMap { inspectedPayloadBySourceId[$0] } ?? [:]
        let sourcePayload = payload["source"] as? [String: Any] ?? [:]
        let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
        let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []
        let locator = (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator
        let updatedAt = (lockPayload["updatedAt"] as? String)?.nonEmpty ?? summary.updatedAt

        return DetailLogic.DetailInput(
            summary: summary,
            draft: draft,
            inspectedPayload: payload,
            groupStats: groupCardMetadata(
                sourceId: sourceId,
                summary: summary,
                row: SourceRow(
                    id: summary.sourceId,
                    displayName: summary.sourceDisplayName,
                    locator: summary.sourceLocator,
                    kind: summary.sourceKind,
                    status: summary.health,
                    lastUpdate: summary.updatedAt,
                    warningCount: summary.warningCount,
                    errorCount: summary.errorCount
                )
            ).stats,
            visibleTargetIds: visibleTargetIds(),
            customAgents: routeState?.settings.customAgents ?? [],
            projectPath: currentProjectPath(),
            saveState: saveState(for: sourceId),
            skillSelection: skillSelectionState(sourceId: sourceId),
            targetSelection: targetSelectionState(sourceId: sourceId),
            projectedNamesByLeafId: projectionNameMap(for: sourceId),
            fallbackGroupPath: preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads),
            gitHubRepoContext: gitHubRepoContext(locator: locator, lockPayload: lockPayload),
            updatedRelative: relativeUpdateLabel(updatedAt)
        )
    }

    func sourceLocator(for sourceId: String) -> String? {
        sourceManagement.summary(for: sourceId)?.sourceLocator
    }

    func prefetchHomeGroupCardMetadataIfNeeded(_ sourceIds: [String]) async {
        guard currentRoute == .home else { return }
        for sourceId in sourceIds {
            guard currentRoute == .home else { return }
            guard detailEnrichmentPayloadBySourceId[sourceId] == nil else { continue }
            scheduleDetailEnrichmentFetch(sourceId: sourceId)
        }
    }

    func togglePinned(sourceId: String) async {
        let previousPinnedSourceIds = pinnedSourceIds
        stateManager.togglePinnedSourceId(sourceId)
        do {
            let result = try await sourceManagement.togglePinned(sourceId: sourceId)
            stateManager.setPinnedSourceIds(result)
        } catch {
            stateManager.setPinnedSourceIds(previousPinnedSourceIds)
            showOperationFailureToast(fallbackKey: "toast.pin.failed", fallbackArgument: firstErrorLine(from: error), error: error)
        }
    }

    func renameSource(sourceId: String, displayName: String) async {
        let normalizedSourceId = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        let requestedDisplayName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedSourceId.isEmpty else {
            showToast(style: .error, text: localizedText("toast.rename.empty"))
            return
        }

        do {
            let result = try await sourceManagement.renameSource(sourceId: normalizedSourceId, displayName: requestedDisplayName)
            sourceManagement.applyRenamedSource(
                sourceId: result.sourceId,
                displayName: result.displayName,
                originalDisplayName: result.originalDisplayName
            )
            renamedSourceDisplayNameOverridesBySourceId[result.sourceId] = result.displayName
            renamedSourceOriginalDisplayNameOverridesBySourceId[result.sourceId] = result.originalDisplayName
            updateCachedDetailDisplayName(
                sourceId: result.sourceId,
                displayName: result.displayName,
                originalDisplayName: result.originalDisplayName
            )
            scheduleDetailEnrichmentFetch(sourceId: result.sourceId, force: true)
            if let input = detailInput(for: result.sourceId) {
                detailLogic.scheduleDetailEnrichmentFetch(input: input)
            }
            let toastKey = result.isResetToOriginal ? "toast.rename.reset_success" : "toast.rename.success"
            showToast(style: .success, text: localizedText(toastKey, result.displayName))
        } catch {
            showOperationFailureToast(fallbackKey: "toast.rename.failed", fallbackArgument: firstErrorLine(from: error), error: error)
        }
    }

    func createCollection(displayName: String, skills: [CollectionSkillRef], enabledTargets: [String]) async {
        await collectionLogic.createCollection(displayName: displayName, skills: skills, enabledTargets: enabledTargets)
    }

    func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async {
        await collectionLogic.mergeGroups(displayName: displayName, sourceIds: sourceIds, enabledTargets: enabledTargets)
    }

    func restoreCollectionSources(collectionId: String) async {
        await collectionLogic.restoreCollectionSources(collectionId: collectionId)
    }

    var deploymentSummary: DeploymentSummary {
        let rows = deploymentRows()
        guard !rows.isEmpty else { return .empty }
        var create = 0, update = 0, remove = 0, blocked = 0, noop = 0
        for row in rows {
            switch row.kind {
            case "create": create += 1
            case "remove": remove += 1
            case "blocked": blocked += 1
            case "noop": noop += 1
            default: update += 1
            }
        }
        return DeploymentSummary(create: create, update: update, remove: remove, blocked: blocked, noop: noop)
    }

    var deploymentTargets: [String] {
        let targets = Set(deploymentRows().map(\.target))
        return ["All"] + targets.sorted()
    }

    var deploymentKinds: [String] { ["All", "create", "update", "remove", "blocked", "noop"] }

    var filteredDeploymentRows: [DeploymentRow] {
        deploymentRows().filter { row in
            (deploymentFilterTarget == "All" || row.target == deploymentFilterTarget) &&
            (deploymentFilterKind == "All" || row.kind == deploymentFilterKind)
        }
    }

    private func deploymentRows() -> [DeploymentRow] {
        sourceManagement.deploymentRows(scope: currentProjectScope()).map { row in
            guard row.target != "-", row.target != "All" else { return row }
            return DeploymentRow(
                id: row.id,
                kind: row.kind,
                skill: row.skill,
                target: AgentDisplayCatalog.label(for: row.target, customAgents: routeState?.settings.customAgents ?? []),
                path: row.path,
                result: row.result
            )
        }
    }

    var overviewState: PageViewState {
        switch loadState {
        case .loading: return .loading
        case .failed(let message): return .error(message)
        case .idle: return .loading
        case .ready:
            if sourceRows.isEmpty { return .empty }
            if !latestWarnings.isEmpty { return .partial }
            return .success
        }
    }

    var sourcesState: PageViewState {
        switch loadState {
        case .loading: return .loading
        case .failed(let message): return .error(message)
        case .idle: return .loading
        case .ready:
            if sourceRows.isEmpty { return .empty }
            if sourceRows.contains(where: { $0.warningCount > 0 || $0.errorCount > 0 }) { return .partial }
            return .success
        }
    }

    var deploymentsState: PageViewState {
        switch loadState {
        case .loading: return .loading
        case .failed(let message): return .error(message)
        case .idle: return .loading
        case .ready:
            if filteredDeploymentRows.isEmpty { return .empty }
            if filteredDeploymentRows.contains(where: { $0.kind == "blocked" }) { return .partial }
            return .success
        }
    }

    var doctorState: PageViewState {
        if let lastDoctorError { return .error(lastDoctorError) }
        if doctorIssues.isEmpty { return .empty }
        if doctorIssues.contains(where: { $0.severity == "error" || $0.severity == "warning" }) { return .partial }
        return .success
    }

    var groupedDoctorIssues: [(String, [DoctorIssueRow])] {
        let groups = Dictionary(grouping: doctorIssues, by: \.severity)
        return ["error", "warning", "info"].compactMap { severity in
            guard let issues = groups[severity], !issues.isEmpty else { return nil }
            return (severity, issues)
        }
    }

    var currentSaveState: SaveState {
        guard let groupId = selectedGroupId else { return SaveState(phase: .idle, detail: nil) }
        return sourceManagement.saveState(for: groupId, scope: currentProjectScope())
    }

    func saveState(for sourceId: String) -> SaveState {
        sourceManagement.saveState(for: sourceId, scope: currentProjectScope())
    }

    func isSaving(sourceId: String? = nil) -> Bool {
        sourceManagement.isSaving(sourceId: sourceId, scope: currentProjectScope())
    }

    func skillSelectionState(sourceId: String? = nil) -> SelectionState {
        guard let summary = sourceManagement.summary(for: sourceId), let draft = draft(for: sourceId) else {
            return .empty
        }
        let treeState = TreeSelectionState(allLeafIds: summary.leafs.map(\.id), selectedLeafIds: draft.selectedLeafIds)
        return getParentSelectionState(treeState)
    }

    func targetSelectionState(sourceId: String? = nil) -> SelectionState {
        if sourceManagement.summary(for: sourceId)?.ownership == "external" { return .empty }
        guard let sourceId = resolveSourceId(sourceId) else { return .empty }
        let targetIds = visibleTargetIds()
        guard !targetIds.isEmpty else { return .empty }
        let selectedTargets = visibleEnabledTargets(for: sourceId, within: targetIds)
        return selectionState(allIds: targetIds, selectedIds: selectedTargets)
    }

    func isSkillEnabled(_ leafId: String, sourceId: String? = nil) -> Bool {
        draft(for: sourceId)?.selectedLeafIds.contains(leafId) == true
    }

    func toggleAllSkills(sourceId: String? = nil) async {
        guard let sourceId = resolveSourceId(sourceId), let summary = sourceManagement.summary(for: sourceId), var draft = draft(for: sourceId) else { return }
        guard !isSaving(sourceId: sourceId) else { return }

        let treeState = TreeSelectionState(allLeafIds: summary.leafs.map(\.id), selectedLeafIds: draft.selectedLeafIds)
        let nextState = toggleParent(treeState)
        draft.selectedLeafIds = nextState.selectedLeafIds
        do {
            try await sourceManagement.commitDraftChange(
                sourceId: sourceId,
                scope: currentProjectScope(),
                nextDraft: draft,
                successMessage: localizedText("toast.compact.skills", nextState.selectedLeafIds.isEmpty ? localized("toast.compact.off") : localized("toast.compact.on"), sourceManagement.summary(for: sourceId)?.sourceDisplayName ?? sourceId),
                successStyle: nextState.selectedLeafIds.isEmpty ? .neutral : .success
            )
        } catch {
            showOperationFailureToast(fallbackKey: "toast.save.failed", fallbackArgument: firstErrorLine(from: error), error: error)
        }
    }

    func setSkillEnabled(_ leafId: String, enabled: Bool, sourceId: String? = nil) async {
        guard let sourceId = resolveSourceId(sourceId), let summary = sourceManagement.summary(for: sourceId), var draft = draft(for: sourceId) else { return }
        guard !isSaving(sourceId: sourceId) else { return }
        guard summary.leafs.contains(where: { $0.id == leafId }) else { return }

        let selectedLeafIds = Set(draft.selectedLeafIds)
        guard selectedLeafIds.contains(leafId) != enabled else { return }

        let nextSelectedLeafIds: [String]
        if enabled {
            nextSelectedLeafIds = summary.leafs.map(\.id).filter { selectedLeafIds.union([leafId]).contains($0) }
        } else {
            nextSelectedLeafIds = summary.leafs.map(\.id).filter { selectedLeafIds.subtracting([leafId]).contains($0) }
        }

        draft.selectedLeafIds = nextSelectedLeafIds
        do {
            try await sourceManagement.commitDraftChange(
                sourceId: sourceId,
                scope: currentProjectScope(),
                nextDraft: draft,
                successMessage: localizedText("toast.compact.skill", enabled ? localized("toast.compact.on") : localized("toast.compact.off"), sourceManagement.summary(for: sourceId)?.sourceDisplayName ?? sourceId, leafId),
                successStyle: enabled ? .success : .neutral
            )
        } catch {
            showOperationFailureToast(fallbackKey: "toast.save.failed", fallbackArgument: firstErrorLine(from: error), error: error)
        }
    }

    func toggleAllTargets(sourceId: String? = nil) async {
        guard let sourceId = resolveSourceId(sourceId), var draft = draft(for: sourceId) else { return }
        guard !isSaving(sourceId: sourceId) else { return }

        let targetIds = visibleTargetIds()
        guard !targetIds.isEmpty else { return }
        let visibleEnabledTargets = visibleEnabledTargets(for: sourceId, within: targetIds)
        let hiddenTargets = draft.enabledTargets.filter { !targetIds.contains($0) }
        let nextVisibleTargets = visibleEnabledTargets.count == targetIds.count ? [] : targetIds
        draft.enabledTargets = normalizedTargets(hiddenTargets + nextVisibleTargets)
        do {
            try await sourceManagement.commitDraftChange(
                sourceId: sourceId,
                scope: currentProjectScope(),
                nextDraft: draft,
                successMessage: localizedText("toast.compact.agents", draft.enabledTargets.isEmpty ? localized("toast.compact.off") : localized("toast.compact.on"), sourceManagement.summary(for: sourceId)?.sourceDisplayName ?? sourceId),
                successStyle: draft.enabledTargets.isEmpty ? .neutral : .success
            )
        } catch {
            showOperationFailureToast(fallbackKey: "toast.save.failed", fallbackArgument: firstErrorLine(from: error), error: error)
        }
    }

    func isTargetEnabled(_ target: String) -> Bool {
        guard let groupId = selectedGroupId, let draft = draft(for: groupId) else { return false }
        return draft.enabledTargets.contains(target)
    }

    func setTargetEnabled(_ target: String, enabled: Bool, sourceId: String? = nil, expectedCurrentEnabled: Bool? = nil) async {
        guard let groupId = resolveSourceId(sourceId), var draft = draft(for: groupId) else { return }
        guard !isSaving(sourceId: groupId) else { return }

        let currentlyEnabled = draft.enabledTargets.contains(target)
        if let expectedCurrentEnabled, currentlyEnabled != expectedCurrentEnabled { return }
        guard currentlyEnabled != enabled else { return }

        if enabled {
            draft.enabledTargets = normalizedTargets(draft.enabledTargets + [target])
        } else {
            draft.enabledTargets.removeAll { $0 == target }
        }

        do {
            try await sourceManagement.commitDraftChange(
                sourceId: groupId,
                scope: currentProjectScope(),
                nextDraft: draft,
                successMessage: localizedText("toast.compact.agent", enabled ? localized("toast.compact.on") : localized("toast.compact.off"), sourceManagement.summary(for: groupId)?.sourceDisplayName ?? groupId, target),
                successStyle: enabled ? .success : .neutral
            )
        } catch {
            showOperationFailureToast(fallbackKey: "toast.save.failed", fallbackArgument: firstErrorLine(from: error), error: error)
        }
    }

    func bootstrap() async {
        stateManager.setLoadState(.loading)
        do {
            let warnings = try await sourceManagement.bootstrap()
            detectedTargets = sourceManagement.detectedTargetIds()
            stateManager.setLatestWarnings(warnings)
            stateManager.setLoadState(.ready)
            stateManager.setHealthStatus(warnings.isEmpty ? .healthy : .warnings)
            await migrateLegacyPinnedSourceIdsIfNeeded()
            Task { [weak self] in await self?.importLogic.loadImportPageIfNeeded() }
            Task { [weak self] in
                guard let self else { return }
                _ = try? await self.usageQuery.refreshUsage(trigger: "bootstrap")
            }
        } catch {
            stateManager.setLoadState(.failed(error.localizedDescription))
            stateManager.setHealthStatus(.error)
        }
    }

    func refreshList() async {
        await refreshList(showProjectScopeToast: false)
    }

    func refreshProjectScopes() async {
        await refreshList(showProjectScopeToast: true)
    }

    private func refreshList(showProjectScopeToast: Bool) async {
        stateManager.startRefreshing()
        if showProjectScopeToast {
            showToast(style: .loading, text: localizedText("toast.project_scope.refresh.loading"))
        }
        defer { stateManager.stopRefreshing() }

        do {
            let previousScope = currentProjectScope()
            let sourceToReinspect = selectedSourceId
            let response = try await sourceManagement.refreshList()
            detectedTargets = sourceManagement.detectedTargetIds()
            if currentProjectScope() != previousScope, let sourceToReinspect {
                await selectSource(sourceToReinspect)
            }
            stateManager.setLatestWarnings(response.warnings)
            stateManager.setHealthStatus(response.warnings.isEmpty ? .healthy : .warnings)
            if showProjectScopeToast {
                showToast(
                    style: .success,
                    text: localizedText(
                        "toast.project_scope.refresh.success",
                        String(recentProjectScopes.count)
                    )
                )
            }
        } catch {
            if showProjectScopeToast {
                showOperationFailureToast(fallbackKey: "toast.project_scope.refresh.failed", fallbackArgument: error.localizedDescription, error: error)
            }
            stateManager.setLoadState(.failed(error.localizedDescription))
        }
    }

    func selectSource(_ sourceId: String) async {
        stateManager.selectSource(sourceId)
        do {
            let response = try await sourceManagement.selectSource(sourceId, scope: currentProjectScope())
            if let payload = response.data?.value as? [String: Any] {
                if let key = scopedSourceKey(sourceId: sourceId, scope: currentProjectScope()) {
                    inspectedPayloadBySourceId[key] = payload
                }
                detailLogic.invalidatePreparedDetailContent(for: sourceId)
                if let input = detailInput(for: sourceId) {
                    detailLogic.scheduleDetailContentWarmupIfNeeded(input: input)
                    detailLogic.scheduleDetailEnrichmentFetch(input: input)
                }
            }
            stateManager.setLatestWarnings(response.warnings)
        } catch {
            showOperationFailureToast(fallbackKey: "toast.details.load_failed", fallbackArgument: sourceId, error: error)
        }
    }

    func runDoctor() async {
        do {
            let (issues, warnings) = try await sourceManagement.runDoctor()
            stateManager.setDoctorIssues(issues)
            stateManager.setLastDoctorError(nil)
            stateManager.setLatestWarnings(warnings)
            stateManager.setHealthStatus(warnings.isEmpty ? .healthy : .warnings)
        } catch {
            stateManager.setHealthStatus(.error)
            stateManager.setLastDoctorError(error.localizedDescription)
        }
    }

    func updateAllGroupsFromHome() async {
        let sourceIds = self.sourceIds.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !sourceIds.isEmpty else {
            showToast(style: .neutral, text: localizedText("toast.update.none"))
            return
        }
        await groupOperations.enqueueBulkUpdate(sourceIds: sourceIds)
    }

    func updateCurrentGroup() async {
        await updateSource(selectedSourceId ?? "")
    }

    func isUpdatingSource(_ sourceId: String) -> Bool {
        groupOperations.isUpdatingSource(sourceId)
    }

    func isQueuedUpdateSource(_ sourceId: String) -> Bool {
        groupOperations.isQueuedUpdateSource(sourceId)
    }

    func updateSource(_ sourceId: String) async {
        let normalized = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty else {
            showToast(style: .error, text: localizedText("toast.update.no_group_selected"))
            return
        }
        await groupOperations.enqueueUpdate(sourceId: normalized)
    }

    private func performQueuedUpdate(sourceId: String) async {
        do {
            let response = try await sourceManagement.updateSelectedSource(sourceId)
            if let response {
                await synchronizeAfterMutation(response)
            } else {
                await synchronizeState(refreshDoctor: true)
            }
            registerRecentlyUpdatedSources(from: response?.data?.value)
            showToast(style: .success, text: .plain(updateSummaryMessage(from: response?.data?.value, fallbackCount: 1)))
        } catch {
            showOperationFailureToast(fallbackKey: "toast.update.failed", fallbackArgument: error.localizedDescription, error: error)
        }
    }

    private func performQueuedBulkUpdate(sourceIds: [String]) async {
        do {
            let response = try await sourceManagement.updateSourcesReturningResponse(sourceIds)
            await synchronizeAfterMutation(response)
            registerRecentlyUpdatedSources(from: response.data?.value)
            presentBulkUpdateOutcome(requestedCount: sourceIds.count, payload: response.data?.value, warnings: response.warnings)
        } catch {
            showOperationFailureToast(fallbackKey: "toast.update.failed", fallbackArgument: error.localizedDescription, error: error)
        }
    }

    var importDisplayGroups: [ImportGroupItem] {
        importLogic.importDisplayGroups
    }

    func isImportingImportGroup(_ groupId: String) -> Bool {
        groupOperations.isImportingImportGroup(groupId)
    }

    func isQueuedImportGroup(_ groupId: String) -> Bool {
        groupOperations.isQueuedImportGroup(groupId)
    }

    func importOperationPhase(for groupId: String) -> GroupOperationQueue.Phase? {
        groupOperations.importOperationPhase(for: groupId)
    }

    func loadImportPageIfNeeded() async {
        await importLogic.loadImportPageIfNeeded()
    }

    func loadRecommendedImportGroups() async {
        await importLogic.loadRecommendedImportGroups()
    }

    func loadLocalImportGroups(path: String?) async {
        await importLogic.loadLocalImportGroups(path: path)
    }

    func submitImportSearch(_ query: String) async {
        await importLogic.submitImportSearch(query)
    }

    func previewImportGroupIfNeeded(_ groupId: String) async {
        await importLogic.previewImportGroupIfNeeded(groupId)
    }

    func prefetchImportGroupDetailsIfNeeded(_ groupIds: [String]) {
        importLogic.prefetchImportGroupDetailsIfNeeded(groupIds)
    }

    func importImportGroup(groupId: String, locator: String, selectedSkills: [ImportSkillSelection], skillSelectionMode: ImportSkillSelectionMode = .selected, enabledTargets: [String]) async {
        await groupOperations.enqueueImport(
            groupId: groupId,
            locator: locator,
            selectedSkills: selectedSkills,
            skillSelectionMode: skillSelectionMode,
            enabledTargets: enabledTargets
        )
    }

    private func presentBulkUpdateOutcome(requestedCount: Int, payload: Any?, warnings: [BridgeIssue]) {
        let outcome = Self.parseBulkUpdateOutcome(requestedCount: requestedCount, payload: payload, warnings: warnings)

        if outcome.failedCount == 0 {
            showToast(style: .success, text: .plain(updateSummaryMessage(from: payload, fallbackCount: outcome.successCount)))
            return
        }
        if outcome.successCount == 0 {
            showToast(
                style: .error,
                text: localizedText("toast.update.failed", outcome.firstFailureMessage ?? "update failed")
            )
            return
        }
        showToast(
            style: .neutral,
            text: localizedText(
                "toast.update.partial",
                String(outcome.successCount),
                String(outcome.failedCount)
            )
        )
    }

    private struct BulkUpdateOutcome {
        let successCount: Int
        let failedCount: Int
        let firstFailureMessage: String?
    }

    private static func parseBulkUpdateOutcome(
        requestedCount: Int,
        payload: Any?,
        warnings: [BridgeIssue]
    ) -> BulkUpdateOutcome {
        let data = payload as? [String: Any]
        let updatedCount = (data?["updated"] as? [[String: Any]])?.count
        let failedItems = data?["failed"] as? [[String: Any]] ?? []
        let failedFromPayload = failedItems.compactMap { item -> String? in
            (item["message"] as? String)?.nonEmpty ?? (item["code"] as? String)
        }
        let failedFromWarnings = warnings
            .filter { $0.code == "SOURCE_UPDATE_FAILED" }
            .map(\.message)

        let failedMessages = failedFromPayload.isEmpty ? failedFromWarnings : failedFromPayload
        let failedCount = max(failedItems.count, failedFromWarnings.count)
        let successCount = updatedCount ?? max(0, requestedCount - failedCount)
        return BulkUpdateOutcome(
            successCount: successCount,
            failedCount: failedCount,
            firstFailureMessage: failedMessages.first
        )
    }

    func uninstallSelectedSource() async {
        guard let selectedSourceId else {
            showToast(style: .error, text: localizedText("toast.uninstall.no_group_selected"))
            return
        }
        await deleteSource(sourceId: selectedSourceId)
    }

    func deleteSource(sourceId: String) async {
        do {
            try await sourceManagement.deleteSource(sourceId: sourceId)
            if selectedSourceId == sourceId { stateManager.selectSource(nil) }
            await synchronizeState(refreshDoctor: true)
            if let first = sourceIds.first {
                await selectSource(first)
            } else {
                requestPage(.home)
            }
            showToast(style: .success, text: localizedText("toast.uninstall.success", sourceId))
        } catch {
            showOperationFailureToast(fallbackKey: "toast.uninstall.failed", fallbackArgument: error.localizedDescription, error: error)
        }
    }

    func requestPage(_ page: Page) {
        routeState?.view.currentRoute = Self.route(for: page)
    }

    static func route(for page: Page) -> DesktopRoute {
        switch page {
        case .home: return .home
        case .importPage: return .importPage
        case .usage: return .usage
        case .settings: return .settings
        case .detail(let sourceId): return .detail(sourceId: sourceId)
        }
    }

    func loadUsageSnapshot(
        force: Bool = false,
        rangePreset: String = "30d",
        from: String? = nil,
        to: String? = nil
    ) async {
        guard force || usageSnapshot?.rangePreset.rawValue != rangePreset else { return }
        usageLoadState = .loading
        do {
            let response = try await usageQuery.usageSnapshot(rangePreset: rangePreset, from: from, to: to)
            guard response.ok,
                  let snapshot = BridgePayloadDecoder.usageSnapshot(from: response.data?.value as? [String: Any])
            else {
                usageLoadState = .failed(response.errors.first?.message ?? "Unable to load usage analytics.")
                return
            }
            usageSnapshot = snapshot
            usageLoadState = .ready
        } catch {
            usageLoadState = .failed(error.localizedDescription)
        }
    }

    func refreshUsageAnalytics() async {
        usageLoadState = .loading
        do {
            let response = try await usageQuery.refreshUsage(trigger: "manual")
            guard response.ok else {
                usageLoadState = .failed(response.errors.first?.message ?? "Unable to refresh usage analytics.")
                return
            }
            await loadUsageSnapshot(force: true, rangePreset: "30d")
        } catch {
            usageLoadState = .failed(error.localizedDescription)
        }
    }

    func detailViewData(for sourceId: String) -> DetailViewData? {
        detailInput(for: sourceId).map { detailLogic.detailViewData(for: $0) }
    }

    func detailSnapshot(for sourceId: String) -> DetailViewModel.Snapshot? {
        guard let detail = detailViewData(for: sourceId) else { return nil }
        return DetailViewModel.Snapshot(detail: detail)
    }

    func groupDocument(for sourceId: String, documentId: String) async -> DocumentTab? {
        guard let input = detailInput(for: sourceId) else { return nil }
        return await detailLogic.groupDocument(for: sourceId, documentId: documentId, input: input)
    }

    func hasInspectPayload(for sourceId: String) -> Bool {
        sourceManagement.hasInspectPayload(for: sourceId, scope: currentProjectScope())
    }

    func isInspectRequestInFlight(for sourceId: String) -> Bool {
        sourceManagement.isInspectRequestInFlight(for: sourceId, scope: currentProjectScope())
    }

    func bindRouteState(_ state: DesktopAppState) {
        routeState = state
        cachedSelectedProjectScope = state.settings.selectedProjectScope
        cachedRecentProjectScopes = Array(state.settings.recentProjectScopes.prefix(10))
        projectScopeChangeToken &+= 1
    }

    func selectProjectScope(_ scope: ProjectScopeSelection) async {
        let normalizedScope: ProjectScopeSelection
        switch scope {
        case .global:
            normalizedScope = .global
        case .project(let projectId):
            normalizedScope = recentProjectScopes.contains(where: { $0.projectId == projectId }) ? .project(projectId) : .global
        }

        guard selectedProjectScope != normalizedScope else {
            return
        }

        let didInitializeProjectDrafts = sourceManagement.ensureProjectDraftsInitializedIfNeeded(for: normalizedScope)

        cachedSelectedProjectScope = normalizedScope
        routeState?.settings.selectedProjectScope = normalizedScope
        persistProjectScopeSettingsIfNeeded()
        projectScopeChangeToken &+= 1
        if let sourceId = selectedSourceId {
            await selectSource(sourceId)
        }

        showToast(
            style: .success,
            text: localizedText(
                didInitializeProjectDrafts
                    ? "toast.project_scope.initialized"
                    : "toast.project_scope.switched",
                projectScopeTitle(for: normalizedScope)
            )
        )
    }

    var selectedProjectScope: ProjectScopeSelection {
        _ = projectScopeChangeToken
        return routeState?.settings.selectedProjectScope ?? cachedSelectedProjectScope
    }

    var recentProjectScopes: [RecentProjectScopeItem] {
        _ = projectScopeChangeToken
        return Array((routeState?.settings.recentProjectScopes ?? cachedRecentProjectScopes).prefix(10))
    }

    func projectionNameMap(for sourceId: String? = nil) -> [String: String] {
        guard let sourceId = resolveSourceId(sourceId) else {
            return [:]
        }
        return buildProjectionNameMap(
            summaries: projectionSummaries(),
            drafts: projectionDrafts(),
            sourceId: sourceId
        )
    }

    func formattedCount(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    func relativeUpdateLabel(_ updatedAt: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: updatedAt) else {
            return localized("detail.updated.unavailable")
        }

        let formatter = RelativeDateTimeFormatter()
        formatter.locale = Self.presentationLocale
        formatter.unitsStyle = .full

        let referenceDate = Self.currentDateProvider()
        let effectiveDate = date > referenceDate ? referenceDate : date
        let relativeValue = formatter.localizedString(for: effectiveDate, relativeTo: referenceDate)
        return localized("detail.updated.relative", relativeValue)
    }

    func gitHubRepoContext(locator: String, lockPayload: [String: Any]) -> DetailLogic.GitHubRepoContext? {
        let candidates = [
            lockPayload["githubRepo"] as? String,
            lockPayload["canonicalRepo"] as? String,
            locator
        ]
        guard let normalized = candidates.compactMap({ ImportRepositoryIdentity.normalizedGitHubRepo($0) }).first else {
            return nil
        }
        let parts = normalized.split(separator: "/")
        guard parts.count >= 2 else { return nil }
        let owner = String(parts[0])
        let repo = String(parts[1])
        let revision = (lockPayload["commitSha"] as? String)?.nonEmpty ?? "HEAD"
        return DetailLogic.GitHubRepoContext(owner: owner, repo: repo, revision: revision)
    }

    func currentProjectPath() -> String? {
        guard case .project(let projectId) = currentProjectScope() else {
            return nil
        }

        return recentProjectScopes.first(where: { $0.projectId == projectId })?.projectPath
    }

    func enrichmentPayloadWithDisplayName(
        _ payload: [String: Any],
        displayName: String,
        originalDisplayName: String
    ) -> [String: Any] {
        var merged = payload
        if var source = merged["source"] as? [String: Any] {
            source["displayName"] = displayName
            source["originalDisplayName"] = originalDisplayName
            merged["source"] = source
        } else {
            merged["source"] = [
                "displayName": displayName,
                "originalDisplayName": originalDisplayName
            ]
        }
        return merged
    }

    private func updateCachedDetailDisplayName(sourceId: String, displayName: String, originalDisplayName: String) {
        if let payload = detailEnrichmentPayloadBySourceId[sourceId] {
            detailEnrichmentPayloadBySourceId[sourceId] = enrichmentPayloadWithDisplayName(
                payload,
                displayName: displayName,
                originalDisplayName: originalDisplayName
            )
        }

        for key in inspectedPayloadBySourceId.keys where key.sourceId == sourceId {
            if let payload = inspectedPayloadBySourceId[key] {
                inspectedPayloadBySourceId[key] = enrichmentPayloadWithDisplayName(
                    payload,
                    displayName: displayName,
                    originalDisplayName: originalDisplayName
                )
            }
        }
    }

    // MARK: - Private Helper Methods

    private func resolveSourceId(_ sourceId: String?) -> String? {
        (sourceId ?? selectedSourceId)?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func currentProjectScope() -> ProjectScopeSelection { selectedProjectScope }

    func scopedSourceKey(sourceId: String, scope: ProjectScopeSelection? = nil) -> ScopedSourceKey? {
        let trimmed = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return ScopedSourceKey(scope: scope ?? currentProjectScope(), sourceId: trimmed)
    }

    func visibleTargetIds() -> [String] {
        let preferences = AgentDisplayCatalog.normalize(routeState?.settings.agentDisplayPreferences ?? [], customAgents: routeState?.settings.customAgents ?? [])
        let visibleTargetIds = preferences.filter(\.isVisible).map(\.targetId)
        let customTargetIds = Set((routeState?.settings.customAgents ?? []).map(\.id))

        if detectedTargets.isEmpty { return visibleTargetIds }
        return visibleTargetIds.filter { detectedTargets.contains($0) || customTargetIds.contains($0) }
    }

    private func visibleEnabledTargets(for sourceId: String, within targetIds: [String]) -> [String] {
        guard let draft = draft(for: sourceId) else { return [] }
        let enabledTargets = Set(draft.enabledTargets)
        return targetIds.filter { enabledTargets.contains($0) }
    }

    private func normalizedTargets(_ values: [String]) -> [String] {
        AgentDisplayCatalog.orderedTargetIds(in: values, customAgents: routeState?.settings.customAgents ?? [])
    }

    func applyWarningsFromApplyResponse(_ warnings: [BridgeIssue]) {
        stateManager.setLatestWarnings(warnings)
        stateManager.setHealthStatus(warnings.isEmpty ? .healthy : .warnings)
    }

    func applyProjectScopeState(_ data: [String: Any]) {
        if data.keys.contains("selectedProjectScope"),
           let scope = parseProjectScopeSelection(data["selectedProjectScope"]) {
            cachedSelectedProjectScope = scope
            routeState?.settings.selectedProjectScope = scope
        }

        if data.keys.contains("recentProjects") {
            cachedRecentProjectScopes = parseRecentProjectScopes(data["recentProjects"])
            routeState?.settings.recentProjectScopes = cachedRecentProjectScopes
        }

        persistProjectScopeSettingsIfNeeded()
        projectScopeChangeToken &+= 1
    }

    func applyCachedGroupCardEnrichment(_ data: [String: Any]) {
        guard let entries = data["groupCardEnrichmentBySourceId"] as? [String: Any] else {
            return
        }

        for (sourceId, rawValue) in entries {
            guard let payload = rawValue as? [String: Any] else {
                continue
            }
            let mergedPayload = mergedDetailEnrichmentPayload(
                existing: detailEnrichmentPayloadBySourceId[sourceId] ?? [:],
                incoming: payload
            )
            if !mergedPayload.isEmpty {
                detailEnrichmentPayloadBySourceId[sourceId] = mergedPayload
            }
        }
    }

    func customAgentsForSourceManagement() -> [CustomAgentDefinition] {
        routeState?.settings.customAgents ?? []
    }

    func currentProjectScopeForSourceManagement() -> ProjectScopeSelection {
        currentProjectScope()
    }

    private func mergedDetailEnrichmentPayload(existing: [String: Any], incoming: [String: Any]) -> [String: Any] {
        var mergedPayload = existing
        for (key, value) in incoming {
            if let existingObject = mergedPayload[key] as? [String: Any],
               let incomingObject = value as? [String: Any] {
                mergedPayload[key] = mergedDetailEnrichmentPayload(existing: existingObject, incoming: incomingObject)
            } else {
                mergedPayload[key] = value
            }
        }
        return mergedPayload
    }

    private func parseProjectScopeSelection(_ value: Any?) -> ProjectScopeSelection? {
        guard let payload = value as? [String: Any] else {
            return nil
        }
        let kind = payload["kind"] as? String ?? "global"
        if kind == "project",
           let projectId = (payload["projectId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
           !projectId.isEmpty {
            return .project(projectId)
        }
        return .global
    }

    private func parseRecentProjectScopes(_ value: Any?) -> [RecentProjectScopeItem] {
        guard let payload = value as? [[String: Any]] else {
            return []
        }

        return payload.compactMap { item in
            guard let projectId = (item["projectId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !projectId.isEmpty,
                  let title = (item["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !title.isEmpty,
                  let lastActivityAt = item["lastActivityAt"] as? String
            else {
                return nil
            }

            return RecentProjectScopeItem(
                projectId: projectId,
                title: title,
                lastActivityAt: lastActivityAt,
                projectPath: (item["projectPath"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
                tools: uniqueSorted(item["tools"] as? [String] ?? [])
            )
        }.prefix(10).map { $0 }
    }

    private func projectScopeTitle(for scope: ProjectScopeSelection) -> String {
        switch scope {
        case .global:
            return localized("project_scope.global")
        case .project(let projectId):
            return recentProjectScopes.first(where: { $0.projectId == projectId })?.title ?? projectId
        }
    }

    private func persistProjectScopeSettingsIfNeeded() {
        var persisted = settingsStore.load()
        persisted.selectedProjectScope = cachedSelectedProjectScope
        persisted.recentProjectScopes = cachedRecentProjectScopes
        if let customAgents = routeState?.settings.customAgents {
            persisted.customAgents = customAgents
        }
        if let preferences = routeState?.settings.agentDisplayPreferences {
            persisted.agentDisplayPreferences = preferences
        }
        settingsStore.save(persisted)
    }

    private func projectionSummaries() -> [ProjectionSourceSummary] {
        sourceManagement.summaries().map { summary in
            ProjectionSourceSummary(
                sourceId: summary.sourceId,
                displayName: summary.sourceDisplayName,
                locator: summary.sourceLocator,
                leafs: summary.leafs.map {
                    ProjectionLeafSummary(
                        id: $0.id,
                        linkName: $0.linkName,
                        name: $0.name,
                        description: $0.description
                    )
                }
            )
        }
    }

    private func projectionDrafts() -> [String: ProjectionDraftState] {
        Dictionary(uniqueKeysWithValues: sourceManagement.summaries().compactMap { summary in
            guard let draft = draft(for: summary.sourceId) else {
                return nil
            }
            return (
                summary.sourceId,
                ProjectionDraftState(
                    enabledTargets: draft.enabledTargets,
                    selectedLeafIds: draft.selectedLeafIds
                )
            )
        })
    }

    private func uniqueSorted(_ values: [String]) -> [String] { Array(Set(values)).sorted() }

    private func sortedSourceRows(_ rows: [SourceRow]) -> [SourceRow] {
        rows.sorted { lhs, rhs in
            let leftRank = pinnedSourceIds.firstIndex(of: lhs.id) ?? Int.max
            let rightRank = pinnedSourceIds.firstIndex(of: rhs.id) ?? Int.max
            if leftRank != rightRank { return leftRank < rightRank }
            return lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName) == .orderedAscending
        }
    }

    private func sortedGroupCardSkills(_ skills: [GroupCardSkill]) -> [GroupCardSkill] {
        skills.sorted { lhs, rhs in
            if (lhs.highlightQuery != nil) != (rhs.highlightQuery != nil) {
                return lhs.highlightQuery != nil
            }
            if lhs.isEnabled != rhs.isEnabled {
                return lhs.isEnabled && !rhs.isEnabled
            }
            let titleComparison = lhs.label.localizedCaseInsensitiveCompare(rhs.label)
            if titleComparison != .orderedSame {
                return titleComparison == .orderedAscending
            }
            return lhs.id.localizedCaseInsensitiveCompare(rhs.id) == .orderedAscending
        }
    }

    func synchronizeState(refreshDoctor: Bool, inspectSourceId: String? = nil) async {
        await refreshList()
        if refreshDoctor { await runDoctor() }
        if let inspectSourceId = inspectSourceId?.trimmingCharacters(in: .whitespacesAndNewlines), !inspectSourceId.isEmpty, sourceIds.contains(inspectSourceId) {
            await selectSource(inspectSourceId)
        }
    }

    func synchronizeAfterMutation(_ response: BridgeResponse, inspectSourceId: String? = nil) async {
        guard sourceManagement.applyMutationWorkspace(response.data?.value) else {
            await synchronizeState(refreshDoctor: true, inspectSourceId: inspectSourceId)
            return
        }
        detectedTargets = sourceManagement.detectedTargetIds()
        stateManager.setLatestWarnings(response.warnings)
        stateManager.setHealthStatus(response.warnings.isEmpty ? .healthy : .warnings)
        if let inspectSourceId = inspectSourceId?.trimmingCharacters(in: .whitespacesAndNewlines),
           !inspectSourceId.isEmpty,
           sourceIds.contains(inspectSourceId) {
            await selectSource(inspectSourceId)
        }
    }

    func localizedText(_ key: String, _ arguments: [String]) -> PresentationText {
        if arguments.isEmpty {
            return .localized(key)
        }
        return .localized(key, arguments)
    }

    private func scheduleDetailEnrichmentFetch(sourceId: String, force: Bool = false) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                let response = try await self.bridgeClient.inspectEnrichment(sourceId: sourceId)
                if let payload = response.data?.value as? [String: Any] {
                    let displayName = self.renamedSourceDisplayNameOverridesBySourceId[sourceId]
                        ?? self.sourceManagement.summary(for: sourceId)?.sourceDisplayName
                    let originalDisplayName = self.renamedSourceOriginalDisplayNameOverridesBySourceId[sourceId]
                        ?? self.sourceManagement.summary(for: sourceId)?.sourceOriginalDisplayName
                        ?? displayName
                    if let displayName, let originalDisplayName {
                        let normalizedPayload = self.enrichmentPayloadWithDisplayName(
                            payload,
                            displayName: displayName,
                            originalDisplayName: originalDisplayName
                        )
                        self.detailEnrichmentPayloadBySourceId[sourceId] = self.mergedDetailEnrichmentPayload(
                            existing: self.detailEnrichmentPayloadBySourceId[sourceId] ?? [:],
                            incoming: normalizedPayload
                        )
                    } else {
                        self.detailEnrichmentPayloadBySourceId[sourceId] = self.mergedDetailEnrichmentPayload(
                            existing: self.detailEnrichmentPayloadBySourceId[sourceId] ?? [:],
                            incoming: payload
                        )
                    }
                }
                self.stateManager.setLatestWarnings(response.warnings)
            } catch {
            }
        }
    }

    func preferredGroupPath(lockPayload: [String: Any], leafPayloads: [[String: Any]]) -> String? {
        if let checkoutPath = (lockPayload["checkoutPath"] as? String)?.nonEmpty { return checkoutPath }
        let folderPaths = leafPayloads.compactMap {
            (($0["absolutePath"] as? String)?.nonEmpty) ?? (($0["skillFilePath"] as? String).flatMap { ($0 as NSString).deletingLastPathComponent.nonEmpty })
        }
        return commonDirectoryPath(paths: folderPaths)
    }

    private func commonDirectoryPath(paths: [String]) -> String? {
        guard var components = paths.first?.split(separator: "/").map(String.init), !components.isEmpty else { return nil }
        for path in paths.dropFirst() {
            let current = path.split(separator: "/").map(String.init)
            var index = 0
            while index < min(components.count, current.count), components[index] == current[index] { index += 1 }
            components = Array(components.prefix(index))
            if components.isEmpty { return "/" }
        }
        return "/" + components.joined(separator: "/")
    }

    func authorName(locator: String, kind: String) -> String {
        let normalizedKind = kind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalizedKind == "local" { return localized("source.author.local") }
        if normalizedKind == "collection" { return localized("source.author.collection") }
        if let handle = Self.authorHandle(from: locator) { return handle }
        return normalizedKind
    }

    nonisolated private static func authorHandle(from locator: String) -> String? {
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let patterns = [#"github\.com/([^/\s]+)/"#, #"git@github\.com:([^/\s]+)/"#, #"clawhub/([^/\s]+)/"#]
        for pattern in patterns {
            if let regex = try? NSRegularExpression(pattern: pattern) {
                let nsRange = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
                if let match = regex.firstMatch(in: trimmed, range: nsRange), match.numberOfRanges > 1, let range = Range(match.range(at: 1), in: trimmed) {
                    return "@\(trimmed[range])"
                }
            }
        }
        return nil
    }

    func groupCardMetadata(sourceId: String, summary: SourceManagement.WorkflowSummary, row: SourceRow) -> (byline: String?, stats: GroupCardStats) {
        let payload = detailEnrichmentPayloadBySourceId[sourceId] ?? [:]
        let sourceSnapshot = BridgePayloadDecoder.sourceSnapshot(from: payload["sourceSnapshot"] as? [String: Any])
        let sourceMetadata = (payload["sourceMetadata"] as? [String: Any])?["data"] as? [String: Any]
        let cachedGroupPath = (payload["groupPath"] as? String)?.nonEmpty
        let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
        let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []

        let byline = sourceSnapshot.map { "by @\($0.owner.slug)" }
            ?? ((sourceMetadata?["ownerHandle"] as? String)?.nonEmpty.map { "by \($0)" })
            ?? "by \(authorName(locator: row.locator, kind: row.kind))"

        let stats = GroupCardStats(
            downloadCount: sourceSnapshot?.totalInstalls
                ?? sourceMetadata?["totalInstalls"] as? Int
                ?? sourceMetadata?["downloadCount"] as? Int,
            starCount: sourceSnapshot?.repoStars ?? sourceMetadata?["starCount"] as? Int,
            githubURL: sourceSnapshot?.repoURL ?? (sourceMetadata?["repoUrl"] as? String)?.nonEmpty,
            localPath: cachedGroupPath ?? preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads)
        )

        return (byline, stats)
    }

    private func mergedDetailPayload(for sourceId: String) -> [String: Any] {
        var payload = inspectedPayloadBySourceId[ScopedSourceKey(scope: currentProjectScope(), sourceId: sourceId)] ?? [:]
        let enrichmentPayload = detailEnrichmentPayloadBySourceId[sourceId] ?? [:]
        for (key, value) in enrichmentPayload { payload[key] = value }
        return payload
    }

    private func updateSummaryMessage(from value: Any?, fallbackCount: Int) -> String {
        if let payload = value as? [String: Any],
           let items = payload["updated"] as? [[String: Any]],
           let repaired = items.first(where: { $0["repaired"] as? Bool == true }) {
            let reason = (repaired["repairReason"] as? String) ?? "local drift"
            return "Recovered local checkout (\(reason))"
        }
        return fallbackCount == 1
            ? localized("toast.update.summary.single")
            : localized("toast.update.summary.multiple", String(fallbackCount))
    }

    private func registerRecentlyUpdatedSources(from value: Any?) {
        guard
            let payload = value as? [String: Any],
            let items = payload["updated"] as? [[String: Any]]
        else {
            return
        }

        for item in items {
            let changed = item["changed"] as? Bool == true
                || item["repaired"] as? Bool == true
                || ((item["addedLeafIds"] as? [String])?.isEmpty == false)
                || ((item["removedLeafIds"] as? [String])?.isEmpty == false)
                || ((item["invalidatedLeafIds"] as? [String])?.isEmpty == false)
            guard changed,
                  let sourceId = (item["sourceId"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !sourceId.isEmpty else {
                continue
            }
            sourceManagement.addRecentlyUpdatedSource(sourceId: sourceId, scope: currentProjectScope())
        }
    }

    private func migrateLegacyPinnedSourceIdsIfNeeded() async {
        guard !UserDefaults.standard.bool(forKey: pinnedSourceIdsMigrationKey) else {
            return
        }

        let legacyPinnedSourceIds = normalizedPinnedSourceIds(
            UserDefaults.standard.stringArray(forKey: legacyPinnedSourceIdsKey) ?? []
        )
        guard pinnedSourceIds.isEmpty, !legacyPinnedSourceIds.isEmpty else {
            completePinnedSourceIdsMigration()
            return
        }

        let eligiblePinnedSourceIds = legacyPinnedSourceIds.filter { sourceIds.contains($0) }
        guard !eligiblePinnedSourceIds.isEmpty else {
            completePinnedSourceIdsMigration()
            return
        }

        let previousPinnedSourceIds = pinnedSourceIds
        var migratedSourceIds: [String] = []
        do {
            for sourceId in eligiblePinnedSourceIds {
                let result = try await sourceManagement.togglePinned(sourceId: sourceId)
                stateManager.setPinnedSourceIds(result)
                migratedSourceIds.append(sourceId)
            }
            completePinnedSourceIdsMigration()
        } catch {
            for migratedSourceId in migratedSourceIds.reversed() {
                _ = try? await sourceManagement.togglePinned(sourceId: migratedSourceId)
            }
            stateManager.setPinnedSourceIds(previousPinnedSourceIds)
            showOperationFailureToast(fallbackKey: "toast.pinned_migration.failed", fallbackArgument: firstErrorLine(from: error), error: error)
        }
    }

    private func completePinnedSourceIdsMigration() {
        UserDefaults.standard.set(true, forKey: pinnedSourceIdsMigrationKey)
        UserDefaults.standard.removeObject(forKey: legacyPinnedSourceIdsKey)
    }

    private func normalizedPinnedSourceIds(_ sourceIds: [String]) -> [String] {
        var seen = Set<String>()
        var normalized: [String] = []
        for sourceId in sourceIds {
            let trimmed = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, !seen.contains(trimmed) else { continue }
            seen.insert(trimmed)
            normalized.append(trimmed)
        }
        return normalized
    }

    private func groupLabel(for sourceId: String) -> String {
        sourceManagement.summary(for: sourceId)?.sourceDisplayName ?? sourceId
    }

    private func leafLabel(for leafId: String, sourceId: String) -> String {
        sourceManagement.summary(for: sourceId)?.leafs.first(where: { $0.id == leafId })?.name ?? leafId
    }

    private func targetLabel(for targetId: String) -> String {
        AgentDisplayCatalog.label(for: targetId, customAgents: routeState?.settings.customAgents ?? [])
    }

    private func localizedText(_ key: String, _ arguments: String...) -> PresentationText {
        .localized(key, arguments)
    }

    private func localized(_ key: String, _ arguments: String...) -> String {
        PresentationText.localized(key, arguments).resolve(locale: Self.presentationLocale)
    }

    private func firstErrorLine(from error: Error) -> String {
        error.localizedDescription.split(separator: "\n").map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }.first(where: { !$0.isEmpty }) ?? error.localizedDescription
    }

    private func showBridgeCommandFailure(_ response: BridgeResponse) {
        let first = response.errors.first
        let text = DesktopIssuePresentationCatalog.toastText(
            forInternalCode: first?.code,
            locale: Self.presentationLocale
        )
        showToast(style: .error, text: text)
    }

    private func showOperationFailureToast(fallbackKey: String, fallbackArgument: String, error: Error) {
        let text = structuredBridgeFailureToastText(from: error) ?? localizedText(fallbackKey, fallbackArgument)
        showToast(style: .error, text: text)
    }

    private func structuredBridgeFailureToastText(from error: Error) -> PresentationText? {
        guard case BridgeClientError.commandFailed(_, let response) = error,
              let response else {
            return nil
        }
        return DesktopIssuePresentationCatalog.toastText(
            forInternalCode: response.errors.first?.code,
            locale: Self.presentationLocale
        )
    }

    // MARK: - Static Utility Methods (kept for backward compatibility)

    static func isSupportedImportLocator(_ value: String) -> Bool {
        let candidate = normalizedImportLocator(value)
        guard !candidate.isEmpty else { return false }
        let lowercasedCandidate = candidate.lowercased()
        if lowercasedCandidate.hasPrefix("file://"), candidate.count > "file://".count { return true }
        if lowercasedCandidate.hasPrefix("clawhub:"), candidate.count > "clawhub:".count { return true }
        if candidate.hasPrefix("/") || candidate.hasPrefix("~/") { return true }
        if isSupportedGitHTTPSLocator(candidate) { return true }
        if matches(candidate, pattern: #"^git@(github|gitlab)\.com:[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$"#) { return true }
        if matches(candidate, pattern: #"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$"#) { return true }
        return matches(candidate, pattern: #"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?@[A-Za-z0-9_.-]+$"#) ||
               matches(candidate, pattern: #"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?(?:/[A-Za-z0-9_.-]+)+$"#)
    }

    static func normalizedImportLocator(_ value: String) -> String {
        var candidate = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard candidate.count >= 2 else { return candidate }
        let first = candidate.first
        let last = candidate.last
        if (first == "\"" && last == "\"") || (first == "'" && last == "'") {
            candidate.removeFirst(); candidate.removeLast()
            candidate = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return candidate
    }

    private static func isSupportedGitHTTPSLocator(_ candidate: String) -> Bool {
        guard !candidate.containsWhitespace else { return false }
        guard let components = URLComponents(string: candidate), components.scheme?.lowercased() == "https", let host = components.host?.lowercased(), host == "github.com" || host == "gitlab.com" else { return false }
        let pathSegments = components.path.split(separator: "/").filter { !$0.isEmpty }.map(String.init)
        guard pathSegments.count >= 2 else { return false }
        switch host {
        case "github.com": return pathSegments.count == 2 || (pathSegments.count >= 4 && pathSegments[2].lowercased() == "tree")
        case "gitlab.com":
            let treeMarkerIndex = pathSegments.indices.first { index in
                pathSegments[index] == "-"
                    && pathSegments.indices.contains(index + 1)
                    && pathSegments[index + 1] == "tree"
            }

            if let treeMarkerIndex {
                return treeMarkerIndex >= 2 && pathSegments.count >= treeMarkerIndex + 3
            }

            let hasUnsupportedPagePath = pathSegments.contains("-")
                || pathSegments.contains { ["tree", "blob", "issues", "merge_requests"].contains($0) }

            return pathSegments.count >= 2 && !hasUnsupportedPagePath
        default: return false
        }
    }

    private static func matches(_ value: String, pattern: String) -> Bool {
        value.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil
    }

    // MARK: - Document & FileTree Utilities (kept for backward compatibility)

    nonisolated static func parseDetailDocument(_ content: String) -> (metadata: [MetadataEntry], body: String) {
        let lines = content.components(separatedBy: .newlines)
        guard lines.first?.trimmingCharacters(in: .whitespacesAndNewlines) == "---" else {
            return ([], content.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        guard let closingIndex = lines.dropFirst().firstIndex(where: { $0.trimmingCharacters(in: .whitespacesAndNewlines) == "---" }) else {
            return ([], content.trimmingCharacters(in: .whitespacesAndNewlines))
        }
        let frontMatterText = Array(lines[1..<closingIndex]).joined(separator: "\n")
        let metadata = parseFrontmatterEntries(frontMatterText)
        let bodyLines = closingIndex + 1 < lines.count ? Array(lines[(closingIndex + 1)...]) : []
        return (metadata, bodyLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines))
    }

    nonisolated private static func parseFrontmatterEntries(_ frontMatterText: String) -> [MetadataEntry] {
        guard let dictionary = (try? Yams.load(yaml: frontMatterText)) as? [String: Any] else {
            return []
        }
        return dictionary.keys.sorted().compactMap { key in
            guard let value = dictionary[key] else { return nil }
            let renderedValue = stringifyMetadataValue(value)
            return MetadataEntry(id: "\(key):\(renderedValue)", key: key, value: renderedValue)
        }
    }

    nonisolated private static func stringifyMetadataValue(_ value: Any) -> String {
        switch value {
        case let string as String:
            return string
        case let number as NSNumber:
            return number.stringValue
        case let values as [Any]:
            return values.map(stringifyMetadataValue).joined(separator: ", ")
        case let dictionary as [String: Any]:
            return dictionary.keys.sorted()
                .map { "\($0): \(stringifyMetadataValue(dictionary[$0] as Any))" }
                .joined(separator: ", ")
        default:
            return String(describing: value)
        }
    }

    nonisolated static func documentDescriptors(_ tabs: [DocumentTab]) -> [DocumentDescriptor] {
        tabs.map { DocumentDescriptor(id: $0.id, title: $0.title, path: $0.path, metadata: $0.metadata, renderCacheKey: $0.renderCacheKey, externalURL: $0.externalURL) }
    }

    nonisolated static func documentDescriptor(for tab: DocumentTab) -> DocumentDescriptor {
        DocumentDescriptor(id: tab.id, title: tab.title, path: tab.path, metadata: tab.metadata, renderCacheKey: tab.renderCacheKey, externalURL: tab.externalURL)
    }

    nonisolated static func placeholderDocumentTabs(_ descriptors: [DocumentDescriptor]) -> [DocumentTab] {
        descriptors.map { DocumentTab(id: $0.id, title: $0.title, path: $0.path, metadata: $0.metadata, content: "", renderCacheKey: $0.renderCacheKey, externalURL: $0.externalURL, isLoaded: false) }
    }

    nonisolated static func detailRevision(
        sourceId: String,
        title: String,
        originalDisplayName: String,
        subtitle: String,
        author: String,
        originLabel: String,
        starCount: Int?,
        groupStats: GroupCardStats,
        sourceDetailLines: [String],
        sourceRepositoryURL: String?,
        locator: String,
        groupPath: String?,
        updatedAt: String,
        updatedRelative: String,
        health: String,
        warningCount: Int,
        errorCount: Int,
        enabledSkillCount: Int,
        totalSkillCount: Int,
        enabledTargetCount: Int,
        saveState: SaveState,
        skillSelection: SelectionState,
        targetSelection: SelectionState,
        enabledTargetLabels: [String],
        sourceFacts: [String],
        deploymentFacts: [String],
        fileTree: [FileTreeItem],
        groupDocuments: [DocumentDescriptor],
        targets: [DetailTarget],
        skills: [DetailSkill]
    ) -> String {
        let components: [String] = [
            sourceId,
            title,
            originalDisplayName,
            subtitle,
            author,
            originLabel,
            starCount.map(String.init) ?? "",
            detailSignature(groupStats),
            sourceDetailLines.joined(separator: "\u{1f}"),
            sourceRepositoryURL ?? "",
            locator,
            groupPath ?? "",
            updatedAt,
            updatedRelative,
            health,
            String(warningCount),
            String(errorCount),
            String(enabledSkillCount),
            String(totalSkillCount),
            String(enabledTargetCount),
            detailSignature(saveState),
            detailSignature(skillSelection),
            detailSignature(targetSelection),
            enabledTargetLabels.joined(separator: "\u{1f}"),
            sourceFacts.joined(separator: "\u{1f}"),
            deploymentFacts.joined(separator: "\u{1f}"),
            detailSignature(fileTree),
            detailSignature(groupDocuments),
            detailSignature(targets),
            detailSignature(skills)
        ]
        return components.joined(separator: "\u{1e}")
    }

    nonisolated private static func detailSignature(_ value: Any) -> String {
        String(describing: value)
    }

    nonisolated static func preferredDetailGroupTitle(
        sourceId: String,
        displayName: String?,
        snapshotTitle: String?,
        locator: String
    ) -> String {
        if let displayName = sanitizedDetailTitle(displayName) {
            return displayName
        }
        if let snapshotTitle = snapshotTitle?.nonEmpty { return snapshotTitle }
        return detailTitleFallback(from: locator, sourceId: sourceId)
    }

    nonisolated static func preferredDetailSkillTitle(
        preparedTitle: String?,
        payloadTitle: String?,
        projectedName: String?,
        snapshotTitle: String?,
        rawLeafName: String?,
        fallbackLinkName: String?
    ) -> String {
        if let preparedTitle, !preparedTitle.isEmpty { return preparedTitle }
        if let payloadTitle, !payloadTitle.isEmpty { return payloadTitle }
        if let projectedName, !projectedName.isEmpty { return projectedName }
        if let snapshotTitle, !snapshotTitle.isEmpty { return snapshotTitle }
        if let rawLeafName = sanitizedDetailTitle(rawLeafName) { return rawLeafName }
        return fallbackLinkName ?? ""
    }

    nonisolated private static func sanitizedDetailTitle(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else {
            return nil
        }

        let lowercase = trimmed.lowercased()
        let rejectedFragments = [
            "zsh-compatible:",
            "use find",
            "no such file",
            "command not found",
            "permission denied",
        ]
        if rejectedFragments.contains(where: { lowercase.contains($0) }) {
            return nil
        }

        return trimmed
    }

    nonisolated private static func detailTitleFallback(from locator: String, sourceId: String) -> String {
        let trimmed = locator
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ".git", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))

        guard !trimmed.isEmpty else {
            return sourceId
        }

        if locator.hasPrefix("clawhub:"),
           let slug = locator.split(separator: ":").last?.split(separator: "@").first {
            return String(slug.split(separator: "/").last ?? Substring(sourceId))
        }

        return trimmed.split(separator: "/").last.map(String.init) ?? sourceId
    }
}

extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
    var containsWhitespace: Bool { rangeOfCharacter(from: .whitespacesAndNewlines) != nil }
}

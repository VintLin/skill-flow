import Foundation
import Observation
import Yams

@MainActor
@Observable
final class MainViewModel {
    enum Page: Equatable {
        case home
        case importPage
        case settings
        case detail(sourceId: String)
    }

    enum LoadState {
        case idle
        case loading
        case ready
        case failed(String)
    }

    enum Section: String, CaseIterable, Identifiable {
        case overview = "Overview"
        case sources = "Sources"
        case skills = "Skills"
        case targets = "Targets"
        case deployments = "Deployments"
        case doctor = "Doctor"
        case activity = "Activity"
        case settings = "Settings"

        var id: String { rawValue }
    }

    enum PageViewState {
        case loading
        case empty
        case error(String)
        case partial
        case success
    }

    enum SavePhase: String, Equatable {
        case idle
        case saving
        case saved
        case failed
    }

    struct SaveState: Equatable {
        var phase: SavePhase
        var detail: String?
    }

    enum ToastStyle {
        case loading
        case success
        case neutral
        case error
    }

    enum PresentationText: Equatable {
        case plain(String)
        case localized(String, [String] = [])

        func resolve(locale: Locale) -> String {
            switch self {
            case .plain(let value):
                return value
            case .localized(let key, let arguments):
                return L10n.string(key, locale: locale, arguments: arguments.map { $0 as CVarArg })
            }
        }
    }

    enum HealthStatus: Equatable {
        case unknown
        case healthy
        case warnings
        case error

        var menuIconSystemName: String {
            switch self {
            case .healthy:
                return "checkmark.circle"
            case .warnings:
                return "exclamationmark.triangle"
            case .error:
                return "xmark.circle"
            case .unknown:
                return "circle"
            }
        }
    }

    struct ToastState: Identifiable, Equatable {
        let id: UUID
        let style: ToastStyle
        let text: PresentationText

        var message: String {
            text.resolve(locale: MainViewModel.presentationLocale)
        }

        init(id: UUID = UUID(), style: ToastStyle, message: String) {
            self.id = id
            self.style = style
            self.text = .plain(message)
        }

        init(id: UUID = UUID(), style: ToastStyle, text: PresentationText) {
            self.id = id
            self.style = style
            self.text = text
        }
    }

    struct TargetOption: Identifiable {
        let id: String
        let label: String
    }

    struct SourceRow: Identifiable {
        let id: String
        let displayName: String
        let locator: String
        let kind: String
        let skillCount: Int
        let status: String
        let lastUpdate: String
        let warningCount: Int
        let errorCount: Int
    }

    struct GroupCardSkill: Identifiable {
        let id: String
        let label: String
        let description: String
        let isEnabled: Bool
        let highlightQuery: String?

        init(
            id: String,
            label: String,
            description: String,
            isEnabled: Bool,
            highlightQuery: String? = nil
        ) {
            self.id = id
            self.label = label
            self.description = description
            self.isEnabled = isEnabled
            self.highlightQuery = highlightQuery
        }
    }

    struct GroupCardTarget: Identifiable {
        let id: String
        let label: String
        let shortLabel: String
        let isEnabled: Bool
    }

    struct GroupCardStats: Equatable {
        let skillCount: Int?
        let downloadCount: Int?
        let starCount: Int?
        let githubURL: String?
    }

    struct GroupCardModel: Identifiable {
        let id: String
        let title: String
        let subtitle: String
        let metaLine: String
        let byline: String?
        let isPinned: Bool
        let health: String
        let warningCount: Int
        let errorCount: Int
        let skillSelection: SelectionState
        let targetSelection: SelectionState
        let stats: GroupCardStats
        let skillsLoading: Bool
        let targetsLoading: Bool
        let sourceFacts: [String]
        let skills: [GroupCardSkill]
        let targets: [GroupCardTarget]
        let saveState: SaveState
    }

    struct DetailSkill: Identifiable, Sendable {
        let id: String
        let title: String
        let summary: String
        let version: String?
        let author: String
        let originLabel: String
        let starCount: Int?
        let folderPath: String?
        let relativeFolderPath: String?
        let documents: [DocumentTab]
        let detailLines: [String]
        let documentContent: String
        let isEnabled: Bool
        let warningCount: Int
    }

    struct MetadataEntry: Identifiable, Equatable, Sendable {
        let id: String
        let key: String
        let value: String
    }

    struct DocumentTab: Identifiable, Equatable, Sendable {
        let id: String
        let title: String
        let path: String
        let metadata: [MetadataEntry]
        let content: String
        let renderCacheKey: String
        let externalURL: String?
    }

    struct DetailTarget: Identifiable, Sendable {
        let id: String
        let label: String
        let shortLabel: String
        let isEnabled: Bool
    }

    struct FileTreeLine: Identifiable, Sendable {
        let id: String
        let depth: Int
        let prefix: String
        let title: String
        let isFile: Bool
    }

    struct FileTreeItem: Identifiable, Equatable, Sendable {
        let id: String
        let title: String
        let path: String
        let isDirectory: Bool
        let isSkillRoot: Bool
        let isSkillDocument: Bool
        let skillId: String?
        let children: [FileTreeItem]
    }

    private struct SourceMetadataPresentation {
        let lines: [String]
        let starCount: Int?
        let repositoryURL: String?
    }

    struct SnapshotTrust: Equatable, Sendable {
        let official: Bool
        let trending: Bool
        let hot: Bool
        let audited: Bool

        var labels: [String] {
            var values: [String] = []
            if official { values.append("Official") }
            if trending { values.append("Trending") }
            if hot { values.append("Hot") }
            if audited { values.append("Audited") }
            return values
        }
    }

    struct SnapshotOwner: Equatable, Sendable {
        let slug: String
        let sourceURL: String
        let githubURL: String?
        let sourceCount: Int?
        let skillCount: Int?
        let totalInstalls: Int?
    }

    struct SnapshotInstalledOn: Equatable, Sendable {
        let agent: String
        let installs: Int?
    }

    struct SnapshotAudits: Equatable, Sendable {
        let gen: String?
        let socket: String?
        let snyk: String?
        let riskLevel: String?
    }

    struct SnapshotSkill: Equatable, Sendable {
        let skillId: String
        let title: String
        let installs: Int?
        let weeklyInstalls: Int?
        let firstSeen: String?
        let summary: String
        let installedOn: [SnapshotInstalledOn]
        let audits: SnapshotAudits?
    }

    struct SourceSnapshotData: Equatable, Sendable {
        let canonicalRepo: String
        let title: String
        let provider: String
        let sourceURL: String
        let repoURL: String
        let repoLabel: String
        let totalInstalls: Int?
        let skillCount: Int?
        let repoStars: Int?
        let forkCount: Int?
        let description: String
        let topics: [String]
        let language: String?
        let defaultBranch: String?
        let pushedAt: String?
        let owner: SnapshotOwner
        let skills: [SnapshotSkill]
        let trust: SnapshotTrust?
    }

    struct ImportMatchedSkill: Equatable {
        let skillId: String
        let title: String
        let installs: Int?
    }

    struct DetailViewData {
        let sourceId: String
        let title: String
        let subtitle: String
        let author: String
        let originLabel: String
        let starCount: Int?
        let groupStats: GroupCardStats
        let sourceDetailLines: [String]
        let sourceRepositoryURL: String?
        let locator: String
        let groupPath: String?
        let updatedAt: String
        let updatedRelative: String
        let health: String
        let warningCount: Int
        let errorCount: Int
        let enabledSkillCount: Int
        let totalSkillCount: Int
        let enabledTargetCount: Int
        let saveState: SaveState
        let skillSelection: SelectionState
        let targetSelection: SelectionState
        let enabledTargetLabels: [String]
        let sourceFacts: [String]
        let deploymentFacts: [String]
        let fileTree: [FileTreeItem]
        let groupDocuments: [DocumentTab]
        let targets: [DetailTarget]
        let skills: [DetailSkill]
    }

    enum ImportLoadPhase: Equatable {
        case idle
        case loading
        case ready
        case failed(PresentationText)
    }

    struct ImportGroupSkill: Identifiable, Equatable {
        let id: String
        let title: String
        let summary: String
        let selectedByDefault: Bool
    }

    struct ImportGroupTarget: Identifiable, Equatable {
        let id: String
        let selectedByDefault: Bool
    }

    struct ImportGroupItem: Identifiable, Equatable {
        let id: String
        let title: String
        let locator: String
        let canonicalRepo: String
        let isInstalledLocally: Bool
        let aliases: [String]
        let summary: String
        let starCount: Int?
        let totalInstalls: Int?
        let skillCount: Int?
        let matchedSkillNames: [String]
        let matchedSkills: [ImportMatchedSkill]
        let snapshot: SourceSnapshotData?
        let enrichPhase: ImportLoadPhase
        let previewPhase: ImportLoadPhase
        let skills: [ImportGroupSkill]
        let targets: [ImportGroupTarget]
    }

    struct DeploymentRow: Identifiable {
        let id: String
        let kind: String
        let skill: String
        let target: String
        let path: String
        let result: String
    }

    struct DeploymentSummary {
        let create: Int
        let update: Int
        let remove: Int
        let blocked: Int
        let noop: Int

        static let empty = DeploymentSummary(create: 0, update: 0, remove: 0, blocked: 0, noop: 0)
    }

    struct DoctorIssueRow: Identifiable {
        let id: String
        let severity: String
        let code: String
        let message: String
        let sourceId: String
        let target: String
    }

    private struct LeafSummary: Sendable {
        let id: String
        let linkName: String
        let name: String
        let description: String
        let metadataWarnings: [String]
    }

    private struct DraftState: Equatable {
        var selectedLeafIds: [String]
        var enabledTargets: [String]
    }

    private struct WorkflowSummary: Sendable {
        let sourceId: String
        let sourceKind: String
        let sourceDisplayName: String
        let sourceLocator: String
        let sourceCanonicalRepo: String?
        let leafs: [LeafSummary]
        let selectedLeafIds: [String]
        let enabledTargets: [String]
        let targetLeafIdsByTarget: [String: [String]]
        let health: String
        let warningCount: Int
        let errorCount: Int
        let updatedAt: String
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

    private struct GitHubRepoContext: Sendable {
        let owner: String
        let repo: String
        let revision: String
    }

    private struct PreparedDetailSkillContent: Sendable {
        let title: String
        let version: String?
        let folderPath: String?
        let relativeFolderPath: String?
        let documents: [DocumentTab]
        let documentContent: String
    }

    private struct PreparedDetailContent: Sendable {
        let groupPath: String?
        let fileTree: [FileTreeItem]
        let groupDocuments: [DocumentTab]
        let skillsByLeafId: [String: PreparedDetailSkillContent]
    }

    private struct PreparedDetailLeafInput: Sendable {
        let id: String
        let linkName: String
        let name: String
        let description: String
        let warningCount: Int
        let skillFilePath: String?
        let relativePath: String?
        let absolutePath: String?
        let title: String?
    }

    private struct PreparedDetailWarmupInput: Sendable {
        let summary: WorkflowSummary
        let sourceLocator: String
        let sourceSnapshot: SourceSnapshotData?
        let groupPath: String?
        let gitHubRepoContext: GitHubRepoContext?
        let projectedNamesByLeafId: [String: String]
        let leaves: [PreparedDetailLeafInput]
    }

    private let bridgeClient: BridgeClient
    private let queryFacade: any DesktopQuerying
    private let commandFacade: any DesktopCommanding
    private let mutationCoordinator: DesktopMutationCoordinator

    nonisolated private static var presentationLocale: Locale {
        let rawValue = UserDefaults.standard.string(forKey: DesktopLanguage.storageKey) ?? DesktopLanguage.system.rawValue
        return DesktopLanguage(storageValue: rawValue).locale
    }

    @MainActor static var currentDateProvider: () -> Date = Date.init

    private static var targetOrder: [String] { AgentDisplayCatalog.defaultTargetOrder }

    private let legacyPinnedSourceIdsKey = "desktop.pinnedSourceIds"
    private let pinnedSourceIdsMigrationKey = "desktop.pinnedSourceIds.migratedToSharedPreferences"
    private let deferredDraftSyncDelay: Duration = .milliseconds(250)
    private let recommendationsProvider: () -> [ImportRecommendationEntry]
    private var workingDrafts: [String: DraftState] = [:]
    private var detectedTargets: Set<String> = []
    private var inspectedPayloadBySourceId: [String: [String: Any]] = [:]
    private var detailEnrichmentPayloadBySourceId: [String: [String: Any]] = [:]
    private var preparedDetailContentBySourceId: [String: PreparedDetailContent] = [:]
    @ObservationIgnored private var listRequestTask: Task<BridgeResponse, Error>?
    private var listRequestToken: UInt64 = 0
    private var activeListRequestToken: UInt64?
    @ObservationIgnored private var doctorRequestTask: Task<BridgeResponse, Error>?
    private var doctorRequestToken: UInt64 = 0
    private var activeDoctorRequestToken: UInt64?
    @ObservationIgnored private var inspectRequestTasksBySourceId: [String: Task<BridgeResponse, Error>] = [:]
    private var inspectRequestTokensBySourceId: [String: UInt64] = [:]
    private var inspectRequestTokenSeed: UInt64 = 0
    @ObservationIgnored private var detailEnrichmentTasksBySourceId: [String: Task<Void, Never>] = [:]
    private var detailEnrichmentTokensBySourceId: [String: UInt64] = [:]
    private var detailEnrichmentTokenSeed: UInt64 = 0
    @ObservationIgnored private var detailWarmupTasksBySourceId: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var importSearchTasksByQuery: [String: Task<BridgeResponse, Error>] = [:]
    private var importSearchTokensByQuery: [String: UInt64] = [:]
    private var importSearchTokenSeed: UInt64 = 0
    @ObservationIgnored private var importPreviewTasksByGroupId: [String: Task<BridgeResponse, Error>] = [:]
    private var importPreviewTokensByGroupId: [String: UInt64] = [:]
    private var importPreviewTokenSeed: UInt64 = 0
    @ObservationIgnored private var deferredDraftSyncTask: Task<Void, Never>?
    private var pendingDraftSyncSourceIds: Set<String> = []

    private var allSummaries: [WorkflowSummary] = []

    var loadState: LoadState = .idle
    var selectedSection: Section = .overview

    var sourceIds: [String] = []
    var selectedSourceId: String?
    var searchQuery: String = ""
    var importSubmittedQuery: String = ""
    var importSearchPhase: ImportLoadPhase = .idle
    var recommendedImportGroups: [ImportGroupItem] = []
    var searchImportGroups: [ImportGroupItem] = []
    var importingImportGroupId: String?
    @ObservationIgnored private weak var routeState: DesktopAppState?

    var healthStatus: HealthStatus = .unknown
    var latestWarnings: [BridgeIssue] = []

    var inspectorVisible: Bool = true
    var compactSidebarVisible: Bool = true
    var showAllTargets: Bool = false

    var isRefreshing: Bool = false
    var updatingSourceIds: Set<String> = []
    var saveStateBySourceId: [String: SaveState] = [:]
    var toast: ToastState?

    var doctorIssues: [DoctorIssueRow] = []
    var lastDoctorError: String?

    var deploymentFilterTarget: String = "All"
    var deploymentFilterKind: String = "All"
    var pinnedSourceIds: [String]

    init(
        bridgeClient: BridgeClient,
        queryFacade: (any DesktopQuerying)? = nil,
        commandFacade: (any DesktopCommanding)? = nil,
        mutationCoordinator: DesktopMutationCoordinator? = nil,
        recommendationsProvider: @escaping () -> [ImportRecommendationEntry] = { ImportRecommendationLoader.load() }
    ) {
        let resolvedQueryFacade = queryFacade ?? DesktopBridgeQueryFacade(bridgeClient: bridgeClient)
        let resolvedCommandFacade = commandFacade ?? DesktopBridgeCommandFacade(bridgeClient: bridgeClient)
        let resolvedMutationCoordinator = mutationCoordinator ?? DesktopMutationCoordinator(commandFacade: resolvedCommandFacade)

        self.bridgeClient = bridgeClient
        self.queryFacade = resolvedQueryFacade
        self.commandFacade = resolvedCommandFacade
        self.mutationCoordinator = resolvedMutationCoordinator
        self.recommendationsProvider = recommendationsProvider
        self.pinnedSourceIds = []
    }

    func bindRouteState(_ state: DesktopAppState) {
        routeState = state
    }

    var availableGroups: [String] {
        sourceIds
    }

    var selectedGroupId: String? {
        selectedSourceId
    }

    var isUpdatingCurrentGroup: Bool {
        guard let selectedSourceId else {
            return false
        }
        return updatingSourceIds.contains(selectedSourceId)
    }

    var currentRoute: DesktopRoute {
        routeState?.view.currentRoute ?? .home
    }

    private var selectedDetailInspectSourceId: String? {
        currentDetailSourceId
    }

    private var currentDetailSourceId: String? {
        guard case .detail(let sourceId) = currentRoute else {
            return nil
        }
        return sourceId
    }

    var selectedGroupSourceIds: [String] {
        guard let selectedSourceId, let summary = allSummaries.first(where: { $0.sourceId == selectedSourceId }) else {
            return []
        }
        if summary.sourceKind == "clawhub" {
            return allSummaries
                .filter { $0.sourceKind == "clawhub" }
                .map(\.sourceId)
        }
        return [selectedSourceId]
    }

    var visibleTargets: [TargetOption] {
        let targetIds = visibleTargetIds()

        return targetIds.map { target in
            TargetOption(id: target, label: AgentDisplayCatalog.label(for: target))
        }
    }

    var detectedTargetIdsForSettings: [String] {
        AgentDisplayCatalog.orderedTargetIds(in: detectedTargets)
    }

    var sourceRows: [SourceRow] {
        sourceRows(matching: searchQuery)
    }

    func sourceRows(matching rawQuery: String) -> [SourceRow] {
        let query = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let summaries = query.isEmpty
            ? allSummaries
            : allSummaries.filter { summary in
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
                skillCount: summary.leafs.count,
                status: summary.health,
                lastUpdate: summary.updatedAt,
                warningCount: summary.warningCount,
                errorCount: summary.errorCount
            )
        }
        if query.isEmpty {
            return sortedSourceRows(rows)
        }
        return sortedSourceRows(rows)
    }

    var groupCards: [GroupCardModel] {
        groupCards(matching: searchQuery)
    }

    func groupCards(matching rawQuery: String) -> [GroupCardModel] {
        sourceRows(matching: rawQuery).compactMap { row in
            guard let summary = summary(for: row.id), let draft = draft(for: row.id) else {
                return nil
            }

            let enabledLeafIds = Set(draft.selectedLeafIds)
            let enabledTargets = Set(draft.enabledTargets)
            let metadata = groupCardMetadata(sourceId: row.id, summary: summary, row: row)

            return GroupCardModel(
                id: row.id,
                title: row.displayName,
                subtitle: subtitleText(locator: row.locator, kind: row.kind),
                metaLine: "from \(row.locator.isEmpty ? row.kind : row.locator)",
                byline: metadata.byline,
                isPinned: pinnedSourceIds.contains(row.id),
                health: row.status,
                warningCount: row.warningCount,
                errorCount: row.errorCount,
                skillSelection: skillSelectionState(sourceId: row.id),
                targetSelection: targetSelectionState(sourceId: row.id),
                stats: metadata.stats,
                skillsLoading: false,
                targetsLoading: false,
                sourceFacts: [],
                skills: summary.leafs.map { leaf in
                    GroupCardSkill(
                        id: leaf.id,
                        label: leaf.name,
                        description: leaf.description,
                        isEnabled: enabledLeafIds.contains(leaf.id)
                    )
                },
                targets: visibleTargetIds().map { targetId in
                    GroupCardTarget(
                        id: targetId,
                        label: AgentDisplayCatalog.label(for: targetId),
                        shortLabel: AgentDisplayCatalog.shortLabel(for: targetId),
                        isEnabled: enabledTargets.contains(targetId)
                    )
                },
                saveState: saveStateBySourceId[row.id] ?? SaveState(phase: .idle, detail: nil)
            )
        }
    }

    func sourceCanonicalRepo(for sourceId: String) -> String? {
        summary(for: sourceId)?.sourceCanonicalRepo
    }

    func sourceLocator(for sourceId: String) -> String? {
        summary(for: sourceId)?.sourceLocator
    }

    func prefetchHomeGroupCardMetadataIfNeeded(_ sourceIds: [String]) async {
        guard currentRoute == .home else {
            return
        }
        for sourceId in sourceIds {
            guard currentRoute == .home else {
                return
            }
            guard detailEnrichmentPayloadBySourceId[sourceId] == nil else {
                continue
            }
            guard detailEnrichmentTasksBySourceId[sourceId] == nil else {
                continue
            }
            scheduleDetailEnrichmentFetch(sourceId: sourceId)
        }
    }

    func togglePinned(sourceId: String) async {
        let previousPinnedSourceIds = pinnedSourceIds
        pinnedSourceIds = toggledPinnedSourceIds(from: pinnedSourceIds, sourceId: sourceId)

        do {
            let result = try await mutationCoordinator.togglePinned(sourceId: sourceId)
            pinnedSourceIds = result.pinnedSourceIds
        } catch {
            pinnedSourceIds = previousPinnedSourceIds
            showToast(style: .error, text: localizedText("toast.pin.failed", firstErrorLine(from: error)))
        }
    }

    private func sortedSourceRows(_ rows: [SourceRow]) -> [SourceRow] {
        rows.sorted { lhs, rhs in
            let leftRank = pinRank(for: lhs.id)
            let rightRank = pinRank(for: rhs.id)
            if leftRank != rightRank {
                return leftRank < rightRank
            }
            return lhs.displayName.localizedCaseInsensitiveCompare(rhs.displayName) == .orderedAscending
        }
    }

    private func pinRank(for sourceId: String) -> Int {
        pinnedSourceIds.firstIndex(of: sourceId) ?? Int.max
    }

    private func subtitleText(locator: String, kind: String) -> String {
        if let handle = Self.authorHandle(from: locator) {
            return "by \(handle)"
        }
        return "by \(kind.lowercased())"
    }

    private func groupCardMetadata(
        sourceId: String,
        summary: WorkflowSummary,
        row: SourceRow
    ) -> (byline: String, stats: GroupCardStats) {
        let payload = detailEnrichmentPayloadBySourceId[sourceId] ?? [:]
        let sourceSnapshot = parseSourceSnapshot(payload["sourceSnapshot"] as? [String: Any])
        let sourceMetadata = (payload["sourceMetadata"] as? [String: Any])?["data"] as? [String: Any]

        let byline = sourceSnapshot.map { "by @\($0.owner.slug)" }
            ?? ((sourceMetadata?["ownerHandle"] as? String)?.nonEmpty.map { "by \($0)" })
            ?? subtitleText(locator: row.locator, kind: row.kind)

        let stats = GroupCardStats(
            skillCount: sourceSnapshot?.skillCount ?? summary.leafs.count,
            downloadCount: sourceSnapshot?.totalInstalls
                ?? sourceMetadata?["totalInstalls"] as? Int
                ?? sourceMetadata?["downloadCount"] as? Int,
            starCount: sourceSnapshot?.repoStars ?? sourceMetadata?["starCount"] as? Int,
            githubURL: sourceSnapshot?.repoURL ?? (sourceMetadata?["repoUrl"] as? String)?.nonEmpty
        )

        return (byline, stats)
    }

    var deploymentSummary: DeploymentSummary {
        guard !deploymentRows.isEmpty else { return .empty }
        var create = 0
        var update = 0
        var remove = 0
        var blocked = 0
        var noop = 0

        for row in deploymentRows {
            switch row.kind {
            case "create": create += 1
            case "remove": remove += 1
            case "blocked": blocked += 1
            case "noop": noop += 1
            default: update += 1
            }
        }

        return DeploymentSummary(
            create: create,
            update: update,
            remove: remove,
            blocked: blocked,
            noop: noop
        )
    }

    var deploymentTargets: [String] {
        let targets = Set(deploymentRows.map(\.target))
        return ["All"] + targets.sorted()
    }

    var deploymentKinds: [String] {
        ["All", "create", "update", "remove", "blocked", "noop"]
    }

    var filteredDeploymentRows: [DeploymentRow] {
        deploymentRows.filter { row in
            (deploymentFilterTarget == "All" || row.target == deploymentFilterTarget)
                && (deploymentFilterKind == "All" || row.kind == deploymentFilterKind)
        }
    }

    var overviewState: PageViewState {
        switch loadState {
        case .loading:
            return .loading
        case .failed(let message):
            return .error(message)
        case .idle:
            return .loading
        case .ready:
            if sourceRows.isEmpty {
                return .empty
            }
            if !latestWarnings.isEmpty {
                return .partial
            }
            return .success
        }
    }

    var sourcesState: PageViewState {
        switch loadState {
        case .loading:
            return .loading
        case .failed(let message):
            return .error(message)
        case .idle:
            return .loading
        case .ready:
            if sourceRows.isEmpty {
                return .empty
            }
            if sourceRows.contains(where: { $0.warningCount > 0 || $0.errorCount > 0 }) {
                return .partial
            }
            return .success
        }
    }

    var deploymentsState: PageViewState {
        switch loadState {
        case .loading:
            return .loading
        case .failed(let message):
            return .error(message)
        case .idle:
            return .loading
        case .ready:
            if filteredDeploymentRows.isEmpty {
                return .empty
            }
            if filteredDeploymentRows.contains(where: { $0.kind == "blocked" }) {
                return .partial
            }
            return .success
        }
    }

    var doctorState: PageViewState {
        if let lastDoctorError {
            return .error(lastDoctorError)
        }
        if doctorIssues.isEmpty {
            return .empty
        }
        if doctorIssues.contains(where: { $0.severity == "error" || $0.severity == "warning" }) {
            return .partial
        }
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
        guard let groupId = selectedGroupId else {
            return SaveState(phase: .idle, detail: nil)
        }
        return saveStateBySourceId[groupId] ?? SaveState(phase: .idle, detail: nil)
    }

    func saveState(for sourceId: String) -> SaveState {
        saveStateBySourceId[sourceId] ?? SaveState(phase: .idle, detail: nil)
    }

    func isSaving(sourceId: String? = nil) -> Bool {
        saveState(for: resolveSourceId(sourceId) ?? "").phase == .saving
    }

    func skillSelectionState(sourceId: String? = nil) -> SelectionState {
        guard let summary = summary(for: sourceId), let draft = draft(for: sourceId) else {
            return .empty
        }
        let treeState = TreeSelectionState(
            allLeafIds: summary.leafs.map(\.id),
            selectedLeafIds: draft.selectedLeafIds
        )
        return getParentSelectionState(treeState)
    }

    func targetSelectionState(sourceId: String? = nil) -> SelectionState {
        guard let draft = draft(for: sourceId) else {
            return .empty
        }
        let targetIds = visibleTargetIds()
        guard !targetIds.isEmpty else {
            return .empty
        }
        let enabledTargets = Set(draft.enabledTargets)
        let selectedTargets = targetIds.filter { enabledTargets.contains($0) }
        return selectionState(allIds: targetIds, selectedIds: selectedTargets)
    }

    func isSkillEnabled(_ leafId: String, sourceId: String? = nil) -> Bool {
        draft(for: sourceId)?.selectedLeafIds.contains(leafId) == true
    }

    func toggleAllSkills(sourceId: String? = nil) async {
        guard let sourceId = resolveSourceId(sourceId), let summary = summary(for: sourceId), var draft = draft(for: sourceId) else {
            return
        }
        guard !isSaving(sourceId: sourceId) else {
            return
        }

        let treeState = TreeSelectionState(
            allLeafIds: summary.leafs.map(\.id),
            selectedLeafIds: draft.selectedLeafIds
        )
        let nextState = toggleParent(treeState)
        draft.selectedLeafIds = nextState.selectedLeafIds
        await commitDraftChange(
            sourceId: sourceId,
            nextDraft: draft,
            successMessage: compactSkillsToastMessage(sourceId: sourceId, enabled: !nextState.selectedLeafIds.isEmpty),
            successStyle: nextState.selectedLeafIds.isEmpty ? .neutral : .success
        )
    }

    func setSkillEnabled(_ leafId: String, enabled: Bool, sourceId: String? = nil) async {
        guard let sourceId = resolveSourceId(sourceId), let summary = summary(for: sourceId), var draft = draft(for: sourceId) else {
            return
        }
        guard !isSaving(sourceId: sourceId) else {
            return
        }
        guard summary.leafs.contains(where: { $0.id == leafId }) else {
            return
        }

        let selectedLeafIds = Set(draft.selectedLeafIds)
        guard selectedLeafIds.contains(leafId) != enabled else {
            return
        }

        let nextSelectedLeafIds: [String]
        if enabled {
            nextSelectedLeafIds = summary.leafs
                .map(\.id)
                .filter { selectedLeafIds.union([leafId]).contains($0) }
        } else {
            nextSelectedLeafIds = summary.leafs
                .map(\.id)
                .filter { selectedLeafIds.subtracting([leafId]).contains($0) }
        }

        draft.selectedLeafIds = nextSelectedLeafIds
        await commitDraftChange(
            sourceId: sourceId,
            nextDraft: draft,
            successMessage: compactSkillToastMessage(sourceId: sourceId, leafId: leafId, enabled: enabled),
            successStyle: enabled ? .success : .neutral
        )
    }

    func toggleAllTargets(sourceId: String? = nil) async {
        guard let sourceId = resolveSourceId(sourceId), var draft = draft(for: sourceId) else {
            return
        }
        guard !isSaving(sourceId: sourceId) else {
            return
        }

        let targetIds = visibleTargetIds()
        guard !targetIds.isEmpty else {
            return
        }
        let visibleEnabledTargets = draft.enabledTargets.filter { targetIds.contains($0) }

        let treeState = TreeSelectionState(
            allLeafIds: targetIds,
            selectedLeafIds: visibleEnabledTargets
        )
        let nextState = toggleParent(treeState)
        let hiddenTargets = draft.enabledTargets.filter { !targetIds.contains($0) }
        draft.enabledTargets = normalizedTargets(hiddenTargets + nextState.selectedLeafIds)
        await commitDraftChange(
            sourceId: sourceId,
            nextDraft: draft,
            successMessage: compactAgentsToastMessage(sourceId: sourceId, enabled: !draft.enabledTargets.isEmpty),
            successStyle: draft.enabledTargets.isEmpty ? .neutral : .success
        )
    }

    private var deploymentRows: [DeploymentRow] {
        var rows: [DeploymentRow] = []

        for summary in allSummaries {
            let draft = draft(for: summary.sourceId) ?? buildInitialDraftFromSummary(summary)
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
                let targetLabel = AgentDisplayCatalog.label(for: target)

                if selectedLeafIds.isEmpty {
                    rows.append(
                        DeploymentRow(
                            id: "blocked-\(summary.sourceId)-\(target)",
                            kind: "blocked",
                            skill: "-",
                            target: targetLabel,
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
                            target: targetLabel,
                            path: "~/.skillflow/<target>/\(leafId)",
                            result: summary.health
                        )
                    )
                }
            }
        }

        return rows
    }

    func bootstrap() async {
        loadState = .loading
        do {
            let bootstrap = try await bridgeClient.bootstrap()
            latestWarnings = bootstrap.warnings
            parseBootstrapData(bootstrap.data?.value)
            await migrateLegacyPinnedSourceIdsIfNeeded()

            loadState = .ready
            healthStatus = bootstrap.warnings.isEmpty ? .healthy : .warnings
            Task { [weak self] in
                await self?.prefetchRecommendedImportGroupsIfNeeded()
            }
        } catch {
            loadState = .failed(error.localizedDescription)
            healthStatus = .error
        }
    }

    func refreshList() async {
        isRefreshing = true
        defer { isRefreshing = false }

        do {
            let response = try await fetchListResponse()
            applyList(response)
            latestWarnings = response.warnings
            healthStatus = response.warnings.isEmpty ? .healthy : .warnings
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    func selectSource(_ sourceId: String) async {
        selectedSourceId = sourceId
        do {
            let response = try await fetchInspectResponse(sourceId: sourceId)
            if let payload = response.data?.value as? [String: Any] {
                inspectedPayloadBySourceId[sourceId] = payload
                preparedDetailContentBySourceId.removeValue(forKey: sourceId)
                scheduleDetailContentWarmupIfNeeded(sourceId: sourceId)
                scheduleDetailEnrichmentFetch(sourceId: sourceId)
            }
            latestWarnings = response.warnings
        } catch {
            showToast(style: .error, text: localizedText("toast.details.load_failed", sourceId))
        }
    }

    func runDoctor() async {
        do {
            let response = try await fetchDoctorResponse()
            latestWarnings = response.warnings
            healthStatus = response.warnings.isEmpty ? .healthy : .warnings
            lastDoctorError = nil
            doctorIssues = parseDoctorIssues(response.data?.value)
        } catch {
            healthStatus = .error
            lastDoctorError = error.localizedDescription
        }
    }

    func updateAll() async {
        do {
            cancelDeferredDraftSync()
            let response = try await bridgeClient.updateAll()
            await synchronizeState(refreshDoctor: true, inspectSourceId: selectedDetailInspectSourceId)
            showToast(style: .success, text: .plain(updateSummaryMessage(from: response.data?.value, fallbackCount: sourceIds.count)))
        } catch {
            showToast(style: .error, text: localizedText("toast.update.failed", error.localizedDescription))
        }
    }

    func updateAllGroupsFromHome() async {
        let sourceIds = self.sourceIds
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        guard !sourceIds.isEmpty else {
            showToast(style: .neutral, text: localizedText("toast.update.none"))
            return
        }

        updatingSourceIds.formUnion(sourceIds)
        defer { updatingSourceIds.subtract(sourceIds) }

        do {
            cancelDeferredDraftSync()
            let response = try await bridgeClient.updateSources(sourceIds)
            await synchronizeState(refreshDoctor: true, inspectSourceId: selectedDetailInspectSourceId)
            showToast(style: .success, text: .plain(updateSummaryMessage(from: response.data?.value, fallbackCount: sourceIds.count)))
        } catch {
            showToast(style: .error, text: localizedText("toast.update.failed", error.localizedDescription))
        }
    }

    func updateCurrentGroup() async {
        await submitSelectedUpdate(selectedSourceId, showLoadingToast: true)
    }

    func isUpdatingSource(_ sourceId: String) -> Bool {
        updatingSourceIds.contains(sourceId)
    }

    func updateSource(_ sourceId: String) async {
        await submitSelectedUpdate(sourceId, showLoadingToast: true)
    }

    private func submitSelectedUpdate(_ requestedSourceId: String?, showLoadingToast: Bool) async {
        let sourceId = requestedSourceId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !sourceId.isEmpty else {
            showToast(style: .error, text: localizedText("toast.update.no_group_selected"))
            return
        }

        updatingSourceIds.insert(sourceId)
        if showLoadingToast {
            showToast(style: .loading, text: localizedText("toast.update.loading", groupLabel(for: sourceId)))
        }
        defer { updatingSourceIds.remove(sourceId) }

        do {
            let result = try await mutationCoordinator.updateSelectedSource(requestedSourceId)
            guard case let .submitted(submittedSourceId, response) = result else {
                showToast(style: .error, text: localizedText("toast.update.no_group_selected"))
                return
            }
            cancelDeferredDraftSync()
            let shouldInspect = selectedGroupId == submittedSourceId || selectedSourceId == submittedSourceId
            await synchronizeState(
                refreshDoctor: true,
                inspectSourceId: shouldInspect ? submittedSourceId : nil
            )
            showToast(style: .success, text: .plain(updateSummaryMessage(from: response.data?.value, fallbackCount: 1)))
        } catch {
            showToast(style: .error, text: localizedText("toast.update.failed", error.localizedDescription))
        }
    }

    var importDisplayGroups: [ImportGroupItem] {
        importSubmittedQuery.isEmpty ? recommendedImportGroups : searchImportGroups
    }

    func isImportingImportGroup(_ groupId: String) -> Bool {
        importingImportGroupId == groupId
    }

    func loadImportPageIfNeeded() async {
        seedRecommendedImportGroupsIfNeeded()
    }

    func loadRecommendedImportGroups() async {
        seedRecommendedImportGroupsIfNeeded()
    }

    func submitImportSearch(_ query: String) async {
        let submitted = query.trimmingCharacters(in: .whitespacesAndNewlines)
        importSubmittedQuery = submitted

        if submitted.isEmpty {
            searchImportGroups = []
            await loadRecommendedImportGroups()
            return
        }

        importSearchPhase = .loading
        do {
            let response = try await fetchImportSearchResponse(query: submitted)
            let payload = response.data?.value as? [String: Any] ?? [:]
            searchImportGroups = parseImportGroupsPayload(payload: payload)
            importSearchPhase = .ready
        } catch {
            importSearchPhase = .failed(localizedText("import.error.search_groups"))
            showToast(style: .error, text: localizedText("toast.import.failed", error.localizedDescription))
        }
    }

    func previewImportGroupIfNeeded(_ groupId: String) async {
        guard let item = importGroupItem(id: groupId) else { return }
        guard item.previewPhase == .idle else { return }

        setPreviewPhase(.loading, for: groupId)
        do {
            let response = try await fetchImportPreviewResponse(groupId: groupId, locator: item.locator)
            let payload = response.data?.value as? [String: Any] ?? [:]
            applyImportPreviewPayload(payload, for: groupId, fallbackLocator: item.locator)
        } catch {
            setPreviewPhase(.failed(.plain(error.localizedDescription)), for: groupId)
        }
    }

    func importImportGroup(
        groupId: String,
        locator: String,
        selectedSkillIds: [String],
        enabledTargets: [String]
    ) async {
        guard importingImportGroupId == nil else { return }
        importingImportGroupId = groupId
        defer { importingImportGroupId = nil }

        var finalSelectedSkillIds = selectedSkillIds
        var finalEnabledTargets = enabledTargets

        if finalSelectedSkillIds.isEmpty,
           let item = importGroupItem(id: groupId),
           item.skills.isEmpty {
            await previewImportGroupIfNeeded(groupId)
            if let refreshed = importGroupItem(id: groupId) {
                finalSelectedSkillIds = refreshed.skills.filter(\.selectedByDefault).map(\.id)
                finalEnabledTargets = refreshed.targets.filter(\.selectedByDefault).map(\.id)
            }
        }

        do {
            let response = try await bridgeClient.importSource(
                locator: locator,
                selectedSkillIds: finalSelectedSkillIds,
                enabledTargets: finalEnabledTargets
            )
            guard let payload = response.data?.value as? [String: Any],
                  let status = payload["status"] as? String
            else {
                showToast(style: .error, text: localizedText("toast.import.invalid_response"))
                return
            }

            if status != "ready" {
                let reasonCode = payload["reasonCode"] as? String ?? "unknown"
                showToast(style: .error, text: localizedText("toast.import.failed", reasonCode))
                return
            }

            let sourceId = payload["sourceId"] as? String ?? ""
            cancelDeferredDraftSync()
            await synchronizeState(
                refreshDoctor: true,
                inspectSourceId: sourceId.nonEmpty
            )
            if currentRoute != .importPage, let sourceId = sourceId.nonEmpty {
                routeState?.view.currentRoute = .detail(sourceId: sourceId)
            }
            showToast(style: .success, text: localizedText("toast.import.success"))
        } catch {
            showToast(style: .error, text: localizedText("toast.import.failed", error.localizedDescription))
        }
    }

    func showImportAlreadyExistsToast() {
        showToast(style: .neutral, text: localizedText("toast.import.exists"))
    }

    private func parseImportGroupsPayload(payload: [String: Any]) -> [ImportGroupItem] {
        let groups = payload["groups"] as? [[String: Any]] ?? []
        return groups.compactMap { group in
            guard let id = (group["id"] as? String)?.nonEmpty,
                  let title = (group["title"] as? String)?.nonEmpty,
                  let locator = (group["locator"] as? String)?.nonEmpty,
                  let canonicalRepo = (group["canonicalRepo"] as? String)?.nonEmpty
            else {
                return nil
            }

            let aliases = uniqueSorted(group["aliases"] as? [String] ?? [])
            let matchedSkillNames = uniqueSorted(group["matchedSkillNames"] as? [String] ?? [])
            let matchedSkills = parseMatchedSkills(group["matchedSkills"] as? [[String: Any]])
            let snapshot = parseSourceSnapshot(group["snapshot"] as? [String: Any])
            let summary = (group["summary"] as? String)?.nonEmpty
                ?? snapshot?.description.nonEmpty
                ?? ""
            let skills = snapshot?.skills.map { skill in
                ImportGroupSkill(
                    id: skill.skillId,
                    title: skill.title,
                    summary: skill.summary,
                    selectedByDefault: true
                )
            } ?? []
            let previewPhase: ImportLoadPhase = skills.isEmpty
                ? parseImportLoadPhase(group["previewState"] as? [String: Any])
                : .ready

            return ImportGroupItem(
                id: id,
                title: title,
                locator: locator,
                canonicalRepo: canonicalRepo,
                isInstalledLocally: group["installed"] as? Bool ?? false,
                aliases: aliases,
                summary: summary,
                starCount: group["starCount"] as? Int ?? snapshot?.repoStars,
                totalInstalls: group["totalInstalls"] as? Int ?? snapshot?.totalInstalls,
                skillCount: group["skillCount"] as? Int ?? snapshot?.skillCount,
                matchedSkillNames: matchedSkillNames,
                matchedSkills: matchedSkills,
                snapshot: snapshot,
                enrichPhase: parseImportLoadPhase(group["enrichState"] as? [String: Any]),
                previewPhase: previewPhase,
                skills: skills,
                targets: []
            )
        }
    }

    private func seedRecommendedImportGroupsIfNeeded() {
        guard recommendedImportGroups.isEmpty else {
            if importSearchPhase == .idle {
                importSearchPhase = .ready
            }
            return
        }

        recommendedImportGroups = makeLocalRecommendedImportGroups(recommendationsProvider())
        importSubmittedQuery = ""
        importSearchPhase = .ready
    }

    private func makeLocalRecommendedImportGroups(_ recommendations: [ImportRecommendationEntry]) -> [ImportGroupItem] {
        let installedLocators = Set(
            allSummaries.flatMap { summary in
                [summary.sourceCanonicalRepo, summary.sourceLocator]
                    .compactMap { $0 }
                    .map(Self.normalizedImportRecommendationKey)
            }
        )

        return recommendations
            .sorted(by: { lhs, rhs in
                if lhs.sortOrder != rhs.sortOrder {
                    return lhs.sortOrder < rhs.sortOrder
                }
                return lhs.canonicalRepo < rhs.canonicalRepo
            })
            .map { recommendation in
                let normalizedRepo = Self.normalizedImportRecommendationKey(recommendation.canonicalRepo)
                let isInstalledLocally = installedLocators.contains(normalizedRepo)

                return ImportGroupItem(
                    id: normalizedRepo.replacingOccurrences(of: "/", with: "-"),
                    title: Self.localRecommendationTitle(for: recommendation.canonicalRepo),
                    locator: recommendation.locator,
                    canonicalRepo: recommendation.canonicalRepo,
                    isInstalledLocally: isInstalledLocally,
                    aliases: uniqueSorted([recommendation.canonicalRepo, recommendation.locator]),
                    summary: "",
                    starCount: nil,
                    totalInstalls: nil,
                    skillCount: nil,
                    matchedSkillNames: [],
                    matchedSkills: [],
                    snapshot: nil,
                    enrichPhase: .idle,
                    previewPhase: .idle,
                    skills: [],
                    targets: []
                )
            }
    }

    private static func normalizedImportRecommendationKey(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return ""
        }

        let lowered = trimmed
            .lowercased()
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let patterns = [
            #"^https?://github\.com/([^/\s]+)/([^/\s]+?)(?:\.git)?$"#,
            #"^git@github\.com:([^/\s]+)/([^/\s]+?)(?:\.git)?$"#,
            #"^([^/\s]+)/([^/\s]+?)(?:\.git)?$"#,
        ]

        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
                continue
            }
            let range = NSRange(lowered.startIndex..<lowered.endIndex, in: lowered)
            guard let match = regex.firstMatch(in: lowered, options: [], range: range),
                  let ownerRange = Range(match.range(at: 1), in: lowered),
                  let repoRange = Range(match.range(at: 2), in: lowered) else {
                continue
            }

            return importRecommendationAlias("\(lowered[ownerRange])/\(lowered[repoRange])")
        }

        return importRecommendationAlias(lowered.replacingOccurrences(of: ".git", with: ""))
    }

    private static func importRecommendationAlias(_ repo: String) -> String {
        switch repo {
        case "anthropic/skills":
            return "anthropics/skills"
        default:
            return repo
        }
    }

    private static func localRecommendationTitle(for canonicalRepo: String) -> String {
        let repoName = canonicalRepo
            .split(separator: "/")
            .last
            .map(String.init) ?? canonicalRepo

        return repoName
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "_", with: " ")
            .split(separator: " ")
            .map { token in
                guard let first = token.first else { return "" }
                return String(first).uppercased() + token.dropFirst()
            }
            .joined(separator: " ")
    }

    private func parseImportLoadPhase(_ payload: [String: Any]?) -> ImportLoadPhase {
        guard let payload, let status = payload["status"] as? String else {
            return .idle
        }

        switch status {
        case "loading":
            return .loading
        case "ready":
            return .ready
        case "failed":
            return .failed(importReasonText(reasonCode: payload["reasonCode"] as? String))
        default:
            return .idle
        }
    }

    private func parseMatchedSkills(_ payload: [[String: Any]]?) -> [ImportMatchedSkill] {
        (payload ?? []).compactMap { skill in
            guard let skillId = (skill["skillId"] as? String)?.nonEmpty,
                  let title = (skill["title"] as? String)?.nonEmpty else {
                return nil
            }

            return ImportMatchedSkill(
                skillId: skillId,
                title: title,
                installs: skill["installs"] as? Int
            )
        }
    }

    private func parseSourceSnapshot(_ payload: [String: Any]?) -> SourceSnapshotData? {
        guard let payload,
              let canonicalRepo = (payload["canonicalRepo"] as? String)?.nonEmpty,
              let title = (payload["title"] as? String)?.nonEmpty,
              let provider = (payload["provider"] as? String)?.nonEmpty,
              let sourceURL = (payload["sourceUrl"] as? String)?.nonEmpty,
              let repoURL = (payload["repoUrl"] as? String)?.nonEmpty,
              let repoLabel = (payload["repoLabel"] as? String)?.nonEmpty,
              let owner = parseSourceOwner(payload["owner"] as? [String: Any]) else {
            return nil
        }

        return SourceSnapshotData(
            canonicalRepo: canonicalRepo,
            title: title,
            provider: provider,
            sourceURL: sourceURL,
            repoURL: repoURL,
            repoLabel: repoLabel,
            totalInstalls: payload["totalInstalls"] as? Int,
            skillCount: payload["skillCount"] as? Int,
            repoStars: payload["repoStars"] as? Int,
            forkCount: payload["forkCount"] as? Int,
            description: (payload["description"] as? String) ?? "",
            topics: uniqueSorted(payload["topics"] as? [String] ?? []),
            language: (payload["language"] as? String)?.nonEmpty,
            defaultBranch: (payload["defaultBranch"] as? String)?.nonEmpty,
            pushedAt: (payload["pushedAt"] as? String)?.nonEmpty,
            owner: owner,
            skills: parseSnapshotSkills(payload["skills"] as? [[String: Any]]),
            trust: parseSnapshotTrust(payload["trust"] as? [String: Any])
        )
    }

    private func parseSourceOwner(_ payload: [String: Any]?) -> SnapshotOwner? {
        guard let payload,
              let slug = (payload["slug"] as? String)?.nonEmpty,
              let sourceURL = (payload["sourceUrl"] as? String)?.nonEmpty else {
            return nil
        }

        return SnapshotOwner(
            slug: slug,
            sourceURL: sourceURL,
            githubURL: (payload["githubUrl"] as? String)?.nonEmpty,
            sourceCount: payload["sourceCount"] as? Int,
            skillCount: payload["skillCount"] as? Int,
            totalInstalls: payload["totalInstalls"] as? Int
        )
    }

    private func parseSnapshotSkills(_ payload: [[String: Any]]?) -> [SnapshotSkill] {
        (payload ?? []).compactMap { skill in
            guard let skillId = (skill["skillId"] as? String)?.nonEmpty,
                  let title = (skill["title"] as? String)?.nonEmpty else {
                return nil
            }

            return SnapshotSkill(
                skillId: skillId,
                title: title,
                installs: skill["installs"] as? Int,
                weeklyInstalls: skill["weeklyInstalls"] as? Int,
                firstSeen: (skill["firstSeen"] as? String)?.nonEmpty,
                summary: (skill["summary"] as? String) ?? "",
                installedOn: parseSnapshotInstalledOn(skill["installedOn"] as? [[String: Any]]),
                audits: parseSnapshotAudits(skill["audits"] as? [String: Any])
            )
        }
    }

    private func parseSnapshotInstalledOn(_ payload: [[String: Any]]?) -> [SnapshotInstalledOn] {
        (payload ?? []).compactMap { item in
            guard let agent = (item["agent"] as? String)?.nonEmpty else {
                return nil
            }
            return SnapshotInstalledOn(agent: agent, installs: item["installs"] as? Int)
        }
    }

    private func parseSnapshotAudits(_ payload: [String: Any]?) -> SnapshotAudits? {
        guard let payload else {
            return nil
        }

        let audits = SnapshotAudits(
            gen: (payload["gen"] as? String)?.nonEmpty,
            socket: (payload["socket"] as? String)?.nonEmpty,
            snyk: (payload["snyk"] as? String)?.nonEmpty,
            riskLevel: (payload["riskLevel"] as? String)?.nonEmpty
        )

        return audits.gen != nil || audits.socket != nil || audits.snyk != nil || audits.riskLevel != nil
            ? audits
            : nil
    }

    private func parseSnapshotTrust(_ payload: [String: Any]?) -> SnapshotTrust? {
        guard let payload else {
            return nil
        }

        let trust = SnapshotTrust(
            official: payload["official"] as? Bool ?? false,
            trending: payload["trending"] as? Bool ?? false,
            hot: payload["hot"] as? Bool ?? false,
            audited: payload["audited"] as? Bool ?? false
        )
        return trust.labels.isEmpty ? nil : trust
    }

    private func applyImportPreviewPayload(
        _ payload: [String: Any],
        for groupId: String,
        fallbackLocator: String
    ) {
        guard let status = payload["status"] as? String else {
            setPreviewPhase(.failed(localizedText("import.error.invalid_preview_response")), for: groupId)
            return
        }

        if status != "ready" {
            setPreviewPhase(.failed(importReasonText(reasonCode: payload["reasonCode"] as? String)), for: groupId)
            return
        }

        let skillsPayload = payload["skills"] as? [[String: Any]] ?? []
        let targetsPayload = payload["targets"] as? [[String: Any]] ?? []
        let selectedSkillIds = Set(payload["selectedSkillIds"] as? [String] ?? [])
        let enabledTargets = Set(payload["enabledTargets"] as? [String] ?? [])
        let snapshot = parseSourceSnapshot(payload["snapshot"] as? [String: Any])

        let skills = skillsPayload.compactMap { skill -> ImportGroupSkill? in
            guard let id = (skill["id"] as? String)?.nonEmpty,
                  let title = (skill["title"] as? String)?.nonEmpty
            else {
                return nil
            }
            return ImportGroupSkill(
                id: id,
                title: title,
                summary: (skill["summary"] as? String) ?? "",
                selectedByDefault: selectedSkillIds.contains(id)
            )
        }

        let targets = targetsPayload.compactMap { target -> ImportGroupTarget? in
            guard let id = (target["id"] as? String)?.nonEmpty else {
                return nil
            }
            return ImportGroupTarget(
                id: id,
                selectedByDefault: enabledTargets.contains(id)
            )
        }

        mutateImportGroup(groupId) { item in
            ImportGroupItem(
                id: item.id,
                title: snapshot?.title ?? item.title,
                locator: (payload["locator"] as? String)?.nonEmpty ?? fallbackLocator,
                canonicalRepo: item.canonicalRepo,
                isInstalledLocally: item.isInstalledLocally,
                aliases: item.aliases,
                summary: item.summary.nonEmpty ?? snapshot?.description ?? "",
                starCount: item.starCount,
                totalInstalls: item.totalInstalls,
                skillCount: item.skillCount,
                matchedSkillNames: item.matchedSkillNames,
                matchedSkills: item.matchedSkills,
                snapshot: snapshot ?? item.snapshot,
                enrichPhase: snapshot != nil ? .ready : item.enrichPhase,
                previewPhase: .ready,
                skills: skills,
                targets: targets
            )
        }
    }

    private func setPreviewPhase(_ phase: ImportLoadPhase, for groupId: String) {
        mutateImportGroup(groupId) { item in
            ImportGroupItem(
                id: item.id,
                title: item.title,
                locator: item.locator,
                canonicalRepo: item.canonicalRepo,
                isInstalledLocally: item.isInstalledLocally,
                aliases: item.aliases,
                summary: item.summary,
                starCount: item.starCount,
                totalInstalls: item.totalInstalls,
                skillCount: item.skillCount,
                matchedSkillNames: item.matchedSkillNames,
                matchedSkills: item.matchedSkills,
                snapshot: item.snapshot,
                enrichPhase: item.enrichPhase,
                previewPhase: phase,
                skills: item.skills,
                targets: item.targets
            )
        }
    }

    private func importGroupItem(id groupId: String) -> ImportGroupItem? {
        if let group = recommendedImportGroups.first(where: { $0.id == groupId }) {
            return group
        }
        return searchImportGroups.first(where: { $0.id == groupId })
    }

    private func mutateImportGroup(_ groupId: String, transform: (ImportGroupItem) -> ImportGroupItem) {
        if let index = recommendedImportGroups.firstIndex(where: { $0.id == groupId }) {
            recommendedImportGroups[index] = transform(recommendedImportGroups[index])
        }
        if let index = searchImportGroups.firstIndex(where: { $0.id == groupId }) {
            searchImportGroups[index] = transform(searchImportGroups[index])
        }
    }

    private func importReasonText(reasonCode: String?) -> PresentationText {
        switch reasonCode {
        case "provider_not_supported":
            return localizedText("import.reason.provider_not_supported")
        case "provider_data_unavailable":
            return localizedText("common.source_metadata.unavailable")
        case "provider_rate_limited":
            return localizedText("import.reason.provider_rate_limited")
        case "provider_response_invalid":
            return localizedText("import.reason.provider_response_invalid")
        default:
            return localizedText("import.reason.request_failed")
        }
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
            _ = try await bridgeClient.uninstall(sourceIds: [sourceId])
            if selectedSourceId == sourceId {
                selectedSourceId = nil
            }
            workingDrafts.removeValue(forKey: sourceId)
            inspectedPayloadBySourceId.removeValue(forKey: sourceId)
            detailEnrichmentPayloadBySourceId.removeValue(forKey: sourceId)
            preparedDetailContentBySourceId.removeValue(forKey: sourceId)
            cancelDeferredDraftSync()
            await synchronizeState(refreshDoctor: true)

            if let first = sourceIds.first {
                await selectSource(first)
            } else {
                requestPage(.home)
            }
            if currentDetailSourceId == sourceId {
                requestPage(.home)
            }
            showToast(style: .success, text: localizedText("toast.uninstall.success", sourceId))
        } catch {
            showToast(style: .error, text: localizedText("toast.uninstall.failed", error.localizedDescription))
        }
    }

    func isTargetEnabled(_ target: String) -> Bool {
        guard let groupId = selectedGroupId, let draft = workingDrafts[groupId] else {
            return false
        }
        return draft.enabledTargets.contains(target)
    }

    func setTargetEnabled(_ target: String, enabled: Bool, sourceId: String? = nil) async {
        guard let groupId = resolveSourceId(sourceId), var draft = draft(for: groupId) else {
            return
        }
        guard !isSaving(sourceId: groupId) else {
            return
        }

        let currentlyEnabled = draft.enabledTargets.contains(target)
        guard currentlyEnabled != enabled else {
            return
        }

        if enabled {
            draft.enabledTargets = normalizedTargets(draft.enabledTargets + [target])
        } else {
            draft.enabledTargets.removeAll { $0 == target }
        }

        await commitDraftChange(
            sourceId: groupId,
            nextDraft: draft,
            successMessage: compactAgentToastMessage(sourceId: groupId, targetId: target, enabled: enabled),
            successStyle: enabled ? .success : .neutral
        )
    }

    private func parseBootstrapData(_ value: Any?) {
        guard let data = value as? [String: Any] else { return }

        applyCachedGroupCardEnrichment(data)
        applyPinnedSourceIds(data)
        applySummaries(parseSummariesPayload(data))

        if let availableTargets = data["availableTargets"] as? [String] {
            detectedTargets.formUnion(availableTargets)
        }

        if let initialDrafts = data["initialDrafts"] as? [String: Any] {
            for (sourceId, rawDraft) in initialDrafts {
                guard let draftObject = rawDraft as? [String: Any] else { continue }
                let selectedLeafIds = uniqueSorted(draftObject["selectedLeafIds"] as? [String] ?? [])
                let enabledTargets = normalizedTargets(draftObject["enabledTargets"] as? [String] ?? [])
                let draft = DraftState(selectedLeafIds: selectedLeafIds, enabledTargets: enabledTargets)
                workingDrafts[sourceId] = draft
            }
        }

        if let audit = data["audit"] {
            doctorIssues = parseDoctorIssues(audit)
            lastDoctorError = nil
        }
    }

    private func prefetchRecommendedImportGroupsIfNeeded() async {
        seedRecommendedImportGroupsIfNeeded()
    }

    private func applyList(_ response: BridgeResponse) {
        if let data = response.data?.value as? [String: Any] {
            applyCachedGroupCardEnrichment(data)
        }
        applyPinnedSourceIds(response.data?.value)
        applySummaries(parseSummariesPayload(response.data?.value))
    }

    private func applyCachedGroupCardEnrichment(_ data: [String: Any]) {
        guard let entries = data["groupCardEnrichmentBySourceId"] as? [String: Any] else {
            return
        }

        for (sourceId, rawValue) in entries {
            guard let payload = rawValue as? [String: Any] else {
                continue
            }

            var mergedPayload = detailEnrichmentPayloadBySourceId[sourceId] ?? [:]
            if let sourceMetadata = payload["sourceMetadata"] {
                mergedPayload["sourceMetadata"] = sourceMetadata
            }
            if let sourceSnapshot = payload["sourceSnapshot"] {
                mergedPayload["sourceSnapshot"] = sourceSnapshot
            }
            if !mergedPayload.isEmpty {
                detailEnrichmentPayloadBySourceId[sourceId] = mergedPayload
            }
        }
    }

    private func parseSummaries(_ response: BridgeResponse) -> [WorkflowSummary] {
        parseSummariesPayload(response.data?.value)
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
            let sourceDisplayName = source["displayName"] as? String ?? sourceId
            let sourceLocator = source["locator"] as? String ?? ""
            let sourceCanonicalRepo = (source["canonicalRepo"] as? String)?.nonEmpty
                ?? (source["originLocator"] as? String)?.nonEmpty

            let lock = summary["lock"] as? [String: Any]
            let updatedAt = lock?["updatedAt"] as? String ?? "-"

            let leafs: [LeafSummary] = (summary["leafs"] as? [[String: Any]] ?? []).compactMap { leaf in
                guard let leafId = leaf["id"] as? String else {
                    return nil
                }
                return LeafSummary(
                    id: leafId,
                    linkName: leaf["linkName"] as? String ?? leafId,
                    name: leaf["name"] as? String ?? leafId,
                    description: leaf["description"] as? String ?? "",
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
                sourceDisplayName: sourceDisplayName,
                sourceLocator: sourceLocator,
                sourceCanonicalRepo: sourceCanonicalRepo,
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

    private func applySummaries(_ summaries: [WorkflowSummary]) {
        allSummaries = summaries
        sourceIds = summaries.map(\.sourceId)
        pruneStateMaps(allowedSourceIds: Set(sourceIds))
        refreshImportGroupInstalledState()

        if selectedSourceId == nil || !sourceIds.contains(selectedSourceId ?? "") {
            selectedSourceId = sourceIds.first
        }

        for summary in summaries {
            let serverDraft = buildInitialDraftFromSummary(summary)
            let savePhase = saveStateBySourceId[summary.sourceId]?.phase ?? .idle

            if savePhase == .saving {
                if workingDrafts[summary.sourceId] == nil {
                    workingDrafts[summary.sourceId] = serverDraft
                }
            } else {
                workingDrafts[summary.sourceId] = serverDraft
                if savePhase == .saved {
                    saveStateBySourceId[summary.sourceId] = SaveState(phase: .idle, detail: nil)
                }
            }

            detectedTargets.formUnion(summary.enabledTargets)
        }

    }

    private func refreshImportGroupInstalledState() {
        let installedLocators = Set(
            allSummaries.flatMap { summary in
                [summary.sourceCanonicalRepo, summary.sourceLocator]
                    .compactMap { $0 }
                    .map(Self.normalizedImportRecommendationKey)
            }
        )

        func update(_ item: ImportGroupItem) -> ImportGroupItem {
            let isInstalledLocally = installedLocators.contains(
                Self.normalizedImportRecommendationKey(item.canonicalRepo)
            )

            return ImportGroupItem(
                id: item.id,
                title: item.title,
                locator: item.locator,
                canonicalRepo: item.canonicalRepo,
                isInstalledLocally: isInstalledLocally,
                aliases: item.aliases,
                summary: item.summary,
                starCount: item.starCount,
                totalInstalls: item.totalInstalls,
                skillCount: item.skillCount,
                matchedSkillNames: item.matchedSkillNames,
                matchedSkills: item.matchedSkills,
                snapshot: item.snapshot,
                enrichPhase: item.enrichPhase,
                previewPhase: item.previewPhase,
                skills: item.skills,
                targets: item.targets
            )
        }

        recommendedImportGroups = recommendedImportGroups.map(update)
        searchImportGroups = searchImportGroups.map(update)
    }

    func requestPage(_ page: Page) {
        routeState?.view.currentRoute = Self.route(for: page)
    }

    static func route(for page: Page) -> DesktopRoute {
        switch page {
        case .home:
            return .home
        case .importPage:
            return .importPage
        case .settings:
            return .settings
        case .detail(let sourceId):
            return .detail(sourceId: sourceId)
        }
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

    private func buildInitialDraftFromSummary(_ summary: WorkflowSummary) -> DraftState {
        let selectedLeafIds: [String]
        if !summary.selectedLeafIds.isEmpty {
            selectedLeafIds = uniqueSorted(summary.selectedLeafIds)
        } else {
            let enabledTargetLeafIds = normalizedTargets(summary.enabledTargets).flatMap { target in
                summary.targetLeafIdsByTarget[target] ?? []
            }
            selectedLeafIds = uniqueSorted(enabledTargetLeafIds)
        }

        return DraftState(
            selectedLeafIds: selectedLeafIds,
            enabledTargets: normalizedTargets(summary.enabledTargets)
        )
    }

    static func preferredDetailGroupTitle(
        sourceId: String,
        displayName: String?,
        snapshotTitle: String?,
        locator: String
    ) -> String {
        if let snapshotTitle = snapshotTitle?.nonEmpty {
            return snapshotTitle
        }

        if let displayName = sanitizedDetailTitle(displayName) {
            return displayName
        }

        return detailTitleFallback(from: locator, sourceId: sourceId)
    }

    static func preferredDetailSkillTitle(
        preparedTitle: String?,
        payloadTitle: String?,
        projectedName: String?,
        snapshotTitle: String?,
        rawLeafName: String?,
        fallbackLinkName: String
    ) -> String {
        preparedTitle?.nonEmpty
            ?? payloadTitle?.nonEmpty
            ?? projectedName?.nonEmpty
            ?? snapshotTitle?.nonEmpty
            ?? sanitizedDetailTitle(rawLeafName)
            ?? fallbackLinkName
    }

    private func draft(for sourceId: String?) -> DraftState? {
        guard let sourceId = resolveSourceId(sourceId) else {
            return nil
        }
        guard let summary = summary(for: sourceId) else {
            return nil
        }

        let serverDraft = buildInitialDraftFromSummary(summary)
        let savePhase = saveStateBySourceId[sourceId]?.phase ?? .idle
        if savePhase == .saving || savePhase == .saved {
            return workingDrafts[sourceId] ?? serverDraft
        }

        return serverDraft
    }

    private func summary(for sourceId: String?) -> WorkflowSummary? {
        guard let sourceId = resolveSourceId(sourceId) else {
            return nil
        }
        return allSummaries.first(where: { $0.sourceId == sourceId })
    }

    private func resolveSourceId(_ sourceId: String?) -> String? {
        let resolved = (sourceId ?? selectedGroupId)?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let resolved, !resolved.isEmpty else {
            return nil
        }
        return resolved
    }

    private func visibleTargetIds() -> [String] {
        let preferences = AgentDisplayCatalog.normalize(routeState?.settings.agentDisplayPreferences ?? [])
        let visibleTargetIds = preferences
            .filter(\.isVisible)
            .map(\.targetId)

        if showAllTargets {
            return visibleTargetIds
        }

        return Array(visibleTargetIds.filter { detectedTargets.contains($0) }.prefix(10))
    }

    private func normalizedTargets(_ values: [String]) -> [String] {
        let selected = Set(values)
        return Self.targetOrder.filter { selected.contains($0) }
    }

    private func normalizeDraft(_ draft: DraftState) -> DraftState {
        DraftState(
            selectedLeafIds: uniqueSorted(draft.selectedLeafIds),
            enabledTargets: normalizedTargets(draft.enabledTargets)
        )
    }

    func detailViewData(for sourceId: String) -> DetailViewData? {
        guard let summary = summary(for: sourceId), let draft = draft(for: sourceId) else {
            return nil
        }

        let payload = mergedDetailPayload(for: sourceId)
        let sourcePayload = payload["source"] as? [String: Any] ?? [:]
        let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
        let summarySourcePayload = summaryPayload["source"] as? [String: Any] ?? [:]
        let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
        let sourceSnapshot = parseSourceSnapshot(payload["sourceSnapshot"] as? [String: Any])
        let deploymentsPayload = payload["deployments"] as? [[String: Any]] ?? []
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []
        let preparedDetailContent = preparedDetailContentBySourceId[sourceId]

        let selectedLeafIds = Set(draft.selectedLeafIds)
        let enabledTargetLabels = draft.enabledTargets.map { AgentDisplayCatalog.label(for: $0) }
        let enabledTargets = Set(draft.enabledTargets)
        let inspectedLeafIds = uniqueSorted(leafPayloads.compactMap { $0["id"] as? String })
        let preferredLeafIds = inspectedLeafIds.isEmpty ? summary.leafs.map(\.id) : inspectedLeafIds
        let groupPath = preparedDetailContent?.groupPath ?? preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads)
        let author = sourceSnapshot.map { "@\($0.owner.slug)" }
            ?? Self.authorHandle(from: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator)
            ?? "@\(summary.sourceKind.lowercased())"
        let originLabel = sourceSnapshot.flatMap { Self.displayOriginLabel(from: $0.sourceURL) }
            ?? Self.displayOriginLabel(from: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator)
        let groupStats = groupCardMetadata(sourceId: sourceId, summary: summary, row: SourceRow(
            id: summary.sourceId,
            displayName: summary.sourceDisplayName,
            locator: summary.sourceLocator,
            kind: summary.sourceKind,
            skillCount: summary.leafs.count,
            status: summary.health,
            lastUpdate: summary.updatedAt,
            warningCount: summary.warningCount,
            errorCount: summary.errorCount
        )).stats
        let starCount = groupStats.starCount
        let projectedNamesByLeafId = projectionNameMap(for: sourceId)

        if preparedDetailContent == nil, !payload.isEmpty {
            scheduleDetailContentWarmupIfNeeded(sourceId: sourceId)
        }

        let skills: [DetailSkill] = preferredLeafIds.compactMap { leafId -> DetailSkill? in
            guard let leaf = summary.leafs.first(where: { $0.id == leafId }) else {
                return nil
            }
            let leafPayload = leafPayloads.first(where: { ($0["id"] as? String) == leafId }) ?? [:]
            let preparedSkill = preparedDetailContent?.skillsByLeafId[leafId]
            let skillFilePath = leafPayload["skillFilePath"] as? String
            let leafRelativePath = leafPayload["relativePath"] as? String
            let linkName = leafPayload["linkName"] as? String ?? leaf.linkName
            let snapshotSkill = sourceSnapshot?.skills.first(where: { $0.skillId == linkName })
            let projectedName = projectedNamesByLeafId[leaf.id]
            let title = Self.preferredDetailSkillTitle(
                preparedTitle: preparedSkill?.title,
                payloadTitle: leafPayload["title"] as? String,
                projectedName: projectedName,
                snapshotTitle: snapshotSkill?.title,
                rawLeafName: leaf.name,
                fallbackLinkName: linkName
            )

            return DetailSkill(
                id: leaf.id,
                title: title,
                summary: leaf.description.isEmpty ? linkName : leaf.description,
                version: preparedSkill?.version,
                author: author,
                originLabel: originLabel,
                starCount: starCount,
                folderPath: preparedSkill?.folderPath,
                relativeFolderPath: Self.projectedRelativeFolderPath(
                    preparedSkill?.relativeFolderPath ?? leafRelativePath,
                    projectedName: projectedName,
                    fallbackName: linkName
                ),
                documents: preparedSkill?.documents ?? [],
                detailLines: buildSkillDetailLines(
                    leafRelativePath: leafRelativePath,
                    skillFilePath: skillFilePath,
                    linkName: linkName,
                    snapshotSkill: snapshotSkill
                ),
                documentContent: preparedSkill?.documentContent ?? (leaf.description.isEmpty ? "Loading skill document..." : leaf.description),
                isEnabled: selectedLeafIds.contains(leaf.id),
                warningCount: leaf.metadataWarnings.count
            )
        }

        let sourceFacts = [
            sourcePayload["addedAt"] as? String,
            sourcePayload["originLocator"] as? String,
            sourcePayload["requestedPath"] as? String,
            sourcePayload["selectionMode"] as? String,
            lockPayload["checkoutPath"] as? String,
            lockPayload["commitSha"] as? String,
            lockPayload["resolvedVersion"] as? String,
        ]
        .compactMap { $0?.nonEmpty }

        let deploymentFacts = deploymentsPayload.prefix(4).compactMap { deployment -> String? in
            guard let target = deployment["target"] as? String,
                  let status = deployment["status"] as? String
            else {
                return nil
            }
            let leafId = (deployment["leafId"] as? String)?.nonEmpty ?? "unknown"
            return "\(AgentDisplayCatalog.label(for: target)) · \(status) · \(leafId)"
        }

        let targets = visibleTargetIds().map { targetId in
            DetailTarget(
                id: targetId,
                label: AgentDisplayCatalog.label(for: targetId),
                shortLabel: AgentDisplayCatalog.shortLabel(for: targetId),
                isEnabled: enabledTargets.contains(targetId)
            )
        }

        let fileTree = preparedDetailContent?.fileTree ?? []

        return DetailViewData(
            sourceId: summary.sourceId,
            title: Self.preferredDetailGroupTitle(
                sourceId: summary.sourceId,
                displayName: (sourcePayload["displayName"] as? String)?.nonEmpty
                    ?? (summarySourcePayload["displayName"] as? String)?.nonEmpty
                    ?? summary.sourceDisplayName,
                snapshotTitle: sourceSnapshot?.title,
                locator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator
            ),
            subtitle: (sourcePayload["kind"] as? String)?.nonEmpty ?? summary.sourceKind,
            author: author,
            originLabel: originLabel,
            starCount: starCount,
            groupStats: groupStats,
            sourceDetailLines: [],
            sourceRepositoryURL: groupStats.githubURL,
            locator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator,
            groupPath: groupPath,
            updatedAt: (lockPayload["updatedAt"] as? String)?.nonEmpty ?? summary.updatedAt,
            updatedRelative: relativeUpdateLabel((lockPayload["updatedAt"] as? String)?.nonEmpty ?? summary.updatedAt),
            health: summary.health,
            warningCount: summary.warningCount,
            errorCount: summary.errorCount,
            enabledSkillCount: draft.selectedLeafIds.count,
            totalSkillCount: skills.count,
            enabledTargetCount: draft.enabledTargets.count,
            saveState: saveState(for: sourceId),
            skillSelection: skillSelectionState(sourceId: sourceId),
            targetSelection: targetSelectionState(sourceId: sourceId),
            enabledTargetLabels: enabledTargetLabels,
            sourceFacts: sourceFacts,
            deploymentFacts: deploymentFacts,
            fileTree: fileTree,
            groupDocuments: preparedDetailContent?.groupDocuments ?? [],
            targets: targets,
            skills: skills
        )
    }

    func detailSnapshot(for sourceId: String) -> DetailViewModel.Snapshot? {
        guard let detail = detailViewData(for: sourceId) else {
            return nil
        }
        return DetailViewModel.Snapshot(detail: detail)
    }

    func hasInspectPayload(for sourceId: String) -> Bool {
        inspectedPayloadBySourceId[sourceId] != nil
    }

    func isInspectRequestInFlight(for sourceId: String) -> Bool {
        inspectRequestTasksBySourceId[sourceId] != nil
    }

    private func mergedDetailPayload(for sourceId: String) -> [String: Any] {
        var payload = inspectedPayloadBySourceId[sourceId] ?? [:]
        let enrichmentPayload = detailEnrichmentPayloadBySourceId[sourceId] ?? [:]
        for (key, value) in enrichmentPayload {
            payload[key] = value
        }
        return payload
    }

    private func scheduleDetailEnrichmentFetch(sourceId: String) {
        detailEnrichmentTasksBySourceId[sourceId]?.cancel()
        detailEnrichmentTasksBySourceId.removeValue(forKey: sourceId)

        detailEnrichmentTokenSeed &+= 1
        let token = detailEnrichmentTokenSeed
        detailEnrichmentTokensBySourceId[sourceId] = token

        let task = Task { @MainActor [weak self, sourceId] in
            guard let self else { return }
            do {
                let response = try await self.bridgeClient.inspectEnrichment(sourceId: sourceId)
                guard !Task.isCancelled else { return }

                if let payload = response.data?.value as? [String: Any],
                   self.detailEnrichmentTokensBySourceId[sourceId] == token
                {
                    self.detailEnrichmentPayloadBySourceId[sourceId] = payload
                }
                if self.detailEnrichmentTokensBySourceId[sourceId] == token {
                    self.latestWarnings = response.warnings
                    self.detailEnrichmentTasksBySourceId.removeValue(forKey: sourceId)
                    self.detailEnrichmentTokensBySourceId.removeValue(forKey: sourceId)
                }
            } catch {
                if self.detailEnrichmentTokensBySourceId[sourceId] == token {
                    self.detailEnrichmentTasksBySourceId.removeValue(forKey: sourceId)
                    self.detailEnrichmentTokensBySourceId.removeValue(forKey: sourceId)
                }
            }
        }

        detailEnrichmentTasksBySourceId[sourceId] = task
    }

    private func scheduleDetailContentWarmupIfNeeded(sourceId: String) {
        guard detailWarmupTasksBySourceId[sourceId] == nil else {
            return
        }
        guard let summary = summary(for: sourceId), let payload = inspectedPayloadBySourceId[sourceId], !payload.isEmpty else {
            return
        }
        let input = buildPreparedDetailWarmupInput(sourceId: sourceId, summary: summary, payload: payload)

        let task = Task { [weak self, sourceId, input] in
            try? await Task.sleep(for: .milliseconds(40))
            guard !Task.isCancelled else { return }

            let prepared = await Task.detached {
                Self.prepareDetailContent(input: input)
            }.value

            await MainActor.run {
                guard let self, !Task.isCancelled else { return }
                self.preparedDetailContentBySourceId[sourceId] = prepared
                self.detailWarmupTasksBySourceId.removeValue(forKey: sourceId)
            }
        }
        detailWarmupTasksBySourceId[sourceId] = task
    }

    private func buildPreparedDetailWarmupInput(
        sourceId: String,
        summary: WorkflowSummary,
        payload: [String: Any]
    ) -> PreparedDetailWarmupInput {
        let sourcePayload = payload["source"] as? [String: Any] ?? [:]
        let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
        let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []
        let sourceSnapshot = parseSourceSnapshot(payload["sourceSnapshot"] as? [String: Any])
        let preferredLeafIds = uniqueSorted(leafPayloads.compactMap { $0["id"] as? String }).isEmpty
            ? summary.leafs.map(\.id)
            : uniqueSorted(leafPayloads.compactMap { $0["id"] as? String })
        let groupPath = preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads)
        let gitHubRepoContext = gitHubRepoContext(
            locator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator,
            lockPayload: lockPayload
        )
        let projectedNamesByLeafId = projectionNameMap(for: sourceId)
        let leaves = preferredLeafIds.compactMap { leafId -> PreparedDetailLeafInput? in
            guard let leaf = summary.leafs.first(where: { $0.id == leafId }) else {
                return nil
            }

            let leafPayload = leafPayloads.first(where: { ($0["id"] as? String) == leafId }) ?? [:]
            return PreparedDetailLeafInput(
                id: leaf.id,
                linkName: leafPayload["linkName"] as? String ?? leaf.linkName,
                name: leaf.name,
                description: leaf.description,
                warningCount: leaf.metadataWarnings.count,
                skillFilePath: leafPayload["skillFilePath"] as? String,
                relativePath: leafPayload["relativePath"] as? String,
                absolutePath: (leafPayload["absolutePath"] as? String)?.nonEmpty,
                title: (leafPayload["title"] as? String)?.nonEmpty
            )
        }

        return PreparedDetailWarmupInput(
            summary: summary,
            sourceLocator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator,
            sourceSnapshot: sourceSnapshot,
            groupPath: groupPath,
            gitHubRepoContext: gitHubRepoContext,
            projectedNamesByLeafId: projectedNamesByLeafId,
            leaves: leaves
        )
    }

    nonisolated private static func prepareDetailContent(input: PreparedDetailWarmupInput) -> PreparedDetailContent {
        var rawDocumentCache: [String: String] = [:]
        var parsedDocumentCache: [String: ParsedDocument] = [:]
        var documentTabsCache: [String: [DocumentTab]] = [:]
        var skillsByLeafId: [String: PreparedDetailSkillContent] = [:]
        var lightweightSkills: [DetailSkill] = []

        for leaf in input.leaves {
            let folderPath = leaf.absolutePath
                ?? leaf.skillFilePath.flatMap { ($0 as NSString).deletingLastPathComponent.nonEmpty }
            let documentContent = leaf.skillFilePath
                .map { path in
                    parsedDocument(
                        path: path,
                        rawDocumentCache: &rawDocumentCache,
                        parsedDocumentCache: &parsedDocumentCache
                    ).body
                }
                .flatMap(\.nonEmpty)
                ?? leaf.description
            let parsedMetadata = leaf.skillFilePath.map { path in
                parsedDocument(
                    path: path,
                    rawDocumentCache: &rawDocumentCache,
                    parsedDocumentCache: &parsedDocumentCache
                )
            }
            let metadata = parsedMetadata?.metadata ?? []
            let metadataName = parsedMetadata?.frontMatter?.name?.nonEmpty
            let version = parsedMetadata?.frontMatter?.version
            let documents = leaf.skillFilePath.map { path in
                documentTabs(
                    for: path,
                    groupPath: input.groupPath,
                    gitHubRepoContext: input.gitHubRepoContext,
                    rawDocumentCache: &rawDocumentCache,
                    parsedDocumentCache: &parsedDocumentCache,
                    documentTabsCache: &documentTabsCache
                )
            } ?? [
                DocumentTab(
                    id: "inline-skill-md",
                    title: "SKILL.md",
                    path: "SKILL.md",
                    metadata: metadata,
                    content: documentContent,
                    renderCacheKey: "inline-skill-md:\(documentContent.hashValue)",
                    externalURL: nil
                )
            ]
            let projectedName = input.projectedNamesByLeafId[leaf.id]
            let title = metadataName
                ?? folderPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty }
                ?? leaf.title
                ?? leaf.name.nonEmpty
                ?? leaf.linkName
            let relativeFolderPath = input.groupPath.flatMap { basePath in
                folderPath.flatMap { relativePath(from: basePath, to: $0) }
            } ?? leaf.relativePath

            skillsByLeafId[leaf.id] = PreparedDetailSkillContent(
                title: title,
                version: version,
                folderPath: folderPath,
                relativeFolderPath: relativeFolderPath,
                documents: documents,
                documentContent: documentContent
            )

            lightweightSkills.append(
                DetailSkill(
                    id: leaf.id,
                    title: title,
                    summary: leaf.description.isEmpty ? leaf.linkName : leaf.description,
                    version: version,
                    author: input.sourceSnapshot.map { "@\($0.owner.slug)" }
                        ?? authorHandle(from: input.sourceLocator)
                        ?? "@\(input.summary.sourceKind.lowercased())",
                    originLabel: input.sourceSnapshot.map { displayOriginLabel(from: $0.sourceURL) }
                        ?? displayOriginLabel(from: input.sourceLocator),
                    starCount: input.sourceSnapshot?.repoStars,
                    folderPath: folderPath,
                    relativeFolderPath: projectedRelativeFolderPath(
                        relativeFolderPath,
                        projectedName: projectedName,
                        fallbackName: leaf.linkName
                    ),
                    documents: documents,
                    detailLines: [],
                    documentContent: documentContent,
                    isEnabled: false,
                    warningCount: leaf.warningCount
                )
            )
        }

        let fileTree = buildFileTreeItems(groupPath: input.groupPath, skills: lightweightSkills)
        let groupDocuments = groupDocumentTabs(
            groupPath: input.groupPath,
            fileTree: fileTree,
            gitHubRepoContext: input.gitHubRepoContext,
            rawDocumentCache: &rawDocumentCache,
            parsedDocumentCache: &parsedDocumentCache
        )

        return PreparedDetailContent(
            groupPath: input.groupPath,
            fileTree: fileTree,
            groupDocuments: groupDocuments,
            skillsByLeafId: skillsByLeafId
        )
    }

    func dismissToast(id: ToastState.ID? = nil) {
        guard let id else {
            toast = nil
            return
        }
        guard toast?.id == id else {
            return
        }
        toast = nil
    }

    private func commitDraftChange(
        sourceId: String,
        nextDraft: DraftState,
        successMessage: PresentationText,
        successStyle: ToastStyle
    ) async {
        let sourceId = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sourceId.isEmpty else {
            showToast(style: .error, text: localizedText("toast.save.no_source_id"))
            return
        }

        let normalizedDraft = normalizeDraft(nextDraft)
        let currentDraft = normalizeDraft(draft(for: sourceId) ?? normalizedDraft)
        guard currentDraft != normalizedDraft else {
            return
        }

        let previousDraft = currentDraft
        selectedSourceId = sourceId
        workingDrafts[sourceId] = normalizedDraft
        saveStateBySourceId[sourceId] = SaveState(phase: .saving, detail: nil)

        do {
            _ = try await bridgeClient.apply(
                sourceId: sourceId,
                selectedLeafIds: normalizedDraft.selectedLeafIds,
                enabledTargets: normalizedDraft.enabledTargets
            )
            workingDrafts[sourceId] = normalizedDraft
            saveStateBySourceId[sourceId] = SaveState(phase: .saved, detail: nil)
            showToast(style: successStyle, text: successMessage)
            scheduleDeferredDraftSync(for: sourceId)
        } catch {
            let firstReason = firstErrorLine(from: error)
            workingDrafts[sourceId] = previousDraft
            saveStateBySourceId[sourceId] = SaveState(phase: .failed, detail: firstReason)
            showToast(style: .error, text: localizedText("toast.save.failed", firstReason))
        }
    }

    private func fetchListResponse() async throws -> BridgeResponse {
        if let existingTask = listRequestTask {
            return try await existingTask.value
        }

        listRequestToken &+= 1
        let token = listRequestToken
        let task = Task { try await bridgeClient.list() }
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

    private func fetchInspectResponse(sourceId: String) async throws -> BridgeResponse {
        if let existingTask = inspectRequestTasksBySourceId[sourceId] {
            return try await existingTask.value
        }

        inspectRequestTokenSeed &+= 1
        let token = inspectRequestTokenSeed
        let task = Task { try await bridgeClient.inspect(sourceId: sourceId) }
        inspectRequestTasksBySourceId[sourceId] = task
        inspectRequestTokensBySourceId[sourceId] = token

        do {
            let response = try await task.value
            if inspectRequestTokensBySourceId[sourceId] == token {
                inspectRequestTasksBySourceId.removeValue(forKey: sourceId)
                inspectRequestTokensBySourceId.removeValue(forKey: sourceId)
            }
            return response
        } catch {
            if inspectRequestTokensBySourceId[sourceId] == token {
                inspectRequestTasksBySourceId.removeValue(forKey: sourceId)
                inspectRequestTokensBySourceId.removeValue(forKey: sourceId)
            }
            throw error
        }
    }

    private func fetchImportSearchResponse(query: String?) async throws -> BridgeResponse {
        let normalizedQuery = query?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() ?? "__recommended__"

        if let existingTask = importSearchTasksByQuery[normalizedQuery] {
            return try await existingTask.value
        }

        importSearchTokenSeed &+= 1
        let token = importSearchTokenSeed
        let task = Task { try await bridgeClient.searchImportGroups(query: query) }
        importSearchTasksByQuery[normalizedQuery] = task
        importSearchTokensByQuery[normalizedQuery] = token

        do {
            let response = try await task.value
            if importSearchTokensByQuery[normalizedQuery] == token {
                importSearchTasksByQuery.removeValue(forKey: normalizedQuery)
                importSearchTokensByQuery.removeValue(forKey: normalizedQuery)
            }
            return response
        } catch {
            if importSearchTokensByQuery[normalizedQuery] == token {
                importSearchTasksByQuery.removeValue(forKey: normalizedQuery)
                importSearchTokensByQuery.removeValue(forKey: normalizedQuery)
            }
            throw error
        }
    }

    private func fetchImportPreviewResponse(
        groupId: String,
        locator: String
    ) async throws -> BridgeResponse {
        if let existingTask = importPreviewTasksByGroupId[groupId] {
            return try await existingTask.value
        }

        importPreviewTokenSeed &+= 1
        let token = importPreviewTokenSeed
        let task = Task { try await bridgeClient.previewImportSource(locator: locator) }
        importPreviewTasksByGroupId[groupId] = task
        importPreviewTokensByGroupId[groupId] = token

        do {
            let response = try await task.value
            if importPreviewTokensByGroupId[groupId] == token {
                importPreviewTasksByGroupId.removeValue(forKey: groupId)
                importPreviewTokensByGroupId.removeValue(forKey: groupId)
            }
            return response
        } catch {
            if importPreviewTokensByGroupId[groupId] == token {
                importPreviewTasksByGroupId.removeValue(forKey: groupId)
                importPreviewTokensByGroupId.removeValue(forKey: groupId)
            }
            throw error
        }
    }

    private func synchronizeState(
        refreshDoctor: Bool,
        inspectSourceId: String? = nil
    ) async {
        await refreshList()
        if refreshDoctor {
            await runDoctor()
        }

        guard let inspectSourceId = inspectSourceId?.trimmingCharacters(in: .whitespacesAndNewlines),
              !inspectSourceId.isEmpty,
              sourceIds.contains(inspectSourceId)
        else {
            return
        }

        await selectSource(inspectSourceId)
    }

    private func scheduleDeferredDraftSync(for sourceId: String) {
        pendingDraftSyncSourceIds.insert(sourceId)
        deferredDraftSyncTask?.cancel()
        deferredDraftSyncTask = Task { @MainActor in
            try? await Task.sleep(for: deferredDraftSyncDelay)
            guard !Task.isCancelled else { return }

            let pendingSourceIds = pendingDraftSyncSourceIds
            pendingDraftSyncSourceIds.removeAll()
            deferredDraftSyncTask = nil
            await refreshList()

            guard let selectedSourceId,
                  pendingSourceIds.contains(selectedSourceId),
                  currentDetailSourceId == selectedSourceId
            else {
                return
            }

            await selectSource(selectedSourceId)
        }
    }

    private func cancelDeferredDraftSync() {
        deferredDraftSyncTask?.cancel()
        deferredDraftSyncTask = nil
        pendingDraftSyncSourceIds.removeAll()
    }

    private func updateSummaryMessage(from value: Any?, fallbackCount: Int) -> String {
        guard let payload = value as? [String: Any] else {
            return fallbackCount == 1
                ? localized("toast.update.summary.single")
                : localized("toast.update.summary.multiple", String(fallbackCount))
        }
        let items = payload["updated"] as? [[String: Any]] ?? []
        if items.isEmpty {
            return fallbackCount == 1
                ? localized("toast.update.summary.single")
                : localized("toast.update.summary.multiple", String(fallbackCount))
        }

        var changedCount = 0
        var upToDateCount = 0
        var reviewCount = 0

        for item in items {
            let changed = item["changed"] as? Bool ?? false
            let invalidatedLeafCount = (item["invalidatedLeafIds"] as? [String])?.count ?? 0
            let addedLeafCount = (item["addedLeafIds"] as? [String])?.count ?? 0
            let removedLeafCount = (item["removedLeafIds"] as? [String])?.count ?? 0

            if invalidatedLeafCount > 0 {
                reviewCount += 1
            } else if changed || addedLeafCount > 0 || removedLeafCount > 0 {
                changedCount += 1
            } else {
                upToDateCount += 1
            }
        }

        var parts: [String] = []
        if changedCount > 0 {
            parts.append(localized("toast.update.summary.updated_count", String(changedCount)))
        }
        if upToDateCount > 0 {
            parts.append(localized("toast.update.summary.up_to_date_count", String(upToDateCount)))
        }
        if reviewCount > 0 {
            parts.append(localized("toast.update.summary.needs_review_count", String(reviewCount)))
        }

        guard !parts.isEmpty else {
            return items.count == 1
                ? localized("toast.update.summary.single")
                : localized("toast.update.summary.multiple", String(items.count))
        }

        return parts.joined(separator: " · ")
    }

    private func groupLabel(for sourceId: String) -> String {
        summary(for: sourceId)?.sourceDisplayName ?? sourceId
    }

    private func leafLabel(for leafId: String, sourceId: String) -> String {
        summary(for: sourceId)?.leafs.first(where: { $0.id == leafId })?.name ?? leafId
    }

    private func targetLabel(for targetId: String) -> String {
        AgentDisplayCatalog.label(for: targetId)
    }

    private func compactSkillToastMessage(sourceId: String, leafId: String, enabled: Bool) -> PresentationText {
        localizedText(
            "toast.compact.skill",
            enabled ? localized("toast.compact.on") : localized("toast.compact.off"),
            groupLabel(for: sourceId),
            leafLabel(for: leafId, sourceId: sourceId)
        )
    }

    private func compactSkillsToastMessage(sourceId: String, enabled: Bool) -> PresentationText {
        localizedText(
            "toast.compact.skills",
            enabled ? localized("toast.compact.on") : localized("toast.compact.off"),
            groupLabel(for: sourceId)
        )
    }

    private func compactAgentToastMessage(sourceId: String, targetId: String, enabled: Bool) -> PresentationText {
        localizedText(
            "toast.compact.agent",
            enabled ? localized("toast.compact.on") : localized("toast.compact.off"),
            groupLabel(for: sourceId),
            targetLabel(for: targetId)
        )
    }

    private func compactAgentsToastMessage(sourceId: String, enabled: Bool) -> PresentationText {
        localizedText(
            "toast.compact.agents",
            enabled ? localized("toast.compact.on") : localized("toast.compact.off"),
            groupLabel(for: sourceId)
        )
    }

    private func showToast(style: ToastStyle, message: String) {
        toast = ToastState(style: style, message: message)
    }

    private func showToast(style: ToastStyle, text: PresentationText) {
        toast = ToastState(style: style, text: text)
    }

    private func localizedText(_ key: String, _ arguments: String...) -> PresentationText {
        .localized(key, arguments)
    }

    private func localized(_ key: String, _ arguments: String...) -> String {
        PresentationText.localized(key, arguments).resolve(locale: Self.presentationLocale)
    }

    private func applyPinnedSourceIds(_ value: Any?) {
        guard
            let data = value as? [String: Any],
            let pinnedSourceIds = data["pinnedSourceIds"] as? [String]
        else {
            return
        }

        self.pinnedSourceIds = normalizedPinnedSourceIds(pinnedSourceIds)
    }

    private func sourceMetadataPresentation(
        from payload: [String: Any],
        sourceSnapshot: SourceSnapshotData?
    ) -> SourceMetadataPresentation {
        guard
            let sourceMetadata = payload["sourceMetadata"] as? [String: Any],
            let status = (sourceMetadata["status"] as? String)?.nonEmpty
        else {
            if let sourceSnapshot {
                return SourceMetadataPresentation(
                    lines: buildSnapshotSourceDetailLines(sourceSnapshot: sourceSnapshot),
                    starCount: sourceSnapshot.repoStars,
                    repositoryURL: sourceSnapshot.repoURL
                )
            }
            let legacySourceStats = payload["sourceStats"] as? [String: Any] ?? [:]
            return SourceMetadataPresentation(
                lines: buildReadySourceDetailLines(sourceStatsPayload: legacySourceStats),
                starCount: legacySourceStats["starCount"] as? Int,
                repositoryURL: (legacySourceStats["repoUrl"] as? String)?.nonEmpty
            )
        }

        if let sourceSnapshot {
            var lines = buildSnapshotSourceDetailLines(sourceSnapshot: sourceSnapshot)
            if status != "ready" {
                lines.append("Refresh: \(sourceMetadataExplanation(status: status, reasonCode: (sourceMetadata["reasonCode"] as? String)?.nonEmpty))")
            }
            return SourceMetadataPresentation(
                lines: lines,
                starCount: sourceSnapshot.repoStars,
                repositoryURL: sourceSnapshot.repoURL
            )
        }

        if status == "ready", let data = sourceMetadata["data"] as? [String: Any] {
            return SourceMetadataPresentation(
                lines: buildReadySourceDetailLines(sourceStatsPayload: data),
                starCount: data["starCount"] as? Int,
                repositoryURL: (data["repoUrl"] as? String)?.nonEmpty
            )
        }

        return SourceMetadataPresentation(
            lines: buildSourceMetadataStatusLines(
                status: status,
                provider: (sourceMetadata["provider"] as? String)?.nonEmpty,
                reasonCode: (sourceMetadata["reasonCode"] as? String)?.nonEmpty
            ),
            starCount: nil,
            repositoryURL: nil
        )
    }

    private func buildSkillDetailLines(
        leafRelativePath: String?,
        skillFilePath: String?,
        linkName: String,
        snapshotSkill: SnapshotSkill?
    ) -> [String] {
        var lines = [
            leafRelativePath,
            skillFilePath,
            "Link name: \(linkName)"
        ].compactMap { $0?.nonEmpty }

        if let installs = snapshotSkill?.installs {
            lines.append("Installs: \(formattedCount(installs))")
        }
        if let weeklyInstalls = snapshotSkill?.weeklyInstalls {
            lines.append("Weekly installs: \(formattedCount(weeklyInstalls))")
        }
        if let firstSeen = snapshotSkill?.firstSeen {
            lines.append("First seen: \(firstSeen)")
        }
        if let snapshotSkill, !snapshotSkill.installedOn.isEmpty {
            let installs = snapshotSkill.installedOn.map { item in
                if let installs = item.installs {
                    return "\(item.agent) \(formattedCount(installs))"
                }
                return item.agent
            }
            lines.append("Installed on: \(installs.joined(separator: ", "))")
        }
        if let audits = snapshotSkill?.audits {
            let auditParts = [
                audits.gen.map { "Gen \($0)" },
                audits.socket.map { "Socket \($0)" },
                audits.snyk.map { "Snyk \($0)" },
                audits.riskLevel.map { "Risk \($0)" }
            ].compactMap { $0 }
            if !auditParts.isEmpty {
                lines.append("Audit: \(auditParts.joined(separator: " · "))")
            }
        }

        return lines
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

    private func toggledPinnedSourceIds(from sourceIds: [String], sourceId: String) -> [String] {
        if let index = sourceIds.firstIndex(of: sourceId) {
            var next = sourceIds
            next.remove(at: index)
            return next
        }

        return sourceIds + [sourceId]
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
                let response = try await bridgeClient.togglePinnedSource(sourceId: sourceId)
                applyPinnedSourceIds(response.data?.value)
                migratedSourceIds.append(sourceId)
            }
            completePinnedSourceIdsMigration()
        } catch {
            for migratedSourceId in migratedSourceIds.reversed() {
                _ = try? await bridgeClient.togglePinnedSource(sourceId: migratedSourceId)
            }
            pinnedSourceIds = previousPinnedSourceIds
            showToast(style: .error, text: localizedText("toast.pinned_migration.failed", firstErrorLine(from: error)))
        }
    }

    private func completePinnedSourceIdsMigration() {
        UserDefaults.standard.set(true, forKey: pinnedSourceIdsMigrationKey)
        UserDefaults.standard.removeObject(forKey: legacyPinnedSourceIdsKey)
    }

    private func firstErrorLine(from error: Error) -> String {
        error.localizedDescription
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .first(where: { !$0.isEmpty }) ?? error.localizedDescription
    }

    nonisolated private static func localizedWarmup(_ key: String, _ arguments: String...) -> String {
        PresentationText.localized(key, arguments).resolve(locale: presentationLocale)
    }

    nonisolated private static func authorHandle(from locator: String) -> String? {
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let patterns = [
            #"github\.com/([^/\s]+)/"#,
            #"git@github\.com:([^/\s]+)/"#,
            #"clawhub/([^/\s]+)/"#,
        ]

        for pattern in patterns {
            if let regex = try? NSRegularExpression(pattern: pattern) {
                let nsRange = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
                if let match = regex.firstMatch(in: trimmed, range: nsRange),
                   match.numberOfRanges > 1,
                   let range = Range(match.range(at: 1), in: trimmed)
                {
                    return "@\(trimmed[range])"
                }
            }
        }

        let normalized = trimmed
            .replacingOccurrences(of: ".git", with: "")
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        if normalized.contains("/") {
            let components = normalized.split(separator: "/")
            if components.count >= 2 {
                return "@\(components[components.count - 2])"
            }
        }

        return nil
    }

    nonisolated private static func cachedSkillDocument(
        path: String,
        rawDocumentCache: inout [String: String]
    ) -> String {
        if let cached = rawDocumentCache[path] {
            return cached
        }

        let document: String
        if let raw = try? String(contentsOfFile: path, encoding: .utf8) {
            document = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            document = localizedWarmup("detail.document.skill_unavailable")
        }

        rawDocumentCache[path] = document
        return document
    }

    nonisolated private static func parsedDocument(
        path: String,
        rawDocumentCache: inout [String: String],
        parsedDocumentCache: inout [String: ParsedDocument]
    ) -> ParsedDocument {
        if let cached = parsedDocumentCache[path] {
            return cached
        }

        let content = cachedSkillDocument(path: path, rawDocumentCache: &rawDocumentCache)
        let parsed = parseDocument(content)
        parsedDocumentCache[path] = parsed
        return parsed
    }

    nonisolated private static func documentTabs(
        for skillFilePath: String,
        groupPath: String?,
        gitHubRepoContext: GitHubRepoContext?,
        rawDocumentCache: inout [String: String],
        parsedDocumentCache: inout [String: ParsedDocument],
        documentTabsCache: inout [String: [DocumentTab]]
    ) -> [DocumentTab] {
        if let cached = documentTabsCache[skillFilePath] {
            return cached
        }

        var tabs: [DocumentTab] = [
            makeDocumentTab(
                id: skillFilePath,
                title: "SKILL.md",
                path: skillFilePath,
                rawDocumentCache: &rawDocumentCache,
                parsedDocumentCache: &parsedDocumentCache
            )
        ]

        let folderPath = (skillFilePath as NSString).deletingLastPathComponent
        let referencesPath = (folderPath as NSString).appendingPathComponent("references")
        if let entries = try? FileManager.default.contentsOfDirectory(atPath: referencesPath) {
            for entry in entries.sorted() where entry.lowercased().hasSuffix(".md") {
                let fullPath = (referencesPath as NSString).appendingPathComponent(entry)
                tabs.append(
                    makeDocumentTab(
                        id: fullPath,
                        title: "references/\(entry)",
                        path: fullPath,
                        rawDocumentCache: &rawDocumentCache,
                        parsedDocumentCache: &parsedDocumentCache
                    )
                )
            }
        }

        let enriched = enrichDocumentTabs(
            tabs,
            groupPath: groupPath,
            gitHubRepoContext: gitHubRepoContext
        )
        documentTabsCache[skillFilePath] = enriched
        return enriched
    }

    nonisolated private static func makeDocumentTab(
        id: String,
        title: String,
        path: String,
        rawDocumentCache: inout [String: String],
        parsedDocumentCache: inout [String: ParsedDocument]
    ) -> DocumentTab {
        let parsed = parsedDocument(
            path: path,
            rawDocumentCache: &rawDocumentCache,
            parsedDocumentCache: &parsedDocumentCache
        )
        let rawContent = cachedSkillDocument(path: path, rawDocumentCache: &rawDocumentCache)
        return DocumentTab(
            id: id,
            title: title,
            path: path,
            metadata: parsed.metadata,
            content: parsed.body,
            renderCacheKey: "\(path):\(rawContent.hashValue)",
            externalURL: nil
        )
    }

    nonisolated private static func parseDocument(_ content: String) -> ParsedDocument {
        let lines = content.components(separatedBy: .newlines)
        guard lines.first?.trimmingCharacters(in: .whitespacesAndNewlines) == "---" else {
            return ParsedDocument(frontMatter: nil, metadata: [], body: content.trimmingCharacters(in: .whitespacesAndNewlines))
        }

        guard let closingIndex = lines.dropFirst().firstIndex(where: {
            $0.trimmingCharacters(in: .whitespacesAndNewlines) == "---"
        }) else {
            return ParsedDocument(frontMatter: nil, metadata: [], body: content.trimmingCharacters(in: .whitespacesAndNewlines))
        }

        let frontMatterText = Array(lines[1..<closingIndex]).joined(separator: "\n")
        let metadata = parseFrontmatterEntries(frontMatterText)
        let frontMatter = parseFrontMatter(frontMatterText)
        let bodyLines = closingIndex + 1 < lines.count ? Array(lines[(closingIndex + 1)...]) : []
        let body = bodyLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        return ParsedDocument(frontMatter: frontMatter, metadata: metadata, body: body)
    }

    nonisolated private static func parseFrontMatter(_ frontMatterText: String) -> SkillFrontMatter? {
        try? YAMLDecoder().decode(SkillFrontMatter.self, from: frontMatterText)
    }

    nonisolated private static func parseFrontmatterEntries(_ frontMatterText: String) -> [MetadataEntry] {
        guard let dictionary = (try? Yams.load(yaml: frontMatterText)) as? [String: Any] else {
            return []
        }

        return dictionary.keys.sorted().compactMap { key in
            guard let value = dictionary[key] else {
                return nil
            }

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

    nonisolated private static func groupDocumentTabs(
        groupPath: String?,
        fileTree: [FileTreeItem],
        gitHubRepoContext: GitHubRepoContext?,
        rawDocumentCache: inout [String: String],
        parsedDocumentCache: inout [String: ParsedDocument]
    ) -> [DocumentTab] {
        var tabs: [DocumentTab] = [
            DocumentTab(
                id: "group:filetree",
                title: localizedWarmup("detail.document.file_tree"),
                path: groupPath ?? ".",
                metadata: [],
                content: renderFileTree(fileTree),
                renderCacheKey: "group:filetree:\(groupPath ?? ".")",
                externalURL: nil
            )
        ]

        guard let groupPath,
              let entries = try? FileManager.default.contentsOfDirectory(atPath: groupPath)
        else {
            return tabs
        }

        let markdownFiles = entries
            .filter { $0.lowercased().hasSuffix(".md") }
            .sorted { compareRootDocumentNames($0, $1) }

        for entry in markdownFiles {
            let fullPath = (groupPath as NSString).appendingPathComponent(entry)
            tabs.append(
                makeDocumentTab(
                    id: "group:\(fullPath)",
                    title: entry,
                    path: fullPath,
                    rawDocumentCache: &rawDocumentCache,
                    parsedDocumentCache: &parsedDocumentCache
                )
            )
        }

        return enrichDocumentTabs(tabs, groupPath: groupPath, gitHubRepoContext: gitHubRepoContext)
    }

    nonisolated private static func compareRootDocumentNames(_ lhs: String, _ rhs: String) -> Bool {
        let leftRank = rootDocumentRank(lhs)
        let rightRank = rootDocumentRank(rhs)
        if leftRank != rightRank {
            return leftRank < rightRank
        }
        return lhs.localizedCaseInsensitiveCompare(rhs) == .orderedAscending
    }

    nonisolated private static func rootDocumentRank(_ name: String) -> Int {
        let uppercased = name.uppercased()
        if uppercased == "README.MD" {
            return 0
        }
        if uppercased.contains("README") {
            return 1
        }
        if uppercased.contains("CHANGELOG")
            || uppercased.contains("LICENSE")
            || uppercased.contains("PLAN")
            || uppercased.contains("DESIGN")
            || uppercased.contains("RELEASE")
        {
            return 2
        }
        return 3
    }

    nonisolated private static func relativePath(from basePath: String, to targetPath: String) -> String? {
        let standardizedBase = URL(fileURLWithPath: basePath).standardizedFileURL.path
        let standardizedTarget = URL(fileURLWithPath: targetPath).standardizedFileURL.path
        guard standardizedTarget.hasPrefix(standardizedBase) else {
            return nil
        }
        let suffix = String(standardizedTarget.dropFirst(standardizedBase.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return suffix.isEmpty ? "." : suffix
    }

    nonisolated private static func projectedRelativeFolderPath(
        _ relativeFolderPath: String?,
        projectedName: String?,
        fallbackName: String
    ) -> String? {
        guard let relativeFolderPath, let projectedName, projectedName != fallbackName else {
            return relativeFolderPath
        }

        let trimmed = relativeFolderPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !trimmed.isEmpty, trimmed != "." else {
            return projectedName
        }

        var components = trimmed.split(separator: "/").map(String.init)
        components[components.count - 1] = projectedName
        return components.joined(separator: "/")
    }

    nonisolated private static func buildFileTreeItems(groupPath: String?, skills: [DetailSkill]) -> [FileTreeItem] {
        let rootName = groupPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty } ?? "."
        let skillReferences = fileTreeSkillReferences(skills: skills, groupPath: groupPath)

        guard let groupPath else {
            return buildSyntheticFileTreeItems(rootName: rootName, skills: skillReferences)
        }

        let standardizedRootPath = URL(fileURLWithPath: groupPath).standardizedFileURL.path
        guard FileManager.default.fileExists(atPath: standardizedRootPath),
              let rootItem = buildFileTreeItem(
                  at: standardizedRootPath,
                  rootDisplayTitle: rootName,
                  skillReferencesByPath: Dictionary(uniqueKeysWithValues: skillReferences.map { ($0.folderPath, $0) })
              )
        else {
            return buildSyntheticFileTreeItems(rootName: rootName, skills: skillReferences)
        }

        return [rootItem]
    }

    nonisolated private static func fileTreeSkillReferences(
        skills: [DetailSkill],
        groupPath: String?
    ) -> [FileTreeSkillReference] {
        skills.compactMap { skill in
            let displayTitle = skill.relativeFolderPath?
                .split(separator: "/")
                .last
                .map(String.init)
                ?? skill.folderPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty }
                ?? skill.title.nonEmpty

            guard let displayTitle else {
                return nil
            }

            let folderPath: String?
            if let absoluteFolderPath = skill.folderPath?.nonEmpty {
                folderPath = URL(fileURLWithPath: absoluteFolderPath).standardizedFileURL.path
            } else if let groupPath, let relativeFolderPath = skill.relativeFolderPath?.nonEmpty {
                folderPath = URL(fileURLWithPath: groupPath)
                    .appendingPathComponent(relativeFolderPath)
                    .standardizedFileURL
                    .path
            } else {
                folderPath = nil
            }

            guard let folderPath else {
                return nil
            }

            return FileTreeSkillReference(
                skillId: skill.id,
                folderPath: folderPath,
                displayTitle: displayTitle
            )
        }
    }

    nonisolated private static func buildFileTreeItem(
        at path: String,
        rootDisplayTitle: String? = nil,
        skillReferencesByPath: [String: FileTreeSkillReference]
    ) -> FileTreeItem? {
        let standardizedPath = URL(fileURLWithPath: path).standardizedFileURL.path
        let url = URL(fileURLWithPath: standardizedPath)
        let values = try? url.resourceValues(forKeys: [.isDirectoryKey])
        let isDirectory = values?.isDirectory ?? false
        let skillReference = skillReferencesByPath[standardizedPath]
        let skillRootPaths = Set(skillReferencesByPath.keys)
        let title = rootDisplayTitle
            ?? skillReference?.displayTitle
            ?? url.lastPathComponent.nonEmpty
            ?? standardizedPath

        let children: [FileTreeItem]
        if isDirectory,
           let entries = try? FileManager.default.contentsOfDirectory(
               at: url,
               includingPropertiesForKeys: [.isDirectoryKey],
               options: [.skipsHiddenFiles]
           ) {
            children = entries
                .compactMap { entry in
                    buildFileTreeItem(
                        at: entry.path,
                        skillReferencesByPath: skillReferencesByPath
                    )
                }
                .filter { item in
                    shouldIncludeFileTreeItem(
                        item,
                        parentPath: standardizedPath,
                        currentSkillReference: skillReference,
                        rootPath: rootDisplayTitle == nil ? nil : standardizedPath,
                        skillRootPaths: skillRootPaths
                    )
                }
                .sorted { lhs, rhs in
                    sortFileTreeItems(
                        lhs,
                        rhs,
                        isRootLevel: rootDisplayTitle != nil
                    )
                }
        } else {
            children = []
        }

        let isSkillDocument = !isDirectory
            && url.lastPathComponent.caseInsensitiveCompare("SKILL.md") == .orderedSame
            && skillReferencesByPath[(url.deletingLastPathComponent().path)] != nil

        return FileTreeItem(
            id: standardizedPath,
            title: title,
            path: standardizedPath,
            isDirectory: isDirectory,
            isSkillRoot: skillReference != nil,
            isSkillDocument: isSkillDocument,
            skillId: skillReference?.skillId
                ?? (isSkillDocument ? skillReferencesByPath[url.deletingLastPathComponent().path]?.skillId : nil),
            children: children
        )
    }

    nonisolated private static func shouldIncludeFileTreeItem(
        _ item: FileTreeItem,
        parentPath: String,
        currentSkillReference: FileTreeSkillReference?,
        rootPath: String?,
        skillRootPaths: Set<String>
    ) -> Bool {
        let isRootLevel = rootPath == parentPath

        if item.isDirectory {
            return containsSkillRootDescendant(item.path, skillRootPaths: skillRootPaths)
        }

        if isRootLevel {
            return item.title.lowercased().hasSuffix(".md")
        }

        if currentSkillReference != nil {
            return true
        }

        return false
    }

    nonisolated private static func containsSkillRootDescendant(
        _ path: String,
        skillRootPaths: Set<String>
    ) -> Bool {
        let normalizedPath = URL(fileURLWithPath: path).standardizedFileURL.path
        if skillRootPaths.contains(normalizedPath) {
            return true
        }
        let prefix = normalizedPath.hasSuffix("/") ? normalizedPath : normalizedPath + "/"
        return skillRootPaths.contains(where: { $0.hasPrefix(prefix) })
    }

    nonisolated private static func buildSyntheticFileTreeItems(
        rootName: String,
        skills: [FileTreeSkillReference]
    ) -> [FileTreeItem] {
        var root = FileTreeNode(name: rootName)

        for skill in skills {
            let components = skill.displayTitle.split(separator: "/").map(String.init)
            insertFileTreePath(components, into: &root)
        }

        return [
            fileTreeItems(from: root, parentPath: rootName, skillReferencesByPath: Dictionary(uniqueKeysWithValues: skills.map { ($0.folderPath, $0) }))
        ]
    }

    nonisolated private static func insertFileTreePath(_ components: [String], into node: inout FileTreeNode) {
        guard let head = components.first else {
            return
        }

        var child = node.children[head] ?? FileTreeNode(name: head)
        child.isFile = components.count == 1
        if components.count > 1 {
            insertFileTreePath(Array(components.dropFirst()), into: &child)
        }
        node.children[head] = child
    }

    nonisolated private static func fileTreeItems(
        from node: FileTreeNode,
        parentPath: String,
        skillReferencesByPath _: [String: FileTreeSkillReference]
    ) -> FileTreeItem {
        let itemPath = parentPath
        let children = node.children.values
            .sorted { lhs, rhs in
                if lhs.isFile != rhs.isFile {
                    return !lhs.isFile && rhs.isFile
                }
                return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
            }
            .map { child in
                fileTreeItems(
                    from: child,
                    parentPath: "\(parentPath)/\(child.name)",
                    skillReferencesByPath: [:]
                )
            }
        return FileTreeItem(
            id: itemPath,
            title: node.name,
            path: itemPath,
            isDirectory: !node.isFile,
            isSkillRoot: false,
            isSkillDocument: false,
            skillId: nil,
            children: children
        )
    }

    nonisolated private static func sortFileTreeItems(_ lhs: FileTreeItem, _ rhs: FileTreeItem, isRootLevel: Bool) -> Bool {
        if lhs.isDirectory != rhs.isDirectory {
            return lhs.isDirectory && !rhs.isDirectory
        }
        if isRootLevel, !lhs.isDirectory, !rhs.isDirectory {
            return compareRootDocumentNames(lhs.title, rhs.title)
        }
        return lhs.title.localizedCaseInsensitiveCompare(rhs.title) == .orderedAscending
    }

    nonisolated private static func renderFileTree(_ items: [FileTreeItem]) -> String {
        renderFileTreeLines(items).map { "\($0.prefix)\($0.title)" }.joined(separator: "\n")
    }

    nonisolated private static func renderFileTreeLines(_ items: [FileTreeItem]) -> [FileTreeLine] {
        var lines: [FileTreeLine] = []
        for (index, item) in items.enumerated() {
            lines.append(
                FileTreeLine(
                    id: item.id,
                    depth: 0,
                    prefix: "",
                    title: item.title,
                    isFile: !item.isDirectory
                )
            )
            appendRenderedFileTreeLines(
                from: item.children,
                depth: 1,
                ancestry: [index == items.count - 1],
                into: &lines
            )
        }
        return lines
    }

    nonisolated private static func appendRenderedFileTreeLines(
        from items: [FileTreeItem],
        depth: Int,
        ancestry: [Bool],
        into lines: inout [FileTreeLine]
    ) {
        for (index, item) in items.enumerated() {
            let isLast = index == items.count - 1
            let branch = ancestry.dropLast().map { $0 ? "    " : "|   " }.joined() + (isLast ? "`-- " : "|-- ")
            lines.append(
                FileTreeLine(
                    id: item.id,
                    depth: depth,
                    prefix: branch,
                    title: item.title,
                    isFile: !item.isDirectory
                )
            )
            appendRenderedFileTreeLines(
                from: item.children,
                depth: depth + 1,
                ancestry: ancestry + [isLast],
                into: &lines
            )
        }
    }

    nonisolated private static func enrichDocumentTabs(
        _ tabs: [DocumentTab],
        groupPath: String?,
        gitHubRepoContext: GitHubRepoContext?
    ) -> [DocumentTab] {
        tabs.map { document in
            DocumentTab(
                id: document.id,
                title: document.title,
                path: document.path,
                metadata: document.metadata,
                content: document.content,
                renderCacheKey: document.renderCacheKey,
                externalURL: gitHubDocumentURL(
                    path: document.path,
                    groupPath: groupPath,
                    gitHubRepoContext: gitHubRepoContext
                )
            )
        }
    }

    nonisolated private static func gitHubDocumentURL(
        path: String,
        groupPath: String?,
        gitHubRepoContext: GitHubRepoContext?
    ) -> String? {
        guard let groupPath,
              let gitHubRepoContext,
              let relativePath = relativePath(from: groupPath, to: path),
              relativePath != "."
        else {
            return nil
        }

        let normalizedPath = relativePath
            .split(separator: "/")
            .map(String.init)
            .joined(separator: "/")
        return "https://github.com/\(gitHubRepoContext.owner)/\(gitHubRepoContext.repo)/blob/\(gitHubRepoContext.revision)/\(normalizedPath)"
    }

    nonisolated private static func displayOriginLabel(from locator: String) -> String {
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return localizedWarmup("detail.meta.unknown_source")
        }

        if let url = URL(string: trimmed), let host = url.host?.nonEmpty {
            return host
        }

        if trimmed.contains("github.com") {
            return "github.com"
        }

        return trimmed
    }

    private func preferredGroupPath(lockPayload: [String: Any], leafPayloads: [[String: Any]]) -> String? {
        if let checkoutPath = (lockPayload["checkoutPath"] as? String)?.nonEmpty {
            return checkoutPath
        }

        let folderPaths = leafPayloads.compactMap {
            (($0["absolutePath"] as? String)?.nonEmpty)
                ?? (($0["skillFilePath"] as? String).flatMap { ($0 as NSString).deletingLastPathComponent.nonEmpty })
        }
        return commonDirectoryPath(paths: folderPaths)
    }

    private func commonDirectoryPath(paths: [String]) -> String? {
        guard var components = paths.first?.split(separator: "/").map(String.init), !components.isEmpty else {
            return nil
        }

        for path in paths.dropFirst() {
            let current = path.split(separator: "/").map(String.init)
            var index = 0
            while index < min(components.count, current.count), components[index] == current[index] {
                index += 1
            }
            components = Array(components.prefix(index))
            if components.isEmpty {
                return "/"
            }
        }

        return "/" + components.joined(separator: "/")
    }

    private func gitHubRepoContext(locator: String, lockPayload: [String: Any]) -> GitHubRepoContext? {
        guard let repo = parseGitHubRepo(locator) else {
            return nil
        }
        let revision = (lockPayload["commitSha"] as? String)?.nonEmpty
            ?? (lockPayload["resolvedVersion"] as? String)?.nonEmpty
            ?? "HEAD"
        return GitHubRepoContext(owner: repo.owner, repo: repo.repo, revision: revision)
    }

    private func parseGitHubRepo(_ locator: String) -> (owner: String, repo: String)? {
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return nil
        }

        let patterns = [
            #"^https?://github\.com/([^/\s]+)/([^/\s]+?)(?:\.git)?(?:/)?$"#,
            #"^git@github\.com:([^/\s]+)/([^/\s]+?)(?:\.git)?$"#
        ]

        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else {
                continue
            }
            let nsRange = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
            guard let match = regex.firstMatch(in: trimmed, options: [], range: nsRange),
                  match.numberOfRanges == 3,
                  let ownerRange = Range(match.range(at: 1), in: trimmed),
                  let repoRange = Range(match.range(at: 2), in: trimmed)
            else {
                continue
            }
            return (String(trimmed[ownerRange]), String(trimmed[repoRange]))
        }

        return nil
    }

    private func buildReadySourceDetailLines(sourceStatsPayload: [String: Any]) -> [String] {
        var lines: [String] = []

        if let provider = (sourceStatsPayload["provider"] as? String)?.nonEmpty {
            lines.append(localized("source.metadata.provider", provider))
        }
        if let repoLabel = (sourceStatsPayload["repoLabel"] as? String)?.nonEmpty {
            lines.append(localized("source.metadata.repository", repoLabel))
        }
        if let totalInstalls = sourceStatsPayload["totalInstalls"] as? Int {
            lines.append(localized("source.metadata.total_installs", formattedCount(totalInstalls)))
        }
        if let weeklyInstalls = sourceStatsPayload["weeklyInstalls"] as? Int {
            lines.append(localized("source.metadata.current_installs", formattedCount(weeklyInstalls)))
        }
        if let downloadCount = sourceStatsPayload["downloadCount"] as? Int {
            lines.append(localized("source.metadata.downloads", formattedCount(downloadCount)))
        }
        if let starCount = sourceStatsPayload["starCount"] as? Int {
            lines.append(localized("source.metadata.stars", formattedCount(starCount)))
        }
        if let ownerHandle = (sourceStatsPayload["ownerHandle"] as? String)?.nonEmpty {
            let ownerDisplayName = (sourceStatsPayload["ownerDisplayName"] as? String)?.nonEmpty
            lines.append(
                ownerDisplayName.map { localized("source.metadata.owner_with_name", ownerHandle, $0) }
                    ?? localized("source.metadata.owner", ownerHandle)
            )
        }
        if let repoURL = (sourceStatsPayload["repoUrl"] as? String)?.nonEmpty {
            lines.append(localized("source.metadata.repo_url", repoURL))
        }

        return lines
    }

    private func buildSnapshotSourceDetailLines(sourceSnapshot: SourceSnapshotData) -> [String] {
        var lines: [String] = [
            localized("source.metadata.provider", sourceSnapshot.provider),
            localized("source.metadata.repository", sourceSnapshot.repoLabel)
        ]

        lines.append(localized("source.metadata.owner", sourceSnapshot.owner.slug))
        if let sourceCount = sourceSnapshot.owner.sourceCount {
            lines.append(localized("source.snapshot.owner_sources", formattedCount(sourceCount)))
        }
        if let skillCount = sourceSnapshot.owner.skillCount {
            lines.append(localized("source.snapshot.owner_skills", formattedCount(skillCount)))
        }
        if let totalInstalls = sourceSnapshot.owner.totalInstalls {
            lines.append(localized("source.snapshot.owner_installs", formattedCount(totalInstalls)))
        }

        if let totalInstalls = sourceSnapshot.totalInstalls {
            lines.append(localized("source.metadata.total_installs", formattedCount(totalInstalls)))
        }
        if let skillCount = sourceSnapshot.skillCount {
            lines.append(localized("source.snapshot.skills", formattedCount(skillCount)))
        }
        if let repoStars = sourceSnapshot.repoStars {
            lines.append(localized("source.snapshot.repo_stars", formattedCount(repoStars)))
        }
        if let forkCount = sourceSnapshot.forkCount {
            lines.append(localized("source.snapshot.forks", formattedCount(forkCount)))
        }
        if let language = sourceSnapshot.language {
            lines.append(localized("source.snapshot.language", language))
        }
        if let pushedAt = sourceSnapshot.pushedAt {
            lines.append(localized("source.snapshot.repo_updated", relativeUpdateLabel(pushedAt)))
        }
        if !sourceSnapshot.topics.isEmpty {
            lines.append(localized("source.snapshot.topics", sourceSnapshot.topics.joined(separator: ", ")))
        }
        if let trust = sourceSnapshot.trust, !trust.labels.isEmpty {
            lines.append(localized("source.snapshot.trust", trust.labels.joined(separator: " · ")))
        }

        let topSkills = sourceSnapshot.skills
            .sorted { lhs, rhs in (lhs.installs ?? 0) > (rhs.installs ?? 0) }
            .prefix(3)
            .map { skill -> String in
                if let installs = skill.installs {
                    return "\(skill.title) \(formattedCount(installs))"
                }
                return skill.title
            }
        if !topSkills.isEmpty {
            lines.append(localized("source.snapshot.top_skills", topSkills.joined(separator: ", ")))
        }

        lines.append(localized("source.metadata.repo_url", sourceSnapshot.repoURL))
        return lines
    }

    private func buildSourceMetadataStatusLines(
        status: String,
        provider: String?,
        reasonCode: String?
    ) -> [String] {
        var lines: [String] = []
        if let provider {
            lines.append(localized("source.metadata.provider", provider))
        }

        lines.append(localized("source.metadata.status", localizedSourceMetadataStatus(status)))
        lines.append(sourceMetadataExplanation(status: status, reasonCode: reasonCode))
        return lines
    }

    private func localizedSourceMetadataStatus(_ status: String) -> String {
        switch status {
        case "ready":
            return localized("source.metadata.status_value.ready")
        case "unsupported":
            return localized("source.metadata.status_value.unsupported")
        case "disabled":
            return localized("source.metadata.status_value.disabled")
        case "failed":
            return localized("source.metadata.status_value.failed")
        default:
            return localized("source.metadata.status_value.unknown")
        }
    }

    private func sourceMetadataExplanation(status: String, reasonCode: String?) -> String {
        switch status {
        case "unsupported":
            return localized("common.source_metadata.unavailable")
        case "disabled":
            return localized("source.metadata.explanation.disabled")
        case "failed":
            switch reasonCode {
            case "provider_rate_limited":
                return localized("source.metadata.explanation.failed_rate_limited")
            case "provider_response_invalid":
                return localized("source.metadata.explanation.failed_response_invalid")
            default:
                return localized("source.metadata.explanation.failed_default")
            }
        default:
            return localized("common.source_metadata.unavailable")
        }
    }

    private func formattedCount(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Self.presentationLocale
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    private func relativeUpdateLabel(_ rawValue: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: rawValue) else {
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

    private func pruneStateMaps(allowedSourceIds: Set<String>) {
        workingDrafts = pruneSourceMap(workingDrafts, allowedSourceIds: allowedSourceIds)
        saveStateBySourceId = pruneSourceMap(saveStateBySourceId, allowedSourceIds: allowedSourceIds)
    }

    private func projectionSummaries() -> [ProjectionSourceSummary] {
        allSummaries.map { summary in
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
        Dictionary(uniqueKeysWithValues: allSummaries.compactMap { summary in
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

    private func uniqueSorted(_ values: [String]) -> [String] {
        Array(Set(values)).sorted()
    }

    private static func sanitizedDetailTitle(_ value: String?) -> String? {
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

    private static func detailTitleFallback(from locator: String, sourceId: String) -> String {
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

        let components = trimmed.split(separator: "/").map(String.init)
        return components.last ?? sourceId
    }

    private func pruneSourceMap<T>(_ sourceMap: [String: T], allowedSourceIds: Set<String>) -> [String: T] {
        Dictionary(uniqueKeysWithValues: sourceMap.filter { allowedSourceIds.contains($0.key) })
    }

}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }

    var capitalizedSentence: String {
        guard let first else {
            return self
        }
        return String(first).uppercased() + dropFirst()
    }
}

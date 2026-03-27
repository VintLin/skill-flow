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
        var message: String?
    }

    enum ToastStyle {
        case loading
        case success
        case neutral
        case error
    }

    struct ToastState: Identifiable, Equatable {
        let id = UUID()
        let style: ToastStyle
        let message: String
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
    }

    struct GroupCardTarget: Identifiable {
        let id: String
        let label: String
        let shortLabel: String
        let isEnabled: Bool
    }

    struct GroupCardModel: Identifiable {
        let id: String
        let title: String
        let subtitle: String
        let metaLine: String
        let isPinned: Bool
        let health: String
        let warningCount: Int
        let errorCount: Int
        let skillSelection: SelectionState
        let targetSelection: SelectionState
        let skills: [GroupCardSkill]
        let targets: [GroupCardTarget]
        let saveState: SaveState
    }

    struct DetailSkill: Identifiable {
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

    struct MetadataEntry: Identifiable, Equatable {
        let id: String
        let key: String
        let value: String
    }

    struct DocumentTab: Identifiable, Equatable {
        let id: String
        let title: String
        let path: String
        let metadata: [MetadataEntry]
        let content: String
        let renderCacheKey: String
        let externalURL: String?
    }

    struct DetailTarget: Identifiable {
        let id: String
        let label: String
        let shortLabel: String
        let isEnabled: Bool
    }

    struct FileTreeLine: Identifiable {
        let id: String
        let depth: Int
        let prefix: String
        let title: String
        let isFile: Bool
    }

    struct DetailViewData {
        let sourceId: String
        let title: String
        let subtitle: String
        let author: String
        let originLabel: String
        let starCount: Int?
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
        let fileTree: [FileTreeLine]
        let groupDocuments: [DocumentTab]
        let targets: [DetailTarget]
        let skills: [DetailSkill]
    }

    enum ImportPhase: Equatable {
        case idle
        case preparing
        case prepared
        case importing
        case failed(String)
    }

    struct ImportPreviewSkill: Identifiable, Equatable {
        let id: String
        let title: String
        let relativePath: String
        let summary: String
        let isSelected: Bool
    }

    struct ImportPreviewState: Equatable {
        let sourceId: String
        let title: String
        let locator: String
        let kind: String
        let availableTargets: [String]
        let selectedLeafIds: [String]
        let enabledTargets: [String]
        let skills: [ImportPreviewSkill]
        let warnings: [String]
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

    private struct LeafSummary {
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

    private struct WorkflowSummary {
        let sourceId: String
        let sourceKind: String
        let sourceDisplayName: String
        let sourceLocator: String
        let leafs: [LeafSummary]
        let selectedLeafIds: [String]
        let enabledTargets: [String]
        let targetLeafIdsByTarget: [String: [String]]
        let health: String
        let warningCount: Int
        let errorCount: Int
        let updatedAt: String
    }

    private struct FileTreeNode {
        var name: String
        var isFile: Bool
        var children: [String: FileTreeNode]

        init(name: String, isFile: Bool = false, children: [String: FileTreeNode] = [:]) {
            self.name = name
            self.isFile = isFile
            self.children = children
        }
    }

    private struct ParsedDocument {
        let frontMatter: SkillFrontMatter?
        let metadata: [MetadataEntry]
        let body: String
    }

    private struct SkillFrontMatter: Decodable {
        let name: String?
        let description: String?
        let version: String?
        let enabled: Bool?
    }

    private struct GitHubRepoContext {
        let owner: String
        let repo: String
        let revision: String
    }

    private let bridgeClient: BridgeClient

    private static let targetOrder: [String] = [
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

    private static let targetCatalog: [String: String] = [
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

    private static let targetShortLabel: [String: String] = [
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

    private let pinnedSourceIdsKey = "desktop.pinnedSourceIds"
    private var baselineDrafts: [String: DraftState] = [:]
    private var workingDrafts: [String: DraftState] = [:]
    private var detectedTargets: Set<String> = []
    private var inspectedPayloadBySourceId: [String: [String: Any]] = [:]
    private var skillDocumentCache: [String: String] = [:]
    private var parsedDocumentCache: [String: ParsedDocument] = [:]
    private var documentTabsCache: [String: [DocumentTab]] = [:]

    private var allSummaries: [WorkflowSummary] = []

    var loadState: LoadState = .idle
    var selectedSection: Section = .overview

    var sourceIds: [String] = []
    var selectedSourceId: String?
    var newSourceLocator: String = ""
    var searchQuery: String = ""
    var currentPage: Page = .home
    var importPhase: ImportPhase = .idle
    var importPreview: ImportPreviewState?

    var detailText: String = "Select a source to inspect details."
    var healthLabel: String = "Unknown"
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

    init(bridgeClient: BridgeClient) {
        self.bridgeClient = bridgeClient
        self.pinnedSourceIds = UserDefaults.standard.stringArray(forKey: pinnedSourceIdsKey) ?? []
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
            TargetOption(id: target, label: Self.targetCatalog[target] ?? target)
        }
    }

    var sourceRows: [SourceRow] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
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
        sourceRows.compactMap { row in
            guard let summary = summary(for: row.id), let draft = draft(for: row.id) else {
                return nil
            }

            let enabledLeafIds = Set(draft.selectedLeafIds)
            let enabledTargets = Set(draft.enabledTargets)

            return GroupCardModel(
                id: row.id,
                title: row.displayName,
                subtitle: subtitleText(locator: row.locator, kind: row.kind),
                metaLine: "from \(row.locator.isEmpty ? row.kind : row.locator)",
                isPinned: pinnedSourceIds.contains(row.id),
                health: row.status,
                warningCount: row.warningCount,
                errorCount: row.errorCount,
                skillSelection: skillSelectionState(sourceId: row.id),
                targetSelection: targetSelectionState(sourceId: row.id),
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
                        label: Self.targetCatalog[targetId] ?? targetId,
                        shortLabel: Self.targetShortLabel[targetId] ?? String((Self.targetCatalog[targetId] ?? targetId).prefix(2)).uppercased(),
                        isEnabled: enabledTargets.contains(targetId)
                    )
                },
                saveState: saveStateBySourceId[row.id] ?? SaveState(phase: .idle, message: nil)
            )
        }
    }

    func togglePinned(sourceId: String) {
        if let index = pinnedSourceIds.firstIndex(of: sourceId) {
            pinnedSourceIds.remove(at: index)
        } else {
            pinnedSourceIds.append(sourceId)
        }
        UserDefaults.standard.set(pinnedSourceIds, forKey: pinnedSourceIdsKey)
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
        if let handle = authorHandle(from: locator) {
            return "by \(handle)"
        }
        return "by \(kind.lowercased())"
    }

    private func authorHandle(from locator: String) -> String? {
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        let patterns = [
            #"github\.com/([^/\s]+)/"#,
            #"git@github\.com:([^/\s]+)/"#,
            #"clawhub/([^/\s]+)/"#,
        ]

        for pattern in patterns {
            if let regex = try? NSRegularExpression(pattern: pattern) {
                let nsrange = NSRange(trimmed.startIndex..<trimmed.endIndex, in: trimmed)
                if let match = regex.firstMatch(in: trimmed, range: nsrange),
                   match.numberOfRanges > 1,
                   let range = Range(match.range(at: 1), in: trimmed)
                {
                    return "@\(trimmed[range])"
                }
            }
        }

        return nil
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
            return SaveState(phase: .idle, message: nil)
        }
        return saveStateBySourceId[groupId] ?? SaveState(phase: .idle, message: nil)
    }

    func saveState(for sourceId: String) -> SaveState {
        saveStateBySourceId[sourceId] ?? SaveState(phase: .idle, message: nil)
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
        guard let sourceId = resolveSourceId(sourceId), let summary = summary(for: sourceId), var draft = workingDrafts[sourceId] else {
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
        guard let sourceId = resolveSourceId(sourceId), let summary = summary(for: sourceId), var draft = workingDrafts[sourceId] else {
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
        guard let sourceId = resolveSourceId(sourceId), var draft = workingDrafts[sourceId] else {
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
            let selectedLeafIds = baselineDrafts[summary.sourceId]?.selectedLeafIds ?? summary.selectedLeafIds
            let enabledTargets = baselineDrafts[summary.sourceId]?.enabledTargets ?? summary.enabledTargets

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
                let targetLabel = Self.targetCatalog[target] ?? target

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

            let list = try await bridgeClient.list()
            applyList(list)

            loadState = .ready
            healthLabel = list.warnings.isEmpty ? "Healthy" : "Warnings"

            Task {
                await runDoctor()
            }
        } catch {
            loadState = .failed(error.localizedDescription)
            healthLabel = "Error"
            detailText = "Bootstrap failed: \(error.localizedDescription)"
        }
    }

    func refreshList() async {
        isRefreshing = true
        defer { isRefreshing = false }

        do {
            let response = try await bridgeClient.list()
            applyList(response)
            latestWarnings = response.warnings
            healthLabel = response.warnings.isEmpty ? "Healthy" : "Warnings"
        } catch {
            loadState = .failed(error.localizedDescription)
            detailText = "Refresh failed: \(error.localizedDescription)"
        }
    }

    func selectSource(_ sourceId: String) async {
        selectedSourceId = sourceId
        do {
            let response = try await bridgeClient.inspect(sourceId: sourceId)
            if let payload = response.data?.value as? [String: Any] {
                inspectedPayloadBySourceId[sourceId] = payload
            }
            detailText = prettyPrint(response.data?.value) ?? "No details"
            latestWarnings = response.warnings
        } catch {
            detailText = "Inspect failed: \(error.localizedDescription)"
            showToast(style: .error, message: "Failed to load \(sourceId) details.")
        }
    }

    func runDoctor() async {
        do {
            let response = try await bridgeClient.doctor()
            detailText = prettyPrint(response.data?.value) ?? "No doctor data"
            latestWarnings = response.warnings
            healthLabel = response.warnings.isEmpty ? "Healthy" : "Warnings"
            lastDoctorError = nil
            doctorIssues = parseDoctorIssues(response.data?.value)
        } catch {
            detailText = "Doctor failed: \(error.localizedDescription)"
            healthLabel = "Error"
            lastDoctorError = error.localizedDescription
        }
    }

    func updateAll() async {
        do {
            _ = try await bridgeClient.updateAll()
            await refreshList()
            await runDoctor()
        } catch {
            detailText = "Update failed: \(error.localizedDescription)"
        }
    }

    func updateCurrentGroup() async {
        guard let sourceId = selectedSourceId else {
            detailText = "Update failed: no source selected."
            showToast(style: .error, message: "Update failed: no group selected.")
            return
        }

        await updateSource(sourceId)
    }

    func isUpdatingSource(_ sourceId: String) -> Bool {
        updatingSourceIds.contains(sourceId)
    }

    func updateSource(_ sourceId: String) async {
        let sourceId = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sourceId.isEmpty else {
            detailText = "Update failed: missing source id."
            showToast(style: .error, message: "Update failed: no group selected.")
            return
        }

        updatingSourceIds.insert(sourceId)
        showToast(style: .loading, message: "Updating \(groupLabel(for: sourceId))...")
        defer { updatingSourceIds.remove(sourceId) }

        do {
            _ = try await bridgeClient.updateSources([sourceId])
            await refreshList()
            await runDoctor()
            if selectedGroupId == sourceId || selectedSourceId == sourceId {
                await selectSource(sourceId)
            }
            showToast(style: .success, message: "Updated \(sourceId).")
        } catch {
            detailText = "Update failed: \(error.localizedDescription)"
            showToast(style: .error, message: "Update failed: \(error.localizedDescription)")
        }
    }

    func addSource() async {
        let locator = newSourceLocator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !locator.isEmpty else {
            detailText = "Add failed: source locator is empty."
            showToast(style: .error, message: "Import failed: empty source locator.")
            return
        }
        do {
            _ = try await bridgeClient.add(locator: locator, applyNow: true)
            newSourceLocator = ""
            await refreshList()
            await runDoctor()
            showToast(style: .success, message: "Imported source.")
        } catch {
            detailText = "Add failed: \(error.localizedDescription)"
            showToast(style: .error, message: "Import failed: \(error.localizedDescription)")
        }
    }

    func prepareImport() async {
        let locator = newSourceLocator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !locator.isEmpty else {
            importPhase = .failed("Source locator is empty.")
            showToast(style: .error, message: "Import failed: empty source locator.")
            return
        }

        if let preview = importPreview {
            _ = try? await bridgeClient.uninstall(sourceIds: [preview.sourceId])
            importPreview = nil
        }

        importPhase = .preparing

        do {
            let response = try await bridgeClient.add(locator: locator, applyNow: false)
            guard let payload = response.data?.value as? [String: Any] else {
                importPhase = .failed("Invalid prepare response.")
                return
            }
            let preview = parseImportPreview(payload: payload, warnings: response.warnings.map(\.message), fallbackLocator: locator)
            importPreview = preview
            importPhase = .prepared
            showToast(style: .success, message: "Import preview ready.")
        } catch {
            importPhase = .failed(error.localizedDescription)
            showToast(style: .error, message: "Import failed: \(error.localizedDescription)")
        }
    }

    func confirmPreparedImport() async {
        guard let preview = importPreview else {
            importPhase = .failed("Missing import preview.")
            return
        }

        importPhase = .importing

        do {
            _ = try await bridgeClient.apply(
                sourceId: preview.sourceId,
                selectedLeafIds: preview.selectedLeafIds,
                enabledTargets: preview.enabledTargets
            )
            await refreshList()
            await runDoctor()
            await selectSource(preview.sourceId)
            currentPage = .detail(sourceId: preview.sourceId)
            newSourceLocator = ""
            importPreview = nil
            importPhase = .idle
            showToast(style: .success, message: "Imported source.")
        } catch {
            importPhase = .failed(error.localizedDescription)
            showToast(style: .error, message: "Import failed: \(error.localizedDescription)")
        }
    }

    func resetImportState() {
        importPhase = .idle
        importPreview = nil
    }

    func discardPreparedImport() async {
        if let preview = importPreview {
            _ = try? await bridgeClient.uninstall(sourceIds: [preview.sourceId])
        }
        resetImportState()
    }

    func importSkillSelectionState() -> SelectionState {
        guard let preview = importPreview else { return .empty }
        return selectionState(allIds: preview.skills.map(\.id), selectedIds: preview.selectedLeafIds)
    }

    func importTargetSelectionState() -> SelectionState {
        guard let preview = importPreview else { return .empty }
        return selectionState(allIds: preview.availableTargets, selectedIds: preview.enabledTargets)
    }

    func toggleImportSkill(_ skillId: String) {
        guard var preview = importPreview else { return }
        let currentlySelected = Set(preview.selectedLeafIds)
        let nextSelected: [String]
        if currentlySelected.contains(skillId) {
            nextSelected = preview.skills.map(\.id).filter { currentlySelected.subtracting([skillId]).contains($0) }
        } else {
            nextSelected = preview.skills.map(\.id).filter { currentlySelected.union([skillId]).contains($0) }
        }

        preview = ImportPreviewState(
            sourceId: preview.sourceId,
            title: preview.title,
            locator: preview.locator,
            kind: preview.kind,
            availableTargets: preview.availableTargets,
            selectedLeafIds: nextSelected,
            enabledTargets: preview.enabledTargets,
            skills: preview.skills.map {
                ImportPreviewSkill(
                    id: $0.id,
                    title: $0.title,
                    relativePath: $0.relativePath,
                    summary: $0.summary,
                    isSelected: nextSelected.contains($0.id)
                )
            },
            warnings: preview.warnings
        )
        importPreview = preview
    }

    func toggleAllImportSkills() {
        guard let preview = importPreview else { return }
        let nextSelected = importSkillSelectionState() == .full ? [] : preview.skills.map(\.id)
        importPreview = ImportPreviewState(
            sourceId: preview.sourceId,
            title: preview.title,
            locator: preview.locator,
            kind: preview.kind,
            availableTargets: preview.availableTargets,
            selectedLeafIds: nextSelected,
            enabledTargets: preview.enabledTargets,
            skills: preview.skills.map {
                ImportPreviewSkill(
                    id: $0.id,
                    title: $0.title,
                    relativePath: $0.relativePath,
                    summary: $0.summary,
                    isSelected: nextSelected.contains($0.id)
                )
            },
            warnings: preview.warnings
        )
    }

    func toggleImportTarget(_ targetId: String) {
        guard let preview = importPreview else { return }
        let enabled = Set(preview.enabledTargets)
        let nextTargets = normalizedTargets(
            enabled.contains(targetId)
                ? preview.enabledTargets.filter { $0 != targetId }
                : preview.enabledTargets + [targetId]
        )
        importPreview = ImportPreviewState(
            sourceId: preview.sourceId,
            title: preview.title,
            locator: preview.locator,
            kind: preview.kind,
            availableTargets: preview.availableTargets,
            selectedLeafIds: preview.selectedLeafIds,
            enabledTargets: nextTargets,
            skills: preview.skills,
            warnings: preview.warnings
        )
    }

    func toggleAllImportTargets() {
        guard let preview = importPreview else { return }
        let nextTargets = importTargetSelectionState() == .full ? [] : normalizedTargets(preview.availableTargets)
        importPreview = ImportPreviewState(
            sourceId: preview.sourceId,
            title: preview.title,
            locator: preview.locator,
            kind: preview.kind,
            availableTargets: preview.availableTargets,
            selectedLeafIds: preview.selectedLeafIds,
            enabledTargets: nextTargets,
            skills: preview.skills,
            warnings: preview.warnings
        )
    }

    private func parseImportPreview(
        payload: [String: Any],
        warnings: [String],
        fallbackLocator: String
    ) -> ImportPreviewState {
        let manifest = payload["manifest"] as? [String: Any] ?? [:]
        let draft = payload["draft"] as? [String: Any] ?? [:]
        let leafs = payload["leafs"] as? [[String: Any]] ?? []

        let sourceId = (payload["sourceId"] as? String)?.nonEmpty
            ?? (manifest["id"] as? String)?.nonEmpty
            ?? UUID().uuidString
        let selectedLeafIds = uniqueSorted(draft["selectedLeafIds"] as? [String] ?? [])
        let selectedLeafIdSet = Set(selectedLeafIds)
        let enabledTargets = normalizedTargets(draft["enabledTargets"] as? [String] ?? [])

        let skills = leafs.compactMap { leaf -> ImportPreviewSkill? in
            guard let leafId = leaf["id"] as? String else { return nil }
            let title = (leaf["name"] as? String)?.nonEmpty ?? (leaf["linkName"] as? String)?.nonEmpty ?? leafId
            return ImportPreviewSkill(
                id: leafId,
                title: title,
                relativePath: (leaf["relativePath"] as? String)?.nonEmpty ?? leafId,
                summary: (leaf["description"] as? String) ?? "",
                isSelected: selectedLeafIdSet.contains(leafId)
            )
        }

        return ImportPreviewState(
            sourceId: sourceId,
            title: (manifest["id"] as? String)?.nonEmpty ?? sourceId,
            locator: (manifest["locator"] as? String)?.nonEmpty ?? fallbackLocator,
            kind: (manifest["kind"] as? String)?.nonEmpty ?? "source",
            availableTargets: uniqueSorted(payload["availableTargets"] as? [String] ?? []),
            selectedLeafIds: selectedLeafIds,
            enabledTargets: enabledTargets,
            skills: skills,
            warnings: warnings
        )
    }

    func uninstallSelectedSource() async {
        guard let selectedSourceId else {
            detailText = "Uninstall failed: no source selected."
            showToast(style: .error, message: "Uninstall failed: no group selected.")
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
            baselineDrafts.removeValue(forKey: sourceId)
            workingDrafts.removeValue(forKey: sourceId)
            pinnedSourceIds.removeAll { $0 == sourceId }
            UserDefaults.standard.set(pinnedSourceIds, forKey: pinnedSourceIdsKey)

            await refreshList()
            await runDoctor()

            if let first = sourceIds.first {
                await selectSource(first)
            } else {
                detailText = "No sources installed."
                currentPage = .home
            }
            if case .detail(let detailSourceId) = currentPage, detailSourceId == sourceId {
                currentPage = .home
            }
            showToast(style: .success, message: "Removed \(sourceId).")
        } catch {
            detailText = "Uninstall failed: \(error.localizedDescription)"
            showToast(style: .error, message: "Uninstall failed: \(error.localizedDescription)")
        }
    }

    func isTargetEnabled(_ target: String) -> Bool {
        guard let groupId = selectedGroupId, let draft = workingDrafts[groupId] else {
            return false
        }
        return draft.enabledTargets.contains(target)
    }

    func setTargetEnabled(_ target: String, enabled: Bool, sourceId: String? = nil) async {
        guard let groupId = resolveSourceId(sourceId), var draft = workingDrafts[groupId] else {
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

        if let availableTargets = data["availableTargets"] as? [String] {
            detectedTargets.formUnion(availableTargets)
        }

        if let initialDrafts = data["initialDrafts"] as? [String: Any] {
            for (sourceId, rawDraft) in initialDrafts {
                guard let draftObject = rawDraft as? [String: Any] else { continue }
                let selectedLeafIds = uniqueSorted(draftObject["selectedLeafIds"] as? [String] ?? [])
                let enabledTargets = normalizedTargets(draftObject["enabledTargets"] as? [String] ?? [])
                let draft = DraftState(selectedLeafIds: selectedLeafIds, enabledTargets: enabledTargets)
                baselineDrafts[sourceId] = draft
                workingDrafts[sourceId] = draft
            }
        }
    }

    private func applyList(_ response: BridgeResponse) {
        allSummaries = parseSummaries(response)
        sourceIds = allSummaries.map(\.sourceId)
        pruneStateMaps(allowedSourceIds: Set(sourceIds))

        if selectedSourceId == nil || !sourceIds.contains(selectedSourceId ?? "") {
            selectedSourceId = sourceIds.first
        }

        for summary in allSummaries {
            if baselineDrafts[summary.sourceId] == nil {
                baselineDrafts[summary.sourceId] = buildInitialDraftFromSummary(summary)
            }
            if workingDrafts[summary.sourceId] == nil {
                workingDrafts[summary.sourceId] = baselineDrafts[summary.sourceId] ?? buildInitialDraftFromSummary(summary)
            }

            detectedTargets.formUnion(summary.enabledTargets)

        }

        if let selected = selectedSourceId, let summary = allSummaries.first(where: { $0.sourceId == selected }) {
            detailText = prettyPrint([
                "sourceId": summary.sourceId,
                "selectedLeafIds": summary.selectedLeafIds,
                "enabledTargets": summary.enabledTargets,
                "leafCount": summary.leafs.count,
                "health": summary.health,
            ]) ?? detailText
        }
    }

    private func parseSummaries(_ response: BridgeResponse) -> [WorkflowSummary] {
        guard
            let data = response.data?.value as? [String: Any],
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

    private func draft(for sourceId: String?) -> DraftState? {
        guard let sourceId = resolveSourceId(sourceId) else {
            return nil
        }
        return workingDrafts[sourceId]
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
        if showAllTargets {
            return Self.targetOrder
        }

        return Array(Self.targetOrder.filter { detectedTargets.contains($0) }.prefix(10))
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

        let payload = inspectedPayloadBySourceId[sourceId] ?? [:]
        let sourcePayload = payload["source"] as? [String: Any] ?? [:]
        let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
        let summarySourcePayload = summaryPayload["source"] as? [String: Any] ?? [:]
        let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
        let sourceStatsPayload = payload["sourceStats"] as? [String: Any] ?? [:]
        let deploymentsPayload = payload["deployments"] as? [[String: Any]] ?? []
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []

        let selectedLeafIds = Set(draft.selectedLeafIds)
        let enabledTargetLabels = draft.enabledTargets.map { Self.targetCatalog[$0] ?? $0 }
        let enabledTargets = Set(draft.enabledTargets)
        let inspectedLeafIds = uniqueSorted(leafPayloads.compactMap { $0["id"] as? String })
        let preferredLeafIds = inspectedLeafIds.isEmpty ? summary.leafs.map(\.id) : inspectedLeafIds
        let groupPath = preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads)
        let gitHubRepoContext = gitHubRepoContext(
            locator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator,
            lockPayload: lockPayload
        )
        let author = authorHandle(from: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator)
            ?? "@\(summary.sourceKind.lowercased())"
        let originLabel = displayOriginLabel(from: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator)
        let starCount = sourceStatsPayload["starCount"] as? Int
        let projectedNamesByLeafId = projectionNameMap(for: sourceId)

        let skills: [DetailSkill] = preferredLeafIds.compactMap { leafId -> DetailSkill? in
            guard let leaf = summary.leafs.first(where: { $0.id == leafId }) else {
                return nil
            }
            let leafPayload = leafPayloads.first(where: { ($0["id"] as? String) == leafId }) ?? [:]
            let skillFilePath = leafPayload["skillFilePath"] as? String
            let leafRelativePath = leafPayload["relativePath"] as? String
            let folderPath = (leafPayload["absolutePath"] as? String)?.nonEmpty
                ?? skillFilePath.flatMap { ($0 as NSString).deletingLastPathComponent.nonEmpty }
            let documentContent = skillFilePath
                .map { parsedDocument(path: $0).body }
                .flatMap(\.nonEmpty)
                ?? leaf.description
            let parsedMetadata = skillFilePath.map { parsedDocument(path: $0) }
            let metadata = parsedMetadata?.metadata ?? []
            let metadataName = parsedMetadata?.frontMatter?.name?.nonEmpty
            let version = parsedMetadata?.frontMatter?.version
            let documents = skillFilePath.flatMap { documentTabs(for: $0) }
                .map { tabs in
                    enrichDocumentTabs(tabs, groupPath: groupPath, gitHubRepoContext: gitHubRepoContext)
                }
                ?? [
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
            let linkName = leafPayload["linkName"] as? String ?? leaf.linkName
            let projectedName = projectedNamesByLeafId[leaf.id]
            let title = metadataName
                ?? folderPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty }
                ?? (leafPayload["title"] as? String)?.nonEmpty
                ?? leaf.name.nonEmpty
                ?? linkName
            let relativeFolderPath = groupPath.flatMap { basePath in
                folderPath.flatMap { relativePath(from: basePath, to: $0) }
            } ?? leafRelativePath

            return DetailSkill(
                id: leaf.id,
                title: title,
                summary: leaf.description.isEmpty ? linkName : leaf.description,
                version: version,
                author: author,
                originLabel: originLabel,
                starCount: starCount,
                folderPath: folderPath,
                relativeFolderPath: projectedRelativeFolderPath(
                    relativeFolderPath,
                    projectedName: projectedName,
                    fallbackName: linkName
                ),
                documents: documents,
                detailLines: [
                    leafRelativePath,
                    skillFilePath,
                    "Link name: \(linkName)"
                ].compactMap { $0?.nonEmpty },
                documentContent: documentContent,
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
            return "\(Self.targetCatalog[target] ?? target) · \(status) · \(leafId)"
        }

        let targets = visibleTargetIds().map { targetId in
            DetailTarget(
                id: targetId,
                label: Self.targetCatalog[targetId] ?? targetId,
                shortLabel: Self.targetShortLabel[targetId] ?? String((Self.targetCatalog[targetId] ?? targetId).prefix(2)),
                isEnabled: enabledTargets.contains(targetId)
            )
        }

        let fileTree = buildFileTreeLines(groupPath: groupPath, skills: skills)

        return DetailViewData(
            sourceId: summary.sourceId,
            title: (sourcePayload["displayName"] as? String)?.nonEmpty
                ?? (summarySourcePayload["displayName"] as? String)?.nonEmpty
                ?? summary.sourceDisplayName,
            subtitle: (sourcePayload["kind"] as? String)?.nonEmpty ?? summary.sourceKind,
            author: author,
            originLabel: originLabel,
            starCount: starCount,
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
            groupDocuments: groupDocumentTabs(
                groupPath: groupPath,
                fileTree: fileTree,
                gitHubRepoContext: gitHubRepoContext
            ),
            targets: targets,
            skills: skills
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
        successMessage: String,
        successStyle: ToastStyle
    ) async {
        let sourceId = sourceId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !sourceId.isEmpty else {
            detailText = "Apply failed: missing source id."
            showToast(style: .error, message: "Save failed: missing source id.")
            return
        }

        let normalizedDraft = normalizeDraft(nextDraft)

        let previousDraft = workingDrafts[sourceId] ?? baselineDrafts[sourceId] ?? normalizedDraft
        selectedSourceId = sourceId
        workingDrafts[sourceId] = normalizedDraft
        saveStateBySourceId[sourceId] = SaveState(phase: .saving, message: "Applying...")

        do {
            _ = try await bridgeClient.apply(
                sourceId: sourceId,
                selectedLeafIds: normalizedDraft.selectedLeafIds,
                enabledTargets: normalizedDraft.enabledTargets
            )
            baselineDrafts[sourceId] = normalizedDraft
            workingDrafts[sourceId] = normalizedDraft
            saveStateBySourceId[sourceId] = SaveState(phase: .saved, message: "saved")
            detailText = "Applied group '\(sourceId)' to \(normalizedDraft.enabledTargets.count) targets."
            showToast(style: successStyle, message: successMessage)
            await refreshList()
            if selectedGroupId == sourceId {
                await selectSource(sourceId)
            }
        } catch {
            let firstReason = firstErrorLine(from: error)
            workingDrafts[sourceId] = previousDraft
            saveStateBySourceId[sourceId] = SaveState(phase: .failed, message: firstReason)
            detailText = "Apply failed: \(firstReason)"
            showToast(style: .error, message: "Save failed: \(firstReason)")
        }
    }

    private func groupLabel(for sourceId: String) -> String {
        summary(for: sourceId)?.sourceDisplayName ?? sourceId
    }

    private func leafLabel(for leafId: String, sourceId: String) -> String {
        summary(for: sourceId)?.leafs.first(where: { $0.id == leafId })?.name ?? leafId
    }

    private func targetLabel(for targetId: String) -> String {
        Self.targetCatalog[targetId] ?? targetId
    }

    private func compactSkillToastMessage(sourceId: String, leafId: String, enabled: Bool) -> String {
        "\(enabled ? "On" : "Off") · \(groupLabel(for: sourceId)) · Skill \(leafLabel(for: leafId, sourceId: sourceId))"
    }

    private func compactSkillsToastMessage(sourceId: String, enabled: Bool) -> String {
        "\(enabled ? "On" : "Off") · \(groupLabel(for: sourceId)) · Skills"
    }

    private func compactAgentToastMessage(sourceId: String, targetId: String, enabled: Bool) -> String {
        "\(enabled ? "On" : "Off") · \(groupLabel(for: sourceId)) · Agent \(targetLabel(for: targetId))"
    }

    private func compactAgentsToastMessage(sourceId: String, enabled: Bool) -> String {
        "\(enabled ? "On" : "Off") · \(groupLabel(for: sourceId)) · Agents"
    }

    private func showToast(style: ToastStyle, message: String) {
        toast = ToastState(style: style, message: message)
    }

    private func firstErrorLine(from error: Error) -> String {
        error.localizedDescription
            .split(separator: "\n")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .first(where: { !$0.isEmpty }) ?? error.localizedDescription
    }

    private func cachedSkillDocument(path: String) -> String {
        if let cached = skillDocumentCache[path] {
            return cached
        }

        let document: String
        if let raw = try? String(contentsOfFile: path, encoding: .utf8) {
            document = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            document = "SKILL.md unavailable."
        }

        skillDocumentCache[path] = document
        return document
    }

    private func parsedDocument(path: String) -> ParsedDocument {
        if let cached = parsedDocumentCache[path] {
            return cached
        }

        let content = cachedSkillDocument(path: path)
        let parsed = parseDocument(content)
        parsedDocumentCache[path] = parsed
        return parsed
    }

    private func documentTabs(for skillFilePath: String) -> [DocumentTab] {
        if let cached = documentTabsCache[skillFilePath] {
            return cached
        }

        var tabs: [DocumentTab] = [
            makeDocumentTab(
                id: skillFilePath,
                title: "SKILL.md",
                path: skillFilePath
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
                        path: fullPath
                    )
                )
            }
        }

        documentTabsCache[skillFilePath] = tabs
        return tabs
    }

    private func makeDocumentTab(id: String, title: String, path: String) -> DocumentTab {
        let parsed = parsedDocument(path: path)
        let rawContent = cachedSkillDocument(path: path)
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

    private func parseDocument(_ content: String) -> ParsedDocument {
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

    private func parseFrontMatter(_ frontMatterText: String) -> SkillFrontMatter? {
        try? YAMLDecoder().decode(SkillFrontMatter.self, from: frontMatterText)
    }

    private func parseFrontmatterEntries(_ frontMatterText: String) -> [MetadataEntry] {
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

    private func stringifyMetadataValue(_ value: Any) -> String {
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

    private func groupDocumentTabs(
        groupPath: String?,
        fileTree: [FileTreeLine],
        gitHubRepoContext: GitHubRepoContext?
    ) -> [DocumentTab] {
        var tabs: [DocumentTab] = [
            DocumentTab(
                id: "group:filetree",
                title: "FILETREE",
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
                    path: fullPath
                )
            )
        }

        return enrichDocumentTabs(tabs, groupPath: groupPath, gitHubRepoContext: gitHubRepoContext)
    }

    private func compareRootDocumentNames(_ lhs: String, _ rhs: String) -> Bool {
        let leftRank = rootDocumentRank(lhs)
        let rightRank = rootDocumentRank(rhs)
        if leftRank != rightRank {
            return leftRank < rightRank
        }
        return lhs.localizedCaseInsensitiveCompare(rhs) == .orderedAscending
    }

    private func rootDocumentRank(_ name: String) -> Int {
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

    private func relativePath(from basePath: String, to targetPath: String) -> String? {
        let standardizedBase = URL(fileURLWithPath: basePath).standardizedFileURL.path
        let standardizedTarget = URL(fileURLWithPath: targetPath).standardizedFileURL.path
        guard standardizedTarget.hasPrefix(standardizedBase) else {
            return nil
        }
        let suffix = String(standardizedTarget.dropFirst(standardizedBase.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return suffix.isEmpty ? "." : suffix
    }

    private func projectedRelativeFolderPath(
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

    private func buildFileTreeLines(groupPath: String?, skills: [DetailSkill]) -> [FileTreeLine] {
        let rootName = groupPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty } ?? "."
        var root = FileTreeNode(name: rootName)

        for skill in skills {
            let relativeFolderPath = skill.relativeFolderPath ?? skill.folderPath
            guard let relativeFolderPath else {
                continue
            }

            let trimmedFolder = relativeFolderPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            let components = trimmedFolder.isEmpty || trimmedFolder == "."
                ? [String]()
                : trimmedFolder.split(separator: "/").map(String.init)
            insertFileTreePath(components, into: &root)
        }

        var lines: [FileTreeLine] = [
            FileTreeLine(id: rootName, depth: 0, prefix: "", title: root.name, isFile: false)
        ]

        appendFileTreeLines(from: root, parentId: rootName, depth: 1, ancestry: [], into: &lines)
        return lines
    }

    private func insertFileTreePath(_ components: [String], into node: inout FileTreeNode) {
        guard let head = components.first else {
            return
        }

        var child = node.children[head] ?? FileTreeNode(name: head)
        if components.count == 1 {
            child.isFile = true
            node.children[head] = child
            return
        }

        insertFileTreePath(Array(components.dropFirst()), into: &child)
        node.children[head] = child
    }

    private func appendFileTreeLines(
        from node: FileTreeNode,
        parentId: String,
        depth: Int,
        ancestry: [Bool],
        into lines: inout [FileTreeLine]
    ) {
        let children = node.children.values.sorted {
            if $0.isFile != $1.isFile {
                return !$0.isFile && $1.isFile
            }
            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }

        for (index, child) in children.enumerated() {
            let isLast = index == children.count - 1
            let branch = ancestry.map { $0 ? "    " : "|   " }.joined() + (isLast ? "`-- " : "|-- ")
            let childId = "\(parentId)/\(child.name)"
            lines.append(
                FileTreeLine(
                    id: childId,
                    depth: depth,
                    prefix: branch,
                    title: child.name,
                    isFile: child.isFile
                )
            )
            appendFileTreeLines(
                from: child,
                parentId: childId,
                depth: depth + 1,
                ancestry: ancestry + [isLast],
                into: &lines
            )
        }
    }

    private func renderFileTree(_ lines: [FileTreeLine]) -> String {
        lines.map { "\($0.prefix)\($0.title)" }.joined(separator: "\n")
    }

    private func enrichDocumentTabs(
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

    private func gitHubDocumentURL(
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

    private func displayOriginLabel(from locator: String) -> String {
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return "unknown source"
        }

        if let url = URL(string: trimmed), let host = url.host?.nonEmpty {
            return host
        }

        if trimmed.contains("github.com") {
            return "github.com"
        }

        return trimmed
    }

    private func relativeUpdateLabel(_ rawValue: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: rawValue) else {
            return "Updated time unavailable"
        }

        let seconds = max(0, Int(Date().timeIntervalSince(date)))
        if seconds < 60 {
            return "Updated just now"
        }

        let minute = 60
        let hour = 60 * minute
        let day = 24 * hour
        let week = 7 * day

        switch seconds {
        case ..<hour:
            let value = seconds / minute
            return "Updated \(value) minute\(value == 1 ? "" : "s") ago"
        case ..<day:
            let value = seconds / hour
            return "Updated \(value) hour\(value == 1 ? "" : "s") ago"
        case ..<week:
            let value = seconds / day
            return "Updated \(value) day\(value == 1 ? "" : "s") ago"
        default:
            let value = seconds / week
            return "Updated \(value) week\(value == 1 ? "" : "s") ago"
        }
    }

    private func pruneStateMaps(allowedSourceIds: Set<String>) {
        baselineDrafts = pruneSourceMap(baselineDrafts, allowedSourceIds: allowedSourceIds)
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
        workingDrafts.mapValues {
            ProjectionDraftState(
                enabledTargets: $0.enabledTargets,
                selectedLeafIds: $0.selectedLeafIds
            )
        }
    }

    func projectionWarningMap(for sourceId: String? = nil) -> [String: [String]] {
        guard let sourceId = resolveSourceId(sourceId) else {
            return [:]
        }
        return buildProjectionWarningMap(
            summaries: projectionSummaries(),
            drafts: projectionDrafts(),
            sourceId: sourceId
        )
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

    private func pruneSourceMap<T>(_ sourceMap: [String: T], allowedSourceIds: Set<String>) -> [String: T] {
        Dictionary(uniqueKeysWithValues: sourceMap.filter { allowedSourceIds.contains($0.key) })
    }

    private func prettyPrint(_ value: Any?) -> String? {
        guard let value else { return nil }
        guard JSONSerialization.isValidJSONObject(value) else {
            return String(describing: value)
        }
        guard
            let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted]),
            let text = String(data: data, encoding: .utf8)
        else {
            return String(describing: value)
        }
        return text
    }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}

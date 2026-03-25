import Foundation
import Observation

@MainActor
@Observable
final class MainViewModel {
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

    enum GroupSwitchDecision {
        case apply
        case discard
        case cancel
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

    struct TargetOption: Identifiable {
        let id: String
        let label: String
    }

    struct SourceRow: Identifiable {
        let id: String
        let kind: String
        let skillCount: Int
        let status: String
        let lastUpdate: String
        let warningCount: Int
        let errorCount: Int
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

    private var baselineDrafts: [String: DraftState] = [:]
    private var workingDrafts: [String: DraftState] = [:]
    private var pendingGroupId: String?
    private var detectedTargets: Set<String> = []

    private var allSummaries: [WorkflowSummary] = []

    var loadState: LoadState = .idle
    var selectedSection: Section = .overview

    var sourceIds: [String] = []
    var selectedSourceId: String?
    var newSourceLocator: String = ""
    var searchQuery: String = ""

    var detailText: String = "Select a source to inspect details."
    var healthLabel: String = "Unknown"
    var latestWarnings: [BridgeIssue] = []

    var inspectorVisible: Bool = true
    var compactSidebarVisible: Bool = true
    var showAllTargets: Bool = false

    var showGroupSwitchDialog: Bool = false
    var isApplyingDraft: Bool = false
    var isRefreshing: Bool = false
    var saveStateBySourceId: [String: SaveState] = [:]

    var lastApplyFailureCount: Int = 0
    var lastApplyFirstReason: String = ""
    var lastApplySummary: String = "No apply action yet"

    var doctorIssues: [DoctorIssueRow] = []
    var lastDoctorError: String?

    var deploymentFilterTarget: String = "All"
    var deploymentFilterKind: String = "All"

    init(bridgeClient: BridgeClient) {
        self.bridgeClient = bridgeClient
    }

    var availableGroups: [String] {
        sourceIds
    }

    var selectedGroupId: String? {
        selectedSourceId
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

    var hasPendingDraftForCurrentGroup: Bool {
        guard let groupId = selectedGroupId else { return false }
        guard let baseline = baselineDrafts[groupId], let working = workingDrafts[groupId] else {
            return false
        }
        return baseline != working
    }

    var canApplyCurrentGroupDraft: Bool {
        guard let groupId = selectedGroupId, let draft = workingDrafts[groupId] else {
            return false
        }
        return !isApplyingDraft && draft.selectedLeafIds.count > 0 && hasPendingDraftForCurrentGroup
    }

    var visibleTargets: [TargetOption] {
        let targetIds = visibleTargetIds()

        return targetIds.map { target in
            TargetOption(id: target, label: Self.targetCatalog[target] ?? target)
        }
    }

    var hasApplyError: Bool {
        lastApplyFailureCount > 0 && !lastApplyFirstReason.isEmpty
    }

    var sourceRows: [SourceRow] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let rows = allSummaries.map { summary in
            SourceRow(
                id: summary.sourceId,
                kind: summary.sourceKind,
                skillCount: summary.leafs.count,
                status: summary.health,
                lastUpdate: summary.updatedAt,
                warningCount: summary.warningCount,
                errorCount: summary.errorCount
            )
        }
        if query.isEmpty {
            return rows
        }
        return rows.filter { row in
            row.id.lowercased().contains(query)
                || row.kind.lowercased().contains(query)
                || row.status.lowercased().contains(query)
        }
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
            if !latestWarnings.isEmpty || hasApplyError {
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

    func toggleAllSkills(sourceId: String? = nil) {
        guard let sourceId = resolveSourceId(sourceId), let summary = summary(for: sourceId), var draft = workingDrafts[sourceId] else {
            return
        }

        let treeState = TreeSelectionState(
            allLeafIds: summary.leafs.map(\.id),
            selectedLeafIds: draft.selectedLeafIds
        )
        let nextState = toggleParent(treeState)
        draft.selectedLeafIds = nextState.selectedLeafIds
        workingDrafts[sourceId] = normalizeDraft(draft)
        markDraftEdited(sourceId: sourceId)
    }

    func setSkillEnabled(_ leafId: String, enabled: Bool, sourceId: String? = nil) {
        guard let sourceId = resolveSourceId(sourceId), let summary = summary(for: sourceId), var draft = workingDrafts[sourceId] else {
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
        workingDrafts[sourceId] = normalizeDraft(draft)
        markDraftEdited(sourceId: sourceId)
    }

    func toggleAllTargets(sourceId: String? = nil) {
        guard let sourceId = resolveSourceId(sourceId), var draft = workingDrafts[sourceId] else {
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
        workingDrafts[sourceId] = normalizeDraft(draft)
        markDraftEdited(sourceId: sourceId)
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
            detailText = prettyPrint(response.data?.value) ?? "No details"
            latestWarnings = response.warnings
        } catch {
            detailText = "Inspect failed: \(error.localizedDescription)"
        }
    }

    func requestGroupSwitch(to groupId: String) {
        guard selectedGroupId != groupId else { return }
        guard hasPendingDraftForCurrentGroup else {
            selectedSourceId = groupId
            Task { await selectSource(groupId) }
            return
        }
        pendingGroupId = groupId
        showGroupSwitchDialog = true
    }

    func resolveGroupSwitch(_ decision: GroupSwitchDecision) async {
        defer {
            showGroupSwitchDialog = false
            if case .cancel = decision {
                pendingGroupId = nil
            }
        }

        switch decision {
        case .cancel:
            return
        case .discard:
            if let current = selectedGroupId, let baseline = baselineDrafts[current] {
                workingDrafts[current] = baseline
            }
            if let pending = pendingGroupId {
                pendingGroupId = nil
                selectedSourceId = pending
                await selectSource(pending)
            }
        case .apply:
            let applied = await applyCurrentGroupDraft()
            guard applied else { return }
            if let pending = pendingGroupId {
                pendingGroupId = nil
                selectedSourceId = pending
                await selectSource(pending)
            }
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
        await updateAll()
    }

    func addSource() async {
        let locator = newSourceLocator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !locator.isEmpty else {
            detailText = "Add failed: source locator is empty."
            return
        }
        do {
            _ = try await bridgeClient.add(locator: locator, applyNow: true)
            newSourceLocator = ""
            await refreshList()
            await runDoctor()
        } catch {
            detailText = "Add failed: \(error.localizedDescription)"
        }
    }

    func uninstallSelectedSource() async {
        guard let selectedSourceId else {
            detailText = "Uninstall failed: no source selected."
            return
        }
        do {
            _ = try await bridgeClient.uninstall(sourceIds: [selectedSourceId])
            self.selectedSourceId = nil
            baselineDrafts.removeValue(forKey: selectedSourceId)
            workingDrafts.removeValue(forKey: selectedSourceId)

            await refreshList()
            await runDoctor()

            if let first = sourceIds.first {
                await selectSource(first)
            } else {
                detailText = "No sources installed."
            }
        } catch {
            detailText = "Uninstall failed: \(error.localizedDescription)"
        }
    }

    func isTargetEnabled(_ target: String) -> Bool {
        guard let groupId = selectedGroupId, let draft = workingDrafts[groupId] else {
            return false
        }
        return draft.enabledTargets.contains(target)
    }

    func setTargetEnabled(_ target: String, enabled: Bool) {
        guard let groupId = selectedGroupId, var draft = workingDrafts[groupId] else {
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

        workingDrafts[groupId] = normalizeDraft(draft)
        markDraftEdited(sourceId: groupId)
    }

    func applyCurrentGroupDraft() async -> Bool {
        guard let groupId = selectedGroupId, let draft = workingDrafts[groupId] else {
            detailText = "Apply failed: no group selected."
            return false
        }

        guard !draft.selectedLeafIds.isEmpty else {
            detailText = "Apply failed: current group has no selected skills."
            return false
        }

        isApplyingDraft = true
        defer { isApplyingDraft = false }

        let normalizedDraft = normalizeDraft(draft)
        saveStateBySourceId[groupId] = SaveState(phase: .saving, message: "saving changes...")

        do {
            _ = try await bridgeClient.apply(
                sourceId: groupId,
                selectedLeafIds: normalizedDraft.selectedLeafIds,
                enabledTargets: normalizedDraft.enabledTargets
            )
            baselineDrafts[groupId] = normalizedDraft
            workingDrafts[groupId] = normalizedDraft
            saveStateBySourceId[groupId] = SaveState(phase: .saved, message: "saved")
            lastApplyFailureCount = 0
            lastApplyFirstReason = ""
            lastApplySummary = "Applied \(normalizedDraft.selectedLeafIds.count) skills to \(normalizedDraft.enabledTargets.count) targets"
            detailText = "Applied group '\(groupId)' to \(normalizedDraft.enabledTargets.count) targets."
            await refreshList()
            await runDoctor()
            return true
        } catch {
            let reasons = error.localizedDescription
                .split(separator: "\n")
                .map { String($0) }
                .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

            lastApplyFailureCount = max(reasons.count, 1)
            lastApplyFirstReason = reasons.first ?? error.localizedDescription
            saveStateBySourceId[groupId] = SaveState(phase: .failed, message: lastApplyFirstReason)
            detailText = "Apply failed: \(lastApplyFirstReason)"
            return false
        }
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

            if let baseline = baselineDrafts[summary.sourceId], let working = workingDrafts[summary.sourceId], baseline == working, baseline.selectedLeafIds.isEmpty {
                let fallbackDraft = buildInitialDraftFromSummary(summary)
                baselineDrafts[summary.sourceId] = fallbackDraft
                workingDrafts[summary.sourceId] = fallbackDraft
            }
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
                let sourceId = source["id"] as? String
            else {
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
            selectedLeafIds = !enabledTargetLeafIds.isEmpty
                ? uniqueSorted(enabledTargetLeafIds)
                : uniqueSorted(summary.leafs.map(\.id))
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
        sourceId ?? selectedGroupId
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

    private func markDraftEdited(sourceId: String) {
        guard let currentState = saveStateBySourceId[sourceId], currentState.phase != .idle else {
            return
        }
        saveStateBySourceId[sourceId] = SaveState(phase: .idle, message: nil)
        if sourceId == selectedGroupId {
            lastApplyFailureCount = 0
            lastApplyFirstReason = ""
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

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

    private struct DraftState: Equatable {
        var selectedLeafIds: [String]
        var enabledTargets: [String]
    }

    private struct WorkflowSummary {
        let sourceId: String
        let sourceKind: String
        let leafIds: [String]
        let selectedLeafIds: [String]
        let enabledTargets: [String]
        let health: String
        let warningCount: Int
        let errorCount: Int
        let updatedAt: String
    }

    private let bridgeClient: BridgeClient

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
        let targetIds: [String]
        if showAllTargets {
            targetIds = Self.targetCatalog.keys.sorted()
        } else {
            targetIds = Array(detectedTargets.sorted().prefix(10))
        }

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
                skillCount: summary.leafIds.count,
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

            await runDoctor()
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

        if enabled {
            draft.enabledTargets = uniqueSorted(draft.enabledTargets + [target])
        } else {
            draft.enabledTargets.removeAll { $0 == target }
        }

        workingDrafts[groupId] = draft
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

        do {
            _ = try await bridgeClient.apply(
                sourceId: groupId,
                selectedLeafIds: draft.selectedLeafIds,
                enabledTargets: draft.enabledTargets
            )
            baselineDrafts[groupId] = draft
            lastApplyFailureCount = 0
            lastApplyFirstReason = ""
            lastApplySummary = "Applied \(draft.selectedLeafIds.count) skills to \(draft.enabledTargets.count) targets"
            detailText = "Applied group '\(groupId)' to \(draft.enabledTargets.count) targets."
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
            detailText = "Apply failed: \(lastApplyFirstReason)"
            return false
        }
    }

    private func parseBootstrapData(_ value: Any?) {
        guard let data = value as? [String: Any] else { return }

        if let availableTargets = data["availableTargets"] as? [String] {
            detectedTargets = Set(availableTargets)
        }

        if let initialDrafts = data["initialDrafts"] as? [String: Any] {
            for (sourceId, rawDraft) in initialDrafts {
                guard let draftObject = rawDraft as? [String: Any] else { continue }
                let selectedLeafIds = uniqueSorted(draftObject["selectedLeafIds"] as? [String] ?? [])
                let enabledTargets = uniqueSorted(draftObject["enabledTargets"] as? [String] ?? [])
                let draft = DraftState(selectedLeafIds: selectedLeafIds, enabledTargets: enabledTargets)
                baselineDrafts[sourceId] = draft
                workingDrafts[sourceId] = draft
            }
        }
    }

    private func applyList(_ response: BridgeResponse) {
        allSummaries = parseSummaries(response)
        sourceIds = allSummaries.map(\.sourceId)

        if selectedSourceId == nil || !sourceIds.contains(selectedSourceId ?? "") {
            selectedSourceId = sourceIds.first
        }

        for summary in allSummaries {
            let draftFromSummary = DraftState(
                selectedLeafIds: uniqueSorted(summary.selectedLeafIds),
                enabledTargets: uniqueSorted(summary.enabledTargets)
            )

            if baselineDrafts[summary.sourceId] == nil {
                baselineDrafts[summary.sourceId] = draftFromSummary
            }
            if workingDrafts[summary.sourceId] == nil {
                workingDrafts[summary.sourceId] = baselineDrafts[summary.sourceId] ?? draftFromSummary
            }

            if detectedTargets.isEmpty {
                for target in summary.enabledTargets {
                    detectedTargets.insert(target)
                }
            }

            if workingDrafts[summary.sourceId]?.selectedLeafIds.isEmpty == true {
                let fallbackLeafs = uniqueSorted(summary.leafIds)
                workingDrafts[summary.sourceId]?.selectedLeafIds = fallbackLeafs
                baselineDrafts[summary.sourceId]?.selectedLeafIds = fallbackLeafs
            }
        }

        if let selected = selectedSourceId, let summary = allSummaries.first(where: { $0.sourceId == selected }) {
            detailText = prettyPrint([
                "sourceId": summary.sourceId,
                "selectedLeafIds": summary.selectedLeafIds,
                "enabledTargets": summary.enabledTargets,
                "leafCount": summary.leafIds.count,
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

            let lock = summary["lock"] as? [String: Any]
            let updatedAt = lock?["updatedAt"] as? String ?? "-"

            let leafIds: [String] = (summary["leafs"] as? [[String: Any]] ?? []).compactMap { leaf in
                leaf["id"] as? String
            }

            let bindings = summary["bindings"] as? [String: Any] ?? [:]
            let selectedLeafIds = uniqueSorted(bindings["selectedLeafIds"] as? [String] ?? leafIds)
            let targets = bindings["targets"] as? [String: Any] ?? [:]

            var enabledTargets: [String] = []
            for (targetId, rawBinding) in targets {
                guard let binding = rawBinding as? [String: Any] else { continue }
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
                leafIds: uniqueSorted(leafIds),
                selectedLeafIds: selectedLeafIds,
                enabledTargets: uniqueSorted(enabledTargets),
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

    private func uniqueSorted(_ values: [String]) -> [String] {
        Array(Set(values)).sorted()
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

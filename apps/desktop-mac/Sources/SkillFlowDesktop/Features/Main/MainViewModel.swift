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

    struct TargetOption: Identifiable {
        let id: String
        let label: String
    }

    private struct DraftState: Equatable {
        var selectedLeafIds: [String]
        var enabledTargets: [String]
    }

    private struct WorkflowSummary {
        let sourceId: String
        let leafIds: [String]
        let selectedLeafIds: [String]
        let enabledTargets: [String]
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

    var loadState: LoadState = .idle
    var selectedSection: Section = .overview

    var sourceIds: [String] = []
    var selectedSourceId: String?
    var newSourceLocator: String = ""

    var detailText: String = "Select a source to inspect details."
    var healthLabel: String = "Unknown"
    var latestWarnings: [BridgeIssue] = []

    var inspectorVisible: Bool = true
    var compactSidebarVisible: Bool = true
    var showAllTargets: Bool = false

    var showGroupSwitchDialog: Bool = false
    var isApplyingDraft: Bool = false
    var lastApplyFailureCount: Int = 0
    var lastApplyFirstReason: String = ""

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
            targetIds = detectedTargets.sorted()
        }

        return targetIds.map { target in
            TargetOption(id: target, label: Self.targetCatalog[target] ?? target)
        }
    }

    var hasApplyError: Bool {
        lastApplyFailureCount > 0 && !lastApplyFirstReason.isEmpty
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
        } catch {
            loadState = .failed(error.localizedDescription)
            healthLabel = "Error"
            detailText = "Bootstrap failed: \(error.localizedDescription)"
        }
    }

    func refreshList() async {
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
        } catch {
            detailText = "Doctor failed: \(error.localizedDescription)"
            healthLabel = "Error"
        }
    }

    func updateAll() async {
        do {
            _ = try await bridgeClient.updateAll()
            await refreshList()
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
            detailText = "Applied group '\(groupId)' to \(draft.enabledTargets.count) targets."
            await refreshList()
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
        let summaries = parseSummaries(response)
        sourceIds = summaries.map(\.sourceId)

        if selectedSourceId == nil || !sourceIds.contains(selectedSourceId ?? "") {
            selectedSourceId = sourceIds.first
        }

        for summary in summaries {
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

        if let selected = selectedSourceId, let summary = summaries.first(where: { $0.sourceId == selected }) {
            detailText = prettyPrint([
                "sourceId": summary.sourceId,
                "selectedLeafIds": summary.selectedLeafIds,
                "enabledTargets": summary.enabledTargets,
                "leafCount": summary.leafIds.count,
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

            return WorkflowSummary(
                sourceId: sourceId,
                leafIds: uniqueSorted(leafIds),
                selectedLeafIds: selectedLeafIds,
                enabledTargets: uniqueSorted(enabledTargets)
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

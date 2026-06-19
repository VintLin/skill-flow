import Foundation
import Observation

@MainActor
@Observable
final class ImportLogic {
    private struct ScopedSourceKey: Hashable {
        let scope: ProjectScopeSelection
        let sourceId: String
    }

    @ObservationIgnored private var importSearchTasksByQuery: [String: Task<BridgeResponse, Error>] = [:]
    private var importSearchTokensByQuery: [String: UInt64] = [:]
    private var importSearchTokenSeed: UInt64 = 0
    @ObservationIgnored private var importPreviewTasksByGroupId: [String: Task<BridgeResponse, Error>] = [:]
    @ObservationIgnored private var importPreviewPrefetchTasksByGroupId: [String: Task<Void, Never>] = [:]
    private var importPreviewTokensByGroupId: [String: UInt64] = [:]
    private var importPreviewTokenSeed: UInt64 = 0
    private var importPreparationTokensByGroupId: [String: UInt64] = [:]
    private var importPreparationTokenSeed: UInt64 = 0

    var importSubmittedQuery: String = ""
    var importSearchPhase: ImportLoadPhase = .idle
    var importPageMode: ImportPageMode = .recommended
    var recommendedImportGroups: [ImportGroupItem] = []
    var localImportGroups: [ImportGroupItem] = []
    var localImportScanPhase: ImportLoadPhase = .idle
    var searchImportGroups: [ImportGroupItem] = []
    var importingImportGroupId: String?

    private let bridgeClient: BridgeClient
    private let queryFacade: any DesktopQuerying
    private let commandFacade: any DesktopCommanding
    private let recommendationsProvider: () -> [ImportRecommendationEntry]

    private var allSummaries: [SourceManagement.WorkflowSummary] = []

    private weak var delegate: ImportLogicDelegate?

    init(
        bridgeClient: BridgeClient,
        queryFacade: any DesktopQuerying,
        commandFacade: any DesktopCommanding,
        recommendationsProvider: @escaping () -> [ImportRecommendationEntry],
        delegate: ImportLogicDelegate? = nil
    ) {
        self.bridgeClient = bridgeClient
        self.queryFacade = queryFacade
        self.commandFacade = commandFacade
        self.recommendationsProvider = recommendationsProvider
        self.delegate = delegate
    }

    func setDelegate(_ delegate: ImportLogicDelegate?) {
        self.delegate = delegate
    }

    func updateAllSummaries(_ summaries: [SourceManagement.WorkflowSummary]) {
        allSummaries = summaries
        refreshImportGroupInstalledState()
    }

    var importDisplayGroups: [ImportGroupItem] {
        if !importSubmittedQuery.isEmpty {
            return searchImportGroups
        }

        switch importPageMode {
        case .recommended:
            return recommendedImportGroups
        case .localScan:
            return localImportGroups
        }
    }

    func isImportingImportGroup(_ groupId: String) -> Bool {
        importingImportGroupId == groupId
    }

    func loadImportPageIfNeeded() async {
        seedRecommendedImportGroupsIfNeeded()
        await loadLocalImportGroups(path: nil)
    }

    func loadRecommendedImportGroups() async {
        seedRecommendedImportGroupsIfNeeded()
    }

    func loadLocalImportGroups(path: String?) async {
        if path == nil {
            switch localImportScanPhase {
            case .loading, .ready:
                return
            case .idle, .failed:
                break
            }
        }

        localImportScanPhase = .loading
        do {
            let response = try await queryFacade.scanLocalImportGroups(path: path)
            let payload = response.data?.value as? [String: Any] ?? [:]
            let localScanGroups = parseLocalScanGroupsPayload(payload: payload)
            let groups = localScanGroups.isEmpty ? parseImportGroupsPayload(payload: payload) : localScanGroups

            if path == nil {
                localImportGroups = groups
            } else {
                var merged = localImportGroups
                for group in groups {
                    if let index = merged.firstIndex(where: { $0.id == group.id }) {
                        let incomingPaths = localImportPaths(for: group)
                        let existingPaths = localImportPaths(for: merged[index])
                        if !incomingPaths.isDisjoint(with: existingPaths) {
                            delegate?.showToast(style: .neutral, text: localizedText("toast.import.local_already_scanned"))
                            continue
                        }
                        merged[index] = group
                    } else {
                        merged.append(group)
                    }
                }
                localImportGroups = merged
            }

            localImportScanPhase = .ready
        } catch {
            localImportScanPhase = .failed(.plain(error.localizedDescription))
            delegate?.showToast(style: .error, text: localizedText("toast.import.failed", error.localizedDescription))
        }
    }

    private func localImportPaths(for group: ImportGroupItem) -> Set<String> {
        let paths = group.localImport?.detectedSkills.map(\.localPath) ?? []
        if paths.isEmpty {
            return [group.locator]
        }
        return Set(paths)
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
            delegate?.showToast(style: .error, text: localizedText("toast.import.failed", error.localizedDescription))
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

    func prefetchImportGroupDetailsIfNeeded(_ groupIds: [String]) {
        guard delegate?.currentRoute == .importPage else {
            return
        }

        for groupId in groupIds {
            guard delegate?.currentRoute == .importPage else {
                return
            }
            guard let item = importGroupItem(id: groupId),
                  item.provider != "local",
                  item.previewPhase == .idle
            else {
                continue
            }
            guard importPreviewPrefetchTasksByGroupId[groupId] == nil else {
                continue
            }

            let task = Task { @MainActor [weak self] in
                guard let self else {
                    return
                }
                defer {
                    self.importPreviewPrefetchTasksByGroupId.removeValue(forKey: groupId)
                }
                await self.previewImportGroupIfNeeded(groupId)
            }
            importPreviewPrefetchTasksByGroupId[groupId] = task
        }
    }

    func importImportGroup(
        groupId: String,
        locator: String,
        selectedSkills: [ImportSkillSelection],
        skillSelectionMode: ImportSkillSelectionMode = .selected,
        enabledTargets: [String]
    ) async {
        guard importingImportGroupId == nil else { return }
        importingImportGroupId = groupId
        defer { importingImportGroupId = nil }

        var finalSelectedSkills = selectedSkills
        var finalEnabledTargets = enabledTargets

        if finalSelectedSkills.isEmpty,
           let item = importGroupItem(id: groupId),
           item.skills.isEmpty {
            await previewImportGroupIfNeeded(groupId)
            if let refreshed = importGroupItem(id: groupId) {
                finalSelectedSkills = refreshed.skills.filter(\.selectedByDefault).map(\.selection)
                finalEnabledTargets = refreshed.targets.filter(\.selectedByDefault).map(\.id)
            }
        }

        do {
            var item = importGroupItem(id: groupId)
            if item?.locator == locator {
                if item?.preparationStatus == "preparing" {
                    delegate?.showToast(style: .neutral, text: localizedText("import.action.preparing"))
                    return
                }
                if item?.preparationStatus == "failed" || item?.preparationStatus == "stale" {
                    await prepareImportGroup(groupId: groupId, locator: locator)
                    item = importGroupItem(id: groupId)
                    if item?.preparationStatus != "ready" {
                        delegate?.showToast(style: .error, text: importFailureToastText(reasonCode: "IMPORT_PREPARE_FAILED"))
                        return
                    }
                }
            }
            let response: BridgeResponse
            if let preparationId = item?.preparationId,
               item?.preparationStatus == "ready",
               item?.locator == locator {
                response = try await commandFacade.commitImportSource(
                    preparationId: preparationId,
                    selectedSkills: finalSelectedSkills,
                    enabledTargets: finalEnabledTargets,
                    skillSelectionMode: skillSelectionMode
                )
            } else {
                response = try await commandFacade.importSource(
                    locator: locator,
                    selectedSkills: finalSelectedSkills,
                    enabledTargets: finalEnabledTargets,
                    skillSelectionMode: skillSelectionMode
                )
            }
            guard var payload = response.data?.value as? [String: Any],
                  var status = payload["status"] as? String
            else {
                delegate?.showToast(style: .error, text: localizedText("toast.import.invalid_response"))
                return
            }

            if status != "ready" {
                var reasonCode = payload["reasonCode"] as? String ?? "unknown"
                if reasonCode == "IMPORT_PREPARATION_STALE" || reasonCode == "IMPORT_PREPARATION_MISSING" {
                    await prepareImportGroup(groupId: groupId, locator: locator)
                    if let refreshed = importGroupItem(id: groupId),
                       let preparationId = refreshed.preparationId,
                       refreshed.preparationStatus == "ready",
                       refreshed.locator == locator {
                        let retryResponse = try await commandFacade.commitImportSource(
                            preparationId: preparationId,
                            selectedSkills: finalSelectedSkills,
                            enabledTargets: finalEnabledTargets,
                            skillSelectionMode: skillSelectionMode
                        )
                        guard let retryPayload = retryResponse.data?.value as? [String: Any],
                              let retryStatus = retryPayload["status"] as? String
                        else {
                            delegate?.showToast(style: .error, text: localizedText("toast.import.invalid_response"))
                            return
                        }
                        payload = retryPayload
                        status = retryStatus
                        reasonCode = retryPayload["reasonCode"] as? String ?? "unknown"
                    }
                }
                if status != "ready" {
                    let diagnostics = parseBridgeDiagnostics(payload["diagnostics"])
                    delegate?.showToast(
                        style: .error,
                        text: importFailureToastText(reasonCode: reasonCode, diagnostics: diagnostics)
                    )
                    return
                }
            }

            let sourceId = payload["sourceId"] as? String ?? ""
            delegate?.cancelDeferredDraftSync()
            mutateImportGroup(groupId) { item in
                ImportGroupItem(
                    id: item.id,
                    title: item.title,
                    locator: item.locator,
                    canonicalRepo: item.canonicalRepo,
                    preparationId: item.preparationId,
                    preparationStatus: item.preparationStatus,
                    preparedAt: item.preparedAt,
                    expiresAt: item.expiresAt,
                    isInstalledLocally: true,
                    aliases: item.aliases,
                    summary: item.summary,
                    starCount: item.starCount,
                    totalInstalls: item.totalInstalls,
                    skillCount: item.skillCount,
                    matchedSkillNames: item.matchedSkillNames,
                    matchedSkills: item.matchedSkills,
                    provider: item.provider,
                    localImport: item.localImport,
                    snapshot: item.snapshot,
                    enrichPhase: item.enrichPhase,
                    previewPhase: item.previewPhase,
                    skills: item.skills,
                    targets: item.targets
                )
            }
            importingImportGroupId = nil
            Task { [weak self] in
                guard let self, let delegate = self.delegate else { return }
                await delegate.synchronizeState(
                    refreshDoctor: true,
                    inspectSourceId: sourceId.nonEmpty
                )
            }
            delegate?.applyWarningsFromApplyResponse(response.warnings)
            if let warningToastText = importWarningToastText(warnings: response.warnings) {
                delegate?.showToast(style: .neutral, text: warningToastText)
            } else {
                delegate?.showToast(style: .success, text: localizedText("toast.import.success"))
            }
        } catch {
            delegate?.showToast(style: .error, text: localizedText("toast.import.failed", error.localizedDescription))
        }
    }

    private func prepareImportGroup(groupId: String, locator: String, token: UInt64? = nil) async {
        if token == nil {
            importPreparationTokenSeed &+= 1
            importPreparationTokensByGroupId[groupId] = importPreparationTokenSeed
            setImportPreparation(
                groupId: groupId,
                preparationId: importGroupItem(id: groupId)?.preparationId,
                preparationStatus: "preparing",
                preparedAt: importGroupItem(id: groupId)?.preparedAt,
                expiresAt: importGroupItem(id: groupId)?.expiresAt
            )
        }
        let activeToken = token ?? importPreparationTokensByGroupId[groupId]

        do {
            let response = try await queryFacade.prepareImportSource(locator: locator)
            guard importPreparationTokensByGroupId[groupId] == activeToken,
                  importGroupItem(id: groupId)?.locator == locator
            else {
                return
            }

            let payload = response.data?.value as? [String: Any] ?? [:]
            setImportPreparation(
                groupId: groupId,
                preparationId: (payload["preparationId"] as? String)?.nonEmpty,
                preparationStatus: (payload["status"] as? String)?.nonEmpty ?? "failed",
                preparedAt: (payload["preparedAt"] as? String)?.nonEmpty,
                expiresAt: (payload["expiresAt"] as? String)?.nonEmpty
            )
        } catch {
            guard importPreparationTokensByGroupId[groupId] == activeToken else {
                return
            }
            setImportPreparation(
                groupId: groupId,
                preparationId: importGroupItem(id: groupId)?.preparationId,
                preparationStatus: "failed",
                preparedAt: importGroupItem(id: groupId)?.preparedAt,
                expiresAt: importGroupItem(id: groupId)?.expiresAt
            )
        }

        if importPreparationTokensByGroupId[groupId] == activeToken {
            importPreparationTokensByGroupId.removeValue(forKey: groupId)
        }
    }

    private func seedRecommendedImportGroupsIfNeeded() {
        guard recommendedImportGroups.isEmpty else {
            if importSubmittedQuery.isEmpty, importSearchPhase == .idle {
                importSearchPhase = .ready
            }
            return
        }

        recommendedImportGroups = makeLocalRecommendedImportGroups(recommendationsProvider())
        if importSubmittedQuery.isEmpty {
            importSearchPhase = .ready
        }
    }

    private func makeLocalRecommendedImportGroups(_ recommendations: [ImportRecommendationEntry]) -> [ImportGroupItem] {
        let installedLocators = installedImportKeys()

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
                    preparationId: nil,
                    preparationStatus: nil,
                    preparedAt: nil,
                    expiresAt: nil,
                    isInstalledLocally: isInstalledLocally,
                    aliases: uniqueSorted([recommendation.canonicalRepo, recommendation.locator]),
                    summary: "",
                    starCount: nil,
                    totalInstalls: nil,
                    skillCount: nil,
                    matchedSkillNames: [],
                    matchedSkills: [],
                    provider: "skills",
                    localImport: nil,
                    snapshot: nil,
                    enrichPhase: .idle,
                    previewPhase: .idle,
                    skills: [],
                    targets: []
                )
            }
    }

    private static func normalizedImportRecommendationKey(_ value: String) -> String {
        if let normalizedRepo = ImportRepositoryIdentity.normalizedGitHubRepo(value) {
            return normalizedRepo
        }

        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return ""
        }

        let lowered = trimmed
            .lowercased()
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let patterns = [
            #"^https?://github\.com/([^/\s]+)/([^/\s]+?)(?:\.git)?$"#,
            #"^git@github\.com:([^/\s]+)/([^/\s]+?)(?:\.git)$"#,
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

            return ImportRepositoryIdentity.importRecommendationAlias("\(lowered[ownerRange])/\(lowered[repoRange])")
        }

        return ImportRepositoryIdentity.importRecommendationAlias(lowered.replacingOccurrences(of: ".git", with: ""))
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

    private func refreshImportGroupInstalledState() {
        if !recommendedImportGroups.isEmpty {
            recommendedImportGroups = makeLocalRecommendedImportGroups(recommendationsProvider())
        }
        localImportGroups = localImportGroups.map(withCurrentInstalledState)
        searchImportGroups = searchImportGroups.map(withCurrentInstalledState)
    }

    private func withCurrentInstalledState(_ item: ImportGroupItem) -> ImportGroupItem {
        let keys = [item.canonicalRepo, item.locator] + item.aliases
        let isInstalledLocally = keys
            .map(Self.normalizedImportRecommendationKey)
            .contains { installedImportKeys().contains($0) }
        return ImportGroupItem(
            id: item.id,
            title: item.title,
            locator: item.locator,
            canonicalRepo: item.canonicalRepo,
            preparationId: item.preparationId,
            preparationStatus: item.preparationStatus,
            preparedAt: item.preparedAt,
            expiresAt: item.expiresAt,
            isInstalledLocally: isInstalledLocally,
            aliases: item.aliases,
            summary: item.summary,
            starCount: item.starCount,
            totalInstalls: item.totalInstalls,
            skillCount: item.skillCount,
            matchedSkillNames: item.matchedSkillNames,
            matchedSkills: item.matchedSkills,
            provider: item.provider,
            localImport: item.localImport,
            snapshot: item.snapshot,
            enrichPhase: item.enrichPhase,
            previewPhase: item.previewPhase,
            skills: item.skills,
            targets: item.targets
        )
    }

    private func installedImportKeys() -> Set<String> {
        Set(
            allSummaries.flatMap { summary in
                [summary.sourceCanonicalRepo, summary.sourceLocator]
                    .compactMap { $0 }
                    .map(Self.normalizedImportRecommendationKey)
            }
        )
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
            let provider = group["provider"] as? String ?? "skills"
            let localImport = parseLocalImport(group["localImport"] as? [String: Any])
            let summary = (group["summary"] as? String)?.nonEmpty
                ?? snapshot?.description.nonEmpty
                ?? ""
            let skills = snapshot?.skills.map { skill in
                ImportGroupSkill(
                    id: skill.skillId,
                    title: skill.title,
                    summary: skill.summary,
                    selectedByDefault: true,
                    selectorAliases: [skill.skillId]
                )
            } ?? []

            return ImportGroupItem(
                id: id,
                title: title,
                locator: locator,
                canonicalRepo: canonicalRepo,
                preparationId: (group["preparationId"] as? String)?.nonEmpty,
                preparationStatus: (group["preparationStatus"] as? String)?.nonEmpty,
                preparedAt: (group["preparedAt"] as? String)?.nonEmpty,
                expiresAt: (group["expiresAt"] as? String)?.nonEmpty,
                isInstalledLocally: group["installed"] as? Bool ?? false,
                aliases: aliases,
                summary: summary,
                starCount: group["starCount"] as? Int ?? snapshot?.repoStars,
                totalInstalls: group["totalInstalls"] as? Int ?? snapshot?.totalInstalls,
                skillCount: group["skillCount"] as? Int ?? snapshot?.skillCount,
                matchedSkillNames: matchedSkillNames,
                matchedSkills: matchedSkills,
                provider: provider,
                localImport: localImport,
                snapshot: snapshot,
                enrichPhase: parseImportLoadPhase(group["enrichState"] as? [String: Any]),
                previewPhase: .idle,
                skills: skills,
                targets: []
            )
        }
    }

    private func parseLocalImport(_ payload: [String: Any]?) -> LocalImportInfo? {
        guard let payload,
              let validationStatus = (payload["validationStatus"] as? String)?.nonEmpty else {
            return nil
        }

        return LocalImportInfo(
            validationStatus: validationStatus,
            selectedChoiceId: (payload["selectedChoiceId"] as? String)?.nonEmpty,
            choices: parseLocalImportChoices(payload["choices"] as? [[String: Any]]),
            detectedSkills: parseLocalImportDetectedSkills(payload["detectedSkills"] as? [[String: Any]])
        )
    }

    private func parseLocalImportChoices(_ payload: [[String: Any]]?) -> [LocalImportChoice] {
        (payload ?? []).compactMap { choice in
            guard let id = (choice["id"] as? String)?.nonEmpty,
                  let label = (choice["label"] as? String)?.nonEmpty,
                  let locator = (choice["locator"] as? String)?.nonEmpty else {
                return nil
            }

            return LocalImportChoice(
                id: id,
                label: label,
                locator: locator,
                selectedSkills: parseImportSkillSelections(choice["selectedSkills"] as? [[String: Any]])
            )
        }
    }

    private func parseLocalImportDetectedSkills(_ payload: [[String: Any]]?) -> [LocalImportDetectedSkill] {
        (payload ?? []).compactMap { skill in
            guard let id = (skill["id"] as? String)?.nonEmpty,
                  let title = (skill["title"] as? String)?.nonEmpty,
                  let localPath = (skill["localPath"] as? String)?.nonEmpty,
                  let validationStatus = (skill["validationStatus"] as? String)?.nonEmpty else {
                return nil
            }

            return LocalImportDetectedSkill(
                id: id,
                title: title,
                localPath: localPath,
                discoveredTargets: skill["discoveredTargets"] as? [String] ?? [],
                validationStatus: validationStatus,
                originSkillId: (skill["originSkillId"] as? String)?.nonEmpty
            )
        }
    }

    private func parseLocalScanGroupsPayload(payload: [String: Any]) -> [ImportGroupItem] {
        let groups = payload["localScanGroups"] as? [[String: Any]] ?? []
        return groups.compactMap { group in
            guard let id = (group["id"] as? String)?.nonEmpty,
                  let title = (group["title"] as? String)?.nonEmpty,
                  let status = (group["status"] as? String)?.nonEmpty
            else {
                return nil
            }

            let origin = group["origin"] as? [String: Any]
            let canonicalRepo = (origin?["canonicalRepo"] as? String)?.nonEmpty ?? id
            let sourcePaths = group["sourcePaths"] as? [[String: Any]] ?? []
            let skillsPayload = group["skills"] as? [[String: Any]] ?? []
            let enabledChoicesPayload = (group["importChoices"] as? [[String: Any]] ?? [])
                .filter { $0["enabled"] as? Bool ?? false }
            let choices = parseLocalScanImportChoices(enabledChoicesPayload)
            let selectionRequired = skillsPayload.contains { $0["selectionRequired"] as? Bool ?? false }
            let selectedChoiceId = status == "version-conflict"
                ? nil
                : (choices.count == 1 && !selectionRequired ? choices[0].id : nil)
            let groupSkills = parseLocalScanGroupSkills(skillsPayload, groupStatus: status)
            let matchedSkills = groupSkills.map { skill in
                ImportMatchedSkill(skillId: skill.id, title: skill.title, installs: nil)
            }
            let allSourcePathsAlreadyManaged = !sourcePaths.isEmpty
                && sourcePaths.allSatisfy { $0["alreadyManaged"] as? Bool ?? false }
            let isInstalledLocally = status == "version-conflict"
                ? false
                : (status == "already-managed" || allSourcePathsAlreadyManaged)

            return ImportGroupItem(
                id: id,
                title: title,
                locator: choices.first?.locator
                    ?? sourcePaths.compactMap { ($0["path"] as? String)?.nonEmpty }.first
                    ?? id,
                canonicalRepo: canonicalRepo,
                preparationId: nil,
                preparationStatus: nil,
                preparedAt: nil,
                expiresAt: nil,
                isInstalledLocally: isInstalledLocally,
                aliases: uniqueSorted([canonicalRepo, id]),
                summary: "",
                starCount: nil,
                totalInstalls: nil,
                skillCount: groupSkills.isEmpty ? nil : groupSkills.count,
                matchedSkillNames: uniqueSorted(groupSkills.map(\.title)),
                matchedSkills: matchedSkills,
                provider: origin == nil ? "local" : "skills",
                localImport: LocalImportInfo(
                    validationStatus: status,
                    selectedChoiceId: selectedChoiceId,
                    choices: choices,
                    detectedSkills: parseLocalScanDetectedSkills(
                        groupStatus: status,
                        skills: skillsPayload,
                        sourcePaths: sourcePaths
                    )
                ),
                snapshot: nil,
                enrichPhase: .ready,
                previewPhase: .ready,
                skills: groupSkills,
                targets: []
            )
        }
    }

    private func parseLocalScanImportChoices(_ payload: [[String: Any]]) -> [LocalImportChoice] {
        payload.compactMap { choice in
            guard let id = (choice["id"] as? String)?.nonEmpty,
                  let label = (choice["label"] as? String)?.nonEmpty,
                  let locator = (choice["locator"] as? String)?.nonEmpty else {
                return nil
            }

            return LocalImportChoice(
                id: id,
                label: label,
                locator: locator,
                selectedSkills: parseImportSkillSelections(choice["selectedSkills"] as? [[String: Any]])
            )
        }
    }

    private func parseLocalScanDetectedSkills(
        groupStatus: String,
        skills: [[String: Any]],
        sourcePaths: [[String: Any]]
    ) -> [LocalImportDetectedSkill] {
        var detectedSkills: [LocalImportDetectedSkill] = []
        var seenPaths = Set<String>()

        for sourcePath in sourcePaths {
            guard let path = (sourcePath["path"] as? String)?.nonEmpty else {
                continue
            }
            let skill = localScanSkillPayload(forPath: path, skills: skills)
            detectedSkills.append(makeLocalScanDetectedSkill(
                path: path,
                sourcePath: sourcePath,
                skill: skill,
                groupStatus: groupStatus
            ))
            seenPaths.insert(path)
        }

        for skill in skills {
            for variant in skill["variants"] as? [[String: Any]] ?? [] {
                guard let path = (variant["path"] as? String)?.nonEmpty,
                      !seenPaths.contains(path) else {
                    continue
                }
                detectedSkills.append(makeLocalScanDetectedSkill(
                    path: path,
                    sourcePath: nil,
                    skill: skill,
                    groupStatus: groupStatus
                ))
                seenPaths.insert(path)
            }
        }

        return detectedSkills
    }

    private func localScanSkillPayload(forPath path: String, skills: [[String: Any]]) -> [String: Any]? {
        skills.first { skill in
            let variants = skill["variants"] as? [[String: Any]] ?? []
            return variants.contains { ($0["path"] as? String)?.nonEmpty == path }
        } ?? skills.first
    }

    private func makeLocalScanDetectedSkill(
        path: String,
        sourcePath: [String: Any]?,
        skill: [String: Any]?,
        groupStatus: String
    ) -> LocalImportDetectedSkill {
        let skillId = (skill?["id"] as? String)?.nonEmpty
            ?? URL(fileURLWithPath: path).lastPathComponent.nonEmpty
            ?? path
        let title = (skill?["title"] as? String)?.nonEmpty ?? skillId
        let status = (skill?["status"] as? String)?.nonEmpty ?? groupStatus
        let target = (sourcePath?["target"] as? String)?.nonEmpty

        return LocalImportDetectedSkill(
            id: "\(skillId):\(path)",
            title: title,
            localPath: path,
            discoveredTargets: target.map { [$0] } ?? [],
            validationStatus: status,
            originSkillId: (skill?["originSkillId"] as? String)?.nonEmpty
        )
    }

    private func parseLocalScanGroupSkills(
        _ payload: [[String: Any]],
        groupStatus: String
    ) -> [ImportGroupSkill] {
        payload.compactMap { skill in
            guard let id = (skill["id"] as? String)?.nonEmpty,
                  let title = (skill["title"] as? String)?.nonEmpty else {
                return nil
            }

            let status = (skill["status"] as? String)?.nonEmpty ?? groupStatus
            let selectionRequired = skill["selectionRequired"] as? Bool ?? false
            return ImportGroupSkill(
                id: id,
                title: title,
                summary: "",
                selectedByDefault: !selectionRequired && status != "already-managed"
            )
        }
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
        let selectedSkillUiIds = Set((payload["selectedSkills"] as? [[String: Any]] ?? [])
            .compactMap { ($0["uiId"] as? String)?.nonEmpty })
        let enabledTargets = Set(payload["enabledTargets"] as? [String] ?? [])
        let snapshot = parseSourceSnapshot(payload["snapshot"] as? [String: Any])

        let skills = skillsPayload.compactMap { skill -> ImportGroupSkill? in
            parseImportPreviewSkill(skill, selectedSkillUiIds: selectedSkillUiIds)
        }

        if skills.count != skillsPayload.count {
            setPreviewPhase(.failed(localizedText("import.error.invalid_preview_response")), for: groupId)
            return
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
                preparationId: (payload["preparationId"] as? String)?.nonEmpty ?? item.preparationId,
                preparationStatus: (payload["preparationStatus"] as? String)?.nonEmpty ?? item.preparationStatus,
                preparedAt: (payload["preparedAt"] as? String)?.nonEmpty ?? item.preparedAt,
                expiresAt: (payload["expiresAt"] as? String)?.nonEmpty ?? item.expiresAt,
                isInstalledLocally: item.isInstalledLocally,
                aliases: item.aliases,
                summary: item.summary.nonEmpty ?? snapshot?.description ?? "",
                starCount: item.starCount,
                totalInstalls: item.totalInstalls,
                skillCount: item.skillCount,
                matchedSkillNames: item.matchedSkillNames,
                matchedSkills: item.matchedSkills,
                provider: item.provider,
                localImport: item.localImport,
                snapshot: snapshot ?? item.snapshot,
                enrichPhase: snapshot != nil ? .ready : item.enrichPhase,
                previewPhase: .ready,
                skills: skills,
                targets: targets
            )
        }
    }

    private func parseImportPreviewSkill(
        _ payload: [String: Any],
        selectedSkillUiIds: Set<String>
    ) -> ImportGroupSkill? {
        guard let providerSkillId = (payload["providerSkillId"] as? String)?.nonEmpty,
              let title = (payload["title"] as? String)?.nonEmpty,
              let selection = parseImportPreviewSkillSelection(payload),
              let selectorAliases = payload["selectorAliases"] as? [String] else {
            return nil
        }

        return ImportGroupSkill(
            id: providerSkillId,
            title: title,
            summary: (payload["summary"] as? String) ?? "",
            selectedByDefault: selectedSkillUiIds.contains(selection.uiId),
            selection: selection,
            selectorAliases: uniqueSorted(selectorAliases)
        )
    }

    private func parseImportPreviewSkillSelection(_ payload: [String: Any]) -> ImportSkillSelection? {
        guard let uiId = (payload["uiId"] as? String)?.nonEmpty,
              let selector = payload["selector"] as? [String: Any],
              (selector["kind"] as? String) == "repoPath",
              let selectorPath = (selector["path"] as? String)?.nonEmpty else {
            return nil
        }

        return ImportSkillSelection(uiId: uiId, selector: .repoPath(selectorPath))
    }

    private func parseImportSkillSelections(_ payload: [[String: Any]]?) -> [ImportSkillSelection] {
        (payload ?? []).compactMap { item in
            guard let uiId = (item["uiId"] as? String)?.nonEmpty,
                  let selector = item["selector"] as? [String: Any],
                  (selector["kind"] as? String) == "repoPath",
                  let selectorPath = (selector["path"] as? String)?.nonEmpty else {
                return nil
            }
            return ImportSkillSelection(uiId: uiId, selector: .repoPath(selectorPath))
        }
    }

    private func setPreviewPhase(_ phase: ImportLoadPhase, for groupId: String) {
        mutateImportGroup(groupId) { item in
            ImportGroupItem(
                id: item.id,
                title: item.title,
                locator: item.locator,
                canonicalRepo: item.canonicalRepo,
                preparationId: item.preparationId,
                preparationStatus: item.preparationStatus,
                preparedAt: item.preparedAt,
                expiresAt: item.expiresAt,
                isInstalledLocally: item.isInstalledLocally,
                aliases: item.aliases,
                summary: item.summary,
                starCount: item.starCount,
                totalInstalls: item.totalInstalls,
                skillCount: item.skillCount,
                matchedSkillNames: item.matchedSkillNames,
                matchedSkills: item.matchedSkills,
                provider: item.provider,
                localImport: item.localImport,
                snapshot: item.snapshot,
                enrichPhase: item.enrichPhase,
                previewPhase: phase,
                skills: item.skills,
                targets: item.targets
            )
        }
    }

    private func setImportPreparation(
        groupId: String,
        preparationId: String?,
        preparationStatus: String?,
        preparedAt: String?,
        expiresAt: String?
    ) {
        mutateImportGroup(groupId) { item in
            ImportGroupItem(
                id: item.id,
                title: item.title,
                locator: item.locator,
                canonicalRepo: item.canonicalRepo,
                preparationId: preparationId,
                preparationStatus: preparationStatus,
                preparedAt: preparedAt,
                expiresAt: expiresAt,
                isInstalledLocally: item.isInstalledLocally,
                aliases: item.aliases,
                summary: item.summary,
                starCount: item.starCount,
                totalInstalls: item.totalInstalls,
                skillCount: item.skillCount,
                matchedSkillNames: item.matchedSkillNames,
                matchedSkills: item.matchedSkills,
                provider: item.provider,
                localImport: item.localImport,
                snapshot: item.snapshot,
                enrichPhase: item.enrichPhase,
                previewPhase: item.previewPhase,
                skills: item.skills,
                targets: item.targets
            )
        }
    }

    private func importGroupItem(id groupId: String) -> ImportGroupItem? {
        if let group = recommendedImportGroups.first(where: { $0.id == groupId }) {
            return group
        }
        if let group = localImportGroups.first(where: { $0.id == groupId }) {
            return group
        }
        return searchImportGroups.first(where: { $0.id == groupId })
    }

    private func mutateImportGroup(_ groupId: String, transform: (ImportGroupItem) -> ImportGroupItem) {
        if let index = recommendedImportGroups.firstIndex(where: { $0.id == groupId }) {
            recommendedImportGroups[index] = transform(recommendedImportGroups[index])
        }
        if let index = localImportGroups.firstIndex(where: { $0.id == groupId }) {
            localImportGroups[index] = transform(localImportGroups[index])
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
        case "NO_VALID_LEAFS":
            return localizedText("import.reason.no_valid_leafs")
        case "SOURCE_PATH_NOT_FOUND":
            return localizedText("import.reason.source_path_not_found")
        case "ADD_AGENT_NOT_AVAILABLE":
            return localizedText("import.reason.add_agent_not_available")
        default:
            return localizedText("import.reason.request_failed")
        }
    }

    private func importFailureToastText(reasonCode: String?, diagnostics: [BridgeDiagnostic] = []) -> PresentationText {
        DesktopIssuePresentationCatalog.toastText(
            forInternalCode: reasonCode,
            diagnostics: diagnostics,
            context: DesktopIssueContext.from(diagnostics: diagnostics),
            locale: Self.presentationLocale
        )
    }

    private func importWarningToastText(warnings: [BridgeIssue]) -> PresentationText? {
        guard let warning = warnings.first(where: {
            ["IMPORT_SELECTOR_NOT_FOUND", "IMPORT_SELECTOR_AMBIGUOUS", "IMPORT_SELECTORS_UNRESOLVED_USED_ALL"].contains($0.code)
        }) else {
            return nil
        }
        return DesktopIssuePresentationCatalog.toastText(forInternalCode: warning.code, locale: Self.presentationLocale)
    }

    private func parseBridgeDiagnostics(_ value: Any?) -> [BridgeDiagnostic] {
        guard let payloads = value as? [[String: Any]] else {
            return []
        }
        return payloads.compactMap(BridgeDiagnostic.init(payload:))
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
        let task = Task { [queryFacade] in
            try await queryFacade.previewImportSource(locator: locator)
        }
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

    static var presentationLocale: Locale {
        PresentationText.presentationLocale
    }

    private func localizedText(_ key: String, _ arguments: String...) -> PresentationText {
        delegate?.localizedText(key, arguments) ?? .plain(key)
    }

    private func uniqueSorted(_ values: [String]) -> [String] { Array(Set(values)).sorted() }
}

@MainActor
protocol ImportLogicDelegate: AnyObject {
    var currentRoute: DesktopRoute { get }
    func showToast(style: ToastStyle, text: PresentationText)
    func showToast(style: ToastStyle, message: String)
    func cancelDeferredDraftSync()
    func synchronizeState(refreshDoctor: Bool, inspectSourceId: String?) async
    func applyWarningsFromApplyResponse(_ warnings: [BridgeIssue])
    func localizedText(_ key: String, _ arguments: [String]) -> PresentationText
}

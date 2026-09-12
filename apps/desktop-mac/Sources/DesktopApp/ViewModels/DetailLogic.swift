import Foundation
import Observation

@MainActor
@Observable
final class DetailLogic {
    struct GitHubRepoContext: Sendable {
        let owner: String
        let repo: String
        let revision: String
    }

    struct DetailInput {
        let summary: SourceManagement.WorkflowSummary
        let draft: SourceManagement.DraftState
        let inspectedPayload: [String: Any]
        let groupStats: GroupCardStats
        let visibleTargetIds: [String]
        let customAgents: [CustomAgentDefinition]
        let projectPath: String?
        let saveState: SaveState
        let skillSelection: SelectionState
        let targetSelection: SelectionState
        let projectedNamesByLeafId: [String: String]
        let fallbackGroupPath: String?
        let gitHubRepoContext: GitHubRepoContext?
        let updatedRelative: String
    }

    struct PreparedDetailSkillContent: Sendable {
        let title: String
        let version: String?
        let folderPath: String?
        let relativeFolderPath: String?
        let documents: [DocumentTab]
        let documentContent: String
    }

    struct PreparedDetailContent: Sendable {
        let groupPath: String?
        let fileTree: [FileTreeItem]
        let groupDocuments: [DocumentDescriptor]
        let skillsByLeafId: [String: PreparedDetailSkillContent]
    }

    struct PreparedDetailLeafInput: Sendable {
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

    struct PreparedDetailWarmupInput: Sendable {
        let summary: SourceManagement.WorkflowSummary
        let sourceLocator: String
        let sourceSnapshot: SourceSnapshotData?
        let groupPath: String?
        let gitHubRepoContext: GitHubRepoContext?
        let projectedNamesByLeafId: [String: String]
        let leaves: [PreparedDetailLeafInput]
    }

    private let detailDocumentStore: DetailDocumentStore

    @ObservationIgnored
    private var preparedDetailContentBySourceId: [String: PreparedDetailContent] = [:]

    @ObservationIgnored
    private var detailWarmupTasksBySourceId: [String: Task<Void, Never>] = [:]

    @ObservationIgnored
    private var detailWarmupTokensBySourceId: [String: UInt64] = [:]

    @ObservationIgnored
    private var detailWarmupTokenSeed: UInt64 = 0

    private var preparedContentRevision: UInt64 = 0

    @ObservationIgnored
    var detailWarmupDelay: Duration = .milliseconds(40)

    init() {
        self.detailDocumentStore = DetailDocumentStore()
    }

    func detailViewData(for input: DetailInput, schedulesWarmup: Bool = true) -> DetailViewData {
        _ = preparedContentRevision
        let summary = input.summary
        let draft = input.draft
        let sourceId = summary.sourceId

        let payload = input.inspectedPayload
        let sourcePayload = payload["source"] as? [String: Any] ?? [:]
        let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
        let summarySourcePayload = summaryPayload["source"] as? [String: Any] ?? [:]
        let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
        let sourceSnapshot = BridgePayloadDecoder.sourceSnapshot(from: payload["sourceSnapshot"] as? [String: Any])
        let deploymentsPayload = payload["deployments"] as? [[String: Any]] ?? []
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []
        let preparedDetailContent = preparedDetailContentBySourceId[sourceId]

        let selectedLeafIds = Set(draft.selectedLeafIds)
        let enabledTargetLabels = draft.enabledTargets.map { AgentDisplayCatalog.label(for: $0, customAgents: input.customAgents) }
        let enabledTargets = Set(draft.enabledTargets)
        let inspectedLeafIds = uniqueSorted(leafPayloads.compactMap { $0["id"] as? String })
        let preferredLeafIds = inspectedLeafIds.isEmpty ? summary.leafs.map(\.id) : inspectedLeafIds
        let groupPath = preparedDetailContent?.groupPath ?? input.fallbackGroupPath
        let author = sourceSnapshot.map { "@\($0.owner.slug)" }
            ?? Self.authorName(
                locator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator,
                kind: summary.sourceKind
            )
        let originLabel = sourceSnapshot.flatMap { Self.displayOriginLabel(from: $0.sourceURL) }
            ?? Self.displayOriginLabel(from: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator)
        let groupStats = input.groupStats
        let starCount = groupStats.starCount
        let projectedNamesByLeafId = input.projectedNamesByLeafId

        if schedulesWarmup, preparedDetailContent == nil, !payload.isEmpty {
            scheduleDetailContentWarmupIfNeeded(input: input)
        }

        let skills: [DetailSkill] = Self.sortedDetailSkills(preferredLeafIds.compactMap { leafId -> DetailSkill? in
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
                relativeFolderPath: DetailContentCatalog.projectedRelativeFolderPath(
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
        })

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
            deploymentFact(
                from: deployment,
                projectPath: input.projectPath,
                customAgents: input.customAgents
            )
        }

        let targets = input.visibleTargetIds.map { targetId in
            DetailTarget(
                id: targetId,
                label: AgentDisplayCatalog.label(for: targetId, customAgents: input.customAgents),
                shortLabel: AgentDisplayCatalog.shortLabel(for: targetId, customAgents: input.customAgents),
                isEnabled: enabledTargets.contains(targetId)
            )
        }

        let fileTree = preparedDetailContent?.fileTree ?? []
        let groupDocumentDescriptors = preparedDetailContent?.groupDocuments ?? []
        let originalDisplayName = summary.sourceOriginalDisplayName.nonEmpty
            ?? (sourcePayload["originalDisplayName"] as? String)?.nonEmpty
            ?? (summarySourcePayload["originalDisplayName"] as? String)?.nonEmpty
            ?? summary.sourceDisplayName
        let title = Self.preferredDetailGroupTitle(
            sourceId: summary.sourceId,
            displayName: summary.sourceDisplayName.nonEmpty
                ?? (sourcePayload["displayName"] as? String)?.nonEmpty
                ?? (summarySourcePayload["displayName"] as? String)?.nonEmpty
                ?? sourceSnapshot?.title,
            snapshotTitle: sourceSnapshot?.title,
            locator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator
        )
        let subtitle = (sourcePayload["kind"] as? String)?.nonEmpty ?? summary.sourceKind
        let locator = (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator
        let updatedAt = (lockPayload["updatedAt"] as? String)?.nonEmpty ?? summary.updatedAt
        let updatedRelative = input.updatedRelative
        let revision = DetailRevision.make(
            sourceId: summary.sourceId,
            title: title,
            originalDisplayName: originalDisplayName,
            subtitle: subtitle,
            author: author,
            originLabel: originLabel,
            starCount: starCount,
            groupStats: groupStats,
            sourceDetailLines: [],
            sourceRepositoryURL: groupStats.githubURL,
            locator: locator,
            groupPath: groupPath,
            updatedAt: updatedAt,
            updatedRelative: updatedRelative,
            health: summary.health,
            warningCount: summary.warningCount,
            errorCount: summary.errorCount,
            enabledSkillCount: draft.selectedLeafIds.count,
            totalSkillCount: skills.count,
            enabledTargetCount: draft.enabledTargets.count,
            saveState: input.saveState,
            skillSelection: input.skillSelection,
            targetSelection: input.targetSelection,
            enabledTargetLabels: enabledTargetLabels,
            sourceFacts: sourceFacts,
            deploymentFacts: deploymentFacts,
            fileTree: fileTree,
            groupDocuments: groupDocumentDescriptors,
            targets: targets,
            skills: skills
        )

        return DetailViewData(
            sourceId: summary.sourceId,
            revision: revision,
            title: title,
            originalDisplayName: originalDisplayName,
            subtitle: subtitle,
            author: author,
            originLabel: originLabel,
            starCount: starCount,
            groupStats: groupStats,
            sourceDetailLines: [],
            sourceRepositoryURL: groupStats.githubURL,
            locator: locator,
            groupPath: groupPath,
            updatedAt: updatedAt,
            updatedRelative: updatedRelative,
            health: summary.health,
            warningCount: summary.warningCount,
            errorCount: summary.errorCount,
            enabledSkillCount: draft.selectedLeafIds.count,
            totalSkillCount: skills.count,
            enabledTargetCount: draft.enabledTargets.count,
            saveState: input.saveState,
            skillSelection: input.skillSelection,
            targetSelection: input.targetSelection,
            enabledTargetLabels: enabledTargetLabels,
            sourceFacts: sourceFacts,
            deploymentFacts: deploymentFacts,
            fileTree: fileTree,
            groupDocuments: groupDocumentDescriptors.map(\.placeholderTab),
            targets: targets,
            skills: skills
        )
    }

    func groupDocument(for sourceId: String, documentId: String, input: DetailInput) async -> DocumentTab? {
        let prepared = preparedDetailContentBySourceId[sourceId]
        if prepared == nil {
            _ = detailViewData(for: input)
        }

        guard let preparedContent = preparedDetailContentBySourceId[sourceId]
        else {
            return nil
        }

        if let descriptor = preparedContent.groupDocuments.first(where: { $0.id == documentId }) {
            if descriptor.id == "group:filetree" {
                return DocumentTab(
                    id: descriptor.id,
                    title: descriptor.title,
                    path: descriptor.path,
                    metadata: descriptor.metadata,
                    content: FileTreeRenderer.render(preparedContent.fileTree),
                    renderCacheKey: descriptor.renderCacheKey,
                    externalURL: descriptor.externalURL
                )
            }

            return await loadedDocumentTab(from: descriptor)
        }

        guard let placeholder = preparedContent.skillsByLeafId.values
            .flatMap(\.documents)
            .first(where: { $0.id == documentId })
        else {
            return nil
        }

        if !placeholder.content.isEmpty || !placeholder.isLazyLoadableDocument {
            return placeholder
        }

        return await loadedDocumentTab(from: placeholder.descriptor)
    }

    private func loadedDocumentTab(from descriptor: DocumentDescriptor) async -> DocumentTab? {
        do {
            let loaded = try await detailDocumentStore.document(for: descriptor)
            return DocumentTab(
                id: loaded.id,
                title: descriptor.title,
                path: descriptor.path,
                metadata: loaded.metadata,
                content: loaded.content,
                renderCacheKey: loaded.renderCacheKey,
                externalURL: descriptor.externalURL
            )
        } catch {
            return DocumentTab(
                id: descriptor.id,
                title: descriptor.title,
                path: descriptor.path,
                metadata: [],
                content: Self.documentLoadFailureContent,
                renderCacheKey: descriptor.renderCacheKey,
                externalURL: descriptor.externalURL
            )
        }
    }

    func scheduleDetailContentWarmupIfNeeded(input: DetailInput) {
        let sourceId = input.summary.sourceId
        guard detailWarmupTasksBySourceId[sourceId] == nil else {
            return
        }
        guard !input.inspectedPayload.isEmpty else {
            return
        }
        let warmupInput = buildPreparedDetailWarmupInput(input: input)
        let token: UInt64
        if let currentToken = detailWarmupTokensBySourceId[sourceId] {
            token = currentToken
        } else {
            detailWarmupTokenSeed &+= 1
            token = detailWarmupTokenSeed
            detailWarmupTokensBySourceId[sourceId] = token
        }

        var task: Task<Void, Never>?
        task = Task { [weak self, sourceId, warmupInput] in
            guard let self else { return }
            let delay = await MainActor.run { self.detailWarmupDelay }
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }

            let prepared = await Task.detached {
                Self.prepareDetailContent(input: warmupInput)
            }.value

            await MainActor.run {
                guard self.detailWarmupTasksBySourceId[sourceId] == task else { return }
                defer {
                    self.detailWarmupTasksBySourceId.removeValue(forKey: sourceId)
                }
                guard !Task.isCancelled,
                      self.detailWarmupTokensBySourceId[sourceId] == token
                else {
                    return
                }
                self.preparedDetailContentBySourceId[sourceId] = prepared
                self.preparedContentRevision &+= 1
            }
        }
        detailWarmupTasksBySourceId[sourceId] = task
    }

    func invalidatePreparedDetailContent(for sourceId: String) {
        preparedDetailContentBySourceId.removeValue(forKey: sourceId)
        detailWarmupTasksBySourceId[sourceId]?.cancel()
        detailWarmupTasksBySourceId.removeValue(forKey: sourceId)
        detailWarmupTokenSeed &+= 1
        detailWarmupTokensBySourceId[sourceId] = detailWarmupTokenSeed
        preparedContentRevision &+= 1
    }

    func hasPreparedOrScheduledDetailContent(for sourceId: String) -> Bool {
        preparedDetailContentBySourceId[sourceId] != nil
            || detailWarmupTasksBySourceId[sourceId] != nil
    }

    private func buildPreparedDetailWarmupInput(input: DetailInput) -> PreparedDetailWarmupInput {
        let summary = input.summary
        let payload = input.inspectedPayload
        let sourcePayload = payload["source"] as? [String: Any] ?? [:]
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []
        let sourceSnapshot = BridgePayloadDecoder.sourceSnapshot(from: payload["sourceSnapshot"] as? [String: Any])
        let preferredLeafIds = uniqueSorted(leafPayloads.compactMap { $0["id"] as? String }).isEmpty
            ? summary.leafs.map(\.id)
            : uniqueSorted(leafPayloads.compactMap { $0["id"] as? String })
        let groupPath = input.fallbackGroupPath
        let gitHubRepoContext = input.gitHubRepoContext
        let projectedNamesByLeafId = input.projectedNamesByLeafId
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
        let catalogContext = DetailContentCatalog.Context(
            sourceId: input.summary.sourceId,
            groupPath: input.groupPath,
            fileTreeTitle: localizedWarmup("detail.document.file_tree"),
            skills: input.leaves.map { leaf in
                .init(
                    id: leaf.id,
                    linkName: leaf.linkName,
                    name: leaf.name,
                    title: leaf.title,
                    description: leaf.description,
                    skillFilePath: leaf.skillFilePath,
                    absolutePath: leaf.absolutePath,
                    relativePath: leaf.relativePath,
                    projectedName: input.projectedNamesByLeafId[leaf.id]
                )
            },
            gitHubRepo: input.gitHubRepoContext.map {
                .init(owner: $0.owner, repo: $0.repo, revision: $0.revision)
            }
        )
        let catalogSnapshot = DetailContentCatalog().snapshot(for: catalogContext)
        var skillsByLeafId: [String: PreparedDetailSkillContent] = [:]
        var lightweightSkills: [DetailSkill] = []

        for leaf in input.leaves {
            guard let catalogSkill = catalogSnapshot.skillsByLeafId[leaf.id] else { continue }
            let folderPath = catalogSkill.folderPath
            let documents = catalogSkill.documents
            let title = catalogSkill.title
            let relativeFolderPath = catalogSkill.relativeFolderPath
            let documentContent = leaf.skillFilePath.flatMap(loadDetailDocumentBody) ?? leaf.description

            skillsByLeafId[leaf.id] = PreparedDetailSkillContent(
                title: title,
                version: nil,
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
                    version: nil,
                    author: input.sourceSnapshot.map { "@\($0.owner.slug)" }
                        ?? authorHandle(from: input.sourceLocator)
                        ?? "@\(input.summary.sourceKind.lowercased())",
                    originLabel: input.sourceSnapshot.map { displayOriginLabel(from: $0.sourceURL) }
                        ?? displayOriginLabel(from: input.sourceLocator),
                    starCount: input.sourceSnapshot?.repoStars,
                    folderPath: folderPath,
                    relativeFolderPath: DetailContentCatalog.projectedRelativeFolderPath(
                        relativeFolderPath,
                        projectedName: input.projectedNamesByLeafId[leaf.id],
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

        let fileTree = catalogSnapshot.fileTree
        let groupDocuments = catalogSnapshot.groupDocuments

        return PreparedDetailContent(
            groupPath: input.groupPath,
            fileTree: fileTree,
            groupDocuments: groupDocuments,
            skillsByLeafId: skillsByLeafId
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
            lines.append("Installs: \(Self.formattedCount(installs))")
        }
        if let weeklyInstalls = snapshotSkill?.weeklyInstalls {
            lines.append("Weekly installs: \(Self.formattedCount(weeklyInstalls))")
        }
        if let firstSeen = snapshotSkill?.firstSeen {
            lines.append("First seen: \(firstSeen)")
        }
        if let snapshotSkill, !snapshotSkill.installedOn.isEmpty {
            let installs = snapshotSkill.installedOn.map { item in
                if let installs = item.installs {
                    return "\(item.agent) \(Self.formattedCount(installs))"
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

    private func deploymentFact(
        from deployment: [String: Any],
        projectPath: String?,
        customAgents: [CustomAgentDefinition]
    ) -> String? {
        guard let target = deployment["target"] as? String,
              let status = deployment["status"] as? String
        else {
            return nil
        }

        if let projectPath,
           let targetPath = (deployment["targetPath"] as? String)?.nonEmpty,
           let relativeTargetPath = DetailContentCatalog.relativePath(from: projectPath, to: targetPath)
        {
            return "\(AgentDisplayCatalog.label(for: target, customAgents: customAgents)) · \(status) · \(relativeTargetPath)"
        }

        let leafId = (deployment["leafId"] as? String)?.nonEmpty ?? "unknown"
        return "\(AgentDisplayCatalog.label(for: target, customAgents: customAgents)) · \(status) · \(leafId)"
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

        if let snapshotTitle = snapshotTitle?.nonEmpty {
            return snapshotTitle
        }

        return detailTitleFallback(from: locator, sourceId: sourceId)
    }

    nonisolated static func preferredDetailSkillTitle(
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

    nonisolated private static func sanitizedDetailTitle(_ value: String?) -> String? {
        guard let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
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
        return rejectedFragments.contains(where: lowercase.contains) ? nil : trimmed
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

    private static func formattedCount(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    private static func authorName(locator: String, kind: String) -> String {
        let normalizedKind = kind.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if normalizedKind == "local" { return localizedWarmup("source.author.local") }
        if normalizedKind == "collection" { return localizedWarmup("source.author.collection") }
        if let handle = authorHandle(from: locator) { return handle }
        return normalizedKind
    }

    nonisolated private static func sortedDetailSkills(_ skills: [DetailSkill]) -> [DetailSkill] {
        skills.sorted { lhs, rhs in
            skillSortComesBefore(
                lhsId: lhs.id,
                lhsTitle: lhs.title,
                lhsIsEnabled: lhs.isEnabled,
                rhsId: rhs.id,
                rhsTitle: rhs.title,
                rhsIsEnabled: rhs.isEnabled
            )
        }
    }

    nonisolated private static func skillSortComesBefore(
        lhsId: String,
        lhsTitle: String,
        lhsIsEnabled: Bool,
        rhsId: String,
        rhsTitle: String,
        rhsIsEnabled: Bool
    ) -> Bool {
        if lhsIsEnabled != rhsIsEnabled {
            return lhsIsEnabled
        }

        let titleComparison = lhsTitle.compare(
            rhsTitle,
            options: [.caseInsensitive, .diacriticInsensitive, .numeric],
            range: nil,
            locale: Locale.current
        )
        if titleComparison != .orderedSame {
            return titleComparison == .orderedAscending
        }

        return lhsId.localizedStandardCompare(rhsId) == .orderedAscending
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

    nonisolated private static func loadDetailDocumentBody(path: String) -> String? {
        guard let raw = try? String(contentsOfFile: path, encoding: .utf8) else {
            return nil
        }
        let parsed = DetailDocumentParser.parse(raw)
        return parsed.body.isEmpty ? nil : parsed.body
    }

    nonisolated private static var documentLoadFailureContent: String {
        localizedWarmup("detail.document.load_failed")
    }

    nonisolated private static func localizedWarmup(_ key: String) -> String {
        let rawValue = UserDefaults.standard.string(forKey: DesktopLanguage.storageKey)
        if rawValue == nil, ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil {
            return PresentationText.localized(key).resolve(locale: DesktopLanguage.en.locale)
        }
        return PresentationText.localized(key)
            .resolve(locale: DesktopLanguage(storageValue: rawValue ?? DesktopLanguage.system.rawValue).locale)
    }

    private func uniqueSorted(_ items: [String]) -> [String] {
        Array(Set(items)).sorted()
    }
}

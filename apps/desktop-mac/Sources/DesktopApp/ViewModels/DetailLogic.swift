import Foundation
import Observation
import CryptoKit
import Yams

@MainActor
@Observable
final class DetailLogic {
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
        let gitHubRepoContext: MainViewModel.GitHubRepoContext?
        let projectedNamesByLeafId: [String: String]
        let leaves: [PreparedDetailLeafInput]
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
    }

    private let mainProvider: () -> MainViewModel
    private let detailDocumentStore: DetailDocumentStore

    private var main: MainViewModel { mainProvider() }

    @ObservationIgnored
    private var preparedDetailContentBySourceId: [String: PreparedDetailContent] = [:]

    @ObservationIgnored
    private var detailWarmupTasksBySourceId: [String: Task<Void, Never>] = [:]

    @ObservationIgnored
    private var detailWarmupTokensBySourceId: [String: UInt64] = [:]

    @ObservationIgnored
    private var detailWarmupTokenSeed: UInt64 = 0

    @ObservationIgnored
    var detailWarmupDelay: Duration = .milliseconds(40)

    @ObservationIgnored
    private var detailEnrichmentPayloadBySourceId: [String: [String: Any]] = [:]

    @ObservationIgnored
    private var detailEnrichmentTasksBySourceId: [String: Task<Void, Never>] = [:]

    @ObservationIgnored
    private var detailEnrichmentTokensBySourceId: [String: UInt64] = [:]

    @ObservationIgnored
    private var detailEnrichmentTokenSeed: UInt64 = 0

    init(mainProvider: @escaping () -> MainViewModel) {
        self.mainProvider = mainProvider
        self.detailDocumentStore = DetailDocumentStore()
    }

    func detailViewData(for sourceId: String) -> DetailViewData? {
        guard let summary = main.summary(for: sourceId), let draft = main.draft(for: sourceId) else {
            return nil
        }

        let payload = mergedDetailPayload(for: sourceId)
        let sourcePayload = payload["source"] as? [String: Any] ?? [:]
        let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
        let summarySourcePayload = summaryPayload["source"] as? [String: Any] ?? [:]
        let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
        let sourceSnapshot = BridgePayloadDecoder.sourceSnapshot(from: payload["sourceSnapshot"] as? [String: Any])
        let deploymentsPayload = payload["deployments"] as? [[String: Any]] ?? []
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []
        let preparedDetailContent = preparedDetailContentBySourceId[sourceId]

        let selectedLeafIds = Set(draft.selectedLeafIds)
        let enabledTargetLabels = draft.enabledTargets.map { AgentDisplayCatalog.label(for: $0, customAgents: main.routeState?.settings.customAgents ?? []) }
        let enabledTargets = Set(draft.enabledTargets)
        let inspectedLeafIds = uniqueSorted(leafPayloads.compactMap { $0["id"] as? String })
        let preferredLeafIds = inspectedLeafIds.isEmpty ? summary.leafs.map(\.id) : inspectedLeafIds
        let groupPath = preparedDetailContent?.groupPath ?? main.preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads)
        let author = sourceSnapshot.map { "@\($0.owner.slug)" }
            ?? main.authorName(
                locator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator,
                kind: summary.sourceKind
            )
        let originLabel = sourceSnapshot.flatMap { Self.displayOriginLabel(from: $0.sourceURL) }
            ?? Self.displayOriginLabel(from: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator)
        let groupStats = main.groupCardMetadata(sourceId: sourceId, summary: summary, row: SourceRow(
            id: summary.sourceId,
            displayName: summary.sourceDisplayName,
            locator: summary.sourceLocator,
            kind: summary.sourceKind,
            status: summary.health,
            lastUpdate: summary.updatedAt,
            warningCount: summary.warningCount,
            errorCount: summary.errorCount
        )).stats
        let starCount = groupStats.starCount
        let projectedNamesByLeafId = main.projectionNameMap(for: sourceId)

        if preparedDetailContent == nil, !payload.isEmpty {
            scheduleDetailContentWarmupIfNeeded(sourceId: sourceId)
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
            deploymentFact(from: deployment)
        }

        let targets = main.visibleTargetIds().map { targetId in
            DetailTarget(
                id: targetId,
                label: AgentDisplayCatalog.label(for: targetId, customAgents: main.routeState?.settings.customAgents ?? []),
                shortLabel: AgentDisplayCatalog.shortLabel(for: targetId, customAgents: main.routeState?.settings.customAgents ?? []),
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
        let updatedRelative = main.relativeUpdateLabel(updatedAt)
        let revision = detailRevision(
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
            saveState: main.saveState(for: sourceId),
            skillSelection: main.skillSelectionState(sourceId: sourceId),
            targetSelection: main.targetSelectionState(sourceId: sourceId),
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
            saveState: main.saveState(for: sourceId),
            skillSelection: main.skillSelectionState(sourceId: sourceId),
            targetSelection: main.targetSelectionState(sourceId: sourceId),
            enabledTargetLabels: enabledTargetLabels,
            sourceFacts: sourceFacts,
            deploymentFacts: deploymentFacts,
            fileTree: fileTree,
            groupDocuments: placeholderDocumentTabs(groupDocumentDescriptors),
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

    func groupDocument(for sourceId: String, documentId: String) async -> DocumentTab? {
        let prepared = preparedDetailContentBySourceId[sourceId]
        if prepared == nil {
            _ = detailSnapshot(for: sourceId)
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
                    content: Self.renderFileTree(preparedContent.fileTree),
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

        if !placeholder.content.isEmpty || !placeholder.isMarkdown {
            return placeholder
        }

        return await loadedDocumentTab(from: documentDescriptor(for: placeholder))
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

    func scheduleDetailEnrichmentFetch(sourceId: String, force: Bool = false) {
        if !force, detailEnrichmentTasksBySourceId[sourceId] != nil {
            return
        }
        if force {
            detailEnrichmentTasksBySourceId[sourceId]?.cancel()
            detailEnrichmentTasksBySourceId.removeValue(forKey: sourceId)
        }

        detailEnrichmentTokenSeed &+= 1
        let token = detailEnrichmentTokenSeed
        detailEnrichmentTokensBySourceId[sourceId] = token

        let task = Task { @MainActor [weak self, sourceId] in
            guard let self else { return }
            do {
                let response = try await self.main.bridgeClient.inspectEnrichment(sourceId: sourceId)
                guard !Task.isCancelled else { return }

                if let payload = response.data?.value as? [String: Any],
                   self.detailEnrichmentTokensBySourceId[sourceId] == token
                {
                    let normalizedPayload: [String: Any]
                    if let summary = self.main.summary(for: sourceId) {
                        let displayName = self.main.renamedSourceDisplayNameOverridesBySourceId[sourceId]
                            ?? summary.sourceDisplayName
                        let originalDisplayName = self.main.renamedSourceOriginalDisplayNameOverridesBySourceId[sourceId]
                            ?? summary.sourceOriginalDisplayName
                        normalizedPayload = self.main.enrichmentPayloadWithDisplayName(
                            payload,
                            displayName: displayName,
                            originalDisplayName: originalDisplayName
                        )
                    } else {
                        normalizedPayload = payload
                    }
                    self.detailEnrichmentPayloadBySourceId[sourceId] = self.mergedDetailEnrichmentPayload(
                        existing: self.detailEnrichmentPayloadBySourceId[sourceId] ?? [:],
                        incoming: normalizedPayload
                    )
                }
                if self.detailEnrichmentTokensBySourceId[sourceId] == token {
                    self.main.latestWarnings = response.warnings
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

    func scheduleDetailContentWarmupIfNeeded(sourceId: String) {
        guard detailWarmupTasksBySourceId[sourceId] == nil else {
            return
        }
        guard let summary = main.summary(for: sourceId),
              let key = main.scopedSourceKey(sourceId: sourceId),
              let payload = main.inspectedPayloadBySourceId[key],
              !payload.isEmpty
        else {
            return
        }
        let input = buildPreparedDetailWarmupInput(sourceId: sourceId, summary: summary, payload: payload)
        let token: UInt64
        if let currentToken = detailWarmupTokensBySourceId[sourceId] {
            token = currentToken
        } else {
            detailWarmupTokenSeed &+= 1
            token = detailWarmupTokenSeed
            detailWarmupTokensBySourceId[sourceId] = token
        }

        var task: Task<Void, Never>?
        task = Task { [weak self, sourceId, input] in
            guard let self else { return }
            let delay = await MainActor.run { self.detailWarmupDelay }
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }

            let prepared = await Task.detached {
                Self.prepareDetailContent(input: input)
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
    }

    private func mergedDetailPayload(for sourceId: String) -> [String: Any] {
        let key = main.scopedSourceKey(sourceId: sourceId)
        var payload = key.flatMap { main.inspectedPayloadBySourceId[$0] } ?? [:]
        let enrichmentPayload = detailEnrichmentPayloadBySourceId[sourceId] ?? [:]
        payload = mergedDetailEnrichmentPayload(existing: payload, incoming: enrichmentPayload)
        return payload
    }

    private func mergedDetailEnrichmentPayload(existing: [String: Any], incoming: [String: Any]) -> [String: Any] {
        var merged = existing
        for (key, value) in incoming {
            if let existingArray = merged[key] as? [Any],
               let incomingArray = value as? [Any] {
                merged[key] = existingArray + incomingArray
            } else if let existingObject = merged[key] as? [String: Any],
                      let incomingObject = value as? [String: Any] {
                merged[key] = mergedDetailEnrichmentPayload(existing: existingObject, incoming: incomingObject)
            } else {
                merged[key] = value
            }
        }
        return merged
    }

    private func buildPreparedDetailWarmupInput(
        sourceId: String,
        summary: SourceManagement.WorkflowSummary,
        payload: [String: Any]
    ) -> PreparedDetailWarmupInput {
        let sourcePayload = payload["source"] as? [String: Any] ?? [:]
        let summaryPayload = payload["summary"] as? [String: Any] ?? [:]
        let lockPayload = summaryPayload["lock"] as? [String: Any] ?? [:]
        let leafPayloads = payload["leafs"] as? [[String: Any]] ?? []
        let sourceSnapshot = BridgePayloadDecoder.sourceSnapshot(from: payload["sourceSnapshot"] as? [String: Any])
        let preferredLeafIds = uniqueSorted(leafPayloads.compactMap { $0["id"] as? String }).isEmpty
            ? summary.leafs.map(\.id)
            : uniqueSorted(leafPayloads.compactMap { $0["id"] as? String })
        let groupPath = main.preferredGroupPath(lockPayload: lockPayload, leafPayloads: leafPayloads)
        let gitHubRepoContext = main.gitHubRepoContext(
            locator: (sourcePayload["locator"] as? String)?.nonEmpty ?? summary.sourceLocator,
            lockPayload: lockPayload
        )
        let projectedNamesByLeafId = main.projectionNameMap(for: sourceId)
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
        var skillsByLeafId: [String: PreparedDetailSkillContent] = [:]
        var lightweightSkills: [DetailSkill] = []

        for leaf in input.leaves {
            let folderPath = leaf.absolutePath
                ?? leaf.skillFilePath.flatMap { ($0 as NSString).deletingLastPathComponent.nonEmpty }
            let documents = leaf.skillFilePath.map { path in
                documentPlaceholderTabs(
                    for: path,
                    groupPath: input.groupPath,
                    gitHubRepoContext: input.gitHubRepoContext
                )
            } ?? [
                DocumentTab(
                    id: "inline-skill-md:\(leaf.id)",
                    title: "SKILL.md",
                    path: "SKILL.md",
                    metadata: [],
                    content: leaf.description,
                    renderCacheKey: "inline-skill-md:\(leaf.id):\(leaf.description.hashValue)",
                    externalURL: nil
                )
            ]
            let projectedName = input.projectedNamesByLeafId[leaf.id]
            let title = folderPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent.nonEmpty }
                ?? leaf.title
                ?? leaf.name.nonEmpty
                ?? leaf.linkName
            let relativeFolderPath = input.groupPath.flatMap { basePath in
                folderPath.flatMap { relativePath(from: basePath, to: $0) }
            } ?? leaf.relativePath
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
        let groupDocuments = groupDocumentDescriptors(
            groupPath: input.groupPath,
            gitHubRepoContext: input.gitHubRepoContext
        )

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
            lines.append("Installs: \(main.formattedCount(installs))")
        }
        if let weeklyInstalls = snapshotSkill?.weeklyInstalls {
            lines.append("Weekly installs: \(main.formattedCount(weeklyInstalls))")
        }
        if let firstSeen = snapshotSkill?.firstSeen {
            lines.append("First seen: \(firstSeen)")
        }
        if let snapshotSkill, !snapshotSkill.installedOn.isEmpty {
            let installs = snapshotSkill.installedOn.map { item in
                if let installs = item.installs {
                    return "\(item.agent) \(main.formattedCount(installs))"
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

    private func deploymentFact(from deployment: [String: Any]) -> String? {
        guard let target = deployment["target"] as? String,
              let status = deployment["status"] as? String
        else {
            return nil
        }

        if let projectPath = main.currentProjectPath(),
           let targetPath = (deployment["targetPath"] as? String)?.nonEmpty,
           let relativeTargetPath = Self.relativePath(from: projectPath, to: targetPath)
        {
            return "\(AgentDisplayCatalog.label(for: target, customAgents: main.routeState?.settings.customAgents ?? [])) · \(status) · \(relativeTargetPath)"
        }

        let leafId = (deployment["leafId"] as? String)?.nonEmpty ?? "unknown"
        return "\(AgentDisplayCatalog.label(for: target, customAgents: main.routeState?.settings.customAgents ?? [])) · \(status) · \(leafId)"
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
        value?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
    }

    nonisolated private static func detailTitleFallback(from locator: String, sourceId: String) -> String {
        if let lastComponent = locator.split(separator: "/").last, !lastComponent.isEmpty {
            return String(lastComponent)
        }
        return sourceId
    }

    nonisolated func placeholderDocumentTabs(_ descriptors: [DocumentDescriptor]) -> [DocumentTab] {
        descriptors.map {
            DocumentTab(
                id: $0.id,
                title: $0.title,
                path: $0.path,
                metadata: $0.metadata,
                content: "",
                renderCacheKey: $0.renderCacheKey,
                externalURL: $0.externalURL,
                isLoaded: false
            )
        }
    }

    nonisolated func documentDescriptor(for tab: DocumentTab) -> DocumentDescriptor {
        DocumentDescriptor(
            id: tab.id,
            title: tab.title,
            path: tab.path,
            metadata: tab.metadata,
            renderCacheKey: tab.renderCacheKey,
            externalURL: tab.externalURL
        )
    }

    nonisolated func detailRevision(
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
        var hasher = Hasher()
        hasher.combine(sourceId)
        hasher.combine(title)
        hasher.combine(originalDisplayName)
        hasher.combine(subtitle)
        hasher.combine(author)
        hasher.combine(originLabel)
        hasher.combine(starCount)
        hasher.combine(groupStats.githubURL)
        hasher.combine(sourceDetailLines)
        hasher.combine(sourceRepositoryURL)
        hasher.combine(locator)
        hasher.combine(groupPath)
        hasher.combine(updatedAt)
        hasher.combine(updatedRelative)
        hasher.combine(health)
        hasher.combine(warningCount)
        hasher.combine(errorCount)
        hasher.combine(enabledSkillCount)
        hasher.combine(totalSkillCount)
        hasher.combine(enabledTargetCount)
        hasher.combine(saveState.phase.rawValue)
        hasher.combine(saveState.detail)
        hasher.combine(skillSelection.rawValue)
        hasher.combine(targetSelection.rawValue)
        hasher.combine(enabledTargetLabels)
        hasher.combine(sourceFacts)
        hasher.combine(deploymentFacts)
        hasher.combine(fileTree.map { $0.id })
        hasher.combine(groupDocuments.map { $0.id })
        hasher.combine(targets.map { $0.id })
        hasher.combine(skills.map { $0.id })
        return String(hasher.finalize(), radix: 16)
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
            return "Unknown"
        }

        if let url = URL(string: trimmed), let host = url.host?.nonEmpty {
            return host
        }

        if trimmed.contains("github.com") {
            return "github.com"
        }

        return trimmed
    }

    nonisolated private static func documentPlaceholderTabs(
        for skillFilePath: String,
        groupPath: String?,
        gitHubRepoContext: MainViewModel.GitHubRepoContext?
    ) -> [DocumentTab] {
        var tabs: [DocumentTab] = [
            placeholderDocumentTab(
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
                    placeholderDocumentTab(
                        id: fullPath,
                        title: "references/\(entry)",
                        path: fullPath
                    )
                )
            }
        }

        return enrichDocumentTabs(
            tabs,
            groupPath: groupPath,
            gitHubRepoContext: gitHubRepoContext
        )
    }

    nonisolated private static func placeholderDocumentTab(
        id: String,
        title: String,
        path: String
    ) -> DocumentTab {
        return DocumentTab(
            id: id,
            title: title,
            path: path,
            metadata: [],
            content: "",
            renderCacheKey: documentRenderCacheKey(path: path),
            externalURL: nil,
            isLoaded: false
        )
    }

    nonisolated private static func loadDetailDocumentBody(path: String) -> String? {
        guard let raw = try? String(contentsOfFile: path, encoding: .utf8) else {
            return nil
        }
        let parsed = parseDetailDocument(raw)
        return parsed.body.isEmpty ? nil : parsed.body
    }

    nonisolated static func parseDetailDocument(_ content: String) -> (metadata: [MetadataEntry], body: String) {
        let parsed = parseDocument(content)
        return (metadata: parsed.metadata, body: parsed.body)
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

    nonisolated private static func groupDocumentDescriptors(
        groupPath: String?,
        gitHubRepoContext: MainViewModel.GitHubRepoContext?
    ) -> [DocumentDescriptor] {
        var descriptors: [DocumentDescriptor] = [
            DocumentDescriptor(
                id: "group:filetree",
                title: localizedWarmup("detail.document.file_tree"),
                path: groupPath ?? ".",
                metadata: [],
                renderCacheKey: "group:filetree:\(groupPath ?? ".")",
                externalURL: nil
            )
        ]

        guard let groupPath,
              let entries = try? FileManager.default.contentsOfDirectory(atPath: groupPath)
        else {
            return descriptors
        }

        let markdownFiles = entries
            .filter { $0.lowercased().hasSuffix(".md") }
            .sorted { compareRootDocumentNames($0, $1) }

        for entry in markdownFiles {
            let fullPath = (groupPath as NSString).appendingPathComponent(entry)
            descriptors.append(
                DocumentDescriptor(
                    id: "group:\(fullPath)",
                    title: entry,
                    path: fullPath,
                    metadata: [],
                    renderCacheKey: documentRenderCacheKey(path: fullPath),
                    externalURL: nil
                )
            )
        }

        return enrichDocumentDescriptors(descriptors, groupPath: groupPath, gitHubRepoContext: gitHubRepoContext)
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
        gitHubRepoContext: MainViewModel.GitHubRepoContext?
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
                ),
                isLoaded: document.isLoaded
            )
        }
    }

    nonisolated private static func enrichDocumentDescriptors(
        _ descriptors: [DocumentDescriptor],
        groupPath: String?,
        gitHubRepoContext: MainViewModel.GitHubRepoContext?
    ) -> [DocumentDescriptor] {
        descriptors.map { document in
            DocumentDescriptor(
                id: document.id,
                title: document.title,
                path: document.path,
                metadata: document.metadata,
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
        gitHubRepoContext: MainViewModel.GitHubRepoContext?
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

    nonisolated private static func documentRenderCacheKey(path: String) -> String {
        var data = Data(path.utf8)
        if let content = try? Data(contentsOf: URL(fileURLWithPath: path)) {
            data.append(content)
        }
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }

    nonisolated private static var documentLoadFailureContent: String {
        "Failed to load document."
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

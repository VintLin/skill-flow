import XCTest

@testable import SkillFlowDesktop

@MainActor
final class DetailScreenContainerTests: XCTestCase {
    func testBuildsDetailViewModelFromCurrentDetailRoute() {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        let detail = DetailViewModel.Snapshot(
            sourceId: "alpha",
            revision: "alpha:rev-1",
            title: "AlphaHub",
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: 1200,
            groupStats: MainViewModel.GroupCardStats(
                skillCount: 2,
                downloadCount: 211898,
                starCount: 1200,
                githubURL: "https://github.com/acme/alpha-hub",
                localPath: "/groups/alpha"
            ),
            sourceDetailLines: ["Provider: clawhub"],
            sourceRepositoryURL: "https://example.com/alpha",
            locator: "clawhub/alpha",
            groupPath: "/groups/alpha",
            updatedAt: "2026-03-25T12:00:00Z",
            updatedRelative: "Updated 1 day ago",
            health: "healthy",
            warningCount: 1,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: 2,
            enabledTargetCount: 1,
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil),
            skillSelection: .partial,
            targetSelection: .full,
            enabledTargetLabels: ["Claude Code"],
            sourceFacts: ["2026-03-25T12:00:00Z"],
            deploymentFacts: ["Claude Code -> /Users/vint/.claude"],
            fileTree: [
                MainViewModel.FileTreeItem(
                    id: "root",
                    title: "alpha",
                    path: "/groups/alpha",
                    isDirectory: true,
                    isSkillRoot: false,
                    isSkillDocument: false,
                    skillId: nil,
                    children: []
                )
            ],
            groupDocuments: [
                MainViewModel.DocumentDescriptor(
                    id: "readme",
                    title: "README.md",
                    path: "README.md",
                    metadata: [
                        MainViewModel.MetadataEntry(id: "name", key: "name", value: "AlphaHub")
                    ],
                    renderCacheKey: "readme-cache",
                    externalURL: "https://github.com/acme/alpha-hub/blob/HEAD/README.md"
                )
            ],
            targets: [
                MainViewModel.DetailTarget(
                    id: "claude-code",
                    label: "Claude Code",
                    shortLabel: "Claude",
                    isEnabled: true
                )
            ],
            skills: [
                MainViewModel.DetailSkill(
                    id: "alpha-a",
                    title: "browse",
                    summary: "Browse things.",
                    version: "1.0.0",
                    author: "Acme",
                    originLabel: "ClawHub",
                    starCount: 1200,
                    folderPath: "/skills/browse",
                    relativeFolderPath: "skills/browse",
                    documents: [],
                    detailLines: ["SKILL.md"],
                    documentContent: "# browse",
                    isEnabled: true,
                    warningCount: 0
                )
            ]
        )

        let container = DetailScreenContainer(state: state) { sourceId in
            XCTAssertEqual(sourceId, "alpha")
            return detail
        }

        XCTAssertEqual(container.viewModel?.sourceId, "alpha")
        XCTAssertEqual(container.viewModel?.title, "AlphaHub")
        XCTAssertEqual(container.viewModel?.groupDocuments.first?.title, "README.md")
        XCTAssertEqual(container.viewModel?.targets.first?.label, "Claude Code")
    }

    func testReturnsNilWhenCurrentRouteIsNotDetail() {
        let state = DesktopAppState()
        let container = DetailScreenContainer(state: state) { _ in
            XCTFail("detail data provider should not be queried for non-detail routes")
            return nil
        }

        XCTAssertNil(container.viewModel)
    }

    func testReturnsNilWhenCurrentDetailRouteHasNoSnapshot() {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        let container = DetailScreenContainer(state: state) { sourceId in
            XCTAssertEqual(sourceId, "alpha")
            return nil
        }

        XCTAssertNil(container.viewModel)
    }

    func testDetailContainerRebuildsViewModelWhenComputedRevisionChangesWithDescriptors() throws {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        var title = "AlphaHub"
        var groupDocuments = [
            MainViewModel.DocumentDescriptor(
                id: "group:/tmp/README.md",
                title: "README.md",
                path: "/tmp/README.md",
                metadata: [],
                renderCacheKey: "group:/tmp/README.md:rev-1",
                externalURL: nil
            )
        ]

        let container = DetailScreenContainer(state: state) { _ in
            DetailViewModel.Snapshot.fixture(
                sourceId: "alpha",
                title: title,
                groupDocuments: groupDocuments
            )
        }

        let firstViewModel = try XCTUnwrap(container.viewModel)
        title = "AlphaHub v2"
        groupDocuments = [
            MainViewModel.DocumentDescriptor(
                id: "group:/tmp/README.md",
                title: "Guide.md",
                path: "/tmp/GUIDE.md",
                metadata: [],
                renderCacheKey: "group:/tmp/GUIDE.md:rev-2",
                externalURL: nil
            )
        ]
        let secondViewModel = try XCTUnwrap(container.viewModel)

        XCTAssertFalse(firstViewModel === secondViewModel)
    }

    func testDetailContainerRebuildsViewModelWhenDescriptorMetadataChanges() throws {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        var groupDocuments = [
            MainViewModel.DocumentDescriptor(
                id: "group:/tmp/README.md",
                title: "README.md",
                path: "/tmp/README.md",
                metadata: [
                    MainViewModel.MetadataEntry(id: "m1", key: "name", value: "AlphaHub")
                ],
                renderCacheKey: "group:/tmp/README.md:rev-1",
                externalURL: nil
            )
        ]

        let container = DetailScreenContainer(state: state) { _ in
            DetailViewModel.Snapshot.fixture(
                sourceId: "alpha",
                groupDocuments: groupDocuments
            )
        }

        let firstViewModel = try XCTUnwrap(container.viewModel)
        groupDocuments = [
            MainViewModel.DocumentDescriptor(
                id: "group:/tmp/README.md",
                title: "README.md",
                path: "/tmp/README.md",
                metadata: [
                    MainViewModel.MetadataEntry(id: "m1", key: "name", value: "AlphaHub v2")
                ],
                renderCacheKey: "group:/tmp/README.md:rev-1",
                externalURL: nil
            )
        ]
        let secondViewModel = try XCTUnwrap(container.viewModel)

        XCTAssertFalse(firstViewModel === secondViewModel)
        XCTAssertEqual(secondViewModel.groupDocuments.first?.metadata.first?.value, "AlphaHub v2")
    }

    func testDetailContainerRebuildsViewModelWhenNestedFileTreeChanges() throws {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        var fileTree = [
            MainViewModel.FileTreeItem(
                id: "root",
                title: "alpha",
                path: "/groups/alpha",
                isDirectory: true,
                isSkillRoot: false,
                isSkillDocument: false,
                skillId: nil,
                children: [
                    MainViewModel.FileTreeItem(
                        id: "root/skill",
                        title: "browse",
                        path: "/groups/alpha/skills/browse",
                        isDirectory: true,
                        isSkillRoot: true,
                        isSkillDocument: false,
                        skillId: "browse",
                        children: [
                            MainViewModel.FileTreeItem(
                                id: "root/skill/doc",
                                title: "SKILL.md",
                                path: "/groups/alpha/skills/browse/SKILL.md",
                                isDirectory: false,
                                isSkillRoot: false,
                                isSkillDocument: true,
                                skillId: "browse",
                                children: []
                            )
                        ]
                    )
                ]
            )
        ]

        let container = DetailScreenContainer(state: state) { _ in
            DetailViewModel.Snapshot.fixture(
                sourceId: "alpha",
                fileTree: fileTree
            )
        }

        let firstViewModel = try XCTUnwrap(container.viewModel)
        fileTree = [
            MainViewModel.FileTreeItem(
                id: "root",
                title: "alpha",
                path: "/groups/alpha",
                isDirectory: true,
                isSkillRoot: false,
                isSkillDocument: false,
                skillId: nil,
                children: [
                    MainViewModel.FileTreeItem(
                        id: "root/skill",
                        title: "browse",
                        path: "/groups/alpha/skills/browse",
                        isDirectory: true,
                        isSkillRoot: true,
                        isSkillDocument: false,
                        skillId: "browse",
                        children: [
                            MainViewModel.FileTreeItem(
                                id: "root/skill/doc-v2",
                                title: "GUIDE.md",
                                path: "/groups/alpha/skills/browse/GUIDE.md",
                                isDirectory: false,
                                isSkillRoot: false,
                                isSkillDocument: true,
                                skillId: "browse",
                                children: []
                            )
                        ]
                    )
                ]
            )
        ]
        let secondViewModel = try XCTUnwrap(container.viewModel)

        XCTAssertFalse(firstViewModel === secondViewModel)
        XCTAssertEqual(
            secondViewModel.fileTree.first?.children.first?.children.first?.title,
            "GUIDE.md"
        )
    }

    func testDetailContainerRebuildsViewModelWhenUpdatedRelativeChanges() throws {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        var updatedRelative = "Updated 1 day ago"
        let container = DetailScreenContainer(state: state) { _ in
            DetailViewModel.Snapshot.fixture(
                sourceId: "alpha",
                updatedRelative: updatedRelative
            )
        }

        let firstViewModel = try XCTUnwrap(container.viewModel)
        updatedRelative = "Updated just now"
        let secondViewModel = try XCTUnwrap(container.viewModel)

        XCTAssertFalse(firstViewModel === secondViewModel)
        XCTAssertEqual(secondViewModel.updatedRelative, "Updated just now")
    }

    func testResolvesGroupDocumentOutsideCachedViewModelBoundary() async throws {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        var tab = MainViewModel.DocumentTab(
            id: "group:/tmp/README.md",
            title: "README.md",
            path: "/tmp/README.md",
            metadata: [],
            content: "# Alpha v1",
            renderCacheKey: "group:/tmp/README.md:rev-1",
            externalURL: nil
        )
        let descriptor = MainViewModel.DocumentDescriptor(
            id: tab.id,
            title: tab.title,
            path: tab.path,
            metadata: tab.metadata,
            renderCacheKey: tab.renderCacheKey,
            externalURL: tab.externalURL
        )

        let container = DetailScreenContainer(
            state: state,
            detailSnapshot: { _ in
                DetailViewModel.Snapshot.fixture(
                    revision: "alpha:rev-1",
                    groupDocuments: [descriptor]
                )
            },
            groupDocument: { sourceId, documentId in
                XCTAssertEqual(sourceId, "alpha")
                XCTAssertEqual(documentId, descriptor.id)
                return tab
            }
        )

        let firstViewModel = try XCTUnwrap(container.viewModel)
        await container.loadDocument(
            sourceId: "alpha",
            documentId: descriptor.id,
            renderCacheKey: descriptor.renderCacheKey
        )
        XCTAssertEqual(
            try XCTUnwrap(
                container.groupDocument(
                    sourceId: "alpha",
                    documentId: descriptor.id,
                    renderCacheKey: descriptor.renderCacheKey
                )
            ).content,
            "# Alpha v1"
        )

        tab = MainViewModel.DocumentTab(
            id: tab.id,
            title: tab.title,
            path: tab.path,
            metadata: tab.metadata,
            content: "# Alpha v2",
            renderCacheKey: tab.renderCacheKey,
            externalURL: tab.externalURL
        )

        let secondViewModel = try XCTUnwrap(container.viewModel)

        XCTAssertTrue(firstViewModel === secondViewModel)
        await container.loadDocument(
            sourceId: "alpha",
            documentId: descriptor.id,
            renderCacheKey: "group:/tmp/README.md:rev-2"
        )
        XCTAssertEqual(
            try XCTUnwrap(
                container.groupDocument(
                    sourceId: "alpha",
                    documentId: descriptor.id,
                    renderCacheKey: "group:/tmp/README.md:rev-2"
                )
            ).content,
            "# Alpha v2"
        )
    }

    func testDetailContainerRebuildsViewModelWhenRevisionChanges() throws {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        var revision = "alpha:rev-1"
        let container = DetailScreenContainer(state: state) { _ in
            DetailViewModel.Snapshot.fixture(revision: revision)
        }

        let firstViewModel = try XCTUnwrap(container.viewModel)
        revision = "alpha:rev-2"

        let secondViewModel = try XCTUnwrap(container.viewModel)
        XCTAssertFalse(firstViewModel === secondViewModel)
    }

    func testDetailContainerRebuildsViewModelForProductionSnapshotsWhenDocumentDescriptorIdentityChanges() throws {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        var renderCacheKey = "group:/tmp/README.md:rev-1"
        let container = DetailScreenContainer(state: state) { _ in
            DetailViewModel.Snapshot(
                detail: MainViewModel.DetailViewData.fixture(
                    groupDocuments: [
                        MainViewModel.DocumentTab(
                            id: "group:/tmp/README.md",
                            title: "README.md",
                            path: "/tmp/README.md",
                            metadata: [],
                            content: "# Alpha",
                            renderCacheKey: renderCacheKey,
                            externalURL: nil
                        )
                    ]
                )
            )
        }

        let firstViewModel = try XCTUnwrap(container.viewModel)
        renderCacheKey = "group:/tmp/README.md:rev-2"
        let secondViewModel = try XCTUnwrap(container.viewModel)

        XCTAssertFalse(firstViewModel === secondViewModel)
    }

    func testDetailContainerRebuildsViewModelWhenSkillDocumentRenderCacheKeyChanges() throws {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        var renderCacheKey = "skill:/tmp/SKILL.md:rev-1"
        let container = DetailScreenContainer(state: state) { _ in
            DetailViewModel.Snapshot(
                detail: MainViewModel.DetailViewData.fixture(
                    skills: [
                        MainViewModel.DetailSkill(
                            id: "alpha-a",
                            title: "browse",
                            summary: "Browse things.",
                            version: nil,
                            author: "Acme",
                            originLabel: "ClawHub",
                            starCount: 1200,
                            folderPath: "/tmp/alpha-a",
                            relativeFolderPath: "alpha-a",
                            documents: [
                                MainViewModel.DocumentTab(
                                    id: "skill:/tmp/SKILL.md",
                                    title: "SKILL.md",
                                    path: "/tmp/SKILL.md",
                                    metadata: [],
                                    content: "",
                                    renderCacheKey: renderCacheKey,
                                    externalURL: nil,
                                    isLoaded: false
                                )
                            ],
                            detailLines: [],
                            documentContent: "",
                            isEnabled: true,
                            warningCount: 0
                        )
                    ]
                )
            )
        }

        let firstViewModel = try XCTUnwrap(container.viewModel)
        renderCacheKey = "skill:/tmp/SKILL.md:rev-2"
        let secondViewModel = try XCTUnwrap(container.viewModel)

        XCTAssertFalse(firstViewModel === secondViewModel)
    }

    func testDetailContainerPrunesResolvedDocumentCacheWhenRevisionChanges() async throws {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        var revision = "alpha:rev-1"
        let oldDocument = MainViewModel.DocumentTab(
            id: "doc",
            title: "README.md",
            path: "/tmp/README.md",
            metadata: [],
            content: "# old",
            renderCacheKey: "doc:rev-1",
            externalURL: nil
        )
        let container = DetailScreenContainer(
            state: state,
            detailSnapshot: { _ in
                DetailViewModel.Snapshot.fixture(sourceId: "alpha", revision: revision)
            },
            groupDocument: { _, _ in oldDocument }
        )

        _ = try XCTUnwrap(container.viewModel)
        await container.loadDocument(sourceId: "alpha", documentId: "doc", renderCacheKey: "doc:rev-1")
        XCTAssertEqual(
            container.groupDocument(sourceId: "alpha", documentId: "doc", renderCacheKey: "doc:rev-1")?.content,
            "# old"
        )

        revision = "alpha:rev-2"
        _ = try XCTUnwrap(container.viewModel)

        XCTAssertNil(container.groupDocument(sourceId: "alpha", documentId: "doc", renderCacheKey: "doc:rev-1"))
    }

    func testLoadDocumentBumpsObservableRevisionWhenSkillDocumentResolves() async {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        let loaded = MainViewModel.DocumentTab(
            id: "skill:/tmp/SKILL.md",
            title: "SKILL.md",
            path: "/tmp/SKILL.md",
            metadata: [],
            content: "# Browse\nLoaded content.",
            renderCacheKey: "skill:/tmp/SKILL.md:rev-1",
            externalURL: nil
        )

        let container = DetailScreenContainer(
            state: state,
            detailSnapshot: { _ in DetailViewModel.Snapshot.fixture(sourceId: "alpha") },
            groupDocument: { _, _ in loaded }
        )

        let initialRevision = container.screenState.detailDocumentLoadRevision
        await container.loadDocument(
            sourceId: "alpha",
            documentId: loaded.id,
            renderCacheKey: loaded.renderCacheKey
        )

        XCTAssertEqual(container.screenState.detailDocumentLoadRevision, initialRevision + 1)
    }

    func testScreenStatePersistsDetailSubselectionAcrossRouteRoundTrip() {
        let state = DesktopAppState()
        let container = DetailScreenContainer(state: state) { _ in nil }

        container.screenState.detailSkillIdByGroup["alpha"] = "alpha-b"
        container.screenState.detailShowsGroupOverviewByGroup["alpha"] = false
        container.screenState.detailDocumentTabIdByGroup["alpha"] = "readme"
        container.screenState.detailDocumentTabIdBySkill["alpha-b"] = "skill-doc"

        state.view.currentRoute = .detail(sourceId: "alpha")
        state.view.currentRoute = .home
        state.view.currentRoute = .detail(sourceId: "alpha")

        XCTAssertEqual(container.screenState.detailSkillIdByGroup["alpha"], "alpha-b")
        XCTAssertEqual(container.screenState.detailShowsGroupOverviewByGroup["alpha"], false)
        XCTAssertEqual(container.screenState.detailDocumentTabIdByGroup["alpha"], "readme")
        XCTAssertEqual(container.screenState.detailDocumentTabIdBySkill["alpha-b"], "skill-doc")
    }

    func testFallbackRowProjectsFromCurrentDetailRoute() {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        let container = DetailScreenContainer(
            state: state,
            detailSnapshot: { _ in nil },
            fallbackRow: { sourceId in
                XCTAssertEqual(sourceId, "alpha")
                return MainViewModel.SourceRow(
                    id: sourceId,
                    displayName: "AlphaHub",
                    locator: "clawhub/alpha",
                    kind: "clawhub",
                    skillCount: 2,
                    status: "healthy",
                    lastUpdate: "2026-03-25T12:00:00Z",
                    warningCount: 0,
                    errorCount: 0
                )
            }
        )

        XCTAssertEqual(container.fallbackRow?.displayName, "AlphaHub")
        XCTAssertEqual(container.fallbackRow?.locator, "clawhub/alpha")
    }

    func testActionSeamsForwardThroughDetailContainer() async {
        let state = DesktopAppState()
        var selectedSourceId: String?
        var updateCurrentGroupCount = 0
        var toggledAllSkillsSourceId: String?
        var setSkillCall: (id: String, enabled: Bool, sourceId: String)?
        var toggledAllTargetsSourceId: String?
        var setTargetCall: (id: String, enabled: Bool, sourceId: String)?

        let container = DetailScreenContainer(
            state: state,
            detailSnapshot: { _ in nil },
            selectSource: { sourceId in
                selectedSourceId = sourceId
            },
            updateCurrentGroup: {
                updateCurrentGroupCount += 1
            },
            toggleAllSkills: { sourceId in
                toggledAllSkillsSourceId = sourceId
            },
            setSkillEnabled: { skillId, enabled, sourceId in
                setSkillCall = (skillId, enabled, sourceId)
            },
            toggleAllTargets: { sourceId in
                toggledAllTargetsSourceId = sourceId
            },
            setTargetEnabled: { targetId, enabled, _, sourceId in
                setTargetCall = (targetId, enabled, sourceId)
            }
        )

        await container.selectSource("alpha")
        await container.updateCurrentGroup()
        await container.toggleAllSkills(sourceId: "alpha")
        await container.setSkillEnabled("browse", enabled: false, sourceId: "alpha")
        await container.toggleAllTargets(sourceId: "alpha")
        await container.setTargetEnabled(
            "claude-code",
            enabled: true,
            expectedCurrentEnabled: false,
            sourceId: "alpha"
        )

        XCTAssertEqual(selectedSourceId, "alpha")
        XCTAssertEqual(updateCurrentGroupCount, 1)
        XCTAssertEqual(toggledAllSkillsSourceId, "alpha")
        XCTAssertEqual(setSkillCall?.id, "browse")
        XCTAssertEqual(setSkillCall?.enabled, false)
        XCTAssertEqual(setSkillCall?.sourceId, "alpha")
        XCTAssertEqual(toggledAllTargetsSourceId, "alpha")
        XCTAssertEqual(setTargetCall?.id, "claude-code")
        XCTAssertEqual(setTargetCall?.enabled, true)
        XCTAssertEqual(setTargetCall?.sourceId, "alpha")
    }
}

private extension DetailViewModel.Snapshot {
    static func fixture(
        sourceId: String = "alpha",
        revision: String? = nil,
        title: String = "AlphaHub",
        originalDisplayName: String? = nil,
        updatedRelative: String = "Updated 1 day ago",
        fileTree: [MainViewModel.FileTreeItem] = [],
        groupDocuments: [MainViewModel.DocumentDescriptor] = [],
        targets: [MainViewModel.DetailTarget] = [
            MainViewModel.DetailTarget(
                id: "claude-code",
                label: "Claude Code",
                shortLabel: "Claude",
                isEnabled: true
            )
        ]
    ) -> Self {
        let resolvedOriginalDisplayName = originalDisplayName ?? title
        let resolvedRevision = revision ?? MainViewModel.detailRevision(
            sourceId: sourceId,
            title: title,
            originalDisplayName: resolvedOriginalDisplayName,
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: 1200,
            groupStats: MainViewModel.GroupCardStats(
                skillCount: 2,
                downloadCount: 211898,
                starCount: 1200,
                githubURL: "https://github.com/acme/alpha-hub",
                localPath: "/groups/alpha"
            ),
            sourceDetailLines: [],
            sourceRepositoryURL: "https://example.com/alpha",
            locator: "clawhub/alpha",
            groupPath: "/groups/alpha",
            updatedAt: "2026-03-25T12:00:00Z",
            updatedRelative: updatedRelative,
            health: "healthy",
            warningCount: 0,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: 2,
            enabledTargetCount: targets.filter(\.isEnabled).count,
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil),
            skillSelection: .partial,
            targetSelection: .partial,
            enabledTargetLabels: targets.filter(\.isEnabled).map(\.label),
            sourceFacts: [],
            deploymentFacts: [],
            fileTree: fileTree,
            groupDocuments: groupDocuments,
            targets: targets,
            skills: []
        )
        return Self(
            sourceId: sourceId,
            revision: resolvedRevision,
            title: title,
            originalDisplayName: resolvedOriginalDisplayName,
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: 1200,
            groupStats: MainViewModel.GroupCardStats(
                skillCount: 2,
                downloadCount: 211898,
                starCount: 1200,
                githubURL: "https://github.com/acme/alpha-hub",
                localPath: "/groups/alpha"
            ),
            sourceDetailLines: [],
            sourceRepositoryURL: "https://example.com/alpha",
            locator: "clawhub/alpha",
            groupPath: "/groups/alpha",
            updatedAt: "2026-03-25T12:00:00Z",
            updatedRelative: updatedRelative,
            health: "healthy",
            warningCount: 0,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: 2,
            enabledTargetCount: targets.filter(\.isEnabled).count,
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil),
            skillSelection: .partial,
            targetSelection: .partial,
            enabledTargetLabels: targets.filter(\.isEnabled).map(\.label),
            sourceFacts: [],
            deploymentFacts: [],
            fileTree: fileTree,
            groupDocuments: groupDocuments,
            targets: targets,
            skills: []
        )
    }
}


    @MainActor func testOnRenameGroupCallbackIsCalledWithSourceIdTitleAndOriginalDisplayName() {
        let state = DesktopAppState()
        state.view.currentRoute = .detail(sourceId: "alpha")

        let detail = DetailViewModel.Snapshot(
            sourceId: "alpha",
            revision: "alpha:rev-1",
            title: "Research Tools",
            originalDisplayName: "anthropic-skills",
            subtitle: "clawhub",
            author: "Anthropic",
            originLabel: "ClawHub",
            starCount: 5000,
            groupStats: MainViewModel.GroupCardStats(
                skillCount: 2,
                downloadCount: 100000,
                starCount: 5000,
                githubURL: "https://github.com/anthropics/skills",
                localPath: "/groups/skills"
            ),
            sourceDetailLines: [],
            sourceRepositoryURL: "https://github.com/anthropics/skills",
            locator: "anthropics/skills",
            groupPath: "/groups/skills",
            updatedAt: "2026-03-25T12:00:00Z",
            updatedRelative: "Updated 1 day ago",
            health: "healthy",
            warningCount: 0,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: 2,
            enabledTargetCount: 1,
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil),
            skillSelection: .partial,
            targetSelection: .full,
            enabledTargetLabels: ["Claude Code"],
            sourceFacts: [],
            deploymentFacts: [],
            fileTree: [],
            groupDocuments: [],
            targets: [],
            skills: []
        )

        var receivedSourceId: String?
        var receivedTitle: String?
        var receivedOriginalDisplayName: String?

        let container = DetailScreenContainer(state: state) { sourceId in
            XCTAssertEqual(sourceId, "alpha")
            return detail
        }

        container.onRenameGroup = { sourceId, title, originalDisplayName in
            receivedSourceId = sourceId
            receivedTitle = title
            receivedOriginalDisplayName = originalDisplayName
        }

        container.onRenameGroup?("alpha", "Research Tools", "anthropic-skills")

        XCTAssertEqual(receivedSourceId, "alpha")
        XCTAssertEqual(receivedTitle, "Research Tools")
        XCTAssertEqual(receivedOriginalDisplayName, "anthropic-skills")
    }

private extension MainViewModel.DetailViewData {
    static func fixture(
        sourceId: String = "alpha",
        revision: String? = nil,
        originalDisplayName: String = "AlphaHub",
        groupDocuments: [MainViewModel.DocumentTab] = [],
        skills: [MainViewModel.DetailSkill] = []
    ) -> Self {
        let descriptors = MainViewModel.documentDescriptors(groupDocuments)
        let resolvedRevision = revision ?? MainViewModel.detailRevision(
            sourceId: sourceId,
            title: "AlphaHub",
            originalDisplayName: originalDisplayName,
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: 1200,
            groupStats: MainViewModel.GroupCardStats(
                skillCount: 2,
                downloadCount: 211898,
                starCount: 1200,
                githubURL: "https://github.com/acme/alpha-hub",
                localPath: "/groups/alpha"
            ),
            sourceDetailLines: [],
            sourceRepositoryURL: "https://example.com/alpha",
            locator: "clawhub/alpha",
            groupPath: "/groups/alpha",
            updatedAt: "2026-03-25T12:00:00Z",
            updatedRelative: "Updated 1 day ago",
            health: "healthy",
            warningCount: 0,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: max(skills.count, 1),
            enabledTargetCount: 1,
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil),
            skillSelection: .partial,
            targetSelection: .full,
            enabledTargetLabels: ["Claude Code"],
            sourceFacts: [],
            deploymentFacts: [],
            fileTree: [],
            groupDocuments: descriptors,
            targets: [
                MainViewModel.DetailTarget(
                    id: "claude-code",
                    label: "Claude Code",
                    shortLabel: "Claude",
                    isEnabled: true
                )
            ],
            skills: skills
        )
        return Self(
            sourceId: sourceId,
            revision: resolvedRevision,
            title: "AlphaHub",
            originalDisplayName: originalDisplayName,
            subtitle: "clawhub",
            author: "Acme",
            originLabel: "ClawHub",
            starCount: 1200,
            groupStats: MainViewModel.GroupCardStats(
                skillCount: 2,
                downloadCount: 211898,
                starCount: 1200,
                githubURL: "https://github.com/acme/alpha-hub",
                localPath: "/groups/alpha"
            ),
            sourceDetailLines: [],
            sourceRepositoryURL: "https://example.com/alpha",
            locator: "clawhub/alpha",
            groupPath: "/groups/alpha",
            updatedAt: "2026-03-25T12:00:00Z",
            updatedRelative: "Updated 1 day ago",
            health: "healthy",
            warningCount: 0,
            errorCount: 0,
            enabledSkillCount: 1,
            totalSkillCount: max(skills.count, 1),
            enabledTargetCount: 1,
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil),
            skillSelection: .partial,
            targetSelection: .full,
            enabledTargetLabels: ["Claude Code"],
            sourceFacts: [],
            deploymentFacts: [],
            fileTree: [],
            groupDocuments: groupDocuments,
            targets: [
                MainViewModel.DetailTarget(
                    id: "claude-code",
                    label: "Claude Code",
                    shortLabel: "Claude",
                    isEnabled: true
                )
            ],
            skills: skills
        )
    }
}

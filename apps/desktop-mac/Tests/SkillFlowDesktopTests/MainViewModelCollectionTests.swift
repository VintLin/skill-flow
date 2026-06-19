import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MainViewModelCollectionTests: XCTestCase {
    override func setUp() {
        super.setUp()
        UserDefaults.standard.set(DesktopLanguage.zhHans.rawValue, forKey: DesktopLanguage.storageKey)
    }

    override func tearDown() {
        UserDefaults.standard.set(DesktopLanguage.en.rawValue, forKey: DesktopLanguage.storageKey)
        super.tearDown()
    }

    func testCollectionHomeSourcePredicateMatchesCollectionCards() {
        XCTAssertTrue(MainViewModel.isCollectionHomeSource(groupCard(sourceKind: " collection ")))
        XCTAssertFalse(MainViewModel.isCollectionHomeSource(groupCard(sourceKind: "git")))
    }

    func testGitKindCountsAsRemoteHomeSource() {
        let card = groupCard(sourceKind: "git", sourceLocator: "/Users/example/cached/git-source")

        XCTAssertFalse(MainViewModel.isLocalHomeSource(card))
        XCTAssertTrue(MainViewModel.isRemoteHomeSource(card))
    }

    func testCreateCollectionDraftValidatesNameAndSelection() async {
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: CollectionQueryStub(),
            commandFacade: RecordingCollectionCommandFacade()
        )

        await model.bootstrap()

        XCTAssertEqual(
            model.validateCollectionCreate(
                displayName: "  ",
                selectedSkills: [CollectionSkillRef(sourceId: "alpha", leafId: "alpha-a")]
            ),
            .nameRequired
        )
        XCTAssertEqual(
            model.validateCollectionCreate(displayName: "Collection", selectedSkills: []),
            .skillsRequired
        )
        XCTAssertEqual(
            model.validateCollectionCreate(
                displayName: "Collection",
                selectedSkills: [CollectionSkillRef(sourceId: "alpha", leafId: "alpha-a")]
            ),
            .valid
        )

        XCTAssertEqual(
            model.collectionSourceOptions,
            [
                CollectionSourceOption(id: "alpha", title: "Alpha", sourceSubtitle: "@github · Alpha", skillCount: 3, isCollection: false),
                CollectionSourceOption(id: "beta", title: "Beta", sourceSubtitle: "组合 · Beta", skillCount: 1, isCollection: true),
                CollectionSourceOption(id: "gamma", title: "Gamma", sourceSubtitle: "本地 · Gamma", skillCount: 1, isCollection: false),
            ]
        )
        XCTAssertEqual(
            model.collectionSkillOptions(for: "alpha"),
            [
                CollectionSkillOption(
                    id: "alpha:alpha-a",
                    sourceId: "alpha",
                    sourceTitle: "Alpha",
                    sourceSubtitle: "@github · Alpha",
                    leafId: "alpha-a",
                    title: "Browse",
                    isEnabled: true
                ),
                CollectionSkillOption(
                    id: "alpha:alpha-c",
                    sourceId: "alpha",
                    sourceTitle: "Alpha",
                    sourceSubtitle: "@github · Alpha",
                    leafId: "alpha-c",
                    title: "Audit",
                    isEnabled: false
                ),
                CollectionSkillOption(
                    id: "alpha:alpha-b",
                    sourceId: "alpha",
                    sourceTitle: "Alpha",
                    sourceSubtitle: "@github · Alpha",
                    leafId: "alpha-b",
                    title: "Review",
                    isEnabled: false
                ),
            ]
        )
    }

    func testGroupAndDetailSkillsSortEnabledFirstThenByLocalizedTitle() async throws {
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: CollectionQueryStub(),
            commandFacade: RecordingCollectionCommandFacade()
        )

        await model.bootstrap()

        let alphaCard = try XCTUnwrap(model.groupCards.first(where: { $0.id == "alpha" }))
        XCTAssertEqual(alphaCard.skills.map(\.id), ["alpha-a", "alpha-c", "alpha-b"])
        XCTAssertEqual(alphaCard.skills.map(\.label), ["Browse", "Audit", "Review"])

        let detail = try XCTUnwrap(model.detailSnapshot(for: "alpha"))
        XCTAssertEqual(detail.skills.map(\.id), ["alpha-a", "alpha-c", "alpha-b"])
    }

    func testSkillSourceTitleOnlyDisplaysForCollectionGroups() async throws {
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: CollectionQueryStub(),
            commandFacade: RecordingCollectionCommandFacade()
        )

        await model.bootstrap()

        let alphaCard = try XCTUnwrap(model.groupCards.first(where: { $0.id == "alpha" }))
        XCTAssertEqual(alphaCard.skills.map(\.sourceTitle), [nil, nil, nil])

        let betaCard = try XCTUnwrap(model.groupCards.first(where: { $0.id == "beta" }))
        XCTAssertEqual(betaCard.skills.map(\.sourceTitle), ["Alpha"])
    }

    func testHomeCardsUseLocalizedAuthorsForLocalAndCollections() async {
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: CollectionQueryStub(),
            commandFacade: RecordingCollectionCommandFacade()
        )

        await model.bootstrap()

        XCTAssertEqual(model.groupCards.first(where: { $0.id == "beta" })?.byline, "by 组合")
        XCTAssertEqual(model.groupCards.first(where: { $0.id == "gamma" })?.byline, "by 本地")

        UserDefaults.standard.set(DesktopLanguage.en.rawValue, forKey: DesktopLanguage.storageKey)
        await model.refreshList()

        XCTAssertEqual(model.groupCards.first(where: { $0.id == "beta" })?.byline, "by combined")
        XCTAssertEqual(model.groupCards.first(where: { $0.id == "gamma" })?.byline, "by local")
    }

    func testCollectionEditorOptionsBuildsSnapshotForCreateMergeAndRestore() async {
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: CollectionQueryStub(),
            commandFacade: RecordingCollectionCommandFacade()
        )

        await model.bootstrap()

        let options = model.collectionEditorOptions()

        XCTAssertEqual(options.mergeSourceOptions.map(\.id), ["alpha", "gamma"])
        XCTAssertEqual(options.restoreSourceOptions.map(\.id), ["beta"])
        XCTAssertEqual(options.skillOptions.map(\.id), [
            "alpha:alpha-a",
            "alpha:alpha-c",
            "alpha:alpha-b",
            "gamma:gamma-a",
        ])
    }

    func testCollectionDisplayNameFallsBackFromCollectionLocatorToOriginalName() async {
        let query = CollectionQueryStub()
        query.useCollectionLocatorDisplayName = true
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: RecordingCollectionCommandFacade()
        )

        await model.bootstrap()

        XCTAssertEqual(model.groupCards.first(where: { $0.id == "beta" })?.title, "组合工具")
    }

    func testMergeCollectionRequiresTwoGroups() async {
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: CollectionQueryStub(),
            commandFacade: RecordingCollectionCommandFacade()
        )

        await model.bootstrap()

        XCTAssertEqual(
            model.validateCollectionMerge(displayName: "  ", sourceIds: ["alpha", "beta"]),
            .nameRequired
        )
        XCTAssertEqual(
            model.validateCollectionMerge(displayName: "Merged", sourceIds: []),
            .groupsRequired
        )
        XCTAssertEqual(
            model.validateCollectionMerge(displayName: "Merged", sourceIds: ["alpha", "alpha"]),
            .groupsRequired
        )
        XCTAssertEqual(
            model.validateCollectionMerge(displayName: "Merged", sourceIds: ["alpha", "beta", "alpha"]),
            .valid
        )
    }

    func testCreateCollectionCallsCommandFacade() async {
        let query = CollectionQueryStub()
        let command = RecordingCollectionCommandFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: command
        )

        await model.bootstrap()
        await model.createCollection(
            displayName: "Team Tools",
            skills: [
                CollectionSkillRef(sourceId: "alpha", leafId: "alpha-a"),
                CollectionSkillRef(sourceId: "beta", leafId: "beta-a"),
            ],
            enabledTargets: ["codex", "claude-code"]
        )

        XCTAssertEqual(
            command.createCalls,
            [
                RecordingCollectionCommandFacade.CreateCall(
                    displayName: "Team Tools",
                    skills: [
                        CollectionSkillRef(sourceId: "alpha", leafId: "alpha-a"),
                        CollectionSkillRef(sourceId: "beta", leafId: "beta-a"),
                    ],
                    enabledTargets: ["codex", "claude-code"]
                )
            ]
        )
        XCTAssertEqual(query.listCallCount, 1)
    }

    func testHomeCardDoesNotExposeDeleteActionForCollections() throws {
        let homeSource = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")
        let cardSource = try sourceText(at: "Sources/DesktopApp/Components/GroupCardComponents.swift")

        XCTAssertTrue(homeSource.contains("canDelete: !MainViewModel.isCollectionHomeSource(card)"))
        XCTAssertTrue(cardSource.contains("if canDelete {"))
        XCTAssertTrue(cardSource.contains("title: t(\"group_card.action.delete\")"))
    }

    func testGroupEditorSheetDoesNotRenderTargetsForCreateOrMerge() throws {
        let homeSource = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")
        let createPanel = try sourceSlice(in: homeSource, from: "private var createPanel", to: "private var mergePanel")
        let mergePanel = try sourceSlice(in: homeSource, from: "private var mergePanel", to: "private var restorePanel")

        for panelSource in [createPanel, mergePanel] {
            XCTAssertFalse(panelSource.contains("targetSection"))
            XCTAssertFalse(panelSource.contains("group_editor.section.targets"))
        }
    }

    func testGroupEditorSheetKeepsFixedHeightAndOmitsImpactList() throws {
        let homeSource = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")
        let sheetSource = try sourceSlice(in: homeSource, from: "private struct GroupEditorSheet", to: "private struct RenameSourceDialog")

        XCTAssertTrue(sheetSource.contains(".frame(width: 560, height: 520, alignment: .topLeading)"))
        XCTAssertTrue(sheetSource.contains(".frame(maxHeight: .infinity, alignment: .topLeading)"))
        XCTAssertTrue(sheetSource.contains(".frame(maxHeight: .infinity)"))
        XCTAssertFalse(sheetSource.contains("let scrollHeight: CGFloat = showsSearch ? 132 : 220"))
        XCTAssertFalse(sheetSource.contains(".frame(height: scrollHeight)"))
        XCTAssertFalse(sheetSource.contains("impactList("))
        XCTAssertFalse(sheetSource.contains("private func impactList"))
    }

    func testGroupEditorSearchFiltersCreateSkillsAndMergeGroups() throws {
        let homeSource = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")
        let sheetSource = try sourceSlice(in: homeSource, from: "private struct GroupEditorSheet", to: "private struct RenameSourceDialog")
        let createPanel = try sourceSlice(in: sheetSource, from: "private var createPanel", to: "private var mergePanel")
        let mergePanel = try sourceSlice(in: sheetSource, from: "private var mergePanel", to: "private var restorePanel")

        XCTAssertTrue(sheetSource.contains("@State private var skillSearchQuery = \"\""))
        XCTAssertTrue(sheetSource.contains("searchField"))
        XCTAssertTrue(sheetSource.contains("group_editor.search.placeholder"))
        XCTAssertTrue(sheetSource.contains("group_editor.search.empty"))
        XCTAssertTrue(createPanel.contains("filteredSkillOptions"))
        XCTAssertTrue(mergePanel.contains("filteredSourceOptions"))
        XCTAssertTrue(sheetSource.contains("option.title"))
        XCTAssertTrue(sheetSource.contains("option.sourceSubtitle"))
        XCTAssertTrue(sheetSource.contains("option.sourceTitle"))
        XCTAssertTrue(sheetSource.contains("skillsBySourceId[option.id]"))
        XCTAssertTrue(mergePanel.contains("group_editor.section.skill_groups"))
        XCTAssertTrue(mergePanel.contains("mergeSourceSubtitle(for: option)"))
        XCTAssertFalse(mergePanel.contains("subtitle: \"\\(option.skillCount)\""))
    }

    func testGroupEditorOpensBeforeOptionsLoadAndShowsLoadingState() throws {
        let homeSource = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")
        let sheetSource = try sourceSlice(in: homeSource, from: "private struct GroupEditorSheet", to: "private struct RenameSourceDialog")

        XCTAssertTrue(homeSource.contains("@State private var groupEditorOptions: CollectionEditorOptions?"))
        XCTAssertTrue(homeSource.contains("@State private var groupEditorOptionsTask: Task<Void, Never>?"))
        XCTAssertTrue(homeSource.contains("prepareGroupEditorOptions()"))
        XCTAssertTrue(homeSource.contains("await Task.yield()"))
        XCTAssertTrue(homeSource.contains("isLoading: groupEditorOptions == nil"))
        XCTAssertTrue(homeSource.contains("skillOptions: groupEditorOptions?.skillOptions ?? []"))
        XCTAssertFalse(homeSource.contains("skillOptions: groupEditorSkillOptions"))
        XCTAssertFalse(homeSource.contains("sourceOptions: groupEditorMergeSourceOptions"))
        XCTAssertTrue(sheetSource.contains("let isLoading: Bool"))
        XCTAssertTrue(sheetSource.contains("ProgressView()"))
        XCTAssertTrue(sheetSource.contains("group_editor.loading"))
    }

    func testGroupEditorSaveSendsEmptyTargetsForCreateAndMerge() throws {
        let homeSource = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")
        let saveFunction = try sourceSlice(in: homeSource, from: "private func saveGroupEditor()", to: "private func closeCustomAgentEditor()")
        let createSave = try sourceSlice(in: saveFunction, from: "case .create:", to: "case .merge:")
        let mergeSave = try sourceSlice(in: saveFunction, from: "case .merge:", to: "case .restore:")

        XCTAssertTrue(createSave.contains("enabledTargets: []"))
        XCTAssertTrue(mergeSave.contains("enabledTargets: []"))
        XCTAssertFalse(createSave.contains("orderedGroupEditorSelectedTargetIds"))
        XCTAssertFalse(mergeSave.contains("orderedGroupEditorSelectedTargetIds"))
    }

    func testGroupEditorTabChangeClearsSelectionsAndValidation() throws {
        let homeSource = try sourceText(at: "Sources/DesktopApp/Screens/Home/MainView.swift")

        XCTAssertTrue(homeSource.contains("resetGroupEditorSelections(clearName: false)"))
        XCTAssertTrue(homeSource.contains("onResetSelections: { resetGroupEditorSelections(clearName: false) }"))
        XCTAssertTrue(homeSource.contains("onResetSelections()"))
        XCTAssertTrue(homeSource.contains("groupEditorSelectedSkills = []"))
        XCTAssertTrue(homeSource.contains("groupEditorSelectedSourceIds = []"))
        XCTAssertFalse(homeSource.contains("groupEditorSelectedTargetIds"))
        XCTAssertTrue(homeSource.contains("groupEditorValidationKey = nil"))
    }

    private func sourceText(at relativePath: String) throws -> String {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        return try String(contentsOf: root.appendingPathComponent(relativePath), encoding: .utf8)
    }

    private func sourceSlice(in source: String, from startMarker: String, to endMarker: String) throws -> String {
        guard let startRange = source.range(of: startMarker) else {
            XCTFail("Missing start marker: \(startMarker)")
            return ""
        }
        guard let endRange = source[startRange.upperBound...].range(of: endMarker) else {
            XCTFail("Missing end marker: \(endMarker)")
            return ""
        }
        return String(source[startRange.lowerBound..<endRange.lowerBound])
    }

    private func groupCard(
        sourceKind: String,
        sourceLocator: String = "https://example.com/alpha"
    ) -> GroupCardModel {
        GroupCardModel(
            id: "alpha",
            title: "Alpha",
            byline: nil,
            groupPath: nil,
            sourceKind: sourceKind,
            sourceLocator: sourceLocator,
            isPinned: false,
            health: "HEALTHY",
            warningCount: 0,
            errorCount: 0,
            skillSelection: .empty,
            targetSelection: .empty,
            stats: GroupCardStats(
                downloadCount: nil,
                starCount: nil,
                githubURL: nil,
                localPath: nil
            ),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            saveState: SaveState(phase: .idle, detail: nil)
        )
    }
}

@MainActor
private final class CollectionQueryStub: DesktopQuerying {
    private(set) var listCallCount = 0
    var useCollectionLocatorDisplayName = false

    func bootstrap() async throws -> BridgeResponse {
        BridgeResponse.success(command: .bootstrap, payload: payload())
    }

    func list() async throws -> BridgeResponse {
        listCallCount += 1
        return BridgeResponse.success(command: .list, payload: payload())
    }

    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse {
        BridgeResponse.success(command: .inspect, payload: [:])
    }

    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse {
        BridgeResponse.success(command: .inspectEnrichment, payload: [:])
    }

    func searchImportGroups(query: String?) async throws -> BridgeResponse {
        BridgeResponse.success(command: .searchImportGroups, payload: ["groups": []])
    }

    func previewImportSource(locator: String) async throws -> BridgeResponse {
        BridgeResponse.success(command: .previewImportSource, payload: [:])
    }

    private func payload() -> [String: Any] {
        [
            "availableTargets": ["codex", "claude-code"],
            "summaries": [
                summary(
                    sourceId: "alpha",
                    kind: "git",
                    displayName: "Alpha",
                    leafs: [
                        ("alpha-b", "Review", nil, "Git Source"),
                        ("alpha-a", "Browse", nil, "Git Source"),
                        ("alpha-c", "Audit", nil, "Git Source"),
                    ],
                    selectedLeafIds: ["alpha-a"],
                    enabledTargets: ["codex"]
                ),
                summary(
                    sourceId: "beta",
                    kind: "collection",
                    displayName: useCollectionLocatorDisplayName ? "collection:skills-2" : "Beta",
                    originalDisplayName: "组合工具",
                    locator: "collection:skills-2",
                    leafs: [
                        ("beta-a", "Plan", "alpha", "Alpha"),
                    ],
                    selectedLeafIds: ["beta-a"],
                    enabledTargets: ["claude-code"]
                ),
                summary(
                    sourceId: "gamma",
                    kind: "local",
                    displayName: "Gamma",
                    locator: "/Users/Vint/skills/Gamma",
                    leafs: [
                        ("gamma-a", "Local Plan", nil, nil),
                    ],
                    selectedLeafIds: ["gamma-a"],
                    enabledTargets: []
                ),
            ],
        ]
    }

    private func summary(
        sourceId: String,
        kind: String,
        displayName: String,
        originalDisplayName: String? = nil,
        locator: String? = nil,
        leafs: [(String, String, String?, String?)],
        selectedLeafIds: [String],
        enabledTargets: [String]
    ) -> [String: Any] {
        [
            "source": [
                "id": sourceId,
                "kind": kind,
                "displayName": displayName,
                "originalDisplayName": originalDisplayName ?? displayName,
                "locator": locator ?? "https://github.com/github/\(sourceId)",
            ],
            "lock": [
                "updatedAt": "2026-04-01T00:00:00.000Z",
            ],
            "leafs": leafs.map { leaf in
                var payload: [String: Any] = [
                    "id": leaf.0,
                    "linkName": leaf.0,
                    "name": leaf.1,
                    "description": "",
                    "metadataWarnings": [],
                ]
                if let sourceId = leaf.2 {
                    payload["sourceId"] = sourceId
                }
                if let sourceTitle = leaf.3 {
                    payload["sourceTitle"] = sourceTitle
                }
                return payload
            },
            "bindings": [
                "selectedLeafIds": selectedLeafIds,
                "targets": Dictionary(
                    uniqueKeysWithValues: enabledTargets.map { target in
                        (target, [
                            "enabled": true,
                            "leafIds": selectedLeafIds,
                        ] as [String: Any])
                    }
                ),
            ],
            "issueCounts": [
                "warning": 0,
                "error": 0,
            ],
            "health": "HEALTHY",
        ]
    }
}

@MainActor
private final class RecordingCollectionCommandFacade: DesktopCommanding {
    struct CreateCall: Equatable {
        let displayName: String
        let skills: [CollectionSkillRef]
        let enabledTargets: [String]
    }

    private(set) var createCalls: [CreateCall] = []

    func saveSettings(customTargets: [[String: String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func importSource(locator: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func createCollection(displayName: String, skills: [CollectionSkillRef], enabledTargets: [String]) async throws -> BridgeResponse {
        createCalls.append(CreateCall(displayName: displayName, skills: skills, enabledTargets: enabledTargets))
        return BridgeResponse.success(command: .createCollection, payload: ["sourceId": "collection-team-tools"])
    }

    func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func restoreCollectionSources(collectionId: String) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func renameSource(sourceId: String, displayName: String) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func uninstall(sourceIds: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func apply(sourceId: String, scope: ProjectScopeSelection, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func doctor() async throws -> BridgeResponse {
        fatalError("unused")
    }
}

private extension BridgeResponse {
    static func success(command: BridgeCommand, payload: [String: Any]) -> BridgeResponse {
        BridgeResponse(
            protocolVersion: "1.0",
            requestId: "test",
            command: command,
            ok: true,
            data: AnyCodable(payload),
            warnings: [],
            errors: []
        )
    }
}

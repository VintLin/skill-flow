import Foundation
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class ImportScreenContainerTests: XCTestCase {
    func testIsActiveOnlyForImportRoute() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(state: state, mainViewModel: model)

        XCTAssertFalse(container.isActive)

        state.view.currentRoute = .importPage
        XCTAssertTrue(container.isActive)

        state.view.currentRoute = .detail(sourceId: "alpha")
        XCTAssertFalse(container.isActive)
    }

    func testScreenStatePersistsAcrossRouteRoundTrip() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(state: state, mainViewModel: model)

        container.screenState.searchText = "anthropic/skills"
        container.screenState.placeholderIndex = 2

        state.view.currentRoute = .importPage
        state.view.currentRoute = .home
        state.view.currentRoute = .importPage

        XCTAssertEqual(container.screenState.searchText, "anthropic/skills")
        XCTAssertEqual(container.screenState.placeholderIndex, 2)
    }

    func testHomeLocatorHandoffRoutesToImportPageAndSubmitsDirectLocator() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        let handled = await container.homeContainer.handleHomeSearchSubmit("  \"anthropics/skills\"  ")

        XCTAssertTrue(handled)
        XCTAssertEqual(runtime.state.view.currentRoute, .importPage)
        XCTAssertEqual(container.importContainer.screenState.searchText, "anthropics/skills")
        XCTAssertEqual(container.mainViewModel.importSubmittedQuery, "anthropics/skills")
    }

    func testHomeLocatorHandoffImportPageLoadKeepsDirectLocatorSearchState() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        let handled = await container.homeContainer.handleHomeSearchSubmit("anthropics/skills")
        XCTAssertTrue(handled)

        let searchItem = makeItem(
            id: "anthropics-skills-search",
            title: "Anthropic Skills",
            locator: "anthropics/skills"
        )
        container.mainViewModel.importSearchPhase = .loading
        container.mainViewModel.searchImportGroups = [searchItem]

        await container.mainViewModel.loadImportPageIfNeeded()

        XCTAssertEqual(runtime.state.view.currentRoute, .importPage)
        XCTAssertEqual(container.importContainer.screenState.searchText, "anthropics/skills")
        XCTAssertEqual(container.mainViewModel.importSubmittedQuery, "anthropics/skills")
        XCTAssertEqual(container.mainViewModel.importSearchPhase, .loading)
        XCTAssertEqual(container.mainViewModel.searchImportGroups, [searchItem])
    }

    func testHomeSearchSubmitKeepsPlainTextOnHome() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)
        container.importContainer.screenState.searchText = "previous/import"
        container.mainViewModel.importSubmittedQuery = "previous/import"

        let handled = await container.homeContainer.handleHomeSearchSubmit("anthropics")

        XCTAssertFalse(handled)
        XCTAssertEqual(runtime.state.view.currentRoute, .home)
        XCTAssertEqual(container.importContainer.screenState.searchText, "previous/import")
        XCTAssertEqual(container.mainViewModel.importSubmittedQuery, "previous/import")
    }

    func testSupportedImportLocatorMatrix() {
        let cases: [(String, Bool)] = [
            ("https://github.com/owner/repo", true),
            ("https://github.com/owner/repo.git", true),
            ("https://github.com/owner/repo/tree/main", true),
            ("https://github.com/owner/repo/tree/main/path/to/skills", true),
            ("https://gitlab.com/owner/repo", true),
            ("https://gitlab.com/owner/repo.git", true),
            ("https://gitlab.com/owner/repo/-/tree/main", true),
            ("https://gitlab.com/owner/repo/-/tree/main/path", true),
            ("https://gitlab.com/group/subgroup/project", true),
            ("https://gitlab.com/group/subgroup/project/-/tree/main/path", true),
            ("https://gitlab.com/owner/repo/tree/main", false),
            ("https://gitlab.com/owner/repo/-/blob/main/README.md", false),
            ("https://gitlab.com/group/subgroup/project/-/blob/main/README.md", false),
            ("https://github.com/owner/repo/issues", false),
            ("https://github.com/owner/repo/pull/1", false),
            ("https://github.com/owner/repo/blob/main/SKILL.md", false),
            ("https://github.com/owner/repo/actions", false),
            ("https://github.com/owner/repo/releases", false),
            ("plain search text", false),
            ("\"/Users/Vint/skills\"", true),
            ("clawhub:anthropics/skills", true),
            ("git@github.com:owner/repo.git", true),
            ("owner/repo", true),
            ("owner/repo@skill-name", true),
            ("owner/repo/skills/skill-name", true),
            ("owner/repo/path/to/skill", true),
            ("owner/repo@skill name", false),
            ("owner/repo@", false),
            ("owner/repo/path with spaces", false),
        ]

        for (locator, expected) in cases {
            XCTAssertEqual(
                MainViewModel.isSupportedImportLocator(locator),
                expected,
                "locator: \(locator)"
            )
        }
    }

    func testHomeSearchSubmitRoutesGitHubSkillSelectorsToImportPage() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        let handled = await container.homeContainer.handleHomeSearchSubmit("paramchoudhary/resumeskills@resume-bullet-writer")

        XCTAssertTrue(handled)
        XCTAssertEqual(runtime.state.view.currentRoute, .importPage)
        XCTAssertEqual(container.importContainer.screenState.searchText, "paramchoudhary/resumeskills@resume-bullet-writer")
        XCTAssertEqual(container.mainViewModel.importSubmittedQuery, "paramchoudhary/resumeskills@resume-bullet-writer")
    }

    func testHomeSearchSubmitRoutesGitHubSubpathsToImportPage() async {
        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)

        let handled = await container.homeContainer.handleHomeSearchSubmit("paramchoudhary/resumeskills/skills/resume-bullet-writer")

        XCTAssertTrue(handled)
        XCTAssertEqual(runtime.state.view.currentRoute, .importPage)
        XCTAssertEqual(container.importContainer.screenState.searchText, "paramchoudhary/resumeskills/skills/resume-bullet-writer")
        XCTAssertEqual(container.mainViewModel.importSubmittedQuery, "paramchoudhary/resumeskills/skills/resume-bullet-writer")
    }

    func testDraftsPersistAcrossContainerRecreationThroughDesktopAppState() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let firstContainer = ImportScreenContainer(state: state, mainViewModel: model)
        state.view.currentRoute = .importPage

        let card = ImportViewModel.card(
            from: makeItem(
                id: "anthropics-skills",
                title: "Anthropic Skills",
                locator: "anthropic/skills"
            ),
            locale: Locale(identifier: "en")
        )

        firstContainer.setSkill("browse", enabled: false, for: card)
        firstContainer.setTarget("claude-code", enabled: true, for: card)

        let secondContainer = ImportScreenContainer(state: state, mainViewModel: model)

        XCTAssertEqual(
            secondContainer.draft(for: card),
            ImportDraftState(
                selectedSkills: [],
                enabledTargetIds: ["claude-code"]
            )
        )
    }

    func testDraftDefaultsRespectSelectedByDefaultTargets() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "local-scan",
            title: "Local Scan",
            locator: "file:///Users/Vint/skills",
            canonicalRepo: "local-scan",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "Local scan",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [
                .init(id: "claude-code", selectedByDefault: true, isLocked: true),
                .init(id: "cursor", selectedByDefault: false),
            ]
        )

        XCTAssertEqual(container.draft(for: card).enabledTargetIds, ["claude-code"])
    }

    func testLockedSourceTargetShowsToastAndDoesNotToggle() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "local-scan",
            title: "Local Scan",
            locator: "file:///Users/Vint/skills",
            canonicalRepo: "local-scan",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "Local scan",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [
                .init(id: "claude-code", selectedByDefault: true, isLocked: true),
                .init(id: "cursor", selectedByDefault: false),
            ]
        )

        container.handleTargetToggle("claude-code", enabled: false, for: card)

        XCTAssertEqual(container.draft(for: card).enabledTargetIds, ["claude-code"])
        XCTAssertEqual(model.toast?.style, .neutral)
        XCTAssertEqual(
            model.toast?.text.resolve(locale: Locale(identifier: "en")),
            "This skill comes from the Claude Code agent path and cannot be deselected."
        )
    }

    func testImportSuccessMarksGroupInstalledImmediately() async {
        let commands = RecordingImportCommandFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            commandFacade: commands
        )
        model.recommendedImportGroups = [
            makeItem(
                id: "owner-repo",
                title: "Owner Repo",
                locator: "owner/repo"
            )
        ]

        await model.importImportGroup(
            groupId: "owner-repo",
            locator: "owner/repo",
            selectedSkills: [.repoPath("browse")],
            enabledTargets: []
        )

        XCTAssertEqual(model.recommendedImportGroups.first?.isInstalledLocally, true)
        XCTAssertNil(model.importingImportGroupId)
    }

    func testSelectedLocalChoiceOverridesImportLocatorAndSelectedSkills() async {
        let state = DesktopAppState()
        let commands = RecordingImportCommandFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            commandFacade: commands
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "local-skills",
            title: "Local Skills",
            locator: "file:///Users/Vint/skills",
            canonicalRepo: "local-skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @local",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(id: "browse", title: "Browse", summary: "", selectedByDefault: true),
                .init(id: "review", title: "Review", summary: "", selectedByDefault: true),
            ],
            targets: [
                .init(id: "claude-code", selectedByDefault: false)
            ],
            localChoices: [
                LocalImportChoice(
                    id: "choice-a",
                    label: "All",
                    locator: "file:///Users/Vint/skills",
                    selectedSkills: [.repoPath("browse"), .repoPath("review")]
                ),
                LocalImportChoice(
                    id: "choice-b",
                    label: "Browse only",
                    locator: "file:///Users/Vint/skills/browse",
                    selectedSkills: [.repoPath("browse")]
                ),
            ]
        )

        container.setSkill("review", enabled: false, for: card)
        container.setTarget("claude-code", enabled: true, for: card)
        container.setLocalChoice("choice-b", for: card)

        await container.importGroup(card)

        XCTAssertEqual(container.selectedLocalChoice(for: card)?.id, "choice-b")
        XCTAssertEqual(commands.importCalls, [
            .init(
                locator: "file:///Users/Vint/skills/browse",
                selectedSkills: [.repoPath("browse")],
                enabledTargets: ["claude-code"],
                skillSelectionMode: .selected
            )
        ])
    }

    func testImportingSelectedSnapshotSkillUsesPreviewRepoPathSelector() async {
        let state = DesktopAppState()
        let commands = RecordingImportCommandFacade()
        let query = RecordingPreviewQueryFacade(
            previewSkills: [
                [
                    "providerSkillId": "plugins/devops-tools/skills/disk-hygiene",
                    "uiId": "skill_disk_hygiene",
                    "title": "Disk Hygiene",
                    "summary": "",
                    "selector": [
                        "kind": "repoPath",
                        "path": "plugins/devops-tools/skills/disk-hygiene",
                    ],
                    "selectorAliases": [
                        "disk-hygiene",
                        "plugins/devops-tools/skills/disk-hygiene",
                    ],
                ],
                [
                    "providerSkillId": "plugins/devops-tools/skills/session-recovery",
                    "uiId": "skill_session_recovery",
                    "title": "Session Recovery",
                    "summary": "",
                    "selector": [
                        "kind": "repoPath",
                        "path": "plugins/devops-tools/skills/session-recovery",
                    ],
                    "selectorAliases": [
                        "session-recovery",
                        "plugins/devops-tools/skills/session-recovery",
                    ],
                ],
            ]
        )
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: commands
        )
        model.recommendedImportGroups = [
            makeItem(
                id: "terrylica-cc-skills",
                title: "cc-skills",
                locator: "terrylica/cc-skills",
                skills: [
                    ImportGroupSkill(
                        id: "disk-hygiene",
                        title: "Disk Hygiene",
                        summary: "",
                        selectedByDefault: true
                    ),
                    ImportGroupSkill(
                        id: "session-recovery",
                        title: "Session Recovery",
                        summary: "",
                        selectedByDefault: true
                    ),
                ],
                previewPhase: .idle
            )
        ]
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.card(
            from: model.recommendedImportGroups[0],
            locale: Locale(identifier: "en")
        )

        container.setSkill("session-recovery", enabled: false, for: card)
        await container.importGroup(card)

        let previewLocators = await query.recordedPreviewLocators()
        XCTAssertEqual(previewLocators, ["terrylica/cc-skills"])
        XCTAssertEqual(commands.importCalls, [
            .init(
                locator: "terrylica/cc-skills",
                selectedSkills: [
                    ImportSkillSelection(
                        uiId: "skill_disk_hygiene",
                        selector: .repoPath("plugins/devops-tools/skills/disk-hygiene")
                    ),
                ],
                enabledTargets: [],
                skillSelectionMode: .selected
            )
        ])
    }

    func testTogglingPreviewSkillMatchesSelectionAliasesWhenUiIdDiffersFromSkillId() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let diskSelection = ImportSkillSelection(
            uiId: "skill_disk_hygiene",
            selector: .repoPath("plugins/devops-tools/skills/disk-hygiene")
        )
        let sessionSelection = ImportSkillSelection(
            uiId: "skill_session_recovery",
            selector: .repoPath("plugins/devops-tools/skills/session-recovery")
        )
        let card = ImportViewModel.Card(
            id: "terrylica-cc-skills",
            title: "cc-skills",
            locator: "terrylica/cc-skills",
            canonicalRepo: "terrylica/cc-skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @terrylica",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(
                    id: "plugins/devops-tools/skills/disk-hygiene",
                    title: "Disk Hygiene",
                    summary: "",
                    selectedByDefault: true,
                    selection: diskSelection,
                    selectorAliases: ["disk-hygiene"]
                ),
                .init(
                    id: "plugins/devops-tools/skills/session-recovery",
                    title: "Session Recovery",
                    summary: "",
                    selectedByDefault: true,
                    selection: sessionSelection,
                    selectorAliases: ["session-recovery"]
                ),
            ],
            targets: []
        )

        container.setSkill("plugins/devops-tools/skills/session-recovery", enabled: false, for: card)

        XCTAssertEqual(container.draft(for: card).selectedSkills, [diskSelection])

        container.setSkill("plugins/devops-tools/skills/session-recovery", enabled: true, for: card)

        XCTAssertEqual(container.draft(for: card).selectedSkills, [diskSelection, sessionSelection])
    }

    func testSelectedSkillIdsUseSelectionAliasesWhenUiIdDiffersFromSkillId() {
        let diskSelection = ImportSkillSelection(
            uiId: "skill_disk_hygiene",
            selector: .repoPath("plugins/devops-tools/skills/disk-hygiene")
        )
        let sessionSelection = ImportSkillSelection(
            uiId: "skill_session_recovery",
            selector: .repoPath("plugins/devops-tools/skills/session-recovery")
        )
        let skills: [ImportViewModel.Skill] = [
            .init(
                id: "plugins/devops-tools/skills/disk-hygiene",
                title: "Disk Hygiene",
                summary: "",
                selectedByDefault: true,
                selection: diskSelection,
                selectorAliases: ["disk-hygiene"]
            ),
            .init(
                id: "plugins/devops-tools/skills/session-recovery",
                title: "Session Recovery",
                summary: "",
                selectedByDefault: true,
                selection: sessionSelection,
                selectorAliases: ["session-recovery"]
            ),
        ]
        let draft = ImportDraftState(
            selectedSkills: [diskSelection],
            enabledTargetIds: []
        )

        XCTAssertEqual(
            ImportSkillSelectionResolver.selectedSkillIds(for: skills, draft: draft),
            ["plugins/devops-tools/skills/disk-hygiene"]
        )
    }

    func testSelectedSkillIdsFallsBackToUniqueAliasForRefreshedPreviewSkills() {
        let diskSelection = ImportSkillSelection(
            uiId: "skill_disk_hygiene",
            selector: .repoPath("plugins/devops-tools/skills/disk-hygiene")
        )
        let skills: [ImportViewModel.Skill] = [
            .init(
                id: "plugins/devops-tools/skills/disk-hygiene",
                title: "Disk Hygiene",
                summary: "",
                selectedByDefault: true,
                selection: diskSelection,
                selectorAliases: ["disk-hygiene"]
            )
        ]
        let draft = ImportDraftState(
            selectedSkills: [.repoPath("disk-hygiene")],
            enabledTargetIds: []
        )

        XCTAssertEqual(
            ImportSkillSelectionResolver.selectedSkillIds(for: skills, draft: draft),
            ["plugins/devops-tools/skills/disk-hygiene"]
        )
    }

    func testSelectedSkillIdsDoesNotMatchNonUniqueAliases() {
        let skills: [ImportViewModel.Skill] = [
            .init(
                id: "plugins/a/skills/review",
                title: "Review A",
                summary: "",
                selectedByDefault: true,
                selection: ImportSkillSelection(
                    uiId: "skill_review_a",
                    selector: .repoPath("plugins/a/skills/review")
                ),
                selectorAliases: ["review"]
            ),
            .init(
                id: "plugins/b/skills/review",
                title: "Review B",
                summary: "",
                selectedByDefault: true,
                selection: ImportSkillSelection(
                    uiId: "skill_review_b",
                    selector: .repoPath("plugins/b/skills/review")
                ),
                selectorAliases: ["review"]
            ),
        ]
        let draft = ImportDraftState(
            selectedSkills: [.repoPath("review")],
            enabledTargetIds: []
        )

        XCTAssertEqual(
            ImportSkillSelectionResolver.selectedSkillIds(for: skills, draft: draft),
            []
        )
    }

    func testBackendSelectedLocalChoiceIsUsedBeforeManualSelection() async {
        let state = DesktopAppState()
        let commands = RecordingImportCommandFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            commandFacade: commands
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "local-skills",
            title: "Local Skills",
            locator: "file:///Users/Vint/skills",
            canonicalRepo: "local-skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @local",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(id: "browse", title: "Browse", summary: "", selectedByDefault: true),
                .init(id: "review", title: "Review", summary: "", selectedByDefault: true),
            ],
            targets: [],
            selectedLocalChoiceId: "choice-b",
            localChoices: [
                LocalImportChoice(
                    id: "choice-a",
                    label: "All",
                    locator: "file:///Users/Vint/skills",
                    selectedSkills: [.repoPath("browse"), .repoPath("review")]
                ),
                LocalImportChoice(
                    id: "choice-b",
                    label: "Browse only",
                    locator: "file:///Users/Vint/skills/browse",
                    selectedSkills: [.repoPath("browse")]
                ),
            ]
        )

        await container.importGroup(card)

        XCTAssertEqual(container.selectedLocalChoice(for: card)?.id, "choice-b")
        XCTAssertEqual(commands.importCalls, [
            .init(
                locator: "file:///Users/Vint/skills/browse",
                selectedSkills: [.repoPath("browse")],
                enabledTargets: [],
                skillSelectionMode: .selected
            )
        ])
    }

    func testLocalChoiceConstrainsButDoesNotOverrideDraftSkillSelection() async {
        let state = DesktopAppState()
        let commands = RecordingImportCommandFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            commandFacade: commands
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "origin-skills",
            title: "Origin Skills",
            locator: "paramchoudhary/resumeskills",
            canonicalRepo: "paramchoudhary/resumeskills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @paramchoudhary",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(id: "skills/browse", title: "Browse", summary: "", selectedByDefault: true),
                .init(id: "skills/review", title: "Review", summary: "", selectedByDefault: true),
                .init(id: "skills/managed", title: "Managed", summary: "", selectedByDefault: false),
            ],
            targets: [],
            selectedLocalChoiceId: "origin",
            localChoices: [
                LocalImportChoice(
                    id: "origin",
                    label: "Origin",
                    locator: "https://github.com/paramchoudhary/resumeskills.git",
                    selectedSkills: [.repoPath("skills/browse"), .repoPath("skills/review")]
                ),
            ]
        )

        XCTAssertEqual(container.draft(for: card).selectedSkills.map(\.uiId), ["skills/browse", "skills/review", "skills/managed"])

        container.setSkill("skills/review", enabled: false, for: card)
        await container.importGroup(card)

        XCTAssertEqual(commands.importCalls, [
            .init(
                locator: "https://github.com/paramchoudhary/resumeskills.git",
                selectedSkills: [.repoPath("skills/browse")],
                enabledTargets: []
            )
        ])
    }

    func testImportAllowsExplicitEmptySkillSelection() async {
        let state = DesktopAppState()
        let commands = RecordingImportCommandFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            commandFacade: commands
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "local-changed",
            title: "Local Changed",
            locator: "file:///Users/Vint/skills/changed",
            canonicalRepo: "local:changed",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @local",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(id: "changed", title: "Changed", summary: "", selectedByDefault: false),
            ],
            targets: [],
            localChoices: [
                LocalImportChoice(
                    id: "local",
                    label: "Local",
                    locator: "file:///Users/Vint/skills/changed",
                    selectedSkills: [.repoPath("changed")]
                ),
            ]
        )
        XCTAssertEqual(container.skillSelectionModeForImport(for: card), .all)
        container.toggleAllSkills(for: card)
        let draft = container.draft(for: card)

        XCTAssertEqual(container.skillSelectionModeForImport(for: card), .selected)
        XCTAssertEqual(draft.selectedSkills, [])
        XCTAssertFalse(ImportScreen.importActionIsDisabled(for: card, draft: draft))

        await container.importGroup(card)

        XCTAssertEqual(commands.importCalls, [
            .init(
                locator: "file:///Users/Vint/skills/changed",
                selectedSkills: [],
                enabledTargets: []
            )
        ])
    }

    func testSelectingLocalChoiceMarksImportAsSelectedMode() async {
        let state = DesktopAppState()
        let commands = RecordingImportCommandFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            commandFacade: commands
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "local-skills",
            title: "Local Skills",
            locator: "file:///Users/Vint/skills",
            canonicalRepo: "local-skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @local",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(id: "browse", title: "Browse", summary: "", selectedByDefault: true),
                .init(id: "review", title: "Review", summary: "", selectedByDefault: true),
            ],
            targets: [],
            localChoices: [
                LocalImportChoice(
                    id: "all",
                    label: "All",
                    locator: "file:///Users/Vint/skills",
                    selectedSkills: [.repoPath("browse"), .repoPath("review")]
                ),
                LocalImportChoice(
                    id: "browse-only",
                    label: "Browse only",
                    locator: "file:///Users/Vint/skills/browse",
                    selectedSkills: [.repoPath("browse")]
                ),
            ]
        )

        XCTAssertEqual(container.skillSelectionModeForImport(for: card), .all)

        container.setLocalChoice("browse-only", for: card)

        XCTAssertEqual(container.skillSelectionModeForImport(for: card), .selected)

        await container.importGroup(card)

        XCTAssertEqual(commands.importCalls, [
            .init(
                locator: "file:///Users/Vint/skills/browse",
                selectedSkills: [.repoPath("browse")],
                enabledTargets: [],
                skillSelectionMode: .selected
            )
        ])
    }

    func testImportAllowsChoiceIntersectionWithNoSelectedSkills() async {
        let state = DesktopAppState()
        let commands = RecordingImportCommandFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            commandFacade: commands
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "mixed-origin",
            title: "Mixed Origin",
            locator: "paramchoudhary/resumeskills",
            canonicalRepo: "paramchoudhary/resumeskills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @paramchoudhary",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(id: "skills/new", title: "New", summary: "", selectedByDefault: true),
                .init(id: "skills/managed", title: "Managed", summary: "", selectedByDefault: false),
            ],
            targets: [],
            selectedLocalChoiceId: "origin",
            localChoices: [
                LocalImportChoice(
                    id: "origin",
                    label: "Origin",
                    locator: "https://github.com/paramchoudhary/resumeskills.git",
                    selectedSkills: [.repoPath("skills/new")]
                ),
            ]
        )

        container.setSkill("skills/new", enabled: false, for: card)
        container.setSkill("skills/managed", enabled: true, for: card)

        XCTAssertEqual(container.draft(for: card).selectedSkills.map(\.uiId), ["skills/managed"])
        XCTAssertEqual(container.selectedSkillsForImport(for: card), [])
        XCTAssertFalse(ImportScreen.importActionIsDisabled(for: card))

        await container.importGroup(card)

        XCTAssertEqual(commands.importCalls, [
            .init(
                locator: "https://github.com/paramchoudhary/resumeskills.git",
                selectedSkills: [],
                enabledTargets: []
            )
        ])
    }

    func testChangedLocalChoiceFallsBackToFirstChoiceAndKeepsImportEnabled() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "local-changed",
            title: "Local Changed",
            locator: "file:///Users/Vint/skills/writer",
            canonicalRepo: "local:writer",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @local",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(id: "writer", title: "Writer", summary: "", selectedByDefault: true),
            ],
            targets: [],
            localValidationStatus: "changed",
            selectedLocalChoiceId: nil,
            localChoices: [
                LocalImportChoice(
                    id: "local",
                    label: "Local",
                    locator: "file:///Users/Vint/skills/writer",
                    selectedSkills: [.repoPath("writer")]
                ),
            ],
            requiresLocalVariantSelection: false
        )

        XCTAssertEqual(container.selectedLocalChoice(for: card)?.id, "local")
        XCTAssertFalse(ImportScreen.importActionIsDisabled(for: card))
    }

    func testSnapshotProjectsImportBusinessState() {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(
            state: state,
            mainViewModel: model,
            recommendationsProvider: {
                [
                    ImportRecommendationEntry(
                        canonicalRepo: "anthropics/skills",
                        locator: "anthropics/skills",
                        categoryId: "general",
                        primaryTagId: "general",
                        secondaryTagIds: [],
                        descriptionKey: "import.recommendation.description.anthropics_skills",
                        sortOrder: 10
                    )
                ]
            }
        )
        state.view.currentRoute = .importPage

        model.recommendedImportGroups = [
            makeItem(id: "recommended", title: "Recommended", locator: "anthropics/skills")
        ]
        model.searchImportGroups = [
            makeItem(id: "search", title: "Search", locator: "openai/skills")
        ]

        let recommended = container.snapshot(locale: Locale(identifier: "en"))

        XCTAssertEqual(recommended?.submittedQuery, "")
        XCTAssertEqual(recommended?.searchPhase, .idle)
        XCTAssertEqual(recommended?.content.map(\.id), ["recommended"])

        model.importSubmittedQuery = "openai"
        model.importSearchPhase = .loading
        model.importingImportGroupId = "search"

        let searched = container.snapshot(locale: Locale(identifier: "en"))

        XCTAssertEqual(searched?.submittedQuery, "openai")
        XCTAssertEqual(searched?.searchPhase, .loading)
        XCTAssertEqual(searched?.content.map(\.id), ["search"])
        XCTAssertEqual(searched?.importingGroupId, "search")
    }

    func testImportPageModeSwitchesDisplayedGroups() {
        let state = DesktopAppState()
        state.view.currentRoute = .importPage
        let model = MainViewModel(bridgeClient: BridgeClient())
        model.recommendedImportGroups = [
            makeItem(id: "recommended", title: "Recommended", locator: "owner/recommended")
        ]
        model.localImportGroups = [
            ImportGroupItem(
                id: "local",
                title: "Local",
                locator: "/Users/me/local",
                canonicalRepo: "local",
                isInstalledLocally: false,
                aliases: [],
                summary: "",
                starCount: nil,
                totalInstalls: nil,
                skillCount: nil,
                matchedSkillNames: [],
                matchedSkills: [],
                provider: "local",
                localImport: .init(
                    validationStatus: "local-only",
                    selectedChoiceId: "local",
                    choices: [],
                    detectedSkills: []
                ),
                snapshot: nil,
                enrichPhase: .idle,
                previewPhase: .idle,
                skills: [],
                targets: []
            )
        ]
        let container = ImportScreenContainer(
            state: state,
            mainViewModel: model,
            recommendationsProvider: {
                [
                    ImportRecommendationEntry(
                        canonicalRepo: "owner/recommended",
                        locator: "owner/recommended",
                        categoryId: "general",
                        primaryTagId: "general",
                        secondaryTagIds: [],
                        descriptionKey: "import.recommendation.description.anthropics_skills",
                        sortOrder: 10
                    )
                ]
            }
        )

        container.setImportPageMode(.recommended)
        XCTAssertEqual(container.snapshot(locale: Locale(identifier: "en"))?.content.map(\.id), ["recommended"])

        container.setImportPageMode(.localScan)
        XCTAssertEqual(container.snapshot(locale: Locale(identifier: "en"))?.content.map(\.id), ["local"])
    }

    func testImportScreenPrefetchesRemoteCardsNeedingSkillDetails() {
        let cards = [
            ImportViewModel.Card(
                id: "remote-loading",
                title: "Remote Loading",
                locator: "owner/remote-loading",
                canonicalRepo: "owner/remote-loading",
                preparationId: nil,
                preparationStatus: nil,
                isInstalledLocally: false,
                aliases: [],
                summary: "",
                subtitle: "by @owner",
                stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
                skillsLoading: false,
                targetsLoading: false,
                skills: [],
                targets: [],
                recommendationBadgeItems: [],
                recommendationDescription: nil,
                provider: "skills",
                localValidationStatus: nil,
                selectedLocalChoiceId: nil,
                localChoices: [],
                requiresLocalVariantSelection: false,
                needsSkillDetails: true
            ),
            ImportViewModel.Card(
                id: "remote-ready",
                title: "Remote Ready",
                locator: "owner/remote-ready",
                canonicalRepo: "owner/remote-ready",
                preparationId: nil,
                preparationStatus: nil,
                isInstalledLocally: false,
                aliases: [],
                summary: "",
                subtitle: "by @owner",
                stats: .init(skillCount: 1, downloadCount: nil, starCount: nil, githubURL: nil),
                skillsLoading: false,
                targetsLoading: false,
                skills: [
                    .init(id: "browse", title: "Browse", summary: "", selectedByDefault: true)
                ],
                targets: [],
                recommendationBadgeItems: [],
                recommendationDescription: nil,
                provider: "skills",
                localValidationStatus: nil,
                selectedLocalChoiceId: nil,
                localChoices: [],
                requiresLocalVariantSelection: false,
                needsSkillDetails: false
            ),
            ImportViewModel.Card(
                id: "local-loading",
                title: "Local Loading",
                locator: "/Users/me/local",
                canonicalRepo: "local-loading",
                preparationId: nil,
                preparationStatus: nil,
                isInstalledLocally: false,
                aliases: [],
                summary: "",
                subtitle: "Local",
                stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
                skillsLoading: false,
                targetsLoading: false,
                skills: [],
                targets: [],
                recommendationBadgeItems: [],
                recommendationDescription: nil,
                provider: "local",
                localValidationStatus: "local-only",
                selectedLocalChoiceId: nil,
                localChoices: [],
                requiresLocalVariantSelection: false,
                needsSkillDetails: true
            ),
        ]

        XCTAssertEqual(ImportScreen.groupIDsNeedingSkillDetails(for: cards), ["remote-loading"])
        XCTAssertEqual(
            ImportScreen.skillDetailsPrefetchTaskKey(cards: cards, submittedQuery: "browse"),
            "browse|remote-loading"
        )
    }

    func testImportHeaderUsesTwoModesAndOneLocalImportAction() throws {
        let source = try String(
            contentsOfFile: sourceRoot()
                .appendingPathComponent("Sources/DesktopApp/Screens/Home/MainView.swift")
                .path,
            encoding: .utf8
        )

        XCTAssertTrue(source.contains("setImportPageMode(mode)"))
        XCTAssertTrue(source.contains("importModeButton(.recommended, titleKey: \"import.mode.recommended\", icon: .importRecommended)"))
        XCTAssertTrue(source.contains("importModeButton(.localScan, titleKey: \"import.mode.local_scan\", icon: .importLocalScan)"))
        XCTAssertTrue(source.contains("presentImportLocalDirectoryPanel()"))
        XCTAssertTrue(source.contains("actionIcon(.importLocal"))
        XCTAssertTrue(source.contains("import.mode.recommended"))
        XCTAssertTrue(source.contains("import.mode.local_scan"))
        XCTAssertTrue(source.contains("import.local.button"))
    }

    func testImportAndSettingsHeaderActionsShareTopBarWithSettingsButton() throws {
        let source = try String(
            contentsOfFile: sourceRoot()
                .appendingPathComponent("Sources/DesktopApp/Screens/Home/MainView.swift")
                .path,
            encoding: .utf8
        )
        let settingsSource = try String(
            contentsOfFile: sourceRoot()
                .appendingPathComponent("Sources/DesktopApp/Screens/Settings/SettingsView.swift")
                .path,
            encoding: .utf8
        )

        guard
            let importHeaderStart = source.range(of: "} else if isImportPage {"),
            let importHeaderEnd = source.range(of: "\n            } else", range: importHeaderStart.upperBound..<source.endIndex),
            let settingsHeaderStart = source.range(of: "} else if isSettingsPage {"),
            let settingsHeaderEnd = source.range(of: "\n            } else", range: settingsHeaderStart.upperBound..<source.endIndex)
        else {
            XCTFail("Expected import and settings header branches were not found")
            return
        }

        let importHeaderSource = String(source[importHeaderStart.lowerBound..<importHeaderEnd.lowerBound])
        let settingsHeaderSource = String(source[settingsHeaderStart.lowerBound..<settingsHeaderEnd.lowerBound])

        XCTAssertTrue(importHeaderSource.contains("importHeaderActions"))
        XCTAssertTrue(importHeaderSource.contains("settingsButton"))
        XCTAssertTrue(settingsHeaderSource.contains("settingsHeaderActions"))
        XCTAssertTrue(settingsHeaderSource.contains("settingsButton"))
        XCTAssertFalse(settingsSource.contains("headerTrailing: {\n                        addCustomAgentButton\n                    }"))
    }

    func testLoadImportPageSeedsRecommendedContentFromLocalRecommendations() async {
        let recommendations = [
            ImportRecommendationEntry(
                canonicalRepo: "anthropics/skills",
                locator: "anthropics/skills",
                categoryId: "general",
                primaryTagId: "general",
                secondaryTagIds: [],
                descriptionKey: "import.recommendation.description.anthropics_skills",
                sortOrder: 10
            ),
            ImportRecommendationEntry(
                canonicalRepo: "obra/superpowers",
                locator: "obra/superpowers",
                categoryId: "development",
                primaryTagId: "development",
                secondaryTagIds: [],
                descriptionKey: "import.recommendation.description.obra_superpowers",
                sortOrder: 20
            ),
        ]

        let state = DesktopAppState()
        state.view.currentRoute = .importPage
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            recommendationsProvider: { recommendations }
        )
        let container = ImportScreenContainer(
            state: state,
            mainViewModel: model,
            recommendationsProvider: { recommendations }
        )

        await model.loadImportPageIfNeeded()

        XCTAssertEqual(model.importSearchPhase, ImportLoadPhase.ready)
        XCTAssertEqual(model.recommendedImportGroups.map { $0.canonicalRepo }, [
            "anthropics/skills",
            "obra/superpowers",
        ])

        let snapshot = container.snapshot(locale: Locale(identifier: "en"))
        XCTAssertEqual(snapshot?.content.map(\.canonicalRepo), [
            "anthropics/skills",
            "obra/superpowers",
        ])
        XCTAssertEqual(snapshot?.content.first?.recommendationBadgeItems.map(\.id), ["general"])
        XCTAssertEqual(snapshot?.content.last?.recommendationBadgeItems.map(\.id), ["development"])
    }

    func testLoadImportPageIfNeededScansLocalImportGroupsOnlyOnce() async {
        let query = RecordingLocalImportQueryFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query
        )

        await model.loadImportPageIfNeeded()
        await model.loadImportPageIfNeeded()

        XCTAssertEqual(query.scanPaths, [nil])

        await model.loadLocalImportGroups(path: "/Users/Vint/skills")

        XCTAssertEqual(query.scanPaths, [nil, "/Users/Vint/skills"])
    }

    func testImportLocalDirectoryUpdatesSearchTextAndProjectsLocalGroupsInSnapshot() async {
        let state = DesktopAppState()
        state.view.currentRoute = .importPage
        let query = RecordingLocalImportQueryFacade()
        query.localGroups = [
            [
                "id": "local-skills",
                "title": "Local Skills",
                "locator": "file:///Users/Vint/skills",
                "canonicalRepo": "local-skills",
                "provider": "local",
                "localImport": [
                    "validationStatus": "matched",
                    "choices": [
                        [
                            "id": "local",
                            "label": "Local",
                            "locator": "file:///Users/Vint/skills",
                            "selectedSkills": [
                                [
                                    "uiId": "browse",
                                    "selector": [
                                        "kind": "repoPath",
                                        "path": "browse",
                                    ],
                                ],
                            ],
                        ],
                    ],
                ],
            ],
        ]
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)

        await container.importLocalDirectory("/Users/Vint/skills")

        XCTAssertEqual(container.screenState.searchText, "/Users/Vint/skills")
        XCTAssertEqual(query.scanPaths, ["/Users/Vint/skills"])
        XCTAssertEqual(container.importPageMode, .localScan)

        let snapshot = container.snapshot(locale: Locale(identifier: "en"))
        XCTAssertEqual(snapshot?.content.map(\.id), ["local-skills"])
        XCTAssertEqual(snapshot?.content.first?.provider, "local")
    }

    func testImportLocalDirectoryProjectsVersionConflictLocalScanGroupsInSnapshot() async throws {
        let state = DesktopAppState()
        state.view.currentRoute = .importPage
        let query = RecordingLocalImportQueryFacade()
        query.localScanPayloads = [
            [
                "groups": [],
                "localScanGroups": [
                    [
                        "id": "paramchoudhary/resumeskills:skills/resume-review",
                        "title": "Resume Skills",
                        "status": "version-conflict",
                        "sourcePaths": [
                            [
                                "path": "/Users/me/.codex/skills/resume-review",
                                "kind": "target-agent",
                                "contentHash": "hash-codex",
                                "alreadyManaged": false,
                                "target": "codex",
                            ],
                            [
                                "path": "/Users/me/.cursor/skills/resume-review",
                                "kind": "target-agent",
                                "contentHash": "hash-cursor",
                                "alreadyManaged": false,
                                "target": "cursor",
                            ],
                        ],
                        "skills": [
                            [
                                "id": "skills/resume-review",
                                "title": "Resume Review",
                                "status": "version-conflict",
                                "selectionRequired": true,
                                "originSkillId": "skills/resume-review",
                                "variants": [
                                    [
                                        "id": "skills/resume-review:hash-codex",
                                        "path": "/Users/me/.codex/skills/resume-review",
                                        "contentHash": "hash-codex",
                                        "selectedByDefault": false,
                                        "importable": true,
                                    ],
                                    [
                                        "id": "skills/resume-review:hash-cursor",
                                        "path": "/Users/me/.cursor/skills/resume-review",
                                        "contentHash": "hash-cursor",
                                        "selectedByDefault": false,
                                        "importable": true,
                                    ],
                                ],
                            ],
                        ],
                        "importChoices": [],
                        "origin": [
                            "canonicalRepo": "paramchoudhary/resumeskills",
                            "locator": "https://github.com/paramchoudhary/resumeskills.git",
                            "previewStatus": "ready",
                        ],
                    ],
                ],
            ],
        ]
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)

        await container.importLocalDirectory("/Users/me/.codex/skills/resume-review")

        let snapshot = try XCTUnwrap(container.snapshot(locale: Locale(identifier: "en")))
        let card = try XCTUnwrap(snapshot.content.first)

        XCTAssertEqual(card.localValidationStatus, "version-conflict")
        XCTAssertEqual(card.subtitle, "Local scan")
        XCTAssertEqual(card.headerMetaLine, "Source: 2 agent paths")
        XCTAssertEqual(card.targets.map(\.id), model.importPageTargetIds)
        XCTAssertEqual(card.targets.filter(\.selectedByDefault).map(\.id), ["codex", "cursor"])
        XCTAssertEqual(card.targets.filter(\.isLocked).map(\.id), ["codex", "cursor"])
        XCTAssertTrue(card.requiresLocalVariantSelection)
        XCTAssertTrue(ImportScreen.importActionIsDisabled(for: card))
        XCTAssertEqual(
            ImportScreen.importActionTitle(for: card, localized: { key in
                key == "import.local.action.choose_version" ? "Choose Version" : key
            }),
            "Choose Version"
        )
    }

    func testImportLocalDirectoryDoesNotDuplicateAlreadyScannedPath() async {
        let state = DesktopAppState()
        state.view.currentRoute = .importPage
        let query = RecordingLocalImportQueryFacade()
        let payload: [String: Any] = [
            "groups": [
                [
                    "id": "local:writer",
                    "title": "Writer",
                    "locator": "/Users/me/skills/writer",
                    "canonicalRepo": "local:writer",
                    "provider": "local",
                    "localImport": [
                        "validationStatus": "local-only",
                        "selectedChoiceId": "local",
                        "detectedSkills": [
                            [
                                "id": "writer",
                                "title": "Writer",
                                "localPath": "/Users/me/skills/writer",
                                "validationStatus": "local-only",
                            ],
                        ],
                    ],
                ],
            ],
            "localScanGroups": [],
        ]
        query.localScanPayloads = [payload, payload]
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query
        )
        let container = ImportScreenContainer(state: state, mainViewModel: model)

        await container.importLocalDirectory("/Users/me/skills/writer")
        await container.importLocalDirectory("/Users/me/skills/writer")

        XCTAssertEqual(model.localImportGroups.map(\.id), ["local:writer"])
        XCTAssertEqual(query.scanPaths, ["/Users/me/skills/writer", "/Users/me/skills/writer"])
        XCTAssertEqual(model.toast?.style, .neutral)
        XCTAssertEqual(model.toast?.message, "This local skill is already in the scan list.")
    }

    func testHandleImportActionShowsToastWhenRecommendationAlreadyExistsLocally() async {
        let state = DesktopAppState()
        let model = MainViewModel(bridgeClient: BridgeClient())
        let container = ImportScreenContainer(state: state, mainViewModel: model)
        let card = ImportViewModel.Card(
            id: "anthropics-skills",
            title: "Anthropic Skills",
            locator: "anthropics/skills",
            canonicalRepo: "anthropics/skills",
            isInstalledLocally: true,
            aliases: [],
            summary: "",
            subtitle: "by @anthropics",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: []
        )

        await container.handleImportAction(for: card)

        XCTAssertEqual(model.importingImportGroupId, nil)
        XCTAssertEqual(model.toast?.style, .neutral)
        XCTAssertEqual(model.toast?.message, "This group is already available locally.")
    }

    func testHandleImportActionShowsToastForEveryBlockedImportState() async {
        struct Case {
            let card: ImportViewModel.Card
            let importingGroupId: String?
            let expectedMessage: String
        }
        func card(
            id: String,
            locator: String,
            preparationStatus: String? = nil,
            requiresLocalVariantSelection: Bool = false
        ) -> ImportViewModel.Card {
            ImportViewModel.Card(
                id: id,
                title: id,
                locator: locator,
                canonicalRepo: locator,
                preparationStatus: preparationStatus,
                isInstalledLocally: false,
                aliases: [],
                summary: "",
                subtitle: "by @test",
                stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
                skillsLoading: false,
                targetsLoading: false,
                skills: [],
                targets: [],
                requiresLocalVariantSelection: requiresLocalVariantSelection
            )
        }

        let cases = [
            Case(
                card: card(
                    id: "local-conflict",
                    locator: "file:///Users/me/skills",
                    requiresLocalVariantSelection: true
                ),
                importingGroupId: nil,
                expectedMessage: "Choose which local version to import first."
            ),
            Case(
                card: card(
                    id: "preparing",
                    locator: "owner/preparing",
                    preparationStatus: "preparing"
                ),
                importingGroupId: nil,
                expectedMessage: "Preparing this group for import."
            ),
            Case(
                card: card(
                    id: "current",
                    locator: "owner/current"
                ),
                importingGroupId: "current",
                expectedMessage: "This group is already being imported."
            ),
            Case(
                card: card(
                    id: "other",
                    locator: "owner/other"
                ),
                importingGroupId: "current",
                expectedMessage: "Another import is already running."
            ),
        ]

        for testCase in cases {
            let state = DesktopAppState()
            let commands = RecordingImportCommandFacade()
            let model = MainViewModel(
                bridgeClient: BridgeClient(),
                commandFacade: commands
            )
            model.importingImportGroupId = testCase.importingGroupId
            let container = ImportScreenContainer(state: state, mainViewModel: model)

            await container.handleImportAction(for: testCase.card)

            XCTAssertEqual(model.toast?.style, .neutral)
            XCTAssertEqual(model.toast?.message, testCase.expectedMessage)
            XCTAssertEqual(commands.importCalls, [])
            XCTAssertEqual(commands.commitCalls, [])
        }
    }

    func testImportActionIsDisabledWhenCardIsAlreadyInstalledLocally() {
        let installedCard = ImportViewModel.Card(
            id: "anthropics-skills",
            title: "Anthropic Skills",
            locator: "anthropics/skills",
            canonicalRepo: "anthropics/skills",
            isInstalledLocally: true,
            aliases: [],
            summary: "",
            subtitle: "by @anthropics",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: []
        )
        let freshCard = ImportViewModel.Card(
            id: "openai-skills",
            title: "OpenAI Skills",
            locator: "openai/skills",
            canonicalRepo: "openai/skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @openai",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: []
        )
        let conflictCard = ImportViewModel.Card(
            id: "conflict-skills",
            title: "Conflict Skills",
            locator: "file:///Users/Vint/skills",
            canonicalRepo: "conflict-skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @local",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            requiresLocalVariantSelection: true
        )
        let installedConflictCard = ImportViewModel.Card(
            id: "installed-conflict-skills",
            title: "Installed Conflict Skills",
            locator: "file:///Users/Vint/installed-skills",
            canonicalRepo: "installed-conflict-skills",
            isInstalledLocally: true,
            aliases: [],
            summary: "",
            subtitle: "by @local",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            requiresLocalVariantSelection: true
        )

        XCTAssertTrue(ImportScreen.importActionIsDisabled(for: installedCard))
        XCTAssertFalse(ImportScreen.importActionIsDisabled(for: freshCard))
        XCTAssertTrue(ImportScreen.importActionIsDisabled(for: conflictCard))
        XCTAssertTrue(ImportScreen.importActionIsDisabled(for: installedConflictCard))
        XCTAssertEqual(
            ImportScreen.importActionTitle(for: installedCard, localized: { key in key == "group_card.action.installed" ? "Installed" : key }),
            "Installed"
        )
        XCTAssertNil(ImportScreen.importActionTitle(for: freshCard, localized: { $0 }))
        XCTAssertEqual(
            ImportScreen.importActionTitle(for: conflictCard, localized: { key in key == "import.local.action.choose_version" ? "Choose Version" : key }),
            "Choose Version"
        )
        XCTAssertEqual(
            ImportScreen.importActionTitle(for: installedConflictCard, localized: { key in
                switch key {
                case "group_card.action.installed":
                    return "Installed"
                case "import.local.action.choose_version":
                    return "Choose Version"
                default:
                    return key
                }
            }),
            "Installed"
        )
    }

    func testImportActionIsDisabledWhenAnotherImportIsRunning() {
        let card = ImportViewModel.Card(
            id: "openai-skills",
            title: "OpenAI Skills",
            locator: "openai/skills",
            canonicalRepo: "openai/skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @openai",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: []
        )

        XCTAssertFalse(ImportScreen.importActionIsDisabled(for: card))
        XCTAssertTrue(ImportScreen.importActionIsDisabled(for: card, isAnotherImportRunning: true))
    }

    func testImportActionHelpTextUsesActiveImportDisabledReasonOnlyWhenCardHasNoActionTitle() {
        let freshCard = ImportViewModel.Card(
            id: "openai-skills",
            title: "OpenAI Skills",
            locator: "openai/skills",
            canonicalRepo: "openai/skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @openai",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: []
        )
        let installedCard = ImportViewModel.Card(
            id: "anthropics-skills",
            title: "Anthropic Skills",
            locator: "anthropics/skills",
            canonicalRepo: "anthropics/skills",
            isInstalledLocally: true,
            aliases: [],
            summary: "",
            subtitle: "by @anthropics",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: []
        )
        let variantSelectionCard = ImportViewModel.Card(
            id: "local-skills",
            title: "Local Skills",
            locator: "file:///Users/Vint/skills",
            canonicalRepo: "local-skills",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @local",
            stats: .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [],
            targets: [],
            requiresLocalVariantSelection: true
        )
        let localized: (String) -> String = { key in
            switch key {
            case "group_card.action.installed":
                return "Installed"
            case "import.local.action.choose_version":
                return "Choose Version"
            default:
                return key
            }
        }

        XCTAssertEqual(
            ImportScreen.importActionHelpText(
                for: freshCard,
                activeImportDisabledReason: "Another import is already running.",
                localized: localized
            ),
            "Another import is already running."
        )
        XCTAssertEqual(
            ImportScreen.importActionHelpText(
                for: installedCard,
                activeImportDisabledReason: "Another import is already running.",
                localized: localized
            ),
            "Installed"
        )
        XCTAssertEqual(
            ImportScreen.importActionHelpText(
                for: variantSelectionCard,
                activeImportDisabledReason: "Another import is already running.",
                localized: localized
            ),
            "Choose Version"
        )
        XCTAssertNil(ImportScreen.importActionHelpText(for: freshCard, activeImportDisabledReason: nil, localized: localized))
    }

    func testImportScreenPassesActiveImportReasonToSharedGroupCard() throws {
        let source = try String(
            contentsOfFile: sourceRoot()
                .appendingPathComponent("Sources/DesktopApp/Screens/Import/ImportScreen.swift")
                .path,
            encoding: .utf8
        )

        XCTAssertTrue(source.contains("let isAnotherImportRunning = importingGroupId != nil && importingGroupId != card.id"))
        XCTAssertTrue(source.contains("activeImportDisabledReason: isAnotherImportRunning"))
        XCTAssertTrue(source.contains("actionButtonHelpText: Self.importActionHelpText("))
    }

    func testImportSuccessDoesNotWriteDetailRoute() throws {
        let source = try String(
            contentsOfFile: sourceRoot()
                .appendingPathComponent("Sources/DesktopApp/ViewModels/MainViewModel.swift")
                .path,
            encoding: .utf8
        )

        XCTAssertFalse(
            source.contains("currentRoute = .detail(sourceId: sourceId)"),
            "Import success should not open the imported group detail page automatically."
        )
    }

    func testSharedGroupCardUsesActionButtonHelpTextForHelp() throws {
        let source = try String(
            contentsOfFile: sourceRoot()
                .appendingPathComponent("Sources/DesktopApp/Components/GroupCardComponents.swift")
                .path,
            encoding: .utf8
        )

        XCTAssertTrue(source.contains("let actionButtonHelpText: String?"))
        XCTAssertTrue(source.contains("actionButtonHelpText: String? = nil"))
        XCTAssertTrue(source.contains(".help(actionButtonHelpText ?? buttonTitle)"))
    }

    func testImportViewModelFallsBackToVisibleTargetsWhenPreviewTargetsAreUnavailable() {
        let viewModel = ImportViewModel(
            items: [
                ImportGroupItem(
                    id: "recommended",
                    title: "Recommended",
                    locator: "anthropic/skills",
                    canonicalRepo: "anthropic/skills",
                    isInstalledLocally: false,
                    aliases: [],
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
                    previewPhase: .loading,
                    skills: [],
                    targets: []
                )
            ],
            locale: Locale(identifier: "en"),
            fallbackTargetIds: ["claude-code", "cursor"],
            submittedQuery: "recommended"
        )

        XCTAssertEqual(viewModel.content.first?.targets.map(\.id), ["claude-code", "cursor"])
        XCTAssertFalse(viewModel.content.first?.targetsLoading ?? true)
    }

    func testImportScreenUsesUnifiedGridForRecommendationsSearchAndLocalScan() throws {
        let source = try String(
            contentsOfFile: sourceRoot()
                .appendingPathComponent("Sources/DesktopApp/Screens/Import/ImportScreen.swift")
                .path,
            encoding: .utf8
        )

        XCTAssertTrue(source.contains("private func contentBody("))
        XCTAssertTrue(source.contains("cards: [ImportViewModel.Card]"))
        XCTAssertTrue(source.contains("LazyVGrid(columns: gridColumns, spacing: 12)"))
        XCTAssertFalse(source.contains("recommendedContent("))
        XCTAssertFalse(source.contains("sectionTitle("))
        XCTAssertFalse(source.contains("ScrollView(.horizontal, showsIndicators: false)"))
        XCTAssertFalse(source.contains("LazyHStack"))
    }

    func testImportScreenUsesSpinnerForInitialLoadingInsteadOfSkeletonCards() {
        XCTAssertEqual(ImportScreen.loadingPresentationStyle(searchPhase: .loading, cardCount: 0), .spinner)
        XCTAssertEqual(ImportScreen.loadingPresentationStyle(searchPhase: .idle, cardCount: 0), .none)
        XCTAssertEqual(ImportScreen.loadingPresentationStyle(searchPhase: .loading, cardCount: 2), .none)
    }

    func testTopBarSearchVisibilityMatchesHomeAndImportRoutes() {
        XCTAssertTrue(MainView.topBarShowsSearch(for: .home))
        XCTAssertTrue(MainView.topBarShowsSearch(for: .importPage))
        XCTAssertFalse(MainView.topBarShowsSearch(for: .settings))
        XCTAssertFalse(MainView.topBarShowsSearch(for: .detail(sourceId: "alpha")))
    }

    func testHeaderSearchFieldsUseExpandedWidth() {
        XCTAssertEqual(MainView.headerSearchFieldWidth, 384)
        XCTAssertEqual(MainView.headerSearchActionButtonSize, MainView.headerSearchFieldHeight)
    }

    func testImportHeaderSearchWidthShrinksBeforeOverlappingControls() {
        let enLocale = Locale(identifier: "en")
        let wideWidth = MainView.importHeaderSearchWidth(forWindowWidth: 1180, locale: enLocale)
        let narrowWidth = MainView.importHeaderSearchWidth(forWindowWidth: 760, locale: enLocale)

        XCTAssertEqual(wideWidth, MainView.headerSearchFieldWidth)
        XCTAssertLessThan(narrowWidth, MainView.headerSearchFieldWidth)
        XCTAssertGreaterThan(narrowWidth, 0)

        for locale in [
            Locale(identifier: "en"),
            Locale(identifier: "zh-Hans"),
            Locale(identifier: "ja"),
        ] {
            let windowWidth: CGFloat = 760
            let fixedWidth = MainView.fixedImportHeaderControlsWidth(
                forWindowWidth: windowWidth,
                locale: locale,
                includesSearchAction: true
            )
            let searchWidth = MainView.importHeaderSearchWidth(
                forWindowWidth: windowWidth,
                locale: locale,
                includesSearchAction: true
            )
            XCTAssertLessThanOrEqual(fixedWidth + searchWidth, windowWidth, locale.identifier)
            XCTAssertGreaterThan(searchWidth, 0, locale.identifier)
        }
    }

    func testHomeFilterBarsUseFixedLeadingButtonsAndSharedPillMetrics() {
        let zhWidth = MainView.homeLeadingFixedButtonWidth(for: Locale(identifier: "zh-Hans"))
        let enWidth = MainView.homeLeadingFixedButtonWidth(for: Locale(identifier: "en"))
        let jaWidth = MainView.homeLeadingFixedButtonWidth(for: Locale(identifier: "ja"))

        XCTAssertEqual(zhWidth, MainView.homeLeadingFixedButtonWidth(for: Locale(identifier: "zh-Hans")))
        XCTAssertEqual(enWidth, MainView.homeLeadingFixedButtonWidth(for: Locale(identifier: "en")))
        XCTAssertGreaterThan(zhWidth, 0)
        XCTAssertGreaterThan(enWidth, 0)
        XCTAssertGreaterThan(jaWidth, 0)
        XCTAssertGreaterThanOrEqual(jaWidth, enWidth)
        XCTAssertGreaterThanOrEqual(jaWidth, zhWidth)
        XCTAssertEqual(MainView.homeProjectPillHeight, MainView.homeFilterPillHeight)
        XCTAssertEqual(MainView.homeProjectPillCornerRadius, MainView.homeFilterPillCornerRadius)
    }

    func testSelectedProjectScopeUsesIndicatorWithoutLegacySubtitle() {
        XCTAssertTrue(MainView.projectScopeShowsSelectionIndicator(isSelected: true))
        XCTAssertFalse(MainView.projectScopeShowsSelectionIndicator(isSelected: false))
        XCTAssertFalse(MainView.projectScopeShowsLegacySubtitle(isSelected: true))
        XCTAssertFalse(MainView.projectScopeShowsLegacySubtitle(isSelected: false))
    }

    func testLeadingFixedButtonsUseCenteredAlignmentForStableWidth() {
        XCTAssertTrue(MainView.homeLeadingFixedButtonsAreCentered)
    }

    func testSearchPromptHidesOnFocusEvenWhenQueryIsEmpty() {
        XCTAssertTrue(MainView.shouldShowSearchPrompt(query: "", isFocused: false))
        XCTAssertFalse(MainView.shouldShowSearchPrompt(query: "", isFocused: true))
        XCTAssertFalse(MainView.shouldShowSearchPrompt(query: "anthropics", isFocused: false))
    }

    func testSearchFieldDoesNotAutoFocusOnHomeOrImportEntry() {
        XCTAssertFalse(MainView.shouldAutofocusSearchField(for: .home))
        XCTAssertFalse(MainView.shouldAutofocusSearchField(for: .importPage))
        XCTAssertFalse(MainView.shouldAutofocusSearchField(for: .settings))
    }

    func testWindowAppearClearsImplicitSearchFocusForRoutesThatShowSearch() {
        XCTAssertTrue(MainView.shouldClearImplicitSearchFocusOnAppear(for: .home))
        XCTAssertTrue(MainView.shouldClearImplicitSearchFocusOnAppear(for: .importPage))
        XCTAssertFalse(MainView.shouldClearImplicitSearchFocusOnAppear(for: .settings))
        XCTAssertFalse(MainView.shouldClearImplicitSearchFocusOnAppear(for: .detail(sourceId: "alpha")))
    }

    func testImportSearchPromptsExposeFixedInputSegmentAndAccentText() {
        let prompt = MainView.importSearchPrompts(locale: Locale(identifier: "zh-Hans"))[0]

        XCTAssertEqual(prompt.leadingText, "npx skills")
        XCTAssertEqual(prompt.fixedText, " 输入:")
        XCTAssertEqual(prompt.trailingText, " anthropics/skills")
    }

    func testImportSearchPromptsAreLocalizedWhileKeepingProviderKeywordsStable() {
        let enPrompt = MainView.importSearchPrompts(locale: Locale(identifier: "en"))[1]
        let jaPrompt = MainView.importSearchPrompts(locale: Locale(identifier: "ja"))[2]

        XCTAssertEqual(enPrompt.leadingText, "github link")
        XCTAssertEqual(enPrompt.fixedText, " Input:")
        XCTAssertEqual(enPrompt.trailingText, " https://github.com/...")

        XCTAssertEqual(jaPrompt.leadingText, "キーワード")
        XCTAssertEqual(jaPrompt.fixedText, " 入力:")
        XCTAssertEqual(jaPrompt.trailingText, " anthropics")
    }

    func testImportSearchActionStateTracksFocusQueryAndResults() {
        XCTAssertEqual(
            MainView.importSearchActionState(
                isFocused: false,
                query: "",
                searchPhase: .idle,
                resultCount: 0,
                submittedQuery: ""
            ),
            .hidden
        )
        XCTAssertEqual(
            MainView.importSearchActionState(
                isFocused: true,
                query: "",
                searchPhase: .idle,
                resultCount: 0,
                submittedQuery: ""
            ),
            .submit
        )
        XCTAssertEqual(
            MainView.importSearchActionState(
                isFocused: true,
                query: "anthropics",
                searchPhase: .idle,
                resultCount: 0,
                submittedQuery: ""
            ),
            .submit
        )
        XCTAssertEqual(
            MainView.importSearchActionState(
                isFocused: false,
                query: "anthropics",
                searchPhase: .loading,
                resultCount: 0,
                submittedQuery: "anthropics"
            ),
            .loading
        )
        XCTAssertEqual(
            MainView.importSearchActionState(
                isFocused: false,
                query: "anthropics",
                searchPhase: .idle,
                resultCount: 7,
                submittedQuery: "anthropics"
            ),
            .resultCount(7)
        )
    }

    func testImportSearchPromptTextWidthsUseMaxPromptTextInsteadOfFullFieldWidth() {
        let leadingWidth = MainView.importPromptLeadingWidth(for: Locale(identifier: "ja"))
        let trailingWidth = MainView.importPromptTrailingWidth(for: Locale(identifier: "ja"))

        XCTAssertLessThan(leadingWidth, MainView.headerSearchFieldWidth)
        XCTAssertLessThan(trailingWidth, MainView.headerSearchFieldWidth)
        XCTAssertGreaterThan(leadingWidth, 0)
        XCTAssertGreaterThan(trailingWidth, 0)
    }

    func testImportPageBodyOmitsLegacySectionHeader() {
        XCTAssertFalse(ImportScreen.showsResultsHeader(searchPhase: .idle, cardCount: 6))
        XCTAssertFalse(ImportScreen.showsResultsHeader(searchPhase: .loading, cardCount: 0))
    }

    func testPreviewDoesNotStartBackgroundPreparation() async {
        let query = RecordingPreviewQueryFacade(blockPrepareUntilReleased: true)
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query
        )
        model.recommendedImportGroups = [
            makeItem(id: "owner-repo", title: "Owner Repo", locator: "owner/repo")
        ]

        let previewTask = Task {
            await model.previewImportGroupIfNeeded("owner-repo")
        }

        await waitForCondition(timeoutNanoseconds: 500_000_000) {
            model.recommendedImportGroups.first?.previewPhase == .ready
        }

        let previewed = model.recommendedImportGroups.first
        XCTAssertEqual(previewed?.skills.map(\.id), ["browse"])
        XCTAssertNil(previewed?.preparationStatus)
        XCTAssertNil(previewed?.preparationId)
        let prepareLocators = await query.recordedPrepareLocators()
        XCTAssertEqual(prepareLocators, [])
        await previewTask.value
    }

    func testPreviewParsesProviderSkillIdFromBridgeProtocol() async {
        let query = RecordingPreviewQueryFacade(
            previewSkills: [
                [
                    "providerSkillId": "action-browser",
                    "uiId": "skill_action_browser",
                    "title": "浏览器操作",
                    "summary": "",
                    "selector": [
                        "kind": "repoPath",
                        "path": ".",
                    ],
                    "selectorAliases": [
                        "action-browser",
                        ".",
                    ],
                ],
            ]
        )
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query
        )
        model.searchImportGroups = [
            makeItem(
                id: "vintlin-action-browser",
                title: "action-browser",
                locator: "https://github.com/VintLin/action-browser"
            )
        ]
        model.importSubmittedQuery = "VintLin/action-browser"

        await model.previewImportGroupIfNeeded("vintlin-action-browser")

        XCTAssertEqual(model.searchImportGroups.first?.skills.map(\.id), ["action-browser"])
        XCTAssertEqual(model.searchImportGroups.first?.skills.first?.selection, ImportSkillSelection(
            uiId: "skill_action_browser",
            selector: .repoPath(".")
        ))
    }

    func testPreviewRejectsLegacyIdOnlySkillPayload() async {
        let query = RecordingPreviewQueryFacade(
            previewSkills: [
                [
                    "id": "legacy-skill",
                    "uiId": "skill_legacy",
                    "title": "Legacy Skill",
                    "summary": "",
                    "selector": [
                        "kind": "repoPath",
                        "path": "legacy-skill",
                    ],
                    "selectorAliases": [
                        "legacy-skill",
                    ],
                ],
            ]
        )
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query
        )
        model.searchImportGroups = [
            makeItem(id: "legacy-repo", title: "Legacy Repo", locator: "owner/legacy")
        ]
        model.importSubmittedQuery = "owner/legacy"

        await model.previewImportGroupIfNeeded("legacy-repo")

        guard case .failed = model.searchImportGroups.first?.previewPhase else {
            XCTFail("Expected legacy id-only preview skill payload to fail parsing.")
            return
        }
        XCTAssertEqual(model.searchImportGroups.first?.skills.map(\.id), ["browse"])
    }

    func testPreviewRejectsSkillPayloadWithoutSelector() async {
        let query = RecordingPreviewQueryFacade(
            previewSkills: [
                [
                    "providerSkillId": "missing-selector",
                    "uiId": "skill_missing_selector",
                    "title": "Missing Selector",
                    "summary": "",
                    "selectorAliases": [
                        "missing-selector",
                    ],
                ],
            ]
        )
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query
        )
        model.searchImportGroups = [
            makeItem(id: "missing-selector-repo", title: "Missing Selector Repo", locator: "owner/missing-selector")
        ]
        model.importSubmittedQuery = "owner/missing-selector"

        await model.previewImportGroupIfNeeded("missing-selector-repo")

        guard case .failed = model.searchImportGroups.first?.previewPhase else {
            XCTFail("Expected preview skill payload without selector to fail parsing.")
            return
        }
        XCTAssertEqual(model.searchImportGroups.first?.skills.map(\.id), ["browse"])
    }

    func testPrefetchGroupSkillDetailsLimitsPreviewConcurrency() async {
        let query = RecordingPreviewQueryFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query
        )
        let container = ImportScreenContainer(state: DesktopAppState(), mainViewModel: model)
        model.recommendedImportGroups = [
            makeItem(id: "owner/repo-0", title: "Repo 0", locator: "owner/repo-0"),
            makeItem(id: "owner/repo-1", title: "Repo 1", locator: "owner/repo-1"),
            makeItem(id: "owner/repo-2", title: "Repo 2", locator: "owner/repo-2"),
            makeItem(id: "owner/repo-3", title: "Repo 3", locator: "owner/repo-3"),
        ]

        await container.prefetchGroupSkillDetailsIfNeeded([
            "owner/repo-0",
            "owner/repo-1",
            "owner/repo-2",
            "owner/repo-3",
        ])

        let previewLocators = await query.recordedPreviewLocators().sorted()
        let maxConcurrentPreviewCount = await query.recordedMaxConcurrentPreviewCount()

        XCTAssertEqual(previewLocators, [
            "owner/repo-0",
            "owner/repo-1",
            "owner/repo-2",
            "owner/repo-3",
        ])
        XCTAssertLessThanOrEqual(maxConcurrentPreviewCount, 2)
    }

    func testImportActionShowsPreparationStatus() {
        let preparingCard = ImportViewModel.Card(
            id: "preparing",
            title: "Preparing",
            locator: "owner/preparing",
            canonicalRepo: "owner/preparing",
            preparationStatus: "preparing",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @owner",
            stats: .init(skillCount: 1, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(id: "browse", title: "Browse", summary: "", selectedByDefault: true)
            ],
            targets: []
        )
        let failedCard = ImportViewModel.Card(
            id: "failed",
            title: "Failed",
            locator: "owner/failed",
            canonicalRepo: "owner/failed",
            preparationStatus: "failed",
            isInstalledLocally: false,
            aliases: [],
            summary: "",
            subtitle: "by @owner",
            stats: .init(skillCount: 1, downloadCount: nil, starCount: nil, githubURL: nil),
            skillsLoading: false,
            targetsLoading: false,
            skills: [
                .init(id: "browse", title: "Browse", summary: "", selectedByDefault: true)
            ],
            targets: []
        )

        XCTAssertTrue(ImportScreen.importActionIsDisabled(for: preparingCard))
        XCTAssertEqual(
            ImportScreen.importActionTitle(for: preparingCard, localized: { $0 }),
            "import.action.preparing"
        )
        XCTAssertFalse(ImportScreen.importActionIsDisabled(for: failedCard))
        XCTAssertEqual(
            ImportScreen.importActionTitle(for: failedCard, localized: { $0 }),
            "import.action.retry_prepare"
        )
    }

    func testFailedPreparationRetryDoesNotFallBackToDirectImport() async {
        let commands = RecordingImportCommandFacade()
        let query = RecordingPreviewQueryFacade(prepareStatus: "failed")
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: commands
        )
        model.recommendedImportGroups = [
            makeItem(
                id: "owner-repo",
                title: "Owner Repo",
                locator: "owner/repo",
                preparationStatus: "failed"
            )
        ]

        await model.importImportGroup(
            groupId: "owner-repo",
            locator: "owner/repo",
            selectedSkills: [.repoPath("browse")],
            enabledTargets: []
        )

        let prepareLocators = await query.recordedPrepareLocators()
        XCTAssertEqual(prepareLocators, ["owner/repo"])
        XCTAssertEqual(commands.importCalls, [])
        XCTAssertEqual(model.toast?.style, .error)
    }

    func testStalePreparedImportRepreparesAndCommitsAgain() async {
        let commands = RecordingImportCommandFacade()
        commands.commitPayloads = [
            ["status": "failed", "reasonCode": "IMPORT_PREPARATION_STALE", "retryable": true],
            ["status": "ready", "sourceId": "owner-repo"],
        ]
        let query = RecordingPreviewQueryFacade()
        let model = MainViewModel(
            bridgeClient: BridgeClient(),
            queryFacade: query,
            commandFacade: commands
        )
        model.recommendedImportGroups = [
            makeItem(
                id: "owner-repo",
                title: "Owner Repo",
                locator: "owner/repo",
                preparationId: "prep-old",
                preparationStatus: "ready"
            )
        ]

        await model.importImportGroup(
            groupId: "owner-repo",
            locator: "owner/repo",
            selectedSkills: [.repoPath("browse")],
            enabledTargets: []
        )

        let prepareLocators = await query.recordedPrepareLocators()
        XCTAssertEqual(prepareLocators, ["owner/repo"])
        XCTAssertEqual(commands.commitCalls.map(\.preparationId), ["prep-old", "prep-owner-repo"])
        XCTAssertEqual(commands.importCalls, [])
        XCTAssertEqual(model.toast?.style, .success)
    }

    func testImportEmptyAndLoadingStatesUsePlainCenteredPresentation() {
        XCTAssertFalse(ImportScreen.usesChromedEmptyState(searchPhase: .idle, cardCount: 0))
        XCTAssertFalse(ImportScreen.usesChromedEmptyState(searchPhase: .failed(.plain("x")), cardCount: 0))
        XCTAssertFalse(ImportScreen.usesChromedLoadingState(searchPhase: .loading, cardCount: 0))
        XCTAssertTrue(ImportScreen.usesCenteredStandaloneState(searchPhase: .idle, cardCount: 0))
        XCTAssertTrue(ImportScreen.usesCenteredStandaloneState(searchPhase: .loading, cardCount: 0))
        XCTAssertFalse(ImportScreen.usesCenteredStandaloneState(searchPhase: .loading, cardCount: 2))
    }

    private func makeItem(
        id: String,
        title: String,
        locator: String,
        preparationId: String? = nil,
        preparationStatus: String? = nil,
        skills: [ImportGroupSkill]? = nil,
        previewPhase: ImportLoadPhase = .idle
    ) -> ImportGroupItem {
        ImportGroupItem(
            id: id,
            title: title,
            locator: locator,
            canonicalRepo: locator,
            preparationId: preparationId,
            preparationStatus: preparationStatus,
            isInstalledLocally: false,
            aliases: [],
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
            previewPhase: previewPhase,
            skills: skills ?? [
                ImportGroupSkill(
                    id: "browse",
                    title: "Browse",
                    summary: "Browse things.",
                    selectedByDefault: true
                )
            ],
            targets: [
                ImportGroupTarget(
                    id: "claude-code",
                    selectedByDefault: false
                )
            ]
        )
    }

    private func sourceRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func waitForCondition(
        timeoutNanoseconds: UInt64,
        pollIntervalNanoseconds: UInt64 = 20_000_000,
        _ condition: @escaping () -> Bool
    ) async {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutNanoseconds) / 1_000_000_000)
        while Date() < deadline {
            if condition() {
                return
            }
            try? await Task.sleep(nanoseconds: pollIntervalNanoseconds)
        }
        XCTFail("Timed out waiting for condition")
    }
}

private struct RecordedImportCall: Equatable {
    let locator: String
    let selectedSkills: [ImportSkillSelection]
    let enabledTargets: [String]
    let skillSelectionMode: ImportSkillSelectionMode

    init(
        locator: String,
        selectedSkills: [ImportSkillSelection],
        enabledTargets: [String],
        skillSelectionMode: ImportSkillSelectionMode = .selected
    ) {
        self.locator = locator
        self.selectedSkills = selectedSkills
        self.enabledTargets = enabledTargets
        self.skillSelectionMode = skillSelectionMode
    }
}

private struct RecordedCommitCall: Equatable {
    let preparationId: String
    let selectedSkills: [ImportSkillSelection]
    let enabledTargets: [String]
}

private final class RecordingImportCommandFacade: DesktopCommanding, @unchecked Sendable {
    private(set) var importCalls: [RecordedImportCall] = []
    private(set) var commitCalls: [RecordedCommitCall] = []
    var commitPayloads: [[String: Any]] = [["status": "ready", "sourceId": "local-skills"]]

    func saveSettings(customTargets: [[String : String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func importSource(locator: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String]) async throws -> BridgeResponse {
        try await importSource(
            locator: locator,
            selectedSkills: selectedSkills,
            enabledTargets: enabledTargets,
            skillSelectionMode: .selected
        )
    }

    func importSource(
        locator: String,
        selectedSkills: [ImportSkillSelection],
        enabledTargets: [String],
        skillSelectionMode: ImportSkillSelectionMode
    ) async throws -> BridgeResponse {
        importCalls.append(
            RecordedImportCall(
                locator: locator,
                selectedSkills: selectedSkills,
                enabledTargets: enabledTargets,
                skillSelectionMode: skillSelectionMode
            )
        )
        return BridgeResponse(
            protocolVersion: "1",
            requestId: nil,
            command: .importSource,
            ok: true,
            data: AnyCodable(["status": "ready", "sourceId": "local-skills"]),
            warnings: [],
            errors: []
        )
    }

    func commitImportSource(preparationId: String, selectedSkills: [ImportSkillSelection], enabledTargets: [String]) async throws -> BridgeResponse {
        commitCalls.append(
            RecordedCommitCall(
                preparationId: preparationId,
                selectedSkills: selectedSkills,
                enabledTargets: enabledTargets
            )
        )
        let payload = commitPayloads.isEmpty
            ? ["status": "ready", "sourceId": "local-skills"]
            : commitPayloads.removeFirst()
        return BridgeResponse(
            protocolVersion: "1",
            requestId: nil,
            command: .commitImportSource,
            ok: true,
            data: AnyCodable(payload),
            warnings: [],
            errors: []
        )
    }

    func createCollection(displayName: String, skills: [CollectionSkillRef], enabledTargets: [String]) async throws -> BridgeResponse {
        fatalError("unused")
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
        BridgeResponse(
            protocolVersion: "1",
            requestId: nil,
            command: .doctor,
            ok: true,
            data: AnyCodable(["issues": []]),
            warnings: [],
            errors: []
        )
    }
}

private final class RecordingPreviewQueryFacade: DesktopQuerying, @unchecked Sendable {
    private let recorder = PreviewConcurrencyRecorder()
    private let blockPrepareUntilReleased: Bool
    private let prepareStatus: String
    private let previewSkills: [[String: Any]]

    init(
        blockPrepareUntilReleased: Bool = false,
        prepareStatus: String = "ready",
        previewSkills: [[String: Any]] = [
            [
                "providerSkillId": "browse",
                "uiId": "browse",
                "title": "Browse",
                "summary": "",
                "selector": [
                    "kind": "repoPath",
                    "path": "browse",
                ],
                "selectorAliases": [
                    "browse",
                ],
            ],
        ]
    ) {
        self.blockPrepareUntilReleased = blockPrepareUntilReleased
        self.prepareStatus = prepareStatus
        self.previewSkills = previewSkills
    }

    func recordedPreviewLocators() async -> [String] {
        await recorder.recordedPreviewLocators()
    }

    func recordedMaxConcurrentPreviewCount() async -> Int {
        await recorder.recordedMaxConcurrentPreviewCount()
    }

    func recordedPrepareLocators() async -> [String] {
        await recorder.recordedPrepareLocators()
    }

    func releasePrepare() async {
        await recorder.releasePrepare()
    }

    func bootstrap() async throws -> BridgeResponse {
        fatalError("unused")
    }

    func list() async throws -> BridgeResponse {
        BridgeResponse(
            protocolVersion: "1",
            requestId: nil,
            command: .list,
            ok: true,
            data: AnyCodable([
                "summaries": [],
                "pinnedSourceIds": [],
            ]),
            warnings: [],
            errors: []
        )
    }

    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func searchImportGroups(query: String?) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func scanLocalImportGroups(path: String?) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func prepareImportSource(locator: String) async throws -> BridgeResponse {
        await recorder.recordPrepare(locator: locator)
        if blockPrepareUntilReleased {
            await recorder.waitForPrepareRelease()
        }
        return BridgeResponse(
            protocolVersion: "1",
            requestId: nil,
            command: .prepareImportSource,
            ok: true,
            data: AnyCodable([
                "status": prepareStatus,
                "preparationId": "prep-\(locator.replacingOccurrences(of: "/", with: "-"))",
            ]),
            warnings: [],
            errors: []
        )
    }

    func previewImportSource(locator: String) async throws -> BridgeResponse {
        await recorder.begin(locator: locator)
        try await Task.sleep(nanoseconds: 80_000_000)
        await recorder.end()

        return BridgeResponse(
            protocolVersion: "1",
            requestId: nil,
            command: .previewImportSource,
            ok: true,
            data: AnyCodable([
                "status": "ready",
                "locator": locator,
                "skills": previewSkills,
                "targets": [],
                "selectedSkills": [
                    [
                        "uiId": "browse",
                        "selector": [
                            "kind": "repoPath",
                            "path": "browse",
                        ],
                    ],
                ],
                "enabledTargets": [],
            ]),
            warnings: [],
            errors: []
        )
    }
}

private actor PreviewConcurrencyRecorder {
    private var previewLocators: [String] = []
    private var prepareLocators: [String] = []
    private var activePreviewCount = 0
    private var maxConcurrentPreviewCount = 0
    private var prepareReleased = false
    private var prepareContinuations: [CheckedContinuation<Void, Never>] = []

    func begin(locator: String) {
        previewLocators.append(locator)
        activePreviewCount += 1
        maxConcurrentPreviewCount = max(maxConcurrentPreviewCount, activePreviewCount)
    }

    func end() {
        activePreviewCount -= 1
    }

    func recordedPreviewLocators() -> [String] {
        previewLocators
    }

    func recordedMaxConcurrentPreviewCount() -> Int {
        maxConcurrentPreviewCount
    }

    func recordPrepare(locator: String) {
        prepareLocators.append(locator)
    }

    func recordedPrepareLocators() -> [String] {
        prepareLocators
    }

    func waitForPrepareRelease() async {
        if prepareReleased {
            return
        }
        await withCheckedContinuation { continuation in
            prepareContinuations.append(continuation)
        }
    }

    func releasePrepare() {
        prepareReleased = true
        let continuations = prepareContinuations
        prepareContinuations = []
        continuations.forEach { $0.resume() }
    }
}

@MainActor
private final class RecordingLocalImportQueryFacade: DesktopQuerying {
    private(set) var scanPaths: [String?] = []
    var localGroups: [[String: Any]] = []
    var localScanPayloads: [[String: Any]] = []

    func bootstrap() async throws -> BridgeResponse {
        BridgeResponse(
            protocolVersion: "1",
            requestId: nil,
            command: .bootstrap,
            ok: true,
            data: AnyCodable([String: Any]()),
            warnings: [],
            errors: []
        )
    }

    func list() async throws -> BridgeResponse {
        fatalError("unused")
    }

    func inspect(sourceId: String, scope: ProjectScopeSelection) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func searchImportGroups(query: String?) async throws -> BridgeResponse {
        fatalError("unused")
    }

    func scanLocalImportGroups(path: String?) async throws -> BridgeResponse {
        scanPaths.append(path)
        let payload: [String: Any]
        if localScanPayloads.isEmpty {
            payload = ["groups": localGroups]
        } else {
            payload = localScanPayloads.removeFirst()
        }
        return BridgeResponse(
            protocolVersion: "1",
            requestId: nil,
            command: .scanLocalImportGroups,
            ok: true,
            data: AnyCodable(payload),
            warnings: [],
            errors: []
        )
    }

    func previewImportSource(locator: String) async throws -> BridgeResponse {
        fatalError("unused")
    }
}

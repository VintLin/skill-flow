import XCTest

@testable import SkillFlowDesktop

@MainActor
final class ImportViewModelTests: XCTestCase {
    private let locale = Locale(identifier: "en")

    func testContentResolvesToFlatOrderedCardsAndAttachesRecommendationMetadata() {
        let viewModel = ImportViewModel(
            items: [
                makeItem(
                    id: "anthropics-skills",
                    title: "Anthropic Skills",
                    locator: "anthropics/skills",
                    canonicalRepo: "anthropics/skills"
                ),
                makeItem(
                    id: "obra-superpowers",
                    title: "Superpowers",
                    locator: "obra/superpowers",
                    canonicalRepo: "obra/superpowers"
                ),
            ],
            locale: locale,
            submittedQuery: "",
            recommendations: [
                .init(
                    canonicalRepo: "obra/superpowers",
                    locator: "obra/superpowers",
                    categoryId: "development",
                    primaryTagId: "development",
                    secondaryTagIds: ["teamwork", "automation", "ignored"],
                    descriptionKey: "import.recommendation.description.obra_superpowers",
                    sortOrder: 20
                ),
                .init(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: ["design"],
                    descriptionKey: "import.recommendation.description.anthropics_skills",
                    sortOrder: 10
                ),
            ]
        )

        XCTAssertEqual(viewModel.content.map(\.id), ["anthropics-skills", "obra-superpowers"])
        XCTAssertEqual(
            viewModel.content[1].recommendationBadgeItems.map(\.id),
            ["development"]
        )
        XCTAssertEqual(
            viewModel.content[1].recommendationBadgeItems.map(\.title),
            ["Development"]
        )
        XCTAssertEqual(
            viewModel.content[1].recommendationDescription,
            "A development workflow centered on thinking clearly before writing, suited for people who get pulled off track by AI, redo too much work, or feel projects slipping out of control."
        )
    }

    func testContentOrdersRecommendedCardsByRecommendationSortOrder() {
        let viewModel = ImportViewModel(
            items: [
                makeItem(
                    id: "obra-superpowers",
                    title: "Superpowers",
                    locator: "obra/superpowers",
                    canonicalRepo: "obra/superpowers"
                ),
                makeItem(
                    id: "anthropics-skills",
                    title: "Anthropic Skills",
                    locator: "anthropics/skills",
                    canonicalRepo: "anthropics/skills"
                ),
                makeItem(
                    id: "openai-skills",
                    title: "OpenAI Skills",
                    locator: "openai/skills",
                    canonicalRepo: "openai/skills"
                )
            ],
            locale: locale,
            submittedQuery: "",
            recommendations: [
                .init(
                    canonicalRepo: "openai/skills",
                    locator: "openai/skills",
                    categoryId: "automation",
                    primaryTagId: "automation",
                    secondaryTagIds: [],
                    descriptionKey: "import.recommendation.description.openai_skills",
                    sortOrder: 30
                ),
                .init(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: ["design"],
                    descriptionKey: "import.recommendation.description.anthropics_skills",
                    sortOrder: 10
                ),
                .init(
                    canonicalRepo: "obra/superpowers",
                    locator: "obra/superpowers",
                    categoryId: "development",
                    primaryTagId: "development",
                    secondaryTagIds: [],
                    descriptionKey: "import.recommendation.description.obra_superpowers",
                    sortOrder: 20
                )
            ]
        )

        XCTAssertEqual(viewModel.content.map(\.id), ["anthropics-skills", "obra-superpowers", "openai-skills"])
    }

    func testContentKeepsSearchSourceOrderWithoutRecommendationMetadata() {
        let viewModel = ImportViewModel(
            items: [
                makeItem(
                    id: "obra-superpowers",
                    title: "Superpowers",
                    locator: "obra/superpowers",
                    canonicalRepo: "obra/superpowers"
                ),
                makeItem(
                    id: "anthropics-skills",
                    title: "Anthropic Skills",
                    locator: "anthropics/skills",
                    canonicalRepo: "anthropics/skills"
                )
            ],
            locale: locale,
            submittedQuery: "skill",
            recommendations: [
                .init(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: ["design"],
                    descriptionKey: "import.recommendation.description.anthropics_skills",
                    sortOrder: 10
                ),
                .init(
                    canonicalRepo: "obra/superpowers",
                    locator: "obra/superpowers",
                    categoryId: "development",
                    primaryTagId: "development",
                    secondaryTagIds: [],
                    descriptionKey: "import.recommendation.description.obra_superpowers",
                    sortOrder: 1
                )
            ]
        )

        XCTAssertEqual(viewModel.content.map(\.id), ["obra-superpowers", "anthropics-skills"])
        XCTAssertTrue(viewModel.content[0].recommendationBadgeItems.isEmpty)
        XCTAssertNil(viewModel.content[0].recommendationDescription)
    }

    func testContentSkipsItemsWithoutRecommendationConfigWhenShowingRecommendations() {
        let viewModel = ImportViewModel(
            items: [
                makeItem(
                    id: "anthropics-skills",
                    title: "Anthropic Skills",
                    locator: "anthropics/skills",
                    canonicalRepo: "anthropics/skills"
                ),
                makeItem(
                    id: "openai-skills",
                    title: "OpenAI Skills",
                    locator: "openai/skills",
                    canonicalRepo: "openai/skills"
                )
            ],
            locale: locale,
            submittedQuery: "",
            recommendations: [
                .init(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: [],
                    descriptionKey: "import.recommendation.description.anthropics_skills",
                    sortOrder: 10
                )
            ]
        )

        XCTAssertEqual(viewModel.content.map(\.id), ["anthropics-skills"])
    }

    func testContentPlacesLocalImportCardsBeforeRemoteRecommendationsAndPreservesLocalSourceOrder() {
        let viewModel = ImportViewModel(
            items: [
                makeItem(
                    id: "local-skill-b",
                    title: "Local Skill B",
                    locator: "file:///Users/Vint/skills-b",
                    canonicalRepo: "local-skill-b",
                    provider: "local",
                    localImport: LocalImportInfo(
                        validationStatus: "valid",
                        selectedChoiceId: "local-choice-b",
                        choices: [
                            LocalImportChoice(
                                id: "local-choice-b",
                                label: "Local choice B",
                                locator: "file:///Users/Vint/skills-b",
                                selectedSkills: [.repoPath("browse-b")]
                            )
                        ],
                        detectedSkills: []
                    )
                ),
                makeItem(
                    id: "local-skill",
                    title: "Local Skill",
                    locator: "file:///Users/Vint/skills",
                    canonicalRepo: "local-skill",
                    provider: "local",
                    localImport: LocalImportInfo(
                        validationStatus: "valid",
                        selectedChoiceId: "local-choice",
                        choices: [
                            LocalImportChoice(
                                id: "local-choice",
                                label: "Local choice",
                                locator: "file:///Users/Vint/skills",
                                selectedSkills: [.repoPath("browse")]
                            )
                        ],
                        detectedSkills: []
                    )
                ),
                makeItem(
                    id: "anthropics-skills",
                    title: "Anthropic Skills",
                    locator: "anthropics/skills",
                    canonicalRepo: "anthropics/skills"
                ),
            ],
            locale: locale,
            submittedQuery: "",
            recommendations: [
                .init(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: [],
                    descriptionKey: "import.recommendation.description.anthropics_skills",
                    sortOrder: 10
                )
            ]
        )

        XCTAssertEqual(viewModel.content.map(\.id), ["local-skill-b", "local-skill", "anthropics-skills"])
        XCTAssertEqual(viewModel.content[0].provider, "local")
        XCTAssertEqual(viewModel.content[0].localValidationStatus, "valid")
        XCTAssertEqual(viewModel.content[0].localChoices.map(\.id), ["local-choice-b"])
        XCTAssertEqual(viewModel.content[1].provider, "local")
        XCTAssertEqual(viewModel.content[1].localValidationStatus, "valid")
        XCTAssertEqual(viewModel.content[1].localChoices.map(\.id), ["local-choice"])
    }

    func testLocalScanCardShowsLocalScanSubtitleAndLocksSourceTargets() {
        let item = makeItem(
            id: "local-conflict",
            title: "Local Conflict",
            locator: "/Users/me/skills/conflict-a",
            canonicalRepo: "local:conflict",
            provider: "local",
            localImport: .init(
                validationStatus: "version-conflict",
                selectedChoiceId: nil,
                choices: [],
                detectedSkills: [
                    .init(
                        id: "conflict",
                        title: "Conflict",
                        localPath: "/Users/me/skills/conflict-a",
                        discoveredTargets: ["codex"],
                        validationStatus: "version-conflict",
                        originSkillId: nil
                    ),
                    .init(
                        id: "conflict",
                        title: "Conflict",
                        localPath: "/Users/me/skills/conflict-b",
                        discoveredTargets: ["cursor"],
                        validationStatus: "version-conflict",
                        originSkillId: nil
                    ),
                ]
            )
        )

        let card = ImportViewModel.card(from: item, locale: locale)

        XCTAssertEqual(card.localValidationStatus, "version-conflict")
        XCTAssertEqual(card.subtitle, "Local scan")
        XCTAssertEqual(card.headerMetaLine, "Source: 2 agent paths")
        XCTAssertEqual(card.targets.map(\.id), ["codex", "cursor"])
        XCTAssertEqual(card.targets.filter(\.selectedByDefault).map(\.id), ["codex", "cursor"])
        XCTAssertEqual(card.targets.filter(\.isLocked).map(\.id), ["codex", "cursor"])
        XCTAssertTrue(card.requiresLocalVariantSelection)
    }

    func testImportCardTargetsAreLimitedToVisibleFallbackTargets() {
        let item = makeItem(
            targets: [
                ImportGroupTarget(id: "codex", selectedByDefault: true),
                ImportGroupTarget(id: "cursor", selectedByDefault: true),
                ImportGroupTarget(id: "claude-code", selectedByDefault: true),
            ]
        )

        let card = ImportViewModel.card(
            from: item,
            locale: locale,
            targetVisibility: .settingsVisible(["codex", "claude-code"])
        )

        XCTAssertEqual(card.targets.map(\.id), ["codex", "claude-code"])
    }

    func testImportCardTargetsCanBeEmptyWhenNoFallbackTargetsAreVisible() {
        let item = makeItem(
            targets: [
                ImportGroupTarget(id: "codex", selectedByDefault: true),
                ImportGroupTarget(id: "cursor", selectedByDefault: true),
            ]
        )

        let card = ImportViewModel.card(
            from: item,
            locale: locale,
            targetVisibility: .settingsVisible([])
        )

        XCTAssertEqual(card.targets.map(\.id), [])
    }

    func testLocalScanCardIncludesVisibleFallbackTargetsAndHiddenSourceTargets() {
        let item = makeItem(
            provider: "local",
            localImport: .init(
                validationStatus: "changed",
                selectedChoiceId: nil,
                choices: [],
                detectedSkills: [
                    .init(
                        id: "writer",
                        title: "Writer",
                        localPath: "/Users/me/.cursor/skills/writer",
                        discoveredTargets: ["cursor"],
                        validationStatus: "changed",
                        originSkillId: nil
                    ),
                ]
            ),
            targets: [
                ImportGroupTarget(id: "codex", selectedByDefault: true),
                ImportGroupTarget(id: "cursor", selectedByDefault: true),
                ImportGroupTarget(id: "claude-code", selectedByDefault: true),
            ]
        )

        let card = ImportViewModel.card(
            from: item,
            locale: locale,
            targetVisibility: .settingsVisible(["codex"])
        )

        XCTAssertEqual(card.targets.map(\.id), ["codex", "cursor"])
        XCTAssertEqual(card.targets.filter(\.selectedByDefault).map(\.id), ["codex", "cursor"])
        XCTAssertEqual(card.targets.filter(\.isLocked).map(\.id), ["cursor"])
    }

    func testLocalScanCardIncludesSourceTargetsWhenNoFallbackTargetsAreVisible() {
        let item = makeItem(
            provider: "local",
            localImport: .init(
                validationStatus: "changed",
                selectedChoiceId: nil,
                choices: [],
                detectedSkills: [
                    .init(
                        id: "writer",
                        title: "Writer",
                        localPath: "/Users/me/.cursor/skills/writer",
                        discoveredTargets: ["cursor"],
                        validationStatus: "changed",
                        originSkillId: nil
                    ),
                ]
            ),
            targets: [
                ImportGroupTarget(id: "codex", selectedByDefault: true),
                ImportGroupTarget(id: "cursor", selectedByDefault: true),
            ]
        )

        let card = ImportViewModel.card(
            from: item,
            locale: locale,
            targetVisibility: .settingsVisible([])
        )

        XCTAssertEqual(card.targets.map(\.id), ["cursor"])
        XCTAssertEqual(card.targets.filter(\.selectedByDefault).map(\.id), ["cursor"])
        XCTAssertEqual(card.targets.filter(\.isLocked).map(\.id), ["cursor"])
    }

    func testLocalScanCardWithChangedChoiceRemainsImportableWithoutDefaultSelection() {
        let item = makeItem(
            id: "local-changed",
            title: "Local Changed",
            locator: "/Users/me/skills/writer",
            canonicalRepo: "local:writer",
            provider: "local",
            localImport: .init(
                validationStatus: "changed",
                selectedChoiceId: nil,
                choices: [
                    .init(
                        id: "local",
                        label: "Local",
                        locator: "file:///Users/me/skills/writer",
                        selectedSkills: [.repoPath("writer")]
                    ),
                ],
                detectedSkills: [
                    .init(
                        id: "writer",
                        title: "Writer",
                        localPath: "/Users/me/skills/writer",
                        discoveredTargets: ["codex"],
                        validationStatus: "changed",
                        originSkillId: "skills/writer"
                    ),
                ]
            )
        )

        let card = ImportViewModel.card(from: item, locale: locale)

        XCTAssertEqual(card.localValidationStatus, "changed")
        XCTAssertEqual(card.localChoices.map(\.id), ["local"])
        XCTAssertFalse(card.requiresLocalVariantSelection)
        XCTAssertFalse(ImportScreen.importActionIsDisabled(for: card))
    }

    func testContentToleratesDuplicateLocalAndRemoteRecommendationKeys() {
        let viewModel = ImportViewModel(
            items: [
                makeItem(
                    id: "anthropics-skills",
                    title: "Anthropic Skills",
                    locator: "anthropics/skills",
                    canonicalRepo: "anthropics/skills"
                ),
                makeItem(
                    id: "local-anthropics-skills",
                    title: "Local Anthropic Skills",
                    locator: "anthropics/skills",
                    canonicalRepo: "anthropics/skills",
                    provider: "local",
                    localImport: LocalImportInfo(
                        validationStatus: "valid",
                        selectedChoiceId: nil,
                        choices: [],
                        detectedSkills: []
                    )
                ),
            ],
            locale: locale,
            submittedQuery: "",
            recommendations: [
                .init(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: [],
                    descriptionKey: "import.recommendation.description.anthropics_skills",
                    sortOrder: 10
                )
            ]
        )

        XCTAssertEqual(viewModel.content.map(\.id), ["local-anthropics-skills", "anthropics-skills"])
    }

    func testContentPreservesInstalledStateForRecommendedCards() {
        let viewModel = ImportViewModel(
            items: [
                makeItem(
                    id: "anthropics-skills",
                    title: "Anthropic Skills",
                    locator: "anthropics/skills",
                    canonicalRepo: "anthropics/skills",
                    isInstalledLocally: true
                )
            ],
            locale: locale,
            submittedQuery: "",
            recommendations: [
                .init(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: [],
                    descriptionKey: "import.recommendation.description.anthropics_skills",
                    sortOrder: 10
                )
            ]
        )

        XCTAssertEqual(viewModel.content.first?.isInstalledLocally, true)
    }

    func testContentPreservesSkillDetailsNeedForRecommendedCards() {
        let viewModel = ImportViewModel(
            items: [
                makeItem(
                    id: "anthropics-skills",
                    title: "Anthropic Skills",
                    locator: "anthropics/skills",
                    canonicalRepo: "anthropics/skills",
                    previewPhase: .idle
                )
            ],
            locale: locale,
            submittedQuery: "",
            recommendations: [
                .init(
                    canonicalRepo: "anthropics/skills",
                    locator: "anthropics/skills",
                    categoryId: "general",
                    primaryTagId: "general",
                    secondaryTagIds: [],
                    descriptionKey: "import.recommendation.description.anthropics_skills",
                    sortOrder: 10
                )
            ]
        )

        XCTAssertEqual(viewModel.content.first?.needsSkillDetails, true)
    }

    func testSummaryPrefersExplicitSummaryThenSnapshotThenMatchesThenFallbackStates() {
        let explicit = makeItem(
            summary: "Explicit summary",
            matchedSkills: [makeMatchedSkill(title: "browse", installs: 1200)],
            snapshot: makeSnapshot(description: "Snapshot summary"),
            previewPhase: .loading
        )
        XCTAssertEqual(ImportViewModel.card(from: explicit, locale: locale).summary, "Explicit summary")

        let snapshot = makeItem(
            summary: "",
            matchedSkills: [makeMatchedSkill(title: "browse", installs: 1200)],
            snapshot: makeSnapshot(description: "Snapshot summary"),
            previewPhase: .loading
        )
        XCTAssertEqual(ImportViewModel.card(from: snapshot, locale: locale).summary, "Snapshot summary")

        let matchedSkills = makeItem(
            matchedSkills: [
                makeMatchedSkill(title: "browse", installs: 1200),
                makeMatchedSkill(title: "review", installs: nil)
            ]
        )
        XCTAssertEqual(ImportViewModel.card(from: matchedSkills, locale: locale).summary, "browse 1,200, review")

        let matchedNames = makeItem(
            matchedSkillNames: ["browse", "review"]
        )
        XCTAssertEqual(ImportViewModel.card(from: matchedNames, locale: locale).summary, "browse, review")

        let loading = makeItem(previewPhase: .loading)
        XCTAssertEqual(ImportViewModel.card(from: loading, locale: locale).summary, "Loading skills...")

        let failed = makeItem(previewPhase: .failed(.plain("Preview failed")))
        XCTAssertEqual(ImportViewModel.card(from: failed, locale: locale).summary, "Preview failed")

        let fallback = makeItem(canonicalRepo: "anthropics/skills")
        XCTAssertEqual(ImportViewModel.card(from: fallback, locale: locale).summary, "Import from anthropics/skills")
    }

    func testCardStatsPreferSnapshotDataAndExposeGithubLink() {
        let item = makeItem(
            starCount: 15,
            totalInstalls: 25,
            skillCount: 3,
            matchedSkills: [
                makeMatchedSkill(title: "browse", installs: 1200),
                makeMatchedSkill(title: "review", installs: nil)
            ],
            snapshot: makeSnapshot(
                totalInstalls: 2400,
                skillCount: 12,
                repoStars: 800,
                owner: SnapshotOwner(
                    slug: "anthropics",
                    sourceURL: "https://example.com/anthropics",
                    githubURL: "https://github.com/anthropics",
                    sourceCount: 7,
                    skillCount: 42,
                    totalInstalls: 9999
                ),
                trust: SnapshotTrust(
                    official: true,
                    trending: true,
                    hot: false,
                    audited: true
                )
            )
        )

        let card = ImportViewModel.card(from: item, locale: locale)

        XCTAssertEqual(card.stats.skillCount, 12)
        XCTAssertEqual(card.stats.downloadCount, 2400)
        XCTAssertEqual(card.stats.starCount, 800)
        XCTAssertEqual(card.stats.githubURL, "https://github.com/anthropics/skills")
    }

    func testCardLoadingStateOnlyShowsSkillLoadingUntilPreviewDataArrives() {
        let loading = makeItem(previewPhase: .loading, skills: [], targets: [])
        let loadingCard = ImportViewModel.card(from: loading, locale: locale)
        XCTAssertTrue(loadingCard.skillsLoading)
        XCTAssertFalse(loadingCard.targetsLoading)

        let idle = makeItem(previewPhase: .idle, skills: [], targets: [])
        let idleCard = ImportViewModel.card(from: idle, locale: locale)
        XCTAssertFalse(idleCard.skillsLoading)

        let ready = makeItem(
            previewPhase: .ready,
            skills: [
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
        let readyCard = ImportViewModel.card(from: ready, locale: locale)
        XCTAssertFalse(readyCard.skillsLoading)
        XCTAssertFalse(readyCard.targetsLoading)
    }

    func testCardFallsBackToSnapshotSkillsBeforePreviewCompletes() {
        let item = makeItem(
            snapshot: makeSnapshot(
                skills: [
                    SnapshotSkill(
                        skillId: "research",
                        title: "Research",
                        installs: 1200,
                        weeklyInstalls: nil,
                        firstSeen: nil,
                        summary: "Research things.",
                        installedOn: [],
                        audits: nil
                    ),
                    SnapshotSkill(
                        skillId: "debugging",
                        title: "Debugging",
                        installs: 800,
                        weeklyInstalls: nil,
                        firstSeen: nil,
                        summary: "Debug things.",
                        installedOn: [],
                        audits: nil
                    )
                ]
            ),
            previewPhase: .idle,
            skills: []
        )

        let card = ImportViewModel.card(from: item, locale: locale)

        XCTAssertFalse(card.skillsLoading)
        XCTAssertEqual(card.skills.map { $0.id }, ["research", "debugging"])
        XCTAssertEqual(card.skills.map { $0.summary }, ["Research things.", "Debug things."])
    }

    func testCardPromotesMatchedSkillToFrontAndMarksHighlightQuery() {
        let item = makeItem(
            matchedSkillNames: ["browse"],
            previewPhase: .ready,
            skills: [
                ImportGroupSkill(
                    id: "review",
                    title: "Review",
                    summary: "Review things.",
                    selectedByDefault: true
                ),
                ImportGroupSkill(
                    id: "browse",
                    title: "Browse",
                    summary: "Browse things.",
                    selectedByDefault: true
                ),
                ImportGroupSkill(
                    id: "debug",
                    title: "Debug",
                    summary: "Debug things.",
                    selectedByDefault: true
                )
            ]
        )

        let card = ImportViewModel.card(from: item, locale: locale, submittedQuery: "bro")

        XCTAssertEqual(card.skills.map(\.id), ["browse", "review", "debug"])
        XCTAssertEqual(card.skills.first?.highlightQuery, "bro")
        XCTAssertNil(card.skills.dropFirst().first?.highlightQuery)
    }

    func testSubtitleDerivesOwnerFromGitHubAndRepoPatterns() {
        XCTAssertEqual(
            ImportViewModel.card(
                from: makeItem(locator: "https://github.com/anthropic/skills.git"),
                locale: locale
            ).subtitle,
            "by @anthropic"
        )

        XCTAssertEqual(
            ImportViewModel.card(
                from: makeItem(locator: "git@github.com:anthropic/skills.git"),
                locale: locale
            ).subtitle,
            "by @anthropic"
        )

        XCTAssertEqual(
            ImportViewModel.card(
                from: makeItem(locator: "anthropic/skills"),
                locale: locale
            ).subtitle,
            "by @anthropic"
        )

        XCTAssertEqual(
            ImportViewModel.card(
                from: makeItem(locator: "https://example.com/custom-source"),
                locale: locale
            ).subtitle,
            "by @https:"
        )
    }

    private func makeItem(
        id: String = "anthropics-skills",
        title: String = "Anthropic Skills",
        locator: String = "anthropic/skills",
        canonicalRepo: String = "anthropics/skills",
        isInstalledLocally: Bool = false,
        aliases: [String] = [],
        summary: String = "",
        starCount: Int? = nil,
        totalInstalls: Int? = nil,
        skillCount: Int? = nil,
        matchedSkillNames: [String] = [],
        matchedSkills: [ImportMatchedSkill] = [],
        snapshot: SourceSnapshotData? = nil,
        enrichPhase: ImportLoadPhase = .ready,
        previewPhase: ImportLoadPhase = .ready,
        provider: String = "skills",
        localImport: LocalImportInfo? = nil,
        skills: [ImportGroupSkill] = [],
        targets: [ImportGroupTarget] = []
    ) -> ImportGroupItem {
        ImportGroupItem(
            id: id,
            title: title,
            locator: locator,
            canonicalRepo: canonicalRepo,
            isInstalledLocally: isInstalledLocally,
            aliases: aliases,
            summary: summary,
            starCount: starCount,
            totalInstalls: totalInstalls,
            skillCount: skillCount,
            matchedSkillNames: matchedSkillNames,
            matchedSkills: matchedSkills,
            provider: provider,
            localImport: localImport,
            snapshot: snapshot,
            enrichPhase: enrichPhase,
            previewPhase: previewPhase,
            skills: skills,
            targets: targets
        )
    }

    private func makeMatchedSkill(title: String, installs: Int?) -> ImportMatchedSkill {
        ImportMatchedSkill(skillId: title, title: title, installs: installs)
    }

    private func makeSnapshot(
        description: String = "",
        totalInstalls: Int? = nil,
        skillCount: Int? = nil,
        repoStars: Int? = nil,
        skills: [SnapshotSkill] = [],
        owner: SnapshotOwner = SnapshotOwner(
            slug: "anthropics",
            sourceURL: "https://example.com/anthropics",
            githubURL: "https://github.com/anthropics",
            sourceCount: nil,
            skillCount: nil,
            totalInstalls: nil
        ),
        trust: SnapshotTrust? = nil
    ) -> SourceSnapshotData {
        SourceSnapshotData(
            canonicalRepo: "anthropics/skills",
            title: "Anthropic Skills",
            provider: "clawhub",
            sourceURL: "https://example.com/anthropics/skills",
            repoURL: "https://github.com/anthropics/skills",
            repoLabel: "anthropics/skills",
            totalInstalls: totalInstalls,
            skillCount: skillCount,
            repoStars: repoStars,
            forkCount: nil,
            description: description,
            topics: [],
            language: nil,
            defaultBranch: nil,
            pushedAt: nil,
            owner: owner,
            skills: skills,
            trust: trust
        )
    }
}

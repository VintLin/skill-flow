import SwiftUI

struct ImportScreen: View {
    @Environment(\.locale) private var locale

    let container: ImportScreenContainer
    @Bindable var screenState: ImportScreenState
    let gridColumnCount: Int
    let gridFrameWidth: CGFloat
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor

    init(
        container: ImportScreenContainer,
        screenState: ImportScreenState,
        gridColumnCount: Int,
        gridFrameWidth: CGFloat,
        theme: DesktopThemeMode,
        accent: DesktopAccentColor
    ) {
        self.container = container
        self.screenState = screenState
        self.gridColumnCount = gridColumnCount
        self.gridFrameWidth = gridFrameWidth
        self.theme = theme
        self.accent = accent
    }

    var body: some View {
        let snapshot = container.snapshot(locale: locale)
        let displayedCards = snapshot?.content ?? []
        let submittedQuery = snapshot?.submittedQuery ?? ""
        let searchPhase = snapshot?.searchPhase ?? .idle
        let importPhases = snapshot?.importPhases ?? [:]

        return Group {
            if Self.usesCenteredStandaloneState(searchPhase: searchPhase, cardCount: displayedCards.count) {
                centeredStateContent(searchPhase: searchPhase, submittedQuery: submittedQuery)
                    .padding(16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        contentBody(cards: displayedCards, importPhases: importPhases)
                    }
                    .padding(16)
                }
            }
        }
    }

    @ViewBuilder
    private func centeredStateContent(searchPhase: ImportLoadPhase, submittedQuery: String) -> some View {
        if Self.loadingPresentationStyle(searchPhase: searchPhase, cardCount: 0) == .spinner {
            importLoadingIndicator
        } else if case .failed(let message) = searchPhase {
            emptyState(
                title: t("import.failed.title"),
                subtitle: message.resolve(locale: locale),
                chromed: Self.usesChromedEmptyState(searchPhase: searchPhase, cardCount: 0)
            )
        } else {
            emptyState(
                title: t("home.empty.title"),
                subtitle: submittedQuery.isEmpty
                    ? t("import.empty.recommended")
                    : t("import.empty.search"),
                chromed: Self.usesChromedEmptyState(searchPhase: searchPhase, cardCount: 0)
            )
        }
    }

    private var importLoadingIndicator: some View {
        VStack(spacing: 10) {
            ProgressView()
                .controlSize(.regular)
            Text(t("common.loading.groups"))
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, minHeight: 220)
    }

    private var gridColumns: [GridItem] {
        Array(repeating: GridItem(.fixed(304), spacing: 14), count: gridColumnCount)
    }

    @ViewBuilder
    private func contentBody(
        cards: [ImportViewModel.Card],
        importPhases: [String: GroupOperationQueue.Phase]
    ) -> some View {
        HStack {
            Spacer(minLength: 0)
            LazyVGrid(columns: gridColumns, spacing: 12) {
                ForEach(cards) { card in
                    importCard(card, phase: importPhases[card.id])
                        .task(id: Self.skillDetailsPrefetchTaskKey(for: card)) {
                            guard Self.needsSkillDetailsPrefetch(for: card) else {
                                return
                            }
                            await container.prefetchGroupSkillDetailsIfNeeded(card.id)
                        }
                }
            }
            .frame(maxWidth: gridFrameWidth, alignment: .center)
            Spacer(minLength: 0)
        }
    }

    private func importCard(
        _ card: ImportViewModel.Card,
        phase: GroupOperationQueue.Phase?
    ) -> some View {
        let isQueued = phase == .queued
        let isRunning = phase == .running

        return VStack(alignment: .leading, spacing: 8) {
            SharedGroupCard(
                card: importCardModel(for: card),
                theme: theme,
                accent: accent,
                displayMode: displayMode(for: card),
                clickPolicy: .importSearch,
                skillsCollapsed: false,
                isUpdating: isRunning,
                isQueued: isQueued,
                onOpen: nil,
                onUpdate: {},
                onTogglePinned: {},
                onDelete: {},
                onToggleSkill: { skillId, enabled in
                    container.setSkill(skillId, enabled: enabled, for: card)
                },
                onToggleAllSkills: {
                    container.toggleAllSkills(for: card)
                },
                onToggleTarget: { targetId, enabled, _ in
                    container.handleTargetToggle(targetId, enabled: enabled, for: card)
                },
                onToggleAllTargets: {
                    container.toggleAllTargets(for: card)
                },
                actionButtonTitle: Self.importActionTitle(for: card, localized: { key in t(key) }),
                actionButtonHelpText: Self.importActionHelpText(
                    for: card,
                    activeImportDisabledReason: nil,
                    localized: { key in t(key) }
                ),
                actionButtonIcon: ActionIcon.import,
                isActionButtonDisabled: Self.importActionIsDisabled(
                    for: card,
                    isAnotherImportRunning: false
                ),
                onActionButton: {
                    Task {
                        await container.handleImportAction(for: card)
                    }
                },
                groupTagItems: [],
                groupTagSuggestions: [],
                canCreateGroupTag: false,
                canDeleteGroupTags: false,
                onCreateGroupTag: nil,
                onDeleteGroupTag: nil,
                onSelectGroupTag: nil,
                recommendationBadgeItems: card.recommendationBadgeItems,
                recommendationDescription: card.recommendationDescription
            )

            if card.localValidationStatus != nil, !card.localChoices.isEmpty {
                localChoiceControl(for: card)
            }
        }
    }

    private func localChoiceControl(for card: ImportViewModel.Card) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(t(Self.localValidationStatusTextKey(for: card.localValidationStatus)))
                .font(.system(size: 11, weight: .regular))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .fixedSize(horizontal: false, vertical: true)

            Picker("", selection: localChoiceSelection(for: card)) {
                ForEach(card.localChoices) { choice in
                    Text(localChoiceTitle(choice)).tag(choice.id)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
        }
        .padding(.horizontal, 2)
    }

    private func localChoiceSelection(for card: ImportViewModel.Card) -> Binding<String> {
        Binding(
            get: {
                container.selectedLocalChoice(for: card)?.id ?? card.localChoices.first?.id ?? "local"
            },
            set: { choiceId in
                container.setLocalChoice(choiceId, for: card)
            }
        )
    }

    private func localChoiceTitle(_ choice: LocalImportChoice) -> String {
        let key = "import.local.choice.\(choice.id)"
        let localized = t(key)
        return localized == key ? choice.label : localized
    }

    private func displayMode(for card: ImportViewModel.Card) -> GroupCardDisplayMode {
        if !card.recommendationBadgeItems.isEmpty || card.recommendationDescription != nil {
            return .importRecommendation
        }
        return .importSearch
    }

    private func importCardModel(for card: ImportViewModel.Card) -> GroupCardModel {
        let draft = container.draft(for: card)
        let selectedSkillIds = Set(ImportSkillSelectionResolver.selectedSkillIds(for: card.skills, draft: draft))
        let enabledTargetIds = Set(draft.enabledTargetIds)

        return GroupCardModel(
            id: card.id,
            title: card.title,
            byline: card.subtitle,
            headerMetaLine: card.headerMetaLine,
            groupPath: nil,
            sourceKind: "import-preview",
            sourceLocator: card.locator,
            isPinned: false,
            health: "DISCOVER",
            warningCount: 0,
            errorCount: 0,
            skillSelection: importSelectionState(allIds: card.skills.map(\.id), selectedIds: Array(selectedSkillIds)),
            targetSelection: importSelectionState(allIds: card.targets.map(\.id), selectedIds: draft.enabledTargetIds),
            stats: GroupCardStats(
                downloadCount: card.stats.downloadCount,
                starCount: card.stats.starCount,
                githubURL: card.stats.githubURL,
                localPath: nil
            ),
            skillsLoading: card.skillsLoading,
            targetsLoading: card.targetsLoading,
            skills: card.skills.map { skill in
                GroupCardSkill(
                    id: skill.id,
                    label: skill.title,
                    description: skill.summary,
                    isEnabled: selectedSkillIds.contains(skill.id),
                    highlightQuery: skill.highlightQuery
                )
            },
            targets: card.targets.map { target in
                GroupCardTarget(
                    id: target.id,
                    label: targetLabel(target.id),
                    shortLabel: String(targetLabel(target.id).prefix(2)).uppercased(),
                    isEnabled: enabledTargetIds.contains(target.id)
                )
            },
            saveState: SaveState(phase: .idle, detail: nil)
        )
    }

    private func importSelectionState(allIds: [String], selectedIds: [String]) -> SelectionState {
        guard !allIds.isEmpty else { return .empty }
        let selected = Set(selectedIds)
        let selectedCount = allIds.filter { selected.contains($0) }.count

        switch selectedCount {
        case 0:
            return .empty
        case allIds.count:
            return .full
        default:
            return .partial
        }
    }

    static func importActionIsDisabled(
        for card: ImportViewModel.Card,
        draft: ImportDraftState? = nil,
        isAnotherImportRunning: Bool = false
    ) -> Bool {
        // isAnotherImportRunning is ignored: Group Operation Queue allows multi-enqueue.
        _ = isAnotherImportRunning
        return card.isInstalledLocally
            || card.requiresLocalVariantSelection
            || card.preparationStatus == "preparing"
    }

    static func importActionTitle(
        for card: ImportViewModel.Card,
        localized: (String) -> String
    ) -> String? {
        if card.isInstalledLocally {
            return localized("group_card.action.installed")
        }
        if card.requiresLocalVariantSelection {
            return localized("import.local.action.choose_version")
        }
        if card.preparationStatus == "preparing" {
            return localized("import.action.preparing")
        }
        if card.preparationStatus == "failed" || card.preparationStatus == "stale" {
            return localized("import.action.retry_prepare")
        }
        return nil
    }

    static func importActionHelpText(
        for card: ImportViewModel.Card,
        activeImportDisabledReason: String?,
        localized: (String) -> String
    ) -> String? {
        if let actionTitle = importActionTitle(for: card, localized: localized) {
            return actionTitle
        }
        return activeImportDisabledReason
    }

    static func localValidationStatusTextKey(for _: String?) -> String {
        "import.local.status.local_only"
    }

    private func emptyState(title: String, subtitle: String, chromed: Bool = true) -> some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
            Text(subtitle)
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(AppTheme.textMuted(for: theme))
        }
        .frame(maxWidth: .infinity, minHeight: 200)
        .modifier(EmptyStateChrome(theme: theme, enabled: chromed))
    }

    @ViewBuilder
    private func actionIcon(_ icon: ActionIcon, size: CGFloat, foreground: NSColor? = nil) -> some View {
        if let foreground, let image = icon.symbolImage(size: size, foreground: foreground) {
            Image(nsImage: image)
                .renderingMode(.original)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: size, height: size)
        } else if let image = icon.image(size: size) {
            Image(nsImage: image)
                .renderingMode(.template)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: size, height: size)
        } else {
            Color.clear.frame(width: size, height: size)
        }
    }

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }

    private func targetLabel(_ targetId: String) -> String {
        container.targetLabel(for: targetId)
    }
}

extension ImportScreen {
    enum LoadingPresentationStyle: Equatable {
        case none
        case spinner
    }

    static func needsSkillDetailsPrefetch(for card: ImportViewModel.Card) -> Bool {
        card.provider != "local" && card.needsSkillDetails
    }

    static func skillDetailsPrefetchTaskKey(for card: ImportViewModel.Card) -> String {
        "\(card.id)|\(card.locator)|\(needsSkillDetailsPrefetch(for: card))"
    }

    static func loadingPresentationStyle(
        searchPhase: ImportLoadPhase,
        cardCount: Int
    ) -> LoadingPresentationStyle {
        guard case .loading = searchPhase, cardCount == 0 else {
            return .none
        }
        return .spinner
    }

    static func showsResultsHeader(searchPhase: ImportLoadPhase, cardCount: Int) -> Bool {
        false
    }

    static func usesChromedEmptyState(
        searchPhase: ImportLoadPhase,
        cardCount: Int
    ) -> Bool {
        false
    }

    static func usesChromedLoadingState(
        searchPhase: ImportLoadPhase,
        cardCount: Int
    ) -> Bool {
        false
    }

    static func usesCenteredStandaloneState(
        searchPhase: ImportLoadPhase,
        cardCount: Int
    ) -> Bool {
        cardCount == 0
    }
}

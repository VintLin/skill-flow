import SwiftUI

struct ImportScreen: View {
    @Environment(\.locale) private var locale

    private let controlHeight: CGFloat = 34
    private let autoPreviewLimit = 4

    let container: ImportScreenContainer
    @Bindable var viewModel: MainViewModel
    @Bindable var screenState: ImportScreenState
    let gridColumnCount: Int
    let gridFrameWidth: CGFloat
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor

    init(
        container: ImportScreenContainer,
        viewModel: MainViewModel,
        screenState: ImportScreenState,
        gridColumnCount: Int,
        gridFrameWidth: CGFloat,
        theme: DesktopThemeMode,
        accent: DesktopAccentColor
    ) {
        self.container = container
        self.viewModel = viewModel
        self.screenState = screenState
        self.gridColumnCount = gridColumnCount
        self.gridFrameWidth = gridFrameWidth
        self.theme = theme
        self.accent = accent
    }

    var body: some View {
        let importViewModel = container.viewModel(locale: locale)
        let cards = importViewModel?.cards ?? []

        return ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 14) {
                    Text(t("import.page.title"))
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))

                    HStack(spacing: 10) {
                        importSearchField
                        importSearchButton
                    }
                }

                VStack(alignment: .leading, spacing: 12) {
                    sectionHeader(
                        title: container.submittedQuery.isEmpty ? t("import.section.recommended") : t("import.section.search_results"),
                        subtitle: "",
                        badge: "\(cards.count)"
                    )

                    if case .loading = container.searchPhase, cards.isEmpty {
                        importLoadingGrid
                    } else if case .failed(let message) = container.searchPhase, cards.isEmpty {
                        emptyState(
                            title: t("import.failed.title"),
                            subtitle: message.resolve(locale: locale)
                        )
                    } else if cards.isEmpty {
                        emptyState(
                            title: t("home.empty.title"),
                            subtitle: container.submittedQuery.isEmpty
                                ? t("import.empty.recommended")
                                : t("import.empty.search")
                        )
                    } else {
                        HStack {
                            Spacer(minLength: 0)
                            LazyVGrid(columns: gridColumns, spacing: 12) {
                                ForEach(cards) { card in
                                    SharedGroupCard(
                                        card: importCardModel(for: card),
                                        theme: theme,
                                        accent: accent,
                                        displayMode: .importPage,
                                        skillsCollapsed: false,
                                        isUpdating: viewModel.isImportingImportGroup(card.id),
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
                                        onToggleTarget: { targetId, enabled in
                                            container.setTarget(targetId, enabled: enabled, for: card)
                                        },
                                        onToggleAllTargets: {
                                            container.toggleAllTargets(for: card)
                                        },
                                        actionButtonTitle: nil,
                                        actionButtonIcon: ActionIcon.import,
                                        onActionButton: {
                                            let draft = container.draft(for: card)
                                            Task {
                                                await viewModel.importImportGroup(
                                                    groupId: card.id,
                                                    locator: card.locator,
                                                    selectedSkillIds: draft.selectedSkillIds,
                                                    enabledTargets: draft.enabledTargetIds
                                                )
                                            }
                                        }
                                    )
                                }
                            }
                            .task(id: importAutoPreviewTaskKey(cards: cards)) {
                                let previewIds = Array(cards.prefix(autoPreviewLimit).map(\.id))
                                for groupId in previewIds {
                                    await viewModel.previewImportGroupIfNeeded(groupId)
                                }
                            }
                            .frame(maxWidth: gridFrameWidth, alignment: .center)
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
            .padding(16)
        }
    }

    private var importSearchField: some View {
        HStack(spacing: 8) {
            ZStack(alignment: .leading) {
                if screenState.searchText.isEmpty {
                    Text(activeImportSearchPrompt)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(AppTheme.searchPlaceholder(for: theme))
                        .lineLimit(1)
                        .id(activeImportSearchPrompt)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .allowsHitTesting(false)
                }

                TextField("", text: $screenState.searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .onSubmit {
                        Task {
                            await viewModel.submitImportSearch(screenState.searchText)
                        }
                    }
            }
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, minHeight: controlHeight, alignment: .leading)
        .background(AppTheme.headerControlFill(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private var importSearchButton: some View {
        Button {
            Task {
                await viewModel.submitImportSearch(screenState.searchText)
            }
        } label: {
            actionIcon(.search, size: 12)
                .foregroundStyle(AppTheme.pageBackground(for: theme))
                .frame(width: controlHeight, height: controlHeight)
                .background(AppTheme.brand(for: accent, in: theme))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private var importLoadingGrid: some View {
        HStack {
            Spacer(minLength: 0)
            LazyVGrid(columns: gridColumns, spacing: 12) {
                ForEach(0..<4, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 12)
                        .fill(AppTheme.surface(for: theme))
                        .frame(height: 264)
                        .overlay {
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
                        }
                        .overlay(alignment: .topLeading) {
                            VStack(alignment: .leading, spacing: 10) {
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(AppTheme.toolbarButtonBackground(for: theme))
                                    .frame(width: 120, height: 16)
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(AppTheme.toolbarButtonBackground(for: theme))
                                    .frame(width: 160, height: 12)
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(AppTheme.toolbarButtonBackground(for: theme))
                                    .frame(height: 52)
                                Spacer()
                                RoundedRectangle(cornerRadius: 6)
                                    .fill(AppTheme.toolbarButtonBackground(for: theme))
                                    .frame(height: 40)
                            }
                            .padding(14)
                        }
                }
            }
            .frame(maxWidth: gridFrameWidth, alignment: .center)
            Spacer(minLength: 0)
        }
    }

    private var activeImportSearchPrompt: String {
        guard !importSearchPrompts.isEmpty else { return "" }
        return importSearchPrompts[screenState.placeholderIndex % importSearchPrompts.count]
    }

    private var importSearchPrompts: [String] {
        [
            "anthropic/skills",
            "https://github.com/anthropics/skills",
            "https://github.com/anthropics/skills.git",
            "git@github.com:anthropics/skills.git",
        ]
    }

    private var gridColumns: [GridItem] {
        Array(repeating: GridItem(.fixed(304), spacing: 14), count: gridColumnCount)
    }

    private func importAutoPreviewTaskKey(cards: [ImportViewModel.Card]) -> String {
        let prefixIds = cards.prefix(autoPreviewLimit).map(\.id)
        return ([container.submittedQuery] + prefixIds).joined(separator: "|")
    }

    private func importCardModel(for card: ImportViewModel.Card) -> MainViewModel.GroupCardModel {
        let draft = container.draft(for: card)
        let selectedSkillIds = Set(draft.selectedSkillIds)
        let enabledTargetIds = Set(draft.enabledTargetIds)

        return MainViewModel.GroupCardModel(
            id: card.id,
            title: card.title,
            subtitle: card.subtitle,
            metaLine: t("common.meta.from", card.locator),
            isPinned: false,
            health: "DISCOVER",
            warningCount: 0,
            errorCount: 0,
            skillSelection: importSelectionState(allIds: card.skills.map(\.id), selectedIds: draft.selectedSkillIds),
            targetSelection: importSelectionState(allIds: card.targets.map(\.id), selectedIds: draft.enabledTargetIds),
            sourceFacts: card.sourceFacts,
            skills: card.skills.map { skill in
                MainViewModel.GroupCardSkill(
                    id: skill.id,
                    label: skill.title,
                    description: skill.summary,
                    isEnabled: selectedSkillIds.contains(skill.id)
                )
            },
            targets: card.targets.map { target in
                MainViewModel.GroupCardTarget(
                    id: target.id,
                    label: targetLabel(target.id),
                    shortLabel: String(targetLabel(target.id).prefix(2)).uppercased(),
                    isEnabled: enabledTargetIds.contains(target.id)
                )
            },
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
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

    private func sectionHeader(title: String, subtitle: String, badge: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 11, weight: .regular))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                }
            }
            Spacer()
            Text(badge)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .padding(.horizontal, 8)
                .frame(height: 22)
                .background(AppTheme.toolbarButtonBackground(for: theme))
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
        }
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
        }
    }

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }

    private func targetLabel(_ targetId: String) -> String {
        viewModel.visibleTargets.first(where: { $0.id == targetId })?.label ?? targetId
    }
}

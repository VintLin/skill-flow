import SwiftUI

struct MenuBarQuickConfigView: View {
    @Environment(\.locale) private var locale
    @Bindable var viewModel: MainViewModel
    @Bindable var settingsViewModel: SettingsViewModel
    @Bindable var screenState: MenuBarScreenState
    let groupTagController: GroupTagController

    let navigation: DesktopAppContainer.RouteNavigation
    let openMainWindow: () -> Void

    @State private var hoveredGroupId: String?
    @State private var hoverExpandTask: Task<Void, Never>?

    private let hoverExpandDelay: Duration = .milliseconds(500)
    private var theme: DesktopThemeMode {
        settingsViewModel.currentThemeMode
    }

    private var accent: DesktopAccentColor {
        settingsViewModel.currentAccent
    }

    private let topBarHeight: CGFloat = MainView.headerSearchFieldHeight + 10
    private let footerHeight: CGFloat = 30
    private let menuListMinHeight: CGFloat = 360
    private let menuListMaxHeight: CGFloat = 440
    private let topBarControlCornerRadius: CGFloat = 8

    private var cardDisplayMode: GroupCardDisplayMode {
        MainView.groupCardDisplayMode(for: settingsViewModel.currentMenuCardDensity)
    }

    private var menuUsesCompactDensity: Bool {
        settingsViewModel.currentMenuCardDensity == .compact
    }

    var body: some View {
        ZStack {
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(groupCards) { card in
                        SharedGroupCard(
                            card: card,
                            theme: theme,
                            accent: accent,
                            displayMode: cardDisplayMode,
                            skillsCollapsed: menuUsesCompactDensity && hoveredGroupId != card.id,
                            isUpdating: viewModel.isUpdatingSource(card.id),
                            onOpen: nil,
                            onUpdate: {
                                Task { await viewModel.updateSource(card.id) }
                            },
                            onTogglePinned: {
                                Task { await viewModel.togglePinned(sourceId: card.id) }
                            },
                            onDelete: {
                                Task { await viewModel.deleteSource(sourceId: card.id) }
                            },
                            onToggleSkill: { skillId, enabled in
                                Task { await viewModel.setSkillEnabled(skillId, enabled: enabled, sourceId: card.id) }
                            },
                            onToggleAllSkills: {
                                Task { await viewModel.toggleAllSkills(sourceId: card.id) }
                            },
                            onToggleTarget: { targetId, enabled in
                                Task { await viewModel.setTargetEnabled(targetId, enabled: enabled, sourceId: card.id) }
                            },
                            onToggleAllTargets: {
                                Task { await viewModel.toggleAllTargets(sourceId: card.id) }
                            },
                            groupTagItems: groupTagController.resolvedTags(forSourceId: card.id, locale: locale),
                            groupTagSuggestions: [],
                            onCreateGroupTag: nil
                        )
                        .onHover { isHovering in
                            guard menuUsesCompactDensity else { return }
                            if isHovering {
                                scheduleHoverExpansion(for: card.id)
                            } else {
                                cancelHoverExpansion(for: card.id)
                            }
                        }
                    }
                }
                .padding(.horizontal, 8)
                .padding(.top, topBarHeight + 10)
                .padding(.bottom, footerHeight + 10)
            }
            .scrollIndicators(.never)
            .frame(minHeight: menuListMinHeight, maxHeight: menuListMaxHeight)
            .scrollClipDisabled()

            VStack(spacing: 0) {
                topBar
                Spacer(minLength: 0)
                actionBar
            }
        }
        .frame(width: 360)
        .background(menuBackground)
        .onDisappear(perform: resetTransientState)
    }

    private var topBar: some View {
        HStack(spacing: 6) {
            HStack {
                actionIcon(.search, size: 11)
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                ZStack(alignment: .leading) {
                    if screenState.searchQuery.isEmpty {
                        Text(t("menu.placeholder.search_group_source"))
                            .font(.system(size: 12, weight: .regular))
                            .foregroundStyle(AppTheme.textMuted(for: theme))
                            .textCase(.uppercase)
                            .allowsHitTesting(false)
                    }

                    TextField("", text: $screenState.searchQuery)
                        .textFieldStyle(.plain)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                        .textCase(.uppercase)
                        .disableAutocorrection(true)
                }
            }
            .padding(.horizontal, 12)
            .frame(height: MainView.headerSearchFieldHeight)
            .background(AppTheme.headerControlFill(for: theme))
            .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: topBarControlCornerRadius)
                    .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
            }

            Button {
                resetTransientState()
                NSApp.keyWindow?.close()
            } label: {
                actionIcon(.close, size: 10)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .buttonStyle(.plain)
            .foregroundStyle(AppTheme.textPrimary(for: theme))
            .frame(width: MainView.headerSearchFieldHeight, height: MainView.headerSearchFieldHeight)
            .background(AppTheme.headerControlFill(for: theme))
            .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
            .clipShape(RoundedRectangle(cornerRadius: topBarControlCornerRadius))
            .overlay {
                RoundedRectangle(cornerRadius: topBarControlCornerRadius)
                    .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 6)
        .padding(.bottom, 4)
        .frame(height: topBarHeight)
        .background(menuOverlayBackground)
    }

    private var actionBar: some View {
        HStack(spacing: 8) {
            Button {
                navigation.showImportPage()
                openMainWindow()
            } label: {
                actionIcon(.import, size: 12)
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .frame(width: 22, height: 22)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 0)
            .frame(height: 22)

            Spacer()

            Button {
                navigation.showSettings()
                openMainWindow()
            } label: {
                actionIcon(.settings, size: 12)
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .frame(width: 22, height: 22)
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 0)
            .frame(height: 22)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .frame(height: footerHeight)
        .background(menuOverlayBackground)
    }

    private var menuBackground: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(menuFill)
    }

    private var menuOverlayBackground: some View {
        Rectangle()
            .fill(menuFill)
    }

    private var groupCards: [MainViewModel.GroupCardModel] {
        viewModel.groupCards(matching: screenState.searchQuery)
    }

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }

    private func resetTransientState() {
        hoverExpandTask?.cancel()
        hoverExpandTask = nil
        hoveredGroupId = nil
        screenState.searchQuery = ""
    }

    private func scheduleHoverExpansion(for groupId: String) {
        hoverExpandTask?.cancel()
        hoverExpandTask = Task {
            try? await Task.sleep(for: hoverExpandDelay)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                withAnimation(.easeInOut(duration: 0.18)) {
                    hoveredGroupId = groupId
                }
                hoverExpandTask = nil
            }
        }
    }

    private func cancelHoverExpansion(for groupId: String) {
        hoverExpandTask?.cancel()
        hoverExpandTask = nil
        guard hoveredGroupId == groupId else { return }
        withAnimation(.easeInOut(duration: 0.18)) {
            hoveredGroupId = nil
        }
    }

    private var menuFill: Color {
        AppTheme.pageBackground(for: theme)
    }

    private var controlFill: Color {
        AppTheme.surface(for: theme)
    }

    @ViewBuilder
    private func actionIcon(_ icon: ActionIcon, size: CGFloat) -> some View {
        if let image = icon.image(size: size) {
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
}

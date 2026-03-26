import SwiftUI

struct MenuBarQuickConfigView: View {
    @Bindable var viewModel: MainViewModel

    let openMainWindow: () -> Void

    @State private var showImportInput: Bool = false
    @State private var hoveredGroupId: String?
    @State private var hoverExpandTask: Task<Void, Never>?
    @FocusState private var isImportFieldFocused: Bool
    @AppStorage("desktop.themeMode") private var themeMode = "light"
    @AppStorage("desktop.themeAccent") private var themeAccent = DesktopAccentColor.blue.rawValue
    @AppStorage("desktop.menuCompactCards") private var menuCompactCards = true

    private var theme: DesktopThemeMode {
        isDark ? .dark : .light
    }

    private var accent: DesktopAccentColor {
        DesktopAccentColor(rawValue: themeAccent) ?? .blue
    }

    private var isDark: Bool {
        themeMode == "dark"
    }

    private let topBarHeight: CGFloat = 34
    private let footerHeight: CGFloat = 30
    private let menuListMinHeight: CGFloat = 360
    private let menuListMaxHeight: CGFloat = 440

    private var cardDisplayMode: GroupCardDisplayMode {
        menuCompactCards ? .compactMenu : .standard
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
                            skillsCollapsed: menuCompactCards && hoveredGroupId != card.id,
                            onOpen: nil,
                            onTogglePinned: {
                                viewModel.togglePinned(sourceId: card.id)
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
                            }
                        )
                        .onHover { isHovering in
                            guard menuCompactCards else { return }
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
        .onChange(of: showImportInput) { _, isVisible in
            guard isVisible else {
                isImportFieldFocused = false
                return
            }
            DispatchQueue.main.async {
                isImportFieldFocused = true
            }
        }
    }

    private var topBar: some View {
        HStack(spacing: 6) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                TextField("Search Group / Source", text: $viewModel.searchQuery)
                    .textFieldStyle(.plain)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .disableAutocorrection(true)
            }
            .padding(.horizontal, 10)
            .frame(height: 26)
            .background(controlFill)
            .shadow(color: controlShadow, radius: 4, x: 0, y: 2)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            Button("×") {
                resetTransientState()
                NSApp.keyWindow?.close()
            }
            .buttonStyle(.plain)
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(AppTheme.textPrimary(for: theme))
            .frame(width: 28, height: 28)
            .background(controlFill)
            .shadow(color: controlShadow, radius: 4, x: 0, y: 2)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .frame(height: topBarHeight)
        .background(menuOverlayBackground)
    }

    private var actionBar: some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Button("Import") {
                    withAnimation(.easeOut(duration: 0.16)) {
                        showImportInput.toggle()
                    }
                }
                .buttonStyle(.plain)
                .font(.system(size: 10, weight: .bold))
                .textCase(.uppercase)
                .padding(.horizontal, 0)
                .frame(height: 22)
                .foregroundStyle(showImportInput ? AppTheme.brand(for: accent) : AppTheme.textPrimary(for: theme))

                if showImportInput {
                    TextField("repo / path", text: $viewModel.newSourceLocator)
                        .focused($isImportFieldFocused)
                        .textFieldStyle(.plain)
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .padding(.horizontal, 7)
                        .frame(width: 170, height: 22)
                        .background(controlFill)
                        .shadow(color: controlShadow, radius: 4, x: 0, y: 2)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .onSubmit {
                            Task { await viewModel.addSource() }
                        }
                        .transition(.opacity.combined(with: .move(edge: .trailing)))
                }
            }

            Spacer()

            Button("Details") {
                openMainWindow()
            }
            .buttonStyle(.plain)
            .font(.system(size: 10, weight: .bold))
            .textCase(.uppercase)
            .padding(.horizontal, 0)
            .frame(height: 22)
            .foregroundStyle(AppTheme.textPrimary(for: theme))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .frame(height: footerHeight)
        .background(menuOverlayBackground)
    }

    private var menuBackground: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(menuFill)
            .shadow(color: menuShadow, radius: 19, x: 0, y: 10)
    }

    private var menuOverlayBackground: some View {
        Rectangle()
            .fill(menuFill)
    }

    private var groupCards: [MainViewModel.GroupCardModel] {
        viewModel.groupCards
    }

    private func resetTransientState() {
        hoverExpandTask?.cancel()
        hoverExpandTask = nil
        showImportInput = false
        isImportFieldFocused = false
        hoveredGroupId = nil
    }

    private func scheduleHoverExpansion(for groupId: String) {
        hoverExpandTask?.cancel()
        hoverExpandTask = Task {
            try? await Task.sleep(for: .seconds(2))
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
        AppTheme.groupCardFill(for: theme)
    }

    private var controlFill: Color {
        AppTheme.groupCardFill(for: theme)
    }

    private var controlShadow: Color {
        isDark ? Color.white.opacity(0.16) : Color.black.opacity(0.12)
    }

    private var menuShadow: Color {
        isDark ? Color.white.opacity(0.10) : Color.black.opacity(0.10)
    }
}

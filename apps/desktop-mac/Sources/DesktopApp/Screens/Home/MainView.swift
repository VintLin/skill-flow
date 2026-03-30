import AppKit
import SwiftUI

struct MainView: View {
    struct ImportSearchPrompt: Equatable {
        let leadingText: String
        let fixedText: String
        let trailingText: String

        var id: String {
            "\(leadingText)|\(fixedText)|\(trailingText)"
        }
    }

    private enum SearchFieldFocus: Hashable {
        case home
        case importPage
    }

    enum ImportSearchActionState: Equatable {
        case hidden
        case idle
        case submit
        case loading
        case resultCount(Int)
    }

    struct NavigationActions {
        let showHome: () -> Void
        let showDetail: (String) -> Void
        let showImportPage: () -> Void
        let showSettings: () -> Void
    }

    @Environment(\.locale) private var locale
    private let topBarTitleSize: CGFloat = 17

    @Bindable var viewModel: MainViewModel
    @Bindable var importScreenState: ImportScreenState
    @Bindable var homeViewModel: HomeViewModel
    @Bindable var settingsViewModel: SettingsViewModel
    let navigation: NavigationActions
    let importContainer: ImportScreenContainer
    let detailContainer: DetailScreenContainer

    @State private var updateButtonRotation: Double = 0
    @State private var searchFocusResetToken = 0
    @FocusState private var focusedSearchField: SearchFieldFocus?
    private let importAutoPreviewLimit = 4

    init(
        viewModel: MainViewModel,
        navigation: NavigationActions,
        importScreenState: ImportScreenState,
        importContainer: ImportScreenContainer,
        detailContainer: DetailScreenContainer,
        homeViewModel: HomeViewModel,
        settingsViewModel: SettingsViewModel
    ) {
        self.viewModel = viewModel
        self.navigation = navigation
        self.importScreenState = importScreenState
        self.importContainer = importContainer
        self.detailContainer = detailContainer
        self.homeViewModel = homeViewModel
        self.settingsViewModel = settingsViewModel
    }

    private var theme: DesktopThemeMode {
        settingsViewModel.currentThemeMode
    }

    private var accent: DesktopAccentColor {
        settingsViewModel.currentAccent
    }

    var body: some View {
        GeometryReader { proxy in
            let layout = LayoutMetrics(width: proxy.size.width)

            ZStack {
                AppTheme.pageBackground(for: theme)
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    topBar(layout: layout)
                    pageContent(layout: layout)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                if let toast = viewModel.toast {
                    toastBanner(toast)
                        .padding(.top, 16)
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .onTapGesture {
                            viewModel.dismissToast()
                        }
                }
            }
        }
        .tint(AppTheme.brand(for: accent))
        .onAppear {
            focusedSearchField = nil
            scheduleImplicitSearchFocusReset(for: homeViewModel.currentRoute)
        }
        .onChange(of: homeViewModel.currentRoute) { _, newValue in
            if !Self.shouldAutofocusSearchField(for: newValue) {
                focusedSearchField = nil
            }
            scheduleImplicitSearchFocusReset(for: newValue)
            switch newValue {
            case .importPage:
                Task {
                    await viewModel.loadImportPageIfNeeded()
                }
            default:
                break
            }
        }
        .background(WindowFirstResponderResetter(resetToken: searchFocusResetToken))
        .task(id: viewModel.toast?.id) {
            guard let toast = viewModel.toast, toast.style != .loading else { return }
            let toastId = toast.id
            try? await Task.sleep(for: .seconds(2))
            viewModel.dismissToast(id: toastId)
        }
        .onChange(of: viewModel.isUpdatingCurrentGroup) { _, isUpdating in
            if isUpdating {
                withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) {
                    updateButtonRotation = 360
                }
            } else {
                withAnimation(.easeInOut(duration: 0.28)) {
                    updateButtonRotation = 0
                }
            }
        }
        .task(id: isImportPage) {
            guard isImportPage, localizedImportSearchPrompts.count > 1 else { return }
            while !Task.isCancelled, isImportPage {
                try? await Task.sleep(for: .seconds(2.2))
                guard !Task.isCancelled, isImportPage else { break }
                await MainActor.run {
                    withAnimation(.easeInOut(duration: 0.28)) {
                        importScreenState.placeholderIndex = (importScreenState.placeholderIndex + 1) % localizedImportSearchPrompts.count
                    }
                }
            }
        }
        .task(id: isImportPage) {
            guard isImportPage, localizedImportSearchPrompts.count > 1 else { return }
            while !Task.isCancelled, isImportPage {
                try? await Task.sleep(for: .seconds(2.2))
                guard !Task.isCancelled, isImportPage else { break }
                await MainActor.run {
                    withAnimation(.easeInOut(duration: 0.28)) {
                        importScreenState.placeholderIndex = (importScreenState.placeholderIndex + 1) % localizedImportSearchPrompts.count
                    }
                }
            }
        }
    }

    private func topBar(layout: LayoutMetrics) -> some View {
        Group {
            if isHomePage, layout.isNarrowTopBar {
                VStack(alignment: .leading, spacing: 10) {
                    topBarTitleRow
                    HStack(spacing: 8) {
                        searchField
                        importButton
                        homeUpdateButton
                        settingsButton
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(AppTheme.headerBackground(for: theme))
            } else if isHomePage {
                HStack(spacing: 12) {
                    topBarTitleRow
                        .frame(width: Self.headerLeadingWidth, alignment: .leading)
                    searchField
                    Spacer(minLength: 0)
                    importButton
                    homeUpdateButton
                    settingsButton
                }
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(AppTheme.headerBackground(for: theme))
            } else if isImportPage {
                HStack(spacing: 12) {
                    topBarTitleRow
                        .frame(width: Self.headerLeadingWidth, alignment: .leading)
                    importSearchField
                    if importSearchActionState != .hidden {
                        importSearchActionButton
                            .transition(.opacity.combined(with: .scale(scale: 0.92)))
                    }
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(AppTheme.headerBackground(for: theme))
            } else {
                HStack(spacing: 10) {
                    topBarTitleRow
                        .frame(width: Self.headerLeadingWidth, alignment: .leading)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(AppTheme.headerBackground(for: theme))
            }
        }
    }

    private var topBarTitleRow: some View {
        HStack(spacing: 10) {
            if isHomePage {
                headerLogoRow
            } else {
                toolbarIconButton(.back) { navigation.showHome() }

                Text(currentPageTitle)
                    .font(.system(size: topBarTitleSize, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
            }
        }
    }

    private var isHomePage: Bool {
        homeViewModel.currentRoute == .home
    }

    private var isImportPage: Bool {
        homeViewModel.currentRoute == .importPage
    }

    private var headerLogoRow: some View {
        HStack(spacing: 8) {
            Button {
                openExternalURL("https://github.com/VintLin/skill-flow")
            } label: {
                Group {
                    if let icon = MenuBarIcon.image() {
                        Image(nsImage: icon)
                            .renderingMode(.template)
                            .resizable()
                            .interpolation(.high)
                            .scaledToFit()
                            .frame(width: 30, height: 30)
                            .foregroundStyle(AppTheme.brand(for: accent, in: theme))
                    } else {
                        RoundedRectangle(cornerRadius: 8)
                            .fill(AppTheme.textPrimary(for: theme))
                            .frame(width: 30, height: 30)
                            .overlay(
                                Text("SF")
                                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                    .foregroundStyle(AppTheme.pageBackground(for: theme))
                            )
                    }
                }
            }
            .buttonStyle(.plain)

            Text(t("app.name"))
                .font(.system(size: topBarTitleSize, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            actionIcon(.search, size: 11)
                .foregroundStyle(AppTheme.textMuted(for: theme))
            ZStack(alignment: .leading) {
                if Self.shouldShowSearchPrompt(query: viewModel.searchQuery, isFocused: focusedSearchField == .home) {
                    Text(t("placeholder.home.search_group_author"))
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .textCase(.uppercase)
                        .allowsHitTesting(false)
                }

                TextField("", text: $viewModel.searchQuery)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .textCase(.uppercase)
                    .focused($focusedSearchField, equals: .home)
            }
        }
        .padding(.horizontal, 12)
        .frame(width: Self.headerSearchFieldWidth, height: Self.headerSearchFieldHeight, alignment: .leading)
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private var importSearchField: some View {
        HStack(spacing: 8) {
            actionIcon(.search, size: 11)
                .foregroundStyle(AppTheme.textMuted(for: theme))
            ZStack(alignment: .leading) {
                if Self.shouldShowSearchPrompt(query: importScreenState.searchText, isFocused: focusedSearchField == .importPage) {
                    importSearchPromptLabel(activeImportSearchPrompt)
                        .font(.system(size: 12, weight: .regular, design: .monospaced))
                        .allowsHitTesting(false)
                }

                TextField("", text: $importScreenState.searchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12, weight: .regular, design: .monospaced))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .focused($focusedSearchField, equals: .importPage)
                    .onSubmit {
                        Task {
                            focusedSearchField = nil
                            await importContainer.submitSearch(importScreenState.searchText)
                        }
                    }
            }

        }
        .padding(.horizontal, 12)
        .frame(width: Self.headerSearchFieldWidth, height: Self.headerSearchFieldHeight, alignment: .leading)
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func importSearchPromptLabel(_ prompt: ImportSearchPrompt) -> some View {
        HStack(spacing: 0) {
            ZStack {
                Text(prompt.leadingText)
                    .id("leading-\(prompt.id)")
                    .transition(.asymmetric(
                        insertion: .move(edge: .bottom).combined(with: .opacity),
                        removal: .move(edge: .top).combined(with: .opacity)
                    ))
            }
            .foregroundStyle(AppTheme.importSearchPromptText(for: accent, in: theme))
            .frame(width: Self.importPromptLeadingWidth(for: locale), alignment: .center)
            Text(prompt.fixedText)
                .foregroundStyle(AppTheme.importSearchPromptFixedText(for: theme))
            ZStack {
                Text(prompt.trailingText)
                    .id("trailing-\(prompt.id)")
                    .transition(.asymmetric(
                        insertion: .move(edge: .bottom).combined(with: .opacity),
                        removal: .move(edge: .top).combined(with: .opacity)
                    ))
            }
            .foregroundStyle(AppTheme.importSearchPromptText(for: accent, in: theme))
            .frame(width: Self.importPromptTrailingWidth(for: locale), alignment: .center)
        }
    }

    private var localizedImportSearchPrompts: [ImportSearchPrompt] {
        Self.importSearchPrompts(locale: locale)
    }

    private var activeImportSearchPrompt: ImportSearchPrompt {
        let prompts = localizedImportSearchPrompts
        guard !prompts.isEmpty else {
            return ImportSearchPrompt(leadingText: "", fixedText: "", trailingText: "")
        }
        return prompts[importScreenState.placeholderIndex % prompts.count]
    }

    private var importButton: some View {
        toolbarIconButton(.import) { navigation.showImportPage() }
    }

    @ViewBuilder
    private var importSearchActionButton: some View {
        switch importSearchActionState {
        case .hidden:
            EmptyView()
        case .idle:
            searchActionButtonShell {
                EmptyView()
            }
        case .submit:
            Button {
                Task {
                    focusedSearchField = nil
                    await importContainer.submitSearch(importScreenState.searchText)
                }
            } label: {
                searchActionButtonShell {
                    actionIcon(.searchSubmitEnter, size: 14)
                        .foregroundStyle(AppTheme.brand(for: accent, in: theme))
                }
            }
            .buttonStyle(.plain)
        case .loading:
            searchActionButtonShell {
                ProgressView()
                    .controlSize(.small)
                    .tint(AppTheme.brand(for: accent, in: theme))
            }
        case .resultCount(let count):
            searchActionButtonShell {
                Text("\(count)")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(AppTheme.brand(for: accent, in: theme))
            }
        }
    }

    private func searchActionButtonShell<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .frame(width: Self.headerSearchActionButtonSize, height: Self.headerSearchActionButtonSize)
            .background(AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.28 : 0.18))
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var importSearchActionState: ImportSearchActionState {
        let snapshot = importContainer.snapshot(locale: locale)
        return Self.importSearchActionState(
            isFocused: focusedSearchField == .importPage,
            query: importScreenState.searchText,
            searchPhase: snapshot?.searchPhase ?? .idle,
            resultCount: snapshot?.cards.count ?? 0,
            submittedQuery: snapshot?.submittedQuery ?? ""
        )
    }

    private var homeUpdateButton: some View {
        toolbarIconButton(.update) {
            Task { await viewModel.updateAllGroupsFromHome() }
        }
    }

    private var settingsButton: some View {
        toolbarIconButton(.settings) { navigation.showSettings() }
    }

    private var homeCardDisplayMode: GroupCardDisplayMode {
        Self.groupCardDisplayMode(for: settingsViewModel.currentHomeCardDensity)
    }

    @ViewBuilder
    private func pageContent(layout: LayoutMetrics) -> some View {
        switch homeViewModel.currentRoute {
        case .home:
            configPage(layout: layout)
        case .importPage:
            ImportScreen(
                container: importContainer,
                screenState: importScreenState,
                gridColumnCount: layout.gridColumnCount,
                gridFrameWidth: layout.gridFrameWidth,
                theme: theme,
                accent: accent
            )
        case .settings:
            SettingsScreen(
                viewModel: settingsViewModel,
                theme: theme,
                detectedTargetIds: viewModel.detectedTargetIdsForSettings
            )
        case .detail:
            DetailScreen(
                container: detailContainer,
                sidebarWidth: layout.detailSidebarWidth,
                theme: theme,
                accent: accent,
                updateButtonRotation: updateButtonRotation
            )
        }
    }

    private func configPage(layout: LayoutMetrics) -> some View {
        Group {
            if groupCards.isEmpty {
                gridSection(layout: layout)
                    .padding(.horizontal, 16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            } else {
                ScrollView {
                    gridSection(layout: layout)
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .padding(.bottom, 24)
                }
            }
        }
    }

    private func gridSection(layout: LayoutMetrics) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if groupCards.isEmpty {
                let loading = {
                    switch viewModel.loadState {
                    case .loading:
                        return true
                    default:
                        return false
                    }
                }()
                if loading {
                    loadingState
                } else {
                    emptyState(
                        title: t("home.empty.title"),
                        subtitle: t("home.empty.subtitle"),
                        chromed: false
                    )
                }
            } else {
                HStack {
                    Spacer(minLength: 0)
                    LazyVGrid(columns: gridColumns(for: layout), spacing: 12) {
                        ForEach(groupCards) { card in
                                SharedGroupCard(
                                    card: card,
                                    theme: theme,
                                    accent: accent,
                                    displayMode: homeCardDisplayMode,
                                skillsCollapsed: false,
                                isUpdating: viewModel.isUpdatingSource(card.id),
                                onOpen: {
                                    navigation.showDetail(card.id)
                                },
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
                                }
                            )
                        }
                    }
                    .task(id: groupCards.map(\.id).joined(separator: "|")) {
                        guard homeViewModel.currentRoute == .home else {
                            return
                        }
                        await viewModel.prefetchHomeGroupCardMetadataIfNeeded(groupCards.map(\.id))
                    }
                    .frame(maxWidth: layout.gridFrameWidth, alignment: .center)
                    Spacer(minLength: 0)
                }
            }
        }
    }

    private var loadingState: some View {
        VStack(spacing: 10) {
            ProgressView()
                .controlSize(.regular)
            Text(t("common.loading.groups"))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
        }
        .frame(maxWidth: .infinity, minHeight: 220)
    }

    private var currentPageTitle: String {
        switch homeViewModel.currentRoute {
        case .home:
            return t("page.home.title")
        case .importPage:
            return t("page.import.title")
        case .settings:
            return t("page.settings.title")
        case .detail:
            return t("page.detail.title")
        }
    }

    static func topBarShowsSearch(for route: DesktopRoute) -> Bool {
        switch route {
        case .home, .importPage:
            return true
        case .settings, .detail:
            return false
        }
    }

    static func shouldAutofocusSearchField(for route: DesktopRoute) -> Bool {
        switch route {
        case .home, .importPage, .settings, .detail:
            return false
        }
    }

    static func shouldClearImplicitSearchFocusOnAppear(for route: DesktopRoute) -> Bool {
        topBarShowsSearch(for: route) && !shouldAutofocusSearchField(for: route)
    }

    static let headerSearchFieldWidth: CGFloat = 384
    static let headerSearchFieldHeight: CGFloat = 34
    static let headerSearchActionButtonSize: CGFloat = headerSearchFieldHeight
    static func importPromptLeadingWidth(for locale: Locale) -> CGFloat {
        measuredPromptWidth(for: importSearchPrompts(locale: locale).map(\.leadingText))
    }

    static func importPromptTrailingWidth(for locale: Locale) -> CGFloat {
        measuredPromptWidth(for: importSearchPrompts(locale: locale).map(\.trailingText))
    }

    static func shouldShowSearchPrompt(query: String, isFocused: Bool) -> Bool {
        query.isEmpty && !isFocused
    }

    private func scheduleImplicitSearchFocusReset(for route: DesktopRoute) {
        guard Self.shouldClearImplicitSearchFocusOnAppear(for: route) else {
            return
        }

        searchFocusResetToken += 1
    }

    static func importSearchActionState(
        isFocused: Bool,
        query: String,
        searchPhase: MainViewModel.ImportLoadPhase,
        resultCount: Int,
        submittedQuery: String
    ) -> ImportSearchActionState {
        if case .loading = searchPhase {
            return .loading
        }
        if isFocused {
            return .submit
        }
        if !submittedQuery.isEmpty {
            return .resultCount(resultCount)
        }
        return .hidden
    }

    static func importSearchPrompts(locale: Locale) -> [ImportSearchPrompt] {
        [
            ImportSearchPrompt(
                leadingText: L10n.string("import.search.prompt.1.leading", locale: locale),
                fixedText: L10n.string("import.search.prompt.fixed_input", locale: locale),
                trailingText: L10n.string("import.search.prompt.1.trailing", locale: locale)
            ),
            ImportSearchPrompt(
                leadingText: L10n.string("import.search.prompt.2.leading", locale: locale),
                fixedText: L10n.string("import.search.prompt.fixed_input", locale: locale),
                trailingText: L10n.string("import.search.prompt.2.trailing", locale: locale)
            ),
            ImportSearchPrompt(
                leadingText: L10n.string("import.search.prompt.3.leading", locale: locale),
                fixedText: L10n.string("import.search.prompt.fixed_input", locale: locale),
                trailingText: L10n.string("import.search.prompt.3.trailing", locale: locale)
            ),
        ]
    }

    private static func measuredPromptWidth(for texts: [String]) -> CGFloat {
        let font = NSFont.monospacedSystemFont(ofSize: 12, weight: .regular)
        let measured = texts.map { text in
            ceil((text as NSString).size(withAttributes: [.font: font]).width)
        }
        return (measured.max() ?? 0) + 4
    }

    private func openPath(_ path: String) {
        let url = URL(fileURLWithPath: path)
        NSWorkspace.shared.open(url)
    }

    private func openExternalURL(_ rawValue: String) {
        guard let url = URL(string: rawValue) else {
            return
        }
        NSWorkspace.shared.open(url)
    }

    private func pageSectionCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(16)
            .background(AppTheme.surface(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
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

    private func gridColumns(for layout: LayoutMetrics) -> [GridItem] {
        Array(repeating: GridItem(.fixed(304), spacing: 14), count: layout.gridColumnCount)
    }

    private var groupCards: [MainViewModel.GroupCardModel] {
        viewModel.groupCards
    }

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }

    private func toastBanner(_ toast: MainViewModel.ToastState) -> some View {
        HStack(spacing: 10) {
            if toast.style == .loading {
                ProgressView()
                    .controlSize(.small)
            }
            Text(toast.message)
                .font(.system(size: 12, weight: .semibold))
                .lineLimit(2)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(toastBackground(toast.style))
        .clipShape(Capsule())
        .overlay(
            Capsule()
                .stroke(toastBorder(toast.style), lineWidth: 1)
        )
        .foregroundStyle(toastForeground(toast.style))
    }

    private func toastBackground(_ style: MainViewModel.ToastStyle) -> Color {
        switch style {
        case .loading:
            return AppTheme.surface(for: theme)
        case .success:
            return theme == .dark
                ? Color(red: 20.0 / 255.0, green: 83.0 / 255.0, blue: 45.0 / 255.0)
                : Color(red: 220.0 / 255.0, green: 252.0 / 255.0, blue: 231.0 / 255.0)
        case .neutral:
            return AppTheme.surface(for: theme)
        case .error:
            return theme == .dark
                ? Color(red: 127.0 / 255.0, green: 29.0 / 255.0, blue: 29.0 / 255.0)
                : Color(red: 254.0 / 255.0, green: 242.0 / 255.0, blue: 242.0 / 255.0)
        }
    }

    private func toastBorder(_ style: MainViewModel.ToastStyle) -> Color {
        switch style {
        case .loading:
            return AppTheme.border(for: theme).opacity(theme == .dark ? 0.55 : 0.45)
        case .success:
            return theme == .dark
                ? Color(red: 74.0 / 255.0, green: 222.0 / 255.0, blue: 128.0 / 255.0).opacity(0.26)
                : Color(red: 34.0 / 255.0, green: 197.0 / 255.0, blue: 94.0 / 255.0).opacity(0.18)
        case .neutral:
            return AppTheme.border(for: theme).opacity(theme == .dark ? 0.48 : 0.38)
        case .error:
            return theme == .dark
                ? Color(red: 252.0 / 255.0, green: 165.0 / 255.0, blue: 165.0 / 255.0).opacity(0.24)
                : Color(red: 239.0 / 255.0, green: 68.0 / 255.0, blue: 68.0 / 255.0).opacity(0.16)
        }
    }

    private func toastForeground(_ style: MainViewModel.ToastStyle) -> Color {
        switch style {
        case .success:
            return theme == .dark
                ? Color(red: 220.0 / 255.0, green: 252.0 / 255.0, blue: 231.0 / 255.0)
                : Color(red: 22.0 / 255.0, green: 101.0 / 255.0, blue: 52.0 / 255.0)
        case .loading, .neutral, .error:
            return AppTheme.textPrimary(for: theme)
        }
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

    private func toolbarIconButton(_ icon: ActionIcon, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            actionIcon(icon, size: 14)
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .frame(width: Self.toolbarButtonSize, height: Self.toolbarButtonSize)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(width: Self.toolbarButtonSize, height: Self.toolbarButtonSize)
        .contentShape(Rectangle())
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }
}

extension MainView {
    static let toolbarButtonSize: CGFloat = 34
    static let headerLeadingWidth: CGFloat = 220
    static func groupCardDisplayMode(for density: DesktopCardDensity) -> GroupCardDisplayMode {
        switch density {
        case .comfortable:
            return .home
        case .compact:
            return .menu
        }
    }
}

private struct LayoutMetrics {
    let width: CGFloat

    var isNarrowTopBar: Bool {
        width <= 860
    }

    var gridColumnCount: Int {
        if width > 1120 {
            return 4
        }
        if width > 860 {
            return 3
        }
        if width > 620 {
            return 2
        }
        return 1
    }

    var detailStacks: Bool {
        width <= 620
    }

    var detailSidebarWidth: CGFloat {
        detailStacks ? max(0, width - 24) : (width <= 860 ? 230 : 280)
    }

    var gridFrameWidth: CGFloat {
        let columns = CGFloat(gridColumnCount)
        let spacing = CGFloat(max(gridColumnCount - 1, 0)) * 14
        let available = max(304, width - 32 - spacing)
        return min(1260, max(304 * columns + spacing, available))
    }
}

struct EmptyStateChrome: ViewModifier {
    let theme: DesktopThemeMode
    let enabled: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if enabled {
            content
                .background(AppTheme.toolbarButtonBackground(for: theme))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .shadow(color: AppTheme.softShadow(for: theme), radius: 10, x: 0, y: 6)
        } else {
            content
        }
    }
}

enum DesktopThemeMode: String {
    case light
    case dark
}

enum DesktopAccentColor: String, CaseIterable, Identifiable {
    case blue
    case green
    case yellow
    case pink
    case orange
    case purple

    var id: String { rawValue }

    var title: String {
        switch self {
        case .blue:
            return "Blue"
        case .green:
            return "Green"
        case .yellow:
            return "Yellow"
        case .pink:
            return "Pink"
        case .orange:
            return "Orange"
        case .purple:
            return "Purple"
        }
    }
}

enum AppTheme {
    static func brand(for accent: DesktopAccentColor) -> Color {
        brand(for: accent, in: .light)
    }

    static func brand(for accent: DesktopAccentColor, in mode: DesktopThemeMode) -> Color {
        switch (accent, mode) {
        case (.blue, .light):
            return Color(red: 59.0 / 255.0, green: 130.0 / 255.0, blue: 246.0 / 255.0)
        case (.blue, .dark):
            return Color(red: 125.0 / 255.0, green: 176.0 / 255.0, blue: 255.0 / 255.0)
        case (.green, .light):
            return Color(red: 34.0 / 255.0, green: 197.0 / 255.0, blue: 94.0 / 255.0)
        case (.green, .dark):
            return Color(red: 74.0 / 255.0, green: 222.0 / 255.0, blue: 128.0 / 255.0)
        case (.yellow, .light):
            return Color(red: 234.0 / 255.0, green: 179.0 / 255.0, blue: 8.0 / 255.0)
        case (.yellow, .dark):
            return Color(red: 250.0 / 255.0, green: 204.0 / 255.0, blue: 21.0 / 255.0)
        case (.pink, .light):
            return Color(red: 236.0 / 255.0, green: 72.0 / 255.0, blue: 153.0 / 255.0)
        case (.pink, .dark):
            return Color(red: 244.0 / 255.0, green: 114.0 / 255.0, blue: 182.0 / 255.0)
        case (.orange, .light):
            return Color(red: 249.0 / 255.0, green: 115.0 / 255.0, blue: 22.0 / 255.0)
        case (.orange, .dark):
            return Color(red: 251.0 / 255.0, green: 146.0 / 255.0, blue: 60.0 / 255.0)
        case (.purple, .light):
            return Color(red: 139.0 / 255.0, green: 92.0 / 255.0, blue: 246.0 / 255.0)
        case (.purple, .dark):
            return Color(red: 167.0 / 255.0, green: 139.0 / 255.0, blue: 250.0 / 255.0)
        }
    }

    static func importSearchPromptText(for accent: DesktopAccentColor, in mode: DesktopThemeMode) -> Color {
        brand(for: accent, in: mode).opacity(mode == .dark ? 0.5576 : 0.4836)
    }

    static func importSearchPromptFixedText(for mode: DesktopThemeMode) -> Color {
        textMuted(for: mode).opacity(mode == .dark ? 0.82 : 0.78)
    }

    struct ControlSize {
        let width: CGFloat
        let height: CGFloat
        let cornerRadius: CGFloat
        let fontSize: CGFloat

        static let desktop = ControlSize(width: 30, height: 30, cornerRadius: 8, fontSize: 10)
        static let desktopWide = ControlSize(width: 42, height: 34, cornerRadius: 8, fontSize: 10)
        static let compact = ControlSize(width: 20, height: 19, cornerRadius: 6, fontSize: 7)
        static let chip = ControlSize(width: 0, height: 34, cornerRadius: 8, fontSize: 11)
        static let menuChip = ControlSize(width: 0, height: 19, cornerRadius: 6, fontSize: 8)
        static let status = ControlSize(width: 0, height: 22, cornerRadius: 8, fontSize: 9)
    }

    static func pageBackground(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color3, for: mode)
    }

    static func surface(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color1, for: mode)
    }

    static func groupCardFill(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color1, for: mode)
    }

    static func headerBackground(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color3, for: mode)
    }

    static func detailHeaderBackground(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color1, for: mode)
    }

    static func detailBodyBackground(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color2, for: mode)
    }

    static func detailHeaderBottomBorder(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color3, for: mode).opacity(0.5)
    }

    static func headerControlFill(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color1, for: mode)
    }

    static func toolbarButtonBackground(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color.white.opacity(0.55)
        case .dark:
            return Color.white.opacity(0.10)
        }
    }

    static func toolbarGlass(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color.white.opacity(0.44)
        case .dark:
            return Color.white.opacity(0.08)
        }
    }

    static func textPrimary(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color(red: 38.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0)
        case .dark:
            return Color(red: 239.0 / 255.0, green: 239.0 / 255.0, blue: 241.0 / 255.0)
        }
    }

    static func textMuted(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color(red: 38.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0).opacity(0.62)
        case .dark:
            return Color(red: 229.0 / 255.0, green: 229.0 / 255.0, blue: 231.0 / 255.0).opacity(0.68)
        }
    }

    static func textMutedNSColor(for mode: DesktopThemeMode) -> NSColor {
        switch mode {
        case .light:
            return NSColor(
                calibratedRed: 38.0 / 255.0,
                green: 38.0 / 255.0,
                blue: 38.0 / 255.0,
                alpha: 0.62
            )
        case .dark:
            return NSColor(
                calibratedRed: 229.0 / 255.0,
                green: 229.0 / 255.0,
                blue: 231.0 / 255.0,
                alpha: 0.68
            )
        }
    }

    static func searchPlaceholder(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return textMuted(for: mode)
        case .dark:
            return Color(red: 229.0 / 255.0, green: 229.0 / 255.0, blue: 231.0 / 255.0).opacity(0.88)
        }
    }

    static func statusSuccess(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return brand(for: .green, in: .light)
        case .dark:
            return brand(for: .green, in: .dark)
        }
    }

    static func statusWarning(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return brand(for: .yellow, in: .light)
        case .dark:
            return brand(for: .yellow, in: .dark)
        }
    }

    static func statusError(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return brand(for: .orange, in: .light)
        case .dark:
            return Color(red: 252.0 / 255.0, green: 165.0 / 255.0, blue: 165.0 / 255.0)
        }
    }

    static func border(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color.black.opacity(0.12)
        case .dark:
            return Color.white.opacity(0.12)
        }
    }

    static func idleChipFill(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color(red: 170.0 / 255.0, green: 170.0 / 255.0, blue: 170.0 / 255.0).opacity(0.35)
        case .dark:
            return Color.white.opacity(0.12)
        }
    }

    static func cardShadow(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color.black.opacity(0.08)
        case .dark:
            return Color.white.opacity(0.10)
        }
    }

    static func softShadow(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color.black.opacity(0.08)
        case .dark:
            return Color.white.opacity(0.10)
        }
    }

    static func controlShadow(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color.black.opacity(0.12)
        case .dark:
            return Color.white.opacity(0.16)
        }
    }

    static func documentBlock(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color3, for: mode)
    }

    static func cardBorder(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color3, for: mode)
    }

    static func selectionControlFill(_ selection: SelectionState, for mode: DesktopThemeMode) -> Color {
        switch selection {
        case .empty:
            return documentBlock(for: mode)
        case .partial:
            return statusWarning(for: mode).opacity(mode == .dark ? 0.38 : 0.32)
        case .full:
            return statusSuccess(for: mode).opacity(mode == .dark ? 0.36 : 0.30)
        }
    }

    static func selectionControlText(_ selection: SelectionState, for mode: DesktopThemeMode) -> Color {
        switch selection {
        case .empty:
            return textPrimary(for: mode).opacity(mode == .dark ? 0.92 : 0.82)
        case .partial:
            return statusWarning(for: mode)
        case .full:
            return statusSuccess(for: mode)
        }
    }

    private enum NeutralCardColor {
        case color1
        case color2
        case color3
    }

    private static func neutralCardColor(_ color: NeutralCardColor, for mode: DesktopThemeMode) -> Color {
        switch (mode, color) {
        case (.light, .color1):
            return grayscaleColor(253)
        case (.light, .color2):
            return grayscaleColor(249)
        case (.light, .color3):
            return grayscaleColor(242)
        case (.dark, .color1):
            return grayscaleColor(14)
        case (.dark, .color2):
            return grayscaleColor(21)
        case (.dark, .color3):
            return grayscaleColor(34)
        }
    }

    private static func grayscaleColor(_ value: Double) -> Color {
        let channel = value / 255.0
        return Color(red: channel, green: channel, blue: channel)
    }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}

private struct WindowFirstResponderResetter: NSViewRepresentable {
    let resetToken: Int

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context _: Context) -> NSView {
        NSView(frame: .zero)
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        guard context.coordinator.lastResetToken != resetToken else {
            return
        }

        context.coordinator.lastResetToken = resetToken

        DispatchQueue.main.async {
            guard let window = nsView.window else {
                return
            }

            window.initialFirstResponder = nil
            window.endEditing(for: nil)
            window.makeFirstResponder(nil)
        }
    }

    final class Coordinator {
        var lastResetToken: Int?
    }
}

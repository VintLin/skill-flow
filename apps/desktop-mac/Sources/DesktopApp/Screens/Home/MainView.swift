import AppKit
import SwiftUI
import UniformTypeIdentifiers

enum HomeSidebarChipTitleFormatter {
    static func displayTitle(_ title: String, showsHashPrefix: Bool) -> String {
        showsHashPrefix ? "#\(title)" : title
    }
}

private struct HomeSidebarTagReorderModifier: ViewModifier {
    let tagID: String?
    let onMoveTag: ((String, String, HomeTagMovePlacement) -> Void)?

    func body(content: Content) -> some View {
        guard let tagID, let onMoveTag else {
            return AnyView(content)
        }

        return AnyView(
            content
                .onDrag {
                    NSItemProvider(object: tagID as NSString)
                }
                .background {
                    GeometryReader { proxy in
                        Color.clear
                            .onDrop(
                                of: [.text],
                                delegate: HomeSidebarTagDropDelegate(
                                    targetTagID: tagID,
                                    targetWidth: proxy.size.width,
                                    onMoveTag: onMoveTag
                                )
                            )
                    }
                }
        )
    }
}

private struct HomeSidebarTagDropDelegate: DropDelegate {
    let targetTagID: String
    let targetWidth: CGFloat
    let onMoveTag: (String, String, HomeTagMovePlacement) -> Void

    func performDrop(info: DropInfo) -> Bool {
        guard let provider = info.itemProviders(for: [.text]).first else {
            return false
        }
        let placement: HomeTagMovePlacement = info.location.x < targetWidth / 2 ? .before : .after

        provider.loadItem(forTypeIdentifier: UTType.text.identifier, options: nil) { item, _ in
            let value: String?
            if let data = item as? Data {
                value = String(data: data, encoding: .utf8)
            } else if let string = item as? NSString {
                value = string as String
            } else {
                value = item as? String
            }

            guard let sourceTagID = value?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !sourceTagID.isEmpty,
                  sourceTagID != targetTagID else {
                return
            }

            DispatchQueue.main.async {
                onMoveTag(sourceTagID, targetTagID, placement)
            }
        }
        return true
    }
}

private enum GroupEditorTab: String, CaseIterable, Identifiable {
    case create
    case merge
    case restore

    var id: String { rawValue }

    var localizationKey: String {
        switch self {
        case .create:
            return "group_editor.tab.create"
        case .merge:
            return "group_editor.tab.merge"
        case .restore:
            return "group_editor.tab.restore"
        }
    }
}

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

    private enum HomeSidebarSectionID {
        static let status = "status"
        static let sourceType = "sourceType"
        static let tags = "tags"
        static let agents = "agents"
    }

    private struct HomeSidebarChipItem: Identifiable, Equatable {
        let id: String
        let title: String
        let count: Int?
        let accent: DesktopAccentColor?
        let showsHashPrefix: Bool
    }

    struct NavigationActions {
        let showHome: () -> Void
        let showDetail: (String) -> Void
        let showImportPage: () -> Void
        let showUsage: () -> Void
        let showSettings: () -> Void
    }

    @Environment(\.locale) private var locale
    private let topBarTitleSize: CGFloat = 17

    @Bindable var viewModel: MainViewModel
    let homeContainer: HomeScreenContainer
    @Bindable var importScreenState: ImportScreenState
    @Bindable var homeViewModel: HomeViewModel
    @Bindable var settingsViewModel: SettingsViewModel
    let navigation: NavigationActions
    let importContainer: ImportScreenContainer
    let detailContainer: DetailScreenContainer

    @State private var updateButtonRotation: Double = 0
    @State private var projectScopeRefreshButtonRotation: Double = 0
    @State private var searchFocusResetToken = 0
    @State private var isHomeSidebarVisible = true
    @State private var isEditCustomAgentPresented = false
    @State private var editingCustomAgentId: String?
    @State private var customAgentDraft = SettingsViewModel.CustomAgentDraft()
    @State private var customAgentErrors: [String: String] = [:]
    @State private var renameSourceId: String?
    @State private var renameDraft = ""
    @State private var renameOriginalDisplayName = ""
    @State private var isGroupEditorPresented = false
    @State private var groupEditorTab: GroupEditorTab = .create
    @State private var groupEditorName = ""
    @State private var groupEditorSelectedSkills = Set<CollectionSkillRef>()
    @State private var groupEditorSelectedSourceIds = Set<String>()
    @State private var groupEditorValidationKey: String?
    @State private var groupEditorOptions: CollectionEditorOptions?
    @State private var groupEditorOptionsTask: Task<Void, Never>?
    @FocusState private var focusedSearchField: SearchFieldFocus?
    private let importAutoPreviewLimit = 4

    init(
        viewModel: MainViewModel,
        homeContainer: HomeScreenContainer,
        navigation: NavigationActions,
        importScreenState: ImportScreenState,
        importContainer: ImportScreenContainer,
        detailContainer: DetailScreenContainer,
        homeViewModel: HomeViewModel,
        settingsViewModel: SettingsViewModel
    ) {
        self.viewModel = viewModel
        self.homeContainer = homeContainer
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

                Group {
                    if isHomePage {
                        homeShell(layout: layout)
                    } else {
                        nonHomeShell(layout: layout)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                if isEditCustomAgentPresented {
                    ZStack {
                        Color.black.opacity(theme == .dark ? 0.35 : 0.18)
                            .ignoresSafeArea()
                            .contentShape(Rectangle())
                            .onTapGesture {
                                closeCustomAgentEditor()
                            }

                        EditCustomAgentSheet(
                            title: L10n.string("settings.edit_custom_agent.title", locale: settingsViewModel.selectedLocale),
                            draft: $customAgentDraft,
                            errors: customAgentErrors,
                            theme: theme,
                            globalPathExample: AgentDisplayCatalog.mountPath(for: "codex"),
                            projectPathExample: AgentDisplayCatalog.projectPath(for: "codex") ?? ".agents/skills",
                            t: { L10n.string($0, locale: settingsViewModel.selectedLocale) },
                            onCancel: {
                                closeCustomAgentEditor()
                            },
                            onSave: {
                                let errors = settingsViewModel.upsertCustomAgent(
                                    customAgentDraft,
                                    editingId: editingCustomAgentId
                                )
                                customAgentErrors = errors
                                if errors.isEmpty {
                                    closeCustomAgentEditor()
                                }
                            }
                        )
                        .frame(maxWidth: 640)
                        .shadow(color: AppTheme.softShadow(for: theme), radius: 20, y: 10)
                    }
                    .transition(.opacity)
                    .zIndex(50)
                }

                if isGroupEditorPresented {
                    ZStack {
                        Color.black.opacity(theme == .dark ? 0.35 : 0.18)
                            .ignoresSafeArea()
                            .contentShape(Rectangle())
                            .onTapGesture {
                                closeGroupEditor()
                            }

                        GroupEditorSheet(
                            selectedTab: $groupEditorTab,
                            name: $groupEditorName,
                            selectedSkills: $groupEditorSelectedSkills,
                            selectedSourceIds: $groupEditorSelectedSourceIds,
                            validationKey: $groupEditorValidationKey,
                            isLoading: groupEditorOptions == nil,
                            skillOptions: groupEditorOptions?.skillOptions ?? [],
                            sourceOptions: groupEditorOptions?.mergeSourceOptions ?? [],
                            restoreOptions: groupEditorOptions?.restoreSourceOptions ?? [],
                            title: t("group_editor.title"),
                            theme: theme,
                            accent: accent,
                            t: { L10n.string($0, locale: settingsViewModel.selectedLocale) },
                            onCancel: {
                                closeGroupEditor()
                            },
                            onSave: {
                                saveGroupEditor()
                            },
                            onResetSelections: { resetGroupEditorSelections(clearName: false) },
                            onRestore: { sourceId in
                                closeGroupEditor()
                                Task { await viewModel.restoreCollectionSources(collectionId: sourceId) }
                            }
                        )
                        .frame(maxWidth: 640)
                        .shadow(color: AppTheme.softShadow(for: theme), radius: 20, y: 10)
                    }
                    .transition(.opacity)
                    .zIndex(55)
                }

                if renameSourceId != nil {
                    ZStack {
                        Color.black.opacity(theme == .dark ? 0.35 : 0.18)
                            .ignoresSafeArea()
                            .contentShape(Rectangle())
                            .onTapGesture {
                                closeRenameDialog()
                            }

                        RenameSourceDialog(
                            draft: $renameDraft,
                            title: t("rename.dialog.title"),
                            saveTitle: t("rename.dialog.save"),
                            cancelTitle: t("rename.dialog.cancel"),
                            placeholder: renameOriginalDisplayName,
                            theme: theme,
                            accent: accent,
                            onCancel: {
                                closeRenameDialog()
                            },
                            onSave: {
                                saveRenameDialog()
                            }
                        )
                        .frame(maxWidth: 360)
                        .shadow(color: AppTheme.softShadow(for: theme), radius: 18, y: 8)
                    }
                    .transition(.opacity)
                    .zIndex(60)
                }

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
        .onChange(of: viewModel.pendingDetailRename) {
            if let request = viewModel.pendingDetailRename {
                beginRenameSource(
                    sourceId: request.sourceId,
                    title: request.title,
                    originalDisplayName: request.originalDisplayName
                )
                viewModel.pendingDetailRename = nil
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
            case .usage:
                Task {
                    await viewModel.loadUsageSnapshot()
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
        .onChange(of: viewModel.isRefreshing) { _, isRefreshing in
            if isRefreshing {
                withAnimation(.linear(duration: 0.9).repeatForever(autoreverses: false)) {
                    projectScopeRefreshButtonRotation = 360
                }
            } else {
                withAnimation(.easeInOut(duration: 0.28)) {
                    projectScopeRefreshButtonRotation = 0
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
                        usageButton
                        groupEditorButton
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
                    usageButton
                    groupEditorButton
                    homeUpdateButton
                    settingsButton
                }
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(AppTheme.headerBackground(for: theme))
            } else if isImportPage {
                let searchWidth = Self.importHeaderSearchWidth(
                    forWindowWidth: layout.width,
                    locale: locale,
                    includesSearchAction: importSearchActionState != .hidden
                )
                HStack(spacing: Self.importHeaderItemSpacing(forWindowWidth: layout.width)) {
                    topBarTitleRow
                        .frame(width: Self.importHeaderLeadingWidth(forWindowWidth: layout.width), alignment: .leading)
                    importSearchField(width: searchWidth)
                    if importSearchActionState != .hidden {
                        importSearchActionButton
                            .transition(.opacity.combined(with: .scale(scale: 0.92)))
                    }
                    Spacer(minLength: 0)
                    importHeaderActions(forWindowWidth: layout.width)
                    settingsButton
                }
                .padding(.leading, Self.nonHomeHeaderLeadingPadding)
                .padding(.trailing, Self.nonHomeHeaderTrailingPadding)
                .frame(height: 52)
                .background(AppTheme.headerBackground(for: theme))
            } else if isSettingsPage {
                HStack(spacing: 10) {
                    topBarTitleRow
                        .frame(width: Self.headerLeadingWidth, alignment: .leading)
                    Spacer(minLength: 0)
                    settingsHeaderActions
                    settingsButton
                }
                .padding(.leading, Self.nonHomeHeaderLeadingPadding)
                .padding(.trailing, Self.nonHomeHeaderTrailingPadding)
                .frame(height: 52)
                .background(AppTheme.headerBackground(for: theme))
            } else if isUsagePage {
                HStack(spacing: 10) {
                    topBarTitleRow
                        .frame(width: Self.headerLeadingWidth, alignment: .leading)
                    Spacer(minLength: 0)
                    usageRefreshButton
                    settingsButton
                }
                .padding(.leading, Self.nonHomeHeaderLeadingPadding)
                .padding(.trailing, Self.nonHomeHeaderTrailingPadding)
                .frame(height: 52)
                .background(AppTheme.headerBackground(for: theme))
            } else {
                HStack(spacing: 10) {
                    topBarTitleRow
                        .frame(width: Self.headerLeadingWidth, alignment: .leading)
                    Spacer(minLength: 0)
                }
                .padding(.leading, Self.nonHomeHeaderLeadingPadding)
                .padding(.trailing, Self.nonHomeHeaderTrailingPadding)
                .frame(height: 52)
                .background(AppTheme.headerBackground(for: theme))
            }
        }
    }

    private func nonHomeShell(layout: LayoutMetrics) -> some View {
        VStack(spacing: 0) {
            topBar(layout: layout)
            pageContent(layout: layout)
        }
        .ignoresSafeArea(.container, edges: .top)
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

    private var isSettingsPage: Bool {
        homeViewModel.currentRoute == .settings
    }

    private var isUsagePage: Bool {
        homeViewModel.currentRoute == .usage
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
                .fixedSize(horizontal: true, vertical: false)
        }
    }

    private var searchField: some View {
        searchField(width: Self.headerSearchFieldWidth)
    }

    private func homeSearchField(width: CGFloat) -> some View {
        searchField(width: width)
    }

    private func searchField(width: CGFloat) -> some View {
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
                    .onSubmit {
                        Task {
                            let handled = await homeContainer.handleHomeSearchSubmit(viewModel.searchQuery)
                            if handled {
                                focusedSearchField = nil
                            }
                        }
                    }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            searchClearButton(isVisible: Self.shouldShowSearchClearButton(query: viewModel.searchQuery)) {
                viewModel.searchQuery = ""
            }
        }
        .padding(.horizontal, 12)
        .frame(width: width, height: Self.headerSearchFieldHeight, alignment: .leading)
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func importSearchField(width: CGFloat) -> some View {
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
            .frame(maxWidth: .infinity, alignment: .leading)

            searchClearButton(isVisible: Self.shouldShowSearchClearButton(query: importScreenState.searchText)) {
                Task {
                    await importContainer.clearSearch()
                }
            }
        }
        .padding(.horizontal, 12)
        .frame(width: width, height: Self.headerSearchFieldHeight, alignment: .leading)
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

    private var usageButton: some View {
        toolbarIconButton(.usage) { navigation.showUsage() }
    }

    private func importHeaderActions(forWindowWidth width: CGFloat) -> some View {
        HStack(spacing: Self.importHeaderItemSpacing(forWindowWidth: width)) {
            importModeButton(.recommended, titleKey: "import.mode.recommended", icon: .importRecommended)
            importModeButton(.localScan, titleKey: "import.mode.local_scan", icon: .importLocalScan)
            importLocalButton
        }
    }

    private func importModeButton(_ mode: ImportPageMode, titleKey: String, icon: ActionIcon) -> some View {
        let isSelected = importContainer.importPageMode == mode
        return Button {
            importContainer.setImportPageMode(mode)
        } label: {
            HStack(spacing: 7) {
                actionIcon(icon, size: 13)
                    .foregroundStyle(isSelected ? AppTheme.brand(for: accent, in: theme) : AppTheme.textPrimary(for: theme))
                Text(t(titleKey))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(isSelected ? AppTheme.brand(for: accent, in: theme) : AppTheme.textPrimary(for: theme))
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .padding(.horizontal, 11)
            .frame(height: Self.headerSearchFieldHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .desktopMotionButton(
            kind: isSelected ? .primary : .subtle,
            theme: theme,
            accent: accent,
            isEnabled: true
        )
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(
                    isSelected ? AppTheme.brand(for: accent, in: theme).opacity(0.45) : AppTheme.cardBorder(for: theme),
                    lineWidth: isSelected ? 1 : 0.5
                )
        }
    }

    private var importLocalButton: some View {
        Button {
            presentImportLocalDirectoryPanel()
        } label: {
            HStack(spacing: 7) {
                actionIcon(.importLocal, size: 13)
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Text(t("import.local.button"))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(1)
            }
            .padding(.horizontal, 11)
            .frame(height: Self.headerSearchFieldHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(t("import.local.button.help"))
        .desktopMotionButton(kind: .subtle, theme: theme, accent: accent, isEnabled: true)
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func presentImportLocalDirectoryPanel() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.canCreateDirectories = false
        panel.prompt = t("import.local.panel.prompt")

        guard panel.runModal() == .OK, let path = panel.url?.path else {
            return
        }

        Task {
            focusedSearchField = nil
            await importContainer.importLocalDirectory(path)
        }
    }

    private var groupEditorButton: some View {
        toolbarIconButton(.groupEditor) {
            openGroupEditor()
        }
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
            resultCount: snapshot?.content.count ?? 0,
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

    private var usageRefreshButton: some View {
        Button {
            Task { await viewModel.refreshUsageAnalytics() }
        } label: {
            HStack(spacing: 7) {
                actionIcon(.update, size: 13)
                Text("Refresh")
                    .font(.system(size: 12, weight: .semibold))
            }
            .foregroundStyle(AppTheme.textPrimary(for: theme))
            .padding(.horizontal, 11)
            .frame(height: 32)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .desktopMotionButton(kind: .primary, theme: theme, accent: accent, isEnabled: true)
        .background(AppTheme.headerControlFill(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private var settingsHeaderActions: some View {
        settingsAddCustomAgentButton
    }

    private var settingsAddCustomAgentButton: some View {
        Button {
            beginAddCustomAgent()
        } label: {
            HStack(spacing: 7) {
                actionIcon(.plus, size: 13)
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Text(t("settings.action.add_custom_agent"))
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .padding(.horizontal, 11)
            .frame(height: Self.headerSearchFieldHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .desktopMotionButton(kind: .subtle, theme: theme, accent: accent, isEnabled: true)
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func beginAddCustomAgent() {
        customAgentDraft = settingsViewModel.customAgentDraft()
        customAgentErrors = [:]
        editingCustomAgentId = nil
        isEditCustomAgentPresented = true
    }

    private func beginEditCustomAgent(targetId: String) {
        customAgentDraft = settingsViewModel.customAgentDraft(editingId: targetId)
        customAgentErrors = [:]
        editingCustomAgentId = targetId
        isEditCustomAgentPresented = true
    }

    private var orderedGroupEditorSelectedSkills: [CollectionSkillRef] {
        (groupEditorOptions?.skillOptions ?? [])
            .map { CollectionSkillRef(sourceId: $0.sourceId, leafId: $0.leafId) }
            .filter { groupEditorSelectedSkills.contains($0) }
    }

    private var orderedGroupEditorSelectedSourceIds: [String] {
        (groupEditorOptions?.mergeSourceOptions ?? [])
            .map(\.id)
            .filter { groupEditorSelectedSourceIds.contains($0) }
    }

    private func openGroupEditor() {
        groupEditorTab = .create
        groupEditorName = ""
        resetGroupEditorSelections(clearName: false)
        groupEditorOptions = nil
        isGroupEditorPresented = true
        prepareGroupEditorOptions()
    }

    private func prepareGroupEditorOptions() {
        groupEditorOptionsTask?.cancel()
        groupEditorOptionsTask = Task { @MainActor in
            await Task.yield()
            guard !Task.isCancelled else { return }
            groupEditorOptions = viewModel.collectionEditorOptions()
        }
    }

    private func resetGroupEditorSelections(clearName: Bool) {
        if clearName {
            groupEditorName = ""
        }
        groupEditorSelectedSkills = []
        groupEditorSelectedSourceIds = []
        groupEditorValidationKey = nil
    }

    private func closeGroupEditor() {
        groupEditorOptionsTask?.cancel()
        groupEditorOptionsTask = nil
        isGroupEditorPresented = false
        groupEditorValidationKey = nil
        groupEditorOptions = nil
    }

    private func saveGroupEditor() {
        switch groupEditorTab {
        case .create:
            let skills = orderedGroupEditorSelectedSkills
            switch viewModel.validateCollectionCreate(displayName: groupEditorName, selectedSkills: skills) {
            case .valid:
                let displayName = groupEditorName
                closeGroupEditor()
                Task {
                    await viewModel.createCollection(
                        displayName: displayName,
                        skills: skills,
                        enabledTargets: []
                    )
                }
            case .nameRequired:
                groupEditorValidationKey = "group_editor.validation.name_required"
            case .skillsRequired:
                groupEditorValidationKey = "group_editor.validation.skills_required"
            case .groupsRequired:
                groupEditorValidationKey = "group_editor.validation.groups_required"
            }
        case .merge:
            let sourceIds = orderedGroupEditorSelectedSourceIds
            switch viewModel.validateCollectionMerge(displayName: groupEditorName, sourceIds: sourceIds) {
            case .valid:
                let displayName = groupEditorName
                closeGroupEditor()
                Task {
                    await viewModel.mergeGroups(
                        displayName: displayName,
                        sourceIds: sourceIds,
                        enabledTargets: []
                    )
                }
            case .nameRequired:
                groupEditorValidationKey = "group_editor.validation.name_required"
            case .skillsRequired:
                groupEditorValidationKey = "group_editor.validation.skills_required"
            case .groupsRequired:
                groupEditorValidationKey = "group_editor.validation.groups_required"
            }
        case .restore:
            break
        }
    }

    private func closeCustomAgentEditor() {
        editingCustomAgentId = nil
        customAgentErrors = [:]
        isEditCustomAgentPresented = false
    }

    private func beginRenameSource(_ card: GroupCardModel) {
        renameSourceId = card.id
        renameDraft = card.title
        renameOriginalDisplayName = card.originalDisplayName ?? card.title
    }

    private func beginRenameSource(sourceId: String, title: String, originalDisplayName: String) {
        renameSourceId = sourceId
        renameDraft = title
        renameOriginalDisplayName = originalDisplayName
    }

    private func closeRenameDialog() {
        renameSourceId = nil
        renameDraft = ""
    }

    private func saveRenameDialog() {
        guard let sourceId = renameSourceId else {
            return
        }
        let displayName = renameDraft
        closeRenameDialog()
        Task {
            await viewModel.renameSource(sourceId: sourceId, displayName: displayName)
        }
    }

    private var homeCardDisplayMode: GroupCardDisplayMode {
        Self.homeGroupCardDisplayMode(for: settingsViewModel.currentHomeCardDensity)
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
        case .usage:
            UsageScreen(
                viewModel: viewModel,
                theme: theme,
                accent: accent
            )
        case .settings:
            SettingsScreen(
                viewModel: settingsViewModel,
                theme: theme,
                detectedTargetIds: viewModel.detectedTargetIdsForSettings,
                onEditCustomAgent: { targetId in
                    beginEditCustomAgent(targetId: targetId)
                }
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

    private func homeShell(layout: LayoutMetrics) -> some View {
        let homeTagSnapshot = homeContainer.homeTagSnapshot(locale: locale)
        let visibleCards = homeContainer.visibleGroupCards(
            from: viewModel.groupCards,
            snapshot: homeTagSnapshot
        )

        return HStack(alignment: .top, spacing: 0) {
            if isHomeSidebarVisible {
                homeSidebarColumn(homeTagSnapshot: homeTagSnapshot)
                    .frame(width: layout.homeSidebarWidth)
            }

            homeMainColumn(layout: layout, homeTagSnapshot: homeTagSnapshot, visibleCards: visibleCards, isSidebarVisible: isHomeSidebarVisible)
        }
        .ignoresSafeArea(.container, edges: .top)
    }

    private func homeMainColumn(
        layout: LayoutMetrics,
        homeTagSnapshot: GroupTagController.HomeSnapshot,
        visibleCards: [GroupCardModel],
        isSidebarVisible: Bool
    ) -> some View {
        VStack(spacing: 0) {
            homeMainHeader(layout: layout, isSidebarVisible: isSidebarVisible)
            homeContent(
                layout: layout,
                homeTagSnapshot: homeTagSnapshot,
                visibleCards: visibleCards,
                isSidebarVisible: isSidebarVisible
            )
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func homeMainHeader(layout: LayoutMetrics, isSidebarVisible: Bool) -> some View {
        let mainColumnWidth = Self.homeMainColumnWidth(
            forWindowWidth: layout.width,
            isSidebarVisible: isSidebarVisible
        )
        let leadingPadding = isSidebarVisible
            ? Self.homeMainHeaderSidePadding
            : Self.homeCollapsedHeaderLeadingPadding
        let reservedPadding = leadingPadding + Self.homeMainHeaderSidePadding
        let searchWidth = Self.homeMainHeaderSearchWidth(
            forMainColumnWidth: mainColumnWidth,
            reservedHorizontalPadding: reservedPadding,
            includesSidebarToggle: !isSidebarVisible
        )

        return HStack(spacing: Self.homeMainHeaderItemSpacing(includesSidebarToggle: !isSidebarVisible)) {
            if !isSidebarVisible {
                homeSidebarToggleButton
            }
            headerLogoRow
                .lineLimit(1)
                .frame(width: Self.homeMainHeaderBrandWidth, alignment: .leading)
            homeSearchField(width: searchWidth)
            Spacer(minLength: 0)
            importButton
            usageButton
            groupEditorButton
            homeUpdateButton
            settingsButton
        }
        .padding(.leading, leadingPadding)
        .padding(.trailing, Self.homeMainHeaderSidePadding)
        .padding(.top, Self.homeTitlebarControlTopPadding)
        .frame(height: Self.homeSidebarHeaderHeight, alignment: .top)
        .background(AppTheme.headerBackground(for: theme))
    }

    private func configPage(layout: LayoutMetrics) -> some View {
        homeShell(layout: layout)
    }

    private func homeContent(
        layout: LayoutMetrics,
        homeTagSnapshot: GroupTagController.HomeSnapshot,
        visibleCards: [GroupCardModel],
        isSidebarVisible: Bool
    ) -> some View {
        Group {
            if visibleCards.isEmpty {
                gridSection(
                    layout: layout,
                    homeTagSnapshot: homeTagSnapshot,
                    groupCards: visibleCards,
                    isSidebarVisible: isSidebarVisible
                )
                    .padding(.horizontal, 16)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
            } else {
                ScrollView {
                    gridSection(
                        layout: layout,
                        homeTagSnapshot: homeTagSnapshot,
                        groupCards: visibleCards,
                        isSidebarVisible: isSidebarVisible
                    )
                        .padding(.horizontal, 16)
                        .padding(.top, 16)
                        .padding(.bottom, 24)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(groupTagEditorDismissTapArea)
    }

    private var groupTagEditorDismissTapArea: some View {
        Color.clear
            .contentShape(Rectangle())
            .onTapGesture {
                NotificationCenter.default.post(name: .groupTagEditorDismissRequested, object: nil)
            }
    }

    private func gridSection(
        layout: LayoutMetrics,
        homeTagSnapshot: GroupTagController.HomeSnapshot,
        groupCards: [GroupCardModel],
        isSidebarVisible: Bool
    ) -> some View {
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
                    LazyVGrid(columns: homeGridColumns(for: layout, isSidebarVisible: isSidebarVisible), spacing: 12) {
                        ForEach(groupCards) { card in
                            SharedGroupCard(
                                card: card,
                                theme: theme,
                                accent: accent,
                                displayMode: homeCardDisplayMode,
                                clickPolicy: .home,
                                skillsCollapsed: false,
                                isUpdating: viewModel.isUpdatingSource(card.id) && !viewModel.isQueuedUpdateSource(card.id),
                                isQueued: viewModel.isQueuedUpdateSource(card.id),
                                onOpen: {
                                    navigation.showDetail(card.id)
                                },
                                onRename: {
                                    beginRenameSource(card)
                                },
                                onUpdate: {
                                    Task { await viewModel.updateSource(card.id) }
                                },
                                onTogglePinned: {
                                    Task { await viewModel.togglePinned(sourceId: card.id) }
                                },
                                canDelete: !MainViewModel.isCollectionHomeSource(card),
                                onDelete: {
                                    Task { await viewModel.deleteSource(sourceId: card.id) }
                                },
                                onToggleSkill: { skillId, enabled in
                                    Task { await viewModel.setSkillEnabled(skillId, enabled: enabled, sourceId: card.id) }
                                },
                                onToggleAllSkills: {
                                    Task { await viewModel.toggleAllSkills(sourceId: card.id) }
                                },
                                onToggleTarget: { targetId, enabled, expectedCurrentEnabled in
                                    Task {
                                        await viewModel.setTargetEnabled(
                                            targetId,
                                            enabled: enabled,
                                            sourceId: card.id,
                                            expectedCurrentEnabled: expectedCurrentEnabled
                                        )
                                    }
                                },
                                onToggleAllTargets: {
                                    Task { await viewModel.toggleAllTargets(sourceId: card.id) }
                                },
                                groupTagItems: homeTagSnapshot.tagsBySourceID[card.id] ?? [],
                                groupTagSuggestions: homeTagSnapshot.suggestionsBySourceID[card.id] ?? [],
                                canCreateGroupTag: (homeTagSnapshot.tagsBySourceID[card.id] ?? []).count < GroupTagController.maximumTagCount,
                                canDeleteGroupTags: !(homeTagSnapshot.tagsBySourceID[card.id] ?? []).isEmpty,
                                onCreateGroupTag: { title, itemAccent in
                                    homeContainer.addCustomTag(title, accent: itemAccent, toSourceId: card.id, locale: locale)
                                },
                                onDeleteGroupTag: { tagID in
                                    homeContainer.removeCustomTag(tagID, fromSourceId: card.id, locale: locale)
                                },
                                onSelectGroupTag: { item in
                                    homeContainer.setSelectedHomeTagFilterKey(item.id)
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
                    .frame(maxWidth: Self.homeGridFrameWidth(forWindowWidth: layout.width, isSidebarVisible: isSidebarVisible), alignment: .center)
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
        case .usage:
            return "Usage"
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
        case .usage, .settings, .detail:
            return false
        }
    }

    static func shouldAutofocusSearchField(for route: DesktopRoute) -> Bool {
        switch route {
        case .home, .importPage, .usage, .settings, .detail:
            return false
        }
    }

    static func shouldClearImplicitSearchFocusOnAppear(for route: DesktopRoute) -> Bool {
        topBarShowsSearch(for: route) && !shouldAutofocusSearchField(for: route)
    }

    nonisolated static let headerSearchFieldWidth: CGFloat = 384
    nonisolated static let headerSearchFieldHeight: CGFloat = 34
    nonisolated static let headerSearchActionButtonSize: CGFloat = headerSearchFieldHeight
    static func importPromptLeadingWidth(for locale: Locale) -> CGFloat {
        measuredPromptWidth(for: importSearchPrompts(locale: locale).map(\.leadingText))
    }

    static func importPromptTrailingWidth(for locale: Locale) -> CGFloat {
        measuredPromptWidth(for: importSearchPrompts(locale: locale).map(\.trailingText))
    }

    static func shouldShowSearchPrompt(query: String, isFocused: Bool) -> Bool {
        query.isEmpty && !isFocused
    }

    static func shouldShowSearchClearButton(query: String) -> Bool {
        !query.isEmpty
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
        searchPhase: ImportLoadPhase,
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

    private func homeGridColumns(for layout: LayoutMetrics, isSidebarVisible: Bool) -> [GridItem] {
        Array(
            repeating: GridItem(.fixed(304), spacing: 14),
            count: Self.homeGridColumnCount(forWindowWidth: layout.width, isSidebarVisible: isSidebarVisible)
        )
    }

    private func homeSidebar(homeTagSnapshot: GroupTagController.HomeSnapshot) -> some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                let homeAgentOptions = homeAgentChipItems()
                let rawHomeAgentFilterId = homeContainer.selectedHomeAgentFilterId()
                let selectedHomeAgentFilterId = rawHomeAgentFilterId.flatMap { raw in
                    homeAgentOptions.contains { $0.id == raw } ? raw : nil
                }

                homeSidebarChipSection(sectionId: HomeSidebarSectionID.status, title: t("home.sidebar.status"), options: homeStatusChipItems(), selectedId: homeContainer.selectedHomeStatusFilterId()) { optionId in
                    homeContainer.setSelectedHomeStatusFilter(optionId)
                }

                homeSidebarChipSection(sectionId: HomeSidebarSectionID.sourceType, title: t("home.sidebar.source_type"), options: homeSourceTypeChipItems(), selectedId: homeContainer.selectedHomeSourceTypeFilterId()) { optionId in
                    homeContainer.setSelectedHomeSourceTypeFilter(optionId)
                }

                homeSidebarChipSection(
                    sectionId: HomeSidebarSectionID.tags,
                    title: t("home.sidebar.tags"),
                    options: homeTagChipItems(snapshot: homeTagSnapshot),
                    selectedId: homeTagSnapshot.selectedKey ?? "all",
                    onSelect: { optionId in
                        homeContainer.setSelectedHomeTagFilterKey(optionId == "all" ? nil : optionId)
                    },
                    onMoveTag: { sourceTagID, targetTagID, placement in
                        homeContainer.moveHomeTag(sourceTagID: sourceTagID, targetTagID: targetTagID, placement: placement)
                    }
                )

                homeSidebarChipSection(sectionId: HomeSidebarSectionID.agents, title: t("home.sidebar.agents"), options: homeAgentOptions, selectedId: selectedHomeAgentFilterId ?? "all") { optionId in
                    homeContainer.setSelectedHomeAgentFilter(optionId == "all" ? nil : optionId)
                }

                homeSidebarProjectSection
            }
            .padding(.horizontal, Self.homeSidebarHorizontalPadding)
            .padding(.top, 16)
            .padding(.bottom, 18)
        }
    }

    private func homeSidebarColumn(homeTagSnapshot: GroupTagController.HomeSnapshot) -> some View {
        VStack(spacing: 0) {
            homeSidebarHeader
            homeSidebar(homeTagSnapshot: homeTagSnapshot)
        }
        .frame(maxHeight: .infinity, alignment: .topLeading)
        .background(AppTheme.surface(for: theme))
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(AppTheme.cardBorder(for: theme))
                .frame(width: 0.5)
        }
    }

    private var homeSidebarHeader: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 0)
            homeSidebarToggleButton
        }
        .frame(height: Self.homeSidebarToggleButtonSize, alignment: .top)
        .padding(.horizontal, Self.homeSidebarHorizontalPadding)
        .padding(.top, Self.homeTitlebarControlTopPadding)
        .frame(height: Self.homeSidebarHeaderHeight, alignment: .top)
    }

    private var homeSidebarToggleButton: some View {
        Button {
            withAnimation(.easeInOut(duration: 0.18)) {
                isHomeSidebarVisible.toggle()
            }
        } label: {
            Image(systemName: "sidebar.left")
                .font(.system(size: 13, weight: .semibold))
                .frame(width: Self.homeSidebarToggleButtonSize, height: Self.homeSidebarToggleButtonSize)
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(isHomeSidebarVisible ? "Hide sidebar" : "Show sidebar")
    }

    private func homeStatusChipItems() -> [HomeSidebarChipItem] {
        homeContainer.homeStatusFilterOptions().map { option in
            HomeSidebarChipItem(
                id: option.id,
                title: option.id == "pinned" ? t("home.sidebar.pinned") : t("home.sidebar.all"),
                count: option.count,
                accent: nil,
                showsHashPrefix: false
            )
        }
    }

    private func homeSourceTypeChipItems() -> [HomeSidebarChipItem] {
        homeContainer.homeSourceTypeFilterOptions().map { option in
            let title: String
            switch option.id {
            case "local":
                title = t("home.sidebar.local")
            case "remote":
                title = t("home.sidebar.remote")
            case "collection":
                title = t("home.sidebar.collection")
            default:
                title = t("home.sidebar.all")
            }
            return HomeSidebarChipItem(id: option.id, title: title, count: option.count, accent: nil, showsHashPrefix: false)
        }
    }

    private func homeTagChipItems(snapshot: GroupTagController.HomeSnapshot) -> [HomeSidebarChipItem] {
        let all = HomeSidebarChipItem(id: "all", title: t("home.sidebar.all"), count: viewModel.groupCards.count, accent: accent, showsHashPrefix: true)
        return [all] + snapshot.availableTags.map { item in
            HomeSidebarChipItem(id: item.id, title: item.title, count: snapshot.tagCountsByID[item.id], accent: item.accent, showsHashPrefix: true)
        }
    }

    private func homeAgentChipItems() -> [HomeSidebarChipItem] {
        let options = homeContainer.homeAgentFilterOptions()
        let all = HomeSidebarChipItem(id: "all", title: t("home.sidebar.all"), count: viewModel.groupCards.count, accent: nil, showsHashPrefix: false)
        return [all] + options.map { option in
            HomeSidebarChipItem(id: option.id, title: option.label, count: option.enabledGroupCount, accent: nil, showsHashPrefix: false)
        }
    }

    private func homeSidebarChipSection(
        sectionId: String,
        title: String,
        options: [HomeSidebarChipItem],
        selectedId: String,
        onSelect: @escaping (String) -> Void,
        onMoveTag: ((String, String, HomeTagMovePlacement) -> Void)? = nil
    ) -> some View {
        let expanded = homeContainer.isHomeSidebarSectionExpanded(sectionId)

        return VStack(alignment: .leading, spacing: 8) {
            Button {
                homeContainer.toggleHomeSidebarSection(sectionId)
            } label: {
                HStack(spacing: 8) {
                    Text(title)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .lineLimit(1)
                        .textCase(.uppercase)
                    Spacer(minLength: 0)
                    Image(systemName: expanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .frame(width: Self.homeSidebarToggleButtonSize, alignment: .center)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("\(expanded ? t("home.sidebar.collapse") : t("home.sidebar.expand")): \(title)")

            if expanded {
                WrappingHStack(horizontalSpacing: 6, verticalSpacing: 6) {
                    ForEach(options) { option in
                        homeSidebarChip(option: option, isSelected: selectedId == option.id, onMoveTag: onMoveTag) {
                            onSelect(option.id)
                        }
                    }
                }
            } else {
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 6) {
                        ForEach(options) { option in
                            homeSidebarChip(option: option, isSelected: selectedId == option.id, onMoveTag: onMoveTag) {
                                onSelect(option.id)
                            }
                        }
                    }
                    .padding(.horizontal, Self.homeSidebarChipBleed)
                }
                .padding(.horizontal, -Self.homeSidebarChipBleed)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func homeSidebarChip(
        option: HomeSidebarChipItem,
        isSelected: Bool,
        onMoveTag: ((String, String, HomeTagMovePlacement) -> Void)? = nil,
        action: @escaping () -> Void
    ) -> some View {
        homeFilterPill(
            title: option.title,
            count: option.count,
            accent: option.accent ?? accent,
            showsHashPrefix: option.showsHashPrefix,
            isSelected: isSelected,
            tagID: option.id == "all" ? nil : option.id,
            onMoveTag: onMoveTag,
            action: action
        )
    }

    private var homeSidebarProjectSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(t("home.sidebar.projects"))
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .lineLimit(1)
                    .textCase(.uppercase)
                Spacer(minLength: 0)
                homeProjectScopeRefreshButton
            }

            homeProjectScopeList
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var homeProjectScopeList: some View {
        let projects = homeContainer.recentProjectScopes()

        return VStack(alignment: .leading, spacing: 6) {
            homeProjectScopeRow(
                title: t("project_scope.global"),
                projectPath: nil,
                count: viewModel.groupCards.count,
                isSelected: viewModel.selectedProjectScope == .global
            ) {
                Task {
                    await homeContainer.selectProjectScope(.global)
                }
            }

            ForEach(projects, id: \.projectId) { item in
                homeProjectScopeRow(
                    title: item.title,
                    projectPath: item.projectPath,
                    count: nil,
                    isSelected: viewModel.selectedProjectScope == .project(item.projectId)
                ) {
                    Task {
                        await homeContainer.selectProjectScope(.project(item.projectId))
                    }
                }
            }
        }
    }

    private var homeProjectScopeRefreshButton: some View {
        Button {
            Task {
                await homeContainer.refreshProjectScopes()
            }
        } label: {
            actionIcon(.update, size: 12)
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .rotationEffect(.degrees(projectScopeRefreshButtonRotation))
                .frame(width: Self.homeProjectScopeRefreshButtonSize, height: Self.homeProjectScopeRefreshButtonSize)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .desktopMotionButton(kind: .icon, theme: theme, accent: accent, isEnabled: !viewModel.isRefreshing)
        .disabled(viewModel.isRefreshing)
        .opacity(viewModel.isRefreshing ? 0.62 : 1.0)
        .background(
            viewModel.isRefreshing
                ? AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.24 : 0.18)
                : AppTheme.scopePillBackground(isSelected: false, for: theme)
        )
        .clipShape(RoundedRectangle(cornerRadius: Self.homeProjectPillCornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: Self.homeProjectPillCornerRadius)
                .stroke(
                    viewModel.isRefreshing ? AppTheme.brand(for: accent, in: theme).opacity(0.35) : Color.clear,
                    lineWidth: 0.5
                )
        }
    }

    private func homeProjectScopeRow(
        title: String,
        projectPath: String?,
        count: Int?,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        HStack(alignment: .center, spacing: 8) {
            Button(action: action) {
                HStack(alignment: .center, spacing: 8) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(AppTheme.textPrimary(for: theme))
                            .lineLimit(1)
                            .truncationMode(.tail)

                        if let projectPath {
                            Text(projectPath)
                                .font(.system(size: 10, weight: .regular))
                                .foregroundStyle(AppTheme.textMuted(for: theme))
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)

                    if let count {
                        Text("\(count)")
                            .font(.system(size: 10, weight: .regular))
                            .foregroundStyle(AppTheme.textMuted(for: theme))
                            .lineLimit(1)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .frame(maxWidth: .infinity, alignment: .leading)

            if let projectPath {
                Button {
                    openPath(projectPath)
                } label: {
                    Image(systemName: "arrow.up.forward.square")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .frame(width: 22, height: 22)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .desktopMotionButton(kind: .icon, theme: theme, accent: accent, isEnabled: true)
                .help(projectPath)
                .accessibilityLabel(projectPath)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .desktopMotionChip(
            kind: .pill,
            theme: theme,
            accent: accent,
            isEnabled: true,
            isSelected: isSelected
        )
        .background(AppTheme.scopePillBackground(isSelected: isSelected, for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 7))
        .overlay {
            RoundedRectangle(cornerRadius: 7)
                .stroke(
                    isSelected ? AppTheme.brand(for: accent, in: theme).opacity(0.28) : Color.clear,
                    lineWidth: 0.5
                )
        }
    }

    private func homeFilterPill(
        title: String,
        count: Int? = nil,
        accent: DesktopAccentColor,
        showsHashPrefix: Bool = false,
        isSelected: Bool,
        tagID: String? = nil,
        onMoveTag: ((String, String, HomeTagMovePlacement) -> Void)? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Text(HomeSidebarChipTitleFormatter.displayTitle(title, showsHashPrefix: showsHashPrefix))
                    .font(.system(size: 12, weight: .regular))

                if let count {
                    Text("\(count)")
                        .font(.system(size: 10, weight: .regular))
                        .opacity(0.78)
                }
            }
                .foregroundStyle(AppTheme.brand(for: accent, in: theme))
                .padding(.horizontal, 10)
                .frame(height: Self.homeFilterPillHeight)
                .frame(maxWidth: .infinity)
                .background(
                    AppTheme.brand(for: accent, in: theme).opacity(
                        isSelected
                            ? (theme == .dark ? 0.28 : 0.18)
                            : (theme == .dark ? 0.22 : 0.14)
                    )
                )
                .clipShape(RoundedRectangle(cornerRadius: Self.homeFilterPillCornerRadius))
                .overlay {
                    RoundedRectangle(cornerRadius: Self.homeFilterPillCornerRadius)
                        .stroke(
                            isSelected ? AppTheme.brand(for: accent, in: theme).opacity(0.35) : Color.clear,
                            lineWidth: 0.5
                        )
                }
        }
        .buttonStyle(.plain)
        .opacity(isSelected ? 1.0 : 0.58)
        .modifier(HomeSidebarTagReorderModifier(tagID: tagID, onMoveTag: onMoveTag))
    }

    static func projectScopePillBackground(
        isSelected: Bool,
        accent: DesktopAccentColor,
        theme: DesktopThemeMode
    ) -> Color {
        guard isSelected else {
            return AppTheme.scopePillBackground(isSelected: false, for: theme)
        }
        return AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.28 : 0.18)
    }

    static func projectScopePillOpacityLabel(
        isSelected: Bool,
        theme: DesktopThemeMode
    ) -> String? {
        guard isSelected else {
            return nil
        }
        return theme == .dark ? "alpha 28%" : "alpha 18%"
    }

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }

    private func toastBanner(_ toast: ToastState) -> some View {
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

    private func toastBackground(_ style: ToastStyle) -> Color {
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

    private func toastBorder(_ style: ToastStyle) -> Color {
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

    private func toastForeground(_ style: ToastStyle) -> Color {
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

    private func toolbarIconButton(
        _ icon: ActionIcon,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            actionIcon(icon, size: 14)
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .frame(width: Self.toolbarButtonSize, height: Self.toolbarButtonSize)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .desktopMotionButton(kind: .icon, theme: theme, accent: accent, isEnabled: true)
        .frame(width: Self.toolbarButtonSize, height: Self.toolbarButtonSize)
        .contentShape(Rectangle())
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
        .accessibilityLabel(toolbarIconLabel(icon))
    }

    private func toolbarIconLabel(_ icon: ActionIcon) -> String {
        switch icon {
        case .back:
            return "Back"
        case .groupEditor:
            return "Group Editor"
        case .import:
            return "Import"
        case .settings:
            return "Settings"
        case .update:
            return "Refresh"
        case .usage:
            return "Usage"
        default:
            return icon.rawValue
        }
    }

    @ViewBuilder
    private func searchClearButton(
        isVisible: Bool,
        action: @escaping () -> Void
    ) -> some View {
        if isVisible {
            Button(action: action) {
                actionIcon(.close, size: 14)
                    .foregroundStyle(AppTheme.statusError(for: theme))
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(t("search.action.clear"))
            .accessibilityLabel(t("search.action.clear"))
        }
    }
}

extension MainView {
    nonisolated static let toolbarButtonSize: CGFloat = 34
    nonisolated static let headerLeadingWidth: CGFloat = 220
    nonisolated static let nonHomeHeaderLeadingPadding: CGFloat = homeSidebarTrafficLightLeadingInset + homeCollapsedHeaderButtonGap
    nonisolated static let nonHomeHeaderTrailingPadding: CGFloat = homeMainHeaderSidePadding
    nonisolated static let importHeaderMinimumSearchFieldWidth: CGFloat = 196
    nonisolated static let importHeaderHorizontalPadding: CGFloat = nonHomeHeaderLeadingPadding + nonHomeHeaderTrailingPadding
    nonisolated static let importHeaderRegularItemSpacing: CGFloat = 12
    nonisolated static let importHeaderCompactItemSpacing: CGFloat = 6
    nonisolated static let importHeaderCompactLeadingWidth: CGFloat = 84
    private static let importHeaderModeButtonHorizontalPadding: CGFloat = 22
    private static let importHeaderModeButtonWidthAllowance: CGFloat = 8
    private static let importHeaderModeButtonIconAllowance: CGFloat = 12
    nonisolated static let homeSidebarRegularWidth: CGFloat = 244
    nonisolated static let homeSidebarNarrowWidth: CGFloat = 208
    nonisolated static let homeSidebarTrafficLightLeadingInset: CGFloat = 68
    nonisolated static let homeSidebarToggleButtonSize: CGFloat = 28
    nonisolated static let homeSidebarHeaderHeight: CGFloat = 52
    nonisolated static let homeSidebarHorizontalPadding: CGFloat = 12
    static let homeSidebarChipBleed: CGFloat = 12
    static let homeTitlebarControlTopPadding: CGFloat = 8
    nonisolated static let homeMainHeaderBrandWidth: CGFloat = 132
    nonisolated static let homeMainHeaderSidePadding: CGFloat = 16
    nonisolated static let homeMainHeaderHorizontalPadding: CGFloat = homeMainHeaderSidePadding * 2
    nonisolated static let homeCollapsedHeaderButtonGap: CGFloat = 12
    nonisolated static let homeCollapsedHeaderLeadingPadding: CGFloat = homeSidebarTrafficLightLeadingInset + homeCollapsedHeaderButtonGap
    nonisolated static let homeMainHeaderItemSpacing: CGFloat = 12
    nonisolated static let homeMainHeaderCollapsedItemSpacing: CGFloat = 8
    nonisolated static let homeMainHeaderMinimumSearchFieldWidth: CGFloat = 160
    nonisolated static let homeGridHorizontalPadding: CGFloat = 32
    static let homeProjectPillHeight: CGFloat = 28
    static let homeFilterPillHeight: CGFloat = 28
    static let homeProjectScopeRefreshButtonSize: CGFloat = homeProjectPillHeight
    static let homeProjectPillCornerRadius: CGFloat = 8
    static let homeFilterPillCornerRadius: CGFloat = 8
    static let homeLeadingFixedButtonsAreCentered = true
    private static let homeLeadingButtonHorizontalPadding: CGFloat = 20
    private static let homeLeadingProjectIndicatorAllowance: CGFloat = 12

    static func homeGroupCardDisplayMode(for density: DesktopCardDensity) -> GroupCardDisplayMode {
        switch density {
        case .comfortable:
            return .homeComfortable
        case .compact:
            return .homeCompact
        }
    }

    static func menuGroupCardDisplayMode(for density: DesktopCardDensity) -> GroupCardDisplayMode {
        switch density {
        case .comfortable:
            return .menuComfortable
        case .compact:
            return .menuCompact
        }
    }

    static func projectScopeShowsSelectionIndicator(isSelected: Bool) -> Bool {
        isSelected
    }

    static func projectScopeShowsLegacySubtitle(isSelected: Bool) -> Bool {
        false
    }

    static func homeLeadingFixedButtonWidth(for locale: Locale) -> CGFloat {
        let projectTitle = L10n.string("project_scope.global", locale: locale)
        let filterTitle = "#\(L10n.string("group_tag.filter.all", locale: locale))"
        let agentTitle = L10n.string("home.sidebar.all_agents", locale: locale)
        let font = NSFont.systemFont(ofSize: 12, weight: .semibold)
        let projectWidth = ceil((projectTitle as NSString).size(withAttributes: [.font: font]).width)
        let filterWidth = ceil((filterTitle as NSString).size(withAttributes: [.font: font]).width)
        let agentWidth = ceil((agentTitle as NSString).size(withAttributes: [.font: font]).width)
        let contentWidth = max(projectWidth + homeLeadingProjectIndicatorAllowance, max(filterWidth, agentWidth))
        return contentWidth + homeLeadingButtonHorizontalPadding
    }

    nonisolated static func importHeaderItemSpacing(forWindowWidth width: CGFloat) -> CGFloat {
        width <= 860 ? importHeaderCompactItemSpacing : importHeaderRegularItemSpacing
    }

    nonisolated static func importHeaderLeadingWidth(forWindowWidth width: CGFloat) -> CGFloat {
        width <= 860 ? importHeaderCompactLeadingWidth : headerLeadingWidth
    }

    static func importHeaderModeAndActionButtonWidth(for locale: Locale) -> CGFloat {
        let font = NSFont.systemFont(ofSize: 12, weight: .medium)
        let titles = [
            L10n.string("import.mode.recommended", locale: locale),
            L10n.string("import.mode.local_scan", locale: locale),
            L10n.string("import.local.button", locale: locale),
        ]
        return titles.reduce(CGFloat(0)) { total, title in
            total
                + ceil((title as NSString).size(withAttributes: [.font: font]).width)
                + importHeaderModeButtonHorizontalPadding
                + importHeaderModeButtonWidthAllowance
                + importHeaderModeButtonIconAllowance
        }
    }

    static func fixedImportHeaderControlsWidth(
        forWindowWidth width: CGFloat,
        locale: Locale,
        includesSearchAction: Bool = false
    ) -> CGFloat {
        let spacing = importHeaderItemSpacing(forWindowWidth: width)
        let searchActionWidth = includesSearchAction ? headerSearchActionButtonSize : 0
        let spacingCount: CGFloat = includesSearchAction ? 7 : 6
        return importHeaderLeadingWidth(forWindowWidth: width)
            + searchActionWidth
            + toolbarButtonSize
            + importHeaderModeAndActionButtonWidth(for: locale)
            + importHeaderHorizontalPadding
            + (spacing * spacingCount)
    }

    static func importHeaderSearchWidth(
        forWindowWidth width: CGFloat,
        locale: Locale,
        includesSearchAction: Bool = false
    ) -> CGFloat {
        let availableWidth = width - fixedImportHeaderControlsWidth(
            forWindowWidth: width,
            locale: locale,
            includesSearchAction: includesSearchAction
        )
        if availableWidth >= importHeaderMinimumSearchFieldWidth {
            return min(headerSearchFieldWidth, availableWidth)
        }
        return max(0, availableWidth)
    }

    nonisolated static func homeMainColumnWidth(forWindowWidth width: CGFloat, isSidebarVisible: Bool) -> CGFloat {
        let sidebarWidth = isSidebarVisible
            ? (width <= 760 ? homeSidebarNarrowWidth : homeSidebarRegularWidth)
            : 0
        return max(0, width - sidebarWidth)
    }

    nonisolated static func fixedHomeMainHeaderControlsWidth(
        reservedHorizontalPadding: CGFloat,
        includesSidebarToggle: Bool
    ) -> CGFloat {
        let toggleWidth = includesSidebarToggle ? homeSidebarToggleButtonSize : 0
        let spacingCount: CGFloat = includesSidebarToggle ? 8 : 7
        let itemSpacing = homeMainHeaderItemSpacing(includesSidebarToggle: includesSidebarToggle)
        return (toolbarButtonSize * 5)
            + toggleWidth
            + homeMainHeaderBrandWidth
            + reservedHorizontalPadding
            + (itemSpacing * spacingCount)
    }

    nonisolated static func homeMainHeaderItemSpacing(includesSidebarToggle: Bool) -> CGFloat {
        includesSidebarToggle ? homeMainHeaderCollapsedItemSpacing : homeMainHeaderItemSpacing
    }

    nonisolated static func homeMainHeaderSearchWidth(
        forMainColumnWidth mainColumnWidth: CGFloat,
        reservedHorizontalPadding: CGFloat,
        includesSidebarToggle: Bool
    ) -> CGFloat {
        let fixedControlsWidth = fixedHomeMainHeaderControlsWidth(
            reservedHorizontalPadding: reservedHorizontalPadding,
            includesSidebarToggle: includesSidebarToggle
        )
        let availableWidth = mainColumnWidth - fixedControlsWidth
        if availableWidth >= homeMainHeaderMinimumSearchFieldWidth {
            return min(headerSearchFieldWidth, availableWidth)
        }
        return max(0, availableWidth)
    }

    nonisolated static func homeMainHeaderSearchWidth(forMainColumnWidth mainColumnWidth: CGFloat) -> CGFloat {
        homeMainHeaderSearchWidth(
            forMainColumnWidth: mainColumnWidth,
            reservedHorizontalPadding: homeMainHeaderHorizontalPadding,
            includesSidebarToggle: false
        )
    }

    nonisolated static func homeGridAvailableWidth(
        forWindowWidth width: CGFloat,
        isSidebarVisible: Bool
    ) -> CGFloat {
        let sidebarWidth = isSidebarVisible
            ? (width <= 760 ? homeSidebarNarrowWidth : homeSidebarRegularWidth)
            : 0
        return max(304, width - sidebarWidth - homeGridHorizontalPadding)
    }

    nonisolated static func homeGridColumnCount(
        forWindowWidth width: CGFloat,
        isSidebarVisible: Bool
    ) -> Int {
        let availableWidth = homeGridAvailableWidth(
            forWindowWidth: width,
            isSidebarVisible: isSidebarVisible
        )
        let columns = Int((availableWidth + 14) / (304 + 14))
        return min(4, max(1, columns))
    }

    nonisolated static func homeGridFrameWidth(
        forWindowWidth width: CGFloat,
        isSidebarVisible: Bool
    ) -> CGFloat {
        let columnCount = homeGridColumnCount(
            forWindowWidth: width,
            isSidebarVisible: isSidebarVisible
        )
        let columns = CGFloat(columnCount)
        let spacing = CGFloat(max(columnCount - 1, 0)) * 14
        return 304 * columns + spacing
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

    var homeSidebarWidth: CGFloat {
        width <= 760 ? MainView.homeSidebarNarrowWidth : MainView.homeSidebarRegularWidth
    }

}

private struct GroupEditorSheet: View {
    @State private var skillSearchQuery = ""

    @Binding var selectedTab: GroupEditorTab
    @Binding var name: String
    @Binding var selectedSkills: Set<CollectionSkillRef>
    @Binding var selectedSourceIds: Set<String>
    @Binding var validationKey: String?

    let isLoading: Bool
    let skillOptions: [CollectionSkillOption]
    let sourceOptions: [CollectionSourceOption]
    let restoreOptions: [CollectionSourceOption]
    let title: String
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let t: (String) -> String
    let onCancel: () -> Void
    let onSave: () -> Void
    let onResetSelections: () -> Void
    let onRestore: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 12) {
                Text(title)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(1)

                Spacer(minLength: 0)
            }

            Picker("", selection: $selectedTab) {
                ForEach(GroupEditorTab.allCases) { tab in
                    Text(t(tab.localizationKey)).tag(tab)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .onChange(of: selectedTab) { _, _ in
                skillSearchQuery = ""
                onResetSelections()
            }

            Group {
                if isLoading {
                    loadingPanel
                } else {
                    switch selectedTab {
                    case .create:
                        createPanel
                    case .merge:
                        mergePanel
                    case .restore:
                        restorePanel
                    }
                }
            }
            .frame(maxHeight: .infinity, alignment: .topLeading)

            if let validationKey {
                Text(t(validationKey))
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(Color.red)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                Spacer(minLength: 0)

                Button(t("rename.dialog.cancel"), action: onCancel)
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .padding(.horizontal, 12)
                    .frame(height: 30)
                    .background(AppTheme.toolbarButtonBackground(for: theme))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                if selectedTab != .restore {
                    Button(t("group_editor.action.save"), action: onSave)
                        .buttonStyle(.plain)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(AppTheme.pageBackground(for: theme))
                        .padding(.horizontal, 12)
                        .frame(height: 30)
                        .background(AppTheme.brand(for: accent, in: theme))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .disabled(isLoading)
                }
            }
        }
        .padding(16)
        .frame(width: 560, height: 520, alignment: .topLeading)
        .background(AppTheme.pageBackground(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private var loadingPanel: some View {
        VStack(spacing: 10) {
            Spacer(minLength: 0)
            ProgressView()
                .controlSize(.small)
            Text(t("group_editor.loading"))
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(AppTheme.textMuted(for: theme))
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var createPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            functionSummary("group_editor.summary.create")
            labeledNameField
            optionSection(title: t("group_card.section.skills"), showsSearch: true) {
                if filteredSkillOptions.isEmpty {
                    emptySearchState
                }
                ForEach(filteredSkillOptions) { option in
                    selectableRow(
                        title: option.title,
                        subtitle: option.sourceSubtitle,
                        isSelected: selectedSkills.contains(skillRef(for: option))
                    ) {
                        toggleSkill(option)
                    }
                }
            }
        }
        .frame(maxHeight: .infinity, alignment: .topLeading)
    }

    private var mergePanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            functionSummary("group_editor.summary.merge")
            labeledNameField
            optionSection(title: t("group_editor.section.skill_groups"), showsSearch: true) {
                if filteredSourceOptions.isEmpty {
                    emptySearchState
                }
                ForEach(filteredSourceOptions) { option in
                    selectableRow(
                        title: option.title,
                        subtitle: mergeSourceSubtitle(for: option),
                        isSelected: selectedSourceIds.contains(option.id)
                    ) {
                        toggleSource(option.id)
                    }
                }
            }
        }
        .frame(maxHeight: .infinity, alignment: .topLeading)
    }

    private var restorePanel: some View {
        optionSection(title: t("common.section.source")) {
            ForEach(restoreOptions) { option in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(option.title)
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(AppTheme.textPrimary(for: theme))
                            .lineLimit(1)
                        Text("\(option.skillCount)")
                            .font(.system(size: 11, weight: .regular, design: .monospaced))
                            .foregroundStyle(AppTheme.textMuted(for: theme))
                            .lineLimit(1)
                    }

                    Spacer(minLength: 0)

                    Button(t("group_editor.action.restore")) {
                        onRestore(option.id)
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.pageBackground(for: theme))
                    .padding(.horizontal, 10)
                    .frame(height: 28)
                    .background(AppTheme.brand(for: accent, in: theme))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .padding(.horizontal, 10)
                .frame(height: 44)
                .background(AppTheme.headerControlFill(for: theme))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
    }

    private var nameField: some View {
        TextField(t("settings.custom_agents.name_label"), text: $name)
            .textFieldStyle(.plain)
            .font(.system(size: 13, weight: .regular))
            .foregroundStyle(AppTheme.textPrimary(for: theme))
            .accessibilityLabel(t("settings.custom_agents.name_label"))
            .padding(.horizontal, 10)
            .frame(height: 34)
            .background(AppTheme.groupCardFill(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .onSubmit(onSave)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .frame(width: 14, height: 14)

            TextField(t("group_editor.search.placeholder"), text: $skillSearchQuery)
                .textFieldStyle(.plain)
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .accessibilityLabel(t("group_editor.search.placeholder"))

            if !skillSearchQuery.isEmpty {
                Button {
                    skillSearchQuery = ""
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .frame(height: 32)
        .background(AppTheme.groupCardFill(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var emptySearchState: some View {
        Text(t("group_editor.search.empty"))
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(AppTheme.textMuted(for: theme))
            .frame(maxWidth: .infinity, minHeight: 34, alignment: .center)
    }

    private func functionSummary(_ key: String) -> some View {
        Text(t(key))
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(AppTheme.textMuted(for: theme))
            .lineLimit(2)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var labeledNameField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(t("group_editor.name"))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)
            nameField
        }
    }

    private func optionSection<Content: View>(
        title: String,
        showsSearch: Bool = false,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            if showsSearch {
                searchField
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    content()
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: .infinity)
            .padding(8)
            .background(AppTheme.groupCardFill(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .frame(maxHeight: .infinity, alignment: .topLeading)
    }

    private func selectableRow(
        title: String,
        subtitle: String,
        isSelected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: isSelected ? "checkmark.square.fill" : "square")
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(isSelected ? AppTheme.brand(for: accent, in: theme) : AppTheme.textMuted(for: theme))
                    .frame(width: 16, height: 16)

                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(1)

                Spacer(minLength: 8)

                Text(subtitle)
                    .font(.system(size: 11, weight: .regular, design: .monospaced))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .lineLimit(1)
            }
            .padding(.horizontal, 10)
            .frame(height: 34)
            .background(isSelected ? AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.22 : 0.14) : AppTheme.groupCardFill(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }

    private func skillRef(for option: CollectionSkillOption) -> CollectionSkillRef {
        CollectionSkillRef(sourceId: option.sourceId, leafId: option.leafId)
    }

    private var filteredSkillOptions: [CollectionSkillOption] {
        let query = normalizedSkillSearchQuery
        guard !query.isEmpty else {
            return skillOptions
        }
        return skillOptions.filter { option in
            matchesSearch(
                query,
                fields: [option.title, option.sourceTitle, option.sourceSubtitle]
            )
        }
    }

    private var filteredSourceOptions: [CollectionSourceOption] {
        let query = normalizedSkillSearchQuery
        guard !query.isEmpty else {
            return sourceOptions
        }

        return sourceOptions.filter { option in
            if matchesSearch(query, fields: [option.title, option.sourceSubtitle]) {
                return true
            }
            return (skillsBySourceId[option.id] ?? []).contains { skill in
                matchesSearch(
                    query,
                    fields: [skill.title, skill.sourceTitle, skill.sourceSubtitle]
                )
            }
        }
    }

    private func mergeSourceSubtitle(for option: CollectionSourceOption) -> String {
        "\(option.sourceSubtitle) · \(option.skillCount)"
    }

    private var skillsBySourceId: [String: [CollectionSkillOption]] {
        Dictionary(grouping: skillOptions, by: \.sourceId)
    }

    private var normalizedSkillSearchQuery: String {
        skillSearchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func matchesSearch(_ query: String, fields: [String]) -> Bool {
        fields.contains { field in
            field.trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
                .contains(query)
        }
    }

    private func toggleSkill(_ option: CollectionSkillOption) {
        let ref = skillRef(for: option)
        if selectedSkills.contains(ref) {
            selectedSkills.remove(ref)
        } else {
            selectedSkills.insert(ref)
        }
        validationKey = nil
    }

    private func toggleSource(_ sourceId: String) {
        if selectedSourceIds.contains(sourceId) {
            selectedSourceIds.remove(sourceId)
        } else {
            selectedSourceIds.insert(sourceId)
        }
        validationKey = nil
    }

}

private struct RenameSourceDialog: View {
    @Binding var draft: String
    let title: String
    let saveTitle: String
    let cancelTitle: String
    let placeholder: String
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .lineLimit(1)

            TextField(placeholder, text: $draft)
                .textFieldStyle(.plain)
                .font(.system(size: 13, weight: .regular))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .accessibilityLabel(title)
                .padding(.horizontal, 10)
                .frame(height: 34)
                .background(AppTheme.headerControlFill(for: theme))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
                }
                .onSubmit(onSave)

            HStack(spacing: 8) {
                Spacer(minLength: 0)

                Button(cancelTitle, action: onCancel)
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .padding(.horizontal, 12)
                    .frame(height: 30)
                    .background(AppTheme.toolbarButtonBackground(for: theme))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                Button(saveTitle, action: onSave)
                    .buttonStyle(.plain)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.pageBackground(for: theme))
                    .padding(.horizontal, 12)
                    .frame(height: 30)
                    .background(AppTheme.brand(for: accent, in: theme))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            }
        }
        .padding(16)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
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
        case color4
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
        case (.light, .color4):
            return grayscaleColor(230)
        case (.dark, .color4):
            return grayscaleColor(53)
        }
    }

    static func scopePillBackground(isSelected: Bool, for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color1, for: mode).opacity(
            isSelected
                ? 1.0
                : (mode == .dark ? 0.58 : 0.72)
        )
    }

    static func scopePillBorder(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color4, for: mode)
    }

    private static func grayscaleColor(_ value: Double) -> Color {
        let channel = value / 255.0
        return Color(red: channel, green: channel, blue: channel)
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

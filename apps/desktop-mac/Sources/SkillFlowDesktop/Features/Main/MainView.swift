import AppKit
import SwiftUI

struct MainView: View {
    @Environment(\.locale) private var locale
    private let detailHeaderMinHeight: CGFloat = 76
    private let detailGroupRowHeight: CGFloat = 64
    private let detailSkillRowHeight: CGFloat = 60
    private let detailSkillDividerHeight: CGFloat = 16
    private let detailIndicatorHeight: CGFloat = 36
    private let detailToggleWidth: CGFloat = 34
    private let detailToggleHeight: CGFloat = 34
    private let detailAgentItemHeight: CGFloat = 34
    private let detailAgentIconSize: CGFloat = 20
    private let topBarTitleSize: CGFloat = 17
    private let detailHeaderTitleSize: CGFloat = 17
    private let detailHeaderMetaSize: CGFloat = 11

    private struct RecommendedImport: Identifiable {
        let id: String
        let title: String
        let locator: String
        let summary: String
        let aliases: [String]
        let sourceFacts: [String]
        let skills: [ImportSkill]
        let targets: [String]
    }

    private struct ImportSkill: Identifiable {
        let id: String
        let title: String
        let summary: String
    }

    private struct ImportDraftState {
        let selectedSkillIds: [String]
        let enabledTargetIds: [String]
    }

    @Bindable var viewModel: MainViewModel

    @State private var detailSkillIdByGroup: [String: String] = [:]
    @State private var detailShowsGroupOverviewByGroup: [String: Bool] = [:]
    @State private var detailHoveredItemIdByGroup: [String: String] = [:]
    @State private var detailDocumentTabIdByGroup: [String: String] = [:]
    @State private var detailDocumentTabIdBySkill: [String: String] = [:]
    @State private var pendingDetailSkillIdByGroup: [String: String] = [:]
    @State private var pendingDetailDocumentIdByGroup: [String: String] = [:]
    @State private var pendingDetailDocumentIdBySkill: [String: String] = [:]
    @State private var detailSkillSelectionTokenByGroup: [String: UInt64] = [:]
    @State private var detailDocumentSelectionTokenByGroup: [String: UInt64] = [:]
    @State private var detailDocumentSelectionTokenBySkill: [String: UInt64] = [:]
    @State private var importSearchText: String = ""
    @State private var importPlaceholderIndex: Int = 0
    @State private var importDraftsByItemId: [String: ImportDraftState] = [:]
    @State private var updateButtonRotation: Double = 0
    @AppStorage("desktop.themeMode") private var themeModeRawValue = DesktopThemeMode.light.rawValue
    @AppStorage("desktop.themeAccent") private var themeAccentRawValue = DesktopAccentColor.blue.rawValue

    private var theme: DesktopThemeMode {
        DesktopThemeMode(rawValue: themeModeRawValue) ?? .light
    }

    private var accent: DesktopAccentColor {
        DesktopAccentColor(rawValue: themeAccentRawValue) ?? .blue
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
        .onChange(of: viewModel.selectedGroupId) { _, newValue in
            guard case .detail = viewModel.currentPage else { return }
            guard let groupId = newValue else { return }
            viewModel.currentPage = .detail(sourceId: groupId)
        }
        .onChange(of: viewModel.currentPage) { _, newValue in
            switch newValue {
            case .detail(let groupId):
                guard let detail = viewModel.detailViewData(for: groupId) else { return }
                if detailSkillIdByGroup[groupId] == nil {
                    detailSkillIdByGroup[groupId] = preferredDetailSkillId(for: detail)
                }
                if detailShowsGroupOverviewByGroup[groupId] == nil {
                    detailShowsGroupOverviewByGroup[groupId] = true
                }
                if detailDocumentTabIdByGroup[groupId] == nil {
                    detailDocumentTabIdByGroup[groupId] = detail.groupDocuments.first?.id
                }
                for skill in detail.skills where detailDocumentTabIdBySkill[skill.id] == nil {
                    detailDocumentTabIdBySkill[skill.id] = skill.documents.first?.id
                }
            case .importPage:
                Task {
                    await viewModel.loadImportPageIfNeeded()
                }
            default:
                break
            }
        }
        .task(id: viewModel.toast?.id) {
            guard let toast = viewModel.toast, toast.style != .loading else { return }
            let toastId = toast.id
            try? await Task.sleep(for: .seconds(2))
            viewModel.dismissToast(id: toastId)
        }
        .task(id: viewModel.currentPage) {
            guard case .importPage = viewModel.currentPage else { return }
            while case .importPage = viewModel.currentPage {
                try? await Task.sleep(for: .seconds(2.2))
                guard !importSearchPrompts.isEmpty, case .importPage = viewModel.currentPage else { break }
                withAnimation(.spring(response: 0.28, dampingFraction: 0.88)) {
                    importPlaceholderIndex = (importPlaceholderIndex + 1) % importSearchPrompts.count
                }
            }
        }
        .task {
            if case .idle = viewModel.loadState {
                await viewModel.bootstrap()
                if let first = viewModel.sourceIds.first {
                    await viewModel.selectSource(first)
                }
            }
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
                    searchField
                    Spacer(minLength: 0)
                    importButton
                    homeUpdateButton
                    settingsButton
                }
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(AppTheme.headerBackground(for: theme))
            } else {
                HStack(spacing: 10) {
                    topBarTitleRow
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
                Button {
                    viewModel.currentPage = .home
                } label: {
                    actionIcon(.back, size: 14)
                }
                .buttonStyle(.plain)
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .frame(width: 22, height: 22)

                Text(currentPageTitle)
                    .font(.system(size: topBarTitleSize, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
            }
        }
    }

    private var isHomePage: Bool {
        viewModel.currentPage == .home
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
                if viewModel.searchQuery.isEmpty {
                    Text(t("placeholder.home.search_group_author"))
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(AppTheme.searchPlaceholder(for: theme))
                        .textCase(.uppercase)
                        .allowsHitTesting(false)
                }

                TextField("", text: $viewModel.searchQuery)
                    .textFieldStyle(.plain)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .textCase(.uppercase)
            }
        }
        .padding(.horizontal, 12)
        .frame(width: 320, height: 34, alignment: .leading)
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private var importButton: some View {
        toolbarIconButton(.import) {
            viewModel.currentPage = .importPage
        }
    }

    private var homeUpdateButton: some View {
        toolbarIconButton(.update) {
            Task { await viewModel.updateAllGroupsFromHome() }
        }
    }

    private var settingsButton: some View {
        toolbarIconButton(.settings) {
            viewModel.currentPage = .settings
        }
    }

    @ViewBuilder
    private func pageContent(layout: LayoutMetrics) -> some View {
        switch viewModel.currentPage {
        case .home:
            configPage(layout: layout)
        case .importPage:
            importPage(layout: layout)
        case .settings:
            settingsPage(layout: layout)
        case .detail(let sourceId):
            detailPage(groupId: sourceId, layout: layout)
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
                                    displayMode: .home,
                                skillsCollapsed: false,
                                isUpdating: viewModel.isUpdatingSource(card.id),
                                onOpen: {
                                    viewModel.currentPage = .detail(sourceId: card.id)
                                    Task { await viewModel.selectSource(card.id) }
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
            Text(t("home.loading.title"))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
        }
        .frame(maxWidth: .infinity, minHeight: 220)
    }

    private var currentPageTitle: String {
        switch viewModel.currentPage {
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

    private func detailPage(groupId: String, layout: LayoutMetrics) -> some View {
        let detail = viewModel.detailViewData(for: groupId)
        let sidebarWidth = layout.detailSidebarWidth

        return HStack(alignment: .top, spacing: 14) {
            detailSidebar(groupId: groupId, detail: detail, selectedSkillId: detailSkillIdByGroup[groupId], width: sidebarWidth)
            detailMain(groupId: groupId, detail: detail)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func detailSidebar(
        groupId: String,
        detail: MainViewModel.DetailViewData?,
        selectedSkillId: String?,
        width: CGFloat
    ) -> some View {
        let skills = detail?.skills ?? []
        let selectedItemId = detailSelectedItemId(groupId: groupId, selectedSkillId: selectedSkillId)
        let hoveredItemId = detailHoveredItemIdByGroup[groupId]
        let indicatorItemId = hoveredItemId ?? selectedItemId

        return VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                ZStack(alignment: .topLeading) {
                    if let indicatorFrame = detailIndicatorFrame(itemId: indicatorItemId, skillCount: skills.count) {
                        RoundedRectangle(cornerRadius: 999)
                            .fill(AppTheme.brand(for: accent, in: theme))
                            .frame(width: 4, height: indicatorFrame.height)
                            .offset(x: 0, y: indicatorFrame.minY)
                            .animation(.spring(response: 0.22, dampingFraction: 0.82), value: indicatorItemId)
                    }

                    VStack(alignment: .leading, spacing: 0) {
                        detailGroupListRow(groupId: groupId, detail: detail)
                        detailSkillsLabelRow
                        ForEach(skills) { skill in
                            detailSkillListRow(groupId: groupId, skill: skill)
                        }
                    }
                    .padding(.leading, 14)
                }
                .padding(.vertical, 6)
            }
            .scrollIndicators(.never)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .frame(minWidth: width, maxWidth: width, maxHeight: .infinity, alignment: .topLeading)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func detailMain(
        groupId: String,
        detail: MainViewModel.DetailViewData?
    ) -> some View {
        let selectedSkill = selectedDetailSkill(for: groupId, detail: detail)
        let showingGroupOverview = isShowingGroupOverview(groupId)
        let isSkillLoading = pendingDetailSkillIdByGroup[groupId] != nil

        return VStack(alignment: .leading, spacing: 0) {
            if showingGroupOverview {
                detailGroupHeader(detail: detail, fallbackGroupId: groupId)
            } else {
                detailSkillHeader(skill: selectedSkill, fallbackGroupId: groupId)
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if showingGroupOverview {
                        detailGroupOverview(groupId: groupId, detail: detail)
                    } else if isSkillLoading {
                        detailSkillLoadingPlaceholder()
                    } else if let selectedSkill {
                        detailSkillOverview(skill: selectedSkill)
                    } else {
                        emptyState(title: t("detail.empty.no_skill_title"), subtitle: t("detail.empty.no_skill.subtitle"))
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
            .scrollIndicators(.never)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func detailGroupOverview(groupId: String, detail: MainViewModel.DetailViewData?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            detailPathRow(
                title: t("detail.section.path"),
                path: detail?.groupPath,
                fallbackText: detail?.locator ?? t("detail.path.unavailable")
            )

            if let detail, !detail.sourceDetailLines.isEmpty {
                detailMetadataSection(
                    title: t("detail.section.source"),
                    lines: detail.sourceDetailLines,
                    externalURL: detail.sourceRepositoryURL
                )
            }

            detailAgentRail(groupId: groupId, detail: detail)

            if let detail, !detail.groupDocuments.isEmpty {
                detailGroupDocuments(detail, groupId: groupId)
            }
        }
    }

    private func detailSkillOverview(skill: MainViewModel.DetailSkill) -> some View {
        let isDocumentLoading = pendingDetailDocumentIdBySkill[skill.id] != nil

        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text(t("detail.section.skill_description"))
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .textCase(.uppercase)

                detailContentCard {
                    Text(skill.summary)
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                Text(t("detail.section.documents"))
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .textCase(.uppercase)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(skill.documents) { document in
                            documentTabChip(
                                title: document.title,
                                isSelected: selectedDocument(for: skill)?.id == document.id,
                                externalURL: document.externalURL
                            ) {
                                scheduleSkillDocumentSelection(skillId: skill.id, documentId: document.id)
                            }
                        }
                    }
                }

                detailContentCard {
                    if isDocumentLoading {
                        detailDocumentLoadingPlaceholder()
                    } else if let document = selectedDocument(for: skill) {
                        detailDocumentContent(document: document)
                    } else {
                        Text(skill.documentContent)
                            .font(.system(size: 11, weight: .regular, design: .monospaced))
                            .foregroundStyle(AppTheme.textPrimary(for: theme))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }
                }
            }
        }
    }

    private func detailOverviewCard(title: String, lines: [String], lineLimit: Int? = 1) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            VStack(alignment: .leading, spacing: 4) {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                    Text(line)
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                        .lineLimit(lineLimit)
                        .truncationMode(.middle)
                }
            }
        }
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func detailContentCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(14)
            .background(AppTheme.documentBlock(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func detailGroupHeader(detail: MainViewModel.DetailViewData?, fallbackGroupId: String) -> some View {
        let isUpdating = viewModel.isUpdatingCurrentGroup

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(detail?.title ?? fallbackGroupId)
                        .font(.system(size: detailHeaderTitleSize, weight: .semibold))
                        .foregroundStyle(AppTheme.brand(for: accent, in: theme))

                    Text(t("detail.meta.by", detail?.author ?? "@unknown"))
                        .font(.system(size: detailHeaderMetaSize, weight: .regular))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .lineLimit(1)
                }

                Spacer(minLength: 12)

                Button {
                    Task { await viewModel.updateCurrentGroup() }
                } label: {
                    actionIcon(.update, size: 14)
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .rotationEffect(.degrees(updateButtonRotation))
                    .frame(width: 32, height: 32)
                }
                .buttonStyle(.plain)
                .background(
                    isUpdating
                        ? AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.24 : 0.18)
                        : AppTheme.toolbarButtonBackground(for: theme)
                )
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(
                            isUpdating ? AppTheme.brand(for: accent, in: theme).opacity(0.45) : AppTheme.cardBorder(for: theme),
                            lineWidth: 0.5
                        )
                }
                .animation(.easeInOut(duration: 0.24), value: isUpdating)
            }

            HStack(alignment: .firstTextBaseline, spacing: 12) {
                detailOriginRow(
                    originLabel: detail?.originLabel ?? t("detail.meta.unknown_source"),
                    starCount: detail?.starCount
                )

                Spacer(minLength: 12)
            }
        }
        .padding(14)
        .frame(minHeight: detailHeaderMinHeight, alignment: .center)
        .background(AppTheme.toolbarGlass(for: theme))
    }

    private func detailSkillHeader(skill: MainViewModel.DetailSkill?, fallbackGroupId: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(skill?.title ?? fallbackGroupId)
                        .font(.system(size: detailHeaderTitleSize, weight: .semibold))
                        .foregroundStyle(AppTheme.brand(for: accent, in: theme))

                    Text(t("detail.meta.by", skill?.author ?? "@unknown"))
                        .font(.system(size: detailHeaderMetaSize, weight: .regular))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .lineLimit(1)
                }

                Spacer(minLength: 12)

                Text(skill?.version.map(normalizedVersionText) ?? "")
                    .font(.system(size: 11, weight: .semibold, design: .monospaced))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
            }

            HStack(alignment: .firstTextBaseline, spacing: 12) {
                if let path = skill?.relativeFolderPath, let folderPath = skill?.folderPath {
                    Button {
                        openPath(folderPath)
                    } label: {
                        detailOriginRow(originLabel: path, starCount: skill?.starCount)
                    }
                    .buttonStyle(.plain)
                } else {
                    detailOriginRow(originLabel: skill?.originLabel ?? ".", starCount: skill?.starCount)
                }

                Spacer(minLength: 12)
            }
        }
        .padding(14)
        .frame(minHeight: detailHeaderMinHeight, alignment: .center)
        .background(AppTheme.toolbarGlass(for: theme))
    }

    private func detailGroupListRow(groupId: String, detail: MainViewModel.DetailViewData?) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(detail?.title ?? groupId)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(1)
                Text(t("detail.meta.by", detail?.author ?? "@unknown"))
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .lineLimit(1)
            }

            Spacer(minLength: 10)

            detailToggleButton(selection: detail?.skillSelection ?? .empty) {
                Task { await viewModel.toggleAllSkills(sourceId: groupId) }
            }
        }
        .frame(height: detailGroupRowHeight)
        .contentShape(Rectangle())
        .onTapGesture {
            selectGroupOverview(groupId: groupId, detail: detail)
        }
        .onHover { isHovering in
            detailHoveredItemIdByGroup[groupId] = isHovering ? detailGroupItemId(groupId) : nil
        }
    }

    private var detailSkillsLabelRow: some View {
        HStack {
            Rectangle()
                .fill(AppTheme.border(for: theme))
                .frame(height: 1)
        }
        .frame(height: 10)
    }

    private func detailSkillListRow(groupId: String, skill: MainViewModel.DetailSkill) -> some View {
        let versionText = skill.version.map(normalizedVersionText)
        let isPending = pendingDetailSkillIdByGroup[groupId] == skill.id

        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(skill.title)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(1)
                if let versionText {
                    Text(versionText)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .lineLimit(1)
                }
            }
            .frame(maxHeight: .infinity, alignment: .center)

            Spacer(minLength: 10)

            Button(skill.isEnabled ? t("group_card.selection.on") : t("group_card.selection.off")) {
                Task { await viewModel.setSkillEnabled(skill.id, enabled: !skill.isEnabled, sourceId: groupId) }
            }
            .buttonStyle(.plain)
            .font(.system(size: 10, weight: .bold))
            .frame(width: detailToggleWidth, height: detailToggleHeight)
            .background(AppTheme.selectionControlFill(skill.isEnabled ? .full : .empty, for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .foregroundStyle(AppTheme.selectionControlText(skill.isEnabled ? .full : .empty, for: theme))
        }
        .frame(height: detailSkillRowHeight)
        .opacity(isPending ? 0.72 : 1)
        .contentShape(Rectangle())
        .onTapGesture {
            scheduleSkillSelection(groupId: groupId, skill: skill)
        }
        .onHover { isHovering in
            detailHoveredItemIdByGroup[groupId] = isHovering ? detailSkillItemId(skill.id) : nil
        }
    }

    private func detailOriginRow(originLabel: String, starCount: Int?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(t("detail.meta.from", originLabel))
                .font(.system(size: detailHeaderMetaSize, weight: .regular))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .lineLimit(1)

            if let starCount {
                Text(t("detail.meta.star", formattedStarCount(starCount)))
                    .font(.system(size: detailHeaderMetaSize, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .lineLimit(1)

                if let image = ActionIcon.star.symbolImage(
                    size: detailHeaderMetaSize,
                    foreground: AppTheme.textMutedNSColor(for: theme)
                ) {
                    Image(nsImage: image)
                        .interpolation(.high)
                        .antialiased(true)
                }
            }
        }
    }

    private func formattedStarCount(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    private func detailGroupDocuments(_ detail: MainViewModel.DetailViewData, groupId: String) -> some View {
        let isDocumentLoading = pendingDetailDocumentIdByGroup[groupId] != nil

        return VStack(alignment: .leading, spacing: 10) {
            Text(t("detail.section.documents"))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(detail.groupDocuments) { document in
                        documentTabChip(
                            title: document.title,
                            isSelected: selectedGroupDocument(for: detail, groupId: groupId)?.id == document.id,
                            externalURL: document.externalURL
                        ) {
                            scheduleGroupDocumentSelection(groupId: groupId, documentId: document.id)
                        }
                    }
                }
            }

            if isDocumentLoading {
                detailContentCard {
                    detailDocumentLoadingPlaceholder()
                }
            } else if let selectedDocument = selectedGroupDocument(for: detail, groupId: groupId) {
                if selectedDocument.id == detail.groupDocuments.first?.id {
                    detailFileTreeCard(detail.fileTree)
                } else {
                    detailContentCard {
                        detailDocumentContent(document: selectedDocument)
                    }
                }
            }
        }
    }

    private func detailAgentRail(groupId: String, detail: MainViewModel.DetailViewData?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("detail.section.agents"))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    detailToggleButton(selection: detail?.targetSelection ?? .empty) {
                        Task { await viewModel.toggleAllTargets(sourceId: groupId) }
                    }

                    ForEach(detail?.targets ?? []) { target in
                        Button {
                            Task { await viewModel.setTargetEnabled(target.id, enabled: !target.isEnabled, sourceId: groupId) }
                        } label: {
                            HStack(spacing: 10) {
                                if let image = AgentIconLibrary.symbolImage(
                                    for: target.id,
                                    foreground: agentIconForeground(isEnabled: target.isEnabled),
                                    cropToVisibleBounds: true
                                ) {
                                    Image(nsImage: image)
                                        .renderingMode(.original)
                                        .resizable()
                                        .scaledToFit()
                                        .frame(width: detailAgentIconSize, height: detailAgentIconSize)
                                } else {
                                    Text(target.shortLabel.uppercased())
                                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                                        .frame(width: detailAgentIconSize, height: detailAgentIconSize)
                                }

                                Text(target.label)
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                                    .lineLimit(1)
                            }
                            .padding(.horizontal, 14)
                            .frame(height: detailAgentItemHeight)
                            .background(target.isEnabled ? AppTheme.brand(for: accent, in: theme).opacity(0.18) : AppTheme.documentBlock(for: theme))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10)
                                    .stroke(target.isEnabled ? AppTheme.brand(for: accent, in: theme).opacity(0.45) : Color.clear, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func detailPathRow(title: String, path: String?, fallbackText: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            Button {
                if let path {
                    openPath(path)
                }
            } label: {
                Text(path ?? fallbackText)
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(AppTheme.toolbarButtonBackground(for: theme))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
            }
            .buttonStyle(.plain)
        }
    }

    private func detailMetadataSection(
        title: String,
        lines: [String],
        externalURL: String? = nil
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 8) {
                Text(title)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .textCase(.uppercase)

                if let externalURL {
                    Button {
                        openExternalURL(externalURL)
                    } label: {
                        actionIcon(.externalLink, size: 10)
                            .foregroundStyle(AppTheme.textMuted(for: theme))
                    }
                    .buttonStyle(.plain)
                }
            }

            detailContentCard {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(lines, id: \.self) { line in
                        Text(line)
                            .font(.system(size: 11, weight: .regular, design: .monospaced))
                            .foregroundStyle(AppTheme.textPrimary(for: theme))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .textSelection(.enabled)
                    }
                }
            }
        }
    }

    private func detailFileTreeCard(_ lines: [MainViewModel.FileTreeLine]) -> some View {
        detailContentCard {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(lines) { line in
                    Text("\(line.prefix)\(line.title)")
                        .font(.system(size: 11, weight: line.isFile ? .semibold : .regular, design: .monospaced))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
            }
        }
    }

    @ViewBuilder
    private func detailDocumentContent(document: MainViewModel.DocumentTab) -> some View {
        if document.isMarkdown {
            MarkdownDocumentView(document: document, theme: theme)
                .equatable()
                .id(document.renderCacheKey)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text(document.content)
                .font(.system(size: 11, weight: .regular, design: .monospaced))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .id(document.renderCacheKey)
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
    }

    private func selectedDocument(for skill: MainViewModel.DetailSkill) -> MainViewModel.DocumentTab? {
        let selectedId = pendingDetailDocumentIdBySkill[skill.id]
            ?? detailDocumentTabIdBySkill[skill.id]
            ?? skill.documents.first?.id
        return skill.documents.first(where: { $0.id == selectedId }) ?? skill.documents.first
    }

    private func selectedGroupDocument(
        for detail: MainViewModel.DetailViewData,
        groupId: String
    ) -> MainViewModel.DocumentTab? {
        let selectedId = pendingDetailDocumentIdByGroup[groupId]
            ?? detailDocumentTabIdByGroup[groupId]
            ?? detail.groupDocuments.first?.id
        return detail.groupDocuments.first(where: { $0.id == selectedId }) ?? detail.groupDocuments.first
    }

    private func detailSelectedItemId(groupId: String, selectedSkillId: String?) -> String {
        if isShowingGroupOverview(groupId) {
            return detailGroupItemId(groupId)
        }
        if let selectedSkillId {
            return detailSkillItemId(selectedSkillId)
        }
        return detailGroupItemId(groupId)
    }

    private func detailGroupItemId(_ groupId: String) -> String {
        "group:\(groupId)"
    }

    private func detailSkillItemId(_ skillId: String) -> String {
        "skill:\(skillId)"
    }

    private func detailIndicatorFrame(itemId: String?, skillCount: Int) -> CGRect? {
        guard let itemId else {
            return nil
        }
        if itemId.hasPrefix("group:") {
            return CGRect(
                x: 0,
                y: (detailGroupRowHeight - detailIndicatorHeight) / 2,
                width: 4,
                height: detailIndicatorHeight
            )
        }
        guard itemId.hasPrefix("skill:") else {
            return nil
        }
        let index = max(0, detailSkillIndex(from: itemId))
        let originY = detailGroupRowHeight
            + detailSkillDividerHeight
            + CGFloat(index) * detailSkillRowHeight
            + ((detailSkillRowHeight - detailIndicatorHeight) / 2)
        return CGRect(x: 0, y: originY, width: 4, height: detailIndicatorHeight)
    }

    private func detailSkillIndex(from itemId: String) -> Int {
        let skillId = itemId.replacingOccurrences(of: "skill:", with: "")
        guard case .detail(let sourceId) = viewModel.currentPage,
              let detail = viewModel.detailViewData(for: sourceId),
              let index = detail.skills.firstIndex(where: { $0.id == skillId }) else {
            return 0
        }
        return index
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

    private func normalizedVersionText(_ version: String) -> String {
        let normalizedVersion = version.lowercased().hasPrefix("v") ? version : "v\(version)"
        return t("detail.version", normalizedVersion)
    }

    private func agentIconForeground(isEnabled: Bool) -> NSColor {
        switch theme {
        case .light:
            return isEnabled
                ? NSColor(calibratedRed: 15.0 / 255.0, green: 23.0 / 255.0, blue: 42.0 / 255.0, alpha: 1)
                : NSColor(calibratedRed: 100.0 / 255.0, green: 116.0 / 255.0, blue: 139.0 / 255.0, alpha: 1)
        case .dark:
            return isEnabled
                ? NSColor(calibratedRed: 241.0 / 255.0, green: 245.0 / 255.0, blue: 249.0 / 255.0, alpha: 1)
                : NSColor(calibratedRed: 148.0 / 255.0, green: 163.0 / 255.0, blue: 184.0 / 255.0, alpha: 1)
        }
    }

    private func detailSaveLabel(_ detail: MainViewModel.DetailViewData?) -> String {
        guard let detail else {
            return t("detail.save.no_detail")
        }

        switch detail.saveState.phase {
        case .idle:
            return t("detail.save.agents", String(detail.enabledTargetCount))
        case .saving:
            return t("detail.save.applying")
        case .saved:
            return t("detail.save.saved")
        case .failed:
            return t("detail.save.failed")
        }
    }

    private func importPage(layout: LayoutMetrics) -> some View {
        ScrollView {
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
                        title: viewModel.importSubmittedQuery.isEmpty ? t("import.section.recommended") : t("import.section.search_results"),
                        subtitle: "",
                        badge: "\(importDisplayItems.count)"
                    )

                    if case .loading = viewModel.importSearchPhase, importDisplayItems.isEmpty {
                        emptyState(
                            title: t("import.loading.title"),
                            subtitle: t("import.loading.subtitle")
                        )
                    } else if case .failed(let message) = viewModel.importSearchPhase, importDisplayItems.isEmpty {
                        emptyState(
                            title: t("import.failed.title"),
                            subtitle: message.resolve(locale: locale)
                        )
                    } else if importDisplayItems.isEmpty {
                        emptyState(
                            title: t("home.empty.title"),
                            subtitle: viewModel.importSubmittedQuery.isEmpty
                                ? t("import.empty.recommended")
                                : t("import.empty.search")
                        )
                    } else {
                        HStack {
                            Spacer(minLength: 0)
                            LazyVGrid(columns: gridColumns(for: layout), spacing: 12) {
                                ForEach(importDisplayItems) { item in
                                    SharedGroupCard(
                                        card: importCardModel(for: item),
                                        theme: theme,
                                        accent: accent,
                                        displayMode: .importPage,
                                        skillsCollapsed: false,
                                        isUpdating: viewModel.isImportingImportGroup(item.id),
                                        onOpen: nil,
                                        onUpdate: {},
                                        onTogglePinned: {},
                                        onDelete: {},
                                        onToggleSkill: { skillId, enabled in
                                            setImportSkill(skillId, enabled: enabled, for: item)
                                        },
                                        onToggleAllSkills: {
                                            toggleAllImportSkills(for: item)
                                        },
                                        onToggleTarget: { targetId, enabled in
                                            setImportTarget(targetId, enabled: enabled, for: item)
                                        },
                                        onToggleAllTargets: {
                                            toggleAllImportTargets(for: item)
                                        },
                                        actionButtonTitle: nil,
                                        actionButtonIcon: ActionIcon.import,
                                        onActionButton: {
                                            let draft = importDraft(for: item)
                                            Task {
                                                await viewModel.importImportGroup(
                                                    groupId: item.id,
                                                    locator: item.locator,
                                                    selectedSkillIds: draft.selectedSkillIds,
                                                    enabledTargets: draft.enabledTargetIds
                                                )
                                            }
                                        }
                                    )
                                    .task(id: item.id) {
                                        await viewModel.previewImportGroupIfNeeded(item.id)
                                    }
                                }
                            }
                            .frame(maxWidth: layout.gridFrameWidth, alignment: .center)
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
                if importSearchText.isEmpty {
                    Text(activeImportSearchPrompt)
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundStyle(AppTheme.searchPlaceholder(for: theme))
                        .lineLimit(1)
                        .id(activeImportSearchPrompt)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                        .allowsHitTesting(false)
                }

                TextField("", text: $importSearchText)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .onSubmit {
                        Task {
                            await viewModel.submitImportSearch(importSearchText)
                        }
                    }
            }
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity, minHeight: detailAgentItemHeight, alignment: .leading)
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
                await viewModel.submitImportSearch(importSearchText)
            }
        } label: {
            actionIcon(.search, size: 12)
                .foregroundStyle(AppTheme.pageBackground(for: theme))
                .frame(width: detailAgentItemHeight, height: detailAgentItemHeight)
                .background(AppTheme.brand(for: accent, in: theme))
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
    }

    private func settingsPage(layout: LayoutMetrics) -> some View {
        ScrollView {
            SettingsView(theme: theme)
                .padding(16)
        }
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

    private var activeImportSearchPrompt: String {
        guard !importSearchPrompts.isEmpty else { return "" }
        return importSearchPrompts[importPlaceholderIndex % importSearchPrompts.count]
    }

    private var importSearchPrompts: [String] {
        [
            "anthropic/skills",
            "https://github.com/anthropics/skills",
            "https://github.com/anthropics/skills.git",
            "git@github.com:anthropics/skills.git",
        ]
    }

    private var importDisplayItems: [RecommendedImport] {
        viewModel.importDisplayGroups.map { item in
            RecommendedImport(
                id: item.id,
                title: item.title,
                locator: item.locator,
                summary: importCardSummary(for: item),
                aliases: item.aliases,
                sourceFacts: importSourceFacts(for: item),
                skills: item.skills.map { skill in
                    ImportSkill(
                        id: skill.id,
                        title: skill.title,
                        summary: skill.summary
                    )
                },
                targets: item.targets.map(\.id)
            )
        }
    }

    private func importDraft(for item: RecommendedImport) -> ImportDraftState {
        importDraftsByItemId[item.id]
            ?? ImportDraftState(
                selectedSkillIds: item.skills.map(\.id),
                enabledTargetIds: []
            )
    }

    private func importCardModel(for item: RecommendedImport) -> MainViewModel.GroupCardModel {
        let draft = importDraft(for: item)
        let selectedSkillIds = Set(draft.selectedSkillIds)
        let enabledTargetIds = Set(draft.enabledTargetIds)

        return MainViewModel.GroupCardModel(
            id: item.id,
            title: item.title,
            subtitle: importCardSubtitle(for: item),
            metaLine: t("common.meta.from", item.locator),
            isPinned: false,
            health: "DISCOVER",
            warningCount: 0,
            errorCount: 0,
            skillSelection: importSelectionState(allIds: item.skills.map(\.id), selectedIds: draft.selectedSkillIds),
            targetSelection: importSelectionState(allIds: item.targets, selectedIds: draft.enabledTargetIds),
            sourceFacts: item.sourceFacts,
            skills: item.skills.map { skill in
                MainViewModel.GroupCardSkill(
                    id: skill.id,
                    label: skill.title,
                    description: skill.summary,
                    isEnabled: selectedSkillIds.contains(skill.id)
                )
            },
            targets: item.targets.map { targetId in
                MainViewModel.GroupCardTarget(
                    id: targetId,
                    label: targetLabel(targetId),
                    shortLabel: String(targetLabel(targetId).prefix(2)).uppercased(),
                    isEnabled: enabledTargetIds.contains(targetId)
                )
            },
            saveState: MainViewModel.SaveState(phase: .idle, detail: nil)
        )
    }

    private func importCardSummary(for item: MainViewModel.ImportGroupItem) -> String {
        if !item.summary.isEmpty {
            return item.summary
        }
        if !item.matchedSkillNames.isEmpty {
            return item.matchedSkillNames.joined(separator: ", ")
        }
        switch item.previewPhase {
        case .loading:
            return t("import.card.summary.loading_skills")
        case .failed(let message):
            return message.resolve(locale: locale)
        default:
            return t("import.card.summary.import_from", item.canonicalRepo)
        }
    }

    private func importSourceFacts(for item: MainViewModel.ImportGroupItem) -> [String] {
        var facts: [String] = []
        if let totalInstalls = item.totalInstalls, totalInstalls > 0 {
            facts.append(t("import.card.facts.installs", formattedStarCount(totalInstalls)))
        }
        if let starCount = item.starCount, starCount > 0 {
            facts.append(t("import.card.facts.stars", formattedStarCount(starCount)))
        }
        if let skillCount = item.skillCount, skillCount > 0 {
            facts.append(t("import.card.facts.skills", String(skillCount)))
        }
        if !item.matchedSkillNames.isEmpty {
            facts.append(t("import.card.facts.matches", item.matchedSkillNames.joined(separator: ", ")))
        }
        return facts
    }

    private func importCardSubtitle(for item: RecommendedImport) -> String {
        let locator = item.locator.trimmingCharacters(in: .whitespacesAndNewlines)
        let patterns = [
            #"github\.com/([^/\s]+)/"#,
            #"git@github\.com:([^/\s]+)/"#,
            #"^([^/\s]+)/"#,
        ]

        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            let range = NSRange(locator.startIndex..<locator.endIndex, in: locator)
            guard let match = regex.firstMatch(in: locator, range: range),
                  match.numberOfRanges > 1,
                  let ownerRange = Range(match.range(at: 1), in: locator)
            else {
                continue
            }

            return t("import.card.subtitle.by_owner", String(locator[ownerRange]))
        }

        return t("import.card.subtitle.recommended")
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

    private func setImportSkill(_ skillId: String, enabled: Bool, for item: RecommendedImport) {
        let current = importDraft(for: item)
        let selected = Set(current.selectedSkillIds)
        let nextSelected: [String]

        if enabled {
            nextSelected = item.skills.map(\.id).filter { selected.union([skillId]).contains($0) }
        } else {
            nextSelected = item.skills.map(\.id).filter { selected.subtracting([skillId]).contains($0) }
        }

        importDraftsByItemId[item.id] = ImportDraftState(
            selectedSkillIds: nextSelected,
            enabledTargetIds: current.enabledTargetIds
        )
    }

    private func toggleAllImportSkills(for item: RecommendedImport) {
        let current = importDraft(for: item)
        let nextSelected = current.selectedSkillIds.count == item.skills.count ? [] : item.skills.map(\.id)
        importDraftsByItemId[item.id] = ImportDraftState(
            selectedSkillIds: nextSelected,
            enabledTargetIds: current.enabledTargetIds
        )
    }

    private func setImportTarget(_ targetId: String, enabled: Bool, for item: RecommendedImport) {
        let current = importDraft(for: item)
        let enabledTargets = Set(current.enabledTargetIds)
        let nextTargets: [String]

        if enabled {
            nextTargets = item.targets.filter { enabledTargets.union([targetId]).contains($0) }
        } else {
            nextTargets = item.targets.filter { enabledTargets.subtracting([targetId]).contains($0) }
        }

        importDraftsByItemId[item.id] = ImportDraftState(
            selectedSkillIds: current.selectedSkillIds,
            enabledTargetIds: nextTargets
        )
    }

    private func toggleAllImportTargets(for item: RecommendedImport) {
        let current = importDraft(for: item)
        let nextTargets = current.enabledTargetIds.count == item.targets.count ? [] : item.targets
        importDraftsByItemId[item.id] = ImportDraftState(
            selectedSkillIds: current.selectedSkillIds,
            enabledTargetIds: nextTargets
        )
    }

    private func pillText(_ text: String, tint: Color, text textColor: Color) -> some View {
        Text(text)
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 7)
            .frame(height: 19)
            .background(tint)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .foregroundStyle(textColor)
    }

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }

    private func targetLabel(_ targetId: String) -> String {
        viewModel.visibleTargets.first(where: { $0.id == targetId })?.label ?? targetId
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
            return AppTheme.toolbarGlass(for: theme)
        case .success:
            return Color.green.opacity(0.22)
        case .neutral:
            return Color.gray.opacity(theme == .dark ? 0.26 : 0.20)
        case .error:
            return Color.red.opacity(0.20)
        }
    }

    private func toastBorder(_ style: MainViewModel.ToastStyle) -> Color {
        switch style {
        case .loading:
            return AppTheme.border(for: theme)
        case .success:
            return Color.green.opacity(0.45)
        case .neutral:
            return Color.gray.opacity(0.40)
        case .error:
            return Color.red.opacity(0.35)
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

    private func preferredDetailSkillId(for detail: MainViewModel.DetailViewData) -> String? {
        detail.skills.first(where: \.isEnabled)?.id ?? detail.skills.first?.id
    }

    private func isShowingGroupOverview(_ groupId: String) -> Bool {
        detailShowsGroupOverviewByGroup[groupId] ?? false
    }

    private func selectGroupOverview(groupId: String, detail: MainViewModel.DetailViewData?) {
        if detailSkillIdByGroup[groupId] == nil, let detail {
            detailSkillIdByGroup[groupId] = preferredDetailSkillId(for: detail)
        }
        detailShowsGroupOverviewByGroup[groupId] = true
    }

    private func selectedDetailSkill(for groupId: String, detail: MainViewModel.DetailViewData?) -> MainViewModel.DetailSkill? {
        guard let detail else { return nil }
        let selectedId = pendingDetailSkillIdByGroup[groupId]
            ?? detailSkillIdByGroup[groupId]
            ?? preferredDetailSkillId(for: detail)
        if detailSkillIdByGroup[groupId] == nil, let selectedId {
            detailSkillIdByGroup[groupId] = selectedId
        }
        return detail.skills.first(where: { $0.id == selectedId }) ?? detail.skills.first
    }

    private func scheduleSkillSelection(groupId: String, skill: MainViewModel.DetailSkill) {
        pendingDetailSkillIdByGroup[groupId] = skill.id
        let token = nextSelectionToken(detailSkillSelectionTokenByGroup[groupId])
        detailSkillSelectionTokenByGroup[groupId] = token

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(40))
            guard detailSkillSelectionTokenByGroup[groupId] == token else { return }
            detailSkillIdByGroup[groupId] = skill.id
            detailShowsGroupOverviewByGroup[groupId] = false
            if detailDocumentTabIdBySkill[skill.id] == nil {
                detailDocumentTabIdBySkill[skill.id] = skill.documents.first?.id
            }
            pendingDetailSkillIdByGroup[groupId] = nil
        }
    }

    private func scheduleSkillDocumentSelection(skillId: String, documentId: String) {
        pendingDetailDocumentIdBySkill[skillId] = documentId
        let token = nextSelectionToken(detailDocumentSelectionTokenBySkill[skillId])
        detailDocumentSelectionTokenBySkill[skillId] = token

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(40))
            guard detailDocumentSelectionTokenBySkill[skillId] == token else { return }
            detailDocumentTabIdBySkill[skillId] = documentId
            pendingDetailDocumentIdBySkill[skillId] = nil
        }
    }

    private func scheduleGroupDocumentSelection(groupId: String, documentId: String) {
        pendingDetailDocumentIdByGroup[groupId] = documentId
        let token = nextSelectionToken(detailDocumentSelectionTokenByGroup[groupId])
        detailDocumentSelectionTokenByGroup[groupId] = token

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(40))
            guard detailDocumentSelectionTokenByGroup[groupId] == token else { return }
            detailDocumentTabIdByGroup[groupId] = documentId
            pendingDetailDocumentIdByGroup[groupId] = nil
        }
    }

    private func nextSelectionToken(_ current: UInt64?) -> UInt64 {
        (current ?? 0) &+ 1
    }

    private func detailSkillLoadingPlaceholder() -> some View {
        VStack(alignment: .leading, spacing: 12) {
            detailLoadingBlock(width: 160)
            detailContentCard {
                detailDocumentLoadingPlaceholder(lineCount: 6)
            }
            detailLoadingBlock(width: 110)
            detailContentCard {
                detailDocumentLoadingPlaceholder(lineCount: 14)
            }
        }
    }

    private func detailDocumentLoadingPlaceholder(lineCount: Int = 10) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                ProgressView()
                    .controlSize(.small)
                Text(t("detail.loading.document"))
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }

            ForEach(0..<lineCount, id: \.self) { index in
                RoundedRectangle(cornerRadius: 5)
                    .fill(AppTheme.toolbarButtonBackground(for: theme))
                    .frame(width: placeholderLineWidth(for: index), height: 10)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func detailLoadingBlock(width: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 5)
            .fill(AppTheme.toolbarButtonBackground(for: theme))
            .frame(width: width, height: 10)
    }

    private func placeholderLineWidth(for index: Int) -> CGFloat {
        let widths: [CGFloat] = [520, 460, 560, 430, 540, 390]
        return widths[index % widths.count]
    }

    private func detailToggleButton(selection: SelectionState, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(detailSwitchLabel(selection))
                .font(.system(size: 10, weight: .bold))
                .frame(width: detailToggleWidth, height: detailToggleHeight)
                .background(detailSwitchFill(selection))
                .foregroundStyle(detailSwitchText(selection))
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }

    private func detailSwitchLabel(_ selection: SelectionState) -> String {
        switch selection {
        case .empty: return t("group_card.selection.off")
        case .partial: return t("group_card.selection.partial")
        case .full: return t("group_card.selection.on")
        }
    }

    private func detailSwitchFill(_ selection: SelectionState) -> Color {
        AppTheme.selectionControlFill(selection, for: theme)
    }

    private func detailSwitchText(_ selection: SelectionState) -> Color {
        AppTheme.selectionControlText(selection, for: theme)
    }

    private func documentTabChip(
        title: String,
        isSelected: Bool,
        externalURL: String?,
        onSelect: @escaping () -> Void
    ) -> some View {
        ZStack(alignment: .trailing) {
            Button(action: onSelect) {
                Text(title)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(1)
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.leading, 10)
                    .padding(.trailing, externalURL == nil ? 10 : 30)
                    .frame(height: detailAgentItemHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if let externalURL {
                Button {
                    openExternalURL(externalURL)
                } label: {
                    actionIcon(.externalLink, size: 10)
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .frame(width: 18, height: 18)
                }
                .buttonStyle(.plain)
                .padding(.trailing, 6)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .background(isSelected ? AppTheme.brand(for: accent, in: theme).opacity(0.22) : AppTheme.documentBlock(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 8))
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
                .frame(width: 34, height: 34)
        }
        .buttonStyle(.plain)
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
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

private struct EmptyStateChrome: ViewModifier {
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
        neutralCardColor(.color2, for: mode)
    }

    static func surface(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color1, for: mode)
    }

    static func groupCardFill(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color1, for: mode)
    }

    static func headerBackground(for mode: DesktopThemeMode) -> Color {
        neutralCardColor(.color2, for: mode)
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

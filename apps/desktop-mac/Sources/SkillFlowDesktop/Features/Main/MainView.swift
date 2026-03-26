import AppKit
import SwiftUI

struct MainView: View {
    private let detailHeaderMinHeight: CGFloat = 76
    private let detailGroupRowHeight: CGFloat = 72
    private let detailSkillRowHeight: CGFloat = 60
    private let detailSkillDividerHeight: CGFloat = 16
    private let detailIndicatorHeight: CGFloat = 36
    private let detailToggleWidth: CGFloat = 34
    private let detailToggleHeight: CGFloat = 34
    private let detailAgentItemHeight: CGFloat = 34
    private let detailAgentIconSize: CGFloat = 20

    private struct RecommendedImport: Identifiable {
        let id: String
        let title: String
        let locator: String
        let summary: String
    }

    @Bindable var viewModel: MainViewModel

    @State private var detailSkillIdByGroup: [String: String] = [:]
    @State private var detailShowsGroupOverviewByGroup: [String: Bool] = [:]
    @State private var detailHoveredItemIdByGroup: [String: String] = [:]
    @State private var detailDocumentTabIdByGroup: [String: String] = [:]
    @State private var detailDocumentTabIdBySkill: [String: String] = [:]
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
            guard case .detail(let groupId) = newValue, let detail = viewModel.detailViewData(for: groupId) else { return }
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
        }
        .task(id: viewModel.toast?.id) {
            guard let toast = viewModel.toast, toast.style != .loading else { return }
            let toastId = toast.id
            try? await Task.sleep(for: .seconds(2))
            viewModel.dismissToast(id: toastId)
        }
        .task {
            if case .idle = viewModel.loadState {
                await viewModel.bootstrap()
                if let first = viewModel.sourceIds.first {
                    await viewModel.selectSource(first)
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
                    Image(systemName: "arrow.left")
                        .font(.system(size: 14, weight: .semibold))
                }
                .buttonStyle(.plain)
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .frame(width: 22, height: 22)

                Text(currentPageTitle)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
            }
        }
    }

    private var isHomePage: Bool {
        viewModel.currentPage == .home
    }

    private var headerLogoRow: some View {
        HStack(spacing: 8) {
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

            Text("Skill Flow")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 11, weight: .medium))
                .foregroundStyle(AppTheme.textMuted(for: theme))
            TextField("Search Group / Author", text: $viewModel.searchQuery)
                .textFieldStyle(.plain)
                .font(.system(size: 10, weight: .medium))
                .textCase(.uppercase)
        }
        .padding(.horizontal, 12)
        .frame(width: 320, height: 34, alignment: .leading)
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var importButton: some View {
        Button("Import") {
            viewModel.currentPage = .importPage
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .frame(height: 34)
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .foregroundStyle(AppTheme.textPrimary(for: theme))
        .font(.system(size: 10, weight: .bold))
        .textCase(.uppercase)
    }

    private var settingsButton: some View {
        Button("Settings") {
            viewModel.currentPage = .settings
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .frame(height: 34)
        .background(AppTheme.headerControlFill(for: theme))
        .shadow(color: AppTheme.controlShadow(for: theme), radius: 4, x: 0, y: 2)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .foregroundStyle(AppTheme.textPrimary(for: theme))
        .font(.system(size: 10, weight: .bold))
        .textCase(.uppercase)
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
        ScrollView {
            gridSection(layout: layout)
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 24)
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
                        title: "No groups matched",
                        subtitle: "Try a broader search query."
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
                                displayMode: .standard,
                                skillsCollapsed: false,
                                onOpen: {
                                    viewModel.currentPage = .detail(sourceId: card.id)
                                    Task { await viewModel.selectSource(card.id) }
                                },
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
            Text("Loading groups")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
        }
        .frame(maxWidth: .infinity, minHeight: 220)
    }

    private var currentPageTitle: String {
        switch viewModel.currentPage {
        case .home:
            return "Home"
        case .importPage:
            return "Import"
        case .settings:
            return "Settings"
        case .detail:
            return "Group Detail"
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
                .padding(.vertical, 10)
            }
            .padding(16)
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
                    } else if let selectedSkill {
                        detailSkillOverview(skill: selectedSkill)
                    } else {
                        emptyState(title: "No skill selected", subtitle: "Choose one skill from the left list.")
                    }
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .topLeading)
            }
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
            detailAgentRail(groupId: groupId, detail: detail)

            HStack(spacing: 12) {
                detailOverviewCard(
                    title: "Skills",
                    lines: [
                        "\(detail?.enabledSkillCount ?? 0) enabled",
                        "\(detail?.totalSkillCount ?? 0) total",
                    ]
                )
                Rectangle()
                    .fill(AppTheme.border(for: theme))
                    .frame(width: 1)
                detailOverviewCard(
                    title: "Agents",
                    lines: [
                        "\(detail?.enabledTargetCount ?? 0) enabled",
                        detail?.targetSelection == .partial ? "Mixed selection" : "Selection synced",
                    ]
                )
                Rectangle()
                    .fill(AppTheme.border(for: theme))
                    .frame(width: 1)
                detailOverviewCard(
                    title: "Health",
                    lines: [
                        detail?.health ?? "UNKNOWN",
                        "Warnings \(detail?.warningCount ?? 0) · Errors \(detail?.errorCount ?? 0)",
                    ]
                )
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)

            detailPathRow(
                title: "Path",
                path: detail?.groupPath,
                fallbackText: detail?.locator ?? "Path unavailable"
            )

            if let detail, !detail.groupDocuments.isEmpty {
                detailGroupDocuments(detail, groupId: groupId)
            }
        }
    }

    private func detailSkillOverview(skill: MainViewModel.DetailSkill) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Skill Description")
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

            if !skill.metadata.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Skill Metadata")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .textCase(.uppercase)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(skill.metadata) { entry in
                                Text("\(entry.key): \(entry.value)")
                                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                                    .padding(.horizontal, 10)
                                    .frame(height: 30)
                                    .background(AppTheme.toolbarButtonBackground(for: theme))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                            }
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 10) {
                Text("Documents")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .textCase(.uppercase)

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(skill.documents) { document in
                            Button {
                                detailDocumentTabIdBySkill[skill.id] = document.id
                            } label: {
                                Text(document.title)
                                    .font(.system(size: 11, weight: .semibold))
                                    .padding(.horizontal, 10)
                                    .frame(height: 30)
                                    .background(selectedDocument(for: skill)?.id == document.id ? AppTheme.brand(for: accent, in: theme).opacity(0.22) : AppTheme.toolbarButtonBackground(for: theme))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                detailContentCard {
                    if let document = selectedDocument(for: skill) {
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
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                Text("\(detail?.title ?? fallbackGroupId) by \(detail?.author ?? "@unknown")")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))

                Spacer(minLength: 12)

                Button("Update") {
                    Task { await viewModel.updateCurrentGroup() }
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 12)
                .frame(height: 32)
                .background(AppTheme.toolbarButtonBackground(for: theme))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .font(.system(size: 11, weight: .bold))
            }

            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text("from \(detail?.originLabel ?? "unknown source")")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .lineLimit(1)

                Spacer(minLength: 12)

                Text(detail?.updatedRelative ?? "Updated time unavailable")
                    .font(.system(size: 10, weight: .regular, design: .monospaced))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }
        }
        .padding(14)
        .frame(minHeight: detailHeaderMinHeight, alignment: .center)
        .background(AppTheme.toolbarGlass(for: theme))
    }

    private func detailSkillHeader(skill: MainViewModel.DetailSkill?, fallbackGroupId: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                Text(skill?.title ?? fallbackGroupId)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))

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
                        Text("from \(path)")
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundStyle(AppTheme.textMuted(for: theme))
                            .lineLimit(1)
                    }
                    .buttonStyle(.plain)
                } else {
                    Text("from .")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
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
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(1)
                Text("by \(detail?.author ?? "@unknown")")
                    .font(.system(size: 11, weight: .medium))
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
        .frame(height: 16)
    }

    private func detailSkillListRow(groupId: String, skill: MainViewModel.DetailSkill) -> some View {
        let versionText = skill.version.map(normalizedVersionText)

        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(skill.title)
                    .font(.system(size: 13, weight: .semibold))
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

            Button(skill.isEnabled ? "ON" : "OFF") {
                Task { await viewModel.setSkillEnabled(skill.id, enabled: !skill.isEnabled, sourceId: groupId) }
            }
            .buttonStyle(.plain)
            .font(.system(size: 10, weight: .bold))
            .frame(width: detailToggleWidth, height: detailToggleHeight)
            .background(skill.isEnabled ? Color.green.opacity(0.25) : Color.gray.opacity(0.24))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .foregroundStyle(skill.isEnabled ? detailSwitchText(.full) : detailSwitchText(.empty))
        }
        .frame(height: detailSkillRowHeight)
        .contentShape(Rectangle())
        .onTapGesture {
            detailSkillIdByGroup[groupId] = skill.id
            detailShowsGroupOverviewByGroup[groupId] = false
            if detailDocumentTabIdBySkill[skill.id] == nil {
                detailDocumentTabIdBySkill[skill.id] = skill.documents.first?.id
            }
        }
        .onHover { isHovering in
            detailHoveredItemIdByGroup[groupId] = isHovering ? detailSkillItemId(skill.id) : nil
        }
    }

    private func detailGroupDocuments(_ detail: MainViewModel.DetailViewData, groupId: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Documents")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(detail.groupDocuments) { document in
                        Button {
                            detailDocumentTabIdByGroup[groupId] = document.id
                        } label: {
                            Text(document.title)
                                .font(.system(size: 11, weight: .semibold))
                                .padding(.horizontal, 10)
                                .frame(height: 30)
                                .background(selectedGroupDocument(for: detail, groupId: groupId)?.id == document.id ? AppTheme.brand(for: accent, in: theme).opacity(0.22) : AppTheme.toolbarButtonBackground(for: theme))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                                .foregroundStyle(AppTheme.textPrimary(for: theme))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            if let selectedDocument = selectedGroupDocument(for: detail, groupId: groupId) {
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
            Text("Agents")
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
                            .background(target.isEnabled ? AppTheme.brand(for: accent, in: theme).opacity(0.18) : AppTheme.toolbarButtonBackground(for: theme))
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
        } else {
            Text(document.content)
                .font(.system(size: 11, weight: .regular, design: .monospaced))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .frame(maxWidth: .infinity, alignment: .leading)
                .textSelection(.enabled)
        }
    }

    private func selectedDocument(for skill: MainViewModel.DetailSkill) -> MainViewModel.DocumentTab? {
        let selectedId = detailDocumentTabIdBySkill[skill.id] ?? skill.documents.first?.id
        return skill.documents.first(where: { $0.id == selectedId }) ?? skill.documents.first
    }

    private func selectedGroupDocument(
        for detail: MainViewModel.DetailViewData,
        groupId: String
    ) -> MainViewModel.DocumentTab? {
        let selectedId = detailDocumentTabIdByGroup[groupId] ?? detail.groupDocuments.first?.id
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

    private func normalizedVersionText(_ version: String) -> String {
        version.lowercased().hasPrefix("v") ? "Version \(version)" : "Version v\(version)"
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
            return "No detail"
        }

        switch detail.saveState.phase {
        case .idle:
            return "\(detail.enabledTargetCount) agents"
        case .saving:
            return "Applying..."
        case .saved:
            return "Saved"
        case .failed:
            return "Save failed"
        }
    }

    private func importPage(layout: LayoutMetrics) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                pageSectionCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Import Source")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(AppTheme.textPrimary(for: theme))
                        Text("Enter a repo, local path, or package locator. Recommended repositories are listed below.")
                            .font(.system(size: 12, weight: .regular))
                            .foregroundStyle(AppTheme.textMuted(for: theme))
                        TextField("repo / path / clawhub:package", text: $viewModel.newSourceLocator)
                            .textFieldStyle(.plain)
                            .font(.system(size: 12, weight: .medium, design: .monospaced))
                            .padding(.horizontal, 12)
                            .frame(height: 42)
                            .background(AppTheme.toolbarButtonBackground(for: theme))
                            .clipShape(RoundedRectangle(cornerRadius: 10))

                        HStack(spacing: 10) {
                            Button(viewModel.importPreview == nil ? "Preview" : "Refresh Preview") {
                                Task { await viewModel.prepareImport() }
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 14)
                            .frame(height: 34)
                            .background(AppTheme.brand(for: accent, in: theme))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(AppTheme.pageBackground(for: theme))
                            .font(.system(size: 11, weight: .bold))

                            Button("Back") {
                                Task {
                                    await viewModel.discardPreparedImport()
                                    viewModel.currentPage = .home
                                }
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 14)
                            .frame(height: 34)
                            .background(AppTheme.toolbarButtonBackground(for: theme))
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(AppTheme.textPrimary(for: theme))
                            .font(.system(size: 11, weight: .bold))
                        }

                        if case .preparing = viewModel.importPhase {
                            Text("Preparing import preview...")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(AppTheme.textMuted(for: theme))
                        } else if case .importing = viewModel.importPhase {
                            Text("Importing source...")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(AppTheme.textMuted(for: theme))
                        } else if case .failed(let message) = viewModel.importPhase {
                            Text(message)
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(Color.red)
                        }
                    }
                }

                if let preview = viewModel.importPreview {
                    pageSectionCard {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Preview")
                                        .font(.system(size: 14, weight: .semibold))
                                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                                    Text(preview.locator)
                                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                                        .foregroundStyle(AppTheme.textMuted(for: theme))
                                        .lineLimit(1)
                                }
                                Spacer()
                                Text(preview.kind.uppercased())
                                    .font(.system(size: 10, weight: .bold))
                                    .padding(.horizontal, 10)
                                    .frame(height: 26)
                                    .background(AppTheme.toolbarButtonBackground(for: theme))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                            }

                            HStack(spacing: 12) {
                                detailOverviewCard(title: "Skills", lines: ["\(preview.skills.count) detected", "\(preview.selectedLeafIds.count) selected"])
                                detailOverviewCard(title: "Agents", lines: ["\(preview.availableTargets.count) available", "\(preview.enabledTargets.count) enabled"])
                            }

                            if !preview.warnings.isEmpty {
                                detailOverviewCard(title: "Warnings", lines: preview.warnings)
                            }

                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text("Skills")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                                    Spacer()
                                    detailToggleButton(selection: viewModel.importSkillSelectionState()) {
                                        viewModel.toggleAllImportSkills()
                                    }
                                }
                                ForEach(preview.skills) { skill in
                                    HStack(spacing: 10) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(skill.title)
                                                .font(.system(size: 12, weight: .semibold))
                                                .foregroundStyle(AppTheme.textPrimary(for: theme))
                                            Text(skill.relativePath)
                                                .font(.system(size: 10, weight: .medium, design: .monospaced))
                                                .foregroundStyle(AppTheme.textMuted(for: theme))
                                                .lineLimit(1)
                                        }
                                        Spacer()
                                        Button(skill.isSelected ? "ON" : "OFF") {
                                            viewModel.toggleImportSkill(skill.id)
                                        }
                                        .buttonStyle(.plain)
                                        .font(.system(size: 10, weight: .bold))
                                        .frame(width: detailToggleWidth, height: detailToggleHeight)
                                        .background(skill.isSelected ? Color.green.opacity(0.25) : Color.gray.opacity(0.20))
                                        .foregroundStyle(skill.isSelected ? Color.green : AppTheme.textPrimary(for: theme))
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                    }
                                    .padding(12)
                                    .background(AppTheme.toolbarButtonBackground(for: theme))
                                    .clipShape(RoundedRectangle(cornerRadius: 10))
                                }
                            }

                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text("Agents")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                                    Spacer()
                                    detailToggleButton(selection: viewModel.importTargetSelectionState()) {
                                        viewModel.toggleAllImportTargets()
                                    }
                                }
                                LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 10)], spacing: 10) {
                                    ForEach(preview.availableTargets, id: \.self) { targetId in
                                        let isEnabled = preview.enabledTargets.contains(targetId)
                                        HStack(spacing: 10) {
                                            Text(targetLabel(targetId))
                                                .font(.system(size: 11, weight: .semibold))
                                                .foregroundStyle(AppTheme.textPrimary(for: theme))
                                                .lineLimit(1)
                                            Spacer(minLength: 6)
                                            Button(isEnabled ? "ON" : "OFF") {
                                                viewModel.toggleImportTarget(targetId)
                                            }
                                            .buttonStyle(.plain)
                                            .font(.system(size: 10, weight: .bold))
                                            .frame(width: detailToggleWidth, height: detailToggleHeight)
                                            .background(isEnabled ? Color.green.opacity(0.25) : Color.gray.opacity(0.22))
                                            .foregroundStyle(isEnabled ? Color.green : AppTheme.textPrimary(for: theme))
                                            .clipShape(RoundedRectangle(cornerRadius: 8))
                                        }
                                        .padding(12)
                                        .background(AppTheme.toolbarButtonBackground(for: theme))
                                        .clipShape(RoundedRectangle(cornerRadius: 10))
                                    }
                                }
                            }

                            HStack(spacing: 10) {
                                Button("Confirm Import") {
                                    Task { await viewModel.confirmPreparedImport() }
                                }
                                .buttonStyle(.plain)
                                .padding(.horizontal, 14)
                                .frame(height: 34)
                                .background(AppTheme.brand(for: accent, in: theme))
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .foregroundStyle(AppTheme.pageBackground(for: theme))
                                .font(.system(size: 11, weight: .bold))

                                Button("Discard Preview") {
                                    Task { await viewModel.discardPreparedImport() }
                                }
                                .buttonStyle(.plain)
                                .padding(.horizontal, 14)
                                .frame(height: 34)
                                .background(AppTheme.toolbarButtonBackground(for: theme))
                                .clipShape(RoundedRectangle(cornerRadius: 10))
                                .foregroundStyle(AppTheme.textPrimary(for: theme))
                                .font(.system(size: 11, weight: .bold))
                            }
                        }
                    }
                }

                pageSectionCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Recommended Repositories")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(AppTheme.textPrimary(for: theme))
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 12)], spacing: 12) {
                            ForEach(recommendedImports) { item in
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(item.title)
                                        .font(.system(size: 13, weight: .semibold))
                                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                                    Text(item.locator)
                                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                                        .foregroundStyle(AppTheme.textMuted(for: theme))
                                        .lineLimit(1)
                                    Text(item.summary)
                                        .font(.system(size: 11, weight: .regular))
                                        .foregroundStyle(AppTheme.textMuted(for: theme))
                                        .lineLimit(3)
                                    Spacer(minLength: 0)
                                    Button("Use") {
                                        viewModel.newSourceLocator = item.locator
                                    }
                                    .buttonStyle(.plain)
                                    .padding(.horizontal, 12)
                                    .frame(height: 30)
                                    .background(AppTheme.toolbarButtonBackground(for: theme))
                                    .clipShape(RoundedRectangle(cornerRadius: 8))
                                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                                    .font(.system(size: 10, weight: .bold))
                                }
                                .padding(14)
                                .frame(maxWidth: .infinity, minHeight: 150, alignment: .topLeading)
                                .background(AppTheme.toolbarButtonBackground(for: theme))
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
    }

    private func settingsPage(layout: LayoutMetrics) -> some View {
        ScrollView {
            SettingsView(cardStyle: true, theme: theme)
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
                Text(subtitle)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
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

    private func emptyState(title: String, subtitle: String) -> some View {
        VStack(spacing: 6) {
            Text(title)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
            Text(subtitle)
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(AppTheme.textMuted(for: theme))
        }
        .frame(maxWidth: .infinity, minHeight: 200)
        .background(AppTheme.toolbarButtonBackground(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: AppTheme.softShadow(for: theme), radius: 10, x: 0, y: 6)
    }

    private func gridColumns(for layout: LayoutMetrics) -> [GridItem] {
        Array(repeating: GridItem(.fixed(304), spacing: 14), count: layout.gridColumnCount)
    }

    private var groupCards: [MainViewModel.GroupCardModel] {
        viewModel.groupCards
    }

    private var recommendedImports: [RecommendedImport] {
        [
            RecommendedImport(
                id: "vercel-skills",
                title: "Vercel Agent Skills",
                locator: "vercel-labs/agent-skills",
                summary: "General-purpose curated agent skills for common coding workflows."
            ),
            RecommendedImport(
                id: "gstack",
                title: "GStack Skills",
                locator: "garrytan/gstack",
                summary: "Workflow and review-oriented skills with strong planning and QA helpers."
            ),
            RecommendedImport(
                id: "skill-flow",
                title: "Skill Flow Samples",
                locator: "VintLin/skill-flow",
                summary: "Use the project itself as a reference source while shaping desktop interactions."
            ),
        ]
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
        let selectedId = detailSkillIdByGroup[groupId] ?? preferredDetailSkillId(for: detail)
        if detailSkillIdByGroup[groupId] == nil, let selectedId {
            detailSkillIdByGroup[groupId] = selectedId
        }
        return detail.skills.first(where: { $0.id == selectedId }) ?? detail.skills.first
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
        case .empty: return "OFF"
        case .partial: return "MIX"
        case .full: return "ON"
        }
    }

    private func detailSwitchFill(_ selection: SelectionState) -> Color {
        switch selection {
        case .empty:
            return Color(red: 148.0 / 255.0, green: 163.0 / 255.0, blue: 184.0 / 255.0).opacity(0.30)
        case .partial:
            return Color(red: 234.0 / 255.0, green: 179.0 / 255.0, blue: 8.0 / 255.0).opacity(0.32)
        case .full:
            return Color(red: 34.0 / 255.0, green: 197.0 / 255.0, blue: 94.0 / 255.0).opacity(0.26)
        }
    }

    private func detailSwitchText(_ selection: SelectionState) -> Color {
        switch selection {
        case .empty:
            return Color(red: 71.0 / 255.0, green: 85.0 / 255.0, blue: 105.0 / 255.0)
        case .partial:
            return Color(red: 146.0 / 255.0, green: 64.0 / 255.0, blue: 14.0 / 255.0)
        case .full:
            return Color(red: 22.0 / 255.0, green: 101.0 / 255.0, blue: 52.0 / 255.0)
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

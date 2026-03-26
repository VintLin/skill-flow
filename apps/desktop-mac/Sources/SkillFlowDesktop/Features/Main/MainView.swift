import SwiftUI

struct MainView: View {
    @Bindable var viewModel: MainViewModel

    @State private var activePage: Page = .config
    @State private var detailGroupId: String?
    @State private var theme: DesktopThemeMode = .light

    private enum Page {
        case config
        case stats
    }

    var body: some View {
        GeometryReader { proxy in
            let layout = LayoutMetrics(width: proxy.size.width)

            ZStack {
                AppTheme.pageBackground(for: theme)
                    .ignoresSafeArea()

                backgroundTexture
                    .ignoresSafeArea()

                VStack(spacing: 0) {
                    header(layout: layout)
                    toolbar(layout: layout)

                    content(layout: layout)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                if let groupId = detailGroupId {
                    detailOverlay(groupId: groupId, layout: layout)
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
        .tint(AppTheme.brand)
        .onChange(of: viewModel.selectedGroupId) { _, newValue in
            guard detailGroupId != nil else { return }
            detailGroupId = newValue
        }
        .task(id: viewModel.toast?.id) {
            guard viewModel.toast != nil else { return }
            try? await Task.sleep(for: .seconds(2))
            viewModel.dismissToast()
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

    private var backgroundTexture: some View {
        ZStack {
            RadialGradient(
                colors: [Color.white.opacity(0.68), Color.clear],
                center: .topLeading,
                startRadius: 0,
                endRadius: 650
            )
            RadialGradient(
                colors: [Color.black.opacity(0.08), Color.clear],
                center: .bottomTrailing,
                startRadius: 0,
                endRadius: 620
            )
        }
        .opacity(theme == .light ? 0.85 : 0.35)
        .overlay {
            LinearGradient(
                colors: [Color.white.opacity(theme == .light ? 0.14 : 0.04), Color.clear],
                startPoint: .top,
                endPoint: .bottom
            )
        }
        .allowsHitTesting(false)
    }

    private func header(layout: LayoutMetrics) -> some View {
        Group {
            if layout.isNarrowHeader {
                VStack(alignment: .leading, spacing: 10) {
                    headerLogoRow
                    headerTabRow
                    headerThemeButton
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(AppTheme.headerBackground(for: theme))
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(AppTheme.border(for: theme))
                        .frame(height: 1)
                }
            } else {
                HStack(spacing: 24) {
                    headerLogoRow
                    headerTabRow
                    Spacer()
                    headerThemeButton
                }
                .padding(.horizontal, 16)
                .frame(height: 46)
                .background(AppTheme.headerBackground(for: theme))
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(AppTheme.border(for: theme))
                        .frame(height: 1)
                }
            }
        }
    }

    private var headerLogoRow: some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 8)
                .fill(AppTheme.textPrimary(for: theme))
                .frame(width: 30, height: 30)
                .overlay(
                    Text("SF")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundStyle(AppTheme.pageBackground(for: theme))
                )

            Text("Skill Flow")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
        }
    }

    private var headerTabRow: some View {
        HStack(spacing: 4) {
            navButton("Config", selected: activePage == .config) { activePage = .config }
            navButton("Stats", selected: activePage == .stats) { activePage = .stats }
        }
    }

    private var headerThemeButton: some View {
        Button(theme == .dark ? "Light" : "Dark") {
            theme = theme == .dark ? .light : .dark
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 12)
        .frame(height: 30)
        .background(AppTheme.toolbarButtonBackground(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .foregroundStyle(AppTheme.textPrimary(for: theme))
        .font(.system(size: 10, weight: .bold))
        .textCase(.uppercase)
    }

    private func toolbar(layout: LayoutMetrics) -> some View {
        Group {
            if layout.isNarrowToolbar {
                VStack(alignment: .leading, spacing: 8) {
                    searchField
                    toolbarHint
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(AppTheme.headerBackground(for: theme))
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(AppTheme.border(for: theme))
                        .frame(height: 1)
                }
            } else {
                HStack(spacing: 12) {
                    searchField
                    Spacer()
                    toolbarHint
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(AppTheme.headerBackground(for: theme))
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(AppTheme.border(for: theme))
                        .frame(height: 1)
                }
            }
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
        .padding(.horizontal, 10)
        .frame(width: 240, height: 30, alignment: .leading)
        .background(AppTheme.toolbarButtonBackground(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var toolbarHint: some View {
        Text("Card actions save immediately. Click the card header to open detail.")
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(AppTheme.textMuted(for: theme))
    }

    private func content(layout: LayoutMetrics) -> some View {
        Group {
            switch activePage {
            case .config:
                configPage(layout: layout)
            case .stats:
                statsPage(layout: layout)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func configPage(layout: LayoutMetrics) -> some View {
        ScrollView {
            VStack(spacing: 16) {
                sectionShell {
                    gridSection(layout: layout)
                }
            }
            .padding(16)
        }
    }

    private func gridSection(layout: LayoutMetrics) -> some View {
            VStack(alignment: .leading, spacing: 12) {
                sectionHeader(
                    title: "Groups",
                    subtitle: "Configure skills and agents directly from each group card.",
                    badge: "\(groupCards.count)"
                )

            if groupCards.isEmpty {
                let loading = {
                    switch viewModel.loadState {
                    case .loading:
                        return true
                    default:
                        return false
                    }
                }()
                emptyState(
                    title: loading ? "Loading groups" : "No groups matched",
                    subtitle: loading ? "Waiting for bridge data." : "Try a broader search query."
                )
            } else {
                HStack {
                    Spacer(minLength: 0)
                    LazyVGrid(columns: gridColumns(for: layout), spacing: 12) {
                        ForEach(groupCards) { card in
                            GroupCardView(
                                card: card,
                                isSelected: card.id == viewModel.selectedGroupId,
                                theme: theme,
                                onOpenDetail: {
                                    detailGroupId = card.id
                                    Task { await viewModel.selectSource(card.id) }
                                },
                                onToggleSkill: { skillId, enabled in
                                    Task { await viewModel.setSkillEnabled(skillId, enabled: enabled, sourceId: card.id) }
                                },
                                onToggleTarget: { targetId, enabled in
                                    Task { await viewModel.setTargetEnabled(targetId, enabled: enabled, sourceId: card.id) }
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

    private func statsPage(layout: LayoutMetrics) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                sectionShell {
                    VStack(alignment: .leading, spacing: 16) {
                        sectionHeader(title: "Metrics", subtitle: "Overview cards and trend chart.", badge: viewModel.healthLabel)

                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            StatsCard(title: "Groups", value: "\(viewModel.sourceRows.count)", theme: theme)
                            StatsCard(title: "Warnings", value: "\(viewModel.latestWarnings.count)", theme: theme)
                            StatsCard(title: "Health", value: viewModel.healthLabel, theme: theme)
                        }
                    }
                }
            }
            .padding(16)
        }
    }

    private func detailOverlay(groupId: String, layout: LayoutMetrics) -> some View {
        let detail = viewModel.detailViewData(for: groupId)
        let stacked = layout.detailStacks
        let sidebarWidth = layout.detailSidebarWidth

        return ZStack {
            Color.black.opacity(theme == .light ? 0.02 : 0.1)
                .ignoresSafeArea()
                .onTapGesture {
                    detailGroupId = nil
                }

            VStack(spacing: 12) {
                if stacked {
                    detailSidebar(groupId: groupId, detail: detail, width: sidebarWidth)
                    detailMain(groupId: groupId, detail: detail)
                } else {
                    HStack(spacing: 12) {
                        detailSidebar(groupId: groupId, detail: detail, width: sidebarWidth)
                        detailMain(groupId: groupId, detail: detail)
                    }
                }
            }
            .padding(12)
            .background(AppTheme.pageBackground(for: theme))
            .overlay(alignment: .topTrailing) {
                EmptyView()
            }
        }
        .transition(.move(edge: .trailing))
    }

    private func detailSidebar(
        groupId: String,
        detail: MainViewModel.DetailViewData?,
        width: CGFloat
    ) -> some View {
        let skillItems = detail?.skills ?? []
        let activeIndex = skillItems.firstIndex(where: \.isEnabled)

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(detail?.title ?? groupId)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                        .foregroundStyle(AppTheme.textPrimary(for: theme))

                    HStack(spacing: 6) {
                        pillText(detail?.subtitle ?? "source", tint: AppTheme.toolbarButtonBackground(for: theme), text: AppTheme.textPrimary(for: theme))
                        pillText("W\(detail?.warningCount ?? 0)", tint: Color.orange.opacity(0.24), text: AppTheme.textPrimary(for: theme))
                        pillText(detail?.health ?? "unknown", tint: Color.gray.opacity(0.18), text: AppTheme.textPrimary(for: theme))
                    }
                }

                Spacer()

                Button("×") {
                    detailGroupId = nil
                }
                .buttonStyle(.plain)
                .frame(width: 30, height: 30)
                .background(AppTheme.toolbarButtonBackground(for: theme))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
            }
            .padding(.bottom, 12)

            ScrollView {
                VStack(alignment: .leading, spacing: 10) {
                    detailOverviewCard(
                        title: "Overview",
                        lines: [
                            "Skills: \(detail?.skills.count ?? 0)",
                            "Enabled agents: \(detail?.enabledTargetLabels.count ?? 0)",
                            "Status: \(detail?.health ?? viewModel.healthLabel)",
                        ]
                    )

                    detailOverviewCard(
                        title: "Source",
                        lines: [
                            detail?.sourceId ?? groupId,
                            detail?.updatedAt ?? "-",
                        ]
                    )

                    detailSkillList(
                        items: skillItems,
                        activeIndex: activeIndex,
                        width: width
                    )
                }
            }
        }
        .padding(12)
        .frame(minWidth: width, maxWidth: width, minHeight: 196, maxHeight: .infinity, alignment: .topLeading)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.border(for: theme), lineWidth: 1)
        )
    }

    private func detailMain(
        groupId: String,
        detail: MainViewModel.DetailViewData?
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text(detail?.title ?? groupId)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                    Text(detail?.locator ?? "No source locator")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .lineLimit(1)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    Text(detail?.health ?? viewModel.healthLabel)
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                    Text("\(detail?.enabledTargetLabels.count ?? 0) agents")
                        .font(.system(size: 10, weight: .regular, design: .monospaced))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                }
            }
            .padding(12)
            .background(AppTheme.toolbarButtonBackground(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(AppTheme.border(for: theme), lineWidth: 1)
            )

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    detailOverviewCard(
                        title: "Group",
                        lines: [
                            detail?.sourceId ?? groupId,
                            detail?.subtitle ?? "source",
                        ]
                    )
                    detailOverviewCard(
                        title: "Warnings",
                        lines: [
                            "\(detail?.warningCount ?? 0)",
                            "Errors \(detail?.errorCount ?? 0)",
                        ]
                    )
                    detailOverviewCard(
                        title: "Agents",
                        lines: [
                            detail?.enabledTargetLabels.joined(separator: ", ").nonEmpty ?? "No agents enabled",
                            detail?.updatedAt ?? "Pending",
                        ]
                    )
                }

                ScrollView {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(detail?.skills ?? []) { skill in
                            detailDocumentRow(skill: skill)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(18)
                }
                .background(AppTheme.toolbarButtonBackground(for: theme))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(AppTheme.border(for: theme), lineWidth: 1)
                )
            }
            .padding(12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(AppTheme.surface(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.border(for: theme), lineWidth: 1)
        )
    }

    private func detailOverviewCard(title: String, lines: [String]) -> some View {
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
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.toolbarButtonBackground(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.border(for: theme), lineWidth: 1)
        )
    }

    private func detailSkillList(items: [MainViewModel.DetailSkill], activeIndex: Int?, width: CGFloat) -> some View {
        let lineOffset = activeIndex.map { CGFloat($0) * 64 + 10 } ?? 10
        let isActiveVisible = activeIndex != nil

        return VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("Skills")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .textCase(.uppercase)
                Spacer()
                Text("\(items.count)")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }
            .padding(.bottom, 8)

            ScrollView {
                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 4)
                        .fill(AppTheme.brand)
                        .frame(width: 4, height: 28)
                        .offset(x: 8, y: lineOffset)
                        .opacity(isActiveVisible ? 1 : 0)
                        .animation(.easeInOut(duration: 0.15), value: activeIndex)

                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                            detailSkillRow(item: item, active: index == activeIndex)
                        }
                    }
                }
                .padding(.vertical, 4)
            }
            .frame(maxHeight: 260)
        }
        .padding(12)
        .background(AppTheme.toolbarButtonBackground(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.border(for: theme), lineWidth: 1)
        )
    }

    private func detailSkillRow(item: MainViewModel.DetailSkill, active: Bool) -> some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Text(item.summary)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .lineLimit(2)
            }

            Spacer(minLength: 10)

            Text(item.isEnabled ? "ON" : "OFF")
                .font(.system(size: 10, weight: .bold))
                .padding(.horizontal, 8)
                .frame(height: 30)
                .background(item.isEnabled ? Color.green.opacity(0.25) : Color.gray.opacity(0.24))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .foregroundStyle(item.isEnabled ? Color.green : AppTheme.textPrimary(for: theme))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .background(active ? AppTheme.pageBackground(for: theme).opacity(0.5) : Color.clear)
    }

    private func detailDocumentRow(skill: MainViewModel.DetailSkill) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(skill.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                pillText(skill.isEnabled ? "Enabled" : "Disabled", tint: skill.isEnabled ? Color.green.opacity(0.22) : Color.gray.opacity(0.20), text: AppTheme.textPrimary(for: theme))
                if skill.warningCount > 0 {
                    pillText("Warnings \(skill.warningCount)", tint: Color.orange.opacity(0.24), text: AppTheme.textPrimary(for: theme))
                }
            }
            Text(skill.summary)
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 10)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(AppTheme.border(for: theme))
                .frame(height: 1)
        }
    }

    private func sectionShell<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(14)
            .background(AppTheme.surface(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(AppTheme.border(for: theme), lineWidth: 1)
            )
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
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.border(for: theme), lineWidth: 1)
        )
    }

    private func navButton(_ label: String, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(label, action: action)
            .buttonStyle(.plain)
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(selected ? AppTheme.textPrimary(for: theme) : AppTheme.toolbarButtonBackground(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .foregroundStyle(selected ? AppTheme.pageBackground(for: theme) : AppTheme.textPrimary(for: theme))
            .font(.system(size: 10, weight: .bold))
            .textCase(.uppercase)
    }

    private func gridColumns(for layout: LayoutMetrics) -> [GridItem] {
        Array(repeating: GridItem(.fixed(220), spacing: 12), count: layout.gridColumnCount)
    }

    private var groupCards: [MainViewModel.GroupCardModel] {
        viewModel.groupCards
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

    private func toastBanner(_ toast: MainViewModel.ToastState) -> some View {
        Text(toast.message)
            .font(.system(size: 12, weight: .semibold))
            .padding(.horizontal, 14)
            .frame(height: 38)
            .background(toast.style == .success ? Color.green.opacity(0.22) : Color.red.opacity(0.20))
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(toast.style == .success ? Color.green.opacity(0.45) : Color.red.opacity(0.35), lineWidth: 1)
            )
            .foregroundStyle(AppTheme.textPrimary(for: theme))
    }
}

private struct GroupCardView: View {
    let card: MainViewModel.GroupCardModel
    let isSelected: Bool
    let theme: DesktopThemeMode
    let onOpenDetail: () -> Void
    let onToggleSkill: (String, Bool) -> Void
    let onToggleTarget: (String, Bool) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onOpenDetail) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(card.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                    Text(card.subtitle)
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                    Text(card.metaLine)
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    Text("Skills")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .textCase(.uppercase)
                    Spacer()
                    statusLabel
                }
                FlowLayout(spacing: 6, lineSpacing: 6) {
                    ForEach(card.skills) { skill in
                        cardToggle(skill.label, isOn: skill.isEnabled) {
                            onToggleSkill(skill.id, !skill.isEnabled)
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Agents")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .textCase(.uppercase)
                FlowLayout(spacing: 6, lineSpacing: 6) {
                    ForEach(card.targets) { target in
                        cardToggle(target.label, isOn: target.isEnabled) {
                            onToggleTarget(target.id, !target.isEnabled)
                        }
                    }
                }
            }
        }
        .padding(12)
        .frame(minHeight: 196, alignment: .topLeading)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(isSelected ? AppTheme.brand.opacity(0.8) : AppTheme.border(for: theme), lineWidth: 1)
        )
        .overlay(alignment: .leading) {
            RoundedRectangle(cornerRadius: 3)
                .fill(AppTheme.brand)
                .frame(width: 4, height: 26)
                .padding(.leading, 8)
                .padding(.top, 10)
                .opacity(isSelected ? 1 : 0)
                .animation(.easeInOut(duration: 0.15), value: isSelected)
        }
    }

    private var statusLabel: some View {
        Text(card.saveState.message ?? card.health)
            .font(.system(size: 9, weight: .bold))
            .padding(.horizontal, 8)
            .frame(height: 22)
            .background(statusBackground)
            .foregroundStyle(AppTheme.textPrimary(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 8))
    }

    private var statusBackground: Color {
        switch card.saveState.phase {
        case .saving:
            return Color.orange.opacity(0.25)
        case .saved:
            return Color.green.opacity(0.22)
        case .failed:
            return Color.red.opacity(0.18)
        case .idle:
            return Color.gray.opacity(0.18)
        }
    }

    private func cardToggle(_ text: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: 10, weight: .bold))
                .padding(.horizontal, 8)
                .frame(height: 24)
                .background(isOn ? Color.orange.opacity(0.22) : Color.gray.opacity(0.16))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
    }
}

private struct StatsCard: View {
    let title: String
    let value: String
    let theme: DesktopThemeMode

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)
            Text(value)
                .font(.system(size: 26, weight: .semibold, design: .monospaced))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .lineLimit(1)
                .truncationMode(.middle)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.border(for: theme), lineWidth: 1)
        )
    }
}

private struct LayoutMetrics {
    let width: CGFloat

    var isNarrowHeader: Bool {
        width <= 860
    }

    var isNarrowToolbar: Bool {
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
        let spacing = CGFloat(max(gridColumnCount - 1, 0)) * 12
        let available = max(220, width - 32 - spacing)
        return min(920, max(220 * columns + spacing, available))
    }
}

private enum DesktopThemeMode {
    case light
    case dark
}

private enum AppTheme {
    static let brand = Color(red: 255.0 / 255.0, green: 97.0 / 255.0, blue: 26.0 / 255.0)

    static func pageBackground(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color(red: 235.0 / 255.0, green: 235.0 / 255.0, blue: 235.0 / 255.0)
        case .dark:
            return Color(red: 22.0 / 255.0, green: 22.0 / 255.0, blue: 24.0 / 255.0)
        }
    }

    static func surface(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color(red: 241.0 / 255.0, green: 241.0 / 255.0, blue: 241.0 / 255.0)
        case .dark:
            return Color(red: 34.0 / 255.0, green: 34.0 / 255.0, blue: 38.0 / 255.0)
        }
    }

    static func headerBackground(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color(red: 242.0 / 255.0, green: 242.0 / 255.0, blue: 242.0 / 255.0).opacity(0.88)
        case .dark:
            return Color(red: 28.0 / 255.0, green: 28.0 / 255.0, blue: 31.0 / 255.0).opacity(0.88)
        }
    }

    static func toolbarButtonBackground(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color.white.opacity(0.55)
        case .dark:
            return Color.white.opacity(0.10)
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

    static func border(for mode: DesktopThemeMode) -> Color {
        switch mode {
        case .light:
            return Color.black.opacity(0.12)
        case .dark:
            return Color.white.opacity(0.12)
        }
    }
}

private struct FlowLayout: Layout {
    let spacing: CGFloat
    let lineSpacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var currentX: CGFloat = 0
        var currentY: CGFloat = 0
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > maxWidth, currentX > 0 {
                currentX = 0
                currentY += lineHeight + lineSpacing
                lineHeight = 0
            }
            lineHeight = max(lineHeight, size.height)
            currentX += size.width + spacing
        }

        return CGSize(width: maxWidth.isFinite ? maxWidth : currentX, height: currentY + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX = bounds.minX
        var currentY = bounds.minY
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX, currentX > bounds.minX {
                currentX = bounds.minX
                currentY += lineHeight + lineSpacing
                lineHeight = 0
            }

            subview.place(
                at: CGPoint(x: currentX, y: currentY),
                proposal: ProposedViewSize(width: size.width, height: size.height)
            )
            currentX += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}

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
            }
        }
        .tint(AppTheme.brand)
        .alert("Unsaved changes", isPresented: $viewModel.showGroupSwitchDialog) {
            Button("Apply") {
                Task { await viewModel.resolveGroupSwitch(.apply) }
            }
            Button("Discard", role: .destructive) {
                Task { await viewModel.resolveGroupSwitch(.discard) }
            }
            Button("Cancel", role: .cancel) {
                Task { await viewModel.resolveGroupSwitch(.cancel) }
            }
        } message: {
            Text("Current group has unapplied changes. Choose how to continue.")
        }
        .onChange(of: viewModel.selectedGroupId) { _, newValue in
            guard detailGroupId != nil else { return }
            detailGroupId = newValue
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
        Text("Click group title to open detail. Search is shared with the menu popover.")
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
                subtitle: layout.gridSubtitle,
                badge: "\(filteredSourceRows.count)"
            )

            if filteredSourceRows.isEmpty {
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
                        ForEach(filteredSourceRows) { row in
                            GroupCardView(
                                row: row,
                                isSelected: row.id == viewModel.selectedGroupId,
                                theme: theme,
                                onOpenDetail: {
                                    detailGroupId = row.id
                                    viewModel.requestGroupSwitch(to: row.id)
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

                        chartCard
                    }
                }
            }
            .padding(16)
        }
    }

    private var chartCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Changes")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Spacer()
                Text("Last 7 snapshots")
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }

            HStack(alignment: .bottom, spacing: 6) {
                ForEach(0..<7, id: \.self) { idx in
                    let value = max(8, ((idx * 11 + viewModel.sourceRows.count * 7) % 90))
                    RoundedRectangle(cornerRadius: 4)
                        .fill(AppTheme.brand.opacity(0.85))
                        .frame(height: CGFloat(value))
                        .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 150)
        }
        .padding(14)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.border(for: theme), lineWidth: 1)
        )
    }

    private func detailOverlay(groupId: String, layout: LayoutMetrics) -> some View {
        let row = viewModel.sourceRows.first { $0.id == groupId }
        let snapshot = DetailSnapshot(detailText: viewModel.detailText)
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
                    detailSidebar(groupId: groupId, row: row, snapshot: snapshot, width: sidebarWidth)
                    detailMain(groupId: groupId, row: row, snapshot: snapshot)
                } else {
                    HStack(spacing: 12) {
                        detailSidebar(groupId: groupId, row: row, snapshot: snapshot, width: sidebarWidth)
                        detailMain(groupId: groupId, row: row, snapshot: snapshot)
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
        row: MainViewModel.SourceRow?,
        snapshot: DetailSnapshot?,
        width: CGFloat
    ) -> some View {
        let skillItems = detailSkillItems(for: row, snapshot: snapshot)
        let activeIndex = detailActiveIndex(for: snapshot, items: skillItems)

        return VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(groupId)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(1)
                        .foregroundStyle(AppTheme.textPrimary(for: theme))

                    HStack(spacing: 6) {
                        pillText(row?.kind ?? "source", tint: AppTheme.toolbarButtonBackground(for: theme), text: AppTheme.textPrimary(for: theme))
                        pillText("W\(row?.warningCount ?? 0)", tint: Color.orange.opacity(0.24), text: AppTheme.textPrimary(for: theme))
                        pillText(projectedNameText(for: snapshot, groupId: groupId), tint: Color.gray.opacity(0.18), text: AppTheme.textPrimary(for: theme))
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
                            "Selected leafs: \(snapshot?.selectedLeafIds.count ?? row?.skillCount ?? 0)",
                            "Enabled targets: \(snapshot?.enabledTargets.count ?? 0)",
                            "Status: \(row?.status ?? viewModel.healthLabel)",
                        ]
                    )

                    detailOverviewCard(
                        title: "Projected",
                        lines: [
                            projectedNameText(for: snapshot, groupId: groupId),
                            snapshot?.selectedLeafIds.first ?? "No selected leaf yet",
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
        row: MainViewModel.SourceRow?,
        snapshot: DetailSnapshot?
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Desktop Client")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                    Text("Preview")
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    Text(row?.status ?? viewModel.healthLabel)
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                    Text("\(snapshot?.enabledTargets.count ?? 0) targets")
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
                            groupId,
                            row?.kind ?? "source",
                        ]
                    )
                    detailOverviewCard(
                        title: "Warnings",
                        lines: [
                            "\(row?.warningCount ?? 0)",
                            "\(viewModel.latestWarnings.count) total",
                        ]
                    )
                    detailOverviewCard(
                        title: "Projected name",
                        lines: [
                            projectedNameText(for: snapshot, groupId: groupId),
                            snapshot?.selectedLeafIds.first ?? "Pending",
                        ]
                    )
                }

                ScrollView {
                    Text(detailBodyText(for: row, snapshot: snapshot))
                        .font(.system(.body, design: .monospaced))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
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

    private func detailSkillList(items: [DetailSkillItem], activeIndex: Int?, width: CGFloat) -> some View {
        let lineOffset = activeIndex.map { CGFloat($0) * 56 + 10 } ?? 10
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

    private func detailSkillRow(item: DetailSkillItem, active: Bool) -> some View {
        HStack(alignment: .center, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Text(item.subtitle)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .lineLimit(2)
            }

            Spacer(minLength: 10)

            Text(item.stateLabel)
                .font(.system(size: 10, weight: .bold))
                .padding(.horizontal, 8)
                .frame(height: 30)
                .background(item.stateTint)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .foregroundStyle(item.stateText)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
        .background(active ? AppTheme.pageBackground(for: theme).opacity(0.5) : Color.clear)
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

    private var filteredSourceRows: [MainViewModel.SourceRow] {
        viewModel.sourceRows
    }

    private func detailSkillItems(for row: MainViewModel.SourceRow?, snapshot: DetailSnapshot?) -> [DetailSkillItem] {
        let leafIds = snapshot?.leafIds ?? defaultLeafIds(for: row)
        let selectedLeafIds = Set(snapshot?.selectedLeafIds ?? [])
        let enabledTargets = snapshot?.enabledTargets ?? []

        return leafIds.enumerated().map { index, leafId in
            let isSelected = selectedLeafIds.contains(leafId)
            return DetailSkillItem(
                title: leafId,
                subtitle: detailSubtitle(for: index, row: row, enabledTargets: enabledTargets),
                stateLabel: isSelected ? "ON" : "OFF",
                stateTint: isSelected ? Color.green.opacity(0.25) : Color.gray.opacity(0.24),
                stateText: isSelected ? Color.green : AppTheme.textPrimary(for: theme)
            )
        }
    }

    private func detailActiveIndex(for snapshot: DetailSnapshot?, items: [DetailSkillItem]) -> Int? {
        guard let activeLeafId = snapshot?.selectedLeafIds.first else {
            return items.isEmpty ? nil : 0
        }
        return items.firstIndex(where: { $0.title == activeLeafId }) ?? (items.isEmpty ? nil : 0)
    }

    private func detailSubtitle(for index: Int, row: MainViewModel.SourceRow?, enabledTargets: [String]) -> String {
        let targetCount = enabledTargets.count
        let warningCount = row?.warningCount ?? 0
        return "Target \(index + 1) · \(targetCount) enabled · \(warningCount) warnings"
    }

    private func defaultLeafIds(for row: MainViewModel.SourceRow?) -> [String] {
        guard let row else { return [] }
        return (0..<max(1, row.skillCount)).map { index in
            "skill-\(String(format: "%02d", index + 1))"
        }
    }

    private func projectedNameText(for snapshot: DetailSnapshot?, groupId: String) -> String {
        if let projected = snapshot?.selectedLeafIds.first, !projected.isEmpty {
            return projected
        }
        return groupId
    }

    private func detailBodyText(for row: MainViewModel.SourceRow?, snapshot: DetailSnapshot?) -> String {
        let selectedLeafIds = snapshot?.selectedLeafIds ?? []
        let enabledTargets = snapshot?.enabledTargets ?? []
        let leafIds = snapshot?.leafIds ?? defaultLeafIds(for: row)

        return """
        {
          "sourceId": "\(row?.id ?? "-")",
          "kind": "\(row?.kind ?? "source")",
          "leafIds": \(leafIds.prettyPrintedJSON),
          "selectedLeafIds": \(selectedLeafIds.prettyPrintedJSON),
          "enabledTargets": \(enabledTargets.prettyPrintedJSON),
          "warningCount": \(row?.warningCount ?? 0),
          "projectedName": "\(projectedNameText(for: snapshot, groupId: row?.id ?? "-"))"
        }
        """
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
}

private struct GroupCardView: View {
    let row: MainViewModel.SourceRow
    let isSelected: Bool
    let theme: DesktopThemeMode
    let onOpenDetail: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onOpenDetail) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.id)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                    Text("by \(row.kind)")
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                    Text("updated \(row.lastUpdate)")
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Skills")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .textCase(.uppercase)
                HStack(spacing: 4) {
                    stateChip("MIX", color: Color.orange.opacity(0.3), text: Color.brown)
                    stateChip("\(row.skillCount)", color: Color.orange.opacity(0.3), text: AppTheme.textPrimary(for: theme))
                    stateChip("W\(row.warningCount)", color: Color.gray.opacity(0.3), text: AppTheme.textPrimary(for: theme))
                    stateChip("E\(row.errorCount)", color: Color.gray.opacity(0.3), text: AppTheme.textPrimary(for: theme))
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Agents")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .textCase(.uppercase)
                HStack(spacing: 4) {
                    stateChip("ON", color: Color.green.opacity(0.25), text: Color.green)
                    stateChip("CC", color: Color.orange.opacity(0.35), text: AppTheme.textPrimary(for: theme))
                    stateChip("CU", color: Color.orange.opacity(0.35), text: AppTheme.textPrimary(for: theme))
                    stateChip("CX", color: Color.gray.opacity(0.3), text: AppTheme.textMuted(for: theme))
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

    private func stateChip(_ text: String, color: Color, text textColor: Color) -> some View {
        Text(text)
            .font(.system(size: 10, weight: .bold))
            .padding(.horizontal, 8)
            .frame(height: 24)
            .background(color)
            .foregroundStyle(textColor)
            .clipShape(RoundedRectangle(cornerRadius: 8))
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

private struct DetailSkillItem {
    let title: String
    let subtitle: String
    let stateLabel: String
    let stateTint: Color
    let stateText: Color
}

private struct DetailSnapshot {
    let leafIds: [String]
    let selectedLeafIds: [String]
    let enabledTargets: [String]

    init?(detailText: String) {
        guard let data = detailText.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: data, options: []),
              let dictionary = raw as? [String: Any]
        else {
            return nil
        }

        self.leafIds = Self.extractStrings(from: dictionary["leafIds"])
        self.selectedLeafIds = Self.extractStrings(from: dictionary["selectedLeafIds"])
        self.enabledTargets = Self.extractStrings(from: dictionary["enabledTargets"])
    }

    private static func extractStrings(from value: Any?) -> [String] {
        guard let value else { return [] }
        if let strings = value as? [String] {
            return strings
        }
        if let anyArray = value as? [Any] {
            return anyArray.compactMap { $0 as? String }
        }
        return []
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

    var gridSubtitle: String {
        switch gridColumnCount {
        case 4:
            return "Four-column layout, matching the desktop prototype at wide widths."
        case 3:
            return "Three-column layout at mid widths."
        case 2:
            return "Two-column layout for narrower windows."
        default:
            return "Single-column layout on compact widths."
        }
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

private extension Array where Element == String {
    var prettyPrintedJSON: String {
        guard let data = try? JSONSerialization.data(withJSONObject: self, options: [.prettyPrinted]),
              let text = String(data: data, encoding: .utf8)
        else {
            return "[]"
        }
        return text.replacingOccurrences(of: "\n", with: " ")
    }
}

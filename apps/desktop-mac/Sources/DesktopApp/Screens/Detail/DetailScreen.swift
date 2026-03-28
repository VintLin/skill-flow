import AppKit
import Observation
import SwiftUI

struct DetailScreen: View {
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
    private let detailHeaderTitleSize: CGFloat = 17
    private let detailHeaderMetaSize: CGFloat = 11

    let container: DetailScreenContainer
    @Bindable var screenState: DetailScreenState
    let sidebarWidth: CGFloat
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let updateButtonRotation: Double

    init(
        container: DetailScreenContainer,
        sidebarWidth: CGFloat,
        theme: DesktopThemeMode,
        accent: DesktopAccentColor,
        updateButtonRotation: Double
    ) {
        self.container = container
        self.screenState = container.screenState
        self.sidebarWidth = sidebarWidth
        self.theme = theme
        self.accent = accent
        self.updateButtonRotation = updateButtonRotation
    }

    var body: some View {
        Group {
            if let sourceId = container.sourceId {
                let detail = container.viewModel
                let fallbackRow = container.fallbackRow

                HStack(alignment: .top, spacing: 14) {
                    detailSidebar(
                        groupId: sourceId,
                        detail: detail,
                        fallbackRow: fallbackRow,
                        selectedSkillId: screenState.detailSkillIdByGroup[sourceId]
                    )
                    detailMain(groupId: sourceId, detail: detail, fallbackRow: fallbackRow)
                }
                .padding(16)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .task(id: sourceId) {
                    await bootstrapDetailRoute(sourceId: sourceId, detail: detail)
                }
            } else {
                EmptyView()
            }
        }
    }

    private func bootstrapDetailRoute(sourceId: String, detail: DetailViewModel?) async {
        await container.selectSource(sourceId)

        if screenState.detailShowsGroupOverviewByGroup[sourceId] == nil {
            screenState.detailShowsGroupOverviewByGroup[sourceId] = true
        }
        guard let detail else {
            return
        }
        if screenState.detailSkillIdByGroup[sourceId] == nil {
            screenState.detailSkillIdByGroup[sourceId] = preferredDetailSkillId(for: detail)
        }
        if screenState.detailDocumentTabIdByGroup[sourceId] == nil {
            screenState.detailDocumentTabIdByGroup[sourceId] = detail.groupDocuments.first?.id
        }
        for skill in detail.skills where screenState.detailDocumentTabIdBySkill[skill.id] == nil {
            screenState.detailDocumentTabIdBySkill[skill.id] = skill.documents.first?.id
        }
    }

    private func detailSidebar(
        groupId: String,
        detail: DetailViewModel?,
        fallbackRow: MainViewModel.SourceRow?,
        selectedSkillId: String?
    ) -> some View {
        let skills = detail?.skills ?? []
        let selectedItemId = detailSelectedItemId(groupId: groupId, selectedSkillId: selectedSkillId)
        let hoveredItemId = screenState.detailHoveredItemIdByGroup[groupId]
        let indicatorItemId = hoveredItemId ?? selectedItemId

        return VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                ZStack(alignment: .topLeading) {
                    if let indicatorFrame = detailIndicatorFrame(itemId: indicatorItemId, detail: detail) {
                        RoundedRectangle(cornerRadius: 999)
                            .fill(AppTheme.brand(for: accent, in: theme))
                            .frame(width: 4, height: indicatorFrame.height)
                            .offset(x: 0, y: indicatorFrame.minY)
                            .animation(.spring(response: 0.22, dampingFraction: 0.82), value: indicatorItemId)
                    }

                    VStack(alignment: .leading, spacing: 0) {
                        detailGroupListRow(groupId: groupId, detail: detail, fallbackRow: fallbackRow)
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
        .frame(minWidth: sidebarWidth, maxWidth: sidebarWidth, maxHeight: .infinity, alignment: .topLeading)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func detailMain(
        groupId: String,
        detail: DetailViewModel?,
        fallbackRow: MainViewModel.SourceRow?
    ) -> some View {
        let selectedSkill = selectedDetailSkill(for: groupId, detail: detail)
        let showingGroupOverview = isShowingGroupOverview(groupId)
        let isSkillLoading = screenState.pendingDetailSkillIdByGroup[groupId] != nil

        return VStack(alignment: .leading, spacing: 0) {
            if showingGroupOverview {
                detailGroupHeader(
                    detail: detail,
                    fallbackTitle: fallbackRow?.displayName ?? groupId,
                    fallbackOriginLabel: fallbackRow?.locator
                )
            } else {
                detailSkillHeader(skill: selectedSkill, fallbackGroupId: groupId)
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if showingGroupOverview {
                        detailGroupOverview(groupId: groupId, detail: detail, fallbackRow: fallbackRow)
                    } else if isSkillLoading {
                        detailSkillLoadingPlaceholder()
                    } else if let selectedSkill {
                        detailSkillOverview(skill: selectedSkill)
                    } else if detail == nil {
                        detailSkillLoadingPlaceholder()
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

    private func detailGroupOverview(
        groupId: String,
        detail: DetailViewModel?,
        fallbackRow: MainViewModel.SourceRow?
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            detailPathRow(
                title: t("detail.section.path"),
                path: detail?.groupPath,
                fallbackText: detail?.locator ?? fallbackRow?.locator ?? t("detail.path.unavailable")
            )

            if let detail, !detail.sourceDetailLines.isEmpty {
                detailMetadataSection(
                    title: t("common.section.source"),
                    lines: detail.sourceDetailLines,
                    externalURL: detail.sourceRepositoryURL
                )
            } else {
                detailLoadingSection(title: "Source")
            }

            detailAgentRail(groupId: groupId, detail: detail)

            if let detail, !detail.groupDocuments.isEmpty {
                detailGroupDocuments(detail, groupId: groupId)
            } else {
                detailLoadingSection(title: "Documents")
            }
        }
    }

    private func detailSkillOverview(skill: DetailViewModel.DetailSkill) -> some View {
        let isDocumentLoading = screenState.pendingDetailDocumentIdBySkill[skill.id] != nil

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

    private func detailContentCard<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding(14)
            .background(AppTheme.documentBlock(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private func detailGroupHeader(
        detail: DetailViewModel?,
        fallbackTitle: String,
        fallbackOriginLabel: String?
    ) -> some View {
        let isUpdating = container.isUpdatingCurrentGroup

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(detail?.title ?? fallbackTitle)
                        .font(.system(size: detailHeaderTitleSize, weight: .semibold))
                        .foregroundStyle(AppTheme.brand(for: accent, in: theme))

                    Text(t("detail.meta.by", detail?.author ?? "@unknown"))
                        .font(.system(size: detailHeaderMetaSize, weight: .regular))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .lineLimit(1)
                }

                Spacer(minLength: 12)

                Button {
                    Task { await container.updateCurrentGroup() }
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
                    originLabel: detail?.originLabel ?? fallbackOriginLabel ?? t("detail.meta.unknown_source"),
                    starCount: detail?.starCount
                )

                Spacer(minLength: 12)
            }
        }
        .padding(14)
        .frame(minHeight: detailHeaderMinHeight, alignment: .center)
        .background(AppTheme.toolbarGlass(for: theme))
    }

    private func detailSkillHeader(skill: DetailViewModel.DetailSkill?, fallbackGroupId: String) -> some View {
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

    private func detailGroupListRow(
        groupId: String,
        detail: DetailViewModel?,
        fallbackRow: MainViewModel.SourceRow?
    ) -> some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(detail?.title ?? fallbackRow?.displayName ?? groupId)
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
                Task { await container.toggleAllSkills(sourceId: groupId) }
            }
        }
        .frame(height: detailGroupRowHeight)
        .contentShape(Rectangle())
        .onTapGesture {
            selectGroupOverview(groupId: groupId, detail: detail)
        }
        .onHover { isHovering in
            screenState.detailHoveredItemIdByGroup[groupId] = isHovering ? detailGroupItemId(groupId) : nil
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

    private func detailSkillListRow(groupId: String, skill: DetailViewModel.DetailSkill) -> some View {
        let versionText = skill.version.map(normalizedVersionText)
        let isPending = screenState.pendingDetailSkillIdByGroup[groupId] == skill.id

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

            Button(skill.isEnabled ? t("common.selection.on") : t("common.selection.off")) {
                Task { await container.setSkillEnabled(skill.id, enabled: !skill.isEnabled, sourceId: groupId) }
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
            screenState.detailHoveredItemIdByGroup[groupId] = isHovering ? detailSkillItemId(skill.id) : nil
        }
    }

    private func detailOriginRow(originLabel: String, starCount: Int?) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(t("common.meta.from", originLabel))
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

    private func detailGroupDocuments(_ detail: DetailViewModel, groupId: String) -> some View {
        let isDocumentLoading = screenState.pendingDetailDocumentIdByGroup[groupId] != nil

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

    private func detailAgentRail(groupId: String, detail: DetailViewModel?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("common.section.agents"))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    detailToggleButton(selection: detail?.targetSelection ?? .empty) {
                        Task { await container.toggleAllTargets(sourceId: groupId) }
                    }

                    ForEach(detail?.targets ?? []) { target in
                        Button {
                            Task { await container.setTargetEnabled(target.id, enabled: !target.isEnabled, sourceId: groupId) }
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

                    if detail == nil {
                        ForEach(0..<3, id: \.self) { _ in
                            RoundedRectangle(cornerRadius: 10)
                                .fill(AppTheme.documentBlock(for: theme))
                                .frame(width: 120, height: detailAgentItemHeight)
                                .overlay {
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
                                }
                        }
                    }
                }
            }
        }
    }

    private func detailLoadingSection(title: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            detailContentCard {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(0..<3, id: \.self) { index in
                        RoundedRectangle(cornerRadius: 6)
                            .fill(AppTheme.toolbarButtonBackground(for: theme))
                            .frame(width: index == 2 ? 180 : nil, height: 12)
                            .frame(maxWidth: .infinity, alignment: .leading)
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

    private func detailFileTreeCard(_ lines: [DetailViewModel.FileTreeLine]) -> some View {
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
    private func detailDocumentContent(document: DetailViewModel.DocumentTab) -> some View {
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

    private func selectedDocument(for skill: DetailViewModel.DetailSkill) -> DetailViewModel.DocumentTab? {
        let selectedId = screenState.pendingDetailDocumentIdBySkill[skill.id]
            ?? screenState.detailDocumentTabIdBySkill[skill.id]
            ?? skill.documents.first?.id
        return skill.documents.first(where: { $0.id == selectedId }) ?? skill.documents.first
    }

    private func selectedGroupDocument(
        for detail: DetailViewModel,
        groupId: String
    ) -> DetailViewModel.DocumentTab? {
        let selectedId = screenState.pendingDetailDocumentIdByGroup[groupId]
            ?? screenState.detailDocumentTabIdByGroup[groupId]
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

    private func detailIndicatorFrame(itemId: String?, detail: DetailViewModel?) -> CGRect? {
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
        guard itemId.hasPrefix("skill:"),
              let detail else {
            return nil
        }
        let index = max(0, detailSkillIndex(from: itemId, detail: detail))
        let originY = detailGroupRowHeight
            + detailSkillDividerHeight
            + CGFloat(index) * detailSkillRowHeight
            + ((detailSkillRowHeight - detailIndicatorHeight) / 2)
        return CGRect(x: 0, y: originY, width: 4, height: detailIndicatorHeight)
    }

    private func detailSkillIndex(from itemId: String, detail: DetailViewModel) -> Int {
        let skillId = itemId.replacingOccurrences(of: "skill:", with: "")
        return detail.skills.firstIndex(where: { $0.id == skillId }) ?? 0
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

    private func preferredDetailSkillId(for detail: DetailViewModel) -> String? {
        detail.skills.first(where: \.isEnabled)?.id ?? detail.skills.first?.id
    }

    private func isShowingGroupOverview(_ groupId: String) -> Bool {
        screenState.detailShowsGroupOverviewByGroup[groupId] ?? false
    }

    private func selectGroupOverview(groupId: String, detail: DetailViewModel?) {
        if screenState.detailSkillIdByGroup[groupId] == nil, let detail {
            screenState.detailSkillIdByGroup[groupId] = preferredDetailSkillId(for: detail)
        }
        screenState.detailShowsGroupOverviewByGroup[groupId] = true
    }

    private func selectedDetailSkill(for groupId: String, detail: DetailViewModel?) -> DetailViewModel.DetailSkill? {
        guard let detail else { return nil }
        let selectedId = screenState.pendingDetailSkillIdByGroup[groupId]
            ?? screenState.detailSkillIdByGroup[groupId]
            ?? preferredDetailSkillId(for: detail)
        if screenState.detailSkillIdByGroup[groupId] == nil, let selectedId {
            screenState.detailSkillIdByGroup[groupId] = selectedId
        }
        return detail.skills.first(where: { $0.id == selectedId }) ?? detail.skills.first
    }

    private func scheduleSkillSelection(groupId: String, skill: DetailViewModel.DetailSkill) {
        screenState.pendingDetailSkillIdByGroup[groupId] = skill.id
        let token = nextSelectionToken(screenState.detailSkillSelectionTokenByGroup[groupId])
        screenState.detailSkillSelectionTokenByGroup[groupId] = token

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(40))
            guard screenState.detailSkillSelectionTokenByGroup[groupId] == token else { return }
            screenState.detailSkillIdByGroup[groupId] = skill.id
            screenState.detailShowsGroupOverviewByGroup[groupId] = false
            if screenState.detailDocumentTabIdBySkill[skill.id] == nil {
                screenState.detailDocumentTabIdBySkill[skill.id] = skill.documents.first?.id
            }
            screenState.pendingDetailSkillIdByGroup[groupId] = nil
        }
    }

    private func scheduleSkillDocumentSelection(skillId: String, documentId: String) {
        screenState.pendingDetailDocumentIdBySkill[skillId] = documentId
        let token = nextSelectionToken(screenState.detailDocumentSelectionTokenBySkill[skillId])
        screenState.detailDocumentSelectionTokenBySkill[skillId] = token

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(40))
            guard screenState.detailDocumentSelectionTokenBySkill[skillId] == token else { return }
            screenState.detailDocumentTabIdBySkill[skillId] = documentId
            screenState.pendingDetailDocumentIdBySkill[skillId] = nil
        }
    }

    private func scheduleGroupDocumentSelection(groupId: String, documentId: String) {
        screenState.pendingDetailDocumentIdByGroup[groupId] = documentId
        let token = nextSelectionToken(screenState.detailDocumentSelectionTokenByGroup[groupId])
        screenState.detailDocumentSelectionTokenByGroup[groupId] = token

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(40))
            guard screenState.detailDocumentSelectionTokenByGroup[groupId] == token else { return }
            screenState.detailDocumentTabIdByGroup[groupId] = documentId
            screenState.pendingDetailDocumentIdByGroup[groupId] = nil
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
        case .empty: return t("common.selection.off")
        case .partial: return t("common.selection.partial")
        case .full: return t("common.selection.on")
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

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }
}

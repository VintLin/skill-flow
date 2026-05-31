import AppKit
import Observation
import SwiftUI

enum DetailRouteBootstrap {
    @MainActor
    static func applySelections(
        state: DetailScreenState,
        sourceId: String,
        detail: DetailViewModel?
    ) {
        if state.detailShowsGroupOverviewByGroup[sourceId] == nil {
            state.detailShowsGroupOverviewByGroup[sourceId] = true
        }
        guard let detail else {
            return
        }
        if state.detailSkillIdByGroup[sourceId] == nil {
            state.detailSkillIdByGroup[sourceId] = preferredDetailSkillId(for: detail)
        }
        if state.detailDocumentTabIdByGroup[sourceId] == nil {
            state.detailDocumentTabIdByGroup[sourceId] = detail.groupDocuments.first?.id
        }
        for skill in detail.skills where state.detailDocumentTabIdBySkill[skill.id] == nil {
            state.detailDocumentTabIdBySkill[skill.id] = skill.documents.first?.id
        }
        if state.detailSelectedTreeItemIdByGroup[sourceId] == nil,
           state.detailShowsGroupOverviewByGroup[sourceId] == false,
           let selectedSkillId = state.detailSkillIdByGroup[sourceId] ?? preferredDetailSkillId(for: detail),
           let treeItemId = detail.fileTree.skillRootItemId(for: selectedSkillId) {
            state.detailSelectedTreeItemIdByGroup[sourceId] = treeItemId
        }
    }

    static func shouldFetchInspect(hasInspectPayload: Bool, isInspectRequestInFlight: Bool) -> Bool {
        !hasInspectPayload && !isInspectRequestInFlight
    }

    @MainActor
    static func displayedDetailSkill(
        state: DetailScreenState,
        sourceId: String,
        detail: DetailViewModel?
    ) -> DetailViewModel.DetailSkill? {
        guard let detail else {
            return nil
        }

        let selectedId = state.pendingDetailSkillIdByGroup[sourceId]
            ?? state.detailSkillIdByGroup[sourceId]
            ?? preferredDetailSkillId(for: detail)

        if state.detailSkillIdByGroup[sourceId] == nil, let selectedId {
            state.detailSkillIdByGroup[sourceId] = selectedId
        }

        return detail.skills.first(where: { $0.id == selectedId }) ?? detail.skills.first
    }

    @MainActor
    static func isSkillContentLoading(
        state: DetailScreenState,
        sourceId: String,
        detail: DetailViewModel?
    ) -> Bool {
        if state.pendingDetailSkillIdByGroup[sourceId] != nil {
            return true
        }
        guard state.detailShowsGroupOverviewByGroup[sourceId] != true else {
            return false
        }
        return detail == nil
    }

    @MainActor
    static func selectedSidebarItemId(state: DetailScreenState, sourceId: String) -> String {
        if state.detailShowsGroupOverviewByGroup[sourceId] ?? false {
            return detailGroupItemId(groupId: sourceId)
        }
        if let skillId = state.pendingDetailSkillIdByGroup[sourceId] ?? state.detailSkillIdByGroup[sourceId] {
            return detailSkillItemId(skillId: skillId)
        }
        return detailGroupItemId(groupId: sourceId)
    }

    @MainActor
    static func isSidebarSkillSelected(
        state: DetailScreenState,
        sourceId: String,
        skillId: String
    ) -> Bool {
        guard state.detailShowsGroupOverviewByGroup[sourceId] != true else {
            return false
        }
        return (state.pendingDetailSkillIdByGroup[sourceId] ?? state.detailSkillIdByGroup[sourceId]) == skillId
    }

    @MainActor
    static func selectGroupOverview(
        state: DetailScreenState,
        sourceId: String,
        detail: DetailViewModel?
    ) {
        if state.detailSkillIdByGroup[sourceId] == nil, let detail {
            state.detailSkillIdByGroup[sourceId] = preferredDetailSkillId(for: detail)
        }
        state.pendingDetailSkillIdByGroup[sourceId] = nil
        state.detailSkillSelectionTokenByGroup[sourceId] = nextSelectionToken(
            state.detailSkillSelectionTokenByGroup[sourceId]
        )
        state.detailShowsGroupOverviewByGroup[sourceId] = true
        state.detailSelectedTreeItemIdByGroup[sourceId] = nil
    }

    private static func preferredDetailSkillId(for detail: DetailViewModel) -> String? {
        detail.skills.first(where: \.isEnabled)?.id ?? detail.skills.first?.id
    }

    private static func nextSelectionToken(_ current: UInt64?) -> UInt64 {
        (current ?? 0) &+ 1
    }

    private static func detailGroupItemId(groupId: String) -> String {
        "group:\(groupId)"
    }

    private static func detailSkillItemId(skillId: String) -> String {
        "skill:\(skillId)"
    }
}

struct DetailScreen: View {
    @Environment(\.locale) private var locale
    @State private var isEditingTags = false

    private let detailHeaderMinHeight: CGFloat = DetailSidebarLayout.headerMinHeight
    private let detailToggleWidth: CGFloat = 34
    private let detailToggleHeight: CGFloat = 34
    private let detailAgentItemHeight: CGFloat = 34
    private let detailAgentIconSize: CGFloat = 20
    private let detailHeaderTitleSize: CGFloat = 21
    private let detailHeaderMetaSize: CGFloat = 12
    private let detailSidebarTitleSize: CGFloat = 13
    private let detailSidebarMetaSize: CGFloat = 11

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
                        fallbackRow: fallbackRow
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
        DetailRouteBootstrap.applySelections(state: screenState, sourceId: sourceId, detail: detail)
        guard DetailRouteBootstrap.shouldFetchInspect(
            hasInspectPayload: container.hasInspectPayload(for: sourceId),
            isInspectRequestInFlight: container.isInspectRequestInFlight(for: sourceId)
        ) else {
            return
        }
        await container.selectSource(sourceId)
        DetailRouteBootstrap.applySelections(state: screenState, sourceId: sourceId, detail: container.viewModel)
    }

    private func detailSidebar(
        groupId: String,
        detail: DetailViewModel?,
        fallbackRow: MainViewModel.SourceRow?
    ) -> some View {
        let skills = detail?.skills ?? []
        let selectedItemId = DetailRouteBootstrap.selectedSidebarItemId(state: screenState, sourceId: groupId)

        return VStack(alignment: .leading, spacing: 0) {
            ScrollView {
                ZStack(alignment: .topLeading) {
                    if let indicatorFrame = detailIndicatorFrame(itemId: selectedItemId, detail: detail) {
                        RoundedRectangle(cornerRadius: 999)
                            .fill(AppTheme.brand(for: accent, in: theme))
                            .frame(width: 4, height: indicatorFrame.height)
                            .offset(x: 0, y: indicatorFrame.minY)
                            .animation(.spring(response: 0.22, dampingFraction: 0.82), value: selectedItemId)
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
        let isSkillLoading = DetailRouteBootstrap.isSkillContentLoading(
            state: screenState,
            sourceId: groupId,
            detail: detail
        )

        return VStack(alignment: .leading, spacing: 0) {
            if showingGroupOverview {
                detailGroupHeader(
                    detail: detail,
                    fallbackTitle: detailFallbackTitle(sourceId: groupId, fallbackRow: fallbackRow),
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
                        detailSkillOverview(groupId: groupId, skill: selectedSkill)
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
            .background(AppTheme.detailBodyBackground(for: theme))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(AppTheme.detailBodyBackground(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
        .contentShape(Rectangle())
        .onTapGesture {
            isEditingTags = false
        }
    }

    private func detailGroupOverview(
        groupId: String,
        detail: DetailViewModel?,
        fallbackRow _: MainViewModel.SourceRow?
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            detailTagRail(groupId: groupId)
            detailAgentRail(groupId: groupId, detail: detail, isLoading: detail == nil)

            if let detail, !detail.groupDocuments.isEmpty {
                detailGroupDocuments(detail, groupId: groupId)
            } else {
                detailGroupDocumentsLoadingPlaceholder()
            }
        }
    }

    private func detailSkillOverview(groupId: String, skill: DetailViewModel.DetailSkill) -> some View {
        let isDocumentLoading = screenState.pendingDetailDocumentIdBySkill[skill.id] != nil
        let selectedSkillDocument = selectedDocument(for: skill)
        _ = screenState.detailDocumentLoadRevision

        return VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 10) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(skill.documents) { document in
                            documentTabChip(
                                title: Self.localizedDocumentTitle(document, locale: locale),
                                isSelected: selectedSkillDocument?.id == document.id,
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
                    } else if let document = selectedSkillDocument {
                        if let resolvedDocument = resolvedSkillDocument(sourceId: groupId, document: document) {
                            detailDocumentContent(document: resolvedDocument)
                        } else {
                            detailDocumentLoadingPlaceholder()
                        }
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
        .task(id: selectedSkillDocument?.renderCacheKey) {
            guard let selectedSkillDocument, !selectedSkillDocument.isLoaded else {
                return
            }
            await container.loadDocument(
                sourceId: groupId,
                documentId: selectedSkillDocument.id,
                renderCacheKey: selectedSkillDocument.renderCacheKey
            )
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
        _ = fallbackOriginLabel

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                detailHeaderTitleRow(
                    title: detail?.title ?? fallbackTitle,
                    author: detail?.author ?? "@unknown",
                    hasCustomDisplayName: detail?.hasCustomDisplayName ?? false,
                    originalDisplayName: detail?.originalDisplayName
                )
                Spacer(minLength: 0)
                if container.onRenameGroup != nil, let sourceId = container.sourceId {
                    Button {
                        container.onRenameGroup?(
                            sourceId,
                            detail?.title ?? fallbackTitle,
                            detail?.originalDisplayName ?? fallbackTitle
                        )
                    } label: {
                        Image(systemName: "pencil")
                            .font(.system(size: 12))
                            .foregroundStyle(AppTheme.textMuted(for: theme))
                            .frame(width: 18, height: 18)
                    }
                    .buttonStyle(.plain)
                    .help(t("group_card.action.rename"))
                }
            }

            detailHeaderMetadataRow(stats: detail?.groupStats ?? emptyStats)
        }
        .padding(14)
        .frame(height: detailHeaderMinHeight, alignment: .center)
        .background(AppTheme.detailHeaderBackground(for: theme))
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(AppTheme.detailHeaderBottomBorder(for: theme))
                .frame(height: 1)
        }
        .overlay(alignment: .trailing) {
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
            .padding(.trailing, 14)
        }
    }

    private func detailHeaderTitleRow(
        title: String,
        author: String,
        hasCustomDisplayName: Bool = false,
        originalDisplayName: String? = nil
    ) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            HStack(alignment: .center, spacing: 6) {
                Text(title)
                    .font(.system(size: detailHeaderTitleSize, weight: .regular))
                    .foregroundStyle(AppTheme.brand(for: accent, in: theme))
                    .lineLimit(1)
                    .truncationMode(.tail)
                if hasCustomDisplayName, let original = originalDisplayName {
                    Image(systemName: "info.circle")
                        .font(.system(size: 12))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .frame(width: 18, height: 18)
                        .help(L10n.string("group_card.original_name", locale: locale, arguments: [original]))
                }
            }

            Text(t("detail.meta.by", author))
                .font(.system(size: detailHeaderMetaSize, weight: .regular))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .lineLimit(1)
        }
    }

    private func detailHeaderMetadataRow(stats: MainViewModel.GroupCardStats) -> some View {
        HStack(spacing: 10) {
            if let skillCount = stats.skillCount {
                detailStatItem(icon: .skills, text: formattedCount(skillCount))
            }
            if let downloadCount = stats.downloadCount {
                detailStatItem(icon: .downloads, text: formattedCount(downloadCount))
            }
            if let starCount = stats.starCount {
                detailStatItem(icon: .star, text: formattedCount(starCount))
            }
            if let githubURL = stats.githubURL {
                Button {
                    openExternalURL(githubURL)
                } label: {
                    detailStatIcon(.github)
                }
                .buttonStyle(.plain)
                .help(githubURL)
            }
            if let localPath = stats.localPath ?? container.viewModel?.groupPath {
                Button {
                    openPath(localPath)
                } label: {
                    detailStatIcon(.localFile)
                }
                .buttonStyle(.plain)
                .help(localPath)
            }
            Spacer(minLength: 0)
        }
        .frame(height: detailHeaderMetaSize + 4, alignment: .leading)
    }

    private func detailSkillVersionRow(_ version: String?) -> some View {
        detailInfoRow(version: version, documentContent: nil, fontSize: detailHeaderMetaSize)
    }

    private var emptyStats: MainViewModel.GroupCardStats {
        .init(skillCount: nil, downloadCount: nil, starCount: nil, githubURL: nil, localPath: nil)
    }

    private func detailSkillHeader(skill: DetailViewModel.DetailSkill?, fallbackGroupId: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            detailHeaderTitleRow(title: skill?.title ?? fallbackGroupId, author: skill?.author ?? "@unknown")
            detailInfoRow(version: skill?.version, documentContent: skill?.documentContent, fontSize: detailHeaderMetaSize)
        }
        .padding(14)
        .frame(height: detailHeaderMinHeight, alignment: .center)
        .background(AppTheme.detailHeaderBackground(for: theme))
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(AppTheme.detailHeaderBottomBorder(for: theme))
                .frame(height: 1)
        }
    }

    private func detailGroupListRow(
        groupId: String,
        detail: DetailViewModel?,
        fallbackRow: MainViewModel.SourceRow?
    ) -> some View {
        let isSelected = isShowingGroupOverview(groupId)
        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(detail?.title ?? detailFallbackTitle(sourceId: groupId, fallbackRow: fallbackRow))
                    .font(.system(size: detailSidebarTitleSize, weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(isSelected ? AppTheme.brand(for: accent, in: theme) : AppTheme.textPrimary(for: theme))
                    .lineLimit(1)
                Text(t("detail.meta.by", detail?.author ?? "@unknown"))
                    .font(.system(size: detailSidebarMetaSize, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .lineLimit(1)
            }

            Spacer(minLength: 10)

            detailToggleButton(selection: detail?.skillSelection ?? .empty) {
                Task { await container.toggleAllSkills(sourceId: groupId) }
            }
        }
        .frame(height: DetailSidebarLayout.groupRowHeight)
        .contentShape(Rectangle())
        .desktopRowHover(theme: theme, accent: accent, isEnabled: true, isSelected: isSelected)
        .onTapGesture {
            selectGroupOverview(groupId: groupId, detail: detail)
        }
    }

    private var detailSkillsLabelRow: some View {
        HStack {
            Rectangle()
                .fill(AppTheme.border(for: theme))
                .frame(height: 1)
        }
        .frame(height: DetailSidebarLayout.skillDividerHeight)
    }

    private func detailSkillListRow(groupId: String, skill: DetailViewModel.DetailSkill) -> some View {
        let isPending = screenState.pendingDetailSkillIdByGroup[groupId] == skill.id
        let isSelected = DetailRouteBootstrap.isSidebarSkillSelected(
            state: screenState,
            sourceId: groupId,
            skillId: skill.id
        )

        return HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(skill.title)
                    .font(.system(size: detailSidebarTitleSize, weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(isSelected ? AppTheme.brand(for: accent, in: theme) : AppTheme.textPrimary(for: theme))
                    .lineLimit(1)

                detailInfoRow(version: skill.version, documentContent: skill.documentContent, fontSize: detailSidebarMetaSize)
            }
            .frame(maxHeight: .infinity, alignment: .center)

            Spacer(minLength: 10)

            Button {
                Task { await container.setSkillEnabled(skill.id, enabled: !skill.isEnabled, sourceId: groupId) }
            } label: {
                Text(skill.isEnabled ? t("common.selection.on") : t("common.selection.off"))
                    .font(.system(size: 10, weight: .bold))
                    .frame(width: detailToggleWidth, height: detailToggleHeight)
                    .background(AppTheme.selectionControlFill(skill.isEnabled ? .full : .empty, for: theme))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .foregroundStyle(AppTheme.selectionControlText(skill.isEnabled ? .full : .empty, for: theme))
                    .contentShape(RoundedRectangle(cornerRadius: 8))
            }
            .buttonStyle(.plain)
            .desktopMotionChip(
                kind: .switch,
                theme: theme,
                accent: accent,
                isEnabled: true,
                isSelected: skill.isEnabled
            )
        }
        .frame(height: DetailSidebarLayout.skillRowHeight)
        .opacity(isPending ? 0.72 : 1)
        .contentShape(Rectangle())
        .desktopRowHover(theme: theme, accent: accent, isEnabled: !isPending, isSelected: isSelected)
        .onTapGesture {
            scheduleSkillSelection(groupId: groupId, skill: skill)
        }
    }

    @ViewBuilder
    private func detailInfoRow(version: String?, documentContent: String?, fontSize: CGFloat) -> some View {
        let items = DetailInfoLayout.headerItems(version: version, documentContent: documentContent, locale: locale)

        HStack(spacing: 10) {
            if items.isEmpty {
                Text(" ")
                    .font(.system(size: fontSize, weight: .regular))
                    .foregroundStyle(.clear)
            } else {
                ForEach(items) { item in
                    detailInfoItem(item, fontSize: fontSize)
                }
            }
            Spacer(minLength: 0)
        }
        .frame(height: fontSize + 4, alignment: .leading)
    }

    @ViewBuilder
    private func detailInfoItem(_ item: DetailInfoLayout.Item, fontSize: CGFloat) -> some View {
        HStack(spacing: 4) {
            if let image = item.icon.image {
                Image(nsImage: image)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .frame(width: fontSize, height: fontSize)
            }
            Text(item.text)
                .font(.system(size: fontSize, weight: .regular))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .lineLimit(1)
        }
    }

    private func formattedStarCount(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    private func formattedCount(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    private func detailStatItem(icon: DetailHeaderStatIcon, text: String) -> some View {
        HStack(spacing: 4) {
            detailStatIcon(icon)
            Text(text)
                .font(.system(size: detailHeaderMetaSize, weight: .medium))
                .foregroundStyle(AppTheme.textMuted(for: theme))
        }
    }

    @ViewBuilder
    private func detailStatIcon(_ icon: DetailHeaderStatIcon) -> some View {
        if let image = icon.image {
            Image(nsImage: image)
                .renderingMode(.template)
                .resizable()
                .scaledToFit()
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .frame(width: 11, height: 11)
        }
    }

    private func detailGroupDocuments(_ detail: DetailViewModel, groupId: String) -> some View {
        let isDocumentLoading = screenState.pendingDetailDocumentIdByGroup[groupId] != nil
        let selectedDocument = selectedGroupDocumentDescriptor(for: detail, groupId: groupId)
        _ = screenState.detailDocumentLoadRevision

        return VStack(alignment: .leading, spacing: 10) {
            Text(t("detail.section.documents"))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(detail.groupDocuments) { document in
                        documentTabChip(
                            title: Self.localizedDocumentTitle(document, locale: locale),
                            isSelected: selectedGroupDocumentDescriptor(for: detail, groupId: groupId)?.id == document.id,
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
            } else if let selectedDocument {
                if selectedDocument.id == detail.groupDocuments.first?.id {
                    detailFileTreeCard(groupId: groupId, detail: detail)
                } else if let resolvedDocument = container.groupDocument(
                    sourceId: groupId,
                    documentId: selectedDocument.id,
                    renderCacheKey: selectedDocument.renderCacheKey
                ) {
                    detailContentCard {
                        detailDocumentContent(document: resolvedDocument)
                    }
                } else {
                    detailContentCard {
                        detailDocumentLoadingPlaceholder()
                    }
                }
            }
        }
        .task(id: selectedDocument?.renderCacheKey) {
            guard let selectedDocument,
                  selectedDocument.id != detail.groupDocuments.first?.id
            else {
                return
            }
            await container.loadDocument(
                sourceId: groupId,
                documentId: selectedDocument.id,
                renderCacheKey: selectedDocument.renderCacheKey
            )
        }
    }

    private func detailAgentRail(groupId: String, detail: DetailViewModel?, isLoading: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("common.section.agents"))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    detailToggleButton(selection: detail?.targetSelection ?? .empty, isLoading: isLoading) {
                        Task { await container.toggleAllTargets(sourceId: groupId) }
                    }

                    ForEach(detail?.targets ?? []) { target in
                        Button {
                            Task {
                                await container.setTargetEnabled(
                                    target.id,
                                    enabled: !target.isEnabled,
                                    expectedCurrentEnabled: target.isEnabled,
                                    sourceId: groupId
                                )
                            }
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
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                        }
                        .buttonStyle(.plain)
                        .desktopMotionChip(
                            kind: .pill,
                            theme: theme,
                            accent: accent,
                            isEnabled: true,
                            isSelected: target.isEnabled
                        )
                    }

                    if isLoading {
                        ForEach(Array(DetailLoadingLayout.groupAgentPlaceholderWidths.enumerated()), id: \.offset) { _, width in
                            RoundedRectangle(cornerRadius: 10)
                                .fill(AppTheme.documentBlock(for: theme))
                                .frame(width: width, height: detailAgentItemHeight)
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

    private func detailTagRail(groupId: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(t("common.section.tags"))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            EditableGroupTagSection(
                theme: theme,
                accent: accent,
                controlHeight: detailAgentItemHeight,
                cornerRadius: 10,
                inputWidth: 72,
                tagItems: container.groupTags(for: groupId, locale: locale),
                suggestions: container.tagSuggestions(for: groupId, locale: locale),
                canAddMore: container.canAddTag(for: groupId, locale: locale),
                isEditing: isEditingTags,
                isDeleteMode: false,
                onEditingChange: { isEditingTags = $0 },
                onCreate: { title, itemAccent in
                    container.addCustomTag(title, accent: itemAccent, toSourceId: groupId, locale: locale)
                },
                onDelete: { item in
                    container.removeCustomTag(item.id, fromSourceId: groupId, locale: locale)
                },
                onSelect: nil
            )
        }
    }

    private func detailGroupDocumentsLoadingPlaceholder() -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(t("detail.section.documents"))
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(DetailLoadingLayout.groupDocumentTabPlaceholderWidths.enumerated()), id: \.offset) { _, width in
                        RoundedRectangle(cornerRadius: 8)
                            .fill(AppTheme.documentBlock(for: theme))
                            .frame(width: width, height: detailAgentItemHeight)
                    }
                }
            }

            detailContentCard {
                detailDocumentLoadingPlaceholder(lineCount: DetailLoadingLayout.groupDocumentLineCount)
            }
        }
    }

    private func detailFileTreeCard(groupId: String, detail: DetailViewModel) -> some View {
        detailContentCard {
            VStack(alignment: .leading, spacing: 2) {
                ForEach(detail.fileTree) { item in
                    detailFileTreeItemRow(
                        groupId: groupId,
                        detail: detail,
                        item: item,
                        depth: 0,
                        ancestryHasTrailingSiblings: [],
                        isLast: true
                    )
                }
            }
        }
    }

    private func detailFileTreeItemRow(
        groupId: String,
        detail: DetailViewModel,
        item: DetailViewModel.FileTreeItem,
        depth: Int,
        ancestryHasTrailingSiblings: [Bool],
        isLast: Bool
    ) -> AnyView {
        let isExpanded = detailIsTreeItemExpanded(groupId: groupId, itemId: item.id, defaultExpanded: item.isDirectory)
        let isSelected = detailIsTreeItemSelected(groupId: groupId, item: item, detail: detail)
        let isSkillRoot = item.isSkillRoot && item.skillId != nil
        let showsSkillLink = isSkillRoot || item.isSkillDocument
        let indicatorColor = isSelected
            ? AppTheme.brand(for: accent, in: theme)
            : AppTheme.textMuted(for: theme).opacity(0.45)

        return AnyView(VStack(alignment: .leading, spacing: 2) {
            Button {
                handleTreeItemSelection(groupId: groupId, item: item, detail: detail)
            } label: {
                HStack(spacing: 0) {
                    ForEach(Array(ancestryHasTrailingSiblings.enumerated()), id: \.offset) { _, hasTrailingSibling in
                        detailTreeVerticalGuide(isVisible: hasTrailingSibling)
                    }

                    detailTreeNodeLead(depth: depth, isLast: isLast)

                    HStack(spacing: DetailTreeLayout.contentSpacing) {
                        Image(systemName: item.isDirectory ? "folder.fill" : "doc.text")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(isSkillRoot ? AppTheme.brand(for: accent, in: theme) : AppTheme.textMuted(for: theme))
                            .frame(
                                width: DetailTreeLayout.iconColumnWidth,
                                alignment: .leading
                            )

                        Text(item.title)
                            .font(.system(size: 11, weight: showsSkillLink ? .semibold : .regular))
                            .foregroundStyle(isSelected ? AppTheme.brand(for: accent, in: theme) : AppTheme.textPrimary(for: theme))
                            .lineLimit(1)
                    }
                    .padding(.trailing, DetailTreeLayout.rowTrailingPadding)
                    .frame(height: DetailTreeLayout.rowHeight, alignment: .leading)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(
                                isSelected
                                    ? AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.22 : 0.16)
                                    : Color.clear
                            )
                    )
                    .overlay(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 999)
                            .fill(indicatorColor)
                            .frame(width: 2, height: 16)
                            .opacity(isSelected ? 1 : 0)
                            .padding(.leading, 4)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .desktopRowHover(theme: theme, accent: accent, isEnabled: true, isSelected: isSelected)

            if item.isDirectory && isExpanded {
                ForEach(Array(item.children.enumerated()), id: \.element.id) { index, child in
                    detailFileTreeItemRow(
                        groupId: groupId,
                        detail: detail,
                        item: child,
                        depth: depth + 1,
                        ancestryHasTrailingSiblings: ancestryHasTrailingSiblings + [!isLast],
                        isLast: index == item.children.count - 1
                    )
                }
            }
        })
    }

    @ViewBuilder
    private func detailDocumentContent(document: DetailViewModel.DocumentTab) -> some View {
        if document.path.lowercased().hasSuffix(".md") {
            MarkdownDocumentView(model: .init(document: document), theme: theme)
                .equatable()
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text(document.content)
                .font(.system(size: 11, weight: .regular, design: .monospaced))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
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

    private func resolvedSkillDocument(
        sourceId: String,
        document: DetailViewModel.DocumentTab
    ) -> DetailViewModel.DocumentTab? {
        if document.isLoaded {
            return document
        }
        return container.groupDocument(
            sourceId: sourceId,
            documentId: document.id,
            renderCacheKey: document.renderCacheKey
        )
    }

    private func selectedGroupDocumentDescriptor(
        for detail: DetailViewModel,
        groupId: String
    ) -> DetailViewModel.DocumentDescriptor? {
        let selectedId = screenState.pendingDetailDocumentIdByGroup[groupId]
            ?? screenState.detailDocumentTabIdByGroup[groupId]
            ?? detail.groupDocuments.first?.id
        return detail.groupDocuments.first(where: { $0.id == selectedId }) ?? detail.groupDocuments.first
    }

    private func detailGroupItemId(_ groupId: String) -> String {
        "group:\(groupId)"
    }

    private func detailSkillItemId(_ skillId: String) -> String {
        "skill:\(skillId)"
    }

    private func detailIndicatorFrame(itemId: String?, detail: DetailViewModel?) -> CGRect? {
        DetailSidebarLayout.indicatorFrame(itemId: itemId, skillIds: detail?.skills.map(\.id) ?? [])
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
        DetailRouteBootstrap.selectGroupOverview(
            state: screenState,
            sourceId: groupId,
            detail: detail
        )
    }

    private func selectedDetailSkill(for groupId: String, detail: DetailViewModel?) -> DetailViewModel.DetailSkill? {
        DetailRouteBootstrap.displayedDetailSkill(
            state: screenState,
            sourceId: groupId,
            detail: detail
        )
    }

    private func scheduleSkillSelection(groupId: String, skill: DetailViewModel.DetailSkill) {
        if screenState.detailSkillIdByGroup[groupId] == skill.id,
           screenState.detailShowsGroupOverviewByGroup[groupId] == false {
            return
        }
        screenState.pendingDetailSkillIdByGroup[groupId] = skill.id
        let token = nextSelectionToken(screenState.detailSkillSelectionTokenByGroup[groupId])
        screenState.detailSkillSelectionTokenByGroup[groupId] = token

        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(DetailSidebarLayout.selectionTransitionDelayMilliseconds))
            guard screenState.detailSkillSelectionTokenByGroup[groupId] == token else { return }
            screenState.detailSkillIdByGroup[groupId] = skill.id
            screenState.detailShowsGroupOverviewByGroup[groupId] = false
            if let detail = container.viewModel,
               let treeItemId = detail.fileTree.skillRootItemId(for: skill.id) {
                screenState.detailSelectedTreeItemIdByGroup[groupId] = treeItemId
                expandTreePath(groupId: groupId, itemId: treeItemId, detail: detail)
            }
            if screenState.detailDocumentTabIdBySkill[skill.id] == nil {
                screenState.detailDocumentTabIdBySkill[skill.id] = skill.documents.first?.id
            }
            screenState.pendingDetailSkillIdByGroup[groupId] = nil
        }
    }

    private func detailIsTreeItemExpanded(groupId: String, itemId: String, defaultExpanded: Bool) -> Bool {
        let collapsedIds = Set(screenState.detailCollapsedTreeItemIdsByGroup[groupId] ?? [])
        return defaultExpanded && !collapsedIds.contains(itemId)
    }

    private func detailIsTreeItemSelected(
        groupId: String,
        item: DetailViewModel.FileTreeItem,
        detail: DetailViewModel
    ) -> Bool {
        guard !isShowingGroupOverview(groupId) else {
            return false
        }
        if screenState.detailSelectedTreeItemIdByGroup[groupId] == item.id {
            return true
        }
        guard let selectedSkill = selectedDetailSkill(for: groupId, detail: detail),
              item.skillId == selectedSkill.id
        else {
            return false
        }
        return true
    }

    private func handleTreeItemSelection(groupId: String, item: DetailViewModel.FileTreeItem, detail: DetailViewModel) {
            screenState.detailSelectedTreeItemIdByGroup[groupId] = item.id

        if let skillId = item.skillId,
           let skill = detail.skills.first(where: { $0.id == skillId }),
           (item.isSkillRoot || item.isSkillDocument) {
            expandTreePath(groupId: groupId, itemId: item.id, detail: detail)
            scheduleSkillSelection(groupId: groupId, skill: skill)
            return
        }

        guard item.isDirectory else {
            return
        }

        var collapsedIds = Set(screenState.detailCollapsedTreeItemIdsByGroup[groupId] ?? [])
        if collapsedIds.contains(item.id) {
            collapsedIds.remove(item.id)
        } else {
            collapsedIds.insert(item.id)
        }
        screenState.detailCollapsedTreeItemIdsByGroup[groupId] = Array(collapsedIds)
    }

    private func detailTreeVerticalGuide(isVisible: Bool) -> some View {
        ZStack(alignment: .leading) {
            Color.clear
            if isVisible {
                Rectangle()
                    .fill(AppTheme.border(for: theme).opacity(0.7))
                    .frame(width: 1, height: DetailTreeLayout.rowHeight)
                    .offset(x: DetailTreeLayout.guideStrokeOffset, y: 0)
            }
        }
        .frame(width: DetailTreeLayout.guideColumnWidth, height: DetailTreeLayout.rowHeight)
    }

    private func detailTreeNodeLead(depth: Int, isLast: Bool) -> some View {
        return ZStack(alignment: .leading) {
            Color.clear

            if depth > 0 {
                Rectangle()
                    .fill(AppTheme.border(for: theme).opacity(0.7))
                    .frame(width: 1, height: isLast ? DetailTreeLayout.rowHeight / 2 : DetailTreeLayout.rowHeight)
                    .offset(x: DetailTreeLayout.guideStrokeOffset, y: isLast ? -(DetailTreeLayout.rowHeight / 4) : 0)

                Rectangle()
                    .fill(AppTheme.border(for: theme).opacity(0.7))
                    .frame(width: DetailTreeLayout.branchLineWidth(for: depth), height: 1)
                    .offset(x: DetailTreeLayout.guideStrokeOffset, y: 0)
            }
        }
        .frame(width: DetailTreeLayout.nodeLeadWidth(for: depth), height: DetailTreeLayout.rowHeight)
    }

    private func expandTreePath(groupId: String, itemId: String, detail: DetailViewModel) {
        guard let pathIds = detail.fileTree.pathIds(to: itemId) else {
            return
        }
        var collapsedIds = Set(screenState.detailCollapsedTreeItemIdsByGroup[groupId] ?? [])
        for pathId in pathIds {
            collapsedIds.remove(pathId)
        }
        screenState.detailCollapsedTreeItemIdsByGroup[groupId] = Array(collapsedIds)
    }

    private func scheduleSkillDocumentSelection(skillId: String, documentId: String) {
        let currentId = screenState.detailDocumentTabIdBySkill[skillId]
        if currentId == documentId, screenState.pendingDetailDocumentIdBySkill[skillId] == nil {
            return
        }
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
        let currentId = screenState.detailDocumentTabIdByGroup[groupId]
        if currentId == documentId, screenState.pendingDetailDocumentIdByGroup[groupId] == nil {
            return
        }
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
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(Array(DetailLoadingLayout.skillDocumentTabPlaceholderWidths.enumerated()), id: \.offset) { _, width in
                        RoundedRectangle(cornerRadius: 8)
                            .fill(AppTheme.documentBlock(for: theme))
                            .frame(width: width, height: detailAgentItemHeight)
                    }
                }
            }
            detailContentCard {
                detailDocumentLoadingPlaceholder(lineCount: DetailLoadingLayout.skillDocumentLineCount)
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

    private func detailFallbackTitle(sourceId: String, fallbackRow: MainViewModel.SourceRow?) -> String {
        guard let rawLocator = fallbackRow?.locator else {
            return sourceId
        }

        let locator = rawLocator.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
        guard !locator.isEmpty else {
            return sourceId
        }

        let trimmed = locator
            .replacingOccurrences(of: ".git", with: "")
            .trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
            .trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let components = trimmed.split(separator: "/").map(String.init)

        if locator.hasPrefix("clawhub:"), let slug = locator.split(separator: ":").last?.split(separator: "@").first {
            return String(slug.split(separator: "/").last ?? Substring(sourceId))
        }

        if components.count >= 2, locator.contains("github.com") || locator.firstIndex(of: "/") != nil {
            return components.last ?? sourceId
        }

        return sourceId
    }

    private func detailToggleButton(selection: SelectionState, isLoading: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Group {
                if isLoading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(detailSwitchText(selection))
                        .frame(width: detailToggleWidth, height: detailToggleHeight)
                        .background(detailSwitchFill(selection))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                } else {
                    Text(detailSwitchLabel(selection))
                        .font(.system(size: 10, weight: .bold))
                        .frame(width: detailToggleWidth, height: detailToggleHeight)
                        .background(detailSwitchFill(selection))
                        .foregroundStyle(detailSwitchText(selection))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }
        }
        .buttonStyle(.plain)
        .desktopMotionChip(
            kind: .switch,
            theme: theme,
            accent: accent,
            isEnabled: !isLoading,
            isSelected: selection == .full
        )
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
        .desktopMotionChip(
            kind: .tab,
            theme: theme,
            accent: accent,
            isEnabled: true,
            isSelected: isSelected
        )
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

extension DetailScreen {
    static func localizedDocumentTitle(_ document: DetailViewModel.DocumentDescriptor, locale: Locale) -> String {
        if document.id == "group:filetree" {
            return L10n.string("detail.document.file_tree", locale: locale)
        }
        return document.title
    }

    static func localizedDocumentTitle(_ document: DetailViewModel.DocumentTab, locale: Locale) -> String {
        if document.id == "group:filetree" {
            return L10n.string("detail.document.file_tree", locale: locale)
        }
        return document.title
    }
}

enum DetailInfoLayout {
    struct Item: Identifiable, Equatable {
        let id: String
        let icon: DetailInfoIcon
        let text: String
    }

    static func wordCount(from content: String?) -> Int? {
        guard let content else {
            return nil
        }
        let normalized = content
            .replacingOccurrences(of: "#", with: " ")
            .replacingOccurrences(of: "`", with: " ")
            .replacingOccurrences(of: "*", with: " ")
            .replacingOccurrences(of: ">", with: " ")
        let components = normalized
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
        return components.isEmpty ? nil : components.count
    }

    static func headerItems(version: String?, documentContent: String?, locale: Locale) -> [Item] {
        var items: [Item] = []
        if let versionText = normalizedVersionText(version, locale: locale) {
            items.append(Item(id: "version", icon: .version, text: versionText))
        }
        if let wordCount = wordCount(from: documentContent) {
            items.append(Item(id: "word-count", icon: .wordCount, text: String(wordCount)))
        }
        return items
    }

    static func normalizedVersionText(_ version: String?, locale: Locale) -> String? {
        guard let version, !version.isEmpty else {
            return nil
        }
        _ = locale
        return version.lowercased().hasPrefix("v") ? version : "v\(version)"
    }
}

enum DetailSidebarLayout {
    static let headerMinHeight: CGFloat = 84
    static let groupRowHeight: CGFloat = 64
    static let skillRowHeight: CGFloat = 60
    static let skillDividerHeight: CGFloat = 10
    static let indicatorHeight: CGFloat = 36
    static let selectionTransitionDelayMilliseconds = 80

    static func indicatorFrame(itemId: String?, skillIds: [String]) -> CGRect? {
        guard let itemId else {
            return nil
        }
        if itemId.hasPrefix("group:") {
            return CGRect(
                x: 0,
                y: (groupRowHeight - indicatorHeight) / 2,
                width: 4,
                height: indicatorHeight
            )
        }
        guard itemId.hasPrefix("skill:") else {
            return nil
        }
        let skillId = itemId.replacingOccurrences(of: "skill:", with: "")
        let index = max(0, skillIds.firstIndex(of: skillId) ?? 0)
        let originY = groupRowHeight
            + skillDividerHeight
            + CGFloat(index) * skillRowHeight
            + ((skillRowHeight - indicatorHeight) / 2)
        return CGRect(x: 0, y: originY, width: 4, height: indicatorHeight)
    }

    static func sidebarVersionText(_ version: String?, locale: Locale) -> String {
        guard let version, !version.isEmpty else {
            return " "
        }
        let normalizedVersion = version.lowercased().hasPrefix("v") ? version : "v\(version)"
        return L10n.string("detail.version", locale: locale, arguments: [normalizedVersion])
    }
}

enum DetailTreeLayout {
    static let guideColumnWidth: CGFloat = 16
    static let iconColumnWidth: CGFloat = 14
    static let rowHeight: CGFloat = 28
    static let contentSpacing: CGFloat = 6
    static let rowTrailingPadding: CGFloat = 8
    static let iconColumnLeadingInset: CGFloat = 0
    static let guideStrokeOffset: CGFloat = guideColumnWidth / 2

    static func nodeLeadWidth(for depth: Int) -> CGFloat {
        let guideWidth = depth > 0 ? guideColumnWidth : 0
        return guideWidth + contentSpacing
    }

    static func branchLineWidth(for depth: Int) -> CGFloat {
        max(0, nodeLeadWidth(for: depth) - guideStrokeOffset)
    }
}

enum DetailInfoIcon {
    case version
    case wordCount

    var image: NSImage? {
        switch self {
        case .version:
            return DetailInfoIconLibrary.image(for: .version)
        case .wordCount:
            return DetailInfoIconLibrary.image(for: .wordCount)
        }
    }
}

private enum DetailHeaderStatIcon {
    case skills
    case downloads
    case star
    case github
    case localFile

    var image: NSImage? {
        switch self {
        case .skills:
            return GroupMetadataIconLibrary.image(for: .skills)
        case .downloads:
            return GroupMetadataIconLibrary.image(for: .download)
        case .star:
            return GroupMetadataIconLibrary.image(for: .star)
        case .github:
            return GroupMetadataIconLibrary.image(for: .github)
        case .localFile:
            return GroupMetadataIconLibrary.image(for: .localFile)
        }
    }
}

private extension Array where Element == MainViewModel.FileTreeItem {
    func skillRootItemId(for skillId: String) -> String? {
        for item in self {
            if item.skillId == skillId, item.isSkillRoot {
                return item.id
            }
            if let nested = item.children.skillRootItemId(for: skillId) {
                return nested
            }
        }
        return nil
    }

    func pathIds(to targetId: String) -> [String]? {
        for item in self {
            if item.id == targetId {
                return [item.id]
            }
            if let nested = item.children.pathIds(to: targetId) {
                return [item.id] + nested
            }
        }
        return nil
    }
}

enum DetailLoadingLayout {
    static let groupAgentPlaceholderWidths: [CGFloat] = [120, 132, 118]
    static let groupDocumentTabPlaceholderWidths: [CGFloat] = [86, 98, 82]
    static let groupDocumentLineCount = 10
    static let skillDocumentTabPlaceholderWidths: [CGFloat] = [92, 84, 106]
    static let skillDocumentLineCount = 12
}

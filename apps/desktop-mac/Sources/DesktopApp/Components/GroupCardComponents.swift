import SwiftUI
import AppKit

private enum GroupCardActionMenuPlacement {
    case above
    case below

    var attachmentAnchor: PopoverAttachmentAnchor {
        switch self {
        case .above:
            return .point(.top)
        case .below:
            return .point(.bottom)
        }
    }

    var arrowEdge: Edge {
        switch self {
        case .above:
            return .bottom
        case .below:
            return .top
        }
    }
}

private struct GroupCardActionButtonFrameKey: PreferenceKey {
    static let defaultValue: CGRect = .zero

    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        value = nextValue()
    }
}

enum GroupCardScale {
    case home
    case menu

    private var factor: CGFloat {
        switch self {
        case .home: return 1.0
        case .menu: return 0.8
        }
    }

    var cardInset: CGFloat {
        12 * factor
    }

    var cardSpacing: CGFloat {
        10 * factor
    }

    var titleSize: CGFloat {
        21
    }

    var metaSize: CGFloat {
        12
    }

    var sectionLabelSize: CGFloat {
        12
    }

    var chipHeight: CGFloat {
        34 * factor
    }

    var chipFontSize: CGFloat {
        12
    }

    var targetSize: CGFloat {
        34 * factor
    }

    var targetFontSize: CGFloat {
        11
    }

    var triStateWidth: CGFloat {
        34 * factor
    }

    var triStateHeight: CGFloat {
        34 * factor
    }

    var triStateFontSize: CGFloat {
        10
    }

    var rowSpacing: CGFloat {
        6 * factor
    }

    var headerSpacing: CGFloat {
        4 * factor
    }

    var sectionTopPadding: CGFloat {
        1.5 * factor
    }

    var sectionHorizontalPadding: CGFloat {
        12 * factor
    }

    var headerBottomSpacing: CGFloat {
        2 * factor
    }

    var sectionCountSize: CGFloat {
        metaSize
    }

    var fadeWidth: CGFloat {
        14 * factor
    }

    var minHeight: CGFloat {
        206 * factor
    }

    var cornerRadius: CGFloat {
        max(6, 10 * factor)
    }

    var shadowRadius: CGFloat {
        16 * factor
    }

    var shadowYOffset: CGFloat {
        0
    }
}

enum GroupCardDisplayMode: Equatable {
    case home
    case menu
    case importSearch
    case importRecommendation

    var scale: GroupCardScale {
        switch self {
        case .home, .importSearch, .importRecommendation:
            return .home
        case .menu:
            return .menu
        }
    }

    var showsSubtitle: Bool {
        switch self {
        case .home, .menu, .importSearch, .importRecommendation:
            return true
        }
    }

    var showsMetaLine: Bool {
        switch self {
        case .home, .importSearch, .importRecommendation:
            return true
        case .menu:
            return false
        }
    }

    var showsSectionTitles: Bool {
        switch self {
        case .home, .importSearch, .importRecommendation:
            return true
        case .menu:
            return false
        }
    }

    var supportsCollapsedSkills: Bool {
        switch self {
        case .home, .importSearch, .importRecommendation:
            return false
        case .menu:
            return true
        }
    }

    var usesPlainPrimaryActionIcon: Bool {
        switch self {
        case .importSearch, .importRecommendation:
            return true
        case .home, .menu:
            return false
        }
    }
}

struct SharedGroupCard: View {
    enum HeaderStatKind: Equatable {
        case downloads
        case star
        case github
    }

    @Environment(\.locale) private var locale
    let card: MainViewModel.GroupCardModel
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let displayMode: GroupCardDisplayMode
    let skillsCollapsed: Bool
    let isUpdating: Bool
    let onOpen: (() -> Void)?
    let onUpdate: () -> Void
    let onTogglePinned: () -> Void
    let onDelete: () -> Void
    let onToggleSkill: (String, Bool) -> Void
    let onToggleAllSkills: () -> Void
    let onToggleTarget: (String, Bool, Bool) -> Void
    let onToggleAllTargets: () -> Void
    let actionButtonTitle: String?
    let actionButtonIcon: ActionIcon
    let onActionButton: (() -> Void)?
    let groupTagItems: [GroupTagDisplayItem]
    let groupTagSuggestions: [GroupTagDisplayItem]
    let canCreateGroupTag: Bool
    let canDeleteGroupTags: Bool
    let onCreateGroupTag: ((String, DesktopAccentColor?) -> GroupTagMutationResult)?
    let onDeleteGroupTag: ((String) -> Void)?
    let onSelectGroupTag: ((GroupTagDisplayItem) -> Void)?
    let recommendationBadgeItems: [ImportViewModel.RecommendationBadgeItem]
    let recommendationDescription: String?

    @State private var isActionMenuOpen = false
    @State private var isActionButtonHovered = false
    @State private var isEditingTags = false
    @State private var isDeletingTags = false
    @State private var actionMenuPlacement: GroupCardActionMenuPlacement = .below
    @State private var actionButtonFrame: CGRect = .zero

    private let actionMenuWidth: CGFloat = 176

    init(
        card: MainViewModel.GroupCardModel,
        theme: DesktopThemeMode,
        accent: DesktopAccentColor,
        displayMode: GroupCardDisplayMode,
        skillsCollapsed: Bool,
        isUpdating: Bool,
        onOpen: (() -> Void)?,
        onUpdate: @escaping () -> Void,
        onTogglePinned: @escaping () -> Void,
        onDelete: @escaping () -> Void,
        onToggleSkill: @escaping (String, Bool) -> Void,
        onToggleAllSkills: @escaping () -> Void,
        onToggleTarget: @escaping (String, Bool, Bool) -> Void,
        onToggleAllTargets: @escaping () -> Void,
        actionButtonTitle: String? = nil,
        actionButtonIcon: ActionIcon = .import,
        onActionButton: (() -> Void)? = nil,
        groupTagItems: [GroupTagDisplayItem] = [],
        groupTagSuggestions: [GroupTagDisplayItem] = [],
        canCreateGroupTag: Bool = false,
        canDeleteGroupTags: Bool = false,
        onCreateGroupTag: ((String, DesktopAccentColor?) -> GroupTagMutationResult)? = nil,
        onDeleteGroupTag: ((String) -> Void)? = nil,
        onSelectGroupTag: ((GroupTagDisplayItem) -> Void)? = nil,
        recommendationBadgeItems: [ImportViewModel.RecommendationBadgeItem] = [],
        recommendationDescription: String? = nil
    ) {
        self.card = card
        self.theme = theme
        self.accent = accent
        self.displayMode = displayMode
        self.skillsCollapsed = skillsCollapsed
        self.isUpdating = isUpdating
        self.onOpen = onOpen
        self.onUpdate = onUpdate
        self.onTogglePinned = onTogglePinned
        self.onDelete = onDelete
        self.onToggleSkill = onToggleSkill
        self.onToggleAllSkills = onToggleAllSkills
        self.onToggleTarget = onToggleTarget
        self.onToggleAllTargets = onToggleAllTargets
        self.actionButtonTitle = actionButtonTitle
        self.actionButtonIcon = actionButtonIcon
        self.onActionButton = onActionButton
        self.groupTagItems = groupTagItems
        self.groupTagSuggestions = groupTagSuggestions
        self.canCreateGroupTag = canCreateGroupTag
        self.canDeleteGroupTags = canDeleteGroupTags
        self.onCreateGroupTag = onCreateGroupTag
        self.onDeleteGroupTag = onDeleteGroupTag
        self.onSelectGroupTag = onSelectGroupTag
        self.recommendationBadgeItems = recommendationBadgeItems
        self.recommendationDescription = recommendationDescription
    }

    private var scale: GroupCardScale {
        displayMode.scale
    }

    private var isSaving: Bool {
        card.saveState.phase == .saving
    }

    private var isBusy: Bool {
        isSaving || isUpdating
    }

    private var busyContentOpacity: Double {
        isBusy ? 0.34 : 1.0
    }

    private var shouldShowPinnedIcon: Bool {
        card.isPinned && !isActionButtonHovered && !isActionMenuOpen
    }

    private var showsPrimaryActionButton: Bool {
        onActionButton != nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: scale.cardSpacing) {
            header

            if Self.showsHeaderDivider(card: card, displayMode: displayMode) {
                dashedDivider
            }

            if showsTagSummary {
                tagSummarySection
                dashedDivider
            }

            cardRow(
                title: t("common.section.agents"),
                selection: card.targetSelection,
                items: card.targets.map { ($0.id, $0.label, $0.shortLabel, $0.isEnabled, nil) },
                compact: true,
                loading: card.targetsLoading,
                onToggleAll: onToggleAllTargets,
                action: onToggleTarget
            )
            .padding(.horizontal, -scale.cardInset)

            skillsSection
                .padding(.horizontal, -scale.cardInset)
        }
        .opacity(busyContentOpacity)
        .blur(radius: isBusy ? 0.8 : 0)
        .padding(scale.cardInset)
        .frame(minHeight: minimumHeight, alignment: .topLeading)
        .background(AppTheme.groupCardFill(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: scale.cornerRadius))
        .overlay {
            RoundedRectangle(cornerRadius: scale.cornerRadius)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
        .animation(.easeInOut(duration: 0.18), value: skillsCollapsed)
        .allowsHitTesting(!isBusy)
        .onReceive(NotificationCenter.default.publisher(for: .groupTagEditorRequested)) { notification in
            guard let sourceId = notification.userInfo?["sourceId"] as? String, sourceId != card.id else {
                return
            }
            isEditingTags = false
            isDeletingTags = false
        }
        .onReceive(NotificationCenter.default.publisher(for: .groupTagEditorDismissRequested)) { _ in
            isEditingTags = false
            isDeletingTags = false
        }
        .overlay {
            if isBusy {
                RoundedRectangle(cornerRadius: scale.cornerRadius)
                    .fill(Self.busyOverlayScrimColor(for: theme))
                    .overlay {
                        HStack(spacing: 8) {
                            ProgressView()
                                .controlSize(.small)
                                .tint(AppTheme.textPrimary(for: theme))
                            Text(loadingMessage)
                                .font(.system(size: scale.metaSize, weight: .semibold))
                        }
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(Self.busyOverlayBadgeBackground(for: theme))
                        .clipShape(Capsule())
                        .shadow(
                            color: Self.busyOverlayBadgeShadowColor(for: theme),
                            radius: 12,
                            x: 0,
                            y: 6
                        )
                    }
            }
        }
    }

    @ViewBuilder
    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: scale.headerSpacing) {
                if let onOpen {
                    Button(action: onOpen) {
                        headerPrimaryContent
                    }
                    .buttonStyle(.plain)
                } else {
                    headerPrimaryContent
                }
                if Self.reservesHeaderStatsRow(card: card, displayMode: displayMode) {
                    headerStatsRow
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, scale.headerBottomSpacing)
            Spacer(minLength: 0)
            headerAction
        }
    }

    @ViewBuilder
    private var headerAction: some View {
        if showsPrimaryActionButton {
            importButton
        } else {
            pinButton
        }
    }

    private var headerPrimaryContent: some View {
        VStack(alignment: .leading, spacing: max(2, scale.headerSpacing)) {
            Text(card.title)
                .font(.system(size: scale.titleSize, weight: .regular))
                .foregroundStyle(AppTheme.brand(for: accent, in: theme))
                .lineLimit(1)
                .truncationMode(.tail)
            if displayMode.showsSubtitle {
                if let byline = card.byline {
                    Text(byline)
                        .font(.system(size: scale.metaSize, weight: .regular))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .lineLimit(1)
                }
            }
        }
    }

    @ViewBuilder
    private var headerStatsRow: some View {
        HStack(spacing: 10) {
            if let downloadCount = card.stats.downloadCount {
                statItem(icon: .downloads, text: countText(downloadCount))
            } else if usesImportStatPlaceholders {
                statPlaceholder(width: 42)
            }
            if let starCount = card.stats.starCount {
                statItem(icon: .star, text: countText(starCount))
            } else if usesImportStatPlaceholders {
                statPlaceholder(width: 38)
            }
            if let githubURL = card.stats.githubURL {
                Button {
                    if let url = URL(string: githubURL) {
                        NSWorkspace.shared.open(url)
                    }
                } label: {
                    statIcon(.github)
                }
                .buttonStyle(.plain)
                .help(githubURL)
            } else if usesImportStatPlaceholders {
                statPlaceholder(width: 16)
            }
            Spacer(minLength: 0)
        }
        .frame(height: scale.metaSize + 4, alignment: .leading)
        .foregroundStyle(AppTheme.textMuted(for: theme))
        .lineLimit(1)
    }

    private var pinButton: some View {
        Button {
            guard !isBusy else { return }
            actionMenuPlacement = resolvedActionMenuPlacement()
            isActionMenuOpen.toggle()
        } label: {
            actionIcon(shouldShowPinnedIcon ? .pin : .more, size: 12)
                .foregroundStyle(shouldShowPinnedIcon ? AppTheme.brand(for: accent, in: theme) : AppTheme.textMuted(for: theme))
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
        }
        .background {
            GeometryReader { proxy in
                Color.clear.preference(
                    key: GroupCardActionButtonFrameKey.self,
                    value: proxy.frame(in: .global)
                )
            }
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .onPreferenceChange(GroupCardActionButtonFrameKey.self) { frame in
            actionButtonFrame = frame
        }
        .onHover { isHovering in
            isActionButtonHovered = isHovering
        }
        .onChange(of: isBusy) { _, busy in
            if busy {
                isActionMenuOpen = false
            }
        }
        .onChange(of: canDeleteGroupTags) { _, canDelete in
            if !canDelete {
                isDeletingTags = false
            }
        }
        .onChange(of: groupTagItems) { _, items in
            if items.isEmpty {
                isDeletingTags = false
            }
        }
        .popover(
            isPresented: $isActionMenuOpen,
            attachmentAnchor: actionMenuPlacement.attachmentAnchor,
            arrowEdge: actionMenuPlacement.arrowEdge
        ) {
            VStack(alignment: .leading, spacing: 4) {
                actionMenuButton(
                    title: card.isPinned ? t("group_card.action.unpin") : t("group_card.action.pin"),
                    icon: .pin,
                    foreground: card.isPinned ? AppTheme.brand(for: accent, in: theme) : AppTheme.textMuted(for: theme)
                ) {
                    isActionMenuOpen = false
                    onTogglePinned()
                }
                actionMenuButton(
                    title: t("group_card.action.update"),
                    icon: .update,
                    foreground: AppTheme.textMuted(for: theme)
                ) {
                    isActionMenuOpen = false
                    onUpdate()
                }
                if onCreateGroupTag != nil {
                    actionMenuButton(
                        title: isEditingTags ? t("group_card.action.cancel_edit_tags") : t("group_card.action.edit_tags"),
                        icon: isEditingTags ? .close : .tagAdd,
                        foreground: AppTheme.textMuted(for: theme)
                    ) {
                        isActionMenuOpen = false
                        isDeletingTags = false
                        setTagEditing(!isEditingTags)
                    }
                }
                if canDeleteGroupTags {
                    actionMenuButton(
                        title: isDeletingTags ? t("group_card.action.done_delete_tags") : t("group_card.action.delete_tags"),
                        icon: isDeletingTags ? .close : .tagDelete,
                        foreground: AppTheme.textMuted(for: theme)
                    ) {
                        isActionMenuOpen = false
                        isEditingTags = false
                        isDeletingTags.toggle()
                    }
                }
                actionMenuButton(
                    title: t("group_card.action.delete"),
                    icon: .delete,
                    foreground: AppTheme.statusError(for: theme)
                ) {
                    isActionMenuOpen = false
                    onDelete()
                }
            }
            .padding(6)
            .background(AppTheme.pageBackground(for: theme))
            .frame(width: actionMenuWidth)
        }
    }

    private var importButton: some View {
        Button {
            guard !isBusy else { return }
            onActionButton?()
        } label: {
            if displayMode.usesPlainPrimaryActionIcon {
                actionIcon(actionButtonIcon, size: 12)
                    .foregroundStyle(AppTheme.brand(for: accent, in: theme))
                    .frame(width: 28, height: 28)
                    .background(AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.38 : 0.30))
                    .clipShape(RoundedRectangle(cornerRadius: scale.cornerRadius - 2))
                    .contentShape(Rectangle())
            } else {
                HStack(spacing: 6) {
                    actionIcon(actionButtonIcon, size: 11)
                        .foregroundStyle(AppTheme.pageBackground(for: theme))

                    Text(actionButtonTitle ?? t("group_card.action.import"))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(AppTheme.pageBackground(for: theme))
                }
                .padding(.horizontal, 10)
                .frame(height: 24)
                .background(AppTheme.brand(for: accent, in: theme))
                .clipShape(Capsule())
            }
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
    }

    private var loadingMessage: String {
        if isSaving {
            return t("common.status.applying")
        }
        if displayMode == .importSearch || displayMode == .importRecommendation {
            return t("group_card.loading.downloading")
        }
        return t("group_card.loading.updating")
    }

    private var showsTagSummary: Bool {
        !groupTagItems.isEmpty
            || !recommendationBadgeItems.isEmpty
            || onCreateGroupTag != nil
            || ((recommendationDescription?.isEmpty) == false)
    }

    private var tagSummarySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if onCreateGroupTag != nil {
                EditableGroupTagSection(
                    theme: theme,
                    accent: accent,
                    controlHeight: scale.triStateHeight,
                    cornerRadius: scale.cornerRadius - 2,
                    inputWidth: 72,
                    tagItems: groupTagItems,
                    suggestions: groupTagSuggestions,
                    canAddMore: canCreateGroupTag,
                    isEditing: isEditingTags,
                    isDeleteMode: isDeletingTags,
                    onEditingChange: { isEditing in
                        setTagEditing(isEditing)
                    },
                    onCreate: onCreateGroupTag,
                    onDelete: { item in
                        onDeleteGroupTag?(item.id)
                    },
                    onSelect: onSelectGroupTag
                )
            } else if !groupTagItems.isEmpty {
                readOnlyTagRow
            } else if !recommendationBadgeItems.isEmpty {
                recommendationBadgeRow
            }

            if let recommendationDescription, !recommendationDescription.isEmpty {
                Text(recommendationDescription)
                    .font(.system(size: scale.metaSize, weight: .regular))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(3)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var readOnlyTagRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(groupTagItems) { item in
                    Text("#\(item.title)")
                        .font(.system(size: scale.chipFontSize, weight: .regular))
                        .foregroundStyle(AppTheme.brand(for: item.accent, in: theme))
                        .padding(.horizontal, 8)
                        .frame(height: 24)
                        .background(AppTheme.brand(for: item.accent, in: theme).opacity(theme == .dark ? 0.22 : 0.14))
                        .clipShape(RoundedRectangle(cornerRadius: scale.cornerRadius - 2))
                }
            }
        }
    }

    private var recommendationBadgeRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(recommendationBadgeItems) { badge in
                    let badgeAccent = Self.recommendationBadgeAccent(tagId: badge.id)
                    Text("#\(badge.title)")
                        .font(.system(size: scale.chipFontSize, weight: .regular))
                        .foregroundStyle(AppTheme.brand(for: badgeAccent, in: theme))
                        .padding(.horizontal, 8)
                        .frame(height: 24)
                        .background(AppTheme.brand(for: badgeAccent, in: theme).opacity(theme == .dark ? 0.22 : 0.14))
                        .clipShape(RoundedRectangle(cornerRadius: scale.cornerRadius - 2))
                }
            }
        }
    }

    private func cardRow(
        title: String,
        selection: SelectionState,
        items: [(id: String, label: String, shortLabel: String, isEnabled: Bool, highlightQuery: String?)],
        compact: Bool,
        loading: Bool,
        onToggleAll: @escaping () -> Void,
        action: @escaping (String, Bool, Bool) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: scale.rowSpacing) {
            if displayMode.showsSectionTitles {
                HStack(spacing: 8) {
                    Text(sectionTitleText(baseTitle: title, compact: compact))
                        .font(.system(size: scale.sectionLabelSize, weight: .regular))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                        .textCase(.uppercase)
                    Spacer(minLength: 8)
                }
                .padding(.horizontal, scale.sectionHorizontalPadding)
                .padding(.top, scale.sectionTopPadding)
            }

            cardScroller {
                HStack(spacing: scale.rowSpacing) {
                    triStateSwitch(selection, loading: false, action: onToggleAll)
                    if loading {
                        ForEach(0..<3, id: \.self) { _ in
                            loadingPill
                        }
                    } else {
                        ForEach(items, id: \.id) { item in
                            Button {
                                action(item.id, !item.isEnabled, item.isEnabled)
                            } label: {
                                if compact {
                                    targetToggle(
                                        targetId: item.id,
                                        fallbackText: item.shortLabel,
                                        accessibilityLabel: item.label,
                                        isOn: item.isEnabled
                                    )
                                } else {
                                    skillToggle(item.label, highlightQuery: item.highlightQuery, isOn: item.isEnabled)
                                }
                            }
                            .buttonStyle(.plain)
                            .disabled(isBusy)
                        }
                    }
                }
            }
            .opacity(isBusy ? 0.68 : 1.0)
            .allowsHitTesting(!isBusy)
        }
    }

    @ViewBuilder
    private var skillsSection: some View {
        if !displayMode.supportsCollapsedSkills || !skillsCollapsed {
            VStack(alignment: .leading, spacing: scale.rowSpacing) {
                cardRow(
                    title: t("group_card.section.skills"),
                    selection: card.skillSelection,
                    items: card.skills.map { ($0.id, $0.label, $0.label, $0.isEnabled, $0.highlightQuery) },
                    compact: false,
                    loading: card.skillsLoading,
                    onToggleAll: onToggleAllSkills,
                    action: { id, enabled, _ in
                        onToggleSkill(id, enabled)
                    }
                )
            }
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private var skillSectionCountText: String? {
        guard let count = card.stats.skillCount ?? (card.skills.isEmpty ? nil : card.skills.count) else {
            return nil
        }
        return countText(count)
    }

    private func sectionTitleText(baseTitle: String, compact: Bool) -> String {
        guard !compact, let count = skillSectionCountText else {
            return baseTitle
        }
        return "\(baseTitle) (\(count))"
    }

    private var minimumHeight: CGFloat? {
        switch displayMode {
        case .home, .importSearch, .importRecommendation:
            return scale.minHeight
        case .menu:
            return nil
        }
    }

    private var usesImportStatPlaceholders: Bool {
        switch displayMode {
        case .importSearch, .importRecommendation:
            return card.skillsLoading || card.targetsLoading
        case .home, .menu:
            return false
        }
    }

    private func skillToggle(_ text: String, highlightQuery: String?, isOn: Bool) -> some View {
        highlightedSkillText(text, highlightQuery: highlightQuery)
            .font(.system(size: scale.chipFontSize, weight: .regular))
            .padding(.horizontal, max(6, scale.cardInset - 2))
            .frame(height: scale.chipHeight)
            .background(isOn ? AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.38 : 0.30) : AppTheme.documentBlock(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: scale.cornerRadius - 2))
    }

    private func highlightedSkillText(_ text: String, highlightQuery: String?) -> Text {
        guard let highlightQuery,
              !highlightQuery.isEmpty,
              let range = text.range(of: highlightQuery, options: [.caseInsensitive, .diacriticInsensitive]) else {
            return Text(text).foregroundStyle(AppTheme.textPrimary(for: theme))
        }

        let prefix = String(text[..<range.lowerBound])
        let match = String(text[range])
        let suffix = String(text[range.upperBound...])

        return Text(prefix).foregroundStyle(AppTheme.textPrimary(for: theme))
            + Text(match).foregroundStyle(AppTheme.brand(for: accent, in: theme))
            + Text(suffix).foregroundStyle(AppTheme.textPrimary(for: theme))
    }

    private func targetToggle(
        targetId: String,
        fallbackText: String,
        accessibilityLabel: String,
        isOn: Bool
    ) -> some View {
        let shape = RoundedRectangle(cornerRadius: scale.cornerRadius - 2)

        return ZStack {
            shape
                .fill(targetBackgroundFill(isOn: isOn))

            if let image = AgentIconLibrary.symbolImage(
                for: targetId,
                foreground: targetForegroundColor(isOn: isOn)
            ) {
                targetIcon(image: image, isOn: isOn)
            } else {
                Text(fallbackText)
                    .font(.system(size: scale.targetFontSize, weight: .bold, design: .monospaced))
                    .foregroundStyle(targetFallbackTextColor(isOn: isOn))
            }
        }
        .frame(width: scale.targetSize, height: scale.targetSize)
        .clipShape(shape)
        .help(accessibilityLabel)
    }

    @ViewBuilder
    private func targetIcon(image: NSImage, isOn: Bool) -> some View {
        Image(nsImage: image)
            .renderingMode(.original)
            .resizable()
            .interpolation(.high)
            .scaledToFill()
    }

    private func targetBackgroundFill(isOn: Bool) -> Color {
        isOn
            ? AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.38 : 0.30)
            : AppTheme.documentBlock(for: theme)
    }

    private func targetForegroundColor(isOn: Bool) -> NSColor {
        switch theme {
        case .light:
            return NSColor(calibratedRed: 38.0 / 255.0, green: 38.0 / 255.0, blue: 38.0 / 255.0, alpha: isOn ? 1.0 : 0.78)
        case .dark:
            return NSColor(calibratedRed: 239.0 / 255.0, green: 239.0 / 255.0, blue: 241.0 / 255.0, alpha: isOn ? 1.0 : 0.78)
        }
    }

    private func targetFallbackTextColor(isOn: Bool) -> Color {
        AppTheme.textPrimary(for: theme).opacity(isOn ? 1.0 : 0.78)
    }

    private func triStateSwitch(_ selection: SelectionState, loading: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            ZStack {
                RoundedRectangle(cornerRadius: scale.cornerRadius - 2)
                    .fill(switchFill(selection))
                if loading {
                    ProgressView()
                        .controlSize(.small)
                        .tint(switchText(selection))
                } else {
                    Text(switchLabel(selection))
                        .font(.system(size: scale.triStateFontSize, weight: .bold))
                        .foregroundStyle(switchText(selection))
                }
            }
            .frame(width: scale.triStateWidth, height: scale.triStateHeight)
        }
        .buttonStyle(.plain)
        .disabled(isSaving)
    }

    private var loadingPill: some View {
        RoundedRectangle(cornerRadius: scale.cornerRadius - 2)
            .fill(AppTheme.documentBlock(for: theme))
            .frame(width: scale.targetSize, height: scale.targetSize)
            .overlay {
                ProgressView()
                    .controlSize(.small)
            }
    }

    private func statItem(icon: GroupCardStatIcon, text: String) -> some View {
        HStack(spacing: 4) {
            statIcon(icon)
            Text(text)
                .font(.system(size: scale.metaSize, weight: .medium))
        }
    }

    private func statIcon(_ icon: GroupCardStatIcon) -> some View {
        Group {
            if let image = icon.image {
                Image(nsImage: image)
                    .renderingMode(.template)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 11, height: 11)
            }
        }
    }

    private func statPlaceholder(width: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: 4)
            .fill(AppTheme.documentBlock(for: theme))
            .frame(width: width, height: 11)
    }

    private func countText(_ value: Int) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: value)) ?? String(value)
    }

    private func cardScroller<Content: View>(@ViewBuilder content: @escaping () -> Content) -> some View {
        SharedHorizontalFadeScroll(
            height: scale.chipHeight,
            fadeWidth: scale.fadeWidth,
            fill: AppTheme.groupCardFill(for: theme),
            contentPadding: scale.cardInset,
            content: content
        )
    }

    private var dashedDivider: some View {
        DashedDividerLine()
            .stroke(style: StrokeStyle(lineWidth: 1, dash: [4, 4]))
            .foregroundStyle(AppTheme.textMuted(for: theme).opacity(0.45))
            .frame(height: 1)
    }

    private func switchLabel(_ selection: SelectionState) -> String {
        switch selection {
        case .empty: return t("common.selection.off")
        case .partial: return t("common.selection.partial")
        case .full: return t("common.selection.on")
        }
    }

    private func switchFill(_ selection: SelectionState) -> Color {
        AppTheme.selectionControlFill(selection, for: theme)
    }

    private func switchText(_ selection: SelectionState) -> Color {
        AppTheme.selectionControlText(selection, for: theme)
    }

    private func actionMenuButton(
        title: String,
        icon: ActionIcon,
        foreground: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 8) {
                actionIcon(icon, size: 12)
                    .foregroundStyle(foreground)
                    .frame(width: 12, height: 12)

                Text(title)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(1)
                    .truncationMode(.tail)

                Spacer(minLength: 8)
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, minHeight: 30, maxHeight: 30, alignment: .leading)
            .background(Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 7))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }

    private func resolvedActionMenuPlacement() -> GroupCardActionMenuPlacement {
        guard !actionButtonFrame.equalTo(.zero) else {
            return .below
        }

        let probePoint = CGPoint(x: actionButtonFrame.midX, y: actionButtonFrame.midY)
        guard let screen = NSScreen.screens.first(where: { $0.frame.contains(probePoint) }) else {
            return .below
        }

        let estimatedMenuHeight: CGFloat = 180
        let spaceBelow = actionButtonFrame.minY - screen.visibleFrame.minY
        let spaceAbove = screen.visibleFrame.maxY - actionButtonFrame.maxY

        if spaceBelow >= estimatedMenuHeight {
            return .below
        }
        if spaceAbove >= estimatedMenuHeight {
            return .above
        }
        return spaceBelow >= spaceAbove ? .below : .above
    }

    private func setTagEditing(_ isEditing: Bool) {
        isEditingTags = isEditing
        if isEditing {
            isDeletingTags = false
            NotificationCenter.default.post(
                name: .groupTagEditorRequested,
                object: nil,
                userInfo: ["sourceId": card.id]
            )
        }
    }
}

extension SharedGroupCard {
    static func visibleHeaderStatKinds(stats: MainViewModel.GroupCardStats) -> [HeaderStatKind] {
        var kinds: [HeaderStatKind] = []
        if stats.downloadCount != nil {
            kinds.append(.downloads)
        }
        if stats.starCount != nil {
            kinds.append(.star)
        }
        if stats.githubURL != nil {
            kinds.append(.github)
        }
        return kinds
    }

    static func showsInlineHeaderStats(displayMode: GroupCardDisplayMode) -> Bool {
        false
    }

    static func reservesHeaderStatsRow(
        card: MainViewModel.GroupCardModel,
        displayMode: GroupCardDisplayMode
    ) -> Bool {
        guard displayMode.showsMetaLine, displayMode != .menu else {
            return false
        }
        return true
    }

    static func showsHeaderDivider(
        card: MainViewModel.GroupCardModel,
        displayMode: GroupCardDisplayMode
    ) -> Bool {
        displayMode.showsMetaLine || displayMode == .menu
    }

    static func recommendationBadgeAccent(tagId: String) -> DesktopAccentColor {
        switch tagId {
        case "general":
            return .blue
        case "development":
            return .green
        case "design":
            return .pink
        case "creation":
            return .orange
        case "marketing":
            return .purple
        case "research":
            return .yellow
        case "automation":
            return .orange
        case "teamwork":
            return .blue
        default:
            return .blue
        }
    }

    static func busyOverlayScrimColor(for theme: DesktopThemeMode) -> Color {
        switch theme {
        case .dark:
            return Color.black.opacity(0.24)
        case .light:
            return Color.white.opacity(0.64)
        }
    }

    static func busyOverlayBadgeBackground(for theme: DesktopThemeMode) -> Color {
        AppTheme.documentBlock(for: theme)
    }

    static func busyOverlayBadgeShadowColor(for theme: DesktopThemeMode) -> Color {
        switch theme {
        case .dark:
            return Color.black.opacity(0.28)
        case .light:
            return Color.black.opacity(0.10)
        }
    }
}

private struct DashedDividerLine: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return path
    }
}

private enum GroupCardStatIcon {
    case skills
    case downloads
    case star
    case github

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
        }
    }
}

struct SharedHorizontalFadeScroll<Content: View>: View {
    let height: CGFloat
    let fadeWidth: CGFloat
    let fill: Color
    let contentPadding: CGFloat
    @ViewBuilder let content: () -> Content

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            content()
                .padding(.horizontal, contentPadding)
        }
        .overlay(alignment: .leading) {
            LinearGradient(
                stops: [
                    .init(color: fill, location: 0),
                    .init(color: fill, location: 0.4),
                    .init(color: fill.opacity(0), location: 1)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: fadeWidth)
            .allowsHitTesting(false)
        }
        .overlay(alignment: .trailing) {
            LinearGradient(
                stops: [
                    .init(color: fill.opacity(0), location: 0),
                    .init(color: fill, location: 0.6),
                    .init(color: fill, location: 1)
                ],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(width: fadeWidth)
            .allowsHitTesting(false)
        }
        .frame(height: height)
        .clipped()
    }
}

import SwiftUI
import AppKit

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
        17
    }

    var metaSize: CGFloat {
        11
    }

    var sectionLabelSize: CGFloat {
        12
    }

    var chipHeight: CGFloat {
        34 * factor
    }

    var chipFontSize: CGFloat {
        11
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
    case importPage

    var scale: GroupCardScale {
        switch self {
        case .home, .importPage:
            return .home
        case .menu:
            return .menu
        }
    }

    var showsSubtitle: Bool {
        switch self {
        case .home, .menu, .importPage:
            return true
        }
    }

    var showsMetaLine: Bool {
        switch self {
        case .home, .importPage:
            return true
        case .menu:
            return false
        }
    }

    var showsSectionTitles: Bool {
        switch self {
        case .home, .importPage:
            return true
        case .menu:
            return false
        }
    }

    var supportsCollapsedSkills: Bool {
        switch self {
        case .home, .importPage:
            return false
        case .menu:
            return true
        }
    }

    var usesPlainPrimaryActionIcon: Bool {
        switch self {
        case .importPage:
            return true
        case .home, .menu:
            return false
        }
    }

    var showsSourceFacts: Bool {
        switch self {
        case .importPage:
            return true
        case .home, .menu:
            return false
        }
    }
}

struct SharedGroupCard: View {
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
    let onToggleTarget: (String, Bool) -> Void
    let onToggleAllTargets: () -> Void
    let actionButtonTitle: String?
    let actionButtonIcon: ActionIcon
    let onActionButton: (() -> Void)?

    @State private var isActionMenuOpen = false
    @State private var isActionButtonHovered = false

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
        onToggleTarget: @escaping (String, Bool) -> Void,
        onToggleAllTargets: @escaping () -> Void,
        actionButtonTitle: String? = nil,
        actionButtonIcon: ActionIcon = .import,
        onActionButton: (() -> Void)? = nil
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

    private var shouldShowPinnedIcon: Bool {
        card.isPinned && !isActionButtonHovered && !isActionMenuOpen
    }

    private var showsPrimaryActionButton: Bool {
        onActionButton != nil
    }

    var body: some View {
        VStack(alignment: .leading, spacing: scale.cardSpacing) {
            header

            if displayMode.showsMetaLine || (displayMode.showsSourceFacts && !card.sourceFacts.isEmpty) {
                dashedDivider
            }

            if displayMode.showsSourceFacts && !card.sourceFacts.isEmpty {
                sourceFactsSection
                dashedDivider
            }

            cardRow(
                title: "Agents",
                selection: card.targetSelection,
                items: card.targets.map { ($0.id, $0.label, $0.shortLabel, $0.isEnabled) },
                compact: true,
                onToggleAll: onToggleAllTargets,
                action: onToggleTarget
            )
            .padding(.horizontal, -scale.cardInset)

            skillsSection
                .padding(.horizontal, -scale.cardInset)
        }
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
        .overlay {
            if isBusy {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text(loadingMessage)
                        .font(.system(size: scale.metaSize, weight: .semibold))
                }
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(AppTheme.toolbarGlass(for: theme))
                .clipShape(Capsule())
            }
        }
    }

    @ViewBuilder
    private var header: some View {
        HStack(alignment: .top, spacing: 8) {
            if let onOpen {
                Button(action: onOpen) {
                    headerContent
                }
                .buttonStyle(.plain)
            } else {
                headerContent
            }
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

    private var headerContent: some View {
        VStack(alignment: .leading, spacing: scale.headerSpacing) {
            HStack(alignment: .firstTextBaseline, spacing: max(4, scale.cardInset * 0.5)) {
                Text(card.title)
                    .font(.system(size: scale.titleSize, weight: .semibold))
                    .foregroundStyle(AppTheme.brand(for: accent, in: theme))
                if displayMode.showsSubtitle {
                    Text(card.subtitle)
                        .font(.system(size: scale.metaSize, weight: .regular))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .lineLimit(1)
                }
            }
            if displayMode.showsMetaLine {
                Text(card.metaLine)
                    .font(.system(size: scale.metaSize, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .lineLimit(1)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, scale.headerBottomSpacing)
    }

    private var pinButton: some View {
        Button {
            guard !isBusy else { return }
            isActionMenuOpen.toggle()
        } label: {
            actionIcon(shouldShowPinnedIcon ? .pin : .more, size: 12)
                .foregroundStyle(shouldShowPinnedIcon ? AppTheme.brand(for: accent, in: theme) : AppTheme.textMuted(for: theme))
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isBusy)
        .onHover { isHovering in
            isActionButtonHovered = isHovering
        }
        .onChange(of: isBusy) { _, busy in
            if busy {
                isActionMenuOpen = false
            }
        }
        .popover(isPresented: $isActionMenuOpen, attachmentAnchor: .point(.bottom), arrowEdge: .top) {
            VStack(alignment: .leading, spacing: 4) {
                actionMenuButton(
                    title: card.isPinned ? "取消置顶" : "置顶",
                    icon: .pin,
                    foreground: card.isPinned ? AppTheme.brand(for: accent, in: theme) : AppTheme.textMuted(for: theme)
                ) {
                    isActionMenuOpen = false
                    onTogglePinned()
                }
                actionMenuButton(
                    title: "更新",
                    icon: .update,
                    foreground: AppTheme.textMuted(for: theme)
                ) {
                    isActionMenuOpen = false
                    onUpdate()
                }
                actionMenuButton(
                    title: "删除",
                    icon: .delete,
                    foreground: AppTheme.statusError(for: theme)
                ) {
                    isActionMenuOpen = false
                    onDelete()
                }
            }
            .padding(6)
            .background(AppTheme.pageBackground(for: theme))
            .frame(width: 136)
        }
    }

    private var importButton: some View {
        Button {
            guard !isBusy else { return }
            onActionButton?()
        } label: {
            if displayMode.usesPlainPrimaryActionIcon {
                actionIcon(actionButtonIcon, size: 12)
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            } else {
                HStack(spacing: 6) {
                    actionIcon(actionButtonIcon, size: 11)
                        .foregroundStyle(AppTheme.pageBackground(for: theme))

                    Text(actionButtonTitle ?? "Import")
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

    private var sourceFactsSection: some View {
        VStack(alignment: .leading, spacing: max(6, scale.rowSpacing - 2)) {
            Text("Source")
                .font(.system(size: scale.sectionLabelSize, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            Text(card.sourceFacts.joined(separator: " · "))
                .font(.system(size: scale.metaSize, weight: .medium))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .lineSpacing(3)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var loadingMessage: String {
        if isSaving {
            return card.saveState.message ?? "Applying..."
        }
        return "Updating..."
    }

    private func cardRow(
        title: String,
        selection: SelectionState,
        items: [(id: String, label: String, shortLabel: String, isEnabled: Bool)],
        compact: Bool,
        onToggleAll: @escaping () -> Void,
        action: @escaping (String, Bool) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: scale.rowSpacing) {
            if displayMode.showsSectionTitles {
                Text(title)
                    .font(.system(size: scale.sectionLabelSize, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .textCase(.uppercase)
                    .padding(.horizontal, scale.sectionHorizontalPadding)
                    .padding(.top, scale.sectionTopPadding)
            }

            cardScroller {
                HStack(spacing: scale.rowSpacing) {
                    triStateSwitch(selection, action: onToggleAll)
                    ForEach(items, id: \.id) { item in
                        Button {
                            action(item.id, !item.isEnabled)
                        } label: {
                            if compact {
                                targetToggle(
                                    targetId: item.id,
                                    fallbackText: item.shortLabel,
                                    accessibilityLabel: item.label,
                                    isOn: item.isEnabled
                                )
                            } else {
                                skillToggle(item.label, isOn: item.isEnabled)
                            }
                        }
                        .buttonStyle(.plain)
                        .disabled(isBusy)
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
                    title: "Skills",
                    selection: card.skillSelection,
                    items: card.skills.map { ($0.id, $0.label, $0.label, $0.isEnabled) },
                    compact: false,
                    onToggleAll: onToggleAllSkills,
                    action: onToggleSkill
                )
            }
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private var minimumHeight: CGFloat? {
        switch displayMode {
        case .home, .importPage:
            return scale.minHeight
        case .menu:
            return nil
        }
    }

    private func skillToggle(_ text: String, isOn: Bool) -> some View {
        Text(text)
            .font(.system(size: scale.chipFontSize, weight: .bold))
            .padding(.horizontal, max(6, scale.cardInset - 2))
            .frame(height: scale.chipHeight)
            .background(isOn ? AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.38 : 0.30) : AppTheme.documentBlock(for: theme))
            .foregroundStyle(AppTheme.textPrimary(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: scale.cornerRadius - 2))
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

    private func triStateSwitch(_ selection: SelectionState, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(switchLabel(selection))
                .font(.system(size: scale.triStateFontSize, weight: .bold))
                .frame(width: scale.triStateWidth, height: scale.triStateHeight)
                .background(switchFill(selection))
                .foregroundStyle(switchText(selection))
                .clipShape(RoundedRectangle(cornerRadius: scale.cornerRadius - 2))
        }
        .buttonStyle(.plain)
        .disabled(isSaving)
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
        case .empty: return "OFF"
        case .partial: return "MIX"
        case .full: return "ON"
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

                Spacer(minLength: 8)
            }
            .padding(.horizontal, 10)
            .frame(width: 124, height: 30, alignment: .leading)
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
}

private struct DashedDividerLine: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return path
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

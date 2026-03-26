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
        42 * factor
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
    case standard
    case compactMenu

    var scale: GroupCardScale {
        switch self {
        case .standard:
            return .home
        case .compactMenu:
            return .menu
        }
    }

    var showsSubtitle: Bool {
        switch self {
        case .standard:
            return true
        case .compactMenu:
            return true
        }
    }

    var showsMetaLine: Bool {
        switch self {
        case .standard:
            return true
        case .compactMenu:
            return false
        }
    }

    var showsSectionTitles: Bool {
        switch self {
        case .standard:
            return true
        case .compactMenu:
            return false
        }
    }

    var supportsCollapsedSkills: Bool {
        switch self {
        case .standard:
            return false
        case .compactMenu:
            return true
        }
    }
}

struct SharedGroupCard: View {
    let card: MainViewModel.GroupCardModel
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let displayMode: GroupCardDisplayMode
    let skillsCollapsed: Bool
    let onOpen: (() -> Void)?
    let onTogglePinned: () -> Void
    let onToggleSkill: (String, Bool) -> Void
    let onToggleAllSkills: () -> Void
    let onToggleTarget: (String, Bool) -> Void
    let onToggleAllTargets: () -> Void

    private var scale: GroupCardScale {
        displayMode.scale
    }

    private var isSaving: Bool {
        card.saveState.phase == .saving
    }

    var body: some View {
        VStack(alignment: .leading, spacing: scale.cardSpacing) {
            header

            if displayMode.showsMetaLine {
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
        .shadow(color: AppTheme.cardShadow(for: theme), radius: scale.shadowRadius, x: 0, y: scale.shadowYOffset)
        .animation(.easeInOut(duration: 0.18), value: skillsCollapsed)
        .overlay {
            if isSaving {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text(card.saveState.message ?? "Applying...")
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
            pinButton
        }
    }

    private var headerContent: some View {
        VStack(alignment: .leading, spacing: scale.headerSpacing) {
            HStack(alignment: .firstTextBaseline, spacing: max(4, scale.cardInset * 0.5)) {
                Text(card.title)
                    .font(.system(size: scale.titleSize, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
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
        Button(action: onTogglePinned) {
            Image(systemName: card.isPinned ? "pin.fill" : "pin")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(card.isPinned ? AppTheme.brand(for: accent, in: theme) : AppTheme.textMuted(for: theme))
                .frame(width: 22, height: 22)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
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
                        .disabled(isSaving)
                    }
                }
            }
            .opacity(isSaving ? 0.68 : 1.0)
            .allowsHitTesting(!isSaving)
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
        case .standard:
            return scale.minHeight
        case .compactMenu:
            return nil
        }
    }

    private func skillToggle(_ text: String, isOn: Bool) -> some View {
        Text(text)
            .font(.system(size: scale.chipFontSize, weight: .bold))
            .padding(.horizontal, max(6, scale.cardInset - 2))
            .frame(height: scale.chipHeight)
            .background(isOn ? AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.38 : 0.30) : AppTheme.idleChipFill(for: theme))
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
            : AppTheme.idleChipFill(for: theme)
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
        switch selection {
        case .empty:
            return Color(red: 148.0 / 255.0, green: 163.0 / 255.0, blue: 184.0 / 255.0).opacity(0.30)
        case .partial:
            return AppTheme.statusWarning(for: theme).opacity(theme == .dark ? 0.38 : 0.32)
        case .full:
            return AppTheme.statusSuccess(for: theme).opacity(theme == .dark ? 0.36 : 0.30)
        }
    }

    private func switchText(_ selection: SelectionState) -> Color {
        switch (theme, selection) {
        case (.light, .empty):
            return Color(red: 71.0 / 255.0, green: 85.0 / 255.0, blue: 105.0 / 255.0)
        case (.light, .partial):
            return AppTheme.statusWarning(for: theme)
        case (.light, .full):
            return AppTheme.statusSuccess(for: theme)
        case (.dark, .empty):
            return Color(red: 226.0 / 255.0, green: 232.0 / 255.0, blue: 240.0 / 255.0)
        case (.dark, .partial):
            return AppTheme.statusWarning(for: theme)
        case (.dark, .full):
            return AppTheme.statusSuccess(for: theme)
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

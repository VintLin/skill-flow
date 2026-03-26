import SwiftUI

enum GroupCardScale {
    case home
    case menu

    var cardInset: CGFloat {
        switch self {
        case .home: return 12
        case .menu: return 8
        }
    }

    var cardSpacing: CGFloat {
        switch self {
        case .home: return 8
        case .menu: return 6
        }
    }

    var titleSize: CGFloat {
        switch self {
        case .home: return 14
        case .menu: return 9.5
        }
    }

    var metaSize: CGFloat {
        switch self {
        case .home: return 11
        case .menu: return 7.5
        }
    }

    var sectionLabelSize: CGFloat {
        switch self {
        case .home: return 12
        case .menu: return 8
        }
    }

    var chipHeight: CGFloat {
        switch self {
        case .home: return 34
        case .menu: return 22
        }
    }

    var chipFontSize: CGFloat {
        switch self {
        case .home: return 11
        case .menu: return 7.5
        }
    }

    var targetSize: CGFloat {
        switch self {
        case .home: return 34
        case .menu: return 22
        }
    }

    var targetFontSize: CGFloat {
        switch self {
        case .home: return 11
        case .menu: return 7.5
        }
    }

    var triStateWidth: CGFloat {
        switch self {
        case .home: return 42
        case .menu: return 28
        }
    }

    var triStateHeight: CGFloat {
        switch self {
        case .home: return 34
        case .menu: return 22
        }
    }

    var triStateFontSize: CGFloat {
        switch self {
        case .home: return 10
        case .menu: return 7
        }
    }

    var rowSpacing: CGFloat {
        switch self {
        case .home: return 6
        case .menu: return 4
        }
    }

    var fadeWidth: CGFloat {
        switch self {
        case .home: return 14
        case .menu: return 10
        }
    }

    var minHeight: CGFloat {
        switch self {
        case .home: return 206
        case .menu: return 138
        }
    }

    var cornerRadius: CGFloat {
        switch self {
        case .home: return 10
        case .menu: return 8
        }
    }

    var shadowRadius: CGFloat {
        switch self {
        case .home: return 14
        case .menu: return 9
        }
    }

    var shadowYOffset: CGFloat {
        switch self {
        case .home: return 8
        case .menu: return 5
        }
    }
}

struct SharedGroupCard: View {
    let card: MainViewModel.GroupCardModel
    let theme: DesktopThemeMode
    let scale: GroupCardScale
    let onOpen: (() -> Void)?
    let onToggleSkill: (String, Bool) -> Void
    let onToggleAllSkills: () -> Void
    let onToggleTarget: (String, Bool) -> Void
    let onToggleAllTargets: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: scale.cardSpacing) {
            header

            Divider()

            cardRow(
                title: "Skills",
                selection: card.skillSelection,
                items: card.skills.map { ($0.id, $0.label, $0.label, $0.isEnabled) },
                compact: false,
                onToggleAll: onToggleAllSkills,
                action: onToggleSkill
            )
            .padding(.horizontal, -scale.cardInset)

            cardRow(
                title: "Agents",
                selection: card.targetSelection,
                items: card.targets.map { ($0.id, $0.label, $0.shortLabel, $0.isEnabled) },
                compact: true,
                onToggleAll: onToggleAllTargets,
                action: onToggleTarget
            )
            .padding(.horizontal, -scale.cardInset)
        }
        .padding(scale.cardInset)
        .frame(minHeight: scale.minHeight, alignment: .topLeading)
        .background(AppTheme.groupCardFill(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: scale.cornerRadius))
        .shadow(color: AppTheme.cardShadow(for: theme), radius: scale.shadowRadius, x: 0, y: scale.shadowYOffset)
    }

    @ViewBuilder
    private var header: some View {
        if let onOpen {
            Button(action: onOpen) {
                headerText
            }
            .buttonStyle(.plain)
        } else {
            headerText
        }
    }

    private var headerText: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(card.title)
                .font(.system(size: scale.titleSize, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
            Text(card.subtitle)
                .font(.system(size: scale.metaSize, weight: .regular, design: .monospaced))
                .foregroundStyle(AppTheme.textMuted(for: theme))
            Text(card.metaLine)
                .font(.system(size: scale.metaSize, weight: .regular, design: .monospaced))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
            Text(title)
                .font(.system(size: scale.sectionLabelSize, weight: .semibold))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .textCase(.uppercase)

            cardScroller {
                HStack(spacing: scale.rowSpacing) {
                    triStateSwitch(selection, action: onToggleAll)
                    ForEach(items, id: \.id) { item in
                        Button {
                            action(item.id, !item.isEnabled)
                        } label: {
                            if compact {
                                targetToggle(item.shortLabel, accessibilityLabel: item.label, isOn: item.isEnabled)
                            } else {
                                skillToggle(item.label, isOn: item.isEnabled)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func skillToggle(_ text: String, isOn: Bool) -> some View {
        Text(text)
            .font(.system(size: scale.chipFontSize, weight: .bold))
            .padding(.horizontal, max(6, scale.cardInset - 2))
            .frame(height: scale.chipHeight)
            .background(isOn ? AppTheme.brand.opacity(0.30) : AppTheme.idleChipFill(for: theme))
            .foregroundStyle(AppTheme.textPrimary(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: scale.cornerRadius - 2))
    }

    private func targetToggle(_ text: String, accessibilityLabel: String, isOn: Bool) -> some View {
        Text(text)
            .font(.system(size: scale.targetFontSize, weight: .bold, design: .monospaced))
            .frame(width: scale.targetSize, height: scale.targetSize)
            .background(isOn ? AppTheme.brand.opacity(0.30) : AppTheme.idleChipFill(for: theme))
            .foregroundStyle(AppTheme.textPrimary(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: scale.cornerRadius - 2))
            .help(accessibilityLabel)
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
            return Color(red: 234.0 / 255.0, green: 179.0 / 255.0, blue: 8.0 / 255.0).opacity(0.32)
        case .full:
            return Color(red: 34.0 / 255.0, green: 197.0 / 255.0, blue: 94.0 / 255.0).opacity(0.30)
        }
    }

    private func switchText(_ selection: SelectionState) -> Color {
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

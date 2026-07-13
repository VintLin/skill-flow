import SwiftUI

enum DesktopMotionTokens {
    static let buttonPressScale: CGFloat = 0.97
    static let chipPressScale: CGFloat = 0.985
    static let hoverDuration = 0.14
    static let pressDuration = 0.10
    static let rowHoverOpacityDelta = 0.06
}

enum DesktopMotionButtonKind {
    case icon
    case primary
    case subtle

    var cornerRadius: CGFloat {
        switch self {
        case .icon, .primary:
            return 8
        case .subtle:
            return 7
        }
    }
}

enum DesktopMotionChipKind {
    case tab
    case `switch`
    case pill
}

enum DesktopCardClickPolicy {
    case home
    case importSearch
    case menu

    /// Whole-card open is intentionally disabled: detail navigation is header-scoped only
    /// (title / byline / stats) to avoid mis-taps on agents, skills, and tags.
    static func allowsWholeCardTap(for policy: DesktopCardClickPolicy) -> Bool {
        false
    }

    var allowsWholeCardTap: Bool {
        Self.allowsWholeCardTap(for: self)
    }
}

struct DesktopRowHoverModifier: ViewModifier {
    let isHovered: Bool
    let overlayColor: Color

    func body(content: Content) -> some View {
        content
            .overlay {
                overlayColor
                    .opacity(isHovered ? DesktopMotionTokens.rowHoverOpacityDelta : 0)
            }
            .animation(.easeOut(duration: DesktopMotionTokens.hoverDuration), value: isHovered)
    }
}

private struct DesktopMotionButtonStyle: ButtonStyle {
    let kind: DesktopMotionButtonKind
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let isEnabled: Bool
    let isActive: Bool

    func makeBody(configuration: Configuration) -> some View {
        DesktopMotionButtonStyledLabel(
            label: configuration.label,
            kind: kind,
            theme: theme,
            accent: accent,
            isEnabled: isEnabled,
            isActive: isActive,
            isPressed: configuration.isPressed
        )
    }
}

private struct DesktopMotionButtonStyledLabel<Label: View>: View {
    let label: Label
    let kind: DesktopMotionButtonKind
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let isEnabled: Bool
    let isActive: Bool
    let isPressed: Bool

    @State private var isHovered = false

    private var overlayOpacity: Double {
        guard isEnabled, !isActive else { return 0 }
        return isHovered ? DesktopMotionTokens.rowHoverOpacityDelta : 0
    }

    private var scale: CGFloat {
        guard isEnabled else { return 1 }
        return isPressed ? DesktopMotionTokens.buttonPressScale : 1
    }

    var body: some View {
        label
            .scaleEffect(scale)
            .overlay {
                RoundedRectangle(cornerRadius: kind.cornerRadius)
                    .fill(AppTheme.toolbarButtonBackground(for: theme))
                    .opacity(overlayOpacity)
            }
            .animation(.easeOut(duration: DesktopMotionTokens.hoverDuration), value: isHovered)
            .animation(.easeInOut(duration: DesktopMotionTokens.pressDuration), value: isPressed)
            .onHover { hovering in
                guard isEnabled, !isActive else {
                    isHovered = false
                    return
                }
                isHovered = hovering
            }
    }
}

extension View {
    func desktopMotionButton(
        kind: DesktopMotionButtonKind,
        theme: DesktopThemeMode,
        accent: DesktopAccentColor,
        isEnabled: Bool,
        isActive: Bool = false
    ) -> some View {
        buttonStyle(
            DesktopMotionButtonStyle(
                kind: kind,
                theme: theme,
                accent: accent,
                isEnabled: isEnabled,
                isActive: isActive
            )
        )
    }

    func desktopMotionCard(
        theme: DesktopThemeMode,
        accent: DesktopAccentColor,
        isEnabled: Bool
    ) -> some View {
        modifier(
            DesktopMotionCardScaleModifier(
                theme: theme,
                accent: accent,
                isEnabled: isEnabled
            )
        )
    }

    func desktopMotionChip(
        kind _: DesktopMotionChipKind,
        theme: DesktopThemeMode,
        accent: DesktopAccentColor,
        isEnabled: Bool,
        isSelected: Bool
    ) -> some View {
        buttonStyle(
            DesktopMotionChipStyle(
                theme: theme,
                accent: accent,
                isEnabled: isEnabled,
                isSelected: isSelected
            )
        )
    }

    func desktopRowHover(
        theme: DesktopThemeMode,
        accent: DesktopAccentColor,
        isEnabled: Bool,
        isSelected: Bool = false
    ) -> some View {
        modifier(
            DesktopRowHoverPassthroughModifier(
                theme: theme,
                accent: accent,
                isEnabled: isEnabled,
                isSelected: isSelected
            )
        )
    }
}

private struct DesktopMotionCardScaleModifier: ViewModifier {
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let isEnabled: Bool

    func body(content: Content) -> some View {
        content
    }
}

private struct DesktopMotionChipStyle: ButtonStyle {
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let isEnabled: Bool
    let isSelected: Bool

    func makeBody(configuration: Configuration) -> some View {
        DesktopMotionChipStyledLabel(
            label: configuration.label,
            theme: theme,
            accent: accent,
            isEnabled: isEnabled,
            isSelected: isSelected,
            isPressed: configuration.isPressed
        )
    }
}

private struct DesktopRowHoverPassthroughModifier: ViewModifier {
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let isEnabled: Bool
    let isSelected: Bool

    func body(content: Content) -> some View {
        content
    }
}

private struct DesktopMotionChipStyledLabel<Label: View>: View {
    let label: Label
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let isEnabled: Bool
    let isSelected: Bool
    let isPressed: Bool

    @State private var isHovered = false

    private var scale: CGFloat {
        guard isEnabled else { return 1 }
        return isPressed ? DesktopMotionTokens.chipPressScale : 1
    }

    private var overlayOpacity: Double {
        guard isEnabled else { return 0 }
        if isSelected {
            return isHovered ? 0.03 : 0
        }
        return isHovered ? DesktopMotionTokens.rowHoverOpacityDelta : 0
    }

    var body: some View {
        label
            .scaleEffect(scale)
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .fill(AppTheme.toolbarButtonBackground(for: theme))
                    .opacity(overlayOpacity)
            }
            .animation(.easeOut(duration: DesktopMotionTokens.hoverDuration), value: isHovered)
            .animation(.easeInOut(duration: DesktopMotionTokens.pressDuration), value: isPressed)
            .onHover { hovering in
                guard isEnabled else {
                    isHovered = false
                    return
                }
                isHovered = hovering
            }
    }
}

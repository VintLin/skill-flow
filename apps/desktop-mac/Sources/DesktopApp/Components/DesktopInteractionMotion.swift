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

    static func allowsWholeCardTap(for policy: DesktopCardClickPolicy) -> Bool {
        policy == .home
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

private struct DesktopMotionButtonModifier: ViewModifier {
    let kind: DesktopMotionButtonKind
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let isEnabled: Bool
    let isActive: Bool

    @State private var isHovered = false
    @GestureState private var isPressed = false

    private var overlayOpacity: Double {
        guard isEnabled, !isActive else { return 0 }
        return isHovered ? DesktopMotionTokens.rowHoverOpacityDelta : 0
    }

    private var scale: CGFloat {
        guard isEnabled else { return 1 }
        return isPressed ? DesktopMotionTokens.buttonPressScale : 1
    }

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .overlay {
                RoundedRectangle(cornerRadius: kind.cornerRadius)
                    .fill(AppTheme.brand(for: accent, in: theme))
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
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .updating($isPressed) { _, state, _ in
                        guard isEnabled else { return }
                        state = true
                    }
            )
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
        modifier(
            DesktopMotionButtonModifier(
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
            DesktopMotionCardModifier(
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
        modifier(
            DesktopMotionChipModifier(
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
            DesktopRowHoverStatefulModifier(
                theme: theme,
                accent: accent,
                isEnabled: isEnabled,
                isSelected: isSelected
            )
        )
    }
}

private struct DesktopMotionCardModifier: ViewModifier {
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let isEnabled: Bool

    @State private var isHovered = false
    @GestureState private var isPressed = false

    private var scale: CGFloat {
        guard isEnabled else { return 1 }
        return isPressed ? DesktopMotionTokens.chipPressScale : 1
    }

    private var overlayOpacity: Double {
        guard isEnabled else { return 0 }
        return isHovered ? DesktopMotionTokens.rowHoverOpacityDelta : 0
    }

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .fill(AppTheme.brand(for: accent, in: theme))
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
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .updating($isPressed) { _, state, _ in
                        guard isEnabled else { return }
                        state = true
                    }
            )
    }
}

private struct DesktopMotionChipModifier: ViewModifier {
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let isEnabled: Bool
    let isSelected: Bool

    @State private var isHovered = false
    @GestureState private var isPressed = false

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

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .fill(AppTheme.brand(for: accent, in: theme))
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
            .simultaneousGesture(
                DragGesture(minimumDistance: 0)
                    .updating($isPressed) { _, state, _ in
                        guard isEnabled else { return }
                        state = true
                    }
            )
    }
}

private struct DesktopRowHoverStatefulModifier: ViewModifier {
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let isEnabled: Bool
    let isSelected: Bool

    @State private var isHovered = false

    private var overlayOpacity: Double {
        guard isEnabled, !isSelected else { return 0 }
        return isHovered ? DesktopMotionTokens.rowHoverOpacityDelta : 0
    }

    func body(content: Content) -> some View {
        content
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .fill(AppTheme.brand(for: accent, in: theme))
                    .opacity(overlayOpacity)
            }
            .animation(.easeOut(duration: DesktopMotionTokens.hoverDuration), value: isHovered)
            .onHover { hovering in
                guard isEnabled else {
                    isHovered = false
                    return
                }
                isHovered = hovering
            }
    }
}

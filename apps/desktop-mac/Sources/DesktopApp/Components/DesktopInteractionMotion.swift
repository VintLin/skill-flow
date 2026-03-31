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

enum DesktopCardClickPolicy {
    case home
    case importSearch
    case menu

    static func allowsWholeCardTap(for policy: DesktopCardClickPolicy) -> Bool {
        policy == .home
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
}

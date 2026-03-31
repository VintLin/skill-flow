import SwiftUI

enum DesktopMotionTokens {
    static let buttonPressScale: CGFloat = 0.97
    static let chipPressScale: CGFloat = 0.985
    static let hoverDuration = 0.14
    static let pressDuration = 0.10
    static let rowHoverOpacityDelta = 0.06
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

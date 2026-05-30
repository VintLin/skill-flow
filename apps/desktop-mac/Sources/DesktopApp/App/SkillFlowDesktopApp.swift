import AppKit
import SwiftUI

@main
struct SkillFlowDesktopApp: App {
    @Environment(\.openWindow) private var openWindow

    @State private var container = DesktopAppContainer()

    var body: some Scene {
        Window(L10n.string("app.name", locale: selectedLocale), id: "main-window") {
            container.homeContainer.makeView()
                .environment(\.locale, selectedLocale)
                .background(WindowTitlebarConfigurator())
        }
        .windowStyle(.hiddenTitleBar)

        Settings {
            SettingsBridgeView(navigation: container.navigation)
                .environment(\.locale, selectedLocale)
        }

        MenuBarExtra {
            MenuBarQuickConfigView(
                viewModel: container.mainViewModel,
                settingsViewModel: container.settingsViewModel,
                screenState: container.menuBarScreenState,
                groupTagController: container.groupTagController,
                navigation: container.navigation
            ) {
                openWindow(id: "main-window")
                NSApp.activate(ignoringOtherApps: true)
            }
            .environment(\.locale, selectedLocale)
        } label: {
            if let image = MenuBarIcon.image() {
                Image(nsImage: image)
                    .renderingMode(.template)
            } else {
                Image(systemName: menuIcon)
            }
        }
        .menuBarExtraStyle(.window)
    }

    private var selectedLocale: Locale {
        container.settingsViewModel.selectedLocale
    }

    private var menuIcon: String {
        container.mainViewModel.healthStatus.menuIconSystemName
    }
}

private struct WindowTitlebarConfigurator: NSViewRepresentable {
    private static let titlebarTrafficLightVerticalOffset: CGFloat = -8
    private static var originalTrafficLightOrigins: [NSWindow.ButtonType: NSPoint] = [:]

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context _: Context) -> NSView {
        NSView(frame: .zero)
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        DispatchQueue.main.async {
            guard let window = nsView.window else {
                return
            }

            context.coordinator.configure(window: window)
        }
    }

    private static func configureTitlebar(for window: NSWindow) {
        window.styleMask.insert(.fullSizeContentView)
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.titlebarSeparatorStyle = .none
        window.isMovableByWindowBackground = false
        Self.alignTrafficLightButtons(in: window)
    }

    private static func alignTrafficLightButtons(in window: NSWindow) {
        let buttonTypes: [NSWindow.ButtonType] = [.closeButton, .miniaturizeButton, .zoomButton]

        for buttonType in buttonTypes {
            guard let button = window.standardWindowButton(buttonType) else {
                continue
            }

            if Self.originalTrafficLightOrigins[buttonType] == nil {
                Self.originalTrafficLightOrigins[buttonType] = button.frame.origin
            }

            guard let originalOrigin = Self.originalTrafficLightOrigins[buttonType] else {
                continue
            }

            let alignedOrigin = NSPoint(
                x: originalOrigin.x,
                y: originalOrigin.y + Self.titlebarTrafficLightVerticalOffset
            )
            button.setFrameOrigin(alignedOrigin)
        }
    }

    final class Coordinator {
        private weak var configuredWindow: NSWindow?

        deinit {
            NotificationCenter.default.removeObserver(self)
        }

        @MainActor
        func configure(window: NSWindow) {
            WindowTitlebarConfigurator.configureTitlebar(for: window)

            guard configuredWindow !== window else {
                return
            }

            NotificationCenter.default.removeObserver(self)
            configuredWindow = window
            observeWindowLayoutChanges(for: window)
        }

        private func observeWindowLayoutChanges(for window: NSWindow) {
            let notifications: [Notification.Name] = [
                NSWindow.didResizeNotification,
                NSWindow.didEndLiveResizeNotification,
                NSWindow.didExitFullScreenNotification,
                NSWindow.didBecomeKeyNotification
            ]

            notifications.forEach { notificationName in
                NotificationCenter.default.addObserver(
                    self,
                    selector: #selector(windowLayoutDidChange(_:)),
                    name: notificationName,
                    object: window,
                )
            }
        }

        @MainActor
        @objc private func windowLayoutDidChange(_ notification: Notification) {
            guard let window = notification.object as? NSWindow else {
                return
            }
            scheduleTitlebarRealignment(for: window)
        }

        @MainActor
        private func scheduleTitlebarRealignment(for window: NSWindow) {
            WindowTitlebarConfigurator.configureTitlebar(for: window)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak window] in
                guard let window else {
                    return
                }
                WindowTitlebarConfigurator.configureTitlebar(for: window)
            }
        }
    }
}

private struct SettingsBridgeView: View {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.locale) private var locale

    let navigation: DesktopAppContainer.RouteNavigation

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(t("settings.bridge.title"))
                .font(.system(size: 16, weight: .semibold))
            Text(t("settings.bridge.subtitle"))
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.secondary)
            Button(t("settings.bridge.action_open_settings")) {
                navigation.showSettings()
                openWindow(id: "main-window")
                NSApp.activate(ignoringOtherApps: true)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(width: 320)
    }

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }
}

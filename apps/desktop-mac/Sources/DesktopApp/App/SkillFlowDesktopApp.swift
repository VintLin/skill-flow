import SwiftUI
import AppKit

@main
struct SkillFlowDesktopApp: App {
    @Environment(\.openWindow) private var openWindow

    @State private var container = DesktopAppContainer()

    init() {
        if let icon = AppIconLibrary.image() {
            NSApplication.shared.applicationIconImage = icon
        }
    }

    var body: some Scene {
        Window(L10n.string("app.name", locale: selectedLocale), id: "main-window") {
            container.homeContainer.makeView()
                .environment(\.locale, selectedLocale)
                .task {
                    await container.settingsViewModel.checkForUpdatesIfNeeded()
                }
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

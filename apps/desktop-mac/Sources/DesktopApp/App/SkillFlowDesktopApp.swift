import SwiftUI
import AppKit

@main
struct SkillFlowDesktopApp: App {
    @Environment(\.openWindow) private var openWindow
    @AppStorage(DesktopLanguage.storageKey) private var desktopLanguageRawValue = DesktopLanguage.system.rawValue

    @State private var viewModel = MainViewModel(bridgeClient: BridgeClient())

    init() {
        if let icon = AppIconLibrary.image() {
            NSApplication.shared.applicationIconImage = icon
        }
    }

    var body: some Scene {
        Window(L10n.string("app.name", locale: selectedLocale), id: "main-window") {
            MainView(viewModel: viewModel)
                .frame(minWidth: 980, minHeight: 640)
                .environment(\.locale, selectedLocale)
        }
        .windowStyle(.hiddenTitleBar)

        Settings {
            SettingsBridgeView(viewModel: viewModel)
                .environment(\.locale, selectedLocale)
        }

        MenuBarExtra {
            MenuBarQuickConfigView(viewModel: viewModel) {
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
        DesktopLanguage(storageValue: desktopLanguageRawValue).locale
    }

    private var menuIcon: String {
        viewModel.healthStatus.menuIconSystemName
    }
}

private struct SettingsBridgeView: View {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.locale) private var locale

    @Bindable var viewModel: MainViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(t("settings.bridge.title"))
                .font(.system(size: 16, weight: .semibold))
            Text(t("settings.bridge.subtitle"))
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.secondary)
            Button(t("settings.bridge.action_open_settings")) {
                viewModel.currentPage = .settings
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

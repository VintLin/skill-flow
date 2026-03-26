import SwiftUI
import AppKit

@main
struct SkillFlowDesktopApp: App {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openSettings) private var openSettings

    @State private var viewModel = MainViewModel(bridgeClient: BridgeClient())

    init() {
        if let icon = AppIconLibrary.image() {
            NSApplication.shared.applicationIconImage = icon
        }
    }

    var body: some Scene {
        Window("Skill Flow", id: "main-window") {
            MainView(viewModel: viewModel) {
                openSettings()
            }
                .frame(minWidth: 980, minHeight: 640)
        }
        .windowStyle(.hiddenTitleBar)

        Settings {
            SettingsView()
        }

        MenuBarExtra {
            MenuBarQuickConfigView(viewModel: viewModel) {
                openWindow(id: "main-window")
                NSApp.activate(ignoringOtherApps: true)
            }
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

    private var menuIcon: String {
        switch viewModel.healthLabel {
        case "Healthy":
            return "checkmark.circle"
        case "Warnings":
            return "exclamationmark.triangle"
        case "Error":
            return "xmark.circle"
        default:
            return "circle"
        }
    }
}

import SwiftUI
import AppKit

@main
struct SkillFlowDesktopApp: App {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openSettings) private var openSettings

    @State private var viewModel = MainViewModel(bridgeClient: BridgeClient())

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

        MenuBarExtra("Skill Flow", systemImage: menuIcon) {
            MenuBarQuickConfigView(viewModel: viewModel) {
                openWindow(id: "main-window")
                NSApp.activate(ignoringOtherApps: true)
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

import SwiftUI
import AppKit

@main
struct SkillFlowDesktopApp: App {
    @Environment(\.openWindow) private var openWindow

    @State private var viewModel = MainViewModel(bridgeClient: BridgeClient())

    var body: some Scene {
        Window("Skill Flow", id: "main-window") {
            MainView(viewModel: viewModel)
                .frame(minWidth: 980, minHeight: 640)
        }

        Settings {
            SettingsView()
        }

        MenuBarExtra("Skill Flow", systemImage: menuIcon) {
            Text("Status: \(viewModel.healthLabel)")
            Divider()
            Button("Open Skill Flow") {
                openWindow(id: "main-window")
                NSApp.activate(ignoringOtherApps: true)
            }
            Button("Run Doctor") {
                Task {
                    await viewModel.runDoctor()
                }
            }
            Button("Update All") {
                Task {
                    await viewModel.updateAll()
                }
            }
            Divider()
            SettingsLink()
            Button("Quit") {
                NSApplication.shared.terminate(nil)
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

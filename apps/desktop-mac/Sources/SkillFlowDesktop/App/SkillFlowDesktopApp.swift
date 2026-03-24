import SwiftUI
import AppKit

@main
struct SkillFlowDesktopApp: App {
    @State private var showMenuBar = true
    @State private var showMainWindow = false
    @State private var statusLabel = "Unknown"

    private let bridgeClient = BridgeClient()
    @State private var viewModel = MainViewModel(bridgeClient: BridgeClient())

    var body: some Scene {
        WindowGroup("Skill Flow") {
            MainView(viewModel: viewModel)
                .frame(minWidth: 980, minHeight: 640)
        }

        Settings {
            SettingsView()
        }

        MenuBarExtra("Skill Flow", systemImage: menuIcon) {
            Text("Status: \(statusLabel)")
            Divider()
            Button("Open Skill Flow") {
                showMainWindow = true
                NSApp.activate(ignoringOtherApps: true)
            }
            Button("Run Doctor") {
                Task {
                    await viewModel.runDoctor()
                    statusLabel = viewModel.healthLabel
                }
            }
            Button("Update All") {
                Task {
                    await viewModel.updateAll()
                    statusLabel = viewModel.healthLabel
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

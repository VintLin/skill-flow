import SwiftUI
import AppKit

@main
struct SkillFlowDesktopApp: App {
    @Environment(\.openWindow) private var openWindow

    @State private var viewModel = MainViewModel(bridgeClient: BridgeClient())

    init() {
        if let icon = AppIconLibrary.image() {
            NSApplication.shared.applicationIconImage = icon
        }
    }

    var body: some Scene {
        Window("Skill Flow", id: "main-window") {
            MainView(viewModel: viewModel)
                .frame(minWidth: 980, minHeight: 640)
        }
        .windowStyle(.hiddenTitleBar)

        Settings {
            SettingsBridgeView(viewModel: viewModel)
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

private struct SettingsBridgeView: View {
    @Environment(\.openWindow) private var openWindow

    @Bindable var viewModel: MainViewModel

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Settings moved")
                .font(.system(size: 16, weight: .semibold))
            Text("Open the main window to configure desktop settings.")
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(.secondary)
            Button("Open Settings") {
                viewModel.currentPage = .settings
                openWindow(id: "main-window")
                NSApp.activate(ignoringOtherApps: true)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(width: 320)
    }
}

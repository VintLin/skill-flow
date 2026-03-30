import SwiftUI

struct SettingsScreen: View {
    @Bindable var viewModel: SettingsViewModel
    let theme: DesktopThemeMode
    let detectedTargetIds: [String]

    var body: some View {
        ScrollView {
            SettingsView(viewModel: viewModel, theme: theme, detectedTargetIds: detectedTargetIds)
                .padding(16)
        }
    }
}

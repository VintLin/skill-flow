import SwiftUI

struct SettingsScreen: View {
    @Bindable var viewModel: SettingsViewModel
    let theme: DesktopThemeMode
    let detectedTargetIds: [String]
    let onAddCustomAgent: () -> Void
    let onEditCustomAgent: (String) -> Void

    var body: some View {
        ScrollView {
            SettingsView(
                viewModel: viewModel,
                theme: theme,
                detectedTargetIds: detectedTargetIds,
                onAddCustomAgent: onAddCustomAgent,
                onEditCustomAgent: onEditCustomAgent
            )
            .padding(16)
        }
    }
}

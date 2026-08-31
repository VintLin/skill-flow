import SwiftUI

struct SettingsScreen: View {
    @Bindable var viewModel: SettingsViewModel
    let theme: DesktopThemeMode
    let detectedTargetIds: [String]
    let onEditCustomAgent: (String) -> Void

    var body: some View {
        ScrollView {
            SettingsView(
                viewModel: viewModel,
                theme: theme,
                detectedTargetIds: detectedTargetIds,
                onEditCustomAgent: onEditCustomAgent
            )
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

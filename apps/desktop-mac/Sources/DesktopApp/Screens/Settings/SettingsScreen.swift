import SwiftUI

struct SettingsScreen: View {
    @Bindable var viewModel: SettingsViewModel
    let theme: DesktopThemeMode

    var body: some View {
        ScrollView {
            SettingsView(viewModel: viewModel, theme: theme)
                .padding(16)
        }
    }
}

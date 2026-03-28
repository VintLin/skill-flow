import SwiftUI

struct SettingsScreen: View {
    let theme: DesktopThemeMode
    @State private var viewModel: SettingsViewModel

    init(theme: DesktopThemeMode) {
        self.theme = theme
        _viewModel = State(initialValue: SettingsViewModel())
    }

    var body: some View {
        ScrollView {
            SettingsView(viewModel: viewModel, theme: theme)
                .padding(16)
        }
    }
}

import SwiftUI

struct SettingsScreen: View {
    let theme: DesktopThemeMode

    var body: some View {
        ScrollView {
            SettingsView(theme: theme)
                .padding(16)
        }
    }
}

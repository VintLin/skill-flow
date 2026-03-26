import SwiftUI

struct SettingsView: View {
    @AppStorage("desktop.autoLaunch") private var autoLaunch = false
    @AppStorage("desktop.logLevel") private var logLevel = "info"
    @AppStorage("desktop.experimentalExternalHelper") private var experimentalExternalHelper = false
    @AppStorage("desktop.themeMode") private var themeMode = "light"
    @AppStorage("desktop.themeAccent") private var themeAccent = DesktopAccentColor.blue.rawValue

    var body: some View {
        Form {
            Picker("Theme", selection: $themeMode) {
                Text("Light").tag("light")
                Text("Dark").tag("dark")
            }
            Picker("Accent", selection: $themeAccent) {
                ForEach(DesktopAccentColor.allCases) { accent in
                    HStack(spacing: 8) {
                        Circle()
                            .fill(AppTheme.brand(for: accent))
                            .frame(width: 10, height: 10)
                        Text(accent.title)
                    }
                    .tag(accent.rawValue)
                }
            }
            Toggle("Launch at login", isOn: $autoLaunch)
            Picker("Log level", selection: $logLevel) {
                Text("debug").tag("debug")
                Text("info").tag("info")
                Text("warn").tag("warn")
                Text("error").tag("error")
            }
            Toggle("Enable external helper override (debug only)", isOn: $experimentalExternalHelper)
                .help("This setting is for local debug only and is ignored in release builds.")
        }
        .padding()
        .frame(width: 420)
    }
}

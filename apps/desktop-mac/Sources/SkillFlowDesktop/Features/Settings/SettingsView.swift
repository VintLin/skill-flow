import SwiftUI

struct SettingsView: View {
    @AppStorage("desktop.autoLaunch") private var autoLaunch = false
    @AppStorage("desktop.logLevel") private var logLevel = "info"
    @AppStorage("desktop.experimentalExternalHelper") private var experimentalExternalHelper = false
    @AppStorage("desktop.themeMode") private var themeMode = "light"

    var body: some View {
        Form {
            Picker("Theme", selection: $themeMode) {
                Text("Light").tag("light")
                Text("Dark").tag("dark")
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

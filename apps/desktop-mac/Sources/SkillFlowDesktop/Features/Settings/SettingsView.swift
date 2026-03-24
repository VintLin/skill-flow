import SwiftUI

struct SettingsView: View {
    @AppStorage("desktop.autoLaunch") private var autoLaunch = false
    @AppStorage("desktop.logLevel") private var logLevel = "info"
    @AppStorage("desktop.experimentalExternalHelper") private var experimentalExternalHelper = false

    var body: some View {
        Form {
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

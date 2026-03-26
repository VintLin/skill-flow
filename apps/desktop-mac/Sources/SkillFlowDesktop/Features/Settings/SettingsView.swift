import SwiftUI

struct SettingsView: View {
    @AppStorage("desktop.autoLaunch") private var autoLaunch = false
    @AppStorage("desktop.logLevel") private var logLevel = "info"
    @AppStorage("desktop.experimentalExternalHelper") private var experimentalExternalHelper = false
    @AppStorage("desktop.themeMode") private var themeMode = "light"
    @AppStorage("desktop.themeAccent") private var themeAccent = DesktopAccentColor.blue.rawValue
    @AppStorage("desktop.menuCompactCards") private var menuCompactCards = true

    var cardStyle: Bool = false

    var body: some View {
        Group {
            if cardStyle {
                customContent
            } else {
                fallbackForm
            }
        }
    }

    private var customContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Settings")
                    .font(.system(size: 18, weight: .semibold))
                Text("Configure global desktop preferences. Group-level behavior stays in Home and Group Detail.")
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(.secondary)
            }

            VStack(alignment: .leading, spacing: 12) {
                settingsSection(
                    title: "Appearance",
                    rows: {
                        settingsRow(title: "Theme", description: "Choose the app theme.") {
                            Picker("Theme", selection: $themeMode) {
                                Text("Light").tag("light")
                                Text("Dark").tag("dark")
                            }
                            .labelsHidden()
                            .pickerStyle(.segmented)
                            .frame(width: 180)
                        }

                        settingsRow(title: "Accent", description: "Use one accent color across desktop surfaces.") {
                            Picker("Accent", selection: $themeAccent) {
                                ForEach(DesktopAccentColor.allCases) { accent in
                                    Text(accent.title).tag(accent.rawValue)
                                }
                            }
                            .labelsHidden()
                            .frame(width: 150)
                        }
                    }
                )

                settingsSection(
                    title: "Menu Bar",
                    rows: {
                        settingsRow(title: "Compact menu cards", description: "Collapse secondary skill details in the menu bar list.") {
                            Toggle("", isOn: $menuCompactCards)
                                .labelsHidden()
                        }
                    }
                )

                settingsSection(
                    title: "General",
                    rows: {
                        settingsRow(title: "Launch at login", description: "Open the desktop app automatically when the system starts.") {
                            Toggle("", isOn: $autoLaunch)
                                .labelsHidden()
                        }

                        settingsRow(title: "Log level", description: "Choose how verbose local desktop logs should be.") {
                            Picker("Log level", selection: $logLevel) {
                                Text("debug").tag("debug")
                                Text("info").tag("info")
                                Text("warn").tag("warn")
                                Text("error").tag("error")
                            }
                            .labelsHidden()
                            .frame(width: 120)
                        }
                    }
                )

                settingsSection(
                    title: "Advanced",
                    rows: {
                        settingsRow(title: "External helper override", description: "Debug-only local override. Ignored in release builds.") {
                            Toggle("", isOn: $experimentalExternalHelper)
                                .labelsHidden()
                        }
                    }
                )
            }
        }
        .frame(maxWidth: 900, alignment: .leading)
    }

    private var fallbackForm: some View {
        Form {
            Picker("Theme", selection: $themeMode) {
                Text("Light").tag("light")
                Text("Dark").tag("dark")
            }
            Picker("Accent", selection: $themeAccent) {
                ForEach(DesktopAccentColor.allCases) { accent in
                    Text(accent.title).tag(accent.rawValue)
                }
            }
            Toggle("Compact menu cards", isOn: $menuCompactCards)
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

    private func settingsSection<Rows: View>(title: String, @ViewBuilder rows: () -> Rows) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 11, weight: .bold))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            rows()
        }
        .padding(14)
        .background(Color.primary.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func settingsRow<Control: View>(title: String, description: String, @ViewBuilder control: () -> Control) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                Text(description)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 20)
            control()
        }
    }
}

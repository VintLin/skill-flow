import SwiftUI

struct SettingsView: View {
    @AppStorage("desktop.autoLaunch") private var autoLaunch = false
    @AppStorage("desktop.logLevel") private var logLevel = "info"
    @AppStorage("desktop.experimentalExternalHelper") private var experimentalExternalHelper = false
    @AppStorage("desktop.themeMode") private var themeMode = "light"
    @AppStorage("desktop.themeAccent") private var themeAccent = DesktopAccentColor.blue.rawValue
    @AppStorage("desktop.menuCompactCards") private var menuCompactCards = true

    @State private var openDropdown: DropdownKind?

    var cardStyle: Bool = false
    var theme: DesktopThemeMode = .light

    private enum DropdownKind: Hashable {
        case accent
        case logLevel
    }

    private struct DropdownOption: Identifiable, Hashable {
        let id: String
        let title: String
        let swatch: Color?
    }

    private let controlColumnWidth: CGFloat = 168

    private var colorScheme: ColorScheme {
        theme == .dark ? .dark : .light
    }

    private var currentAccent: DesktopAccentColor {
        DesktopAccentColor(rawValue: themeAccent) ?? .blue
    }

    private var accentOptions: [DropdownOption] {
        DesktopAccentColor.allCases.map { accent in
            DropdownOption(
                id: accent.rawValue,
                title: accent.title,
                swatch: AppTheme.brand(for: accent, in: theme)
            )
        }
    }

    private var logLevelOptions: [DropdownOption] {
        ["debug", "info", "warn", "error"].map { level in
            DropdownOption(id: level, title: level, swatch: nil)
        }
    }

    private var appearanceSectionZIndex: Double {
        switch openDropdown {
        case .accent:
            return 20
        default:
            return 0
        }
    }

    private var generalSectionZIndex: Double {
        switch openDropdown {
        case .logLevel:
            return 20
        default:
            return 0
        }
    }

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
                            .frame(width: controlColumnWidth, alignment: .trailing)
                            .environment(\.colorScheme, colorScheme)
                        }

                        settingsRow(title: "Accent", description: "Use one accent color across desktop surfaces.") {
                            dropdownControl(
                                kind: .accent,
                                selectionTitle: currentAccent.title,
                                selectionSwatch: AppTheme.brand(for: currentAccent, in: theme),
                                options: accentOptions,
                                selectedId: themeAccent,
                                onSelect: { themeAccent = $0 }
                            )
                        }
                    }
                )
                .zIndex(appearanceSectionZIndex)

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
                            dropdownControl(
                                kind: .logLevel,
                                selectionTitle: logLevel,
                                selectionSwatch: nil,
                                options: logLevelOptions,
                                selectedId: logLevel,
                                onSelect: { logLevel = $0 }
                            )
                        }
                    }
                )
                .zIndex(generalSectionZIndex)

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
        .environment(\.colorScheme, colorScheme)
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
                .foregroundStyle(AppTheme.textMuted(for: theme))
            rows()
        }
        .padding(14)
        .background {
            RoundedRectangle(cornerRadius: 12)
                .fill(AppTheme.surface(for: theme))
        }
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func settingsRow<Control: View>(title: String, description: String, @ViewBuilder control: () -> Control) -> some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Text(description)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            HStack {
                Spacer(minLength: 0)
                control()
            }
            .frame(width: controlColumnWidth, alignment: .trailing)
        }
    }

    @ViewBuilder
    private func dropdownControl(
        kind: DropdownKind,
        selectionTitle: String,
        selectionSwatch: Color?,
        options: [DropdownOption],
        selectedId: String,
        onSelect: @escaping (String) -> Void
    ) -> some View {
        Button {
            openDropdown = openDropdown == kind ? nil : kind
        } label: {
            HStack(spacing: 8) {
                if let selectionSwatch {
                    Circle()
                        .fill(selectionSwatch)
                        .frame(width: 10, height: 10)
                }

                Text(selectionTitle)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(1)

                Spacer(minLength: 8)

                Image(systemName: openDropdown == kind ? "chevron.up" : "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }
            .padding(.horizontal, 10)
            .frame(width: controlColumnWidth, height: 32, alignment: .leading)
            .background(AppTheme.pageBackground(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .overlay(alignment: .topTrailing) {
            if openDropdown == kind {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(options) { option in
                        Button {
                            onSelect(option.id)
                            openDropdown = nil
                        } label: {
                            HStack(spacing: 8) {
                                if let swatch = option.swatch {
                                    Circle()
                                        .fill(swatch)
                                        .frame(width: 10, height: 10)
                                }

                                Text(option.title)
                                    .font(.system(size: 12, weight: .medium))
                                    .foregroundStyle(AppTheme.textPrimary(for: theme))

                                Spacer(minLength: 8)

                                if option.id == selectedId {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundStyle(AppTheme.brand(for: currentAccent, in: theme))
                                }
                            }
                            .padding(.horizontal, 10)
                            .frame(width: controlColumnWidth, height: 30, alignment: .leading)
                            .background(option.id == selectedId ? AppTheme.toolbarButtonBackground(for: theme) : Color.clear)
                            .clipShape(RoundedRectangle(cornerRadius: 7))
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(6)
                .background(AppTheme.pageBackground(for: theme))
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .offset(y: 38)
            }
        }
        .frame(width: controlColumnWidth, alignment: .trailing)
        .zIndex(openDropdown == kind ? 10 : 0)
    }
}

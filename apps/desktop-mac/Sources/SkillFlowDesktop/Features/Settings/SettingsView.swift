import SwiftUI

struct SettingsView: View {
    @Environment(\.locale) private var locale
    @AppStorage("desktop.autoLaunch") private var autoLaunch = false
    @AppStorage("desktop.logLevel") private var logLevel = "info"
    @AppStorage("desktop.experimentalExternalHelper") private var experimentalExternalHelper = false
    @AppStorage(DesktopLanguage.storageKey) private var desktopLanguageRawValue = DesktopLanguage.system.rawValue
    @AppStorage("desktop.themeMode") private var themeMode = "light"
    @AppStorage("desktop.themeAccent") private var themeAccent = DesktopAccentColor.blue.rawValue
    @AppStorage("desktop.menuCompactCards") private var menuCompactCards = true

    @State private var openDropdown: DropdownKind?

    var theme: DesktopThemeMode = .light

    private enum DropdownKind: Hashable {
        case accent
        case language
        case logLevel
    }

    private struct DropdownOption: Identifiable, Hashable {
        let id: String
        let title: String
        let swatch: Color?
    }

    private let controlColumnWidth: CGFloat = 168
    private let dropdownControlWidth: CGFloat = 148

    private var colorScheme: ColorScheme {
        theme == .dark ? .dark : .light
    }

    private var currentAccent: DesktopAccentColor {
        DesktopAccentColor(rawValue: themeAccent) ?? .blue
    }

    private var currentLanguage: DesktopLanguage {
        DesktopLanguage(storageValue: desktopLanguageRawValue)
    }

    private var accentOptions: [DropdownOption] {
        DesktopAccentColor.allCases.map { accent in
            DropdownOption(
                id: accent.rawValue,
                title: t("settings.option.accent.\(accent.rawValue)"),
                swatch: AppTheme.brand(for: accent, in: theme)
            )
        }
    }

    private var languageOptions: [DropdownOption] {
        DesktopLanguage.allCases.map { language in
            DropdownOption(
                id: language.rawValue,
                title: t("settings.option.language.\(language.rawValue)"),
                swatch: nil
            )
        }
    }

    private var logLevelOptions: [DropdownOption] {
        ["debug", "info", "warn", "error"].map { level in
            DropdownOption(id: level, title: t("settings.option.log_level.\(level)"), swatch: nil)
        }
    }

    private var appearanceSectionZIndex: Double {
        switch openDropdown {
        case .accent, .language:
            return 20
        default:
            return 0
        }
    }

    private var advancedSectionZIndex: Double {
        switch openDropdown {
        case .logLevel:
            return 20
        default:
            return 0
        }
    }

    var body: some View {
        customContent
    }

    private var customContent: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                settingsSection(
                    title: t("settings.section.appearance"),
                    rows: {
                        settingsRow(title: t("settings.row.theme.title"), description: t("settings.row.theme.description")) {
                            Picker(t("settings.row.theme.title"), selection: $themeMode) {
                                Text(t("settings.option.theme.light")).tag("light")
                                Text(t("settings.option.theme.dark")).tag("dark")
                            }
                            .labelsHidden()
                            .pickerStyle(.segmented)
                            .frame(width: controlColumnWidth, alignment: .trailing)
                            .environment(\.colorScheme, colorScheme)
                        }

                        settingsRow(title: t("settings.row.accent.title"), description: t("settings.row.accent.description")) {
                            dropdownControl(
                                kind: .accent,
                                selectionTitle: t("settings.option.accent.\(currentAccent.rawValue)"),
                                selectionSwatch: AppTheme.brand(for: currentAccent, in: theme),
                                options: accentOptions,
                                selectedId: themeAccent,
                                onSelect: { themeAccent = $0 }
                            )
                        }

                        settingsRow(title: t("settings.row.language.title"), description: t("settings.row.language.description")) {
                            dropdownControl(
                                kind: .language,
                                selectionTitle: t("settings.option.language.\(currentLanguage.rawValue)"),
                                selectionSwatch: nil,
                                options: languageOptions,
                                selectedId: desktopLanguageRawValue,
                                onSelect: { desktopLanguageRawValue = $0 }
                            )
                        }
                    }
                )
                .zIndex(appearanceSectionZIndex)

                settingsSection(
                    title: t("settings.section.menu_bar"),
                    rows: {
                        settingsRow(title: t("settings.row.menu_compact_cards.title"), description: t("settings.row.menu_compact_cards.description")) {
                            Toggle("", isOn: $menuCompactCards)
                                .labelsHidden()
                        }
                    }
                )

                settingsSection(
                    title: t("settings.section.general"),
                    rows: {
                        settingsRow(title: t("settings.row.launch_at_login.title"), description: t("settings.row.launch_at_login.description")) {
                            Toggle("", isOn: $autoLaunch)
                                .labelsHidden()
                        }
                    }
                )

                settingsSection(
                    title: t("settings.section.advanced"),
                    rows: {
                        settingsRow(title: t("settings.row.log_level.title"), description: t("settings.row.log_level.description")) {
                            dropdownControl(
                                kind: .logLevel,
                                selectionTitle: t("settings.option.log_level.\(logLevel)"),
                                selectionSwatch: nil,
                                options: logLevelOptions,
                                selectedId: logLevel,
                                onSelect: { logLevel = $0 }
                            )
                        }

                        settingsRow(title: t("settings.row.external_helper_override.title"), description: t("settings.row.external_helper_override.description")) {
                            Toggle("", isOn: $experimentalExternalHelper)
                                .labelsHidden()
                        }
                    }
                )
                .zIndex(advancedSectionZIndex)
            }
        }
        .frame(maxWidth: 900, alignment: .leading)
        .environment(\.colorScheme, colorScheme)
    }

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
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
            .frame(width: dropdownControlWidth, height: 32, alignment: .leading)
            .background(AppTheme.pageBackground(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
            }
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
                            .frame(width: dropdownControlWidth, height: 30, alignment: .leading)
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
                .overlay {
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
                }
                .offset(y: 38)
            }
        }
        .frame(width: dropdownControlWidth, alignment: .trailing)
        .zIndex(openDropdown == kind ? 10 : 0)
    }
}

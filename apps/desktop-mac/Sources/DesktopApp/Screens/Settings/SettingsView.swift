import AppKit
import SwiftUI

struct SettingsView: View {
    @Environment(\.locale) private var locale
    @State private var openDropdown: DropdownKind?
    @State private var targetedAgentRowTargetId: String?
    @State private var isTargetingAgentListEnd = false
    @Bindable var viewModel: SettingsViewModel

    var theme: DesktopThemeMode = .light
    var detectedTargetIds: [String] = []
    var onEditCustomAgent: (String) -> Void = { _ in }

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

    private struct AgentDragHandle: View {
        @State private var isHovered = false

        let theme: DesktopThemeMode
        let accent: DesktopAccentColor

        var body: some View {
            Group {
                if let image = ActionIcon.dragHandle.image(size: 14) {
                    Image(nsImage: image)
                        .renderingMode(.template)
                        .resizable()
                        .interpolation(.high)
                        .scaledToFit()
                        .frame(width: 14, height: 14)
                } else {
                    Color.clear.frame(width: 14, height: 14)
                }
            }
            .foregroundStyle(isHovered ? AppTheme.brand(for: accent, in: theme) : AppTheme.textMuted(for: theme))
            .frame(width: 32, height: 32)
            .background(
                RoundedRectangle(cornerRadius: 8)
                    .fill(
                        isHovered
                            ? AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.22 : 0.14)
                            : SettingsView.controlBackground(for: .pageBackground, theme: theme).opacity(0.7)
                    )
            )
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(
                        isHovered
                            ? AppTheme.brand(for: accent, in: theme).opacity(0.45)
                            : AppTheme.cardBorder(for: theme),
                        lineWidth: 0.5
                    )
            }
            .contentShape(RoundedRectangle(cornerRadius: 8))
            .onHover { isHovered = $0 }
        }
    }

    enum ControlSurfaceToken: Equatable {
        case pageBackground
    }

    private let controlColumnWidth: CGFloat = 168
    private let dropdownControlWidth: CGFloat = 148

    private var colorScheme: ColorScheme {
        theme == .dark ? .dark : .light
    }

    private var currentAccent: DesktopAccentColor {
        viewModel.currentAccent
    }

    private var currentLanguage: DesktopLanguage {
        viewModel.currentLanguage
    }

    private var agentRows: [SettingsViewModel.AgentDisplayRow] {
        viewModel.detectedAgentRows(detectedTargetIds: detectedTargetIds)
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
                            Picker(t("settings.row.theme.title"), selection: $viewModel.themeModeRawValue) {
                                Text(t("settings.option.theme.light")).tag("light")
                                Text(t("settings.option.theme.dark")).tag("dark")
                            }
                            .labelsHidden()
                            .pickerStyle(.segmented)
                            .frame(width: controlColumnWidth, alignment: .trailing)
                            .environment(\.colorScheme, colorScheme)
                        }

                        settingsRow(
                            title: t("settings.row.accent.title"),
                            description: t("settings.row.accent.description"),
                            elevated: openDropdown == .accent
                        ) {
                            dropdownControl(
                                kind: .accent,
                                selectionTitle: t("settings.option.accent.\(currentAccent.rawValue)"),
                                selectionSwatch: AppTheme.brand(for: currentAccent, in: theme),
                                options: accentOptions,
                                selectedId: viewModel.themeAccentRawValue,
                                onSelect: { viewModel.themeAccentRawValue = $0 }
                            )
                        }

                        settingsRow(
                            title: t("settings.row.language.title"),
                            description: t("settings.row.language.description"),
                            elevated: openDropdown == .language
                        ) {
                            dropdownControl(
                                kind: .language,
                                selectionTitle: t("settings.option.language.\(currentLanguage.rawValue)"),
                                selectionSwatch: nil,
                                options: languageOptions,
                                selectedId: viewModel.desktopLanguageRawValue,
                                onSelect: { viewModel.desktopLanguageRawValue = $0 }
                            )
                        }
                    }
                )
                .zIndex(appearanceSectionZIndex)

                settingsSection(
                    title: t("settings.section.menu_bar"),
                    rows: {
                        settingsRow(title: t("settings.row.home_card_density.title"), description: t("settings.row.home_card_density.description")) {
                            Picker(t("settings.row.home_card_density.title"), selection: $viewModel.homeCardDensityRawValue) {
                                Text(t("settings.option.card_density.comfortable")).tag(DesktopCardDensity.comfortable.rawValue)
                                Text(t("settings.option.card_density.compact")).tag(DesktopCardDensity.compact.rawValue)
                            }
                            .labelsHidden()
                            .pickerStyle(.segmented)
                            .frame(width: controlColumnWidth, alignment: .trailing)
                            .environment(\.colorScheme, colorScheme)
                        }

                        settingsRow(title: t("settings.row.menu_card_density.title"), description: t("settings.row.menu_card_density.description")) {
                            Picker(t("settings.row.menu_card_density.title"), selection: $viewModel.menuCardDensityRawValue) {
                                Text(t("settings.option.card_density.comfortable")).tag(DesktopCardDensity.comfortable.rawValue)
                                Text(t("settings.option.card_density.compact")).tag(DesktopCardDensity.compact.rawValue)
                            }
                            .labelsHidden()
                            .pickerStyle(.segmented)
                            .frame(width: controlColumnWidth, alignment: .trailing)
                            .environment(\.colorScheme, colorScheme)
                        }
                    }
                )

                settingsSection(
                    title: t("settings.section.agent_display"),
                    description: t("settings.section.agent_display.description"),
                    rows: {
                        agentDisplayRows
                    }
                )

                settingsSection(
                    title: t("settings.section.application_update"),
                    rows: {
                        settingsRow(title: t("settings.row.current_version.title"), description: t("settings.row.current_version.description")) {
                            Text(viewModel.currentVersion)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(AppTheme.textPrimary(for: theme))
                        }

                        settingsRow(title: t("settings.row.check_updates.title"), description: updateStatusDescription) {
                            if viewModel.updateStatus == .checking || viewModel.updateStatus == .installing {
                                settingsActionLoadingIndicator()
                            } else {
                                settingsActionButton(updateActionTitle) {
                                    Task {
                                        if viewModel.updateStatus == .updateAvailable {
                                            await viewModel.installUpdate()
                                        } else {
                                            await viewModel.checkForUpdates()
                                        }
                                    }
                                }
                            }
                        }

                        settingsRow(title: t("settings.row.open_releases.title"), description: t("settings.row.open_releases.description")) {
                            settingsActionButton(t("settings.action.open_releases")) {
                                viewModel.openReleasePage()
                            }
                        }
                    }
                )

                settingsSection(
                    title: t("settings.section.general"),
                    rows: {
                        settingsRow(title: t("settings.row.launch_at_login.title"), description: t("settings.row.launch_at_login.description")) {
                            Toggle("", isOn: $viewModel.autoLaunch)
                                .labelsHidden()
                        }
                    }
                )

                settingsSection(
                    title: t("settings.section.advanced"),
                    rows: {
                        settingsRow(
                            title: t("settings.row.log_level.title"),
                            description: t("settings.row.log_level.description"),
                            elevated: openDropdown == .logLevel
                        ) {
                            dropdownControl(
                                kind: .logLevel,
                                selectionTitle: t("settings.option.log_level.\(viewModel.logLevel)"),
                                selectionSwatch: nil,
                                options: logLevelOptions,
                                selectedId: viewModel.logLevel,
                                onSelect: { viewModel.logLevel = $0 }
                            )
                        }

                        settingsRow(title: t("settings.row.external_helper_override.title"), description: t("settings.row.external_helper_override.description")) {
                            Toggle("", isOn: $viewModel.experimentalExternalHelper)
                                .labelsHidden()
                        }
                    }
                )
                .zIndex(advancedSectionZIndex)

                settingsSection(
                    title: t("settings.section.maintenance"),
                    rows: {
                        settingsRow(title: t("settings.row.clear_cache.title"), description: t("settings.row.clear_cache.description")) {
                            settingsActionButton(t("settings.action.clear_cache")) {
                                viewModel.clearMetadataCache()
                            }
                        }

                        settingsRow(title: t("settings.row.reset_configuration.title"), description: t("settings.row.reset_configuration.description")) {
                            settingsActionButton(t("settings.action.reset_configuration")) {
                                viewModel.resetConfiguration()
                            }
                        }
                    }
                )
            }
        }
        .frame(maxWidth: 900, alignment: .leading)
        .environment(\.colorScheme, colorScheme)
    }

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }

    private var updateStatusDescription: String {
        switch viewModel.updateStatus {
        case .idle:
            return t("settings.row.check_updates.description.idle")
        case .checking:
            return t("settings.row.check_updates.description.checking")
        case .installing:
            return t("settings.row.check_updates.description.installing")
        case .installerOpened:
            return t("settings.row.check_updates.description.installer_opened")
        case .upToDate:
            return t("settings.row.check_updates.description.up_to_date", viewModel.latestVersion ?? viewModel.currentVersion)
        case .updateAvailable:
            return t("settings.row.check_updates.description.available", viewModel.latestVersion ?? "-")
        case .runningNewerBuild:
            return t("settings.row.check_updates.description.newer_local", viewModel.latestVersion ?? "-")
        case .failed:
            return t("settings.row.check_updates.description.failed")
        }
    }

    private var updateActionTitle: String {
        viewModel.updateStatus == .updateAvailable
            ? t("settings.action.install_update")
            : t("settings.action.check_updates")
    }

    @ViewBuilder
    private var agentDisplayRows: some View {
        if agentRows.isEmpty {
            Text(t("settings.agent_display.empty"))
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(AppTheme.textMuted(for: theme))
        } else {
            VStack(alignment: .leading, spacing: 10) {
                ForEach(agentRows) { row in
                    agentDisplayRow(row)
                }

                Text(t("settings.agent_display.footer"))
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .dropDestination(for: String.self) { items, _ in
                        guard let sourceId = items.first else {
                            return false
                        }
                        moveAgentIfNeeded(sourceId: sourceId, destinationIndex: agentRows.count)
                        return true
                    } isTargeted: { isTargeted in
                        isTargetingAgentListEnd = isTargeted
                    }
                    .overlay(alignment: .top) {
                        if isTargetingAgentListEnd {
                            agentInsertIndicator
                        }
                    }
            }
        }
    }

    private func settingsSection<Rows: View>(
        title: String,
        description: String? = nil,
        @ViewBuilder headerTrailing: () -> some View = { EmptyView() },
        @ViewBuilder rows: () -> Rows
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 12) {
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                    .textCase(.uppercase)
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                Spacer(minLength: 0)
                headerTrailing()
            }
            if let description {
                Text(description)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }
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

    private func settingsRow<Control: View>(
        title: String,
        description: String,
        elevated: Bool = false,
        @ViewBuilder control: () -> Control
    ) -> some View {
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
        .zIndex(Self.rowZIndex(isElevated: elevated))
    }

    private func agentDisplayRow(_ row: SettingsViewModel.AgentDisplayRow) -> some View {
        let contentOpacity = row.isVisible ? 1.0 : 0.45
        let backgroundOpacity = row.isVisible ? 1.0 : 0.55

        return HStack(alignment: .center, spacing: 12) {
            AgentDragHandle(theme: theme, accent: currentAccent)
                .draggable(row.targetId) {
                    settingsAgentDragPreview(row: row)
                }
                .opacity(contentOpacity)

            settingsAgentIcon(targetId: row.targetId, fallbackText: row.shortLabel)
                .opacity(contentOpacity)

            VStack(alignment: .leading, spacing: 3) {
                Text(row.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(1)
                    .truncationMode(.tail)
                Text(row.mountPath)
                    .font(.system(size: 11, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .opacity(contentOpacity)

            if !row.isBuiltIn {
                HStack(spacing: 8) {
                    Button(t("settings.action.edit")) {
                        onEditCustomAgent(row.targetId)
                    }
                    .buttonStyle(.plain)

                    Button(t("settings.action.delete")) {
                        viewModel.deleteCustomAgent(id: row.targetId)
                    }
                    .buttonStyle(.plain)
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(AppTheme.brand(for: currentAccent, in: theme))
            }

            Toggle("", isOn: Binding(
                get: { row.isVisible },
                set: { viewModel.setAgentVisibility(targetId: row.targetId, isVisible: $0) }
            ))
            .labelsHidden()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Self.controlBackground(for: .pageBackground, theme: theme))
                .opacity(backgroundOpacity)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
                .opacity(backgroundOpacity)
        }
        .dropDestination(for: String.self) { items, _ in
            guard let sourceId = items.first,
                  let destinationIndex = agentRows.firstIndex(where: { $0.targetId == row.targetId })
            else {
                return false
            }
            moveAgentIfNeeded(sourceId: sourceId, destinationIndex: destinationIndex)
            return true
        } isTargeted: { isTargeted in
            targetedAgentRowTargetId = isTargeted ? row.targetId : (targetedAgentRowTargetId == row.targetId ? nil : targetedAgentRowTargetId)
            if isTargeted {
                isTargetingAgentListEnd = false
            }
        }
        .overlay(alignment: .top) {
            if targetedAgentRowTargetId == row.targetId {
                agentInsertIndicator
            }
        }
    }

    private var agentInsertIndicator: some View {
        Rectangle()
            .fill(AppTheme.brand(for: currentAccent, in: theme))
            .frame(height: 2)
            .padding(.horizontal, 8)
    }

    @ViewBuilder
    private func settingsAgentIcon(targetId: String, fallbackText: String) -> some View {
        let shape = RoundedRectangle(cornerRadius: 8)
        let foreground = AppTheme.textPrimary(for: theme)

        ZStack {
            shape
                .fill(Self.controlBackground(for: .pageBackground, theme: theme))

            if let image = AgentIconLibrary.symbolImage(
                for: targetId,
                foreground: NSColor(foreground),
                cropToVisibleBounds: true
            ) {
                Image(nsImage: image)
                    .renderingMode(.original)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFit()
                    .padding(6)
            } else {
                Text(fallbackText)
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(foreground)
            }
        }
        .frame(width: 28, height: 28)
        .clipShape(shape)
        .overlay {
            shape
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func settingsAgentDragPreview(row: SettingsViewModel.AgentDisplayRow) -> some View {
        HStack(spacing: 10) {
            settingsAgentIcon(targetId: row.targetId, fallbackText: row.shortLabel)

            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .lineLimit(1)
                Text(row.mountPath)
                    .font(.system(size: 10, weight: .regular))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .lineLimit(1)
                    .truncationMode(.middle)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Self.controlBackground(for: .pageBackground, theme: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay {
            RoundedRectangle(cornerRadius: 10)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func moveAgentIfNeeded(sourceId: String, destinationIndex: Int) {
        guard let sourceIndex = agentRows.firstIndex(where: { $0.targetId == sourceId }) else {
            return
        }

        let adjustedDestination = sourceIndex < destinationIndex ? destinationIndex + 1 : destinationIndex
        viewModel.moveAgents(
            from: IndexSet(integer: sourceIndex),
            to: min(adjustedDestination, agentRows.count),
            detectedTargetIds: detectedTargetIds
        )
    }

    private func settingsActionButton(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(AppTheme.brand(for: currentAccent, in: theme))
                .frame(width: controlColumnWidth, height: Self.actionControlHeight)
                .background(Self.controlBackground(for: .pageBackground, theme: theme))
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
                }
                .contentShape(RoundedRectangle(cornerRadius: 8))
        }
        .buttonStyle(.plain)
        .desktopMotionButton(kind: .primary, theme: theme, accent: currentAccent, isEnabled: true)
    }

    private func settingsActionLoadingIndicator() -> some View {
        HStack {
            Spacer(minLength: 0)
            ProgressView()
                .controlSize(.small)
            Spacer(minLength: 0)
        }
        .frame(width: controlColumnWidth, height: Self.actionControlHeight)
        .background(Self.controlBackground(for: .pageBackground, theme: theme))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
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
            .background(Self.controlBackground(for: .pageBackground, theme: theme))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
            }
        }
        .buttonStyle(.plain)
        .desktopMotionButton(
            kind: .primary,
            theme: theme,
            accent: currentAccent,
            isEnabled: true,
            isActive: openDropdown == kind
        )
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
                        .desktopMotionButton(
                            kind: .subtle,
                            theme: theme,
                            accent: currentAccent,
                            isEnabled: true,
                            isActive: option.id == selectedId
                        )
                    }
                }
                .padding(6)
                .background(Self.controlBackground(for: .pageBackground, theme: theme))
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

    static func rowZIndex(isElevated: Bool) -> Double {
        isElevated ? 30 : 0
    }

    static let actionControlHeight: CGFloat = 32

    static func controlBackground(for token: ControlSurfaceToken, theme: DesktopThemeMode) -> Color {
        switch token {
        case .pageBackground:
            return AppTheme.pageBackground(for: theme)
        }
    }
}

struct EditCustomAgentSheet: View {
    let title: String
    @Binding var draft: SettingsViewModel.CustomAgentDraft
    let errors: [String: String]
    let theme: DesktopThemeMode
    let globalPathExample: String
    let projectPathExample: String
    let t: (String) -> String
    let onCancel: () -> Void
    let onSave: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))

            customAgentFieldRow(
                label: t("settings.custom_agents.name_label"),
                text: $draft.name,
                prompt: t("settings.custom_agents.name_example")
            )
            validationText(errors["name"])

            customAgentFieldRow(
                label: t("settings.custom_agents.global_path_label"),
                text: $draft.globalPath,
                prompt: globalPathExample
            )
            validationText(errors["globalPath"])

            customAgentFieldRow(
                label: t("settings.custom_agents.project_path_label"),
                text: $draft.projectPathTemplate,
                prompt: projectPathExample
            )
            Text(t("settings.custom_agents.project_path_hint"))
                .font(.system(size: 12))
                .foregroundStyle(AppTheme.textMuted(for: theme))
            validationText(errors["projectPathTemplate"])

            HStack {
                Spacer()
                Button(t("settings.action.cancel")) {
                    onCancel()
                }
                Button(t("settings.action.save")) {
                    onSave()
                }
            }
        }
        .padding(20)
        .frame(minWidth: 560, alignment: .topLeading)
        .background(AppTheme.pageBackground(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay {
            RoundedRectangle(cornerRadius: 12)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    @ViewBuilder
    private func validationText(_ message: String?) -> some View {
        if let message {
            Text(message)
                .font(.system(size: 11))
                .foregroundStyle(.red)
        }
    }

    private func customAgentFieldRow(
        label: String,
        text: Binding<String>,
        prompt: String
    ) -> some View {
        HStack(alignment: .center, spacing: 16) {
            Text(label)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
                .frame(width: 96, alignment: .leading)

            TextField(
                "",
                text: text,
                prompt: Text(prompt).foregroundStyle(AppTheme.textMuted(for: theme))
            )
            .textFieldStyle(.plain)
            .padding(.horizontal, 10)
            .frame(height: SettingsView.actionControlHeight)
            .background(AppTheme.surface(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay {
                RoundedRectangle(cornerRadius: 8)
                    .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
            }
        }
    }
}

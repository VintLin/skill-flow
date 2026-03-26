import SwiftUI

struct MenuBarQuickConfigView: View {
    @Bindable var viewModel: MainViewModel

    let openMainWindow: () -> Void

    @State private var showImportInput: Bool = false
    @FocusState private var isImportFieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            topBar

            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(groupCards) { card in
                        MenuGroupCard(
                            card: card,
                            isSelected: card.id == viewModel.selectedGroupId,
                            onOpen: {
                                Task { await viewModel.selectSource(card.id) }
                            },
                            onToggleSkill: { skillId, enabled in
                                Task { await viewModel.setSkillEnabled(skillId, enabled: enabled, sourceId: card.id) }
                            },
                            onToggleAllSkills: {
                                Task { await viewModel.toggleAllSkills(sourceId: card.id) }
                            },
                            onToggleTarget: { targetId, enabled in
                                Task { await viewModel.setTargetEnabled(targetId, enabled: enabled, sourceId: card.id) }
                            },
                            onToggleAllTargets: {
                                Task { await viewModel.toggleAllTargets(sourceId: card.id) }
                            }
                        )
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 10)
            }
            .frame(minHeight: 300, maxHeight: 360)

            actionBar
        }
        .frame(width: 360)
        .padding(8)
        .background(menuBackground)
        .onDisappear(perform: resetTransientState)
        .onChange(of: showImportInput) { _, isVisible in
            guard isVisible else {
                isImportFieldFocused = false
                return
            }
            DispatchQueue.main.async {
                isImportFieldFocused = true
            }
        }
    }

    private var topBar: some View {
        HStack(spacing: 6) {
            HStack {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.secondary)
                TextField("Search Group / Source", text: $viewModel.searchQuery)
                    .textFieldStyle(.plain)
                    .font(.system(size: 10, weight: .medium))
                    .disableAutocorrection(true)
            }
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(Color.white.opacity(0.66))
            .shadow(color: Color.black.opacity(0.08), radius: 2, x: 0, y: 1)
            .clipShape(RoundedRectangle(cornerRadius: 8))

            Button("×") {
                resetTransientState()
                NSApp.keyWindow?.close()
            }
            .buttonStyle(.plain)
            .font(.system(size: 14, weight: .bold))
            .frame(width: 28, height: 28)
            .background(Color.white.opacity(0.58))
            .shadow(color: Color.black.opacity(0.08), radius: 2, x: 0, y: 1)
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .padding(.bottom, 8)
        .padding(.horizontal, 0)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.black.opacity(0.10))
                .frame(height: 1)
                .offset(y: 8)
        }
    }

    private var actionBar: some View {
        HStack(spacing: 8) {
            HStack(spacing: 6) {
                Button("Import") {
                    withAnimation(.easeOut(duration: 0.16)) {
                        showImportInput.toggle()
                    }
                }
                .buttonStyle(.plain)
                .font(.system(size: 10, weight: .bold))
                .textCase(.uppercase)
                .padding(.horizontal, 8)
                .frame(height: 22)
                .background(showImportInput ? Color.orange.opacity(0.24) : Color.white.opacity(0.66))
                .shadow(color: Color.black.opacity(0.10), radius: 2, x: 0, y: 1)
                .clipShape(RoundedRectangle(cornerRadius: 6))

                if showImportInput {
                    TextField("repo / path", text: $viewModel.newSourceLocator)
                        .focused($isImportFieldFocused)
                        .textFieldStyle(.plain)
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .padding(.horizontal, 7)
                        .frame(width: 170, height: 22)
                        .background(Color.white.opacity(0.70))
                        .shadow(color: Color.black.opacity(0.10), radius: 2, x: 0, y: 1)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                        .onSubmit {
                            Task { await viewModel.addSource() }
                        }
                        .transition(.opacity.combined(with: .move(edge: .trailing)))
                }
            }

            Spacer()

            Button("Details") {
                openMainWindow()
            }
            .buttonStyle(.plain)
            .font(.system(size: 10, weight: .bold))
            .textCase(.uppercase)
            .padding(.horizontal, 8)
            .frame(height: 22)
            .background(Color.white.opacity(0.66))
            .shadow(color: Color.black.opacity(0.10), radius: 2, x: 0, y: 1)
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .padding(.top, 8)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color.black.opacity(0.10))
                .frame(height: 1)
                .offset(y: -8)
        }
    }

    private var menuBackground: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(
                LinearGradient(
                    colors: [
                        Color(red: 241.0 / 255.0, green: 241.0 / 255.0, blue: 241.0 / 255.0),
                        Color(red: 235.0 / 255.0, green: 235.0 / 255.0, blue: 235.0 / 255.0)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.black.opacity(0.08), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.26), radius: 19, x: 0, y: 10)
    }

    private var groupCards: [MainViewModel.GroupCardModel] {
        viewModel.groupCards
    }

    private func resetTransientState() {
        showImportInput = false
        isImportFieldFocused = false
    }
}

private struct MenuGroupCard: View {
    let card: MainViewModel.GroupCardModel
    let isSelected: Bool
    let onOpen: () -> Void
    let onToggleSkill: (String, Bool) -> Void
    let onToggleAllSkills: () -> Void
    let onToggleTarget: (String, Bool) -> Void
    let onToggleAllTargets: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Button(action: onOpen) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(card.title)
                        .font(.system(size: 13, weight: .semibold))
                    Text(card.metaLine)
                        .font(.system(size: 10, weight: .regular, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)

            cardRow(
                title: "Skills",
                selection: card.skillSelection,
                items: card.skills.map { ($0.id, $0.label, $0.isEnabled) },
                onToggleAll: onToggleAllSkills,
                action: onToggleSkill
            )
            cardRow(
                title: "Agents",
                selection: card.targetSelection,
                items: card.targets.prefix(4).map { ($0.id, $0.label, $0.isEnabled) },
                onToggleAll: onToggleAllTargets,
                action: onToggleTarget
            )

            HStack(spacing: 5) {
                tag(card.health, tint: Color.gray.opacity(0.22))
                if card.warningCount > 0 {
                    tag("W\(card.warningCount)", tint: Color.orange.opacity(0.22))
                }
                if card.errorCount > 0 {
                    tag("E\(card.errorCount)", tint: Color.red.opacity(0.18))
                }
            }
        }
        .padding(10)
        .background(Color.white.opacity(0.58))
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .shadow(color: Color.black.opacity(0.12), radius: 11, x: 0, y: 5)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(isSelected ? Color.orange.opacity(0.75) : Color.clear, lineWidth: 1)
        )
    }

    private func cardRow(
        title: String,
        selection: SelectionState,
        items: [(id: String, label: String, isEnabled: Bool)],
        onToggleAll: @escaping () -> Void,
        action: @escaping (String, Bool) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 5) {
                    compactTriStateSwitch(selection, action: onToggleAll)
                    ForEach(items, id: \.id) { item in
                        Button {
                            action(item.id, !item.isEnabled)
                        } label: {
                            tag(item.label, tint: item.isEnabled ? Color.orange.opacity(0.32) : Color.gray.opacity(0.20))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func compactTriStateSwitch(_ selection: SelectionState, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(switchLabel(selection))
                .font(.system(size: 7, weight: .bold))
                .frame(width: 20, height: 19)
                .background(switchFill(selection))
                .foregroundStyle(switchText(selection))
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
    }

    private func switchLabel(_ selection: SelectionState) -> String {
        switch selection {
        case .empty: return "OFF"
        case .partial: return "MIX"
        case .full: return "ON"
        }
    }

    private func switchFill(_ selection: SelectionState) -> Color {
        switch selection {
        case .empty:
            return Color(red: 148.0 / 255.0, green: 163.0 / 255.0, blue: 184.0 / 255.0).opacity(0.30)
        case .partial:
            return Color(red: 234.0 / 255.0, green: 179.0 / 255.0, blue: 8.0 / 255.0).opacity(0.32)
        case .full:
            return Color(red: 34.0 / 255.0, green: 197.0 / 255.0, blue: 94.0 / 255.0).opacity(0.26)
        }
    }

    private func switchText(_ selection: SelectionState) -> Color {
        switch selection {
        case .empty:
            return Color(red: 71.0 / 255.0, green: 85.0 / 255.0, blue: 105.0 / 255.0)
        case .partial:
            return Color(red: 146.0 / 255.0, green: 64.0 / 255.0, blue: 14.0 / 255.0)
        case .full:
            return Color(red: 22.0 / 255.0, green: 101.0 / 255.0, blue: 52.0 / 255.0)
        }
    }

    private func tag(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(.system(size: 8, weight: .bold))
            .padding(.horizontal, 6)
            .frame(height: 19)
            .background(tint)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

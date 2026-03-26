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
                            onToggleTarget: { targetId, enabled in
                                Task { await viewModel.setTargetEnabled(targetId, enabled: enabled, sourceId: card.id) }
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
            .clipShape(RoundedRectangle(cornerRadius: 8))

            Button("×") {
                resetTransientState()
                NSApp.keyWindow?.close()
            }
            .buttonStyle(.plain)
            .font(.system(size: 14, weight: .bold))
            .frame(width: 28, height: 28)
            .background(Color.white.opacity(0.58))
            .clipShape(RoundedRectangle(cornerRadius: 8))
        }
        .padding(.bottom, 8)
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
                .clipShape(RoundedRectangle(cornerRadius: 6))

                if showImportInput {
                    TextField("repo / path", text: $viewModel.newSourceLocator)
                        .focused($isImportFieldFocused)
                        .textFieldStyle(.plain)
                        .font(.system(size: 10, weight: .medium, design: .monospaced))
                        .padding(.horizontal, 7)
                        .frame(width: 170, height: 22)
                        .background(Color.white.opacity(0.70))
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
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .padding(.top, 8)
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
    let onToggleTarget: (String, Bool) -> Void

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

            cardRow(title: "Skills", items: card.skills.map { ($0.id, $0.label, $0.isEnabled) }, action: onToggleSkill)
            cardRow(title: "Agents", items: card.targets.prefix(4).map { ($0.id, $0.label, $0.isEnabled) }, action: onToggleTarget)

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
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(isSelected ? Color.orange.opacity(0.75) : Color.clear, lineWidth: 1)
        )
    }

    private func cardRow(
        title: String,
        items: [(id: String, label: String, isEnabled: Bool)],
        action: @escaping (String, Bool) -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title)
                .font(.system(size: 9, weight: .bold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 5) {
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

    private func tag(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(.system(size: 8, weight: .bold))
            .padding(.horizontal, 6)
            .frame(height: 19)
            .background(tint)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

import SwiftUI

struct MenuBarQuickConfigView: View {
    @Bindable var viewModel: MainViewModel

    let openMainWindow: () -> Void

    @State private var searchQuery: String = ""
    @State private var showImportInput: Bool = false
    @State private var isDetailsActive: Bool = false
    @FocusState private var isImportFieldFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            topBar

            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(filteredGroups, id: \.self) { groupId in
                        MenuGroupCard(
                            groupId: groupId,
                            isSelected: groupId == viewModel.selectedGroupId,
                            healthLabel: viewModel.healthLabel,
                            onSelect: {
                                viewModel.requestGroupSwitch(to: groupId)
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
        .alert("Unsaved changes", isPresented: $viewModel.showGroupSwitchDialog) {
            Button("Apply") {
                Task { await viewModel.resolveGroupSwitch(.apply) }
            }
            Button("Discard", role: .destructive) {
                Task { await viewModel.resolveGroupSwitch(.discard) }
            }
            Button("Cancel", role: .cancel) {
                Task { await viewModel.resolveGroupSwitch(.cancel) }
            }
        } message: {
            Text("Current group has unapplied changes. Choose how to continue.")
        }
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
                TextField("Search Group / Source", text: $searchQuery)
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
                        .transition(.opacity.combined(with: .move(edge: .trailing)))
                }
            }

            Spacer()

            Button("Details") {
                let nextState = !isDetailsActive
                isDetailsActive = nextState
                if nextState {
                    openMainWindow()
                }
            }
            .buttonStyle(.plain)
            .font(.system(size: 10, weight: .bold))
            .textCase(.uppercase)
            .padding(.horizontal, 8)
            .frame(height: 22)
            .background(isDetailsActive ? Color.orange.opacity(0.24) : Color.white.opacity(0.66))
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

    private var filteredGroups: [String] {
        let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !query.isEmpty else { return viewModel.availableGroups }
        return viewModel.availableGroups.filter { id in
            id.lowercased().contains(query)
                || "github.com/vint/\(id)".lowercased().contains(query)
        }
    }

    private func resetTransientState() {
        isDetailsActive = false
        showImportInput = false
        isImportFieldFocused = false
    }
}

private struct MenuGroupCard: View {
    let groupId: String
    let isSelected: Bool
    let healthLabel: String
    let onSelect: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Button(action: onSelect) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(groupId)
                        .font(.system(size: 13, weight: .semibold))
                    Text("github.com/vint/\(groupId)")
                        .font(.system(size: 10, weight: .regular, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)

            HStack(spacing: 5) {
                tag("MIX", tint: Color.orange.opacity(0.32))
                tag("ON", tint: Color.green.opacity(0.25))
                tag(healthLabel.prefix(3).uppercased(), tint: Color.gray.opacity(0.3))
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

    private func tag(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(.system(size: 8, weight: .bold))
            .padding(.horizontal, 6)
            .frame(height: 19)
            .background(tint)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

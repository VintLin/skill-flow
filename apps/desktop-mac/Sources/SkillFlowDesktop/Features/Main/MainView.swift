import SwiftUI

struct MainView: View {
    @Bindable var viewModel: MainViewModel

    var body: some View {
        NavigationSplitView {
            List(selection: $viewModel.selectedSourceId) {
                ForEach(viewModel.sourceIds, id: \.self) { sourceId in
                    Text(sourceId)
                        .tag(sourceId)
                }
            }
            .navigationTitle("Sources")
            .onChange(of: viewModel.selectedSourceId) { _, newValue in
                guard let newValue else { return }
                Task { await viewModel.selectSource(newValue) }
            }
        } detail: {
            VStack(alignment: .leading, spacing: 12) {
                Text("Health: \(viewModel.healthLabel)")
                    .font(.headline)

                HStack(spacing: 8) {
                    TextField("Add source locator", text: $viewModel.newSourceLocator)
                    Button("Add") {
                        Task { await viewModel.addSource() }
                    }
                    .keyboardShortcut(.return, modifiers: [.command])
                    Button("Uninstall Selected") {
                        Task { await viewModel.uninstallSelectedSource() }
                    }
                    .disabled(viewModel.selectedSourceId == nil)
                }

                if !viewModel.latestWarnings.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Warnings")
                            .font(.subheadline)
                            .bold()
                        ForEach(viewModel.latestWarnings) { warning in
                            Text("• \(warning.message)")
                                .font(.caption)
                        }
                    }
                }

                ScrollView {
                    Text(viewModel.detailText)
                        .textSelection(.enabled)
                        .font(.system(.body, design: .monospaced))
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding()
            .toolbar {
                ToolbarItemGroup {
                    Button("Refresh") {
                        Task { await viewModel.refreshList() }
                    }
                    Button("Run Doctor") {
                        Task { await viewModel.runDoctor() }
                    }
                    Button("Update All") {
                        Task { await viewModel.updateAll() }
                    }
                }
            }
        }
        .task {
            if case .idle = viewModel.loadState {
                await viewModel.bootstrap()
                if let first = viewModel.sourceIds.first {
                    await viewModel.selectSource(first)
                }
            }
        }
    }
}

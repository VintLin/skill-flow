import SwiftUI

struct MainView: View {
    @Bindable var viewModel: MainViewModel

    private enum LayoutMode {
        case wide
        case medium
        case compact
    }

    var body: some View {
        GeometryReader { proxy in
            let mode = layoutMode(for: proxy.size.width)

            HStack(spacing: 0) {
                if mode != .compact || viewModel.compactSidebarVisible {
                    sidebar
                        .frame(width: 250)
                    Divider()
                }

                content(mode: mode)

                if showInspector(in: mode) {
                    Divider()
                    inspector
                        .frame(width: 320)
                }
            }
            .sheet(isPresented: compactInspectorBinding(for: mode)) {
                inspector
                    .frame(minWidth: 320, minHeight: 420)
            }
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
            .toolbar {
                ToolbarItemGroup {
                    if mode == .compact {
                        Button(viewModel.compactSidebarVisible ? "Hide Sidebar" : "Show Sidebar") {
                            viewModel.compactSidebarVisible.toggle()
                        }
                    }

                    Button(viewModel.inspectorVisible ? "Hide Inspector" : "Show Inspector") {
                        viewModel.inspectorVisible.toggle()
                    }
                    .keyboardShortcut("i", modifiers: [.command, .control])

                    Button("Refresh") {
                        Task { await viewModel.refreshList() }
                    }

                    Button("Run Doctor") {
                        Task { await viewModel.runDoctor() }
                    }

                    Button("Apply") {
                        Task { _ = await viewModel.applyCurrentGroupDraft() }
                    }
                    .disabled(!viewModel.canApplyCurrentGroupDraft)
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

    private var sidebar: some View {
        VStack(alignment: .leading, spacing: 0) {
            List(selection: $viewModel.selectedSection) {
                Section("Sections") {
                    ForEach(MainViewModel.Section.allCases) { section in
                        Text(section.rawValue)
                            .tag(section)
                    }
                }

                Section("Groups") {
                    ForEach(viewModel.availableGroups, id: \.self) { groupId in
                        Button(groupId) {
                            viewModel.requestGroupSwitch(to: groupId)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func content(mode: LayoutMode) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(viewModel.selectedSection.rawValue)
                .font(.title2)
                .bold()

            switch viewModel.selectedSection {
            case .overview:
                overviewContent
            case .sources:
                sourcesContent
            case .skills, .targets, .deployments, .doctor, .activity, .settings:
                placeholderContent(for: viewModel.selectedSection)
            }

            Spacer(minLength: 0)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private var overviewContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Health: \(viewModel.healthLabel)")
                .font(.headline)

            if !viewModel.latestWarnings.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Attention Needed")
                        .font(.subheadline)
                        .bold()
                    ForEach(viewModel.latestWarnings) { warning in
                        Text("• \(warning.message)")
                            .font(.caption)
                    }
                }
            } else {
                Text("No warnings. Recent operations look healthy.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if viewModel.hasApplyError {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Apply failed (\(viewModel.lastApplyFailureCount))")
                        .font(.subheadline)
                        .bold()
                    Text(viewModel.lastApplyFirstReason)
                        .font(.caption)
                }
                .foregroundStyle(.red)
            }
        }
    }

    private var sourcesContent: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                TextField("Add source locator", text: $viewModel.newSourceLocator)
                Button("Add") {
                    Task { await viewModel.addSource() }
                }
                .keyboardShortcut(.return, modifiers: [.command])

                Button("Uninstall Selected") {
                    Task { await viewModel.uninstallSelectedSource() }
                }
                .disabled(viewModel.selectedGroupId == nil)
            }

            Text("Selected Group: \(viewModel.selectedGroupId ?? "None")")
                .font(.caption)
                .foregroundStyle(.secondary)

            List(viewModel.availableGroups, id: \.self, selection: sourceSelection) { groupId in
                Text(groupId)
            }
            .frame(minHeight: 180)
        }
    }

    private func placeholderContent(for section: MainViewModel.Section) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("\(section.rawValue) will be implemented in v1.2.0 phases.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if section == .deployments {
                Text("Planned: preview summary, blocked reasons, apply scope.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if section == .doctor {
                Text("Planned: issue grouping and fix actions.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var inspector: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Inspector")
                .font(.headline)

            Text("Group: \(viewModel.selectedGroupId ?? "None")")
                .font(.caption)
                .foregroundStyle(.secondary)

            Text("Health: \(viewModel.healthLabel)")
                .font(.caption)

            ScrollView {
                Text(viewModel.detailText)
                    .textSelection(.enabled)
                    .font(.system(.caption, design: .monospaced))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding()
    }

    private var sourceSelection: Binding<String?> {
        Binding(
            get: { viewModel.selectedGroupId },
            set: { next in
                guard let next else { return }
                viewModel.requestGroupSwitch(to: next)
            }
        )
    }

    private func showInspector(in mode: LayoutMode) -> Bool {
        switch mode {
        case .wide:
            return true
        case .medium:
            return viewModel.inspectorVisible
        case .compact:
            return false
        }
    }

    private func compactInspectorBinding(for mode: LayoutMode) -> Binding<Bool> {
        Binding(
            get: { mode == .compact && viewModel.inspectorVisible },
            set: { isPresented in
                if mode == .compact {
                    viewModel.inspectorVisible = isPresented
                }
            }
        )
    }

    private func layoutMode(for width: CGFloat) -> LayoutMode {
        if width >= 1200 {
            return .wide
        }
        if width >= 900 {
            return .medium
        }
        return .compact
    }
}

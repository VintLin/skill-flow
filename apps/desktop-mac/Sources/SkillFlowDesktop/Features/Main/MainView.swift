import SwiftUI

struct MainView: View {
    @Bindable var viewModel: MainViewModel
    @State private var showAddSourceSheet = false

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

                content

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
            .sheet(isPresented: $showAddSourceSheet) {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Add Source")
                        .font(.headline)
                    TextField("Source locator", text: $viewModel.newSourceLocator)
                        .textFieldStyle(.roundedBorder)
                    HStack {
                        Spacer()
                        Button("Cancel") {
                            showAddSourceSheet = false
                        }
                        Button("Add") {
                            Task {
                                await viewModel.addSource()
                                showAddSourceSheet = false
                            }
                        }
                        .disabled(viewModel.newSourceLocator.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
                .padding(16)
                .frame(width: 460)
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
                        .frame(minHeight: 44)
                    }

                    Button(viewModel.inspectorVisible ? "Hide Inspector" : "Show Inspector") {
                        viewModel.inspectorVisible.toggle()
                    }
                    .keyboardShortcut("i", modifiers: [.command, .control])
                    .frame(minHeight: 44)

                    Button("Refresh") {
                        Task { await viewModel.refreshList() }
                    }
                    .keyboardShortcut("r", modifiers: [.command])
                    .frame(minHeight: 44)

                    Button("Run Doctor") {
                        Task { await viewModel.runDoctor() }
                    }
                    .frame(minHeight: 44)

                    Button("Apply") {
                        Task { _ = await viewModel.applyCurrentGroupDraft() }
                    }
                    .disabled(!viewModel.canApplyCurrentGroupDraft)
                    .keyboardShortcut("a", modifiers: [.command, .shift])
                    .frame(minHeight: 44)
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
                    .frame(minHeight: 32, alignment: .leading)
                }
            }
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(viewModel.selectedSection.rawValue)
                    .font(.title2)
                    .bold()
                Spacer()
                TextField("Search", text: $viewModel.searchQuery)
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 240)
                    .accessibilityLabel("Global Search")
            }

            switch viewModel.selectedSection {
            case .overview:
                overviewPage
            case .sources:
                sourcesPage
            case .deployments:
                deploymentsPage
            case .doctor:
                doctorPage
            case .skills, .targets, .activity, .settings:
                placeholderPage
            }

            Spacer(minLength: 0)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private var overviewPage: some View {
        switch viewModel.overviewState {
        case .loading:
            ProgressView("Loading overview...")
        case .empty:
            EmptyStateView(
                title: "No sources yet",
                description: "Add your first source to build an overview.",
                actionTitle: "Go to Sources",
                action: { viewModel.selectedSection = .sources }
            )
        case .error(let message):
            ErrorStateView(
                whatHappened: message,
                nextActionTitle: "Retry",
                onNextAction: { Task { await viewModel.refreshList() } },
                detailActionTitle: "View Details",
                onDetailAction: { viewModel.inspectorVisible = true }
            )
        case .partial, .success:
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    StatusCard(title: "Health", value: viewModel.healthLabel)
                    StatusCard(title: "Attention", value: "\(viewModel.latestWarnings.count)")
                    StatusCard(title: "Last Apply", value: viewModel.lastApplySummary)
                }

                if !viewModel.latestWarnings.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Attention Needed")
                            .font(.headline)
                        ForEach(viewModel.latestWarnings.prefix(2)) { warning in
                            Text("• \(warning.message)")
                                .font(.caption)
                        }
                    }
                }

                if viewModel.hasApplyError {
                    ErrorStateView(
                        whatHappened: viewModel.lastApplyFirstReason,
                        nextActionTitle: "Apply Now",
                        onNextAction: { Task { _ = await viewModel.applyCurrentGroupDraft() } },
                        detailActionTitle: "Open Doctor",
                        onDetailAction: { Task { await viewModel.runDoctor() } }
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var sourcesPage: some View {
        switch viewModel.sourcesState {
        case .loading:
            ProgressView("Loading sources...")
        case .empty:
            EmptyStateView(
                title: "No source installed",
                description: "Add a source to start managing skills.",
                actionTitle: "+ Add Source",
                action: { Task { await viewModel.addSource() } }
            )
        case .error(let message):
            ErrorStateView(
                whatHappened: message,
                nextActionTitle: "Retry",
                onNextAction: { Task { await viewModel.refreshList() } },
                detailActionTitle: "View Details",
                onDetailAction: { viewModel.inspectorVisible = true }
            )
        case .partial, .success:
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Button("Add Source") {
                        showAddSourceSheet = true
                    }
                    .frame(minHeight: 44)

                    Button("Uninstall Selected") {
                        Task { await viewModel.uninstallSelectedSource() }
                    }
                    .disabled(viewModel.selectedGroupId == nil)
                    .frame(minHeight: 44)
                }

                Text("Selected Group: \(viewModel.selectedGroupId ?? "None")")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                List(viewModel.sourceRows) { row in
                    HStack {
                        Text(row.id)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(row.kind)
                            .frame(width: 80, alignment: .leading)
                        Text("\(row.skillCount)")
                            .frame(width: 56, alignment: .trailing)
                        Text(row.status)
                            .frame(width: 120, alignment: .leading)
                        Text("W\(row.warningCount)/E\(row.errorCount)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text(row.lastUpdate)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .contentShape(Rectangle())
                    .onTapGesture {
                        viewModel.requestGroupSwitch(to: row.id)
                    }
                }
                .frame(minHeight: 240)
            }
        }
    }

    @ViewBuilder
    private var deploymentsPage: some View {
        switch viewModel.deploymentsState {
        case .loading:
            ProgressView("Loading deployments...")
        case .empty:
            EmptyStateView(
                title: "No deployment actions",
                description: "No changes are pending for current filters.",
                actionTitle: "Apply Now",
                action: { Task { _ = await viewModel.applyCurrentGroupDraft() } }
            )
        case .error(let message):
            ErrorStateView(
                whatHappened: message,
                nextActionTitle: "Retry",
                onNextAction: { Task { await viewModel.refreshList() } },
                detailActionTitle: "Open Doctor",
                onDetailAction: { Task { await viewModel.runDoctor() } }
            )
        case .partial, .success:
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    StatusCard(title: "Create", value: "\(viewModel.deploymentSummary.create)")
                    StatusCard(title: "Update", value: "\(viewModel.deploymentSummary.update)")
                    StatusCard(title: "Remove", value: "\(viewModel.deploymentSummary.remove)")
                    StatusCard(title: "Blocked", value: "\(viewModel.deploymentSummary.blocked)")
                }

                HStack(spacing: 8) {
                    Picker("Target", selection: $viewModel.deploymentFilterTarget) {
                        ForEach(viewModel.deploymentTargets, id: \.self) { target in
                            Text(target).tag(target)
                        }
                    }
                    .frame(width: 220)

                    Picker("Action", selection: $viewModel.deploymentFilterKind) {
                        ForEach(viewModel.deploymentKinds, id: \.self) { kind in
                            Text(kind).tag(kind)
                        }
                    }
                    .frame(width: 160)

                    Spacer()

                    Button("Apply Now") {
                        Task { _ = await viewModel.applyCurrentGroupDraft() }
                    }
                    .disabled(!viewModel.canApplyCurrentGroupDraft)
                    .frame(minHeight: 44)
                }

                List(viewModel.filteredDeploymentRows) { row in
                    HStack {
                        Text(row.kind)
                            .frame(width: 80, alignment: .leading)
                        Text(row.skill)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        Text(row.target)
                            .frame(width: 140, alignment: .leading)
                        Text(row.result)
                            .frame(width: 120, alignment: .leading)
                    }
                    .font(.caption)
                }
                .frame(minHeight: 240)
            }
        }
    }

    @ViewBuilder
    private var doctorPage: some View {
        switch viewModel.doctorState {
        case .loading:
            ProgressView("Running doctor...")
        case .empty:
            EmptyStateView(
                title: "No doctor issues",
                description: "Current workspace is healthy.",
                actionTitle: "Run Doctor",
                action: { Task { await viewModel.runDoctor() } }
            )
        case .error(let message):
            ErrorStateView(
                whatHappened: message,
                nextActionTitle: "Repair Now",
                onNextAction: { Task { await viewModel.runDoctor() } },
                detailActionTitle: "View Details",
                onDetailAction: { viewModel.inspectorVisible = true }
            )
        case .partial, .success:
            VStack(alignment: .leading, spacing: 10) {
                ForEach(viewModel.groupedDoctorIssues, id: \.0) { severity, issues in
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(severity.uppercased()) (\(issues.count))")
                            .font(.headline)
                        ForEach(issues) { issue in
                            VStack(alignment: .leading, spacing: 2) {
                                Text("[\(issue.code)] \(issue.message)")
                                    .font(.caption)
                                Text("source: \(issue.sourceId)   target: \(issue.target)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }

                Button("Repair Now") {
                    Task { await viewModel.runDoctor() }
                }
                .frame(minHeight: 44)
            }
        }
    }

    private var placeholderPage: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("This section is intentionally deferred in v1.2.0.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var inspector: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Inspector")
                .font(.headline)

            Text("Group: \(viewModel.selectedGroupId ?? "None")")
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Current Group \(viewModel.selectedGroupId ?? "None")")

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

private struct StatusCard: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline)
                .bold()
                .lineLimit(2)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.windowBackgroundColor))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(.separatorColor), lineWidth: 1)
        )
    }
}

private struct EmptyStateView: View {
    let title: String
    let description: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.headline)
            Text(description)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button(actionTitle, action: action)
                .frame(minHeight: 44)
        }
        .padding(12)
    }
}

private struct ErrorStateView: View {
    let whatHappened: String
    let nextActionTitle: String
    let onNextAction: () -> Void
    let detailActionTitle: String
    let onDetailAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("What happened")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(whatHappened)
                .font(.subheadline)

            HStack(spacing: 8) {
                Button(nextActionTitle, action: onNextAction)
                    .frame(minHeight: 44)
                Button(detailActionTitle, action: onDetailAction)
                    .frame(minHeight: 44)
            }
        }
        .padding(12)
        .background(Color.red.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.red.opacity(0.3), lineWidth: 1)
        )
        .cornerRadius(8)
    }
}

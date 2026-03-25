import SwiftUI

struct MenuBarQuickConfigView: View {
    @Bindable var viewModel: MainViewModel

    let openMainWindow: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Skill Flow")
                    .font(.headline)
                Spacer()
                Text(viewModel.healthLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if viewModel.availableGroups.isEmpty {
                Text("No groups available")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Picker("Group", selection: groupSelection) {
                    ForEach(viewModel.availableGroups, id: \.self) { groupId in
                        Text(groupId).tag(groupId)
                    }
                }
                .pickerStyle(.menu)
            }

            Toggle("Show All Targets", isOn: $viewModel.showAllTargets)

            VStack(alignment: .leading, spacing: 6) {
                ForEach(viewModel.visibleTargets) { target in
                    Toggle(target.label, isOn: Binding(
                        get: { viewModel.isTargetEnabled(target.id) },
                        set: { isOn in
                            viewModel.setTargetEnabled(target.id, enabled: isOn)
                        }
                    ))
                }

                if viewModel.visibleTargets.isEmpty {
                    Text("No detected targets")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            if viewModel.hasPendingDraftForCurrentGroup {
                Text("Pending changes")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }

            if viewModel.hasApplyError {
                VStack(alignment: .leading, spacing: 4) {
                    Text("What happened")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("Apply failed (\(viewModel.lastApplyFailureCount))")
                        .font(.caption)
                        .bold()
                    Text(viewModel.lastApplyFirstReason)
                        .font(.caption2)
                        .lineLimit(2)
                }
                .foregroundStyle(.red)
            }

            HStack(spacing: 8) {
                Button("Apply Now") {
                    Task {
                        _ = await viewModel.applyCurrentGroupDraft()
                    }
                }
                .disabled(!viewModel.canApplyCurrentGroupDraft)
                .frame(minHeight: 44)

                Button("Open Doctor") {
                    Task {
                        await viewModel.runDoctor()
                    }
                }
                .frame(minHeight: 44)
            }

            Button("Open Main Window", action: openMainWindow)
                .frame(minHeight: 44)
        }
        .frame(width: 320)
        .padding(12)
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
    }

    private var groupSelection: Binding<String> {
        Binding(
            get: { viewModel.selectedGroupId ?? "" },
            set: { next in
                viewModel.requestGroupSwitch(to: next)
            }
        )
    }
}

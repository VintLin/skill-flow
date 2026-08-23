import SwiftUI

struct UsageScreen: View {
    @Bindable var viewModel: MainViewModel
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                content
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 24)
            .frame(maxWidth: 1180, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(AppTheme.pageBackground(for: theme))
        .task {
            await viewModel.loadUsageSnapshot()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Skill Usage")
                .font(.system(size: 26, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
            Text("Observed local skill activations by agent, project, and time range.")
                .font(.system(size: 13))
                .foregroundStyle(AppTheme.textMuted(for: theme))
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.usageLoadState {
        case .idle, .loading:
            loadingCard
        case .failed(let message):
            messageCard(title: "Unable to load usage", detail: message)
        case .ready:
            if let snapshot = viewModel.usageSnapshot {
                snapshotContent(snapshot)
            } else {
                messageCard(title: "No usage snapshot", detail: "Run refresh to scan local agent records.")
            }
        }
    }

    private func snapshotContent(_ snapshot: UsageSnapshotViewData) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack(spacing: 12) {
                metricCard(title: "Observed uses", value: "\(snapshot.kpis.observedUses)")
                metricCard(title: "Active skills", value: "\(snapshot.kpis.activeSkills)")
                metricCard(title: "Agents", value: "\(snapshot.kpis.activeAgents)")
                metricCard(title: "Projects", value: "\(snapshot.kpis.activeProjects)")
            }

            HStack(alignment: .top, spacing: 18) {
                sectionCard(title: "Top skills", subtitle: snapshot.rangeLabel) {
                    VStack(spacing: 0) {
                        if snapshot.topSkills.isEmpty {
                            emptyRow("No observed skill usage in this range.")
                        } else {
                            ForEach(snapshot.topSkills.prefix(12)) { item in
                                usageSkillRow(item)
                            }
                        }
                    }
                }

                sectionCard(title: "Agent coverage", subtitle: "Last local scan") {
                    VStack(spacing: 0) {
                        if snapshot.agentCoverage.isEmpty {
                            emptyRow("No agent sources have been scanned yet.")
                        } else {
                            ForEach(snapshot.agentCoverage) { item in
                                coverageRow(item)
                            }
                        }
                    }
                }
            }

            sectionCard(title: "Recent observations", subtitle: snapshot.generatedAt) {
                VStack(spacing: 0) {
                    if snapshot.recentObservations.isEmpty {
                        emptyRow("No recent observed activations.")
                    } else {
                        ForEach(snapshot.recentObservations.prefix(20)) { item in
                            recentObservationRow(item)
                        }
                    }
                }
            }
        }
    }

    private var loadingCard: some View {
        sectionCard(title: "Loading usage", subtitle: nil) {
            HStack(spacing: 10) {
                ProgressView()
                    .controlSize(.small)
                Text("Reading local usage snapshot…")
                    .font(.system(size: 13))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }
            .padding(.vertical, 8)
        }
    }

    private func messageCard(title: String, detail: String) -> some View {
        sectionCard(title: title, subtitle: nil) {
            Text(detail)
                .font(.system(size: 13))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .padding(.vertical, 8)
        }
    }

    private func metricCard(title: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(AppTheme.textMuted(for: theme))
            Text(value)
                .font(.system(size: 28, weight: .semibold, design: .rounded))
                .foregroundStyle(AppTheme.brand(for: accent, in: theme))
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func sectionCard<Content: View>(
        title: String,
        subtitle: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.system(size: 12))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                }
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
        }
    }

    private func usageSkillRow(_ item: UsageTopSkillViewData) -> some View {
        row {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.skillLabel)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Text("\(item.activeAgentCount) agents · \(item.activeProjectCount) projects")
                    .font(.system(size: 12))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }
            Spacer()
            Text("\(item.observedUses)")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(AppTheme.brand(for: accent, in: theme))
        }
    }

    private func coverageRow(_ item: UsageAgentCoverageViewData) -> some View {
        row {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.agent)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Text(item.status)
                    .font(.system(size: 12))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }
            Spacer()
            Text("\(item.observedUses)")
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(AppTheme.brand(for: accent, in: theme))
        }
    }

    private func recentObservationRow(_ item: UsageRecentObservationViewData) -> some View {
        row {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.skillLabel)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Text("\(item.agent) · \(item.projectLabel) · \(item.evidenceKind)")
                    .font(.system(size: 12))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }
            Spacer()
            Text(item.observedAt)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(AppTheme.textMuted(for: theme))
        }
    }

    private func emptyRow(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 13))
            .foregroundStyle(AppTheme.textMuted(for: theme))
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func row<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        HStack(alignment: .center, spacing: 12) {
            content()
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(AppTheme.cardBorder(for: theme))
                .frame(height: 0.5)
        }
    }
}

import SwiftUI

struct UsageScreen: View {
    @Environment(\.locale) private var locale
    @Bindable var viewModel: MainViewModel
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor

    @State private var selectedRange: UsageRangePresetViewData = .thirtyDays
    @State private var selectedActivityPeriod: UsageCalendarPeriod = .current
    @State private var selection: UsageChartSelectionViewData = .all
    @State private var showingCustomRange = false
    @State private var customFrom = Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date()
    @State private var customTo = Date()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                content
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 24)
            .frame(maxWidth: 1180, alignment: .topLeading)
            .frame(maxWidth: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(AppTheme.pageBackground(for: theme))
        .task {
            async let trend: Void = viewModel.loadUsageSnapshot(rangePreset: selectedRange.rawValue)
            async let activity: Void = viewModel.loadUsageActivitySnapshot()
            _ = await (trend, activity)
        }
        .onChange(of: selectedRange) { _, newValue in
            guard newValue != .custom else { return }
            selection = .all
            Task { await viewModel.loadUsageSnapshot(force: true, rangePreset: newValue.rawValue) }
        }
    }

    private var rangePicker: some View {
        HStack(spacing: 0) {
            ForEach(UsageRangePresetViewData.allCases) { range in
                Button {
                    if range == .custom { showingCustomRange = true } else { selectedRange = range }
                } label: {
                    Text(t(range.localizationKey))
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(range == selectedRange ? AppTheme.textPrimary(for: theme) : AppTheme.textMuted(for: theme))
                        .padding(.horizontal, 11)
                        .padding(.vertical, 7)
                        .background {
                            if range == selectedRange {
                                RoundedRectangle(cornerRadius: 7)
                                    .fill(AppTheme.surface(for: theme))
                                    .overlay { RoundedRectangle(cornerRadius: 7).stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5) }
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(AppTheme.surface(for: theme).opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 9))
        .overlay { RoundedRectangle(cornerRadius: 9).stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5) }
        .popover(isPresented: $showingCustomRange, arrowEdge: .bottom) {
            VStack(alignment: .leading, spacing: 12) {
                Text(t("usage.range.custom_title")).font(.system(size: 14, weight: .semibold))
                DatePicker(t("usage.range.start"), selection: $customFrom, displayedComponents: .date)
                DatePicker(t("usage.range.end"), selection: $customTo, displayedComponents: .date)
                if !isCustomRangeValid {
                    Text(t("usage.range.validation.order"))
                        .font(.system(size: 11))
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
                HStack {
                    Spacer()
                    Button(t("usage.range.apply")) {
                        guard customFrom <= customTo else { return }
                        selectedRange = .custom
                        showingCustomRange = false
                        selection = .all
                        Task {
                            await viewModel.loadUsageSnapshot(
                                force: true,
                                rangePreset: "custom",
                                from: customDateString(customFrom),
                                to: customDateString(customTo)
                            )
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!isCustomRangeValid)
                }
            }
            .padding(16)
            .frame(width: 250)
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.usageLoadState {
        case .idle, .loading:
            sectionCard(title: t("usage.state.loading.title")) {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text(t("usage.state.loading.body"))
                        .font(.system(size: 13))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                }
                .padding(.vertical, 12)
            }
        case .failed(let message):
            sectionCard(title: t("usage.state.failed.title")) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(message)
                    Text(t("usage.state.failed.recovery"))
                }
                .font(.system(size: 13))
                .foregroundStyle(AppTheme.textMuted(for: theme))
                .padding(.vertical, 12)
            }
        case .ready:
            if let snapshot = viewModel.usageSnapshot { dashboard(snapshot) }
            else {
                sectionCard(title: t("usage.state.empty.title")) {
                    Text(t("usage.state.empty.body"))
                        .font(.system(size: 13))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .padding(.vertical, 12)
                }
            }
        }
    }

    private func dashboard(_ snapshot: UsageSnapshotViewData) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            let chart = snapshot.chartData(for: selection)
            activityHeatmap(viewModel.usageActivitySnapshot ?? snapshot)
            sectionCard(title: nil) {
                dailyTrendHeader
                UsageAreaChart(data: chart, theme: theme, locale: locale)
                    .frame(height: 340)
            }
            statistics(snapshot)
        }
    }

    private var dailyTrendHeader: some View {
        HStack(alignment: .center, spacing: 12) {
            Label(t("usage.chart.daily_trend"), systemImage: "waveform.path.ecg")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
            Spacer(minLength: 16)
            rangePicker
        }
    }

    private func activityHeatmap(_ snapshot: UsageSnapshotViewData) -> some View {
        let calendar = usageCalendar
        let range = selectedActivityPeriod.dateRange(calendar: calendar, now: Date())
        let dailyUses = Dictionary(uniqueKeysWithValues: snapshot.dailySeries.map { ($0.date, $0.observedUses) })
        let grid = UsageCalendarGrid(start: range.start, end: range.end, dailyUses: dailyUses, calendar: calendar)
        return sectionCard(title: nil) {
            HStack(alignment: .center, spacing: 12) {
                Label(t("usage.chart.hourly_activity"), systemImage: "calendar")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Spacer(minLength: 16)
                activityPeriodPicker(snapshot)
            }
            UsageCalendarHeatmap(
                grid: grid,
                theme: theme,
                accent: accent,
                locale: locale,
                callCountText: { t("usage.calendar.tooltip", $0) }
            )
            HStack(spacing: 5) {
                Spacer()
                Text(t("usage.heatmap.less"))
                ForEach(0..<7, id: \.self) { level in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(heatmapLegendColor(level))
                        .frame(width: 14, height: 14)
                }
                Text(t("usage.heatmap.more"))
            }
            .font(.system(size: 10))
            .foregroundStyle(AppTheme.textMuted(for: theme))
        }
    }

    private func activityPeriodPicker(_ snapshot: UsageSnapshotViewData) -> some View {
        HStack(spacing: 0) {
            ForEach(activityPeriods(snapshot)) { period in
                Button {
                    selectedActivityPeriod = period
                } label: {
                    Text(period == .current ? t("usage.activity.current") : period.title)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(period == selectedActivityPeriod ? AppTheme.textPrimary(for: theme) : AppTheme.textMuted(for: theme))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                        .background {
                            if period == selectedActivityPeriod {
                                RoundedRectangle(cornerRadius: 7)
                                    .fill(AppTheme.surface(for: theme))
                                    .overlay { RoundedRectangle(cornerRadius: 7).stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5) }
                            }
                        }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(2)
        .background(AppTheme.pageBackground(for: theme).opacity(0.72))
        .clipShape(RoundedRectangle(cornerRadius: 9))
    }

    private func activityPeriods(_ snapshot: UsageSnapshotViewData) -> [UsageCalendarPeriod] {
        let currentYear = usageCalendar.component(.year, from: Date())
        let baselineYears = [currentYear, currentYear - 1]
        let years = Set(baselineYears + snapshot.dailySeries.compactMap { Int($0.date.prefix(4)) }).sorted(by: >)
        return [.current] + years.map(UsageCalendarPeriod.year)
    }

    private var usageCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = locale
        calendar.firstWeekday = 1
        return calendar
    }

    private var isCustomRangeValid: Bool {
        customFrom <= customTo
    }

    private func statistics(_ snapshot: UsageSnapshotViewData) -> some View {
        HStack(alignment: .top, spacing: 0) {
            kpiColumn(snapshot).frame(maxWidth: .infinity, alignment: .topLeading)
            Divider()
            skillColumn(snapshot).frame(maxWidth: .infinity, alignment: .topLeading)
            Divider()
            agentColumn(snapshot).frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .padding(18)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5) }
    }

    private func kpiColumn(_ snapshot: UsageSnapshotViewData) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(t("usage.insights.title")).font(.system(size: 15, weight: .semibold)).foregroundStyle(AppTheme.textPrimary(for: theme))
            kpiRow(t("usage.kpi.total_skills"), value: snapshot.kpis.totalSkills)
            kpiRow(t("usage.kpi.used_skills"), value: snapshot.kpis.usedSkills)
            kpiRow(t("usage.kpi.skill_runs"), value: snapshot.kpis.skillRuns)
        }
        .padding(.trailing, 18)
    }

    private func skillColumn(_ snapshot: UsageSnapshotViewData) -> some View {
        let selectedAgent: String? = { if case .agent(let agent) = selection { return agent }; return nil }()
        let rows = snapshot.skillRows(for: selectedAgent)
        return VStack(alignment: .leading, spacing: 8) {
            Text(t("usage.skills.title")).font(.system(size: 15, weight: .semibold)).foregroundStyle(AppTheme.textPrimary(for: theme))
            Text(t("usage.skills.subtitle")).font(.system(size: 11)).foregroundStyle(AppTheme.textMuted(for: theme))
            if rows.isEmpty { emptyRow(t("usage.skills.empty")) }
            else {
                ForEach(rows.prefix(20)) { item in
                    Button {
                        if case .skill(let current) = selection, current == item.id { selection = .all }
                        else { selection = .skill(item.id) }
                    } label: {
                        rankingRow(
                            label: item.skillLabel,
                            value: item.observedUses,
                            indicatorColor: UsageDailyTrendSeriesStyle.fallbackPalette[colorIndex(for: item.id) % UsageDailyTrendSeriesStyle.fallbackPalette.count],
                            selected: selection == .skill(item.id)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 18)
    }

    private func agentColumn(_ snapshot: UsageSnapshotViewData) -> some View {
        let selectedSkill: String? = { if case .skill(let skill) = selection { return skill }; return nil }()
        let rows = snapshot.agentRows(for: selectedSkill)
        return VStack(alignment: .leading, spacing: 8) {
            Text(t("usage.agents.title")).font(.system(size: 15, weight: .semibold)).foregroundStyle(AppTheme.textPrimary(for: theme))
            Text(t("usage.agents.subtitle")).font(.system(size: 11)).foregroundStyle(AppTheme.textMuted(for: theme))
            if rows.isEmpty { emptyRow(t("usage.agents.empty")) }
            else {
                ForEach(rows.prefix(20)) { item in
                    Button {
                        if case .agent(let current) = selection, current == item.id { selection = .all }
                        else { selection = .agent(item.id) }
                    } label: {
                        rankingRow(
                            label: item.agent,
                            value: item.observedUses,
                            indicatorColor: UsageRankingRowStyle.agentIndicatorColor(
                                targetId: item.id,
                                theme: theme
                            ),
                            selected: selection == .agent(item.id)
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.leading, 18)
    }

    private func kpiRow(_ title: String, value: Int) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.system(size: 12)).foregroundStyle(AppTheme.textMuted(for: theme))
            Spacer()
            Text("\(value)").font(.system(size: 22, weight: .semibold, design: .rounded)).foregroundStyle(AppTheme.textPrimary(for: theme))
        }
    }

    private func rankingRow(label: String, value: Int, indicatorColor: Color, selected: Bool) -> some View {
        HStack(spacing: 8) {
            Circle().fill(indicatorColor).frame(width: 8, height: 8)
            Text(label).font(.system(size: 12)).foregroundStyle(AppTheme.textPrimary(for: theme)).lineLimit(1)
            Spacer(minLength: 6)
            Text(t("usage.run_count", value)).font(.system(size: 11, design: .rounded)).foregroundStyle(AppTheme.textMuted(for: theme))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .background(UsageRankingRowStyle.backgroundColor(selected: selected, accent: accent, theme: theme))
        .clipShape(RoundedRectangle(cornerRadius: 7))
    }

    private func colorIndex(for id: String) -> Int { usageColorIndex(for: id) }

    private func heatmapColor(_ value: Int, maximum: Int) -> Color {
        guard value > 0, maximum > 0 else { return AppTheme.pageBackground(for: theme).opacity(0.52) }
        return AppTheme.brand(for: accent, in: theme).opacity(0.18 + (0.72 * Double(value) / Double(maximum)))
    }

    private func heatmapLegendColor(_ level: Int) -> Color {
        guard level > 0 else { return AppTheme.pageBackground(for: theme).opacity(0.52) }
        return AppTheme.brand(for: accent, in: theme).opacity(0.18 + 0.12 * Double(level))
    }

    private func sectionCard<Content: View>(title: String?, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title { Text(title).font(.system(size: 15, weight: .semibold)).foregroundStyle(AppTheme.textPrimary(for: theme)) }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(AppTheme.surface(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay { RoundedRectangle(cornerRadius: 16).stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5) }
    }

    private func emptyRow(_ text: String) -> some View {
        Text(text).font(.system(size: 12)).foregroundStyle(AppTheme.textMuted(for: theme)).padding(.vertical, 8)
    }

    private func customDateString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private func t(_ key: String, _ arguments: CVarArg...) -> String {
        L10n.string(key, locale: locale, arguments: arguments)
    }
}

enum UsageRankingRowStyle {
    static func agentIndicatorColor(targetId: String, theme: DesktopThemeMode) -> Color {
        AgentIdentityColorCatalog.color(for: targetId, theme: theme)
            ?? AppTheme.textMuted(for: theme)
    }

    static func backgroundColor(
        selected: Bool,
        accent: DesktopAccentColor,
        theme: DesktopThemeMode
    ) -> Color {
        guard selected else { return .clear }
        return AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.26 : 0.18)
    }
}

enum UsageDailyTrendSeriesStyle {
    static let fallbackPalette: [Color] = [.blue, .orange, .green, .purple, .pink, .teal, .indigo, .brown]

    static func color(
        agentTargetId: String?,
        fallbackColorIndex: Int,
        theme: DesktopThemeMode
    ) -> Color {
        if let agentTargetId,
           let identityColor = AgentIdentityColorCatalog.color(for: agentTargetId, theme: theme) {
            return identityColor
        }
        return fallbackPalette[fallbackColorIndex % fallbackPalette.count]
    }
}

enum UsageCalendarPeriod: Hashable, Identifiable {
    case current
    case year(Int)

    var id: String {
        switch self {
        case .current: return "current"
        case .year(let year): return String(year)
        }
    }

    var title: String {
        switch self {
        case .current: return ""
        case .year(let year): return String(year)
        }
    }

    func dateRange(calendar: Calendar, now: Date) -> (start: Date, end: Date) {
        switch self {
        case .current:
            let end = calendar.startOfDay(for: now)
            return (calendar.date(byAdding: .day, value: -364, to: end) ?? end, end)
        case .year(let year):
            let start = calendar.date(from: DateComponents(year: year, month: 1, day: 1)) ?? now
            let nextYear = calendar.date(byAdding: .year, value: 1, to: start) ?? start
            return (start, calendar.date(byAdding: .day, value: -1, to: nextYear) ?? start)
        }
    }
}

struct UsageCalendarCell: Equatable {
    let date: Date?
    let dateKey: String?
    let weekday: Int
    let week: Int
    let observedUses: Int
}

struct UsageCalendarMonthLabel: Identifiable, Equatable {
    var id: String { "\(year)-\(month)-\(week)" }
    let year: Int
    let month: Int
    let week: Int
}

struct UsageCalendarGrid: Equatable {
    let cells: [UsageCalendarCell]
    let monthLabels: [UsageCalendarMonthLabel]
    let weekCount: Int
    let maximum: Int

    init(start: Date, end: Date, dailyUses: [String: Int], calendar: Calendar) {
        let normalizedStart = calendar.startOfDay(for: start)
        let normalizedEnd = calendar.startOfDay(for: end)
        let startWeekday = calendar.component(.weekday, from: normalizedStart)
        let leadingDays = (startWeekday - calendar.firstWeekday + 7) % 7
        let gridStart = calendar.date(byAdding: .day, value: -leadingDays, to: normalizedStart) ?? normalizedStart
        let endWeekday = calendar.component(.weekday, from: normalizedEnd)
        let trailingDays = (calendar.firstWeekday + 6 - endWeekday + 7) % 7
        let gridEnd = calendar.date(byAdding: .day, value: trailingDays, to: normalizedEnd) ?? normalizedEnd
        let totalDays = max(7, (calendar.dateComponents([.day], from: gridStart, to: gridEnd).day ?? 0) + 1)
        weekCount = Int(ceil(Double(totalDays) / 7.0))

        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"

        cells = (0..<(weekCount * 7)).map { index in
            let date = calendar.date(byAdding: .day, value: index, to: gridStart)
            let isInRange = date.map { $0 >= normalizedStart && $0 <= normalizedEnd } ?? false
            let dateKey = isInRange ? date.map(formatter.string(from:)) : nil
            return UsageCalendarCell(
                date: isInRange ? date : nil,
                dateKey: dateKey,
                weekday: index % 7,
                week: index / 7,
                observedUses: dateKey.flatMap { dailyUses[$0] } ?? 0
            )
        }
        maximum = cells.map(\.observedUses).max() ?? 0

        var labels: [UsageCalendarMonthLabel] = []
        let firstMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: normalizedStart)) ?? normalizedStart
        var monthStart = firstMonth < normalizedStart
            ? (calendar.date(byAdding: .month, value: 1, to: firstMonth) ?? normalizedStart)
            : firstMonth
        while monthStart <= normalizedEnd {
            let offset = calendar.dateComponents([.day], from: gridStart, to: monthStart).day ?? 0
            let components = calendar.dateComponents([.year, .month], from: monthStart)
            labels.append(UsageCalendarMonthLabel(
                year: components.year ?? 0,
                month: components.month ?? 1,
                week: max(0, offset / 7)
            ))
            monthStart = calendar.date(byAdding: .month, value: 1, to: monthStart) ?? normalizedEnd.addingTimeInterval(1)
        }
        monthLabels = labels
    }
}

private struct UsageCalendarHeatmap: View {
    let grid: UsageCalendarGrid
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let locale: Locale
    let callCountText: (Int) -> String

    @State private var hoveredCell: UsageCalendarCell?

    private let spacing: CGFloat = 3
    private let weekdayWidth: CGFloat = 30

    var body: some View {
        GeometryReader { proxy in
            let gridWidth = max(1, proxy.size.width - weekdayWidth - 8)
            let cellSize = min(16, max(10, (gridWidth - spacing * CGFloat(grid.weekCount - 1)) / CGFloat(grid.weekCount)))
            let stride = cellSize + spacing
            VStack(alignment: .leading, spacing: 6) {
                monthLabels(cellStride: stride)
                    .padding(.leading, weekdayWidth + 8)
                HStack(alignment: .top, spacing: 8) {
                    weekdayLabels(cellSize: cellSize)
                    calendarCanvas(cellSize: cellSize, cellStride: stride, availableWidth: gridWidth)
                }
            }
        }
        .frame(height: 22 + (16 * 7) + (spacing * 6))
    }

    private func monthLabels(cellStride: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(grid.monthLabels) { label in
                Text(monthName(label.month))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .offset(x: CGFloat(label.week) * cellStride)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 14, alignment: .topLeading)
        .clipped()
    }

    private func weekdayLabels(cellSize: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: spacing) {
            ForEach(0..<7, id: \.self) { row in
                Text(row.isMultiple(of: 2) ? "" : weekdayName(row))
                    .font(.system(size: 10))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .frame(width: weekdayWidth, height: cellSize, alignment: .leading)
            }
        }
    }

    private func calendarCanvas(cellSize: CGFloat, cellStride: CGFloat, availableWidth: CGFloat) -> some View {
        Canvas { context, _ in
            for cell in grid.cells {
                let rect = CGRect(
                    x: CGFloat(cell.week) * cellStride,
                    y: CGFloat(cell.weekday) * cellStride,
                    width: cellSize,
                    height: cellSize
                )
                context.fill(
                    Path(roundedRect: rect, cornerRadius: 3),
                    with: .color(color(for: cell))
                )
            }
        }
        .frame(width: min(availableWidth, CGFloat(grid.weekCount) * cellStride - spacing), height: cellSize * 7 + spacing * 6, alignment: .topLeading)
        .contentShape(Rectangle())
        .onContinuousHover { phase in
            switch phase {
            case .active(let location):
                let week = Int(location.x / cellStride)
                let weekday = Int(location.y / cellStride)
                hoveredCell = grid.cells.first { $0.week == week && $0.weekday == weekday && $0.date != nil }
            case .ended:
                hoveredCell = nil
            }
        }
        .overlay(alignment: .topLeading) {
            if let hoveredCell, let date = hoveredCell.date {
                tooltip(date: date, observedUses: hoveredCell.observedUses)
                    .fixedSize()
                    .allowsHitTesting(false)
                    .offset(
                        x: tooltipX(for: hoveredCell, cellStride: cellStride, availableWidth: availableWidth),
                        y: max(0, CGFloat(hoveredCell.weekday) * cellStride - 44)
                    )
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(L10n.string("usage.chart.hourly_activity", locale: locale))
    }

    private func tooltip(date: Date, observedUses: Int) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(formattedDate(date))
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(AppTheme.textPrimary(for: theme))
            Text(callCountText(observedUses))
                .font(.system(size: 10))
                .foregroundStyle(AppTheme.textMuted(for: theme))
        }
        .padding(.horizontal, 9)
        .padding(.vertical, 7)
        .background(AppTheme.pageBackground(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay { RoundedRectangle(cornerRadius: 8).stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5) }
        .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
    }

    private func color(for cell: UsageCalendarCell) -> Color {
        guard cell.date != nil else { return .clear }
        guard cell.observedUses > 0, grid.maximum > 0 else { return AppTheme.pageBackground(for: theme).opacity(0.72) }
        let normalized = log(Double(cell.observedUses) + 1) / log(Double(grid.maximum) + 1)
        return AppTheme.brand(for: accent, in: theme).opacity(0.2 + 0.72 * normalized)
    }

    private func tooltipX(for cell: UsageCalendarCell, cellStride: CGFloat, availableWidth: CGFloat) -> CGFloat {
        let width: CGFloat = 150
        return min(max(0, CGFloat(cell.week) * cellStride - width / 2), max(0, availableWidth - width))
    }

    private func formattedDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = locale
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }

    private func monthName(_ month: Int) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        return formatter.shortMonthSymbols[max(0, min(11, month - 1))]
    }

    private func weekdayName(_ row: Int) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        return formatter.veryShortWeekdaySymbols[max(0, min(6, row))]
    }
}

private struct UsageAreaChart: View {
    let data: UsageChartViewData
    let theme: DesktopThemeMode
    let locale: Locale
    @State private var hoveredIndex: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { proxy in
                Canvas { context, size in drawChart(context: &context, size: size) }
                    .contentShape(Rectangle())
                    .onContinuousHover { phase in
                        switch phase {
                        case .active(let location): hoveredIndex = nearestIndex(for: location.x, width: proxy.size.width)
                        case .ended: hoveredIndex = nil
                        }
                    }
                    .overlay(alignment: .topLeading) {
                        if let hoveredIndex, let bucket = data.labels[safe: hoveredIndex] {
                            tooltip(bucket: bucket, index: hoveredIndex)
                                .frame(width: UsageTooltipGeometry.width, alignment: .leading)
                                .fixedSize(horizontal: false, vertical: true)
                                .allowsHitTesting(false)
                                .offset(
                                    x: UsageTooltipGeometry.leadingOffset(
                                        index: hoveredIndex,
                                        itemCount: data.labels.count,
                                        containerWidth: proxy.size.width
                                    ),
                                    y: UsageTooltipGeometry.topInset
                                )
                        }
                    }
            }
            .frame(height: 260)
            HStack(spacing: 0) {
                Spacer().frame(width: 38)
                ForEach(axisLabelIndices, id: \.self) { index in
                    Text(data.labels[index])
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .frame(maxWidth: .infinity, alignment: index == axisLabelIndices.last ? .trailing : .leading)
                }
                Spacer().frame(width: 10)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), alignment: .leading)], alignment: .leading, spacing: 8) {
                ForEach(data.series) { series in
                    HStack(spacing: 5) {
                        Capsule().fill(seriesColor(series)).frame(width: 14, height: 3)
                        Text(series.label).font(.system(size: 10)).foregroundStyle(AppTheme.textMuted(for: theme)).lineLimit(1)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var axisLabelIndices: [Int] {
        guard !data.labels.isEmpty else { return [] }
        let step = max(1, Int(ceil(Double(data.labels.count) / 6.0)))
        var indices = Array(stride(from: 0, to: data.labels.count, by: step))
        if indices.last != data.labels.count - 1 { indices.append(data.labels.count - 1) }
        return indices
    }

    private func drawChart(context: inout GraphicsContext, size: CGSize) {
        let plot = CGRect(x: 38, y: 8, width: max(1, size.width - 48), height: max(1, size.height - 30))
        let bands = UsageAreaBandGeometry.make(values: data.series.map(\.values))
        let rawMaximum = bands.flatMap(\.upper).max() ?? 0
        let tickStep = max(1, Int(ceil(Double(rawMaximum) / 5.0)))
        let maximum = tickStep * 5
        for tick in 0...5 {
            let ratio = CGFloat(tick) / 5
            let y = plot.maxY - (plot.height * ratio)
            var line = Path(); line.move(to: CGPoint(x: plot.minX, y: y)); line.addLine(to: CGPoint(x: plot.maxX, y: y))
            context.stroke(line, with: .color(AppTheme.cardBorder(for: theme).opacity(0.55)), lineWidth: 0.5)
            context.draw(Text("\(tickStep * tick)").font(.system(size: 10, design: .rounded)).foregroundStyle(AppTheme.textMuted(for: theme)), at: CGPoint(x: 14, y: y))
        }
        for (series, band) in zip(data.series, bands) {
            let upperPoints = band.upper.enumerated().map { index, value in
                chartPoint(index: index, value: value, maximum: maximum, plot: plot)
            }
            let lowerPoints = band.lower.enumerated().map { index, value in
                chartPoint(index: index, value: value, maximum: maximum, plot: plot)
            }
            guard !upperPoints.isEmpty, upperPoints.count == lowerPoints.count else { continue }
            let area = smoothBandPath(upper: upperPoints, lower: lowerPoints)
            let upperCurve = smoothPath(upperPoints)
            let color = seriesColor(series)
            context.fill(area, with: .color(color.opacity(0.48)))
            context.stroke(upperCurve, with: .color(color), lineWidth: 1.6)
        }
        if let hoveredIndex, hoveredIndex < data.labels.count {
            let x = plot.minX + (plot.width * CGFloat(hoveredIndex) / CGFloat(max(data.labels.count - 1, 1)))
            var line = Path(); line.move(to: CGPoint(x: x, y: plot.minY)); line.addLine(to: CGPoint(x: x, y: plot.maxY))
            context.stroke(line, with: .color(AppTheme.textMuted(for: theme).opacity(0.55)), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
        }
    }

    private func tooltip(bucket: String, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(bucket).font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundStyle(AppTheme.textPrimary(for: theme))
            Text(L10n.string("usage.total_calls", locale: locale, arguments: [data.totals[safe: index] ?? 0])).font(.system(size: 11, weight: .medium)).foregroundStyle(AppTheme.textPrimary(for: theme))
            ForEach(data.series.compactMap { series -> (String, Int, String?, Int)? in
                guard let value = series.values[safe: index], value > 0 else { return nil }
                return (series.label, value, series.agentIdentityTargetId, series.colorIndex)
            }, id: \.0) { label, value, agentTargetId, colorIndex in
                HStack(spacing: 5) {
                    Circle().fill(UsageDailyTrendSeriesStyle.color(
                        agentTargetId: agentTargetId,
                        fallbackColorIndex: colorIndex,
                        theme: theme
                    )).frame(width: 6, height: 6)
                    Text(label).lineLimit(1); Spacer(minLength: 12); Text("\(value)").fontDesign(.rounded)
                }
                .font(.system(size: 10)).foregroundStyle(AppTheme.textMuted(for: theme))
            }
        }
        .padding(10)
        .background(AppTheme.pageBackground(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 9))
        .overlay { RoundedRectangle(cornerRadius: 9).stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5) }
        .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
    }

    private func seriesColor(_ series: UsageChartSeriesViewData) -> Color {
        UsageDailyTrendSeriesStyle.color(
            agentTargetId: series.agentIdentityTargetId,
            fallbackColorIndex: series.colorIndex,
            theme: theme
        )
    }

    private func nearestIndex(for x: CGFloat, width: CGFloat) -> Int {
        guard !data.labels.isEmpty else { return 0 }
        let ratio = min(1, max(0, (x - 38) / max(1, width - 48)))
        return Int((ratio * CGFloat(max(data.labels.count - 1, 0))).rounded())
    }

    private func chartPoint(index: Int, value: Int, maximum: Int, plot: CGRect) -> CGPoint {
        CGPoint(
            x: plot.minX + (plot.width * CGFloat(index) / CGFloat(max(data.labels.count - 1, 1))),
            y: plot.maxY - (plot.height * CGFloat(value) / CGFloat(maximum))
        )
    }

    private func smoothPath(_ points: [CGPoint]) -> Path {
        guard let first = points.first else { return Path() }
        var path = Path()
        path.move(to: first)
        addSmoothSegments(points, to: &path)
        return path
    }

    private func smoothBandPath(upper: [CGPoint], lower: [CGPoint]) -> Path {
        guard let firstUpper = upper.first, let lastLower = lower.last else { return Path() }
        var path = Path()
        path.move(to: firstUpper)
        addSmoothSegments(upper, to: &path)
        path.addLine(to: lastLower)
        addSmoothSegments(Array(lower.reversed()), to: &path)
        path.closeSubpath()
        return path
    }

    private func addSmoothSegments(_ points: [CGPoint], to path: inout Path) {
        guard points.count > 1 else { return }
        for index in 0..<(points.count - 1) {
            let previous = points[max(0, index - 1)]
            let current = points[index]
            let next = points[index + 1]
            let afterNext = points[min(points.count - 1, index + 2)]
            let minimumY = min(current.y, next.y)
            let maximumY = max(current.y, next.y)
            let control1 = CGPoint(
                x: current.x + (next.x - previous.x) / 10,
                y: min(maximumY, max(minimumY, current.y + (next.y - previous.y) / 10))
            )
            let control2 = CGPoint(
                x: next.x - (afterNext.x - current.x) / 10,
                y: min(maximumY, max(minimumY, next.y - (afterNext.y - current.y) / 10))
            )
            path.addCurve(to: next, control1: control1, control2: control2)
        }
    }
}

struct UsageHeatmapGeometry {
    static let weekdayCount = 7
    static let hourCount = 24
    static let cellSize: CGFloat = 20
    static let columnSpacing: CGFloat = 4
    static let rowSpacing: CGFloat = 5
    static let gridHeight = (cellSize * CGFloat(weekdayCount)) + (rowSpacing * CGFloat(weekdayCount - 1))

    let cellSize: CGFloat
    let columnSpacing: CGFloat
    let rowSpacing: CGFloat
    let columnCount: Int
    let frames: [CGRect]
    let height: CGFloat

    init(
        width: CGFloat,
        cellSize: CGFloat = Self.cellSize,
        columnSpacing: CGFloat = Self.columnSpacing,
        rowSpacing: CGFloat = Self.rowSpacing
    ) {
        self.cellSize = cellSize
        self.columnSpacing = columnSpacing
        self.rowSpacing = rowSpacing
        let resolvedColumnCount = max(Self.hourCount, Int((width + columnSpacing) / (cellSize + columnSpacing)))
        columnCount = resolvedColumnCount
        let totalRowSpacing = rowSpacing * CGFloat(Self.weekdayCount - 1)
        height = (cellSize * CGFloat(Self.weekdayCount)) + totalRowSpacing
        frames = (0..<(Self.weekdayCount * resolvedColumnCount)).map { index in
            let weekday = index / resolvedColumnCount
            let column = index % resolvedColumnCount
            return CGRect(
                x: CGFloat(column) * (cellSize + columnSpacing),
                y: CGFloat(weekday) * (cellSize + rowSpacing),
                width: cellSize,
                height: cellSize
            )
        }
    }

    func frame(weekday: Int, hour: Int) -> CGRect {
        guard (0..<Self.weekdayCount).contains(weekday), (0..<columnCount).contains(hour) else { return .zero }
        return frames[(weekday * columnCount) + hour]
    }
}

struct UsageHeatmapGridLayout: Layout {
    let columnCount: Int
    let cellSize: CGFloat
    let columnSpacing: CGFloat
    let rowSpacing: CGFloat

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        let width = (cellSize * CGFloat(columnCount)) + (columnSpacing * CGFloat(max(0, columnCount - 1)))
        let height = (cellSize * CGFloat(UsageHeatmapGeometry.weekdayCount))
            + (rowSpacing * CGFloat(UsageHeatmapGeometry.weekdayCount - 1))
        return CGSize(width: width, height: height)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        for (index, subview) in subviews.enumerated() {
            let row = index / columnCount
            let column = index % columnCount
            let frame = CGRect(
                x: bounds.minX + CGFloat(column) * (cellSize + columnSpacing),
                y: bounds.minY + CGFloat(row) * (cellSize + rowSpacing),
                width: cellSize,
                height: cellSize
            )
            subview.place(
                at: frame.origin,
                anchor: .topLeading,
                proposal: ProposedViewSize(width: frame.width, height: frame.height)
            )
        }
    }
}

struct UsageTooltipGeometry {
    static let width: CGFloat = 190
    static let edgeInset: CGFloat = 8
    static let topInset: CGFloat = 8

    static func leadingOffset(index: Int, itemCount: Int, containerWidth: CGFloat) -> CGFloat {
        guard itemCount > 1 else { return edgeInset }
        let plotWidth = max(1, containerWidth - 48)
        let anchorX = 38 + (plotWidth * CGFloat(index) / CGFloat(itemCount - 1))
        let maximumLeading = max(edgeInset, containerWidth - edgeInset - width)
        return min(max(edgeInset, anchorX - (width / 2)), maximumLeading)
    }
}

struct UsageAreaBandGeometry: Equatable {
    let lower: [Int]
    let upper: [Int]

    static func make(values: [[Int]]) -> [UsageAreaBandGeometry] {
        let valueCount = values.map(\.count).max() ?? 0
        var baseline = Array(repeating: 0, count: valueCount)
        return values.map { series in
            let lower = baseline
            let upper = (0..<valueCount).map { index in
                baseline[index] += index < series.count ? series[index] : 0
                return baseline[index]
            }
            return UsageAreaBandGeometry(lower: lower, upper: upper)
        }
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}

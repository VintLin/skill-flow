import SwiftUI

struct UsageScreen: View {
    @Bindable var viewModel: MainViewModel
    let theme: DesktopThemeMode
    let accent: DesktopAccentColor

    @State private var selectedRange: UsageRangePresetViewData = .thirtyDays
    @State private var selection: UsageChartSelectionViewData = .all
    @State private var showingCustomRange = false
    @State private var customFrom = Calendar.current.date(byAdding: .day, value: -29, to: Date()) ?? Date()
    @State private var customTo = Date()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                rangePicker
                content
            }
            .padding(.horizontal, 28)
            .padding(.vertical, 24)
            .frame(maxWidth: 1180, alignment: .leading)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(AppTheme.pageBackground(for: theme))
        .task { await viewModel.loadUsageSnapshot(rangePreset: selectedRange.rawValue) }
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
                    Text(range.title)
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
                Text("自定义时间范围").font(.system(size: 14, weight: .semibold))
                DatePicker("开始", selection: $customFrom, displayedComponents: .date)
                DatePicker("结束", selection: $customTo, displayedComponents: .date)
                HStack {
                    Spacer()
                    Button("应用") {
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
            sectionCard(title: "正在读取 Skill 使用记录") {
                HStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text("正在扫描本地 Agent 会话…")
                        .font(.system(size: 13))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                }
                .padding(.vertical, 12)
            }
        case .failed(let message):
            sectionCard(title: "无法加载 Skill 使用记录") {
                Text(message)
                    .font(.system(size: 13))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
                    .padding(.vertical, 12)
            }
        case .ready:
            if let snapshot = viewModel.usageSnapshot { dashboard(snapshot) }
            else {
                sectionCard(title: "暂无 Skill 使用记录") {
                    Text("本地 Agent 尚未产生可识别的 Skill 调用记录。")
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
            heatmap(snapshot)
            sectionCard(title: nil) {
                Label("每日趋势", systemImage: "waveform.path.ecg")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                UsageAreaChart(data: chart, theme: theme)
                    .frame(height: 340)
            }
            statistics(snapshot)
        }
    }

    private func heatmap(_ snapshot: UsageSnapshotViewData) -> some View {
        sectionCard(title: nil) {
            HStack(alignment: .firstTextBaseline) {
                Label("分时活跃", systemImage: "calendar")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                Spacer()
                Text(snapshot.rangeLabel)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(AppTheme.textMuted(for: theme))
            }
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 5) {
                    ForEach(["周日", "周一", "周二", "周三", "周四", "周五", "周六"], id: \.self) { day in
                        Text(day)
                            .font(.system(size: 10))
                            .foregroundStyle(AppTheme.textMuted(for: theme))
                            .frame(width: 28, height: UsageHeatmapGeometry.cellSize, alignment: .leading)
                    }
                }
                let maximum = snapshot.hourlyActivity.map(\.observedUses).max() ?? 0
                GeometryReader { proxy in
                    let geometry = UsageHeatmapGeometry(width: proxy.size.width)
                    UsageHeatmapGridLayout(
                        columnCount: geometry.columnCount,
                        cellSize: geometry.cellSize,
                        columnSpacing: geometry.columnSpacing,
                        rowSpacing: geometry.rowSpacing
                    ) {
                        ForEach(0..<7, id: \.self) { weekday in
                            ForEach(0..<geometry.columnCount, id: \.self) { column in
                                if column < UsageHeatmapGeometry.hourCount {
                                    let item = hourlyActivity(snapshot, weekday: weekday, hour: column)
                                    RoundedRectangle(cornerRadius: 4)
                                        .fill(heatmapColor(item.observedUses, maximum: maximum))
                                        .help("\(weekdayTitle(weekday)) \(String(format: "%02d:00", column)) · \(item.observedUses) 次")
                                } else {
                                    RoundedRectangle(cornerRadius: 4)
                                        .fill(heatmapColor(0, maximum: maximum))
                                        .accessibilityHidden(true)
                                }
                            }
                        }
                    }
                }
                .frame(height: UsageHeatmapGeometry.gridHeight)
            }
            HStack(alignment: .top, spacing: 8) {
                Color.clear.frame(width: 28, height: 16)
                GeometryReader { proxy in
                    let layout = UsageHeatmapGeometry(width: proxy.size.width)
                    ZStack(alignment: .topLeading) {
                        ForEach([0, 3, 6, 9, 12, 15, 18, 21], id: \.self) { hour in
                            let frame = layout.frame(weekday: 0, hour: hour)
                            Text(String(format: "%02d", hour))
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(AppTheme.textMuted(for: theme))
                                .position(x: frame.midX, y: 8)
                        }
                    }
                }
            }
            .frame(height: 16)
            HStack(spacing: 5) {
                Spacer()
                Text("少")
                ForEach(0..<7, id: \.self) { level in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(heatmapLegendColor(level))
                        .frame(width: 14, height: 14)
                }
                Text("多")
            }
            .font(.system(size: 10))
            .foregroundStyle(AppTheme.textMuted(for: theme))
        }
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
            Text("活动洞察").font(.system(size: 15, weight: .semibold)).foregroundStyle(AppTheme.textPrimary(for: theme))
            kpiRow("技能总数", value: snapshot.kpis.totalSkills)
            kpiRow("使用技能总数", value: snapshot.kpis.usedSkills)
            kpiRow("技能运行总数", value: snapshot.kpis.skillRuns)
            kpiRow("聊天/调用记录", value: snapshot.kpis.chatRecords)
        }
        .padding(.trailing, 18)
    }

    private func skillColumn(_ snapshot: UsageSnapshotViewData) -> some View {
        let selectedAgent: String? = { if case .agent(let agent) = selection { return agent }; return nil }()
        let rows = snapshot.skillRows(for: selectedAgent)
        return VStack(alignment: .leading, spacing: 8) {
            Text("最常用的技能").font(.system(size: 15, weight: .semibold)).foregroundStyle(AppTheme.textPrimary(for: theme))
            Text("前 20 个 Skill · 点击查看 Agent 分布").font(.system(size: 11)).foregroundStyle(AppTheme.textMuted(for: theme))
            if rows.isEmpty { emptyRow("当前范围没有 Skill 调用") }
            else {
                ForEach(rows.prefix(20)) { item in
                    Button {
                        if case .skill(let current) = selection, current == item.id { selection = .all }
                        else { selection = .skill(item.id) }
                    } label: {
                        rankingRow(label: item.skillLabel, value: item.observedUses, colorIndex: colorIndex(for: item.id), selected: selection == .skill(item.id))
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
            Text("最常用的 Agent").font(.system(size: 15, weight: .semibold)).foregroundStyle(AppTheme.textPrimary(for: theme))
            Text("当前范围内的真实 Skill 运行次数").font(.system(size: 11)).foregroundStyle(AppTheme.textMuted(for: theme))
            if rows.isEmpty { emptyRow("当前范围没有 Agent 调用") }
            else {
                ForEach(rows.prefix(20)) { item in
                    Button {
                        if case .agent(let current) = selection, current == item.id { selection = .all }
                        else { selection = .agent(item.id) }
                    } label: {
                        rankingRow(label: item.agent, value: item.observedUses, colorIndex: colorIndex(for: item.id), selected: selection == .agent(item.id))
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

    private func rankingRow(label: String, value: Int, colorIndex: Int, selected: Bool) -> some View {
        HStack(spacing: 8) {
            Circle().fill(UsageAreaChart.palette[colorIndex % UsageAreaChart.palette.count]).frame(width: 7, height: 7)
            Text(label).font(.system(size: 12)).foregroundStyle(AppTheme.textPrimary(for: theme)).lineLimit(1)
            Spacer(minLength: 6)
            Text("\(value) 次运行").font(.system(size: 11, design: .rounded)).foregroundStyle(AppTheme.textMuted(for: theme))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 7)
        .background(selected ? AppTheme.cardBorder(for: theme).opacity(0.22) : .clear)
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

    private func hourlyActivity(_ snapshot: UsageSnapshotViewData, weekday: Int, hour: Int) -> UsageHourlyActivityViewData {
        snapshot.hourlyActivity.first { $0.weekday == weekday && $0.hour == hour }
            ?? UsageHourlyActivityViewData(weekday: weekday, hour: hour, observedUses: 0)
    }

    private func weekdayTitle(_ weekday: Int) -> String {
        ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][min(max(weekday, 0), 6)]
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
}

private struct UsageAreaChart: View {
    static let palette: [Color] = [.blue, .orange, .green, .purple, .pink, .teal, .indigo, .brown]

    let data: UsageChartViewData
    let theme: DesktopThemeMode
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
                        Capsule().fill(Self.palette[series.colorIndex % Self.palette.count]).frame(width: 14, height: 3)
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
            let color = Self.palette[series.colorIndex % Self.palette.count]
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
            Text("总调用：\(data.totals[safe: index] ?? 0)").font(.system(size: 11, weight: .medium)).foregroundStyle(AppTheme.textPrimary(for: theme))
            ForEach(data.series.compactMap { series -> (String, Int, Int)? in
                guard let value = series.values[safe: index], value > 0 else { return nil }
                return (series.label, value, series.colorIndex)
            }, id: \.0) { label, value, colorIndex in
                HStack(spacing: 5) {
                    Circle().fill(Self.palette[colorIndex % Self.palette.count]).frame(width: 6, height: 6)
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

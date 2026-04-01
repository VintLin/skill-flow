import SwiftUI

extension Notification.Name {
    static let groupTagEditorRequested = Notification.Name("groupTagEditorRequested")
    static let groupTagEditorDismissRequested = Notification.Name("groupTagEditorDismissRequested")
}

struct EditableGroupTagSection: View {
    @Environment(\.locale) private var locale
    @FocusState private var isInputFocused: Bool

    let theme: DesktopThemeMode
    let accent: DesktopAccentColor
    let controlHeight: CGFloat
    let cornerRadius: CGFloat
    let inputWidth: CGFloat
    let tagItems: [GroupTagDisplayItem]
    let suggestions: [GroupTagDisplayItem]
    let canAddMore: Bool
    let isEditing: Bool
    let isDeleteMode: Bool
    let pillHeight: CGFloat
    let fontSize: CGFloat
    let iconSize: CGFloat
    let rowSpacing: CGFloat
    let onEditingChange: (Bool) -> Void
    let onCreate: ((String, DesktopAccentColor?) -> GroupTagMutationResult)?
    let onDelete: ((GroupTagDisplayItem) -> Void)?
    let onSelect: ((GroupTagDisplayItem) -> Void)?

    @State private var draftText = ""
    @State private var hoveredEditableTagID: String?
    @State private var hoverCollapseTask: Task<Void, Never>?

    private let hoverCollapseDelay: Duration = .seconds(1)

    init(
        theme: DesktopThemeMode,
        accent: DesktopAccentColor,
        controlHeight: CGFloat,
        cornerRadius: CGFloat,
        inputWidth: CGFloat,
        tagItems: [GroupTagDisplayItem],
        suggestions: [GroupTagDisplayItem],
        canAddMore: Bool,
        isEditing: Bool,
        isDeleteMode: Bool,
        pillHeight: CGFloat = 24,
        fontSize: CGFloat = 12,
        iconSize: CGFloat = 10,
        rowSpacing: CGFloat = 6,
        onEditingChange: @escaping (Bool) -> Void,
        onCreate: ((String, DesktopAccentColor?) -> GroupTagMutationResult)?,
        onDelete: ((GroupTagDisplayItem) -> Void)?,
        onSelect: ((GroupTagDisplayItem) -> Void)?
    ) {
        self.theme = theme
        self.accent = accent
        self.controlHeight = controlHeight
        self.cornerRadius = cornerRadius
        self.inputWidth = inputWidth
        self.tagItems = tagItems
        self.suggestions = suggestions
        self.canAddMore = canAddMore
        self.isEditing = isEditing
        self.isDeleteMode = isDeleteMode
        self.pillHeight = pillHeight
        self.fontSize = fontSize
        self.iconSize = iconSize
        self.rowSpacing = rowSpacing
        self.onEditingChange = onEditingChange
        self.onCreate = onCreate
        self.onDelete = onDelete
        self.onSelect = onSelect
    }

    var body: some View {
        Group {
            if isEditing, let onCreate {
                editableRow(onCreate: onCreate)
            } else {
                displayRow
            }
        }
        .onChange(of: isDeleteMode) { _, isActive in
            if isActive {
                resetEditingState()
            }
        }
        .onChange(of: isEditing) { _, isActive in
            if !isActive {
                draftText = ""
                isInputFocused = false
            }
        }
    }

    private var displayRow: some View {
        HStack(spacing: rowSpacing) {
            if shouldShowAddButton {
                addButton(isVisible: showsHoverAddButton)
            }

            if !tagItems.isEmpty {
                tagRow(items: tagItems, showsDeleteControls: isDeleteMode)
                    .offset(x: showsHoverAddButton ? GroupCardTagMetrics.hoverEditSpacing : 0)
            }
        }
        .animation(.easeOut(duration: DesktopMotionTokens.hoverDuration), value: showsHoverAddButton)
    }

    private var shouldShowAddButton: Bool {
        guard onCreate != nil, !isDeleteMode else {
            return false
        }
        return true
    }

    private var showsHoverAddButton: Bool {
        guard onSelect != nil, !isDeleteMode else {
            return false
        }
        return canAddMore && hoveredEditableTagID != nil
    }

    private func editableRow(onCreate: @escaping (String, DesktopAccentColor?) -> GroupTagMutationResult) -> some View {
        let inputCornerRadius = max(6, cornerRadius - 2)

        return HStack(spacing: max(6, rowSpacing + 2)) {
            TextField(
                L10n.string("group_tag.input.placeholder", locale: locale),
                text: Binding(
                    get: { draftText },
                    set: { draftText = GroupTagController.normalizedInputTitle($0, locale: locale) }
                )
            )
            .textFieldStyle(.plain)
            .font(.system(size: fontSize, weight: .regular))
            .foregroundStyle(AppTheme.textPrimary(for: theme))
            .padding(.horizontal, 10)
            .frame(width: inputWidth, height: pillHeight, alignment: .leading)
            .background(AppTheme.documentBlock(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: inputCornerRadius))
            .overlay {
                RoundedRectangle(cornerRadius: inputCornerRadius)
                    .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
            }
            .focused($isInputFocused)
            .onSubmit {
                handleCreateResult(onCreate(draftText, nil))
            }

            DashedTagDivider(color: AppTheme.cardBorder(for: theme))
                .frame(width: 1, height: pillHeight)

            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: rowSpacing) {
                    ForEach(suggestions) { item in
                        Button {
                            handleCreateResult(onCreate(item.title, item.accent))
                        } label: {
                            tagPill(item, showsDeleteControl: false)
                        }
                        .buttonStyle(.plain)
                        .desktopMotionChip(
                            kind: .pill,
                            theme: theme,
                            accent: item.accent,
                            isEnabled: true,
                            isSelected: false
                        )
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .task {
            isInputFocused = true
        }
    }

    private func addButton(isVisible: Bool) -> some View {
        Button {
            guard canAddMore else { return }
            onEditingChange(true)
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: max(6, cornerRadius - 2))
                    .fill(
                        canAddMore
                            ? AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.28 : 0.18)
                            : AppTheme.selectionControlFill(.empty, for: theme)
                    )
                if let image = ActionIcon.plus.image(size: 10) {
                    Image(nsImage: image)
                        .renderingMode(.template)
                        .resizable()
                        .interpolation(.high)
                        .scaledToFit()
                        .frame(width: iconSize, height: iconSize)
                        .foregroundStyle(
                            canAddMore
                                ? AppTheme.brand(for: accent, in: theme)
                                : AppTheme.selectionControlText(.empty, for: theme)
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                }
            }
            .frame(width: pillHeight, height: pillHeight)
            .overlay {
                RoundedRectangle(cornerRadius: max(6, cornerRadius - 2))
                    .stroke(
                        canAddMore
                            ? AppTheme.brand(for: accent, in: theme).opacity(0.35)
                            : AppTheme.cardBorder(for: theme),
                        lineWidth: 0.5
                    )
            }
        }
        .buttonStyle(.plain)
        .desktopMotionChip(
            kind: .pill,
            theme: theme,
            accent: accent,
            isEnabled: canAddMore && isVisible,
            isSelected: false
        )
        .frame(width: isVisible ? pillHeight : 0, height: pillHeight, alignment: .leading)
        .opacity(isVisible ? 1 : 0)
        .allowsHitTesting(isVisible)
        .clipped()
        .disabled(!canAddMore || !isVisible)
        .help(L10n.string("group_tag.action.add", locale: locale))
        .onHover { isHovering in
            if isHovering {
                cancelHoverCollapse()
            } else {
                scheduleHoverCollapse()
            }
        }
    }

    private func handleCreateResult(_ result: GroupTagMutationResult) {
        if result == .added {
            resetEditingState()
        }
    }

    private func resetEditingState() {
        cancelHoverCollapse()
        draftText = ""
        isInputFocused = false
        hoveredEditableTagID = nil
        onEditingChange(false)
    }

    private func tagRow(items: [GroupTagDisplayItem], showsDeleteControls: Bool) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: rowSpacing) {
                ForEach(items) { item in
                    if showsDeleteControls {
                        tagPill(item, showsDeleteControl: showsDeleteControls)
                    } else if onSelect != nil {
                        editableSelectableTag(item)
                    } else {
                        tagPill(item, showsDeleteControl: false)
                    }
                }
            }
        }
    }

    private func editableSelectableTag(_ item: GroupTagDisplayItem) -> some View {
        Button {
            onSelect?(item)
        } label: {
            tagTextLabel(item)
        }
        .buttonStyle(.plain)
        .desktopMotionChip(
            kind: .pill,
            theme: theme,
            accent: item.accent,
            isEnabled: true,
            isSelected: false
        )
        .onHover { isHovering in
            guard canAddMore, !isDeleteMode else { return }
            if isHovering {
                cancelHoverCollapse()
                hoveredEditableTagID = item.id
            } else {
                scheduleHoverCollapse()
            }
        }
    }

    private func scheduleHoverCollapse() {
        hoverCollapseTask?.cancel()
        hoverCollapseTask = Task {
            try? await Task.sleep(for: hoverCollapseDelay)
            guard !Task.isCancelled else { return }
            await MainActor.run {
                hoveredEditableTagID = nil
                hoverCollapseTask = nil
            }
        }
    }

    private func cancelHoverCollapse() {
        hoverCollapseTask?.cancel()
        hoverCollapseTask = nil
    }

    private func tagTextLabel(_ item: GroupTagDisplayItem) -> some View {
        Text("#\(item.title)")
            .font(.system(size: fontSize, weight: .regular))
            .foregroundStyle(AppTheme.brand(for: item.accent, in: theme))
            .padding(.horizontal, GroupCardTagMetrics.horizontalPadding)
            .padding(.vertical, GroupCardTagMetrics.verticalPadding)
            .contentShape(Rectangle())
    }

    private func tagPill(_ item: GroupTagDisplayItem, showsDeleteControl: Bool) -> some View {
        HStack(spacing: showsDeleteControl ? rowSpacing : 0) {
            tagTextLabel(item)

            if showsDeleteControl {
                Button {
                    onDelete?(item)
                } label: {
                    if let image = ActionIcon.close.image(size: 10) {
                        Image(nsImage: image)
                            .renderingMode(.template)
                            .resizable()
                            .interpolation(.high)
                            .scaledToFit()
                            .frame(width: iconSize, height: iconSize)
                            .foregroundStyle(AppTheme.brand(for: item.accent, in: theme))
                    } else {
                        Text("x")
                            .font(.system(size: iconSize, weight: .semibold))
                            .foregroundStyle(AppTheme.brand(for: item.accent, in: theme))
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.trailing, showsDeleteControl ? 4 : 0)
    }
}

private struct DashedTagDivider: View {
    let color: Color

    var body: some View {
        Canvas { context, size in
            var path = Path()
            path.move(to: CGPoint(x: size.width / 2, y: 0))
            path.addLine(to: CGPoint(x: size.width / 2, y: size.height))
            context.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: 1, dash: [2, 2]))
        }
    }
}

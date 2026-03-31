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
    let onEditingChange: (Bool) -> Void
    let onCreate: ((String, DesktopAccentColor?) -> GroupTagMutationResult)?
    let onDelete: ((GroupTagDisplayItem) -> Void)?
    let onSelect: ((GroupTagDisplayItem) -> Void)?

    @State private var draftText = ""
    private let tagPillHeight: CGFloat = 24

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
        HStack(spacing: 6) {
            if shouldShowAddButton {
                addButton
            }

            if !tagItems.isEmpty {
                tagRow(items: tagItems, showsDeleteControls: isDeleteMode)
            }
        }
    }

    private var shouldShowAddButton: Bool {
        guard onCreate != nil, !isDeleteMode else {
            return false
        }
        return true
    }

    private func editableRow(onCreate: @escaping (String, DesktopAccentColor?) -> GroupTagMutationResult) -> some View {
        HStack(spacing: 8) {
            TextField(
                L10n.string("group_tag.input.placeholder", locale: locale),
                text: Binding(
                    get: { draftText },
                    set: { draftText = GroupTagController.normalizedInputTitle($0, locale: locale) }
                )
            )
            .textFieldStyle(.plain)
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(AppTheme.textPrimary(for: theme))
            .padding(.horizontal, 10)
            .frame(width: inputWidth, height: tagPillHeight, alignment: .leading)
            .background(AppTheme.documentBlock(for: theme))
            .clipShape(RoundedRectangle(cornerRadius: max(6, cornerRadius - 2)))
            .overlay {
                RoundedRectangle(cornerRadius: max(6, cornerRadius - 2))
                    .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
            }
            .focused($isInputFocused)
            .onSubmit {
                handleCreateResult(onCreate(draftText, nil))
            }

            DashedTagDivider(color: AppTheme.cardBorder(for: theme))
                .frame(width: 1, height: tagPillHeight)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
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

    private var addButton: some View {
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
                        .frame(width: 10, height: 10)
                        .foregroundStyle(
                            canAddMore
                                ? AppTheme.brand(for: accent, in: theme)
                                : AppTheme.selectionControlText(.empty, for: theme)
                        )
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
                }
            }
            .frame(width: tagPillHeight, height: tagPillHeight)
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
            isEnabled: canAddMore,
            isSelected: false
        )
        .disabled(!canAddMore)
        .help(L10n.string("group_tag.action.add", locale: locale))
    }

    private func handleCreateResult(_ result: GroupTagMutationResult) {
        if result == .added {
            resetEditingState()
        }
    }

    private func resetEditingState() {
        draftText = ""
        isInputFocused = false
        onEditingChange(false)
    }

    private func tagRow(items: [GroupTagDisplayItem], showsDeleteControls: Bool) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items) { item in
                    if showsDeleteControls || onSelect == nil {
                        tagPill(item, showsDeleteControl: showsDeleteControls)
                    } else {
                        Button {
                            onSelect?(item)
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
        }
    }

    private func tagPill(_ item: GroupTagDisplayItem, showsDeleteControl: Bool) -> some View {
        HStack(spacing: showsDeleteControl ? 6 : 0) {
            Text("#\(item.title)")
                .font(.system(size: 12, weight: .regular))
                .foregroundStyle(AppTheme.brand(for: item.accent, in: theme))

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
                            .frame(width: 10, height: 10)
                            .foregroundStyle(AppTheme.brand(for: item.accent, in: theme))
                    } else {
                        Text("x")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundStyle(AppTheme.brand(for: item.accent, in: theme))
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, 8)
        .padding(.trailing, showsDeleteControl ? 6 : 8)
        .frame(height: tagPillHeight)
        .background(AppTheme.brand(for: item.accent, in: theme).opacity(theme == .dark ? 0.22 : 0.14))
        .clipShape(RoundedRectangle(cornerRadius: max(6, cornerRadius - 2)))
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

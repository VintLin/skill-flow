import SwiftUI

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
    let showsAddButtonWhenTagsExist: Bool
    let isDeleteMode: Bool
    let onCreate: ((String, DesktopAccentColor?) -> Void)?
    let onDelete: ((GroupTagDisplayItem) -> Void)?

    @State private var isEditing = false
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
    }

    private var displayRow: some View {
        HStack(spacing: 6) {
            if !tagItems.isEmpty {
                tagRow(items: tagItems, showsDeleteControls: isDeleteMode)
            }

            if shouldShowAddButton {
                addButton
            }
        }
    }

    private var shouldShowAddButton: Bool {
        guard onCreate != nil, canAddMore, !isDeleteMode else {
            return false
        }
        return showsAddButtonWhenTagsExist || tagItems.isEmpty
    }

    private func editableRow(onCreate: @escaping (String, DesktopAccentColor?) -> Void) -> some View {
        HStack(spacing: 8) {
            TextField(
                L10n.string("group_tag.input.placeholder", locale: locale),
                text: Binding(
                    get: { draftText },
                    set: { draftText = String($0.prefix(4)) }
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
                onCreate(draftText, nil)
                resetEditingState()
            }

            DashedTagDivider(color: AppTheme.cardBorder(for: theme))
                .frame(width: 1, height: tagPillHeight)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(suggestions) { item in
                        Button {
                            onCreate(item.title, item.accent)
                            resetEditingState()
                        } label: {
                            tagPill(item, showsDeleteControl: false)
                        }
                        .buttonStyle(.plain)
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
            isEditing = true
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: max(6, cornerRadius - 2))
                    .fill(AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.28 : 0.18))
                Text("+")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.brand(for: accent, in: theme))
            }
            .frame(width: tagPillHeight, height: tagPillHeight)
            .overlay {
                RoundedRectangle(cornerRadius: max(6, cornerRadius - 2))
                    .stroke(AppTheme.brand(for: accent, in: theme).opacity(0.35), lineWidth: 0.5)
            }
        }
        .buttonStyle(.plain)
        .help(L10n.string("group_tag.action.add", locale: locale))
    }

    private func resetEditingState() {
        draftText = ""
        isEditing = false
        isInputFocused = false
    }

    private func tagRow(items: [GroupTagDisplayItem], showsDeleteControls: Bool) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items) { item in
                    tagPill(item, showsDeleteControl: showsDeleteControls && item.isRemovable)
                }
            }
        }
        .scrollDisabled(true)
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
                    Text("x")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(AppTheme.brand(for: item.accent, in: theme))
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

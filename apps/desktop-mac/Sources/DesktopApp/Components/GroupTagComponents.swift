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
    let onCreate: ((String, DesktopAccentColor?) -> Void)?

    @State private var isEditing = false
    @State private var draftText = ""
    private let tagPillHeight: CGFloat = 24

    var body: some View {
        Group {
            if !tagItems.isEmpty {
                tagRow(items: tagItems)
            } else if let onCreate {
                editableRow(onCreate: onCreate)
            }
        }
    }

    private func editableRow(onCreate: @escaping (String, DesktopAccentColor?) -> Void) -> some View {
        Group {
            if isEditing {
                HStack(spacing: 0) {
                    TextField("", text: Binding(
                        get: { draftText },
                        set: { draftText = String($0.prefix(4)) }
                    ))
                    .textFieldStyle(.plain)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(AppTheme.textPrimary(for: theme))
                    .padding(.horizontal, 12)
                    .frame(width: inputWidth, height: controlHeight, alignment: .leading)
                    .focused($isInputFocused)
                    .onSubmit {
                        onCreate(draftText, nil)
                        resetEditingState()
                    }

                    Rectangle()
                        .fill(AppTheme.cardBorder(for: theme))
                        .frame(width: 0.5, height: controlHeight - 12)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(suggestions) { item in
                                Button {
                                    onCreate(item.title, item.accent)
                                    resetEditingState()
                                } label: {
                                    tagPill(item)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, 8)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(height: controlHeight)
                .background(AppTheme.documentBlock(for: theme))
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
                .overlay {
                    RoundedRectangle(cornerRadius: cornerRadius)
                        .stroke(AppTheme.cardBorder(for: theme), lineWidth: 0.5)
                }
                .task {
                    isInputFocused = true
                }
            } else {
                Button {
                    isEditing = true
                } label: {
                    ZStack {
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .fill(AppTheme.brand(for: accent, in: theme).opacity(theme == .dark ? 0.28 : 0.18))
                        Text("+")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(AppTheme.brand(for: accent, in: theme))
                    }
                    .frame(width: tagPillHeight, height: tagPillHeight)
                    .overlay {
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .stroke(AppTheme.brand(for: accent, in: theme).opacity(0.35), lineWidth: 0.5)
                    }
                }
                .buttonStyle(.plain)
                .help(L10n.string("group_tag.action.add", locale: locale))
            }
        }
    }

    private func resetEditingState() {
        draftText = ""
        isEditing = false
        isInputFocused = false
    }

    private func tagRow(items: [GroupTagDisplayItem]) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(items) { item in
                    tagPill(item)
                }
            }
        }
        .scrollDisabled(true)
    }

    private func tagPill(_ item: GroupTagDisplayItem) -> some View {
        Text("#\(item.title)")
            .font(.system(size: 12, weight: .regular))
            .foregroundStyle(AppTheme.brand(for: item.accent, in: theme))
            .padding(.horizontal, 8)
            .frame(height: tagPillHeight)
            .background(AppTheme.brand(for: item.accent, in: theme).opacity(theme == .dark ? 0.22 : 0.14))
            .clipShape(RoundedRectangle(cornerRadius: max(6, cornerRadius - 2)))
    }
}

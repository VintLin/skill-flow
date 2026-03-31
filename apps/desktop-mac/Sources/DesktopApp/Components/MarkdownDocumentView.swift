import Foundation
import SwiftUI
import Textual
#if canImport(AppKit)
import AppKit
#endif

struct MarkdownDocumentView: View, Equatable {
    let document: MainViewModel.DocumentTab
    let theme: DesktopThemeMode
    @State private var renderedContent: AttributedString?

    nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.document == rhs.document && lhs.theme == rhs.theme
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !document.metadata.isEmpty {
                metadataTable(document.metadata)
            }

            if !document.content.isEmpty {
                if let renderedContent {
                    StructuredText(
                        document.content,
                        parser: CachedAttributedStringParser(attributedString: renderedContent)
                    )
                    .textual.structuredTextStyle(.gitHub)
                    .textual.textSelection(.enabled)
                    .environment(\.openURL, openURLAction)
                    .id(document.renderCacheKey)
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    loadingState
                }
            }
        }
        .environment(\.colorScheme, colorScheme)
        .task(id: document.renderCacheKey) {
            await prepareRenderedContent()
        }
    }

    private func metadataTable(_ metadata: [MainViewModel.MetadataEntry]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(metadata.enumerated()), id: \.element.id) { index, entry in
                HStack(alignment: .top, spacing: 12) {
                    Text(entry.key)
                        .font(.system(size: 11, weight: .semibold, design: .monospaced))
                        .foregroundStyle(AppTheme.textMuted(for: theme))
                        .frame(width: 120, alignment: .leading)

                    Text(entry.value)
                        .font(.system(size: 11, weight: .regular, design: .monospaced))
                        .foregroundStyle(AppTheme.textPrimary(for: theme))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)

                if index < metadata.count - 1 {
                    Rectangle()
                        .fill(AppTheme.border(for: theme))
                        .frame(height: 1)
                }
            }
        }
        .background(AppTheme.toolbarButtonBackground(for: theme))
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }

    private var openURLAction: OpenURLAction {
        OpenURLAction { url in
            #if canImport(AppKit)
            NSWorkspace.shared.open(url)
            return .handled
            #else
            return .systemAction
            #endif
        }
    }

    private var colorScheme: ColorScheme {
        theme == .dark ? .dark : .light
    }

    @MainActor
    private func prepareRenderedContent() async {
        if let cached = MarkdownDocumentRenderer.shared.cachedContent(for: document.renderCacheKey) {
            renderedContent = cached
            return
        }

        renderedContent = nil
        let renderCacheKey = document.renderCacheKey
        let content = await MarkdownDocumentRenderer.shared.renderedContent(for: document)
        guard !Task.isCancelled, renderCacheKey == document.renderCacheKey else {
            return
        }
        renderedContent = content
    }

    private var loadingState: some View {
        VStack(alignment: .leading, spacing: 10) {
            ProgressView()
                .controlSize(.small)

            Text(L10n.string("detail.loading.document"))
                .font(.system(size: 11, weight: .regular, design: .monospaced))
                .foregroundStyle(AppTheme.textMuted(for: theme))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension MainViewModel.DocumentTab {
    var isMarkdown: Bool {
        path.lowercased().hasSuffix(".md")
    }
}

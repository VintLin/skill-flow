import Foundation
import MarkdownParser
import MarkdownView
import SwiftUI

@MainActor
enum MarkdownDocumentRenderer {
    private static let theme: MarkdownTheme = .default
    private static var parser = MarkdownParser()
    private static var contentCache: [String: MarkdownView.PreprocessedContent] = [:]
    private static var heightCache: [String: CGFloat] = [:]

    static func preprocessedContent(cacheKey: String, markdown: String) -> MarkdownView.PreprocessedContent {
        if let cached = contentCache[cacheKey] {
            return cached
        }

        let parserResult = parser.parse(markdown)
        let content = MarkdownView.PreprocessedContent(
            blocks: parserResult.document,
            rendered: [:],
            highlightMaps: [:]
        )
        contentCache[cacheKey] = content
        return content
    }

    static func cachedHeight(documentKey: String, width: CGFloat) -> CGFloat? {
        heightCache[heightCacheKey(documentKey: documentKey, width: width)]
    }

    static func cacheHeight(_ height: CGFloat, documentKey: String, width: CGFloat) {
        heightCache[heightCacheKey(documentKey: documentKey, width: width)] = height
    }

    static func clearCache() {
        contentCache.removeAll()
        heightCache.removeAll()
    }

    static var markdownTheme: MarkdownTheme {
        theme
    }

    private static func heightCacheKey(documentKey: String, width: CGFloat) -> String {
        "\(documentKey):w\(Int(width.rounded(.toNearestOrAwayFromZero)))"
    }
}

struct MarkdownDocumentView: View {
    let document: MainViewModel.DocumentTab
    let theme: DesktopThemeMode

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !document.metadata.isEmpty {
                metadataTable(document.metadata)
            }

            if !document.content.isEmpty {
                CachedMarkdownContentView(
                    documentKey: document.renderCacheKey,
                    preprocessedContent: MarkdownDocumentRenderer.preprocessedContent(
                        cacheKey: document.renderCacheKey,
                        markdown: document.content
                    ),
                    theme: MarkdownDocumentRenderer.markdownTheme
                )
            }
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
}

private struct CachedMarkdownContentView: View {
    let documentKey: String
    let preprocessedContent: MarkdownView.PreprocessedContent
    let theme: MarkdownTheme

    var body: some View {
        CachedMarkdownTextViewRepresentable(
            documentKey: documentKey,
            preprocessedContent: preprocessedContent,
            theme: theme
        )
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#if canImport(AppKit)
import AppKit

private struct CachedMarkdownTextViewRepresentable: NSViewRepresentable {
    let documentKey: String
    let preprocessedContent: MarkdownView.PreprocessedContent
    let theme: MarkdownTheme

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> MarkdownTextView {
        let view = MarkdownTextView()
        view.theme = theme
        view.throttleInterval = nil
        view.setContentHuggingPriority(.required, for: .vertical)
        view.setContentCompressionResistancePriority(.required, for: .vertical)
        view.setContentHuggingPriority(.defaultLow, for: .horizontal)
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return view
    }

    func updateNSView(_ nsView: MarkdownTextView, context: Context) {
        let width = nsView.bounds.width

        if context.coordinator.lastDocumentKey != documentKey
            || context.coordinator.lastContent !== preprocessedContent {
            nsView.theme = theme
            nsView.setMarkdownManually(preprocessedContent)
            nsView.invalidateIntrinsicContentSize()
            context.coordinator.lastDocumentKey = documentKey
            context.coordinator.lastContent = preprocessedContent
            context.coordinator.lastMeasuredWidth = nil
        }

        guard width.isFinite, width > 0 else {
            return
        }

        if let cachedHeight = MarkdownDocumentRenderer.cachedHeight(documentKey: documentKey, width: width) {
            if context.coordinator.lastMeasuredWidth != width || context.coordinator.lastMeasuredHeight != cachedHeight {
                nsView.frame.size.height = cachedHeight
                context.coordinator.lastMeasuredWidth = width
                context.coordinator.lastMeasuredHeight = cachedHeight
            }
            return
        }

        let size = nsView.boundingSize(for: width)
        let height = ceil(size.height)
        MarkdownDocumentRenderer.cacheHeight(height, documentKey: documentKey, width: width)
        nsView.frame.size.height = height
        context.coordinator.lastMeasuredWidth = width
        context.coordinator.lastMeasuredHeight = height
    }

    final class Coordinator {
        var lastDocumentKey: String?
        var lastContent: MarkdownView.PreprocessedContent?
        var lastMeasuredWidth: CGFloat?
        var lastMeasuredHeight: CGFloat?
    }
}
#else
private struct CachedMarkdownTextViewRepresentable: View {
    let documentKey: String
    let preprocessedContent: MarkdownView.PreprocessedContent
    let theme: MarkdownTheme

    var body: some View {
        MarkdownView(preprocessedContent, theme: theme)
    }
}
#endif

extension MainViewModel.DocumentTab {
    var isMarkdown: Bool {
        path.lowercased().hasSuffix(".md")
    }
}

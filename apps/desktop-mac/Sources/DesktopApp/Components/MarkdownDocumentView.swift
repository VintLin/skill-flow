import Foundation
import SwiftUI
import Textual
#if canImport(AppKit)
import AppKit
#endif

struct MarkdownDocumentView: View, Equatable {
    struct Model: Equatable {
        let descriptor: DocumentDescriptor
        let content: String?
        let metadata: [MetadataEntry]

        init(
            descriptor: DocumentDescriptor,
            content: String?,
            metadata: [MetadataEntry]
        ) {
            self.descriptor = descriptor
            self.content = content
            self.metadata = metadata
        }

        init(document: DocumentTab) {
            self.init(
                descriptor: document.descriptor,
                content: document.isLoaded ? document.content : nil,
                metadata: document.metadata
            )
        }

        var renderCacheKey: String {
            descriptor.renderCacheKey
        }

        var isMarkdown: Bool {
            descriptor.path.lowercased().hasSuffix(".md")
        }

        var hasRenderableContent: Bool {
            !(content?.isEmpty ?? true)
        }

        static func == (lhs: Self, rhs: Self) -> Bool {
            lhs.descriptor.renderCacheKey == rhs.descriptor.renderCacheKey &&
                lhs.metadata == rhs.metadata &&
                lhs.hasRenderableContent == rhs.hasRenderableContent
        }
    }

    let model: Model
    let theme: DesktopThemeMode
    @State private var renderedContent: AttributedString?

    nonisolated static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.model == rhs.model && lhs.theme == rhs.theme
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !model.metadata.isEmpty {
                metadataTable(model.metadata)
            }

            if let content = model.content {
                if !content.isEmpty {
                    if let renderedContent {
                        StructuredText(
                            content,
                            parser: CachedAttributedStringParser(attributedString: renderedContent)
                        )
                        .textual.structuredTextStyle(.gitHub)
                        .textual.textSelection(.enabled)
                        .environment(\.openURL, openURLAction)
                        .id(model.renderCacheKey)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        loadingState
                    }
                }
            } else {
                loadingState
            }
        }
        .environment(\.colorScheme, colorScheme)
        .task(id: model.renderCacheKey) {
            await prepareRenderedContent()
        }
    }

    private func metadataTable(_ metadata: [MetadataEntry]) -> some View {
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
        guard let content = model.content, !content.isEmpty else {
            renderedContent = nil
            return
        }

        if let cached = MarkdownDocumentRenderer.shared.cachedContent(for: model.renderCacheKey) {
            renderedContent = cached
            return
        }

        renderedContent = nil
        let renderCacheKey = model.renderCacheKey
        let rendered = await MarkdownDocumentRenderer.shared.renderedContent(for: model)
        guard !Task.isCancelled, renderCacheKey == model.renderCacheKey else {
            return
        }
        renderedContent = rendered
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

extension DocumentTab {
    var isMarkdown: Bool {
        path.lowercased().hasSuffix(".md")
    }
}

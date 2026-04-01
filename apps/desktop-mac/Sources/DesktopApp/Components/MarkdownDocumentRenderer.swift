import Foundation
import Textual

@MainActor
final class MarkdownDocumentRenderer {
    typealias RenderAction = @Sendable (MainViewModel.DocumentTab) async -> AttributedString

    static let shared = MarkdownDocumentRenderer()

    private var cache: [String: AttributedString] = [:]
    private var inFlightTasks: [String: Task<AttributedString, Never>] = [:]
    private let renderAction: RenderAction

    init(renderAction: @escaping RenderAction) {
        self.renderAction = renderAction
    }

    convenience init(_ renderAction: @escaping RenderAction) {
        self.init(renderAction: renderAction)
    }

    convenience init() {
        self.init(renderAction: Self.defaultRenderAction)
    }

    func cachedContent(for renderCacheKey: String) -> AttributedString? {
        cache[renderCacheKey]
    }

    func renderedContent(for document: MainViewModel.DocumentTab) async -> AttributedString {
        if let cached = cache[document.renderCacheKey] {
            return cached
        }

        if let existingTask = inFlightTasks[document.renderCacheKey] {
            return await existingTask.value
        }

        let task = Task { [renderAction] in
            await renderAction(document)
        }
        inFlightTasks[document.renderCacheKey] = task

        let rendered = await task.value
        cache[document.renderCacheKey] = rendered
        inFlightTasks[document.renderCacheKey] = nil
        return rendered
    }

    private static func defaultRenderAction(document: MainViewModel.DocumentTab) async -> AttributedString {
        await Task.detached(priority: .userInitiated) {
            let options = AttributedString.MarkdownParsingOptions()
            return (try? AttributedString(
                markdown: document.content,
                including: \.textual,
                options: options
            )) ?? AttributedString()
        }.value
    }
}

struct CachedAttributedStringParser: MarkupParser {
    let attributedString: AttributedString

    func attributedString(for input: String) throws -> AttributedString {
        attributedString
    }
}

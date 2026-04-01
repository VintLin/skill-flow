import Foundation
import Textual

@MainActor
final class MarkdownDocumentRenderer {
    typealias RenderAction = @Sendable (MarkdownDocumentView.Model) async -> AttributedString

    private struct InFlightRender {
        let token: UUID
        let task: Task<AttributedString, Never>
        var waiterCount: Int
    }

    static let shared = MarkdownDocumentRenderer()

    private var cache: [String: AttributedString] = [:]
    private var inFlightTasks: [String: InFlightRender] = [:]
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

    func reset(renderCacheKey: String) {
        cache[renderCacheKey] = nil
        inFlightTasks[renderCacheKey]?.task.cancel()
        inFlightTasks[renderCacheKey] = nil
    }

    func renderedContent(for document: MarkdownDocumentView.Model) async -> AttributedString {
        if let cached = cache[document.renderCacheKey] {
            return cached
        }

        let task: Task<AttributedString, Never>
        let token: UUID
        if let existing = inFlightTasks[document.renderCacheKey], existing.task.isCancelled {
            inFlightTasks[document.renderCacheKey] = nil
        }
        if var existing = inFlightTasks[document.renderCacheKey] {
            existing.waiterCount += 1
            inFlightTasks[document.renderCacheKey] = existing
            task = existing.task
            token = existing.token
        } else {
            let createdTask = Task(priority: .userInitiated) { [renderAction] in
                await renderAction(document)
            }
            let entry = InFlightRender(token: UUID(), task: createdTask, waiterCount: 1)
            inFlightTasks[document.renderCacheKey] = entry
            task = createdTask
            token = entry.token
        }

        return await withTaskCancellationHandler {
            let rendered = await task.value
            guard !Task.isCancelled else {
                clearInFlightIfCurrent(for: document.renderCacheKey, token: token)
                return rendered
            }
            finishRenderIfCurrent(rendered, for: document.renderCacheKey, token: token)
            return rendered
        } onCancel: {
            Task { @MainActor [self] in
                cancelWaiter(for: document.renderCacheKey, token: token)
            }
        }
    }

    private static func defaultRenderAction(document: MarkdownDocumentView.Model) async -> AttributedString {
        await withTaskGroup(of: AttributedString.self, returning: AttributedString.self) { group in
            group.addTask(priority: .userInitiated) {
                guard !Task.isCancelled else {
                    return AttributedString()
                }
                let options = AttributedString.MarkdownParsingOptions()
                let rendered = (try? AttributedString(
                    markdown: document.content ?? "",
                    including: \.textual,
                    options: options
                )) ?? AttributedString()
                return Task.isCancelled ? AttributedString() : rendered
            }

            let rendered = await group.next() ?? AttributedString()
            group.cancelAll()
            return rendered
        }
    }

    private func finishRenderIfCurrent(_ rendered: AttributedString, for renderCacheKey: String, token: UUID) {
        guard let entry = inFlightTasks[renderCacheKey], entry.token == token else {
            return
        }
        cache[renderCacheKey] = rendered
        inFlightTasks[renderCacheKey] = nil
    }

    private func clearInFlightIfCurrent(for renderCacheKey: String, token: UUID) {
        guard let entry = inFlightTasks[renderCacheKey], entry.token == token else {
            return
        }
        inFlightTasks[renderCacheKey] = nil
    }

    private func cancelWaiter(for renderCacheKey: String, token: UUID) {
        guard var entry = inFlightTasks[renderCacheKey], entry.token == token else {
            return
        }
        entry.waiterCount -= 1
        if entry.waiterCount <= 0 {
            entry.task.cancel()
            inFlightTasks[renderCacheKey] = nil
            return
        }
        inFlightTasks[renderCacheKey] = entry
    }
}

struct CachedAttributedStringParser: MarkupParser {
    let attributedString: AttributedString

    func attributedString(for input: String) throws -> AttributedString {
        attributedString
    }
}

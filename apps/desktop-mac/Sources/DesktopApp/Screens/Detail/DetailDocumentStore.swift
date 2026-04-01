import Foundation

@MainActor
final class DetailDocumentStore {
    struct LoadedDocument: Equatable, Sendable {
        let id: String
        let metadata: [MainViewModel.MetadataEntry]
        let content: String
        let renderCacheKey: String
    }

    private struct InFlightLoad {
        let token: UUID
        let task: Task<LoadedDocument, Error>
        var waiterCount: Int
    }

    typealias FileReader = @Sendable (String) throws -> String

    private var cache: [String: LoadedDocument] = [:]
    private var inFlight: [String: InFlightLoad] = [:]
    private var loadCountsByPath: [String: Int] = [:]
    private let fileReader: FileReader

    init(fileReader: @escaping FileReader = DetailDocumentStore.defaultFileReader) {
        self.fileReader = fileReader
    }

    func document(for descriptor: MainViewModel.DocumentDescriptor) async throws -> LoadedDocument {
        if let cached = cache[descriptor.renderCacheKey] {
            return cached
        }
        let task: Task<LoadedDocument, Error>
        let token: UUID
        if let existing = inFlight[descriptor.renderCacheKey], existing.task.isCancelled {
            inFlight[descriptor.renderCacheKey] = nil
        }
        if var existing = inFlight[descriptor.renderCacheKey] {
            existing.waiterCount += 1
            inFlight[descriptor.renderCacheKey] = existing
            task = existing.task
            token = existing.token
        } else {
            let createdTask = Task(priority: .userInitiated) { [fileReader, descriptor] in
                try await Self.loadDocument(fileReader: fileReader, descriptor: descriptor)
            }
            let entry = InFlightLoad(token: UUID(), task: createdTask, waiterCount: 1)
            inFlight[descriptor.renderCacheKey] = entry
            loadCountsByPath[descriptor.path, default: 0] += 1
            task = createdTask
            token = entry.token
        }

        return try await withTaskCancellationHandler {
            do {
                let loaded = try await task.value
                try Task.checkCancellation()
                finishLoadIfCurrent(loaded, for: descriptor.renderCacheKey, token: token)
                return loaded
            } catch {
                clearInFlightIfCurrent(for: descriptor.renderCacheKey, token: token)
                throw error
            }
        } onCancel: {
            Task { @MainActor [self] in
                cancelWaiter(for: descriptor.renderCacheKey, token: token)
            }
        }
    }

    func debugLoadCount(for path: String) -> Int {
        loadCountsByPath[path, default: 0]
    }

    nonisolated private static func defaultFileReader(path: String) throws -> String {
        try String(contentsOfFile: path, encoding: .utf8)
    }

    private func finishLoadIfCurrent(_ loaded: LoadedDocument, for renderCacheKey: String, token: UUID) {
        guard let entry = inFlight[renderCacheKey], entry.token == token else {
            return
        }
        cache[renderCacheKey] = loaded
        inFlight[renderCacheKey] = nil
    }

    private func clearInFlightIfCurrent(for renderCacheKey: String, token: UUID) {
        guard let entry = inFlight[renderCacheKey], entry.token == token else {
            return
        }
        inFlight[renderCacheKey] = nil
    }

    private func cancelWaiter(for renderCacheKey: String, token: UUID) {
        guard var entry = inFlight[renderCacheKey], entry.token == token else {
            return
        }
        entry.waiterCount -= 1
        if entry.waiterCount <= 0 {
            entry.task.cancel()
            inFlight[renderCacheKey] = nil
            return
        }
        inFlight[renderCacheKey] = entry
    }

    nonisolated private static func loadDocument(
        fileReader: @escaping FileReader,
        descriptor: MainViewModel.DocumentDescriptor
    ) async throws -> LoadedDocument {
        try await withThrowingTaskGroup(of: LoadedDocument.self) { group in
            group.addTask(priority: .userInitiated) {
                try Task.checkCancellation()
                let raw = try readRawDocument(fileReader: fileReader, descriptor: descriptor)
                try Task.checkCancellation()
                let parsed = MainViewModel.parseDetailDocument(raw)
                try Task.checkCancellation()
                return LoadedDocument(
                    id: descriptor.id,
                    metadata: parsed.metadata,
                    content: parsed.body,
                    renderCacheKey: descriptor.renderCacheKey
                )
            }

            let loaded = try await group.next() ?? {
                throw CancellationError()
            }()
            group.cancelAll()
            return loaded
        }
    }

    nonisolated private static func readRawDocument(
        fileReader: @escaping FileReader,
        descriptor: MainViewModel.DocumentDescriptor
    ) throws -> String {
        do {
            return try fileReader(descriptor.path)
        } catch {
            let nsError = error as NSError
            if nsError.domain == NSCocoaErrorDomain, nsError.code == NSFileReadNoSuchFileError {
                let title = descriptor.title
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                return title == "SKILL.md"
                    ? MainViewModel.localizedWarmup("detail.document.skill_unavailable")
                    : "\(title.isEmpty ? "Document" : title) unavailable."
            }
            throw error
        }
    }
}

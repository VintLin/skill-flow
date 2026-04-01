import Foundation

@MainActor
final class DetailDocumentStore {
    struct LoadedDocument: Equatable {
        let id: String
        let metadata: [MainViewModel.MetadataEntry]
        let content: String
        let renderCacheKey: String
    }

    typealias FileReader = @Sendable (String) throws -> String

    private var cache: [String: LoadedDocument] = [:]
    private var inFlight: [String: Task<LoadedDocument, Error>] = [:]
    private var loadCountsByPath: [String: Int] = [:]
    private let fileReader: FileReader

    init(fileReader: @escaping FileReader = { path in
        if let content = try? String(contentsOfFile: path, encoding: .utf8) {
            return content
        }
        return MainViewModel.localizedWarmup("detail.document.skill_unavailable")
    }) {
        self.fileReader = fileReader
    }

    func document(for descriptor: MainViewModel.DocumentDescriptor) async throws -> LoadedDocument {
        if let cached = cache[descriptor.id] {
            return cached
        }
        if let task = inFlight[descriptor.id] {
            return try await task.value
        }

        let task = Task { [fileReader] in
            let raw = try fileReader(descriptor.path)
            let parsed = MainViewModel.parseDetailDocument(raw)
            return LoadedDocument(
                id: descriptor.id,
                metadata: parsed.metadata,
                content: parsed.body,
                renderCacheKey: descriptor.renderCacheKey
            )
        }
        inFlight[descriptor.id] = task
        loadCountsByPath[descriptor.path, default: 0] += 1

        do {
            let loaded = try await task.value
            cache[descriptor.id] = loaded
            inFlight[descriptor.id] = nil
            return loaded
        } catch {
            inFlight[descriptor.id] = nil
            throw error
        }
    }

    func loadSynchronously(for descriptor: MainViewModel.DocumentDescriptor) throws -> LoadedDocument {
        if let cached = cache[descriptor.id] {
            return cached
        }

        loadCountsByPath[descriptor.path, default: 0] += 1
        let raw = try fileReader(descriptor.path)
        let parsed = MainViewModel.parseDetailDocument(raw)
        let loaded = LoadedDocument(
            id: descriptor.id,
            metadata: parsed.metadata,
            content: parsed.body,
            renderCacheKey: descriptor.renderCacheKey
        )
        cache[descriptor.id] = loaded
        return loaded
    }

    func debugLoadCount(for path: String) -> Int {
        loadCountsByPath[path, default: 0]
    }
}

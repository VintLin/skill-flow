import Foundation

@MainActor
final class DetailDocumentStore {
    struct LoadedDocument: Equatable, Sendable {
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

    init(fileReader: @escaping FileReader = DetailDocumentStore.defaultFileReader) {
        self.fileReader = fileReader
    }

    func document(for descriptor: MainViewModel.DocumentDescriptor) async throws -> LoadedDocument {
        if let cached = cache[descriptor.renderCacheKey] {
            return cached
        }
        if let task = inFlight[descriptor.renderCacheKey] {
            return try await task.value
        }

        let task = Task.detached { [fileReader, descriptor] in
            let raw: String
            do {
                raw = try fileReader(descriptor.path)
            } catch {
                let nsError = error as NSError
                if nsError.domain == NSCocoaErrorDomain, nsError.code == NSFileReadNoSuchFileError {
                    let title = descriptor.title
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    raw = title == "SKILL.md"
                        ? MainViewModel.localizedWarmup("detail.document.skill_unavailable")
                        : "\(title.isEmpty ? "Document" : title) unavailable."
                } else {
                    throw error
                }
            }
            let parsed = MainViewModel.parseDetailDocument(raw)
            return LoadedDocument(
                id: descriptor.id,
                metadata: parsed.metadata,
                content: parsed.body,
                renderCacheKey: descriptor.renderCacheKey
            )
        }
        inFlight[descriptor.renderCacheKey] = task
        loadCountsByPath[descriptor.path, default: 0] += 1

        do {
            let loaded = try await task.value
            cache[descriptor.renderCacheKey] = loaded
            inFlight[descriptor.renderCacheKey] = nil
            return loaded
        } catch {
            inFlight[descriptor.renderCacheKey] = nil
            throw error
        }
    }

    func debugLoadCount(for path: String) -> Int {
        loadCountsByPath[path, default: 0]
    }

    nonisolated private static func defaultFileReader(path: String) throws -> String {
        try String(contentsOfFile: path, encoding: .utf8)
    }
}

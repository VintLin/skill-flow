import Foundation

enum BridgeClientError: Error, LocalizedError {
    case helperMissing
    case invalidResponse
    case commandFailed(String)
    case timeout(UInt64)
    case emptyResponse
    case concurrentMutationRejected

    private var locale: Locale {
        let rawValue = UserDefaults.standard.string(forKey: DesktopLanguage.storageKey) ?? DesktopLanguage.system.rawValue
        return DesktopLanguage(storageValue: rawValue).locale
    }

    var errorDescription: String? {
        switch self {
        case .helperMissing:
            return L10n.string("bridge.error.helper_missing", locale: locale)
        case .invalidResponse:
            return L10n.string("bridge.error.invalid_response", locale: locale)
        case .commandFailed(let message):
            return message
        case .timeout(let timeoutMs):
            return L10n.string("bridge.error.timeout", locale: locale, arguments: [String(timeoutMs)])
        case .emptyResponse:
            return L10n.string("bridge.error.empty_response", locale: locale)
        case .concurrentMutationRejected:
            return L10n.string("bridge.error.concurrent_mutation", locale: locale)
        }
    }
}

final class BridgeClient: @unchecked Sendable {
    private final class ThreadSafeBuffer: @unchecked Sendable {
        private var data = Data()
        private let lock = NSLock()

        func append(_ chunk: Data) {
            lock.lock()
            data.append(chunk)
            lock.unlock()
        }

        func snapshot() -> Data {
            lock.lock()
            defer { lock.unlock() }
            return data
        }
    }

    private let mutationCoordinator = MutationCoordinator()

    func bootstrap() async throws -> BridgeResponse {
        try await send(command: .bootstrap)
    }

    func list() async throws -> BridgeResponse {
        try await send(command: .list)
    }

    func inspect(sourceId: String) async throws -> BridgeResponse {
        try await send(command: .inspect, payload: ["sourceId": AnyCodable(sourceId)])
    }

    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse {
        try await send(command: .inspectEnrichment, payload: ["sourceId": AnyCodable(sourceId)])
    }

    func searchImportGroups(query: String?) async throws -> BridgeResponse {
        let payload: [String: AnyCodable]
        if let query {
            payload = ["query": AnyCodable(query)]
        } else {
            payload = [:]
        }
        return try await send(command: .searchImportGroups, payload: payload)
    }

    func previewImportSource(locator: String) async throws -> BridgeResponse {
        try await send(command: .previewImportSource, payload: ["locator": AnyCodable(locator)])
    }

    func importSource(locator: String, selectedSkillIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(
                command: .importSource,
                payload: [
                    "locator": AnyCodable(locator),
                    "draft": AnyCodable([
                        "selectedSkillIds": selectedSkillIds,
                        "enabledTargets": enabledTargets,
                    ]),
                ]
            )
        }
    }

    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(command: .togglePin, payload: ["sourceId": AnyCodable(sourceId)])
        }
    }

    func doctor() async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(command: .doctor)
        }
    }

    func updateAll() async throws -> BridgeResponse {
        try await updateSources(nil)
    }

    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            let payload: [String: AnyCodable]
            if let sourceIds {
                payload = ["sourceIds": AnyCodable(sourceIds)]
            } else {
                payload = ["sourceIds": AnyCodable([String]())]
            }
            return try await self.send(command: .update, payload: payload)
        }
    }

    func uninstall(sourceIds: [String]) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(command: .uninstall, payload: ["sourceIds": AnyCodable(sourceIds)])
        }
    }

    func apply(sourceId: String, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(
                command: .apply,
                payload: [
                    "sourceId": AnyCodable(sourceId),
                    "draft": AnyCodable([
                        "selectedLeafIds": selectedLeafIds,
                        "enabledTargets": enabledTargets,
                    ]),
                ]
            )
        }
    }

    private func send(command: BridgeCommand, payload: [String: AnyCodable]? = nil) async throws -> BridgeResponse {
        let helperURL = try resolveHelperURL()
        let request = BridgeRequest(command: command, payload: payload)
        let requestData = try JSONEncoder().encode(request)
        let nodeExecutable = resolveNodeExecutable()

        let process = Process()
        if nodeExecutable == "node" {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["node", helperURL.path, "bridge", "--json"]
        } else {
            process.executableURL = URL(fileURLWithPath: nodeExecutable)
            process.arguments = [helperURL.path, "bridge", "--json"]
        }

        let inputPipe = Pipe()
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardInput = inputPipe
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        let outputBuffer = ThreadSafeBuffer()
        let errorBuffer = ThreadSafeBuffer()
        let exitStream = AsyncStream<Void> { continuation in
            process.terminationHandler = { _ in
                continuation.yield(())
                continuation.finish()
            }
        }
        var exitIterator = exitStream.makeAsyncIterator()

        outputPipe.fileHandleForReading.readabilityHandler = { handle in
            let chunk = handle.availableData
            guard !chunk.isEmpty else { return }
            outputBuffer.append(chunk)
        }
        errorPipe.fileHandleForReading.readabilityHandler = { handle in
            let chunk = handle.availableData
            guard !chunk.isEmpty else { return }
            errorBuffer.append(chunk)
        }

        try process.run()
        inputPipe.fileHandleForWriting.write(requestData)
        inputPipe.fileHandleForWriting.closeFile()

        _ = await exitIterator.next()
        process.terminationHandler = nil

        outputPipe.fileHandleForReading.readabilityHandler = nil
        errorPipe.fileHandleForReading.readabilityHandler = nil

        // Drain any remaining buffered bytes after process exit.
        let outputTail = outputPipe.fileHandleForReading.readDataToEndOfFile()
        if !outputTail.isEmpty {
            outputBuffer.append(outputTail)
        }
        let errorTail = errorPipe.fileHandleForReading.readDataToEndOfFile()
        if !errorTail.isEmpty {
            errorBuffer.append(errorTail)
        }

        let outputData = outputBuffer.snapshot()
        let errorData = errorBuffer.snapshot()

        guard !outputData.isEmpty else {
            if !errorData.isEmpty {
                let stderrMessage = String(decoding: errorData, as: UTF8.self)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !stderrMessage.isEmpty {
                    throw BridgeClientError.commandFailed(stderrMessage)
                }
            }
            throw BridgeClientError.emptyResponse
        }

        let response = try JSONDecoder().decode(BridgeResponse.self, from: outputData)
        if response.ok {
            return response
        }

        let message: String
        if !response.errors.isEmpty {
            message = response.errors.map(\.message).joined(separator: "\n")
        } else if !errorData.isEmpty {
            message = String(decoding: errorData, as: UTF8.self)
        } else {
            let rawValue = UserDefaults.standard.string(forKey: DesktopLanguage.storageKey) ?? DesktopLanguage.system.rawValue
            let locale = DesktopLanguage(storageValue: rawValue).locale
            message = L10n.string("bridge.error.command_failed_default", locale: locale)
        }
        throw BridgeClientError.commandFailed(message)
    }

    private func resolveHelperURL() throws -> URL {
        #if DEBUG
        if let override = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"], !override.isEmpty {
            return URL(fileURLWithPath: override)
        }
        #endif

        if let bundledHelperURL = existingURL(at: Bundle.main.bundleURL
            .appendingPathComponent("Contents/Resources/helper/dist/cli.js")) {
            return bundledHelperURL
        }

        if let resourcePath = Bundle.main.path(forResource: "cli", ofType: "js", inDirectory: "helper/dist"),
           let bundledHelperURL = existingURL(at: URL(fileURLWithPath: resourcePath)) {
            return bundledHelperURL
        }

        let fallbackCandidates = [
            Bundle.main.bundleURL
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appending(path: "apps/cli/dist/cli.js"),
            URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
                .appending(path: "apps/cli/dist/cli.js"),
        ]

        for candidate in fallbackCandidates {
            if let existing = existingURL(at: candidate) {
                return existing
            }
        }

        throw BridgeClientError.helperMissing
    }

    private func existingURL(at url: URL) -> URL? {
        FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    private func resolveNodeExecutable() -> String {
        #if DEBUG
        if let override = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_NODE_OVERRIDE"],
           !override.isEmpty {
            return override
        }
        #endif

        let commonNodePaths = [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]

        for path in commonNodePaths where FileManager.default.fileExists(atPath: path) {
            return path
        }

        return "node"
    }
}

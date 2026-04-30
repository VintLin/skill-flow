import Foundation

enum RuntimeDependency: String {
    case node
    case git
    case npx
}

enum BridgeClientError: Error, LocalizedError {
    case helperMissing
    case invalidResponse
    case commandFailed(String, response: BridgeResponse? = nil)
    case timeout(UInt64)
    case emptyResponse
    case concurrentMutationRejected
    case missingDependency(RuntimeDependency)

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
        case .commandFailed(let message, _):
            return message
        case .timeout(let timeoutMs):
            return L10n.string("bridge.error.timeout", locale: locale, arguments: [String(timeoutMs)])
        case .emptyResponse:
            return L10n.string("bridge.error.empty_response", locale: locale)
        case .concurrentMutationRejected:
            return L10n.string("bridge.error.concurrent_mutation", locale: locale)
        case .missingDependency(let dependency):
            return L10n.string(
                "bridge.error.missing_dependency.\(dependency.rawValue)",
                locale: locale,
                arguments: [BridgeClient.desktopPrerequisitesURL.absoluteString]
            )
        }
    }
}

final class BridgeClient: @unchecked Sendable {
    static let desktopPrerequisitesURL = URL(string: "https://github.com/VintLin/skill-flow#desktop-prerequisites")!

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

    func inspect(sourceId: String, scope: ProjectScopeSelection = .global) async throws -> BridgeResponse {
        try await send(
            command: .inspect,
            payload: [
                "sourceId": AnyCodable(sourceId),
                "scope": AnyCodable(scope.bridgePayload),
            ]
        )
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

    func saveSettings(customTargets: [[String: String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(
                command: .saveSettings,
                payload: [
                    "customTargets": AnyCodable(customTargets),
                    "agentDisplayOrder": AnyCodable(agentDisplayOrder),
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

    func apply(sourceId: String, scope: ProjectScopeSelection = .global, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(
                command: .apply,
                payload: [
                    "sourceId": AnyCodable(sourceId),
                    "scope": AnyCodable(scope.bridgePayload),
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
        let nodeExecutable = Self.resolveNodeExecutable()
        try validateEnvironment(command: command, payload: payload, nodeExecutable: nodeExecutable)

        let process = Process()
        if nodeExecutable == "node" {
            process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
            process.arguments = ["node", helperURL.path, "bridge", "--json"]
        } else {
            process.executableURL = URL(fileURLWithPath: nodeExecutable)
            process.arguments = [helperURL.path, "bridge", "--json"]
        }
        process.environment = ProcessInfo.processInfo.environment.merging([
            "SKILL_FLOW_CALLER": "desktop-bridge"
        ]) { _, new in new }

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
                    if let dependencyError = Self.dependencyError(for: stderrMessage) {
                        throw dependencyError
                    }
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
        if let dependencyError = Self.dependencyError(for: message) {
            throw dependencyError
        }
        throw BridgeClientError.commandFailed(message, response: response)
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

    static func resolveNodeExecutable(
        bundleURL: URL = Bundle.main.bundleURL,
        architecture: String = BridgeClient.currentNodeArchitecture,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }
    ) -> String {
        #if DEBUG
        if let override = environment["SKILL_FLOW_DESKTOP_NODE_OVERRIDE"],
           !override.isEmpty {
            return override
        }
        #endif

        let bundledNodePath = bundleURL
            .appendingPathComponent("Contents/Resources/node/\(architecture)/bin/node")
            .path
        if isExecutable(bundledNodePath) {
            return bundledNodePath
        }

        let commonNodePaths = [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]

        for path in commonNodePaths where isExecutable(path) {
            return path
        }

        return "node"
    }

    private static var currentNodeArchitecture: String {
        #if arch(arm64)
        "arm64"
        #elseif arch(x86_64)
        "x86_64"
        #else
        "unknown"
        #endif
    }

    private func validateEnvironment(
        command: BridgeCommand,
        payload: [String: AnyCodable]?,
        nodeExecutable: String
    ) throws {
        guard isNodeAvailable(nodeExecutable) else {
            throw BridgeClientError.missingDependency(.node)
        }

        guard let locator = locator(from: payload) else {
            return
        }

        if locator.hasPrefix("clawhub:"), !isCommandAvailable("npx") {
            throw BridgeClientError.missingDependency(.npx)
        }

        if requiresGit(locator: locator), !isCommandAvailable("git") {
            throw BridgeClientError.missingDependency(.git)
        }
    }

    private func locator(from payload: [String: AnyCodable]?) -> String? {
        payload?["locator"]?.value as? String
    }

    private func requiresGit(locator: String) -> Bool {
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed.hasPrefix("clawhub:") {
            return false
        }

        let lowercased = trimmed.lowercased()
        if lowercased.contains("github.com") || isGitHubShorthand(trimmed) {
            return false
        }

        return
            lowercased.hasPrefix("git@") ||
            lowercased.hasPrefix("http://") ||
            lowercased.hasPrefix("https://")
    }

    private func isGitHubShorthand(_ locator: String) -> Bool {
        let parts = locator.split(separator: "/")
        return parts.count == 2 && !locator.contains("://") && !locator.contains(":")
    }

    private func isNodeAvailable(_ nodeExecutable: String) -> Bool {
        if nodeExecutable == "node" {
            return isCommandAvailable("node")
        }
        return FileManager.default.isExecutableFile(atPath: nodeExecutable)
    }

    private func isCommandAvailable(_ command: String) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [command, "--version"]
        process.standardOutput = Pipe()
        process.standardError = Pipe()

        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }

    static func dependencyError(for message: String) -> BridgeClientError? {
        let lowercased = message.lowercased()

        if lowercased.contains("spawn npx enoent") || lowercased.contains("npx: command not found") {
            return .missingDependency(.npx)
        }

        if lowercased.contains("spawn git enoent") || lowercased.contains("git: command not found") {
            return .missingDependency(.git)
        }

        if lowercased.contains("spawn node enoent") || lowercased.contains("node: command not found") {
            return .missingDependency(.node)
        }

        return nil
    }
}

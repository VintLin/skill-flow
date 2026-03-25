import Foundation

enum BridgeClientError: Error, LocalizedError {
    case helperMissing
    case invalidResponse
    case commandFailed(String)
    case timeout(UInt64)
    case emptyResponse
    case concurrentMutationRejected

    var errorDescription: String? {
        switch self {
        case .helperMissing:
            return "Bundled helper is missing. Reinstall Skill Flow Desktop."
        case .invalidResponse:
            return "Bridge helper returned an invalid response."
        case .commandFailed(let message):
            return message
        case .timeout(let timeoutMs):
            return "Operation timed out after \(timeoutMs)ms."
        case .emptyResponse:
            return "Bridge helper returned an empty response."
        case .concurrentMutationRejected:
            return "Another write task is already running."
        }
    }
}

@MainActor
final class BridgeClient {
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

    func doctor() async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(command: .doctor)
        }
    }

    func updateAll() async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(command: .update, payload: ["sourceIds": AnyCodable([String]())])
        }
    }

    func uninstall(sourceIds: [String]) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(command: .uninstall, payload: ["sourceIds": AnyCodable(sourceIds)])
        }
    }

    func add(locator: String, applyNow: Bool = false) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(
                command: .add,
                payload: [
                    "locator": AnyCodable(locator),
                    "applyNow": AnyCodable(applyNow)
                ]
            )
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

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["node", helperURL.path, "bridge", "--json"]

        let inputPipe = Pipe()
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardInput = inputPipe
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        try process.run()
        inputPipe.fileHandleForWriting.write(requestData)
        inputPipe.fileHandleForWriting.closeFile()

        process.waitUntilExit()

        let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
        let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()

        guard !outputData.isEmpty else {
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
            message = "Unknown bridge command failure."
        }
        throw BridgeClientError.commandFailed(message)
    }

    private func resolveHelperURL() throws -> URL {
        #if DEBUG
        if let override = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"], !override.isEmpty {
            return URL(fileURLWithPath: override)
        }
        #endif

        if let resourcePath = Bundle.main.path(forResource: "cli", ofType: "js", inDirectory: "helper/dist") {
            return URL(fileURLWithPath: resourcePath)
        }

        if let resourcePath = Bundle.main.path(forResource: "skill-flow-helper", ofType: nil) {
            return URL(fileURLWithPath: resourcePath)
        }

        // Development fallback for local runs outside bundled app.
        let cwdFallback = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appending(path: "apps/cli/dist/cli.js")
        if FileManager.default.fileExists(atPath: cwdFallback.path) {
            return cwdFallback
        }

        throw BridgeClientError.helperMissing
    }
}

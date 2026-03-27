import Foundation

struct DesktopRuntimeDependencies {
    let bootstrap: @MainActor () async throws -> BridgeResponse
    let inspect: @MainActor (String) async throws -> BridgeResponse

    init(
        bootstrap: @escaping @MainActor () async throws -> BridgeResponse,
        inspect: @escaping @MainActor (String) async throws -> BridgeResponse
    ) {
        self.bootstrap = bootstrap
        self.inspect = inspect
    }
}

extension DesktopRuntimeDependencies {
    static func live() -> Self {
        Self(
            bootstrap: {
                try await BridgeClient().bootstrap()
            },
            inspect: { sourceId in
                try await BridgeClient().inspect(sourceId: sourceId)
            }
        )
    }

    static func preview() -> Self {
        Self(
            bootstrap: {
                BridgeResponse(
                    protocolVersion: "1.0",
                    requestId: "preview-bootstrap",
                    command: .bootstrap,
                    ok: true,
                    data: AnyCodable([
                        "summaries": []
                    ]),
                    warnings: [],
                    errors: []
                )
            },
            inspect: { sourceId in
                BridgeResponse(
                    protocolVersion: "1.0",
                    requestId: "preview-inspect-\(sourceId)",
                    command: .inspect,
                    ok: true,
                    data: AnyCodable([
                        "sourceId": sourceId
                    ]),
                    warnings: [],
                    errors: []
                )
            }
        )
    }

    static func testing(
        bootstrap: @escaping @MainActor () async throws -> BridgeResponse,
        inspect: @escaping @MainActor (String) async throws -> BridgeResponse
    ) -> Self {
        Self(bootstrap: bootstrap, inspect: inspect)
    }
}

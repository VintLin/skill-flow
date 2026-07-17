import Foundation

struct DesktopRuntimeDependencies {
    let bootstrap: @MainActor () async throws -> [String]

    init(
        bootstrap: @escaping @MainActor () async throws -> [String]
    ) {
        self.bootstrap = bootstrap
    }
}

extension DesktopRuntimeDependencies {
    static func live(query: any DesktopSourceQuerying = DesktopBridgeQueryFacade(bridgeClient: BridgeClient())) -> Self {
        Self(
            bootstrap: {
                let response = try await query.bootstrap()
                return bootstrapSourceIds(from: response)
            }
        )
    }

    static func preview() -> Self {
        Self(
            bootstrap: { [] }
        )
    }

    static func testing(
        bootstrap: @escaping @MainActor () async throws -> [String]
    ) -> Self {
        Self(bootstrap: bootstrap)
    }

    private static func bootstrapSourceIds(from response: BridgeResponse) -> [String] {
        guard let payload = response.data?.value as? [String: Any] else {
            return []
        }

        if let summaries = payload["summaries"] as? [[String: Any]] {
            return summaries.compactMap { $0["sourceId"] as? String }
        }

        if let sourceIds = payload["sourceIds"] as? [String] {
            return sourceIds
        }

        return []
    }
}

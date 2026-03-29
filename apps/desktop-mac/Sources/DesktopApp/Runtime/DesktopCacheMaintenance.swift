import Foundation

struct DesktopCacheMaintenance {
    private let stateRootProvider: () -> String

    init(stateRootProvider: @escaping () -> String = {
        if let override = ProcessInfo.processInfo.environment["SKILL_FLOW_STATE_ROOT"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !override.isEmpty {
            return URL(fileURLWithPath: override).standardizedFileURL.path
        }
        return URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent(".skillflow", isDirectory: true)
            .standardizedFileURL
            .path
    }) {
        self.stateRootProvider = stateRootProvider
    }

    func clearMetadataCache() {
        let root = URL(fileURLWithPath: stateRootProvider()).standardizedFileURL
        let catalogRoot = root.appendingPathComponent("catalog", isDirectory: true)
        let fileManager = FileManager.default

        for fileName in ["import-data.json", "source-metadata.json"] {
            let path = catalogRoot.appendingPathComponent(fileName)
            if fileManager.fileExists(atPath: path.path) {
                try? fileManager.removeItem(at: path)
            }
        }
    }
}

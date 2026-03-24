import Foundation
import Observation

@MainActor
@Observable
final class MainViewModel {
    enum LoadState {
        case idle
        case loading
        case ready
        case failed(String)
    }

    private let bridgeClient: BridgeClient

    var loadState: LoadState = .idle
    var sourceIds: [String] = []
    var selectedSourceId: String?
    var newSourceLocator: String = ""
    var detailText: String = "Select a source to inspect details."
    var healthLabel: String = "Unknown"
    var latestWarnings: [BridgeIssue] = []

    init(bridgeClient: BridgeClient) {
        self.bridgeClient = bridgeClient
    }

    func bootstrap() async {
        loadState = .loading
        do {
            let bootstrap = try await bridgeClient.bootstrap()
            latestWarnings = bootstrap.warnings
            let list = try await bridgeClient.list()
            applyList(list)
            loadState = .ready
            healthLabel = list.warnings.isEmpty ? "Healthy" : "Warnings"
        } catch {
            loadState = .failed(error.localizedDescription)
            healthLabel = "Error"
        }
    }

    func refreshList() async {
        do {
            let response = try await bridgeClient.list()
            applyList(response)
            latestWarnings = response.warnings
        } catch {
            loadState = .failed(error.localizedDescription)
        }
    }

    func selectSource(_ sourceId: String) async {
        selectedSourceId = sourceId
        do {
            let response = try await bridgeClient.inspect(sourceId: sourceId)
            detailText = prettyPrint(response.data?.value) ?? "No details"
            latestWarnings = response.warnings
        } catch {
            detailText = "Inspect failed: \(error.localizedDescription)"
        }
    }

    func runDoctor() async {
        do {
            let response = try await bridgeClient.doctor()
            detailText = prettyPrint(response.data?.value) ?? "No doctor data"
            latestWarnings = response.warnings
            healthLabel = response.warnings.isEmpty ? "Healthy" : "Warnings"
        } catch {
            detailText = "Doctor failed: \(error.localizedDescription)"
            healthLabel = "Error"
        }
    }

    func updateAll() async {
        do {
            _ = try await bridgeClient.updateAll()
            await refreshList()
        } catch {
            detailText = "Update failed: \(error.localizedDescription)"
        }
    }

    func addSource() async {
        let locator = newSourceLocator.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !locator.isEmpty else {
            detailText = "Add failed: source locator is empty."
            return
        }
        do {
            _ = try await bridgeClient.add(locator: locator, applyNow: true)
            newSourceLocator = ""
            await refreshList()
        } catch {
            detailText = "Add failed: \(error.localizedDescription)"
        }
    }

    func uninstallSelectedSource() async {
        guard let selectedSourceId else {
            detailText = "Uninstall failed: no source selected."
            return
        }
        do {
            _ = try await bridgeClient.uninstall(sourceIds: [selectedSourceId])
            self.selectedSourceId = nil
            await refreshList()
            if let first = sourceIds.first {
                await selectSource(first)
            } else {
                detailText = "No sources installed."
            }
        } catch {
            detailText = "Uninstall failed: \(error.localizedDescription)"
        }
    }

    private func applyList(_ response: BridgeResponse) {
        guard
            let data = response.data?.value as? [String: Any],
            let summaries = data["summaries"] as? [[String: Any]]
        else {
            sourceIds = []
            selectedSourceId = nil
            detailText = "No summaries returned."
            return
        }

        sourceIds = summaries.compactMap { summary in
            guard let source = summary["source"] as? [String: Any] else {
                return nil
            }
            return source["id"] as? String
        }

        if selectedSourceId == nil {
            selectedSourceId = sourceIds.first
        }
    }

    private func prettyPrint(_ value: Any?) -> String? {
        guard let value else { return nil }
        guard JSONSerialization.isValidJSONObject(value) else {
            return String(describing: value)
        }
        guard
            let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted]),
            let text = String(data: data, encoding: .utf8)
        else {
            return String(describing: value)
        }
        return text
    }
}

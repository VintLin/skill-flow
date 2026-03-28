import Foundation
import AppKit
import XCTest
import Darwin
import SwiftUI

@testable import SkillFlowDesktop

@MainActor
final class WorkflowCoverageTests: XCTestCase {
    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: "desktop.pinnedSourceIds")
        UserDefaults.standard.removeObject(forKey: "desktop.pinnedSourceIds.migratedToSharedPreferences")
        UserDefaults.standard.set(DesktopLanguage.en.rawValue, forKey: DesktopLanguage.storageKey)
    }

    func testDismissToastIgnoresStaleIdentifier() {
        let model = MainViewModel(bridgeClient: BridgeClient())
        let firstToast = MainViewModel.ToastState(style: .success, message: "First")
        let secondToast = MainViewModel.ToastState(style: .error, message: "Second")

        model.toast = firstToast
        model.toast = secondToast

        model.dismissToast(id: firstToast.id)

        XCTAssertEqual(model.toast, secondToast)

        model.dismissToast(id: secondToast.id)

        XCTAssertNil(model.toast)
    }

    func testPinPersistsAcrossRelaunch() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        await model.togglePinned(sourceId: "alpha")

        XCTAssertEqual(model.pinnedSourceIds, ["alpha"])

        let relaunched = try await fixture.makeModel()
        XCTAssertEqual(relaunched.pinnedSourceIds, ["alpha"])
    }

    func testUnpinPersistsAcrossRelaunch() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.pinnedSourceIds = ["alpha"]
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        XCTAssertEqual(model.pinnedSourceIds, ["alpha"])

        await model.togglePinned(sourceId: "alpha")

        XCTAssertEqual(model.pinnedSourceIds, [])

        let relaunched = try await fixture.makeModel()
        XCTAssertEqual(relaunched.pinnedSourceIds, [])
    }

    func testPinnedSourceMigrationRunsOnlyOnce() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)
        UserDefaults.standard.set(["beta"], forKey: "desktop.pinnedSourceIds")

        let migrated = try await fixture.makeModel()
        XCTAssertEqual(migrated.pinnedSourceIds, ["beta"])
        XCTAssertTrue(UserDefaults.standard.bool(forKey: "desktop.pinnedSourceIds.migratedToSharedPreferences"))
        XCTAssertNil(UserDefaults.standard.stringArray(forKey: "desktop.pinnedSourceIds"))

        UserDefaults.standard.set(["alpha"], forKey: "desktop.pinnedSourceIds")

        let relaunched = try await fixture.makeModel()
        XCTAssertEqual(relaunched.pinnedSourceIds, ["beta"])
    }

    func testDeleteSourceRemovesPinnedStateAndReturnsHomeWhenDetailIsDeleted() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.pinnedSourceIds = ["alpha"]
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        model.currentPage = .detail(sourceId: "alpha")

        await model.deleteSource(sourceId: "alpha")

        XCTAssertEqual(model.currentPage, .home)
        XCTAssertEqual(model.selectedGroupId, "beta")
        XCTAssertEqual(model.pinnedSourceIds, [])
        XCTAssertFalse(model.sourceIds.contains("alpha"))

        let uninstallRequests = fixture.loggedRequests().filter { $0.command == "uninstall" }
        XCTAssertEqual(uninstallRequests.count, 1)
    }

    func testUpdateCurrentGroupUsesSelectedSourceId() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        await model.selectSource("beta")

        await model.updateCurrentGroup()

        let updateRequests = fixture.loggedRequests().filter { $0.command == "update" }
        XCTAssertEqual(updateRequests.count, 1)
        XCTAssertEqual(updateRequests.first?.payload?["sourceIds"]?.value as? [String], ["beta"])
    }

    func testBootstrapUsesBootstrapPayloadWithoutImmediateListOrDoctor() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = MainViewModel(bridgeClient: BridgeClient())
        await model.bootstrap()

        XCTAssertEqual(model.selectedGroupId, "alpha")
        XCTAssertEqual(model.sourceIds, ["alpha", "beta"])

        let commands = fixture.loggedRequests().map(\.command)
        XCTAssertEqual(commands.first, "bootstrap")
        XCTAssertFalse(commands.contains("list"))
        XCTAssertFalse(commands.contains("doctor"))
    }

    func testHomeBootstrapProjectsBridgeSourceIdsIntoFoundationState() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let runtime = DesktopRuntime()
        let container = DesktopAppContainer(runtime: runtime)
        let hostingController = NSHostingController(rootView: container.homeContainer.makeView())
        let window = NSWindow(contentViewController: hostingController)
        window.makeKeyAndOrderFront(nil)

        await waitForCondition(timeoutNanoseconds: 1_500_000_000) {
            self.bootstrapRequestCount(in: fixture) == 1
                && runtime.state.workspace.sourceIds == ["alpha", "beta"]
                && runtime.state.view.selectedSourceId == "alpha"
        }

        container.mainViewModel.sourceIds = ["gamma"]
        container.mainViewModel.selectedSourceId = "gamma"

        await waitForCondition(timeoutNanoseconds: 1_500_000_000) {
            self.bootstrapRequestCount(in: fixture) == 1
                && runtime.state.workspace.sourceIds == ["gamma"]
                && runtime.state.view.selectedSourceId == "gamma"
                && container.homeContainer.viewModel.sourceIds == ["gamma"]
        }

        window.close()

        XCTAssertEqual(self.bootstrapRequestCount(in: fixture), 1)
    }

    func testPinnedWriteFailureRollsBack() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.pinFailures = [
            "alpha": [
                "Shared preferences unavailable."
            ]
        ]
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()

        await model.togglePinned(sourceId: "alpha")

        XCTAssertEqual(model.pinnedSourceIds, [])
        XCTAssertEqual(model.toast?.style, .error)
        XCTAssertEqual(model.toast?.message, "Pin failed: Shared preferences unavailable.")

        let pinRequests = fixture.loggedRequests().filter { $0.command == "toggle-pin" }
        XCTAssertEqual(pinRequests.count, 1)
        XCTAssertEqual(pinRequests.first?.payload?["sourceId"]?.value as? String, "alpha")
    }

    func testUpdateSourceUsesExplicitSourceIdAndClearsBusyState() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        await model.updateSource("alpha")

        let updateRequests = fixture.loggedRequests().filter { $0.command == "update" }
        XCTAssertEqual(updateRequests.count, 1)
        XCTAssertEqual(updateRequests.first?.payload?["sourceIds"]?.value as? [String], ["alpha"])
        XCTAssertFalse(model.isUpdatingSource("alpha"))
        XCTAssertEqual(model.toast?.style, .success)
        XCTAssertEqual(model.toast?.message, "Updated 1 group.")
    }

    func testUpdateAllGroupsFromHomeUpdatesEverySourceAndClearsBusyState() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        await model.updateAllGroupsFromHome()

        let updateRequests = fixture.loggedRequests().filter { $0.command == "update" }
        XCTAssertEqual(updateRequests.count, 1)
        XCTAssertEqual(updateRequests.first?.payload?["sourceIds"]?.value as? [String], ["alpha", "beta"])
        XCTAssertFalse(model.isUpdatingSource("alpha"))
        XCTAssertFalse(model.isUpdatingSource("beta"))
        XCTAssertEqual(model.toast?.style, .success)
        XCTAssertEqual(model.toast?.message, "Updated 2 groups.")
    }

    func testImportPageLoadsRecommendationsAndPreview() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        model.currentPage = .importPage

        await model.loadImportPageIfNeeded()

        XCTAssertEqual(model.importSearchPhase, .ready)
        XCTAssertEqual(model.importSubmittedQuery, "")
        XCTAssertEqual(model.importDisplayGroups.map(\.id), ["anthropics-skills", "garrytan-gstack"])

        await model.previewImportGroupIfNeeded("anthropics-skills")

        let previewed = model.importDisplayGroups.first(where: { $0.id == "anthropics-skills" })
        XCTAssertEqual(previewed?.previewPhase, .ready)
        XCTAssertEqual(previewed?.skills.map(\.id), ["research", "debugging"])
        XCTAssertEqual(previewed?.skills.filter(\.selectedByDefault).map(\.id), ["research", "debugging"])
        XCTAssertEqual(previewed?.targets.map(\.id), ["claude-code", "cursor"])
        XCTAssertEqual(previewed?.targets.filter(\.selectedByDefault).map(\.id), [])
        XCTAssertEqual(previewed?.snapshot?.owner.slug, "anthropics")
        XCTAssertEqual(previewed?.snapshot?.repoStars, 406)
        XCTAssertEqual(previewed?.snapshot?.trust?.labels, ["Official", "Trending"])
        XCTAssertEqual(previewed?.matchedSkills.first?.skillId, "research")
        XCTAssertEqual(previewed?.matchedSkills.first?.installs, 207800)

        let requests = fixture.loggedRequests().map(\.command)
        XCTAssertTrue(requests.contains("search-import-groups"))
        XCTAssertTrue(requests.contains("preview-import-source"))
    }

    func testImportPageSearchReturnsExactGroup() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        await model.submitImportSearch("https://github.com/anthropic/skills.git")

        XCTAssertEqual(model.importSearchPhase, .ready)
        XCTAssertEqual(model.importSubmittedQuery, "https://github.com/anthropic/skills.git")
        XCTAssertEqual(model.importDisplayGroups.map(\.canonicalRepo), ["anthropics/skills"])
    }

    func testImportPageImportSucceedsAndNavigatesToDetail() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        await model.loadImportPageIfNeeded()
        await model.previewImportGroupIfNeeded("anthropics-skills")

        await model.importImportGroup(
            groupId: "anthropics-skills",
            locator: "anthropic/skills",
            selectedSkillIds: ["research"],
            enabledTargets: ["cursor"]
        )

        XCTAssertEqual(model.currentPage, .detail(sourceId: "anthropics-skills"))
        XCTAssertEqual(model.selectedGroupId, "anthropics-skills")
        XCTAssertTrue(model.sourceIds.contains("anthropics-skills"))
        XCTAssertFalse(model.recommendedImportGroups.contains(where: { $0.id == "anthropics-skills" }))
        XCTAssertEqual(model.toast?.style, .success)
        XCTAssertEqual(model.toast?.message, "Imported source.")

        let importRequests = fixture.loggedRequests().filter { $0.command == "import-source" }
        XCTAssertEqual(importRequests.count, 1)
        let draft = importRequests.first?.payload?["draft"]?.value as? [String: Any]
        XCTAssertEqual(draft?["selectedSkillIds"] as? [String], ["research"])
        XCTAssertEqual(draft?["enabledTargets"] as? [String], ["cursor"])
    }

    func testImportPageImportFailureDoesNotLeaveGhostSource() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.importFailures = ["anthropic/skills": "provider_request_failed"]
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        await model.loadImportPageIfNeeded()

        await model.importImportGroup(
            groupId: "anthropics-skills",
            locator: "anthropic/skills",
            selectedSkillIds: ["research"],
            enabledTargets: []
        )

        XCTAssertFalse(model.sourceIds.contains("anthropics-skills"))
        XCTAssertEqual(model.currentPage, .home)
        XCTAssertEqual(model.toast?.style, .error)
        XCTAssertEqual(model.toast?.message, "Import failed: provider_request_failed")
        XCTAssertTrue(model.recommendedImportGroups.contains(where: { $0.id == "anthropics-skills" }))
    }

    func testV120WorkflowCoverage() async throws {
        let fixture = try TestFixture.install()

        try fixture.reset(state: .baseline)

        try await verifyGroupSelectionIsImmediate(using: fixture)

        try fixture.reset(state: .baseline)

        try await verifyAgentToggleWritesImmediately(using: fixture)

        try fixture.reset(state: .baseline)

        try await verifySkillToggleWritesImmediately(using: fixture)

        try fixture.reset(state: .baseline)

        try await verifyDetectedTargetsDefaultAndShowAll(using: fixture)

        try fixture.reset(state: .failureBaseline)

        try await verifyApplyFailureRollsBack(using: fixture)

    }

    private func verifyGroupSelectionIsImmediate(using fixture: TestFixture) async throws {
        let model = try await fixture.makeModel()
        XCTAssertEqual(model.selectedGroupId, "alpha")
        XCTAssertEqual(model.visibleTargets.map(\.id), ["claude-code", "cursor"])

        await model.selectSource("beta")

        XCTAssertEqual(model.selectedGroupId, "beta")
        XCTAssertEqual(fixture.loggedRequests().filter { $0.command == "apply" }.count, 0)
    }

    private func verifyAgentToggleWritesImmediately(using fixture: TestFixture) async throws {
        let model = try await fixture.makeModel()
        let before = fixture.loggedRequests().count

        await model.setTargetEnabled("claude-code", enabled: false)

        let targetEnabled = model.isTargetEnabled("claude-code")
        XCTAssertFalse(targetEnabled)
        XCTAssertGreaterThan(fixture.loggedRequests().count, before)
        let applyRequests = fixture.loggedRequests().filter { $0.command == "apply" }
        XCTAssertEqual(applyRequests.count, 1)
        XCTAssertEqual(applyRequests.first?.payload?["sourceId"]?.value as? String, "alpha")
        let draft = applyRequests.first?.payload?["draft"]?.value as? [String: Any]
        XCTAssertEqual(draft?["enabledTargets"] as? [String], [])
        XCTAssertEqual(model.saveState(for: "alpha").phase, .saved)
        XCTAssertEqual(model.toast?.style, .neutral)
    }

    private func verifySkillToggleWritesImmediately(using fixture: TestFixture) async throws {
        let model = try await fixture.makeModel()

        await model.setSkillEnabled("alpha-leaf-1", enabled: false)

        let applyRequests = fixture.loggedRequests().filter { $0.command == "apply" }
        XCTAssertEqual(applyRequests.count, 1)
        XCTAssertFalse(model.isSkillEnabled("alpha-leaf-1"))
        let draft = applyRequests.first?.payload?["draft"]?.value as? [String: Any]
        XCTAssertEqual(draft?["selectedLeafIds"] as? [String], [])
        XCTAssertEqual(model.saveState(for: "alpha").phase, .saved)
        XCTAssertEqual(model.toast?.style, .neutral)
    }

    private func verifyDetectedTargetsDefaultAndShowAll(using fixture: TestFixture) async throws {
        let model = try await fixture.makeModel()

        let detectedTargets = model.visibleTargets.map(\.id)
        XCTAssertEqual(
            detectedTargets,
            ["claude-code", "cursor"]
        )

        model.showAllTargets = true

        let allTargets = model.visibleTargets.map(\.id)
        XCTAssertEqual(
            allTargets,
            [
                "claude-code",
                "codex",
                "cursor",
                "github-copilot",
                "gemini-cli",
                "opencode",
                "openclaw",
                "pi",
                "windsurf",
                "roo-code",
                "cline",
                "amp",
                "kiro"
            ]
        )
    }

    private func verifyApplyFailureRollsBack(using fixture: TestFixture) async throws {
        let model = try await fixture.makeModel()

        await model.setTargetEnabled("claude-code", enabled: false)

        XCTAssertTrue(model.isTargetEnabled("claude-code"))
        XCTAssertEqual(model.saveState(for: "alpha").phase, .failed)
        XCTAssertEqual(model.saveState(for: "alpha").detail, "Primary cause: missing leaf mapping")
        XCTAssertEqual(model.toast?.style, .error)

        let applyRequests = fixture.loggedRequests().filter { $0.command == "apply" }
        XCTAssertEqual(applyRequests.count, 1)
        XCTAssertEqual(applyRequests.first?.payload?["sourceId"]?.value as? String, "alpha")
    }

    func waitForCondition(
        timeoutNanoseconds: UInt64,
        pollIntervalNanoseconds: UInt64 = 20_000_000,
        _ condition: @escaping () -> Bool
    ) async {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutNanoseconds) / 1_000_000_000)
        while Date() < deadline {
            if condition() {
                return
            }
            try? await Task.sleep(nanoseconds: pollIntervalNanoseconds)
        }
        XCTFail("Timed out waiting for condition")
    }

    private func bootstrapRequestCount(in fixture: TestFixture) -> Int {
        fixture.loggedRequests().filter { $0.command == "bootstrap" }.count
    }

}

@MainActor
private struct TestFixture {
    struct ImportSkillState: Codable, Equatable {
        var id: String
        var title: String
        var summary: String
    }

    struct ImportGroupState: Codable, Equatable {
        var id: String
        var title: String
        var locator: String
        var canonicalRepo: String
        var aliases: [String]
        var summary: String
        var totalInstalls: Int
        var starCount: Int
        var skillCount: Int
        var matchedSkillNames: [String]
        var skills: [ImportSkillState]
        var targets: [String]
    }

    struct SourceState: Codable, Equatable {
        var displayName: String?
        var locator: String?
        var kind: String?
        var canonicalRepo: String?
        var leafIds: [String]
        var selectedLeafIds: [String]
        var enabledTargets: [String]
    }

    struct State: Codable, Equatable {
        var availableTargets: [String]
        var sources: [String: SourceState]
        var applyFailures: [String: [String]]
        var pinnedSourceIds: [String]
        var pinFailures: [String: [String]]
        var importGroups: [ImportGroupState]
        var importFailures: [String: String]

        static let baseline = State(
            availableTargets: ["claude-code", "cursor"],
            sources: [
                "alpha": SourceState(
                    displayName: "alpha",
                    locator: "acme/alpha",
                    kind: "git",
                    canonicalRepo: "acme/alpha",
                    leafIds: ["alpha-leaf-1"],
                    selectedLeafIds: ["alpha-leaf-1"],
                    enabledTargets: ["claude-code"]
                ),
                "beta": SourceState(
                    displayName: "beta",
                    locator: "acme/beta",
                    kind: "git",
                    canonicalRepo: "acme/beta",
                    leafIds: ["beta-leaf-1"],
                    selectedLeafIds: ["beta-leaf-1"],
                    enabledTargets: ["cursor"]
                )
            ],
            applyFailures: [:],
            pinnedSourceIds: [],
            pinFailures: [:],
            importGroups: [
                ImportGroupState(
                    id: "anthropics-skills",
                    title: "Anthropic Skills",
                    locator: "anthropic/skills",
                    canonicalRepo: "anthropics/skills",
                    aliases: [
                        "anthropic/skills",
                        "anthropics/skills",
                        "https://github.com/anthropics/skills",
                        "https://github.com/anthropics/skills.git",
                        "git@github.com:anthropics/skills.git",
                    ],
                    summary: "Official Anthropic skill collection.",
                    totalInstalls: 735100,
                    starCount: 406,
                    skillCount: 18,
                    matchedSkillNames: [],
                    skills: [
                        ImportSkillState(id: "research", title: "research", summary: "Research workflows."),
                        ImportSkillState(id: "debugging", title: "debugging", summary: "Debugging workflows."),
                    ],
                    targets: ["claude-code", "cursor"]
                ),
                ImportGroupState(
                    id: "garrytan-gstack",
                    title: "Gstack Skills",
                    locator: "garrytan/gstack",
                    canonicalRepo: "garrytan/gstack",
                    aliases: [
                        "garrytan/gstack",
                        "https://github.com/garrytan/gstack",
                    ],
                    summary: "Workflow and review skills.",
                    totalInstalls: 12300,
                    starCount: 88,
                    skillCount: 4,
                    matchedSkillNames: [],
                    skills: [
                        ImportSkillState(id: "review", title: "review", summary: "Review workflow."),
                        ImportSkillState(id: "qa", title: "qa", summary: "QA workflow."),
                    ],
                    targets: ["claude-code", "cursor"]
                ),
            ],
            importFailures: [:]
        )

        static let failureBaseline = State(
            availableTargets: ["claude-code", "cursor"],
            sources: [
                "alpha": SourceState(
                    leafIds: ["alpha-leaf-1"],
                    selectedLeafIds: ["alpha-leaf-1"],
                    enabledTargets: ["claude-code"]
                ),
                "beta": SourceState(
                    leafIds: ["beta-leaf-1"],
                    selectedLeafIds: ["beta-leaf-1"],
                    enabledTargets: ["cursor"]
                )
            ],
            applyFailures: [
                "alpha": [
                    "Primary cause: missing leaf mapping",
                    "Secondary cause: stale target state"
                ]
            ],
            pinnedSourceIds: [],
            pinFailures: [:],
            importGroups: baseline.importGroups,
            importFailures: [:]
        )
    }

    struct LoggedRequest: Codable {
        let command: String
        let payload: [String: AnyJSON]?
    }

    struct AnyJSON: Codable {
        let value: Any

        init(_ value: Any) {
            self.value = value
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let boolValue = try? container.decode(Bool.self) {
                value = boolValue
            } else if let intValue = try? container.decode(Int.self) {
                value = intValue
            } else if let doubleValue = try? container.decode(Double.self) {
                value = doubleValue
            } else if let stringValue = try? container.decode(String.self) {
                value = stringValue
            } else if let arrayValue = try? container.decode([AnyJSON].self) {
                value = arrayValue.map(\.value)
            } else if let dictionaryValue = try? container.decode([String: AnyJSON].self) {
                value = dictionaryValue.mapValues(\.value)
            } else if container.decodeNil() {
                value = NSNull()
            } else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON value")
            }
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.singleValueContainer()
            switch value {
            case let boolValue as Bool:
                try container.encode(boolValue)
            case let intValue as Int:
                try container.encode(intValue)
            case let doubleValue as Double:
                try container.encode(doubleValue)
            case let stringValue as String:
                try container.encode(stringValue)
            case let arrayValue as [Any]:
                try container.encode(arrayValue.map(AnyJSON.init))
            case let dictionaryValue as [String: Any]:
                try container.encode(dictionaryValue.mapValues(AnyJSON.init))
            case is NSNull:
                try container.encodeNil()
            default:
                try container.encodeNil()
            }
        }
    }

    private let stateURL: URL
    private let logURL: URL

    static func install() throws -> TestFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        let stateURL = rootURL.appendingPathComponent("state.json")
        let logURL = rootURL.appendingPathComponent("requests.log")

        try Self.helperScript.write(to: helperURL, atomically: true, encoding: .utf8)
        try Data("".utf8).write(to: logURL)

        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)
        setenv("SKILL_FLOW_DESKTOP_TEST_STATE", stateURL.path, 1)
        setenv("SKILL_FLOW_DESKTOP_TEST_LOG", logURL.path, 1)

        return TestFixture(
            stateURL: stateURL,
            logURL: logURL
        )
    }

    func reset(state: State) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(state)
        try data.write(to: stateURL)
        try Data("".utf8).write(to: logURL)
    }

    func makeModel() async throws -> MainViewModel {
        let model = MainViewModel(bridgeClient: BridgeClient())
        await model.bootstrap()
        let loadState = model.loadState
        switch loadState {
        case .ready:
            break
        default:
            XCTFail("Expected model to be ready after bootstrap")
        }
        let selectedGroup = model.selectedGroupId
        XCTAssertEqual(selectedGroup, "alpha")
        await model.selectSource("alpha")
        try await waitForDetailHydration(model, sourceId: "alpha")
        return model
    }

    func waitForDetailHydration(
        _ model: MainViewModel,
        sourceId: String,
        timeoutNanoseconds: UInt64 = 1_000_000_000
    ) async throws {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutNanoseconds) / 1_000_000_000)
        while Date() < deadline {
            if let detail = model.detailViewData(for: sourceId),
               !detail.groupDocuments.isEmpty,
               !detail.fileTree.isEmpty,
               detail.skills.allSatisfy({ !$0.documents.isEmpty }) {
                return
            }
            try await Task.sleep(nanoseconds: 20_000_000)
        }
        XCTFail("Timed out waiting for detail hydration for \(sourceId)")
    }

    func loggedRequests() -> [LoggedRequest] {
        guard let raw = try? String(contentsOf: logURL, encoding: .utf8), !raw.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return []
        }

        return raw
            .split(whereSeparator: \.isNewline)
            .compactMap { line in
                guard let data = String(line).data(using: .utf8) else { return nil }
                return try? JSONDecoder().decode(LoggedRequest.self, from: data)
            }
    }

    func waitForSelection(_ model: MainViewModel, expected: String, timeoutNanoseconds: UInt64 = 1_500_000_000) async throws {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutNanoseconds) / 1_000_000_000)
        var currentSelection = model.selectedGroupId
        while currentSelection != expected && Date() < deadline {
            try await Task.sleep(nanoseconds: 20_000_000)
            currentSelection = model.selectedGroupId
        }
        XCTAssertEqual(currentSelection, expected)
    }

    private static let helperScript = """
    const fs = require('fs');

    const statePath = process.env.SKILL_FLOW_DESKTOP_TEST_STATE;
    const logPath = process.env.SKILL_FLOW_DESKTOP_TEST_LOG;

    function readState() {
      try {
        return JSON.parse(fs.readFileSync(statePath, 'utf8'));
      } catch (error) {
        return {
          availableTargets: [],
          sources: {},
          applyFailures: {},
          importGroups: [],
          importFailures: {}
        };
      }
    }

    function writeState(state) {
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    }

    function logRequest(request) {
      fs.appendFileSync(logPath, JSON.stringify({
        command: request.command,
        payload: request.payload ?? null
      }) + '\\n');
    }

    function sourceDraft(source) {
      return {
        selectedLeafIds: source.selectedLeafIds || [],
        enabledTargets: source.enabledTargets || []
      };
    }

    function normalizeRepo(value) {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) {
        return '';
      }

      const aliases = {
        'anthropic/skills': 'anthropics/skills'
      };
      const patterns = [
        /^https?:\\/\\/github\\.com\\/([^/\\s]+)\\/([^/\\s]+?)(?:\\.git)?$/i,
        /^git@github\\.com:([^/\\s]+)\\/([^/\\s]+?)(?:\\.git)?$/i,
        /^([^/\\s]+)\\/([^/\\s]+?)(?:\\.git)?$/i
      ];

      for (const pattern of patterns) {
        const match = raw.match(pattern);
        if (!match) {
          continue;
        }
        const repo = `${match[1]}/${match[2]}`.replace(/\\.git$/, '');
        return aliases[repo] || repo;
      }

      return aliases[raw] || raw.replace(/\\.git$/, '');
    }

    function installedCanonicalRepos(state) {
      return new Set(
        Object.values(state.sources || {})
          .map((source) => normalizeRepo(source.canonicalRepo || source.locator || ''))
          .filter(Boolean)
      );
    }

    function serializeImportGroup(group, installed) {
      return {
        id: group.id,
        title: group.title,
        locator: group.locator,
        canonicalRepo: group.canonicalRepo,
        aliases: group.aliases || [],
        summary: group.summary || '',
        sourceUrl: `https://skills.sh/${group.canonicalRepo}`,
        repoUrl: `https://github.com/${group.canonicalRepo}`,
        starCount: group.starCount || 0,
        totalInstalls: group.totalInstalls || 0,
        skillCount: group.skillCount || ((group.skills || []).length),
        matchedSkillNames: group.matchedSkillNames || [],
        matchedSkills: (group.skills || []).map((skill) => ({
          skillId: skill.id,
          title: skill.title,
          installs: skill.id === 'research' ? 207800 : 52600
        })),
        snapshot: {
          canonicalRepo: group.canonicalRepo,
          aliases: group.aliases || [],
          title: group.title,
          provider: 'skills',
          sourceUrl: `https://skills.sh/${group.canonicalRepo}`,
          repoUrl: `https://github.com/${group.canonicalRepo}`,
          repoLabel: group.canonicalRepo,
          totalInstalls: group.totalInstalls || 0,
          skillCount: group.skillCount || ((group.skills || []).length),
          repoStars: group.starCount || 0,
          forkCount: 11475,
          description: group.summary || '',
          topics: ['agent-skills'],
          language: 'Python',
          defaultBranch: 'main',
          pushedAt: '2026-03-25T15:10:49Z',
          owner: {
            slug: group.canonicalRepo.split('/')[0],
            sourceUrl: `https://skills.sh/${group.canonicalRepo.split('/')[0]}`,
            githubUrl: `https://github.com/${group.canonicalRepo.split('/')[0]}`,
            sourceCount: 11,
            skillCount: 256,
            totalInstalls: 874400
          },
          trust: {
            official: group.id === 'anthropics-skills',
            trending: true
          },
          skills: (group.skills || []).map((skill, index) => ({
            skillId: skill.id,
            title: skill.title,
            installs: index === 0 ? 207800 : 52600,
            weeklyInstalls: index === 0 ? 102000 : 12800,
            summary: skill.summary || ''
          }))
        },
        installed,
        enrichState: { status: 'ready' },
        previewState: { status: 'idle' }
      };
    }

    function buildSummaries(state) {
      const targetIds = (state.availableTargets || []).slice();
      return Object.entries(state.sources || {}).map(([sourceId, source]) => {
        const enabledTargets = source.enabledTargets || [];
        const bindingsTargets = {};
        const visibleTargets = targetIds.length > 0 ? targetIds : enabledTargets;
        for (const targetId of visibleTargets) {
          bindingsTargets[targetId] = { enabled: enabledTargets.includes(targetId) };
        }
        return {
          source: {
            id: sourceId,
            displayName: source.displayName || sourceId,
            locator: source.locator || '',
            kind: source.kind || 'git'
          },
          leafs: (source.leafIds || []).map((leafId) => ({
            id: leafId,
            name: leafId,
            linkName: leafId
          })),
          bindings: {
            selectedLeafIds: source.selectedLeafIds || [],
            targets: bindingsTargets
          }
        };
      });
    }

    function responseFor(request, ok, data, warnings, errors) {
      return {
        protocolVersion: '1.0',
        requestId: request.requestId || null,
        command: request.command,
        ok,
        data: data === undefined ? null : data,
        warnings: warnings || [],
        errors: errors || []
      };
    }

    function main() {
      const request = JSON.parse(fs.readFileSync(0, 'utf8'));
      logRequest(request);

      const state = readState();

      if (request.command === 'bootstrap') {
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          availableTargets: state.availableTargets || [],
          pinnedSourceIds: state.pinnedSourceIds || [],
          summaries: buildSummaries(state),
          audit: {
            issues: []
          },
          initialDrafts: Object.fromEntries(Object.entries(state.sources || {}).map(([sourceId, source]) => [sourceId, sourceDraft(source)]))
        }, [], [])));
        return;
      }

      if (request.command === 'list') {
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          summaries: buildSummaries(state),
          pinnedSourceIds: state.pinnedSourceIds || []
        }, [], [])));
        return;
      }

      if (request.command === 'inspect') {
        const sourceId = request.payload && request.payload.sourceId;
        const source = (state.sources || {})[sourceId] || {};
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          sourceId,
          leafIds: source.leafIds || [],
          selectedLeafIds: source.selectedLeafIds || [],
          enabledTargets: source.enabledTargets || []
        }, [], [])));
        return;
      }

      if (request.command === 'toggle-pin') {
        const sourceId = request.payload && request.payload.sourceId;
        const failures = (state.pinFailures && state.pinFailures[sourceId]) || [];
        if (failures.length > 0) {
          process.stdout.write(JSON.stringify(responseFor(request, false, null, [], failures.map((message) => ({
            code: 'pin_failed',
            message
          })))));
          return;
        }

        const pinnedSourceIds = Array.isArray(state.pinnedSourceIds) ? state.pinnedSourceIds.slice() : [];
        if (pinnedSourceIds.includes(sourceId)) {
          state.pinnedSourceIds = pinnedSourceIds.filter((candidate) => candidate !== sourceId);
        } else {
          state.pinnedSourceIds = [...pinnedSourceIds, sourceId];
        }
        writeState(state);

        process.stdout.write(JSON.stringify(responseFor(request, true, {
          pinnedSourceIds: state.pinnedSourceIds
        }, [], [])));
        return;
      }

      if (request.command === 'search-import-groups') {
        const query = String((request.payload && request.payload.query) || '').trim();
        const groups = (state.importGroups || []).filter((group) => !installedCanonicalRepos(state).has(normalizeRepo(group.canonicalRepo)));

        if (!query) {
          process.stdout.write(JSON.stringify(responseFor(request, true, {
            exact: false,
            groups: groups.map((group) => serializeImportGroup(group, false))
          }, [], [])));
          return;
        }

        const normalizedQuery = normalizeRepo(query);
        const exactGroup = groups.find((group) => {
          const candidates = [group.canonicalRepo, group.locator].concat(group.aliases || []).map(normalizeRepo);
          return candidates.includes(normalizedQuery);
        });
        if (exactGroup) {
          process.stdout.write(JSON.stringify(responseFor(request, true, {
            exact: true,
            groups: [serializeImportGroup(exactGroup, false)]
          }, [], [])));
          return;
        }

        const loweredQuery = query.toLowerCase();
        const matched = groups.filter((group) => {
          const values = [
            group.title,
            group.summary,
            group.canonicalRepo,
            group.locator,
            ...(group.aliases || []),
            ...((group.skills || []).map((skill) => skill.title)),
          ].map((value) => String(value || '').toLowerCase());
          return values.some((value) => value.includes(loweredQuery));
        }).map((group) => serializeImportGroup(group, false));

        process.stdout.write(JSON.stringify(responseFor(request, true, {
          exact: false,
          groups: matched
        }, [], [])));
        return;
      }

      if (request.command === 'preview-import-source') {
        const locator = String((request.payload && request.payload.locator) || '');
        const normalizedLocator = normalizeRepo(locator);
        const group = (state.importGroups || []).find((candidate) => {
          const aliases = [candidate.canonicalRepo, candidate.locator].concat(candidate.aliases || []).map(normalizeRepo);
          return aliases.includes(normalizedLocator);
        });

        if (!group) {
          process.stdout.write(JSON.stringify(responseFor(request, true, {
            status: 'failed',
            reasonCode: 'provider_data_unavailable'
          }, [], [])));
          return;
        }

        process.stdout.write(JSON.stringify(responseFor(request, true, {
          status: 'ready',
          locator: group.locator,
          snapshot: serializeImportGroup(group, false).snapshot,
          skills: (group.skills || []).map((skill) => ({
            id: skill.id,
            title: skill.title,
            summary: skill.summary || ''
          })),
          targets: (group.targets || []).map((target) => ({ id: target })),
          selectedSkillIds: (group.skills || []).map((skill) => skill.id),
          enabledTargets: []
        }, [], [])));
        return;
      }

      if (request.command === 'import-source') {
        const locator = String((request.payload && request.payload.locator) || '');
        const failureReason = state.importFailures && state.importFailures[locator];
        if (failureReason) {
          process.stdout.write(JSON.stringify(responseFor(request, true, {
            status: 'failed',
            reasonCode: failureReason
          }, [], [])));
          return;
        }

        const normalizedLocator = normalizeRepo(locator);
        const group = (state.importGroups || []).find((candidate) => {
          const aliases = [candidate.canonicalRepo, candidate.locator].concat(candidate.aliases || []).map(normalizeRepo);
          return aliases.includes(normalizedLocator);
        });

        if (!group) {
          process.stdout.write(JSON.stringify(responseFor(request, true, {
            status: 'failed',
            reasonCode: 'provider_data_unavailable'
          }, [], [])));
          return;
        }

        const draft = request.payload && request.payload.draft ? request.payload.draft : {};
        const selectedSkillIds = Array.isArray(draft.selectedSkillIds) && draft.selectedSkillIds.length > 0
          ? draft.selectedSkillIds
          : (group.skills || []).map((skill) => skill.id);
        const enabledTargets = Array.isArray(draft.enabledTargets) ? draft.enabledTargets : [];

        if (!state.sources) {
          state.sources = {};
        }
        state.sources[group.id] = {
          displayName: group.title,
          locator: group.locator,
          kind: 'git',
          canonicalRepo: group.canonicalRepo,
          leafIds: (group.skills || []).map((skill) => `${group.id}:${skill.id}`),
          selectedLeafIds: selectedSkillIds.map((skillId) => `${group.id}:${skillId}`),
          enabledTargets
        };
        writeState(state);

        process.stdout.write(JSON.stringify(responseFor(request, true, {
          status: 'ready',
          sourceId: group.id
        }, [], [])));
        return;
      }

      if (request.command === 'add') {
        const locator = request.payload && request.payload.locator;
        const applyNow = request.payload && request.payload.applyNow === true;
        const sourceId = 'prepared';
        if (!state.sources) {
          state.sources = {};
        }
        if (!state.sources[sourceId]) {
          state.sources[sourceId] = {
            displayName: sourceId,
            locator,
            kind: 'git',
            canonicalRepo: normalizeRepo(locator),
            leafIds: ['prepared-leaf-1', 'prepared-leaf-2'],
            selectedLeafIds: ['prepared-leaf-1', 'prepared-leaf-2'],
            enabledTargets: ['claude-code']
          };
          writeState(state);
        }

        if (applyNow) {
          process.stdout.write(JSON.stringify(responseFor(request, true, {
            manifest: { id: sourceId, locator, kind: 'git' }
          }, [], [])));
          return;
        }

        process.stdout.write(JSON.stringify(responseFor(request, true, {
          sourceId,
          manifest: {
            id: sourceId,
            locator,
            kind: 'git'
          },
          availableTargets: state.availableTargets || [],
          draft: {
            selectedLeafIds: ['prepared-leaf-1', 'prepared-leaf-2'],
            enabledTargets: ['claude-code']
          },
          leafs: [
            {
              id: 'prepared-leaf-1',
              name: 'browse',
              linkName: 'browse',
              relativePath: 'skills/browse',
              description: 'Browse things.'
            },
            {
              id: 'prepared-leaf-2',
              name: 'review',
              linkName: 'review',
              relativePath: 'skills/review',
              description: 'Review things.'
            }
          ]
        }, [], [])));
        return;
      }

      if (request.command === 'apply') {
        const sourceId = request.payload && request.payload.sourceId;
        const draft = request.payload && request.payload.draft ? request.payload.draft : {};
        const failures = (state.applyFailures || {})[sourceId] || [];
        if (failures.length > 0) {
          process.stdout.write(JSON.stringify(responseFor(request, false, null, [], failures.map((message) => ({
            code: 'apply_failed',
            message
          })))));
          return;
        }

        if (!state.sources || !state.sources[sourceId]) {
          process.stdout.write(JSON.stringify(responseFor(request, false, null, [], [{
            code: 'missing_source',
            message: 'Unknown source.'
          }])));
          return;
        }

        state.sources[sourceId].selectedLeafIds = draft.selectedLeafIds || [];
        state.sources[sourceId].enabledTargets = draft.enabledTargets || [];
        writeState(state);
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          sourceId
        }, [], [])));
        return;
      }

      if (request.command === 'uninstall') {
        const sourceIds = (request.payload && request.payload.sourceIds) || [];
        for (const sourceId of sourceIds) {
          if (state.sources && state.sources[sourceId]) {
            delete state.sources[sourceId];
          }
        }
        state.pinnedSourceIds = (state.pinnedSourceIds || []).filter((sourceId) => !sourceIds.includes(sourceId));
        writeState(state);
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          removed: sourceIds
        }, [], [])));
        return;
      }

      process.stdout.write(JSON.stringify(responseFor(request, true, null, [], [])));
    }

    main();
    """
}

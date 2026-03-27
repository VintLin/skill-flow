import Foundation
import XCTest
import Darwin

@testable import SkillFlowDesktop

@MainActor
final class WorkflowCoverageTests: XCTestCase {
    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: "desktop.pinnedSourceIds")
        UserDefaults.standard.removeObject(forKey: "desktop.pinnedSourceIds.migratedToSharedPreferences")
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
        XCTAssertEqual(model.toast?.message, "Updated alpha.")
    }

    func testUpdateAllGroupsFromHomeUpdatesEverySourceAndClearsBusyState() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        await model.updateAllGroupsFromHome()

        let updateRequests = fixture.loggedRequests().filter { $0.command == "update" }
        XCTAssertEqual(updateRequests.count, 2)
        XCTAssertEqual(updateRequests.compactMap { $0.payload?["sourceIds"]?.value as? [String] }, [["alpha"], ["beta"]])
        XCTAssertFalse(model.isUpdatingSource("alpha"))
        XCTAssertFalse(model.isUpdatingSource("beta"))
        XCTAssertEqual(model.toast?.style, .success)
        XCTAssertEqual(model.toast?.message, "Updated beta.")
    }

    func testPrepareImportCreatesPreviewAndConfirmImportsSource() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        model.newSourceLocator = "acme/prepared"

        await model.prepareImport()

        XCTAssertEqual(model.importPhase, .prepared)
        XCTAssertEqual(model.importPreview?.title, "prepared")
        XCTAssertEqual(model.importPreview?.skills.count, 2)
        XCTAssertEqual(model.importPreview?.enabledTargets, ["claude-code"])

        await model.confirmPreparedImport()

        XCTAssertEqual(model.importPhase, .idle)
        XCTAssertNil(model.importPreview)
        XCTAssertEqual(model.currentPage, .detail(sourceId: "prepared"))
        XCTAssertEqual(model.selectedGroupId, "prepared")
        XCTAssertTrue(model.sourceIds.contains("prepared"))

        let addRequests = fixture.loggedRequests().filter { $0.command == "add" }
        XCTAssertEqual(addRequests.count, 1)
        let applyRequests = fixture.loggedRequests().filter { $0.command == "apply" }
        XCTAssertEqual(applyRequests.last?.payload?["sourceId"]?.value as? String, "prepared")
    }

    func testDiscardPreparedImportRemovesPreparedSource() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        model.newSourceLocator = "acme/prepared"

        await model.prepareImport()
        XCTAssertEqual(model.importPhase, .prepared)
        XCTAssertEqual(model.importPreview?.sourceId, "prepared")

        await model.discardPreparedImport()

        XCTAssertEqual(model.importPhase, .idle)
        XCTAssertNil(model.importPreview)
        let uninstallRequests = fixture.loggedRequests().filter { $0.command == "uninstall" }
        XCTAssertEqual(uninstallRequests.count, 1)
    }

    func testImportPreviewTogglesAffectConfirmedDraft() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()
        model.newSourceLocator = "acme/prepared"

        await model.prepareImport()
        XCTAssertEqual(model.importPreview?.selectedLeafIds, ["prepared-leaf-1", "prepared-leaf-2"])
        XCTAssertEqual(model.importPreview?.enabledTargets, ["claude-code"])

        model.toggleImportSkill("prepared-leaf-2")
        model.toggleImportTarget("cursor")

        XCTAssertEqual(model.importPreview?.selectedLeafIds, ["prepared-leaf-1"])
        XCTAssertEqual(model.importPreview?.enabledTargets, ["claude-code", "cursor"])

        await model.confirmPreparedImport()

        let applyRequests = fixture.loggedRequests().filter { $0.command == "apply" }
        let lastDraft = applyRequests.last?.payload?["draft"]?.value as? [String: Any]
        XCTAssertEqual(lastDraft?["selectedLeafIds"] as? [String], ["prepared-leaf-1"])
        XCTAssertEqual(lastDraft?["enabledTargets"] as? [String], ["claude-code", "cursor"])
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

        try fixture.reset(state: .baseline)

        try await verifyPreparedImportPreviewAndApply(using: fixture)
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

        let detailText = model.detailText
        XCTAssertTrue(model.isTargetEnabled("claude-code"))
        XCTAssertEqual(model.saveState(for: "alpha").phase, .failed)
        XCTAssertEqual(detailText, "Apply failed: Primary cause: missing leaf mapping")
        XCTAssertEqual(model.toast?.style, .error)

        let applyRequests = fixture.loggedRequests().filter { $0.command == "apply" }
        XCTAssertEqual(applyRequests.count, 1)
        XCTAssertEqual(applyRequests.first?.payload?["sourceId"]?.value as? String, "alpha")
    }

    private func verifyPreparedImportPreviewAndApply(using fixture: TestFixture) async throws {
        let model = try await fixture.makeModel()
        model.newSourceLocator = "acme/prepared"

        await model.prepareImport()
        XCTAssertEqual(model.importPhase, .prepared)
        XCTAssertEqual(model.importPreview?.sourceId, "prepared")

        await model.confirmPreparedImport()
        XCTAssertEqual(model.currentPage, .detail(sourceId: "prepared"))
    }
}

@MainActor
private struct TestFixture {
    struct SourceState: Codable, Equatable {
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

        static let baseline = State(
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
            applyFailures: [:],
            pinnedSourceIds: [],
            pinFailures: [:]
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
            pinFailures: [:]
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
        return model
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
          applyFailures: {}
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
          source: { id: sourceId },
          leafs: (source.leafIds || []).map((leafId) => ({ id: leafId })),
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

      if (request.command === 'add') {
        const locator = request.payload && request.payload.locator;
        const applyNow = request.payload && request.payload.applyNow === true;
        const sourceId = 'prepared';
        if (!state.sources) {
          state.sources = {};
        }
        if (!state.sources[sourceId]) {
          state.sources[sourceId] = {
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

import Foundation
import XCTest
import Darwin

@testable import SkillFlowDesktop

@MainActor
final class WorkflowCoverageTests: XCTestCase {
    func testV120WorkflowCoverage() async throws {
        let fixture = try TestFixture.install()

        try fixture.reset(state: .baseline)

        try await verifyGroupSwitchBranches(using: fixture)

        try fixture.reset(state: .baseline)

        try await verifyAgentToggleStaysDraftOnly(using: fixture)

        try fixture.reset(state: .baseline)

        try await verifyApplyNowIsCurrentGroupOnly(using: fixture)

        try fixture.reset(state: .baseline)

        try await verifyDetectedTargetsDefaultAndShowAll(using: fixture)

        try fixture.reset(state: .failureBaseline)

        try await verifyApplyFailureTemplate(using: fixture)
    }

    private func verifyGroupSwitchBranches(using fixture: TestFixture) async throws {
        try fixture.reset(state: .baseline)
        let applyModel = try await fixture.makeModel()
        let applySelectedGroup = applyModel.selectedGroupId
        let applyVisibleTargets = applyModel.visibleTargets.map(\.id)
        XCTAssertEqual(applySelectedGroup, "alpha")
        XCTAssertEqual(applyVisibleTargets, ["claude-code", "cursor"])

        applyModel.setTargetEnabled("claude-code", enabled: false)
        let applyHasPendingDraft = applyModel.hasPendingDraftForCurrentGroup
        XCTAssertTrue(applyHasPendingDraft)

        applyModel.requestGroupSwitch(to: "beta")
        let applyShowDialog = applyModel.showGroupSwitchDialog
        let applySelectedBeforeDecision = applyModel.selectedGroupId
        XCTAssertTrue(applyShowDialog)
        XCTAssertEqual(applySelectedBeforeDecision, "alpha")

        await applyModel.resolveGroupSwitch(.apply)
        let applyDialogAfterDecision = applyModel.showGroupSwitchDialog
        let applySelectedAfterDecision = applyModel.selectedGroupId
        XCTAssertFalse(applyDialogAfterDecision)
        XCTAssertEqual(applySelectedAfterDecision, "beta")

        let applyRequests = fixture.loggedRequests().filter { $0.command == "apply" }
        XCTAssertEqual(applyRequests.count, 1)
        XCTAssertEqual(applyRequests.first?.payload?["sourceId"]?.value as? String, "alpha")

        try fixture.reset(state: .baseline)
        let discardModel = try await fixture.makeModel()
        discardModel.setTargetEnabled("claude-code", enabled: false)
        discardModel.requestGroupSwitch(to: "beta")
        let discardShowDialog = discardModel.showGroupSwitchDialog
        XCTAssertTrue(discardShowDialog)

        await discardModel.resolveGroupSwitch(.discard)
        let discardDialogAfterDecision = discardModel.showGroupSwitchDialog
        let discardSelectedAfterDecision = discardModel.selectedGroupId
        let discardHasPending = discardModel.hasPendingDraftForCurrentGroup
        XCTAssertFalse(discardDialogAfterDecision)
        XCTAssertEqual(discardSelectedAfterDecision, "beta")
        XCTAssertFalse(discardHasPending)

        discardModel.requestGroupSwitch(to: "alpha")
        try await fixture.waitForSelection(discardModel, expected: "alpha")
        let discardSelectedAfterReturn = discardModel.selectedGroupId
        let discardTargetEnabled = discardModel.isTargetEnabled("claude-code")
        XCTAssertEqual(discardSelectedAfterReturn, "alpha")
        XCTAssertTrue(discardTargetEnabled)

        try fixture.reset(state: .baseline)
        let cancelModel = try await fixture.makeModel()
        cancelModel.setTargetEnabled("claude-code", enabled: false)
        cancelModel.requestGroupSwitch(to: "beta")
        let cancelShowDialog = cancelModel.showGroupSwitchDialog
        XCTAssertTrue(cancelShowDialog)

        await cancelModel.resolveGroupSwitch(.cancel)
        let cancelDialogAfterDecision = cancelModel.showGroupSwitchDialog
        let cancelSelectedAfterDecision = cancelModel.selectedGroupId
        let cancelHasPending = cancelModel.hasPendingDraftForCurrentGroup
        let cancelTargetEnabled = cancelModel.isTargetEnabled("claude-code")
        XCTAssertFalse(cancelDialogAfterDecision)
        XCTAssertEqual(cancelSelectedAfterDecision, "alpha")
        XCTAssertTrue(cancelHasPending)
        XCTAssertFalse(cancelTargetEnabled)

        let cancelRequests = fixture.loggedRequests().filter { $0.command == "apply" }
        XCTAssertEqual(cancelRequests.count, 0)
    }

    private func verifyAgentToggleStaysDraftOnly(using fixture: TestFixture) async throws {
        let model = try await fixture.makeModel()
        let before = fixture.loggedRequests().count

        model.setTargetEnabled("claude-code", enabled: false)

        let hasPendingDraft = model.hasPendingDraftForCurrentGroup
        let targetEnabled = model.isTargetEnabled("claude-code")
        XCTAssertTrue(hasPendingDraft)
        XCTAssertFalse(targetEnabled)
        XCTAssertEqual(fixture.loggedRequests().count, before)
        XCTAssertEqual(fixture.loggedRequests().filter { $0.command == "apply" }.count, 0)
    }

    private func verifyApplyNowIsCurrentGroupOnly(using fixture: TestFixture) async throws {
        let model = try await fixture.makeModel()

        model.setTargetEnabled("claude-code", enabled: false)
        let canApply = model.canApplyCurrentGroupDraft
        XCTAssertTrue(canApply)

        let applied = await model.applyCurrentGroupDraft()
        XCTAssertTrue(applied)
        let selectedGroup = model.selectedGroupId
        XCTAssertEqual(selectedGroup, "alpha")

        let applyRequests = fixture.loggedRequests().filter { $0.command == "apply" }
        XCTAssertEqual(applyRequests.count, 1)
        XCTAssertEqual(applyRequests.first?.payload?["sourceId"]?.value as? String, "alpha")
        let draft = applyRequests.first?.payload?["draft"]?.value as? [String: Any]
        XCTAssertEqual(draft?["enabledTargets"] as? [String], [])
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

    private func verifyApplyFailureTemplate(using fixture: TestFixture) async throws {
        let model = try await fixture.makeModel()

        model.setTargetEnabled("claude-code", enabled: false)

        let applied = await model.applyCurrentGroupDraft()
        XCTAssertFalse(applied)
        let hasApplyError = model.hasApplyError
        let failureCount = model.lastApplyFailureCount
        let firstReason = model.lastApplyFirstReason
        let detailText = model.detailText
        XCTAssertTrue(hasApplyError)
        XCTAssertEqual(failureCount, 2)
        XCTAssertEqual(firstReason, "Primary cause: missing leaf mapping")
        XCTAssertEqual(detailText, "Apply failed: Primary cause: missing leaf mapping")

        let applyRequests = fixture.loggedRequests().filter { $0.command == "apply" }
        XCTAssertEqual(applyRequests.count, 1)
        XCTAssertEqual(applyRequests.first?.payload?["sourceId"]?.value as? String, "alpha")
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
            applyFailures: [:]
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
            ]
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
          initialDrafts: Object.fromEntries(Object.entries(state.sources || {}).map(([sourceId, source]) => [sourceId, sourceDraft(source)]))
        }, [], [])));
        return;
      }

      if (request.command === 'list') {
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          summaries: buildSummaries(state)
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

      process.stdout.write(JSON.stringify(responseFor(request, true, null, [], [])));
    }

    main();
    """
}

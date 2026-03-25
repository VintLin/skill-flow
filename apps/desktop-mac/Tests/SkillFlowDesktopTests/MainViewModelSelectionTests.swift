import Foundation
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MainViewModelSelectionTests: XCTestCase {
    func testSelectionFallbackTriStateAndGroupSourceIds() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        XCTAssertEqual(model.visibleTargets.map(\.id), ["claude-code", "cursor"])
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .partial)
        XCTAssertEqual(model.skillSelectionState(sourceId: "beta"), .full)
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .partial)
        XCTAssertEqual(model.selectedGroupSourceIds, ["alpha", "beta"])
        XCTAssertTrue(model.isSkillEnabled("alpha-a", sourceId: "alpha"))
        XCTAssertFalse(model.isSkillEnabled("alpha-b", sourceId: "alpha"))
        XCTAssertTrue(model.isSkillEnabled("beta-a", sourceId: "beta"))
        XCTAssertTrue(model.isSkillEnabled("beta-b", sourceId: "beta"))

        model.toggleAllSkills(sourceId: "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .full)
        model.toggleAllSkills(sourceId: "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .empty)

        model.setSkillEnabled("alpha-b", enabled: true, sourceId: "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .partial)
        XCTAssertTrue(model.isSkillEnabled("alpha-b", sourceId: "alpha"))

        model.toggleAllTargets(sourceId: "alpha")
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .full)
        model.toggleAllTargets(sourceId: "alpha")
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .empty)
    }

    func testSaveFailureResetsAfterEdit() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .failureBaseline)

        let model = try await fixture.makeModel()

        model.setTargetEnabled("cursor", enabled: true)
        XCTAssertTrue(model.hasPendingDraftForCurrentGroup)

        let applied = await model.applyCurrentGroupDraft()
        XCTAssertFalse(applied)
        XCTAssertEqual(model.saveState(for: "alpha").phase, .failed)
        XCTAssertTrue(model.hasApplyError)
        XCTAssertEqual(model.lastApplyFirstReason, "Primary cause: missing leaf mapping")

        model.setTargetEnabled("cursor", enabled: false)
        XCTAssertEqual(model.saveState(for: "alpha").phase, .idle)
        XCTAssertFalse(model.hasApplyError)
        XCTAssertEqual(model.lastApplyFailureCount, 0)
        XCTAssertEqual(model.lastApplyFirstReason, "")
    }

    func testClawhubGroupSelectionIncludesAllClawhubSources() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        XCTAssertEqual(model.selectedGroupSourceIds, ["alpha", "beta"])
        XCTAssertEqual(model.selectedGroupId, "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "beta"), .full)
    }
}

@MainActor
private struct TestFixture {
    struct LeafState: Codable, Equatable {
        var id: String
        var linkName: String
        var name: String
        var description: String
        var metadataWarnings: [String]
    }

    struct SourceState: Codable, Equatable {
        var kind: String
        var displayName: String
        var locator: String
        var health: String
        var updatedAt: String
        var leafs: [LeafState]
        var selectedLeafIds: [String]
        var enabledTargets: [String]
        var targetLeafIdsByTarget: [String: [String]]
        var applyFailures: [String]
    }

    struct State: Codable, Equatable {
        var availableTargets: [String]
        var sources: [String: SourceState]

        static let baseline = State(
            availableTargets: ["cursor", "claude-code"],
            sources: [
                "alpha": SourceState(
                    kind: "clawhub",
                    displayName: "AlphaHub",
                    locator: "https://github.com/acme/alpha-hub",
                    health: "HEALTHY",
                    updatedAt: "2026-03-26T00:00:00Z",
                    leafs: [
                        LeafState(id: "alpha-a", linkName: "browse", name: "browse", description: "Browse things.", metadataWarnings: []),
                        LeafState(id: "alpha-b", linkName: "review", name: "review", description: "Review things.", metadataWarnings: [])
                    ],
                    selectedLeafIds: [],
                    enabledTargets: ["claude-code"],
                    targetLeafIdsByTarget: [
                        "claude-code": ["alpha-a"],
                        "cursor": ["alpha-b"]
                    ],
                    applyFailures: []
                ),
                "beta": SourceState(
                    kind: "clawhub",
                    displayName: "BetaHub",
                    locator: "https://github.com/acme/beta-hub",
                    health: "HEALTHY",
                    updatedAt: "2026-03-26T00:00:00Z",
                    leafs: [
                        LeafState(id: "beta-a", linkName: "draft", name: "draft", description: "Draft things.", metadataWarnings: []),
                        LeafState(id: "beta-b", linkName: "ship", name: "ship", description: "Ship things.", metadataWarnings: [])
                    ],
                    selectedLeafIds: [],
                    enabledTargets: [],
                    targetLeafIdsByTarget: [:],
                    applyFailures: []
                )
            ]
        )

        static let failureBaseline = State(
            availableTargets: ["cursor", "claude-code"],
            sources: [
                "alpha": SourceState(
                    kind: "clawhub",
                    displayName: "AlphaHub",
                    locator: "https://github.com/acme/alpha-hub",
                    health: "HEALTHY",
                    updatedAt: "2026-03-26T00:00:00Z",
                    leafs: [
                        LeafState(id: "alpha-a", linkName: "browse", name: "browse", description: "Browse things.", metadataWarnings: []),
                        LeafState(id: "alpha-b", linkName: "review", name: "review", description: "Review things.", metadataWarnings: [])
                    ],
                    selectedLeafIds: ["alpha-a"],
                    enabledTargets: ["claude-code"],
                    targetLeafIdsByTarget: [
                        "claude-code": ["alpha-a"],
                        "cursor": ["alpha-b"]
                    ],
                    applyFailures: [
                        "Primary cause: missing leaf mapping",
                        "Secondary cause: stale target state"
                    ]
                ),
                "beta": SourceState(
                    kind: "clawhub",
                    displayName: "BetaHub",
                    locator: "https://github.com/acme/beta-hub",
                    health: "HEALTHY",
                    updatedAt: "2026-03-26T00:00:00Z",
                    leafs: [
                        LeafState(id: "beta-a", linkName: "draft", name: "draft", description: "Draft things.", metadataWarnings: []),
                        LeafState(id: "beta-b", linkName: "ship", name: "ship", description: "Ship things.", metadataWarnings: [])
                    ],
                    selectedLeafIds: [],
                    enabledTargets: [],
                    targetLeafIdsByTarget: [:],
                    applyFailures: []
                )
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
            .appendingPathComponent("skillflow-desktop-selection-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        let stateURL = rootURL.appendingPathComponent("state.json")
        let logURL = rootURL.appendingPathComponent("requests.log")

        try Self.helperScript.write(to: helperURL, atomically: true, encoding: .utf8)
        try Data("".utf8).write(to: logURL)

        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)
        setenv("SKILL_FLOW_DESKTOP_TEST_STATE", stateURL.path, 1)
        setenv("SKILL_FLOW_DESKTOP_TEST_LOG", logURL.path, 1)

        return TestFixture(stateURL: stateURL, logURL: logURL)
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
        switch model.loadState {
        case .ready:
            break
        default:
            XCTFail("Expected model to be ready after bootstrap")
        }
        XCTAssertEqual(model.selectedGroupId, "alpha")
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
          sources: {}
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

    function buildSummaries(state) {
      const targetIds = state.availableTargets || [];
      return Object.entries(state.sources || {}).map(([sourceId, source]) => {
        const enabledTargets = source.enabledTargets || [];
        const bindingsTargets = {};
        for (const targetId of targetIds) {
          bindingsTargets[targetId] = {
            enabled: enabledTargets.includes(targetId),
            leafIds: (source.targetLeafIdsByTarget && source.targetLeafIdsByTarget[targetId]) || []
          };
        }

        return {
          source: {
            id: sourceId,
            kind: source.kind,
            displayName: source.displayName,
            locator: source.locator
          },
          lock: {
            updatedAt: source.updatedAt || '-'
          },
          leafs: (source.leafs || []).map((leaf) => ({
            id: leaf.id,
            linkName: leaf.linkName,
            name: leaf.name,
            description: leaf.description,
            metadataWarnings: leaf.metadataWarnings || []
          })),
          bindings: {
            selectedLeafIds: source.selectedLeafIds || [],
            targets: bindingsTargets
          },
          health: source.health || 'HEALTHY',
          issueCounts: {
            warning: 0,
            error: 0
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
          initialDrafts: Object.fromEntries(Object.entries(state.sources || {}).map(([sourceId, source]) => [sourceId, {
            selectedLeafIds: source.selectedLeafIds || [],
            enabledTargets: source.enabledTargets || []
          }]))
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
          leafIds: (source.leafs || []).map((leaf) => leaf.id),
          selectedLeafIds: source.selectedLeafIds || [],
          enabledTargets: source.enabledTargets || []
        }, [], [])));
        return;
      }

      if (request.command === 'apply') {
        const sourceId = request.payload && request.payload.sourceId;
        const draft = request.payload && request.payload.draft ? request.payload.draft : {};
        const failures = ((state.sources || {})[sourceId] || {}).applyFailures || [];
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

      if (request.command === 'update') {
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          updated: []
        }, [], [])));
        return;
      }

      if (request.command === 'doctor') {
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          issues: []
        }, [], [])));
        return;
      }

      process.stdout.write(JSON.stringify(responseFor(request, true, null, [], [])));
    }

    main();
    """
}

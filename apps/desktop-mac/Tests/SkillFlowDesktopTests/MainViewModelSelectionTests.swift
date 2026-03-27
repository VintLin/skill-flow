import Foundation
import XCTest

@testable import SkillFlowDesktop

@MainActor
final class MainViewModelSelectionTests: XCTestCase {
    override func setUp() {
        super.setUp()
        UserDefaults.standard.set(DesktopLanguage.en.rawValue, forKey: DesktopLanguage.storageKey)
    }

    override func tearDown() {
        MainActor.assumeIsolated {
            MainViewModel.currentDateProvider = Date.init
        }
        UserDefaults.standard.set(DesktopLanguage.en.rawValue, forKey: DesktopLanguage.storageKey)
        super.tearDown()
    }

    func testSelectionFallbackTriStateAndGroupSourceIds() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        XCTAssertEqual(model.visibleTargets.map(\.id), ["claude-code", "cursor"])
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .partial)
        XCTAssertEqual(model.skillSelectionState(sourceId: "beta"), .empty)
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .partial)
        XCTAssertEqual(model.selectedGroupSourceIds, ["alpha", "beta"])
        XCTAssertTrue(model.isSkillEnabled("alpha-a", sourceId: "alpha"))
        XCTAssertFalse(model.isSkillEnabled("alpha-b", sourceId: "alpha"))
        XCTAssertFalse(model.isSkillEnabled("beta-a", sourceId: "beta"))
        XCTAssertFalse(model.isSkillEnabled("beta-b", sourceId: "beta"))

        await model.toggleAllSkills(sourceId: "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .full)
        await model.toggleAllSkills(sourceId: "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .empty)
        XCTAssertFalse(model.isSkillEnabled("alpha-a", sourceId: "alpha"))

        await model.setSkillEnabled("alpha-b", enabled: true, sourceId: "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "alpha"), .partial)
        XCTAssertTrue(model.isSkillEnabled("alpha-b", sourceId: "alpha"))

        await model.toggleAllTargets(sourceId: "alpha")
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .full)
        await model.toggleAllTargets(sourceId: "alpha")
        XCTAssertEqual(model.targetSelectionState(sourceId: "alpha"), .empty)
    }

    func testSaveFailureRollsBackOptimisticEdit() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .failureBaseline)

        let model = try await fixture.makeModel()

        await model.setTargetEnabled("cursor", enabled: true)
        XCTAssertEqual(model.saveState(for: "alpha").phase, .failed)
        XCTAssertEqual(model.saveState(for: "alpha").detail, "Primary cause: missing leaf mapping")
        XCTAssertFalse(model.isTargetEnabled("cursor"))
        XCTAssertEqual(model.toast?.style, .error)
    }

    func testClawhubGroupSelectionIncludesAllClawhubSources() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        XCTAssertEqual(model.selectedGroupSourceIds, ["alpha", "beta"])
        XCTAssertEqual(model.selectedGroupId, "alpha")
        XCTAssertEqual(model.skillSelectionState(sourceId: "beta"), .empty)
    }

    func testDetailViewDataUsesInspectPayload() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        let detail = model.detailViewData(for: "alpha")

        XCTAssertEqual(detail?.title, "AlphaHub")
        XCTAssertEqual(detail?.subtitle, "clawhub")
        XCTAssertEqual(detail?.starCount, 1200)
        XCTAssertTrue(detail?.sourceDetailLines.contains("Provider: clawhub") == true)
        XCTAssertTrue(detail?.sourceDetailLines.contains("Downloads: 211,898") == true)
        XCTAssertEqual(detail?.enabledTargetLabels, ["Claude Code"])
        XCTAssertEqual(detail?.enabledSkillCount, 1)
        XCTAssertEqual(detail?.totalSkillCount, 2)
        XCTAssertEqual(detail?.enabledTargetCount, 1)
        XCTAssertEqual(detail?.saveState.phase, .idle)
        XCTAssertEqual(detail?.targetSelection, .partial)
        XCTAssertEqual(detail?.targets.map(\.id), ["claude-code", "cursor"])
        XCTAssertEqual(detail?.targets.first?.isEnabled, true)
        XCTAssertEqual(detail?.targets.last?.isEnabled, false)
        XCTAssertEqual(detail?.sourceFacts.first, "2026-03-25T12:00:00Z")
        XCTAssertTrue(detail?.deploymentFacts.first?.contains("Claude Code") == true)
        XCTAssertEqual(detail?.groupDocuments.map(\.title), ["File Tree", "README.md", "README.zh.md", "CHANGELOG.md"])
        XCTAssertEqual(detail?.groupDocuments.first(where: { $0.title == "README.md" })?.externalURL, "https://github.com/acme/alpha-hub/blob/HEAD/README.md")
        XCTAssertEqual(detail?.fileTree.first?.title, "alpha")
        XCTAssertTrue(detail?.fileTree.dropFirst().contains(where: { $0.prefix.contains("|--") || $0.prefix.contains("`--") }) == true)
        XCTAssertFalse(detail?.fileTree.contains(where: { $0.title == "SKILL.md" }) == true)
        XCTAssertTrue(detail?.skills.first?.detailLines.contains(where: { $0.contains("SKILL.md") }) == true)
        XCTAssertEqual(detail?.skills.first?.documents.first?.metadata.map(\.key), ["description", "name"])
        XCTAssertFalse(detail?.skills.first?.documents.first?.content.contains("---") == true)
        XCTAssertTrue(detail?.skills.first?.documentContent.contains("# browse") == true)
        XCTAssertTrue(detail?.skills.first?.documentContent.contains("Final verification line.") == true)
        XCTAssertEqual(detail?.skills.first?.starCount, 1200)
    }

    func testDetailViewDataShowsUnsupportedMetadataState() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.metadataStatus = "unsupported"
        state.sources["alpha"]?.metadataReasonCode = "provider_data_unavailable"
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        let detail = model.detailViewData(for: "alpha")

        XCTAssertNil(detail?.starCount)
        XCTAssertTrue(detail?.sourceDetailLines.contains("Provider: clawhub") == true)
        XCTAssertTrue(detail?.sourceDetailLines.contains("Status: Unsupported") == true)
        XCTAssertTrue(detail?.sourceDetailLines.contains("Current source has no readable metadata.") == true)
    }

    func testDetailViewDataShowsFailedMetadataState() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.metadataStatus = "failed"
        state.sources["alpha"]?.metadataReasonCode = "provider_rate_limited"
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        let detail = model.detailViewData(for: "alpha")

        XCTAssertNil(detail?.starCount)
        XCTAssertTrue(detail?.sourceDetailLines.contains("Status: Failed") == true)
        XCTAssertTrue(detail?.sourceDetailLines.contains("Source metadata is temporarily rate-limited. Try again later.") == true)
    }

    func testDetailViewDataShowsDisabledMetadataState() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.metadataStatus = "disabled"
        state.sources["alpha"]?.metadataReasonCode = nil
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        let detail = model.detailViewData(for: "alpha")

        XCTAssertNil(detail?.starCount)
        XCTAssertTrue(detail?.sourceDetailLines.contains("Status: Disabled") == true)
        XCTAssertTrue(detail?.sourceDetailLines.contains("This source provider is reserved but not enabled in this build.") == true)
    }

    func testDetailViewDataFallsBackWhenSkillDocumentIsMissing() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)
        try fixture.removeSkillDocument(sourceId: "alpha", leafId: "alpha-a")

        let model = try await fixture.makeModel()

        let detail = model.detailViewData(for: "alpha")

        XCTAssertEqual(detail?.skills.first?.documentContent, "SKILL.md unavailable.")
    }

    func testDetailViewDataLocalizesDerivedDetailCopyForJapanese() async throws {
        UserDefaults.standard.set(DesktopLanguage.ja.rawValue, forKey: DesktopLanguage.storageKey)

        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["alpha"]?.locator = ""
        state.sources["alpha"]?.metadataStatus = "unsupported"
        state.sources["alpha"]?.metadataReasonCode = "provider_data_unavailable"
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        let detail = model.detailViewData(for: "alpha")

        XCTAssertEqual(detail?.originLabel, "不明なソース")
        XCTAssertTrue(detail?.sourceDetailLines.contains("状態: 非対応") == true)
        XCTAssertEqual(detail?.groupDocuments.first?.title, "ファイルツリー")
    }

    func testDetailViewDataLocalizesUpdatedRelativeWithSelectedLanguage() async throws {
        let formatter = ISO8601DateFormatter()
        MainViewModel.currentDateProvider = {
            formatter.date(from: "2026-03-27T00:00:00Z")!
        }

        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)

        let model = try await fixture.makeModel()

        XCTAssertEqual(model.detailViewData(for: "alpha")?.updatedRelative, "Updated 1 day ago")

        UserDefaults.standard.set(DesktopLanguage.ja.rawValue, forKey: DesktopLanguage.storageKey)

        let localizedRelative = model.detailViewData(for: "alpha")?.updatedRelative
        XCTAssertTrue(localizedRelative?.contains("更新") == true)
        XCTAssertFalse(localizedRelative?.contains("Updated") == true)
    }

    func testDetailSkillTitlePrefersMetadataName() async throws {
        let fixture = try TestFixture.install()
        try fixture.reset(state: .baseline)
        try fixture.writeSkillDocument(
            sourceId: "alpha",
            leafId: "alpha-a",
            content: """
            ---
            name: Browser Metadata Name
            description: Browse things.
            ---

            # browse
            """
        )

        let model = try await fixture.makeModel()

        let detail = model.detailViewData(for: "alpha")

        XCTAssertEqual(detail?.skills.first?.title, "Browser Metadata Name")
    }

    func testFileTreeUsesProjectedNameWhenSkillWouldBeDeduped() async throws {
        let fixture = try TestFixture.install()
        var state = TestFixture.State.baseline
        state.sources["beta"]?.leafs = [
            TestFixture.LeafState(
                id: "beta-a",
                linkName: "browse",
                name: "browse",
                description: "Browse elsewhere.",
                metadataWarnings: []
            )
        ]
        state.sources["beta"]?.enabledTargets = ["claude-code"]
        state.sources["beta"]?.targetLeafIdsByTarget = ["claude-code": ["beta-a"]]
        try fixture.reset(state: state)

        let model = try await fixture.makeModel()
        await model.selectSource("beta")

        let detail = model.detailViewData(for: "beta")

        XCTAssertTrue(detail?.fileTree.contains(where: { $0.title == "BetaHub-browse" }) == true)
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
        var starCount: Int?
        var metadataStatus: String?
        var metadataProvider: String?
        var metadataReasonCode: String?
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
                    starCount: 1200,
                    metadataStatus: "ready",
                    metadataProvider: "clawhub",
                    metadataReasonCode: nil,
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
                    starCount: 88,
                    metadataStatus: "ready",
                    metadataProvider: "clawhub",
                    metadataReasonCode: nil,
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
                    starCount: 1200,
                    metadataStatus: "ready",
                    metadataProvider: "clawhub",
                    metadataReasonCode: nil,
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
                    starCount: 88,
                    metadataStatus: "ready",
                    metadataProvider: "clawhub",
                    metadataReasonCode: nil,
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
    private let rootURL: URL

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
        setenv("SKILL_FLOW_DESKTOP_TEST_ROOT", rootURL.path, 1)

        return TestFixture(stateURL: stateURL, logURL: logURL, rootURL: rootURL)
    }

    func reset(state: State) throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(state)
        try data.write(to: stateURL)
        try Data("".utf8).write(to: logURL)
        try writeSkillDocuments(state: state)
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

    func removeSkillDocument(sourceId: String, leafId: String) throws {
        let url = rootURL
            .appendingPathComponent("docs", isDirectory: true)
            .appendingPathComponent(sourceId, isDirectory: true)
            .appendingPathComponent(leafId, isDirectory: true)
            .appendingPathComponent("SKILL.md")
        try FileManager.default.removeItem(at: url)
    }

    func writeSkillDocument(sourceId: String, leafId: String, content: String) throws {
        let url = rootURL
            .appendingPathComponent("docs", isDirectory: true)
            .appendingPathComponent(sourceId, isDirectory: true)
            .appendingPathComponent(leafId, isDirectory: true)
            .appendingPathComponent("SKILL.md")
        try content.write(to: url, atomically: true, encoding: .utf8)
    }

    private func writeSkillDocuments(state: State) throws {
        let docsRoot = rootURL.appendingPathComponent("docs", isDirectory: true)
        try? FileManager.default.removeItem(at: docsRoot)
        try FileManager.default.createDirectory(at: docsRoot, withIntermediateDirectories: true)

        for (sourceId, source) in state.sources {
            let sourceRoot = docsRoot.appendingPathComponent(sourceId, isDirectory: true)
            try FileManager.default.createDirectory(at: sourceRoot, withIntermediateDirectories: true)
            try """
            # \(source.displayName)

            Root README for \(sourceId).
            """.write(to: sourceRoot.appendingPathComponent("README.md"), atomically: true, encoding: .utf8)
            try """
            # \(source.displayName) README.zh

            Chinese README for \(sourceId).
            """.write(to: sourceRoot.appendingPathComponent("README.zh.md"), atomically: true, encoding: .utf8)
            try """
            # Changelog

            Changes for \(sourceId).
            """.write(to: sourceRoot.appendingPathComponent("CHANGELOG.md"), atomically: true, encoding: .utf8)

            for leaf in source.leafs {
                let leafDir = sourceRoot.appendingPathComponent(leaf.id, isDirectory: true)
                try FileManager.default.createDirectory(at: leafDir, withIntermediateDirectories: true)
                let content = """
                ---
                name: \(leaf.name)
                description: \(leaf.description)
                ---

                # \(leaf.name)

                \(leaf.description)

                ## Usage

                Run this skill when you need the \(leaf.name) workflow.

                ## Notes

                Final verification line.
                """
                try content.write(to: leafDir.appendingPathComponent("SKILL.md"), atomically: true, encoding: .utf8)
            }
        }
    }

    private static let helperScript = """
    const fs = require('fs');
    const path = require('path');

    const statePath = process.env.SKILL_FLOW_DESKTOP_TEST_STATE;
    const logPath = process.env.SKILL_FLOW_DESKTOP_TEST_LOG;
    const rootPath = process.env.SKILL_FLOW_DESKTOP_TEST_ROOT;

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
          summaries: buildSummaries(state),
          audit: {
            issues: []
          },
          initialDrafts: Object.fromEntries(Object.entries(state.sources || {}).map(([sourceId, source]) => {
            const enabledTargets = source.enabledTargets || [];
            const targetLeafIdsByTarget = source.targetLeafIdsByTarget || {};
            const selectedLeafIds = (source.selectedLeafIds && source.selectedLeafIds.length > 0)
              ? source.selectedLeafIds
              : enabledTargets.flatMap((target) => targetLeafIdsByTarget[target] || []);
            return [sourceId, {
              selectedLeafIds,
              enabledTargets
            }];
          }))
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
        const targetIds = state.availableTargets || [];
        const bindingsTargets = {};
        for (const targetId of targetIds) {
          bindingsTargets[targetId] = {
            enabled: (source.enabledTargets || []).includes(targetId),
            leafIds: (source.targetLeafIdsByTarget && source.targetLeafIdsByTarget[targetId]) || []
          };
        }
        const sourceMetadata = (() => {
          const status = source.metadataStatus || 'ready';
          const provider = source.metadataProvider || 'clawhub';
          if (status === 'ready') {
            return {
              status: 'ready',
              provider,
              data: {
                provider,
                starCount: source.starCount ?? null,
                totalInstalls: 5045,
                weeklyInstalls: 4921,
                downloadCount: 211898,
                ownerHandle: '@steipete',
                ownerDisplayName: 'Peter Steinberger'
              }
            };
          }

          const metadata = {
            status,
            provider
          };
          if (source.metadataReasonCode) {
            metadata.reasonCode = source.metadataReasonCode;
          }
          if (status === 'failed') {
            metadata.retryable = true;
          }
          return metadata;
        })();
        process.stdout.write(JSON.stringify(responseFor(request, true, {
          summary: buildSummaries(state).find((item) => item.source.id === sourceId) || null,
          source: {
            id: sourceId,
            kind: source.kind,
            displayName: source.displayName,
            locator: source.locator,
            addedAt: '2026-03-25T12:00:00Z',
            selectionMode: 'partial'
          },
          sourceMetadata,
          binding: {
            selectedLeafIds: source.selectedLeafIds || [],
            targets: bindingsTargets
          },
          leafs: (source.leafs || []).map((leaf) => ({
            id: leaf.id,
            sourceId,
            title: leaf.name,
            name: leaf.name,
            linkName: leaf.linkName,
            description: leaf.description,
            relativePath: `${leaf.id}`,
            absolutePath: path.join(rootPath, 'docs', sourceId, leaf.id),
            skillFilePath: path.join(rootPath, 'docs', sourceId, leaf.id, 'SKILL.md'),
            metadataWarnings: leaf.metadataWarnings || []
          })),
          deployments: (source.enabledTargets || []).map((target) => ({
            sourceId,
            leafId: ((source.targetLeafIdsByTarget && source.targetLeafIdsByTarget[target]) || [])[0] || null,
            target,
            status: 'active'
          }))
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

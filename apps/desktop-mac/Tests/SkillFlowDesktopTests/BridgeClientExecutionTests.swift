import Darwin
import Foundation
import XCTest

@testable import SkillFlowDesktop

final class BridgeClientExecutionTests: XCTestCase {
    private var fixture: SlowBridgeFixture?
    private var stubbornFixture: StubbornBridgeFixture?
    private var stubbornProcessGroupFixture: StubbornProcessGroupBridgeFixture?
    private var concurrentHelpersFixture: ConcurrentHelpersBridgeFixture?
    private var recordingFixture: RecordingBridgeFixture?
    private var importDraftRetryFixture: ImportDraftRetryBridgeFixture?
    private var savedNodeOverride: String?

    override func tearDownWithError() throws {
        try fixture?.tearDown()
        fixture = nil
        try stubbornFixture?.tearDown()
        stubbornFixture = nil
        try stubbornProcessGroupFixture?.tearDown()
        stubbornProcessGroupFixture = nil
        try concurrentHelpersFixture?.tearDown()
        concurrentHelpersFixture = nil
        try recordingFixture?.tearDown()
        recordingFixture = nil
        try importDraftRetryFixture?.tearDown()
        importDraftRetryFixture = nil
        if let savedNodeOverride {
            setenv("SKILL_FLOW_DESKTOP_NODE_OVERRIDE", savedNodeOverride, 1)
        } else {
            unsetenv("SKILL_FLOW_DESKTOP_NODE_OVERRIDE")
        }
        savedNodeOverride = nil
    }

    func testListAllowsMainActorWorkWhileHelperIsStillRunning() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 250)
        self.fixture = fixture

        let bridge = await MainActor.run { BridgeClient() }
        let mainActorFlag = ThreadSafeFlag()

        let listTask = Task {
            try await bridge.list()
        }

        let mainActorPingTask = Task.detached {
            try await Task.sleep(nanoseconds: 50_000_000)
            await MainActor.run {
                mainActorFlag.setTrue()
            }
        }

        try await Task.sleep(nanoseconds: 120_000_000)
        XCTAssertTrue(
            mainActorFlag.value,
            "MainActor work should continue while the bridge helper is still running."
        )

        let response = try await listTask.value
        try await mainActorPingTask.value

        XCTAssertEqual(response.command, .list)
        XCTAssertTrue(response.ok)
    }

    func testListTimesOutWhenHelperNeverExits() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 5_000)
        self.fixture = fixture

        let bridge = await MainActor.run { BridgeClient(commandTimeoutMilliseconds: 50) }

        do {
            _ = try await bridge.list()
            XCTFail("Expected list to time out before the helper exits.")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Operation timed out after 50ms.")
        }
    }

    func testPreviewImportSourceUsesImportCommandTimeout() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 75)
        self.fixture = fixture

        let bridge = await MainActor.run { BridgeClient(commandTimeoutMilliseconds: 50) }

        let response = try await bridge.previewImportSource(locator: "anthropics/skills")

        XCTAssertEqual(response.command, BridgeCommand.previewImportSource)
        XCTAssertTrue(response.ok)
    }

    func testUpdateTimeoutScalesWithSelectedSourceCount() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 100)
        self.fixture = fixture

        let bridge = await MainActor.run {
            BridgeClient(
                commandTimeoutMilliseconds: 25,
                importCommandTimeoutMilliseconds: 50,
                updateSourceTimeoutMilliseconds: 75,
                updateCommandMaximumTimeoutMilliseconds: 150
            )
        }

        let response = try await bridge.updateSources(["alpha", "beta"])

        XCTAssertEqual(response.command, BridgeCommand.update)
        XCTAssertTrue(response.ok)
    }

    func testSingleSourceUpdateUsesOneSourceBudget() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 100)
        self.fixture = fixture

        let bridge = await MainActor.run {
            BridgeClient(
                updateSourceTimeoutMilliseconds: 50,
                updateCommandMaximumTimeoutMilliseconds: 150
            )
        }

        do {
            _ = try await bridge.updateSources(["alpha"])
            XCTFail("Expected one source update to use one source budget.")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Operation timed out after 50ms.")
        }
    }

    func testUpdateAllUsesMaximumUpdateBudget() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 100)
        self.fixture = fixture

        let bridge = await MainActor.run {
            BridgeClient(
                updateSourceTimeoutMilliseconds: 50,
                updateCommandMaximumTimeoutMilliseconds: 150
            )
        }

        let response = try await bridge.updateAll()

        XCTAssertEqual(response.command, BridgeCommand.update)
        XCTAssertTrue(response.ok)
    }

    func testSelectedUpdateBudgetDoesNotExceedMaximum() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 150)
        self.fixture = fixture

        let bridge = await MainActor.run {
            BridgeClient(
                updateSourceTimeoutMilliseconds: 50,
                updateCommandMaximumTimeoutMilliseconds: 100
            )
        }

        do {
            _ = try await bridge.updateSources(["alpha", "beta", "gamma", "delta"])
            XCTFail("Expected selected update budget to stop at its maximum.")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Operation timed out after 100ms.")
        }
    }

    func testTimedOutHelperIsForceKilledWhenItIgnoresTerminate() async throws {
        let fixture = try StubbornBridgeFixture.install()
        stubbornFixture = fixture

        let bridge = await MainActor.run {
            BridgeClient(commandTimeoutMilliseconds: 50, commandTimeoutGraceMilliseconds: 50)
        }
        let listTask = Task {
            try await bridge.list()
        }
        let pid = try await fixture.waitForPid()

        do {
            _ = try await listTask.value
            XCTFail("Expected list to time out before the helper exits.")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Operation timed out after 50ms.")
        }

        try await waitForProcessToExit(pid: pid, timeoutNanoseconds: 1_000_000_000)
    }

    func testOrdinaryTimeoutDoesNotKillHelperDescendants() async throws {
        let fixture = try StubbornProcessGroupBridgeFixture.install()
        stubbornProcessGroupFixture = fixture
        let bridge = await MainActor.run {
            BridgeClient(commandTimeoutMilliseconds: 50, commandTimeoutGraceMilliseconds: 50)
        }

        let listTask = Task { try await bridge.list() }
        let pids = try await fixture.waitForPids()

        do {
            _ = try await listTask.value
            XCTFail("Expected list to time out before the helper exits.")
        } catch {
            XCTAssertEqual(error.localizedDescription, "Operation timed out after 50ms.")
        }

        try await waitForProcessToExit(pid: pids.helper, timeoutNanoseconds: 1_000_000_000)
        XCTAssertTrue(
            isProcessRunning(pid: pids.child),
            "Ordinary timeout should preserve the upstream scope and leave helper descendants alone."
        )
    }

    func testQuitCancellationKillsTheEntireHelperProcessGroupAfterGracePeriod() async throws {
        let fixture = try StubbornProcessGroupBridgeFixture.install()
        stubbornProcessGroupFixture = fixture
        let bridge = await MainActor.run { BridgeClient(quitCancellationGraceMilliseconds: 50) }

        let updateTask = Task { try await bridge.updateSources(["alpha"]) }
        let pids = try await fixture.waitForPids()

        let cancelled = await bridge.cancelActiveHelperForTermination()
        XCTAssertTrue(cancelled)
        _ = try? await updateTask.value

        try await waitForProcessToExit(pid: pids.helper, timeoutNanoseconds: 1_000_000_000)
        try await waitForProcessToExit(pid: pids.child, timeoutNanoseconds: 1_000_000_000)
    }

    func testQuitCancellationWaitsForDescendantsAfterHelperExits() async throws {
        let fixture = try StubbornProcessGroupBridgeFixture.install(helperIgnoresTerm: false)
        stubbornProcessGroupFixture = fixture
        let bridge = await MainActor.run { BridgeClient(quitCancellationGraceMilliseconds: 50) }

        let updateTask = Task { try await bridge.updateSources(["alpha"]) }
        let pids = try await fixture.waitForPids()

        let cancelled = await bridge.cancelActiveHelperForTermination()
        XCTAssertTrue(cancelled)
        _ = try? await updateTask.value

        try await waitForProcessToExit(pid: pids.helper, timeoutNanoseconds: 1_000_000_000)
        try await waitForProcessToExit(pid: pids.child, timeoutNanoseconds: 1_000_000_000)
    }

    func testQuitCancellationStopsDurableAndDisposableHelpersWithoutLosingTheUpdate() async throws {
        let fixture = try ConcurrentHelpersBridgeFixture.install()
        concurrentHelpersFixture = fixture
        let bridge = await MainActor.run { BridgeClient(quitCancellationGraceMilliseconds: 50) }

        let updateTask = Task { try await bridge.updateSources(["alpha"]) }
        let updatePids = try await fixture.waitForCommand("update")
        let previewTask = Task { try await bridge.previewImportSource(locator: "anthropics/skills") }
        let previewPids = try await fixture.waitForCommand("preview-import-source")

        XCTAssertTrue(await bridge.cancelActiveHelperForTermination())
        _ = try? await updateTask.value
        _ = try? await previewTask.value

        for pid in [updatePids.helper, updatePids.child, previewPids.helper, previewPids.child] {
            try await waitForProcessToExit(pid: pid, timeoutNanoseconds: 1_000_000_000)
        }
    }

    func testTerminationLatchCancelsAProtectedOperationBeforeItsHelperLaunches() async {
        let bridge = await MainActor.run { BridgeClient() }

        XCTAssertTrue(await bridge.cancelActiveHelperForTermination())

        do {
            _ = try await bridge.updateSources(["alpha"])
            XCTFail("Expected the queued protected operation to be cancelled before launch.")
        } catch BridgeClientError.commandFailed(let message, _) {
            XCTAssertTrue(message.contains("terminating"))
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func testRecoveryRequiredAllowsPreviewButRejectsPreparationAndDurableMutation() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture
        let bridge = await MainActor.run { BridgeClient() }
        XCTAssertTrue(await bridge.cancelActiveHelperForTermination())
        bridge.enterRecoveryRequiredState()

        let preview = try await bridge.previewImportSource(locator: "anthropics/skills")
        XCTAssertTrue(preview.ok)

        for operation in [
            { try await bridge.prepareImportSource(locator: "anthropics/skills") },
            { try await bridge.updateSources(["alpha"]) },
        ] {
            do {
                _ = try await operation()
                XCTFail("Expected Recovery Required to reject preparation and durable mutation.")
            } catch BridgeClientError.commandFailed(let message, _) {
                XCTAssertTrue(message.contains("terminating"))
            }
        }
    }

    func testListFailsWithActionableNodeRequirementWhenNodeIsMissing() async throws {
        let fixture = try SlowBridgeFixture.install(delayMilliseconds: 0)
        self.fixture = fixture
        savedNodeOverride = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_NODE_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_NODE_OVERRIDE", "/tmp/skill-flow-tests/missing-node", 1)

        let bridge = await MainActor.run { BridgeClient() }

        do {
            _ = try await bridge.list()
            XCTFail("Expected missing node requirement to fail before launching the helper.")
        } catch {
            XCTAssertEqual(
                error.localizedDescription,
                "Node.js 20+ is required to run Skill Flow Desktop. Install it, then retry. README: https://github.com/VintLin/skill-flow#desktop-prerequisites"
            )
        }
    }

    func testNodeResolutionPrefersDebugOverride() {
        let resolved = BridgeClient.resolveNodeExecutable(
            bundleURL: URL(fileURLWithPath: "/Applications/Skill Flow.app"),
            architecture: "arm64",
            environment: ["SKILL_FLOW_DESKTOP_NODE_OVERRIDE": "/tmp/custom-node"],
            isExecutable: { _ in false }
        )

        XCTAssertEqual(resolved, "/tmp/custom-node")
    }

    func testNodeResolutionPrefersBundledRuntimeBeforeSystemNode() {
        let bundleURL = URL(fileURLWithPath: "/Applications/Skill Flow.app")
        let bundledNode = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin/node"
        let resolved = BridgeClient.resolveNodeExecutable(
            bundleURL: bundleURL,
            architecture: "arm64",
            environment: [:],
            isExecutable: { path in
                path == bundledNode || path == "/opt/homebrew/bin/node"
            }
        )

        XCTAssertEqual(resolved, bundledNode)
    }

    func testNodeResolutionFallsBackToSystemNodeWhenBundledRuntimeIsUnavailable() {
        let resolved = BridgeClient.resolveNodeExecutable(
            bundleURL: URL(fileURLWithPath: "/Applications/Skill Flow.app"),
            architecture: "arm64",
            environment: [:],
            isExecutable: { path in
                path == "/usr/local/bin/node"
            }
        )

        XCTAssertEqual(resolved, "/usr/local/bin/node")
    }

    func testNodeResolutionFallsBackToEnvWhenNoKnownNodePathExists() {
        let resolved = BridgeClient.resolveNodeExecutable(
            bundleURL: URL(fileURLWithPath: "/Applications/Skill Flow.app"),
            architecture: "arm64",
            environment: [:],
            isExecutable: { _ in false }
        )

        XCTAssertEqual(resolved, "node")
    }

    func testBundledNodeBinResolutionRequiresBundledNode() {
        let bundleURL = URL(fileURLWithPath: "/Applications/Skill Flow.app")
        let bundledNode = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin/node"

        let resolved = BridgeClient.resolveBundledNodeBinDirectory(
            bundleURL: bundleURL,
            architecture: "arm64",
            isExecutable: { path in
                path == bundledNode
            }
        )

        XCTAssertEqual(resolved, "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin")
    }

    func testBundledNodeBinResolutionSkipsWhenDebugNodeOverrideIsSet() {
        let resolved = BridgeClient.resolveBundledNodeBinDirectory(
            bundleURL: URL(fileURLWithPath: "/Applications/Skill Flow.app"),
            architecture: "arm64",
            environment: ["SKILL_FLOW_DESKTOP_NODE_OVERRIDE": "/tmp/custom-node"],
            isExecutable: { _ in true }
        )

        XCTAssertNil(resolved)
    }

    func testBridgeEnvironmentPrependsBundledNodeBinAndExportsBundledNpx() {
        let bundledBin = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin"
        let bundledNpx = "\(bundledBin)/npx"

        let environment = BridgeClient.bridgeEnvironment(
            baseEnvironment: [
                "PATH": "/usr/bin",
                "HOME": "/Users/example",
            ],
            bundledNodeBinDirectory: bundledBin,
            isExecutable: { path in
                path == bundledNpx
            }
        )

        XCTAssertEqual(environment["SKILL_FLOW_CALLER"], "desktop-bridge")
        XCTAssertEqual(environment["SKILL_FLOW_BUNDLED_NPX"], bundledNpx)
        XCTAssertEqual(environment["PATH"], "\(bundledBin):/usr/bin")
        XCTAssertEqual(environment["HOME"], "/Users/example")
    }

    func testBridgeEnvironmentSkipsBundledNpxWhenItIsMissing() {
        let bundledBin = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin"

        let environment = BridgeClient.bridgeEnvironment(
            baseEnvironment: [
                "PATH": "/usr/bin",
                "HOME": "/Users/example",
            ],
            bundledNodeBinDirectory: bundledBin,
            isExecutable: { _ in false }
        )

        XCTAssertEqual(environment["SKILL_FLOW_CALLER"], "desktop-bridge")
        XCTAssertNil(environment["SKILL_FLOW_BUNDLED_NPX"])
        XCTAssertEqual(environment["PATH"], "\(bundledBin):/usr/bin")
        XCTAssertEqual(environment["HOME"], "/Users/example")
    }

    func testBridgeEnvironmentRemovesInheritedBundledNpxWhenBundledNpxIsMissing() {
        let bundledBin = "/Applications/Skill Flow.app/Contents/Resources/node/arm64/bin"

        let environment = BridgeClient.bridgeEnvironment(
            baseEnvironment: [
                "PATH": "/usr/bin",
                "SKILL_FLOW_BUNDLED_NPX": "/old/path/npx",
            ],
            bundledNodeBinDirectory: bundledBin,
            isExecutable: { _ in false }
        )

        XCTAssertNil(environment["SKILL_FLOW_BUNDLED_NPX"])
        XCTAssertEqual(environment["PATH"], "\(bundledBin):/usr/bin")
    }

    func testRuntimeMissingCommandErrorsAreMappedToDependencyGuidance() {
        XCTAssertEqual(
            BridgeClient.dependencyError(for: "spawn git ENOENT")?.localizedDescription,
            "Git is required for this operation. Install Git or Xcode Command Line Tools, then retry. README: https://github.com/VintLin/skill-flow#desktop-prerequisites"
        )
        XCTAssertEqual(
            BridgeClient.dependencyError(for: "/bin/sh: npx: command not found")?.localizedDescription,
            "`npx` is required for ClawHub imports. Install Node.js/npm, then retry. README: https://github.com/VintLin/skill-flow#desktop-prerequisites"
        )
    }

    func testClawHubPreflightAcceptsBundledNpxBeforeSystemNpx() throws {
        let source = try sourceText()

        XCTAssertTrue(source.contains("bundledNpxPath(in: bundledNodeBinDirectory)"))
        XCTAssertTrue(source.contains("if locator.hasPrefix(\"clawhub:\"), bundledNpxPath(in: bundledNodeBinDirectory) == nil, !isCommandAvailable(\"npx\")"))
        XCTAssertTrue(source.contains("bundledNodeBinDirectory: String?"))
    }

    func testHelperResolutionPrefersDesktopBridgeBeforeLegacyCLI() throws {
        let source = try sourceText()
        let desktopBridgePath = "Contents/Resources/helper/dist/desktop-bridge.js"
        let desktopBridgeResource = "path(forResource: \"desktop-bridge\", ofType: \"js\", inDirectory: \"helper/dist\")"
        let legacyCLIPath = "Contents/Resources/helper/dist/cli.js"

        let desktopBridgePathRange = try XCTUnwrap(source.range(of: desktopBridgePath))
        let legacyCLIPathRange = try XCTUnwrap(source.range(of: legacyCLIPath))

        XCTAssertTrue(source.contains(desktopBridgeResource))
        XCTAssertLessThan(desktopBridgePathRange.lowerBound, legacyCLIPathRange.lowerBound)
    }

    func testApplyEncodesProjectScopePayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.apply(
            sourceId: "alpha",
            scope: .project("repo-a"),
            selectedLeafIds: ["alpha:a"],
            enabledTargets: ["codex"]
        )

        let payload = try fixture.lastPayload()
        let scope = try XCTUnwrap(payload["scope"] as? [String: Any])
        XCTAssertEqual(scope["kind"] as? String, "project")
        XCTAssertEqual(scope["projectId"] as? String, "repo-a")
    }

    func testInspectEncodesProjectScopePayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.inspect(sourceId: "alpha", scope: .project("repo-a"))

        let payload = try fixture.lastPayload()
        let scope = try XCTUnwrap(payload["scope"] as? [String: Any])
        XCTAssertEqual(scope["kind"] as? String, "project")
        XCTAssertEqual(scope["projectId"] as? String, "repo-a")
    }

    func testPrepareImportSourceSendsExpectedPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.prepareImportSource(locator: "anthropics/skills")

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.lastCommand(), "prepare-import-source")
        XCTAssertEqual(payload["locator"] as? String, "anthropics/skills")
    }

    func testMigrateStateToV2SendsExpectedPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.migrateStateToV2()

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.lastCommand(), "migrate-state")
        XCTAssertEqual(payload["to"] as? Int, 2)
        XCTAssertEqual(payload["backup"] as? Bool, true)
    }

    func testBootstrapRunsStateMigrationBeforeLoadingWorkspace() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.bootstrap()

        let commands = try fixture.loggedCommands()
        XCTAssertEqual(commands, ["migrate-state", "bootstrap"])
    }

    func testCommitImportSourceAlwaysSendsSelectedSkillsPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.commitImportSource(
            preparationId: "prep-1",
            selectedSkills: [
                ImportSkillSelection(uiId: "skill_review", selector: .repoPath("review")),
            ],
            enabledTargets: ["codex"]
        )

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.lastCommand(), "commit-import-source")
        XCTAssertEqual(payload["preparationId"] as? String, "prep-1")
        let draft = try XCTUnwrap(payload["draft"] as? [String: Any])
        XCTAssertEqual(draft["skillSelectionMode"] as? String, "selected")
        let selectedSkills = try XCTUnwrap(draft["selectedSkills"] as? [[String: Any]])
        XCTAssertEqual(selectedSkills.first?["uiId"] as? String, "skill_review")
        let selector = try XCTUnwrap(selectedSkills.first?["selector"] as? [String: Any])
        XCTAssertEqual(selector["kind"] as? String, "repoPath")
        XCTAssertEqual(selector["path"] as? String, "review")
        XCTAssertNil(draft["selectedSkillIds"])
        XCTAssertEqual(draft["enabledTargets"] as? [String], ["codex"])
    }

    func testCommitImportSourceSendsSelectedSkillsPayloadAfterImportDraftCapability() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }
        _ = try await bridge.bootstrap()

        _ = try await bridge.commitImportSource(
            preparationId: "prep-1",
            selectedSkills: [
                ImportSkillSelection(uiId: "skill_review", selector: .repoPath("skills/review")),
            ],
            enabledTargets: ["codex"]
        )

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.lastCommand(), "commit-import-source")
        XCTAssertEqual(payload["preparationId"] as? String, "prep-1")
        let draft = try XCTUnwrap(payload["draft"] as? [String: Any])
        XCTAssertEqual(draft["skillSelectionMode"] as? String, "selected")
        let selectedSkills = try XCTUnwrap(draft["selectedSkills"] as? [[String: Any]])
        XCTAssertEqual(selectedSkills.first?["uiId"] as? String, "skill_review")
        let selector = try XCTUnwrap(selectedSkills.first?["selector"] as? [String: Any])
        XCTAssertEqual(selector["kind"] as? String, "repoPath")
        XCTAssertEqual(selector["path"] as? String, "skills/review")
        XCTAssertNil(draft["selectedSkillIds"])
        XCTAssertEqual(draft["enabledTargets"] as? [String], ["codex"])
    }

    func testCommitImportSourceRepoPathSelectionStillUsesSelectedSkillsPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }
        _ = try await bridge.bootstrap()

        _ = try await bridge.commitImportSource(
            preparationId: "prep-1",
            selectedSkills: [
                .repoPath("skills/review"),
            ],
            enabledTargets: ["codex"]
        )

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.lastCommand(), "commit-import-source")
        let draft = try XCTUnwrap(payload["draft"] as? [String: Any])
        XCTAssertEqual(draft["skillSelectionMode"] as? String, "selected")
        let selectedSkills = try XCTUnwrap(draft["selectedSkills"] as? [[String: Any]])
        XCTAssertEqual(selectedSkills.first?["uiId"] as? String, "skills/review")
        let selector = try XCTUnwrap(selectedSkills.first?["selector"] as? [String: Any])
        XCTAssertEqual(selector["path"] as? String, "skills/review")
        XCTAssertNil(draft["selectedSkillIds"])
    }

    func testDesktopImportSourcePreparesThenCommitsSelectedSkillsPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.importSource(
            locator: "anthropics/skills",
            selectedSkills: [
                ImportSkillSelection(uiId: "skill_review", selector: .repoPath("skills/review")),
            ],
            enabledTargets: ["codex"]
        )

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.loggedCommands(), ["prepare-import-source", "commit-import-source"])
        XCTAssertEqual(try fixture.lastCommand(), "commit-import-source")
        XCTAssertEqual(payload["preparationId"] as? String, "prep-desktop")
        let draft = try XCTUnwrap(payload["draft"] as? [String: Any])
        XCTAssertEqual(draft["skillSelectionMode"] as? String, "selected")
        let selectedSkills = try XCTUnwrap(draft["selectedSkills"] as? [[String: Any]])
        XCTAssertEqual(selectedSkills.first?["uiId"] as? String, "skill_review")
        let selector = try XCTUnwrap(selectedSkills.first?["selector"] as? [String: Any])
        XCTAssertEqual(selector["path"] as? String, "skills/review")
        XCTAssertNil(draft["selectedSkillIds"])
    }

    func testDesktopImportSourceCanCommitAllSkillSelectionMode() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.importSource(
            locator: "anthropics/skills",
            selectedSkills: [],
            enabledTargets: [],
            skillSelectionMode: .all
        )

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.loggedCommands(), ["prepare-import-source", "commit-import-source"])
        XCTAssertEqual(try fixture.lastCommand(), "commit-import-source")
        let draft = try XCTUnwrap(payload["draft"] as? [String: Any])
        XCTAssertEqual(draft["skillSelectionMode"] as? String, "all")
        XCTAssertEqual((draft["selectedSkills"] as? [[String: Any]])?.count, 0)
    }

    func testCommitImportSourceDoesNotRetryLegacyDraftWhenBridgeRejectsV2Draft() async throws {
        let fixture = try ImportDraftRetryBridgeFixture.install()
        importDraftRetryFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }
        _ = try await bridge.bootstrap()

        do {
            _ = try await bridge.commitImportSource(
                preparationId: "prep-1",
                selectedSkills: [
                    ImportSkillSelection(uiId: "skill_review", selector: .repoPath("review")),
                ],
                enabledTargets: ["codex"]
            )
            XCTFail("Expected commitImportSource to throw when selectedSkills is unsupported.")
        } catch BridgeClientError.commandFailed(let message, let response) {
            XCTAssertEqual(message, "selectedSkills is not supported")
            XCTAssertEqual(response?.errors.first?.code, "BRIDGE_IMPORT_DRAFT_REJECTED")
        }

        let requests = try fixture.loggedRequests()
        let mutationRequests = requests.filter { ($0["command"] as? String) == "commit-import-source" }
        XCTAssertEqual(mutationRequests.count, 1)
        let firstPayload = try XCTUnwrap(mutationRequests[0]["payload"] as? [String: Any])
        let firstDraft = try XCTUnwrap(firstPayload["draft"] as? [String: Any])
        XCTAssertEqual(firstDraft["skillSelectionMode"] as? String, "selected")
        XCTAssertNotNil(firstDraft["selectedSkills"])
        XCTAssertNil(firstDraft["selectedSkillIds"])
    }

    func testRenameSourceEncodesPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.renameSource(sourceId: "alpha", displayName: "Writing Tools")

        let payload = try fixture.lastPayload()
        XCTAssertEqual(payload["sourceId"] as? String, "alpha")
        XCTAssertEqual(payload["displayName"] as? String, "Writing Tools")
        XCTAssertEqual(try fixture.lastCommand(), "rename-source")
    }

    func testCreateCollectionSendsExpectedPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.createCollection(
            displayName: "Writing Stack",
            skills: [
                CollectionSkillRef(sourceId: "source-a", leafId: "skill-a"),
                CollectionSkillRef(sourceId: "source-b", leafId: "skill-b"),
            ],
            enabledTargets: ["codex", "claude"]
        )

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.lastCommand(), "create-collection")
        XCTAssertEqual(payload["displayName"] as? String, "Writing Stack")
        XCTAssertEqual(payload["enabledTargets"] as? [String], ["codex", "claude"])

        let skills = try XCTUnwrap(payload["skills"] as? [[String: Any]])
        XCTAssertEqual(skills.count, 2)
        XCTAssertEqual(skills[0]["sourceId"] as? String, "source-a")
        XCTAssertEqual(skills[0]["leafId"] as? String, "skill-a")
        XCTAssertEqual(skills[1]["sourceId"] as? String, "source-b")
        XCTAssertEqual(skills[1]["leafId"] as? String, "skill-b")
    }

    func testMergeGroupsSendsExpectedPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.mergeGroups(
            displayName: "Merged Tools",
            sourceIds: ["source-a", "source-b"],
            enabledTargets: ["codex"]
        )

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.lastCommand(), "merge-groups")
        XCTAssertEqual(payload["displayName"] as? String, "Merged Tools")
        XCTAssertEqual(payload["sourceIds"] as? [String], ["source-a", "source-b"])
        XCTAssertEqual(payload["enabledTargets"] as? [String], ["codex"])
    }

    func testRestoreCollectionSourcesSendsExpectedPayload() async throws {
        let fixture = try RecordingBridgeFixture.install()
        recordingFixture = fixture

        let bridge = await MainActor.run { BridgeClient() }

        _ = try await bridge.restoreCollectionSources(collectionId: "collection-1")

        let payload = try fixture.lastPayload()
        XCTAssertEqual(try fixture.lastCommand(), "restore-collection-sources")
        XCTAssertEqual(payload["collectionId"] as? String, "collection-1")
    }

    private func sourceText() throws -> String {
        let desktopRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let sourceURL = desktopRoot
            .appendingPathComponent("Sources/DesktopApp/Runtime/Bridge/BridgeClient.swift")
        return try String(contentsOf: sourceURL, encoding: .utf8)
    }

    private func waitForProcessToExit(pid: Int32, timeoutNanoseconds: UInt64) async throws {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutNanoseconds) / 1_000_000_000)
        while Date() < deadline {
            if !isProcessRunning(pid: pid) {
                return
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        XCTFail("Expected helper process \(pid) to exit.")
    }

    private func isProcessRunning(pid: Int32) -> Bool {
        if kill(pid, 0) == 0 {
            return true
        }
        return errno == EPERM
    }
}

private final class StubbornProcessGroupBridgeFixture {
    private let rootURL: URL
    private let pidsURL: URL
    private let savedHelperOverride: String?

    private init(rootURL: URL, pidsURL: URL, savedHelperOverride: String?) {
        self.rootURL = rootURL
        self.pidsURL = pidsURL
        self.savedHelperOverride = savedHelperOverride
    }

    static func install(helperIgnoresTerm: Bool = true) throws -> StubbornProcessGroupBridgeFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-bridge-process-group-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)
        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        let pidsURL = rootURL.appendingPathComponent("pids.json")
        let helperTermHandler = helperIgnoresTerm ? "process.on(\"SIGTERM\", () => {});" : ""
        let script = """
        const fs = require("node:fs");
        const { spawn } = require("node:child_process");
        const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: "ignore" });
        fs.writeFileSync(\(String(reflecting: pidsURL.path)), JSON.stringify({ helper: process.pid, child: child.pid }));
        \(helperTermHandler)
        process.stdin.resume();
        setInterval(() => {}, 1000);
        """
        try script.write(to: helperURL, atomically: true, encoding: .utf8)
        let saved = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)
        return StubbornProcessGroupBridgeFixture(rootURL: rootURL, pidsURL: pidsURL, savedHelperOverride: saved)
    }

    func waitForPids() async throws -> (helper: Int32, child: Int32) {
        let deadline = Date().addingTimeInterval(1)
        while Date() < deadline {
            if let data = try? Data(contentsOf: pidsURL),
               let value = try? JSONSerialization.jsonObject(with: data) as? [String: Int],
               let helper = value["helper"], let child = value["child"] {
                return (Int32(helper), Int32(child))
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw XCTSkip("Timed out waiting for helper process group PIDs.")
    }

    func tearDown() throws {
        if let savedHelperOverride { setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", savedHelperOverride, 1) }
        else { unsetenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE") }
        if let data = try? Data(contentsOf: pidsURL),
           let value = try? JSONSerialization.jsonObject(with: data) as? [String: Int] {
            for pid in value.values { if kill(Int32(pid), 0) == 0 { kill(Int32(pid), SIGKILL) } }
        }
        if FileManager.default.fileExists(atPath: rootURL.path) { try FileManager.default.removeItem(at: rootURL) }
    }
}

private final class ConcurrentHelpersBridgeFixture {
    private let rootURL: URL
    private let recordsURL: URL
    private let savedHelperOverride: String?

    private init(rootURL: URL, recordsURL: URL, savedHelperOverride: String?) {
        self.rootURL = rootURL
        self.recordsURL = recordsURL
        self.savedHelperOverride = savedHelperOverride
    }

    static func install() throws -> ConcurrentHelpersBridgeFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-concurrent-helpers-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)
        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        let recordsURL = rootURL.appendingPathComponent("helpers.jsonl")
        let script = """
        const fs = require("node:fs");
        const { spawn } = require("node:child_process");
        let input = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => { input += chunk; });
        process.stdin.on("end", () => {
          const request = JSON.parse(input || "{}");
          const child = spawn(process.execPath, ["-e", "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: "ignore" });
          fs.appendFileSync(
            \(String(reflecting: recordsURL.path)),
            JSON.stringify({ command: request.command, helper: process.pid, child: child.pid }) + "\\n"
          );
        });
        process.on("SIGTERM", () => {});
        process.stdin.resume();
        setInterval(() => {}, 1000);
        """
        try script.write(to: helperURL, atomically: true, encoding: .utf8)
        let saved = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)
        return ConcurrentHelpersBridgeFixture(
            rootURL: rootURL,
            recordsURL: recordsURL,
            savedHelperOverride: saved
        )
    }

    func waitForCommand(_ command: String) async throws -> (helper: Int32, child: Int32) {
        let deadline = Date().addingTimeInterval(1)
        while Date() < deadline {
            if let contents = try? String(contentsOf: recordsURL, encoding: .utf8) {
                for line in contents.split(separator: "\n") {
                    guard
                        let data = line.data(using: .utf8),
                        let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                        value["command"] as? String == command,
                        let helper = value["helper"] as? Int,
                        let child = value["child"] as? Int
                    else { continue }
                    return (Int32(helper), Int32(child))
                }
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw XCTSkip("Timed out waiting for helper command '\(command)'.")
    }

    func tearDown() throws {
        if let savedHelperOverride { setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", savedHelperOverride, 1) }
        else { unsetenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE") }
        if let contents = try? String(contentsOf: recordsURL, encoding: .utf8) {
            for line in contents.split(separator: "\n") {
                guard
                    let data = line.data(using: .utf8),
                    let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                else { continue }
                for key in ["helper", "child"] {
                    if let pid = value[key] as? Int, kill(Int32(pid), 0) == 0 {
                        kill(Int32(pid), SIGKILL)
                    }
                }
            }
        }
        if FileManager.default.fileExists(atPath: rootURL.path) { try FileManager.default.removeItem(at: rootURL) }
    }
}

private final class SlowBridgeFixture {
    private let rootURL: URL
    private let savedHelperOverride: String?

    private init(rootURL: URL, savedHelperOverride: String?) {
        self.rootURL = rootURL
        self.savedHelperOverride = savedHelperOverride
    }

    static func install(delayMilliseconds: Int) throws -> SlowBridgeFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-bridge-tests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        try helperScript(delayMilliseconds: delayMilliseconds).write(to: helperURL, atomically: true, encoding: .utf8)

        let savedHelperOverride = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)

        return SlowBridgeFixture(rootURL: rootURL, savedHelperOverride: savedHelperOverride)
    }

    func tearDown() throws {
        if let savedHelperOverride {
            setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", savedHelperOverride, 1)
        } else {
            unsetenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE")
        }

        if FileManager.default.fileExists(atPath: rootURL.path) {
            try FileManager.default.removeItem(at: rootURL)
        }
    }

    private static func helperScript(delayMilliseconds: Int) -> String {
        """
        let input = [];
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => {
          input.push(chunk);
        });
        process.stdin.on("end", () => {
          const request = JSON.parse(input.join("") || "{}");
          setTimeout(() => {
            const response = {
              protocolVersion: "1.0",
              requestId: request.requestId ?? null,
              command: request.command ?? "list",
              ok: true,
              data: { command: request.command ?? "list" },
              warnings: [],
              errors: []
            };
            process.stdout.write(JSON.stringify(response));
          }, \(delayMilliseconds));
        });
        """
    }
}

private final class StubbornBridgeFixture {
    private let rootURL: URL
    private let pidURL: URL
    private let savedHelperOverride: String?

    private init(rootURL: URL, pidURL: URL, savedHelperOverride: String?) {
        self.rootURL = rootURL
        self.pidURL = pidURL
        self.savedHelperOverride = savedHelperOverride
    }

    static func install() throws -> StubbornBridgeFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-bridge-stubborn-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        let pidURL = rootURL.appendingPathComponent("helper.pid")
        try helperScript(pidPath: pidURL.path).write(to: helperURL, atomically: true, encoding: .utf8)

        let savedHelperOverride = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)

        return StubbornBridgeFixture(rootURL: rootURL, pidURL: pidURL, savedHelperOverride: savedHelperOverride)
    }

    func waitForPid() async throws -> Int32 {
        let deadline = Date().addingTimeInterval(1)
        while Date() < deadline {
            if let contents = try? String(contentsOf: pidURL, encoding: .utf8),
               let pid = Int32(contents.trimmingCharacters(in: .whitespacesAndNewlines)) {
                return pid
            }
            try await Task.sleep(nanoseconds: 10_000_000)
        }
        throw XCTSkip("Timed out waiting for stubborn helper PID.")
    }

    func tearDown() throws {
        if let savedHelperOverride {
            setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", savedHelperOverride, 1)
        } else {
            unsetenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE")
        }

        if let contents = try? String(contentsOf: pidURL, encoding: .utf8),
           let pid = Int32(contents.trimmingCharacters(in: .whitespacesAndNewlines)),
           kill(pid, 0) == 0 {
            kill(pid, SIGKILL)
        }

        if FileManager.default.fileExists(atPath: rootURL.path) {
            try FileManager.default.removeItem(at: rootURL)
        }
    }

    private static func helperScript(pidPath: String) -> String {
        """
        const fs = require("node:fs");
        fs.writeFileSync(\(String(reflecting: pidPath)), String(process.pid));
        process.on("SIGTERM", () => {});
        process.stdin.resume();
        setInterval(() => {}, 1000);
        """
    }
}

private final class RecordingBridgeFixture {
    private let rootURL: URL
    private let payloadURL: URL
    private let logURL: URL
    private let savedHelperOverride: String?

    private init(rootURL: URL, payloadURL: URL, logURL: URL, savedHelperOverride: String?) {
        self.rootURL = rootURL
        self.payloadURL = payloadURL
        self.logURL = logURL
        self.savedHelperOverride = savedHelperOverride
    }

    static func install() throws -> RecordingBridgeFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-bridge-payload-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let payloadURL = rootURL.appendingPathComponent("payload.json")
        let logURL = rootURL.appendingPathComponent("requests.jsonl")
        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        try recordingHelperScript(payloadPath: payloadURL.path, logPath: logURL.path).write(to: helperURL, atomically: true, encoding: .utf8)

        let savedHelperOverride = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)

        return RecordingBridgeFixture(rootURL: rootURL, payloadURL: payloadURL, logURL: logURL, savedHelperOverride: savedHelperOverride)
    }

    func lastPayload() throws -> [String: Any] {
        let data = try Data(contentsOf: payloadURL)
        let object = try JSONSerialization.jsonObject(with: data)
        let root = try XCTUnwrap(object as? [String: Any])
        return try XCTUnwrap(root["payload"] as? [String: Any])
    }

    func lastCommand() throws -> String {
        let data = try Data(contentsOf: payloadURL)
        let object = try JSONSerialization.jsonObject(with: data)
        let root = try XCTUnwrap(object as? [String: Any])
        return try XCTUnwrap(root["command"] as? String)
    }

    func loggedCommands() throws -> [String] {
        let text = try String(contentsOf: logURL, encoding: .utf8)
        return try text
            .split(separator: "\n")
            .map { line in
                let data = Data(line.utf8)
                let object = try JSONSerialization.jsonObject(with: data)
                let root = try XCTUnwrap(object as? [String: Any])
                return try XCTUnwrap(root["command"] as? String)
            }
    }

    func tearDown() throws {
        if let savedHelperOverride {
            setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", savedHelperOverride, 1)
        } else {
            unsetenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE")
        }

        if FileManager.default.fileExists(atPath: rootURL.path) {
            try FileManager.default.removeItem(at: rootURL)
        }
    }

    private static func recordingHelperScript(payloadPath: String, logPath: String) -> String {
        """
        const fs = require("node:fs");
        const input = [];
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => input.push(chunk));
        process.stdin.on("end", () => {
          const request = JSON.parse(input.join("") || "{}");
          fs.writeFileSync(\(String(reflecting: payloadPath)), JSON.stringify(request), "utf8");
          fs.appendFileSync(\(String(reflecting: logPath)), JSON.stringify(request) + "\\n", "utf8");
          const data = request.command === "bootstrap"
            ? { command: request.command ?? "list", capabilities: { importDraftV2: true } }
            : request.command === "prepare-import-source"
              ? { command: request.command, status: "ready", preparationId: "prep-desktop" }
              : { command: request.command ?? "list" };
          const response = {
            protocolVersion: "1.0",
            requestId: request.requestId ?? null,
            command: request.command ?? "list",
            ok: true,
            data,
            warnings: [],
            errors: []
          };
          process.stdout.write(JSON.stringify(response));
        });
        """
    }
}

private final class ImportDraftRetryBridgeFixture {
    private let rootURL: URL
    private let logURL: URL
    private let savedHelperOverride: String?

    private init(rootURL: URL, logURL: URL, savedHelperOverride: String?) {
        self.rootURL = rootURL
        self.logURL = logURL
        self.savedHelperOverride = savedHelperOverride
    }

    static func install() throws -> ImportDraftRetryBridgeFixture {
        let rootURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("skillflow-desktop-bridge-retry-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: rootURL, withIntermediateDirectories: true)

        let logURL = rootURL.appendingPathComponent("requests.json")
        let helperURL = rootURL.appendingPathComponent("bridge-helper.js")
        try helperScript(logPath: logURL.path).write(to: helperURL, atomically: true, encoding: .utf8)

        let savedHelperOverride = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"]
        setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", helperURL.path, 1)

        return ImportDraftRetryBridgeFixture(rootURL: rootURL, logURL: logURL, savedHelperOverride: savedHelperOverride)
    }

    func loggedRequests() throws -> [[String: Any]] {
        let data = try Data(contentsOf: logURL)
        let object = try JSONSerialization.jsonObject(with: data)
        return try XCTUnwrap(object as? [[String: Any]])
    }

    func tearDown() throws {
        if let savedHelperOverride {
            setenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE", savedHelperOverride, 1)
        } else {
            unsetenv("SKILL_FLOW_DESKTOP_HELPER_OVERRIDE")
        }

        if FileManager.default.fileExists(atPath: rootURL.path) {
            try FileManager.default.removeItem(at: rootURL)
        }
    }

    private static func helperScript(logPath: String) -> String {
        """
        const fs = require("node:fs");
        const input = [];
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", chunk => input.push(chunk));
        process.stdin.on("end", () => {
          const request = JSON.parse(input.join("") || "{}");
          const logPath = \(String(reflecting: logPath));
          const requests = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, "utf8")) : [];
          requests.push(request);
          fs.writeFileSync(logPath, JSON.stringify(requests), "utf8");
          const draft = request.payload && request.payload.draft ? request.payload.draft : {};
          if (Array.isArray(draft.selectedSkills) && !Array.isArray(draft.selectedSkillIds)) {
            process.stdout.write(JSON.stringify({
              protocolVersion: "1.0",
              requestId: request.requestId ?? null,
              command: request.command ?? "list",
              ok: false,
              data: null,
              warnings: [],
              errors: [{
                code: "BRIDGE_IMPORT_DRAFT_REJECTED",
                message: "selectedSkills is not supported"
              }]
            }));
            return;
          }
          const data = request.command === "bootstrap"
            ? { status: "ready", sourceId: "source-1", capabilities: { importDraftV2: true } }
            : { status: "ready", sourceId: "source-1" };
          process.stdout.write(JSON.stringify({
            protocolVersion: "1.0",
            requestId: request.requestId ?? null,
            command: request.command ?? "list",
            ok: true,
            data,
            warnings: [],
            errors: []
          }));
        });
        """
    }
}

private final class ThreadSafeFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var storedValue = false

    var value: Bool {
        lock.lock()
        defer { lock.unlock() }
        return storedValue
    }

    func setTrue() {
        lock.lock()
        storedValue = true
        lock.unlock()
    }
}

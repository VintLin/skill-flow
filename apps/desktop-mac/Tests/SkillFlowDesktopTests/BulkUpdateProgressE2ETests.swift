import AppKit
import SwiftUI
import XCTest

@testable import SkillFlowDesktop

/// Opt in with SKILL_FLOW_RUN_PROGRESS_E2E=1. Exercises the real Home action,
/// helper, update transactions, bridge reader, and unchanged card component.
@MainActor
final class BulkUpdateProgressE2ETests: XCTestCase {
    func testCompletedUnchangedAndFailedCardsStopBeforeSlowSiblingAndIgnoreStaleEvents() async throws {
        let fixture = try await ProgressE2EFixture.install()
        defer { fixture.restoreEnvironment() }
        let model = MainViewModel(bridgeClient: BridgeClient())
        await model.refreshList()
        let collectionIds = model.sourceIds.filter { !["fast", "failed", "slow", "unchanged", "repair"].contains($0) }
        XCTAssertFalse(collectionIds.isEmpty, "Fixture must include a real unchanged collection")
        model.sourceIds = ["fast", "failed", "repair", "slow", "unchanged"] + collectionIds
        try FileManager.default.removeItem(at: fixture.root.appendingPathComponent("release-precheck"))
        try FileManager.default.removeItem(at: fixture.root.appendingPathComponent("release-repair"))

        let update = Task { await model.updateAllGroupsFromHome() }
        try await fixture.waitFor("slow-precheck-blocked")
        try await fixture.waitUntil { !model.isUpdatingSource("unchanged") }
        try fixture.capture(model, name: "unchanged-while-sibling-precheck-blocked")
        XCTAssertFalse(model.isUpdatingSource("unchanged"))
        XCTAssertTrue(model.isUpdatingSource("slow"))
        try Data().write(to: fixture.root.appendingPathComponent("release-precheck"))
        try await fixture.waitFor("repair-before-apply")
        try fixture.capture(model, name: "repair-before-transaction-commit")
        XCTAssertTrue(model.isUpdatingSource("repair"), "Equal remote SHA with local drift must not clear loading")
        try Data().write(to: fixture.root.appendingPathComponent("release-repair"))
        try await fixture.waitFor("slow-before-apply")
        // Give the asynchronous pipe consumer a bounded opportunity to apply progress.
        try await fixture.waitUntil { !model.isUpdatingSource("fast") && !model.isUpdatingSource("failed") }
        try fixture.capture(model, name: "first-batch-before-slow-commit")
        XCTAssertFalse(model.isUpdatingSource("fast"), "A committed group must stop before its sibling")
        XCTAssertFalse(model.isUpdatingSource("failed"), "A failed group must stop after recovery")
        XCTAssertFalse(model.isUpdatingSource("repair"), "Repaired group must stop only after commit")
        for id in collectionIds { XCTAssertFalse(model.isUpdatingSource(id), "Unchanged group must stop independently") }
        XCTAssertTrue(model.isUpdatingSource("slow"), "Checkout promotion is not a completed transaction")
        XCTAssertTrue(fixture.exists("fast-transaction-committed"))
        XCTAssertTrue(fixture.exists("failed-transaction-failed"))
        XCTAssertFalse(fixture.exists("slow-transaction-committed"))
        try fixture.verifyCommittedContent("fast")
        // Card completion must not make the covered Operation Identity available again.
        await model.updateSource("fast")
        try fixture.releaseSlow()
        await update.value
        XCTAssertTrue(model.updatingSourceIds.isEmpty)
        try fixture.verifyCommittedContent("slow")

        // A fresh operation must ignore an earlier helper's real terminal event.
        try fixture.resetSlowGate()
        model.sourceIds = ["slow"]
        let next = Task { await model.updateAllGroupsFromHome() }
        try await fixture.waitFor("slow-before-apply")
        try await Task.sleep(for: .milliseconds(150))
        try fixture.capture(model, name: "second-batch-stale-event")
        XCTAssertTrue(model.isUpdatingSource("slow"))
        try fixture.releaseSlow()
        await next.value
        XCTAssertTrue(model.updatingSourceIds.isEmpty)
        try fixture.capture(model, name: "finished")
    }

    func testTimeoutClearsUnfinishedFeedbackAndNextUpdateStartsFresh() async throws {
        let fixture = try await ProgressE2EFixture.install()
        defer { fixture.restoreEnvironment() }
        let bridge = BridgeClient(updateSourceTimeoutMilliseconds: 5_000, updateCommandMaximumTimeoutMilliseconds: 5_000)
        let model = MainViewModel(bridgeClient: bridge)
        await model.refreshList()
        model.sourceIds = ["fast", "slow"]
        let update = Task { await model.updateAllGroupsFromHome() }
        try await fixture.waitFor("slow-before-apply")
        XCTAssertTrue(model.isUpdatingSource("slow"))
        await update.value
        XCTAssertTrue(model.updatingSourceIds.isEmpty, "Timeout must clear abandoned busy feedback")
        try fixture.verifyCommittedContent("fast")
        try fixture.capture(model, name: "timeout")
        try fixture.releaseSlow()
        model.sourceIds = ["slow"]
        await model.updateAllGroupsFromHome()
        XCTAssertTrue(model.updatingSourceIds.isEmpty)
        try fixture.verifyCommittedContent("slow")
        try fixture.capture(model, name: "after-timeout-retry")
    }
}

@MainActor
private final class ProgressE2EFixture {
    let root: URL
    private var savedEnvironment: [String: String?] = [:]
    private let artifacts: URL
    private init(root: URL, artifacts: URL) { self.root = root; self.artifacts = artifacts }

    static func install() async throws -> ProgressE2EFixture {
        guard ProcessInfo.processInfo.environment["SKILL_FLOW_RUN_PROGRESS_E2E"] == "1" else {
            throw XCTSkip("Run explicitly with SKILL_FLOW_RUN_PROGRESS_E2E=1")
        }
        let repo = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("skill-flow-progress-e2e-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let run = ProcessInfo.processInfo.environment["SKILL_FLOW_PROGRESS_E2E_RUN"] ?? "run"
        let artifacts = repo.appendingPathComponent(".scratch/issues/bulk-update-per-group-loading/validation/\(run)/\(root.lastPathComponent)")
        try FileManager.default.createDirectory(at: artifacts, withIntermediateDirectories: true)
        let fixture = ProgressE2EFixture(root: root, artifacts: artifacts)
        let helper = repo.appendingPathComponent("scripts/testing/bulk-update-progress-fixture.mjs")
        for (key, value) in [
            "SKILL_FLOW_PROGRESS_E2E_ROOT": root.path,
            "SKILL_FLOW_DESKTOP_HELPER_OVERRIDE": helper.path,
            "SKILL_FLOW_DESKTOP_NODE_OVERRIDE": "/opt/homebrew/bin/node",
            "NODE_OPTIONS": "--import \(repo.appendingPathComponent("node_modules/tsx/dist/loader.mjs").absoluteString)"
        ] { fixture.savedEnvironment[key] = .some(ProcessInfo.processInfo.environment[key]); setenv(key, value, 1) }
        let setup = Process()
        setup.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/node")
        setup.arguments = [helper.path, "--setup"]
        let output = Pipe()
        setup.standardOutput = output
        setup.standardError = output
        try setup.run()
        let data = output.fileHandleForReading.readDataToEndOfFile()
        setup.waitUntilExit()
        guard setup.terminationStatus == 0 else {
            fixture.restoreEnvironment()
            throw NSError(domain: "E2E setup", code: Int(setup.terminationStatus), userInfo: [NSLocalizedDescriptionKey: String(decoding: data, as: UTF8.self)])
        }
        print("E2E isolated root: \(root.path); artifacts: \(artifacts.path)")
        return fixture
    }

    func restoreEnvironment() {
        for (key, value) in savedEnvironment {
            if let value { setenv(key, value, 1) } else { unsetenv(key) }
        }
        savedEnvironment.removeAll()
    }
    func exists(_ name: String) -> Bool { FileManager.default.fileExists(atPath: root.appendingPathComponent(name).path) }
    func waitFor(_ name: String) async throws {
        let deadline = ContinuousClock.now + .seconds(15)
        while !exists(name), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(20)) }
        guard exists(name) else { throw NSError(domain: "E2E missing barrier \(name)", code: 1) }
    }
    func waitUntil(_ condition: () -> Bool) async throws {
        let deadline = ContinuousClock.now + .seconds(1)
        while !condition(), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(20)) }
    }
    func releaseSlow() throws { try Data().write(to: root.appendingPathComponent("release-slow")) }
    func resetSlowGate() throws {
        for name in ["release-slow", "slow-before-apply", "slow-transaction-committed"] {
            if exists(name) { try FileManager.default.removeItem(at: root.appendingPathComponent(name)) }
        }
    }
    func verifyCommittedContent(_ id: String) throws {
        let kind = id == "slow" ? "git" : "local"
        let content = try String(contentsOf: root.appendingPathComponent("state/source/\(kind)/\(id)/SKILL.md"), encoding: .utf8)
        XCTAssertTrue(content.contains("\(id) after"), "Updated checkout must contain the fixture's real new content")
        let deployed = try String(contentsOf: root.appendingPathComponent("targets/codex/\(id)/SKILL.md"), encoding: .utf8)
        XCTAssertTrue(deployed.contains("\(id) after"), "Owned target must expose committed content")
    }
    func capture(_ model: MainViewModel, name: String) throws {
        let state: [String: Any] = ["time": ISO8601DateFormatter().string(from: Date()), "cards": model.groupCards.map {
            ["id": $0.id, "loading": model.isUpdatingSource($0.id), "queued": model.isQueuedUpdateSource($0.id)] as [String: Any]
        }]
        try JSONSerialization.data(withJSONObject: state, options: [.prettyPrinted, .sortedKeys])
            .write(to: artifacts.appendingPathComponent("\(name).json"))
        let cards = model.groupCards
        let view = VStack(spacing: 12) {
            ForEach(0..<((cards.count + 1) / 2), id: \.self) { row in
                HStack(spacing: 12) {
                    ForEach(Array(cards.dropFirst(row * 2).prefix(2))) { card in
                SharedGroupCard(card: card, theme: .light, accent: .blue,
                    displayMode: .homeComfortable, clickPolicy: .home, skillsCollapsed: false,
                    isUpdating: model.isUpdatingSource(card.id) && !model.isQueuedUpdateSource(card.id),
                    isQueued: model.isQueuedUpdateSource(card.id), onOpen: nil,
                    onUpdate: {}, onTogglePinned: {}, onDelete: {}, onToggleSkill: { _, _ in },
                    onToggleAllSkills: {}, onToggleTarget: { _, _, _ in }, onToggleAllTargets: {})
                    .frame(width: 330)
                    }
                }
            }
        }.padding(20).frame(width: 712).background(Color.white)
        let hosting = NSHostingView(rootView: view)
        hosting.frame = NSRect(origin: .zero, size: hosting.fittingSize)
        hosting.layoutSubtreeIfNeeded()
        let bitmap = try XCTUnwrap(hosting.bitmapImageRepForCachingDisplay(in: hosting.bounds), "Screenshot must render")
        hosting.cacheDisplay(in: hosting.bounds, to: bitmap)
        let png = try XCTUnwrap(bitmap.representation(using: .png, properties: [:]), "Screenshot must encode")
        try png.write(to: artifacts.appendingPathComponent("\(name).png"))
        if exists("progress.jsonl") {
            try Data(contentsOf: root.appendingPathComponent("progress.jsonl"))
                .write(to: artifacts.appendingPathComponent("progress.jsonl"))
        }
    }
}

import Darwin
import Foundation

enum RuntimeDependency: String {
    case node
    case git
    case npx
}

enum BridgeClientError: Error, LocalizedError {
    case helperMissing
    case invalidResponse
    case commandFailed(String, response: BridgeResponse? = nil)
    case timeout(UInt64)
    case emptyResponse
    case concurrentMutationRejected
    case missingDependency(RuntimeDependency)

    private var locale: Locale {
        let rawValue = UserDefaults.standard.string(forKey: DesktopLanguage.storageKey) ?? DesktopLanguage.system.rawValue
        return DesktopLanguage(storageValue: rawValue).locale
    }

    var errorDescription: String? {
        switch self {
        case .helperMissing:
            return L10n.string("bridge.error.helper_missing", locale: locale)
        case .invalidResponse:
            return L10n.string("bridge.error.invalid_response", locale: locale)
        case .commandFailed(let message, _):
            return message
        case .timeout(let timeoutMs):
            return L10n.string("bridge.error.timeout", locale: locale, arguments: [String(timeoutMs)])
        case .emptyResponse:
            return L10n.string("bridge.error.empty_response", locale: locale)
        case .concurrentMutationRejected:
            return L10n.string("bridge.error.concurrent_mutation", locale: locale)
        case .missingDependency(let dependency):
            return L10n.string(
                "bridge.error.missing_dependency.\(dependency.rawValue)",
                locale: locale,
                arguments: [BridgeClient.desktopPrerequisitesURL.absoluteString]
            )
        }
    }
}

final class BridgeClient: @unchecked Sendable {
    static let desktopPrerequisitesURL = URL(string: "https://github.com/VintLin/skill-flow#desktop-prerequisites")!

    private enum ProcessExitOutcome {
        case exited
        case timedOut
    }

    private final class ProcessExitWaitState: @unchecked Sendable {
        private var continuation: CheckedContinuation<ProcessExitOutcome, Never>?
        private var outcome: ProcessExitOutcome?
        private let lock = NSLock()

        func setContinuation(_ continuation: CheckedContinuation<ProcessExitOutcome, Never>) {
            lock.lock()
            if let outcome {
                lock.unlock()
                continuation.resume(returning: outcome)
                return
            }

            self.continuation = continuation
            lock.unlock()
        }

        @discardableResult
        func resolve(_ outcome: ProcessExitOutcome) -> Bool {
            lock.lock()
            guard self.outcome == nil else {
                lock.unlock()
                return false
            }

            self.outcome = outcome
            let continuation = self.continuation
            self.continuation = nil
            lock.unlock()

            continuation?.resume(returning: outcome)
            return true
        }
    }

    private final class ThreadSafeBuffer: @unchecked Sendable {
        private var data = Data()
        private let lock = NSLock()

        func append(_ chunk: Data) {
            lock.lock()
            data.append(chunk)
            lock.unlock()
        }

        func snapshot() -> Data {
            lock.lock()
            defer { lock.unlock() }
            return data
        }
    }

    private final class ActiveHelperRegistry: @unchecked Sendable {
        private enum Mode {
            case normal
            case terminating
            case recoveryRequired
        }

        private struct Entry {
            let process: Process
            let command: BridgeCommand
        }

        private var entries: [ObjectIdentifier: Entry] = [:]
        private var mode: Mode = .normal
        private let lock = NSLock()

        func run(_ process: Process, command: BridgeCommand) throws {
            lock.lock()
            defer { lock.unlock() }
            if shouldCancelBeforeLaunchLocked(command) {
                throw BridgeClientError.commandFailed("Operation cancelled because Skill Flow is terminating.")
            }
            try process.run()
            entries[ObjectIdentifier(process)] = Entry(process: process, command: command)
        }

        func clear(ifMatching process: Process) {
            lock.lock()
            entries.removeValue(forKey: ObjectIdentifier(process))
            lock.unlock()
        }

        func requestTerminationCancellation() {
            lock.lock()
            mode = .terminating
            lock.unlock()
        }

        func clearTerminationCancellation() {
            lock.lock()
            mode = .normal
            lock.unlock()
        }

        func markRecoveryRequired() {
            lock.lock()
            mode = .recoveryRequired
            lock.unlock()
        }

        func shouldCancelBeforeLaunch(_ command: BridgeCommand) -> Bool {
            lock.lock()
            defer { lock.unlock() }
            return shouldCancelBeforeLaunchLocked(command)
        }

        private func shouldCancelBeforeLaunchLocked(_ command: BridgeCommand) -> Bool {
            switch mode {
            case .normal:
                return false
            case .terminating:
                return command.helperTerminationRole.isCancellableOnQuit
            case .recoveryRequired:
                return !command.helperTerminationRole.isAllowedDuringRecoveryRequired
            }
        }

        func hasCancellableHelpers() -> Bool {
            lock.lock()
            defer { lock.unlock() }
            return entries.values.contains { entry in
                entry.process.isRunning && entry.command.helperTerminationRole.isCancellableOnQuit
            }
        }

        func cancellableProcesses() -> [Process] {
            lock.lock()
            defer { lock.unlock() }
            return entries.values.compactMap { entry in
                guard entry.process.isRunning, entry.command.helperTerminationRole.isCancellableOnQuit else {
                    return nil
                }
                return entry.process
            }
        }
    }

    private let mutationCoordinator = MutationCoordinator()
    private let commandTimeoutMilliseconds: UInt64
    private let importCommandTimeoutMilliseconds: UInt64
    private let updateSourceTimeoutMilliseconds: UInt64
    private let updateCommandMaximumTimeoutMilliseconds: UInt64
    private let commandTimeoutGraceMilliseconds: UInt64
    private let quitCancellationGraceMilliseconds: UInt64
    private let activeHelper = ActiveHelperRegistry()

    init(
        commandTimeoutMilliseconds: UInt64 = 60_000,
        // Network-heavy import/add work often needs more than 3 minutes on unstable links.
        importCommandTimeoutMilliseconds: UInt64 = 300_000,
        // One source receives five minutes; selected updates scale to a 15-minute ceiling.
        updateSourceTimeoutMilliseconds: UInt64 = 300_000,
        updateCommandMaximumTimeoutMilliseconds: UInt64 = 900_000,
        commandTimeoutGraceMilliseconds: UInt64 = 1_000,
        quitCancellationGraceMilliseconds: UInt64 = 5_000
    ) {
        self.commandTimeoutMilliseconds = commandTimeoutMilliseconds
        self.importCommandTimeoutMilliseconds = importCommandTimeoutMilliseconds
        self.updateSourceTimeoutMilliseconds = updateSourceTimeoutMilliseconds
        self.updateCommandMaximumTimeoutMilliseconds = updateCommandMaximumTimeoutMilliseconds
        self.commandTimeoutGraceMilliseconds = commandTimeoutGraceMilliseconds
        self.quitCancellationGraceMilliseconds = quitCancellationGraceMilliseconds
    }

    func bootstrap() async throws -> BridgeResponse {
        _ = try await migrateStateToV2()
        return try await send(command: .bootstrap)
    }

    func list() async throws -> BridgeResponse {
        try await send(command: .list)
    }

    func inspectStateMigration() async throws -> BridgeResponse {
        try await send(command: .inspectStateMigration)
    }

    func migrateStateToV2() async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(
                command: .migrateState,
                payload: [
                    "to": AnyCodable(2),
                    "backup": AnyCodable(true),
                ]
            )
        }
    }

    func inspect(sourceId: String, scope: ProjectScopeSelection = .global) async throws -> BridgeResponse {
        try await send(
            command: .inspect,
            payload: [
                "sourceId": AnyCodable(sourceId),
                "scope": AnyCodable(scope.bridgePayload),
            ]
        )
    }

    func inspectEnrichment(sourceId: String) async throws -> BridgeResponse {
        try await send(command: .inspectEnrichment, payload: ["sourceId": AnyCodable(sourceId)])
    }

    func searchImportGroups(query: String?) async throws -> BridgeResponse {
        let payload: [String: AnyCodable]
        if let query {
            payload = ["query": AnyCodable(query)]
        } else {
            payload = [:]
        }
        return try await send(command: .searchImportGroups, payload: payload)
    }

    func scanLocalImportGroups(path: String?) async throws -> BridgeResponse {
        let payload: [String: AnyCodable]
        if let path {
            payload = ["path": AnyCodable(path)]
        } else {
            payload = [:]
        }
        return try await send(command: .scanLocalImportGroups, payload: payload)
    }

    func previewImportSource(locator: String) async throws -> BridgeResponse {
        try await send(command: .previewImportSource, payload: ["locator": AnyCodable(locator)])
    }

    func prepareImportSource(locator: String) async throws -> BridgeResponse {
        try await send(command: .prepareImportSource, payload: ["locator": AnyCodable(locator)])
    }

    func commitImportSource(
        preparationId: String,
        selectedSkills: [ImportSkillSelection],
        enabledTargets: [String],
        skillSelectionMode: ImportSkillSelectionMode = .selected
    ) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.sendCommitImportSourceDraft(
                preparationId: preparationId,
                selectedSkills: selectedSkills,
                enabledTargets: enabledTargets,
                skillSelectionMode: skillSelectionMode
            )
        }
    }

    func importSource(
        locator: String,
        selectedSkills: [ImportSkillSelection],
        enabledTargets: [String],
        skillSelectionMode: ImportSkillSelectionMode = .selected
    ) async throws -> BridgeResponse {
        let prepared = try await prepareImportSource(locator: locator)
        guard
            let payload = prepared.data?.value as? [String: Any],
            payload["status"] as? String == "ready",
            let preparationId = payload["preparationId"] as? String,
            !preparationId.isEmpty
        else {
            throw BridgeClientError.commandFailed("Import preparation did not produce a committable source.")
        }
        return try await commitImportSource(
            preparationId: preparationId,
            selectedSkills: selectedSkills,
            enabledTargets: enabledTargets,
            skillSelectionMode: skillSelectionMode
        )
    }

    private func sendCommitImportSourceDraft(
        preparationId: String,
        selectedSkills: [ImportSkillSelection],
        enabledTargets: [String],
        skillSelectionMode: ImportSkillSelectionMode
    ) async throws -> BridgeResponse {
        try await send(
            command: .commitImportSource,
            payload: [
                "preparationId": AnyCodable(preparationId),
                "draft": AnyCodable([
                    "skillSelectionMode": skillSelectionMode.rawValue,
                    "selectedSkills": selectedSkills.map(\.bridgePayload),
                    "enabledTargets": enabledTargets,
                ]),
            ]
        )
    }

    func createCollection(displayName: String, skills: [CollectionSkillRef], enabledTargets: [String]) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            let skillPayloads: [[String: Any]] = skills.map { skill in
                [
                    "sourceId": skill.sourceId,
                    "leafId": skill.leafId,
                ]
            }
            return try await self.send(
                command: .createCollection,
                payload: [
                    "displayName": AnyCodable(displayName),
                    "skills": AnyCodable(skillPayloads),
                    "enabledTargets": AnyCodable(enabledTargets),
                ]
            )
        }
    }

    func mergeGroups(displayName: String, sourceIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(
                command: .mergeGroups,
                payload: [
                    "displayName": AnyCodable(displayName),
                    "sourceIds": AnyCodable(sourceIds),
                    "enabledTargets": AnyCodable(enabledTargets),
                ]
            )
        }
    }

    func restoreCollectionSources(collectionId: String) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(
                command: .restoreCollectionSources,
                payload: ["collectionId": AnyCodable(collectionId)]
            )
        }
    }

    func renameSource(sourceId: String, displayName: String) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(
                command: .renameSource,
                payload: [
                    "sourceId": AnyCodable(sourceId),
                    "displayName": AnyCodable(displayName),
                ]
            )
        }
    }

    func saveSettings(customTargets: [[String: String]], agentDisplayOrder: [String]) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(
                command: .saveSettings,
                payload: [
                    "customTargets": AnyCodable(customTargets),
                    "agentDisplayOrder": AnyCodable(agentDisplayOrder),
                ]
            )
        }
    }

    func togglePinnedSource(sourceId: String) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(command: .togglePin, payload: ["sourceId": AnyCodable(sourceId)])
        }
    }

    func doctor() async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(command: .doctor)
        }
    }

    func updateAll() async throws -> BridgeResponse {
        try await updateSources(nil)
    }

    func updateSources(_ sourceIds: [String]?) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            let payload: [String: AnyCodable]
            if let sourceIds {
                payload = ["sourceIds": AnyCodable(sourceIds)]
            } else {
                payload = ["sourceIds": AnyCodable([String]())]
            }
            return try await self.send(command: .update, payload: payload)
        }
    }

    func uninstall(sourceIds: [String]) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(command: .uninstall, payload: ["sourceIds": AnyCodable(sourceIds)])
        }
    }

    func apply(sourceId: String, scope: ProjectScopeSelection = .global, selectedLeafIds: [String], enabledTargets: [String]) async throws -> BridgeResponse {
        try await mutationCoordinator.runMutation {
            try await self.send(
                command: .apply,
                payload: [
                    "sourceId": AnyCodable(sourceId),
                    "scope": AnyCodable(scope.bridgePayload),
                    "draft": AnyCodable([
                        "selectedLeafIds": selectedLeafIds,
                        "enabledTargets": enabledTargets,
                    ]),
                ]
            )
        }
    }

    private func send(command: BridgeCommand, payload: [String: AnyCodable]? = nil) async throws -> BridgeResponse {
        if activeHelper.shouldCancelBeforeLaunch(command) {
            throw BridgeClientError.commandFailed("Protected operation cancelled because Skill Flow is terminating.")
        }
        let helperURL = try resolveHelperURL()
        let request = BridgeRequest(command: command, payload: payload)
        let requestData = try JSONEncoder().encode(request)
        let nodeExecutable = Self.resolveNodeExecutable()
        let bundledNodeBinDirectory = Self.resolveBundledNodeBinDirectory()
        try validateEnvironment(
            command: command,
            payload: payload,
            nodeExecutable: nodeExecutable,
            bundledNodeBinDirectory: bundledNodeBinDirectory
        )

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        let helperArguments = nodeExecutable == "node"
            ? ["/usr/bin/env", "node", helperURL.path, "bridge", "--json"]
            : [nodeExecutable, helperURL.path, "bridge", "--json"]
        process.arguments = ["-c", Self.processGroupLauncherScript, "skill-flow-helper"] + helperArguments
        process.environment = Self.bridgeEnvironment(bundledNodeBinDirectory: bundledNodeBinDirectory)

        let inputPipe = Pipe()
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardInput = inputPipe
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        let outputBuffer = ThreadSafeBuffer()
        let errorBuffer = ThreadSafeBuffer()
        let exitWaitState = ProcessExitWaitState()
        process.terminationHandler = { _ in
            exitWaitState.resolve(.exited)
        }

        outputPipe.fileHandleForReading.readabilityHandler = { handle in
            let chunk = handle.availableData
            guard !chunk.isEmpty else { return }
            outputBuffer.append(chunk)
        }
        errorPipe.fileHandleForReading.readabilityHandler = { handle in
            let chunk = handle.availableData
            guard !chunk.isEmpty else { return }
            errorBuffer.append(chunk)
        }

        try activeHelper.run(process, command: command)
        defer { activeHelper.clear(ifMatching: process) }
        inputPipe.fileHandleForWriting.write(requestData)
        inputPipe.fileHandleForWriting.closeFile()

        let activeTimeoutMilliseconds = timeoutMilliseconds(for: command, payload: payload)
        let didExit = await waitForProcessExit(
            process,
            state: exitWaitState,
            timeoutMilliseconds: activeTimeoutMilliseconds
        )

        if !didExit {
            outputPipe.fileHandleForReading.readabilityHandler = nil
            errorPipe.fileHandleForReading.readabilityHandler = nil
            process.terminationHandler = nil
            if process.isRunning {
                await terminateTimedOutProcess(process)
            }
            throw BridgeClientError.timeout(activeTimeoutMilliseconds)
        }

        outputPipe.fileHandleForReading.readabilityHandler = nil
        errorPipe.fileHandleForReading.readabilityHandler = nil

        // Drain any remaining buffered bytes after process exit.
        let outputTail = outputPipe.fileHandleForReading.readDataToEndOfFile()
        if !outputTail.isEmpty {
            outputBuffer.append(outputTail)
        }
        let errorTail = errorPipe.fileHandleForReading.readDataToEndOfFile()
        if !errorTail.isEmpty {
            errorBuffer.append(errorTail)
        }

        let outputData = outputBuffer.snapshot()
        let errorData = errorBuffer.snapshot()

        guard !outputData.isEmpty else {
            if !errorData.isEmpty {
                let stderrMessage = String(decoding: errorData, as: UTF8.self)
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                if !stderrMessage.isEmpty {
                    if let dependencyError = Self.dependencyError(for: stderrMessage) {
                        throw dependencyError
                    }
                    throw BridgeClientError.commandFailed(stderrMessage)
                }
            }
            throw BridgeClientError.emptyResponse
        }

        let response = try JSONDecoder().decode(BridgeResponse.self, from: outputData)
        if response.ok {
            return response
        }

        let message: String
        if !response.errors.isEmpty {
            message = response.errors.map(\.message).joined(separator: "\n")
        } else if !errorData.isEmpty {
            message = String(decoding: errorData, as: UTF8.self)
        } else {
            let rawValue = UserDefaults.standard.string(forKey: DesktopLanguage.storageKey) ?? DesktopLanguage.system.rawValue
            let locale = DesktopLanguage(storageValue: rawValue).locale
            message = L10n.string("bridge.error.command_failed_default", locale: locale)
        }
        if let dependencyError = Self.dependencyError(for: message) {
            throw dependencyError
        }
        throw BridgeClientError.commandFailed(message, response: response)
    }

    private func timeoutMilliseconds(
        for command: BridgeCommand,
        payload: [String: AnyCodable]?
    ) -> UInt64 {
        if command == .update {
            guard
                let sourceIds = payload?["sourceIds"]?.value as? [String],
                !sourceIds.isEmpty
            else {
                return updateCommandMaximumTimeoutMilliseconds
            }
            let sourceCount = UInt64(Set(sourceIds).count)
            let (scaledTimeout, overflow) = updateSourceTimeoutMilliseconds
                .multipliedReportingOverflow(by: sourceCount)
            return min(
                overflow ? updateCommandMaximumTimeoutMilliseconds : scaledTimeout,
                updateCommandMaximumTimeoutMilliseconds
            )
        }
        return command.usesExtendedNetworkTimeout
            ? importCommandTimeoutMilliseconds
            : commandTimeoutMilliseconds
    }

    private func waitForProcessExit(
        _ process: Process,
        state: ProcessExitWaitState,
        timeoutMilliseconds: UInt64
    ) async -> Bool {
        let timeoutTask = Task {
            try? await Task.sleep(nanoseconds: Self.nanoseconds(fromMilliseconds: timeoutMilliseconds))
            state.resolve(.timedOut)
        }

        let outcome = await withCheckedContinuation { continuation in
            state.setContinuation(continuation)
        }
        timeoutTask.cancel()
        process.terminationHandler = nil

        return outcome == .exited
    }

    private func terminateTimedOutProcess(_ process: Process) async {
        guard process.isRunning else { return }
        process.terminate()
        if await waitUntilStopped(process, timeoutMilliseconds: commandTimeoutGraceMilliseconds) { return }
        guard process.isRunning else { return }
        kill(process.processIdentifier, SIGUSR2)
        _ = await waitUntilStopped(process, timeoutMilliseconds: commandTimeoutGraceMilliseconds)
    }

    /// Cancels the helper serving the currently running protected desktop
    /// operation. The shell wrapper owns a dedicated helper process group: TERM
    /// is forwarded cooperatively, then USR1 makes the wrapper SIGKILL that
    /// entire group after the quit grace period.
    func cancelActiveHelperForTermination() async -> Bool {
        activeHelper.requestTerminationCancellation()
        return await terminateProcessGroups(
            activeHelper.cancellableProcesses(),
            graceMilliseconds: quitCancellationGraceMilliseconds
        )
    }

    var hasActiveCancellableHelper: Bool {
        activeHelper.hasCancellableHelpers()
    }

    func enterRecoveryRequiredState() {
        activeHelper.markRecoveryRequired()
    }

    func resumeProtectedOperationsAfterRecovery() {
        activeHelper.clearTerminationCancellation()
    }

    private func terminateManagedHelper(_ process: Process, graceMilliseconds: UInt64) async -> Bool {
        await terminateProcessGroups([process], graceMilliseconds: graceMilliseconds)
    }

    private func terminateProcessGroups(_ processes: [Process], graceMilliseconds: UInt64) async -> Bool {
        let running = processes.filter(\.isRunning)
        guard !running.isEmpty else { return true }
        for process in running {
            kill(process.processIdentifier, SIGINT)
        }
        if await waitUntilAllStopped(running, timeoutMilliseconds: graceMilliseconds) { return true }
        for process in running where process.isRunning {
            kill(process.processIdentifier, SIGUSR1)
        }
        return await waitUntilAllStopped(running, timeoutMilliseconds: commandTimeoutGraceMilliseconds)
    }

    private func waitUntilStopped(_ process: Process, timeoutMilliseconds: UInt64) async -> Bool {
        await waitUntilAllStopped([process], timeoutMilliseconds: timeoutMilliseconds)
    }

    private func waitUntilAllStopped(_ processes: [Process], timeoutMilliseconds: UInt64) async -> Bool {
        let deadline = Date().addingTimeInterval(TimeInterval(timeoutMilliseconds) / 1_000)
        while processes.contains(where: \.isRunning), Date() < deadline {
            try? await Task.sleep(nanoseconds: min(Self.nanoseconds(fromMilliseconds: 10), Self.nanoseconds(fromMilliseconds: timeoutMilliseconds)))
        }
        return !processes.contains(where: \.isRunning)
    }

    private static let processGroupLauncherScript = #"""
    set -m
    "$@" <&0 &
    child=$!
    trap 'kill -TERM "$child" 2>/dev/null; wait "$child"' TERM
    wait_for_group() {
      while kill -0 -$child 2>/dev/null; do
        sleep 0.05
      done
    }
    trap 'kill -TERM -$child 2>/dev/null; wait "$child"; wait_for_group' INT
    trap 'kill -KILL "$child" 2>/dev/null; exit 137' USR2
    trap 'kill -KILL -$child 2>/dev/null; exit 137' USR1
    wait "$child"
    status=$?
    trap - TERM USR1
    exit "$status"
    """#

    private static func nanoseconds(fromMilliseconds milliseconds: UInt64) -> UInt64 {
        let (nanoseconds, overflow) = milliseconds.multipliedReportingOverflow(by: 1_000_000)
        return overflow ? UInt64.max : nanoseconds
    }

    private func resolveHelperURL() throws -> URL {
        #if DEBUG
        if let override = ProcessInfo.processInfo.environment["SKILL_FLOW_DESKTOP_HELPER_OVERRIDE"], !override.isEmpty {
            return URL(fileURLWithPath: override)
        }
        #endif

        if let bundledHelperURL = existingURL(at: Bundle.main.bundleURL
            .appendingPathComponent("Contents/Resources/helper/dist/desktop-bridge.js")) {
            return bundledHelperURL
        }

        if let resourcePath = Bundle.main.path(forResource: "desktop-bridge", ofType: "js", inDirectory: "helper/dist"),
           let bundledHelperURL = existingURL(at: URL(fileURLWithPath: resourcePath)) {
            return bundledHelperURL
        }

        if let bundledHelperURL = existingURL(at: Bundle.main.bundleURL
            .appendingPathComponent("Contents/Resources/helper/dist/cli.js")) {
            return bundledHelperURL
        }

        if let resourcePath = Bundle.main.path(forResource: "cli", ofType: "js", inDirectory: "helper/dist"),
           let bundledHelperURL = existingURL(at: URL(fileURLWithPath: resourcePath)) {
            return bundledHelperURL
        }

        let fallbackCandidates = [
            Bundle.main.bundleURL
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appending(path: "apps/cli/dist/cli.js"),
            URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
                .appending(path: "apps/cli/dist/cli.js"),
        ]

        for candidate in fallbackCandidates {
            if let existing = existingURL(at: candidate) {
                return existing
            }
        }

        throw BridgeClientError.helperMissing
    }

    private func existingURL(at url: URL) -> URL? {
        FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    static func resolveNodeExecutable(
        bundleURL: URL = Bundle.main.bundleURL,
        architecture: String = BridgeClient.currentNodeArchitecture,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }
    ) -> String {
        #if DEBUG
        if let override = environment["SKILL_FLOW_DESKTOP_NODE_OVERRIDE"],
           !override.isEmpty {
            return override
        }
        #endif

        let bundledNodePath = bundleURL
            .appendingPathComponent("Contents/Resources/node/\(architecture)/bin/node")
            .path
        if isExecutable(bundledNodePath) {
            return bundledNodePath
        }

        let commonNodePaths = [
            "/opt/homebrew/bin/node",
            "/usr/local/bin/node",
            "/usr/bin/node",
        ]

        for path in commonNodePaths where isExecutable(path) {
            return path
        }

        return "node"
    }

    static func resolveBundledNodeBinDirectory(
        bundleURL: URL = Bundle.main.bundleURL,
        architecture: String = BridgeClient.currentNodeArchitecture,
        environment: [String: String] = ProcessInfo.processInfo.environment,
        isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }
    ) -> String? {
        #if DEBUG
        if let override = environment["SKILL_FLOW_DESKTOP_NODE_OVERRIDE"],
           !override.isEmpty {
            return nil
        }
        #endif

        let bundledNodeBinDirectory = bundleURL
            .appendingPathComponent("Contents/Resources/node/\(architecture)/bin")
            .path
        let bundledNodePath = "\(bundledNodeBinDirectory)/node"

        guard isExecutable(bundledNodePath) else {
            return nil
        }

        return bundledNodeBinDirectory
    }

    static func bridgeEnvironment(
        baseEnvironment: [String: String] = ProcessInfo.processInfo.environment,
        bundledNodeBinDirectory: String? = BridgeClient.resolveBundledNodeBinDirectory(),
        isExecutable: (String) -> Bool = { FileManager.default.isExecutableFile(atPath: $0) }
    ) -> [String: String] {
        var environment = baseEnvironment
        environment.removeValue(forKey: "SKILL_FLOW_BUNDLED_NPX")
        environment["SKILL_FLOW_CALLER"] = "desktop-bridge"

        guard let bundledNodeBinDirectory else {
            return environment
        }

        if let path = environment["PATH"], !path.isEmpty {
            environment["PATH"] = "\(bundledNodeBinDirectory):\(path)"
        } else {
            environment["PATH"] = bundledNodeBinDirectory
        }

        let bundledNpx = "\(bundledNodeBinDirectory)/npx"
        if isExecutable(bundledNpx) {
            environment["SKILL_FLOW_BUNDLED_NPX"] = bundledNpx
        }

        return environment
    }

    private static var currentNodeArchitecture: String {
        #if arch(arm64)
        "arm64"
        #elseif arch(x86_64)
        "x86_64"
        #else
        "unknown"
        #endif
    }

    private func validateEnvironment(
        command: BridgeCommand,
        payload: [String: AnyCodable]?,
        nodeExecutable: String,
        bundledNodeBinDirectory: String?
    ) throws {
        guard isNodeAvailable(nodeExecutable) else {
            throw BridgeClientError.missingDependency(.node)
        }

        guard let locator = locator(from: payload) else {
            return
        }

        if locator.hasPrefix("clawhub:"), bundledNpxPath(in: bundledNodeBinDirectory) == nil, !isCommandAvailable("npx") {
            throw BridgeClientError.missingDependency(.npx)
        }

        if requiresGit(locator: locator), !isCommandAvailable("git") {
            throw BridgeClientError.missingDependency(.git)
        }
    }

    private func locator(from payload: [String: AnyCodable]?) -> String? {
        payload?["locator"]?.value as? String
    }

    private func requiresGit(locator: String) -> Bool {
        let trimmed = locator.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed.hasPrefix("clawhub:") {
            return false
        }

        let lowercased = trimmed.lowercased()
        if lowercased.contains("github.com") || isGitHubShorthand(trimmed) {
            return false
        }

        return
            lowercased.hasPrefix("git@") ||
            lowercased.hasPrefix("http://") ||
            lowercased.hasPrefix("https://")
    }

    private func isGitHubShorthand(_ locator: String) -> Bool {
        let parts = locator.split(separator: "/")
        return parts.count == 2 && !locator.contains("://") && !locator.contains(":")
    }

    private func isNodeAvailable(_ nodeExecutable: String) -> Bool {
        if nodeExecutable == "node" {
            return isCommandAvailable("node")
        }
        return FileManager.default.isExecutableFile(atPath: nodeExecutable)
    }

    private func bundledNpxPath(in bundledNodeBinDirectory: String?) -> String? {
        guard let bundledNodeBinDirectory else {
            return nil
        }

        let bundledNpx = "\(bundledNodeBinDirectory)/npx"
        guard FileManager.default.isExecutableFile(atPath: bundledNpx) else {
            return nil
        }

        return bundledNpx
    }

    private func isCommandAvailable(_ command: String) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = [command, "--version"]
        process.standardOutput = Pipe()
        process.standardError = Pipe()

        do {
            try process.run()
            process.waitUntilExit()
            return process.terminationStatus == 0
        } catch {
            return false
        }
    }

    static func dependencyError(for message: String) -> BridgeClientError? {
        let lowercased = message.lowercased()

        if lowercased.contains("spawn npx enoent") || lowercased.contains("npx: command not found") {
            return .missingDependency(.npx)
        }

        if lowercased.contains("spawn git enoent") || lowercased.contains("git: command not found") {
            return .missingDependency(.git)
        }

        if lowercased.contains("spawn node enoent") || lowercased.contains("node: command not found") {
            return .missingDependency(.node)
        }

        return nil
    }
}
